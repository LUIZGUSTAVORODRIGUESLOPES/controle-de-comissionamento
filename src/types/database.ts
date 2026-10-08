export type UserRole = 'admin' | 'manager' | 'sales'
export type CustomerOrigin = 'inbound' | 'outbound'
export type TaxDeductionType = 'percentage' | 'formula'
export type MonthlyRunStatus = 'pending' | 'processed' | 'paid'

export interface AppUser {
  id: string
  name: string
  email: string
  role: UserRole
  fixed_salary: number
  auto_send_report_to_self?: boolean
  cc_hr?: boolean
  cc_finance?: boolean
  must_change_password?: boolean | null
  is_active?: boolean
  created_at?: string
}

export interface SystemSettings {
  id: string
  company_name: string
  company_logo_url: string | null
  hr_email: string | null
  finance_email: string | null
  updated_at?: string
}

export interface CommissionProfile {
  id: string
  user_id: string
  type: CustomerOrigin
  default_percentage_year_1: number
  default_percentage_year_2_plus: number
  setup_fee_percentage?: number | null
  valid_from?: string
  valid_until?: string | null
  is_active?: boolean
  created_at?: string
  user?: AppUser
}

export interface Customer {
  id: string
  customer_code: string
  name: string
  origin: CustomerOrigin
  start_date: string
  no_commission_flag: boolean
  is_active: boolean
  created_at: string
  customer_users?: CustomerUserLink[]
}
export interface CustomerUserLink {
  id: string
  customer_id: string
  user_id: string
  commission_type?: 'inbound' | 'outbound' | 'fixed' | string
  valid_from?: string
  valid_until?: string | null
  created_at?: string
  user?: AppUser
}

export interface TaxDeduction {
  id: string
  name: string
  type: TaxDeductionType
  value: number | null
  formula_expression: string | null
  is_active: boolean
  created_at?: string
}

export interface MonthlyRun {
  id: string
  month_year: string
  gross_company_billing: number
  status: MonthlyRunStatus
  created_at?: string
}

export interface AppliedTaxSnapshot {
  name: string
  type: TaxDeductionType
  value?: number | null
  expression?: string | null
  deducted: number
}

export interface Billing {
  id: string
  monthly_run_id: string
  customer_id: string
  gross_amount: number
  net_amount: number
  tax_deductions_applied_json: AppliedTaxSnapshot[] | null
  created_at?: string
  customer?: Customer
}

export interface Commission {
  id: string
  billing_id: string
  user_id: string
  percentage_applied: number
  commission_amount: number
  created_at?: string
  user?: AppUser
  billing?: Billing
}
