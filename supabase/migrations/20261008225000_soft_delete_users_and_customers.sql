-- Migration: soft_delete_users_and_customers
-- Adiciona is_active (BOOLEAN, NOT NULL, DEFAULT TRUE) nas tabelas users e customers
-- Remove/bloqueia políticas de DELETE para proteger o histórico financeiro

-- 1. Coluna is_active em public.users
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Índice para consultas filtrando usuários ativos
CREATE INDEX IF NOT EXISTS idx_users_is_active ON public.users (is_active);

-- 2. Coluna is_active em public.customers
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Índice para consultas filtrando clientes ativos
CREATE INDEX IF NOT EXISTS idx_customers_is_active ON public.customers (is_active);

-- 3. Atualizar / Bloquear políticas RLS de DELETE em users e customers
-- Impedir hard delete físico de clientes e usuários, forçando UPDATE is_active = false
DROP POLICY IF EXISTS "Admins can delete users" ON public.users;
DROP POLICY IF EXISTS "Admins can delete customers" ON public.customers;
DROP POLICY IF EXISTS "Users can delete own customers" ON public.customers;
DROP POLICY IF EXISTS "Allow delete users" ON public.users;
DROP POLICY IF EXISTS "Allow delete customers" ON public.customers;
DROP POLICY IF EXISTS "authenticated_delete_users" ON public.users;
DROP POLICY IF EXISTS "authenticated_delete_customers" ON public.customers;
DROP POLICY IF EXISTS "Block hard delete on users" ON public.users;
DROP POLICY IF EXISTS "Block hard delete on customers" ON public.customers;

-- Política explícita de DELETE bloqueado (nenhum usuário, mesmo admin, pode fazer hard delete físico)
-- Dessa forma o histórico de comissões, faturamentos e vínculos permanece 100% íntegro.
CREATE POLICY "Block hard delete on users"
  ON public.users
  FOR DELETE
  TO authenticated
  USING (false);

CREATE POLICY "Block hard delete on customers"
  ON public.customers
  FOR DELETE
  TO authenticated
  USING (false);
