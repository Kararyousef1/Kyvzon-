-- ============================================================================
-- FILE: 0308_approval_rules_management.sql
-- PURPOSE: إدارة قواعد الاعتماد العامة — دوال + كشف التعارض
--
-- ─────────────────────────────────────────────────────────────────────────
-- المشكلة:
--   0305 أنشأ approval_rules و resolve_approval_chain، لكن الجدول
--   **بلا واجهة ولا دوال إدارة**. فحص الشيفرة أثبت أن لا سطر واحد في
--   src/ يقرأ منه أو يكتب فيه.
--
--   النتيجة: قواعد الاعتماد غير قابلة للتكوين — المستأجر لا يستطيع
--   أن يقول «مصروف فوق 50 ألفاً يحتاج المدير المباشر».
--
-- ─────────────────────────────────────────────────────────────────────────
-- ما يضيفه هذا المايجريشن:
--
--   ① upsert_approval_rule   — إنشاء/تعديل بصلاحية إدارية
--   ② set_approval_rule_active — تفعيل/تعطيل (لا حذف)
--   ③ approval_rules_board   — عرض القواعد مع أسماء الأقسام
--   ④ detect_approval_rule_gaps — 🔴 كشف الفجوات والتعارضات
--
-- الرابع هو الأهم: قاعدة اعتماد خاطئة أخطر من غيابها. مثلاً:
--   • نطاقان متداخلان لنفس المستوى ⇒ أي قاعدة تفوز؟
--   • فجوة بين 10,000 و 10,001 ⇒ طلب بـ10,000.5 بلا معتمِد
--   • دور بلا شاغل في الهيكل ⇒ سلسلة مكسورة صامتة
--
--   الدالة تكشفها قبل أن تُوقِع الطلبات في فراغ.
-- ============================================================================

-- ═══ 1) إنشاء/تعديل قاعدة ═══════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.upsert_approval_rule(
  p_unit_key      TEXT,
  p_rule_name     TEXT,
  p_min_amount    NUMERIC,
  p_max_amount    NUMERIC,
  p_level         INTEGER,
  p_required_role TEXT,
  p_department_id UUID DEFAULT NULL,
  p_rule_id       UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_id     UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NO_AUTH'; END IF;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  -- تكوين قواعد الاعتماد قرار إداري
  IF public.current_user_role() NOT IN ('admin','developer','it_admin') THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED_TO_MANAGE_RULES';
  END IF;

  IF COALESCE(btrim(p_rule_name),'') = '' THEN
    RAISE EXCEPTION 'RULE_NAME_REQUIRED';
  END IF;

  IF p_max_amount < p_min_amount THEN
    RAISE EXCEPTION 'INVALID_AMOUNT_RANGE (max < min)';
  END IF;

  IF p_min_amount < 0 THEN
    RAISE EXCEPTION 'NEGATIVE_AMOUNT';
  END IF;

  -- القسم إن حُدِّد يجب أن يكون من نفس المستأجر
  IF p_department_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.departments
     WHERE id = p_department_id AND tenant_id = v_tenant
  ) THEN
    RAISE EXCEPTION 'DEPARTMENT_NOT_FOUND';
  END IF;

  IF p_rule_id IS NULL THEN
    INSERT INTO public.approval_rules
      (tenant_id, unit_key, rule_name, min_amount, max_amount,
       department_id, level, required_role, is_active, created_by)
    VALUES
      (v_tenant, p_unit_key, btrim(p_rule_name), p_min_amount, p_max_amount,
       p_department_id, p_level, p_required_role, TRUE, auth.uid())
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.approval_rules
       SET unit_key      = p_unit_key,
           rule_name     = btrim(p_rule_name),
           min_amount    = p_min_amount,
           max_amount    = p_max_amount,
           department_id = p_department_id,
           level         = p_level,
           required_role = p_required_role,
           updated_at    = NOW()
     WHERE id = p_rule_id AND tenant_id = v_tenant
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      RAISE EXCEPTION 'RULE_NOT_FOUND';
    END IF;
  END IF;

  RETURN v_id;
END $$;

COMMENT ON FUNCTION public.upsert_approval_rule(TEXT,TEXT,NUMERIC,NUMERIC,INTEGER,TEXT,UUID,UUID) IS
  'إنشاء أو تعديل قاعدة اعتماد. صلاحية إدارية. قيود القاعدة تتكفّل بصحة القيم.';

-- ═══ 2) تفعيل/تعطيل — لا حذف ════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.set_approval_rule_active(
  p_rule_id UUID,
  p_active  BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_found  UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NO_AUTH'; END IF;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  IF public.current_user_role() NOT IN ('admin','developer','it_admin') THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED_TO_MANAGE_RULES';
  END IF;

  UPDATE public.approval_rules
     SET is_active = p_active, updated_at = NOW()
   WHERE id = p_rule_id AND tenant_id = v_tenant
  RETURNING id INTO v_found;

  IF v_found IS NULL THEN
    RAISE EXCEPTION 'RULE_NOT_FOUND';
  END IF;
END $$;

COMMENT ON FUNCTION public.set_approval_rule_active(UUID, BOOLEAN) IS
  'تفعيل/تعطيل قاعدة. لا حذف — القواعد المعطَّلة تبقى للتدقيق.';

-- ═══ 3) لوحة القواعد ════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.approval_rules_board(
  p_unit_key TEXT DEFAULT NULL
)
RETURNS TABLE (
  out_rule_id       UUID,
  out_unit_key      TEXT,
  out_rule_name     TEXT,
  out_min_amount    NUMERIC,
  out_max_amount    NUMERIC,
  out_department_id UUID,
  out_department    TEXT,
  out_level         INTEGER,
  out_required_role TEXT,
  out_is_active     BOOLEAN,
  out_created_at    TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id, r.unit_key::TEXT, r.rule_name, r.min_amount, r.max_amount,
         r.department_id,
         COALESCE(d.name_ar, 'كل الأقسام')::TEXT,
         r.level, r.required_role::TEXT, r.is_active, r.created_at
    FROM public.approval_rules r
    LEFT JOIN public.departments d ON d.id = r.department_id
   WHERE r.tenant_id = public.current_user_tenant_id()
     AND (p_unit_key IS NULL OR r.unit_key = p_unit_key)
   ORDER BY r.unit_key, r.level, r.min_amount;
$$;

COMMENT ON FUNCTION public.approval_rules_board(TEXT) IS
  'قواعد الاعتماد مع أسماء الأقسام. NULL في القسم = كل الأقسام.';

-- ═══ 4) 🔴 كشف الفجوات والتعارضات ═══════════════════════════════════════
-- قاعدة اعتماد خاطئة أخطر من غيابها: الطلب يقع في فراغ صامت.
CREATE OR REPLACE FUNCTION public.detect_approval_rule_gaps(
  p_unit_key TEXT DEFAULT NULL
)
RETURNS TABLE (
  out_severity  TEXT,
  out_unit_key  TEXT,
  out_issue     TEXT,
  out_detail    TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  r        RECORD;
BEGIN
  IF v_tenant IS NULL THEN RETURN; END IF;

  -- (أ) نطاقان متداخلان لنفس الوحدة والمستوى والقسم
  FOR r IN
    SELECT a.unit_key, a.level, a.rule_name AS n1, b.rule_name AS n2,
           a.min_amount AS a_min, a.max_amount AS a_max,
           b.min_amount AS b_min, b.max_amount AS b_max
      FROM public.approval_rules a
      JOIN public.approval_rules b
        ON b.tenant_id = a.tenant_id
       AND b.unit_key  = a.unit_key
       AND b.level     = a.level
       AND b.id <> a.id
       AND b.department_id IS NOT DISTINCT FROM a.department_id
       AND a.min_amount <= b.max_amount
       AND b.min_amount <= a.max_amount
       AND a.id < b.id
     WHERE a.tenant_id = v_tenant
       AND a.is_active AND b.is_active
       AND (p_unit_key IS NULL OR a.unit_key = p_unit_key)
  LOOP
    out_severity := 'error';
    out_unit_key := r.unit_key;
    out_issue    := 'نطاقان متداخلان في نفس المستوى';
    out_detail   := format('«%s» (%s–%s) تتداخل مع «%s» (%s–%s) في المستوى %s',
                           r.n1, r.a_min, r.a_max, r.n2, r.b_min, r.b_max, r.level);
    RETURN NEXT;
  END LOOP;

  -- (ب) فجوة بين نطاقين متتاليين
  FOR r IN
    SELECT unit_key, level, rule_name, max_amount, next_min, next_name
      FROM (
        SELECT ar.unit_key, ar.level, ar.rule_name, ar.max_amount,
               LEAD(ar.min_amount) OVER w AS next_min,
               LEAD(ar.rule_name)  OVER w AS next_name
          FROM public.approval_rules ar
         WHERE ar.tenant_id = v_tenant
           AND ar.is_active
           AND (p_unit_key IS NULL OR ar.unit_key = p_unit_key)
        WINDOW w AS (PARTITION BY ar.unit_key, ar.level, ar.department_id
                     ORDER BY ar.min_amount)
      ) t
     WHERE next_min IS NOT NULL
       AND next_min > max_amount + 0.01
  LOOP
    out_severity := 'warning';
    out_unit_key := r.unit_key;
    out_issue    := 'فجوة بين نطاقين';
    out_detail   := format('لا قاعدة بين %s و %s (بين «%s» و «%s») — طلب بهذا المبلغ بلا معتمِد',
                           r.max_amount, r.next_min, r.rule_name, r.next_name);
    RETURN NEXT;
  END LOOP;

  -- (ج) وحدة نشطة بلا أي قاعدة
  FOR r IN
    SELECT u.k AS unit_key
      FROM unnest(ARRAY['movement','hr','finance','procurement','inventory',
                        'mrp','contracts','crm','health_safety']) AS u(k)
     WHERE (p_unit_key IS NULL OR u.k = p_unit_key)
       AND NOT EXISTS (
         SELECT 1 FROM public.approval_rules ar
          WHERE ar.tenant_id = v_tenant AND ar.unit_key = u.k AND ar.is_active
       )
  LOOP
    out_severity := 'info';
    out_unit_key := r.unit_key;
    out_issue    := 'وحدة بلا قواعد';
    out_detail   := 'لا قاعدة اعتماد لهذه الوحدة — الطلبات تعتمد على السلسلة التنظيمية وحدها';
    RETURN NEXT;
  END LOOP;

  -- (د) دور مطلوب بلا شاغل في القسم المحدَّد
  FOR r IN
    SELECT ar.unit_key, ar.rule_name, ar.required_role, ar.department_id,
           COALESCE(d.name_ar, '—') AS dept_name
      FROM public.approval_rules ar
      LEFT JOIN public.departments d ON d.id = ar.department_id
     WHERE ar.tenant_id = v_tenant
       AND ar.is_active
       AND ar.department_id IS NOT NULL
       AND (p_unit_key IS NULL OR ar.unit_key = p_unit_key)
       AND NOT EXISTS (
         SELECT 1 FROM public.org_role_assignments o
          WHERE o.tenant_id = v_tenant
            AND o.department_id = ar.department_id
            AND o.is_active
            AND o.org_role = ar.required_role
       )
  LOOP
    out_severity := 'error';
    out_unit_key := r.unit_key;
    out_issue    := 'دور بلا شاغل';
    out_detail   := format('«%s» تطلب دور %s في قسم %s — لا أحد يشغله',
                           r.rule_name, r.required_role, r.dept_name);
    RETURN NEXT;
  END LOOP;
END $$;

COMMENT ON FUNCTION public.detect_approval_rule_gaps(TEXT) IS
  'يكشف تداخل النطاقات والفجوات والأدوار بلا شاغل. قاعدة خاطئة أخطر من غيابها.';

-- ═══ 5) الصلاحيات ═══════════════════════════════════════════════════════
DO $$
DECLARE v_fn TEXT;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.upsert_approval_rule(text,text,numeric,numeric,integer,text,uuid,uuid)',
    'public.set_approval_rule_active(uuid,boolean)',
    'public.approval_rules_board(text)',
    'public.detect_approval_rule_gaps(text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', v_fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', v_fn);
  END LOOP;
END $$;

-- ═══ 6) حرّاس التحقق ════════════════════════════════════════════════════
DO $$
DECLARE
  v_fn  TEXT;
  v_cnt INT;
  v_def TEXT;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'upsert_approval_rule','set_approval_rule_active',
    'approval_rules_board','detect_approval_rule_gaps'
  ] LOOP
    SELECT count(*) INTO v_cnt FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname=v_fn;
    ASSERT v_cnt = 1, format('0308 failed: %s overloads = %s', v_fn, v_cnt);
  END LOOP;

  FOREACH v_fn IN ARRAY ARRAY[
    'public.upsert_approval_rule(text,text,numeric,numeric,integer,text,uuid,uuid)',
    'public.set_approval_rule_active(uuid,boolean)',
    'public.approval_rules_board(text)',
    'public.detect_approval_rule_gaps(text)'
  ] LOOP
    ASSERT NOT has_function_privilege('anon', v_fn, 'EXECUTE'),
      format('0308 failed: anon can execute %s', v_fn);
    ASSERT has_function_privilege('authenticated', v_fn, 'EXECUTE'),
      format('0308 failed: authenticated cannot execute %s', v_fn);
  END LOOP;

  -- لا حذف نهائي في دوال الإدارة (سياسة archive)
  FOREACH v_fn IN ARRAY ARRAY['upsert_approval_rule','set_approval_rule_active'] LOOP
    SELECT pg_get_functiondef(p.oid) INTO v_def
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname=v_fn;
    ASSERT v_def !~* 'DELETE\s+FROM\s+public\.approval_rules',
      format('0308 failed: %s must not delete rules (archive policy)', v_fn);
  END LOOP;

  RAISE NOTICE '✅ 0308: إدارة قواعد الاعتماد + كشف الفجوات';
END $$;

NOTIFY pgrst, 'reload schema';
