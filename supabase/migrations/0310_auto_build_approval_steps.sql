-- ============================================================================
-- FILE: 0310_auto_build_approval_steps.sql
-- PURPOSE: تفعيل المستويات تلقائياً — الجسور تبني السلسلة عند الإنشاء
--
-- ─────────────────────────────────────────────────────────────────────────
-- المشكلة:
--   0309 بنى build_approval_steps ومُختبَرة (33/33)، لكن الجسور
--   (create_financial_approval · create_mrp_bom_approval
--   · create_general_approval) لا تستدعيها.
--
--   فكل طلب جديد يُنشأ **بلا خطوات** ويتبع المسار القديم: خطوة واحدة.
--   المستويات موجودة نظرياً وغائبة عملياً.
--
-- ─────────────────────────────────────────────────────────────────────────
-- العائق الذي أخّر التنفيذ: كل بوابة تعرف قسمها ومبلغها بطريقة مختلفة.
--
--   • المالية  : reference_id يشير إلى journal_entries أو invoices —
--                والمبلغ يُستخرج من القيد إن وُجد
--   • التصنيع  : نسخة BOM بلا مبلغ ولا قسم مباشر
--   • العام    : قسم مقدّم الطلب (يُحلّ أصلاً في 0306)
--
--   الحل: دالة مساعدة واحدة resolve_requester_department تُوحّد حلّ
--   القسم، ومعامل مبلغ اختياري لكل جسر. لا نُخمّن ما لا نعرفه —
--   المبلغ الافتراضي صفر يُطابق قواعد النطاق المفتوح.
--
-- ما لا يفعله — عمداً:
--   ❌ لا يغيّر سلوك الطلبات القائمة (بلا خطوات ⇒ مسار قديم)
--   ❌ لا يفشل الإنشاء إن فشل بناء الخطوات (الطلب أُنشئ فعلاً)
-- ============================================================================

-- ═══ 1) حلّ قسم مقدّم الطلب — موحَّد ════════════════════════════════════
-- يُستخرج من 0306 حيث كان مكرَّراً داخل create_general_approval، ليُستعمل
-- في الجسور الثلاثة بلا تكرار.
CREATE OR REPLACE FUNCTION public.resolve_requester_department(
  p_user_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_user   UUID := COALESCE(p_user_id, auth.uid());
  v_dept   UUID;
BEGIN
  IF v_tenant IS NULL OR v_user IS NULL THEN
    RETURN NULL;
  END IF;

  -- الأوثق: employees.department_id مفتاح أجنبي حقيقي
  SELECT e.department_id INTO v_dept
    FROM public.employees e
   WHERE e.user_id = v_user AND e.tenant_id = v_tenant
   LIMIT 1;

  IF v_dept IS NOT NULL THEN
    RETURN v_dept;
  END IF;

  -- احتياطي: profiles.department نصّ حر — نطابقه بالاسم.
  -- (نفس جسر 0302؛ دين تقني موثَّق لا خيار تصميمي.)
  SELECT d.id INTO v_dept
    FROM public.profiles p
    JOIN public.departments d
      ON d.tenant_id = v_tenant
     AND lower(btrim(d.name_ar)) = lower(btrim(p.department))
   WHERE p.id = v_user
     AND p.tenant_id = v_tenant
     AND p.department IS NOT NULL
   LIMIT 1;

  RETURN v_dept;
END $$;

COMMENT ON FUNCTION public.resolve_requester_department(UUID) IS
  'قسم المستخدم: employees.department_id أولاً ثم مطابقة profiles.department بالاسم.';

-- ═══ 2) المالية — مع استخراج المبلغ ═════════════════════════════════════
CREATE OR REPLACE FUNCTION public.create_financial_approval(
  p_request_type TEXT,
  p_reference_id UUID,
  p_amount       NUMERIC DEFAULT NULL
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
  v_exists UUID;
  v_dept   UUID;
  v_amount NUMERIC;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NO_AUTH'; END IF;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  IF p_request_type NOT IN ('journal_entry','invoice','expense','budget','tax_filing') THEN
    RAISE EXCEPTION 'INVALID_REQUEST_TYPE (%)', p_request_type;
  END IF;

  SELECT id INTO v_exists
    FROM public.financial_approval_requests
   WHERE tenant_id = v_tenant AND reference_id = p_reference_id AND status = 'pending'
   LIMIT 1;

  IF v_exists IS NOT NULL THEN
    RETURN v_exists;
  END IF;

  INSERT INTO public.financial_approval_requests
    (tenant_id, request_type, reference_id, requested_by, status, current_step, total_steps)
  VALUES (v_tenant, p_request_type, p_reference_id, auth.uid(), 'pending', 1, 1)
  RETURNING id INTO v_id;

  -- المبلغ: المُمرَّر أولاً، وإلا نستخرجه من القيد إن كان الطلب قيداً.
  -- لا نُخمّن: نوع آخر بلا مبلغ ⇒ صفر يُطابق قواعد النطاق المفتوح.
  v_amount := p_amount;
  IF v_amount IS NULL AND p_request_type = 'journal_entry' THEN
    SELECT COALESCE(SUM(l.debit_amount), 0) INTO v_amount
      FROM public.journal_entry_lines l
     WHERE l.entry_id = p_reference_id;
  END IF;

  v_dept := public.resolve_requester_department(auth.uid());

  -- بناء السلسلة لا يُفشل الإنشاء: الطلب أُنشئ فعلاً، وفشل البناء
  -- يعني مساراً بخطوة واحدة لا فقدان الطلب.
  IF v_dept IS NOT NULL THEN
    BEGIN
      PERFORM public.build_approval_steps('finance', v_id, 'finance', v_dept, COALESCE(v_amount, 0));
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '0310: تعذّر بناء خطوات الطلب المالي % — يتبع المسار القديم: %', v_id, SQLERRM;
    END;
  END IF;

  RETURN v_id;
END $$;

COMMENT ON FUNCTION public.create_financial_approval(TEXT, UUID, NUMERIC) IS
  'طلب موافقة مالية + بناء سلسلة المستويات. آمن للتكرار. فشل البناء لا يُفشل الإنشاء.';

-- ═══ 3) التصنيع ═════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.create_mrp_bom_approval(
  p_bom_version_id UUID,
  p_approver_role  TEXT DEFAULT 'production_manager'
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
  v_exists UUID;
  v_dept   UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NO_AUTH'; END IF;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  IF p_approver_role NOT IN
     ('bom_engineer','production_manager','quality_inspector','cost_accountant','admin') THEN
    RAISE EXCEPTION 'INVALID_APPROVER_ROLE (%)', p_approver_role;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.mrp_bom_versions
     WHERE id = p_bom_version_id AND tenant_id = v_tenant
  ) THEN
    RAISE EXCEPTION 'BOM_VERSION_NOT_FOUND';
  END IF;

  SELECT id INTO v_exists
    FROM public.mrp_bom_approvals
   WHERE tenant_id = v_tenant AND bom_version_id = p_bom_version_id AND decision = 'pending'
   LIMIT 1;

  IF v_exists IS NOT NULL THEN
    RETURN v_exists;
  END IF;

  INSERT INTO public.mrp_bom_approvals
    (tenant_id, bom_version_id, approver_role, decision)
  VALUES (v_tenant, p_bom_version_id, p_approver_role, 'pending')
  RETURNING id INTO v_id;

  -- نسخة BOM بلا مبلغ: قواعد التصنيع تعتمد المستوى والقسم لا القيمة
  v_dept := public.resolve_requester_department(auth.uid());

  IF v_dept IS NOT NULL THEN
    BEGIN
      PERFORM public.build_approval_steps('mrp', v_id, 'mrp', v_dept, 0);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '0310: تعذّر بناء خطوات طلب BOM % — يتبع المسار القديم: %', v_id, SQLERRM;
    END;
  END IF;

  RETURN v_id;
END $$;

COMMENT ON FUNCTION public.create_mrp_bom_approval(UUID, TEXT) IS
  'طلب اعتماد قائمة مواد + بناء سلسلة المستويات. آمن للتكرار.';

-- ═══ 4) العام ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.create_general_approval(
  p_request_type  TEXT,
  p_title         TEXT,
  p_related_table TEXT DEFAULT NULL,
  p_related_id    UUID DEFAULT NULL,
  p_description   TEXT DEFAULT NULL,
  p_priority      TEXT DEFAULT 'normal',
  p_unit_key      TEXT DEFAULT 'hr',
  p_amount        NUMERIC DEFAULT 0
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
  v_name   TEXT;
  v_dept   UUID;
  v_appr   UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NO_AUTH'; END IF;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  IF p_request_type NOT IN
     ('leave','expense','loan','attendance_correction','movement_permit','goal','other') THEN
    RAISE EXCEPTION 'INVALID_REQUEST_TYPE (%)', p_request_type;
  END IF;

  IF p_priority NOT IN ('low','normal','urgent') THEN
    RAISE EXCEPTION 'INVALID_PRIORITY (%)', p_priority;
  END IF;

  IF COALESCE(btrim(p_title),'') = '' THEN
    RAISE EXCEPTION 'TITLE_REQUIRED';
  END IF;

  IF p_unit_key NOT IN ('movement','hr','finance','procurement','inventory',
                        'mrp','contracts','crm','health_safety') THEN
    RAISE EXCEPTION 'INVALID_UNIT_KEY (%)', p_unit_key;
  END IF;

  SELECT COALESCE(p.full_name, p.email, 'موظف') INTO v_name
    FROM public.profiles p WHERE p.id = auth.uid();

  v_dept := public.resolve_requester_department(auth.uid());

  IF v_dept IS NOT NULL THEN
    SELECT oc.out_user_id INTO v_appr
      FROM public.resolve_org_chain(v_dept) oc
     WHERE oc.out_org_role = 'manager'
     LIMIT 1;
  END IF;

  INSERT INTO public.approval_requests
    (tenant_id, requester_id, requester_name, current_approver_id,
     request_type, title, description, related_table, related_id, priority, status)
  VALUES
    (v_tenant, auth.uid(), v_name, v_appr,
     p_request_type, btrim(p_title), p_description, p_related_table, p_related_id,
     p_priority, 'pending')
  RETURNING id INTO v_id;

  IF v_dept IS NOT NULL THEN
    BEGIN
      PERFORM public.build_approval_steps('general', v_id, p_unit_key, v_dept, COALESCE(p_amount, 0));
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '0310: تعذّر بناء خطوات الطلب العام % — يتبع المسار القديم: %', v_id, SQLERRM;
    END;
  END IF;

  RETURN v_id;
END $$;

COMMENT ON FUNCTION public.create_general_approval(TEXT,TEXT,TEXT,UUID,TEXT,TEXT,TEXT,NUMERIC) IS
  'طلب عام + بناء سلسلة المستويات. p_unit_key يحدّد قواعد أي وحدة تُطبَّق.';

-- ═══ 5) الصلاحيات ═══════════════════════════════════════════════════════
DO $$
DECLARE v_fn TEXT;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.resolve_requester_department(uuid)',
    'public.create_financial_approval(text,uuid,numeric)',
    'public.create_mrp_bom_approval(uuid,text)',
    'public.create_general_approval(text,text,text,uuid,text,text,text,numeric)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', v_fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', v_fn);
  END LOOP;
END $$;

-- التوقيعان القديمان أُبقيا (DEFAULT يجعلهما متاحين) — لكن نتأكد أن
-- التوقيع الجديد لا يُنشئ حِملاً زائداً يُربك PostgREST.
DO $$
DECLARE v_cnt INT;
BEGIN
  SELECT count(*) INTO v_cnt FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='create_financial_approval';
  IF v_cnt > 1 THEN
    -- التوقيع القديم (نصّ + uuid) صار حِملاً زائداً بعد إضافة p_amount
    DROP FUNCTION IF EXISTS public.create_financial_approval(TEXT, UUID);
  END IF;

  SELECT count(*) INTO v_cnt FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='create_general_approval';
  IF v_cnt > 1 THEN
    DROP FUNCTION IF EXISTS public.create_general_approval(TEXT,TEXT,TEXT,UUID,TEXT,TEXT);
  END IF;
END $$;

-- ═══ 6) حرّاس التحقق ════════════════════════════════════════════════════
DO $$
DECLARE
  v_fn  TEXT;
  v_cnt INT;
  v_def TEXT;
BEGIN
  -- لا حِمل زائد على أي جسر (يُربك PostgREST ويُنتج «function is not unique»)
  FOREACH v_fn IN ARRAY ARRAY[
    'create_financial_approval','create_mrp_bom_approval',
    'create_general_approval','resolve_requester_department'
  ] LOOP
    SELECT count(*) INTO v_cnt FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname=v_fn;
    ASSERT v_cnt = 1, format('0310 failed: %s overloads = %s (must be 1)', v_fn, v_cnt);
  END LOOP;

  -- كل جسر يستدعي build_approval_steps
  FOREACH v_fn IN ARRAY ARRAY[
    'create_financial_approval','create_mrp_bom_approval','create_general_approval'
  ] LOOP
    SELECT pg_get_functiondef(p.oid) INTO v_def
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname=v_fn;
    ASSERT v_def LIKE '%build_approval_steps%',
      format('0310 failed: %s does not build steps', v_fn);
    -- وفشل البناء لا يُفشل الإنشاء
    ASSERT v_def LIKE '%EXCEPTION WHEN OTHERS THEN%RAISE WARNING%',
      format('0310 failed: %s must not fail creation on step-build error', v_fn);
  END LOOP;

  FOREACH v_fn IN ARRAY ARRAY[
    'public.resolve_requester_department(uuid)',
    'public.create_financial_approval(text,uuid,numeric)',
    'public.create_mrp_bom_approval(uuid,text)',
    'public.create_general_approval(text,text,text,uuid,text,text,text,numeric)'
  ] LOOP
    ASSERT NOT has_function_privilege('anon', v_fn, 'EXECUTE'),
      format('0310 failed: anon can execute %s', v_fn);
  END LOOP;

  RAISE NOTICE '✅ 0310: الجسور تبني سلسلة المستويات تلقائياً';
END $$;

NOTIFY pgrst, 'reload schema';
