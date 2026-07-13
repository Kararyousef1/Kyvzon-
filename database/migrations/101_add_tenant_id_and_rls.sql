-- ============================================================================
-- Kyvzon Platform
-- Migration 101: إضافة tenant_id + Indexes + RLS لجميع جداول الأعمال
-- ============================================================================
-- هذا الملف ينفذ الخطوات 6-9 من خطة Multi-Tenant التنفيذية
-- ============================================================================

-- ============================================================================
-- الخطوة 6: إضافة tenant_id إلى جميع جداول الأعمال
-- ============================================================================

-- 6.1 الموظفين (employees)
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);

-- 6.2 الأقسام (departments)
ALTER TABLE public.departments
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);

-- 6.3 سجلات الحضور (attendance_logs)
ALTER TABLE public.attendance_logs
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);

-- 6.4 ملخص الحضور (attendance_summary)
ALTER TABLE public.attendance_summary
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);

-- 6.5 الزمنيات (permissions)
ALTER TABLE public.permissions
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);

-- 6.6 طلبات الزمنيات (permissions_request)
ALTER TABLE public.permissions_request
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);

-- 6.7 الإجازات (leaves)
ALTER TABLE public.leaves
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);

-- 6.8 رصيد الإجازات (leave_balance)
ALTER TABLE public.leave_balance
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);

-- 6.9 إعدادات الإجازات (leave_settings)
ALTER TABLE public.leave_settings
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);

-- 6.10 العطل (holidays)
ALTER TABLE public.holidays
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);

-- 6.11 أوفرتايم (overtime_log)
ALTER TABLE public.overtime_log
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);

-- 6.12 الإشعارات (notifications)
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);

-- 6.13 تحليلات AI (ai_insights)
ALTER TABLE public.ai_insights
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);

-- 6.14 إعدادات النظام (system_settings)
ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);

-- 6.15 سجل التدقيق (audit_log)
ALTER TABLE public.audit_log
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);

-- 6.16 سجل المزامنة (sync_log)
ALTER TABLE public.sync_log
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);

-- 6.17 سجل التصدير (export_logs)
ALTER TABLE public.export_logs
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);

-- 6.18 البروفايلات (profiles) - جدول المستخدمين
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);

-- ==================================================================
-- إنشاء شركة افتراضية للبيانات الحالية
-- ==================================================================

INSERT INTO public.tenants (id, slug, name_ar, name_en, status, settings)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'default-company',
  'الشركة الافتراضية',
  'Default Company',
  'active',
  '{}'::jsonb
)
ON CONFLICT (slug) DO NOTHING;

-- تحديث البيانات الحالية لربطها بالشركة الافتراضية
UPDATE public.employees SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE public.departments SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE public.attendance_logs SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE public.attendance_summary SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE public.permissions SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE public.permissions_request SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE public.leaves SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE public.leave_balance SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE public.leave_settings SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE public.holidays SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE public.overtime_log SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE public.notifications SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE public.ai_insights SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE public.system_settings SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE public.audit_log SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE public.sync_log SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE public.export_logs SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE public.profiles SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;

-- التحقق من عدم وجود NULLs قبل تعيين NOT NULL
DO $$
DECLARE
  v_tables TEXT[] := ARRAY['employees', 'departments', 'attendance_logs', 'attendance_summary',
    'permissions', 'permissions_request', 'leaves', 'leave_balance',
    'leave_settings', 'holidays', 'overtime_log', 'notifications',
    'ai_insights', 'system_settings', 'audit_log', 'sync_log', 'export_logs', 'profiles'];
  v_tbl TEXT;
  v_null_cnt INTEGER;
BEGIN
  FOREACH v_tbl IN ARRAY v_tables
  LOOP
    EXECUTE format('SELECT COUNT(*) FROM public.%I WHERE tenant_id IS NULL', v_tbl) INTO v_null_cnt;
    IF v_null_cnt > 0 THEN
      RAISE EXCEPTION '⚠️ %: % سجلات بدون tenant_id - لا يمكن تعيين NOT NULL', v_tbl, v_null_cnt;
    END IF;
  END LOOP;
END;
$$;

-- تعيين NOT NULL بعد التأكد من عدم وجود NULLs
ALTER TABLE public.employees ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.departments ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.attendance_logs ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.attendance_summary ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.permissions ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.permissions_request ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.leaves ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.leave_balance ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.leave_settings ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.holidays ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.overtime_log ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.notifications ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.ai_insights ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.system_settings ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.audit_log ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.sync_log ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.export_logs ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.profiles ALTER COLUMN tenant_id SET NOT NULL;

-- ============================================================================
-- الخطوة 7: إنشاء Index لجميع أعمدة tenant_id
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_employees_tenant_id ON public.employees(tenant_id);
CREATE INDEX IF NOT EXISTS idx_departments_tenant_id ON public.departments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_tenant_id ON public.attendance_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_attendance_summary_tenant_id ON public.attendance_summary(tenant_id);
CREATE INDEX IF NOT EXISTS idx_permissions_tenant_id ON public.permissions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_permissions_request_tenant_id ON public.permissions_request(tenant_id);
CREATE INDEX IF NOT EXISTS idx_leaves_tenant_id ON public.leaves(tenant_id);
CREATE INDEX IF NOT EXISTS idx_leave_balance_tenant_id ON public.leave_balance(tenant_id);
CREATE INDEX IF NOT EXISTS idx_leave_settings_tenant_id ON public.leave_settings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_holidays_tenant_id ON public.holidays(tenant_id);
CREATE INDEX IF NOT EXISTS idx_overtime_log_tenant_id ON public.overtime_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notifications_tenant_id ON public.notifications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ai_insights_tenant_id ON public.ai_insights(tenant_id);
CREATE INDEX IF NOT EXISTS idx_system_settings_tenant_id ON public.system_settings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_tenant_id ON public.audit_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sync_log_tenant_id ON public.sync_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_export_logs_tenant_id ON public.export_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_profiles_tenant_id ON public.profiles(tenant_id);

-- ============================================================================
-- دالة مساعدة: الحصول على tenant_id الحالي من السياق
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_current_tenant_id()
RETURNS UUID AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  -- 1. من سياق الجلسة (إذا تم تعيينه يدوياً)
  v_tenant_id := NULLIF(current_setting('app.current_tenant_id', true), '')::UUID;
  IF v_tenant_id IS NOT NULL THEN
    RETURN v_tenant_id;
  END IF;

  -- 2. من user_metadata (إذا تم تمريره أثناء تسجيل الدخول)
  BEGIN
    v_tenant_id := NULLIF(
      (SELECT (raw_user_meta_data->>'tenant_id')::UUID FROM auth.users WHERE id = auth.uid()),
      ''
    )::UUID;
    RETURN v_tenant_id;
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================================
-- دالة: هل المستخدم الحالي في نفس الشركة؟
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_same_tenant(p_tenant_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN p_tenant_id IS NOT NULL
    AND p_tenant_id = public.get_current_tenant_id();
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- دالة: هل المستخدم الحالي من الصلاحيات العليا (Platform Owner / Developer)؟
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_platform_owner()
RETURNS BOOLEAN AS $$
DECLARE
  v_role VARCHAR(50);
BEGIN
  v_role := NULLIF(current_setting('app.current_role', true), '');
  RETURN v_role IN ('platform_owner', 'developer');
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- مشغل لتعيين tenant_id تلقائياً عند INSERT
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_tenant_context()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := public.get_current_tenant_id();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- تطبيق المشغل على جميع الجداول
DO $$
DECLARE
  tables_with_tenant TEXT[] := ARRAY[
    'employees', 'departments', 'attendance_logs', 'attendance_summary',
    'permissions', 'permissions_request', 'leaves', 'leave_balance',
    'leave_settings', 'holidays', 'overtime_log', 'notifications',
    'ai_insights', 'system_settings', 'audit_log', 'sync_log', 'export_logs', 'profiles'
  ];
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY tables_with_tenant
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS set_tenant_on_insert_%s ON public.%I;', tbl, tbl
    );
    EXECUTE format(
      'CREATE TRIGGER set_tenant_on_insert_%s
       BEFORE INSERT ON public.%I
       FOR EACH ROW
       WHEN (NEW.tenant_id IS NULL)
       EXECUTE FUNCTION public.set_tenant_context();', tbl, tbl
    );
  END LOOP;
END;
$$;

-- ============================================================================
-- الخطوة 8: إنشاء سياسات RLS الكاملة لكل جدول
-- ============================================================================

-- ملاحظة: السياسات تراعي:
-- 1. tenant_id من السياق (وليس من المستخدم)
-- 2. platform_owner و developer يمكنهم رؤية كل شيء
-- 3. كل مستخدم يرى فقط بيانات شركته

-- ==================================================================
-- 8.1 الموظفين (employees)
-- ==================================================================

CREATE POLICY employees_select ON public.employees
  FOR SELECT USING (
    public.is_platform_owner()
    OR public.is_same_tenant(tenant_id)
  );

CREATE POLICY employees_insert ON public.employees
  FOR INSERT WITH CHECK (
    public.is_platform_owner()
    OR public.is_same_tenant(tenant_id)
  );

CREATE POLICY employees_update ON public.employees
  FOR UPDATE USING (
    public.is_platform_owner()
    OR public.is_same_tenant(tenant_id)
  );

CREATE POLICY employees_delete ON public.employees
  FOR DELETE USING (
    public.is_platform_owner()
    OR public.is_same_tenant(tenant_id)
  );

-- ==================================================================
-- 8.2 الأقسام (departments)
-- ==================================================================

CREATE POLICY departments_select ON public.departments
  FOR SELECT USING (
    public.is_platform_owner()
    OR public.is_same_tenant(tenant_id)
  );

CREATE POLICY departments_insert ON public.departments
  FOR INSERT WITH CHECK (
    public.is_platform_owner()
    OR public.is_same_tenant(tenant_id)
  );

CREATE POLICY departments_update ON public.departments
  FOR UPDATE USING (
    public.is_platform_owner()
    OR public.is_same_tenant(tenant_id)
  );

CREATE POLICY departments_delete ON public.departments
  FOR DELETE USING (
    public.is_platform_owner()
    OR public.is_same_tenant(tenant_id)
  );

-- ==================================================================
-- 8.3 سجلات الحضور (attendance_logs)
-- ==================================================================

CREATE POLICY attendance_logs_select ON public.attendance_logs
  FOR SELECT USING (
    public.is_platform_owner()
    OR public.is_same_tenant(tenant_id)
  );

CREATE POLICY attendance_logs_insert ON public.attendance_logs
  FOR INSERT WITH CHECK (
    public.is_platform_owner()
    OR public.is_same_tenant(tenant_id)
  );

CREATE POLICY attendance_logs_update ON public.attendance_logs
  FOR UPDATE USING (
    public.is_platform_owner()
    OR public.is_same_tenant(tenant_id)
  );

CREATE POLICY attendance_logs_delete ON public.attendance_logs
  FOR DELETE USING (
    public.is_platform_owner()
    OR public.is_same_tenant(tenant_id)
  );

-- ==================================================================
-- 8.4 ملخص الحضور (attendance_summary)
-- ==================================================================

CREATE POLICY attendance_summary_select ON public.attendance_summary
  FOR SELECT USING (
    public.is_platform_owner()
    OR public.is_same_tenant(tenant_id)
  );

CREATE POLICY attendance_summary_insert ON public.attendance_summary
  FOR INSERT WITH CHECK (
    public.is_platform_owner()
    OR public.is_same_tenant(tenant_id)
  );

CREATE POLICY attendance_summary_update ON public.attendance_summary
  FOR UPDATE USING (
    public.is_platform_owner()
    OR public.is_same_tenant(tenant_id)
  );

CREATE POLICY attendance_summary_delete ON public.attendance_summary
  FOR DELETE USING (
    public.is_platform_owner()
    OR public.is_same_tenant(tenant_id)
  );

-- ==================================================================
-- 8.5 الزمنيات (permissions)
-- ==================================================================

CREATE POLICY permissions_select ON public.permissions
  FOR SELECT USING (
    public.is_platform_owner()
    OR public.is_same_tenant(tenant_id)
  );

CREATE POLICY permissions_insert ON public.permissions
  FOR INSERT WITH CHECK (
    public.is_platform_owner()
    OR public.is_same_tenant(tenant_id)
  );

CREATE POLICY permissions_update ON public.permissions
  FOR UPDATE USING (
    public.is_platform_owner()
    OR public.is_same_tenant(tenant_id)
  );

CREATE POLICY permissions_delete ON public.permissions
  FOR DELETE USING (
    public.is_platform_owner()
    OR public.is_same_tenant(tenant_id)
  );

-- ==================================================================
-- 8.6 طلبات الزمنيات (permissions_request)
-- ==================================================================

CREATE POLICY permissions_request_select ON public.permissions_request
  FOR SELECT USING (
    public.is_platform_owner()
    OR public.is_same_tenant(tenant_id)
  );

CREATE POLICY permissions_request_insert ON public.permissions_request
  FOR INSERT WITH CHECK (
    public.is_platform_owner()
    OR public.is_same_tenant(tenant_id)
  );

CREATE POLICY permissions_request_update ON public.permissions_request
  FOR UPDATE USING (
    public.is_platform_owner()
    OR public.is_same_tenant(tenant_id)
  );

CREATE POLICY permissions_request_delete ON public.permissions_request
  FOR DELETE USING (
    public.is_platform_owner()
    OR public.is_same_tenant(tenant_id)
  );

-- ==================================================================
-- 8.7 الإجازات (leaves)
-- ==================================================================

CREATE POLICY leaves_select ON public.leaves
  FOR SELECT USING (
    public.is_platform_owner()
    OR public.is_same_tenant(tenant_id)
  );

CREATE POLICY leaves_insert ON public.leaves
  FOR INSERT WITH CHECK (
    public.is_platform_owner()
    OR public.is_same_tenant(tenant_id)
  );

CREATE POLICY leaves_update ON public.leaves
  FOR UPDATE USING (
    public.is_platform_owner()
    OR public.is_same_tenant(tenant_id)
  );

CREATE POLICY leaves_delete ON public.leaves
  FOR DELETE USING (
    public.is_platform_owner()
    OR public.is_same_tenant(tenant_id)
  );

-- ==================================================================
-- 8.8 رصيد الإجازات (leave_balance)
-- ==================================================================

CREATE POLICY leave_balance_select ON public.leave_balance
  FOR SELECT USING (
    public.is_platform_owner()
    OR public.is_same_tenant(tenant_id)
  );

CREATE POLICY leave_balance_insert ON public.leave_balance
  FOR INSERT WITH CHECK (
    public.is_platform_owner()
    OR public.is_same_tenant(tenant_id)
  );

CREATE POLICY leave_balance_update ON public.leave_balance
  FOR UPDATE USING (
    public.is_platform_owner()
    OR public.is_same_tenant(tenant_id)
  );

CREATE POLICY leave_balance_delete ON public.leave_balance
  FOR DELETE USING (
    public.is_platform_owner()
    OR public.is_same_tenant(tenant_id)
  );

-- ==================================================================
-- 8.9 إعدادات الإجازات (leave_settings)
-- ==================================================================

CREATE POLICY leave_settings_select ON public.leave_settings
  FOR SELECT USING (
    public.is_platform_owner()
    OR public.is_same_tenant(tenant_id)
  );

CREATE POLICY leave_settings_insert ON public.leave_settings
  FOR INSERT WITH CHECK (
    public.is_platform_owner()
    OR public.is_same_tenant(tenant_id)
  );

CREATE POLICY leave_settings_update ON public.leave_settings
  FOR UPDATE USING (
    public.is_platform_owner()
    OR public.is_same_tenant(tenant_id)
  );

CREATE POLICY leave_settings_delete ON public.leave_settings
  FOR DELETE USING (
    public.is_platform_owner()
    OR public.is_same_tenant(tenant_id)
  );

-- ==================================================================
-- 8.10 العطل (holidays)
-- ==================================================================

CREATE POLICY holidays_select ON public.holidays
  FOR SELECT USING (
    public.is_platform_owner()
    OR public.is_same_tenant(tenant_id)
    OR tenant_id IS NULL  -- العطل العامة تظهر للجميع
  );

CREATE POLICY holidays_insert ON public.holidays
  FOR INSERT WITH CHECK (
    public.is_platform_owner()
    OR public.is_same_tenant(tenant_id)
  );

CREATE POLICY holidays_update ON public.holidays
  FOR UPDATE USING (
    public.is_platform_owner()
    OR public.is_same_tenant(tenant_id)
  );

CREATE POLICY holidays_delete ON public.holidays
  FOR DELETE USING (
    public.is_platform_owner()
    OR public.is_same_tenant(tenant_id)
  );

-- ==================================================================
-- 8.11 أوفرتايم (overtime_log)
-- ==================================================================

CREATE POLICY overtime_log_select ON public.overtime_log
  FOR SELECT USING (
    public.is_platform_owner()
    OR public.is_same_tenant(tenant_id)
  );

CREATE POLICY overtime_log_insert ON public.overtime_log
  FOR INSERT WITH CHECK (
    public.is_platform_owner()
    OR public.is_same_tenant(tenant_id)
  );

CREATE POLICY overtime_log_update ON public.overtime_log
  FOR UPDATE USING (
    public.is_platform_owner()
    OR public.is_same_tenant(tenant_id)
  );

CREATE POLICY overtime_log_delete ON public.overtime_log
  FOR DELETE USING (
    public.is_platform_owner()
    OR public.is_same_tenant(tenant_id)
  );

-- ==================================================================
-- 8.12 الإشعارات (notifications)
-- ==================================================================

CREATE POLICY notifications_select ON public.notifications
  FOR SELECT USING (
    user_id = auth.uid()
    AND (
      tenant_id IS NULL
      OR public.is_same_tenant(tenant_id)
    )
  );

CREATE POLICY notifications_insert ON public.notifications
  FOR INSERT WITH CHECK (
    public.is_platform_owner()
    OR public.is_same_tenant(tenant_id)
  );

CREATE POLICY notifications_update ON public.notifications
  FOR UPDATE USING (
    user_id = auth.uid()
    AND (
      tenant_id IS NULL
      OR public.is_same_tenant(tenant_id)
    )
  );

CREATE POLICY notifications_delete ON public.notifications
  FOR DELETE USING (
    user_id = auth.uid()
    AND (
      tenant_id IS NULL
      OR public.is_same_tenant(tenant_id)
    )
  );

-- ==================================================================
-- 8.13 تحليلات AI (ai_insights)
-- ==================================================================

CREATE POLICY ai_insights_select ON public.ai_insights
  FOR SELECT USING (
    public.is_platform_owner()
    OR public.is_same_tenant(tenant_id)
    OR tenant_id IS NULL
  );

CREATE POLICY ai_insights_insert ON public.ai_insights
  FOR INSERT WITH CHECK (
    public.is_platform_owner()
    OR public.is_same_tenant(tenant_id)
  );

CREATE POLICY ai_insights_update ON public.ai_insights
  FOR UPDATE USING (
    public.is_platform_owner()
    OR public.is_same_tenant(tenant_id)
  );

CREATE POLICY ai_insights_delete ON public.ai_insights
  FOR DELETE USING (
    public.is_platform_owner()
    OR public.is_same_tenant(tenant_id)
  );

-- ==================================================================
-- 8.14 إعدادات النظام (system_settings)
-- ==================================================================

CREATE POLICY system_settings_select ON public.system_settings
  FOR SELECT USING (
    public.is_platform_owner()
    OR public.is_same_tenant(tenant_id)
  );

CREATE POLICY system_settings_insert ON public.system_settings
  FOR INSERT WITH CHECK (
    public.is_platform_owner()
    OR public.is_same_tenant(tenant_id)
  );

CREATE POLICY system_settings_update ON public.system_settings
  FOR UPDATE USING (
    public.is_platform_owner()
    OR public.is_same_tenant(tenant_id)
  );

CREATE POLICY system_settings_delete ON public.system_settings
  FOR DELETE USING (
    public.is_platform_owner()
    OR public.is_same_tenant(tenant_id)
  );

-- ==================================================================
-- 8.15 سجل التدقيق (audit_log)
-- ==================================================================

CREATE POLICY audit_log_select ON public.audit_log
  FOR SELECT USING (
    public.is_platform_owner()
    OR public.is_same_tenant(tenant_id)
  );

CREATE POLICY audit_log_insert ON public.audit_log
  FOR INSERT WITH CHECK (
    public.is_platform_owner()
    OR public.is_same_tenant(tenant_id)
  );

CREATE POLICY audit_log_update ON public.audit_log
  FOR UPDATE USING (
    public.is_platform_owner()
    OR public.is_same_tenant(tenant_id)
  );

CREATE POLICY audit_log_delete ON public.audit_log
  FOR DELETE USING (
    public.is_platform_owner()
    OR public.is_same_tenant(tenant_id)
  );

-- ==================================================================
-- 8.16 سجل المزامنة (sync_log)
-- ==================================================================

CREATE POLICY sync_log_select ON public.sync_log
  FOR SELECT USING (
    public.is_platform_owner()
    OR public.is_same_tenant(tenant_id)
  );

CREATE POLICY sync_log_insert ON public.sync_log
  FOR INSERT WITH CHECK (
    public.is_platform_owner()
    OR public.is_same_tenant(tenant_id)
  );

CREATE POLICY sync_log_update ON public.sync_log
  FOR UPDATE USING (
    public.is_platform_owner()
    OR public.is_same_tenant(tenant_id)
  );

CREATE POLICY sync_log_delete ON public.sync_log
  FOR DELETE USING (
    public.is_platform_owner()
    OR public.is_same_tenant(tenant_id)
  );

-- ==================================================================
-- 8.17 سجل التصدير (export_logs)
-- ==================================================================

CREATE POLICY export_logs_select ON public.export_logs
  FOR SELECT USING (
    public.is_platform_owner()
    OR public.is_same_tenant(tenant_id)
  );

CREATE POLICY export_logs_insert ON public.export_logs
  FOR INSERT WITH CHECK (
    public.is_platform_owner()
    OR public.is_same_tenant(tenant_id)
  );

CREATE POLICY export_logs_update ON public.export_logs
  FOR UPDATE USING (
    public.is_platform_owner()
    OR public.is_same_tenant(tenant_id)
  );

CREATE POLICY export_logs_delete ON public.export_logs
  FOR DELETE USING (
    public.is_platform_owner()
    OR public.is_same_tenant(tenant_id)
  );

-- ==================================================================
-- 8.18 البروفايلات (profiles)
-- ==================================================================

CREATE POLICY profiles_select ON public.profiles
  FOR SELECT USING (
    public.is_platform_owner()
    OR public.is_same_tenant(tenant_id)
    OR id = auth.uid()  -- المستخدم يرى بروفايله الخاص
  );

CREATE POLICY profiles_insert ON public.profiles
  FOR INSERT WITH CHECK (
    public.is_platform_owner()
    OR public.is_same_tenant(tenant_id)
    OR id = auth.uid()
  );

CREATE POLICY profiles_update ON public.profiles
  FOR UPDATE USING (
    public.is_platform_owner()
    OR public.is_same_tenant(tenant_id)
    OR id = auth.uid()
  );

CREATE POLICY profiles_delete ON public.profiles
  FOR DELETE USING (
    public.is_platform_owner()
    OR public.is_same_tenant(tenant_id)
  );

-- ============================================================================
-- الخطوة 9: تفعيل RLS بعد اكتمال جميع السياسات
-- ============================================================================

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_balance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.overtime_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.export_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- تم الانتهاء من تنفيذ الخطوات 6-9
-- ============================================================================