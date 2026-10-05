import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { evaluateTaxFormula } from '../_shared/formulaEvaluator.ts'

interface CalculateRequest {
  monthly_run_id: string
}

interface TaxAppliedSnapshot {
  name: string
  type: 'percentage' | 'formula'
  value?: number | null
  expression?: string | null
  deducted: number
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

// Calculate month difference between start_date and run month_year
function getMonthDifference(startDateStr: string | null | undefined, runMonthStr: string): number {
  if (!startDateStr) return 0
  const start = new Date(startDateStr)
  const run = new Date(runMonthStr)
  if (isNaN(start.getTime()) || isNaN(run.getTime())) return 0

  const yearsDiff = run.getFullYear() - start.getFullYear()
  const monthsDiff = run.getMonth() - start.getMonth()
  const totalMonths = yearsDiff * 12 + monthsDiff
  return Math.max(0, totalMonths)
}

// Check if run month falls within validity period [valid_from, valid_until] (scope: YYYY-MM)
function isPeriodValidForMonth(
  validFromStr: string | null | undefined,
  validUntilStr: string | null | undefined,
  runMonthStr: string,
): boolean {
  const runYM = toYearMonth(runMonthStr)
  if (!runYM) return true

  // If validFrom is specified, compare YYYY-MM
  if (validFromStr) {
    const fromYM = toYearMonth(validFromStr)
    if (fromYM && runYM < fromYM) {
      return false
    }
  }

  // If validUntil is specified, compare YYYY-MM
  if (validUntilStr) {
    const untilYM = toYearMonth(validUntilStr)
    if (untilYM && runYM > untilYM) {
      return false
    }
  }

  return true
}

// Check link validity for customer_users
function isLinkValidForMonth(
  validFromStr: string | null | undefined,
  validUntilStr: string | null | undefined,
  runMonthStr: string,
): boolean {
  return isPeriodValidForMonth(validFromStr, validUntilStr, runMonthStr)
}

// Find best matching commission profile for user, type and competence month
function findActiveCommissionProfile(
  profiles: any[],
  userId: string,
  ruleType: string,
  runMonthStr: string,
): any | null {
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const supabaseKey = serviceRoleKey || anonKey

    // Create client using service role key (or caller auth header) for secure backend database operations
    const authHeader = req.headers.get('Authorization') ?? ''
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        headers: !serviceRoleKey && authHeader ? { Authorization: authHeader } : {},
      },
    })

    const body: CalculateRequest = await req.json()
    const { monthly_run_id } = body

    if (!monthly_run_id) {
      return new Response(JSON.stringify({ error: 'monthly_run_id é obrigatório' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    // 1. Initial check of monthly run
    const { data: run, error: runError } = await supabase
      .from('monthly_runs')
      .select('*')
      .eq('id', monthly_run_id)
      .single()

    if (runError || !run) {
      return new Response(
        JSON.stringify({ error: `Execução mensal não encontrada: ${runError?.message}` }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        },
      )
    }

    if (run.status === 'paid') {
      return new Response(
        JSON.stringify({
          error:
            'Este mês já está fechado e marcado como pago. O recálculo está bloqueado por compliance.',
        }),
        {
          status: 403,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        },
      )
    }

    const globalBilling = Number(run.gross_company_billing) || 0
    const runYM = toYearMonth(run.month_year)

    // 2. Fetch all billings for this run with customer
    const { data: billings, error: billingsError } = await supabase
      .from('billings')
      .select('*, customer:customers(*)')
      .eq('monthly_run_id', monthly_run_id)

    if (billingsError) {
      return new Response(
        JSON.stringify({ error: `Erro ao buscar faturamentos: ${billingsError.message}` }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        },
      )
    }

    // 3. Fetch all active tax deductions
    const { data: taxes, error: taxesError } = await supabase
      .from('tax_deductions')
      .select('*')
      .eq('is_active', true)

    if (taxesError) {
      return new Response(
        JSON.stringify({ error: `Erro ao buscar impostos: ${taxesError.message}` }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        },
      )
    }

    // 4. Fetch all commission profiles
    const { data: profiles, error: profilesError } = await supabase
      .from('commission_profiles')
      .select('*')

    if (profilesError) {
      return new Response(
        JSON.stringify({ error: `Erro ao buscar perfis de comissão: ${profilesError.message}` }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        },
      )
    }

    // 5. Fetch all customer_users
    const { data: customerUsers, error: cuError } = await supabase
      .from('customer_users')
      .select('*')

    if (cuError) {
      return new Response(
        JSON.stringify({ error: `Erro ao buscar vínculos de clientes: ${cuError.message}` }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        },
      )
    }

    const commissionInserts: Array<{
      billing_id: string
      user_id: string
      percentage_applied: number
      commission_amount: number
    }> = []

    const billingUpdates: Array<{
      id: string
      net_amount: number
      tax_deductions_applied_json: TaxAppliedSnapshot[]
    }> = []

    // Process each billing deterministically
    for (const billing of billings || []) {
      const gross = Number(billing.gross_amount) || 0
      let totalDeductions = 0
      const deductionsSnapshot: TaxAppliedSnapshot[] = []

      for (const tax of taxes || []) {
        let deductedAmount = 0
        if (tax.type === 'percentage') {
          const pct = Number(tax.value) || 0
          deductedAmount = gross * (pct / 100)
          deductionsSnapshot.push({
            name: tax.name,
            type: 'percentage',
            value: pct,
            deducted: Math.round(deductedAmount * 100) / 100,
          })
        } else if (tax.type === 'formula') {
          const evalRes = evaluateTaxFormula(tax.formula_expression || '0', {
            CLIENT_BILLING: gross,
            GLOBAL_BILLING: globalBilling,
          })

          if (evalRes.error) {
            console.error(`Erro avaliando fórmula do imposto ${tax.name}:`, evalRes.error)
            deductedAmount = 0
          } else {
            deductedAmount = evalRes.result
          }

          deductionsSnapshot.push({
            name: tax.name,
            type: 'formula',
            expression: tax.formula_expression,
            deducted: Math.round(deductedAmount * 100) / 100,
          })
        }
        totalDeductions += deductedAmount
      }

      const netAmount = Math.max(0, gross - totalDeductions)
      const roundedNet = Math.round(netAmount * 100) / 100

      billingUpdates.push({
        id: billing.id,
        net_amount: roundedNet,
        tax_deductions_applied_json: deductionsSnapshot,
      })

      const customer = billing.customer
      // If no_commission_flag is true, skip commission calculation
      if (customer?.no_commission_flag) {
        continue
      }

      // Find linked users for this customer
      const rawLinkedUsers = (customerUsers || []).filter(
        (cu) => cu.customer_id === billing.customer_id,
      )

      // Filter by validity period (valid_from and valid_until)
      const linkedUsers = rawLinkedUsers.filter((cu) =>
        isLinkValidForMonth(cu.valid_from, cu.valid_until, run.month_year),
      )

      const monthsActive = getMonthDifference(customer?.start_date, run.month_year)
      const customerStartYM = toYearMonth(customer?.start_date)

      // IDEMPOTENCY & SETUP FEE:
      // A taxa de implantação (setup fee) é uma cobrança one-off aplicada apenas
      // quando a competência do faturamento (runYM) é estritamente igual ao mês/ano
      // do start_date do cliente (customerStartYM).
      // Ela substitui as alíquotas normais de comissão no 1º faturamento.
      const isFirstBillingMonth = Boolean(runYM && customerStartYM && runYM === customerStartYM)

      // Usar Set para garantir que cada usuário receba no máximo uma comissão por faturamento
      const processedUsersForThisBilling = new Set<string>()

      for (const link of linkedUsers) {
        if (processedUsersForThisBilling.has(link.user_id)) {
          // Já processado para este billing (proteção preventiva contra tuplas duplicadas)
          continue
        }
        processedUsersForThisBilling.add(link.user_id)

        // Read commission_type directly from the link (customer_users), fallback to customer.origin or 'inbound'
        const linkRule = (link.commission_type || customer?.origin || 'inbound').toLowerCase()

        // Find profile for this user matching rule with temporal validity & descending valid_from
        const activeProfile = findActiveCommissionProfile(
          profiles || [],
          link.user_id,
          linkRule,
          run.month_year,
        )

        let percentageToApply = 0

        // SETUP FEE CHECK: Se for o primeiro mês de faturamento e o perfil ativo contiver setup_fee_percentage configurada
        const hasSetupFee =
          activeProfile &&
          activeProfile.setup_fee_percentage !== null &&
          activeProfile.setup_fee_percentage !== undefined &&
          !isNaN(Number(activeProfile.setup_fee_percentage))

        if (isFirstBillingMonth && hasSetupFee) {
          // Taxa de implantação substitui as alíquotas padrão de 1º e 2º ano
          percentageToApply = Number(activeProfile.setup_fee_percentage) || 0
        } else if (activeProfile) {
          if (linkRule === 'outbound') {
            // outbound: <= 12 months uses year 1, > 12 months uses year 2+
            if (monthsActive <= 12) {
              percentageToApply = Number(activeProfile.default_percentage_year_1) || 0
            } else {
              percentageToApply = Number(activeProfile.default_percentage_year_2_plus) || 0
            }
          } else {
            // inbound, fixed or others use default_percentage_year_1
            percentageToApply = Number(activeProfile.default_percentage_year_1) || 0
          }
        }

        const commissionVal = Math.round(((roundedNet * percentageToApply) / 100) * 100) / 100

        commissionInserts.push({
          billing_id: billing.id,
          user_id: link.user_id,
          percentage_applied: percentageToApply,
          commission_amount: commissionVal,
        })
      }
    }

    // =========================================================================
    // ATOMIC & TRANSACTIONAL PERSISTENCE VIA POSTGRES RPC:
    // 1. SELECT ... FOR UPDATE no monthly_run (row lock serializando execuções simultâneas)
    // 2. Revalidação transacional de status != 'paid'
    // 3. UPDATE billings (net_amount e deduções)
    // 4. DELETE comissões antigas do monthly_run_id
    // 5. INSERT das novas comissões
    // 6. UPDATE monthly_runs.status = 'processed'
    // Se qualquer etapa falhar, o Postgres aborta e reverte a transação inteira.
    // =========================================================================
    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      'commit_calculated_commissions',
      {
        p_monthly_run_id: monthly_run_id,
        p_billing_updates: billingUpdates,
        p_commission_inserts: commissionInserts,
      },
    )

    if (rpcError) {
      console.error('Erro na transação de gravação de comissões:', rpcError)
      const isPaidLock = rpcError.message?.includes('RUN_LOCKED_PAID')
      return new Response(
        JSON.stringify({
          error: isPaidLock
            ? 'Este mês já está fechado e marcado como pago. O recálculo está bloqueado por compliance.'
            : `Erro na transação de recálculo: ${rpcError.message}`,
        }),
        {
          status: isPaidLock ? 403 : 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        },
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Mês processado com sucesso!',
        billingsProcessed: (billings || []).length,
        commissionsGenerated: commissionInserts.length,
        details: rpcResult,
      }),
      {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      },
    )
  } catch (err: any) {
    console.error('Exceção ao calcular comissões:', err)
    return new Response(JSON.stringify({ error: err.message || 'Erro interno no processamento' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }
})
