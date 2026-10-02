-- Enable pgcrypto for password hashing if needed
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Table: public.users
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'sales')),
  fixed_salary NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Table: public.commission_profiles
CREATE TABLE IF NOT EXISTS public.commission_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('inbound', 'outbound')),
  default_percentage_year_1 NUMERIC NOT NULL DEFAULT 0,
  default_percentage_year_2_plus NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Table: public.customers
CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_code VARCHAR UNIQUE NOT NULL,
  name TEXT NOT NULL,
  origin TEXT CHECK (origin IN ('inbound', 'outbound')),
  start_date DATE,
  no_commission_flag BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Table: public.customer_users
CREATE TABLE IF NOT EXISTS public.customer_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT customer_users_unique UNIQUE (customer_id, user_id)
);

-- 5. Table: public.tax_deductions
CREATE TABLE IF NOT EXISTS public.tax_deductions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('percentage', 'formula')),
  value NUMERIC,
  formula_expression TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Table: public.monthly_runs
CREATE TABLE IF NOT EXISTS public.monthly_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month_year DATE NOT NULL UNIQUE,
  gross_company_billing NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Table: public.billings
CREATE TABLE IF NOT EXISTS public.billings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  monthly_run_id UUID NOT NULL REFERENCES public.monthly_runs(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  gross_amount NUMERIC NOT NULL DEFAULT 0,
  net_amount NUMERIC NOT NULL DEFAULT 0,
  tax_deductions_applied_json JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Table: public.commissions
CREATE TABLE IF NOT EXISTS public.commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_id UUID NOT NULL REFERENCES public.billings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  percentage_applied NUMERIC NOT NULL DEFAULT 0,
  commission_amount NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_commission_profiles_user ON public.commission_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_customer_users_cust ON public.customer_users(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_users_user ON public.customer_users(user_id);
CREATE INDEX IF NOT EXISTS idx_billings_run ON public.billings(monthly_run_id);
CREATE INDEX IF NOT EXISTS idx_billings_cust ON public.billings(customer_id);
CREATE INDEX IF NOT EXISTS idx_commissions_billing ON public.commissions(billing_id);
CREATE INDEX IF NOT EXISTS idx_commissions_user ON public.commissions(user_id);

-- Enable RLS on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_deductions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for authenticated users
-- public.users
DROP POLICY IF EXISTS "authenticated_select_users" ON public.users;
CREATE POLICY "authenticated_select_users" ON public.users FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "authenticated_insert_users" ON public.users;
CREATE POLICY "authenticated_insert_users" ON public.users FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "authenticated_update_users" ON public.users;
CREATE POLICY "authenticated_update_users" ON public.users FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "authenticated_delete_users" ON public.users;
CREATE POLICY "authenticated_delete_users" ON public.users FOR DELETE TO authenticated USING (true);

-- public.commission_profiles
DROP POLICY IF EXISTS "authenticated_select_commission_profiles" ON public.commission_profiles;
CREATE POLICY "authenticated_select_commission_profiles" ON public.commission_profiles FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "authenticated_insert_commission_profiles" ON public.commission_profiles;
CREATE POLICY "authenticated_insert_commission_profiles" ON public.commission_profiles FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "authenticated_update_commission_profiles" ON public.commission_profiles;
CREATE POLICY "authenticated_update_commission_profiles" ON public.commission_profiles FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "authenticated_delete_commission_profiles" ON public.commission_profiles;
CREATE POLICY "authenticated_delete_commission_profiles" ON public.commission_profiles FOR DELETE TO authenticated USING (true);

-- public.customers
DROP POLICY IF EXISTS "authenticated_select_customers" ON public.customers;
CREATE POLICY "authenticated_select_customers" ON public.customers FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "authenticated_insert_customers" ON public.customers;
CREATE POLICY "authenticated_insert_customers" ON public.customers FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "authenticated_update_customers" ON public.customers;
CREATE POLICY "authenticated_update_customers" ON public.customers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "authenticated_delete_customers" ON public.customers;
CREATE POLICY "authenticated_delete_customers" ON public.customers FOR DELETE TO authenticated USING (true);

-- public.customer_users
DROP POLICY IF EXISTS "authenticated_select_customer_users" ON public.customer_users;
CREATE POLICY "authenticated_select_customer_users" ON public.customer_users FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "authenticated_insert_customer_users" ON public.customer_users;
CREATE POLICY "authenticated_insert_customer_users" ON public.customer_users FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "authenticated_update_customer_users" ON public.customer_users;
CREATE POLICY "authenticated_update_customer_users" ON public.customer_users FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "authenticated_delete_customer_users" ON public.customer_users;
CREATE POLICY "authenticated_delete_customer_users" ON public.customer_users FOR DELETE TO authenticated USING (true);

-- public.tax_deductions
DROP POLICY IF EXISTS "authenticated_select_tax_deductions" ON public.tax_deductions;
CREATE POLICY "authenticated_select_tax_deductions" ON public.tax_deductions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "authenticated_insert_tax_deductions" ON public.tax_deductions;
CREATE POLICY "authenticated_insert_tax_deductions" ON public.tax_deductions FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "authenticated_update_tax_deductions" ON public.tax_deductions;
CREATE POLICY "authenticated_update_tax_deductions" ON public.tax_deductions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "authenticated_delete_tax_deductions" ON public.tax_deductions;
CREATE POLICY "authenticated_delete_tax_deductions" ON public.tax_deductions FOR DELETE TO authenticated USING (true);

-- public.monthly_runs
DROP POLICY IF EXISTS "authenticated_select_monthly_runs" ON public.monthly_runs;
CREATE POLICY "authenticated_select_monthly_runs" ON public.monthly_runs FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "authenticated_insert_monthly_runs" ON public.monthly_runs;
CREATE POLICY "authenticated_insert_monthly_runs" ON public.monthly_runs FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "authenticated_update_monthly_runs" ON public.monthly_runs;
CREATE POLICY "authenticated_update_monthly_runs" ON public.monthly_runs FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "authenticated_delete_monthly_runs" ON public.monthly_runs;
CREATE POLICY "authenticated_delete_monthly_runs" ON public.monthly_runs FOR DELETE TO authenticated USING (true);

-- public.billings
DROP POLICY IF EXISTS "authenticated_select_billings" ON public.billings;
CREATE POLICY "authenticated_select_billings" ON public.billings FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "authenticated_insert_billings" ON public.billings;
CREATE POLICY "authenticated_insert_billings" ON public.billings FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "authenticated_update_billings" ON public.billings;
CREATE POLICY "authenticated_update_billings" ON public.billings FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "authenticated_delete_billings" ON public.billings;
CREATE POLICY "authenticated_delete_billings" ON public.billings FOR DELETE TO authenticated USING (true);

-- public.commissions
DROP POLICY IF EXISTS "authenticated_select_commissions" ON public.commissions;
CREATE POLICY "authenticated_select_commissions" ON public.commissions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "authenticated_insert_commissions" ON public.commissions;
CREATE POLICY "authenticated_insert_commissions" ON public.commissions FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "authenticated_update_commissions" ON public.commissions;
CREATE POLICY "authenticated_update_commissions" ON public.commissions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "authenticated_delete_commissions" ON public.commissions;
CREATE POLICY "authenticated_delete_commissions" ON public.commissions FOR DELETE TO authenticated USING (true);

-- ==============================================================================
-- Seeds: Users, Commission Profiles, Tax Deductions, Customers & Customer-Users
-- ==============================================================================

DO $$
DECLARE
  v_admin_id UUID;
  v_manager_id UUID;
  v_sales1_id UUID;
  v_sales2_id UUID;
  v_cust1_id UUID;
  v_cust2_id UUID;
  v_cust3_id UUID;
  v_cust4_id UUID;
  v_run_id UUID;
  v_bill1_id UUID;
  v_bill2_id UUID;
BEGIN
  -- 1. Seed Admin: luiz@globexmultimodal.com.br / Skip@Pass
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'luiz@globexmultimodal.com.br') THEN
    v_admin_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      is_super_admin, role, aud,
      confirmation_token, recovery_token, email_change_token_new,
      email_change, email_change_token_current,
      phone, phone_change, phone_change_token, reauthentication_token
    ) VALUES (
      v_admin_id,
      '00000000-0000-0000-0000-000000000000',
      'luiz@globexmultimodal.com.br',
      crypt('Skip@Pass', gen_salt('bf')),
      NOW(), NOW(), NOW(),
      '{"provider": "email", "providers": ["email"]}',
      '{"name": "Luiz Fernandes"}',
      false, 'authenticated', 'authenticated',
      '', '', '', '', '',
      NULL, '', '', ''
    );
  ELSE
    SELECT id INTO v_admin_id FROM auth.users WHERE email = 'luiz@globexmultimodal.com.br';
  END IF;

  INSERT INTO public.users (id, name, email, role, fixed_salary)
  VALUES (v_admin_id, 'Luiz Fernandes (Diretor)', 'luiz@globexmultimodal.com.br', 'admin', 15000)
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role;

  -- 2. Seed Manager: carlos.gerente@empresa.com / Skip@Pass
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'carlos.gerente@empresa.com') THEN
    v_manager_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      is_super_admin, role, aud,
      confirmation_token, recovery_token, email_change_token_new,
      email_change, email_change_token_current,
      phone, phone_change, phone_change_token, reauthentication_token
    ) VALUES (
      v_manager_id,
      '00000000-0000-0000-0000-000000000000',
      'carlos.gerente@empresa.com',
      crypt('Skip@Pass', gen_salt('bf')),
      NOW(), NOW(), NOW(),
      '{"provider": "email", "providers": ["email"]}',
      '{"name": "Carlos Silva"}',
      false, 'authenticated', 'authenticated',
      '', '', '', '', '',
      NULL, '', '', ''
    );
  ELSE
    SELECT id INTO v_manager_id FROM auth.users WHERE email = 'carlos.gerente@empresa.com';
  END IF;

  INSERT INTO public.users (id, name, email, role, fixed_salary)
  VALUES (v_manager_id, 'Carlos Silva (Gerente Comercial)', 'carlos.gerente@empresa.com', 'manager', 8000)
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role;

  -- 3. Seed Sales 1: mariana.vendas@empresa.com / Skip@Pass
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'mariana.vendas@empresa.com') THEN
    v_sales1_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      is_super_admin, role, aud,
      confirmation_token, recovery_token, email_change_token_new,
      email_change, email_change_token_current,
      phone, phone_change, phone_change_token, reauthentication_token
    ) VALUES (
      v_sales1_id,
      '00000000-0000-0000-0000-000000000000',
      'mariana.vendas@empresa.com',
      crypt('Skip@Pass', gen_salt('bf')),
      NOW(), NOW(), NOW(),
      '{"provider": "email", "providers": ["email"]}',
      '{"name": "Mariana Santos"}',
      false, 'authenticated', 'authenticated',
      '', '', '', '', '',
      NULL, '', '', ''
    );
  ELSE
    SELECT id INTO v_sales1_id FROM auth.users WHERE email = 'mariana.vendas@empresa.com';
  END IF;

  INSERT INTO public.users (id, name, email, role, fixed_salary)
  VALUES (v_sales1_id, 'Mariana Santos (Executiva de Vendas)', 'mariana.vendas@empresa.com', 'sales', 3500)
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role;

  -- 4. Seed Sales 2: roberto.vendas@empresa.com / Skip@Pass
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'roberto.vendas@empresa.com') THEN
    v_sales2_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      is_super_admin, role, aud,
      confirmation_token, recovery_token, email_change_token_new,
      email_change, email_change_token_current,
      phone, phone_change, phone_change_token, reauthentication_token
    ) VALUES (
      v_sales2_id,
      '00000000-0000-0000-0000-000000000000',
      'roberto.vendas@empresa.com',
      crypt('Skip@Pass', gen_salt('bf')),
      NOW(), NOW(), NOW(),
      '{"provider": "email", "providers": ["email"]}',
      '{"name": "Roberto Costa"}',
      false, 'authenticated', 'authenticated',
      '', '', '', '', '',
      NULL, '', '', ''
    );
  ELSE
    SELECT id INTO v_sales2_id FROM auth.users WHERE email = 'roberto.vendas@empresa.com';
  END IF;

  INSERT INTO public.users (id, name, email, role, fixed_salary)
  VALUES (v_sales2_id, 'Roberto Costa (Executivo de Contas)', 'roberto.vendas@empresa.com', 'sales', 3500)
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role;

  -- Seed Commission Profiles
  -- Manager: fixo sobre Inbound (1.5%) e Outbound (1.5%)
  IF NOT EXISTS (SELECT 1 FROM public.commission_profiles WHERE user_id = v_manager_id AND type = 'inbound') THEN
    INSERT INTO public.commission_profiles (user_id, type, default_percentage_year_1, default_percentage_year_2_plus)
    VALUES (v_manager_id, 'inbound', 1.5, 1.5);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.commission_profiles WHERE user_id = v_manager_id AND type = 'outbound') THEN
    INSERT INTO public.commission_profiles (user_id, type, default_percentage_year_1, default_percentage_year_2_plus)
    VALUES (v_manager_id, 'outbound', 1.5, 1.5);
  END IF;

  -- Sales 1 (Mariana): Inbound (3% vitalício) / Outbound (5% ano 1, 2.5% ano 2+)
  IF NOT EXISTS (SELECT 1 FROM public.commission_profiles WHERE user_id = v_sales1_id AND type = 'inbound') THEN
    INSERT INTO public.commission_profiles (user_id, type, default_percentage_year_1, default_percentage_year_2_plus)
    VALUES (v_sales1_id, 'inbound', 3.0, 3.0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.commission_profiles WHERE user_id = v_sales1_id AND type = 'outbound') THEN
    INSERT INTO public.commission_profiles (user_id, type, default_percentage_year_1, default_percentage_year_2_plus)
    VALUES (v_sales1_id, 'outbound', 5.0, 2.5);
  END IF;

  -- Sales 2 (Roberto): Inbound (3% vitalício) / Outbound (6% ano 1, 3.0% ano 2+)
  IF NOT EXISTS (SELECT 1 FROM public.commission_profiles WHERE user_id = v_sales2_id AND type = 'inbound') THEN
    INSERT INTO public.commission_profiles (user_id, type, default_percentage_year_1, default_percentage_year_2_plus)
    VALUES (v_sales2_id, 'inbound', 3.0, 3.0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.commission_profiles WHERE user_id = v_sales2_id AND type = 'outbound') THEN
    INSERT INTO public.commission_profiles (user_id, type, default_percentage_year_1, default_percentage_year_2_plus)
    VALUES (v_sales2_id, 'outbound', 6.0, 3.0);
  END IF;

  -- Seed Tax Deductions (no taxes hardcoded! Dynamic percentage & math formula)
  IF NOT EXISTS (SELECT 1 FROM public.tax_deductions WHERE name = 'ISS - Imposto Sobre Serviços') THEN
    INSERT INTO public.tax_deductions (name, type, value, is_active)
    VALUES ('ISS - Imposto Sobre Serviços', 'percentage', 2.5, true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tax_deductions WHERE name = 'PIS/COFINS Cumulativo') THEN
    INSERT INTO public.tax_deductions (name, type, value, is_active)
    VALUES ('PIS/COFINS Cumulativo', 'percentage', 3.65, true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tax_deductions WHERE name = 'Adicional IRPJ (Fórmula Global)') THEN
    INSERT INTO public.tax_deductions (name, type, formula_expression, is_active)
    VALUES (
      'Adicional IRPJ (Fórmula Global)',
      'formula',
      'CLIENT_BILLING * (((GLOBAL_BILLING * 0.32) - 20000) * 0.1) / GLOBAL_BILLING',
      true
    );
  END IF;

  -- Seed initial sample customers
  IF NOT EXISTS (SELECT 1 FROM public.customers WHERE customer_code = 'CLI-1001') THEN
    INSERT INTO public.customers (customer_code, name, origin, start_date, no_commission_flag)
    VALUES ('CLI-1001', 'TechLog Transportes S.A.', 'outbound', '2026-03-01', false)
    RETURNING id INTO v_cust1_id;
  ELSE
    SELECT id INTO v_cust1_id FROM public.customers WHERE customer_code = 'CLI-1001';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.customers WHERE customer_code = 'CLI-1002') THEN
    INSERT INTO public.customers (customer_code, name, origin, start_date, no_commission_flag)
    VALUES ('CLI-1002', 'Varejo Global Brasil Ltda', 'inbound', '2025-01-15', false)
    RETURNING id INTO v_cust2_id;
  ELSE
    SELECT id INTO v_cust2_id FROM public.customers WHERE customer_code = 'CLI-1002';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.customers WHERE customer_code = 'CLI-1003') THEN
    INSERT INTO public.customers (customer_code, name, origin, start_date, no_commission_flag)
    VALUES ('CLI-1003', 'BioPharma Distribuidora', 'outbound', '2024-05-10', false)
    RETURNING id INTO v_cust3_id;
  ELSE
    SELECT id INTO v_cust3_id FROM public.customers WHERE customer_code = 'CLI-1003';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.customers WHERE customer_code = 'CLI-1004') THEN
    INSERT INTO public.customers (customer_code, name, origin, start_date, no_commission_flag)
    VALUES ('CLI-1004', 'Holding Matriz Governamental', 'inbound', '2023-01-01', true)
    RETURNING id INTO v_cust4_id;
  ELSE
    SELECT id INTO v_cust4_id FROM public.customers WHERE customer_code = 'CLI-1004';
  END IF;

  -- Seed customer_users links
  -- CLI-1001: Mariana (vendas) + Carlos (gerente)
  IF v_cust1_id IS NOT NULL THEN
    INSERT INTO public.customer_users (customer_id, user_id) VALUES (v_cust1_id, v_sales1_id) ON CONFLICT DO NOTHING;
    INSERT INTO public.customer_users (customer_id, user_id) VALUES (v_cust1_id, v_manager_id) ON CONFLICT DO NOTHING;
  END IF;

  -- CLI-1002: Roberto (vendas) + Carlos (gerente)
  IF v_cust2_id IS NOT NULL THEN
    INSERT INTO public.customer_users (customer_id, user_id) VALUES (v_cust2_id, v_sales2_id) ON CONFLICT DO NOTHING;
    INSERT INTO public.customer_users (customer_id, user_id) VALUES (v_cust2_id, v_manager_id) ON CONFLICT DO NOTHING;
  END IF;

  -- CLI-1003: Mariana (vendas) + Carlos (gerente)
  IF v_cust3_id IS NOT NULL THEN
    INSERT INTO public.customer_users (customer_id, user_id) VALUES (v_cust3_id, v_sales1_id) ON CONFLICT DO NOTHING;
    INSERT INTO public.customer_users (customer_id, user_id) VALUES (v_cust3_id, v_manager_id) ON CONFLICT DO NOTHING;
  END IF;

  -- CLI-1004: Roberto (vendas)
  IF v_cust4_id IS NOT NULL THEN
    INSERT INTO public.customer_users (customer_id, user_id) VALUES (v_cust4_id, v_sales2_id) ON CONFLICT DO NOTHING;
  END IF;

  -- Seed an initial processed monthly_run for 2026-08 (previous month) so dashboard & reports have rich data immediately
  IF NOT EXISTS (SELECT 1 FROM public.monthly_runs WHERE month_year = '2026-08-01') THEN
    INSERT INTO public.monthly_runs (month_year, gross_company_billing, status)
    VALUES ('2026-08-01', 350000, 'processed')
    RETURNING id INTO v_run_id;

    -- Billing 1
    INSERT INTO public.billings (monthly_run_id, customer_id, gross_amount, net_amount, tax_deductions_applied_json)
    VALUES (
      v_run_id,
      v_cust1_id,
      80000,
      72984,
      '[{"name": "ISS - Imposto Sobre Serviços", "type": "percentage", "value": 2.5, "deducted": 2000}, {"name": "PIS/COFINS Cumulativo", "type": "percentage", "value": 3.65, "deducted": 2920}, {"name": "Adicional IRPJ (Fórmula Global)", "type": "formula", "expression": "CLIENT_BILLING * (((GLOBAL_BILLING * 0.32) - 20000) * 0.1) / GLOBAL_BILLING", "deducted": 2096}]'::jsonb
    ) RETURNING id INTO v_bill1_id;

    -- Mariana: 5% (Ano 1 outbound) -> 72984 * 0.05 = 3649.20
    INSERT INTO public.commissions (billing_id, user_id, percentage_applied, commission_amount)
    VALUES (v_bill1_id, v_sales1_id, 5.0, 3649.20);
    -- Carlos Gerente: 1.5% -> 72984 * 0.015 = 1094.76
    INSERT INTO public.commissions (billing_id, user_id, percentage_applied, commission_amount)
    VALUES (v_bill1_id, v_manager_id, 1.5, 1094.76);

    -- Billing 2
    INSERT INTO public.billings (monthly_run_id, customer_id, gross_amount, net_amount, tax_deductions_applied_json)
    VALUES (
      v_run_id,
      v_cust2_id,
      120000,
      109476,
      '[{"name": "ISS - Imposto Sobre Serviços", "type": "percentage", "value": 2.5, "deducted": 3000}, {"name": "PIS/COFINS Cumulativo", "type": "percentage", "value": 3.65, "deducted": 4380}, {"name": "Adicional IRPJ (Fórmula Global)", "type": "formula", "expression": "CLIENT_BILLING * (((GLOBAL_BILLING * 0.32) - 20000) * 0.1) / GLOBAL_BILLING", "deducted": 3144}]'::jsonb
    ) RETURNING id INTO v_bill2_id;

    -- Roberto: 3% (Inbound vitalício) -> 109476 * 0.03 = 3284.28
    INSERT INTO public.commissions (billing_id, user_id, percentage_applied, commission_amount)
    VALUES (v_bill2_id, v_sales2_id, 3.0, 3284.28);
    -- Carlos Gerente: 1.5% -> 109476 * 0.015 = 1642.14
    INSERT INTO public.commissions (billing_id, user_id, percentage_applied, commission_amount)
    VALUES (v_bill2_id, v_manager_id, 1.5, 1642.14);
  END IF;

END $$;
