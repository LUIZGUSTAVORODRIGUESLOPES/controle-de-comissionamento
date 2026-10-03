-- Migration: Versionamento de Perfis de Comissão e Proteção de Exclusão
-- Date: 2026-10-03
-- 1. Colunas valid_from, valid_until, is_active
-- 2. Backfill para preservar validade retroativa (1970-01-01) e is_active = true
-- 3. Trigger / Função de proteção de DELETE para impedir exclusão de perfil com histórico

-- 1. Adicionar colunas
ALTER TABLE public.commission_profiles
ADD COLUMN IF NOT EXISTS valid_from date NOT NULL DEFAULT '1970-01-01'::date;

ALTER TABLE public.commission_profiles
ADD COLUMN IF NOT EXISTS valid_until date DEFAULT NULL;

ALTER TABLE public.commission_profiles
ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- Backfill explícito para quaisquer registros pré-existentes
UPDATE public.commission_profiles
SET 
  valid_from = COALESCE(valid_from, '1970-01-01'::date),
  is_active = COALESCE(is_active, true)
WHERE valid_from IS NULL OR is_active IS NULL;

-- 2. Índice para consultas de perfil por usuário, tipo, status e vigência
CREATE INDEX IF NOT EXISTS idx_commission_profiles_validity
ON public.commission_profiles(user_id, type, is_active, valid_from, valid_until);

-- 3. Função de verificação e trigger para proteção de DELETE
CREATE OR REPLACE FUNCTION public.check_commission_profile_delete()
RETURNS trigger AS $$
DECLARE
  has_history boolean;
BEGIN
  -- Verifica se existe comissão calculada para o usuário associada a este perfil no período de vigência
  SELECT EXISTS (
    SELECT 1 
    FROM public.commissions c
    JOIN public.billings b ON b.id = c.billing_id
    JOIN public.monthly_runs mr ON mr.id = b.monthly_run_id
    JOIN public.customers cust ON cust.id = b.customer_id
    LEFT JOIN public.customer_users cu ON cu.customer_id = b.customer_id AND cu.user_id = c.user_id
    WHERE c.user_id = OLD.user_id
      AND LOWER(COALESCE(cu.commission_type, cust.origin, 'inbound')) = LOWER(OLD.type)
      AND to_char(mr.month_year, 'YYYY-MM') >= to_char(OLD.valid_from, 'YYYY-MM')
      AND (OLD.valid_until IS NULL OR to_char(mr.month_year, 'YYYY-MM') <= to_char(OLD.valid_until, 'YYYY-MM'))
  ) INTO has_history;

  IF has_history THEN
    RAISE EXCEPTION 'PROFILE_IN_USE: Não é possível excluir esta regra pois já existem comissões calculadas com ela. Utilize a opção "Encerrar Regra" para inativá-la e preservar o histórico.';
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_commission_profile_delete ON public.commission_profiles;
CREATE TRIGGER trg_protect_commission_profile_delete
BEFORE DELETE ON public.commission_profiles
FOR EACH ROW
EXECUTE FUNCTION public.check_commission_profile_delete();
