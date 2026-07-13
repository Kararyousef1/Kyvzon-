-- ============================================================================
-- Kyvzon Platform
-- Migration 006: Multi-Tenant (تعدّد الشركات)
-- ============================================================================
-- هذا الملف يضيف دعم Multi-Tenant للنظام بالكامل
-- تنبيه: يتطلب تشغيله مرة واحدة فقط على قاعدة بيانات موجودة
-- ============================================================================

-- ============================================================================
-- 1. جدول الشركات (Tenants)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- اسم الشركة
  name_ar VARCHAR(200) NOT NULL,
  name_en VARCHAR(200),
  -- رمز الشركة المختصر (للاستخدام في كود الموظف)
  code VARCHAR(10) UNIQUE NOT NULL,
  -- معلومات الاتصال
  email VARCHAR(255),
  phone VARCHAR(50),
  address TEXT,
  -- الإعدادات الخاصة بالشركة
  settings JSONB DEFAULT '{}'::jsonb,
  -- حالة الشركة
  is_active BOOLEAN NOT NULL DEFAULT true,
  subscription_tier VARCHAR(50) DEFAULT 'basic'
    CHECK (subscription_tier IN ('basic', 'professional', 'enterprise')),
  subscription_ends_at TIMESTAMPTZ,
  -- الحدود
  max_employees INTEGER DEFAULT 100,
  max_departments INTEGER DEFAULT 20,
  -- الطابع الزمني
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tenants_code ON public.tenants(code);
CREATE INDEX idx_tenants_active ON public.tenants(is_active);

-- ============================================================================
-- 2. جدول ربط المستخدمين بالشركات
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_tenants (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- دور المستخدم داخل هذه الشركة (قد يختلف عن دوره العام)
  role VARCHAR(50) NOT NULL DEFAULT 'employee'
    CHECK (role IN ('developer', 'system_admin', 'manager', 'employee', 'gatekeeper')),
  -- هل هذا هو الشركة الافتراضية للمستخدم؟
  is_default BOOLEAN NOT NULL DEFAULT false,
  -- حالة العضوية
  is_active BOOLEAN NOT NULL DEFAULT true,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- منع التكرار: نفس المستخدم + نفس الشركة = سجل واحد
  CONSTRAINT unique_user_tenant UNIQUE (user_id, tenant_id)
);

CREATE INDEX idx_user_tenants_user ON public.user_tenants(user_id);
CREATE INDEX idx_user_tenants_tenant ON public.user_tenants(tenant_id);
CREATE INDEX idx_user_tenants_default ON public.user_tenants(user_id, is_default) WHERE is_default = true;

-- ============================================================================
-- 3. إضافة عمود tenant_id لكل الجداول الرئيسية
-- ============================================================================

-- --- 3.1 الموظفين (employees) ---
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id),
  ADD COLUMN IF NOT EXISTS tenant_employee_code VARCHAR(50); -- كود الموظف داخل الشركة

-- تحديث فريدية كود الموظف: فريد داخل الشركة وليس عالمياً
-- ✅ تم الإصلاح: نزيل الـ UNIQUE CONSTRAINT القديم أولاً (وليس INDEX)
ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_employee_code_key;
ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS unique_employee_code;
-- ثم نضيف INDEX فريد داخل tenant_id + employee_code
DROP INDEX IF EXISTS idx_employees_tenant_code;
CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_tenant_code
  ON public.employees(tenant_id, employee_code);

-- --- 3.2 الأقسام (departments) ---
ALTER TABLE public.departments
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);

CREATE INDEX IF NOT EXISTS idx_departments_tenant
  ON public.departments(tenant_id);

-- --- 3.3 سجلات الحضور (attendance_logs) ---
ALTER TABLE public.attendance_logs
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);

CREATE INDEX IF NOT EXISTS idx_attendance_logs_tenant
  ON public.attendance_logs(tenant_id);

-- --- 3.4 ملخص الحضور (attendance_summary) ---
ALTER TABLE public.attendance_summary
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);

CREATE INDEX IF NOT EXISTS idx_attendance_summary_tenant
  ON public.attendance_summary(tenant_id);

-- --- 3.5 الزمنيات (permissions) ---
ALTER TABLE public.permissions
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);

CREATE INDEX IF NOT EXISTS idx_permissions_tenant
  ON public.permissions(tenant_id);

-- --- 3.6 طلبات الزمنيات (permissions_request) ---
ALTER TABLE public.permissions_request
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);

CREATE INDEX IF NOT EXISTS idx_permissions_request_tenant
  ON public.permissions_request(tenant_id);

-- --- 3.7 الإجازات (leaves) ---
ALTER TABLE public.leaves
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);

CREATE INDEX IF NOT EXISTS idx_leaves_tenant
  ON public.leaves(tenant_id);

-- --- 3.8 رصيد الإجازات (leave_balance) ---
ALTER TABLE public.leave_balance
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);

CREATE INDEX IF NOT EXISTS idx_leave_balance_tenant
  ON public.leave_balance(tenant_id);

-- --- 3.9 إعدادات الإجازات (leave_settings) ---
ALTER TABLE public.leave_settings
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);

-- --- 3.10 العطل (holidays) ---
ALTER TABLE public.holidays
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);

CREATE INDEX IF NOT EXISTS idx_holidays_tenant
  ON public.holidays(tenant_id);

-- --- 3.11 أوفرتايم (overtime_log) ---
ALTER TABLE public.overtime_log
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);

CREATE INDEX IF NOT EXISTS idx_overtime_log_tenant
  ON public.overtime_log(tenant_id);

-- --- 3.12 الإشعارات (notifications) ---
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);

CREATE INDEX IF NOT EXISTS idx_notifications_tenant
  ON public.notifications(tenant_id);

-- --- 3.13 تحليلات AI (ai_insights) ---
ALTER TABLE public.ai_insights
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);

CREATE INDEX IF NOT EXISTS idx_ai_insights_tenant
  ON public.ai_insights(tenant_id);

-- --- 3.14 إعدادات النظام (system_settings) ---
ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);
-- ✅ تم الإصلاح: نزيل CONSTRAINT PRIMARY KEY القديم (وليس INDEX)
ALTER TABLE public.system_settings DROP CONSTRAINT IF EXISTS system_settings_pkey;
-- system_settings: id + tenant_id معاً هما المفتاح الأساسي الجديد
ALTER TABLE public.system_settings ADD PRIMARY KEY (id, tenant_id);

-- --- 3.15 سجل التدقيق (audit_log) ---
ALTER TABLE public.audit_log
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);

CREATE INDEX IF NOT EXISTS idx_audit_log_tenant
  ON public.audit_log(tenant_id);

-- --- 3.16 سجل المزامنة (sync_log) ---
ALTER TABLE public.sync_log
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);

CREATE INDEX IF NOT EXISTS idx_sync_log_tenant
  ON public.sync_log(tenant_id);

-- --- 3.17 سجل التصدير (export_logs) ---
ALTER TABLE public.export_logs
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);

CREATE INDEX IF NOT EXISTS idx_export_logs_tenant
  ON public.export_logs(tenant_id);

-- ============================================================================
-- 4. دالة تعيين الـ tenant_id في السياق (للاستخدام في RLS)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_tenant_context()
RETURNS TRIGGER AS $$
BEGIN
  -- تعيين tenant_id في سياق الجلسة
  -- يتم استدعاؤها قبل كل عملية INSERT/UPDATE
  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := NULLIF(current_setting('app.current_tenant_id', true), '')::UUID;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 5. مشغلات لتعيين tenant_id تلقائياً عند INSERT
-- ============================================================================

-- تطبيق المشغل على كل جدول
DO $$
DECLARE
  tables_with_tenant TEXT[] := ARRAY[
    'employees', 'departments', 'attendance_logs', 'attendance_summary',
    'permissions', 'permissions_request', 'leaves', 'leave_balance',
    'leave_settings', 'holidays', 'overtime_log', 'notifications',
    'ai_insights', 'audit_log', 'sync_log', 'export_logs'
  ];
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY tables_with_tenant
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS set_tenant_on_insert_%s ON public.%I;',
      tbl, tbl
    );
    EXECUTE format(
      'CREATE TRIGGER set_tenant_on_insert_%s
       BEFORE INSERT ON public.%I
       FOR EACH ROW
       WHEN (NEW.tenant_id IS NULL)
       EXECUTE FUNCTION public.set_tenant_context();',
      tbl, tbl
    );
  END LOOP;
END;
$$;

-- ============================================================================
-- 6. تحديث سياسات RLS لتشمل tenant_id
-- ============================================================================

-- إزالة السياسات القديمة (سنعيد إنشاءها)
DROP POLICY IF EXISTS employees_employee_select ON public.employees;
DROP POLICY IF EXISTS employees_employee_update ON public.employees;
DROP POLICY IF EXISTS attendance_logs_employee_select ON public.attendance_logs;
DROP POLICY IF EXISTS attendance_logs_manager_select ON public.attendance_logs;
DROP POLICY IF EXISTS attendance_logs_admin_select ON public.attendance_logs;
DROP POLICY IF EXISTS attendance_summary_employee_select ON public.attendance_summary;
DROP POLICY IF EXISTS attendance_summary_manager_select ON public.attendance_summary;
DROP POLICY IF EXISTS attendance_summary_admin_select ON public.attendance_summary;
DROP POLICY IF EXISTS permissions_employee_select ON public.permissions;
DROP POLICY IF EXISTS permissions_employee_insert ON public.permissions;
DROP POLICY IF EXISTS permissions_manager_select ON public.permissions;
DROP POLICY IF EXISTS permissions_manager_update ON public.permissions;
DROP POLICY IF EXISTS permissions_admin_select ON public.permissions;
DROP POLICY IF EXISTS permissions_admin_update ON public.permissions;
DROP POLICY IF EXISTS leaves_employee_select ON public.leaves;
DROP POLICY IF EXISTS leaves_employee_insert ON public.leaves;
DROP POLICY IF EXISTS leaves_manager_select ON public.leaves;
DROP POLICY IF EXISTS leaves_manager_update ON public.leaves;
DROP POLICY IF EXISTS leaves_admin_select ON public.leaves;
DROP POLICY IF EXISTS leaves_admin_update ON public.leaves;
DROP POLICY IF EXISTS leave_balance_employee_select ON public.leave_balance;
DROP POLICY IF EXISTS leave_balance_manager_select ON public.leave_balance;
DROP POLICY IF EXISTS leave_balance_admin_select ON public.leave_balance;
DROP POLICY IF EXISTS leave_balance_admin_update ON public.leave_balance;
DROP POLICY IF EXISTS leave_settings_all_select ON public.leave_settings;
DROP POLICY IF EXISTS leave_settings_admin_update ON public.leave_settings;
DROP POLICY IF EXISTS holidays_all_select ON public.holidays;
DROP POLICY IF EXISTS holidays_admin_insert ON public.holidays;
DROP POLICY IF EXISTS holidays_admin_update ON public.holidays;
DROP POLICY IF EXISTS holidays_admin_delete ON public.holidays;
DROP POLICY IF EXISTS notifications_user_select ON public.notifications;
DROP POLICY IF EXISTS notifications_user_update ON public.notifications;
DROP POLICY IF EXISTS ai_insights_global_select ON public.ai_insights;
DROP POLICY IF EXISTS system_settings_all_select ON public.system_settings;
DROP POLICY IF EXISTS system_settings_admin_update ON public.system_settings;
DROP POLICY IF EXISTS audit_log_developer_select ON public.audit_log;
DROP POLICY IF EXISTS audit_log_admin_select ON public.audit_log;
DROP POLICY IF EXISTS sync_log_admin_select ON public.sync_log;
DROP POLICY IF EXISTS export_logs_self_select ON public.export_logs;
DROP POLICY IF EXISTS export_logs_admin_select ON public.export_logs;
DROP POLICY IF EXISTS export_logs_insert ON public.export_logs;
-- ✅ تم الإصلاح: إضافة DROP POLICY المفقودة لـ overtime_log
DROP POLICY IF EXISTS overtime_log_select ON public.overtime_log;

-- ============================================================================
-- دالة مساعدة للحصول على tenant_id الخاص بالمستخدم الحالي
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

  -- 2. من جدول user_tenants (الشركة الافتراضية للمستخدم)
  SELECT tenant_id INTO v_tenant_id
  FROM public.user_tenants
  WHERE user_id = auth.uid() AND is_active = true
  ORDER BY is_default DESC, joined_at DESC
  LIMIT 1;

  RETURN v_tenant_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================================
-- دوال مساعدة للتحقق من الصلاحيات مع مراعاة الـ tenant
-- ============================================================================

/**
 * هل المستخدم الحالي في نفس الشركة التي يمررها؟
 */
CREATE OR REPLACE FUNCTION public.is_same_tenant(p_tenant_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN p_tenant_id IS NOT NULL
    AND p_tenant_id = public.get_current_tenant_id();
END;
$$ LANGUAGE plpgsql STABLE;

/**
 * هل المستخدم الحالي هو نفسه صاحب السجل؟
 */
CREATE OR REPLACE FUNCTION public.is_owner(p_employee_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN p_employee_id IN (
    SELECT id FROM public.employees WHERE user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql STABLE;

/**
 * هل المستخدم الحالي هو مدير القسم؟
 */
CREATE OR REPLACE FUNCTION public.is_manager_of(p_employee_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.employees e1
    JOIN public.employees e2 ON e1.department_id = e2.department_id
    WHERE e1.user_id = auth.uid()
      AND e1.role = 'manager'
      AND e2.id = p_employee_id
  );
END;
$$ LANGUAGE plpgsql STABLE;

/**
 * هل المستخدم الحالي من الصلاحيات العليا (system_admin / developer)؟
 */
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
DECLARE
  v_role VARCHAR(50);
BEGIN
  v_role := NULLIF(current_setting('app.current_role', true), '');
  RETURN v_role IN ('system_admin', 'developer');
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- إعادة إنشاء السياسات مع دعم Multi-Tenant
-- ============================================================================

-- --- 6.1 سياسات الموظفين (employees) ---

-- الموظف: يرى بياناته فقط في شركته
CREATE POLICY employees_select_policy ON public.employees
  FOR SELECT USING (
    -- نفس المستخدم
    auth.uid() = user_id
    OR
    -- مدير/أدمن في نفس الشركة
    (
      public.is_same_tenant(tenant_id)
      AND (
        public.is_admin()
        OR public.is_manager_of(id)
      )
    )
  );

-- الموظف: يعدّل بياناته فقط
CREATE POLICY employees_update_policy ON public.employees
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- --- 6.2 سياسات attendance_logs ---

-- الموظف: يرى بصماته فقط في شركته
CREATE POLICY attendance_logs_select_policy ON public.attendance_logs
  FOR SELECT USING (
    public.is_same_tenant(tenant_id)
    AND (
      public.is_owner(employee_id)
      OR public.is_manager_of(employee_id)
      OR public.is_admin()
    )
  );

-- --- 6.3 سياسات attendance_summary ---

CREATE POLICY attendance_summary_select_policy ON public.attendance_summary
  FOR SELECT USING (
    public.is_same_tenant(tenant_id)
    AND (
      public.is_owner(employee_id)
      OR public.is_manager_of(employee_id)
      OR public.is_admin()
    )
  );

-- --- 6.4 سياسات permissions (الزمنيات) ---

CREATE POLICY permissions_select_policy ON public.permissions
  FOR SELECT USING (
    public.is_same_tenant(tenant_id)
    AND (
      public.is_owner(employee_id)
      OR public.is_manager_of(employee_id)
      OR public.is_admin()
    )
  );

CREATE POLICY permissions_insert_policy ON public.permissions
  FOR INSERT WITH CHECK (
    public.is_same_tenant(tenant_id)
    AND public.is_owner(employee_id)
  );

CREATE POLICY permissions_update_policy ON public.permissions
  FOR UPDATE USING (
    public.is_same_tenant(tenant_id)
    AND (
      public.is_manager_of(employee_id)
      OR public.is_admin()
    )
  );

-- --- 6.5 سياسات permissions_request ---

CREATE POLICY permissions_request_select_policy ON public.permissions_request
  FOR SELECT USING (
    public.is_same_tenant(tenant_id)
    AND (
      public.is_owner(employee_id)
      OR public.is_manager_of(employee_id)
      OR public.is_admin()
    )
  );

CREATE POLICY permissions_request_insert_policy ON public.permissions_request
  FOR INSERT WITH CHECK (
    public.is_same_tenant(tenant_id)
    AND public.is_owner(employee_id)
  );

CREATE POLICY permissions_request_update_policy ON public.permissions_request
  FOR UPDATE USING (
    public.is_same_tenant(tenant_id)
    AND (
      public.is_manager_of(employee_id)
      OR public.is_admin()
    )
  );

-- --- 6.6 سياسات leaves (الإجازات) ---

CREATE POLICY leaves_select_policy ON public.leaves
  FOR SELECT USING (
    public.is_same_tenant(tenant_id)
    AND (
      public.is_owner(employee_id)
      OR public.is_manager_of(employee_id)
      OR public.is_admin()
    )
  );

CREATE POLICY leaves_insert_policy ON public.leaves
  FOR INSERT WITH CHECK (
    public.is_same_tenant(tenant_id)
    AND public.is_owner(employee_id)
  );

CREATE POLICY leaves_update_policy ON public.leaves
  FOR UPDATE USING (
    public.is_same_tenant(tenant_id)
    AND (
      public.is_manager_of(employee_id)
      OR public.is_admin()
    )
  );

-- --- 6.7 سياسات leave_balance ---

CREATE POLICY leave_balance_select_policy ON public.leave_balance
  FOR SELECT USING (
    public.is_same_tenant(tenant_id)
    AND (
      public.is_owner(employee_id)
      OR public.is_manager_of(employee_id)
      OR public.is_admin()
    )
  );

CREATE POLICY leave_balance_update_policy ON public.leave_balance
  FOR UPDATE USING (
    public.is_same_tenant(tenant_id)
    AND public.is_admin()
  );

-- --- 6.8 سياسات leave_settings ---

CREATE POLICY leave_settings_select_policy ON public.leave_settings
  FOR SELECT USING (public.is_same_tenant(tenant_id));

CREATE POLICY leave_settings_update_policy ON public.leave_settings
  FOR UPDATE USING (
    public.is_same_tenant(tenant_id)
    AND public.is_admin()
  );

-- --- 6.9 سياسات holidays ---

CREATE POLICY holidays_select_policy ON public.holidays
  FOR SELECT USING (
    tenant_id IS NULL -- العطل العامة (لجميع الشركات)
    OR public.is_same_tenant(tenant_id)
  );

CREATE POLICY holidays_insert_policy ON public.holidays
  FOR INSERT WITH CHECK (
    public.is_same_tenant(tenant_id)
    AND public.is_admin()
  );

CREATE POLICY holidays_update_policy ON public.holidays
  FOR UPDATE USING (
    public.is_same_tenant(tenant_id)
    AND public.is_admin()
  );

CREATE POLICY holidays_delete_policy ON public.holidays
  FOR DELETE USING (
    public.is_same_tenant(tenant_id)
    AND public.is_admin()
  );

-- --- 6.10 سياسات overtime_log ---

CREATE POLICY overtime_log_select_policy ON public.overtime_log
  FOR SELECT USING (
    public.is_same_tenant(tenant_id)
    AND (
      public.is_owner(employee_id)
      OR public.is_manager_of(employee_id)
      OR public.is_admin()
    )
  );

-- --- 6.11 سياسات notifications ---

CREATE POLICY notifications_select_policy ON public.notifications
  FOR SELECT USING (
    user_id = auth.uid()
    AND (
      tenant_id IS NULL
      OR public.is_same_tenant(tenant_id)
    )
  );

CREATE POLICY notifications_update_policy ON public.notifications
  FOR UPDATE USING (
    user_id = auth.uid()
  );

-- --- 6.12 سياسات ai_insights ---

CREATE POLICY ai_insights_select_policy ON public.ai_insights
  FOR SELECT USING (
    tenant_id IS NULL
    OR public.is_same_tenant(tenant_id)
  );

-- --- 6.13 سياسات system_settings ---

CREATE POLICY system_settings_select_policy ON public.system_settings
  FOR SELECT USING (
    public.is_same_tenant(tenant_id)
  );

CREATE POLICY system_settings_update_policy ON public.system_settings
  FOR UPDATE USING (
    public.is_same_tenant(tenant_id)
    AND public.is_admin()
  );

-- --- 6.14 سياسات audit_log ---

CREATE POLICY audit_log_select_policy ON public.audit_log
  FOR SELECT USING (
    public.is_same_tenant(tenant_id)
    AND public.is_admin()
  );

-- --- 6.15 سياسات sync_log ---

CREATE POLICY sync_log_select_policy ON public.sync_log
  FOR SELECT USING (
    public.is_same_tenant(tenant_id)
    AND public.is_admin()
  );

-- --- 6.16 سياسات export_logs ---

CREATE POLICY export_logs_select_policy ON public.export_logs
  FOR SELECT USING (
    public.is_same_tenant(tenant_id)
    AND (
      public.is_owner(exported_by)
      OR public.is_admin()
    )
  );

CREATE POLICY export_logs_insert_policy ON public.export_logs
  FOR INSERT WITH CHECK (
    public.is_same_tenant(tenant_id)
    AND public.is_owner(exported_by)
  );

-- ============================================================================
-- 7. تحديث دوال SQL لتشمل tenant_id
-- ============================================================================

-- --- 7.1 دالة إنشاء الموظف الجديد (مع tenant_id) ---
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_first_name TEXT;
  v_last_name TEXT;
  v_role TEXT;
  v_employee_code TEXT;
  v_tenant_id UUID;
  v_attempt INT := 0;
BEGIN
  v_first_name := COALESCE(NEW.raw_user_meta_data->>'first_name', NEW.raw_user_meta_data->>'name', 'مستخدم');
  v_last_name := COALESCE(NEW.raw_user_meta_data->>'last_name', NEW.raw_user_meta_data->>'full_name', 'جديد');
  v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'employee');
  v_tenant_id := NULLIF(NEW.raw_user_meta_data->>'tenant_id', '')::UUID;

  INSERT INTO public.profiles (id, full_name, email, role, status, created_at, updated_at)
  VALUES (NEW.id, v_first_name || ' ' || v_last_name, NEW.email, v_role, 'active', NOW(), NOW())
  ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, email = EXCLUDED.email, role = EXCLUDED.role, updated_at = NOW();

  -- توليد employee_code فريد
  LOOP
    v_employee_code := 'EMP-' || UPPER(SUBSTRING(REPLACE(gen_random_uuid()::TEXT, '-', ''), 1, 10));

    BEGIN
      INSERT INTO public.employees (user_id, employee_code, first_name, last_name, email, role, is_active, tenant_id)
      VALUES (NEW.id, v_employee_code, v_first_name, v_last_name, NEW.email, v_role, true, v_tenant_id)
      ON CONFLICT (user_id) DO UPDATE SET 
        employee_code = CASE WHEN public.employees.employee_code IS NULL THEN v_employee_code ELSE public.employees.employee_code END,
        first_name = EXCLUDED.first_name, 
        last_name = EXCLUDED.last_name, 
        email = EXCLUDED.email, 
        is_active = true,
        tenant_id = COALESCE(public.employees.tenant_id, EXCLUDED.tenant_id);
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      v_attempt := v_attempt + 1;
      IF v_attempt >= 5 THEN
        v_employee_code := 'EMP-' || TO_CHAR(NOW(), 'YYYYMMDDHH24MISS') || SUBSTRING(gen_random_uuid()::TEXT, 1, 4);
        INSERT INTO public.employees (user_id, employee_code, first_name, last_name, email, role, is_active, tenant_id)
        VALUES (NEW.id, v_employee_code, v_first_name, v_last_name, NEW.email, v_role, true, v_tenant_id)
        ON CONFLICT (user_id) DO UPDATE SET 
          employee_code = CASE WHEN public.employees.employee_code IS NULL THEN v_employee_code ELSE public.employees.employee_code END,
          first_name = EXCLUDED.first_name, 
          last_name = EXCLUDED.last_name, 
          email = EXCLUDED.email, 
          is_active = true,
          tenant_id = COALESCE(public.employees.tenant_id, EXCLUDED.tenant_id);
        EXIT;
      END IF;
    END;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- --- 7.2 دالة مزامنة ADMS (مع tenant_id) ---
CREATE OR REPLACE FUNCTION public.sync_adms_punch(
  p_employee_code VARCHAR(50),
  p_punch_time TIMESTAMPTZ,
  p_verification_type verification_type_enum DEFAULT 'finger',
  p_device_id VARCHAR(100) DEFAULT NULL,
  p_tenant_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_employee_id UUID;
  v_shift_type shift_type_enum;
  v_shift_date DATE;
  v_tenant UUID;
BEGIN
  -- البحث عن الموظف بالكود (مع tenant_id إذا وُجد)
  IF p_tenant_id IS NOT NULL THEN
    SELECT id, tenant_id INTO v_employee_id, v_tenant
    FROM public.employees
    WHERE employee_code = p_employee_code AND is_active = true AND tenant_id = p_tenant_id;
  ELSE
    SELECT id, tenant_id INTO v_employee_id, v_tenant
    FROM public.employees
    WHERE employee_code = p_employee_code AND is_active = true
    LIMIT 1;
  END IF;

  IF v_employee_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'الموظف غير موجود أو غير نشط'
    );
  END IF;

  v_shift_date := p_punch_time::DATE;
  v_shift_type := public.determine_shift(p_punch_time);

  INSERT INTO public.attendance_logs (
    employee_id, punch_time, shift_type, shift_date,
    device_id, verification_type, source, tenant_id
  ) VALUES (
    v_employee_id, p_punch_time, v_shift_type, v_shift_date,
    p_device_id, p_verification_type, 'ADMS', v_tenant
  )
  ON CONFLICT (employee_id, punch_time) DO NOTHING;

  RETURN jsonb_build_object(
    'success', true,
    'employee_id', v_employee_id,
    'shift_type', v_shift_type,
    'shift_date', v_shift_date,
    'tenant_id', v_tenant
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- --- 7.3 دالة تحديث ملخص الحضور (مع tenant_id) ---
CREATE OR REPLACE FUNCTION public.refresh_attendance_summary(
  p_employee_id UUID,
  p_shift_date DATE
) RETURNS void AS $$
DECLARE
  v_check_in TIMESTAMPTZ;
  v_check_out TIMESTAMPTZ;
  v_shift_type shift_type_enum;
  v_late_minutes INTEGER := 0;
  v_early_leave_minutes INTEGER := 0;
  v_overtime_minutes INTEGER := 0;
  v_status attendance_status_enum;
  v_shift_start TIME;
  v_shift_end TIME;
  v_shift_hours INTEGER;
  v_is_holiday BOOLEAN;
  v_is_friday BOOLEAN;
  v_has_approved_leave BOOLEAN;
  v_has_pending_leave BOOLEAN;
  v_has_approved_permission BOOLEAN;
  v_has_pending_permission BOOLEAN;
  v_total_seconds INTEGER;
  v_shift_settings JSONB;
  v_tenant_id UUID;
BEGIN
  -- الحصول على tenant_id الخاص بالموظف
  SELECT tenant_id INTO v_tenant_id FROM public.employees WHERE id = p_employee_id;

  v_is_friday := EXTRACT(DOW FROM p_shift_date) = 6;

  SELECT EXISTS(
    SELECT 1 FROM public.holidays WHERE date = p_shift_date AND (tenant_id IS NULL OR tenant_id = v_tenant_id)
  ) INTO v_is_holiday;

  IF v_is_friday OR v_is_holiday THEN
    INSERT INTO public.attendance_summary
      (employee_id, shift_date, status, tenant_id)
    VALUES (p_employee_id, p_shift_date, 'عطلة'::attendance_status_enum, v_tenant_id)
    ON CONFLICT (employee_id, shift_date)
    DO UPDATE SET status = 'عطلة'::attendance_status_enum, updated_at = NOW();
    RETURN;
  END IF;

  SELECT punch_time, shift_type
    INTO v_check_in, v_shift_type
  FROM public.attendance_logs
  WHERE employee_id = p_employee_id
    AND shift_date = p_shift_date
  ORDER BY punch_time ASC
  LIMIT 1;

  SELECT punch_time INTO v_check_out
  FROM public.attendance_logs
  WHERE employee_id = p_employee_id
    AND shift_date = p_shift_date
  ORDER BY punch_time DESC
  LIMIT 1;

  IF v_check_in IS NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM public.leaves
      WHERE employee_id = p_employee_id
        AND p_shift_date BETWEEN date_from AND date_to
        AND status = 'موافق'
    ) INTO v_has_approved_leave;

    IF v_has_approved_leave THEN
      v_status := 'مجاز'::attendance_status_enum;
    ELSE
      SELECT EXISTS(
        SELECT 1 FROM public.leaves
        WHERE employee_id = p_employee_id
          AND p_shift_date BETWEEN date_from AND date_to
          AND status = 'انتظار'
      ) INTO v_has_pending_leave;

      IF v_has_pending_leave THEN
        v_status := 'إجازة_انتظار'::attendance_status_enum;
      ELSE
        v_status := 'غائب'::attendance_status_enum;
      END IF;
    END IF;

    INSERT INTO public.attendance_summary
      (employee_id, shift_date, status, tenant_id)
    VALUES (p_employee_id, p_shift_date, v_status, v_tenant_id)
    ON CONFLICT (employee_id, shift_date)
    DO UPDATE SET status = v_status, updated_at = NOW();
    RETURN;
  END IF;

  IF v_shift_type IS NULL THEN
    v_shift_type := public.determine_shift(v_check_in);
  END IF;

  -- جلب إعدادات الوردية حسب الـ tenant
  SELECT shift_timings INTO v_shift_settings
  FROM public.system_settings
  WHERE id = 'singleton' AND tenant_id = v_tenant_id;

  -- إذا لم نجد إعدادات خاصة بالـ tenant، نأخذ الافتراضية
  IF v_shift_settings IS NULL THEN
    v_shift_settings := '{"صباحي": {"start": "08:00", "end": "16:00", "hours": 8}, "مسائي": {"start": "16:00", "end": "00:00", "hours": 8}, "ليلي": {"start": "00:00", "end": "08:00", "hours": 8}}'::jsonb;
  END IF;

  v_shift_start := (v_shift_settings->>v_shift_type::TEXT)::jsonb->>'start';
  v_shift_end := (v_shift_settings->>v_shift_type::TEXT)::jsonb->>'end';
  v_shift_hours := ((v_shift_settings->>v_shift_type::TEXT)::jsonb->>'hours')::INTEGER;

  IF v_check_in::TIME > v_shift_start THEN
    v_late_minutes := EXTRACT(EPOCH FROM (v_check_in::TIME - v_shift_start)) / 60;
  END IF;

  IF v_check_out IS NOT NULL THEN
    v_total_seconds := EXTRACT(EPOCH FROM (v_check_out - v_check_in));

    IF v_total_seconds > v_shift_hours * 3600 THEN
      v_overtime_minutes := (v_total_seconds - v_shift_hours * 3600) / 60;
    END IF;

    IF v_check_out::TIME < v_shift_end THEN
      v_early_leave_minutes := EXTRACT(EPOCH FROM (v_shift_end - v_check_out::TIME)) / 60;
    END IF;
  END IF;

  IF v_late_minutes > 0 THEN
    v_status := 'متأخر'::attendance_status_enum;
  ELSE
    v_status := 'حضور_بوقت'::attendance_status_enum;
  END IF;

  IF v_early_leave_minutes > 0 THEN
    SELECT EXISTS(
      SELECT 1 FROM public.permissions
      WHERE employee_id = p_employee_id
        AND date = p_shift_date
        AND status = 'موافق'
        AND actual_out_time IS NOT NULL
    ) INTO v_has_approved_permission;

    SELECT EXISTS(
      SELECT 1 FROM public.permissions
      WHERE employee_id = p_employee_id
        AND date = p_shift_date
        AND status = 'انتظار'
    ) INTO v_has_pending_permission;

    IF v_has_approved_permission THEN
      v_status := 'زمنية_معتمدة'::attendance_status_enum;
    ELSIF v_has_pending_permission THEN
      v_status := 'زمنية_انتظار'::attendance_status_enum;
    END IF;
  END IF;

  INSERT INTO public.attendance_summary (
    employee_id, shift_date, shift_type, check_in, check_out,
    total_hours, late_minutes, early_leave_minutes,
    overtime_minutes, status, tenant_id
  ) VALUES (
    p_employee_id, p_shift_date, v_shift_type, v_check_in, v_check_out,
    ROUND(COALESCE(v_total_seconds, 0)::NUMERIC / 3600, 2),
    v_late_minutes, v_early_leave_minutes, v_overtime_minutes, v_status, v_tenant_id
  )
  ON CONFLICT (employee_id, shift_date) DO UPDATE SET
    shift_type = COALESCE(v_shift_type, public.attendance_summary.shift_type),
    check_in = COALESCE(v_check_in, public.attendance_summary.check_in),
    check_out = COALESCE(v_check_out, public.attendance_summary.check_out),
    total_hours = ROUND(COALESCE(v_total_seconds, 0)::NUMERIC / 3600, 2),
    late_minutes = COALESCE(v_late_minutes, public.attendance_summary.late_minutes),
    early_leave_minutes = COALESCE(v_early_leave_minutes, public.attendance_summary.early_leave_minutes),
    overtime_minutes = COALESCE(v_overtime_minutes, public.attendance_summary.overtime_minutes),
    status = v_status,
    tenant_id = COALESCE(public.attendance_summary.tenant_id, EXCLUDED.tenant_id),
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- --- 7.4 دالة إحصائيات الحضور اليومية (مع tenant_id) ---
CREATE OR REPLACE FUNCTION public.get_daily_attendance_stats(
  p_date DATE DEFAULT CURRENT_DATE,
  p_tenant_id UUID DEFAULT NULL
) RETURNS TABLE (
  total_employees BIGINT,
  present_count BIGINT,
  late_count BIGINT,
  absent_count BIGINT,
  vacation_count BIGINT,
  permission_count BIGINT,
  attendance_rate NUMERIC(5,2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT AS total_employees,
    COUNT(*) FILTER (WHERE status IN ('حضور_بوقت', 'متأخر', 'زمنية_معتمدة'))::BIGINT AS present_count,
    COUNT(*) FILTER (WHERE status = 'متأخر')::BIGINT AS late_count,
    COUNT(*) FILTER (WHERE status = 'غائب')::BIGINT AS absent_count,
    COUNT(*) FILTER (WHERE status IN ('مجاز', 'عطلة'))::BIGINT AS vacation_count,
    COUNT(*) FILTER (WHERE status IN ('زمنية_معتمدة', 'زمنية_انتظار'))::BIGINT AS permission_count,
    ROUND(
      (COUNT(*) FILTER (WHERE status IN ('حضور_بوقت', 'متأخر', 'زمنية_معتمدة'))::NUMERIC /
      NULLIF(COUNT(*) FILTER (WHERE status NOT IN ('عطلة', 'مجاز')), 0)) * 100, 2
    ) AS attendance_rate
  FROM public.attendance_summary
  WHERE shift_date = p_date
    AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id);
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- 8. إنشاء شركة افتراضية (للنظام الحالي)
-- ============================================================================

-- ننشئ شركة افتراضية للمستخدمين الحاليين الذين ليس لديهم tenant
INSERT INTO public.tenants (id, name_ar, name_en, code, is_active, subscription_tier, max_employees)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'الشركة الافتراضية',
  'Default Company',
  'DEFAULT',
  true,
  'enterprise',
  10000
)
ON CONFLICT (code) DO NOTHING;

-- نربط المستخدمين الحاليين بالشركة الافتراضية (إذا لم يكونوا مرتبطين)
INSERT INTO public.user_tenants (user_id, tenant_id, role, is_default, is_active)
SELECT
  u.id,
  '00000000-0000-0000-0000-000000000001',
  COALESCE(u.raw_user_meta_data->>'role', 'employee'),
  true,
  true
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_tenants ut WHERE ut.user_id = u.id
)
ON CONFLICT (user_id, tenant_id) DO NOTHING;

-- نحدّث الموظفين الحاليين لربطهم بالشركة الافتراضية
UPDATE public.employees
SET tenant_id = '00000000-0000-0000-0000-000000000001'
WHERE tenant_id IS NULL;

-- نحدّث باقي الجداول (إذا كان tenant_id لا يزال NULL)
UPDATE public.departments SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE public.attendance_logs SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE public.attendance_summary SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE public.permissions SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE public.permissions_request SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE public.leaves SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE public.leave_balance SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE public.holidays SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE public.overtime_log SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE public.system_settings SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE public.audit_log SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE public.sync_log SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE public.export_logs SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;

-- ✅ تم الإصلاح: التحقق من عدم وجود NULLs قبل SET NOT NULL
DO $$
DECLARE
  v_tables TEXT[] := ARRAY['employees', 'departments', 'attendance_logs', 'attendance_summary',
    'permissions', 'permissions_request', 'leaves', 'leave_balance',
    'leave_settings', 'holidays', 'overtime_log', 'notifications',
    'ai_insights', 'system_settings', 'audit_log', 'sync_log', 'export_logs'];
  v_tbl TEXT;
  v_null_cnt INTEGER;
BEGIN
  FOREACH v_tbl IN ARRAY v_tables
  LOOP
    EXECUTE format('SELECT COUNT(*) FROM public.%I WHERE tenant_id IS NULL', v_tbl) INTO v_null_cnt;
    IF v_null_cnt > 0 THEN
      RAISE WARNING '⚠️ %: % سجلات بدون tenant_id', v_tbl, v_null_cnt;
    END IF;
  END LOOP;
END;
$$;

-- نجعل عمود tenant_id NOT NULL بعد التحديث والتأكد من عدم وجود NULLs
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

-- ============================================================================
-- 9. تحديث مشغل إنشاء الموظف (عند تسجيل مستخدم جديد)
-- ============================================================================

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- 10. إنشاء نهايات (Endpoint) مساعدة للواجهة
-- ============================================================================

/**
 * جلب الشركات المتاحة للمستخدم الحالي
 */
CREATE OR REPLACE FUNCTION public.get_user_tenants()
RETURNS TABLE (
  tenant_id UUID,
  tenant_name_ar VARCHAR(200),
  tenant_name_en VARCHAR(200),
  tenant_code VARCHAR(10),
  role VARCHAR(50),
  is_default BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id,
    t.name_ar,
    t.name_en,
    t.code,
    ut.role,
    ut.is_default
  FROM public.user_tenants ut
  JOIN public.tenants t ON t.id = ut.tenant_id
  WHERE ut.user_id = auth.uid()
    AND ut.is_active = true
    AND t.is_active = true
  ORDER BY ut.is_default DESC, t.name_ar ASC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

/**
 * تبديل الشركة النشطة للمستخدم (يعيد تعيين سياق الجلسة)
 */
CREATE OR REPLACE FUNCTION public.switch_tenant(p_tenant_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_valid BOOLEAN;
  v_role VARCHAR(50);
BEGIN
  -- التحقق من أن المستخدم عضو في هذه الشركة
  SELECT true, ut.role INTO v_valid, v_role
  FROM public.user_tenants ut
  WHERE ut.user_id = auth.uid()
    AND ut.tenant_id = p_tenant_id
    AND ut.is_active = true;

  IF NOT v_valid THEN
    RETURN jsonb_build_object('success', false, 'error', 'لا تملك صلاحية الوصول لهذه الشركة');
  END IF;

  -- تعيين السياق
  PERFORM set_config('app.current_tenant_id', p_tenant_id::TEXT, false);

  RETURN jsonb_build_object(
    'success', true,
    'tenant_id', p_tenant_id,
    'role', v_role
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- نهاية ملف multi_tenant.sql
-- ============================================================================