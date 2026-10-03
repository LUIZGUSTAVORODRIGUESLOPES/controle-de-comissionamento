import React, { useState, useMemo } from 'react'
import {
  useRevenueData,
  formatCompetenceLabel,
  type MonthEvolutionPoint,
  type CustomerRankingPoint,
  type OriginDistributionPoint,
} from '@/hooks/useRevenueData'
import type { RevenueBillingRow } from '@/services/revenueService'
import {
  TrendingUp,
  DollarSign,
  Receipt,
  Users,
  Calendar,
  Filter,
  RotateCcw,
  Building2,
  Check,
  ChevronsUpDown,
  Search,
  PieChart as PieChartIcon,
  BarChart3,
  LineChart as LineChartIcon,
  ChevronLeft,
  ChevronRight,
  Download,
  Percent,
  Layers,
  HelpCircle,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
} from 'recharts'
import { cn } from '@/lib/utils'

export default function RevenueDashboard() {
  const {
    loading,
    error,
    refresh,
    filters,
    setMonthsFilter,
    setOriginFilter,
    setCustomerFilter,
    resetFilters,
    availableRuns,
    availableCustomers,
    filteredBillings,
    kpis,
    monthlyEvolution,
    top10Customers,
    originDistribution,
  } = useRevenueData()

  // State for Customer Combobox open/close
  const [customerComboOpen, setCustomerComboOpen] = useState(false)
  const [periodPopoverOpen, setPeriodPopoverOpen] = useState(false)

  // State for Table Pagination & Sorting
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [tableSearch, setTableSearch] = useState('')

  // Currency Formatter
  const formatBRL = (val: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(val || 0)
  }

  // Filter & paginate table rows
  const tableData = useMemo(() => {
    let list = [...filteredBillings]
    if (tableSearch.trim()) {
      const q = tableSearch.toLowerCase().trim()
      list = list.filter(
        (row) =>
          row.customer_name.toLowerCase().includes(q) ||
          row.customer_code.toLowerCase().includes(q) ||
          formatCompetenceLabel(row.month_year, 'full').toLowerCase().includes(q) ||
          row.customer_origin.toLowerCase().includes(q),
      )
    }
    return list
  }, [filteredBillings, tableSearch])

  const totalPages = Math.max(1, Math.ceil(tableData.length / pageSize))
  const paginatedRows = useMemo(() => {
    const start = (page - 1) * pageSize
    return tableData.slice(start, start + pageSize)
  }, [tableData, page, pageSize])

  // Handle selected customer label
  const selectedCustomerObj = useMemo(() => {
    if (filters.customerId === 'all') return null
    return availableCustomers.find((c) => c.id === filters.customerId) || null
  }, [availableCustomers, filters.customerId])

  // Quick Period Presets handler
  const handlePeriodPreset = (preset: 'all' | 'last6' | 'current') => {
    if (preset === 'all') {
      setMonthsFilter([])
    } else if (preset === 'last6') {
      const last6 = availableRuns.slice(0, 6).map((r) => r.month_year)
      setMonthsFilter(last6)
    } else if (preset === 'current') {
      if (availableRuns.length > 0) {
        setMonthsFilter([availableRuns[0].month_year])
      }
    }
    setPeriodPopoverOpen(false)
    setPage(1)
  }

  const toggleMonthSelection = (monthYear: string) => {
    let current =
      filters.selectedMonths.length === 0
        ? availableRuns.map((r) => r.month_year)
        : [...filters.selectedMonths]

    if (current.includes(monthYear)) {
      current = current.filter((m) => m !== monthYear)
    } else {
      current.push(monthYear)
    }
    setMonthsFilter(current)
    setPage(1)
  }

  const isPeriodPresetActive = (preset: 'all' | 'last6' | 'current') => {
    if (preset === 'all') return filters.selectedMonths.length === 0
    if (preset === 'current') {
      return (
        filters.selectedMonths.length === 1 &&
        availableRuns[0] &&
        filters.selectedMonths[0] === availableRuns[0].month_year
      )
    }
    if (preset === 'last6') {
      const last6 = availableRuns.slice(0, 6).map((r) => r.month_year)
      return (
        filters.selectedMonths.length === last6.length &&
        last6.every((m) => filters.selectedMonths.includes(m))
      )
    }
    return false
  }

  // Active filters count
  const activeFiltersCount = useMemo(() => {
    let c = 0
    if (
      filters.selectedMonths.length > 0 &&
      filters.selectedMonths.length !== availableRuns.length
    ) {
      c++
    }
    if (filters.origin !== 'all') c++
    if (filters.customerId !== 'all') c++
    return c
  }, [filters, availableRuns])

  // Export Table Data to CSV
  const handleExportCSV = () => {
    if (tableData.length === 0) return
    const headers = [
      'Mês/Competência',
      'Código Cliente',
      'Nome do Cliente',
      'Origem',
      'Faturamento Bruto (R$)',
      'Faturamento Líquido (R$)',
      'Impostos Retidos (R$)',
    ]
    const rows = tableData.map((r) => [
      formatCompetenceLabel(r.month_year, 'full'),
      `"${r.customer_code.replace(/"/g, '""')}"`,
      `"${r.customer_name.replace(/"/g, '""')}"`,
      r.customer_origin === 'inbound' ? 'Inbound' : 'Outbound',
      r.gross_amount.toFixed(2).replace('.', ','),
      r.net_amount.toFixed(2).replace('.', ','),
      Math.max(0, r.gross_amount - r.net_amount)
        .toFixed(2)
        .replace('.', ','),
    ])

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map((e) => e.join(';'))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute(
      'download',
      `faturamento_corporativo_${new Date().toISOString().split('T')[0]}.csv`,
    )
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="space-y-6">
      {/* 1. Header & Title Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-[#0F766E] uppercase tracking-wider">
            <BarChart3 className="h-4 w-4" />
            <span>Módulo Executivo de Business Intelligence (BI)</span>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mt-1">
            Dashboard de Faturamento Corporativo
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Visão gerencial e financeira da receita total, retenções fiscais e concentração de
            carteira da empresa.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            disabled={tableData.length === 0}
            className="border-slate-300 text-slate-700 hover:bg-slate-50 flex items-center gap-2"
          >
            <Download className="h-4 w-4 text-teal-700" />
            <span>Exportar CSV</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={resetFilters}
            disabled={activeFiltersCount === 0}
            className="border-slate-300 text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"
            title="Limpar filtros aplicados"
          >
            <RotateCcw className="h-3.5 w-3.5 text-slate-500" />
            <span>Redefinir</span>
          </Button>
        </div>
      </div>

      {/* 2. Global Filters Bar (Topo da página) */}
      <Card className="border-slate-200 shadow-sm bg-gradient-to-r from-slate-50/70 to-white">
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <Filter className="h-4 w-4 text-[#0F766E]" />
              <span>Filtros Globais:</span>
              {activeFiltersCount > 0 && (
                <Badge
                  variant="secondary"
                  className="bg-teal-50 text-teal-800 border-teal-200 font-bold"
                >
                  {activeFiltersCount} ativo{activeFiltersCount > 1 ? 's' : ''}
                </Badge>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1 lg:max-w-4xl">
              {/* Filter 1: Período (Meses de Competência) */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-600 flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5 text-slate-400" />
                  Período de Competência
                </label>
                <Popover open={periodPopoverOpen} onOpenChange={setPeriodPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-between text-left font-normal border-slate-300 bg-white h-9 px-3 text-xs sm:text-sm truncate"
                    >
                      <span className="truncate">
                        {filters.selectedMonths.length === 0
                          ? 'Todos os Meses'
                          : filters.selectedMonths.length === 1
                            ? formatCompetenceLabel(filters.selectedMonths[0], 'full')
                            : `${filters.selectedMonths.length} meses selecionados`}
                      </span>
                      <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 p-3" align="start">
                    <div className="space-y-3">
                      <div className="text-xs font-semibold text-slate-700 border-b pb-1.5 flex items-center justify-between">
                        <span>Selecionar Meses</span>
                        <span className="text-[10px] text-slate-400">
                          {availableRuns.length} disponíveis
                        </span>
                      </div>

                      {/* Presets */}
                      <div className="flex items-center gap-1.5 pb-2 border-b">
                        <Button
                          variant={isPeriodPresetActive('last6') ? 'default' : 'outline'}
                          size="sm"
                          className={cn(
                            'text-xs h-7 px-2.5',
                            isPeriodPresetActive('last6') && 'bg-[#0F766E] hover:bg-[#115E59]',
                          )}
                          onClick={() => handlePeriodPreset('last6')}
                        >
                          Últimos 6 meses
                        </Button>
                        <Button
                          variant={isPeriodPresetActive('current') ? 'default' : 'outline'}
                          size="sm"
                          className={cn(
                            'text-xs h-7 px-2.5',
                            isPeriodPresetActive('current') && 'bg-[#0F766E] hover:bg-[#115E59]',
                          )}
                          onClick={() => handlePeriodPreset('current')}
                        >
                          Mês Atual
                        </Button>
                        <Button
                          variant={isPeriodPresetActive('all') ? 'default' : 'outline'}
                          size="sm"
                          className={cn(
                            'text-xs h-7 px-2.5',
                            isPeriodPresetActive('all') && 'bg-[#0F766E] hover:bg-[#115E59]',
                          )}
                          onClick={() => handlePeriodPreset('all')}
                        >
                          Todos
                        </Button>
                      </div>

                      {/* Checkbox list of months */}
                      <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
                        {availableRuns.map((run) => {
                          const isChecked =
                            filters.selectedMonths.length === 0 ||
                            filters.selectedMonths.includes(run.month_year)
                          return (
                            <div
                              key={run.id}
                              onClick={() => toggleMonthSelection(run.month_year)}
                              className="flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-slate-100 cursor-pointer text-xs"
                            >
                              <div className="flex items-center gap-2">
                                <div
                                  className={cn(
                                    'h-4 w-4 rounded border flex items-center justify-center transition-colors',
                                    isChecked
                                      ? 'bg-[#0F766E] border-[#0F766E] text-white'
                                      : 'border-slate-300 bg-white',
                                  )}
                                >
                                  {isChecked && <Check className="h-3 w-3 stroke-[3]" />}
                                </div>
                                <span className="font-medium text-slate-800">
                                  {formatCompetenceLabel(run.month_year, 'full')}
                                </span>
                              </div>
                              <span className="text-[11px] text-slate-500 font-mono">
                                {formatBRL(run.gross_company_billing)}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Filter 2: Origem (Inbound / Outbound / Todos) */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-600 flex items-center gap-1">
                  <Layers className="h-3.5 w-3.5 text-slate-400" />
                  Origem do Canal
                </label>
                <Select
                  value={filters.origin}
                  onValueChange={(val: any) => {
                    setOriginFilter(val)
                    setPage(1)
                  }}
                >
                  <SelectTrigger className="w-full border-slate-300 bg-white h-9 px-3 text-xs sm:text-sm">
                    <SelectValue placeholder="Todas as origens" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as origens (Inbound + Outbound)</SelectItem>
                    <SelectItem value="inbound">Apenas Inbound</SelectItem>
                    <SelectItem value="outbound">Apenas Outbound</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Filter 3: Cliente Específico (Combobox pesquisável) */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-600 flex items-center gap-1">
                  <Building2 className="h-3.5 w-3.5 text-slate-400" />
                  Cliente Específico
                </label>
                <Popover open={customerComboOpen} onOpenChange={setCustomerComboOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={customerComboOpen}
                      className="w-full justify-between text-left font-normal border-slate-300 bg-white h-9 px-3 text-xs sm:text-sm truncate"
                    >
                      <span className="truncate">
                        {selectedCustomerObj
                          ? `${selectedCustomerObj.customer_code} - ${selectedCustomerObj.name}`
                          : 'Todos os Clientes'}
                      </span>
                      <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 p-0" align="end">
                    <Command>
                      <CommandInput placeholder="Pesquisar cliente ou código..." />
                      <CommandList>
                        <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
                        <CommandGroup>
                          <CommandItem
                            value="all todos clientes"
                            onSelect={() => {
                              setCustomerFilter('all')
                              setCustomerComboOpen(false)
                              setPage(1)
                            }}
                          >
                            <Check
                              className={cn(
                                'mr-2 h-4 w-4',
                                filters.customerId === 'all' ? 'opacity-100' : 'opacity-0',
                              )}
                            />
                            <span className="font-semibold text-slate-900">Todos os Clientes</span>
                          </CommandItem>
                          {availableCustomers.map((cust) => (
                            <CommandItem
                              key={cust.id}
                              value={`${cust.customer_code} ${cust.name}`}
                              onSelect={() => {
                                setCustomerFilter(cust.id)
                                setCustomerComboOpen(false)
                                setPage(1)
                              }}
                            >
                              <Check
                                className={cn(
                                  'mr-2 h-4 w-4',
                                  filters.customerId === cust.id ? 'opacity-100' : 'opacity-0',
                                )}
                              />
                              <div className="flex flex-col">
                                <span className="font-medium text-slate-800 text-xs">
                                  {cust.name}
                                </span>
                                <span className="text-[10px] text-slate-400">
                                  {cust.customer_code} &bull;{' '}
                                  {cust.origin === 'outbound' ? 'Outbound' : 'Inbound'}
                                </span>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 3. Cards de KPI (Visão Geral) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Faturamento Bruto Total */}
        <Card className="border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Faturamento Bruto Total
            </CardTitle>
            <div className="h-8 w-8 rounded-lg bg-teal-50 text-[#0F766E] flex items-center justify-center">
              <DollarSign className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ) : (
              <>
                <div className="text-2xl font-bold text-slate-900 tabular-nums">
                  {formatBRL(kpis.totalGross)}
                </div>
                <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                  <TrendingUp className="h-3 w-3 text-emerald-600" />
                  <span>Soma do gross_amount no período</span>
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* KPI 2: Faturamento Líquido Total */}
        <Card className="border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Faturamento Líquido Total
            </CardTitle>
            <div className="h-8 w-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Percent className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ) : (
              <>
                <div className="text-2xl font-bold text-slate-900 tabular-nums">
                  {formatBRL(kpis.totalNet)}
                </div>
                <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                  <span className="font-semibold text-emerald-700">
                    {kpis.totalGross > 0
                      ? `${((kpis.totalNet / kpis.totalGross) * 100).toFixed(1)}%`
                      : '0%'}
                  </span>
                  <span>da receita bruta total</span>
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* KPI 3: Impostos Retidos */}
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
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ) : (
              <>
                <div className="text-2xl font-bold text-slate-900 tabular-nums">
                  {formatBRL(kpis.totalTaxes)}
                </div>
                <p className="text-xs text-slate-500 mt-1">Diferença entre Bruto e Líquido</p>
              </>
            )}
          </CardContent>
        </Card>

        {/* KPI 4: Clientes Ativos */}
        <Card className="border-slate-200 shadow-sm hover:shadow-md transition-shadow bg-gradient-to-br from-white to-teal-50/40">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Clientes Ativos
            </CardTitle>
            <div className="h-8 w-8 rounded-lg bg-[#0F766E] text-white flex items-center justify-center">
              <Users className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ) : (
              <>
                <div className="text-2xl font-bold text-[#0F766E] tabular-nums">
                  {kpis.activeCustomersCount}
                </div>
                <p className="text-xs text-slate-500 mt-1">Clientes faturados no período</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 4. Visualização de Dados (Gráficos Recharts) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Gráfico 1: Evolução de Faturamento (Line Chart) — 2 colunas */}
        <Card className="lg:col-span-2 border-slate-200 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                <LineChartIcon className="h-4 w-4 text-[#0F766E]" />
                Evolução de Faturamento
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Comparativo histórico entre Faturamento Bruto e Faturamento Líquido por mês de
                competência
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-72 w-full flex items-center justify-center">
                <Skeleton className="h-64 w-full" />
              </div>
            ) : monthlyEvolution.length === 0 ? (
              <div className="h-72 flex items-center justify-center text-slate-400 text-sm">
                Nenhum faturamento registrado no período selecionado.
              </div>
            ) : (
              <div className="h-72 w-full pt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={monthlyEvolution}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                    <XAxis dataKey="monthLabel" stroke="#64748B" fontSize={12} tickLine={false} />
                    <YAxis
                      stroke="#64748B"
                      fontSize={11}
                      tickLine={false}
                      tickFormatter={(val) => `R$${(val / 1000).toFixed(0)}k`}
                    />
                    <RechartsTooltip
                      content={({ active, payload }) => {
                        if (!active || !payload || !payload.length) return null
                        const point = payload[0].payload as MonthEvolutionPoint
                        return (
                          <div className="bg-slate-900 text-white p-3 rounded-lg shadow-xl text-xs space-y-1.5 border border-slate-700">
                            <div className="font-semibold text-slate-200 border-b border-slate-800 pb-1">
                              {point.monthFullLabel}
                            </div>
                            <div className="flex items-center justify-between gap-4">
                              <span className="text-teal-400 flex items-center gap-1.5">
                                <span className="h-2 w-2 rounded-full bg-teal-400 inline-block" />
                                Fat. Bruto:
                              </span>
                              <span className="font-mono font-bold">
                                {formatBRL(point.grossAmount)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                              <span className="text-emerald-400 flex items-center gap-1.5">
                                <span className="h-2 w-2 rounded-full bg-emerald-400 inline-block" />
                                Fat. Líquido:
                              </span>
                              <span className="font-mono font-bold">
                                {formatBRL(point.netAmount)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-4 text-slate-400 text-[11px] pt-0.5 border-t border-slate-800">
                              <span>Impostos:</span>
                              <span className="font-mono">{formatBRL(point.taxAmount)}</span>
                            </div>
                          </div>
                        )
                      }}
                    />
                    <Legend
                      verticalAlign="top"
                      height={36}
                      formatter={(value) => (
                        <span className="text-xs font-medium text-slate-700">{value}</span>
                      )}
                    />
                    <Line
                      type="monotone"
                      dataKey="grossAmount"
                      name="Faturamento Bruto"
                      stroke="#0F766E"
                      strokeWidth={3}
                      dot={{ r: 4, fill: '#0F766E', strokeWidth: 1, stroke: '#fff' }}
                      activeDot={{ r: 6 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="netAmount"
                      name="Faturamento Líquido"
                      stroke="#10B981"
                      strokeWidth={2.5}
                      strokeDasharray="4 4"
                      dot={{ r: 4, fill: '#10B981', strokeWidth: 1, stroke: '#fff' }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Gráfico 2: Distribuição por Origem (Donut / Pie Chart) — 1 coluna */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <PieChartIcon className="h-4 w-4 text-[#0F766E]" />
              Distribuição por Origem
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Faturamento Bruto segmentado entre Inbound e Outbound
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-72 w-full flex items-center justify-center">
                <Skeleton className="h-56 w-56 rounded-full" />
              </div>
            ) : kpis.totalGross === 0 ? (
              <div className="h-72 flex items-center justify-center text-slate-400 text-sm">
                Sem dados no período.
              </div>
            ) : (
              <div className="h-72 w-full flex flex-col items-center justify-center">
                <div className="h-52 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={originDistribution}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={80}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {originDistribution.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                      <RechartsTooltip
                        content={({ active, payload }) => {
                          if (!active || !payload || !payload.length) return null
                          const item = payload[0].payload as OriginDistributionPoint
                          return (
                            <div className="bg-slate-900 text-white p-2.5 rounded-lg shadow-xl text-xs space-y-1 border border-slate-700">
                              <div className="font-semibold">{item.label}</div>
                              <div className="font-mono text-teal-300 font-bold">
                                {formatBRL(item.value)}
                              </div>
                              <div className="text-[11px] text-slate-400">
                                {item.percentage}% do total faturado
                              </div>
                            </div>
                          )
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Custom Legend underneath Donut */}
                <div className="flex items-center justify-center gap-6 mt-1 w-full pt-2 border-t border-slate-100">
                  {originDistribution.map((entry) => (
                    <div key={entry.origin} className="flex items-center gap-2 text-xs">
                      <span
                        className="h-3 w-3 rounded-sm inline-block"
                        style={{ backgroundColor: entry.fill }}
                      />
                      <span className="font-medium text-slate-700">{entry.label}:</span>
                      <span className="font-bold text-slate-900">{entry.percentage}%</span>
                      <span className="text-[11px] text-slate-500">({formatBRL(entry.value)})</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Gráfico 3: Ranking Top 10 Clientes (Bar Chart Horizontal) */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-[#0F766E]" />
                Ranking Top 10 Clientes
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Maiores faturamentos brutos acumulados no período filtrado
              </CardDescription>
            </div>
            {top10Customers.length > 0 && (
              <Badge variant="outline" className="text-xs text-slate-600 bg-slate-50">
                Top 10 representa{' '}
                <strong className="text-slate-900 ml-1">
                  {top10Customers.reduce((acc, c) => acc + c.percentageOfTotal, 0).toFixed(1)}%
                </strong>{' '}
                do faturamento filtrado
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="h-80 w-full flex items-center justify-center">
              <Skeleton className="h-72 w-full" />
            </div>
          ) : top10Customers.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-slate-400 text-sm">
              Nenhum cliente para exibir com os filtros atuais.
            </div>
          ) : (
            <div className="h-80 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={top10Customers}
                  layout="vertical"
                  margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#F1F5F9"
                    horizontal={true}
                    vertical={false}
                  />
                  <XAxis
                    type="number"
                    stroke="#64748B"
                    fontSize={11}
                    tickLine={false}
                    tickFormatter={(val) => `R$${(val / 1000).toFixed(0)}k`}
                  />
                  <YAxis
                    dataKey="customerName"
                    type="category"
                    stroke="#64748B"
                    fontSize={11}
                    tickLine={false}
                    width={180}
                    tickFormatter={(name) =>
                      name.length > 24 ? `${name.substring(0, 24)}...` : name
                    }
                  />
                  <RechartsTooltip
                    content={({ active, payload }) => {
                      if (!active || !payload || !payload.length) return null
                      const cust = payload[0].payload as CustomerRankingPoint
                      return (
                        <div className="bg-slate-900 text-white p-3 rounded-lg shadow-xl text-xs space-y-1.5 border border-slate-700 max-w-sm">
                          <div className="font-semibold text-slate-200 border-b border-slate-800 pb-1">
                            {cust.customerName}
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-slate-400">Código:</span>
                            <span className="font-mono">{cust.customerCode}</span>
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-slate-400">Canal:</span>
                            <span className="capitalize">{cust.origin}</span>
                          </div>
                          <div className="flex items-center justify-between gap-4 text-teal-400">
                            <span className="font-semibold">Faturamento Bruto:</span>
                            <span className="font-mono font-bold">
                              {formatBRL(cust.grossAmount)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-4 text-emerald-400">
                            <span>Faturamento Líquido:</span>
                            <span className="font-mono">{formatBRL(cust.netAmount)}</span>
                          </div>
                          <div className="flex items-center justify-between gap-4 text-slate-400 text-[11px] pt-1 border-t border-slate-800">
                            <span>Participação no período:</span>
                            <span className="font-mono font-bold text-teal-300">
                              {cust.percentageOfTotal}%
                            </span>
                          </div>
                        </div>
                      )
                    }}
                  />
                  <Bar
                    dataKey="grossAmount"
                    name="Faturamento Bruto"
                    fill="#0F766E"
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 5. Tabela Analítica (Data Table) */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base font-bold text-slate-900">
                Detalhamento Analítico de Faturamentos
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Registros individuais consolidados com os filtros globais aplicados (
                {tableData.length} registro{tableData.length !== 1 ? 's' : ''})
              </CardDescription>
            </div>

            {/* In-table search filter */}
            <div className="flex items-center gap-2">
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filtrar tabela..."
                  value={tableSearch}
                  onChange={(e) => {
                    setTableSearch(e.target.value)
                    setPage(1)
                  }}
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md border border-slate-300 bg-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-teal-600 focus:border-teal-600"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2 py-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : paginatedRows.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-sm">
              Nenhum faturamento encontrado com os filtros e busca aplicados.
            </div>
          ) : (
            <div className="rounded-lg border border-slate-200 overflow-hidden">
              <Table>
                <TableHeader className="bg-slate-50/80">
                  <TableRow>
                    <TableHead className="w-[160px] text-xs font-semibold text-slate-700">
                      Mês/Competência
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-slate-700">
                      Nome do Cliente
                    </TableHead>
                    <TableHead className="w-[120px] text-xs font-semibold text-slate-700">
                      Origem
                    </TableHead>
                    <TableHead className="w-[180px] text-right text-xs font-semibold text-slate-700">
                      Faturamento Bruto
                    </TableHead>
                    <TableHead className="w-[180px] text-right text-xs font-semibold text-slate-700">
                      Faturamento Líquido
                    </TableHead>
                    <TableHead className="w-[140px] text-right text-xs font-semibold text-slate-700">
                      Impostos
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedRows.map((row) => {
                    const taxes = Math.max(0, row.gross_amount - row.net_amount)
                    return (
                      <TableRow key={row.id} className="hover:bg-slate-50/60">
                        <TableCell className="font-medium text-slate-800 text-xs">
                          {formatCompetenceLabel(row.month_year, 'full')}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-semibold text-slate-900 text-xs">
                              {row.customer_name}
                            </span>
                            <span className="text-[11px] text-slate-400 font-mono">
                              {row.customer_code}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[10px] font-semibold capitalize',
                              row.customer_origin === 'outbound'
                                ? 'bg-blue-50 text-blue-700 border-blue-200'
                                : 'bg-teal-50 text-teal-700 border-teal-200',
                            )}
                          >
                            {row.customer_origin || 'Inbound'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold text-slate-900 text-xs">
                          {formatBRL(row.gross_amount)}
                        </TableCell>
                        <TableCell className="text-right font-mono font-semibold text-emerald-700 text-xs">
                          {formatBRL(row.net_amount)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-slate-500 text-xs">
                          {formatBRL(taxes)}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination Controls */}
          {!loading && tableData.length > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-4 text-xs text-slate-500">
              <div className="flex items-center gap-2">
                <span>Exibindo linhas por página:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value))
                    setPage(1)
                  }}
                  className="border border-slate-300 rounded px-2 py-1 bg-white text-xs text-slate-700 focus:outline-none"
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
                <span className="text-slate-400">&bull;</span>
                <span>
                  Total de <strong>{tableData.length}</strong> itens
                </span>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto">
                <span className="mr-1">
                  Página <strong>{page}</strong> de <strong>{totalPages}</strong>
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="h-7 w-7 p-0"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="h-7 w-7 p-0"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
