-- Migration: Add 'paid' status and compliance financial security RLS policies
-- Date: 2026-10-03

-- 1. Helper Function: is_admin()
-- Verifies if the authenticated user has role = 'admin' in public.users
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()
      AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 2. Update monthly_runs status CHECK constraint to allow 'paid'
ALTER TABLE public.monthly_runs DROP CONSTRAINT IF EXISTS monthly_runs_status_check;
ALTER TABLE public.monthly_runs ADD CONSTRAINT monthly_runs_status_check
  CHECK (status IN ('pending', 'processed', 'paid'));

-- 3. RLS for billings:
-- Block UPDATE and DELETE on billings if the linked monthly_run is 'paid'
-- Normal processing of 'pending' and 'processed' runs continues to work.
DROP POLICY IF EXISTS "authenticated_update_billings" ON public.billings;
CREATE POLICY "authenticated_update_billings" ON public.billings
  FOR UPDATE TO authenticated
  USING (
    NOT EXISTS (
      SELECT 1 FROM public.monthly_runs mr
      WHERE mr.id = billings.monthly_run_id
        AND mr.status = 'paid'
    )
  )
  WITH CHECK (
    NOT EXISTS (
      SELECT 1 FROM public.monthly_runs mr
      WHERE mr.id = monthly_run_id
        AND mr.status = 'paid'
    )
  );

DROP POLICY IF EXISTS "authenticated_delete_billings" ON public.billings;
CREATE POLICY "authenticated_delete_billings" ON public.billings
  FOR DELETE TO authenticated
  USING (
    NOT EXISTS (
      SELECT 1 FROM public.monthly_runs mr
      WHERE mr.id = billings.monthly_run_id
        AND mr.status = 'paid'
    )
  );

-- 4. RLS for commissions:
-- Block UPDATE and DELETE on commissions if the linked billing's monthly_run is 'paid'
DROP POLICY IF EXISTS "authenticated_update_commissions" ON public.commissions;
CREATE POLICY "authenticated_update_commissions" ON public.commissions
  FOR UPDATE TO authenticated
  USING (
    NOT EXISTS (
      SELECT 1 FROM public.billings b
      JOIN public.monthly_runs mr ON mr.id = b.monthly_run_id
      WHERE b.id = commissions.billing_id
        AND mr.status = 'paid'
    )
  )
  WITH CHECK (
    NOT EXISTS (
      SELECT 1 FROM public.billings b
      JOIN public.monthly_runs mr ON mr.id = b.monthly_run_id
      WHERE b.id = billing_id
        AND mr.status = 'paid'
    )
  );

DROP POLICY IF EXISTS "authenticated_delete_commissions" ON public.commissions;
CREATE POLICY "authenticated_delete_commissions" ON public.commissions
  FOR DELETE TO authenticated
  USING (
    NOT EXISTS (
      SELECT 1 FROM public.billings b
      JOIN public.monthly_runs mr ON mr.id = b.monthly_run_id
      WHERE b.id = commissions.billing_id
        AND mr.status = 'paid'
    )
  );

-- 5. RLS for monthly_runs:
-- - Anyone authenticated can update non-paid runs (e.g. pending -> processed, or mark processed -> paid).
-- - BUT if a monthly_run is currently 'paid', ONLY an admin can update it (e.g. estorno to processed or pending).
-- - DELETE on a 'paid' run is blocked unless admin.
DROP POLICY IF EXISTS "authenticated_update_monthly_runs" ON public.monthly_runs;
CREATE POLICY "authenticated_update_monthly_runs" ON public.monthly_runs
  FOR UPDATE TO authenticated
  USING (
    status != 'paid' OR public.is_admin()
  )
  WITH CHECK (
    -- If updating away from 'paid', or touching a paid run, user must be admin
    (status != 'paid' OR public.is_admin())
  );

DROP POLICY IF EXISTS "authenticated_delete_monthly_runs" ON public.monthly_runs;
CREATE POLICY "authenticated_delete_monthly_runs" ON public.monthly_runs
  FOR DELETE TO authenticated
  USING (
    status != 'paid' OR public.is_admin()
  );
