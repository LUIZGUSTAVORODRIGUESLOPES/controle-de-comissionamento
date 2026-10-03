-- Migration: Enforce safe deletion for monthly_runs and add delete_monthly_run stored procedure
-- 1. Ensure RLS on monthly_runs strictly blocks DELETE when status = 'paid'
-- Only non-paid runs can be deleted by authenticated admin or manager users.
DROP POLICY IF EXISTS "authenticated_delete_monthly_runs" ON public.monthly_runs;

CREATE POLICY "authenticated_delete_monthly_runs" ON public.monthly_runs
  FOR DELETE TO authenticated
  USING (
    status <> 'paid'
    AND (
      EXISTS (
        SELECT 1 FROM public.users
        WHERE id = auth.uid()
          AND role IN ('admin', 'manager')
      )
    )
  );

-- 2. Stored Procedure: delete_monthly_run(p_monthly_run_id UUID)
-- Critical business rule: Check status, raise exception if 'paid'.
-- Deletes in cascade order:
--   a) commissions for billings of this monthly_run_id
--   b) billings for this monthly_run_id
--   c) monthly_run itself
CREATE OR REPLACE FUNCTION public.delete_monthly_run(p_monthly_run_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_status TEXT;
  v_month_year DATE;
  v_billings_count INT := 0;
  v_commissions_count INT := 0;
BEGIN
  -- 1. Verify existence & status of monthly_run
  SELECT status, month_year INTO v_status, v_month_year
  FROM public.monthly_runs
  WHERE id = p_monthly_run_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Competência/Monthly run não encontrada para o ID %.', p_monthly_run_id;
  END IF;

  -- 2. Critical business check: never delete paid month
  IF v_status = 'paid' THEN
    RAISE EXCEPTION 'Operação bloqueada: Não é permitido excluir uma competência fechada/paga (status = paid).';
  END IF;

  -- 3. Delete commissions tied to billings of this monthly run
  WITH deleted_comms AS (
    DELETE FROM public.commissions
    WHERE billing_id IN (
      SELECT id FROM public.billings WHERE monthly_run_id = p_monthly_run_id
    )
    RETURNING id
  )
  SELECT COUNT(*) INTO v_commissions_count FROM deleted_comms;

  -- 4. Delete billings belonging to this monthly run
  WITH deleted_bills AS (
    DELETE FROM public.billings
    WHERE monthly_run_id = p_monthly_run_id
    RETURNING id
  )
  SELECT COUNT(*) INTO v_billings_count FROM deleted_bills;

  -- 5. Delete the monthly_run itself
  DELETE FROM public.monthly_runs
  WHERE id = p_monthly_run_id;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_monthly_run_id', p_monthly_run_id,
    'month_year', v_month_year,
    'deleted_billings', v_billings_count,
    'deleted_commissions', v_commissions_count
  );
END;
$$;
