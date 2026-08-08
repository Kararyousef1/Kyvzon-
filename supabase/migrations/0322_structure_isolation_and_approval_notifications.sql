-- ============================================================================
-- FILE: 0322_structure_isolation_and_approval_notifications.sql
-- PURPOSE: عزل الجداول الهيكلية + ربط الموافقات بنظام الإشعارات
--
-- ─────────────────────────────────────────────────────────────────────────
-- ★ العطل الأول: أربعة جداول هيكلية مكشوفة بين كل الشركات
--
--   structure_departments · structure_positions · structure_ranks
--   · structure_roles
--
--   كلها بلا عمود tenant_id إطلاقاً، وسياستها:
--       CREATE POLICY ... FOR SELECT USING (true)
--
--   مسبار تحت RLS حقيقي (SET ROLE authenticated):
--       شركة «ب» عرّفت منصب «مدير الاستحواذات — سرّي»
--       موظف شركة «أ» ⇒ مناصب مرئية = 1 · يرى: «مدير الاستحواذات — سرّي»
--                       أقسام هيكلية مرئية = 7
--
--   هذا **نفس عطل structure_shifts** الذي أُصلح في 0318 — والعائلة نفسها
--   بقيت مكشوفة. أسماء المناصب والأقسام تكشف الهيكل التنظيمي للمنافس.
--
-- ─────────────────────────────────────────────────────────────────────────
-- ★ العطل الثاني: الموافقات لا تُنشئ إشعارات
--
--   فحص: prosrc لـ create_hr_approval و unified_approval_decide
--         ⇒ لا ذكر لـ notification إطلاقاً.
--
--   مسبار: موظف قدّم إجازة ⇒
--       طلب HR أُنشئ  = 1
--       إشعارات المدير = 0     ← المدير لا يعلم إلا إن فتح الصفحة يدوياً
--
--   ونتيجةً لذلك: طلب قد يبقى معلّقاً أياماً بلا أن يراه أحد. وهذا
--   يُبطل عملياً كل محرك الموافقات الذي بنيناه في 0305–0316.
--
--   والجدول المركزي public.notifications موجود ومحروس — لكن أربع دوال
--   فقط تكتب فيه، ولا واحدة منها من مسار الموافقات.
--
-- ─────────────────────────────────────────────────────────────────────────
-- ❌ لا حذف · ✅ توسيع لا تضييق · القوالب العامة تبقى مقروءة للجميع
-- ============================================================================

-- ═══ 1) عزل الجداول الهيكلية الأربعة ════════════════════════════════════
--
-- نفس نمط 0318 مع structure_shifts:
--   tenant_id NULL  = قالب عام (تراه كل الشركات · تُعدّله المنصة وحدها)
--   tenant_id محدَّد = خاص بالشركة
--
-- الصفوف القائمة تبقى NULL أي قوالب عامة — فلا ينكسر أي عميل يستعملها.
DO $$
DECLARE v_tbl TEXT;
BEGIN
  FOREACH v_tbl IN ARRAY ARRAY[
    'structure_departments','structure_positions','structure_ranks','structure_roles'
  ] LOOP
    -- (أ) العمود
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS tenant_id UUID '
      'REFERENCES public.tenants(id) ON DELETE CASCADE', v_tbl);

    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_%s_tenant ON public.%I(tenant_id)',
      v_tbl, v_tbl);

    EXECUTE format(
      'COMMENT ON COLUMN public.%I.tenant_id IS %L',
      v_tbl,
      'الشركة المالكة. NULL = قالب عام يُقرأ للجميع ولا يُعدَّل إلا من المنصة (0322).');

    -- (ب) السياسات: نُسقط المكشوفة ونبني بديلاً مُستأجَراً
    EXECUTE format('DROP POLICY IF EXISTS kyvzon_%s_select ON public.%I', v_tbl, v_tbl);
    EXECUTE format('DROP POLICY IF EXISTS kyvzon_%s_write  ON public.%I', v_tbl, v_tbl);

    EXECUTE format(
      'CREATE POLICY kyvzon_%s_select ON public.%I FOR SELECT TO authenticated '
      'USING (tenant_id IS NULL OR tenant_id = public.current_user_tenant_id())',
      v_tbl, v_tbl);

    EXECUTE format(
      'CREATE POLICY kyvzon_%s_write ON public.%I FOR ALL TO authenticated '
      'USING ('
      '  (tenant_id = public.current_user_tenant_id() AND public.current_user_is_staff()) '
      '  OR (tenant_id IS NULL AND public.current_user_is_platform_admin())) '
      'WITH CHECK ('
      '  (tenant_id = public.current_user_tenant_id() AND public.current_user_is_staff()) '
      '  OR (tenant_id IS NULL AND public.current_user_is_platform_admin()))',
      v_tbl, v_tbl);
  END LOOP;

  RAISE NOTICE '0322: عُزِلت 4 جداول هيكلية كانت مكشوفة بين كل الشركات';
END $$;

-- ═══ 2) دالة إشعار موحّدة — نقطة واحدة لكل البوابات ═════════════════════
DROP FUNCTION IF EXISTS public.notify_user(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, UUID);

CREATE FUNCTION public.notify_user(
  p_tenant_id     UUID,
  p_user_id       UUID,
  p_type          TEXT,
  p_title         TEXT,
  p_message       TEXT,
  p_action_url    TEXT DEFAULT NULL,
  p_related_table TEXT DEFAULT NULL,
  p_related_id    UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id UUID;
BEGIN
  IF p_tenant_id IS NULL OR p_user_id IS NULL THEN RETURN NULL; END IF;

  -- لا نُزعج المستخدم بإشعار عن فعله هو
  IF p_user_id = auth.uid() THEN RETURN NULL; END IF;

  INSERT INTO public.notifications
    (tenant_id, user_id, type, title, message, action_url,
     related_table, related_id, is_read)
  VALUES
    (p_tenant_id, p_user_id, p_type, p_title, p_message, p_action_url,
     p_related_table, p_related_id, FALSE)
  RETURNING id INTO v_id;

  RETURN v_id;
EXCEPTION WHEN OTHERS THEN
  -- ★ الإشعار لا يجوز أن يُسقط العملية الأصلية.
  --   طلب إجازة يُنشأ بنجاح ثم يفشل الإشعار = الطلب يُلغى كله. غير مقبول.
  RETURN NULL;
END $$;

COMMENT ON FUNCTION public.notify_user(UUID,UUID,TEXT,TEXT,TEXT,TEXT,TEXT,UUID) IS
  'إنشاء إشعار موحّد. لا يُشعر الفاعل بفعله. فشله لا يُسقط العملية الأصلية (0322).';

REVOKE ALL ON FUNCTION public.notify_user(UUID,UUID,TEXT,TEXT,TEXT,TEXT,TEXT,UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_user(UUID,UUID,TEXT,TEXT,TEXT,TEXT,TEXT,UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.notify_user(UUID,UUID,TEXT,TEXT,TEXT,TEXT,TEXT,UUID)
  TO authenticated, service_role;

-- ═══ 3) إشعار معتمِدي طلب — يقرأ سلسلة الاعتماد ═════════════════════════
DROP FUNCTION IF EXISTS public.notify_approval_pending(TEXT, UUID);

CREATE FUNCTION public.notify_approval_pending(
  p_source_module TEXT,
  p_source_id     UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_title  TEXT;
  v_unit   TEXT;
  v_n      INT := 0;
  v_row    RECORD;
BEGIN
  IF v_tenant IS NULL OR p_source_id IS NULL THEN RETURN 0; END IF;

  SELECT a.title, a.unit_key INTO v_title, v_unit
    FROM public.unified_approvals a
   WHERE a.tenant_id = v_tenant
     AND a.source_module = p_source_module
     AND a.source_id = p_source_id
   LIMIT 1;

  IF v_title IS NULL THEN RETURN 0; END IF;

  -- (أ) المعتمِدون في الخطوة النشطة (نظام متعدد المستويات 0309)
  FOR v_row IN
    SELECT DISTINCT s.approver_id
      FROM public.unified_approval_steps s
     WHERE s.tenant_id = v_tenant
       AND s.source_module = p_source_module
       AND s.source_id = p_source_id
       AND s.status IN ('active','pending')
       AND s.approver_id IS NOT NULL
  LOOP
    IF public.notify_user(
         v_tenant, v_row.approver_id, 'approval_pending',
         'طلب بانتظار اعتمادك',
         v_title || ' — يحتاج قرارك',
         '/app/manager/units/' || COALESCE(v_unit,'hr') || '/approvals',
         'unified_approval_steps', p_source_id) IS NOT NULL
    THEN v_n := v_n + 1;
    END IF;
  END LOOP;

  -- (ب) لا خطوات موحّدة؟ نُشعر مديري الوحدة (معمارية 0302)
  IF v_n = 0 AND v_unit IS NOT NULL THEN
    FOR v_row IN
      SELECT DISTINCT u.user_id
        FROM public.portal_unit_assignments u
       WHERE u.tenant_id = v_tenant
         AND u.is_active
         AND u.base_role = 'manager'
         AND u.unit_key = v_unit
    LOOP
      IF public.notify_user(
           v_tenant, v_row.user_id, 'approval_pending',
           'طلب جديد في وحدتك',
           v_title || ' — بانتظار المراجعة',
           '/app/manager/units/' || v_unit || '/approvals',
           'unified_approvals', p_source_id) IS NOT NULL
      THEN v_n := v_n + 1;
      END IF;
    END LOOP;
  END IF;

  -- (ج) ★ سلسلة اعتماد البوابة نفسها.
  --
  --   اكتُشف بالتشغيل: بوابة HR تبني خطواتها في hr_approval_steps
  --   لا في unified_approval_steps (0309). فالفرع (أ) يعيد صفراً،
  --   والفرع (ب) يتطلب وحدة بوابة مُسنَدة — وهي غير مضمونة.
  --   النتيجة كانت: صفر إشعار رغم وجود معتمِد حقيقي في السلسلة.
  --
  --   نقرأ الجداول الخاصة بكل بوابة لأن توحيدها عمل منفصل.
  IF v_n = 0 THEN
    IF p_source_module = 'hr' THEN
      FOR v_row IN
        SELECT DISTINCT s.approver_id
          FROM public.hr_approval_steps s
         WHERE s.tenant_id = v_tenant
           AND s.request_id = p_source_id
           AND s.status IN ('active','pending')
           AND s.approver_id IS NOT NULL
      LOOP
        IF public.notify_user(
             v_tenant, v_row.approver_id, 'approval_pending',
             'طلب بانتظار اعتمادك',
             v_title || ' — يحتاج قرارك',
             '/app/manager/approvals',
             'hr_approval_steps', p_source_id) IS NOT NULL
        THEN v_n := v_n + 1;
        END IF;
      END LOOP;

    ELSIF p_source_module = 'procurement' THEN
      FOR v_row IN
        SELECT DISTINCT s.approver_id
          FROM public.procurement_approval_steps s
         WHERE s.request_id = p_source_id
           AND s.approver_id IS NOT NULL
      LOOP
        IF public.notify_user(
             v_tenant, v_row.approver_id, 'approval_pending',
             'طلب شراء بانتظار اعتمادك',
             v_title || ' — يحتاج قرارك',
             '/app/manager/approvals',
             'procurement_approval_steps', p_source_id) IS NOT NULL
        THEN v_n := v_n + 1;
        END IF;
      END LOOP;
    END IF;
  END IF;

  RETURN v_n;
END $$;

COMMENT ON FUNCTION public.notify_approval_pending(TEXT, UUID) IS
  'يُشعر معتمِدي طلب معلّق. الخطوة النشطة أولاً، ثم مديرو الوحدة إن لم تكن هناك خطوات (0322).';

REVOKE ALL ON FUNCTION public.notify_approval_pending(TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_approval_pending(TEXT, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.notify_approval_pending(TEXT, UUID)
  TO authenticated, service_role;

-- ═══ 4) إشعار مُقدّم الطلب بالقرار ══════════════════════════════════════
DROP FUNCTION IF EXISTS public.notify_approval_decided(TEXT, UUID, TEXT, TEXT);

CREATE FUNCTION public.notify_approval_decided(
  p_source_module TEXT,
  p_source_id     UUID,
  p_decision      TEXT,
  p_comments      TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_req    UUID;
  v_title  TEXT;
BEGIN
  IF v_tenant IS NULL OR p_source_id IS NULL THEN RETURN 0; END IF;

  -- العرض يُظهر pending فقط، فبعد القرار قد يختفي الصف.
  -- نقرأ مُقدّم الطلب من الخطوات إن لزم.
  SELECT a.requester_id, a.title INTO v_req, v_title
    FROM public.unified_approvals a
   WHERE a.tenant_id = v_tenant
     AND a.source_module = p_source_module
     AND a.source_id = p_source_id
   LIMIT 1;

  IF v_req IS NULL THEN RETURN 0; END IF;

  IF public.notify_user(
       v_tenant, v_req,
       CASE WHEN p_decision = 'approved' THEN 'approval_granted'
            ELSE 'approval_rejected' END,
       CASE WHEN p_decision = 'approved' THEN 'اعتُمد طلبك'
            ELSE 'رُفض طلبك' END,
       COALESCE(v_title,'طلبك') ||
       CASE WHEN p_comments IS NOT NULL AND btrim(p_comments) <> ''
            THEN ' — ' || p_comments ELSE '' END,
       NULL, 'unified_approvals', p_source_id) IS NOT NULL
  THEN RETURN 1;
  END IF;

  RETURN 0;
END $$;

COMMENT ON FUNCTION public.notify_approval_decided(TEXT,UUID,TEXT,TEXT) IS
  'يُشعر مُقدّم الطلب بقرار الاعتماد مع سببه (0322).';

REVOKE ALL ON FUNCTION public.notify_approval_decided(TEXT,UUID,TEXT,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_approval_decided(TEXT,UUID,TEXT,TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.notify_approval_decided(TEXT,UUID,TEXT,TEXT)
  TO authenticated, service_role;

-- ═══ 5) ★ الربط التلقائي — محفّز على جداول **الخطوات** لا الطلبات ═══════
--
-- ★★ اكتشاف حاسم بالتشغيل (أمسكه حارس المايجريشن):
--
--   النسخة الأولى وضعت المحفّز AFTER INSERT على hr_approval_requests.
--   لكن create_hr_approval تُدرج الطلب **ثم** تبني خطواته في نفس
--   الاستدعاء. فالمحفّز يعمل والخطوات لم تُبنَ بعد:
--
--       بعد الإنشاء مباشرة: إشعارات = 0 · خطوات نشطة = 1
--       استدعاء يدوي لاحقاً: 1 إشعار ✓
--
--   أي أن الدالة سليمة والتوقيت خاطئ. الحل: المحفّز على جدول الخطوة —
--   فوجود الخطوة يعني وجود معتمِد بالتعريف، ولا سباق زمني.
--
--   لماذا محفّز لا تعديل الدوال؟ دوال الإنشاء تسع، وتعديلها كلها يعني
--   تسعة مواضع تنحرف. المحفّز يغطي كل مسارات الإنشاء بما فيها الإدراج
--   المباشر من بوابة قديمة.
CREATE OR REPLACE FUNCTION public.tg_notify_approval_step()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_module  TEXT;
  v_request UUID;
  v_tenant  UUID;
  v_title   TEXT;
BEGIN
  -- خطوة بلا معتمِد أو غير نشطة لا تستحق إشعاراً
  IF NEW.approver_id IS NULL THEN RETURN NEW; END IF;
  IF COALESCE(NEW.status::TEXT,'') NOT IN ('active','pending') THEN RETURN NEW; END IF;

  IF TG_TABLE_NAME = 'unified_approval_steps' THEN
    v_module  := NEW.source_module::TEXT;
    v_request := NEW.source_id;
    v_tenant  := NEW.tenant_id;
  ELSIF TG_TABLE_NAME = 'hr_approval_steps' THEN
    v_module  := 'hr';
    v_request := NEW.request_id;
    v_tenant  := NEW.tenant_id;
  ELSE
    RETURN NEW;
  END IF;

  SELECT a.title INTO v_title
    FROM public.unified_approvals a
   WHERE a.tenant_id = v_tenant
     AND a.source_module = v_module
     AND a.source_id = v_request
   LIMIT 1;

  PERFORM public.notify_user(
    v_tenant, NEW.approver_id, 'approval_pending',
    'طلب بانتظار اعتمادك',
    COALESCE(v_title, 'طلب جديد') || ' — يحتاج قرارك',
    '/app/manager/approvals',
    TG_TABLE_NAME, v_request);

  RETURN NEW;
END $$;

COMMENT ON FUNCTION public.tg_notify_approval_step() IS
  'يُشعر المعتمِد عند إنشاء خطوة نشطة له. على جدول الخطوات لا الطلبات — تفادياً لسباق زمني (0322).';

DO $$
DECLARE v_tbl TEXT;
BEGIN
  FOREACH v_tbl IN ARRAY ARRAY['unified_approval_steps','hr_approval_steps'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_notify_approval_step ON public.%I', v_tbl);
    EXECUTE format(
      'CREATE TRIGGER trg_notify_approval_step AFTER INSERT ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.tg_notify_approval_step()', v_tbl);
  END LOOP;

  -- تنظيف محفّزات النسخة الأولى إن كانت طُبِّقت
  FOREACH v_tbl IN ARRAY ARRAY[
    'hr_approval_requests','financial_approval_requests',
    'procurement_approval_requests','contract_approval_requests'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_notify_approval_created ON public.%I', v_tbl);
  END LOOP;

  RAISE NOTICE '0322: رُبِط جدولا الخطوات بنظام الإشعارات';
END $$;

-- ═══ 6) حرّاس التحقق ════════════════════════════════════════════════════
DO $$
DECLARE
  v_cnt   INT;
  v_t     UUID := gen_random_uuid();
  v_d     UUID := gen_random_uuid();
  v_mgr   UUID := gen_random_uuid();
  v_emp   UUID := gen_random_uuid();
  v_eid   UUID;
  v_lv    UUID := gen_random_uuid();
  v_tbl   TEXT;
BEGIN
  -- الأعمدة أُضيفت
  FOREACH v_tbl IN ARRAY ARRAY[
    'structure_departments','structure_positions','structure_ranks','structure_roles'
  ] LOOP
    ASSERT EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=v_tbl AND column_name='tenant_id'),
      format('0322 failed: %s.tenant_id missing', v_tbl);

    -- ★ لا سياسة مكشوفة باقية
    ASSERT NOT EXISTS (
      SELECT 1 FROM pg_policies
       WHERE schemaname='public' AND tablename=v_tbl
         AND cmd='SELECT' AND qual='true'
    ), format('0322 failed: %s still world-readable', v_tbl);
  END LOOP;

  -- الدوال
  SELECT count(*) INTO v_cnt FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public'
     AND p.proname IN ('notify_user','notify_approval_pending','notify_approval_decided');
  ASSERT v_cnt = 3, format('0322 failed: notify functions = %s', v_cnt);

  -- المحفّزات الأربعة
  SELECT count(*) INTO v_cnt FROM pg_trigger
   WHERE tgname = 'trg_notify_approval_step' AND NOT tgisinternal;
  ASSERT v_cnt = 2, format('0322 failed: step triggers = %s (expected 2)', v_cnt);

  -- ═══ اختبار سلوكي: الفجوة الأصلية ═══════════════════════════════════
  INSERT INTO public.tenants(id,name,name_ar,slug)
    VALUES (v_t,'G322','حارس','g322-'||substr(v_t::text,1,8));
  INSERT INTO public.departments(id,tenant_id,name_ar) VALUES (v_d,v_t,'العمليات');
  INSERT INTO auth.users(id,email) VALUES
    (v_mgr,'m322-'||substr(v_mgr::text,1,8)||'@t.io'),
    (v_emp,'e322-'||substr(v_emp::text,1,8)||'@t.io');
  INSERT INTO public.profiles(id,tenant_id,full_name,role)
    VALUES (v_mgr,v_t,'المدير','manager');
  INSERT INTO public.profiles(id,tenant_id,full_name,role,department)
    VALUES (v_emp,v_t,'الموظف','employee','العمليات');
  UPDATE public.departments SET manager_id = v_mgr WHERE id = v_d;

  SELECT e.id INTO v_eid FROM public.employees e WHERE e.user_id = v_emp;

  PERFORM set_config('request.jwt.claim.sub', v_emp::TEXT, TRUE);
  INSERT INTO public.leaves(id,tenant_id,employee_id,leave_type,date_from,date_to,status)
    VALUES (v_lv,v_t,v_eid,'annual','2026-09-01','2026-09-03','pending');
  PERFORM public.create_hr_approval('leave', v_lv, v_eid);

  -- ★ الاختبار الحاسم: المدير أُشعِر
  SELECT count(*) INTO v_cnt FROM public.notifications
   WHERE tenant_id = v_t AND user_id = v_mgr AND type = 'approval_pending';
  ASSERT v_cnt >= 1,
    format('0322 failed: ★ manager got %s notifications (the original gap)', v_cnt);

  -- ولا يُشعَر مُقدّم الطلب بفعله هو
  SELECT count(*) INTO v_cnt FROM public.notifications
   WHERE tenant_id = v_t AND user_id = v_emp;
  ASSERT v_cnt = 0, format('0322 failed: requester self-notified (%s)', v_cnt);

  -- تنظيف
  PERFORM set_config('request.jwt.claim.sub','',TRUE);
  DELETE FROM public.notifications          WHERE tenant_id = v_t;
  DELETE FROM public.hr_approval_steps      WHERE tenant_id = v_t;
  DELETE FROM public.hr_approval_requests   WHERE tenant_id = v_t;
  DELETE FROM public.leaves                 WHERE tenant_id = v_t;
  DELETE FROM public.employees              WHERE tenant_id = v_t;
  DELETE FROM public.profiles   WHERE id IN (v_mgr,v_emp);
  DELETE FROM auth.users        WHERE id IN (v_mgr,v_emp);
  DELETE FROM public.departments WHERE id = v_d;
  DELETE FROM public.tenants     WHERE id = v_t;

  ASSERT NOT has_function_privilege('anon',
    'public.notify_user(uuid,uuid,text,text,text,text,text,uuid)','EXECUTE'),
    '0322 failed: anon can create notifications';

  RAISE NOTICE '✅ 0322: الهيكل معزول · والموافقات تُشعر المعتمِدين تلقائياً';
END $$;
