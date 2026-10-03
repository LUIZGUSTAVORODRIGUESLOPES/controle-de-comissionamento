// AVOID UPDATING THIS FILE DIRECTLY. It is automatically generated.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.18'
  }
  public: {
    Tables: {
      billings: {
        Row: {
          created_at: string
          customer_id: string
          gross_amount: number
          id: string
          monthly_run_id: string
          net_amount: number
          tax_deductions_applied_json: Json | null
        }
        Insert: {
          created_at?: string
          customer_id: string
          gross_amount?: number
          id?: string
          monthly_run_id: string
          net_amount?: number
          tax_deductions_applied_json?: Json | null
        }
        Update: {
          created_at?: string
          customer_id?: string
          gross_amount?: number
          id?: string
          monthly_run_id?: string
          net_amount?: number
          tax_deductions_applied_json?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: 'billings_customer_id_fkey'
            columns: ['customer_id']
            isOneToOne: false
            referencedRelation: 'customers'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'billings_monthly_run_id_fkey'
            columns: ['monthly_run_id']
            isOneToOne: false
            referencedRelation: 'monthly_runs'
            referencedColumns: ['id']
          },
        ]
      }
      commission_profiles: {
        Row: {
          created_at: string
          default_percentage_year_1: number
          default_percentage_year_2_plus: number
          id: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          default_percentage_year_1?: number
          default_percentage_year_2_plus?: number
          id?: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          default_percentage_year_1?: number
          default_percentage_year_2_plus?: number
          id?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'commission_profiles_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      commissions: {
        Row: {
          billing_id: string
          commission_amount: number
          created_at: string
          id: string
          percentage_applied: number
          user_id: string
        }
        Insert: {
          billing_id: string
          commission_amount?: number
          created_at?: string
          id?: string
          percentage_applied?: number
          user_id: string
        }
        Update: {
          billing_id?: string
          commission_amount?: number
          created_at?: string
          id?: string
          percentage_applied?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'commissions_billing_id_fkey'
            columns: ['billing_id']
            isOneToOne: false
            referencedRelation: 'billings'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'commissions_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      customer_users: {
        Row: {
          commission_type: string | null
          created_at: string
          customer_id: string
          id: string
          user_id: string
        }
        Insert: {
          commission_type?: string | null
          created_at?: string
          customer_id: string
          id?: string
          user_id: string
        }
        Update: {
          commission_type?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'customer_users_customer_id_fkey'
            columns: ['customer_id']
            isOneToOne: false
            referencedRelation: 'customers'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'customer_users_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      customers: {
        Row: {
          created_at: string
          customer_code: string
          id: string
          name: string
          no_commission_flag: boolean
          origin: string | null
          start_date: string | null
        }
        Insert: {
          created_at?: string
          customer_code: string
          id?: string
          name: string
          no_commission_flag?: boolean
          origin?: string | null
          start_date?: string | null
        }
        Update: {
          created_at?: string
          customer_code?: string
          id?: string
          name?: string
          no_commission_flag?: boolean
          origin?: string | null
          start_date?: string | null
        }
        Relationships: []
      }
      monthly_runs: {
        Row: {
          created_at: string
          gross_company_billing: number
          id: string
          month_year: string
          status: string
        }
        Insert: {
          created_at?: string
          gross_company_billing?: number
          id?: string
          month_year: string
          status?: string
        }
        Update: {
          created_at?: string
          gross_company_billing?: number
          id?: string
          month_year?: string
          status?: string
        }
        Relationships: []
      }
      tax_deductions: {
        Row: {
          created_at: string
          formula_expression: string | null
          id: string
          is_active: boolean
          name: string
          type: string
          value: number | null
        }
        Insert: {
          created_at?: string
          formula_expression?: string | null
          id?: string
          is_active?: boolean
          name: string
          type: string
          value?: number | null
        }
        Update: {
          created_at?: string
          formula_expression?: string | null
          id?: string
          is_active?: boolean
          name?: string
          type?: string
          value?: number | null
        }
        Relationships: []
      }
      users: {
        Row: {
          created_at: string
          email: string
          fixed_salary: number
          id: string
          name: string
          role: string
        }
        Insert: {
          created_at?: string
          email: string
          fixed_salary?: number
          id: string
          name: string
          role: string
        }
        Update: {
          created_at?: string
          email?: string
          fixed_salary?: number
          id?: string
          name?: string
          role?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
