-- Adicionar coluna must_change_password na tabela users
-- Novos usuários recebem TRUE como default
-- Usuários existentes recebem FALSE (não forçar troca retroativa para contas prévias)
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT TRUE;

-- Atualizar usuários existentes para FALSE
UPDATE public.users 
SET must_change_password = FALSE 
WHERE must_change_password IS NULL OR must_change_password = TRUE;

-- Atualizar políticas RLS de public.users:
-- Usuário autenticado pode ler os perfis (já coberto ou explícito)
-- Usuário autenticado pode atualizar sua própria linha (para mudar must_change_password)
-- Administrador pode atualizar e gerenciar todas as linhas
DROP POLICY IF EXISTS "authenticated_select_users" ON public.users;
CREATE POLICY "authenticated_select_users" ON public.users
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_update_users" ON public.users;
CREATE POLICY "authenticated_update_users" ON public.users
  FOR UPDATE TO authenticated 
  USING (
    auth.uid() = id OR public.is_admin()
  )
  WITH CHECK (
    auth.uid() = id OR public.is_admin()
  );

DROP POLICY IF EXISTS "authenticated_insert_users" ON public.users;
CREATE POLICY "authenticated_insert_users" ON public.users
  FOR INSERT TO authenticated 
  WITH CHECK (
    auth.uid() = id OR public.is_admin()
  );

DROP POLICY IF EXISTS "authenticated_delete_users" ON public.users;
CREATE POLICY "authenticated_delete_users" ON public.users
  FOR DELETE TO authenticated 
  USING (
    public.is_admin()
  );
