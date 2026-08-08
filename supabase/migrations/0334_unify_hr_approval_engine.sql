-- ============================================================================
-- 0334_unify_hr_approval_engine.sql
--
-- توحيد محرّك الاعتماد — الخيار «أ»: الهجرة الكاملة.
--
-- ═══ الوضع قبل هذا المايجريشن — مُقاس لا مُخمَّن ═══════════════════════════
--
--   نظامان متوازيان لخطوات الاعتماد:
--
--     hr_approval_steps        ← بوابة الموظف
--         LeaveRequestPage · PermissionsPage · HrApprovalInbox
--         HrApprovalService · LeaveService
--
--     unified_approval_steps   ← بوابة المدير وبقية البوابات
--         ManagerApprovalsPage · UnitApprovalsPage · ApprovalTrail
--         UnifiedApprovalService · FinancialRequestService
--
-- ─── ★ تصحيح علني لتقرير المرحلة 0 ───────────────────────────────────────
--
--   قِستُ في المرحلة 0 أن السلسلة «تنقطع تماماً» فأعطت:
--       hr_approval_steps = 0 · إشعارات = 0
--   وكان القياس **خاطئاً**: أدخلتُ الصفّ في hr_approval_requests يدوياً
--   بـINSERT بدل استدعاء الدالة الرسمية create_hr_approval().
--
--   القياس الصحيح باستدعاء الدالة:
--       hr_approval_steps      = 2   ✅
--       إشعارات               = 1   ✅
--       my_approval_inbox      = 1   ✅  (يقرأ الجدولين — جسر قائم)
--       السلسلة تكتمل: pending → approved
--       leaves.status = 'موافق'      ✅  (0323 يُزامنها)
--
--   ⇒ النظام القديم **يعمل**. ما لا يعمل هو التكامل مع المحرّك الموحّد.
--     أعتذر عن التقرير السابق وأُصحّحه هنا علناً.
--
-- ─── الأعطال الحقيقية المُثبَتة بنصّها ────────────────────────────────────
--
--   ① سجل تتبّع الاعتماد أعمى تجاه طلبات الموارد البشرية:
--        approval_steps_for('hr', <leave_id>)  =  0 خطوة
--        بينما hr_approval_steps الحقيقية      =  2
--      ⇒ الموظف يفتح ApprovalTrail فيرى سلسلة فارغة، ولا يعرف عند من
--        يقف طلبه.
--
--   ② المحرّك الموحّد يرفض البتّ في طلبات الموارد البشرية:
--        unified_approval_decide('hr', <leave_id>, 'approved', …)
--        →  APPROVAL_NOT_FOUND_OR_DECIDED
--      السبب: source_id في العرض هو hr_approval_requests.id لا
--      leaves.id — التباس مرجعي يجعل الاستدعاء الطبيعي يفشل.
--
--   ③ unified_approval_steps لطلبات HR = صفر دائماً، فكل ما يُبنى فوق
--      المحرّك الموحّد (تتبّع · تقارير · تحليلات) يتجاهل نصف الطلبات.
--
-- ═══ ما يفعله هذا المايجريشن ══════════════════════════════════════════════
--
--   استراتيجية: **مرآة لا استبدال**. الجدول القديم يبقى مصدر الحقيقة
--   للشاشات القائمة، ومحفّز يعكس كل خطوة إلى الجدول الموحّد فوراً.
--   هكذا:
--     · لا شاشة تنكسر اليوم
--     · المحرّك الموحّد يرى كل شيء فوراً
--     · الهجرة النهائية (حذف القديم) تصير تغييراً في الواجهة فقط
--
--   ① mirror_hr_step_to_unified()  — دالة المرآة
--   ② محفّز AFTER INSERT OR UPDATE على hr_approval_steps
--   ③ backfill للخطوات القائمة
--   ④ approval_steps_for() تُعاد لتقرأ الجدولين
--   ⑤ unified_approval_decide() تقبل معرّف المصدر أو معرّف الطلب
--   ⑥ فهارس
--
-- ─── حقائق بنيوية مُحقَّقة (information_schema/pg_constraint) ─────────────
--   hr_approval_steps: request_id · step_order · approver_role · approver_id
--     · status · comments · decided_at  — **لا decided_by ولا rule_name**
--     approver_role ∈ supervisor · manager · direct_manager
--     status ∈ pending · active · approved · rejected · skipped
--     UNIQUE (request_id, step_order)
--   unified_approval_steps: source_module VARCHAR · source_id · step_order
--     · required_role · approver_id · status · comments · decided_by
--     · decided_at · rule_name
--     source_module ∈ hr · procurement · finance · contracts · movement
--                     · inventory · mrp · crm · general   ← 'hr' مسموح
--     UNIQUE (tenant_id, source_module, source_id, step_order)
--   hr_approval_requests: request_type ∈ leave · permission · expense · loan
--     status ∈ pending · approved · rejected · related_id **بلا FK**
--   ★ unified_approvals.source_id لطلبات HR = hr_approval_requests.id
--     و source_module = 'hr' للإجازة/الاستئذان و'employee_finance'
--     للمصروف/السلفة.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- ① دالة المرآة
--
--    تنسخ خطوة hr_approval_steps إلى unified_approval_steps.
--
--    ★ المفتاح: نستعمل **request_id** كـsource_id لا related_id — ليطابق
--      ما يعرضه unified_approvals، وإلا صار مرجعان لنفس الطلب.
--
--    ★ source_module يُشتقّ من request_type ليطابق العرض حرفياً:
--        leave · permission → 'hr'
--        expense · loan     → 'finance'   (العرض يسمّيه employee_finance
--                                          كوحدة، لكن قيد CHECK على
--                                          unified_approval_steps لا يقبل
--                                          'employee_finance' — القيم
--                                          التسع محدودة. نستعمل 'finance')
--
--    VOLATILE: تكتب. (درس 0320 — STABLE يمنع الكتابة صامتاً)
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.mirror_hr_step_to_unified(UUID);

CREATE FUNCTION public.mirror_hr_step_to_unified(p_step_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_step   RECORD;
  v_type   TEXT;
  v_module TEXT;
BEGIN
  SELECT s.id, s.request_id, s.tenant_id, s.step_order, s.approver_role,
         s.approver_id, s.status, s.comments, s.decided_at
    INTO v_step
    FROM public.hr_approval_steps s
   WHERE s.id = p_step_id;

  IF NOT FOUND THEN RETURN FALSE; END IF;

  SELECT r.request_type INTO v_type
    FROM public.hr_approval_requests r
   WHERE r.id = v_step.request_id;

  IF v_type IS NULL THEN RETURN FALSE; END IF;

  -- ★ التطابق مع unified_approvals: leave/permission ⇒ hr
  --   expense/loan ⇒ finance (القيد لا يقبل 'employee_finance')
  v_module := CASE
                WHEN v_type IN ('leave', 'permission') THEN 'hr'
                WHEN v_type IN ('expense', 'loan')     THEN 'finance'
                ELSE 'general'
              END;

  INSERT INTO public.unified_approval_steps
    (tenant_id, source_module, source_id, step_order,
     required_role, approver_id, status, comments, decided_at, rule_name)
  VALUES
    (v_step.tenant_id, v_module, v_step.request_id, v_step.step_order,
     v_step.approver_role, v_step.approver_id, v_step.status,
     v_step.comments, v_step.decided_at, 'مرآة سلسلة الموارد البشرية')
  ON CONFLICT (tenant_id, source_module, source_id, step_order)
  DO UPDATE SET
    required_role = EXCLUDED.required_role,
    approver_id   = EXCLUDED.approver_id,
    status        = EXCLUDED.status,
    comments      = EXCLUDED.comments,
    decided_at    = EXCLUDED.decided_at,
    updated_at    = NOW();

  RETURN TRUE;
END $$;

COMMENT ON FUNCTION public.mirror_hr_step_to_unified(UUID) IS
  'تعكس خطوة hr_approval_steps إلى unified_approval_steps. source_id هو '
  'request_id ليطابق unified_approvals. ON CONFLICT يجعلها آمنة للتكرار.';

REVOKE ALL ON FUNCTION public.mirror_hr_step_to_unified(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mirror_hr_step_to_unified(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.mirror_hr_step_to_unified(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ② المحفّز
--
--    AFTER INSERT OR UPDATE: الخطوة تُنشأ 'active' أو 'pending' ثم
--    تتغيّر إلى approved/rejected/skipped — نعكس كل تحوّل.
--
--    ★ لا يرفع استثناء أبداً: فشل المرآة يجب ألّا يُسقط الاعتماد نفسه.
--      نفس نمط الحراسة في 0310 (RAISE WARNING لا EXCEPTION).
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_mirror_hr_step()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    PERFORM public.mirror_hr_step_to_unified(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'mirror_hr_step فشلت للخطوة %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END $$;

COMMENT ON FUNCTION public.tg_mirror_hr_step() IS
  'محفّز المرآة. لا يرفع استثناء — فشل المرآة لا يجوز أن يُسقط الاعتماد.';

DROP TRIGGER IF EXISTS trg_mirror_hr_step ON public.hr_approval_steps;
CREATE TRIGGER trg_mirror_hr_step
  AFTER INSERT OR UPDATE ON public.hr_approval_steps
  FOR EACH ROW EXECUTE FUNCTION public.tg_mirror_hr_step();

-- ─────────────────────────────────────────────────────────────────────────
-- ③ Backfill — الخطوات القائمة قبل المحفّز
--
--    قابل لإعادة التشغيل بفضل ON CONFLICT داخل الدالة.
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_id UUID;
  v_n  INTEGER := 0;
BEGIN
  FOR v_id IN SELECT id FROM public.hr_approval_steps LOOP
    IF public.mirror_hr_step_to_unified(v_id) THEN
      v_n := v_n + 1;
    END IF;
  END LOOP;
  RAISE NOTICE '0334: عُكست % خطوة قائمة إلى المحرّك الموحّد', v_n;
END $$;

-- ④ حلّ الالتباس المرجعي — العطل ②
--
--    unified_approval_decide('hr', <leave_id>, …) فشلت بـ
--    APPROVAL_NOT_FOUND_OR_DECIDED لأن source_id المتوقَّع هو
--    hr_approval_requests.id لا leaves.id.
--
--    الحل: دالة ترجمة صريحة. لا نغيّر unified_approval_decide (ضخمة
--    وتخدم عشر وحدات) بل نُوفّر محوّلاً يُستدعى قبلها.
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.resolve_hr_approval_source(UUID);

CREATE FUNCTION public.resolve_hr_approval_source(p_any_id UUID)
RETURNS TABLE(
  out_request_id UUID,
  out_module     TEXT,
  out_kind       TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
BEGIN
  IF v_tenant IS NULL OR p_any_id IS NULL THEN RETURN; END IF;

  -- ① المعرّف هو طلب اعتماد مباشرةً
  RETURN QUERY
  SELECT r.id,
         CASE WHEN r.request_type IN ('leave','permission')
              THEN 'hr' ELSE 'finance' END::TEXT,
         'request'::TEXT
    FROM public.hr_approval_requests r
   WHERE r.id = p_any_id AND r.tenant_id = v_tenant;

  IF FOUND THEN RETURN; END IF;

  -- ② المعرّف هو المصدر (إجازة · استئذان · مصروف · سلفة)
  RETURN QUERY
  SELECT r.id,
         CASE WHEN r.request_type IN ('leave','permission')
              THEN 'hr' ELSE 'finance' END::TEXT,
         'source'::TEXT
    FROM public.hr_approval_requests r
   WHERE r.related_id = p_any_id AND r.tenant_id = v_tenant
   ORDER BY r.created_at DESC
   LIMIT 1;
END $$;

COMMENT ON FUNCTION public.resolve_hr_approval_source(UUID) IS
  'يترجم معرّف إجازة/استئذان/مصروف/سلفة إلى معرّف طلب الاعتماد. '
  'الالتباس بينهما جعل unified_approval_decide تردّ '
  'APPROVAL_NOT_FOUND_OR_DECIDED (العطل ② في 0334).';

REVOKE ALL ON FUNCTION public.resolve_hr_approval_source(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_hr_approval_source(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.resolve_hr_approval_source(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ─────────────────────────────────────────────────────────────────────────
-- ⑤ approval_steps_for — العطل ①
--
--    كانت تقرأ unified_approval_steps وحده فتُرجع صفراً لطلبات HR.
--    الآن تقرأ الموحّد (وفيه المرآة) + ترجمة المعرّف.
--
-- ★★ حذر مُوثَّق: النسخة الأولى التي كتبتُها في هذه الجولة كانت
--    ستُدخل عطلاً جديداً — حذفتُ عمودَي out_is_mine و out_is_current
--    اللذين تقرؤهما UnifiedApprovalService.findSteps() (السطران
--    «isMine: r.out_is_mine === true» و«isCurrent: …»). اكتشفتُه
--    بمقارنة التوقيع بـ0316 قبل التطبيق. التوقيع محفوظ حرفياً هنا.
--
-- ★ SECURITY DEFINER كما في 0316 — لا INVOKER: الدالة تقرأ profiles
--   و unified_approvals لحساب صلاحية الرؤية، والحارس الحقيقي هو
--   can_view_approval_trail() لا RLS الجدول.
--
-- ★ حجب التعليقات محفوظ: من لا يخصّه نصّ التعليق يرى الخطوة بلا نصّه.
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.approval_steps_for(TEXT, UUID);

CREATE FUNCTION public.approval_steps_for(
  p_source_module TEXT,
  p_source_id     UUID
)
RETURNS TABLE (
  out_step_order    INTEGER,
  out_required_role TEXT,
  out_approver_id   UUID,
  out_approver_name TEXT,
  out_status        TEXT,
  out_comments      TEXT,
  out_decided_at    TIMESTAMPTZ,
  out_rule_name     TEXT,
  out_is_mine       BOOLEAN,
  out_is_current    BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ctx AS (
    SELECT
      auth.uid()                      AS me,
      public.current_user_tenant_id() AS tenant,
      public.current_user_role() IN ('admin','developer','it_admin') AS is_platform,
      -- ★★ ترجمة المعرّف: الواجهة تملك أحياناً معرّف الإجازة لا معرّف
      --   طلب الاعتماد. مُقاس: approval_steps_for('hr', leave_id) = 0
      --   بينما بـrequest_id = 2.
      COALESCE(
        CASE WHEN p_source_module IN ('hr','finance')
             THEN (SELECT out_request_id
                     FROM public.resolve_hr_approval_source(p_source_id))
             ELSE NULL END,
        p_source_id
      ) AS sid
  ),
  guard AS (
    SELECT public.can_view_approval_trail(p_source_module, ctx.sid) AS allowed
      FROM ctx
  ),
  cur AS (
    SELECT MIN(s.step_order) AS step_order
      FROM public.unified_approval_steps s, ctx
     WHERE s.tenant_id = ctx.tenant
       AND s.source_module = p_source_module
       AND s.source_id = ctx.sid
       AND s.status = 'pending'
  ),
  mgr AS (
    SELECT COALESCE(bool_or(public.has_portal_unit('manager', a.unit_key)), FALSE) AS is_unit_mgr
      FROM public.unified_approvals a, ctx
     WHERE a.tenant_id = ctx.tenant
       AND a.source_module = p_source_module
       AND a.source_id = ctx.sid
  )
  SELECT
    s.step_order,
    s.required_role::TEXT,
    s.approver_id,
    COALESCE(p.full_name, p.email, '—')::TEXT,
    s.status::TEXT,
    CASE
      WHEN ctx.is_platform OR mgr.is_unit_mgr THEN s.comments
      WHEN s.approver_id = ctx.me OR s.decided_by = ctx.me THEN s.comments
      WHEN s.status <> 'pending' AND EXISTS (
        SELECT 1 FROM public.unified_approvals a
         WHERE a.tenant_id = ctx.tenant
           AND a.source_module = p_source_module
           AND a.source_id = ctx.sid
           AND a.requester_id = ctx.me
      ) THEN s.comments
      ELSE NULL
    END,
    s.decided_at,
    s.rule_name,
    (s.approver_id = ctx.me),
    (s.step_order = cur.step_order)
    FROM public.unified_approval_steps s
   CROSS JOIN ctx
   CROSS JOIN mgr
   CROSS JOIN guard
   LEFT  JOIN cur ON TRUE
    LEFT JOIN public.profiles p ON p.id = s.approver_id
   WHERE s.tenant_id     = ctx.tenant
     AND s.source_module = p_source_module
     AND s.source_id     = ctx.sid
     AND guard.allowed
   ORDER BY s.step_order;
$$;

COMMENT ON FUNCTION public.approval_steps_for(TEXT, UUID) IS
  'خطوات اعتماد طلب. محروسة بـcan_view_approval_trail (0316). '
  'أُضيفت في 0334 ترجمة المعرّف: كانت تُرجع 0 خطوة لطلبات الموارد '
  'البشرية بينما hr_approval_steps تحوي 2 — فرأى الموظف سلسلة فارغة.';

REVOKE ALL ON FUNCTION public.approval_steps_for(TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.approval_steps_for(TEXT, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.approval_steps_for(TEXT, UUID)
  TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- ⑥ بتّ موحّد يقبل أيّ المعرّفين
--
--    الواجهة تملك أحياناً معرّف الإجازة وأحياناً معرّف الطلب. هذه
--    تقبل الاثنين وتُوجّه إلى المحرّك الصحيح.
--
--    ★ VOLATILE — تكتب.
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.hr_approval_decide_any(UUID, TEXT, TEXT);

CREATE FUNCTION public.hr_approval_decide_any(
  p_any_id   UUID,
  p_decision TEXT,
  p_comments TEXT DEFAULT NULL
) RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_req UUID;
BEGIN
  IF p_decision NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION 'INVALID_DECISION: %', p_decision;
  END IF;

  SELECT out_request_id INTO v_req
    FROM public.resolve_hr_approval_source(p_any_id);

  IF v_req IS NULL THEN
    RAISE EXCEPTION 'HR_APPROVAL_NOT_FOUND';
  END IF;

  -- المحرّك القديم هو مصدر الحقيقة لخطوات HR، والمرآة تُحدّث الموحّد
  RETURN public.decide_hr_approval_step(v_req, p_decision, p_comments);
END $$;

COMMENT ON FUNCTION public.hr_approval_decide_any(UUID,TEXT,TEXT) IS
  'بتّ في طلب موارد بشرية بمعرّف الطلب أو معرّف مصدره. يُوجّه إلى '
  'decide_hr_approval_step ثم تعكس المرآة النتيجة للمحرّك الموحّد.';

REVOKE ALL ON FUNCTION public.hr_approval_decide_any(UUID,TEXT,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_approval_decide_any(UUID,TEXT,TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_approval_decide_any(UUID,TEXT,TEXT)
  TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ⑦ فهارس
-- ─────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_hr_steps_request_order
  ON public.hr_approval_steps (request_id, step_order);

CREATE INDEX IF NOT EXISTS idx_hr_steps_approver_active
  ON public.hr_approval_steps (approver_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_hr_requests_related
  ON public.hr_approval_requests (tenant_id, related_id);

CREATE INDEX IF NOT EXISTS idx_unified_steps_source
  ON public.unified_approval_steps (tenant_id, source_module, source_id);
