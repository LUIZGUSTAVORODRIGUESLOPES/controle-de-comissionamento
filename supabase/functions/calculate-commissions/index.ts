import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { compile } from 'npm:mathjs@^14.0.1'
import { corsHeaders } from '../_shared/cors.ts'

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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseKey =
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? ''

    // Create client using user auth token if present
    const authHeader = req.headers.get('Authorization') ?? ''
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        headers: authHeader ? { Authorization: authHeader } : {},
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

    // 1. Fetch monthly run
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

    const globalBilling = Number(run.gross_company_billing) || 0

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

    // Pre-clean previous commissions for these billings (if reprocessing)
    const billingIds = (billings || []).map((b) => b.id)
    if (billingIds.length > 0) {
      await supabase.from('commissions').delete().in('billing_id', billingIds)
    }

    const commissionInserts: Array<{
      billing_id: string
      user_id: string
      percentage_applied: number
      commission_amount: number
    }> = []

    // Process each billing
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
          try {
            const expr = tax.formula_expression || '0'
            const compiled = compile(expr)
            const result = compiled.evaluate({
              CLIENT_BILLING: gross,
              GLOBAL_BILLING: globalBilling,
            })
            deductedAmount = Number(result)
            if (isNaN(deductedAmount) || !isFinite(deductedAmount)) {
              deductedAmount = 0
            }
            deductionsSnapshot.push({
              name: tax.name,
              type: 'formula',
              expression: expr,
              deducted: Math.round(deductedAmount * 100) / 100,
            })
          } catch (calcErr) {
            console.error(`Erro avaliando fórmula do imposto ${tax.name}:`, calcErr)
            deductionsSnapshot.push({
              name: tax.name,
              type: 'formula',
              expression: tax.formula_expression,
              deducted: 0,
            })
            deductedAmount = 0
          }
        }
        totalDeductions += deductedAmount
      }

      const netAmount = Math.max(0, gross - totalDeductions)
      const roundedNet = Math.round(netAmount * 100) / 100

      // Update billing record with net_amount and snapshot
      await supabase
        .from('billings')
        .update({
          net_amount: roundedNet,
          tax_deductions_applied_json: deductionsSnapshot,
        })
        .eq('id', billing.id)

      const customer = billing.customer
      // If no_commission_flag is true, skip commission calculation
      if (customer?.no_commission_flag) {
        continue
      }

      // Find linked users for this customer
      const linkedUsers = (customerUsers || []).filter(
        (cu) => cu.customer_id === billing.customer_id,
      )
      const customerOrigin = customer?.origin || 'outbound'
      const monthsActive = getMonthDifference(customer?.start_date, run.month_year)

      for (const link of linkedUsers) {
        // Find profile for this user matching origin
        const userProfile = (profiles || []).find(
          (p) => p.user_id === link.user_id && p.type === customerOrigin,
        )

        let percentageToApply = 0
        if (userProfile) {
          if (customerOrigin === 'inbound') {
            percentageToApply = Number(userProfile.default_percentage_year_1) || 0
          } else {
            // outbound: <= 12 months uses year 1, > 12 months uses year 2+
            if (monthsActive <= 12) {
              percentageToApply = Number(userProfile.default_percentage_year_1) || 0
            } else {
              percentageToApply = Number(userProfile.default_percentage_year_2_plus) || 0
            }
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

    // Insert commissions batch
    if (commissionInserts.length > 0) {
      const { error: insCommError } = await supabase.from('commissions').insert(commissionInserts)
      if (insCommError) {
        console.error('Erro ao inserir comissões:', insCommError)
      }
    }

    // 6. Update monthly_run status to processed
    const { error: updateRunError } = await supabase
      .from('monthly_runs')
      .update({ status: 'processed' })
      .eq('id', monthly_run_id)

    if (updateRunError) {
      return new Response(
        JSON.stringify({ error: `Erro ao atualizar status: ${updateRunError.message}` }),
        {
          status: 500,
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
