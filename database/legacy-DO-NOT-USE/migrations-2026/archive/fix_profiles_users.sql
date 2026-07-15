-- =====================================================================
-- إصلاح شامل لمشاكل المستخدمين والحسابات والحماية على جدول profiles
--
-- المشاكل التي يعالجها هذا السكربت:
--  1. أعمدة ناقصة يحاول التطبيق حفظها (permissions, supervisor_id,
--     department_manager_id, last_login, can_manage_breaks, employee_id,
--     cv_data, gatekeeper_type, is_verified) → فشل INSERT/UPDATE بصمت.
--  2. سياسات RLS تمنع المدير (admin) من إنشاء/تعديل حسابات الموظفين،
--     مما يجعل المستخدم لا يُحفظ في قاعدة البيانات (يظهر للأدمن من
--     localStorage فقط، ولا يظهر لـ HR أو المطور).
--
-- طريقة الاستخدام:
-- شغّل هذا الملف في: Supabase Dashboard > SQL Editor > New Query > Run
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. إضافة الأعمدة الناقصة إلى جدول profiles (آمن - لا يحذف بيانات)
-- ---------------------------------------------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS permissions            JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS supervisor_id          UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS department_manager_id  UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_login             TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS can_manage_breaks      BOOLEAN DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS employee_id            TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cv_data                JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS gatekeeper_type        TEXT DEFAULT 'both';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_verified            BOOLEAN DEFAULT true;

-- ---------------------------------------------------------------------
-- 2. دالة مساعدة للتحقق من دور admin/hr بدون التسبب في تكرار لانهائي
--    (recursion) في سياسات RLS على نفس جدول profiles.
--    SECURITY DEFINER يجعلها تتجاوز RLS عند القراءة الداخلية.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role::text FROM public.profiles WHERE id = auth.uid();
$$;

-- ---------------------------------------------------------------------
-- 3. إعادة ضبط سياسات RLS على جدول profiles
-- ---------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- حذف السياسات القديمة المتعارضة
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile."       ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile."             ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles."           ON public.profiles;
DROP POLICY IF EXISTS "Admins can insert profiles."               ON public.profiles;
DROP POLICY IF EXISTS "Admins can delete profiles."               ON public.profiles;

-- القراءة: متاحة لكل المسجّلين (مطلوبة لعرض القوائم والهيكلية)
CREATE POLICY "Profiles are viewable by authenticated users"
  ON public.profiles FOR SELECT
  USING (true);

-- الإضافة: المستخدم لنفسه، أو admin/hr لأي مستخدم
CREATE POLICY "Insert own profile or admin/hr can insert any"
  ON public.profiles FOR INSERT
  WITH CHECK (
    auth.uid() = id
    OR public.get_my_role() IN ('admin', 'hr')
  );

-- التعديل: المستخدم لنفسه، أو admin/hr لأي مستخدم
CREATE POLICY "Update own profile or admin/hr can update any"
  ON public.profiles FOR UPDATE
  USING (
    auth.uid() = id
    OR public.get_my_role() IN ('admin', 'hr')
  )
  WITH CHECK (
    auth.uid() = id
    OR public.get_my_role() IN ('admin', 'hr')
  );

-- الحذف: admin فقط
CREATE POLICY "Admins can delete profiles"
  ON public.profiles FOR DELETE
  USING (public.get_my_role() = 'admin');

-- =====================================================================
-- بعد تشغيل هذا الملف:
--  • سيتمكن المدير من إنشاء/تعديل حسابات الموظفين وحفظها فعلياً في DB.
--  • ستظهر الحسابات الجديدة لدى المطور و HR (لأنها صارت في Supabase).
-- =====================================================================
