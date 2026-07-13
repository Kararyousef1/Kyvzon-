-- ============================================
--  إصلاح: التأكد من وجود كل أعمدة leave_requests
--  السبب: خطأ 400 عند الموافقة/الرفض بسبب عدم تطابق أسماء الأعمدة
--  بين نسخ مختلفة من الجدول في ملفات SQL متعددة
--  التاريخ: 2026-06-07
-- ============================================
--
--  هذا الملف يضمن وجود كل الأعمدة التي يستخدمها الكود،
--  بصرف النظر عن نسخة الجدول الموجودة حالياً في قاعدة البيانات.
--  (آمن لإعادة التشغيل - يستخدم IF NOT EXISTS و DO blocks)
-- ============================================

-- 1) إضافة الأعمدة الناقصة (إذا لم تكن موجودة)
DO $$
BEGIN
  -- approved_at
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'leave_requests' AND column_name = 'approved_at'
  ) THEN
    ALTER TABLE public.leave_requests ADD COLUMN approved_at TIMESTAMPTZ;
    RAISE NOTICE '✅ تمت إضافة العمود approved_at';
  ELSE
    RAISE NOTICE '⏭️ العمود approved_at موجود بالفعل';
  END IF;

  -- approved_by
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'leave_requests' AND column_name = 'approved_by'
  ) THEN
    ALTER TABLE public.leave_requests
      ADD COLUMN approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
    RAISE NOTICE '✅ تمت إضافة العمود approved_by';
  ELSE
    RAISE NOTICE '⏭️ العمود approved_by موجود بالفعل';
  END IF;

  -- rejection_reason
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'leave_requests' AND column_name = 'rejection_reason'
  ) THEN
    ALTER TABLE public.leave_requests ADD COLUMN rejection_reason TEXT;
    RAISE NOTICE '✅ تمت إضافة العمود rejection_reason';
  ELSE
    RAISE NOTICE '⏭️ العمود rejection_reason موجود بالفعل';
  END IF;

  -- reviewed_at (alias لـ approved_at)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'leave_requests' AND column_name = 'reviewed_at'
  ) THEN
    ALTER TABLE public.leave_requests ADD COLUMN reviewed_at TIMESTAMPTZ;
    RAISE NOTICE '✅ تمت إضافة العمود reviewed_at';
  ELSE
    RAISE NOTICE '⏭️ العمود reviewed_at موجود بالفعل';
  END IF;

  -- reviewed_by (alias لـ approved_by)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'leave_requests' AND column_name = 'reviewed_by'
  ) THEN
    ALTER TABLE public.leave_requests
      ADD COLUMN reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
    RAISE NOTICE '✅ تمت إضافة العمود reviewed_by';
  ELSE
    RAISE NOTICE '⏭️ العمود reviewed_by موجود بالفعل';
  END IF;

  -- review_notes (alias لـ rejection_reason)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'leave_requests' AND column_name = 'review_notes'
  ) THEN
    ALTER TABLE public.leave_requests ADD COLUMN review_notes TEXT;
    RAISE NOTICE '✅ تمت إضافة العمود review_notes';
  ELSE
    RAISE NOTICE '⏭️ العمود review_notes موجود بالفعل';
  END IF;
END $$;

-- 2) تحديث الـ CHECK constraint للحالة (إذا كان مفقوداً أو محدوداً)
DO $$
BEGIN
  -- حذف الـ constraint القديم إن وجد
  ALTER TABLE public.leave_requests DROP CONSTRAINT IF EXISTS leave_requests_status_check;

  -- إضافة constraint جديد يدعم القيم الشائعة
  ALTER TABLE public.leave_requests
    ADD CONSTRAINT leave_requests_status_check
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled'));

  RAISE NOTICE '✅ تم تحديث CHECK constraint للحالة';
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE '⚠️ تخطي تحديث CHECK constraint: %', SQLERRM;
END $$;

-- 3) تحديث سياسات RLS للتأكد من السماح بالـ UPDATE
-- (هام: يجب أن يطابق ما هو موجود في fix_leave_requests_table.sql)

-- حذف السياسات القديمة إن وجدت
DROP POLICY IF EXISTS "Supervisors can update their team's leave requests" ON public.leave_requests;
DROP POLICY IF EXISTS "Admins can manage all leave requests" ON public.leave_requests;
DROP POLICY IF EXISTS "Users can update their own pending leave requests" ON public.leave_requests;

-- الموظف يعدل طلباته المعلّقة فقط
CREATE POLICY "Users can update their own pending leave requests"
  ON public.leave_requests
  FOR UPDATE
  USING (auth.uid() = employee_id AND status = 'pending')
  WITH CHECK (auth.uid() = employee_id);

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

-- المدير/HR يعدل كل الطلبات
CREATE POLICY "Admins can manage all leave requests"
  ON public.leave_requests
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role::text IN ('admin', 'hr', 'developer')
    )
  );

-- 4) منح الصلاحيات
GRANT ALL ON public.leave_requests TO authenticated;
GRANT ALL ON public.leave_requests TO service_role;

-- 5) التحقق النهائي
DO $$
DECLARE
  missing_cols TEXT[] := ARRAY[]::TEXT[];
  col_record RECORD;
BEGIN
  FOR col_record IN
    SELECT unnest(ARRAY['approved_at', 'approved_by', 'rejection_reason',
                         'reviewed_at', 'reviewed_by', 'review_notes',
                         'status', 'employee_id', 'supervisor_id']) AS col_name
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'leave_requests' AND column_name = col_record.col_name
    ) THEN
      missing_cols := array_append(missing_cols, col_record.col_name);
    END IF;
  END LOOP;

  IF array_length(missing_cols, 1) > 0 THEN
    RAISE WARNING '⚠️ أعمدة ناقصة: %', array_to_string(missing_cols, ', ');
  ELSE
    RAISE NOTICE '🎉 جميع الأعمدة موجودة - جدول leave_requests جاهز للعمل!';
  END IF;
END $$;

COMMENT ON TABLE public.leave_requests IS 'جدول طلبات إجازة الموظفين - محدث بتاريخ 2026-06-07 لدعم الموافقات';
