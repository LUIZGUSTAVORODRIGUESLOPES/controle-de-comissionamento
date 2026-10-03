-- Migration: Add setup_fee_percentage to commission_profiles and valid_from/valid_until to customer_users
-- Date: 2026-10-03

-- 1. commission_profiles: setup_fee_percentage (Numeric, Nullable)
ALTER TABLE public.commission_profiles
ADD COLUMN IF NOT EXISTS setup_fee_percentage numeric DEFAULT NULL;

-- 2. customer_users: valid_from (Date, default CURRENT_DATE) and valid_until (Date, Nullable)
ALTER TABLE public.customer_users
ADD COLUMN IF NOT EXISTS valid_from date NOT NULL DEFAULT CURRENT_DATE;

ALTER TABLE public.customer_users
ADD COLUMN IF NOT EXISTS valid_until date DEFAULT NULL;

-- 3. Create index to optimize date range queries on customer_users
CREATE INDEX IF NOT EXISTS idx_customer_users_validity 
ON public.customer_users(customer_id, valid_from, valid_until);
