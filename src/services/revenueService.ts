import { db } from '@/lib/supabase/db'
import type { CustomerOrigin } from '@/types/database'

export interface RevenueBillingRow {
  id: string
  monthly_run_id: string
  customer_id: string
  gross_amount: number
  net_amount: number
  month_year: string // YYYY-MM-DD
  status: string
  customer_name: string
  customer_code: string
  customer_origin: CustomerOrigin
}

export interface RevenueMonthlyRunOption {
  id: string
  month_year: string
  status: string
  gross_company_billing: number
}

export interface RevenueCustomerOption {
  id: string
  name: string
  customer_code: string
  origin: CustomerOrigin | null
}

export interface RevenueFilters {
  // Array of month_year strings (YYYY-MM-DD) or 'all'
  selectedMonths: string[]
  origin: 'all' | 'inbound' | 'outbound'
  customerId: string // 'all' or customer UUID
}

/**
 * Fetches all available monthly runs for the filter options (ordered chronologically or reverse)
 */
export async function getRevenueMonthlyRuns(): Promise<RevenueMonthlyRunOption[]> {
  const { data, error } = await db
    .from('monthly_runs')
    .select('id, month_year, status, gross_company_billing')
    .order('month_year', { ascending: false })

  if (error) {
    console.error('Erro ao buscar competências para Revenue BI:', error)
    throw error
  }

  return (data as RevenueMonthlyRunOption[]) || []
}

/**
 * Fetches all customers for the filter dropdown
 */
export async function getRevenueCustomers(): Promise<RevenueCustomerOption[]> {
  const { data, error } = await db
    .from('customers')
    .select('id, name, customer_code, origin')
    .order('name', { ascending: true })

  if (error) {
    console.error('Erro ao buscar clientes para Revenue BI:', error)
    throw error
  }

  return (data as RevenueCustomerOption[]) || []
}

/**
 * Fetches all billings joined with monthly_runs and customers
 */
export async function getRevenueBillings(): Promise<RevenueBillingRow[]> {
  const { data, error } = await db
    .from('billings')
    .select(
      `
      id,
      monthly_run_id,
      customer_id,
      gross_amount,
      net_amount,
      monthly_runs!inner (
        id,
        month_year,
        status
      ),
      customers!inner (
        id,
        name,
        customer_code,
        origin
      )
    `,
    )
    .order('gross_amount', { ascending: false })

  if (error) {
    console.error('Erro ao buscar faturamento consolidado:', error)
    throw error
  }

  if (!data) return []

  return data
    .filter((item: any) => Number(item.gross_amount) > 0)
    .map((item: any) => ({
      id: item.id,
      monthly_run_id: item.monthly_run_id,
      customer_id: item.customer_id,
      gross_amount: Number(item.gross_amount) || 0,
      net_amount: Number(item.net_amount) || 0,
      month_year: item.monthly_runs?.month_year || '',
      status: item.monthly_runs?.status || '',
      customer_name: item.customers?.name || 'Cliente Sem Nome',
      customer_code: item.customers?.customer_code || '',
      customer_origin: (item.customers?.origin as CustomerOrigin) || 'inbound',
    }))
}
