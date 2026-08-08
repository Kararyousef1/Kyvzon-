-- ============================================================================
-- FILE: 0309_multilevel_approval_engine.sql
-- PURPOSE: الاعتماد متعدد المستويات — آخر فجوة تقنية في المحرك الموحّد
--
-- ─────────────────────────────────────────────────────────────────────────
-- المشكلة:
--
--   0308 أضاف approval_rules بمستويات 1..5، و resolve_approval_chain
--   تُرجع السلسلة المتوقعة. لكن unified_approval_decide (0305) ما زال
--   **خطوة واحدة**: أول معتمِد يبتّ نهائياً.
--
--   فقاعدة «مصروف فوق 50 ألفاً: مستوى 1 مدير · مستوى 2 مدير مباشر»
--   لا تعني شيئاً عملياً — المدير يوافق والطلب يُغلق بلا مرور بالمستوى
--   الثاني. القواعد ديكور.
--
-- ─────────────────────────────────────────────────────────────────────────
-- الحل: جدول خطوات موحّد فوق البوابات التسع.
--
--   unified_approval_steps (source_module, source_id, step_order, ...)
--   لا يلمس جداول البوابات — يضيف طبقة تتبّع فوقها.
--
--   القرار يمرّ بمرحلتين:
--     ① إن وُجدت خطوات: يبتّ في الخطوة النشطة ويُفعّل التالية
--     ② إن لم توجد: السلوك القديم (خطوة واحدة) — توافق خلفي مطلق
--
--   والحالة النهائية (approved/rejected في جدول البوابة) لا تُكتب
--   إلا عند اكتمال كل المستويات أو أول رفض.
--
-- لماذا جدول جديد لا تعديل الجداول التسعة؟
--   تعديلها يعني 9 مايجريشنات على بوابات في الإنتاج. الطبقة الفوقية
--   تعطي نفس النتيجة بمخاطرة صفر — نفس منطق unified_approvals.
-- ============================================================================

-- ═══ 1) جدول الخطوات الموحّد ════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.unified_approval_steps (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

  -- المرجع إلى الطلب في بوابته الأصلية
  source_module  VARCHAR(20) NOT NULL
    CHECK (source_module IN ('hr','procurement','finance','contracts',
                             'movement','inventory','mrp','crm','general')),
  source_id      UUID NOT NULL,

  step_order     INTEGER NOT NULL CHECK (step_order > 0),
  required_role  VARCHAR(30) NOT NULL,
  approver_id    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,

  status         VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','active','approved','rejected','skipped')),

  comments       TEXT,
  decided_by     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_at     TIMESTAMPTZ,
  rule_name      TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_unified_step UNIQUE (tenant_id, source_module, source_id, step_order)
);

CREATE INDEX IF NOT EXISTS idx_unified_steps_lookup
  ON public.unified_approval_steps (tenant_id, source_module, source_id, step_order);

CREATE INDEX IF NOT EXISTS idx_unified_steps_active
  ON public.unified_approval_steps (tenant_id, approver_id, status)
  WHERE status = 'active';

COMMENT ON TABLE public.unified_approval_steps IS
  'خطوات الاعتماد متعدد المستويات فوق البوابات التسع. لا يلمس جداولها.';

DROP TRIGGER IF EXISTS trg_unified_approval_steps_updated ON public.unified_approval_steps;
CREATE TRIGGER trg_unified_approval_steps_updated
  BEFORE UPDATE ON public.unified_approval_steps
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.unified_approval_steps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kyvzon_unified_approval_steps_all ON public.unified_approval_steps;
CREATE POLICY kyvzon_unified_approval_steps_all ON public.unified_approval_steps
  FOR ALL TO authenticated
  USING (tenant_id = public.current_user_tenant_id())
  WITH CHECK (tenant_id = public.current_user_tenant_id());

-- ═══ 2) بناء سلسلة الخطوات لطلب ═════════════════════════════════════════
-- تُستدعى عند إنشاء الطلب. تقرأ approval_rules عبر resolve_approval_chain
-- وتُنشئ خطوة لكل مستوى — متخطّيةً المستويات بلا شاغل.
CREATE OR REPLACE FUNCTION public.build_approval_steps(
  p_source_module  TEXT,
  p_source_id      UUID,
  p_unit_key       TEXT,
  p_department_id  UUID,
  p_amount         NUMERIC DEFAULT 0
)
RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant  UUID := public.current_user_tenant_id();
  v_count   INT := 0;
  v_order   INT := 0;
  r         RECORD;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  -- آمن للتكرار: خطوات موجودة ⇒ لا نبني ثانية
  SELECT count(*) INTO v_count
    FROM public.unified_approval_steps
   WHERE tenant_id = v_tenant
     AND source_module = p_source_module
     AND source_id = p_source_id;

  IF v_count > 0 THEN
    RETURN v_count;
  END IF;

  FOR r IN
    SELECT c.out_level, c.out_required_role, c.out_approver_id, c.out_rule_name
      FROM public.resolve_approval_chain(p_unit_key, p_department_id, p_amount) c
     ORDER BY c.out_level
  LOOP
    -- مستوى بلا شاغل يُتخطّى: بناء خطوة معلَّقة بلا معتمِد يجمّد الطلب
    -- إلى الأبد. detect_approval_rule_gaps يُنبّه على هذه الحالة أصلاً.
    IF r.out_approver_id IS NULL THEN
      CONTINUE;
    END IF;

    v_order := v_order + 1;

    INSERT INTO public.unified_approval_steps
      (tenant_id, source_module, source_id, step_order,
       required_role, approver_id, status, rule_name)
    VALUES
      (v_tenant, p_source_module, p_source_id, v_order,
       r.out_required_role, r.out_approver_id,
       CASE WHEN v_order = 1 THEN 'active' ELSE 'pending' END,
       r.out_rule_name);
  END LOOP;

  RETURN v_order;
END $$;

COMMENT ON FUNCTION public.build_approval_steps(TEXT,UUID,TEXT,UUID,NUMERIC) IS
  'يبني خطوات الاعتماد من approval_rules. يتخطّى المستويات بلا شاغل. آمن للتكرار.';

-- ═══ 3) خطوات طلب — للعرض ═══════════════════════════════════════════════
--
-- ★ إسقاط صريح (أُضيف 2026-08-05 مع 0316):
--   0316 يُعيد تعريف هذه الدالة بعمودين إضافيين (out_is_mine ·
--   out_is_current) وبحارس can_view_approval_trail. و CREATE OR REPLACE
--   لا يستطيع تغيير نوع الإرجاع، فإعادة تشغيل 0309 على قاعدة طُبِّق
--   عليها 0316 كانت تفشل بـ:
--       ERROR: cannot change return type of existing function
--   وهذا يكسر أي بيئة تُعيد تطبيق المايجريشنات بالترتيب.
--   الإسقاط الصريح يجعل الملف آمناً للتكرار في كلا الاتجاهين.
--   (اكتُشف بتشغيل 0309 بعد 0316 — لا بالمراجعة النصية.)
DROP FUNCTION IF EXISTS public.approval_steps_for(TEXT, UUID);

CREATE OR REPLACE FUNCTION public.approval_steps_for(
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
  out_rule_name     TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.step_order, s.required_role::TEXT, s.approver_id,
         COALESCE(p.full_name, p.email, '—')::TEXT,
         s.status::TEXT, s.comments, s.decided_at, s.rule_name
    FROM public.unified_approval_steps s
    LEFT JOIN public.profiles p ON p.id = s.approver_id
   WHERE s.tenant_id = public.current_user_tenant_id()
     AND s.source_module = p_source_module
     AND s.source_id = p_source_id
   ORDER BY s.step_order;
$$;

COMMENT ON FUNCTION public.approval_steps_for(TEXT, UUID) IS
  'خطوات اعتماد طلب مع أسماء المعتمِدين — لعرض مسار الاعتماد.';

-- ═══ 4) القرار متعدد المستويات ══════════════════════════════════════════
-- يحلّ محلّ unified_approval_decide مع توافق خلفي:
--   • خطوات موجودة  ⇒ يبتّ في النشطة ويُفعّل التالية
--   • لا خطوات      ⇒ السلوك القديم (خطوة واحدة)
--
-- ⚠️ نوع الإرجاع تغيّر: كانت VOID في 0305 وصارت TEXT لتُبلّغ المستدعي
-- بالحالة النهائية ('pending' حين ينتقل لمستوى تالٍ). Postgres لا يسمح
-- بتغيير نوع الإرجاع عبر CREATE OR REPLACE — لذا نُسقط التوقيع القديم
-- صراحةً. الـSDK يتجاهل القيمة المُعادة فلا كسر.
DROP FUNCTION IF EXISTS public.unified_approval_decide(TEXT, UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.unified_approval_decide(
  p_source_module TEXT,
  p_source_id     UUID,
  p_decision      TEXT,
  p_comments      TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant    UUID := public.current_user_tenant_id();
  v_unit      TEXT;
  v_requester UUID;
  v_platform  BOOLEAN;
  v_active    RECORD;
  v_next      RECORD;
  v_steps     INT;
  v_final     TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NO_AUTH'; END IF;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  IF p_decision NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION 'INVALID_DECISION (%)', p_decision;
  END IF;

  SELECT u.unit_key, u.requester_id INTO v_unit, v_requester
    FROM public.unified_approvals u
   WHERE u.source_module = p_source_module
     AND u.source_id     = p_source_id
     AND u.tenant_id     = v_tenant;

  IF v_unit IS NULL THEN
    RAISE EXCEPTION 'APPROVAL_NOT_FOUND_OR_DECIDED';
  END IF;

  v_platform := public.current_user_role() IN ('admin','developer','it_admin');

  -- ── هل للطلب خطوات؟ ─────────────────────────────────────────────────
  SELECT count(*) INTO v_steps
    FROM public.unified_approval_steps s
   WHERE s.tenant_id = v_tenant
     AND s.source_module = p_source_module
     AND s.source_id = p_source_id;

  IF v_steps > 0 THEN
    -- ══ المسار متعدد المستويات ══════════════════════════════════════
    SELECT * INTO v_active
      FROM public.unified_approval_steps s
     WHERE s.tenant_id = v_tenant
       AND s.source_module = p_source_module
       AND s.source_id = p_source_id
       AND s.status = 'active'
     ORDER BY s.step_order
     LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'NO_ACTIVE_STEP';
    END IF;

    -- المعتمِد المعيَّن لهذه الخطوة وحده يبتّ (أو أدوار المنصة)
    IF NOT v_platform AND v_active.approver_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'NOT_YOUR_STEP (step %, assigned to another approver)', v_active.step_order;
    END IF;

    UPDATE public.unified_approval_steps
       SET status = p_decision,
           comments = COALESCE(NULLIF(btrim(p_comments),''), comments),
           decided_by = auth.uid(),
           decided_at = NOW()
     WHERE id = v_active.id;

    IF p_decision = 'rejected' THEN
      -- الرفض يُنهي المسار: تخطّي الخطوات المتبقية
      UPDATE public.unified_approval_steps
         SET status = 'skipped'
       WHERE tenant_id = v_tenant
         AND source_module = p_source_module
         AND source_id = p_source_id
         AND status = 'pending';
      v_final := 'rejected';
    ELSE
      SELECT * INTO v_next
        FROM public.unified_approval_steps s
       WHERE s.tenant_id = v_tenant
         AND s.source_module = p_source_module
         AND s.source_id = p_source_id
         AND s.step_order > v_active.step_order
         AND s.status = 'pending'
       ORDER BY s.step_order
       LIMIT 1;

      IF FOUND THEN
        UPDATE public.unified_approval_steps SET status = 'active' WHERE id = v_next.id;
        -- الطلب يبقى معلَّقاً في بوابته حتى آخر مستوى
        RETURN 'pending';
      END IF;

      v_final := 'approved';
    END IF;
  ELSE
    -- ══ المسار القديم: خطوة واحدة (توافق خلفي) ══════════════════════
    IF NOT v_platform THEN
      IF NOT public.has_portal_unit('manager', v_unit) THEN
        RAISE EXCEPTION 'NOT_ASSIGNED_TO_UNIT (manager/%)', v_unit;
      END IF;
      IF v_requester IS NOT NULL AND NOT public.is_in_my_team(v_requester) THEN
        RAISE EXCEPTION 'REQUESTER_NOT_IN_MY_TEAM';
      END IF;
    END IF;
    v_final := p_decision;
  END IF;

  -- ── كتابة الحالة النهائية في جدول البوابة ───────────────────────────
  CASE p_source_module
    WHEN 'hr' THEN
      UPDATE public.hr_approval_requests
         SET status = v_final, updated_at = NOW()
       WHERE id = p_source_id AND tenant_id = v_tenant;

    WHEN 'procurement' THEN
      UPDATE public.procurement_approval_requests
         SET status = v_final, updated_at = NOW()
       WHERE id = p_source_id AND tenant_id = v_tenant;

    WHEN 'finance' THEN
      UPDATE public.financial_approval_requests
         SET status = v_final, updated_at = NOW()
       WHERE id = p_source_id AND tenant_id = v_tenant;

    WHEN 'contracts' THEN
      UPDATE public.contract_approval_requests
         SET status = v_final, updated_at = NOW()
       WHERE id = p_source_id AND tenant_id = v_tenant;

    WHEN 'movement' THEN
      UPDATE public.employee_movement_approvals
         SET decision = v_final, decided_at = NOW(),
             approver_id = auth.uid(),
             comments = COALESCE(NULLIF(btrim(p_comments),''), comments)
       WHERE id = p_source_id AND tenant_id = v_tenant;
      UPDATE public.employee_movement_permits p
         SET status = v_final, approved_by = auth.uid(), updated_at = NOW()
        FROM public.employee_movement_approvals a
       WHERE a.id = p_source_id AND p.id = a.permit_id AND p.tenant_id = v_tenant;

    WHEN 'inventory' THEN
      UPDATE public.inventory_adjustment_approvals
         SET decision = v_final, decided_at = NOW(),
             approver_id = auth.uid(),
             comments = COALESCE(NULLIF(btrim(p_comments),''), comments)
       WHERE id = p_source_id AND tenant_id = v_tenant;

    WHEN 'mrp' THEN
      UPDATE public.mrp_bom_approvals
         SET decision = v_final, decided_at = NOW(),
             approver_id = auth.uid(),
             comments = COALESCE(NULLIF(btrim(p_comments),''), comments)
       WHERE id = p_source_id AND tenant_id = v_tenant;

    WHEN 'crm' THEN
      UPDATE public.crm_discount_approvals
         SET status = v_final, decided_at = NOW(),
             decided_by = auth.uid(),
             decision_note = COALESCE(NULLIF(btrim(p_comments),''), decision_note)
       WHERE id = p_source_id AND tenant_id = v_tenant;

    WHEN 'general' THEN
      UPDATE public.approval_requests
         SET status = v_final, decided_at = NOW(),
             decided_by = auth.uid(),
             decision_note = COALESCE(NULLIF(btrim(p_comments),''), decision_note),
             updated_at = NOW()
       WHERE id = p_source_id AND tenant_id = v_tenant;

    ELSE
      RAISE EXCEPTION 'UNKNOWN_SOURCE_MODULE (%)', p_source_module;
  END CASE;

  RETURN v_final;
END $$;

COMMENT ON FUNCTION public.unified_approval_decide(TEXT, UUID, TEXT, TEXT) IS
  'قرار متعدد المستويات. مع خطوات: يتقدّم مستوى مستوى. بلا خطوات: خطوة واحدة (توافق خلفي).';

-- ═══ 5) صندوق الوارد يحترم الخطوات ══════════════════════════════════════
-- طلب بخطوات: يظهر لصاحب الخطوة **النشطة** وحده — لا لكل من له الوحدة.
--
-- ⚠️ الأعمدة المُعادة تغيّرت (أُضيف out_step_order و out_total_steps)،
-- وهذا يستلزم إسقاط التوقيع القديم كما في الدالة أعلاه.
DROP FUNCTION IF EXISTS public.my_approval_inbox(TEXT);

CREATE OR REPLACE FUNCTION public.my_approval_inbox(
  p_unit_key TEXT DEFAULT NULL
)
RETURNS TABLE (
  out_source_module TEXT,
  out_source_id     UUID,
  out_request_type  TEXT,
  out_title         TEXT,
  out_requester_id  UUID,
  out_requester_name TEXT,
  out_amount        NUMERIC,
  out_unit_key      TEXT,
  out_created_at    TIMESTAMPTZ,
  out_step_order    INTEGER,
  out_total_steps   INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant   UUID := public.current_user_tenant_id();
  v_platform BOOLEAN;
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RETURN;
  END IF;

  v_platform := public.current_user_role() IN ('admin','developer','it_admin');

  RETURN QUERY
  WITH step_info AS (
    SELECT s.source_module, s.source_id,
           count(*)::INTEGER AS total_steps,
           max(CASE WHEN s.status = 'active' THEN s.step_order END)::INTEGER AS active_order,
           max(CASE WHEN s.status = 'active' THEN s.approver_id::TEXT END) AS active_approver
      FROM public.unified_approval_steps s
     WHERE s.tenant_id = v_tenant
     GROUP BY s.source_module, s.source_id
  )
  SELECT u.source_module,
         u.source_id,
         u.request_type,
         u.title,
         u.requester_id,
         COALESCE(pr.full_name, pr.email, '—')::TEXT,
         u.amount,
         u.unit_key,
         u.created_at,
         COALESCE(si.active_order, 1),
         COALESCE(si.total_steps, 1)
    FROM public.unified_approvals u
    LEFT JOIN public.profiles pr ON pr.id = u.requester_id
    LEFT JOIN step_info si
      ON si.source_module = u.source_module AND si.source_id = u.source_id
   WHERE u.tenant_id = v_tenant
     AND (p_unit_key IS NULL OR u.unit_key = p_unit_key)
     AND (
       v_platform
       OR (
         -- طلب بخطوات: لصاحب الخطوة النشطة وحده
         (si.source_id IS NOT NULL AND si.active_approver = auth.uid()::TEXT)
         -- طلب بلا خطوات: المسار القديم (وحدة + فريق)
         OR (
           si.source_id IS NULL
           AND public.has_portal_unit('manager', u.unit_key)
           AND (u.requester_id IS NULL OR public.is_in_my_team(u.requester_id))
         )
       )
     )
   ORDER BY u.created_at ASC;
END $$;

COMMENT ON FUNCTION public.my_approval_inbox(TEXT) IS
  'صندوق الوارد. الطلب بخطوات يظهر لصاحب الخطوة النشطة وحده؛ وبلا خطوات للمسار القديم.';

-- ═══ 6) الصلاحيات ═══════════════════════════════════════════════════════
DO $$
DECLARE v_fn TEXT;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.build_approval_steps(text,uuid,text,uuid,numeric)',
    'public.approval_steps_for(text,uuid)',
    'public.unified_approval_decide(text,uuid,text,text)',
    'public.my_approval_inbox(text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', v_fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', v_fn);
  END LOOP;
END $$;

-- ═══ 7) حرّاس التحقق ════════════════════════════════════════════════════
DO $$
DECLARE
  v_fn  TEXT;
  v_cnt INT;
BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema='public' AND table_name='unified_approval_steps'
  ), '0309 failed: table missing';

  ASSERT (SELECT rowsecurity FROM pg_tables
           WHERE schemaname='public' AND tablename='unified_approval_steps'),
    '0309 failed: RLS not enabled';

  FOREACH v_fn IN ARRAY ARRAY[
    'build_approval_steps','approval_steps_for',
    'unified_approval_decide','my_approval_inbox'
  ] LOOP
    SELECT count(*) INTO v_cnt FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname=v_fn;
    ASSERT v_cnt = 1, format('0309 failed: %s overloads = %s', v_fn, v_cnt);
  END LOOP;

  FOREACH v_fn IN ARRAY ARRAY[
    'public.build_approval_steps(text,uuid,text,uuid,numeric)',
    'public.approval_steps_for(text,uuid)',
    'public.unified_approval_decide(text,uuid,text,text)',
    'public.my_approval_inbox(text)'
  ] LOOP
    ASSERT NOT has_function_privilege('anon', v_fn, 'EXECUTE'),
      format('0309 failed: anon can execute %s', v_fn);
  END LOOP;

  -- المصادر التسعة كلها مدعومة في القيد وفي التوجيه
  SELECT count(*) INTO v_cnt
    FROM unnest(ARRAY['hr','procurement','finance','contracts','movement',
                      'inventory','mrp','crm','general']) AS m(k)
   WHERE pg_get_functiondef(
           (SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
             WHERE n.nspname='public' AND p.proname='unified_approval_decide')
         ) LIKE '%WHEN ''' || m.k || ''' THEN%';
  ASSERT v_cnt = 9, format('0309 failed: decide covers %s/9 modules', v_cnt);

  RAISE NOTICE '✅ 0309: الاعتماد متعدد المستويات — مع توافق خلفي للخطوة الواحدة';
END $$;

NOTIFY pgrst, 'reload schema';
