-- ═══════════════════════════════════════════════════════════════════════════
-- 0375 — مصالحة طلبات اعتماد HR اليتيمة وإغلاق وصول الواجهة للمحرّك القديم
--
-- القرار الهندسي:
--   لا يُحذف hr_approval_steps هنا. ما زالت دوال قاعدة بيانات حية تنشئه
--   وتقرأه وتبتّ من خلاله، بينما واجهات React انتقلت بالكامل إلى RPC
--   المحرّك الموحّد. هذه الدفعة تحمي الحدّ متعدد الأشكال related_id، تحفظ
--   أثر اليتيم، تغلق السلاسل اليتيمة المعلّقة، وتمنع ظهورها في inbox.
--
-- تراكمية فقط: لا تعديل لأي migration مطبقة.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- ① سجل تدقيق append-only منطقياً: لا سياسات كتابة للمستخدمين.
--    لا نحذف طلب الاعتماد أو خطواته عند فقد المصدر حتى يبقى التاريخ.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hr_approval_orphan_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  request_id UUID NOT NULL,
  request_type TEXT NOT NULL
    CHECK (request_type IN ('leave','permission','expense','loan')),
  related_id UUID NOT NULL,
  employee_id UUID,
  request_status TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('source_missing','source_deleted')),
  resolution TEXT NOT NULL
    CHECK (resolution IN ('pending_chain_closed','historical_preserved')),
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  details JSONB NOT NULL DEFAULT '{}'::JSONB,
  UNIQUE (request_id, reason)
);

COMMENT ON TABLE public.hr_approval_orphan_events IS
  'سجل اكتشاف مصادر اعتماد HR المفقودة. الطلب والخطوات التاريخية لا تُحذف؛ '
  'السلسلة المعلّقة فقط تُغلق وتبقى قابلة للتدقيق.';

ALTER TABLE public.hr_approval_orphan_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hr_approval_orphan_events_select
  ON public.hr_approval_orphan_events;
CREATE POLICY hr_approval_orphan_events_select
  ON public.hr_approval_orphan_events
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.current_user_tenant_id()
    AND public.current_user_is_staff()
  );

REVOKE ALL ON public.hr_approval_orphan_events FROM PUBLIC;
REVOKE ALL ON public.hr_approval_orphan_events FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.hr_approval_orphan_events FROM authenticated;
GRANT SELECT ON public.hr_approval_orphan_events TO authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_hr_approval_orphan_events_tenant_detected
  ON public.hr_approval_orphan_events (tenant_id, detected_at DESC);

-- ───────────────────────────────────────────────────────────────────────────
-- ② FK متعدد الأشكال: دالة حقيقة واحدة لوجود المصدر وعزل المستأجر.
-- ───────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.hr_approval_source_exists(TEXT, UUID, UUID);

CREATE FUNCTION public.hr_approval_source_exists(
  p_request_type TEXT,
  p_related_id   UUID,
  p_tenant_id   UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_request_type IS NULL OR p_related_id IS NULL OR p_tenant_id IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN CASE p_request_type
    WHEN 'leave' THEN EXISTS (
      SELECT 1 FROM public.leaves x
       WHERE x.id = p_related_id AND x.tenant_id = p_tenant_id
    )
    WHEN 'permission' THEN EXISTS (
      SELECT 1 FROM public.permissions_request x
       WHERE x.id = p_related_id AND x.tenant_id = p_tenant_id
    )
    WHEN 'expense' THEN EXISTS (
      SELECT 1 FROM public.expense_requests x
       WHERE x.id = p_related_id AND x.tenant_id = p_tenant_id
    )
    WHEN 'loan' THEN EXISTS (
      SELECT 1 FROM public.employee_loans x
       WHERE x.id = p_related_id AND x.tenant_id = p_tenant_id
    )
    ELSE FALSE
  END;
END $$;

COMMENT ON FUNCTION public.hr_approval_source_exists(TEXT,UUID,UUID) IS
  'يقوم مقام FK متعدد الأشكال لـhr_approval_requests.related_id، ويطابق '
  'leave/permission/expense/loan مع المصدر داخل المستأجر نفسه.';

REVOKE ALL ON FUNCTION public.hr_approval_source_exists(TEXT,UUID,UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_approval_source_exists(TEXT,UUID,UUID) FROM anon;
REVOKE ALL ON FUNCTION public.hr_approval_source_exists(TEXT,UUID,UUID) FROM authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- ③ منع إنشاء يتيم جديد أو تبديل مرجع قائم إلى مصدر غير موجود.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_guard_hr_approval_source()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.hr_approval_source_exists(
    NEW.request_type, NEW.related_id, NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'HR_APPROVAL_SOURCE_NOT_FOUND (%/%)',
      NEW.request_type, NEW.related_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END $$;

COMMENT ON FUNCTION public.tg_guard_hr_approval_source() IS
  'حارس FK متعدد الأشكال: يمنع INSERT/تغيير المرجع إذا كان المصدر مفقوداً '
  'أو تابعاً لمستأجر مختلف.';

DROP TRIGGER IF EXISTS trg_guard_hr_approval_source
  ON public.hr_approval_requests;
CREATE TRIGGER trg_guard_hr_approval_source
  BEFORE INSERT OR UPDATE OF request_type, related_id, tenant_id
  ON public.hr_approval_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_guard_hr_approval_source();

-- ───────────────────────────────────────────────────────────────────────────
-- ④ إغلاق ذري قبل حذف المصدر. لا نحذف سجل الطلب ولا الخطوات التاريخية.
--    تغطي الدالة المصادر الأربعة بدلاً من leave/permission فقط.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_close_orphan_hr_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type TEXT := CASE TG_TABLE_NAME
    WHEN 'leaves'              THEN 'leave'
    WHEN 'permissions_request' THEN 'permission'
    WHEN 'expense_requests'    THEN 'expense'
    WHEN 'employee_loans'      THEN 'loan'
    ELSE NULL
  END;
BEGIN
  IF v_type IS NULL THEN
    RAISE EXCEPTION 'UNSUPPORTED_HR_APPROVAL_SOURCE_TABLE (%)', TG_TABLE_NAME;
  END IF;

  INSERT INTO public.hr_approval_orphan_events
    (tenant_id, request_id, request_type, related_id, employee_id,
     request_status, reason, resolution, details)
  SELECT r.tenant_id, r.id, r.request_type, r.related_id, r.employee_id,
         r.status, 'source_deleted',
         CASE WHEN r.status = 'pending'
              THEN 'pending_chain_closed' ELSE 'historical_preserved' END,
         jsonb_build_object('source_table', TG_TABLE_NAME)
    FROM public.hr_approval_requests r
   WHERE r.related_id = OLD.id
     AND r.tenant_id = OLD.tenant_id
     AND r.request_type = v_type
  ON CONFLICT (request_id, reason) DO NOTHING;

  UPDATE public.hr_approval_steps s
     SET status = 'skipped', decided_at = COALESCE(s.decided_at, NOW())
    FROM public.hr_approval_requests r
   WHERE s.request_id = r.id
     AND r.related_id = OLD.id
     AND r.tenant_id = OLD.tenant_id
     AND r.request_type = v_type
     AND s.status IN ('pending','active');

  -- حماية إضافية للمرآة القائمة سابقاً؛ محفّز المرآة يعالج المسار الطبيعي.
  UPDATE public.unified_approval_steps s
     SET status = 'skipped',
         decided_at = COALESCE(s.decided_at, NOW()),
         updated_at = NOW()
    FROM public.hr_approval_requests r
   WHERE s.source_id = r.id
     AND s.tenant_id = r.tenant_id
     AND s.source_module = CASE
           WHEN r.request_type IN ('leave','permission') THEN 'hr'
           ELSE 'finance'
         END
     AND r.related_id = OLD.id
     AND r.tenant_id = OLD.tenant_id
     AND r.request_type = v_type
     AND s.status IN ('pending','active');

  UPDATE public.hr_approval_requests r
     SET status = 'rejected', updated_at = NOW()
   WHERE r.related_id = OLD.id
     AND r.tenant_id = OLD.tenant_id
     AND r.request_type = v_type
     AND r.status = 'pending';

  RETURN OLD;
END $$;

COMMENT ON FUNCTION public.tg_close_orphan_hr_request() IS
  '0375: يغلق الخطوات المعلّقة ويسجّل أثر حذف مصدر leave/permission/'
  'expense/loan، مع إبقاء طلب الاعتماد وخطواته التاريخية.';

DROP TRIGGER IF EXISTS trg_close_orphan_hr_request ON public.leaves;
CREATE TRIGGER trg_close_orphan_hr_request
  BEFORE DELETE ON public.leaves
  FOR EACH ROW EXECUTE FUNCTION public.tg_close_orphan_hr_request();

DROP TRIGGER IF EXISTS trg_close_orphan_hr_request ON public.permissions_request;
CREATE TRIGGER trg_close_orphan_hr_request
  BEFORE DELETE ON public.permissions_request
  FOR EACH ROW EXECUTE FUNCTION public.tg_close_orphan_hr_request();

DROP TRIGGER IF EXISTS trg_close_orphan_hr_request ON public.expense_requests;
CREATE TRIGGER trg_close_orphan_hr_request
  BEFORE DELETE ON public.expense_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_close_orphan_hr_request();

DROP TRIGGER IF EXISTS trg_close_orphan_hr_request ON public.employee_loans;
CREATE TRIGGER trg_close_orphan_hr_request
  BEFORE DELETE ON public.employee_loans
  FOR EACH ROW EXECUTE FUNCTION public.tg_close_orphan_hr_request();

-- ───────────────────────────────────────────────────────────────────────────
-- ⑤ مصالحة البيانات القائمة.
--    1) نسجّل كل يتيم أولاً.
--    2) نغلق الحي فقط (pending/active).
--    3) لا نغيّر الطلبات النهائية approved/rejected ولا نحذف أي سجل.
-- ───────────────────────────────────────────────────────────────────────────
INSERT INTO public.hr_approval_orphan_events
  (tenant_id, request_id, request_type, related_id, employee_id,
   request_status, reason, resolution, details)
SELECT r.tenant_id, r.id, r.request_type, r.related_id, r.employee_id,
       r.status, 'source_missing',
       CASE WHEN r.status = 'pending'
            THEN 'pending_chain_closed' ELSE 'historical_preserved' END,
       jsonb_build_object('migration', '0375')
  FROM public.hr_approval_requests r
 WHERE NOT public.hr_approval_source_exists(
   r.request_type, r.related_id, r.tenant_id
 )
ON CONFLICT (request_id, reason) DO NOTHING;

UPDATE public.hr_approval_steps s
   SET status = 'skipped', decided_at = COALESCE(s.decided_at, NOW())
  FROM public.hr_approval_requests r
 WHERE s.request_id = r.id
   AND r.status = 'pending'
   AND s.status IN ('pending','active')
   AND NOT public.hr_approval_source_exists(
     r.request_type, r.related_id, r.tenant_id
   );

UPDATE public.unified_approval_steps s
   SET status = 'skipped',
       decided_at = COALESCE(s.decided_at, NOW()),
       updated_at = NOW()
  FROM public.hr_approval_requests r
 WHERE s.source_id = r.id
   AND s.tenant_id = r.tenant_id
   AND s.source_module = CASE
         WHEN r.request_type IN ('leave','permission') THEN 'hr'
         ELSE 'finance'
       END
   AND r.status = 'pending'
   AND s.status IN ('pending','active')
   AND NOT public.hr_approval_source_exists(
     r.request_type, r.related_id, r.tenant_id
   );

UPDATE public.hr_approval_requests r
   SET status = 'rejected', updated_at = NOW()
 WHERE r.status = 'pending'
   AND NOT public.hr_approval_source_exists(
     r.request_type, r.related_id, r.tenant_id
   );

-- ───────────────────────────────────────────────────────────────────────────
-- ⑥ دفاع في العمق لصندوق الوارد: حتى لو ظهرت بيانات قديمة غير متوقعة،
--    لا تعبر طلبات HR/مالية الموظف ما لم يكن المصدر موجوداً الآن.
--    نحتفظ بتنفيذ 0341 الداخلي (يتجنب عدّ المرآة مرتين) ونغلّفه بالحارس.
-- ───────────────────────────────────────────────────────────────────────────
ALTER FUNCTION public.my_approval_inbox(TEXT)
  RENAME TO my_approval_inbox_pre_0375;

REVOKE ALL ON FUNCTION public.my_approval_inbox_pre_0375(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.my_approval_inbox_pre_0375(TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.my_approval_inbox_pre_0375(TEXT) FROM authenticated;

CREATE FUNCTION public.my_approval_inbox(p_unit_key TEXT DEFAULT NULL)
RETURNS TABLE(
  out_source_module  TEXT,
  out_source_id      UUID,
  out_request_type   TEXT,
  out_title          TEXT,
  out_requester_id   UUID,
  out_requester_name TEXT,
  out_amount         NUMERIC,
  out_unit_key       TEXT,
  out_created_at     TIMESTAMPTZ,
  out_step_order     INTEGER,
  out_total_steps    INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT q.out_source_module, q.out_source_id, q.out_request_type,
         q.out_title, q.out_requester_id, q.out_requester_name,
         q.out_amount, q.out_unit_key, q.out_created_at,
         q.out_step_order, q.out_total_steps
    FROM public.my_approval_inbox_pre_0375(p_unit_key) q
   WHERE q.out_source_module NOT IN ('hr','employee_finance')
      OR EXISTS (
        SELECT 1
          FROM public.hr_approval_requests r
         WHERE r.id = q.out_source_id
           AND r.tenant_id = public.current_user_tenant_id()
           AND public.hr_approval_source_exists(
             r.request_type, r.related_id, r.tenant_id
           )
      )
   ORDER BY q.out_created_at ASC;
$$;

COMMENT ON FUNCTION public.my_approval_inbox(TEXT) IS
  '0375: غلاف صندوق 0341 مع حاجز وجود مصدر HR/employee_finance. الطلب '
  'اليتيم لا يظهر ولو بقيت بيانات قديمة غير متصالحة.';

REVOKE ALL ON FUNCTION public.my_approval_inbox(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.my_approval_inbox(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.my_approval_inbox(TEXT) TO authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- ⑦ تقرير تدقيق مباشر. يعرض اليتيم التاريخي ولا يعيده إلى صندوق القرار.
-- ───────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.hr_approval_orphan_audit();

CREATE FUNCTION public.hr_approval_orphan_audit()
RETURNS TABLE(
  out_request_id UUID,
  out_request_type TEXT,
  out_related_id UUID,
  out_employee_id UUID,
  out_request_status TEXT,
  out_has_live_steps BOOLEAN,
  out_detected_at TIMESTAMPTZ,
  out_reason TEXT,
  out_resolution TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'NO_AUTH_OR_TENANT' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'HR_ORPHAN_AUDIT_FORBIDDEN'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT r.id, r.request_type, r.related_id, r.employee_id, r.status,
         EXISTS (
           SELECT 1 FROM public.hr_approval_steps s
            WHERE s.request_id = r.id AND s.status IN ('pending','active')
         ),
         e.detected_at, e.reason, e.resolution
    FROM public.hr_approval_requests r
    LEFT JOIN LATERAL (
      SELECT x.detected_at, x.reason, x.resolution
        FROM public.hr_approval_orphan_events x
       WHERE x.request_id = r.id AND x.tenant_id = r.tenant_id
       ORDER BY x.detected_at DESC
       LIMIT 1
    ) e ON TRUE
   WHERE r.tenant_id = v_tenant
     AND NOT public.hr_approval_source_exists(
       r.request_type, r.related_id, r.tenant_id
     )
   ORDER BY r.created_at DESC;
END $$;

COMMENT ON FUNCTION public.hr_approval_orphan_audit() IS
  'تقرير اليتامى التاريخيين للمستأجر مع بيان وجود خطوة حية وقرار المصالحة. '
  'لا يحذف ولا يعدّل السجل.';

REVOKE ALL ON FUNCTION public.hr_approval_orphan_audit() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_approval_orphan_audit() FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_approval_orphan_audit()
  TO authenticated, service_role;
