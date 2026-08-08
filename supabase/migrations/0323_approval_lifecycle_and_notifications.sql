-- ============================================================================
-- 0323_approval_lifecycle_and_notifications.sql
--
-- دورة حياة الاعتماد الكاملة + إيصال الإشعارات لكل البوابات.
--
-- ══ الأعطال المُثبَتة تشغيلياً في هذه الجولة (مسبار probe1/2/3) ══════════
--
--  ① `unified_approvals` هو **VIEW** يُصفّي `status='pending'` في فروعه
--     التسعة كلها. `notify_approval_decided` تقرأ منه **بعد** أن يكون
--     `unified_approval_decide` قد غيّر الحالة ⇒ الصف اختفى ⇒ RETURN 0.
--     مقاس: «notify_approval_decided => 0» بينما اختبار 0322/5.1 ادّعى 1
--     لأنه استدعى الدالة والطلب ما زال pending — تأكيد ميت.
--
--  ② لا شيء في المشروع كله يستدعي `notify_approval_pending`
--     ولا `notify_approval_decided`. grep على supabase/migrations + src
--     أعاد صفر مُستدعٍ. دالتان جاهزتان ميتتان.
--
--  ③ المحفّز `trg_notify_approval_step` هو `AFTER INSERT` فقط. عند اعتماد
--     الخطوة 1 تُفعَّل الخطوة 2 بـ`UPDATE ... SET status='active'` — ولا
--     محفّز على UPDATE ⇒ المعتمِد الثاني لا يعلم أبداً أن دوره حلّ.
--     مقاس: «إشعارات المدير (صاحب الخطوة النشطة الآن) = 0».
--
--  ④ المحفّز على INSERT يُشعر **كل** الخطوات المُدرَجة بما فيها `pending`
--     (شرطه `IN ('active','pending')`) ⇒ المعتمِد الثالث يُستدعى فوراً
--     رغم أن دوره لم يحن. مقاس: أُشعِر «مدير» و«مشرف» معاً عند الإنشاء.
--     ضجيج يُدرَّب المستخدم على تجاهله.
--
--  ⑤ مُقدّم الطلب لا يُشعَر بالقرار النهائي إطلاقاً.
--     مقاس: «إشعارات الموظف بالاعتماد النهائي = 0».
--
--  ⑥ ★ `leaves.status` يبقى `'انتظار'` بعد اعتماد السلسلة كاملةً.
--     لا دالة واحدة في القاعدة تُحدّث `leaves` أو `permissions_request`.
--     الموظف يرى «قيد المراجعة» إلى الأبد بعد اعتماد مديره.
--
--  ⑦ `my_approval_inbox` تقرأ `unified_approval_steps` فقط، بينما HR يبني
--     في `hr_approval_steps` (وكذلك procurement/contracts/finance).
--     مقاس: «my_approval_inbox للمشرف = 0 صف» وهو أول معتمِد نشط.
--
--  ⑧ `unified_approval_decide` ترفض المعتمِد الشرعي: لا خطوات في
--     `unified_approval_steps` ⇒ تسقط للمسار القديم ⇒ تطلب
--     `has_portal_unit('manager','hr')`. مقاس: `NOT_ASSIGNED_TO_UNIT`.
--
--  ⑨ تعارض مفردات الحالة: القاعدة تُخزّن `'انتظار'/'موافق'/'مرفوض'`،
--     و`HrApprovalInbox.tsx:69` يكتب `'موافق عليه'` — سلسلة لا تقرؤها
--     أي شاشة موظف (تقارن بـ`'موافق'`). التطبيع هنا يجعل القاعدة
--     المرجع الوحيد ويُلغي الحاجة لتلك الكتابة من الواجهة.
--
-- ══ المبدأ ══════════════════════════════════════════════════════════════
--   الجداول الأصلية (leaves/permissions_request) تُحدَّث في **القاعدة**
--   عبر محفّز على الخطوات، لا من الواجهة. الواجهة قد تفشل أو تُغلَق
--   منتصف العملية؛ المحفّز لا يفشل.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- ① دالة مساعدة: قراءة بيانات الطلب **بصرف النظر عن حالته**
--
--    العرض `unified_approvals` يُصفّي pending، فلا يصلح لإشعار القرار.
--    نقرأ الجداول الأساسية مباشرة. VOLATILE لا STABLE: تُستدعى من سياقات
--    كتابة، وتقييدها بـSTABLE سبق أن ابتلع أخطاءً صامتة (درس 0320).
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.approval_source_info(TEXT, UUID);

CREATE FUNCTION public.approval_source_info(
  p_source_module TEXT,
  p_source_id     UUID
) RETURNS TABLE(
  out_tenant_id    UUID,
  out_requester_id UUID,
  out_title        TEXT,
  out_unit_key     TEXT,
  out_status       TEXT,
  out_related_id   UUID
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_source_id IS NULL THEN RETURN; END IF;

  IF p_source_module = 'hr' THEN
    RETURN QUERY
      SELECT r.tenant_id,
             public.resolve_person_user_id(r.employee_id),
             CASE r.request_type WHEN 'leave' THEN 'طلب إجازة' ELSE 'طلب إذن' END,
             'hr'::TEXT, r.status, r.related_id
        FROM public.hr_approval_requests r WHERE r.id = p_source_id;

  ELSIF p_source_module = 'procurement' THEN
    RETURN QUERY
      SELECT r.tenant_id, r.requester_id, 'طلب شراء'::TEXT,
             'procurement'::TEXT, r.status, r.related_id
        FROM public.procurement_approval_requests r WHERE r.id = p_source_id;

  ELSIF p_source_module = 'finance' THEN
    RETURN QUERY
      SELECT r.tenant_id, r.requested_by,
             CASE r.request_type
               WHEN 'journal_entry' THEN 'قيد محاسبي'
               WHEN 'invoice'       THEN 'فاتورة'
               WHEN 'expense'       THEN 'مصروف'
               WHEN 'budget'        THEN 'موازنة'
               ELSE 'إقرار ضريبي' END::TEXT,
             'finance'::TEXT, r.status::TEXT, r.reference_id
        FROM public.financial_approval_requests r WHERE r.id = p_source_id;

  ELSIF p_source_module = 'contracts' THEN
    RETURN QUERY
      SELECT r.tenant_id, r.requested_by, 'اعتماد عقد'::TEXT,
             'contracts'::TEXT, r.status, r.contract_id
        FROM public.contract_approval_requests r WHERE r.id = p_source_id;

  ELSIF p_source_module = 'movement' THEN
    RETURN QUERY
      SELECT a.tenant_id,
             public.resolve_person_user_id(
               (SELECT p.employee_id FROM public.employee_movement_permits p
                 WHERE p.id = a.permit_id)),
             'تصريح خروج'::TEXT, 'movement'::TEXT, a.decision, a.permit_id
        FROM public.employee_movement_approvals a WHERE a.id = p_source_id;

  ELSIF p_source_module = 'inventory' THEN
    RETURN QUERY
      SELECT a.tenant_id, a.approver_id, 'اعتماد تسوية مخزون'::TEXT,
             'inventory'::TEXT, a.decision, a.variance_id
        FROM public.inventory_adjustment_approvals a WHERE a.id = p_source_id;

  ELSIF p_source_module = 'mrp' THEN
    RETURN QUERY
      SELECT a.tenant_id, a.approver_id, 'اعتماد قائمة مواد'::TEXT,
             'mrp'::TEXT, a.decision, a.bom_version_id
        FROM public.mrp_bom_approvals a WHERE a.id = p_source_id;

  ELSIF p_source_module = 'crm' THEN
    RETURN QUERY
      SELECT a.tenant_id, a.requested_by, 'اعتماد خصم'::TEXT,
             'crm'::TEXT, a.status, a.quote_id
        FROM public.crm_discount_approvals a WHERE a.id = p_source_id;

  ELSIF p_source_module = 'general' THEN
    RETURN QUERY
      SELECT r.tenant_id, public.resolve_person_user_id(r.requester_id),
             r.title::TEXT, 'hr'::TEXT, r.status::TEXT, r.related_id
        FROM public.approval_requests r WHERE r.id = p_source_id;
  END IF;
END $$;

COMMENT ON FUNCTION public.approval_source_info(TEXT, UUID) IS
  'بيانات الطلب من جدوله الأصلي بصرف النظر عن حالته. '
  'العرض unified_approvals يُصفّي pending فلا يصلح بعد القرار (عطل 0323/①).';

REVOKE ALL ON FUNCTION public.approval_source_info(TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.approval_source_info(TEXT, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.approval_source_info(TEXT, UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ② notify_approval_decided — تقرأ من المصدر لا من العرض
--
--    السياسات لا تعتمد عليها، لكن نُسقطها صراحةً: CREATE OR REPLACE لا
--    يُغيّر نوع الإرجاع (مزلق موثَّق في 0320).
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.notify_approval_decided(TEXT, UUID, TEXT, TEXT);

CREATE FUNCTION public.notify_approval_decided(
  p_source_module TEXT,
  p_source_id     UUID,
  p_decision      TEXT,
  p_comments      TEXT DEFAULT NULL
) RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_src RECORD;
BEGIN
  IF p_source_id IS NULL THEN RETURN 0; END IF;

  SELECT * INTO v_src
    FROM public.approval_source_info(p_source_module, p_source_id);

  IF v_src.out_tenant_id IS NULL OR v_src.out_requester_id IS NULL THEN
    RETURN 0;
  END IF;

  IF public.notify_user(
       v_src.out_tenant_id,
       v_src.out_requester_id,
       CASE WHEN p_decision = 'approved' THEN 'approval_granted'
            ELSE 'approval_rejected' END,
       CASE WHEN p_decision = 'approved' THEN 'اعتُمد طلبك'
            ELSE 'رُفض طلبك' END,
       COALESCE(v_src.out_title, 'طلبك') ||
       CASE WHEN p_comments IS NOT NULL AND btrim(p_comments) <> ''
            THEN ' — ' || p_comments ELSE '' END,
       '/app/employee/requests',
       'unified_approvals', p_source_id) IS NOT NULL
  THEN RETURN 1;
  END IF;

  RETURN 0;
END $$;

COMMENT ON FUNCTION public.notify_approval_decided(TEXT,UUID,TEXT,TEXT) IS
  'يُشعر مُقدّم الطلب بالقرار. يقرأ من approval_source_info لأن العرض '
  'unified_approvals يُخفي الطلب فور تغيّر حالته.';

REVOKE ALL ON FUNCTION public.notify_approval_decided(TEXT,UUID,TEXT,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_approval_decided(TEXT,UUID,TEXT,TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.notify_approval_decided(TEXT,UUID,TEXT,TEXT)
  TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ③ مزامنة الجدول الأصلي — عطل ⑥
--
--    مفردات الحالة العربية هي المُخزَّنة فعلياً في leaves/permissions_request
--    (الافتراضي `'انتظار'`) وهي ما تقرؤه شاشات الموظف. نُبقيها ونكتبها
--    من القاعدة بدل الواجهة.
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.sync_hr_source_status(UUID, TEXT);

CREATE FUNCTION public.sync_hr_source_status(
  p_request_id UUID,
  p_final      TEXT
) RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type    TEXT;
  v_related UUID;
  v_tenant  UUID;
  v_label   TEXT;
  v_n       INTEGER := 0;
BEGIN
  IF p_request_id IS NULL OR p_final NOT IN ('approved','rejected') THEN
    RETURN 0;
  END IF;

  SELECT r.request_type, r.related_id, r.tenant_id
    INTO v_type, v_related, v_tenant
    FROM public.hr_approval_requests r
   WHERE r.id = p_request_id;

  IF v_related IS NULL THEN RETURN 0; END IF;

  v_label := CASE WHEN p_final = 'approved' THEN 'موافق' ELSE 'مرفوض' END;

  IF v_type = 'leave' THEN
    UPDATE public.leaves
       SET status = v_label
     WHERE id = v_related AND tenant_id = v_tenant;
    GET DIAGNOSTICS v_n = ROW_COUNT;

  ELSIF v_type = 'permission' THEN
    UPDATE public.permissions_request
       SET status = v_label
     WHERE id = v_related AND tenant_id = v_tenant;
    GET DIAGNOSTICS v_n = ROW_COUNT;
  END IF;

  RETURN v_n;
END $$;

COMMENT ON FUNCTION public.sync_hr_source_status(UUID, TEXT) IS
  'يكتب نتيجة السلسلة في leaves/permissions_request. قبل 0323 لم تكن أي '
  'دالة تفعل ذلك: الإجازة تبقى «انتظار» بعد اعتمادها (عطل 0323/⑥).';

REVOKE ALL ON FUNCTION public.sync_hr_source_status(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_hr_source_status(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.sync_hr_source_status(UUID, TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ④ المحفّز الموحّد على الخطوات — يعالج ③ و④ و⑤ و⑥
--
--    INSERT: يُشعر صاحب الخطوة النشطة **وحده** (لا pending — عطل ④).
--    UPDATE: عند صيرورة خطوة `active` يُشعر صاحبها (عطل ③).
--            وعند بلوغ السلسلة نهايتها يُشعر مُقدّم الطلب ويُزامن
--            الجدول الأصلي (عطلا ⑤ و⑥).
-- ─────────────────────────────────────────────────────────────────────────
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
  v_src     RECORD;
  v_open    INT;
  v_reject  INT;
  v_final   TEXT;
BEGIN
  -- ــ توحيد شكل الصف عبر جداول الخطوات المختلفة ــــــــــــــــــــــ
  IF TG_TABLE_NAME = 'unified_approval_steps' THEN
    v_module := NEW.source_module::TEXT; v_request := NEW.source_id;
    v_tenant := NEW.tenant_id;
  ELSIF TG_TABLE_NAME = 'hr_approval_steps' THEN
    v_module := 'hr';          v_request := NEW.request_id; v_tenant := NEW.tenant_id;
  ELSIF TG_TABLE_NAME = 'procurement_approval_steps' THEN
    v_module := 'procurement'; v_request := NEW.request_id; v_tenant := NEW.tenant_id;
  ELSIF TG_TABLE_NAME = 'contract_approval_steps' THEN
    v_module := 'contracts';   v_request := NEW.request_id; v_tenant := NEW.tenant_id;
  ELSE
    RETURN NEW;
  END IF;

  SELECT * INTO v_src FROM public.approval_source_info(v_module, v_request);
  IF v_tenant IS NULL THEN v_tenant := v_src.out_tenant_id; END IF;

  -- ══ (أ) الخطوة صارت نشطة ⇒ أَشعِر صاحبها وحده ═══════════════════════
  --    ★ `pending` لا يُشعَر: دوره لم يحن بعد. إشعاره ضجيج يُدرَّب
  --      المستخدم على تجاهله (عطل ④).
  IF NEW.approver_id IS NOT NULL
     AND COALESCE(NEW.status::TEXT,'') = 'active'
     AND (TG_OP = 'INSERT'
          OR COALESCE(OLD.status::TEXT,'') IS DISTINCT FROM 'active')
  THEN
    PERFORM public.notify_user(
      v_tenant, NEW.approver_id, 'approval_pending',
      'طلب بانتظار اعتمادك',
      COALESCE(v_src.out_title, 'طلب جديد') || ' — يحتاج قرارك',
      '/app/manager/approvals',
      TG_TABLE_NAME, v_request);
  END IF;

  -- ══ (ب) هل اكتملت السلسلة؟ ═══════════════════════════════════════════
  --    يُقاس على UPDATE فقط: على INSERT السلسلة قيد البناء (درس السباق
  --    الزمني من 0322 — المحفّز يعمل قبل اكتمال بقية الخطوات).
  IF TG_OP = 'UPDATE'
     AND COALESCE(NEW.status::TEXT,'') IN ('approved','rejected')
     AND COALESCE(OLD.status::TEXT,'') IS DISTINCT FROM COALESCE(NEW.status::TEXT,'')
  THEN
    IF TG_TABLE_NAME = 'unified_approval_steps' THEN
      SELECT count(*) FILTER (WHERE s.status::TEXT IN ('pending','active')),
             count(*) FILTER (WHERE s.status::TEXT = 'rejected')
        INTO v_open, v_reject
        FROM public.unified_approval_steps s
       WHERE s.source_module = NEW.source_module AND s.source_id = NEW.source_id;
    ELSIF TG_TABLE_NAME = 'hr_approval_steps' THEN
      SELECT count(*) FILTER (WHERE s.status IN ('pending','active')),
             count(*) FILTER (WHERE s.status = 'rejected')
        INTO v_open, v_reject
        FROM public.hr_approval_steps s WHERE s.request_id = NEW.request_id;
    ELSIF TG_TABLE_NAME = 'procurement_approval_steps' THEN
      SELECT count(*) FILTER (WHERE s.status IN ('pending','active')),
             count(*) FILTER (WHERE s.status = 'rejected')
        INTO v_open, v_reject
        FROM public.procurement_approval_steps s WHERE s.request_id = NEW.request_id;
    ELSE
      SELECT count(*) FILTER (WHERE s.status IN ('pending','active')),
             count(*) FILTER (WHERE s.status = 'rejected')
        INTO v_open, v_reject
        FROM public.contract_approval_steps s WHERE s.request_id = NEW.request_id;
    END IF;

    -- رفض واحد يُنهي السلسلة فوراً؛ وإلا ننتظر إغلاق كل الخطوات
    IF v_reject > 0 OR v_open = 0 THEN
      v_final := CASE WHEN v_reject > 0 THEN 'rejected' ELSE 'approved' END;

      PERFORM public.notify_approval_decided(
        v_module, v_request, v_final, NEW.comments);

      IF v_module = 'hr' THEN
        PERFORM public.sync_hr_source_status(v_request, v_final);
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END $$;

COMMENT ON FUNCTION public.tg_notify_approval_step() IS
  'محفّز موحّد على جداول الخطوات الأربعة. INSERT/UPDATE: يُشعر صاحب '
  'الخطوة النشطة وحده؛ وعند اكتمال السلسلة يُشعر مُقدّم الطلب ويُزامن '
  'الجدول الأصلي. UPDATE كان مفقوداً تماماً قبل 0323 (عطل ③).';

-- المحفّزات: INSERT + UPDATE على جداول الخطوات الأربعة
DROP TRIGGER IF EXISTS trg_notify_approval_step ON public.unified_approval_steps;
CREATE TRIGGER trg_notify_approval_step
  AFTER INSERT OR UPDATE OF status ON public.unified_approval_steps
  FOR EACH ROW EXECUTE FUNCTION public.tg_notify_approval_step();

DROP TRIGGER IF EXISTS trg_notify_approval_step ON public.hr_approval_steps;
CREATE TRIGGER trg_notify_approval_step
  AFTER INSERT OR UPDATE OF status ON public.hr_approval_steps
  FOR EACH ROW EXECUTE FUNCTION public.tg_notify_approval_step();

DROP TRIGGER IF EXISTS trg_notify_approval_step ON public.procurement_approval_steps;
CREATE TRIGGER trg_notify_approval_step
  AFTER INSERT OR UPDATE OF status ON public.procurement_approval_steps
  FOR EACH ROW EXECUTE FUNCTION public.tg_notify_approval_step();

DROP TRIGGER IF EXISTS trg_notify_approval_step ON public.contract_approval_steps;
CREATE TRIGGER trg_notify_approval_step
  AFTER INSERT OR UPDATE OF status ON public.contract_approval_steps
  FOR EACH ROW EXECUTE FUNCTION public.tg_notify_approval_step();

-- ─────────────────────────────────────────────────────────────────────────
-- ⑤ my_approval_inbox — تقرأ جداول الخطوات كلها (عطل ⑦)
--
--    قبل: تقرأ unified_approval_steps وحده ⇒ المشرف صاحب الخطوة النشطة
--         في hr_approval_steps يرى صندوقاً فارغاً.
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.my_approval_inbox(TEXT);

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
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant   UUID := public.current_user_tenant_id();
  v_platform BOOLEAN;
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN RETURN; END IF;

  v_platform := public.current_user_role() IN ('admin','developer','it_admin');

  RETURN QUERY
  WITH all_steps AS (
    -- المحرك الموحّد (0309)
    SELECT s.source_module::TEXT AS source_module, s.source_id,
           s.status::TEXT AS status, s.step_order, s.approver_id
      FROM public.unified_approval_steps s WHERE s.tenant_id = v_tenant
    UNION ALL
    -- ★ سلاسل البوابات الخاصة — كانت غائبة كلياً عن الصندوق
    SELECT 'hr', s.request_id, s.status, s.step_order, s.approver_id
      FROM public.hr_approval_steps s WHERE s.tenant_id = v_tenant
    UNION ALL
    SELECT 'procurement', s.request_id, s.status, s.step_order, s.approver_id
      FROM public.procurement_approval_steps s WHERE s.tenant_id = v_tenant
    UNION ALL
    SELECT 'contracts', s.request_id, s.status, s.step_order, s.approver_id
      FROM public.contract_approval_steps s WHERE s.tenant_id = v_tenant
  ),
  step_info AS (
    SELECT a.source_module, a.source_id,
           count(*)::INTEGER AS total_steps,
           max(CASE WHEN a.status = 'active' THEN a.step_order END)::INTEGER AS active_order,
           max(CASE WHEN a.status = 'active' THEN a.approver_id::TEXT END) AS active_approver
      FROM all_steps a
     GROUP BY a.source_module, a.source_id
  )
  SELECT u.source_module, u.source_id, u.request_type, u.title,
         u.requester_id,
         COALESCE(pr.full_name, pr.email, '—')::TEXT,
         u.amount, u.unit_key, u.created_at,
         COALESCE(si.active_order, 1), COALESCE(si.total_steps, 1)
    FROM public.unified_approvals u
    LEFT JOIN public.profiles pr ON pr.id = u.requester_id
    LEFT JOIN step_info si
      ON si.source_module = u.source_module AND si.source_id = u.source_id
   WHERE u.tenant_id = v_tenant
     AND (p_unit_key IS NULL OR u.unit_key = p_unit_key)
     AND (
       v_platform
       OR (si.source_id IS NOT NULL AND si.active_approver = auth.uid()::TEXT)
       OR (
         si.source_id IS NULL
         AND public.has_portal_unit('manager', u.unit_key)
         AND (u.requester_id IS NULL OR public.is_in_my_team(u.requester_id))
       )
     )
   ORDER BY u.created_at ASC;
END $$;

COMMENT ON FUNCTION public.my_approval_inbox(TEXT) IS
  'صندوق المعتمِد عبر جداول الخطوات الأربعة. قبل 0323 كان يقرأ '
  'unified_approval_steps وحده فيرى معتمِدو HR صندوقاً فارغاً (عطل ⑦).';

REVOKE ALL ON FUNCTION public.my_approval_inbox(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.my_approval_inbox(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.my_approval_inbox(TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ⑥ unified_approval_decide — تعترف بسلاسل البوابات الخاصة (عطل ⑧)
--
--    قبل: تعدّ خطوات unified_approval_steps فقط. HR يبني في جدوله
--    ⇒ العدّ صفر ⇒ المسار القديم ⇒ has_portal_unit ⇒ رفض المعتمِد الشرعي.
--    مقاس حرفياً: `NOT_ASSIGNED_TO_UNIT (manager/hr)`.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.unified_approval_decide(
  p_source_module TEXT,
  p_source_id     UUID,
  p_decision      TEXT,
  p_comments      TEXT DEFAULT NULL
) RETURNS TEXT
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
  v_native    TEXT;   -- جدول الخطوات الخاص بالبوابة إن وُجد
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

  -- ★ جدول الخطوات الأصلي لهذه البوابة
  v_native := CASE p_source_module
                WHEN 'hr'          THEN 'hr_approval_steps'
                WHEN 'procurement' THEN 'procurement_approval_steps'
                WHEN 'contracts'   THEN 'contract_approval_steps'
                ELSE NULL END;

  -- ══ سلسلة البوابة الخاصة لها الأولوية: هي المبنيّة فعلياً ═══════════
  IF v_native = 'hr_approval_steps' THEN
    SELECT count(*) INTO v_steps FROM public.hr_approval_steps
     WHERE request_id = p_source_id AND tenant_id = v_tenant;
    IF v_steps > 0 THEN
      -- التفويض للدالة الأصلية: هي مرجع منطق HR والمحفّز يتولّى الباقي
      RETURN public.decide_hr_approval_step(p_source_id, p_decision, p_comments);
    END IF;
  ELSIF v_native = 'procurement_approval_steps' THEN
    SELECT count(*) INTO v_steps FROM public.procurement_approval_steps
     WHERE request_id = p_source_id AND tenant_id = v_tenant;
    IF v_steps > 0 THEN
      RETURN public.approve_procurement_step(p_source_id, p_decision, p_comments);
    END IF;
  END IF;

  -- ══ المحرك الموحّد ═══════════════════════════════════════════════════
  SELECT count(*) INTO v_steps
    FROM public.unified_approval_steps s
   WHERE s.tenant_id = v_tenant
     AND s.source_module = p_source_module
     AND s.source_id = p_source_id;

  IF v_steps > 0 THEN
    SELECT * INTO v_active
      FROM public.unified_approval_steps s
     WHERE s.tenant_id = v_tenant
       AND s.source_module = p_source_module
       AND s.source_id = p_source_id
       AND s.status = 'active'
     ORDER BY s.step_order LIMIT 1;

    IF NOT FOUND THEN RAISE EXCEPTION 'NO_ACTIVE_STEP'; END IF;

    IF NOT v_platform AND v_active.approver_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'NOT_YOUR_STEP (step %, assigned to another approver)',
        v_active.step_order;
    END IF;

    UPDATE public.unified_approval_steps
       SET status = p_decision,
           comments = COALESCE(NULLIF(btrim(p_comments),''), comments),
           decided_by = auth.uid(), decided_at = NOW()
     WHERE id = v_active.id;

    IF p_decision = 'rejected' THEN
      UPDATE public.unified_approval_steps SET status = 'skipped'
       WHERE tenant_id = v_tenant AND source_module = p_source_module
         AND source_id = p_source_id AND status = 'pending';
      v_final := 'rejected';
    ELSE
      SELECT * INTO v_next
        FROM public.unified_approval_steps s
       WHERE s.tenant_id = v_tenant AND s.source_module = p_source_module
         AND s.source_id = p_source_id AND s.step_order > v_active.step_order
         AND s.status = 'pending'
       ORDER BY s.step_order LIMIT 1;

      IF FOUND THEN
        -- المحفّز على UPDATE يُشعر صاحب الخطوة التالية
        UPDATE public.unified_approval_steps SET status = 'active' WHERE id = v_next.id;
        RETURN 'pending';
      END IF;

      v_final := 'approved';
    END IF;
  ELSE
    -- ══ المسار القديم: خطوة واحدة ═════════════════════════════════════
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
      PERFORM public.sync_hr_source_status(p_source_id, v_final);

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
         SET decision = v_final, decided_at = NOW(), approver_id = auth.uid(),
             comments = COALESCE(NULLIF(btrim(p_comments),''), comments)
       WHERE id = p_source_id AND tenant_id = v_tenant;
      UPDATE public.employee_movement_permits p
         SET status = v_final, approved_by = auth.uid(), updated_at = NOW()
        FROM public.employee_movement_approvals a
       WHERE a.id = p_source_id AND p.id = a.permit_id AND p.tenant_id = v_tenant;

    WHEN 'inventory' THEN
      UPDATE public.inventory_adjustment_approvals
         SET decision = v_final, decided_at = NOW(), approver_id = auth.uid(),
             comments = COALESCE(NULLIF(btrim(p_comments),''), comments)
       WHERE id = p_source_id AND tenant_id = v_tenant;

    WHEN 'mrp' THEN
      UPDATE public.mrp_bom_approvals
         SET decision = v_final, decided_at = NOW(), approver_id = auth.uid(),
             comments = COALESCE(NULLIF(btrim(p_comments),''), comments)
       WHERE id = p_source_id AND tenant_id = v_tenant;

    WHEN 'crm' THEN
      UPDATE public.crm_discount_approvals
         SET status = v_final, decided_at = NOW(), decided_by = auth.uid(),
             decision_note = COALESCE(NULLIF(btrim(p_comments),''), decision_note)
       WHERE id = p_source_id AND tenant_id = v_tenant;

    WHEN 'general' THEN
      UPDATE public.approval_requests
         SET status = v_final, decided_at = NOW(), decided_by = auth.uid(),
             decision_note = COALESCE(NULLIF(btrim(p_comments),''), decision_note),
             updated_at = NOW()
       WHERE id = p_source_id AND tenant_id = v_tenant;

    ELSE
      RAISE EXCEPTION 'UNKNOWN_SOURCE_MODULE (%)', p_source_module;
  END CASE;

  -- ★ إشعار مُقدّم الطلب — لم يكن يحدث أبداً (عطل ②)
  --   المسار الموحّد لا يمرّ بمحفّز جداول البوابات، فنستدعيها هنا.
  PERFORM public.notify_approval_decided(
    p_source_module, p_source_id, v_final, p_comments);

  RETURN v_final;
END $$;

COMMENT ON FUNCTION public.unified_approval_decide(TEXT,UUID,TEXT,TEXT) IS
  'قرار موحّد. 0323: يُفوّض لسلسلة البوابة الخاصة إن وُجدت (كان يرفض '
  'المعتمِد الشرعي بـNOT_ASSIGNED_TO_UNIT)، ويُشعر مُقدّم الطلب بالنتيجة.';

-- ─────────────────────────────────────────────────────────────────────────
-- ⑦ notify_approval_pending — تُشعر صاحب الخطوة النشطة عبر البوابات كلها
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.notify_approval_pending(TEXT, UUID);

CREATE FUNCTION public.notify_approval_pending(
  p_source_module TEXT,
  p_source_id     UUID
) RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_src  RECORD;
  v_n    INT := 0;
  v_row  RECORD;
BEGIN
  IF p_source_id IS NULL THEN RETURN 0; END IF;

  SELECT * INTO v_src FROM public.approval_source_info(p_source_module, p_source_id);
  IF v_src.out_tenant_id IS NULL THEN RETURN 0; END IF;

  -- (أ) صاحب الخطوة النشطة في أي من جداول الخطوات الأربعة
  FOR v_row IN
    SELECT DISTINCT s.approver_id FROM public.unified_approval_steps s
     WHERE s.tenant_id = v_src.out_tenant_id
       AND s.source_module = p_source_module AND s.source_id = p_source_id
       AND s.status = 'active' AND s.approver_id IS NOT NULL
    UNION
    SELECT DISTINCT s.approver_id FROM public.hr_approval_steps s
     WHERE p_source_module = 'hr' AND s.tenant_id = v_src.out_tenant_id
       AND s.request_id = p_source_id AND s.status = 'active'
       AND s.approver_id IS NOT NULL
    UNION
    SELECT DISTINCT s.approver_id FROM public.procurement_approval_steps s
     WHERE p_source_module = 'procurement' AND s.tenant_id = v_src.out_tenant_id
       AND s.request_id = p_source_id AND s.status = 'active'
       AND s.approver_id IS NOT NULL
    UNION
    SELECT DISTINCT s.approver_id FROM public.contract_approval_steps s
     WHERE p_source_module = 'contracts' AND s.tenant_id = v_src.out_tenant_id
       AND s.request_id = p_source_id AND s.status = 'active'
       AND s.approver_id IS NOT NULL
  LOOP
    IF public.notify_user(
         v_src.out_tenant_id, v_row.approver_id, 'approval_pending',
         'طلب بانتظار اعتمادك',
         COALESCE(v_src.out_title,'طلب') || ' — يحتاج قرارك',
         '/app/manager/approvals', 'approval_steps', p_source_id) IS NOT NULL
    THEN v_n := v_n + 1;
    END IF;
  END LOOP;

  -- (ب) لا خطوات؟ مديرو الوحدة (معمارية 0302)
  IF v_n = 0 AND v_src.out_unit_key IS NOT NULL THEN
    FOR v_row IN
      SELECT DISTINCT u.user_id FROM public.portal_unit_assignments u
       WHERE u.tenant_id = v_src.out_tenant_id AND u.is_active
         AND u.base_role = 'manager' AND u.unit_key = v_src.out_unit_key
    LOOP
      IF public.notify_user(
           v_src.out_tenant_id, v_row.user_id, 'approval_pending',
           'طلب جديد في وحدتك',
           COALESCE(v_src.out_title,'طلب') || ' — بانتظار المراجعة',
           '/app/manager/units/' || v_src.out_unit_key || '/approvals',
           'unified_approvals', p_source_id) IS NOT NULL
      THEN v_n := v_n + 1;
      END IF;
    END LOOP;
  END IF;

  RETURN v_n;
END $$;

COMMENT ON FUNCTION public.notify_approval_pending(TEXT, UUID) IS
  'يُشعر صاحب الخطوة النشطة عبر جداول الخطوات الأربعة، وإلا مديري الوحدة. '
  '0323: `pending` لم يعد يُشعَر — دوره لم يحن (عطل ④).';

REVOKE ALL ON FUNCTION public.notify_approval_pending(TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_approval_pending(TEXT, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.notify_approval_pending(TEXT, UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ⑧ ربط بوابات المخزون/التصنيع/CRM/العقود — البند ② من قائمة النواقص
--
--    هذه البوابات تُنشئ صف اعتماد واحداً بلا جدول خطوات. نُشعر عند
--    الإنشاء (محفّز INSERT) وعند القرار (محفّز UPDATE على الحالة).
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_notify_single_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_module  TEXT;
  v_status  TEXT;
  v_old     TEXT;
BEGIN
  v_module := CASE TG_TABLE_NAME
                WHEN 'inventory_adjustment_approvals' THEN 'inventory'
                WHEN 'mrp_bom_approvals'              THEN 'mrp'
                WHEN 'crm_discount_approvals'         THEN 'crm'
                WHEN 'contract_approval_requests'     THEN 'contracts'
                ELSE NULL END;
  IF v_module IS NULL THEN RETURN NEW; END IF;

  -- عمود الحالة يختلف بالاسم بين هذه الجداول
  IF TG_TABLE_NAME IN ('crm_discount_approvals','contract_approval_requests') THEN
    v_status := NEW.status;
    v_old    := CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END;
  ELSE
    v_status := NEW.decision;
    v_old    := CASE WHEN TG_OP = 'UPDATE' THEN OLD.decision ELSE NULL END;
  END IF;

  IF TG_OP = 'INSERT' AND v_status = 'pending' THEN
    PERFORM public.notify_approval_pending(v_module, NEW.id);

  ELSIF TG_OP = 'UPDATE'
        AND v_status IN ('approved','rejected')
        AND v_old IS DISTINCT FROM v_status THEN
    PERFORM public.notify_approval_decided(v_module, NEW.id, v_status, NULL);
  END IF;

  RETURN NEW;
END $$;

COMMENT ON FUNCTION public.tg_notify_single_approval() IS
  'إشعارات البوابات ذات صف الاعتماد الواحد (مخزون/تصنيع/CRM/عقود). '
  'كانت هذه البوابات بلا أي ربط بالإشعارات قبل 0323.';

DROP TRIGGER IF EXISTS trg_notify_single_approval ON public.inventory_adjustment_approvals;
CREATE TRIGGER trg_notify_single_approval
  AFTER INSERT OR UPDATE OF decision ON public.inventory_adjustment_approvals
  FOR EACH ROW EXECUTE FUNCTION public.tg_notify_single_approval();

DROP TRIGGER IF EXISTS trg_notify_single_approval ON public.mrp_bom_approvals;
CREATE TRIGGER trg_notify_single_approval
  AFTER INSERT OR UPDATE OF decision ON public.mrp_bom_approvals
  FOR EACH ROW EXECUTE FUNCTION public.tg_notify_single_approval();

DROP TRIGGER IF EXISTS trg_notify_single_approval ON public.crm_discount_approvals;
CREATE TRIGGER trg_notify_single_approval
  AFTER INSERT OR UPDATE OF status ON public.crm_discount_approvals
  FOR EACH ROW EXECUTE FUNCTION public.tg_notify_single_approval();

DROP TRIGGER IF EXISTS trg_notify_single_approval ON public.contract_approval_requests;
CREATE TRIGGER trg_notify_single_approval
  AFTER INSERT OR UPDATE OF status ON public.contract_approval_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_notify_single_approval();

-- ─────────────────────────────────────────────────────────────────────────
-- ⑨ عدّاد الإشعارات غير المقروءة — جرس الواجهة كان بلا مصدر
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.my_unread_notification_count();

CREATE FUNCTION public.my_unread_notification_count()
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::INTEGER FROM public.notifications n
   WHERE n.user_id = auth.uid()
     AND n.tenant_id = public.current_user_tenant_id()
     AND NOT COALESCE(n.is_read, FALSE)
     AND (n.expires_at IS NULL OR n.expires_at > NOW());
$$;

COMMENT ON FUNCTION public.my_unread_notification_count() IS
  'عدد إشعارات المستخدم غير المقروءة وغير المنتهية — مصدر عدّاد الجرس.';

REVOKE ALL ON FUNCTION public.my_unread_notification_count() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.my_unread_notification_count() FROM anon;
GRANT EXECUTE ON FUNCTION public.my_unread_notification_count() TO authenticated;

DO $$
BEGIN
  RAISE NOTICE '✅ 0323: دورة حياة الاعتماد + إشعارات 8 بوابات — 9 أعطال مُصلَحة';
END $$;
