-- Migration: Validação de Não-Sobreposição de Vigências (commission_profiles & customer_users)
-- Data: 2026-10-05

-- 1. Remover UNIQUE constraint legada em customer_users (customer_id, user_id)
-- para permitir múltiplos períodos temporais distintos (ex: Q1 e Q3) sem violar unicidade de tupla.
ALTER TABLE public.customer_users DROP CONSTRAINT IF EXISTS customer_users_unique;

-- 2. Função de validação de não-sobreposição para commission_profiles
-- Regra: Para o mesmo user_id e mesmo LOWER(type), quando is_active = true,
-- não pode haver intersecção entre [valid_from, COALESCE(valid_until, '9999-12-31')].
CREATE OR REPLACE FUNCTION public.validate_commission_profile_overlap()
RETURNS trigger AS $$
DECLARE
  v_conflict RECORD;
  v_new_from date;
  v_new_until date;
BEGIN
  -- Se o registro não estiver ativo, não concorre em vigência de cálculo ativo
  IF NEW.is_active IS FALSE THEN
    RETURN NEW;
  END IF;

  v_new_from := NEW.valid_from;
  v_new_until := COALESCE(NEW.valid_until, '9999-12-31'::date);

  -- Validação básica: valid_from <= valid_until
  IF v_new_from > v_new_until THEN
    RAISE EXCEPTION 'OVERLAP_ERROR: A data de início (%) não pode ser posterior à data de término (%).',
      NEW.valid_from, NEW.valid_until;
  END IF;

  -- Verificar sobreposição com outra regra ativa do mesmo usuário e tipo
  SELECT id, valid_from, valid_until
  INTO v_conflict
  FROM public.commission_profiles
  WHERE user_id = NEW.user_id
    AND LOWER(type) = LOWER(NEW.type)
    AND is_active IS TRUE
    AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND v_new_from <= COALESCE(valid_until, '9999-12-31'::date)
    AND v_new_until >= valid_from
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'OVERLAP_ERROR: Já existe uma regra de comissão ativa do tipo "%" para este usuário com vigência concorrente (% a %). Encerre ou ajuste a regra anterior antes de cadastrar outro período sobreposto.',
      NEW.type,
      v_conflict.valid_from,
      COALESCE(to_char(v_conflict.valid_until, 'YYYY-MM-DD'), 'indeterminado');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_commission_profile_overlap ON public.commission_profiles;
CREATE TRIGGER trg_validate_commission_profile_overlap
  BEFORE INSERT OR UPDATE OF user_id, type, valid_from, valid_until, is_active
  ON public.commission_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_commission_profile_overlap();


-- 3. Função de validação de não-sobreposição para customer_users
-- Regra: Para o mesmo customer_id e mesmo user_id,
-- não pode haver intersecção entre [valid_from, COALESCE(valid_until, '9999-12-31')].
CREATE OR REPLACE FUNCTION public.validate_customer_user_overlap()
RETURNS trigger AS $$
DECLARE
  v_conflict RECORD;
  v_new_from date;
  v_new_until date;
BEGIN
  v_new_from := NEW.valid_from;
  v_new_until := COALESCE(NEW.valid_until, '9999-12-31'::date);

  -- Validação básica: valid_from <= valid_until
  IF v_new_from > v_new_until THEN
    RAISE EXCEPTION 'OVERLAP_ERROR: A data de início do vínculo (%) não pode ser posterior à data de término (%).',
      NEW.valid_from, NEW.valid_until;
  END IF;

  -- Verificar sobreposição com outro vínculo do mesmo cliente e vendedor
  SELECT id, valid_from, valid_until, commission_type
  INTO v_conflict
  FROM public.customer_users
  WHERE customer_id = NEW.customer_id
    AND user_id = NEW.user_id
    AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND v_new_from <= COALESCE(valid_until, '9999-12-31'::date)
    AND v_new_until >= valid_from
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'OVERLAP_ERROR: Este vendedor já possui um vínculo com este cliente no mesmo período ou em vigência concorrente (% a %). Ajuste a vigência antes de salvar.',
      v_conflict.valid_from,
      COALESCE(to_char(v_conflict.valid_until, 'YYYY-MM-DD'), 'indeterminado');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_customer_user_overlap ON public.customer_users;
CREATE TRIGGER trg_validate_customer_user_overlap
  BEFORE INSERT OR UPDATE OF customer_id, user_id, valid_from, valid_until
  ON public.customer_users
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_customer_user_overlap();
