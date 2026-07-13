-- ============================================================================
-- Kyvzon Platform — Migration 201: إصلاح أمني حرج لعزل Multi-Tenant
-- ============================================================================
-- المشاكل التي يحلها هذا الملف:
--
-- 🔴 مشكلة #1: ازدواجية دالة get_current_tenant_id()
--    توجد نسختان من الدالة (Migration 006 و 101). النسخة من 101 تستخدم
--    auth.users.raw_user_meta_data->>'tenant_id' كـ fallback، وهذا خطر
--    لأن المستخدم قد يتمكن من تعديل metadata الخاصة به عبر Supabase Auth API.
--    الحل: توحيد الدالة بحيث تقرأ فقط من app.current_tenant_id (الذي
--    يضبطه set_session_context() من profiles، ولا يثق بأي قيمة من العميل).
--
-- 🔴 مشكلة #2: get_current_tenant_id() لا يجب أن يكون لها أي fallback
--    أي fallback يعتمد على بيانات قد يتحكم بها المستخدم هو ثغرة أمنية.
--    الحل: إذا لم يتم ضبط app.current_tenant_id، ترجع NULL — وتمنع RLS الوصول.
--
-- 🔴 مشكلة #3: جداول قد لا تملك RLS (فحص إضافي)
--    نتأكد من تفعيل RLS على أي جداول قد تكون فاتت.
-- ============================================================================

-- ============================================================================
-- 1. إعادة تعريف get_current_tenant_id() — نسخة آمنة بلا fallback
-- ============================================================================

-- إسقاط جميع النسخ القديمة (006 + 101 قد أنشأتا نسختين)
DROP FUNCTION IF EXISTS public.get_current_tenant_id() CASCADE;

-- إعادة الإنشاء بنسخة واحدة آمنة
CREATE OR REPLACE FUNCTION public.get_current_tenant_id()
RETURNS UUID
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  -- الطريقة الوحيدة: من سياق الجلسة الذي ضبطه set_session_context().
  -- set_session_context() بدورها تقرأ من profiles (SECURITY DEFINER)
  -- ولا تثق بأي قيمة من العميل.
  -- لا يوجد أي fallback — إذا لم يُضبط السياق، نرجع NULL ويمنع RLS الوصول.
  v_tenant_id := NULLIF(current_setting('app.current_tenant_id', true), '')::UUID;
  RETURN v_tenant_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 2. إعادة تعريف is_platform_owner() — نسخة موحدة وآمنة
-- ============================================================================

DROP FUNCTION IF EXISTS public.is_platform_owner() CASCADE;

CREATE OR REPLACE FUNCTION public.is_platform_owner()
RETURNS BOOLEAN
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role VARCHAR(50);
BEGIN
  -- يقرأ فقط من app.current_role الذي ضبطه set_session_context()
  -- الذي بدوره يقرأ من profiles.role (SECURITY DEFINER، لا يثق بالعميل)
  v_role := NULLIF(current_setting('app.current_role', true), '');
  RETURN v_role IN ('platform_owner', 'developer');
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 3. إعادة تعريف is_same_tenant() — نسخة موحدة وآمنة
-- ============================================================================

DROP FUNCTION IF EXISTS public.is_same_tenant(UUID) CASCADE;

CREATE OR REPLACE FUNCTION public.is_same_tenant(p_tenant_id UUID)
RETURNS BOOLEAN
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN p_tenant_id IS NOT NULL
    AND p_tenant_id = public.get_current_tenant_id();
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 4. إعادة تعريف tawathul_current_tenant_id() — نسخة آمنة موحدة
--    (تستخدم نفس الآلية بدلاً من قراءة user_metadata)
-- ============================================================================

DROP FUNCTION IF EXISTS public.tawathul_current_tenant_id() CASCADE;

CREATE OR REPLACE FUNCTION public.tawathul_current_tenant_id()
RETURNS UUID
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tid UUID;
BEGIN
  -- نستخدم نفس الآلية الموحدة والآمنة
  v_tid := public.get_current_tenant_id();
  RETURN v_tid;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 5. تفعيل RLS على جداول إضافية قد لا تكون مفعلة
--    (فحص احتياطي — IF NOT EXISTS يمنع الخطأ إذا كانت مفعلة مسبقاً)
-- ============================================================================

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT tablename FROM pg_tables 
    WHERE schemaname = 'public' 
      AND tablename IN (
        'employee_breaks', 'gatekeeper_sessions', 'gatekeeper_visitor_logs',
        'movements_log', 'customer_reviews', 'specialties',
        'structure_departments', 'structure_positions', 'structure_ranks',
        'structure_shifts', 'structure_roles', 'time_logs', 'error_logs',
        'payroll_records', 'employee_loans', 'expense_requests', 'bonuses',
        'disciplinary_actions', 'performance_reviews', 'job_postings',
        'job_applications', 'onboarding_tasks', 'shift_assignments',
        'certifications', 'employee_documents', 'security_events',
        'tenant_subscriptions', 'platform_audit_log'
      )
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
  END LOOP;
END;
$$;

-- ============================================================================
-- 6. سياسات RLS للجداول التي قد تفتقدها
--    كلها تستخدم is_platform_owner() أو is_same_tenant()
-- ============================================================================

-- 6.1 employee_breaks
DROP POLICY IF EXISTS employee_breaks_select ON public.employee_breaks;
CREATE POLICY employee_breaks_select ON public.employee_breaks
  FOR SELECT USING (public.is_platform_owner() OR public.is_same_tenant(tenant_id));

DROP POLICY IF EXISTS employee_breaks_all ON public.employee_breaks;
CREATE POLICY employee_breaks_all ON public.employee_breaks
  FOR ALL USING (public.is_platform_owner() OR public.is_same_tenant(tenant_id));

-- 6.2 gatekeeper tables
DROP POLICY IF EXISTS gatekeeper_sessions_select ON public.gatekeeper_sessions;
CREATE POLICY gatekeeper_sessions_select ON public.gatekeeper_sessions
  FOR SELECT USING (public.is_platform_owner() OR public.is_same_tenant(tenant_id));

DROP POLICY IF EXISTS gatekeeper_visitor_logs_select ON public.gatekeeper_visitor_logs;
CREATE POLICY gatekeeper_visitor_logs_select ON public.gatekeeper_visitor_logs
  FOR SELECT USING (public.is_platform_owner() OR public.is_same_tenant(tenant_id));

-- 6.3 movements_log
DROP POLICY IF EXISTS movements_log_select ON public.movements_log;
CREATE POLICY movements_log_select ON public.movements_log
  FOR SELECT USING (public.is_platform_owner() OR public.is_same_tenant(tenant_id));

-- 6.4 Generic RLS for all other tables mentioned above (catch-all)
--    استخدام DO block لإنشاء سياسات على أي جدول ينقصه
DO $$
DECLARE
  tbl TEXT;
  has_policy BOOLEAN;
BEGIN
  FOR tbl IN
    SELECT tablename FROM pg_tables 
    WHERE schemaname = 'public'
      AND tablename IN (
        'customer_reviews', 'specialties',
        'structure_departments', 'structure_positions', 'structure_ranks',
        'structure_shifts', 'structure_roles', 'time_logs', 'error_logs',
        'payroll_records', 'employee_loans', 'expense_requests', 'bonuses',
        'disciplinary_actions', 'performance_reviews', 'job_postings',
        'job_applications', 'onboarding_tasks', 'shift_assignments',
        'certifications', 'employee_documents'
      )
      AND tablename NOT IN (
        SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = pg_tables.tablename
      )
  LOOP
    -- تحقق مما إذا كان الجدول موجوداً فعلاً
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = ''public'' AND table_name = %L)', tbl) INTO has_policy; -- إعادة استخدام المتغير للتحقق من الوجود
    
    IF has_policy THEN
      -- إذا كان الجدول فيه عمود tenant_id، نضيف سياسة is_same_tenant
      -- وإلا، نسمح فقط لـ platform_owner
      BEGIN
        EXECUTE format('
          DO $inner$
          BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=''public'' AND table_name=%L AND column_name=''tenant_id'') THEN
              EXECUTE format(''CREATE POLICY %I_select ON public.%I FOR SELECT USING (public.is_platform_owner() OR public.is_same_tenant(tenant_id))'', %L||''_select'', %I);
              EXECUTE format(''CREATE POLICY %I_all ON public.%I FOR ALL USING (public.is_platform_owner() OR public.is_same_tenant(tenant_id))'', %L||''_all'', %I);
            ELSE
              EXECUTE format(''CREATE POLICY %I_select ON public.%I FOR SELECT USING (public.is_platform_owner())'', %L||''_select'', %I);
              EXECUTE format(''CREATE POLICY %I_all ON public.%I FOR ALL USING (public.is_platform_owner())'', %L||''_all'', %I);
            END IF;
          END;
          $inner$;
        ', tbl, tbl, tbl, tbl, tbl, tbl, tbl, tbl);
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Failed to create RLS for table %: %', tbl, SQLERRM;
      END;
    END IF;
  END LOOP;
END;
$$;

-- ============================================================================
-- تم الانتهاء من Migration 201 — إصلاح أمني شامل
-- ============================================================================
