import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

export type RecipientKind = 'self' | 'cc_hr' | 'cc_finance' | 'admin_copy' | 'custom'

export interface ExplicitRecipient {
  user_id?: string
  email: string
  name?: string
  kind: RecipientKind
}

interface SendReportsRequestBody {
  monthly_run_id?: string
  user_ids?: string[]
  recipients?: ExplicitRecipient[]
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    const resendFromEmailEnv = Deno.env.get('RESEND_FROM_EMAIL')?.trim()
    const senderEmail = resendFromEmailEnv || 'onboarding@resend.dev'

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

    // 1. Validação de JWT do chamador (admin ou manager)
    const authHeader = req.headers.get('Authorization') ?? ''
    if (!authHeader) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Autorização necessária. Cabeçalho de autenticação ausente.',
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const authVerificationClient = createClient(supabaseUrl, anonKey || supabaseServiceKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const {
      data: { user: callerAuthUser },
      error: callerAuthErr,
    } = await authVerificationClient.auth.getUser()

    if (callerAuthErr || !callerAuthUser) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Sessão do usuário inválida ou expirada. Faça login novamente.',
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Service client para operações privilegiadas
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Checar perfil do chamador
    const { data: callerProfile } = await supabase
      .from('users')
      .select('id, name, email, role')
      .eq('id', callerAuthUser.id)
      .maybeSingle()

    if (!callerProfile || (callerProfile.role !== 'admin' && callerProfile.role !== 'manager')) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Acesso negado. Apenas administradores e gestores podem disparar relatórios.',
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const callerName =
      callerProfile.name?.trim() || callerProfile.email || 'Administrador do Sistema'
    const callerEmail = callerProfile.email?.trim() || ''

    // 2. Parse request payload
    let body: SendReportsRequestBody = {}
    try {
      body = await req.json()
    } catch {
      // Body may be empty
    }

    const { monthly_run_id, user_ids, recipients } = body

    // 3. Fetch system_settings (company_name, hr_email, finance_email, logo)
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

    // 4. Fetch monthly run
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

    // 5. Fetch all users from users table for reference & role lookup
    const { data: allUsersData, error: allUsersError } = await supabase.from('users').select('*')
    if (allUsersError || !allUsersData) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Falha ao buscar usuários do sistema.',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const usersById = new Map<string, any>()
    const usersByEmail = new Map<string, any>()
    for (const u of allUsersData) {
      if (u.id) usersById.set(u.id, u)
      if (u.email) usersByEmail.set(u.email.toLowerCase().trim(), u)
    }

    // 6. Fetch commissions and billings for this monthly run
    const { data: billingsData } = await supabase
      .from('billings')
      .select('*, customer:customers(*)')
      .eq('monthly_run_id', monthlyRun.id)

    const runBillings = billingsData || []
    const totalCompanyGross = runBillings.reduce(
      (acc: number, b: any) => acc + (Number(b.gross_amount) || 0),
      0,
    )
    const totalCompanyNet = runBillings.reduce(
      (acc: number, b: any) => acc + (Number(b.net_amount) || 0),
      0,
    )

    const { data: commissionsData } = await supabase
      .from('commissions')
      .select('*, billing:billings(*, customer:customers(*))')

    const runCommissions = (commissionsData || []).filter(
      (c: any) => c.billing?.monthly_run_id === monthlyRun.id,
    )
    const totalCompanyCommissions = runCommissions.reduce(
      (acc: number, c: any) => acc + (Number(c.commission_amount) || 0),
      0,
    )

    // Distinct sellers receiving commissions
    const distinctSellerIds = new Set(runCommissions.map((c: any) => c.user_id).filter(Boolean))

    // 7. Dispatch plan items
    interface DispatchItem {
      to: string[]
      cc: string[]
      subject: string
      recipientName: string
      emailType: 'commission_statement' | 'admin_summary' | 'custom_notification'
      fixedSalary?: number
      commissionsTotal?: number
      totalPayable?: number
      itemsCount?: number
      // Admin summary payload
      summaryData?: {
        totalGross: number
        totalNet: number
        totalCommissions: number
        totalBillings: number
        totalCollaborators: number
      }
    }

    const emailDispatchPlan: DispatchItem[] = []

    const hasExplicitRecipients = Array.isArray(recipients) && recipients.length > 0

    if (hasExplicitRecipients) {
      // -------------------------------------------------------------------------
      // MODO A: LISTA EXPLÍCITA DE DESTINATÁRIOS (Selecionados no Dialog)
      // -------------------------------------------------------------------------
      for (const rec of recipients) {
        const cleanEmail = rec.email?.trim().toLowerCase()
        if (!cleanEmail) continue

        const matchedUser =
          (rec.user_id ? usersById.get(rec.user_id) : null) || usersByEmail.get(cleanEmail)

        const recipientName = rec.name?.trim() || matchedUser?.name || cleanEmail.split('@')[0]
        const userRole = matchedUser?.role || 'custom'

        // Caso 1: Admin na lista ou kind === 'admin_copy'
        // -> Cópia de gestão (resumo do período com os totais consolidados e link do sistema)
        if (userRole === 'admin' || rec.kind === 'admin_copy') {
          emailDispatchPlan.push({
            to: [cleanEmail],
            cc: [],
            subject: `[${companyName}] Resumo de Gestão - Fechamento ${competenceText}`,
            recipientName,
            emailType: 'admin_summary',
            summaryData: {
              totalGross: totalCompanyGross,
              totalNet: totalCompanyNet,
              totalCommissions: totalCompanyCommissions,
              totalBillings: runBillings.length,
              totalCollaborators: distinctSellerIds.size,
            },
          })
          continue
        }

        // Caso 2: Colaborador comissionado (sales / manager ou kind === 'self')
        if (userRole === 'sales' || userRole === 'manager' || rec.kind === 'self') {
          const userComms = runCommissions.filter((c: any) => c.user_id === matchedUser?.id)
          const commTotal = userComms.reduce(
            (acc: number, c: any) => acc + (Number(c.commission_amount) || 0),
            0,
          )
          const fixed = Number(matchedUser?.fixed_salary) || 0
          const totalPay = fixed + commTotal

          emailDispatchPlan.push({
            to: [cleanEmail],
            cc: [],
            subject: `[${companyName}] Extrato de Comissões - ${competenceText} - ${recipientName}`,
            recipientName,
            emailType: 'commission_statement',
            fixedSalary: fixed,
            commissionsTotal: commTotal,
            totalPayable: totalPay,
            itemsCount: userComms.length,
          })
          continue
        }

        // Caso 3: Cópia RH ou Cópia Financeiro (sem user específico ou genérico)
        if (rec.kind === 'cc_hr' || rec.kind === 'cc_finance') {
          emailDispatchPlan.push({
            to: [cleanEmail],
            cc: [],
            subject: `[${companyName}] Cópia de Fechamento de Comissões - ${competenceText}`,
            recipientName,
            emailType: 'admin_summary',
            summaryData: {
              totalGross: totalCompanyGross,
              totalNet: totalCompanyNet,
              totalCommissions: totalCompanyCommissions,
              totalBillings: runBillings.length,
              totalCollaborators: distinctSellerIds.size,
            },
          })
          continue
        }

        // Caso 4: Custom / Destinatário Avulso
        emailDispatchPlan.push({
          to: [cleanEmail],
          cc: [],
          subject: `[${companyName}] Relatório de Comissionamento - ${competenceText}`,
          recipientName,
          emailType: 'admin_summary',
          summaryData: {
            totalGross: totalCompanyGross,
            totalNet: totalCompanyNet,
            totalCommissions: totalCompanyCommissions,
            totalBillings: runBillings.length,
            totalCollaborators: distinctSellerIds.size,
          },
        })
      }
    } else {
      // -------------------------------------------------------------------------
      // MODO B: COMPATIBILIDADE / FALLBACK (Derivado das preferências)
      // -------------------------------------------------------------------------
      let targetUsers: any[] = []
      if (user_ids && user_ids.length > 0) {
        targetUsers = allUsersData.filter((u) => user_ids.includes(u.id))
      } else {
        targetUsers = allUsersData.filter((u) => u.role === 'sales' || u.role === 'manager')
      }

      if (targetUsers.length === 0) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Nenhum colaborador encontrado para receber os relatórios.',
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      for (const u of targetUsers) {
        const userComms = runCommissions.filter((c: any) => c.user_id === u.id)
        const commTotal = userComms.reduce(
          (acc: number, c: any) => acc + (Number(c.commission_amount) || 0),
          0,
        )
        const fixed = Number(u.fixed_salary) || 0
        const totalPay = fixed + commTotal

        const autoSend = u.auto_send_report_to_self !== false
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

        if (toList.length === 0 && ccList.length > 0) {
          toList.push(ccList.shift()!)
        }

        if (toList.length > 0) {
          emailDispatchPlan.push({
            to: toList,
            cc: ccList,
            subject: `[${companyName}] Extrato de Comissões - ${competenceText} - ${u.name}`,
            recipientName: u.name,
            emailType: 'commission_statement',
            fixedSalary: fixed,
            commissionsTotal: commTotal,
            totalPayable: totalPay,
            itemsCount: userComms.length,
          })
        }
      }
    }

    if (emailDispatchPlan.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Nenhum destinatário válido selecionado para o envio.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 8. Graceful execution check: Is RESEND_API_KEY configured?
    if (!resendApiKey) {
      console.warn(
        'RESEND_API_KEY não está configurada no ambiente. Simulação de envio realizada com sucesso.',
      )
      return new Response(
        JSON.stringify({
          success: true,
          simulated: true,
          message: `Modo Simulação: A chave RESEND_API_KEY não foi configurada nos Secrets. O sistema validou os destinatários e preparou o disparo para ${emailDispatchPlan.length} endereço(s) com sucesso.`,
          competenceMonth: competenceText,
          dispatchedCount: emailDispatchPlan.length,
          fromEmail: senderEmail,
          plan: emailDispatchPlan.map((p) => ({
            recipient: p.recipientName,
            to: p.to,
            cc: p.cc,
            emailType: p.emailType,
            totalPayable: p.totalPayable ? formatCurrency(p.totalPayable) : undefined,
            commissions: p.commissionsTotal ? formatCurrency(p.commissionsTotal) : undefined,
            fixed: p.fixedSalary ? formatCurrency(p.fixedSalary) : undefined,
          })),
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 9. Template HTML Generators
    const generateStatementHtml = (item: DispatchItem) => `
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
              <td style="padding: 12px 16px; font-size: 14px; color: #1e293b; font-weight: 700; text-align: right;">${formatCurrency(item.fixedSalary || 0)}</td>
            </tr>
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 12px 16px; font-size: 13px; color: #64748b; font-weight: 600;">Comissões Ganhas (${item.itemsCount || 0} faturamentos)</td>
              <td style="padding: 12px 16px; font-size: 14px; color: #0f766e; font-weight: 700; text-align: right;">${formatCurrency(item.commissionsTotal || 0)}</td>
            </tr>
            <tr style="background-color: #f0fdfa;">
              <td style="padding: 14px 16px; font-size: 14px; color: #115e59; font-weight: 700;">Remuneração Total Prevista</td>
              <td style="padding: 14px 16px; font-size: 17px; color: #0f766e; font-weight: 800; text-align: right;">${formatCurrency(item.totalPayable || 0)}</td>
            </tr>
          </tbody>
        </table>

        <div style="background-color: #f8fafc; border-radius: 8px; padding: 12px 16px; margin: 16px 0; font-size: 12px; color: #64748b; border: 1px solid #e2e8f0;">
          <p style="margin: 0; line-height: 1.5;">
            <strong>Disparado por:</strong> ${callerName}${callerEmail ? ` (${callerEmail})` : ''} &bull; Gestão de Comissões
          </p>
        </div>

        <p style="font-size: 12px; color: #64748b; line-height: 1.5; margin-top: 20px;">
          Para consultar a relação completa de clientes faturados, alíquotas aplicadas e deduções tributárias detalhadas, acesse o painel de comissões do sistema.
        </p>

        <div style="margin-top: 28px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; text-align: center;">
          Mensagem automática enviada pelo sistema de Comissionamento B2B.
        </div>
      </div>
    `

    const generateAdminSummaryHtml = (item: DispatchItem) => {
      const sum = item.summaryData || {
        totalGross: 0,
        totalNet: 0,
        totalCommissions: 0,
        totalBillings: 0,
        totalCollaborators: 0,
      }
      return `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px;">
          <div style="border-bottom: 2px solid #0f766e; padding-bottom: 16px; margin-bottom: 20px;">
            <h2 style="color: #0f766e; margin: 0; font-size: 20px;">${companyName}</h2>
            <p style="margin: 4px 0 0 0; color: #64748b; font-size: 13px;">Cópia de Gestão &bull; Fechamento Mensal</p>
          </div>

          <div style="background-color: #f0fdfa; border: 1px solid #ccfbf1; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px;">
            <p style="margin: 0; font-size: 14px; color: #115e59; font-weight: 700;">
              Olá, ${item.recipientName}!
            </p>
            <p style="margin: 4px 0 0 0; font-size: 12px; color: #0f766e;">
              Este é o seu resumo executivo de gestão com os totais apurados no fechamento de <strong>${competenceText}</strong>.
            </p>
          </div>

          <!-- Identificação de Destinatário e Remetente -->
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
            <tbody>
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 8px 14px; color: #64748b; font-weight: 600; width: 140px;">Destinatário (Gestão):</td>
                <td style="padding: 8px 14px; color: #1e293b; font-weight: 600;">${item.recipientName} &lt;${item.to.join(', ')}&gt;</td>
              </tr>
              <tr>
                <td style="padding: 8px 14px; color: #64748b; font-weight: 600;">Disparado por:</td>
                <td style="padding: 8px 14px; color: #1e293b; font-weight: 600;">${callerName}${callerEmail ? ` &lt;${callerEmail}&gt;` : ''}</td>
              </tr>
            </tbody>
          </table>

          <table style="width: 100%; border-collapse: collapse; margin: 24px 0; background-color: #f8fafc; border-radius: 8px; overflow: hidden; border: 1px solid #e2e8f0;">
            <tbody>
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 12px 16px; font-size: 13px; color: #64748b; font-weight: 600;">Faturamento Bruto da Empresa</td>
                <td style="padding: 12px 16px; font-size: 14px; color: #1e293b; font-weight: 700; text-align: right;">${formatCurrency(sum.totalGross)}</td>
              </tr>
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 12px 16px; font-size: 13px; color: #64748b; font-weight: 600;">Base Líquida Faturada</td>
                <td style="padding: 12px 16px; font-size: 14px; color: #1e293b; font-weight: 700; text-align: right;">${formatCurrency(sum.totalNet)}</td>
              </tr>
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 12px 16px; font-size: 13px; color: #64748b; font-weight: 600;">Faturamentos Processados</td>
                <td style="padding: 12px 16px; font-size: 14px; color: #1e293b; font-weight: 700; text-align: right;">${sum.totalBillings} notas</td>
              </tr>
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 12px 16px; font-size: 13px; color: #64748b; font-weight: 600;">Colaboradores Comissionados</td>
                <td style="padding: 12px 16px; font-size: 14px; color: #1e293b; font-weight: 700; text-align: right;">${sum.totalCollaborators} pessoa(s)</td>
              </tr>
              <tr style="background-color: #f0fdfa;">
                <td style="padding: 14px 16px; font-size: 14px; color: #115e59; font-weight: 700;">Total de Comissões Apuradas</td>
                <td style="padding: 14px 16px; font-size: 17px; color: #0f766e; font-weight: 800; text-align: right;">${formatCurrency(sum.totalCommissions)}</td>
              </tr>
            </tbody>
          </table>

          <div style="background-color: #f1f5f9; border-radius: 8px; padding: 14px 16px; margin-top: 16px; font-size: 13px; color: #475569;">
            <p style="margin: 0 0 8px 0; font-weight: 600; color: #0f172a;">Acesso ao Sistema:</p>
            <p style="margin: 0; line-height: 1.4;">
              Para visualizar o detalhamento individual de colaboradores, exportar em Excel/PDF ou auditar as deduções fiscais, acesse o painel de relatórios do sistema.
            </p>
          </div>

          <div style="margin-top: 28px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; text-align: center;">
            Cópia de controle e gestão enviada automaticamente pelo sistema de Comissionamento B2B.
          </div>
        </div>
      `
    }
    // 10. Live Resend API delivery
    const deliveryResults: Array<{
      to: string[]
      status: 'sent' | 'failed'
      friendlyError?: string
      rawError?: string
      error?: string
    }> = []

    const fromAddress = `${companyName} <${senderEmail}>`

    const mapToFriendlyError = (raw: string, statusCode?: number): string => {
      const lower = raw.toLowerCase()

      if (
        lower.includes('requires net access') ||
        lower.includes('permissiondenied') ||
        lower.includes('network permission')
      ) {
        return 'A função não tem permissão de rede para chamar a API do Resend.'
      }

      if (
        statusCode === 403 ||
        lower.includes('you can only send testing emails') ||
        lower.includes('domain not verified') ||
        lower.includes('verify a domain') ||
        lower.includes('only send testing emails to your own email address') ||
        (lower.includes('validation_error') && lower.includes('domain'))
      ) {
        return 'O Resend bloqueou o envio: o remetente onboarding@resend.dev só permite e-mails de teste para o próprio e-mail da conta Resend. Verifique um domínio no painel do Resend e cadastre o secret RESEND_FROM_EMAIL.'
      }

      if (
        statusCode === 401 ||
        lower.includes('invalid api key') ||
        lower.includes('unauthorized')
      ) {
        return 'Chave RESEND_API_KEY inválida ou não autorizada no Resend. Verifique o secret configurado no Supabase.'
      }

      if (statusCode === 429 || lower.includes('rate limit')) {
        return 'Limite de taxa de envio excedido no Resend (rate limit). Aguarde alguns instantes antes de reenviar.'
      }

      if (lower.includes('invalid recipient') || lower.includes('to parameter')) {
        return 'Endereço de e-mail do destinatário inválido ou ausente.'
      }

      return `Falha no envio via Resend: ${raw.slice(0, 200)}`
    }

    for (const item of emailDispatchPlan) {
      try {
        const htmlBody =
          item.emailType === 'commission_statement'
            ? generateStatementHtml(item)
            : generateAdminSummaryHtml(item)

        const resendPayload: any = {
          from: fromAddress,
          to: item.to,
          subject: item.subject,
          html: htmlBody,
        }

        if (item.cc && item.cc.length > 0) {
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
          console.error(`Falha Resend para ${item.to.join(', ')} (status ${res.status}):`, errBody)
          const friendly = mapToFriendlyError(errBody, res.status)
          deliveryResults.push({
            to: item.to,
            status: 'failed',
            friendlyError: friendly,
            rawError: errBody,
            error: friendly,
          })
        } else {
          deliveryResults.push({ to: item.to, status: 'sent' })
        }
      } catch (sendErr: any) {
        const rawErrMsg = sendErr?.message || String(sendErr)
        console.error(`Exceção no envio para ${item.to.join(', ')}:`, sendErr)
        const friendly = mapToFriendlyError(rawErrMsg)
        deliveryResults.push({
          to: item.to,
          status: 'failed',
          friendlyError: friendly,
          rawError: rawErrMsg,
          error: friendly,
        })
      }
    }

    const sentCount = deliveryResults.filter((d) => d.status === 'sent').length
    const failedDeliveries = deliveryResults.filter((d) => d.status === 'failed')

    const summarizedErrors = failedDeliveries.map((f) => ({
      recipient: f.to.join(', '),
      message: f.friendlyError || f.error || 'Falha no envio do e-mail.',
      rawError: f.rawError,
    }))

    return new Response(
      JSON.stringify({
        success: true,
        message: `${sentCount} de ${emailDispatchPlan.length} relatórios foram enviados por e-mail via Resend.`,
        competenceMonth: competenceText,
        dispatchedCount: sentCount,
        fromEmail: senderEmail,
        errors: summarizedErrors,
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
