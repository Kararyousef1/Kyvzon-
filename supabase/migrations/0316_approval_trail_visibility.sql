-- ============================================================================
-- FILE: 0316_approval_trail_visibility.sql
-- PURPOSE: إصلاح تسريب في approval_steps_for + إتاحة مسار الاعتماد للواجهة
--
-- ─────────────────────────────────────────────────────────────────────────
-- ★ الثغرة المُثبَتة تشغيلياً (2026-08-05، Postgres 17 محلي):
--
--   approval_steps_for() من 0309 هي SECURITY DEFINER فتتجاوز RLS،
--   وحارسها الوحيد هو المستأجر:
--       WHERE s.tenant_id = public.current_user_tenant_id()
--
--   مسبار بموظف عادي (profiles.role='employee') على طلب ليس له:
--       موظف عادي يقرأ 1 خطوة من طلب ليس له
--       ⇒ يرى: «المدير المالي» | «راتب المدير مرتفع — وافقت مؤقتاً»
--
--   أي أن **أي موظف يقرأ سلسلة اعتماد أي طلب في الشركة** — أسماء
--   المعتمِدين وتعليقاتهم الداخلية. لم تُستدعَ الدالة من الواجهة قط
--   (صفر استدعاء في src/) فبقيت الثغرة كامنة؛ ولو بُنيت الشاشة عليها
--   كما هي لصارت مكشوفة لكل مستخدم.
--
-- ─────────────────────────────────────────────────────────────────────────
-- الإصلاح: أربعة مسارات مشروعة للرؤية — لا أكثر
--
--   ① مُقدّم الطلب      : من حقّه معرفة أين وصل طلبه ومن بقي
--   ② معتمِد في السلسلة : يرى المسار كاملاً (سابقيه ولاحقيه)
--   ③ مدير الوحدة       : has_portal_unit('manager', unit) للوحدة المعنية
--   ④ أدوار المنصة      : admin · developer · it_admin (تشخيص ودعم)
--
--   من عداهم: صفر صفوف — لا خطأ يكشف وجود الطلب.
--
-- ─────────────────────────────────────────────────────────────────────────
-- ★ حجب التعليقات: طبقة ثانية داخل المسموح لهم
--
--   حتى المسموح له بالرؤية لا يرى بالضرورة تعليقات غيره. تعليق المعتمِد
--   قد يحوي مبرّرات إدارية حسّاسة («الراتب مرتفع»). القاعدة المطبَّقة:
--     • مُقدّم الطلب يرى تعليقات من بتّوا في طلبه (شفافية القرار)
--     • المعتمِد يرى تعليق نفسه وتعليقات من سبقه في السلسلة
--     • مدير الوحدة وأدوار المنصة يرون الكل
--   وما عدا ذلك يُستبدل بـ NULL — لا يُخفى وجود الخطوة، فقط نصّها.
--
--   السبب في عدم الاكتفاء بحجب الصف: إخفاء الخطوة يعني إخفاء «كم بقي»
--   وهي معلومة مشروعة لصاحب الطلب. نحجب النصّ لا البنية.
-- ============================================================================

-- ═══ 1) هل للمستخدم الحالي حق رؤية مسار هذا الطلب؟ ══════════════════════
DROP FUNCTION IF EXISTS public.can_view_approval_trail(TEXT, UUID);

CREATE FUNCTION public.can_view_approval_trail(
  p_source_module TEXT,
  p_source_id     UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me     UUID := auth.uid();
  v_tenant UUID := public.current_user_tenant_id();
  v_unit   TEXT;
BEGIN
  IF v_me IS NULL OR v_tenant IS NULL OR p_source_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- ★ حارس المستأجر أولاً — قبل أي فرع امتياز.
  --
  --   العيب المُصحَّح (كشفه التأكيد 6.1 في الاختبار السلوكي):
  --   كان الفرع ④ يعيد TRUE لأي admin دون التحقق من أن الطلب في
  --   مستأجره. الصفوف كانت تعود صفراً فعلياً (لأن approval_steps_for
  --   تفلتر بالمستأجر أيضاً)، لكن الدالة **تكذب**: تقول «يحق له» عن
  --   طلب لا وجود له في شركته. وأي مستدعٍ يثق بها — شاشة أو دالة
  --   لاحقة — يبني على إجابة خاطئة.
  --
  --   الدرس: امتياز المنصة يُمنح داخل حدود المستأجر لا فوقها.
  IF NOT EXISTS (
    SELECT 1 FROM public.unified_approval_steps s
     WHERE s.tenant_id     = v_tenant
       AND s.source_module = p_source_module
       AND s.source_id     = p_source_id
  ) AND NOT EXISTS (
    SELECT 1 FROM public.unified_approvals a
     WHERE a.tenant_id     = v_tenant
       AND a.source_module = p_source_module
       AND a.source_id     = p_source_id
  ) THEN
    RETURN FALSE;
  END IF;

  -- ④ أدوار المنصة — تشخيص ودعم (نفس نمط movement_require_role)
  IF public.current_user_role() IN ('admin', 'developer', 'it_admin') THEN
    RETURN TRUE;
  END IF;

  -- ② معتمِد في السلسلة (حالياً أو سابقاً)
  IF EXISTS (
    SELECT 1 FROM public.unified_approval_steps s
     WHERE s.tenant_id     = v_tenant
       AND s.source_module = p_source_module
       AND s.source_id     = p_source_id
       AND (s.approver_id = v_me OR s.decided_by = v_me)
  ) THEN
    RETURN TRUE;
  END IF;

  -- ① مُقدّم الطلب
  IF EXISTS (
    SELECT 1 FROM public.unified_approvals a
     WHERE a.tenant_id     = v_tenant
       AND a.source_module = p_source_module
       AND a.source_id     = p_source_id
       AND a.requester_id  = v_me
  ) THEN
    RETURN TRUE;
  END IF;

  -- ③ مدير الوحدة التي ينتمي إليها الطلب
  SELECT a.unit_key INTO v_unit
    FROM public.unified_approvals a
   WHERE a.tenant_id     = v_tenant
     AND a.source_module = p_source_module
     AND a.source_id     = p_source_id
   LIMIT 1;

  IF v_unit IS NOT NULL AND public.has_portal_unit('manager', v_unit) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END $$;

COMMENT ON FUNCTION public.can_view_approval_trail(TEXT, UUID) IS
  'هل يرى المستخدم الحالي مسار اعتماد هذا الطلب؟ مُقدّم الطلب · معتمِد في السلسلة · مدير الوحدة · أدوار المنصة.';

REVOKE ALL ON FUNCTION public.can_view_approval_trail(TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_view_approval_trail(TEXT, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_view_approval_trail(TEXT, UUID)
  TO authenticated, service_role;

-- ═══ 2) approval_steps_for — بحارس ومعلومات عرض إضافية ══════════════════
-- نوع الإرجاع يتغيّر (عمودان جديدان) ⇒ إسقاط صريح إلزامي.
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
  -- جديد: هل هذه خطوتي؟ (لإبرازها في الواجهة)
  out_is_mine       BOOLEAN,
  -- جديد: هل هذه الخطوة النشطة الآن؟
  out_is_current    BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ctx AS (
    SELECT
      auth.uid()                        AS me,
      public.current_user_tenant_id()   AS tenant,
      public.can_view_approval_trail(p_source_module, p_source_id) AS allowed,
      public.current_user_role() IN ('admin','developer','it_admin') AS is_platform
  ),
  -- أول خطوة معلّقة = الخطوة النشطة
  cur AS (
    SELECT MIN(s.step_order) AS step_order
      FROM public.unified_approval_steps s, ctx
     WHERE s.tenant_id = ctx.tenant
       AND s.source_module = p_source_module
       AND s.source_id = p_source_id
       AND s.status = 'pending'
  ),
  -- هل المستخدم مدير الوحدة؟ يُحسب مرة واحدة لا لكل صف
  mgr AS (
    SELECT COALESCE(bool_or(public.has_portal_unit('manager', a.unit_key)), FALSE) AS is_unit_mgr
      FROM public.unified_approvals a, ctx
     WHERE a.tenant_id = ctx.tenant
       AND a.source_module = p_source_module
       AND a.source_id = p_source_id
  )
  SELECT
    s.step_order,
    s.required_role::TEXT,
    s.approver_id,
    COALESCE(p.full_name, p.email, '—')::TEXT,
    s.status::TEXT,
    -- حجب نصّ التعليق دون حجب الخطوة نفسها
    CASE
      WHEN ctx.is_platform OR mgr.is_unit_mgr THEN s.comments
      WHEN s.approver_id = ctx.me OR s.decided_by = ctx.me THEN s.comments
      -- مُقدّم الطلب يرى تعليقات من بتّوا في طلبه
      WHEN s.status <> 'pending' AND EXISTS (
        SELECT 1 FROM public.unified_approvals a
         WHERE a.tenant_id = ctx.tenant
           AND a.source_module = p_source_module
           AND a.source_id = p_source_id
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
   LEFT  JOIN cur ON TRUE
    LEFT JOIN public.profiles p ON p.id = s.approver_id
   WHERE s.tenant_id     = ctx.tenant
     AND s.source_module = p_source_module
     AND s.source_id     = p_source_id
     -- ★ الحارس: بلا حق رؤية ⇒ صفر صفوف (لا خطأ يكشف وجود الطلب)
     AND ctx.allowed
   ORDER BY s.step_order;
$$;

COMMENT ON FUNCTION public.approval_steps_for(TEXT, UUID) IS
  'خطوات اعتماد طلب. محروسة بـ can_view_approval_trail (0316) — كانت مكشوفة لكل موظف في المستأجر. التعليقات محجوبة عمن لا يخصّه نصّها.';

REVOKE ALL ON FUNCTION public.approval_steps_for(TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.approval_steps_for(TEXT, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.approval_steps_for(TEXT, UUID)
  TO authenticated, service_role;

-- ═══ 3) حرّاس التحقق ════════════════════════════════════════════════════
DO $$
DECLARE
  v_cnt   INT;
  v_fn    TEXT;
  v_t     UUID := gen_random_uuid();
  v_d     UUID := gen_random_uuid();
  v_boss  UUID := gen_random_uuid();
  v_spy   UUID := gen_random_uuid();
  v_src   UUID := gen_random_uuid();
  v_txt   TEXT;
BEGIN
  -- لا حِمل زائد
  FOREACH v_fn IN ARRAY ARRAY['can_view_approval_trail','approval_steps_for'] LOOP
    SELECT count(*) INTO v_cnt
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = v_fn;
    ASSERT v_cnt = 1, format('0316 failed: %s overloads = %s', v_fn, v_cnt);
  END LOOP;

  -- ★ اختبار الثغرة سلوكياً
  INSERT INTO public.tenants(id,name,name_ar,slug)
    VALUES (v_t,'G316','حارس','g316-'||substr(v_t::text,1,8));
  INSERT INTO public.departments(id,tenant_id,name_ar) VALUES (v_d,v_t,'المالية');
  INSERT INTO auth.users(id,email) VALUES
    (v_boss,'b316-'||substr(v_boss::text,1,8)||'@t.io'),
    (v_spy, 's316-'||substr(v_spy::text,1,8) ||'@t.io');
  INSERT INTO public.profiles(id,tenant_id,full_name,role) VALUES
    (v_boss,v_t,'المدير المالي','manager'),
    (v_spy, v_t,'موظف فضولي','employee');
  INSERT INTO public.unified_approval_steps
    (tenant_id,source_module,source_id,step_order,required_role,approver_id,status,comments)
    VALUES (v_t,'finance',v_src,1,'manager',v_boss,'approved','تعليق داخلي حسّاس');

  -- الفضولي: صفر صفوف (كان يقرأها قبل 0316)
  PERFORM set_config('request.jwt.claim.sub', v_spy::text, TRUE);
  ASSERT NOT public.can_view_approval_trail('finance', v_src),
    '0316 failed: outsider granted trail access';

  SELECT count(*) INTO v_cnt FROM public.approval_steps_for('finance', v_src);
  ASSERT v_cnt = 0, format('0316 failed: leaked %s step(s) to outsider', v_cnt);

  -- المعتمِد يرى مساره وتعليقه
  PERFORM set_config('request.jwt.claim.sub', v_boss::text, TRUE);
  ASSERT public.can_view_approval_trail('finance', v_src),
    '0316 failed: approver denied own trail';

  SELECT count(*) INTO v_cnt FROM public.approval_steps_for('finance', v_src);
  ASSERT v_cnt = 1, format('0316 failed: approver sees %s steps', v_cnt);

  SELECT out_comments INTO v_txt FROM public.approval_steps_for('finance', v_src) LIMIT 1;
  ASSERT v_txt = 'تعليق داخلي حسّاس', '0316 failed: approver cannot read own comment';

  ASSERT (SELECT out_is_mine FROM public.approval_steps_for('finance', v_src) LIMIT 1),
    '0316 failed: out_is_mine wrong for approver';

  -- تنظيف
  PERFORM set_config('request.jwt.claim.sub','',TRUE);
  DELETE FROM public.unified_approval_steps WHERE source_id = v_src;
  DELETE FROM public.profiles   WHERE id IN (v_boss,v_spy);
  DELETE FROM auth.users        WHERE id IN (v_boss,v_spy);
  DELETE FROM public.departments WHERE id = v_d;
  DELETE FROM public.tenants     WHERE id = v_t;

  ASSERT NOT has_function_privilege('anon','public.approval_steps_for(text,uuid)','EXECUTE'),
    '0316 failed: anon can read trails';
  ASSERT NOT has_function_privilege('anon','public.can_view_approval_trail(text,uuid)','EXECUTE'),
    '0316 failed: anon can probe access';

  RAISE NOTICE '✅ 0316: مسار الاعتماد محروس — أُغلق تسريب كان يكشف كل سلسلة لكل موظف';
END $$;
