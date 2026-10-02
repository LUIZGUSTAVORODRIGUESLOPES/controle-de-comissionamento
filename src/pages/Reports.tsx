import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/use-auth'
import {
  getMonthlyRuns,
  getBillingsForRun,
  getCommissionsForRun,
  getAllUsers,
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
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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

  const isSales = appUser?.role === 'sales'

  useEffect(() => {
    async function loadInitialData() {
      setLoading(true)
      try {
        const [runsData, usersData] = await Promise.all([getMonthlyRuns(), getAllUsers()])

        const processedRuns = runsData.filter((r) => r.status === 'processed')
        setRuns(processedRuns)
        setAllUsers(usersData)

        if (processedRuns.length > 0) {
          const defaultRun = processedRuns[0]
          setSelectedRunId(defaultRun.id)
          await loadRunDetails(defaultRun.id)
        }
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm print:hidden">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
              {isSales ? 'Meu Holerite de Comissões' : 'Relatórios & Folha de Comissões'}
            </h2>
            <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 font-semibold">
              Processado
            </Badge>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Mês de Referência:{' '}
            <span className="font-semibold text-slate-700">
              {formatMonth(selectedRun?.month_year)}
            </span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Select value={selectedRunId} onValueChange={handleRunChange}>
            <SelectTrigger className="w-52 h-10 border-slate-300">
              <SelectValue placeholder="Selecione o mês" />
            </SelectTrigger>
            <SelectContent>
              {runs.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {formatMonth(r.month_year)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

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
    </div>
  )
}
