-- 20261003233000_seed_bi_historical_runs.sql
-- Seed historical monthly runs and billings to support rich corporate BI analysis across multiple months and inbound/outbound origins

DO $$
DECLARE
  v_run_202606 uuid;
  v_run_202607 uuid;
  v_run_202608 uuid;
  v_run_202609 uuid;
  v_cust_omron uuid;
  v_cust_ca uuid;
  v_cust_gerres uuid;
  v_cust_hl uuid;
  v_cust_catalent uuid;
  v_cust_medstar uuid;
  v_cust_quantiq uuid;
  v_cust_techlog uuid;
  v_cust_varejo uuid;
  v_cust_biopharma uuid;
BEGIN
  -- 1. Ensure some customers have 'outbound' origin for segmentation
  UPDATE public.customers SET origin = 'outbound' WHERE customer_code IN ('C00003', 'C00005', 'C00009', 'CLI-1002');

  -- 2. Fetch specific customer IDs
  SELECT id INTO v_cust_omron FROM public.customers WHERE customer_code = 'C00002' LIMIT 1;
  SELECT id INTO v_cust_ca FROM public.customers WHERE customer_code = 'C00003' LIMIT 1;
  SELECT id INTO v_cust_gerres FROM public.customers WHERE customer_code = 'C00004' LIMIT 1;
  SELECT id INTO v_cust_hl FROM public.customers WHERE customer_code = 'C00005' LIMIT 1;
  SELECT id INTO v_cust_catalent FROM public.customers WHERE customer_code = 'C00007' LIMIT 1;
  SELECT id INTO v_cust_medstar FROM public.customers WHERE customer_code = 'C00009' LIMIT 1;
  SELECT id INTO v_cust_quantiq FROM public.customers WHERE customer_code = 'C00001' LIMIT 1;
  SELECT id INTO v_cust_techlog FROM public.customers WHERE customer_code = 'CLI-1001' LIMIT 1;
  SELECT id INTO v_cust_varejo FROM public.customers WHERE customer_code = 'CLI-1002' LIMIT 1;
  SELECT id INTO v_cust_biopharma FROM public.customers WHERE customer_code = 'CLI-1003' LIMIT 1;

  -- 3. Monthly run 2026-06-01
  IF NOT EXISTS (SELECT 1 FROM public.monthly_runs WHERE month_year = '2026-06-01') THEN
    v_run_202606 := gen_random_uuid();
    INSERT INTO public.monthly_runs (id, month_year, gross_company_billing, status)
    VALUES (v_run_202606, '2026-06-01', 420000.00, 'paid');

    IF v_cust_omron IS NOT NULL THEN
      INSERT INTO public.billings (id, monthly_run_id, customer_id, gross_amount, net_amount, tax_deductions_applied_json)
      VALUES (gen_random_uuid(), v_run_202606, v_cust_omron, 45000.00, 37500.00, '[]'::jsonb);
    END IF;
    IF v_cust_ca IS NOT NULL THEN
      INSERT INTO public.billings (id, monthly_run_id, customer_id, gross_amount, net_amount, tax_deductions_applied_json)
      VALUES (gen_random_uuid(), v_run_202606, v_cust_ca, 110000.00, 91666.67, '[]'::jsonb);
    END IF;
    IF v_cust_gerres IS NOT NULL THEN
      INSERT INTO public.billings (id, monthly_run_id, customer_id, gross_amount, net_amount, tax_deductions_applied_json)
      VALUES (gen_random_uuid(), v_run_202606, v_cust_gerres, 85000.00, 70833.33, '[]'::jsonb);
    END IF;
    IF v_cust_hl IS NOT NULL THEN
      INSERT INTO public.billings (id, monthly_run_id, customer_id, gross_amount, net_amount, tax_deductions_applied_json)
      VALUES (gen_random_uuid(), v_run_202606, v_cust_hl, 32000.00, 26666.67, '[]'::jsonb);
    END IF;
    IF v_cust_catalent IS NOT NULL THEN
      INSERT INTO public.billings (id, monthly_run_id, customer_id, gross_amount, net_amount, tax_deductions_applied_json)
      VALUES (gen_random_uuid(), v_run_202606, v_cust_catalent, 28000.00, 23333.33, '[]'::jsonb);
    END IF;
    IF v_cust_techlog IS NOT NULL THEN
      INSERT INTO public.billings (id, monthly_run_id, customer_id, gross_amount, net_amount, tax_deductions_applied_json)
      VALUES (gen_random_uuid(), v_run_202606, v_cust_techlog, 120000.00, 100000.00, '[]'::jsonb);
    END IF;
  END IF;

  -- 4. Monthly run 2026-07-01
  IF NOT EXISTS (SELECT 1 FROM public.monthly_runs WHERE month_year = '2026-07-01') THEN
    v_run_202607 := gen_random_uuid();
    INSERT INTO public.monthly_runs (id, month_year, gross_company_billing, status)
    VALUES (v_run_202607, '2026-07-01', 465000.00, 'paid');

    IF v_cust_omron IS NOT NULL THEN
      INSERT INTO public.billings (id, monthly_run_id, customer_id, gross_amount, net_amount, tax_deductions_applied_json)
      VALUES (gen_random_uuid(), v_run_202607, v_cust_omron, 52000.00, 43333.33, '[]'::jsonb);
    END IF;
    IF v_cust_ca IS NOT NULL THEN
      INSERT INTO public.billings (id, monthly_run_id, customer_id, gross_amount, net_amount, tax_deductions_applied_json)
      VALUES (gen_random_uuid(), v_run_202607, v_cust_ca, 125000.00, 104166.67, '[]'::jsonb);
    END IF;
    IF v_cust_gerres IS NOT NULL THEN
      INSERT INTO public.billings (id, monthly_run_id, customer_id, gross_amount, net_amount, tax_deductions_applied_json)
      VALUES (gen_random_uuid(), v_run_202607, v_cust_gerres, 95000.00, 79166.67, '[]'::jsonb);
    END IF;
    IF v_cust_hl IS NOT NULL THEN
      INSERT INTO public.billings (id, monthly_run_id, customer_id, gross_amount, net_amount, tax_deductions_applied_json)
      VALUES (gen_random_uuid(), v_run_202607, v_cust_hl, 38000.00, 31666.67, '[]'::jsonb);
    END IF;
    IF v_cust_varejo IS NOT NULL THEN
      INSERT INTO public.billings (id, monthly_run_id, customer_id, gross_amount, net_amount, tax_deductions_applied_json)
      VALUES (gen_random_uuid(), v_run_202607, v_cust_varejo, 90000.00, 75000.00, '[]'::jsonb);
    END IF;
    IF v_cust_medstar IS NOT NULL THEN
      INSERT INTO public.billings (id, monthly_run_id, customer_id, gross_amount, net_amount, tax_deductions_applied_json)
      VALUES (gen_random_uuid(), v_run_202607, v_cust_medstar, 65000.00, 54166.67, '[]'::jsonb);
    END IF;
  END IF;

  -- 5. Monthly run 2026-08-01
  IF NOT EXISTS (SELECT 1 FROM public.monthly_runs WHERE month_year = '2026-08-01') THEN
    v_run_202608 := gen_random_uuid();
    INSERT INTO public.monthly_runs (id, month_year, gross_company_billing, status)
    VALUES (v_run_202608, '2026-08-01', 490000.00, 'paid');

    IF v_cust_ca IS NOT NULL THEN
      INSERT INTO public.billings (id, monthly_run_id, customer_id, gross_amount, net_amount, tax_deductions_applied_json)
      VALUES (gen_random_uuid(), v_run_202608, v_cust_ca, 130000.00, 108333.33, '[]'::jsonb);
    END IF;
    IF v_cust_gerres IS NOT NULL THEN
      INSERT INTO public.billings (id, monthly_run_id, customer_id, gross_amount, net_amount, tax_deductions_applied_json)
      VALUES (gen_random_uuid(), v_run_202608, v_cust_gerres, 102000.00, 85000.00, '[]'::jsonb);
    END IF;
    IF v_cust_techlog IS NOT NULL THEN
      INSERT INTO public.billings (id, monthly_run_id, customer_id, gross_amount, net_amount, tax_deductions_applied_json)
      VALUES (gen_random_uuid(), v_run_202608, v_cust_techlog, 115000.00, 95833.33, '[]'::jsonb);
    END IF;
    IF v_cust_biopharma IS NOT NULL THEN
      INSERT INTO public.billings (id, monthly_run_id, customer_id, gross_amount, net_amount, tax_deductions_applied_json)
      VALUES (gen_random_uuid(), v_run_202608, v_cust_biopharma, 83000.00, 69166.67, '[]'::jsonb);
    END IF;
    IF v_cust_quantiq IS NOT NULL THEN
      INSERT INTO public.billings (id, monthly_run_id, customer_id, gross_amount, net_amount, tax_deductions_applied_json)
      VALUES (gen_random_uuid(), v_run_202608, v_cust_quantiq, 60000.00, 50000.00, '[]'::jsonb);
    END IF;
  END IF;

END $$;
