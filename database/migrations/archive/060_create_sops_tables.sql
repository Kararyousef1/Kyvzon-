-- =============================================================
-- Migration: 060_create_sops_tables.sql
-- Purpose:   إنشاء جداول SOPs و SOPs Readings إذا لم تكن موجودة
-- Author:    System Fix
-- Date:      2026-08-06
-- =============================================================

-- 1. إنشاء جدول SOPs (إجراءات التشغيل القياسية) إذا لم يكن موجوداً
CREATE TABLE IF NOT EXISTS public.sops (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  title_en TEXT,
  code TEXT NOT NULL UNIQUE,
  description TEXT,
  description_en TEXT,
  department TEXT NOT NULL,
  category TEXT NOT NULL,
  pdf_url TEXT,
  version TEXT DEFAULT '1.0',
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'draft')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  effective_date DATE,
  review_date DATE,
  tags TEXT[] DEFAULT '{}',
  duration TEXT DEFAULT '30',
  is_mandatory BOOLEAN DEFAULT true,
  rich_content JSONB DEFAULT '{"blocks":[],"mediaFiles":[]}'::jsonb
);

-- 2. إنشاء جدول SOPs Readings (سجل قراءة الموظفين للـ SOPs) إذا لم يكن موجوداً
CREATE TABLE IF NOT EXISTS public.sops_readings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sop_id UUID REFERENCES public.sops(id) ON DELETE CASCADE NOT NULL,
  employee_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  started_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  last_read_at TIMESTAMPTZ DEFAULT NOW(),
  read_count INTEGER DEFAULT 0,
  time_spent INTEGER DEFAULT 0, -- بالثواني
  completed BOOLEAN DEFAULT false,
  approved BOOLEAN DEFAULT false,
  approved_at TIMESTAMPTZ,
  approval_status TEXT DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  UNIQUE (sop_id, employee_id)
);

-- 3. تفعيل Row Level Security
ALTER TABLE public.sops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sops_readings ENABLE ROW LEVEL SECURITY;

-- 4. سياسات الأمان لـ SOPs
DROP POLICY IF EXISTS "Everyone can view active SOPs" ON public.sops;
CREATE POLICY "Everyone can view active SOPs"
  ON public.sops FOR SELECT
  USING (status = 'active' OR auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin'));

DROP POLICY IF EXISTS "Admins can manage SOPs" ON public.sops;
CREATE POLICY "Admins can manage SOPs"
  ON public.sops FOR ALL
  USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin'));

-- 5. سياسات الأمان لـ SOPs Readings
DROP POLICY IF EXISTS "Employees can manage their own readings" ON public.sops_readings;
CREATE POLICY "Employees can manage their own readings"
  ON public.sops_readings FOR ALL
  USING (auth.uid() = employee_id);

DROP POLICY IF EXISTS "HR/Admin can view all readings" ON public.sops_readings;
CREATE POLICY "HR/Admin can view all readings"
  ON public.sops_readings FOR SELECT
  USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role IN ('hr', 'admin')));

-- 6. إنشاء الفهارس (Indexes)
CREATE INDEX IF NOT EXISTS idx_sops_department ON public.sops(department);
CREATE INDEX IF NOT EXISTS idx_sops_status ON public.sops(status);
CREATE INDEX IF NOT EXISTS idx_sops_readings_employee ON public.sops_readings(employee_id);
CREATE INDEX IF NOT EXISTS idx_sops_readings_sop ON public.sops_readings(sop_id);

-- 7. Trigger لتحديث الوقت تلقائياً
CREATE OR REPLACE FUNCTION public.update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_sops_modtime ON public.sops;
CREATE TRIGGER update_sops_modtime
    BEFORE UPDATE ON public.sops
    FOR EACH ROW
    EXECUTE PROCEDURE public.update_modified_column();