-- ============================================================================
-- إضافة جدول طلبات الزمنيات (Permissions Request)
-- ============================================================================

-- حذف كل السياسات وال triggers الموجودة مسبقاً
DROP POLICY IF EXISTS permissions_request_employee_select ON public.permissions_request;
DROP POLICY IF EXISTS permissions_request_employee_insert ON public.permissions_request;
DROP POLICY IF EXISTS permissions_request_employee_update ON public.permissions_request;
DROP POLICY IF EXISTS permissions_request_employee_delete ON public.permissions_request;
DROP POLICY IF EXISTS permissions_request_manager_select ON public.permissions_request;
DROP POLICY IF EXISTS permissions_request_manager_insert ON public.permissions_request;
DROP POLICY IF EXISTS permissions_request_manager_update ON public.permissions_request;
DROP POLICY IF EXISTS permissions_request_manager_delete ON public.permissions_request;
DROP POLICY IF EXISTS permissions_request_admin_select ON public.permissions_request;
DROP POLICY IF EXISTS permissions_request_admin_insert ON public.permissions_request;
DROP POLICY IF EXISTS permissions_request_admin_update ON public.permissions_request;
DROP POLICY IF EXISTS permissions_request_admin_delete ON public.permissions_request;
DROP POLICY IF EXISTS emp_select ON public.permissions_request;
DROP POLICY IF EXISTS emp_insert ON public.permissions_request;
DROP POLICY IF EXISTS mgr_select ON public.permissions_request;
DROP POLICY IF EXISTS mgr_update ON public.permissions_request;
DROP POLICY IF EXISTS admin_select ON public.permissions_request;
DROP POLICY IF EXISTS admin_insert ON public.permissions_request;
DROP POLICY IF EXISTS admin_update ON public.permissions_request;
DROP POLICY IF EXISTS admin_delete ON public.permissions_request;
DROP POLICY IF EXISTS "allow_select" ON public.permissions_request;
DROP POLICY IF EXISTS "allow_insert" ON public.permissions_request;
DROP POLICY IF EXISTS "allow_update" ON public.permissions_request;
DROP POLICY IF EXISTS "allow_delete" ON public.permissions_request;
DROP TRIGGER IF EXISTS update_permissions_request_updated_at ON public.permissions_request;
DROP FUNCTION IF EXISTS public.insert_permission_request;

CREATE TABLE IF NOT EXISTS public.permissions_request (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id),
  employee_name VARCHAR(200),
  employee_department VARCHAR(200),
  date DATE NOT NULL,
  permission_type permission_type_enum NOT NULL DEFAULT 'عادية',
  expected_out_time TIME NOT NULL,
  expected_return_time TIME,
  reason TEXT NOT NULL,
  status permission_status_enum NOT NULL DEFAULT 'انتظار',
  approved_by UUID REFERENCES public.employees(id),
  rejection_reason TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- فهارس للأداء
CREATE INDEX IF NOT EXISTS idx_permissions_request_employee ON public.permissions_request(employee_id);
CREATE INDEX IF NOT EXISTS idx_permissions_request_date ON public.permissions_request(date);
CREATE INDEX IF NOT EXISTS idx_permissions_request_status ON public.permissions_request(status);
CREATE INDEX IF NOT EXISTS idx_permissions_request_created_at ON public.permissions_request(created_at DESC);

-- تفعيل RLS
ALTER TABLE public.permissions_request ENABLE ROW LEVEL SECURITY;

-- ========================================
-- سياسات RLS بسيطة باستخدام auth.uid()
-- ========================================

-- الموظف يرى زمنياته (عن طريق employees.user_id)
CREATE POLICY "select_self" ON public.permissions_request
  FOR SELECT
  USING (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  );

-- الموظف يضيف زمنية (employee_id = employees.id الخاص به)
CREATE POLICY "insert_self" ON public.permissions_request
  FOR INSERT
  WITH CHECK (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  );

-- المدير والأدمن: يروا ويعدلوا كل الزمنيات
CREATE POLICY "all_admin_manager" ON public.permissions_request
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.employees
      WHERE user_id = auth.uid()
      AND role IN ('manager', 'system_admin', 'developer')
    )
  );

-- مشغل تحديث updated_at
DROP TRIGGER IF EXISTS update_permissions_request_updated_at ON public.permissions_request;
CREATE TRIGGER update_permissions_request_updated_at
  BEFORE UPDATE ON public.permissions_request
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ========================================
-- دالة RPC لإدراج طلب زمنية (تتجاوز RLS)
-- ========================================
CREATE OR REPLACE FUNCTION public.insert_permission_request(
  p_employee_id UUID,
  p_employee_name VARCHAR,
  p_employee_department VARCHAR,
  p_date DATE,
  p_permission_type permission_type_enum,
  p_expected_out_time TIME,
  p_expected_return_time TIME,
  p_reason TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  -- التحقق: المستخدم يضيف لنفسه فقط (أو هو أدمن/مدير)
  IF NOT (
    p_employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
    OR
    EXISTS (SELECT 1 FROM public.employees WHERE user_id = auth.uid() AND role IN ('manager', 'system_admin', 'developer'))
  ) THEN
    RAISE EXCEPTION 'ليس لديك صلاحية لإضافة طلب زمنية لهذا الموظف';
  END IF;

  INSERT INTO public.permissions_request (
    employee_id, employee_name, employee_department,
    date, permission_type, expected_out_time,
    expected_return_time, reason, status
  ) VALUES (
    p_employee_id, p_employee_name, p_employee_department,
    p_date, p_permission_type, p_expected_out_time,
    p_expected_return_time, p_reason, 'انتظار'
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- منح صلاحية تنفيذ الدالة للمستخدم المجهول (anon key)
GRANT EXECUTE ON FUNCTION public.insert_permission_request TO anon;
GRANT EXECUTE ON FUNCTION public.insert_permission_request TO authenticated;
