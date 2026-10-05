-- Migration: Função atômica e transacional para gravação de comissões recalculadas
-- Data: 2026-10-05

CREATE OR REPLACE FUNCTION public.commit_calculated_commissions(
  p_monthly_run_id uuid,
  p_billing_updates jsonb,
  p_commission_inserts jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_run_status text;
  v_billing_record jsonb;
  v_comm_record jsonb;
  v_billings_count int := 0;
  v_commissions_count int := 0;
BEGIN
  -- 1. Lock exclusivo na linha do monthly_run para serializar recálculos concorrentes
  -- e impedir qualquer corrida entre dois acionamentos simultâneos.
  SELECT status INTO v_run_status
  FROM public.monthly_runs
  WHERE id = p_monthly_run_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RUN_NOT_FOUND: Execução mensal com ID % não foi encontrada.', p_monthly_run_id;
  END IF;

  -- 2. Revalidação crítica de status dentro da transação e sob row lock
  IF v_run_status = 'paid' THEN
    RAISE EXCEPTION 'RUN_LOCKED_PAID: Este mês já está fechado e marcado como pago. O recálculo está bloqueado por compliance.';
  END IF;

  -- 3. Aplicar atualizações de net_amount e tax_deductions_applied_json nos billings
  IF p_billing_updates IS NOT NULL AND jsonb_array_length(p_billing_updates) > 0 THEN
    FOR v_billing_record IN SELECT * FROM jsonb_array_elements(p_billing_updates)
    LOOP
      UPDATE public.billings
      SET
        net_amount = (v_billing_record->>'net_amount')::numeric,
        tax_deductions_applied_json = COALESCE(v_billing_record->'tax_deductions_applied_json', '[]'::jsonb)
      WHERE id = (v_billing_record->>'id')::uuid
        AND monthly_run_id = p_monthly_run_id;

      v_billings_count := v_billings_count + 1;
    END LOOP;
  END IF;

  -- 4. Exclusão atômica de todas as comissões anteriores ligadas a este monthly_run_id
  DELETE FROM public.commissions
  WHERE billing_id IN (
    SELECT id FROM public.billings WHERE monthly_run_id = p_monthly_run_id
  );

  -- 5. Inserção das novas comissões calculadas
  IF p_commission_inserts IS NOT NULL AND jsonb_array_length(p_commission_inserts) > 0 THEN
    INSERT INTO public.commissions (billing_id, user_id, percentage_applied, commission_amount)
    SELECT
      (item->>'billing_id')::uuid,
      (item->>'user_id')::uuid,
      (item->>'percentage_applied')::numeric,
      (item->>'commission_amount')::numeric
    FROM jsonb_array_elements(p_commission_inserts) AS item;

    GET DIAGNOSTICS v_commissions_count = ROW_COUNT;
  END IF;

  -- 6. Atualizar status da execução mensal para processed
  UPDATE public.monthly_runs
  SET status = 'processed'
  WHERE id = p_monthly_run_id;

  RETURN jsonb_build_object(
    'success', true,
    'monthly_run_id', p_monthly_run_id,
    'billings_updated', v_billings_count,
    'commissions_inserted', v_commissions_count
  );
END;
$$;
