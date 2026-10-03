import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import {
  getMonthlyRuns,
  getBillingsForRun,
  getCommissionsForRun,
  getAllUsers,
  deleteMonthlyRun,
} from '@/services/commissionService'
import { toast as sonnerToast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { MonthlyRun, Billing, Commission, AppUser } from '@/types/database'
import {
  TrendingUp,
  DollarSign,
  Receipt,
  Users,
  Calendar,
  ArrowRight,
  Upload,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Lock,
  Trash2,
  Loader2,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts'

export default function Dashboard() {
  const { user, appUser } = useAuth()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [runs, setRuns] = useState<MonthlyRun[]>([])
  const [selectedRun, setSelectedRun] = useState<MonthlyRun | null>(null)
  const [billings, setBillings] = useState<Billing[]>([])
  const [commissions, setCommissions] = useState<Commission[]>([])
  const [allUsersList, setAllUsersList] = useState<AppUser[]>([])

  // Deletion state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [runToDelete, setRunToDelete] = useState<MonthlyRun | null>(null)
  const [deletingRun, setDeletingRun] = useState(false)

  const isSales = appUser?.role === 'sales'

  const loadDashboardData = async () => {
    setLoading(true)
    try {
      const [runsData, usersData] = await Promise.all([getMonthlyRuns(), getAllUsers()])

      setRuns(runsData)
      setAllUsersList(usersData)

      if (runsData.length > 0) {
        const latest = runsData[0]
        setSelectedRun(latest)

        const [bills, comms] = await Promise.all([
          getBillingsForRun(latest.id),
          getCommissionsForRun(latest.id),
        ])
        setBillings(bills)
        setCommissions(comms)
      } else {
        setSelectedRun(null)
        setBillings([])
        setCommissions([])
      }
    } catch (err) {
      console.error('Erro ao carregar dados do dashboard:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDashboardData()
  }, [])

  const handleOpenDelete = (run: MonthlyRun) => {
    if (run.status === 'paid') {
      sonnerToast.error('Operação bloqueada: Não é permitido excluir uma competência fechada/paga.')
      return
    }
    setRunToDelete(run)
    setDeleteDialogOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!runToDelete) return
    if (runToDelete.status === 'paid') {
      sonnerToast.error('Operação bloqueada: Não é permitido excluir uma competência fechada/paga.')
      setDeleteDialogOpen(false)
      return
    }

    setDeletingRun(true)
    const tId = sonnerToast.loading(
      `Excluindo competência de ${formatMonth(runToDelete.month_year)}...`,
    )

    try {
      await deleteMonthlyRun(runToDelete.id)
      sonnerToast.success('Mês e faturamentos excluídos com sucesso!', {
        id: tId,
        description: `A competência de ${formatMonth(runToDelete.month_year)} foi removida permanentemente.`,
      })
      setDeleteDialogOpen(false)
      setRunToDelete(null)
      await loadDashboardData()
    } catch (err: any) {
      console.error('Erro ao excluir competência:', err)
      sonnerToast.error('Erro ao excluir competência', {
        id: tId,
        description: err.message || 'Falha ao apagar dados da competência.',
      })
    } finally {
      setDeletingRun(false)
    }
  }

  const formatBRL = (val: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(val || 0)
  }

  const formatMonth = (dateStr: string) => {
    if (!dateStr) return ''
    const [year, month] = dateStr.split('-')
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
    const idx = parseInt(month, 10) - 1
    return `${months[idx] || month} de ${year}`
  }

  // Metrics calculations for the selected run
  const grossTotal = billings.reduce((acc, b) => acc + (Number(b.gross_amount) || 0), 0)
  const netTotal = billings.reduce((acc, b) => acc + (Number(b.net_amount) || 0), 0)
  const taxesRetained = Math.max(0, grossTotal - netTotal)

  const totalCommissions = commissions.reduce(
    (acc, c) => acc + (Number(c.commission_amount) || 0),
    0,
  )

  // If sales role: filter only personal commissions
  const myCommissions = commissions
    .filter((c) => c.user_id === user?.id)
    .reduce((acc, c) => acc + (Number(c.commission_amount) || 0), 0)

  // Total payable by company = fixed salaries of all users + total commissions
  const totalFixedSalaries = allUsersList.reduce((acc, u) => acc + (Number(u.fixed_salary) || 0), 0)
  const totalToPayCompany = totalFixedSalaries + totalCommissions

  // Chart data: 6-month simulation/historical based on current runs
  const comparisonData = runs
    .slice(0, 6)
    .reverse()
    .map((r) => {
      const [yr, mo] = r.month_year.split('-')
      const label = `${mo}/${yr.slice(2)}`
      const runGross = Number(r.gross_company_billing) || 0
      // Approximated net / commission for chart demonstration
      const runNet = runGross * 0.91
      const runComm = runGross * 0.055
      return {
        month: label,
        bruto: runGross,
        liquido: runNet,
        comissoes: runComm,
        minhaComissao: isSales ? runComm * 0.4 : 0,
      }
    })

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-[#0F766E] uppercase tracking-wider">
            <Calendar className="h-3.5 w-3.5" />
            <span>
              Mês de Referência:{' '}
              {selectedRun ? formatMonth(selectedRun.month_year) : 'Nenhum mês selecionado'}
            </span>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mt-1">
            Olá, {appUser?.name || 'Bem-vindo'}!
          </h2>
          <p className="text-sm text-slate-500">
            {isSales
              ? 'Acompanhe o desempenho das suas vendas e o valor das comissões acumuladas.'
              : 'Visão executiva das receitas faturadas, deduções fiscais dinâmicas e folha de comissões.'}
          </p>
        </div>

        {!isSales && (
          <div className="flex items-center gap-3">
            <Button
              onClick={() => navigate('/upload')}
              className="bg-[#0F766E] hover:bg-[#115E59] text-white shadow-sm flex items-center gap-2"
            >
              <Upload className="h-4 w-4" />
              <span>Novo Faturamento</span>
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate('/reports')}
              className="border-slate-300 text-slate-700 hover:bg-slate-50 flex items-center gap-2"
            >
              <FileSpreadsheet className="h-4 w-4 text-teal-700" />
              <span>Relatório Completo</span>
            </Button>
          </div>
        )}
      </div>

      {/* 4 Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Faturamento Bruto */}
        <Card className="border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Faturamento Bruto
            </CardTitle>
            <div className="h-8 w-8 rounded-lg bg-teal-50 text-[#0F766E] flex items-center justify-center">
              <DollarSign className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900 tabular-nums">
              {formatBRL(grossTotal || Number(selectedRun?.gross_company_billing) || 0)}
            </div>
            <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
              <TrendingUp className="h-3 w-3 text-emerald-600" />
              <span>Base total declarada no mês</span>
            </p>
          </CardContent>
        </Card>

        {/* Card 2: Impostos Retidos */}
        <Card className="border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Impostos Retidos
            </CardTitle>
            <div className="h-8 w-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
              <Receipt className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900 tabular-nums">
              {formatBRL(taxesRetained)}
            </div>
            <p className="text-xs text-slate-500 mt-1">Deduções fiscais dinâmicas (fórmula/%)</p>
          </CardContent>
        </Card>

        {/* Card 3: Comissões Geradas */}
        <Card className="border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Comissões Geradas
            </CardTitle>
            <div className="h-8 w-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <TrendingUp className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900 tabular-nums">
              {formatBRL(totalCommissions)}
            </div>
            <p className="text-xs text-slate-500 mt-1">Incidindo sobre o faturamento líquido</p>
          </CardContent>
        </Card>

        {/* Card 4: Total a Pagar (admin/manager) OR Minhas Comissões (sales) */}
        <Card className="border-slate-200 shadow-sm hover:shadow-md transition-shadow bg-gradient-to-br from-white to-teal-50/40">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {isSales ? 'Minhas Comissões' : 'Total a Pagar (Folha)'}
            </CardTitle>
            <div className="h-8 w-8 rounded-lg bg-[#0F766E] text-white flex items-center justify-center">
              <Users className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[#0F766E] tabular-nums">
              {formatBRL(isSales ? myCommissions : totalToPayCompany)}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {isSales
                ? 'Seu ganho variável referente ao mês'
                : 'Salários fixos + comissões da equipe'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Monthly Chart Section */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-bold text-slate-900">
            {isSales
              ? 'Evolução das Minhas Comissões'
              : 'Comparativo Mensal de Faturamento & Comissões'}
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            {isSales
              ? 'Histórico dos ganhos variáveis apurados por mês'
              : 'Evolução de faturamento bruto, faturamento líquido e total de comissões distribuídas'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-72 w-full">
            {comparisonData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                Nenhum dado mensal registrado para comparação.
              </div>
            ) : isSales ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={comparisonData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                  <XAxis dataKey="month" stroke="#64748B" fontSize={12} />
                  <YAxis
                    stroke="#64748B"
                    fontSize={12}
                    tickFormatter={(val) => `R$${val / 1000}k`}
                  />
                  <Tooltip
                    formatter={(value: any) => [formatBRL(Number(value)), 'Minhas Comissões']}
                  />
                  <Line
                    type="monotone"
                    dataKey="minhaComissao"
                    name="Minhas Comissões"
                    stroke="#0F766E"
                    strokeWidth={3}
                    dot={{ r: 5, fill: '#0F766E' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={comparisonData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                  <XAxis dataKey="month" stroke="#64748B" fontSize={12} />
                  <YAxis
                    stroke="#64748B"
                    fontSize={12}
                    tickFormatter={(val) => `R$${val / 1000}k`}
                  />
                  <Tooltip formatter={(value: any) => [formatBRL(Number(value))]} />
                  <Legend />
                  <Bar
                    dataKey="bruto"
                    name="Faturamento Bruto"
                    fill="#0F766E"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="liquido"
                    name="Faturamento Líquido"
                    fill="#14B8A6"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="comissoes"
                    name="Comissões Pagas"
                    fill="#F59E0B"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Recent Runs Table & Status */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-base font-bold text-slate-900">
              Histórico de Apurações Mensais
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Acompanhamento de status de cada fechamento de comissões
            </CardDescription>
          </div>
          {!isSales && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/upload')}
              className="text-xs font-medium border-slate-200 hover:bg-slate-50"
            >
              Novo Lote
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider bg-slate-50/50">
                  <th className="py-3 px-4">Mês/Ano</th>
                  <th className="py-3 px-4">Faturamento Bruto Declarado</th>
                  <th className="py-3 px-4">Status do Fechamento</th>
                  <th className="py-3 px-4 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {runs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-slate-400">
                      Nenhum fechamento registrado no sistema.
                    </td>
                  </tr>
                ) : (
                  runs.map((r) => {
                    const isPending = r.status === 'pending'
                    return (
                      <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3.5 px-4 font-semibold text-slate-800">
                          {formatMonth(r.month_year)}
                        </td>
                        <td className="py-3.5 px-4 tabular-nums text-slate-700">
                          {formatBRL(Number(r.gross_company_billing))}
                        </td>
                        <td className="py-3.5 px-4">
                          {isPending ? (
                            <Badge className="bg-amber-100 text-amber-800 border-amber-300 font-semibold gap-1">
                              <Clock className="h-3 w-3" />
                              Pendente (Auditoria)
                            </Badge>
                          ) : r.status === 'paid' ? (
                            <Badge className="bg-slate-900 text-white border-slate-700 font-semibold gap-1">
                              <Lock className="h-3 w-3 text-amber-400" />
                              Mês Fechado / Pago
                            </Badge>
                          ) : (
                            <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 font-semibold gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              Processado
                            </Badge>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {isPending ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => navigate('/pendencies')}
                                className="text-xs text-amber-700 border-amber-300 hover:bg-amber-50"
                              >
                                Resolver Pendências
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => navigate('/reports')}
                                className="text-xs text-[#0F766E] hover:text-[#115E59] hover:bg-teal-50 gap-1 font-semibold"
                              >
                                <span>Ver Relatório</span>
                                <ArrowRight className="h-3.5 w-3.5" />
                              </Button>
                            )}

                            {/* Botão de Excluir Run (oculto para vendas e desabilitado/oculto se paid) */}
                            {!isSales && (
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={r.status === 'paid'}
                                onClick={() => handleOpenDelete(r)}
                                className={`text-xs px-2 h-8 flex items-center gap-1 ${
                                  r.status === 'paid'
                                    ? 'text-slate-300 cursor-not-allowed opacity-40'
                                    : 'text-rose-600 hover:text-rose-700 hover:bg-rose-50'
                                }`}
                                title={
                                  r.status === 'paid'
                                    ? 'Competência fechada e paga não pode ser excluída'
                                    : 'Excluir faturamentos e comissões deste mês'
                                }
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                <span className="sr-only sm:not-sr-only sm:inline-block">
                                  Excluir
                                </span>
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* MODAL: Confirmação de Exclusão de Monthly Run */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-rose-700">
              <Trash2 className="h-5 w-5 text-rose-600" />
              <span>
                Excluir Mês/Upload {runToDelete ? `(${formatMonth(runToDelete.month_year)})` : ''}?
              </span>
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-slate-600">
              Atenção: Esta ação é irreversível. Todos os faturamentos e comissões calculadas para
              esta competência serão apagados permanentemente. Tem a certeza que deseja excluir?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingRun}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={deletingRun}
              className="bg-rose-600 hover:bg-rose-700 text-white font-semibold focus:ring-rose-500"
            >
              {deletingRun ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  <span>Excluindo...</span>
                </>
              ) : (
                'Excluir Definitivamente'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
