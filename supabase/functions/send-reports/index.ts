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

export interface SummaryRowPayload {
  userId?: string
  sellerName: string
  role: string
  grossTotal: number
  netTotal: number
  commissionTotal: number
  fixedSalary: number
  totalPayable: number
  itemsCount?: number
}

export interface DetailedRowPayload {
  userId?: string
  sellerName: string
  competenceMonth: string
  customerCode: string
  customerName: string
  origin: string
  grossAmount: number
  taxesDeducted: number
  taxDetails?: string
  netAmount: number
  commissionPct: number
  commissionAmount: number
}

export interface FiltersPayload {
  viewType?: 'summary' | 'detailed'
  periodTitle?: string
  originFilter?: string
  selectedUserIds?: string[]
  filteredUserNames?: string[]
  filteredUserLabel?: string
  timeMode?: 'month' | 'period'
  periodStartDate?: string
  periodEndDate?: string
}

export interface TotalsPayload {
  gross: number
  net: number
  taxes: number
  commissions: number
  fixed: number
  grandTotal: number
  billingsCount?: number
}

interface SendReportsRequestBody {
  monthly_run_id?: string
  user_ids?: string[]
  recipients?: ExplicitRecipient[]
  viewType?: 'summary' | 'detailed'
  filters?: FiltersPayload
  summaryRows?: SummaryRowPayload[]
  detailedRows?: DetailedRowPayload[]
  totals?: TotalsPayload
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

    const {
      monthly_run_id,
      user_ids,
      recipients,
      viewType: requestedViewType,
      filters: requestFilters,
      summaryRows: payloadSummaryRows,
      detailedRows: payloadDetailedRows,
      totals: payloadTotals,
    } = body

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
    const companyLogo = settingsData?.company_logo_url || null
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

    const competenceText =
      requestFilters?.periodTitle ||
      (monthlyRun ? formatCompetence(monthlyRun.month_year) : 'Competência Atual')

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

    // 6. Determinar os dados base (se fornecidos pelo payload da tela ou buscados no banco)
    const effectiveViewType: 'summary' | 'detailed' =
      requestedViewType || requestFilters?.viewType || 'summary'

    // Identificação do filtro de usuário aplicado no relatório
    const rawFilteredUserIds = requestFilters?.selectedUserIds || user_ids || []
    const isSingleSellerFiltered = rawFilteredUserIds.length === 1
    const singleFilteredUser = isSingleSellerFiltered ? usersById.get(rawFilteredUserIds[0]) : null

    const reportUserFilterLabel: string =
      requestFilters?.filteredUserLabel ||
      (rawFilteredUserIds.length === 0
        ? 'Todos os vendedores'
        : isSingleSellerFiltered
          ? singleFilteredUser?.name || 'Vendedor selecionado'
          : `${rawFilteredUserIds.map((id) => usersById.get(id)?.name || id).join(', ')}`)

    // Se a tela não enviou summaryRows / detailedRows, montamos a partir do banco
    let dbBillings: any[] = []
    let dbCommissions: any[] = []

    if (
      (!payloadSummaryRows || payloadSummaryRows.length === 0) &&
      (!payloadDetailedRows || payloadDetailedRows.length === 0)
    ) {
      if (monthlyRun) {
        const { data: bData } = await supabase
          .from('billings')
          .select('*, customer:customers(*)')
          .eq('monthly_run_id', monthlyRun.id)
        dbBillings = bData || []

        const { data: cData } = await supabase
          .from('commissions')
          .select('*, billing:billings(*, customer:customers(*))')
        dbCommissions = (cData || []).filter(
          (c: any) => c.billing?.monthly_run_id === monthlyRun.id,
        )
      }
    }

    // Consolidar summaryRows
    const activeSummaryRows: SummaryRowPayload[] =
      payloadSummaryRows && payloadSummaryRows.length > 0
        ? payloadSummaryRows
        : (() => {
            const sellers = allUsersData.filter((u) => u.role !== 'admin')
            const targetSellers =
              rawFilteredUserIds.length > 0
                ? sellers.filter((u) => rawFilteredUserIds.includes(u.id))
                : sellers

            return targetSellers
              .map((u) => {
                const userComms = dbCommissions.filter((c: any) => c.user_id === u.id)
                const commTotal = userComms.reduce(
                  (acc: number, c: any) => acc + (Number(c.commission_amount) || 0),
                  0,
                )
                let userGross = 0
                let userNet = 0
                userComms.forEach((c: any) => {
                  userGross += Number(c.billing?.gross_amount) || 0
                  userNet += Number(c.billing?.net_amount) || 0
                })
                const fixed = Number(u.fixed_salary) || 0
                return {
                  userId: u.id,
                  sellerName: u.name,
                  role: u.role,
                  grossTotal: userGross,
                  netTotal: userNet,
                  commissionTotal: commTotal,
                  fixedSalary: fixed,
                  totalPayable: fixed + commTotal,
                  itemsCount: userComms.length,
                }
              })
              .filter((r) => r.fixedSalary > 0 || r.commissionTotal > 0)
          })()

    // Consolidar detailedRows
    const activeDetailedRows: DetailedRowPayload[] =
      payloadDetailedRows && payloadDetailedRows.length > 0
        ? payloadDetailedRows
        : dbCommissions
            .filter((c: any) => {
              if (rawFilteredUserIds.length > 0 && !rawFilteredUserIds.includes(c.user_id)) {
                return false
              }
              return true
            })
            .map((c: any) => {
              const b = c.billing
              const cust = b?.customer
              const seller = usersById.get(c.user_id)
              const gross = Number(b?.gross_amount) || 0
              const net = Number(b?.net_amount) || 0
              return {
                userId: c.user_id,
                sellerName: seller?.name || 'Vendedor',
                competenceMonth: competenceText,
                customerCode: cust?.customer_code || '-',
                customerName: cust?.name || 'Cliente sem nome',
                origin: cust?.origin || 'outbound',
                grossAmount: gross,
                taxesDeducted: Math.max(0, gross - net),
                netAmount: net,
                commissionPct: Number(c.percentage_applied) || 0,
                commissionAmount: Number(c.commission_amount) || 0,
              }
            })

    // Consolidar totais
    const effectiveTotals = payloadTotals || {
      gross: activeSummaryRows.reduce((acc, r) => acc + (r.grossTotal || 0), 0),
      net: activeSummaryRows.reduce((acc, r) => acc + (r.netTotal || 0), 0),
      taxes: Math.max(
        0,
        activeSummaryRows.reduce((acc, r) => acc + (r.grossTotal || 0), 0) -
          activeSummaryRows.reduce((acc, r) => acc + (r.netTotal || 0), 0),
      ),
      commissions: activeSummaryRows.reduce((acc, r) => acc + (r.commissionTotal || 0), 0),
      fixed: activeSummaryRows.reduce((acc, r) => acc + (r.fixedSalary || 0), 0),
      grandTotal: activeSummaryRows.reduce((acc, r) => acc + (r.totalPayable || 0), 0),
      billingsCount: activeDetailedRows.length,
    }

    // Lista dos nomes dos vendedores apurados
    const distinctSellerNames = Array.from(
      new Set(activeSummaryRows.map((r) => r.sellerName).filter(Boolean)),
    )

    // 7. Dispatch plan items
    interface DispatchItem {
      to: string[]
      cc: string[]
      subject: string
      recipientName: string
      emailType: 'admin_management' | 'seller_statement'
      viewType: 'summary' | 'detailed'
      targetUserId?: string
      // Para visão resumida de gestão
      summaryRows: SummaryRowPayload[]
      // Para visão detalhada
      detailedRows: DetailedRowPayload[]
      // Totais do destinatário ou da gestão
      totals: TotalsPayload
      sellerNamesList: string[]
      userFilterLabel: string
      isSingleSeller: boolean
      singleSellerName?: string
      fixedSalary?: number
      commissionsTotal?: number
      totalPayable?: number
      itemsCount?: number
    }

    const emailDispatchPlan: DispatchItem[] = []
    const hasExplicitRecipients = Array.isArray(recipients) && recipients.length > 0

    const generationDateStr = new Date().toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

    if (hasExplicitRecipients) {
      for (const rec of recipients) {
        const cleanEmail = rec.email?.trim().toLowerCase()
        if (!cleanEmail) continue

        const matchedUser =
          (rec.user_id ? usersById.get(rec.user_id) : null) || usersByEmail.get(cleanEmail)

        const recipientName = rec.name?.trim() || matchedUser?.name || cleanEmail.split('@')[0]
        const userRole = matchedUser?.role || 'custom'

        // Caso A: Admin ou Cópia RH/Financeiro/Custom -> E-mail de GESTÃO refletindo a tela
        // (respeita a visão resumida/detalhada da tela e os filtros aplicados)
        if (
          userRole === 'admin' ||
          rec.kind === 'admin_copy' ||
          rec.kind === 'cc_hr' ||
          rec.kind === 'cc_finance' ||
          rec.kind === 'custom'
        ) {
          const viewLabel = effectiveViewType === 'summary' ? 'Resumo' : 'Detalhamento'
          const subject = `[${companyName}] ${viewLabel} de Gestão - ${competenceText} (Filtro: ${reportUserFilterLabel})`

          emailDispatchPlan.push({
            to: [cleanEmail],
            cc: [],
            subject,
            recipientName,
            emailType: 'admin_management',
            viewType: effectiveViewType,
            summaryRows: activeSummaryRows,
            detailedRows: activeDetailedRows,
            totals: effectiveTotals,
            sellerNamesList: distinctSellerNames,
            userFilterLabel: reportUserFilterLabel,
            isSingleSeller: isSingleSellerFiltered,
            singleSellerName: singleFilteredUser?.name || undefined,
          })
          continue
        }

        // Caso B: Colaborador Comissionado (sales / manager ou kind === 'self')
        // Recebe o extrato dele, também formatado conforme a visão selecionada (resumida ou detalhada)
        if (userRole === 'sales' || userRole === 'manager' || rec.kind === 'self') {
          const sellerId = matchedUser?.id || rec.user_id
          const sellerSummary = activeSummaryRows.find(
            (r) => (sellerId && r.userId === sellerId) || r.sellerName === recipientName,
          )

          // Clientes específicos do vendedor para visão detalhada
          const sellerDetailed = activeDetailedRows.filter(
            (r) => (sellerId && r.userId === sellerId) || r.sellerName === recipientName,
          )

          const commTotal =
            sellerSummary?.commissionTotal ??
            sellerDetailed.reduce((acc, d) => acc + (d.commissionAmount || 0), 0)
          const fixed = sellerSummary?.fixedSalary ?? (Number(matchedUser?.fixed_salary) || 0)
          const totalPay = sellerSummary?.totalPayable ?? fixed + commTotal
          const userGross =
            sellerSummary?.grossTotal ??
            sellerDetailed.reduce((acc, d) => acc + (d.grossAmount || 0), 0)
          const userNet =
            sellerSummary?.netTotal ??
            sellerDetailed.reduce((acc, d) => acc + (d.netAmount || 0), 0)

          const viewLabel =
            effectiveViewType === 'summary' ? 'Extrato Resumido' : 'Extrato Detalhado'
          const subject = `[${companyName}] ${viewLabel} de Comissões - ${competenceText} - ${recipientName}`

          emailDispatchPlan.push({
            to: [cleanEmail],
            cc: [],
            subject,
            recipientName,
            emailType: 'seller_statement',
            viewType: effectiveViewType,
            targetUserId: sellerId,
            summaryRows: sellerSummary ? [sellerSummary] : [],
            detailedRows: sellerDetailed,
            totals: {
              gross: userGross,
              net: userNet,
              taxes: Math.max(0, userGross - userNet),
              commissions: commTotal,
              fixed,
              grandTotal: totalPay,
              billingsCount: sellerDetailed.length,
            },
            sellerNamesList: [recipientName],
            userFilterLabel: recipientName,
            isSingleSeller: true,
            singleSellerName: recipientName,
            fixedSalary: fixed,
            commissionsTotal: commTotal,
            totalPayable: totalPay,
            itemsCount: sellerDetailed.length || sellerSummary?.itemsCount || 0,
          })
          continue
        }
      }
    } else {
      // Fallback modo B (sem destinatários explícitos)
      let targetUsers: any[] = []
      if (user_ids && user_ids.length > 0) {
        targetUsers = allUsersData.filter((u) => user_ids.includes(u.id))
      } else {
        targetUsers = allUsersData.filter((u) => u.role === 'sales' || u.role === 'manager')
      }

      for (const u of targetUsers) {
        const sellerSummary = activeSummaryRows.find((r) => r.userId === u.id)
        const sellerDetailed = activeDetailedRows.filter((r) => r.userId === u.id)
        const commTotal =
          sellerSummary?.commissionTotal ??
          sellerDetailed.reduce((acc, d) => acc + (d.commissionAmount || 0), 0)
        const fixed = sellerSummary?.fixedSalary ?? (Number(u.fixed_salary) || 0)
        const totalPay = fixed + commTotal

        const toList: string[] = []
        if (u.auto_send_report_to_self !== false && u.email) {
          toList.push(u.email)
        }

        const ccList: string[] = []
        if (u.cc_hr && hrEmail) ccList.push(hrEmail)
        if (u.cc_finance && financeEmail) ccList.push(financeEmail)

        if (toList.length === 0 && ccList.length > 0) {
          toList.push(ccList.shift()!)
        }

        if (toList.length > 0) {
          emailDispatchPlan.push({
            to: toList,
            cc: ccList,
            subject: `[${companyName}] Extrato de Comissões - ${competenceText} - ${u.name}`,
            recipientName: u.name,
            emailType: 'seller_statement',
            viewType: effectiveViewType,
            targetUserId: u.id,
            summaryRows: sellerSummary ? [sellerSummary] : [],
            detailedRows: sellerDetailed,
            totals: {
              gross: sellerSummary?.grossTotal || 0,
              net: sellerSummary?.netTotal || 0,
              taxes: Math.max(0, (sellerSummary?.grossTotal || 0) - (sellerSummary?.netTotal || 0)),
              commissions: commTotal,
              fixed,
              grandTotal: totalPay,
              billingsCount: sellerDetailed.length,
            },
            sellerNamesList: [u.name],
            userFilterLabel: u.name,
            isSingleSeller: true,
            singleSellerName: u.name,
            fixedSalary: fixed,
            commissionsTotal: commTotal,
            totalPayable: totalPay,
            itemsCount: sellerDetailed.length,
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
          message: `Modo Simulação: A chave RESEND_API_KEY não foi configurada nos Secrets. O sistema validou os destinatários e preparou o disparo no formato ${effectiveViewType === 'summary' ? 'Resumido' : 'Detalhado'} para ${emailDispatchPlan.length} endereço(s) com sucesso.`,
          competenceMonth: competenceText,
          dispatchedCount: emailDispatchPlan.length,
          fromEmail: senderEmail,
          plan: emailDispatchPlan.map((p) => ({
            recipient: p.recipientName,
            to: p.to,
            cc: p.cc,
            emailType: p.emailType,
            viewType: p.viewType,
            userFilter: p.userFilterLabel,
            totalPayable: formatCurrency(p.totals.grandTotal),
            commissions: formatCurrency(p.totals.commissions),
            fixed: formatCurrency(p.totals.fixed),
          })),
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 9. HTML Template Generators
    // Helpers comuns para estilos inline consistentes e responsivos em clientes de e-mail
    const emailHeaderHtml = (badgeText: string, viewBadgeText: string) => `
      <div style="border-bottom: 2px solid #0f766e; padding-bottom: 16px; margin-bottom: 20px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td>
              <h2 style="color: #0f766e; margin: 0; font-size: 20px; font-weight: 700;">${companyName}</h2>
              <p style="margin: 4px 0 0 0; color: #64748b; font-size: 13px;">Sistema de Comissionamento B2B</p>
            </td>
            <td style="text-align: right; vertical-align: top;">
              <span style="display: inline-block; background-color: #0f766e; color: #ffffff; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">
                ${viewBadgeText}
              </span>
              <div style="margin-top: 4px; font-size: 11px; color: #64748b;">
                ${badgeText}
              </div>
            </td>
          </tr>
        </table>
      </div>
    `

    // Cabeçalho de auditoria com filtro de usuário evidente e separado do remetente
    const auditHeaderBoxHtml = (item: DispatchItem) => `
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px; margin-bottom: 20px; font-size: 12px; color: #334155;">
        <table style="width: 100%; border-collapse: collapse;">
          <tbody>
            <tr style="border-bottom: 1px solid #edf2f7;">
              <td style="padding: 6px 0; color: #64748b; font-weight: 600; width: 150px;">Relatório de:</td>
              <td style="padding: 6px 0; color: #0f766e; font-weight: 800; font-size: 13px;">
                ${item.userFilterLabel}
              </td>
            </tr>
            <tr style="border-bottom: 1px solid #edf2f7;">
              <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Competência / Período:</td>
              <td style="padding: 6px 0; color: #1e293b; font-weight: 700;">${competenceText}</td>
            </tr>
            <tr style="border-bottom: 1px solid #edf2f7;">
              <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Destinatário:</td>
              <td style="padding: 6px 0; color: #1e293b; font-weight: 600;">
                ${item.recipientName} &lt;${item.to.join(', ')}&gt;
              </td>
            </tr>
            <tr style="border-bottom: 1px solid #edf2f7;">
              <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Disparado por:</td>
              <td style="padding: 6px 0; color: #475569;">
                ${callerName}${callerEmail ? ` &lt;${callerEmail}&gt;` : ''} &bull; Gestão de Comissões
              </td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Data de Geração:</td>
              <td style="padding: 6px 0; color: #475569;">${generationDateStr}</td>
            </tr>
          </tbody>
        </table>
      </div>
    `

    const emailFooterHtml = () => `
      <div style="margin-top: 28px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; text-align: center; line-height: 1.5;">
        Este e-mail é um espelho do relatório visualizado no painel do sistema de Comissionamento B2B (${companyName}).<br />
        Geração automática em conformidade com as regras de vigência e perfis de comissionamento.
      </div>
    `

    // Gerador de Tabela Resumida HTML
    const renderSummaryTableHtml = (rows: SummaryRowPayload[], totals: TotalsPayload) => `
      <table style="width: 100%; border-collapse: collapse; margin: 18px 0; font-size: 12px; background-color: #ffffff; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden;">
        <thead>
          <tr style="background-color: #0f766e; color: #ffffff; text-align: left; font-size: 11px; text-transform: uppercase;">
            <th style="padding: 10px 12px; font-weight: 700;">Vendedor / Cargo</th>
            <th style="padding: 10px 12px; text-align: right; font-weight: 700;">Faturamento Bruto</th>
            <th style="padding: 10px 12px; text-align: right; font-weight: 700;">Base Líquida</th>
            <th style="padding: 10px 12px; text-align: right; font-weight: 700;">Comissão</th>
            <th style="padding: 10px 12px; text-align: right; font-weight: 700;">Fixo</th>
            <th style="padding: 10px 12px; text-align: right; font-weight: 700;">Total a Pagar</th>
          </tr>
        </thead>
        <tbody>
          ${
            rows.length === 0
              ? `<tr><td colspan="6" style="padding: 16px; text-align: center; color: #94a3b8;">Nenhum colaborador comissionado encontrado para os filtros selecionados.</td></tr>`
              : rows
                  .map(
                    (r, idx) => `
              <tr style="border-bottom: 1px solid #e2e8f0; background-color: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
                <td style="padding: 10px 12px; font-weight: 700; color: #0f172a;">
                  ${r.sellerName}
                  <span style="display: block; font-size: 10px; color: #64748b; font-weight: 500; text-transform: capitalize;">${r.role}</span>
                </td>
                <td style="padding: 10px 12px; text-align: right; color: #334155;">${formatCurrency(r.grossTotal)}</td>
                <td style="padding: 10px 12px; text-align: right; color: #334155; font-weight: 600;">${formatCurrency(r.netTotal)}</td>
                <td style="padding: 10px 12px; text-align: right; color: #0f766e; font-weight: 700;">${formatCurrency(r.commissionTotal)}</td>
                <td style="padding: 10px 12px; text-align: right; color: #475569;">${formatCurrency(r.fixedSalary)}</td>
                <td style="padding: 10px 12px; text-align: right; color: #0f172a; font-weight: 800; background-color: #f0fdfa;">${formatCurrency(r.totalPayable)}</td>
              </tr>
            `,
                  )
                  .join('')
          }
        </tbody>
        <tfoot>
          <tr style="background-color: #0f172a; color: #ffffff; font-weight: 700; font-size: 12px;">
            <td style="padding: 12px; text-transform: uppercase;">Total Consolidado</td>
            <td style="padding: 12px; text-align: right;">${formatCurrency(totals.gross)}</td>
            <td style="padding: 12px; text-align: right;">${formatCurrency(totals.net)}</td>
            <td style="padding: 12px; text-align: right; color: #5eead4;">${formatCurrency(totals.commissions)}</td>
            <td style="padding: 12px; text-align: right;">${formatCurrency(totals.fixed)}</td>
            <td style="padding: 12px; text-align: right; color: #34d399; font-size: 13px; font-weight: 800;">${formatCurrency(totals.grandTotal)}</td>
          </tr>
        </tfoot>
      </table>
    `

    // Gerador de Tabela Detalhada HTML (linha a linha por cliente)
    const renderDetailedTableHtml = (rows: DetailedRowPayload[], totals: TotalsPayload) => `
      <table style="width: 100%; border-collapse: collapse; margin: 18px 0; font-size: 11px; background-color: #ffffff; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden;">
        <thead>
          <tr style="background-color: #0f766e; color: #ffffff; text-align: left; font-size: 10px; text-transform: uppercase;">
            <th style="padding: 9px 10px; font-weight: 700;">Vendedor</th>
            <th style="padding: 9px 10px; font-weight: 700;">Cliente</th>
            <th style="padding: 9px 10px; text-align: right; font-weight: 700;">Faturamento Bruto</th>
            <th style="padding: 9px 10px; text-align: right; font-weight: 700;">Impostos Abatidos</th>
            <th style="padding: 9px 10px; text-align: right; font-weight: 700;">Base Líquida</th>
            <th style="padding: 9px 10px; text-align: center; font-weight: 700;">% Com.</th>
            <th style="padding: 9px 10px; text-align: right; font-weight: 700;">Comissão</th>
          </tr>
        </thead>
        <tbody>
          ${
            rows.length === 0
              ? `<tr><td colspan="7" style="padding: 16px; text-align: center; color: #94a3b8;">Nenhum detalhamento de cliente encontrado para os filtros selecionados.</td></tr>`
              : rows
                  .map(
                    (r, idx) => `
              <tr style="border-bottom: 1px solid #e2e8f0; background-color: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
                <td style="padding: 8px 10px; font-weight: 600; color: #0f172a;">${r.sellerName}</td>
                <td style="padding: 8px 10px; color: #334155;">
                  <strong style="color: #0f172a;">${r.customerName}</strong>
                  ${r.customerCode && r.customerCode !== '-' ? `<span style="color: #94a3b8; font-size: 10px; display: block;">Cód: ${r.customerCode} &bull; ${r.origin?.toUpperCase()}</span>` : ''}
                </td>
                <td style="padding: 8px 10px; text-align: right; color: #334155;">${formatCurrency(r.grossAmount)}</td>
                <td style="padding: 8px 10px; text-align: right; color: #be123c; font-weight: 500;">
                  ${r.taxesDeducted > 0 ? `-${formatCurrency(r.taxesDeducted)}` : 'R$ 0,00'}
                </td>
                <td style="padding: 8px 10px; text-align: right; color: #0f172a; font-weight: 600;">${formatCurrency(r.netAmount)}</td>
                <td style="padding: 8px 10px; text-align: center; color: #0f766e; font-weight: 700;">${r.commissionPct}%</td>
                <td style="padding: 8px 10px; text-align: right; color: #0f766e; font-weight: 800; background-color: #f0fdfa;">${formatCurrency(r.commissionAmount)}</td>
              </tr>
            `,
                  )
                  .join('')
          }
        </tbody>
        <tfoot>
          <tr style="background-color: #0f172a; color: #ffffff; font-weight: 700; font-size: 11px;">
            <td colspan="2" style="padding: 10px; text-transform: uppercase;">Totais (${rows.length} faturamentos)</td>
            <td style="padding: 10px; text-align: right;">${formatCurrency(totals.gross)}</td>
            <td style="padding: 10px; text-align: right; color: #fca5a5;">-${formatCurrency(totals.taxes)}</td>
            <td style="padding: 10px; text-align: right;">${formatCurrency(totals.net)}</td>
            <td style="padding: 10px; text-align: center;">-</td>
            <td style="padding: 10px; text-align: right; color: #34d399; font-size: 12px; font-weight: 800;">${formatCurrency(totals.commissions)}</td>
          </tr>
        </tfoot>
      </table>
    `

    // Cards de KPI
    const renderKpiCardsHtml = (totals: TotalsPayload, isSingle: boolean, singleName?: string) => `
      <table style="width: 100%; border-collapse: separate; border-spacing: 8px; margin: 16px 0 20px 0;">
        <tr>
          <td style="width: 25%; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; vertical-align: top;">
            <span style="font-size: 10px; color: #64748b; font-weight: 700; text-transform: uppercase;">Faturamento Bruto</span>
            <div style="font-size: 16px; font-weight: 800; color: #0f172a; margin-top: 4px;">${formatCurrency(totals.gross)}</div>
          </td>
          <td style="width: 25%; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; vertical-align: top;">
            <span style="font-size: 10px; color: #64748b; font-weight: 700; text-transform: uppercase;">Base Líquida</span>
            <div style="font-size: 16px; font-weight: 800; color: #0f172a; margin-top: 4px;">${formatCurrency(totals.net)}</div>
          </td>
          <td style="width: 25%; background-color: #f0fdfa; border: 1px solid #ccfbf1; border-radius: 8px; padding: 12px; vertical-align: top;">
            <span style="font-size: 10px; color: #0f766e; font-weight: 700; text-transform: uppercase;">Total Comissões</span>
            <div style="font-size: 16px; font-weight: 800; color: #0f766e; margin-top: 4px;">${formatCurrency(totals.commissions)}</div>
          </td>
          <td style="width: 25%; background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 12px; vertical-align: top;">
            <span style="font-size: 10px; color: #15803d; font-weight: 700; text-transform: uppercase;">Total a Pagar</span>
            <div style="font-size: 16px; font-weight: 800; color: #15803d; margin-top: 4px;">${formatCurrency(totals.grandTotal)}</div>
          </td>
        </tr>
      </table>
    `

    // Template para Gestão (Admins / RH / Financeiro)
    const generateManagementEmailHtml = (item: DispatchItem) => {
      const isSummary = item.viewType === 'summary'
      const viewBadge = isSummary ? 'Visão Resumida' : 'Visão Detalhada'

      // Seção nominal dos vendedores apurados
      const sellersListSection = `
        <div style="background-color: #f1f5f9; border-radius: 8px; padding: 12px 16px; margin: 16px 0; font-size: 12px; color: #475569; border: 1px solid #e2e8f0;">
          <strong style="color: #0f172a; display: block; margin-bottom: 4px;">
            ${item.isSingleSeller ? 'Vendedor Apurado:' : `Comissionados Incluídos no Relatório (${item.sellerNamesList.length}):`}
          </strong>
          <span style="color: #334155; font-weight: 600;">
            ${item.sellerNamesList.length > 0 ? item.sellerNamesList.join(' &bull; ') : 'Nenhum comissionado apurado'}
          </span>
        </div>
      `

      return `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 680px; margin: 0 auto; padding: 24px; color: #1e293b; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px;">
          ${emailHeaderHtml('Cópia de Gestão', viewBadge)}

          <div style="background-color: #f0fdfa; border: 1px solid #ccfbf1; border-radius: 8px; padding: 14px 16px; margin-bottom: 18px;">
            <p style="margin: 0; font-size: 14px; color: #115e59; font-weight: 700;">
              Olá, ${item.recipientName}!
            </p>
            <p style="margin: 4px 0 0 0; font-size: 12px; color: #0f766e; line-height: 1.5;">
              Este é o relatório executivo de comissionamento no formato <strong>${viewBadge}</strong>, referente a <strong>${competenceText}</strong>, filtrado para: <strong>${item.userFilterLabel}</strong>.
            </p>
          </div>

          ${auditHeaderBoxHtml(item)}

          ${renderKpiCardsHtml(item.totals, item.isSingleSeller, item.singleSellerName)}

          ${sellersListSection}

          <div style="margin-top: 10px;">
            <h3 style="font-size: 13px; font-weight: 700; color: #0f172a; text-transform: uppercase; margin: 0 0 8px 0; letter-spacing: 0.5px;">
              ${isSummary ? 'Tabela Resumida por Vendedor' : 'Detalhamento Analítico Linha a Linha por Cliente'}
            </h3>
            ${
              isSummary
                ? renderSummaryTableHtml(item.summaryRows, item.totals)
                : renderDetailedTableHtml(item.detailedRows, item.totals)
            }
          </div>

          <div style="background-color: #f8fafc; border-radius: 8px; padding: 12px 16px; margin-top: 18px; font-size: 12px; color: #64748b; border: 1px solid #e2e8f0;">
            <strong style="color: #0f172a;">Acesso ao Painel:</strong>
            <p style="margin: 4px 0 0 0; line-height: 1.4;">
              Para consultar mais detalhes, auditar notas fiscais ou exportar planilhas em Excel e PDF, acesse o módulo de Relatórios no sistema.
            </p>
          </div>

          ${emailFooterHtml()}
        </div>
      `
    }

    // Template para Extrato Individual do Vendedor
    const generateSellerStatementHtml = (item: DispatchItem) => {
      const isSummary = item.viewType === 'summary'
      const viewBadge = isSummary ? 'Extrato Resumido' : 'Extrato Detalhado'

      return `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 680px; margin: 0 auto; padding: 24px; color: #1e293b; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px;">
          ${emailHeaderHtml('Extrato Individual', viewBadge)}

          <div style="background-color: #f0fdfa; border: 1px solid #ccfbf1; border-radius: 8px; padding: 14px 16px; margin-bottom: 18px;">
            <p style="margin: 0; font-size: 14px; color: #115e59; font-weight: 700;">
              Olá, ${item.recipientName}!
            </p>
            <p style="margin: 4px 0 0 0; font-size: 12px; color: #0f766e; line-height: 1.5;">
              O fechamento de comissões referente a <strong>${competenceText}</strong> foi concluído. Abaixo você confere o seu demonstrativo individual no formato <strong>${viewBadge}</strong>.
            </p>
          </div>

          ${auditHeaderBoxHtml(item)}

          <!-- Card de Remuneração -->
          <table style="width: 100%; border-collapse: collapse; margin: 18px 0; background-color: #f8fafc; border-radius: 8px; overflow: hidden; border: 1px solid #e2e8f0;">
            <tbody>
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 12px 16px; font-size: 13px; color: #64748b; font-weight: 600;">Salário Fixo Mensal</td>
                <td style="padding: 12px 16px; font-size: 14px; color: #1e293b; font-weight: 700; text-align: right;">${formatCurrency(item.fixedSalary || 0)}</td>
              </tr>
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 12px 16px; font-size: 13px; color: #64748b; font-weight: 600;">Comissões Ganhas (${item.itemsCount || 0} faturamento(s))</td>
                <td style="padding: 12px 16px; font-size: 14px; color: #0f766e; font-weight: 700; text-align: right;">${formatCurrency(item.commissionsTotal || 0)}</td>
              </tr>
              <tr style="background-color: #f0fdfa;">
                <td style="padding: 14px 16px; font-size: 14px; color: #115e59; font-weight: 700;">Remuneração Total Prevista</td>
                <td style="padding: 14px 16px; font-size: 17px; color: #0f766e; font-weight: 800; text-align: right;">${formatCurrency(item.totalPayable || 0)}</td>
              </tr>
            </tbody>
          </table>

          <!-- Seção de tabela (se detalhada, mostra linha a linha dos clientes do vendedor) -->
          ${
            !isSummary && item.detailedRows.length > 0
              ? `
              <div style="margin-top: 16px;">
                <h3 style="font-size: 12px; font-weight: 700; color: #0f172a; text-transform: uppercase; margin: 0 0 8px 0; letter-spacing: 0.5px;">
                  Detalhamento de Clientes Faturados (${item.detailedRows.length})
                </h3>
                ${renderDetailedTableHtml(item.detailedRows, item.totals)}
              </div>
            `
              : ''
          }

          <div style="background-color: #f8fafc; border-radius: 8px; padding: 12px 16px; margin-top: 16px; font-size: 12px; color: #64748b; border: 1px solid #e2e8f0;">
            <p style="margin: 0; line-height: 1.5;">
              Para consultar alíquotas aplicadas, clientes faturados e deduções fiscais completas, acesse o painel de comissões do sistema.
            </p>
          </div>

          ${emailFooterHtml()}
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
          item.emailType === 'seller_statement'
            ? generateSellerStatementHtml(item)
            : generateManagementEmailHtml(item)

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

    const viewTypePortuguese = effectiveViewType === 'summary' ? 'Resumido' : 'Detalhado'

    return new Response(
      JSON.stringify({
        success: true,
        message: `${sentCount} de ${emailDispatchPlan.length} relatórios foram enviados por e-mail no formato ${viewTypePortuguese} via Resend.`,
        competenceMonth: competenceText,
        dispatchedCount: sentCount,
        viewType: effectiveViewType,
        userFilter: reportUserFilterLabel,
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
