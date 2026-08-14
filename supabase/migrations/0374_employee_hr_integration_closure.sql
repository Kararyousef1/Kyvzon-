-- ════════════════════════════════════════════════════════════════════════
--  0374 — إغلاق أول فجوتين في تكامل بوابتَي الموظف والموارد البشرية
--
--  ① إنشاء طلب ContactPage كان عمليتين منفصلتين:
--       hr_cases ثم hr_messages بلا case_id
--     وأي فشلٍ بينهما يترك نصف طلب. الآن دالة ذرية واحدة تنشئهما
--     داخل المعاملة نفسها، وتشتق tenant/employee/sender من الجلسة.
--
--  ② ردّ HR كان يغيّر حالة hr_cases فقط، لكنه لا يخزن نص الرد في
--     المسار الذي يقرؤه الموظف. الآن يضيف تعليقاً عاماً append-only
--     في hr_case_comments، فتصل الرسالة الفعلية لا مجرد الحالة.
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── تعليقات الحالة وثائق غير قابلة للتعديل أو الحذف ─────────────────
DROP POLICY IF EXISTS kyvzon_hr_case_comments_write ON public.hr_case_comments;
DROP POLICY IF EXISTS kyvzon_hr_case_comments_insert ON public.hr_case_comments;
CREATE POLICY kyvzon_hr_case_comments_insert ON public.hr_case_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.current_user_tenant_id()
    AND (
      public.current_user_is_staff()
      OR (
        is_internal = false
        AND EXISTS (
          SELECT 1
            FROM public.hr_cases c
           WHERE c.id = hr_case_comments.case_id
             AND c.tenant_id = hr_case_comments.tenant_id
             AND c.employee_id = public.current_user_employee_id()
        )
      )
    )
  );

REVOKE UPDATE, DELETE ON public.hr_case_comments FROM authenticated;

CREATE OR REPLACE FUNCTION public.tg_block_hr_case_comment_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  RAISE EXCEPTION
    'HR_CASE_COMMENT_IMMUTABLE: تعليقات الحالة وثائق متسلسلة ولا تُعدّل أو تُحذف (id=%)',
    OLD.id;
END $$;

DROP TRIGGER IF EXISTS trg_block_hr_case_comment_mutation
  ON public.hr_case_comments;
CREATE TRIGGER trg_block_hr_case_comment_mutation
  BEFORE UPDATE OR DELETE ON public.hr_case_comments
  FOR EACH ROW EXECUTE FUNCTION public.tg_block_hr_case_comment_mutation();

-- ── إنشاء ذري للحالة والرسالة المرتبطة ──────────────────────────────
DROP FUNCTION IF EXISTS public.employee_hr_case_submit(TEXT, TEXT, TEXT, TEXT);
CREATE FUNCTION public.employee_hr_case_submit(
  p_case_type   TEXT,
  p_subject     TEXT,
  p_description TEXT,
  p_priority    TEXT DEFAULT 'normal'
)
RETURNS TABLE(out_case_id UUID, out_message_id UUID)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant       UUID := public.current_user_tenant_id();
  v_employee     UUID := public.current_user_employee_id();
  v_case_id      UUID;
  v_message_id   UUID;
  v_subject      TEXT := btrim(COALESCE(p_subject, ''));
  v_description  TEXT := btrim(COALESCE(p_description, ''));
  v_case_type    TEXT := COALESCE(NULLIF(btrim(p_case_type), ''), 'general_inquiry');
  v_priority     TEXT := COALESCE(NULLIF(btrim(p_priority), ''), 'normal');
  v_type_label   TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'HR_CASE_UNAUTHENTICATED: يجب تسجيل الدخول';
  END IF;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'HR_CASE_NO_TENANT: لا مستأجر في السياق';
  END IF;
  IF v_employee IS NULL THEN
    RAISE EXCEPTION 'HR_CASE_NO_EMPLOYEE: حسابك غير مرتبط بسجل موظف';
  END IF;
  IF NOT public.hybrid_allows_module('hr') THEN
    RAISE EXCEPTION 'HR_CASE_MODULE_DISABLED: وحدة الموارد البشرية غير مفعلة';
  END IF;
  IF v_subject = '' OR v_description = '' THEN
    RAISE EXCEPTION 'HR_CASE_TEXT_REQUIRED: الموضوع والوصف مطلوبان';
  END IF;
  IF v_priority NOT IN ('low', 'normal', 'urgent') THEN
    RAISE EXCEPTION 'HR_CASE_BAD_PRIORITY: أولوية غير معروفة %', v_priority;
  END IF;

  -- hr_case_open تحرس الملكية والمستأجر وتملأ SLA؛ فشل الإدراج التالي
  -- يعيد المعاملة كلها، فلا تبقى حالة بلا رسالة أو رسالة بلا حالة.
  v_case_id := public.hr_case_open(
    NULL,
    v_case_type,
    v_subject,
    v_description,
    v_priority,
    'employee_portal'
  );

  v_type_label := CASE v_case_type
    WHEN 'general_inquiry'  THEN 'استفسار عام'
    WHEN 'payroll'          THEN 'الرواتب والاستقطاعات'
    WHEN 'benefits'         THEN 'المزايا والتأمين'
    WHEN 'documents'        THEN 'المستندات والخطابات'
    WHEN 'attendance'       THEN 'الحضور والإجازات'
    WHEN 'work_environment' THEN 'بيئة العمل'
    ELSE v_case_type
  END;

  INSERT INTO public.hr_messages (
    tenant_id,
    employee_id,
    sender_id,
    case_id,
    subject,
    message,
    priority,
    status
  ) VALUES (
    v_tenant,
    v_employee,
    auth.uid(),
    v_case_id,
    format('[%s] %s', v_type_label, v_subject),
    v_description,
    v_priority,
    'new'
  )
  RETURNING id INTO v_message_id;

  RETURN QUERY SELECT v_case_id, v_message_id;
END $$;

REVOKE ALL ON FUNCTION public.employee_hr_case_submit(TEXT,TEXT,TEXT,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.employee_hr_case_submit(TEXT,TEXT,TEXT,TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.employee_hr_case_submit(TEXT,TEXT,TEXT,TEXT) TO authenticated;

COMMENT ON FUNCTION public.employee_hr_case_submit(TEXT,TEXT,TEXT,TEXT) IS
  'إنشاء ذري لطلب خدمة الموظف ورسالة صندوق HR المرتبطة به. لا يستقبل tenant_id أو employee_id — 0374.';

-- ── الرد يصل كنصٍ عام في خيط الحالة ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.hr_message_reply(p_id UUID, p_reply TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_case   UUID;
  v_tenant UUID := public.current_user_tenant_id();
  v_txt    TEXT := btrim(COALESCE(p_reply, ''));
BEGIN
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'HR_MESSAGE_FORBIDDEN: الردّ للموارد البشرية والإدارة فقط';
  END IF;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'HR_MESSAGE_NO_TENANT: لا مستأجر في السياق';
  END IF;
  IF v_txt = '' THEN
    RAISE EXCEPTION 'HR_MESSAGE_EMPTY_REPLY: نصُّ الردّ فارغ';
  END IF;

  UPDATE public.hr_messages
     SET status = 'replied',
         reply = v_txt,
         replied_by = auth.uid(),
         replied_at = now()
   WHERE id = p_id
     AND tenant_id = v_tenant
     AND archived_at IS NULL
  RETURNING case_id INTO v_case;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'HR_MESSAGE_NOT_FOUND: لا رسالةَ مفتوحةً بهذا المعرّف';
  END IF;

  IF v_case IS NOT NULL THEN
    UPDATE public.hr_cases
       SET first_response_at = COALESCE(first_response_at, now()),
           status = CASE WHEN status = 'open' THEN 'in_review' ELSE status END
     WHERE id = v_case
       AND tenant_id = v_tenant;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'HR_MESSAGE_CASE_NOT_FOUND: الحالة المرتبطة غير موجودة';
    END IF;

    INSERT INTO public.hr_case_comments (
      tenant_id,
      case_id,
      employee_id,
      author_id,
      author_role,
      message,
      is_internal
    )
    SELECT
      c.tenant_id,
      c.id,
      c.employee_id,
      auth.uid(),
      public.current_user_role(),
      v_txt,
      false
    FROM public.hr_cases c
    WHERE c.id = v_case
      AND c.tenant_id = v_tenant;
  END IF;

  RETURN TRUE;
END $$;

REVOKE ALL ON FUNCTION public.hr_message_reply(UUID,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_message_reply(UUID,TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_message_reply(UUID,TEXT) TO authenticated;

COMMENT ON FUNCTION public.hr_message_reply(UUID,TEXT) IS
  'يرد على رسالة HR ويضيف الرد العام إلى hr_case_comments كي يقرأه الموظف من الحالة المرتبطة — 0374.';

COMMIT;
