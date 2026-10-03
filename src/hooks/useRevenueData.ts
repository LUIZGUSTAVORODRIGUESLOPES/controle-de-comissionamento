import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  getRevenueMonthlyRuns,
  getRevenueCustomers,
  getRevenueBillings,
  type RevenueBillingRow,
  type RevenueMonthlyRunOption,
  type RevenueCustomerOption,
  type RevenueFilters,
} from '@/services/revenueService'

export interface MonthEvolutionPoint {
  monthKey: string // YYYY-MM
  monthLabel: string // e.g. "Jun/26"
  monthFullLabel: string // e.g. "Junho de 2026"
  grossAmount: number
  netAmount: number
  taxAmount: number
}

export interface CustomerRankingPoint {
  customerId: string
  customerName: string
  customerCode: string
  origin: string
  grossAmount: number
  netAmount: number
  percentageOfTotal: number
}

export interface OriginDistributionPoint {
  origin: string
  label: string
  value: number
  percentage: number
  fill: string
}

export interface RevenueKpis {
  totalGross: number
  totalNet: number
  totalTaxes: number
  activeCustomersCount: number
}

const MONTH_NAMES_SHORT = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
]

const MONTH_NAMES_FULL = [
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

export function formatCompetenceLabel(dateStr: string, format: 'short' | 'full' = 'short'): string {
  if (!dateStr) return ''
  const [yearStr, monthStr] = dateStr.split('-')
  const monthIdx = parseInt(monthStr, 10) - 1
  if (isNaN(monthIdx) || monthIdx < 0 || monthIdx > 11) return dateStr

  if (format === 'short') {
    return `${MONTH_NAMES_SHORT[monthIdx]}/${yearStr.slice(2)}`
  }
  return `${MONTH_NAMES_FULL[monthIdx]} de ${yearStr}`
}

export function useRevenueData() {
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  const [availableRuns, setAvailableRuns] = useState<RevenueMonthlyRunOption[]>([])
  const [availableCustomers, setAvailableCustomers] = useState<RevenueCustomerOption[]>([])
  const [rawBillings, setRawBillings] = useState<RevenueBillingRow[]>([])

  // Global filters
  const [filters, setFilters] = useState<RevenueFilters>({
    selectedMonths: [], // empty initially, will default to last 6 months once loaded
    origin: 'all',
    customerId: 'all',
  })

  // Fetch initial master data
  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [runsData, customersData, billingsData] = await Promise.all([
        getRevenueMonthlyRuns(),
        getRevenueCustomers(),
        getRevenueBillings(),
      ])

      setAvailableRuns(runsData)
      setAvailableCustomers(customersData)
      setRawBillings(billingsData)

      // Default selectedMonths: all available runs (up to 6 most recent)
      const defaultMonths = runsData.slice(0, 6).map((r) => r.month_year)
      setFilters((prev) => {
        // Only set if not already selected
        if (prev.selectedMonths.length === 0 && defaultMonths.length > 0) {
          return { ...prev, selectedMonths: defaultMonths }
        }
        return prev
      })
    } catch (err: any) {
      console.error('Falha ao carregar dados do Revenue BI:', err)
      setError(err?.message || 'Erro ao carregar dados de faturamento corporativo.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Filter raw billings based on active filters
  const filteredBillings = useMemo(() => {
    return rawBillings.filter((row) => {
      // 1. Month filter (if specific months are selected)
      if (filters.selectedMonths.length > 0) {
        if (!filters.selectedMonths.includes(row.month_year)) {
          return false
        }
      }

      // 2. Origin filter
      if (filters.origin !== 'all') {
        if (row.customer_origin !== filters.origin) {
          return false
        }
      }

      // 3. Customer filter
      if (filters.customerId !== 'all') {
        if (row.customer_id !== filters.customerId) {
          return false
        }
      }

      return true
    })
  }, [rawBillings, filters])

  // Calculate 4 Overview KPIs
  const kpis: RevenueKpis = useMemo(() => {
    let totalGross = 0
    let totalNet = 0
    const distinctCustomers = new Set<string>()

    for (const b of filteredBillings) {
      totalGross += b.gross_amount
      totalNet += b.net_amount
      if (b.gross_amount > 0) {
        distinctCustomers.add(b.customer_id)
      }
    }

    const totalTaxes = Math.max(0, totalGross - totalNet)
    return {
      totalGross,
      totalNet,
      totalTaxes,
      activeCustomersCount: distinctCustomers.size,
    }
  }, [filteredBillings])

  // 1. Evolution by Month (Line Chart)
  // Ordered chronologically (oldest to newest)
  const monthlyEvolution = useMemo<MonthEvolutionPoint[]>(() => {
    // Determine which months to present:
    // If user filtered by selectedMonths, use those months; otherwise all available
    const monthsToInclude =
      filters.selectedMonths.length > 0
        ? [...filters.selectedMonths]
        : availableRuns.map((r) => r.month_year)

    // Sort chronologically ascending
    monthsToInclude.sort((a, b) => a.localeCompare(b))

    const monthMap = new Map<string, { gross: number; net: number }>()
    for (const m of monthsToInclude) {
      monthMap.set(m, { gross: 0, net: 0 })
    }

    for (const b of filteredBillings) {
      if (monthMap.has(b.month_year)) {
        const curr = monthMap.get(b.month_year)!
        curr.gross += b.gross_amount
        curr.net += b.net_amount
      }
    }

    return monthsToInclude.map((m) => {
      const data = monthMap.get(m) || { gross: 0, net: 0 }
      const tax = Math.max(0, data.gross - data.net)
      return {
        monthKey: m.slice(0, 7),
        monthLabel: formatCompetenceLabel(m, 'short'),
        monthFullLabel: formatCompetenceLabel(m, 'full'),
        grossAmount: Math.round(data.gross * 100) / 100,
        netAmount: Math.round(data.net * 100) / 100,
        taxAmount: Math.round(tax * 100) / 100,
      }
    })
  }, [availableRuns, filters.selectedMonths, filteredBillings])

  // 2. Top 10 Customers Ranking (Horizontal Bar Chart)
  const top10Customers = useMemo<CustomerRankingPoint[]>(() => {
    const custMap = new Map<
      string,
      {
        customerId: string
        customerName: string
        customerCode: string
        origin: string
        grossAmount: number
        netAmount: number
      }
    >()

    for (const b of filteredBillings) {
      const existing = custMap.get(b.customer_id)
      if (existing) {
        existing.grossAmount += b.gross_amount
        existing.netAmount += b.net_amount
      } else {
        custMap.set(b.customer_id, {
          customerId: b.customer_id,
          customerName: b.customer_name,
          customerCode: b.customer_code,
          origin: b.customer_origin,
          grossAmount: b.gross_amount,
          netAmount: b.net_amount,
        })
      }
    }

    const totalFilteredGross = kpis.totalGross || 1
    const sorted = Array.from(custMap.values()).sort((a, b) => b.grossAmount - a.grossAmount)

    return sorted.slice(0, 10).map((c) => ({
      ...c,
      grossAmount: Math.round(c.grossAmount * 100) / 100,
      netAmount: Math.round(c.netAmount * 100) / 100,
      percentageOfTotal: Math.round((c.grossAmount / totalFilteredGross) * 1000) / 10,
    }))
  }, [filteredBillings, kpis.totalGross])

  // 3. Distribution by Origin (Donut / Pie Chart)
  const originDistribution = useMemo<OriginDistributionPoint[]>(() => {
    let inboundTotal = 0
    let outboundTotal = 0

    for (const b of filteredBillings) {
      if (b.customer_origin === 'outbound') {
        outboundTotal += b.gross_amount
      } else {
        inboundTotal += b.gross_amount
      }
    }

    const total = inboundTotal + outboundTotal
    const safeTotal = total > 0 ? total : 1

    return [
      {
        origin: 'inbound',
        label: 'Inbound',
        value: Math.round(inboundTotal * 100) / 100,
        percentage: Math.round((inboundTotal / safeTotal) * 1000) / 10,
        fill: '#0F766E', // Teal primary
      },
      {
        origin: 'outbound',
        label: 'Outbound',
        value: Math.round(outboundTotal * 100) / 100,
        percentage: Math.round((outboundTotal / safeTotal) * 1000) / 10,
        fill: '#3B82F6', // Sky blue
      },
    ]
  }, [filteredBillings])

  // Handlers for modifying filters
  const setMonthsFilter = (months: string[]) => {
    setFilters((prev) => ({ ...prev, selectedMonths: months }))
  }

  const setOriginFilter = (origin: 'all' | 'inbound' | 'outbound') => {
    setFilters((prev) => ({ ...prev, origin }))
  }

  const setCustomerFilter = (customerId: string) => {
    setFilters((prev) => ({ ...prev, customerId }))
  }

  const resetFilters = () => {
    const defaultMonths = availableRuns.slice(0, 6).map((r) => r.month_year)
    setFilters({
      selectedMonths: defaultMonths,
      origin: 'all',
      customerId: 'all',
    })
  }

  return {
    loading,
    error,
    refresh: loadData,
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
  }
}
