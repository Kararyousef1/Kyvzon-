-- ============================================================================
-- 0324_request_status_guard_and_soft_delete.sql
--
-- حارس تجاوز سلسلة الاعتماد + الأرشفة بدل الحذف النهائي.
--
-- ══ الأعطال المُثبَتة تشغيلياً في هذه الجولة ═══════════════════════════
--
--  ① ★ تجاوز سلسلة الاعتماد بالكامل.
--     `LeaveRequestPage.tsx:117` يشتقّ صلاحية الاعتماد من **مسار URL**:
--        const canApprove = viewMode === 'hr' || 'supervisor' || 'manager';
--        const viewMode = location.pathname.startsWith('/app/manager/') ...
--     ثم `handleApprove` يكتب في `leaves` مباشرةً بلا مرور بالسلسلة.
--
--     مُقاس بجلسة RLS حقيقية (SET ROLE authenticated):
--        دور hr  ⇒ status = 'موافق' · خطوات السلسلة = 0   ★ اخترق
--        دور employee ⇒ status = 'انتظار'                   صُدّ
--        دور manager  ⇒ status = 'انتظار'                   صُدّ
--
--     السبب: `kyvzon_leaves_update` تسمح لـ`current_user_is_staff()`
--     وهي `role IN ('admin','hr','developer','it_admin')` — بلا أي شرط
--     على وجود سلسلة اعتماد نشطة أو انتماء للفريق.
--
--     الأثر: أي موظف موارد بشرية يعتمد إجازة أي موظف في الشركة، ويُسقط
--     مشرفه ومديره من القرار، ولا يترك أثراً في `hr_approval_steps`.
--
--  ② ★ حذف نهائي لدليل امتثال.
--     `AdminSOPsPage.tsx:263` — `confirm()` ثم `supabase.from('sops').delete()`
--     و`sop_readings_sop_id_fkey ON DELETE CASCADE`.
--
--     مُقاس:  قبل الحذف: سجلات قراءة الإجراء = 1
--             بعد الحذف: سجلات القراءة = 0   ← من قرأ الإجراء أُبيد
--             بعد الأرشفة: سجلات القراءة = 1 (محفوظة)
--
--     `sops.status` يقبل `'archived'` أصلاً — الأرشفة كانت متاحة ولم تُستعمل.
--
--  ③ حذف القسم يَعِد بما لا يفعل.
--     `OrgStructurePage.tsx:168` يقول «سيتم إزالة ارتباطه بالموظفين
--     والأقسام الفرعية» ثم يستدعي حذفاً نهائياً.
--     مُقاس: `departments_parent_department_id_fkey` يمنع الحذف أصلاً ⇒
--            «حدث خطأ أثناء الحذف» بلا سبب. ولو نجح لأباد
--            `approval_rules` و`org_role_assignments` (CASCADE).
--     `departments.is_active` موجود ولم يُستعمل للأرشفة.
--
-- ══ المبدأ ══════════════════════════════════════════════════════════════
--   من يملك سلسلة اعتماد لا يُتجاوَز من الواجهة. الحارس في القاعدة
--   لأن URL يمكن كتابته يدوياً، والصفحة يمكن تعديلها في المتصفح.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- ① حارس تجاوز السلسلة — محفّز على leaves و permissions_request
--
--    القاعدة: إن كان للطلب سلسلة اعتماد، فالحالة النهائية تُكتب من
--    السلسلة وحدها (عبر sync_hr_source_status من 0323). أي محاولة
--    لتغيير الحالة مباشرةً تُرفض.
--
--    الاستثناء الوحيد: `admin` — لتصحيح إداري موثَّق. و`hr` لم يعد
--    كافياً وحده لتجاوز سلسلة قائمة.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_guard_request_status_bypass()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_open   INT;
  v_role   TEXT;
  v_synced BOOLEAN;
BEGIN
  -- لا تغيير في الحالة ⇒ لا شأن للحارس
  IF COALESCE(NEW.status,'') IS NOT DISTINCT FROM COALESCE(OLD.status,'') THEN
    RETURN NEW;
  END IF;

  -- ★ الكتابة القادمة من محرّك الموافقات نفسه مسموحة.
  --   sync_hr_source_status (0323) تضبط هذا العلَم قبل الكتابة.
  v_synced := COALESCE(
    NULLIF(current_setting('kyvzon.approval_sync', TRUE), '')::BOOLEAN, FALSE);
  IF v_synced THEN RETURN NEW; END IF;

  -- هل للطلب سلسلة اعتماد بخطوات لم تُغلق بعد؟
  SELECT count(*) INTO v_open
    FROM public.hr_approval_steps s
    JOIN public.hr_approval_requests r ON r.id = s.request_id
   WHERE r.related_id = NEW.id
     AND r.tenant_id  = NEW.tenant_id
     AND s.status IN ('pending','active');

  IF v_open = 0 THEN
    -- لا سلسلة مفتوحة ⇒ المسار الإداري المباشر مسموح (سجلات قديمة)
    RETURN NEW;
  END IF;

  v_role := public.current_user_role();

  -- المسؤول وحده يتجاوز سلسلة قائمة، والأثر يُسجَّل
  IF v_role = 'admin' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'APPROVAL_CHAIN_BYPASS: للطلب سلسلة اعتماد مفتوحة (% خطوة). '
    'استعمل صندوق الموافقات — لا تُغيّر الحالة مباشرةً.', v_open
    USING ERRCODE = 'check_violation';
END $$;

COMMENT ON FUNCTION public.tg_guard_request_status_bypass() IS
  'يمنع تجاوز سلسلة الاعتماد بالكتابة المباشرة في leaves/permissions_request. '
  'قبل 0324 كان أي مستخدم بدور hr يعتمد أي إجازة بلا مرور بالسلسلة (عطل ①).';

DROP TRIGGER IF EXISTS trg_guard_status_bypass ON public.leaves;
CREATE TRIGGER trg_guard_status_bypass
  BEFORE UPDATE OF status ON public.leaves
  FOR EACH ROW EXECUTE FUNCTION public.tg_guard_request_status_bypass();

DROP TRIGGER IF EXISTS trg_guard_status_bypass ON public.permissions_request;
CREATE TRIGGER trg_guard_status_bypass
  BEFORE UPDATE OF status ON public.permissions_request
  FOR EACH ROW EXECUTE FUNCTION public.tg_guard_request_status_bypass();

-- ─────────────────────────────────────────────────────────────────────────
-- ② تحديث sync_hr_source_status لترفع علَم المزامنة
--
--    بدونه يمنع الحارسُ محرّكَ الموافقات نفسه من كتابة النتيجة.
--    اكتُشف بالتشغيل: أول نسخة من الحارس أسقطت verify-0323 كاملاً.
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

  -- ★ علَم المزامنة: يُخبر الحارس أن الكتابة قادمة من المحرّك.
  --   محلّي للمعاملة (is_local = TRUE) فلا يتسرّب لعمليات أخرى.
  PERFORM set_config('kyvzon.approval_sync', 'true', TRUE);

  IF v_type = 'leave' THEN
    UPDATE public.leaves SET status = v_label
     WHERE id = v_related AND tenant_id = v_tenant;
    GET DIAGNOSTICS v_n = ROW_COUNT;
  ELSIF v_type = 'permission' THEN
    UPDATE public.permissions_request SET status = v_label
     WHERE id = v_related AND tenant_id = v_tenant;
    GET DIAGNOSTICS v_n = ROW_COUNT;
  END IF;

  PERFORM set_config('kyvzon.approval_sync', 'false', TRUE);

  RETURN v_n;
END $$;

COMMENT ON FUNCTION public.sync_hr_source_status(UUID, TEXT) IS
  'يكتب نتيجة السلسلة في leaves/permissions_request مع رفع علَم '
  'kyvzon.approval_sync ليعبر حارس 0324.';

REVOKE ALL ON FUNCTION public.sync_hr_source_status(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_hr_source_status(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.sync_hr_source_status(UUID, TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ③ أرشفة إجراء التشغيل بدل حذفه — عطل ②
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.archive_sop(UUID, TEXT);

CREATE FUNCTION public.archive_sop(
  p_sop_id UUID,
  p_reason TEXT DEFAULT NULL
) RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant   UUID := public.current_user_tenant_id();
  v_role     TEXT := public.current_user_role();
  v_code     TEXT;
  v_status   TEXT;
  v_readings INT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NO_AUTH'; END IF;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  IF v_role NOT IN ('admin','hr','developer','it_admin') THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED (role %)', v_role;
  END IF;

  SELECT s.code, s.status INTO v_code, v_status
    FROM public.sops s
   WHERE s.id = p_sop_id AND s.tenant_id = v_tenant;

  IF v_code IS NULL THEN RAISE EXCEPTION 'SOP_NOT_FOUND'; END IF;
  IF v_status = 'archived' THEN RETURN 'already_archived'; END IF;

  SELECT count(*) INTO v_readings
    FROM public.sop_readings r WHERE r.sop_id = p_sop_id;

  UPDATE public.sops
     SET status = 'archived', updated_at = NOW()
   WHERE id = p_sop_id AND tenant_id = v_tenant;

  -- ★ سجلات القراءة تبقى: هي دليل الامتثال. الحذف النهائي كان
  --   يُبيدها عبر ON DELETE CASCADE (مقيس: 1 ⇒ 0).
  RAISE NOTICE 'أُرشِف % مع الحفاظ على % سجل قراءة', v_code, v_readings;

  RETURN 'archived';
END $$;

COMMENT ON FUNCTION public.archive_sop(UUID, TEXT) IS
  'أرشفة إجراء تشغيل مع الحفاظ على sop_readings. الحذف النهائي كان '
  'يُبيد دليل الامتثال عبر ON DELETE CASCADE (عطل 0324/②).';

REVOKE ALL ON FUNCTION public.archive_sop(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.archive_sop(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.archive_sop(UUID, TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ④ أرشفة القسم بدل حذفه — عطل ③
--
--    تُعيد سبباً مفهوماً بدل رسالة قيد أجنبي خام.
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.archive_department(UUID);

CREATE FUNCTION public.archive_department(p_department_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_role   TEXT := public.current_user_role();
  v_name   TEXT;
  v_kids   INT;
  v_emps   INT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NO_AUTH'; END IF;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  IF v_role NOT IN ('admin','hr','developer','it_admin') THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED (role %)', v_role;
  END IF;

  SELECT d.name_ar INTO v_name
    FROM public.departments d
   WHERE d.id = p_department_id AND d.tenant_id = v_tenant;
  IF v_name IS NULL THEN RAISE EXCEPTION 'DEPARTMENT_NOT_FOUND'; END IF;

  -- ★ سبب مفهوم بدل «حدث خطأ أثناء الحذف».
  --   القيد departments_parent_department_id_fkey كان يرفض بلا تفسير.
  SELECT count(*) INTO v_kids
    FROM public.departments d
   WHERE d.parent_department_id = p_department_id
     AND d.tenant_id = v_tenant AND d.is_active;
  IF v_kids > 0 THEN
    RAISE EXCEPTION 'HAS_ACTIVE_CHILDREN (% قسم فرعي نشط)', v_kids;
  END IF;

  SELECT count(*) INTO v_emps
    FROM public.employees e
   WHERE e.department_id = p_department_id AND e.tenant_id = v_tenant;
  IF v_emps > 0 THEN
    RAISE EXCEPTION 'HAS_EMPLOYEES (% موظف — انقلهم أولاً)', v_emps;
  END IF;

  -- الأرشفة تُبقي approval_rules و org_role_assignments سليمة،
  -- بينما الحذف كان يُبيدها عبر ON DELETE CASCADE.
  UPDATE public.departments
     SET is_active = FALSE, updated_at = NOW()
   WHERE id = p_department_id AND tenant_id = v_tenant;

  RETURN 'archived';
END $$;

COMMENT ON FUNCTION public.archive_department(UUID) IS
  'أرشفة قسم مع أسباب مفهومة. الحذف النهائي كان يفشل برسالة قيد أجنبي '
  'خام، ولو نجح لأباد approval_rules و org_role_assignments (عطل 0324/③).';

REVOKE ALL ON FUNCTION public.archive_department(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.archive_department(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.archive_department(UUID) TO authenticated;

DO $$
BEGIN
  RAISE NOTICE '✅ 0324: حارس تجاوز السلسلة + أرشفة الإجراءات والأقسام';
END $$;
