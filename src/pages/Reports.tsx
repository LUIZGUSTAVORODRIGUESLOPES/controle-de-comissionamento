import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { supabase } from '@/lib/supabase/client'
import {
  getMonthlyRuns,
  getBillingsForRun,
  getCommissionsForRun,
  getAllUsers,
  markMonthlyRunAsPaid,
  unlockMonthlyRun,
} from '@/services/commissionService'
import type { MonthlyRun, Billing, Commission, AppUser } from '@/types/database'
import { useToast } from '@/hooks/use-toast'
import {
  Download,
  Printer,
  ChevronDown,
  ChevronRight,
  DollarSign,
  Receipt,
  Users,
  Award,
  PieChart as PieChartIcon,
  BarChart3,
  FileSpreadsheet,
  CheckCircle2,
  Lock,
  Unlock,
  AlertTriangle,
  ShieldCheck,
  Check,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip as RechartsTooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from 'recharts'

export default function Reports() {
  const { user, appUser } = useAuth()
  const { toast } = useToast()

  const [loading, setLoading] = useState(true)
  const [runs, setRuns] = useState<MonthlyRun[]>([])
  const [selectedRunId, setSelectedRunId] = useState<string>('')
  const [billings, setBillings] = useState<Billing[]>([])
  const [commissions, setCommissions] = useState<Commission[]>([])
  const [allUsers, setAllUsers] = useState<AppUser[]>([])

  // Expanded user rows in payroll
  const [expandedUsers, setExpandedUsers] = useState<Record<string, boolean>>({})

  // Compliance & Status actions state
  const [markingPaid, setMarkingPaid] = useState(false)
  const [confirmPaidOpen, setConfirmPaidOpen] = useState(false)
  const [unlockModalOpen, setUnlockModalOpen] = useState(false)
  const [adminPassword, setAdminPassword] = useState('')
  const [unlocking, setUnlocking] = useState(false)
  const [unlockError, setUnlockError] = useState<string | null>(null)

  const isSales = appUser?.role === 'sales'
  const isAdmin = appUser?.role === 'admin'

  const loadInitialData = async (preferredRunId?: string) => {
    setLoading(true)
    try {
      const [runsData, usersData] = await Promise.all([getMonthlyRuns(), getAllUsers()])

      // Include runs that are processed or paid (fechados)
      const visibleRuns = runsData.filter((r) => r.status === 'processed' || r.status === 'paid')
      setRuns(visibleRuns)
      setAllUsers(usersData)

      if (visibleRuns.length > 0) {
        const targetRun = preferredRunId
          ? visibleRuns.find((r) => r.id === preferredRunId) || visibleRuns[0]
          : visibleRuns[0]
        setSelectedRunId(targetRun.id)
        await loadRunDetails(targetRun.id)
      } else {
        setSelectedRunId('')
        setBillings([])
        setCommissions([])
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadInitialData()
  }, [])

  const loadRunDetails = async (runId: string) => {
    try {
      const [bills, comms] = await Promise.all([
        getBillingsForRun(runId),
        getCommissionsForRun(runId),
      ])
      setBillings(bills)
      setCommissions(comms)
    } catch (e) {
      console.error(e)
    }
  }

  const handleRunChange = async (runId: string) => {
    setSelectedRunId(runId)
    await loadRunDetails(runId)
  }

  const selectedRun = runs.find((r) => r.id === selectedRunId)

  const formatBRL = (val: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(val || 0)
  }

  const formatMonth = (dateStr?: string) => {
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

  const toggleUserExpanded = (userId: string) => {
    setExpandedUsers((prev) => ({
      ...prev,
      [userId]: !prev[userId],
    }))
  }

  // Group commissions by user for the payroll table
  const usersWithCommissions = allUsers
    .map((u) => {
      const userCommissions = commissions.filter((c) => c.user_id === u.id)
      const totalComm = userCommissions.reduce((acc, c) => acc + Number(c.commission_amount), 0)
      const fixed = Number(u.fixed_salary) || 0
      const totalPay = fixed + totalComm

      return {
        user: u,
        fixedSalary: fixed,
        commissionsTotal: totalComm,
        totalPayable: totalPay,
        commissionsList: userCommissions,
      }
    })
    .filter((item) => item.fixedSalary > 0 || item.commissionsTotal > 0)
    .sort((a, b) => b.totalPayable - a.totalPayable)

  // Totals for the entire company
  const companyGross = billings.reduce((acc, b) => acc + Number(b.gross_amount), 0)
  const companyNet = billings.reduce((acc, b) => acc + Number(b.net_amount), 0)
  const companyTaxes = Math.max(0, companyGross - companyNet)
  const companyTotalCommissions = commissions.reduce(
    (acc, c) => acc + Number(c.commission_amount),
    0,
  )
  const companyTotalFixed = usersWithCommissions.reduce((acc, u) => acc + u.fixedSalary, 0)
  const companyGrandTotal = companyTotalFixed + companyTotalCommissions

  // Personal sales commissions (for sales view)
  const myCommissionRows = commissions.filter((c) => c.user_id === user?.id)
  const myTotalCommission = myCommissionRows.reduce(
    (acc, c) => acc + Number(c.commission_amount),
    0,
  )

  // Donut chart of taxes composition
  const taxMap: Record<string, number> = {}
  billings.forEach((b) => {
    const applied = (b.tax_deductions_applied_json || []) as any[]
    applied.forEach((t) => {
      const name = t.name || 'Outros'
      taxMap[name] = (taxMap[name] || 0) + (Number(t.deducted) || 0)
    })
  })

  const donutColors = ['#0F766E', '#14B8A6', '#F59E0B', '#E11D48', '#8B5CF6']
  const taxDonutData = Object.entries(taxMap).map(([name, value], idx) => ({
    name,
    value: Math.round(value * 100) / 100,
    color: donutColors[idx % donutColors.length],
  }))

  // Bar chart: Gross vs Net per top clients
  const clientBarData = billings.slice(0, 8).map((b) => ({
    name: b.customer?.name?.slice(0, 15) || b.customer_id.slice(0, 8),
    bruto: Number(b.gross_amount),
    liquido: Number(b.net_amount),
  }))

  // Compliance actions: Mark as Paid
  const handleMarkAsPaid = async () => {
    if (!selectedRunId) return
    setMarkingPaid(true)
    try {
      await markMonthlyRunAsPaid(selectedRunId)
      toast({
        title: 'Mês Fechado e Pago com Sucesso!',
        description: 'Os valores e impostos foram travados contra alterações acidentais.',
      })
      setConfirmPaidOpen(false)
      await loadInitialData(selectedRunId)
    } catch (err: any) {
      console.error(err)
      toast({
        title: 'Erro ao fechar mês',
        description: err.message || 'Falha ao atualizar status para pago.',
        variant: 'destructive',
      })
    } finally {
      setMarkingPaid(false)
    }
  }

  // Compliance actions: Unlock (Estorno Seguro) with password reauthentication
  const handleConfirmUnlock = async () => {
    if (!selectedRunId || !user?.email) return
    if (!adminPassword) {
      setUnlockError('Digite a sua senha de administrador para prosseguir.')
      return
    }

    setUnlocking(true)
    setUnlockError(null)

    try {
      // 1. Re-authenticate admin with GoTrue signInWithPassword
      const { error: authErr } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: adminPassword,
      })

      if (authErr) {
        setUnlockError('Senha incorreta. Não foi possível autenticar o estorno.')
        setUnlocking(false)
        return
      }

      // 2. Unlock monthly run back to 'processed'
      await unlockMonthlyRun(selectedRunId, 'processed')

      toast({
        title: 'Mês Desbloqueado com Sucesso',
        description: 'O status retornou para "Processado". As travas de auditoria foram liberadas.',
      })

      setUnlockModalOpen(false)
      setAdminPassword('')
      await loadInitialData(selectedRunId)
    } catch (err: any) {
      console.error(err)
      setUnlockError(err.message || 'Falha ao desbloquear o mês no banco de dados.')
    } finally {
      setUnlocking(false)
    }
  }

  // Export CSV
  const handleExportCSV = () => {
    let csv = 'Vendedor,Cargo,Salário Fixo,Comissões,Total a Pagar\n'
    usersWithCommissions.forEach((item) => {
      csv += `"${item.user.name}","${item.user.role}",${item.fixedSalary.toFixed(2)},${item.commissionsTotal.toFixed(2)},${item.totalPayable.toFixed(2)}\n`
    })
    csv += `\n"TOTAL CONSOLIDADO","",${companyTotalFixed.toFixed(2)},${companyTotalCommissions.toFixed(2)},${companyGrandTotal.toFixed(2)}\n`

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `folha_comissoes_${selectedRun?.month_year || 'relatorio'}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast({
      title: 'CSV Exportado',
      description: 'O arquivo da folha de pagamento foi gerado com sucesso.',
    })
  }

  // Print Holerite
  const handlePrint = () => {
    window.print()
  }

  if (runs.length === 0 && !loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-xl border border-slate-200 text-center space-y-3">
        <FileSpreadsheet className="h-12 w-12 text-slate-400" />
        <h3 className="text-lg font-bold text-slate-800">Nenhum mês processado disponível</h3>
        <p className="text-sm text-slate-500 max-w-md">
          Para visualizar a folha de comissões e os relatórios, realize o upload de uma planilha e
          processe as pendências.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Month Selector & Action Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm print:hidden">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
              {isSales ? 'Meu Holerite de Comissões' : 'Relatórios & Folha de Comissões'}
            </h2>
            {selectedRun?.status === 'paid' ? (
              <Badge className="bg-slate-900 text-white border-slate-700 font-semibold gap-1.5 px-3 py-1 shadow-sm">
                <Lock className="h-3.5 w-3.5 text-amber-400" />
                <span>Mês Fechado / Pago</span>
              </Badge>
            ) : (
              <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 font-semibold gap-1.5 px-3 py-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                <span>Processado</span>
              </Badge>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Mês de Referência:{' '}
            <span className="font-semibold text-slate-700">
              {formatMonth(selectedRun?.month_year)}
            </span>
            {selectedRun?.status === 'paid' && (
              <span className="ml-2 text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 font-medium">
                🔒 Registro imutável de compliance financeiro
              </span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Select value={selectedRunId} onValueChange={handleRunChange}>
            <SelectTrigger className="w-52 h-10 border-slate-300">
              <SelectValue placeholder="Selecione o mês" />
            </SelectTrigger>
            <SelectContent>
              {runs.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {formatMonth(r.month_year)} {r.status === 'paid' ? '🔒 (Pago)' : '✓ (Processado)'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* ADMIN / MANAGER: Compliance Actions */}
          {!isSales && (
            <>
              {/* Button: Fechar Mês e Marcar como Pago (visible when status is 'processed') */}
              {selectedRun?.status === 'processed' && (
                <Button
                  onClick={() => setConfirmPaidOpen(true)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center gap-2 h-10 px-4 shadow-sm"
                >
                  <Lock className="h-4 w-4" />
                  <span>Fechar Mês e Marcar como Pago</span>
                </Button>
              )}

              {/* Button: Desbloquear Mês (Estorno) (visible ONLY for Admin when status is 'paid') */}
              {selectedRun?.status === 'paid' && isAdmin && (
                <Button
                  onClick={() => {
                    setUnlockError(null)
                    setAdminPassword('')
                    setUnlockModalOpen(true)
                  }}
                  variant="outline"
                  className="border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 font-semibold flex items-center gap-2 h-10 px-4"
                >
                  <Unlock className="h-4 w-4 text-amber-700" />
                  <span>Desbloquear Mês (Estorno)</span>
                </Button>
              )}
            </>
          )}

          {isSales ? (
            <Button
              onClick={handlePrint}
              className="bg-[#0F766E] hover:bg-[#115E59] text-white flex items-center gap-2 h-10"
            >
              <Printer className="h-4 w-4" />
              <span>Imprimir Holerite</span>
            </Button>
          ) : (
            <Button
              onClick={handleExportCSV}
              variant="outline"
              className="border-slate-300 text-slate-700 hover:bg-slate-50 flex items-center gap-2 h-10"
            >
              <Download className="h-4 w-4 text-[#0F766E]" />
              <span>Exportar CSV</span>
            </Button>
          )}
        </div>
      </div>

      {/* SALES VIEW: Personal Payslip */}
      {isSales ? (
        <div className="space-y-6">
          <div className="p-6 bg-white rounded-xl border border-slate-200 shadow-sm space-y-4 print:border-none print:shadow-none">
            {/* Compliance Banner for Sales View */}
            {selectedRun?.status === 'paid' ? (
              <div className="p-3.5 rounded-lg bg-slate-900 text-white flex items-center justify-between print:border print:border-slate-300 print:bg-slate-100 print:text-slate-900">
                <div className="flex items-center gap-2.5">
                  <Lock className="h-4 w-4 text-amber-400 print:text-slate-800" />
                  <span className="text-xs font-semibold">
                    Extrato Finalizado e Pago &bull; Mês Fechado pela Diretoria Financeira
                  </span>
                </div>
                <Badge className="bg-amber-400/20 text-amber-300 border-amber-400/30 text-[11px] font-bold print:bg-slate-200 print:text-slate-800">
                  Bloqueado para Edições
                </Badge>
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-teal-50 border border-teal-200 text-teal-900 text-xs flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-teal-600" />
                <span>Extrato apurado &bull; Aguardando pagamento e fechamento final.</span>
              </div>
            )}

            <div className="flex items-center justify-between border-b pb-4">
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-400 font-bold">
                  Colaborador(a)
                </p>
                <h3 className="text-xl font-bold text-slate-900">{appUser?.name}</h3>
                <p className="text-xs text-slate-500">{appUser?.email} &bull; Cargo: Vendedor</p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-wider text-slate-400 font-bold">
                  Mês de Competência
                </p>
                <p className="text-base font-semibold text-slate-800">
                  {formatMonth(selectedRun?.month_year)}
                </p>
              </div>
            </div>

            {/* Summary Stat */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 py-2">
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-xs text-slate-500 font-semibold uppercase">
                  Salário Fixo Mensal
                </span>
                <p className="text-2xl font-bold text-slate-800 tabular-nums mt-1">
                  {formatBRL(Number(appUser?.fixed_salary) || 0)}
                </p>
              </div>
              <div className="p-4 rounded-lg bg-teal-50 border border-teal-200">
                <span className="text-xs text-teal-700 font-semibold uppercase">
                  Total de Comissões Ganhas
                </span>
                <p className="text-2xl font-bold text-[#0F766E] tabular-nums mt-1">
                  {formatBRL(myTotalCommission)}
                </p>
              </div>
              <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200">
                <span className="text-xs text-emerald-800 font-semibold uppercase">
                  Remuneração Total Prevista
                </span>
                <p className="text-2xl font-bold text-emerald-800 tabular-nums mt-1">
                  {formatBRL((Number(appUser?.fixed_salary) || 0) + myTotalCommission)}
                </p>
              </div>
            </div>

            {/* Client Breakdown Table */}
            <div>
              <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-2">
                Demonstrativo por Cliente Atendido ({myCommissionRows.length})
              </h4>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">ID do Cliente</th>
                      <th className="py-2.5 px-3">Nome do Cliente</th>
                      <th className="py-2.5 px-3 text-right">Faturamento Bruto</th>
                      <th className="py-2.5 px-3 text-right">Base Líquida</th>
                      <th className="py-2.5 px-3 text-center">% Comissão</th>
                      <th className="py-2.5 px-3 text-right">Valor da Comissão</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {myCommissionRows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-slate-500">
                          Nenhuma comissão registrada para você neste mês.
                        </td>
                      </tr>
                    ) : (
                      myCommissionRows.map((c) => {
                        const bill = c.billing
                        const cust = bill?.customer
                        return (
                          <tr key={c.id} className="hover:bg-slate-50">
                            <td className="py-2.5 px-3 font-semibold text-slate-800">
                              {cust?.customer_code}
                            </td>
                            <td className="py-2.5 px-3 text-slate-700">{cust?.name}</td>
                            <td className="py-2.5 px-3 text-right tabular-nums text-slate-600">
                              {formatBRL(Number(bill?.gross_amount))}
                            </td>
                            <td className="py-2.5 px-3 text-right tabular-nums text-slate-800 font-medium">
                              {formatBRL(Number(bill?.net_amount))}
                            </td>
                            <td className="py-2.5 px-3 text-center font-bold text-teal-800">
                              {c.percentage_applied}%
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold text-[#0F766E] tabular-nums">
                              {formatBRL(Number(c.commission_amount))}
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                  {myCommissionRows.length > 0 && (
                    <tfoot className="bg-slate-50 font-bold border-t border-slate-200">
                      <tr>
                        <td colSpan={5} className="py-3 px-3 text-right uppercase text-slate-700">
                          Total de Comissões:
                        </td>
                        <td className="py-3 px-3 text-right text-base text-[#0F766E] tabular-nums">
                          {formatBRL(myTotalCommission)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ADMIN / MANAGER VIEW */
        <div className="space-y-6">
          {/* Compliance Banner for Locked State (Admin / Manager) */}
          {selectedRun?.status === 'paid' && (
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 text-white flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-md">
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-lg bg-amber-400/20 text-amber-300 border border-amber-400/30 flex items-center justify-center shrink-0">
                  <Lock className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold flex items-center gap-2 text-white">
                    <span>Mês Fechado e Pago — Camada de Compliance Ativa</span>
                    <Badge className="bg-amber-400/20 text-amber-300 border-amber-400/40 text-[10px] font-bold">
                      Somente Leitura
                    </Badge>
                  </h4>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Os valores de faturamento bruto, deduções fiscais e comissões deste mês estão
                    blindados contra edições e exclusões no banco de dados (Row Level Security).
                  </p>
                </div>
              </div>

              {isAdmin ? (
                <Button
                  onClick={() => {
                    setUnlockError(null)
                    setAdminPassword('')
                    setUnlockModalOpen(true)
                  }}
                  variant="outline"
                  size="sm"
                  className="border-amber-400/40 bg-amber-400/10 hover:bg-amber-400/20 text-amber-300 shrink-0 text-xs font-semibold h-9"
                >
                  <Unlock className="h-3.5 w-3.5 mr-1.5" />
                  <span>Estornar / Desbloquear</span>
                </Button>
              ) : (
                <span className="text-xs text-slate-400 italic">
                  Apenas administradores podem solicitar estorno.
                </span>
              )}
            </div>
          )}

          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border-slate-200 shadow-sm">
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
                  {formatBRL(companyGross)}
                </div>
                <p className="text-xs text-slate-500 mt-1">Total faturado no mês</p>
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm">
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
                  {formatBRL(companyTaxes)}
                </div>
                <p className="text-xs text-slate-500 mt-1">Deduções fiscais consolidadas</p>
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Comissões Totais
                </CardTitle>
                <div className="h-8 w-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                  <Award className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-900 tabular-nums">
                  {formatBRL(companyTotalCommissions)}
                </div>
                <p className="text-xs text-slate-500 mt-1">Distribuídas à equipe comercial</p>
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm bg-gradient-to-br from-white to-teal-50/40">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Total a Pagar (Folha Geral)
                </CardTitle>
                <div className="h-8 w-8 rounded-lg bg-[#0F766E] text-white flex items-center justify-center">
                  <Users className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-[#0F766E] tabular-nums">
                  {formatBRL(companyGrandTotal)}
                </div>
                <p className="text-xs text-slate-500 mt-1">Salários fixos + comissões</p>
              </CardContent>
            </Card>
          </div>

          {/* Payroll Table: "Folha de Comissões" with expandable customer breakdown */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base font-bold text-slate-900">
                  Folha de Comissões por Vendedor
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Clique na linha do vendedor para visualizar o extrato detalhado de clientes e
                  alíquotas aplicadas.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider bg-slate-50/50">
                      <th className="py-3 px-4 w-10"></th>
                      <th className="py-3 px-4">Vendedor / Colaborador</th>
                      <th className="py-3 px-4">Cargo</th>
                      <th className="py-3 px-4 text-right">Salário Fixo</th>
                      <th className="py-3 px-4 text-right">Comissões</th>
                      <th className="py-3 px-4 text-right">Total a Pagar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {usersWithCommissions.map((row) => {
                      const isExpanded = !!expandedUsers[row.user.id]
                      return (
                        <>
                          <tr
                            key={row.user.id}
                            onClick={() => toggleUserExpanded(row.user.id)}
                            className="hover:bg-slate-50 cursor-pointer transition-colors"
                          >
                            <td className="py-3 px-4 text-slate-400">
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4 text-[#0F766E]" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </td>
                            <td className="py-3 px-4 font-bold text-slate-800">{row.user.name}</td>
                            <td className="py-3 px-4 capitalize">
                              <Badge variant="outline" className="text-xs">
                                {row.user.role}
                              </Badge>
                            </td>
                            <td className="py-3 px-4 text-right tabular-nums text-slate-700">
                              {formatBRL(row.fixedSalary)}
                            </td>
                            <td className="py-3 px-4 text-right tabular-nums font-semibold text-teal-800">
                              {formatBRL(row.commissionsTotal)}
                            </td>
                            <td className="py-3 px-4 text-right tabular-nums font-bold text-slate-900">
                              {formatBRL(row.totalPayable)}
                            </td>
                          </tr>

                          {/* Expanded sub-table showing customer details */}
                          {isExpanded && (
                            <tr key={`${row.user.id}-expanded`} className="bg-slate-50/70">
                              <td colSpan={6} className="p-4 pl-12">
                                <div className="rounded-lg border border-slate-200 bg-white overflow-hidden shadow-sm">
                                  <div className="bg-slate-100 px-4 py-2 border-b border-slate-200 text-xs font-bold text-slate-700 uppercase tracking-wider">
                                    Clientes comissionados para {row.user.name} (
                                    {row.commissionsList.length})
                                  </div>
                                  <table className="w-full text-xs text-left">
                                    <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                                      <tr>
                                        <th className="py-2 px-3">ID do Cliente</th>
                                        <th className="py-2 px-3">Cliente</th>
                                        <th className="py-2 px-3 text-right">Faturamento Bruto</th>
                                        <th className="py-2 px-3 text-right">Base Líquida</th>
                                        <th className="py-2 px-3 text-center">
                                          Percentual Aplicado
                                        </th>
                                        <th className="py-2 px-3 text-right">Comissão</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {row.commissionsList.length === 0 ? (
                                        <tr>
                                          <td
                                            colSpan={6}
                                            className="py-3 text-center text-slate-400"
                                          >
                                            Nenhum cliente faturado para este colaborador no mês.
                                          </td>
                                        </tr>
                                      ) : (
                                        row.commissionsList.map((comm) => {
                                          const bill = comm.billing
                                          const cust = bill?.customer
                                          return (
                                            <tr key={comm.id} className="hover:bg-slate-50">
                                              <td className="py-2 px-3 font-semibold text-slate-700">
                                                {cust?.customer_code}
                                              </td>
                                              <td className="py-2 px-3 text-slate-800">
                                                {cust?.name}
                                              </td>
                                              <td className="py-2 px-3 text-right tabular-nums text-slate-600">
                                                {formatBRL(Number(bill?.gross_amount))}
                                              </td>
                                              <td className="py-2 px-3 text-right tabular-nums text-slate-800 font-medium">
                                                {formatBRL(Number(bill?.net_amount))}
                                              </td>
                                              <td className="py-2 px-3 text-center font-bold text-teal-800">
                                                {comm.percentage_applied}%
                                              </td>
                                              <td className="py-2 px-3 text-right tabular-nums font-bold text-[#0F766E]">
                                                {formatBRL(Number(comm.commission_amount))}
                                              </td>
                                            </tr>
                                          )
                                        })
                                      )}
                                    </tbody>
                                  </table>
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      )
                    })}
                  </tbody>
                  <tfoot className="border-t-2 border-slate-300 bg-slate-100/70 font-bold text-sm">
                    <tr>
                      <td colSpan={3} className="py-3 px-4 text-right uppercase text-slate-800">
                        Total da Folha do Mês:
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums text-slate-800">
                        {formatBRL(companyTotalFixed)}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums text-teal-800">
                        {formatBRL(companyTotalCommissions)}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums text-base text-[#0F766E]">
                        {formatBRL(companyGrandTotal)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Charts: Donut Tax Composition & Bar Gross vs Net */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Donut Chart: Tax Deductions Breakdown */}
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <PieChartIcon className="h-4 w-4 text-[#0F766E]" />
                  <span>Composição das Deduções Tributárias</span>
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Distribuição dos impostos retidos (percentuais e fórmulas dinâmicas)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64 w-full flex items-center justify-center">
                  {taxDonutData.length === 0 ? (
                    <span className="text-xs text-slate-400">Sem dados tributários</span>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={taxDonutData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={90}
                          paddingAngle={3}
                        >
                          {taxDonutData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <RechartsTooltip formatter={(val: any) => formatBRL(Number(val))} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Bar Chart: Gross vs Net per Client */}
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-[#0F766E]" />
                  <span>Faturamento Bruto vs Líquido por Cliente</span>
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Comparação da dedução fiscal sobre os maiores clientes do mês
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={clientBarData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                      <XAxis dataKey="name" stroke="#64748B" fontSize={11} />
                      <YAxis
                        stroke="#64748B"
                        fontSize={11}
                        tickFormatter={(val) => `R$${val / 1000}k`}
                      />
                      <RechartsTooltip formatter={(val: any) => formatBRL(Number(val))} />
                      <Legend />
                      <Bar dataKey="bruto" name="Bruto" fill="#0F766E" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="liquido" name="Líquido" fill="#14B8A6" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* MODAL: Confirmação de Fechar Mês e Marcar como Pago */}
      <AlertDialog open={confirmPaidOpen} onOpenChange={setConfirmPaidOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-slate-900">
              <Lock className="h-5 w-5 text-emerald-600" />
              <span>Fechar Mês e Marcar como Pago?</span>
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-xs text-slate-600">
              <p>
                Você está finalizando a apuração de{' '}
                <strong className="text-slate-900">{formatMonth(selectedRun?.month_year)}</strong>.
              </p>
              <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-amber-900 text-xs space-y-1">
                <p className="font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                  <span>Trava de Histórico e Auditoria</span>
                </p>
                <p className="text-slate-700">
                  Após fechar o mês, todas as tabelas de faturamentos e comissões deste período
                  serão bloqueadas para alterações e recálculos no banco de dados. Apenas um
                  Administrador poderá efetuar estorno mediante confirmação de senha.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={markingPaid}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleMarkAsPaid}
              disabled={markingPaid}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
            >
              {markingPaid ? 'Fechando mês...' : 'Confirmar Fechamento e Pagamento'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* MODAL: Override de Administrador (Estorno com Autenticação de Senha) */}
      <Dialog open={unlockModalOpen} onOpenChange={setUnlockModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-700 text-lg">
              <AlertTriangle className="h-5 w-5 text-rose-600" />
              <span>Desbloquear Mês (Estorno de Pagamento)</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Ação restrita a Administradores com impacto em auditoria e compliance contábil.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-900 text-xs space-y-1">
              <p className="font-bold flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-rose-600" />
                <span>Alerta de Quebra de Auditoria:</span>
              </p>
              <p className="text-slate-700 leading-relaxed">
                Você está prestes a reabrir o mês de{' '}
                <strong className="text-slate-900">{formatMonth(selectedRun?.month_year)}</strong>.
                Isso permitirá que faturamentos sejam recalculados e comissões alteradas. Confirme
                sua identidade como administrador digitando sua senha de acesso.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="admin_password"
                className="text-xs font-semibold text-slate-700 uppercase tracking-wider"
              >
                Senha do Administrador ({user?.email})
              </Label>
              <Input
                id="admin_password"
                type="password"
                autoComplete="current-password"
                placeholder="Digite a sua senha de login..."
                value={adminPassword}
                onChange={(e) => {
                  setAdminPassword(e.target.value)
                  setUnlockError(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleConfirmUnlock()
                  }
                }}
                className="h-10 border-slate-300"
              />
              {unlockError && (
                <p className="text-xs text-rose-600 font-semibold flex items-center gap-1 mt-1">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  <span>{unlockError}</span>
                </p>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              disabled={unlocking}
              onClick={() => {
                setUnlockModalOpen(false)
                setAdminPassword('')
                setUnlockError(null)
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmUnlock}
              disabled={unlocking || !adminPassword}
              className="bg-rose-600 hover:bg-rose-700 text-white font-semibold"
            >
              {unlocking ? (
                <>
                  <div className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin mr-2" />
                  <span>Validando credenciais...</span>
                </>
              ) : (
                <span>Confirmar Estorno e Desbloquear</span>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
