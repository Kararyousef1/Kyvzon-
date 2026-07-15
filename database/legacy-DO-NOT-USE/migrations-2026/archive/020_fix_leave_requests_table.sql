-- ============================================
--  إصلاح: إضافة جدول leave_requests
--  السبب: صفحة LeaveRequestPage تستخدم الجدول لكنه غير موجود في schema.sql
--  التاريخ: 2026-06-07
-- ============================================

-- 1) إنشاء جدول leave_requests
CREATE TABLE IF NOT EXISTS public.leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  employee_name TEXT,
  employee_position TEXT,
  employee_department TEXT,
  leave_type TEXT NOT NULL DEFAULT 'سنوية',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days_count INTEGER NOT NULL DEFAULT 1,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  supervisor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  supervisor_name TEXT,
  approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2) فهرس لتسريع الاستعلام
CREATE INDEX IF NOT EXISTS idx_leave_requests_employee_id ON public.leave_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON public.leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_leave_requests_supervisor_id ON public.leave_requests(supervisor_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_dates ON public.leave_requests(start_date, end_date);

-- 3) Trigger لتحديث updated_at تلقائياً
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_leave_requests_updated_at ON public.leave_requests;
CREATE TRIGGER trg_leave_requests_updated_at
  BEFORE UPDATE ON public.leave_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- 4) تفعيل RLS
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

-- 5) حذف السياسات القديمة إن وجدت (لتجنب التكرار)
DROP POLICY IF EXISTS "Users can view their own leave requests" ON public.leave_requests;
DROP POLICY IF EXISTS "Users can insert their own leave requests" ON public.leave_requests;
DROP POLICY IF EXISTS "Users can update their own pending leave requests" ON public.leave_requests;
DROP POLICY IF EXISTS "Supervisors can view their team's leave requests" ON public.leave_requests;
DROP POLICY IF EXISTS "Supervisors can update their team's leave requests" ON public.leave_requests;
DROP POLICY IF EXISTS "Admins can view all leave requests" ON public.leave_requests;
DROP POLICY IF EXISTS "Admins can manage all leave requests" ON public.leave_requests;

-- 6) سياسات RLS

-- الموظف يرى طلباته فقط
CREATE POLICY "Users can view their own leave requests"
  ON public.leave_requests
  FOR SELECT
  USING (auth.uid() = employee_id);

-- الموظف يضيف طلباته فقط
CREATE POLICY "Users can insert their own leave requests"
  ON public.leave_requests
  FOR INSERT
  WITH CHECK (auth.uid() = employee_id);

-- الموظف يعدل طلباته المعلّقة فقط
CREATE POLICY "Users can update their own pending leave requests"
  ON public.leave_requests
  FOR UPDATE
  USING (auth.uid() = employee_id AND status = 'pending')
  WITH CHECK (auth.uid() = employee_id);

-- المشرف يرى طلبات فريقه
-- ملاحظة: نستخدم ::text لتجاوز قيد enum user_role (الذي قد لا يحتوي supervisor/manager)
CREATE POLICY "Supervisors can view their team's leave requests"
  ON public.leave_requests
  FOR SELECT
  USING (
    auth.uid() = supervisor_id
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role::text IN ('supervisor', 'manager')
        AND (p.id = leave_requests.supervisor_id OR p.id = (SELECT manager_id FROM public.profiles WHERE id = leave_requests.employee_id))
    )
  );

-- المشرف يعدل طلبات فريقه (موافقة/رفض)
CREATE POLICY "Supervisors can update their team's leave requests"
  ON public.leave_requests
  FOR UPDATE
  USING (
    auth.uid() = supervisor_id
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role::text IN ('supervisor', 'manager')
    )
  );

-- المدير/HR يرى كل الطلبات
CREATE POLICY "Admins can view all leave requests"
  ON public.leave_requests
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role::text IN ('admin', 'hr', 'developer')
    )
  );

-- المدير يعدل كل الطلبات
CREATE POLICY "Admins can manage all leave requests"
  ON public.leave_requests
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role::text IN ('admin', 'hr', 'developer')
    )
  );

-- 7) منح صلاحيات service_role للوصول الكامل (مهم لـ supabaseAdmin)
-- ملاحظة: سياسات RLS تطبق على anon و authenticated فقط
-- الـ service_role يتجاوز RLS تلقائياً

-- 8) إضافة جدول leave_requests إلى schema.sql للتوثيق
COMMENT ON TABLE public.leave_requests IS 'جدول طلبات إجازة الموظفين';
