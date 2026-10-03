import { useState, useMemo, useEffect } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { supabase } from '@/lib/supabase/client'
import {
  getMonthlyRuns,
  getBillingsForRun,
  getCommissionsForRun,
  getBillingsForRuns,
  getCommissionsForRuns,
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
  Calendar as CalendarIcon,
  Filter,
  Layers,
  ArrowRight,
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
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
import { format, parseISO, isValid } from 'date-fns'
import { ptBR } from 'date-fns/locale'

type ViewMode = 'month' | 'period'

export default function Reports() {
  const { user, appUser } = useAuth()
  const { toast } = useToast()

  const [loading, setLoading] = useState(true)
  const [runs, setRuns] = useState<MonthlyRun[]>([])
  const [allUsers, setAllUsers] = useState<AppUser[]>([])

  // View mode: 'month' or 'period'
  const [viewMode, setViewMode] = useState<ViewMode>('month')

  // Selected Month (for 'month' mode)
  const [selectedRunId, setSelectedRunId] = useState<string>('')

  // Period Date Range (for 'period' mode)
  const [periodStartDate, setPeriodStartDate] = useState<string>('2026-01-01')
  const [periodEndDate, setPeriodEndDate] = useState<string>('2026-12-31')

  // Seller Filter: 'all' or userId
  const [selectedSellerId, setSelectedSellerId] = useState<string>('all')

  // Data loaded for the active view
  const [billings, setBillings] = useState<Billing[]>([])
  const [commissions, setCommissions] = useState<Commission[]>([])

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

  // If user is sales, lock filter to themselves automatically
  useEffect(() => {
    if (isSales && appUser?.id) {
      setSelectedSellerId(appUser.id)
    }
  }, [isSales, appUser?.id])

  // Initial load
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

        // Set default date range to wrap current visible runs if possible
        if (visibleRuns.length > 0) {
          const sortedRunsByDate = [...visibleRuns].sort((a, b) =>
            a.month_year.localeCompare(b.month_year),
          )
          const firstMonth = sortedRunsByDate[0].month_year.slice(0, 7)
          const lastMonth = sortedRunsByDate[sortedRunsByDate.length - 1].month_year.slice(0, 7)
          const [startYear] = firstMonth.split('-')
          const [endYear] = lastMonth.split('-')
          setPeriodStartDate(`${startYear}-01-01`)
          setPeriodEndDate(`${endYear}-12-31`)
        }

        await loadMonthData(targetRun.id)
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

  // Load data for single month
  const loadMonthData = async (runId: string) => {
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

  // Load data for period mode (aggregating all runs whose month_year falls in [periodStartDate, periodEndDate])
  const activeRunsInPeriod = useMemo(() => {
    if (viewMode === 'month') {
      const single = runs.find((r) => r.id === selectedRunId)
      return single ? [single] : []
    }

    if (!periodStartDate || !periodEndDate) return []

    // Monthly runs store month_year as 'YYYY-MM-01'
    const startStr = periodStartDate.length === 10 ? periodStartDate.slice(0, 7) : periodStartDate
    const endStr = periodEndDate.length === 10 ? periodEndDate.slice(0, 7) : periodEndDate

    return runs
      .filter((r) => {
        const runMonth = r.month_year.slice(0, 7)
        return runMonth >= startStr && runMonth <= endStr
      })
      .sort((a, b) => a.month_year.localeCompare(b.month_year))
  }, [runs, viewMode, selectedRunId, periodStartDate, periodEndDate])

  // Load data when mode changes or inputs change
  useEffect(() => {
    let isCancelled = false

    const reloadViewData = async () => {
      if (viewMode === 'month') {
        if (selectedRunId) {
          setLoading(true)
          try {
            await loadMonthData(selectedRunId)
          } finally {
            if (!isCancelled) setLoading(false)
          }
        }
      } else {
        // Period mode
        const runIds = activeRunsInPeriod.map((r) => r.id)
        if (runIds.length === 0) {
          setBillings([])
          setCommissions([])
          return
        }
        setLoading(true)
        try {
          const [bills, comms] = await Promise.all([
            getBillingsForRuns(runIds),
            getCommissionsForRuns(runIds),
          ])
          if (!isCancelled) {
            setBillings(bills)
            setCommissions(comms)
          }
        } catch (err) {
          console.error('Erro ao carregar dados do período:', err)
        } finally {
          if (!isCancelled) setLoading(false)
        }
      }
    }

    reloadViewData()

    return () => {
      isCancelled = true
    }
  }, [viewMode, selectedRunId, activeRunsInPeriod])

  const handleRunChange = async (runId: string) => {
    setSelectedRunId(runId)
    setLoading(true)
    try {
      await loadMonthData(runId)
    } finally {
      setLoading(false)
    }
  }

  const handleSwitchToMonthView = async (runId: string) => {
    setSelectedRunId(runId)
    setViewMode('month')
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

  const formatDateDisplay = (dateStr?: string) => {
    if (!dateStr) return ''
    try {
      const parsed = parseISO(dateStr)
      if (!isValid(parsed)) return dateStr
      return format(parsed, 'dd/MM/yyyy')
    } catch {
      return dateStr
    }
  }

  const toggleUserExpanded = (userId: string) => {
    setExpandedUsers((prev) => ({
      ...prev,
      [userId]: !prev[userId],
    }))
  }

  // Map run_id to run for quick lookup of month_year
  const runByIdMap = useMemo(() => {
    const map = new Map<string, MonthlyRun>()
    runs.forEach((r) => map.set(r.id, r))
    return map
  }, [runs])

  // List of eligible sellers for the dropdown (manager & sales who have commissions or are in allUsers)
  const sellerOptions = useMemo(() => {
    const sellers = allUsers.filter((u) => u.role === 'sales' || u.role === 'manager')
    return sellers
  }, [allUsers])

  // Count distinct months present in the active period dataset
  const distinctMonthsInPeriod = useMemo(() => {
    if (viewMode === 'month') return 1
    return activeRunsInPeriod.length
  }, [viewMode, activeRunsInPeriod])

  // ----------------------------------------------------
  // FILTERING & AGGREGATION LOGIC
  // ----------------------------------------------------
  // When a specific seller is selected:
  // - Billings: only billings from customers associated with this seller OR billings where this seller has commission
  // - Commissions: only commissions where c.user_id === selectedSellerId
  // - Payroll table: only this seller
  // - Fixed Salary:
  //     In 'month' mode: fixed salary of this seller (1 month)
  //     In 'period' mode: fixed salary for each distinct month where this seller had commissions or was active in the period runs
  const isSellerFiltered = selectedSellerId !== 'all'
  const activeSellerUser = isSellerFiltered ? allUsers.find((u) => u.id === selectedSellerId) : null

  // Active commissions based on seller filter
  const displayedCommissions = useMemo(() => {
    if (!isSellerFiltered) return commissions
    return commissions.filter((c) => c.user_id === selectedSellerId)
  }, [commissions, isSellerFiltered, selectedSellerId])

  // Active billings based on seller filter
  // When seller is filtered: billings that generated commissions for him (or where his customer was billed)
  const displayedBillings = useMemo(() => {
    if (!isSellerFiltered) return billings
    const sellerBillingIds = new Set(displayedCommissions.map((c) => c.billing_id))
    return billings.filter((b) => {
      if (sellerBillingIds.has(b.id)) return true
      const custLinks = b.customer?.customer_users || []
      return custLinks.some((cu) => cu.user_id === selectedSellerId)
    })
  }, [billings, displayedCommissions, isSellerFiltered, selectedSellerId])

  // Group commissions by user for the payroll table
  // In period mode: fixed salary must be multiplied by the number of months the user had apuração/comissões (or distinct runs in the period if fixed salary > 0)
  const usersWithCommissions = useMemo(() => {
    const targetUsers = isSellerFiltered && activeSellerUser ? [activeSellerUser] : allUsers

    return targetUsers
      .map((u) => {
        const userCommissions = commissions.filter((c) => c.user_id === u.id)
        const totalComm = userCommissions.reduce((acc, c) => acc + Number(c.commission_amount), 0)

        // Calculate how many months apply for fixed salary
        let monthsMultiplier = 1
        if (viewMode === 'period') {
          // Rule: sum fixed salary for EACH month of the period where there is a processed run
          // If the user had commissions, count months of those runs, or total period runs if active
          const runMonthsWithCommissions = new Set(
            userCommissions.map((c) => c.billing?.monthly_run_id).filter(Boolean) as string[],
          )
          // Count at least the months where he had commissions, or all period runs if he has a fixed salary > 0
          monthsMultiplier = Math.max(
            runMonthsWithCommissions.size,
            u.fixed_salary > 0 ? distinctMonthsInPeriod : 0,
          )
        }

        const fixed = (Number(u.fixed_salary) || 0) * monthsMultiplier
        const totalPay = fixed + totalComm

        return {
          user: u,
          fixedSalary: fixed,
          monthsCount: monthsMultiplier,
          commissionsTotal: totalComm,
          totalPayable: totalPay,
          commissionsList: userCommissions,
        }
      })
      .filter((item) => item.fixedSalary > 0 || item.commissionsTotal > 0)
      .sort((a, b) => b.totalPayable - a.totalPayable)
  }, [allUsers, commissions, isSellerFiltered, activeSellerUser, viewMode, distinctMonthsInPeriod])

  // Totals for the cards
  const companyGross = useMemo(() => {
    return displayedBillings.reduce((acc, b) => acc + Number(b.gross_amount), 0)
  }, [displayedBillings])

  const companyNet = useMemo(() => {
    return displayedBillings.reduce((acc, b) => acc + Number(b.net_amount), 0)
  }, [displayedBillings])

  const companyTaxes = Math.max(0, companyGross - companyNet)

  const companyTotalCommissions = useMemo(() => {
    return displayedCommissions.reduce((acc, c) => acc + Number(c.commission_amount), 0)
  }, [displayedCommissions])

  const companyTotalFixed = useMemo(() => {
    return usersWithCommissions.reduce((acc, u) => acc + u.fixedSalary, 0)
  }, [usersWithCommissions])

  const companyGrandTotal = companyTotalFixed + companyTotalCommissions

  // Sales View: Personal commissions
  const myCommissionRows = useMemo(() => {
    return commissions.filter((c) => c.user_id === user?.id)
  }, [commissions, user?.id])

  const myTotalCommission = useMemo(() => {
    return myCommissionRows.reduce((acc, c) => acc + Number(c.commission_amount), 0)
  }, [myCommissionRows])

  // Sales View: Fixed salary calculation (for month or period)
  const myFixedSalaryTotal = useMemo(() => {
    const baseFixed = Number(appUser?.fixed_salary) || 0
    if (viewMode === 'month') return baseFixed
    const monthsWithComm = new Set(
      myCommissionRows.map((c) => c.billing?.monthly_run_id).filter(Boolean) as string[],
    )
    const multiplier = Math.max(monthsWithComm.size, baseFixed > 0 ? distinctMonthsInPeriod : 0)
    return baseFixed * multiplier
  }, [appUser?.fixed_salary, viewMode, myCommissionRows, distinctMonthsInPeriod])

  // Donut chart of taxes composition (consolidates tax_deductions_applied_json across displayed billings)
  const taxDonutData = useMemo(() => {
    const taxMap: Record<string, number> = {}
    displayedBillings.forEach((b) => {
      const applied = (b.tax_deductions_applied_json || []) as any[]
      applied.forEach((t) => {
        const name = t.name || 'Outros'
        taxMap[name] = (taxMap[name] || 0) + (Number(t.deducted) || 0)
      })
    })

    const donutColors = ['#0F766E', '#14B8A6', '#F59E0B', '#E11D48', '#8B5CF6', '#3B82F6']
    return Object.entries(taxMap).map(([name, value], idx) => ({
      name,
      value: Math.round(value * 100) / 100,
      color: donutColors[idx % donutColors.length],
    }))
  }, [displayedBillings])

  // Bar chart: Top Clients (Gross vs Net consolidated by customer across all months/runs in view)
  const clientBarData = useMemo(() => {
    const custMap = new Map<string, { name: string; bruto: number; liquido: number }>()

    displayedBillings.forEach((b) => {
      const custId = b.customer_id || 'unknown'
      const custName = b.customer?.name || b.customer?.customer_code || custId.slice(0, 8)
      const existing = custMap.get(custId) || {
        name: custName.slice(0, 15),
        bruto: 0,
        liquido: 0,
      }
      existing.bruto += Number(b.gross_amount) || 0
      existing.liquido += Number(b.net_amount) || 0
      custMap.set(custId, existing)
    })

    return Array.from(custMap.values())
      .sort((a, b) => b.bruto - a.bruto)
      .slice(0, 8)
      .map((c) => ({
        ...c,
        bruto: Math.round(c.bruto * 100) / 100,
        liquido: Math.round(c.liquido * 100) / 100,
      }))
  }, [displayedBillings])

  // Period Mode: Month-by-month breakdown summary
  const monthByMonthSummary = useMemo(() => {
    if (viewMode !== 'period') return []

    return activeRunsInPeriod.map((r) => {
      const runBillings = billings.filter((b) => b.monthly_run_id === r.id)
      const runCommissions = commissions.filter((c) => c.billing?.monthly_run_id === r.id)

      // Apply seller filter if present
      const filteredRunBills = isSellerFiltered
        ? runBillings.filter((b) => {
            const hasComm = runCommissions.some(
              (c) => c.billing_id === b.id && c.user_id === selectedSellerId,
            )
            if (hasComm) return true
            return b.customer?.customer_users?.some((cu) => cu.user_id === selectedSellerId)
          })
        : runBillings

      const filteredRunComms = isSellerFiltered
        ? runCommissions.filter((c) => c.user_id === selectedSellerId)
        : runCommissions

      const gross = filteredRunBills.reduce((acc, b) => acc + Number(b.gross_amount), 0)
      const net = filteredRunBills.reduce((acc, b) => acc + Number(b.net_amount), 0)
      const taxes = Math.max(0, gross - net)
      const commTotal = filteredRunComms.reduce((acc, c) => acc + Number(c.commission_amount), 0)

      return {
        run: r,
        gross,
        taxes,
        commissions: commTotal,
        billingsCount: filteredRunBills.length,
      }
    })
  }, [viewMode, activeRunsInPeriod, billings, commissions, isSellerFiltered, selectedSellerId])

  // Group user commissions by month for the detailed payslip in Period mode
  const groupCommissionsByMonth = (commList: Commission[]) => {
    const groups: Record<
      string,
      {
        monthYear: string
        run?: MonthlyRun
        items: Commission[]
        subtotalGross: number
        subtotalNet: number
        subtotalComm: number
      }
    > = {}

    commList.forEach((c) => {
      const runId = c.billing?.monthly_run_id || ''
      const run = runByIdMap.get(runId)
      const key = run?.month_year || 'sem_mes'

      if (!groups[key]) {
        groups[key] = {
          monthYear: key,
          run,
          items: [],
          subtotalGross: 0,
          subtotalNet: 0,
          subtotalComm: 0,
        }
      }
      groups[key].items.push(c)
      groups[key].subtotalGross += Number(c.billing?.gross_amount) || 0
      groups[key].subtotalNet += Number(c.billing?.net_amount) || 0
      groups[key].subtotalComm += Number(c.commission_amount) || 0
    })

    return Object.values(groups).sort((a, b) => b.monthYear.localeCompare(a.monthYear))
  }

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

  // Export CSV (supports Month or Period mode, with or without seller filter)
  const handleExportCSV = () => {
    let filename = ''
    let csv = ''

    if (viewMode === 'month') {
      filename = `folha_comissoes_${selectedRun?.month_year || 'mes'}`
    } else {
      filename = `folha_comissoes_periodo_${periodStartDate}_a_${periodEndDate}`
    }

    if (isSellerFiltered && activeSellerUser) {
      filename += `_${activeSellerUser.name.toLowerCase().replace(/\s+/g, '_')}`
    }

    if (isSellerFiltered && activeSellerUser) {
      // Detailed single seller export
      csv = `Relatório de Comissões - ${activeSellerUser.name} (${activeSellerUser.role})\n`
      csv += `Modo: ${viewMode === 'month' ? formatMonth(selectedRun?.month_year) : `Período ${formatDateDisplay(periodStartDate)} a ${formatDateDisplay(periodEndDate)}`}\n`
      csv += `Salário Fixo Total: ${formatBRL(companyTotalFixed)}\n\n`
      csv += `Mês de Competência,Código Cliente,Nome Cliente,Faturamento Bruto,Base Líquida,% Comissão,Valor Comissão\n`

      displayedCommissions.forEach((c) => {
        const run = runByIdMap.get(c.billing?.monthly_run_id || '')
        const monthLabel = formatMonth(run?.month_year)
        const cust = c.billing?.customer
        csv += `"${monthLabel}","${cust?.customer_code || ''}","${cust?.name || ''}",${Number(c.billing?.gross_amount || 0).toFixed(2)},${Number(c.billing?.net_amount || 0).toFixed(2)},${c.percentage_applied}%,${Number(c.commission_amount || 0).toFixed(2)}\n`
      })

      csv += `\n"TOTAL COMISSÕES","","",,,"",${companyTotalCommissions.toFixed(2)}\n`
      csv += `"TOTAL A PAGAR (FIXO + COMISSÕES)","","",,,"",${companyGrandTotal.toFixed(2)}\n`
    } else {
      // General payroll export
      csv = `Folha de Comissões - ${viewMode === 'month' ? formatMonth(selectedRun?.month_year) : `Período ${formatDateDisplay(periodStartDate)} a ${formatDateDisplay(periodEndDate)}`}\n\n`
      csv += 'Vendedor,Cargo,Salário Fixo,Comissões,Total a Pagar\n'
      usersWithCommissions.forEach((item) => {
        csv += `"${item.user.name}","${item.user.role}",${item.fixedSalary.toFixed(2)},${item.commissionsTotal.toFixed(2)},${item.totalPayable.toFixed(2)}\n`
      })
      csv += `\n"TOTAL CONSOLIDADO","",${companyTotalFixed.toFixed(2)},${companyTotalCommissions.toFixed(2)},${companyGrandTotal.toFixed(2)}\n`
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${filename}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast({
      title: 'CSV Exportado',
      description: 'O arquivo consolidado foi gerado com sucesso.',
    })
  }

  // Print Payslip
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
      {/* Header & Filter Card */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm print:hidden space-y-5">
        {/* Title row */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
                {isSales ? 'Meu Holerite de Comissões' : 'Relatórios & Folha de Comissões'}
              </h2>

              {viewMode === 'month' ? (
                selectedRun?.status === 'paid' ? (
                  <Badge className="bg-slate-900 text-white border-slate-700 font-semibold gap-1.5 px-3 py-1 shadow-sm">
                    <Lock className="h-3.5 w-3.5 text-amber-400" />
                    <span>Mês Fechado / Pago</span>
                  </Badge>
                ) : (
                  <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 font-semibold gap-1.5 px-3 py-1">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    <span>Processado</span>
                  </Badge>
                )
              ) : (
                <Badge className="bg-teal-100 text-teal-800 border-teal-300 font-semibold gap-1.5 px-3 py-1">
                  <Layers className="h-3.5 w-3.5 text-teal-700" />
                  <span>
                    Consolidado de Período ({activeRunsInPeriod.length}{' '}
                    {activeRunsInPeriod.length === 1 ? 'mês' : 'meses'})
                  </span>
                </Badge>
              )}
            </div>

            <p className="text-sm text-slate-500 mt-1">
              {viewMode === 'month' ? (
                <>
                  Mês de Referência:{' '}
                  <span className="font-semibold text-slate-700">
                    {formatMonth(selectedRun?.month_year)}
                  </span>
                  {selectedRun?.status === 'paid' && (
                    <span className="ml-2 text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 font-medium">
                      🔒 Registro imutável de compliance financeiro
                    </span>
                  )}
                </>
              ) : (
                <>
                  Intervalo:{' '}
                  <span className="font-semibold text-slate-700">
                    {formatDateDisplay(periodStartDate)} até {formatDateDisplay(periodEndDate)}
                  </span>
                  <span className="ml-2 text-xs text-slate-500">
                    &bull; Consolidação de {activeRunsInPeriod.length} meses apurados
                  </span>
                </>
              )}
            </p>
          </div>

          {/* Action buttons (Export / Print / Close Month / Unlock) */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Compliance actions visible ONLY in Month mode */}
            {viewMode === 'month' && !isSales && (
              <>
                {selectedRun?.status === 'processed' && (
                  <Button
                    onClick={() => setConfirmPaidOpen(true)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center gap-2 h-10 px-4 shadow-sm"
                  >
                    <Lock className="h-4 w-4" />
                    <span>Fechar Mês e Marcar como Pago</span>
                  </Button>
                )}

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

        {/* Filter Toolbar: View Mode Toggle + Month/Period Selector + Seller Filter */}
        <div className="pt-4 border-t border-slate-100 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="flex flex-wrap items-end gap-4">
            {/* 1. Mode Segmented Control */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                Modo de Visualização
              </Label>
              <div className="inline-flex p-1 bg-slate-100 rounded-lg border border-slate-200">
                <button
                  type="button"
                  onClick={() => setViewMode('month')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                    viewMode === 'month'
                      ? 'bg-white text-[#0F766E] shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Mês de Competência
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('period')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                    viewMode === 'period'
                      ? 'bg-[#0F766E] text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Período
                </button>
              </div>
            </div>

            {/* 2. Selection based on mode */}
            {viewMode === 'month' ? (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Mês de Competência
                </Label>
                <Select value={selectedRunId} onValueChange={handleRunChange}>
                  <SelectTrigger className="w-56 h-10 border-slate-300">
                    <SelectValue placeholder="Selecione o mês" />
                  </SelectTrigger>
                  <SelectContent>
                    {runs.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {formatMonth(r.month_year)}{' '}
                        {r.status === 'paid' ? '🔒 (Pago)' : '✓ (Processado)'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              /* Period Mode: Date Range Pickers */
              <div className="flex items-end gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Data Inicial
                  </Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-36 h-10 justify-start text-left font-normal border-slate-300 text-xs"
                      >
                        <CalendarIcon className="mr-2 h-3.5 w-3.5 text-[#0F766E]" />
                        {periodStartDate ? formatDateDisplay(periodStartDate) : 'Selecione'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={periodStartDate ? parseISO(periodStartDate) : undefined}
                        onSelect={(date) => {
                          if (date) {
                            const yyyy = date.getFullYear()
                            const mm = String(date.getMonth() + 1).padStart(2, '0')
                            const dd = String(date.getDate()).padStart(2, '0')
                            setPeriodStartDate(`${yyyy}-${mm}-${dd}`)
                          }
                        }}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <span className="text-slate-400 pb-2.5 text-xs font-bold">até</span>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Data Final
                  </Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-36 h-10 justify-start text-left font-normal border-slate-300 text-xs"
                      >
                        <CalendarIcon className="mr-2 h-3.5 w-3.5 text-[#0F766E]" />
                        {periodEndDate ? formatDateDisplay(periodEndDate) : 'Selecione'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={periodEndDate ? parseISO(periodEndDate) : undefined}
                        onSelect={(date) => {
                          if (date) {
                            const yyyy = date.getFullYear()
                            const mm = String(date.getMonth() + 1).padStart(2, '0')
                            const dd = String(date.getDate()).padStart(2, '0')
                            setPeriodEndDate(`${yyyy}-${mm}-${dd}`)
                          }
                        }}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            )}

            {/* 3. Seller Filter (Select "Vendedor") */}
            {!isSales && (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                  <Filter className="h-3 w-3 text-slate-500" />
                  <span>Filtrar por Vendedor</span>
                </Label>
                <Select value={selectedSellerId} onValueChange={setSelectedSellerId}>
                  <SelectTrigger className="w-56 h-10 border-slate-300">
                    <SelectValue placeholder="Todos os vendedores" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os vendedores</SelectItem>
                    {sellerOptions.map((seller) => (
                      <SelectItem key={seller.id} value={seller.id}>
                        {seller.name} ({seller.role === 'manager' ? 'Gerente' : 'Vendedor'})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Active Filter Indicator */}
          {isSellerFiltered && !isSales && activeSellerUser && (
            <div className="flex items-center gap-2 text-xs bg-teal-50 border border-teal-200 text-[#0F766E] px-3 py-1.5 rounded-lg">
              <span className="font-semibold">Filtro ativo:</span>
              <span className="underline font-bold">{activeSellerUser.name}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedSellerId('all')}
                className="h-6 px-1.5 text-xs text-teal-800 hover:text-teal-950 hover:bg-teal-100"
              >
                Limpar
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* SALES VIEW: Personal Payslip (auto locked to sales user) */}
      {isSales ? (
        <div className="space-y-6">
          <div className="p-6 bg-white rounded-xl border border-slate-200 shadow-sm space-y-4 print:border-none print:shadow-none">
            {/* Compliance Banner for Sales View */}
            {viewMode === 'month' && selectedRun?.status === 'paid' ? (
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
                <span>
                  {viewMode === 'month'
                    ? 'Extrato apurado &bull; Aguardando pagamento e fechamento final.'
                    : `Extrato consolidado do período de ${formatDateDisplay(periodStartDate)} a ${formatDateDisplay(periodEndDate)}.`}
                </span>
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
                  {viewMode === 'month' ? 'Mês de Competência' : 'Período Apurado'}
                </p>
                <p className="text-base font-semibold text-slate-800">
                  {viewMode === 'month'
                    ? formatMonth(selectedRun?.month_year)
                    : `${formatDateDisplay(periodStartDate)} a ${formatDateDisplay(periodEndDate)}`}
                </p>
              </div>
            </div>

            {/* Summary Stat */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 py-2">
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-xs text-slate-500 font-semibold uppercase">
                  {viewMode === 'month'
                    ? 'Salário Fixo Mensal'
                    : `Salário Fixo (${distinctMonthsInPeriod} ${distinctMonthsInPeriod === 1 ? 'mês' : 'meses'})`}
                </span>
                <p className="text-2xl font-bold text-slate-800 tabular-nums mt-1">
                  {formatBRL(myFixedSalaryTotal)}
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
                  {formatBRL(myFixedSalaryTotal + myTotalCommission)}
                </p>
              </div>
            </div>

            {/* Client Breakdown Table (Grouped by Month in Period mode) */}
            <div>
              <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-2">
                Demonstrativo de Comissões ({myCommissionRows.length})
              </h4>

              {viewMode === 'month' ? (
                /* Single Month Table */
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
              ) : (
                /* Period Mode: Grouped by Month with Subtotals */
                <div className="space-y-4">
                  {groupCommissionsByMonth(myCommissionRows).map((group) => (
                    <div
                      key={group.monthYear}
                      className="rounded-lg border border-slate-200 overflow-hidden shadow-sm"
                    >
                      <div className="bg-slate-100 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                          Mês de Competência: {formatMonth(group.monthYear)}
                        </span>
                        <span className="text-xs font-semibold text-[#0F766E]">
                          Subtotal Comissões: {formatBRL(group.subtotalComm)}
                        </span>
                      </div>
                      <table className="w-full text-xs text-left">
                        <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                          <tr>
                            <th className="py-2 px-3">ID do Cliente</th>
                            <th className="py-2 px-3">Nome do Cliente</th>
                            <th className="py-2 px-3 text-right">Faturamento Bruto</th>
                            <th className="py-2 px-3 text-right">Base Líquida</th>
                            <th className="py-2 px-3 text-center">% Comissão</th>
                            <th className="py-2 px-3 text-right">Valor da Comissão</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          {group.items.map((c) => {
                            const bill = c.billing
                            const cust = bill?.customer
                            return (
                              <tr key={c.id} className="hover:bg-slate-50">
                                <td className="py-2 px-3 font-semibold text-slate-800">
                                  {cust?.customer_code}
                                </td>
                                <td className="py-2 px-3 text-slate-700">{cust?.name}</td>
                                <td className="py-2 px-3 text-right tabular-nums text-slate-600">
                                  {formatBRL(Number(bill?.gross_amount))}
                                </td>
                                <td className="py-2 px-3 text-right tabular-nums text-slate-800 font-medium">
                                  {formatBRL(Number(bill?.net_amount))}
                                </td>
                                <td className="py-2 px-3 text-center font-bold text-teal-800">
                                  {c.percentage_applied}%
                                </td>
                                <td className="py-2 px-3 text-right font-bold text-[#0F766E] tabular-nums">
                                  {formatBRL(Number(c.commission_amount))}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                        <tfoot className="bg-slate-50/80 font-semibold border-t border-slate-200">
                          <tr>
                            <td
                              colSpan={2}
                              className="py-2 px-3 text-right uppercase text-slate-600"
                            >
                              Subtotais ({formatMonth(group.monthYear)}):
                            </td>
                            <td className="py-2 px-3 text-right tabular-nums text-slate-700">
                              {formatBRL(group.subtotalGross)}
                            </td>
                            <td className="py-2 px-3 text-right tabular-nums text-slate-800">
                              {formatBRL(group.subtotalNet)}
                            </td>
                            <td></td>
                            <td className="py-2 px-3 text-right font-bold text-[#0F766E] tabular-nums">
                              {formatBRL(group.subtotalComm)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  ))}

                  {/* Grand total footer for period */}
                  <div className="p-4 bg-teal-50 border border-teal-200 rounded-lg flex items-center justify-between font-bold text-sm">
                    <span className="text-teal-900 uppercase">
                      Total Geral de Comissões no Período:
                    </span>
                    <span className="text-lg text-[#0F766E] tabular-nums">
                      {formatBRL(myTotalCommission)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* ADMIN / MANAGER VIEW */
        <div className="space-y-6">
          {/* Compliance Banner for Locked State (Month Mode Only) */}
          {viewMode === 'month' && selectedRun?.status === 'paid' && (
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
                <p className="text-xs text-slate-500 mt-1">
                  {isSellerFiltered
                    ? `Faturamento dos clientes de ${activeSellerUser?.name}`
                    : viewMode === 'month'
                      ? 'Total faturado no mês'
                      : `Consolidado de ${activeRunsInPeriod.length} meses`}
                </p>
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
                <p className="text-xs text-slate-500 mt-1">
                  {isSellerFiltered
                    ? 'Deduções fiscais sobre clientes filtrados'
                    : 'Deduções fiscais consolidadas'}
                </p>
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
                <p className="text-xs text-slate-500 mt-1">
                  {isSellerFiltered
                    ? `Comissões apuradas para ${activeSellerUser?.name}`
                    : 'Distribuídas à equipe comercial'}
                </p>
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm bg-gradient-to-br from-white to-teal-50/40">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Total a Pagar {isSellerFiltered ? `(${activeSellerUser?.name})` : '(Folha Geral)'}
                </CardTitle>
                <div className="h-8 w-8 rounded-lg bg-[#0F766E] text-white flex items-center justify-center">
                  <Users className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-[#0F766E] tabular-nums">
                  {formatBRL(companyGrandTotal)}
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {viewMode === 'period'
                    ? `Salários fixos (${distinctMonthsInPeriod}x) + comissões`
                    : 'Salários fixos + comissões'}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* PERIOD MODE: Month-by-Month Summary Table */}
          {viewMode === 'period' && (
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div>
                  <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <CalendarIcon className="h-4 w-4 text-[#0F766E]" />
                    <span>Resumo Mês a Mês do Período</span>
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Clique em qualquer mês para abri-lo detalhadamente no modo &quot;Mês de
                    competência&quot;.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider bg-slate-50/50">
                        <th className="py-2.5 px-4">Mês de Competência</th>
                        <th className="py-2.5 px-4 text-center">Status</th>
                        <th className="py-2.5 px-4 text-right">Faturamento Bruto</th>
                        <th className="py-2.5 px-4 text-right">Impostos Retidos</th>
                        <th className="py-2.5 px-4 text-right">Comissões</th>
                        <th className="py-2.5 px-4 text-center w-28">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {monthByMonthSummary.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-6 text-center text-slate-400 text-xs">
                            Nenhum mês processado encontrado no intervalo selecionado.
                          </td>
                        </tr>
                      ) : (
                        monthByMonthSummary.map((item) => (
                          <tr
                            key={item.run.id}
                            className="hover:bg-slate-50 transition-colors cursor-pointer"
                            onClick={() => handleSwitchToMonthView(item.run.id)}
                          >
                            <td className="py-3 px-4 font-bold text-slate-800">
                              {formatMonth(item.run.month_year)}
                            </td>
                            <td className="py-3 px-4 text-center">
                              {item.run.status === 'paid' ? (
                                <Badge className="bg-slate-900 text-white text-[11px] font-semibold gap-1">
                                  <Lock className="h-3 w-3 text-amber-400" />
                                  <span>Pago</span>
                                </Badge>
                              ) : (
                                <Badge className="bg-emerald-100 text-emerald-800 text-[11px] font-semibold gap-1">
                                  <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                                  <span>Processado</span>
                                </Badge>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right tabular-nums text-slate-700">
                              {formatBRL(item.gross)}
                            </td>
                            <td className="py-3 px-4 text-right tabular-nums text-rose-700">
                              {formatBRL(item.taxes)}
                            </td>
                            <td className="py-3 px-4 text-right tabular-nums font-bold text-[#0F766E]">
                              {formatBRL(item.commissions)}
                            </td>
                            <td className="py-3 px-4 text-center">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleSwitchToMonthView(item.run.id)
                                }}
                                className="h-7 text-xs text-[#0F766E] hover:text-[#115E59] hover:bg-teal-50 gap-1"
                              >
                                <span>Ver mês</span>
                                <ArrowRight className="h-3 w-3" />
                              </Button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Payroll Table: "Folha de Comissões" with expandable customer breakdown */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base font-bold text-slate-900">
                  Folha de Comissões{' '}
                  {isSellerFiltered ? `- ${activeSellerUser?.name}` : 'por Vendedor'}
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  {viewMode === 'period'
                    ? 'Salário fixo somado por cada mês apurado do período. Clique no vendedor para ver o demonstrativo detalhado por mês e cliente.'
                    : 'Clique na linha do vendedor para visualizar o extrato detalhado de clientes e alíquotas aplicadas.'}
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
                      <th className="py-3 px-4 text-right">
                        {viewMode === 'period' ? 'Salário Fixo (Período)' : 'Salário Fixo'}
                      </th>
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
                              {viewMode === 'period' && row.monthsCount > 1 && (
                                <span className="block text-[10px] text-slate-400">
                                  ({row.monthsCount}x {formatBRL(row.user.fixed_salary)})
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right tabular-nums font-semibold text-teal-800">
                              {formatBRL(row.commissionsTotal)}
                            </td>
                            <td className="py-3 px-4 text-right tabular-nums font-bold text-slate-900">
                              {formatBRL(row.totalPayable)}
                            </td>
                          </tr>

                          {/* Expanded sub-table showing customer details (grouped by month in period mode) */}
                          {isExpanded && (
                            <tr key={`${row.user.id}-expanded`} className="bg-slate-50/70">
                              <td colSpan={6} className="p-4 pl-12">
                                <div className="rounded-lg border border-slate-200 bg-white overflow-hidden shadow-sm">
                                  <div className="bg-slate-100 px-4 py-2 border-b border-slate-200 text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
                                    <span>
                                      Extrato detalhado de comissões para {row.user.name} (
                                      {row.commissionsList.length})
                                    </span>
                                    {viewMode === 'period' && (
                                      <span className="text-slate-500 font-semibold">
                                        Período: {formatDateDisplay(periodStartDate)} a{' '}
                                        {formatDateDisplay(periodEndDate)}
                                      </span>
                                    )}
                                  </div>

                                  {viewMode === 'month' ? (
                                    /* Single Month Breakdown */
                                    <table className="w-full text-xs text-left">
                                      <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                                        <tr>
                                          <th className="py-2 px-3">ID do Cliente</th>
                                          <th className="py-2 px-3">Cliente</th>
                                          <th className="py-2 px-3 text-right">
                                            Faturamento Bruto
                                          </th>
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
                                  ) : (
                                    /* Period Mode: Grouped by month with monthly subtotals */
                                    <div className="divide-y divide-slate-200">
                                      {groupCommissionsByMonth(row.commissionsList).map((grp) => (
                                        <div key={grp.monthYear} className="p-3">
                                          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                                            <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                                              Competência: {formatMonth(grp.monthYear)}
                                            </span>
                                            <span className="text-xs font-semibold text-[#0F766E]">
                                              Subtotal do Mês: {formatBRL(grp.subtotalComm)}
                                            </span>
                                          </div>
                                          <table className="w-full text-xs text-left">
                                            <thead className="bg-slate-50/70 text-slate-500 font-semibold">
                                              <tr>
                                                <th className="py-1.5 px-2">ID</th>
                                                <th className="py-1.5 px-2">Cliente</th>
                                                <th className="py-1.5 px-2 text-right">Bruto</th>
                                                <th className="py-1.5 px-2 text-right">Líquido</th>
                                                <th className="py-1.5 px-2 text-center">%</th>
                                                <th className="py-1.5 px-2 text-right">Comissão</th>
                                              </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                              {grp.items.map((comm) => {
                                                const bill = comm.billing
                                                const cust = bill?.customer
                                                return (
                                                  <tr key={comm.id} className="hover:bg-slate-50">
                                                    <td className="py-1.5 px-2 font-medium text-slate-700">
                                                      {cust?.customer_code}
                                                    </td>
                                                    <td className="py-1.5 px-2 text-slate-800">
                                                      {cust?.name}
                                                    </td>
                                                    <td className="py-1.5 px-2 text-right tabular-nums text-slate-600">
                                                      {formatBRL(Number(bill?.gross_amount))}
                                                    </td>
                                                    <td className="py-1.5 px-2 text-right tabular-nums text-slate-800">
                                                      {formatBRL(Number(bill?.net_amount))}
                                                    </td>
                                                    <td className="py-1.5 px-2 text-center font-bold text-teal-800">
                                                      {comm.percentage_applied}%
                                                    </td>
                                                    <td className="py-1.5 px-2 text-right tabular-nums font-bold text-[#0F766E]">
                                                      {formatBRL(Number(comm.commission_amount))}
                                                    </td>
                                                  </tr>
                                                )
                                              })}
                                            </tbody>
                                          </table>
                                        </div>
                                      ))}
                                    </div>
                                  )}
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
                        {viewMode === 'period'
                          ? 'Total da Folha no Período:'
                          : 'Total da Folha do Mês:'}
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
                  {viewMode === 'period'
                    ? `Deduções acumuladas de todos os meses do período (${taxDonutData.length} tributos identificados)`
                    : 'Distribuição dos impostos retidos (percentuais e fórmulas dinâmicas)'}
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
                  <span>
                    {viewMode === 'period'
                      ? 'Top Clientes do Período (Bruto vs Líquido)'
                      : 'Faturamento Bruto vs Líquido por Cliente'}
                  </span>
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  {viewMode === 'period'
                    ? 'Valores consolidados dos maiores clientes no intervalo'
                    : 'Comparação da dedução fiscal sobre os maiores clientes do mês'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64 w-full">
                  {clientBarData.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-xs text-slate-400">
                      Sem clientes para exibir
                    </div>
                  ) : (
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
                        <Bar
                          dataKey="liquido"
                          name="Líquido"
                          fill="#14B8A6"
                          radius={[3, 3, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
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
