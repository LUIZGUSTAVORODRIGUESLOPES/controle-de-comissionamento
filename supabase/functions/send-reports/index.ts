import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

interface SendReportsRequestBody {
  monthly_run_id?: string
  user_ids?: string[]
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const resendApiKey = Deno.env.get('RESEND_API_KEY')

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            'Configuração do Supabase incompleta no servidor (URL ou SERVICE_ROLE_KEY ausente).',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Parse request payload
    let body: SendReportsRequestBody = {}
    try {
      body = await req.json()
    } catch {
      // Body may be empty
    }

    const { monthly_run_id, user_ids } = body

    // 1. Fetch system_settings (company_name, hr_email, finance_email, logo)
    const { data: settingsData, error: settingsError } = await supabase
      .from('system_settings')
      .select('*')
      .limit(1)
      .maybeSingle()

    if (settingsError) {
      console.error('Erro ao buscar system_settings:', settingsError)
    }

    const companyName = settingsData?.company_name || 'Globex Multimodal'
    const hrEmail = settingsData?.hr_email?.trim() || null
    const financeEmail = settingsData?.finance_email?.trim() || null

    // 2. Fetch monthly run
    let monthlyRun: any = null
    if (monthly_run_id) {
      const { data: runData } = await supabase
        .from('monthly_runs')
        .select('*')
        .eq('id', monthly_run_id)
        .maybeSingle()
      monthlyRun = runData
    } else {
      // Pick latest processed or paid run
      const { data: latestRun } = await supabase
        .from('monthly_runs')
        .select('*')
        .in('status', ['processed', 'paid'])
        .order('month_year', { ascending: false })
        .limit(1)
        .maybeSingle()
      monthlyRun = latestRun
    }

    if (!monthlyRun) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Nenhum mês de competência processado encontrado para envio de relatórios.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 3. Fetch target users
    let usersQuery = supabase.from('users').select('*')
    if (user_ids && user_ids.length > 0) {
      usersQuery = usersQuery.in('id', user_ids)
    } else {
      // Default: sales & managers
      usersQuery = usersQuery.in('role', ['sales', 'manager'])
    }

    const { data: targetUsers, error: usersError } = await usersQuery
    if (usersError || !targetUsers || targetUsers.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Nenhum colaborador encontrado para receber os relatórios.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 4. Fetch commissions and billings for this monthly run
    const { data: commissionsData } = await supabase
      .from('commissions')
      .select('*, billing:billings(*, customer:customers(*))')

    const runCommissions = (commissionsData || []).filter(
      (c: any) => c.billing?.monthly_run_id === monthlyRun.id,
    )

    // Format competence month display
    const formatCompetence = (dateStr: string) => {
      try {
        const [yyyy, mm] = dateStr.split('-')
        const months = [
          'Janeiro',
          'Fevereiro',
          'Março',
          'Abril',
          'Maio',
          'Junho',
          'Julho',
          'Agosto',
          'Setembro',
          'Outubro',
          'Novembro',
          'Dezembro',
        ]
        return `${months[parseInt(mm, 10) - 1] || mm} de ${yyyy}`
      } catch {
        return dateStr
      }
    }
    const competenceText = formatCompetence(monthlyRun.month_year)

    const formatCurrency = (val: number) => {
      return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0)
    }

    // 5. Build dispatch plan
    const emailDispatchPlan: Array<{
      to: string[]
      cc: string[]
      subject: string
      recipientName: string
      fixedSalary: number
      commissionsTotal: number
      totalPayable: number
      itemsCount: number
      userPrefs: {
        auto_send_to_self: boolean
        cc_hr: boolean
        cc_finance: boolean
      }
    }> = []

    for (const u of targetUsers) {
      const userComms = runCommissions.filter((c: any) => c.user_id === u.id)
      const commTotal = userComms.reduce(
        (acc: number, c: any) => acc + (Number(c.commission_amount) || 0),
        0,
      )
      const fixed = Number(u.fixed_salary) || 0
      const totalPay = fixed + commTotal

      const autoSend = u.auto_send_report_to_self !== false // default true
      const ccHrPref = Boolean(u.cc_hr)
      const ccFinPref = Boolean(u.cc_finance)

      const toList: string[] = []
      if (autoSend && u.email) {
        toList.push(u.email)
      }

      const ccList: string[] = []
      if (ccHrPref && hrEmail) {
        ccList.push(hrEmail)
      }
      if (ccFinPref && financeEmail) {
        ccList.push(financeEmail)
      }

      // If user opted out of self email but cc is enabled, route to cc
      if (toList.length === 0 && ccList.length > 0) {
        toList.push(ccList.shift()!)
      }

      if (toList.length > 0) {
        emailDispatchPlan.push({
          to: toList,
          cc: ccList,
          subject: `[${companyName}] Extrato de Comissões - ${competenceText} - ${u.name}`,
          recipientName: u.name,
          fixedSalary: fixed,
          commissionsTotal: commTotal,
          totalPayable: totalPay,
          itemsCount: userComms.length,
          userPrefs: {
            auto_send_to_self: autoSend,
            cc_hr: ccHrPref,
            cc_finance: ccFinPref,
          },
        })
      }
    }

    // 6. Graceful execution check: Is RESEND_API_KEY configured?
    if (!resendApiKey) {
      console.warn(
        'RESEND_API_KEY não está configurada no ambiente. Simulação de envio realizada com sucesso.',
      )
      return new Response(
        JSON.stringify({
          success: true,
          simulated: true,
          message: `Modo Simulação: A chave RESEND_API_KEY não foi configurada nos Secrets. O sistema validou as preferências e preparou o disparo para ${emailDispatchPlan.length} colaboradores com sucesso.`,
          competenceMonth: competenceText,
          dispatchedCount: emailDispatchPlan.length,
          plan: emailDispatchPlan.map((p) => ({
            recipient: p.recipientName,
            to: p.to,
            cc: p.cc,
            totalPayable: formatCurrency(p.totalPayable),
            commissions: formatCurrency(p.commissionsTotal),
            fixed: formatCurrency(p.fixedSalary),
          })),
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 7. Live Resend API delivery
    const deliveryResults: Array<{ to: string[]; status: 'sent' | 'failed'; error?: string }> = []

    for (const item of emailDispatchPlan) {
      try {
        const htmlBody = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px;">
            <div style="border-bottom: 2px solid #0f766e; padding-bottom: 16px; margin-bottom: 20px;">
              <h2 style="color: #0f766e; margin: 0; font-size: 20px;">${companyName}</h2>
              <p style="margin: 4px 0 0 0; color: #64748b; font-size: 13px;">Demonstrativo Mensal de Comissionamento B2B</p>
            </div>

            <p style="font-size: 15px; line-height: 1.5; color: #334155;">
              Olá, <strong>${item.recipientName}</strong>,
            </p>
            <p style="font-size: 14px; line-height: 1.5; color: #475569;">
              O fechamento de comissões referente a <strong>${competenceText}</strong> foi concluído. Abaixo você confere o resumo da sua apuração:
            </p>

            <table style="width: 100%; border-collapse: collapse; margin: 24px 0; background-color: #f8fafc; border-radius: 8px; overflow: hidden; border: 1px solid #e2e8f0;">
              <tbody>
                <tr style="border-bottom: 1px solid #e2e8f0;">
                  <td style="padding: 12px 16px; font-size: 13px; color: #64748b; font-weight: 600;">Salário Fixo Mensal</td>
                  <td style="padding: 12px 16px; font-size: 14px; color: #1e293b; font-weight: 700; text-align: right;">${formatCurrency(item.fixedSalary)}</td>
                </tr>
                <tr style="border-bottom: 1px solid #e2e8f0;">
                  <td style="padding: 12px 16px; font-size: 13px; color: #64748b; font-weight: 600;">Comissões Ganhas (${item.itemsCount} faturamentos)</td>
                  <td style="padding: 12px 16px; font-size: 14px; color: #0f766e; font-weight: 700; text-align: right;">${formatCurrency(item.commissionsTotal)}</td>
                </tr>
                <tr style="background-color: #f0fdfa;">
                  <td style="padding: 14px 16px; font-size: 14px; color: #115e59; font-weight: 700;">Remuneração Total Prevista</td>
                  <td style="padding: 14px 16px; font-size: 17px; color: #0f766e; font-weight: 800; text-align: right;">${formatCurrency(item.totalPayable)}</td>
                </tr>
              </tbody>
            </table>

            <p style="font-size: 12px; color: #64748b; line-height: 1.5; margin-top: 24px;">
              Para consultar a relação completa de clientes faturados, alíquotas aplicadas e deduções tributárias detalhadas, acesse o painel de comissões do sistema.
            </p>

            <div style="margin-top: 28px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; text-align: center;">
              Mensagem automática enviada conforme preferências de notificação registradas no sistema.
            </div>
          </div>
        `

        const resendPayload: any = {
          from: `${companyName} <onboarding@resend.dev>`,
          to: item.to,
          subject: item.subject,
          html: htmlBody,
        }

        if (item.cc.length > 0) {
          resendPayload.cc = item.cc
        }

        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(resendPayload),
        })

        if (!res.ok) {
          const errBody = await res.text()
          console.error(`Falha Resend para ${item.to}:`, errBody)
          deliveryResults.push({ to: item.to, status: 'failed', error: errBody })
        } else {
          deliveryResults.push({ to: item.to, status: 'sent' })
        }
      } catch (sendErr: any) {
        console.error(`Exceção no envio para ${item.to}:`, sendErr)
        deliveryResults.push({ to: item.to, status: 'failed', error: sendErr.message })
      }
    }

    const sentCount = deliveryResults.filter((d) => d.status === 'sent').length

    return new Response(
      JSON.stringify({
        success: true,
        message: `${sentCount} de ${emailDispatchPlan.length} relatórios foram enviados por e-mail via Resend.`,
        competenceMonth: competenceText,
        dispatchedCount: sentCount,
        details: deliveryResults,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err: any) {
    console.error('Erro na Edge Function send-reports:', err)
    return new Response(
      JSON.stringify({ success: false, error: err.message || 'Erro interno no servidor.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
