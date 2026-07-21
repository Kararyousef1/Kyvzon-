-- ============================================================================
-- Kyvzon — 0152_department_org_roles.sql
-- إثراء الهيكل التنظيمي: تعيين مشرف/مدير/مدير مباشر لكل قسم.
--
-- السياق:
--   جدول departments كان يحوي manager_id فقط. لدعم الهيكل التنظيمي الكامل
--   وسلسلة الموافقات (مشرف → مدير → مدير مباشر) نضيف:
--     - supervisor_id     : مشرف القسم (يُختار من مستخدمي دور supervisor)
--     - direct_manager_id : المدير المباشر / رئيس القسم (من مستخدمي دور admin)
--   (manager_id موجود مسبقاً — من مستخدمي دور manager)
--
--   منطق الوراثة (يُطبَّق في طبقة التطبيق): القسم الفرعي يرث manager_id و
--   direct_manager_id من القسم الأب إن كانا فارغين. المشرف خاص بكل قسم.
--
-- idempotent وآمن لإعادة التشغيل.
-- ============================================================================

ALTER TABLE public.departments
  ADD COLUMN IF NOT EXISTS supervisor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.departments
  ADD COLUMN IF NOT EXISTS direct_manager_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- فهارس للبحث السريع عن أقسام مستخدم معيّن (مفيد لسلسلة الموافقات)
CREATE INDEX IF NOT EXISTS idx_departments_supervisor ON public.departments(tenant_id, supervisor_id);
CREATE INDEX IF NOT EXISTS idx_departments_manager ON public.departments(tenant_id, manager_id);
CREATE INDEX IF NOT EXISTS idx_departments_direct_manager ON public.departments(tenant_id, direct_manager_id);

-- تحقّق نهائي
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='departments' AND column_name='supervisor_id'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='departments' AND column_name='direct_manager_id'
  ) THEN
    RAISE EXCEPTION '0152 assertion failed: department org-role columns missing';
  END IF;
  RAISE NOTICE '0152 OK: departments supervisor_id + direct_manager_id added.';
END $$;
