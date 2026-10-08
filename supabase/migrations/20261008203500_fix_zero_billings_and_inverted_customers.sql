-- Migration: Corrigir clientes com dados invertidos e remover faturamentos de valor zero
-- Data: 2026-10-08

DO $$
DECLARE
  seed_rec RECORD;
  bad_cust RECORD;
BEGIN
  -- 1. Excluir comissões e faturamentos com valor bruto zero (ou negativos/nulos)
  -- Deleta comissões associadas a faturamentos com valor bruto zero
  DELETE FROM public.commissions
  WHERE billing_id IN (
    SELECT id FROM public.billings
    WHERE gross_amount <= 0 OR gross_amount IS NULL
  );

  -- Deleta faturamentos com valor bruto zero
  DELETE FROM public.billings
  WHERE gross_amount <= 0 OR gross_amount IS NULL;

  -- 2. Para cada cliente gerado no upload em que customer_code tem o nome do cliente e name tem o valor numérico
  -- (ex: customer_code = 'Action Suplementos Ltda', name = '12307.69')
  -- se já existir o cliente oficial com código padronizado (ex: C00040, name = 'Action Suplementos Ltda'),
  -- remapeia faturamentos e links do cliente errado para o cliente canônico!
  FOR seed_rec IN
    SELECT id AS canonical_id, customer_code AS canonical_code, name AS canonical_name
    FROM public.customers
    WHERE customer_code ~ '^C[0-9]+$'
  LOOP
    FOR bad_cust IN
      SELECT id AS bad_id, customer_code AS bad_code, name AS bad_name
      FROM public.customers
      WHERE (LOWER(TRIM(customer_code)) = LOWER(TRIM(seed_rec.canonical_name))
             OR LOWER(TRIM(customer_code)) = LOWER(TRIM(seed_rec.canonical_code)))
        AND id != seed_rec.canonical_id
    LOOP
      -- Move billings do bad_cust para o canonical_cust
      UPDATE public.billings
      SET customer_id = seed_rec.canonical_id
      WHERE customer_id = bad_cust.bad_id;

      -- Move ou descarta vínculos de customer_users para não violar unique
      DELETE FROM public.customer_users
      WHERE customer_id = bad_cust.bad_id
        AND user_id IN (
          SELECT user_id FROM public.customer_users WHERE customer_id = seed_rec.canonical_id
        );

      UPDATE public.customer_users
      SET customer_id = seed_rec.canonical_id
      WHERE customer_id = bad_cust.bad_id;

      -- Deleta o bad_cust agora que não tem mais referências
      DELETE FROM public.customers
      WHERE id = bad_cust.bad_id;
    END LOOP;
  END LOOP;

  -- 3. Caso ainda sobre algum cliente com name puramente numérico (ex: '1234.56') e customer_code textual,
  -- inverter para que name receba o nome real e customer_code não fique vazio
  UPDATE public.customers
  SET name = customer_code
  WHERE name ~ '^[0-9]+(\.[0-9]+)?$'
    AND NOT customer_code ~ '^[0-9]+(\.[0-9]+)?$';

  -- 4. Excluir clientes sem faturamento nem vínculos criados erroneamente com nome "Cliente Pharmacia Artesanal Ltda"
  DELETE FROM public.customers
  WHERE customer_code = 'Pharmacia Artesanal Ltda'
    AND NOT EXISTS (SELECT 1 FROM public.billings WHERE customer_id = customers.id);

END $$;
