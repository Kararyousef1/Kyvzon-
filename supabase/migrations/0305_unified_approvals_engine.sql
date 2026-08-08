-- ============================================================================
-- FILE: 0305_unified_approvals_engine.sql
-- PURPOSE: محرك الموافقات الموحّد — مركز واحد للمدير عبر كل البوابات
--
-- ─────────────────────────────────────────────────────────────────────────
-- المشكلة:
--
--   تسعة أنظمة موافقات منفصلة، كل بوابة بنت نظامها:
--     hr_approval_requests · procurement_approval_requests
--     · financial_approval_requests · contract_approval_requests
--     · employee_movement_approvals · inventory_adjustment_approvals
--     · mrp_bom_approvals · crm_discount_approvals · approval_requests
--
--   والنتيجة العملية: المدير الذي يشرف على ثلاثة مجالات يفتح ثلاث
--   بوابات ليوافق على ثلاثة طلبات.
--
--   والأسوأ: ManagerApprovalsPage يقرأ approval_requests وحده —
--   وفحص INSERT أثبت أن **لا أحد يكتب فيه** (صفر في المايجريشنات
--   وصفر في SDK). الجدول مهجور منذ 0023، فالصفحة فارغة أبداً.
--
-- ─────────────────────────────────────────────────────────────────────────
-- البديل المرفوض: ترحيل التسعة إلى جدول واحد.
--   يمسّ تسع بوابات في الإنتاج بمخاطرة هائلة بلا مكسب فوري.
--
-- الحل المختار: طبقة فوق الجداول — بلا لمس أي منها.
--   ① unified_approvals        عرض UNION ALL للتسعة (قراءة فقط)
--   ② unified_approval_decide  توجيه القرار للجدول الصحيح
--   ③ approval_rules           قواعد عامة بالمبلغ (تعميم نموذج المشتريات)
--
--   هذا نمط Odoo: محرك واحد ترثه الوحدات بلا إعادة كتابة.
--
-- ملاحظة على الأداء: العرض UNION ALL لتسعة جداول. كل استعلام يجب أن
--   يفلتر بـ tenant_id (RLS الجداول الأصلية تتكفّل) وبالحالة. أُضيفت
--   فهارس على (tenant_id, status) حيث نقصت.
-- ============================================================================

-- ═══ 1) فهارس الأداء للعرض الموحّد ══════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_hr_appr_req_tenant_status
  ON public.hr_approval_requests (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_proc_appr_req_tenant_status
  ON public.procurement_approval_requests (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_fin_appr_req_tenant_status
  ON public.financial_approval_requests (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_contract_appr_req_tenant_status
  ON public.contract_approval_requests (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_mov_appr_tenant_decision
  ON public.employee_movement_approvals (tenant_id, decision);
CREATE INDEX IF NOT EXISTS idx_inv_adj_appr_tenant_decision
  ON public.inventory_adjustment_approvals (tenant_id, decision);
CREATE INDEX IF NOT EXISTS idx_mrp_bom_appr_tenant_decision
  ON public.mrp_bom_approvals (tenant_id, decision);
CREATE INDEX IF NOT EXISTS idx_crm_disc_appr_tenant_status
  ON public.crm_discount_approvals (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_approval_requests_tenant_status
  ON public.approval_requests (tenant_id, status);

-- ═══ 2) العرض الموحّد ═══════════════════════════════════════════════════
-- أعمدة موحّدة عبر التسعة. الفروق البنيوية تُطبَّع هنا لا في الجداول:
--   • بعضها يسمّي الحالة status وبعضها decision
--   • بعضها يحمل مبلغاً وبعضها لا
--   • بعضها يربط بقسم وبعضها لا
DROP VIEW IF EXISTS public.unified_approvals CASCADE;
CREATE VIEW public.unified_approvals AS
  -- ① الموارد البشرية
  SELECT 'hr'::TEXT              AS source_module,
         r.id                    AS source_id,
         r.tenant_id,
         r.request_type::TEXT    AS request_type,
         CASE r.request_type WHEN 'leave' THEN 'طلب إجازة' ELSE 'طلب إذن' END AS title,
         r.employee_id           AS requester_id,
         r.department_id,
         NULL::NUMERIC           AS amount,
         r.status::TEXT          AS status,
         r.related_id            AS related_id,
         r.created_at,
         'hr'::TEXT              AS unit_key
    FROM public.hr_approval_requests r
   WHERE r.status = 'pending'

  UNION ALL
  -- ② المشتريات
  SELECT 'procurement', r.id, r.tenant_id, r.request_type::TEXT,
         'طلب شراء', r.requester_id, r.department_id,
         r.total_amount, r.status::TEXT, r.related_id, r.created_at, 'procurement'
    FROM public.procurement_approval_requests r
   WHERE r.status = 'pending'

  UNION ALL
  -- ③ المالية
  SELECT 'finance', r.id, r.tenant_id, r.request_type::TEXT,
         CASE r.request_type
           WHEN 'journal_entry' THEN 'قيد محاسبي'
           WHEN 'invoice'       THEN 'فاتورة'
           WHEN 'expense'       THEN 'مصروف'
           WHEN 'budget'        THEN 'موازنة'
           ELSE 'إقرار ضريبي' END,
         r.requested_by, NULL::UUID, NULL::NUMERIC,
         r.status::TEXT, r.reference_id, r.created_at, 'finance'
    FROM public.financial_approval_requests r
   WHERE r.status = 'pending'

  UNION ALL
  -- ④ العقود
  SELECT 'contracts', r.id, r.tenant_id, 'contract',
         'اعتماد عقد', r.requested_by, NULL::UUID, NULL::NUMERIC,
         r.status::TEXT, r.contract_id, r.created_at, 'contracts'
    FROM public.contract_approval_requests r
   WHERE r.status = 'pending'

  UNION ALL
  -- ⑤ الحركة (decision لا status)
  SELECT 'movement', a.id, a.tenant_id, 'movement_permit',
         'تصريح خروج',
         (SELECT p.employee_id FROM public.employee_movement_permits p WHERE p.id = a.permit_id),
         NULL::UUID, NULL::NUMERIC,
         a.decision::TEXT, a.permit_id, a.created_at, 'movement'
    FROM public.employee_movement_approvals a
   WHERE a.decision = 'pending'

  UNION ALL
  -- ⑥ المخزون
  SELECT 'inventory', a.id, a.tenant_id, 'stock_adjustment',
         'اعتماد تسوية مخزون', a.approver_id, NULL::UUID, NULL::NUMERIC,
         a.decision::TEXT, a.variance_id, a.created_at, 'inventory'
    FROM public.inventory_adjustment_approvals a
   WHERE a.decision = 'pending'

  UNION ALL
  -- ⑦ التصنيع
  SELECT 'mrp', a.id, a.tenant_id, 'bom_version',
         'اعتماد قائمة مواد', a.approver_id, NULL::UUID, NULL::NUMERIC,
         a.decision::TEXT, a.bom_version_id, a.created_at, 'mrp'
    FROM public.mrp_bom_approvals a
   WHERE a.decision = 'pending'

  UNION ALL
  -- ⑧ CRM
  SELECT 'crm', a.id, a.tenant_id, 'discount',
         'اعتماد خصم', a.requested_by, NULL::UUID, a.deal_value,
         a.status::TEXT, a.quote_id, a.created_at, 'crm'
    FROM public.crm_discount_approvals a
   WHERE a.status = 'pending'

  UNION ALL
  -- ⑨ العام (كان مهجوراً — يُحيا هنا)
  SELECT 'general', r.id, r.tenant_id, r.request_type::TEXT,
         r.title::TEXT, r.requester_id, NULL::UUID, NULL::NUMERIC,
         r.status::TEXT, r.related_id, r.created_at, 'hr'
    FROM public.approval_requests r
   WHERE r.status = 'pending';

COMMENT ON VIEW public.unified_approvals IS
  'كل الموافقات المعلَّقة عبر البوابات التسع. قراءة فقط — لا يلمس أي جدول.';

GRANT SELECT ON public.unified_approvals TO authenticated, service_role;
REVOKE ALL ON public.unified_approvals FROM anon;

-- ═══ 3) صندوق وارد المدير ═══════════════════════════════════════════════
-- يفلتر الموحّد بما يخصّ المستخدم فعلاً:
--   • وحداته المُسنَدة (portal_unit_assignments من 0302)
--   • وفريقه (is_in_my_team)
-- أدوار المنصة ترى الكل للدعم.
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
  out_created_at    TIMESTAMPTZ
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
  SELECT u.source_module,
         u.source_id,
         u.request_type,
         u.title,
         u.requester_id,
         COALESCE(pr.full_name, pr.email, '—')::TEXT,
         u.amount,
         u.unit_key,
         u.created_at
    FROM public.unified_approvals u
    LEFT JOIN public.profiles pr ON pr.id = u.requester_id
   WHERE u.tenant_id = v_tenant
     AND (p_unit_key IS NULL OR u.unit_key = p_unit_key)
     AND (
       v_platform
       OR (
         -- له الوحدة، والطلب من فريقه
         public.has_portal_unit('manager', u.unit_key)
         AND (u.requester_id IS NULL OR public.is_in_my_team(u.requester_id))
       )
     )
   ORDER BY u.created_at ASC;
END $$;

COMMENT ON FUNCTION public.my_approval_inbox(TEXT) IS
  'صندوق وارد الموافقات: ما يخصّ وحدات المستخدم وفريقه عبر البوابات التسع.';

-- ═══ 4) القرار الموحّد — توجيه للجدول الصحيح ════════════════════════════
CREATE OR REPLACE FUNCTION public.unified_approval_decide(
  p_source_module TEXT,
  p_source_id     UUID,
  p_decision      TEXT,
  p_comments      TEXT DEFAULT NULL
)
RETURNS VOID
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
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NO_AUTH'; END IF;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  IF p_decision NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION 'INVALID_DECISION (%)', p_decision;
  END IF;

  -- التحقق من وجود الطلب وأنه معلَّق فعلاً
  SELECT u.unit_key, u.requester_id INTO v_unit, v_requester
    FROM public.unified_approvals u
   WHERE u.source_module = p_source_module
     AND u.source_id     = p_source_id
     AND u.tenant_id     = v_tenant;

  IF v_unit IS NULL THEN
    RAISE EXCEPTION 'APPROVAL_NOT_FOUND_OR_DECIDED';
  END IF;

  -- الصلاحية: وحدة + فريق (أدوار المنصة تمر)
  v_platform := public.current_user_role() IN ('admin','developer','it_admin');
  IF NOT v_platform THEN
    IF NOT public.has_portal_unit('manager', v_unit) THEN
      RAISE EXCEPTION 'NOT_ASSIGNED_TO_UNIT (manager/%)', v_unit;
    END IF;
    IF v_requester IS NOT NULL AND NOT public.is_in_my_team(v_requester) THEN
      RAISE EXCEPTION 'REQUESTER_NOT_IN_MY_TEAM';
    END IF;
  END IF;

  -- التوجيه: كل بوابة وأعمدتها
  CASE p_source_module
    WHEN 'hr' THEN
      UPDATE public.hr_approval_requests
         SET status = p_decision, updated_at = NOW()
       WHERE id = p_source_id AND tenant_id = v_tenant;

    WHEN 'procurement' THEN
      UPDATE public.procurement_approval_requests
         SET status = p_decision, updated_at = NOW()
       WHERE id = p_source_id AND tenant_id = v_tenant;

    WHEN 'finance' THEN
      UPDATE public.financial_approval_requests
         SET status = p_decision, updated_at = NOW()
       WHERE id = p_source_id AND tenant_id = v_tenant;

    WHEN 'contracts' THEN
      UPDATE public.contract_approval_requests
         SET status = p_decision, updated_at = NOW()
       WHERE id = p_source_id AND tenant_id = v_tenant;

    WHEN 'movement' THEN
      UPDATE public.employee_movement_approvals
         SET decision = p_decision, decided_at = NOW(),
             approver_id = auth.uid(),
             comments = COALESCE(NULLIF(btrim(p_comments),''), comments)
       WHERE id = p_source_id AND tenant_id = v_tenant;
      -- التصريح نفسه يتبع قرار الموافقة
      UPDATE public.employee_movement_permits p
         SET status = p_decision, approved_by = auth.uid(), updated_at = NOW()
        FROM public.employee_movement_approvals a
       WHERE a.id = p_source_id AND p.id = a.permit_id AND p.tenant_id = v_tenant;

    WHEN 'inventory' THEN
      UPDATE public.inventory_adjustment_approvals
         SET decision = p_decision, decided_at = NOW(),
             approver_id = auth.uid(),
             comments = COALESCE(NULLIF(btrim(p_comments),''), comments)
       WHERE id = p_source_id AND tenant_id = v_tenant;

    WHEN 'mrp' THEN
      UPDATE public.mrp_bom_approvals
         SET decision = p_decision, decided_at = NOW(),
             approver_id = auth.uid(),
             comments = COALESCE(NULLIF(btrim(p_comments),''), comments)
       WHERE id = p_source_id AND tenant_id = v_tenant;

    WHEN 'crm' THEN
      UPDATE public.crm_discount_approvals
         SET status = p_decision, decided_at = NOW(),
             decided_by = auth.uid(),
             decision_note = COALESCE(NULLIF(btrim(p_comments),''), decision_note)
       WHERE id = p_source_id AND tenant_id = v_tenant;

    WHEN 'general' THEN
      UPDATE public.approval_requests
         SET status = p_decision, decided_at = NOW(),
             decided_by = auth.uid(),
             decision_note = COALESCE(NULLIF(btrim(p_comments),''), decision_note),
             updated_at = NOW()
       WHERE id = p_source_id AND tenant_id = v_tenant;

    ELSE
      RAISE EXCEPTION 'UNKNOWN_SOURCE_MODULE (%)', p_source_module;
  END CASE;
END $$;

COMMENT ON FUNCTION public.unified_approval_decide(TEXT, UUID, TEXT, TEXT) IS
  'قرار موحّد يوجّه للجدول الصحيح. يتحقق من الوحدة والفريق قبل الكتابة.';

-- ═══ 5) قواعد الاعتماد العامة — تعميم نموذج المشتريات ═══════════════════
CREATE TABLE IF NOT EXISTS public.approval_rules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  unit_key      VARCHAR(30) NOT NULL
    CHECK (unit_key IN ('movement','hr','finance','procurement','inventory',
                        'mrp','contracts','crm','health_safety')),
  rule_name     TEXT NOT NULL,
  min_amount    NUMERIC(16,2) NOT NULL DEFAULT 0,
  max_amount    NUMERIC(16,2) NOT NULL DEFAULT 999999999,
  department_id UUID REFERENCES public.departments(id) ON DELETE CASCADE,
  level         INT NOT NULL CHECK (level BETWEEN 1 AND 5),
  required_role VARCHAR(30) NOT NULL
    CHECK (required_role IN ('supervisor','manager','direct_manager','unit_manager','admin')),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT approval_rules_amount_range CHECK (max_amount >= min_amount)
);

CREATE INDEX IF NOT EXISTS idx_approval_rules_lookup
  ON public.approval_rules (tenant_id, unit_key, is_active, level);

COMMENT ON TABLE public.approval_rules IS
  'قواعد الاعتماد لكل وحدة: بالمبلغ والقسم والمستوى. تعميم procurement_approval_rules.';

DROP TRIGGER IF EXISTS trg_approval_rules_updated ON public.approval_rules;
CREATE TRIGGER trg_approval_rules_updated
  BEFORE UPDATE ON public.approval_rules
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.approval_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kyvzon_approval_rules_all ON public.approval_rules;
CREATE POLICY kyvzon_approval_rules_all ON public.approval_rules
  FOR ALL TO authenticated
  USING (tenant_id = public.current_user_tenant_id())
  WITH CHECK (tenant_id = public.current_user_tenant_id());

-- ═══ 6) حلّ سلسلة الاعتماد لطلب ═════════════════════════════════════════
-- يجمع: قواعد المبلغ + السلسلة التنظيمية (0304)
CREATE OR REPLACE FUNCTION public.resolve_approval_chain(
  p_unit_key      TEXT,
  p_department_id UUID,
  p_amount        NUMERIC DEFAULT 0
)
RETURNS TABLE (
  out_level         INT,
  out_required_role TEXT,
  out_approver_id   UUID,
  out_rule_name     TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  r        RECORD;
  v_user   UUID;
BEGIN
  IF v_tenant IS NULL THEN RETURN; END IF;

  FOR r IN
    SELECT ar.level, ar.required_role, ar.rule_name
      FROM public.approval_rules ar
     WHERE ar.tenant_id = v_tenant
       AND ar.unit_key  = p_unit_key
       AND ar.is_active
       AND COALESCE(p_amount,0) >= ar.min_amount
       AND COALESCE(p_amount,0) <= ar.max_amount
       AND (ar.department_id IS NULL OR ar.department_id = p_department_id)
     ORDER BY ar.level
  LOOP
    -- من يشغل هذا الدور في سلسلة القسم؟
    SELECT oc.out_user_id INTO v_user
      FROM public.resolve_org_chain(p_department_id, p_unit_key) oc
     WHERE oc.out_org_role = r.required_role
     LIMIT 1;

    out_level         := r.level;
    out_required_role := r.required_role;
    out_approver_id   := v_user;   -- NULL يعني: لا شاغل لهذا الدور
    out_rule_name     := r.rule_name;
    RETURN NEXT;
  END LOOP;
END $$;

COMMENT ON FUNCTION public.resolve_approval_chain(TEXT, UUID, NUMERIC) IS
  'سلسلة الاعتماد لطلب: قواعد المبلغ × السلسلة التنظيمية. NULL في approver = دور بلا شاغل.';

-- ═══ 7) الصلاحيات ═══════════════════════════════════════════════════════
DO $$
DECLARE v_fn TEXT;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.my_approval_inbox(text)',
    'public.unified_approval_decide(text,uuid,text,text)',
    'public.resolve_approval_chain(text,uuid,numeric)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', v_fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', v_fn);
  END LOOP;
END $$;

-- ═══ 8) حرّاس التحقق ════════════════════════════════════════════════════
DO $$
DECLARE
  v_cnt INT;
  v_fn  TEXT;
BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.views
     WHERE table_schema='public' AND table_name='unified_approvals'
  ), '0305 failed: view missing';

  -- العرض يغطي التسعة
  SELECT count(DISTINCT source_module) INTO v_cnt
    FROM (SELECT source_module FROM public.unified_approvals LIMIT 0) x;
  -- (العرض قد يكون فارغاً؛ نتحقق من النص بدل البيانات)
  ASSERT (SELECT count(*) FROM pg_views
           WHERE schemaname='public' AND viewname='unified_approvals'
             AND definition LIKE '%hr_approval_requests%'
             AND definition LIKE '%procurement_approval_requests%'
             AND definition LIKE '%financial_approval_requests%'
             AND definition LIKE '%contract_approval_requests%'
             AND definition LIKE '%employee_movement_approvals%'
             AND definition LIKE '%inventory_adjustment_approvals%'
             AND definition LIKE '%mrp_bom_approvals%'
             AND definition LIKE '%crm_discount_approvals%'
             AND definition LIKE '%approval_requests%') = 1,
    '0305 failed: view does not cover all nine sources';

  ASSERT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema='public' AND table_name='approval_rules'
  ), '0305 failed: approval_rules missing';

  ASSERT (SELECT rowsecurity FROM pg_tables
           WHERE schemaname='public' AND tablename='approval_rules'),
    '0305 failed: RLS not enabled on approval_rules';

  FOREACH v_fn IN ARRAY ARRAY['my_approval_inbox','unified_approval_decide','resolve_approval_chain'] LOOP
    SELECT count(*) INTO v_cnt FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname=v_fn;
    ASSERT v_cnt = 1, format('0305 failed: %s overloads = %s', v_fn, v_cnt);
  END LOOP;

  FOREACH v_fn IN ARRAY ARRAY[
    'public.my_approval_inbox(text)',
    'public.unified_approval_decide(text,uuid,text,text)',
    'public.resolve_approval_chain(text,uuid,numeric)'
  ] LOOP
    ASSERT NOT has_function_privilege('anon', v_fn, 'EXECUTE'),
      format('0305 failed: anon can execute %s', v_fn);
  END LOOP;

  ASSERT NOT has_table_privilege('anon','public.unified_approvals','SELECT'),
    '0305 failed: anon can read unified_approvals';

  RAISE NOTICE '✅ 0305: محرك الموافقات الموحّد — تسع بوابات في مركز واحد';
END $$;

NOTIFY pgrst, 'reload schema';
