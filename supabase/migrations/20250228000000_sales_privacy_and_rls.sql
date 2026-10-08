-- Migration: 20250228000000_sales_privacy_and_rls.sql
-- Description: Implement data privacy and Row Level Security (RLS) for sales role.
-- Rules:
-- 1. admin and manager can see all users, customers, customer_users, commissions, monthly_runs, etc.
-- 2. sales can ONLY select their own user row (id = auth.uid()).
-- 3. sales can ONLY select their own commissions (user_id = auth.uid()).
-- 4. sales can ONLY select customer_users where user_id = auth.uid().
-- 5. sales can ONLY select customers linked to them via customer_users (user_id = auth.uid()).
-- 6. sales can ONLY select monthly_runs that have commissions for them.
-- 7. sales has READ-ONLY access to customers and customer_users (no insert/update/delete).

-- 1. Helper SECURITY DEFINER functions to prevent RLS recursion
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.users WHERE id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_manager_or_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()
      AND role IN ('admin', 'manager')
  );
$$;

-- Function to check if a customer is linked to the current user
CREATE OR REPLACE FUNCTION public.is_customer_assigned_to_user(target_customer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.customer_users
    WHERE customer_id = target_customer_id
      AND user_id = auth.uid()
  );
$$;

-- Function to check if a monthly_run contains commissions for the current user
CREATE OR REPLACE FUNCTION public.user_has_commissions_in_run(target_run_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.commissions c
    JOIN public.billings b ON b.id = c.billing_id
    WHERE b.monthly_run_id = target_run_id
      AND c.user_id = auth.uid()
  );
$$;

-- Grant EXECUTE to authenticated users
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_manager_or_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_customer_assigned_to_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_commissions_in_run(uuid) TO authenticated;


-- =====================================================================
-- TABLE: public.users
-- =====================================================================
-- Refactor SELECT: admin and manager see all; sales only sees own user record (id = auth.uid())
DROP POLICY IF EXISTS authenticated_select_users ON public.users;

CREATE POLICY authenticated_select_users
ON public.users
FOR SELECT
TO authenticated
USING (
  public.is_manager_or_admin()
  OR id = auth.uid()
);


-- =====================================================================
-- TABLE: public.customer_users
-- =====================================================================
-- Refactor SELECT: admin/manager see all; sales only sees links where user_id = auth.uid()
DROP POLICY IF EXISTS authenticated_select_customer_users ON public.customer_users;

CREATE POLICY authenticated_select_customer_users
ON public.customer_users
FOR SELECT
TO authenticated
USING (
  public.is_manager_or_admin()
  OR user_id = auth.uid()
);

-- Restrict INSERT, UPDATE, DELETE to manager or admin (sales cannot alter links)
DROP POLICY IF EXISTS authenticated_insert_customer_users ON public.customer_users;
CREATE POLICY authenticated_insert_customer_users
ON public.customer_users
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_manager_or_admin()
);

DROP POLICY IF EXISTS authenticated_update_customer_users ON public.customer_users;
CREATE POLICY authenticated_update_customer_users
ON public.customer_users
FOR UPDATE
TO authenticated
USING (
  public.is_manager_or_admin()
)
WITH CHECK (
  public.is_manager_or_admin()
);

DROP POLICY IF EXISTS authenticated_delete_customer_users ON public.customer_users;
CREATE POLICY authenticated_delete_customer_users
ON public.customer_users
FOR DELETE
TO authenticated
USING (
  public.is_manager_or_admin()
);


-- =====================================================================
-- TABLE: public.customers
-- =====================================================================
-- Refactor SELECT: admin/manager see all; sales only sees customers linked to auth.uid()
DROP POLICY IF EXISTS authenticated_select_customers ON public.customers;

CREATE POLICY authenticated_select_customers
ON public.customers
FOR SELECT
TO authenticated
USING (
  public.is_manager_or_admin()
  OR public.is_customer_assigned_to_user(id)
);

-- Restrict INSERT and UPDATE on customers to manager or admin (sales is read-only)
DROP POLICY IF EXISTS authenticated_insert_customers ON public.customers;
CREATE POLICY authenticated_insert_customers
ON public.customers
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_manager_or_admin()
);

DROP POLICY IF EXISTS authenticated_update_customers ON public.customers;
CREATE POLICY authenticated_update_customers
ON public.customers
FOR UPDATE
TO authenticated
USING (
  public.is_manager_or_admin()
)
WITH CHECK (
  public.is_manager_or_admin()
);


-- =====================================================================
-- TABLE: public.commissions
-- =====================================================================
-- Refactor SELECT: admin/manager see all; sales only sees commissions where user_id = auth.uid()
DROP POLICY IF EXISTS authenticated_select_commissions ON public.commissions;

CREATE POLICY authenticated_select_commissions
ON public.commissions
FOR SELECT
TO authenticated
USING (
  public.is_manager_or_admin()
  OR user_id = auth.uid()
);

-- Restrict INSERT/UPDATE/DELETE on commissions to manager/admin (and preserve locked month checks)
DROP POLICY IF EXISTS authenticated_insert_commissions ON public.commissions;
CREATE POLICY authenticated_insert_commissions
ON public.commissions
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_manager_or_admin()
);

DROP POLICY IF EXISTS authenticated_update_commissions ON public.commissions;
CREATE POLICY authenticated_update_commissions
ON public.commissions
FOR UPDATE
TO authenticated
USING (
  public.is_manager_or_admin()
  AND NOT (EXISTS (
    SELECT 1 FROM public.billings b
    JOIN public.monthly_runs mr ON mr.id = b.monthly_run_id
    WHERE b.id = commissions.billing_id
      AND mr.status = 'paid'
  ))
)
WITH CHECK (
  public.is_manager_or_admin()
  AND NOT (EXISTS (
    SELECT 1 FROM public.billings b
    JOIN public.monthly_runs mr ON mr.id = b.monthly_run_id
    WHERE b.id = commissions.billing_id
      AND mr.status = 'paid'
  ))
);

DROP POLICY IF EXISTS authenticated_delete_commissions ON public.commissions;
CREATE POLICY authenticated_delete_commissions
ON public.commissions
FOR DELETE
TO authenticated
USING (
  public.is_manager_or_admin()
  AND NOT (EXISTS (
    SELECT 1 FROM public.billings b
    JOIN public.monthly_runs mr ON mr.id = b.monthly_run_id
    WHERE b.id = commissions.billing_id
      AND mr.status = 'paid'
  ))
);


-- =====================================================================
-- TABLE: public.monthly_runs
-- =====================================================================
-- Refactor SELECT: admin/manager see all; sales only sees monthly_runs that have commissions for them
DROP POLICY IF EXISTS authenticated_select_monthly_runs ON public.monthly_runs;

CREATE POLICY authenticated_select_monthly_runs
ON public.monthly_runs
FOR SELECT
TO authenticated
USING (
  public.is_manager_or_admin()
  OR public.user_has_commissions_in_run(id)
);


-- =====================================================================
-- TABLE: public.billings
-- =====================================================================
-- Refactor SELECT: admin/manager see all; sales only sees billings of their assigned customers
DROP POLICY IF EXISTS authenticated_select_billings ON public.billings;

CREATE POLICY authenticated_select_billings
ON public.billings
FOR SELECT
TO authenticated
USING (
  public.is_manager_or_admin()
  OR public.is_customer_assigned_to_user(customer_id)
);

-- Restrict INSERT/UPDATE/DELETE on billings to manager/admin
DROP POLICY IF EXISTS authenticated_insert_billings ON public.billings;
CREATE POLICY authenticated_insert_billings
ON public.billings
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_manager_or_admin()
);

DROP POLICY IF EXISTS authenticated_update_billings ON public.billings;
CREATE POLICY authenticated_update_billings
ON public.billings
FOR UPDATE
TO authenticated
USING (
  public.is_manager_or_admin()
  AND NOT (EXISTS (
    SELECT 1 FROM public.monthly_runs mr
    WHERE mr.id = billings.monthly_run_id
      AND mr.status = 'paid'
  ))
)
WITH CHECK (
  public.is_manager_or_admin()
  AND NOT (EXISTS (
    SELECT 1 FROM public.monthly_runs mr
    WHERE mr.id = billings.monthly_run_id
      AND mr.status = 'paid'
  ))
);

DROP POLICY IF EXISTS authenticated_delete_billings ON public.billings;
CREATE POLICY authenticated_delete_billings
ON public.billings
FOR DELETE
TO authenticated
USING (
  public.is_manager_or_admin()
  AND NOT (EXISTS (
    SELECT 1 FROM public.monthly_runs mr
    WHERE mr.id = billings.monthly_run_id
      AND mr.status = 'paid'
  ))
);


-- =====================================================================
-- TABLE: public.commission_profiles
-- =====================================================================
-- Refactor SELECT: admin/manager see all; sales only sees their own profile (user_id = auth.uid())
DROP POLICY IF EXISTS authenticated_select_commission_profiles ON public.commission_profiles;

CREATE POLICY authenticated_select_commission_profiles
ON public.commission_profiles
FOR SELECT
TO authenticated
USING (
  public.is_manager_or_admin()
  OR user_id = auth.uid()
);

-- Restrict INSERT/UPDATE/DELETE to manager or admin
DROP POLICY IF EXISTS authenticated_insert_commission_profiles ON public.commission_profiles;
CREATE POLICY authenticated_insert_commission_profiles
ON public.commission_profiles
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_manager_or_admin()
);

DROP POLICY IF EXISTS authenticated_update_commission_profiles ON public.commission_profiles;
CREATE POLICY authenticated_update_commission_profiles
ON public.commission_profiles
FOR UPDATE
TO authenticated
USING (
  public.is_manager_or_admin()
)
WITH CHECK (
  public.is_manager_or_admin()
);

DROP POLICY IF EXISTS authenticated_delete_commission_profiles ON public.commission_profiles;
CREATE POLICY authenticated_delete_commission_profiles
ON public.commission_profiles
FOR DELETE
TO authenticated
USING (
  public.is_manager_or_admin()
);
