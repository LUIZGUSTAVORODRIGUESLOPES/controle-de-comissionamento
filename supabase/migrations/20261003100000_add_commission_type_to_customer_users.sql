-- Migration: add commission_type to customer_users with backfill from customers.origin
-- Timestamp: 20261003100000

DO $$
BEGIN
  -- 1. Add commission_type column to customer_users if it doesn't already exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'customer_users' 
      AND column_name = 'commission_type'
  ) THEN
    ALTER TABLE public.customer_users ADD COLUMN commission_type TEXT DEFAULT 'inbound';
  END IF;
END $$;

-- 2. Backfill existing customer_users from customers.origin (fallback to 'inbound')
UPDATE public.customer_users cu
SET commission_type = COALESCE(NULLIF(c.origin, ''), 'inbound')
FROM public.customers c
WHERE cu.customer_id = c.id
  AND (cu.commission_type IS NULL OR cu.commission_type = '');

-- Set default to 'inbound' and not null if desired, or keep default 'inbound'
ALTER TABLE public.customer_users ALTER COLUMN commission_type SET DEFAULT 'inbound';
