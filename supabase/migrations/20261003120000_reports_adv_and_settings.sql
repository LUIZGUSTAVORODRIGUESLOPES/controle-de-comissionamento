-- Migration: Create assets storage bucket, system_settings table, and users notification preference columns
-- Date: 2026-10-03

-- 1. Create storage bucket 'assets' if not exists, and set public access
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'assets',
  'assets',
  true,
  5242880, -- 5MB limit
  ARRAY['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Storage RLS policies for 'assets' bucket
DROP POLICY IF EXISTS "Public can view assets" ON storage.objects;
CREATE POLICY "Public can view assets" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'assets');

DROP POLICY IF EXISTS "Authenticated users can upload assets" ON storage.objects;
CREATE POLICY "Authenticated users can upload assets" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'assets');

DROP POLICY IF EXISTS "Authenticated users can update assets" ON storage.objects;
CREATE POLICY "Authenticated users can update assets" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'assets');

DROP POLICY IF EXISTS "Authenticated users can delete assets" ON storage.objects;
CREATE POLICY "Authenticated users can delete assets" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'assets');

-- 2. Create system_settings table (single-row)
CREATE TABLE IF NOT EXISTS public.system_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL DEFAULT 'Globex Multimodal',
  company_logo_url text,
  hr_email text,
  finance_email text,
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS on system_settings
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Read allowed for any authenticated user
DROP POLICY IF EXISTS "authenticated_select_system_settings" ON public.system_settings;
CREATE POLICY "authenticated_select_system_settings" ON public.system_settings
  FOR SELECT TO authenticated
  USING (true);

-- Insert allowed for admin only
DROP POLICY IF EXISTS "admin_insert_system_settings" ON public.system_settings;
CREATE POLICY "admin_insert_system_settings" ON public.system_settings
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

-- Update allowed for admin only
DROP POLICY IF EXISTS "admin_update_system_settings" ON public.system_settings;
CREATE POLICY "admin_update_system_settings" ON public.system_settings
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Delete allowed for admin only
DROP POLICY IF EXISTS "admin_delete_system_settings" ON public.system_settings;
CREATE POLICY "admin_delete_system_settings" ON public.system_settings
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- Seed default single row in system_settings if none exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.system_settings) THEN
    INSERT INTO public.system_settings (company_name, company_logo_url, hr_email, finance_email)
    VALUES ('Globex Multimodal', NULL, NULL, NULL);
  END IF;
END $$;

-- 3. Update users table with notification preferences
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS auto_send_report_to_self boolean NOT NULL DEFAULT true;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS cc_hr boolean NOT NULL DEFAULT false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS cc_finance boolean NOT NULL DEFAULT false;
