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
  SystemSettings,
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

export async function deleteMonthlyRun(
  monthlyRunId: string,
): Promise<{ success: boolean; message?: string }> {
  // 1. Critical business rule verification: never delete paid monthly run
  const run = await getMonthlyRunById(monthlyRunId)
  if (!run) {
    throw new Error('Competência não encontrada ou já excluída.')
  }

  if (run.status === 'paid') {
    throw new Error('Operação bloqueada: Não é permitido excluir uma competência fechada/paga.')
  }

  // 2. First attempt RPC delete_monthly_run (atomic transaction with cascading order)
  const { error: rpcError } = await (supabase.rpc as any)('delete_monthly_run', {
    p_monthly_run_id: monthlyRunId,
  })

  if (!rpcError) {
    return { success: true }
  }

  console.warn('Fallback to client-side sequential cascading delete:', rpcError)

  // 3. Fallback: Cascading deletion in strictly correct order
  // a) Retrieve billing IDs belonging to this monthly run
  const { data: billingsData, error: billErr } = await db
    .from('billings')
    .select('id')
    .eq('monthly_run_id', monthlyRunId)

  if (billErr) throw billErr

  const billingIds = (billingsData || []).map((b: { id: string }) => b.id)

  // b) Delete commissions tied to these billings (if any)
  if (billingIds.length > 0) {
    const { error: commErr } = await db.from('commissions').delete().in('billing_id', billingIds)

    if (commErr) throw commErr
  }

  // c) Delete billings belonging to this monthly run
  const { error: delBillErr } = await db
    .from('billings')
    .delete()
    .eq('monthly_run_id', monthlyRunId)

  if (delBillErr) throw delBillErr

  // d) Finally delete the monthly_run itself
  const { error: delRunErr } = await db.from('monthly_runs').delete().eq('id', monthlyRunId)

  if (delRunErr) throw delRunErr

  return { success: true }
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

export async function addUserToCustomer(
  customerId: string,
  userId: string,
  commissionType: string = 'inbound',
  validFrom?: string,
  validUntil?: string | null,
): Promise<void> {
  // Regra de Negócio: Administradores não podem ser vinculados a carteiras comerciais
  const { data: targetUser } = await db
    .from('users')
    .select('id, role')
    .eq('id', userId)
    .maybeSingle()

  if (targetUser && (targetUser as any).role === 'admin') {
    console.warn(
      `[addUserToCustomer] Usuário ${userId} possui role 'admin' e não pode ser vinculado a clientes. Operação ignorada.`,
    )
    return
  }

  // Check if link already exists
  const { data: existing } = await db
    .from('customer_users')
    .select('id, commission_type, valid_from, valid_until')
    .eq('customer_id', customerId)
    .eq('user_id', userId)
    .maybeSingle()

  const defaultValidFrom = validFrom || new Date().toISOString().split('T')[0]

  if (existing) {
    const updates: Record<string, any> = {}
    if (existing.commission_type !== commissionType) {
      updates.commission_type = commissionType
    }
    if (validFrom && existing.valid_from !== validFrom) {
      updates.valid_from = validFrom
    }
    if (validUntil !== undefined && existing.valid_until !== validUntil) {
      updates.valid_until = validUntil
    }
    if (Object.keys(updates).length > 0) {
      await db.from('customer_users').update(updates).eq('id', existing.id)
    }
    return // Already linked
  }

  const { error } = await db.from('customer_users').insert([
    {
      customer_id: customerId,
      user_id: userId,
      commission_type: commissionType,
      valid_from: defaultValidFrom,
      valid_until: validUntil || null,
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

  // 2. Remove existing links and re-add selected userIds with customer's origin as commission_type
  await db.from('customer_users').delete().eq('customer_id', customerId)

  if (userIds.length > 0) {
    // Filtrar para garantir que nenhum admin seja vinculado
    const { data: validUsers } = await db.from('users').select('id, role').in('id', userIds)

    const nonAdminUserIds = new Set(
      (validUsers || []).filter((u: any) => u.role !== 'admin').map((u: any) => u.id),
    )

    const rows = userIds
      .filter((uid) => nonAdminUserIds.has(uid))
      .map((uid) => ({
        customer_id: customerId,
        user_id: uid,
        commission_type: origin || 'inbound',
      }))
    if (rows.length > 0) {
      const { error: linkError } = await db.from('customer_users').insert(rows)
      if (linkError) throw linkError
    }
  }
}

export interface UserWithRulePayload {
  user_id: string
  commission_type: string
  valid_from?: string
  valid_until?: string | null
}

export interface BulkUpdateCustomersParams {
  customerIds: string[]
  origin?: 'inbound' | 'outbound' | null
  noCommissionFlag?: boolean
  usersWithRules?: UserWithRulePayload[]
  validFrom?: string
  validUntil?: string | null
  userIds?: string[]
  replaceUsers?: boolean // true: delete existing links and insert users; false: append new users (avoid duplicates)
}

export async function bulkUpdateCustomers(params: BulkUpdateCustomersParams): Promise<void> {
  const {
    customerIds,
    origin,
    noCommissionFlag,
    usersWithRules,
    userIds,
    replaceUsers = false,
  } = params

  if (!customerIds || customerIds.length === 0) {
    return
  }

  // Normalize targets to { user_id, commission_type }
  let targetUserRules: UserWithRulePayload[] | undefined = undefined
  if (usersWithRules !== undefined) {
    targetUserRules = usersWithRules
  } else if (userIds !== undefined) {
    // Backward compatibility if called with userIds array
    const defaultRule = origin && (origin as string) !== 'keep' ? origin : 'inbound'
    targetUserRules = userIds.map((uid) => ({
      user_id: uid,
      commission_type: defaultRule,
    }))
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

  // 2. Tratar vínculos de vendedores/gerentes em customer_users (se targetUserRules foi especificado)
  const defaultBatchValidFrom = params.validFrom || new Date().toISOString().split('T')[0]
  const defaultBatchValidUntil = params.validUntil ?? null

  if (targetUserRules !== undefined) {
    // Validação preventiva: filtrar targetUserRules para rejeitar qualquer usuário com role 'admin'
    let sanitizedRules = targetUserRules
    if (targetUserRules.length > 0) {
      const candidateUserIds = Array.from(new Set(targetUserRules.map((t) => t.user_id)))
      const { data: candidateUsers } = await db
        .from('users')
        .select('id, role')
        .in('id', candidateUserIds)

      const nonAdminIdSet = new Set(
        (candidateUsers || []).filter((u: any) => u.role !== 'admin').map((u: any) => u.id),
      )

      sanitizedRules = targetUserRules.filter((t) => nonAdminIdSet.has(t.user_id))
    }

    if (replaceUsers) {
      // Modo substituição: deletar vínculos antigos dos clientes selecionados
      const { error: delError } = await db
        .from('customer_users')
        .delete()
        .in('customer_id', customerIds)

      if (delError) throw delError

      // Inserir apenas os novos selecionados com a regra de cada usuário e vigência
      if (sanitizedRules.length > 0) {
        const rowsToInsert: Array<{
          customer_id: string
          user_id: string
          commission_type: string
          valid_from: string
          valid_until: string | null
        }> = []
        for (const custId of customerIds) {
          for (const item of sanitizedRules) {
            rowsToInsert.push({
              customer_id: custId,
              user_id: item.user_id,
              commission_type: item.commission_type || 'inbound',
              valid_from: item.valid_from || defaultBatchValidFrom,
              valid_until:
                item.valid_until !== undefined ? item.valid_until : defaultBatchValidUntil,
            })
          }
        }

        if (rowsToInsert.length > 0) {
          const { error: insError } = await db.from('customer_users').insert(rowsToInsert)
          if (insError) throw insError
        }
      }
    } else {
      // Modo adição: apenas adicionar vínculos que ainda não existam para evitar violar customer_users_unique
      if (sanitizedRules.length > 0) {
        // Buscar vínculos existentes dos clientes selecionados
        const { data: existingLinks, error: fetchErr } = await db
          .from('customer_users')
          .select('id, customer_id, user_id, commission_type, valid_from, valid_until')
          .in('customer_id', customerIds)

        if (fetchErr) throw fetchErr

        const existingMap = new Map<string, any>(
          (existingLinks || []).map((link: any) => [`${link.customer_id}_${link.user_id}`, link]),
        )

        const rowsToInsert: Array<{
          customer_id: string
          user_id: string
          commission_type: string
          valid_from: string
          valid_until: string | null
        }> = []
        for (const custId of customerIds) {
          for (const item of sanitizedRules) {
            const key = `${custId}_${item.user_id}`
            const existing = existingMap.get(key)
            const itemValidFrom = item.valid_from || defaultBatchValidFrom
            const itemValidUntil =
              item.valid_until !== undefined ? item.valid_until : defaultBatchValidUntil

            if (!existing) {
              rowsToInsert.push({
                customer_id: custId,
                user_id: item.user_id,
                commission_type: item.commission_type || 'inbound',
                valid_from: itemValidFrom,
                valid_until: itemValidUntil,
              })
              existingMap.set(key, { customer_id: custId, user_id: item.user_id }) // Evita duplicar no batch
            } else if (existing.id) {
              // Se já existia, atualizamos regra e vigência se fornecido
              const linkUpdates: Record<string, any> = {}
              if (item.commission_type && existing.commission_type !== item.commission_type) {
                linkUpdates.commission_type = item.commission_type
              }
              if (params.validFrom && existing.valid_from !== params.validFrom) {
                linkUpdates.valid_from = params.validFrom
              }
              if (params.validUntil !== undefined && existing.valid_until !== params.validUntil) {
                linkUpdates.valid_until = params.validUntil
              }
              if (Object.keys(linkUpdates).length > 0) {
                await db.from('customer_users').update(linkUpdates).eq('id', existing.id)
              }
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

// Format date string to YYYY-MM
function toYearMonth(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null
  const clean = dateStr.trim().split('T')[0]
  const parts = clean.split('-')
  if (parts.length >= 2) {
    const yyyy = parts[0].padStart(4, '0')
    const mm = parts[1].padStart(2, '0')
    return `${yyyy}-${mm}`
  }
  return null
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

function isPeriodValidForMonth(
  validFromStr: string | null | undefined,
  validUntilStr: string | null | undefined,
  runMonthStr: string,
): boolean {
  const runYM = toYearMonth(runMonthStr)
  if (!runYM) return true

  if (validFromStr) {
    const fromYM = toYearMonth(validFromStr)
    if (fromYM && runYM < fromYM) return false
  }

  if (validUntilStr) {
    const untilYM = toYearMonth(validUntilStr)
    if (untilYM && runYM > untilYM) return false
  }

  return true
}

function isLinkValidForMonth(
  validFromStr: string | null | undefined,
  validUntilStr: string | null | undefined,
  runMonthStr: string,
): boolean {
  return isPeriodValidForMonth(validFromStr, validUntilStr, runMonthStr)
}

// Find best matching commission profile for user, rule type and competence month
export function findActiveCommissionProfile(
  profiles: CommissionProfile[],
  userId: string,
  ruleType: string,
  runMonthStr: string,
): CommissionProfile | null {
  // Filter active profiles for this user and type where runMonth is within [valid_from, valid_until]
  const matching = (profiles || []).filter((p) => {
    if (p.user_id !== userId) return false
    if ((p.type || '').toLowerCase() !== ruleType.toLowerCase()) return false
    if (p.is_active === false) return false
    return isPeriodValidForMonth(p.valid_from, p.valid_until, runMonthStr)
  })

  if (matching.length > 0) {
    // Sort descending by valid_from (most recent first), then created_at descending
    matching.sort((a, b) => {
      const aFrom = a.valid_from ? new Date(a.valid_from).getTime() : 0
      const bFrom = b.valid_from ? new Date(b.valid_from).getTime() : 0
      if (bFrom !== aFrom) return bFrom - aFrom
      const aCreated = a.created_at ? new Date(a.created_at).getTime() : 0
      const bCreated = b.created_at ? new Date(b.created_at).getTime() : 0
      return bCreated - aCreated
    })
    return matching[0]
  }

  // Fallback: any active profile of this user matching validity
  const fallback = (profiles || []).filter((p) => {
    if (p.user_id !== userId) return false
    if (p.is_active === false) return false
    return isPeriodValidForMonth(p.valid_from, p.valid_until, runMonthStr)
  })

  if (fallback.length > 0) {
    fallback.sort((a, b) => {
      const aFrom = a.valid_from ? new Date(a.valid_from).getTime() : 0
      const bFrom = b.valid_from ? new Date(b.valid_from).getTime() : 0
      if (bFrom !== aFrom) return bFrom - aFrom
      const aCreated = a.created_at ? new Date(a.created_at).getTime() : 0
      const bCreated = b.created_at ? new Date(b.created_at).getTime() : 0
      return bCreated - aCreated
    })
    return fallback[0]
  }

  return null
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

    const rawLinked = customerUsers.filter((cu) => cu.customer_id === billing.customer_id)
    // Filter by validity period (valid_from and valid_until)
    const linked = rawLinked.filter((cu) =>
      isLinkValidForMonth(cu.valid_from, cu.valid_until, run.month_year),
    )

    const months = getMonthsDiff(cust?.start_date, run.month_year)
    const runYM = toYearMonth(run.month_year)
    const customerStartYM = toYearMonth(cust?.start_date)
    const isFirstBillingMonth = Boolean(runYM && customerStartYM && runYM === customerStartYM)

    for (const link of linked) {
      const linkRule = (link.commission_type || cust?.origin || 'inbound').toLowerCase()
      const activeProf = findActiveCommissionProfile(
        profiles,
        link.user_id,
        linkRule,
        run.month_year,
      )

      let pct = 0

      // SETUP FEE CHECK: If this is the 1st billing month AND profile has setup_fee_percentage configured
      const hasSetupFee =
        activeProf &&
        activeProf.setup_fee_percentage !== null &&
        activeProf.setup_fee_percentage !== undefined &&
        !isNaN(Number(activeProf.setup_fee_percentage))

      if (isFirstBillingMonth && hasSetupFee) {
        pct = Number(activeProf.setup_fee_percentage) || 0
      } else if (activeProf) {
        if (linkRule === 'outbound') {
          pct =
            months <= 12
              ? Number(activeProf.default_percentage_year_1) || 0
              : Number(activeProf.default_percentage_year_2_plus) || 0
        } else {
          pct = Number(activeProf.default_percentage_year_1) || 0
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

  // Safe atomic-like replacement pattern:
  // First clear prior commissions only after all computations succeeded, then insert new ones
  const bIds = billings.map((b) => b.id)
  if (bIds.length > 0) {
    const { error: delCommErr } = await db.from('commissions').delete().in('billing_id', bIds)
    if (delCommErr) throw delCommErr
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
  updates: Partial<
    Pick<
      AppUser,
      'name' | 'role' | 'fixed_salary' | 'auto_send_report_to_self' | 'cc_hr' | 'cc_finance'
    >
  >,
): Promise<AppUser> {
  const { data, error } = await db.from('users').update(updates).eq('id', id).select().single()

  if (error) throw error

  // Se o usuário foi alterado para role = 'admin', remover vínculos comerciais e encerrar/deletar perfis de comissão existentes
  if (updates.role === 'admin') {
    try {
      // 1. Tentar deletar perfis sem histórico; se houver histórico, encerrar definindo valid_until = hoje e is_active = false
      const { data: userProfiles } = await db
        .from('commission_profiles')
        .select('*')
        .eq('user_id', id)
      const todayStr = new Date().toISOString().split('T')[0]
      for (const prof of userProfiles || []) {
        try {
          await deleteCommissionProfile(prof.id)
        } catch (delErr: any) {
          // Se falhou por proteção de histórico, encerra a regra
          await endCommissionProfile(prof.id, todayStr)
        }
      }
      // 2. Encerrar ou remover customer_users
      await db.from('customer_users').delete().eq('user_id', id)
    } catch (cleanupErr) {
      console.warn('Erro ao tratar perfis e vínculos ao promover usuário a admin:', cleanupErr)
    }
  }

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
    .order('valid_from', { ascending: false })

  if (error) throw error
  return (data as unknown as CommissionProfile[]) || []
}

export async function upsertCommissionProfile(
  profile: Partial<CommissionProfile> & {
    user_id: string
    type: 'inbound' | 'outbound'
    valid_from?: string
    valid_until?: string | null
    is_active?: boolean
  },
): Promise<void> {
  // Regra de Negócio: Administradores não podem possuir perfil de comissão
  const { data: targetUser } = await db
    .from('users')
    .select('id, role')
    .eq('id', profile.user_id)
    .maybeSingle()

  if (targetUser && (targetUser as any).role === 'admin') {
    throw new Error('Utilizadores com perfil Administrador não podem possuir regras de comissão.')
  }

  const validFromVal = profile.valid_from || new Date().toISOString().split('T')[0]
  const validUntilVal = profile.valid_until !== undefined ? profile.valid_until : null
  const isActiveVal = profile.is_active !== undefined ? profile.is_active : true

  // Validação de sobreposição de datas para o mesmo usuário e tipo
  const fromYM = toYearMonth(validFromVal)
  const untilYM = validUntilVal ? toYearMonth(validUntilVal) : null

  if (fromYM && untilYM && fromYM > untilYM) {
    throw new Error(
      'A data inicial ("Válido a partir de") não pode ser posterior à data final ("Válido até").',
    )
  }

  // Buscar perfis existentes ativos do mesmo utilizador e tipo
  const { data: existingSameType } = await db
    .from('commission_profiles')
    .select('id, valid_from, valid_until, is_active')
    .eq('user_id', profile.user_id)
    .eq('type', profile.type)

  const otherProfiles = (existingSameType || []).filter(
    (p: any) => p.id !== profile.id && p.is_active !== false,
  )

  for (const existing of otherProfiles) {
    const exFromYM = toYearMonth(existing.valid_from)
    const exUntilYM = existing.valid_until ? toYearMonth(existing.valid_until) : null

    // Verifica sobreposição de competências: [fromYM, untilYM] vs [exFromYM, exUntilYM]
    // Duas faixas [A, B] e [C, D] se sobrepõem se max(A, C) <= min(B, D)
    const startA = fromYM || '0000-00'
    const endA = untilYM || '9999-99'
    const startB = exFromYM || '0000-00'
    const endB = exUntilYM || '9999-99'

    if (startA <= endB && startB <= endA) {
      throw new Error(
        `Já existe uma regra ativa do tipo "${profile.type}" com vigência concorrente (${existing.valid_from || 'início'} até ${existing.valid_until || 'indeterminado'}). Encerre ou ajuste o período da regra anterior antes de cadastrar outro intervalo sobreposto.`,
      )
    }
  }

  if (profile.id) {
    const { error } = await db
      .from('commission_profiles')
      .update({
        user_id: profile.user_id,
        type: profile.type,
        default_percentage_year_1: profile.default_percentage_year_1,
        default_percentage_year_2_plus: profile.default_percentage_year_2_plus,
        setup_fee_percentage:
          profile.setup_fee_percentage !== undefined ? profile.setup_fee_percentage : null,
        valid_from: validFromVal,
        valid_until: validUntilVal,
        is_active: isActiveVal,
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
        setup_fee_percentage:
          profile.setup_fee_percentage !== undefined ? profile.setup_fee_percentage : null,
        valid_from: validFromVal,
        valid_until: validUntilVal,
        is_active: isActiveVal,
      },
    ])
    if (error) throw error
  }
}

export async function endCommissionProfile(id: string, endDate?: string): Promise<void> {
  const until = endDate || new Date().toISOString().split('T')[0]
  const { error } = await db
    .from('commission_profiles')
    .update({
      valid_until: until,
      is_active: false,
    })
    .eq('id', id)

  if (error) throw error
}

export async function deleteCommissionProfile(id: string): Promise<void> {
  const { error } = await db.from('commission_profiles').delete().eq('id', id)
  if (error) {
    // Tratar erro retornado pelo trigger do banco
    if (error.message?.includes('PROFILE_IN_USE')) {
      throw new Error(
        'Esta regra de comissão já foi utilizada em cálculos financeiros de competências anteriores e não pode ser excluída fisicamente. Utilize a opção "Encerrar Regra" para inativá-la e manter o histórico intacto.',
      )
    }
    throw error
  }
}

export async function getCommissionProfilesByUserId(userId: string): Promise<CommissionProfile[]> {
  const { data, error } = await db
    .from('commission_profiles')
    .select('*')
    .eq('user_id', userId)
    .order('valid_from', { ascending: false })

  if (error) throw error
  return (data as unknown as CommissionProfile[]) || []
}

export async function deleteCommissionProfilesByUserId(userId: string): Promise<void> {
  const { error } = await db.from('commission_profiles').delete().eq('user_id', userId)
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

export async function getSystemSettings(): Promise<SystemSettings | null> {
  const { data, error } = await db.from('system_settings').select('*').limit(1).maybeSingle()
  if (error) throw error
  return data as unknown as SystemSettings | null
}

export async function updateSystemSettings(
  settings: Partial<SystemSettings>,
): Promise<SystemSettings> {
  const current = await getSystemSettings()
  if (current) {
    const { data, error } = await db
      .from('system_settings')
      .update({
        ...settings,
        updated_at: new Date().toISOString(),
      })
      .eq('id', current.id)
      .select()
      .single()
    if (error) throw error
    return data as unknown as SystemSettings
  } else {
    const { data, error } = await db
      .from('system_settings')
      .insert([
        {
          company_name: settings.company_name || 'Globex Multimodal',
          company_logo_url: settings.company_logo_url || null,
          hr_email: settings.hr_email || null,
          finance_email: settings.finance_email || null,
        },
      ])
      .select()
      .single()
    if (error) throw error
    return data as unknown as SystemSettings
  }
}

export async function uploadCompanyLogo(file: File): Promise<string> {
  const fileExt = file.name.split('.').pop()
  const fileName = `company-logo-${Date.now()}.${fileExt}`
  const filePath = `logos/${fileName}`

  const { error: uploadError } = await supabase.storage
    .from('assets')
    .upload(filePath, file, { upsert: true })

  if (uploadError) throw uploadError

  const { data } = supabase.storage.from('assets').getPublicUrl(filePath)
  return data.publicUrl
}

export async function sendCommissionReports(params: {
  monthlyRunId?: string
  userIds?: string[]
}): Promise<{
  success: boolean
  simulated?: boolean
  message: string
  dispatchedCount?: number
  plan?: any[]
  details?: any[]
}> {
  const { data, error } = await supabase.functions.invoke('send-reports', {
    body: {
      monthly_run_id: params.monthlyRunId,
      user_ids: params.userIds,
    },
  })

  if (error) {
    throw new Error(error.message || 'Falha ao acionar a função de disparo de relatórios.')
  }

  if (data && data.success === false) {
    throw new Error(data.error || 'Falha no processamento do disparo de e-mails.')
  }

  return data
}
