import { db } from '@/lib/supabase/db'
import { supabase } from '@/lib/supabase/client'
import type {
  MonthlyRun,
  Billing,
  Customer,
  TaxDeduction,
  CommissionProfile,
  AppUser,
  Commission,
} from '@/types/database'
import { evaluateTaxFormula } from '@/lib/formulaEvaluator'

// ==========================================
// Monthly Runs & Processing
// ==========================================

export async function getMonthlyRuns(): Promise<MonthlyRun[]> {
  const { data, error } = await db
    .from('monthly_runs')
    .select('*')
    .order('month_year', { ascending: false })

  if (error) throw error
  return (data as unknown as MonthlyRun[]) || []
}

export async function getMonthlyRunById(id: string): Promise<MonthlyRun | null> {
  const { data, error } = await db.from('monthly_runs').select('*').eq('id', id).single()

  if (error) return null
  return data as unknown as MonthlyRun
}

export async function getMonthlyRunByMonth(monthYearStr: string): Promise<MonthlyRun | null> {
  // Format should be YYYY-MM-01
  const normalized = monthYearStr.length === 7 ? `${monthYearStr}-01` : monthYearStr
  const { data, error } = await db
    .from('monthly_runs')
    .select('*')
    .eq('month_year', normalized)
    .maybeSingle()

  if (error) return null
  return data as unknown as MonthlyRun
}

export async function createMonthlyRun(
  monthYear: string,
  grossCompanyBilling: number,
): Promise<MonthlyRun> {
  const normalized = monthYear.length === 7 ? `${monthYear}-01` : monthYear
  const { data, error } = await db
    .from('monthly_runs')
    .insert([
      {
        month_year: normalized,
        gross_company_billing: grossCompanyBilling,
        status: 'pending',
      },
    ])
    .select()
    .single()

  if (error) throw error
  return data as unknown as MonthlyRun
}

export async function markMonthlyRunAsPaid(monthlyRunId: string): Promise<MonthlyRun> {
  const { data, error } = await db
    .from('monthly_runs')
    .update({ status: 'paid' })
    .eq('id', monthlyRunId)
    .select()
    .single()

  if (error) throw error
  return data as unknown as MonthlyRun
}

export async function unlockMonthlyRun(
  monthlyRunId: string,
  targetStatus: 'processed' | 'pending' = 'processed',
): Promise<MonthlyRun> {
  const { data, error } = await db
    .from('monthly_runs')
    .update({ status: targetStatus })
    .eq('id', monthlyRunId)
    .select()
    .single()

  if (error) throw error
  return data as unknown as MonthlyRun
}

// ==========================================
// Customers & Linking
// ==========================================

export async function getCustomers(searchQuery?: string): Promise<Customer[]> {
  let query = db.from('customers').select('*, customer_users(*, user:users(*))').order('name')

  if (searchQuery && searchQuery.trim().length > 0) {
    const term = searchQuery.trim()
    // Filter by name or customer_code (case-insensitive)
    query = query.or(`name.ilike.%${term}%,customer_code.ilike.%${term}%`)
  }

  const { data, error } = await query

  if (error) throw error
  return (data as unknown as Customer[]) || []
}

export async function getCustomerById(id: string): Promise<Customer | null> {
  const { data, error } = await db
    .from('customers')
    .select('*, customer_users(*, user:users(*))')
    .eq('id', id)
    .single()

  if (error) return null
  return data as unknown as Customer
}

export async function updateCustomer(
  id: string,
  updates: {
    name?: string
    origin?: 'inbound' | 'outbound' | null
    start_date?: string | null
    no_commission_flag?: boolean
  },
): Promise<Customer> {
  const { data, error } = await db
    .from('customers')
    .update(updates)
    .eq('id', id)
    .select('*, customer_users(*, user:users(*))')
    .single()

  if (error) throw error
  return data as unknown as Customer
}

export async function listEligibleCommissionUsers(): Promise<AppUser[]> {
  const { data, error } = await db
    .from('users')
    .select('*')
    .in('role', ['manager', 'sales'])
    .order('name')

  if (error) throw error
  return (data as unknown as AppUser[]) || []
}

export async function addUserToCustomer(customerId: string, userId: string): Promise<void> {
  // Check if link already exists
  const { data: existing } = await db
    .from('customer_users')
    .select('id')
    .eq('customer_id', customerId)
    .eq('user_id', userId)
    .maybeSingle()

  if (existing) {
    return // Already linked, avoid duplicates
  }

  const { error } = await db.from('customer_users').insert([
    {
      customer_id: customerId,
      user_id: userId,
    },
  ])

  if (error) throw error
}

export async function removeUserFromCustomer(customerUserId: string): Promise<void> {
  const { error } = await db.from('customer_users').delete().eq('id', customerUserId)
  if (error) throw error
}

export async function upsertCustomerByCode(customerCode: string, name: string): Promise<Customer> {
  // Try to find existing
  const { data: existing } = await db
    .from('customers')
    .select('*')
    .eq('customer_code', customerCode)
    .maybeSingle()

  if (existing) {
    if ((existing as any).name !== name) {
      const { data: updated, error: updateError } = await db
        .from('customers')
        .update({ name })
        .eq('id', (existing as any).id)
        .select()
        .single()
      if (updateError) throw updateError
      return updated as unknown as Customer
    }
    return existing as unknown as Customer
  }

  // Insert new
  const { data: created, error: createError } = await db
    .from('customers')
    .insert([
      {
        customer_code: customerCode,
        name,
        origin: 'inbound',
        start_date: new Date().toISOString().split('T')[0],
        no_commission_flag: false,
      },
    ])
    .select()
    .single()

  if (createError) throw createError
  return created as unknown as Customer
}

export async function updateCustomerDetails(
  customerId: string,
  origin: 'inbound' | 'outbound',
  startDate: string,
  userIds: string[],
): Promise<void> {
  // 1. Update customer origin & start_date
  const { error: custError } = await db
    .from('customers')
    .update({ origin, start_date: startDate })
    .eq('id', customerId)

  if (custError) throw custError

  // 2. Remove existing links and re-add selected userIds
  await db.from('customer_users').delete().eq('customer_id', customerId)

  if (userIds.length > 0) {
    const rows = userIds.map((uid) => ({
      customer_id: customerId,
      user_id: uid,
    }))
    const { error: linkError } = await db.from('customer_users').insert(rows)
    if (linkError) throw linkError
  }
}

export interface BulkUpdateCustomersParams {
  customerIds: string[]
  origin?: 'inbound' | 'outbound' | null
  noCommissionFlag?: boolean
  userIds?: string[]
  replaceUsers?: boolean // true: delete existing links and insert userIds; false: append new userIds (avoid duplicates)
}

export async function bulkUpdateCustomers(params: BulkUpdateCustomersParams): Promise<void> {
  const { customerIds, origin, noCommissionFlag, userIds, replaceUsers = false } = params

  if (!customerIds || customerIds.length === 0) {
    return
  }

  // 1. Atualizar campos da tabela customers (se houver campos a atualizar)
  const customerUpdates: {
    origin?: 'inbound' | 'outbound'
    no_commission_flag?: boolean
  } = {}

  if (origin !== undefined && origin !== null) {
    customerUpdates.origin = origin
  }
  if (noCommissionFlag !== undefined) {
    customerUpdates.no_commission_flag = noCommissionFlag
  }

  if (Object.keys(customerUpdates).length > 0) {
    const { error: updateError } = await db
      .from('customers')
      .update(customerUpdates)
      .in('id', customerIds)

    if (updateError) throw updateError
  }

  // 2. Tratar vínculos de vendedores/gerentes em customer_users (se userIds foi especificado)
  if (userIds !== undefined) {
    if (replaceUsers) {
      // Modo substituição: deletar vínculos antigos dos clientes selecionados
      const { error: delError } = await db
        .from('customer_users')
        .delete()
        .in('customer_id', customerIds)

      if (delError) throw delError

      // Inserir apenas os novos selecionados
      if (userIds.length > 0) {
        const rowsToInsert: Array<{ customer_id: string; user_id: string }> = []
        for (const custId of customerIds) {
          for (const uid of userIds) {
            rowsToInsert.push({ customer_id: custId, user_id: uid })
          }
        }

        if (rowsToInsert.length > 0) {
          const { error: insError } = await db.from('customer_users').insert(rowsToInsert)
          if (insError) throw insError
        }
      }
    } else {
      // Modo adição: apenas adicionar vínculos que ainda não existam para evitar violar customer_users_unique
      if (userIds.length > 0) {
        // Buscar vínculos existentes dos clientes selecionados
        const { data: existingLinks, error: fetchErr } = await db
          .from('customer_users')
          .select('customer_id, user_id')
          .in('customer_id', customerIds)

        if (fetchErr) throw fetchErr

        const existingSet = new Set(
          (existingLinks || []).map((link: any) => `${link.customer_id}_${link.user_id}`),
        )

        const rowsToInsert: Array<{ customer_id: string; user_id: string }> = []
        for (const custId of customerIds) {
          for (const uid of userIds) {
            const key = `${custId}_${uid}`
            if (!existingSet.has(key)) {
              rowsToInsert.push({ customer_id: custId, user_id: uid })
              existingSet.add(key) // Evita duplicar na própria lista
            }
          }
        }

        if (rowsToInsert.length > 0) {
          const { error: insError } = await db.from('customer_users').insert(rowsToInsert)
          if (insError) throw insError
        }
      }
    }
  }
}

export async function setCustomerNoCommission(
  customerId: string,
  noCommission: boolean,
): Promise<void> {
  const { error } = await db
    .from('customers')
    .update({ no_commission_flag: noCommission })
    .eq('id', customerId)

  if (error) throw error
}

// ==========================================
// Billings & Pendencies
// ==========================================

export async function createBillingsBatch(
  billingsData: Array<{
    monthly_run_id: string
    customer_id: string
    gross_amount: number
  }>,
): Promise<void> {
  const { error } = await db.from('billings').insert(billingsData)
  if (error) throw error
}

export async function getBillingsForRun(monthlyRunId: string): Promise<Billing[]> {
  const { data, error } = await db
    .from('billings')
    .select('*, customer:customers(*, customer_users(*, user:users(*)))')
    .eq('monthly_run_id', monthlyRunId)

  if (error) throw error
  return (data as unknown as Billing[]) || []
}

// Gatekeeper verification: returns unlinked billings where customer has no users and no_commission_flag=false
export async function getPendingBillings(monthlyRunId: string): Promise<Billing[]> {
  const billings = await getBillingsForRun(monthlyRunId)
  return billings.filter((b) => {
    const cust = b.customer
    if (!cust) return true
    if (cust.no_commission_flag) return false
    const links = cust.customer_users || []
    return links.length === 0
  })
}

// ==========================================
// Execution Engine (Client-side Fallback & Edge Function)
// ==========================================

export async function processMonthlyRun(monthlyRunId: string): Promise<{
  success: boolean
  message: string
  billingsProcessed?: number
  commissionsGenerated?: number
}> {
  // First attempt: invoke Supabase Edge Function
  try {
    const { data, error } = await supabase.functions.invoke('calculate-commissions', {
      body: { monthly_run_id: monthlyRunId },
    })

    if (!error && data?.success) {
      return data
    }
    console.warn(
      'Edge function returned error or was unavailable, using client-side calculation engine:',
      error,
    )
  } catch (fnErr) {
    console.warn('Failed calling edge function, executing client-side engine fallback:', fnErr)
  }

  // Robust Client-side Engine implementation
  return await processMonthlyRunClientSide(monthlyRunId)
}

function getMonthsDiff(startDateStr: string | null | undefined, runMonthStr: string): number {
  if (!startDateStr) return 0
  const start = new Date(startDateStr)
  const run = new Date(runMonthStr)
  if (isNaN(start.getTime()) || isNaN(run.getTime())) return 0
  return Math.max(
    0,
    (run.getFullYear() - start.getFullYear()) * 12 + (run.getMonth() - start.getMonth()),
  )
}

async function processMonthlyRunClientSide(monthlyRunId: string) {
  // 1. Fetch run
  const run = await getMonthlyRunById(monthlyRunId)
  if (!run) throw new Error('Execução não encontrada')

  if (run.status === 'paid') {
    throw new Error(
      'Este mês já está fechado e marcado como pago. O recálculo está bloqueado por compliance.',
    )
  }

  const globalBilling = Number(run.gross_company_billing) || 0

  // 2. Fetch billings
  const billings = await getBillingsForRun(monthlyRunId)

  // 3. Fetch active taxes
  const { data: taxes } = await db.from('tax_deductions').select('*').eq('is_active', true)

  const activeTaxes = (taxes as unknown as TaxDeduction[]) || []

  // 4. Fetch profiles & customer_users
  const { data: profilesData } = await db.from('commission_profiles').select('*')
  const profiles = (profilesData as unknown as CommissionProfile[]) || []

  const { data: cuData } = await db.from('customer_users').select('*')
  const customerUsers = (cuData as any[]) || []

  // Clear prior commissions
  const bIds = billings.map((b) => b.id)
  if (bIds.length > 0) {
    await db.from('commissions').delete().in('billing_id', bIds)
  }

  const commissionInserts: Array<{
    billing_id: string
    user_id: string
    percentage_applied: number
    commission_amount: number
  }> = []

  for (const billing of billings) {
    const gross = Number(billing.gross_amount) || 0
    let totalDeducted = 0
    const snapshots: Array<{
      name: string
      type: 'percentage' | 'formula'
      value?: number | null
      expression?: string | null
      deducted: number
    }> = []

    for (const tax of activeTaxes) {
      let deducted = 0
      if (tax.type === 'percentage') {
        const pct = Number(tax.value) || 0
        deducted = gross * (pct / 100)
        snapshots.push({
          name: tax.name,
          type: 'percentage',
          value: pct,
          deducted: Math.round(deducted * 100) / 100,
        })
      } else if (tax.type === 'formula') {
        const evalRes = evaluateTaxFormula(tax.formula_expression || '0', {
          CLIENT_BILLING: gross,
          GLOBAL_BILLING: globalBilling,
        })
        if (!evalRes.error) {
          deducted = evalRes.result
        }
        snapshots.push({
          name: tax.name,
          type: 'formula',
          expression: tax.formula_expression,
          deducted: Math.round(deducted * 100) / 100,
        })
      }
      totalDeducted += deducted
    }

    const netAmount = Math.max(0, Math.round((gross - totalDeducted) * 100) / 100)

    // Update billing
    await db
      .from('billings')
      .update({
        net_amount: netAmount,
        tax_deductions_applied_json: snapshots,
      })
      .eq('id', billing.id)

    const cust = billing.customer
    if (cust?.no_commission_flag) {
      continue
    }

    const linked = customerUsers.filter((cu) => cu.customer_id === billing.customer_id)
    const origin = cust?.origin || 'outbound'
    const months = getMonthsDiff(cust?.start_date, run.month_year)

    for (const link of linked) {
      const prof = profiles.find((p) => p.user_id === link.user_id && p.type === origin)
      let pct = 0
      if (prof) {
        if (origin === 'inbound') {
          pct = Number(prof.default_percentage_year_1) || 0
        } else {
          pct =
            months <= 12
              ? Number(prof.default_percentage_year_1) || 0
              : Number(prof.default_percentage_year_2_plus) || 0
        }
      }

      const commissionVal = Math.round(((netAmount * pct) / 100) * 100) / 100

      commissionInserts.push({
        billing_id: billing.id,
        user_id: link.user_id,
        percentage_applied: pct,
        commission_amount: commissionVal,
      })
    }
  }

  if (commissionInserts.length > 0) {
    const { error: commError } = await db.from('commissions').insert(commissionInserts)
    if (commError) throw commError
  }

  // Update run status
  const { error: runErr } = await db
    .from('monthly_runs')
    .update({ status: 'processed' })
    .eq('id', monthlyRunId)

  if (runErr) throw runErr

  return {
    success: true,
    message: 'Mês processado com sucesso!',
    billingsProcessed: billings.length,
    commissionsGenerated: commissionInserts.length,
  }
}

// ==========================================
// Reports & Commissions Queries
// ==========================================

export async function getCommissionsForRun(monthlyRunId: string): Promise<Commission[]> {
  const { data, error } = await db
    .from('commissions')
    .select('*, user:users(*), billing:billings(*, customer:customers(*))')
    .order('commission_amount', { ascending: false })

  if (error) throw error

  // Filter commissions by billing.monthly_run_id
  const filtered = ((data as unknown as Commission[]) || []).filter(
    (c) => c.billing?.monthly_run_id === monthlyRunId,
  )
  return filtered
}

export async function getBillingsForRuns(monthlyRunIds: string[]): Promise<Billing[]> {
  if (!monthlyRunIds || monthlyRunIds.length === 0) return []
  const { data, error } = await db
    .from('billings')
    .select('*, customer:customers(*, customer_users(*, user:users(*)))')
    .in('monthly_run_id', monthlyRunIds)

  if (error) throw error
  return (data as unknown as Billing[]) || []
}

export async function getCommissionsForRuns(monthlyRunIds: string[]): Promise<Commission[]> {
  if (!monthlyRunIds || monthlyRunIds.length === 0) return []
  const { data, error } = await db
    .from('commissions')
    .select('*, user:users(*), billing:billings(*, customer:customers(*))')
    .order('commission_amount', { ascending: false })

  if (error) throw error

  const runIdSet = new Set(monthlyRunIds)
  const filtered = ((data as unknown as Commission[]) || []).filter(
    (c) => c.billing?.monthly_run_id && runIdSet.has(c.billing.monthly_run_id),
  )
  return filtered
}

// ==========================================
// Settings: Users, Profiles, Taxes
// ==========================================

export async function getAllUsers(): Promise<AppUser[]> {
  const { data, error } = await db.from('users').select('*').order('name')

  if (error) throw error
  return (data as unknown as AppUser[]) || []
}

export async function updateUser(
  id: string,
  updates: Partial<Pick<AppUser, 'name' | 'role' | 'fixed_salary'>>,
): Promise<AppUser> {
  const { data, error } = await db.from('users').update(updates).eq('id', id).select().single()

  if (error) throw error
  return data as unknown as AppUser
}

export async function deleteUser(id: string): Promise<void> {
  const { error } = await db.from('users').delete().eq('id', id)
  if (error) throw error
}

export async function getAllCommissionProfiles(): Promise<CommissionProfile[]> {
  const { data, error } = await db
    .from('commission_profiles')
    .select('*, user:users(*)')
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data as unknown as CommissionProfile[]) || []
}

export async function upsertCommissionProfile(
  profile: Partial<CommissionProfile> & { user_id: string; type: 'inbound' | 'outbound' },
): Promise<void> {
  if (profile.id) {
    const { error } = await db
      .from('commission_profiles')
      .update({
        user_id: profile.user_id,
        type: profile.type,
        default_percentage_year_1: profile.default_percentage_year_1,
        default_percentage_year_2_plus: profile.default_percentage_year_2_plus,
      })
      .eq('id', profile.id)
    if (error) throw error
  } else {
    const { error } = await db.from('commission_profiles').insert([
      {
        user_id: profile.user_id,
        type: profile.type,
        default_percentage_year_1: profile.default_percentage_year_1 || 0,
        default_percentage_year_2_plus: profile.default_percentage_year_2_plus || 0,
      },
    ])
    if (error) throw error
  }
}

export async function deleteCommissionProfile(id: string): Promise<void> {
  const { error } = await db.from('commission_profiles').delete().eq('id', id)
  if (error) throw error
}

export async function getAllTaxDeductions(): Promise<TaxDeduction[]> {
  const { data, error } = await db.from('tax_deductions').select('*').order('name')

  if (error) throw error
  return (data as unknown as TaxDeduction[]) || []
}

export async function upsertTaxDeduction(
  tax: Partial<TaxDeduction> & { name: string; type: 'percentage' | 'formula' },
): Promise<void> {
  if (tax.id) {
    const { error } = await db
      .from('tax_deductions')
      .update({
        name: tax.name,
        type: tax.type,
        value: tax.type === 'percentage' ? tax.value : null,
        formula_expression: tax.type === 'formula' ? tax.formula_expression : null,
        is_active: tax.is_active ?? true,
      })
      .eq('id', tax.id)
    if (error) throw error
  } else {
    const { error } = await db.from('tax_deductions').insert([
      {
        name: tax.name,
        type: tax.type,
        value: tax.type === 'percentage' ? tax.value : null,
        formula_expression: tax.type === 'formula' ? tax.formula_expression : null,
        is_active: tax.is_active ?? true,
      },
    ])
    if (error) throw error
  }
}

export async function toggleTaxDeductionActive(id: string, isActive: boolean): Promise<void> {
  const { error } = await db.from('tax_deductions').update({ is_active: isActive }).eq('id', id)
  if (error) throw error
}

export async function deleteTaxDeduction(id: string): Promise<void> {
  const { error } = await db.from('tax_deductions').delete().eq('id', id)
  if (error) throw error
}
