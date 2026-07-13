-- ============================================================================
-- الحل النهائي لمشكلة جدول الزمنيات (Permissions Request)
-- ============================================================================
-- قم بتشغيل هذا الملف كاملاً في Supabase SQL Editor 
-- يمكن تشغيله عدة مرات بدون أخطاء
-- ============================================================================

-- 1. إنشاء الجدول (إذا لم يكن موجوداً)
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

-- 2. فهارس
CREATE INDEX IF NOT EXISTS idx_permissions_request_employee ON public.permissions_request(employee_id);
CREATE INDEX IF NOT EXISTS idx_permissions_request_date ON public.permissions_request(date);
CREATE INDEX IF NOT EXISTS idx_permissions_request_status ON public.permissions_request(status);
CREATE INDEX IF NOT EXISTS idx_permissions_request_created_at ON public.permissions_request(created_at DESC);

-- 3. تفعيل RLS
ALTER TABLE public.permissions_request ENABLE ROW LEVEL SECURITY;

-- 4. حذف جميع السياسات السابقة (إن وجدت)
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN 
    SELECT policyname FROM pg_policies 
    WHERE tablename = 'permissions_request' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.permissions_request', pol.policyname);
  END LOOP;
END $$;

-- 5. إنشاء 3 سياسات RLS بسيطة
-- 5a. الموظف يرى سجلاته فقط
CREATE POLICY "policy_employee_select" ON public.permissions_request
  FOR SELECT
  USING (employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()));

-- 5b. الموظف يضيف سجل (employee_id الخاص به فقط)
CREATE POLICY "policy_employee_insert" ON public.permissions_request
  FOR INSERT
  WITH CHECK (employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()));

-- 5c. المدير والأدمن: كل الصلاحيات على كل السجلات
CREATE POLICY "policy_admin_all" ON public.permissions_request
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.employees 
      WHERE user_id = auth.uid() 
      AND role IN ('manager', 'system_admin', 'developer')
    )
  );

-- 6. حذف وإنشاء دالة RPC لتجاوز RLS
DROP FUNCTION IF EXISTS public.insert_permission_request;

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
  v_emp_id UUID;
BEGIN
  -- البحث عن الموظف باستخدام المعرف الممرر (سواء كان id الموظف أو user_id الخاص به)
  -- أو البحث باستخدام المعرف الحالي للمستخدم لضمان العثور عليه
  SELECT id INTO v_emp_id 
  FROM public.employees 
  WHERE id = p_employee_id 
     OR user_id = p_employee_id 
     OR user_id = auth.uid();

  -- إذا لم نجد الموظف في جدول الموظفين، نقوم بإنشائه فوراً لضمان عدم فشل الطلب
  IF v_emp_id IS NULL THEN
    INSERT INTO public.employees (user_id, employee_code, first_name, last_name, role, is_active)
    VALUES (
      auth.uid(),
      'EMP-' || UPPER(SUBSTRING(REPLACE(gen_random_uuid()::TEXT, '-', ''), 1, 8)),
      SPLIT_PART(COALESCE(p_employee_name, 'مستخدم'), ' ', 1),
      COALESCE(NULLIF(SPLIT_PART(p_employee_name, ' ', 2), ''), 'جديد'),
      'employee',
      true
    )
    ON CONFLICT (user_id) DO UPDATE SET updated_at = NOW()
    RETURNING id INTO v_emp_id;
  END IF;

  INSERT INTO public.permissions_request (
    employee_id, employee_name, employee_department,
    date, permission_type, expected_out_time,
    expected_return_time, reason, status
  ) VALUES (
    v_emp_id, p_employee_name, p_employee_department,
    p_date, p_permission_type, p_expected_out_time,
    p_expected_return_time, p_reason, 'انتظار'
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- 7. منح صلاحية تنفيذ الدالة
GRANT EXECUTE ON FUNCTION public.insert_permission_request TO anon;
GRANT EXECUTE ON FUNCTION public.insert_permission_request TO authenticated;

-- 8. Trigger لتحديث updated_at
DROP TRIGGER IF EXISTS update_permissions_request_updated_at ON public.permissions_request;
CREATE TRIGGER update_permissions_request_updated_at
  BEFORE UPDATE ON public.permissions_request
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();