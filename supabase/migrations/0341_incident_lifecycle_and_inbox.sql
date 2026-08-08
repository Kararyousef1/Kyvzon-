-- ============================================================================
-- 0341_incident_lifecycle_and_inbox.sql
--
-- دورة حياة البلاغ: تغيير الحالة · الأرشفة بدل الحذف · الترقيم · الاسم الحيّ.
--
-- ══ الأعطال المُثبَتة تشغيلياً في هذه الجولة ═══════════════════════════
--   قاعدة Postgres 17 مبنيّة من الصفر بـ269 مايجريشن، وجلسات RLS حقيقية
--   (SET ROLE authenticated). كل رقم أدناه من تشغيل فعلي، ومقيس بعدّ
--   **الصفوف المتأثّرة** لا بالحالة النهائية (RLS يُسقط الصفّ صامتاً).
--
--  ① ★★★ لا أحد يستطيع تغيير حالة بلاغه — ولا حتى صاحبه.
--     `kyvzon_incidents_update` (نصّها الحرفي من pg_policies):
--        (tenant_id = current_user_tenant_id()) AND current_user_is_staff()
--     و`current_user_is_staff()` = role IN ('admin','hr','developer','it_admin').
--
--     مُقاس بعدّ الصفوف المتأثّرة (WITH u AS (UPDATE … RETURNING 1)):
--        سعد (موظف) → بلاغه هو    ⇒ 0 صفوف
--        سعد (موظف) → بلاغ زميله  ⇒ 0 صفوف
--        زميل        → بلاغ سعد    ⇒ 0 صفوف
--        هالة (hr)   → أي بلاغ     ⇒ 1 صفّ
--
--     الأثر: موظف رفع بلاغاً بالخطأ لا يستطيع سحبه ولا إغلاقه. ولا يوجد
--     في القاعدة أي دالة لتغيير الحالة أصلاً — مُحقَّق من pg_proc:
--     دوال البلاغات هي `assign_incident` · `my_incidents` ·
--     `hr_incidents_inbox` · `hr_incident_stats` فقط.
--     ⇒ `IncidentService.updateStatus` تكتب في الجدول مباشرةً عبر
--        `BaseService.update` بلا أي انتقال حالة مشروع.
--
--  ② ★★★ الحذف النهائي لدليل امتثال.
--     `kyvzon_incidents_delete` تسمح لـ`current_user_is_staff()`.
--     مُقاس: هالة (hr) حذفت بلاغاً ⇒ **1 صفّ محذوف**. سعد ⇒ 0.
--     و`incident_comments.incident_id` بـ`ON DELETE CASCADE` ⇒ التعليقات
--     تُباد معه. مُحقَّق من pg_constraint: جدولان يشيران إلى `incidents`
--     هما `incident_comments` (CASCADE) و`corrective_actions` (SET NULL).
--
--     الأثر: بلاغ مضايقة يمكن أن يختفي بلا أثر — يمحوه بالضبط من قد
--     يكون البلاغ عنه. وهذا يخالف قاعدة المشروع: لا حذف نهائي.
--     ⇒ نفس عطل ② في 0324 (حذف SOP) لكن على دليل أخطر.
--
--  ③ ★★ الاسم المعروض لا يتبع مصدره.
--     `hr_incidents_inbox` (0338) ترتّب:
--        COALESCE(NULLIF(btrim(i.employee_name),''), NULLIF(btrim(pr.full_name),''), '—')
--     و`incidents.employee_name` عمود نصّي يُملأ وقت الرفع.
--     مُقاس: تغيير `profiles.full_name` إلى 'سعد الاسم الجديد'
--        ⇒ الصندوق ما زال يعرض 'سعد الموظف'
--     ⇒ **نفس عطل ⑤ في 0340 حرفياً** — أُصلح هناك ولم يُصلَح هنا.
--
--  ④ ★★ الترقيم أعمى.
--     `hr_incidents_inbox` تُعيد 15 عموداً **ليس بينها `out_total`**،
--     و`my_incidents` تُعيد 11 عموداً كذلك.
--     `ProblemsList` تطلب `limit: 200` ثابتاً ثم ترشّح في المتصفح:
--        p.title.toLowerCase().includes(q)
--     الأثر: مع 5000 بلاغ تُحمَّل 200 فقط، والبحث يجد ما في الـ200 لا في
--     الـ5000، والمستخدم لا يعرف أن 4800 بلاغاً لم تُحمَّل.
--
--  ⑤ ★★ البحث والترشيح مبنيّان في القاعدة ولا يُستعملان.
--     `hr_incidents_inbox(p_status, p_severity, p_search, …)` تعمل:
--        بحث 'شبكة' ⇒ أعاد 'بطء الشبكة'
--     لكن `ProblemsList` تستدعي `hrInbox({ limit: 200 })` بلا أي معامل.
--
--  ⑥ ★★ `hr_incident_stats` موجودة ولا تُستدعى.
--     القاعدة تُعيد: total=6 pending=3 critical=2 **unassigned=4**
--     **anonymous=2** oldest_h=0.
--     الصفحة تحسب خمسة أرقام من المصفوفة المحمّلة، و`unassigned`
--     و`anonymous` و`oldest` **لا تُعرض إطلاقاً** — وهي أهمّ ما يحتاجه
--     مسؤول الموارد لإدارة الصندوق.
--
--  ⑦ ★★ الإسناد بلا زرّ. `assign_incident` (0338) كاملة ومحميّة
--     (تفحص `current_user_is_staff` و`ASSIGNEE_NOT_IN_TENANT`) — ولا
--     شاشة تستدعيها. مُقاس: 6 بلاغات، **جميعها** `assigned_to IS NULL`.
--
--  ⑧ ★ `tenant_id` قابل لـNULL ⇒ بلاغ يضيع.
--     مُقاس: إدراج بلاغ بلا `tenant_id` نجح، ثم:
--        صندوق الموارد يراه ⇒ 0
--     بلاغ قائم في الجدول لا يظهر لأحد ولا يعالجه أحد.
--
-- ══ ما كان سليماً — نوثّقه لئلا يُعاد إصلاحه ═════════════════════════
--   • قيود CHECK الثلاثة موجودة فعلاً: status · severity · category.
--     ★ صحّحتُ ادّعاءً أوّلياً لي بأنها غائبة — الاستقصاء أثبت العكس:
--       'حالة_مخترعة' رُفض بـvalue too long، و'صنف_مخترع' رُفض بـ
--       incidents_category_check.
--   • إخفاء هوية المُبلِّغ المجهول (0338) يعمل: الاسم والمعرّف والقسم
--     والبحث — كلها محجوبة.
--   • `assign_incident` تفحص انتماء المُسنَد إليه للمستأجر.
--
-- ══ المبدأ ══════════════════════════════════════════════════════════════
--   البلاغ دليل. لا يُمحى، وتنتقل حالته بقواعد لا بكتابة حرّة، ويعرف
--   صاحبُه أنه يستطيع سحبه.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- ① منع البلاغ اليتيم (عطل ⑧)
--
--    نُسند البلاغات القائمة بلا مستأجر من صاحبها قبل فرض NOT NULL.
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE v_fixed INT; v_orphan INT;
BEGIN
  UPDATE public.incidents i
     SET tenant_id = p.tenant_id
    FROM public.profiles p
   WHERE i.tenant_id IS NULL
     AND p.id = i.user_id
     AND p.tenant_id IS NOT NULL;
  GET DIAGNOSTICS v_fixed = ROW_COUNT;

  SELECT count(*) INTO v_orphan FROM public.incidents WHERE tenant_id IS NULL;

  IF v_fixed > 0 THEN
    RAISE NOTICE '0341: رُبِط % بلاغاً يتيماً بمستأجر صاحبه', v_fixed;
  END IF;
  IF v_orphan > 0 THEN
    -- لا نحذف (القاعدة الذهبية) ولا نفرض القيد فنُفشل المايجريشن.
    RAISE WARNING
      '0341: بقي % بلاغاً بلا مستأجر ولا صاحب — لن يُفرَض NOT NULL. '
      'راجعها يدوياً ثم أعد تشغيل هذا الجزء.', v_orphan;
  ELSE
    ALTER TABLE public.incidents ALTER COLUMN tenant_id SET NOT NULL;
    RAISE NOTICE '0341: فُرِض NOT NULL على incidents.tenant_id';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- ② الأرشفة بدل الحذف (عطل ②)
--
--    `status` مقيّد بـ('pending','in_progress','resolved','closed') وطوله
--    varchar(20) — لا نوسّعه ولا نُضيف قيمة، بل عمود أرشفة مستقلّ.
--    هذا يُبقي كل الاستعلامات القائمة تعمل بلا تعديل.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.incidents
  ADD COLUMN IF NOT EXISTS archived_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS archive_reason TEXT,
  ADD COLUMN IF NOT EXISTS closed_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.incidents.archived_at IS
  '0341: الأرشفة بديل الحذف النهائي. قبله كانت kyvzon_incidents_delete '
  'تسمح لأي staff بحذف البلاغ (مُقاس: 1 صفّ محذوف) وتُباد معه التعليقات '
  'بـON DELETE CASCADE — بلاغ مضايقة يختفي بلا أثر.';

-- ★★★ إسقاط سياسة الحذف. الحذف لم يعد مساراً مشروعاً لأحد.
DROP POLICY IF EXISTS kyvzon_incidents_delete ON public.incidents;

-- محفّز حارس: حتى لو أُعيدت السياسة يوماً، الحذف يُرفض بصوت مسموع.
CREATE OR REPLACE FUNCTION public.tg_block_incident_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION
    'INCIDENT_DELETE_FORBIDDEN: البلاغ دليل — استعمل archive_incident() بدل الحذف'
    USING ERRCODE = 'insufficient_privilege';
END $$;

COMMENT ON FUNCTION public.tg_block_incident_delete() IS
  'يمنع الحذف النهائي للبلاغات. مُقاس قبل 0341: دور hr حذف بلاغاً '
  '(1 صفّ) ومعه تعليقاته بـCASCADE.';

DROP TRIGGER IF EXISTS trg_block_incident_delete ON public.incidents;
CREATE TRIGGER trg_block_incident_delete
  BEFORE DELETE ON public.incidents
  FOR EACH ROW EXECUTE FUNCTION public.tg_block_incident_delete();

-- ─────────────────────────────────────────────────────────────────────────
-- ③ انتقالات الحالة المشروعة (عطل ①)
--
--    الخريطة:
--      pending     → in_progress · resolved · closed
--      in_progress → resolved · closed · pending (إعادة فتح)
--      resolved    → closed · in_progress (لم يُحلّ فعلاً)
--      closed      → in_progress (إعادة فتح بقرار)
--
--    ومن يملك الانتقال:
--      staff        : كل الانتقالات
--      صاحب البلاغ  : closed فقط، ومن 'pending' وحدها — أي سحب بلاغه
--                     قبل أن يبدأ أحد بمعالجته.
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.set_incident_status(UUID, TEXT, TEXT);

CREATE FUNCTION public.set_incident_status(
  p_incident_id UUID,
  p_status      TEXT,
  p_note        TEXT DEFAULT NULL
) RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_staff  BOOLEAN := public.current_user_is_staff();
  v_uid    UUID := auth.uid();
  v_row    RECORD;
  v_allowed TEXT[];
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'INCIDENT_NO_TENANT: لا سياق شركة'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_status NOT IN ('pending','in_progress','resolved','closed') THEN
    RAISE EXCEPTION 'INCIDENT_BAD_STATUS: حالة غير معروفة: %', p_status
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_row FROM public.incidents
   WHERE id = p_incident_id AND tenant_id = v_tenant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INCIDENT_NOT_FOUND' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_row.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'INCIDENT_ARCHIVED: البلاغ مؤرشف — لا تتغيّر حالته'
      USING ERRCODE = 'check_violation';
  END IF;

  -- ★★★ صاحب البلاغ يسحبه، لكن قبل بدء المعالجة فقط.
  --   قبل 0341 كان **لا يستطيع أي شيء**: 0 صفوف متأثّرة.
  IF NOT v_staff THEN
    IF v_row.user_id IS DISTINCT FROM v_uid THEN
      RAISE EXCEPTION 'INCIDENT_NOT_OWNER: لا تملك هذا البلاغ'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_row.status <> 'pending' OR p_status <> 'closed' THEN
      RAISE EXCEPTION
        'INCIDENT_OWNER_LIMIT: يمكنك سحب بلاغك ما دام معلّقاً فقط '
        '(الحالة الآن: %)', v_row.status
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF v_row.status = p_status THEN
    RETURN v_row.status;   -- لا تغيير — ليس خطأً
  END IF;

  -- انتقالات مشروعة
  v_allowed := CASE v_row.status
    WHEN 'pending'     THEN ARRAY['in_progress','resolved','closed']
    WHEN 'in_progress' THEN ARRAY['resolved','closed','pending']
    WHEN 'resolved'    THEN ARRAY['closed','in_progress']
    WHEN 'closed'      THEN ARRAY['in_progress']
    ELSE ARRAY[]::TEXT[]
  END;

  IF NOT (p_status = ANY (v_allowed)) THEN
    RAISE EXCEPTION
      'INCIDENT_BAD_TRANSITION: لا يمكن الانتقال من % إلى %',
      v_row.status, p_status
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.incidents
     SET status    = p_status,
         closed_at = CASE WHEN p_status = 'closed' THEN NOW()
                          WHEN p_status = 'in_progress' THEN NULL
                          ELSE closed_at END,
         closed_by = CASE WHEN p_status = 'closed' THEN v_uid
                          WHEN p_status = 'in_progress' THEN NULL
                          ELSE closed_by END,
         updated_at = NOW()
   WHERE id = p_incident_id AND tenant_id = v_tenant;

  -- أثر القرار في سجلّ التعليقات — لا يُمحى
  IF btrim(COALESCE(p_note,'')) <> '' THEN
    INSERT INTO public.incident_comments (tenant_id, incident_id, user_id, text, is_internal)
    VALUES (v_tenant, p_incident_id, v_uid,
            format('[%s ← %s] %s', v_row.status, p_status, p_note), NOT v_staff IS FALSE);
  END IF;

  RETURN p_status;
END $$;

COMMENT ON FUNCTION public.set_incident_status(UUID, TEXT, TEXT) IS
  'انتقال حالة البلاغ بقواعد. قبل 0341 لم توجد دالة أصلاً، والسياسة '
  'kyvzon_incidents_update تشترط staff وحدها ⇒ صاحب البلاغ لا يستطيع '
  'سحبه (مُقاس: 0 صفوف متأثّرة).';

REVOKE ALL ON FUNCTION public.set_incident_status(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_incident_status(UUID, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_incident_status(UUID, TEXT, TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ④ الأرشفة — بديل الحذف
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.archive_incident(UUID, TEXT);

CREATE FUNCTION public.archive_incident(
  p_incident_id UUID,
  p_reason      TEXT DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_uid    UUID := auth.uid();
  v_row    RECORD;
BEGIN
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'INCIDENT_NOT_AUTHORIZED_TO_ARCHIVE: الأرشفة لفريق الموارد'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_row FROM public.incidents
   WHERE id = p_incident_id AND tenant_id = v_tenant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INCIDENT_NOT_FOUND' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_row.archived_at IS NOT NULL THEN RETURN FALSE; END IF;

  IF btrim(COALESCE(p_reason,'')) = '' THEN
    RAISE EXCEPTION 'INCIDENT_ARCHIVE_NEEDS_REASON: سبب الأرشفة مطلوب'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.incidents
     SET archived_at    = NOW(),
         archived_by    = v_uid,
         archive_reason = p_reason,
         updated_at     = NOW()
   WHERE id = p_incident_id AND tenant_id = v_tenant;

  -- التعليقات تبقى — لا CASCADE ولا محو
  RETURN TRUE;
END $$;

COMMENT ON FUNCTION public.archive_incident(UUID, TEXT) IS
  'أرشفة بلاغ مع سبب إلزامي. البلاغ وتعليقاته يبقيان للتدقيق. '
  'مُقاس قبل 0341: الحذف كان يُبيد البلاغ وتعليقاته بـCASCADE.';

REVOKE ALL ON FUNCTION public.archive_incident(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.archive_incident(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.archive_incident(UUID, TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ⑤ صندوق الموارد: الاسم الحيّ + الإجمالي + استبعاد المؤرشف (أعطال ③④)
--
--    نُعيد بناء `hr_incidents_inbox` بأربعة تغييرات لا خامس لها:
--      (أ) `profiles.full_name` **قبل** `employee_name` النصّي المخزَّن.
--      (ب) `out_total` — الإجمالي بعد الترشيح وقبل الحدّ.
--      (ج) استبعاد المؤرشف افتراضياً مع معامل صريح لإظهاره.
--      (د) `out_archived_at` للعرض.
--    إخفاء الهوية المجهولة منقول **حرفياً** من 0338 — قُورن سطراً بسطر.
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.hr_incidents_inbox(TEXT, TEXT, TEXT, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.hr_incidents_inbox(TEXT, TEXT, TEXT, BOOLEAN, INTEGER, INTEGER);

CREATE FUNCTION public.hr_incidents_inbox(
  p_status          TEXT    DEFAULT NULL,
  p_severity        TEXT    DEFAULT NULL,
  p_search          TEXT    DEFAULT NULL,
  p_include_archived BOOLEAN DEFAULT FALSE,
  p_limit           INTEGER DEFAULT 100,
  p_offset          INTEGER DEFAULT 0
) RETURNS TABLE (
  out_id          UUID,
  out_title       TEXT,
  out_description TEXT,
  out_category    TEXT,
  out_severity    TEXT,
  out_status      TEXT,
  out_is_anonymous BOOLEAN,
  out_employee_id UUID,
  out_reporter    TEXT,
  out_department  TEXT,
  out_assigned_to UUID,
  out_assignee    TEXT,
  out_age_hours   NUMERIC,
  out_archived_at TIMESTAMPTZ,
  out_created_at  TIMESTAMPTZ,
  out_updated_at  TIMESTAMPTZ,
  out_total       BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER          -- ★ يحترم RLS جدول incidents عمداً
SET search_path = public
AS $$
DECLARE
  v_q   TEXT := NULLIF(btrim(COALESCE(p_search, '')), '');
  v_lim INT  := GREATEST(COALESCE(p_limit, 100), 0);
  v_off INT  := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  RETURN QUERY
  WITH filtered AS (
    SELECT i.id,
           i.title::TEXT                                        AS f_title,
           i.description                                        AS f_desc,
           i.category::TEXT                                     AS f_cat,
           i.severity::TEXT                                     AS f_sev,
           i.status::TEXT                                       AS f_status,
           i.is_anonymous                                       AS f_anon,
           -- ★★★ الهوية مخفيّة عند is_anonymous — في القاعدة لا الواجهة (0338)
           CASE WHEN i.is_anonymous THEN NULL ELSE i.employee_id END AS f_emp,
           -- ★★★ 0341: profiles **أوّلاً**. العمود النصّي employee_name
           --   يُملأ وقت الرفع ولا يتبع profiles بعدها. مُقاس: تغيير
           --   full_name إلى 'سعد الاسم الجديد' والصندوق يعرض 'سعد الموظف'.
           --   نفس عطل ⑤ في 0340 حرفياً.
           CASE WHEN i.is_anonymous THEN 'مُبلِّغ مجهول'
                ELSE COALESCE(
                       NULLIF(btrim(pr.full_name), ''),
                       NULLIF(btrim(i.employee_name), ''),
                       '—')
           END::TEXT                                            AS f_reporter,
           -- ★★ والقسم أيضاً: في شركة صغيرة القسم يكشف الشخص (0338)
           CASE WHEN i.is_anonymous THEN '—'
                ELSE COALESCE(
                       NULLIF(btrim(d.name_ar), ''),
                       NULLIF(btrim(i.department), ''),
                       '—')
           END::TEXT                                            AS f_dept,
           i.assigned_to                                        AS f_assigned,
           COALESCE(
             NULLIF(btrim(ae.first_name || ' ' || ae.last_name), ''),
             '—')::TEXT                                         AS f_assignee,
           round(EXTRACT(EPOCH FROM (NOW() - i.created_at)) / 3600.0, 1) AS f_age,
           i.archived_at                                        AS f_arch,
           i.created_at                                         AS f_created,
           i.updated_at                                         AS f_updated
      FROM public.incidents i
      LEFT JOIN public.profiles    pr ON pr.id = i.user_id
      LEFT JOIN public.departments d  ON d.id  = i.department_id
      LEFT JOIN public.employees   ae ON ae.id = i.assigned_to
     WHERE (p_status   IS NULL OR i.status   = p_status)
       AND (p_severity IS NULL OR i.severity = p_severity)
       AND (COALESCE(p_include_archived, FALSE) OR i.archived_at IS NULL)
       AND (v_q IS NULL
            OR i.title       ILIKE '%' || v_q || '%'
            OR i.description ILIKE '%' || v_q || '%'
            -- ★★ البحث بالاسم لا يشمل المجهول وإلا كُشفت الهوية بالاستنتاج
            OR (NOT i.is_anonymous AND i.employee_name ILIKE '%' || v_q || '%')
            OR (NOT i.is_anonymous AND pr.full_name    ILIKE '%' || v_q || '%'))
  )
  SELECT f.id, f.f_title, f.f_desc, f.f_cat, f.f_sev, f.f_status, f.f_anon,
         f.f_emp, f.f_reporter, f.f_dept, f.f_assigned, f.f_assignee,
         f.f_age, f.f_arch, f.f_created, f.f_updated,
         -- ★ الإجمالي بعد الترشيح وقبل الحدّ — الترقيم لم يعد أعمى
         count(*) OVER ()                                       AS out_total
    FROM filtered f
   ORDER BY
     CASE f.f_status WHEN 'pending' THEN 0 WHEN 'in_progress' THEN 1
                     WHEN 'resolved' THEN 2 ELSE 3 END,
     CASE f.f_sev WHEN 'critical' THEN 0 WHEN 'high' THEN 1
                  WHEN 'medium' THEN 2 ELSE 3 END,
     f.f_created DESC
   LIMIT v_lim OFFSET v_off;
END $$;

COMMENT ON FUNCTION public.hr_incidents_inbox(TEXT, TEXT, TEXT, BOOLEAN, INTEGER, INTEGER) IS
  'صندوق بلاغات الموارد. ★ 0341: الاسم من profiles الحيّ (كان من العمود '
  'النصّي المتجمّد)، و out_total للترقيم (كان غائباً فالصفحة تُحمّل 200 '
  'وترشّح محلياً)، واستبعاد المؤرشف. إخفاء الهوية من 0338 منقول حرفياً.';

REVOKE ALL ON FUNCTION public.hr_incidents_inbox(TEXT, TEXT, TEXT, BOOLEAN, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_incidents_inbox(TEXT, TEXT, TEXT, BOOLEAN, INTEGER, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_incidents_inbox(TEXT, TEXT, TEXT, BOOLEAN, INTEGER, INTEGER) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ⑥ بلاغاتي: الإجمالي + الترشيح + ما أستطيع فعله
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.my_incidents(TEXT, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.my_incidents(TEXT, TEXT, INTEGER, INTEGER);

CREATE FUNCTION public.my_incidents(
  p_status TEXT    DEFAULT NULL,
  p_search TEXT    DEFAULT NULL,
  p_limit  INTEGER DEFAULT 100,
  p_offset INTEGER DEFAULT 0
) RETURNS TABLE (
  out_id           UUID,
  out_title        TEXT,
  out_description  TEXT,
  out_category     TEXT,
  out_severity     TEXT,
  out_status       TEXT,
  out_is_anonymous BOOLEAN,
  out_assigned_to  UUID,
  out_assignee     TEXT,
  out_archived_at  TIMESTAMPTZ,
  out_created_at   TIMESTAMPTZ,
  out_updated_at   TIMESTAMPTZ,
  out_can_withdraw BOOLEAN,
  out_total        BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER          -- ★ يحترم RLS جدول incidents عمداً
SET search_path = public
AS $$
DECLARE
  v_q   TEXT := NULLIF(btrim(COALESCE(p_search, '')), '');
  v_lim INT  := GREATEST(COALESCE(p_limit, 100), 0);
  v_off INT  := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  RETURN QUERY
  WITH filtered AS (
    SELECT i.id,
           i.title::TEXT       AS f_title,
           i.description       AS f_desc,
           i.category::TEXT    AS f_cat,
           i.severity::TEXT    AS f_sev,
           i.status::TEXT      AS f_status,
           i.is_anonymous      AS f_anon,
           i.assigned_to       AS f_assigned,
           COALESCE(
             NULLIF(btrim(ae.first_name || ' ' || ae.last_name), ''),
             '—')::TEXT        AS f_assignee,
           i.archived_at       AS f_arch,
           i.created_at        AS f_created,
           i.updated_at        AS f_updated,
           -- ★ ما يطابق شرط set_incident_status لصاحب البلاغ
           (i.status = 'pending' AND i.archived_at IS NULL) AS f_withdraw
      FROM public.incidents i
      LEFT JOIN public.employees ae ON ae.id = i.assigned_to
     -- ★ الترشيح بـuser_id: هذا ما تفعله kyvzon_incidents_select،
     --   والبلاغات القديمة سُجّلت به (0338).
     WHERE i.user_id = auth.uid()
       AND (p_status IS NULL OR i.status = p_status)
       AND (v_q IS NULL
            OR i.title       ILIKE '%' || v_q || '%'
            OR i.description ILIKE '%' || v_q || '%')
  )
  SELECT f.id, f.f_title, f.f_desc, f.f_cat, f.f_sev, f.f_status, f.f_anon,
         f.f_assigned, f.f_assignee, f.f_arch, f.f_created, f.f_updated,
         f.f_withdraw,
         count(*) OVER () AS out_total
    FROM filtered f
   ORDER BY f.f_created DESC
   LIMIT v_lim OFFSET v_off;
END $$;

COMMENT ON FUNCTION public.my_incidents(TEXT, TEXT, INTEGER, INTEGER) IS
  'بلاغاتي. ★ 0341: out_total للترقيم · p_search في القاعدة · '
  'out_can_withdraw يطابق شرط set_incident_status فلا يظهر زرّ يفشل.';

REVOKE ALL ON FUNCTION public.my_incidents(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.my_incidents(TEXT, TEXT, INTEGER, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.my_incidents(TEXT, TEXT, INTEGER, INTEGER) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ⑦ الإحصاءات: استبعاد المؤرشف (وإلا تناقض العدّاد مع القائمة)
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.hr_incident_stats(INTEGER);

CREATE FUNCTION public.hr_incident_stats(p_days INTEGER DEFAULT 30)
RETURNS TABLE (
  out_total        BIGINT,
  out_pending      BIGINT,
  out_in_progress  BIGINT,
  out_resolved     BIGINT,
  out_critical     BIGINT,
  out_unassigned   BIGINT,
  out_anonymous    BIGINT,
  out_archived     BIGINT,
  out_oldest_hours NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER          -- ★ يحترم RLS جدول incidents عمداً
SET search_path = public
AS $$
DECLARE
  v_days INT := GREATEST(COALESCE(p_days, 30), 1);
BEGIN
  RETURN QUERY
  SELECT
    count(*) FILTER (WHERE i.archived_at IS NULL),
    count(*) FILTER (WHERE i.archived_at IS NULL AND i.status = 'pending'),
    count(*) FILTER (WHERE i.archived_at IS NULL AND i.status = 'in_progress'),
    count(*) FILTER (WHERE i.archived_at IS NULL AND i.status = 'resolved'),
    count(*) FILTER (WHERE i.archived_at IS NULL AND i.severity = 'critical'),
    count(*) FILTER (WHERE i.archived_at IS NULL AND i.assigned_to IS NULL
                       AND i.status IN ('pending','in_progress')),
    count(*) FILTER (WHERE i.archived_at IS NULL AND i.is_anonymous),
    count(*) FILTER (WHERE i.archived_at IS NOT NULL),
    COALESCE(round(max(
      CASE WHEN i.archived_at IS NULL AND i.status IN ('pending','in_progress')
           THEN EXTRACT(EPOCH FROM (NOW() - i.created_at)) / 3600.0 END), 1), 0)
    FROM public.incidents i
   WHERE i.created_at >= NOW() - make_interval(days => v_days);
END $$;

COMMENT ON FUNCTION public.hr_incident_stats(INTEGER) IS
  'إحصاءات صندوق البلاغات. ★ 0341: تستبعد المؤرشف (وإلا تناقض العدّاد '
  'مع القائمة) وتُضيف out_archived. unassigned يحسب المفتوح فقط.';

REVOKE ALL ON FUNCTION public.hr_incident_stats(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_incident_stats(INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_incident_stats(INTEGER) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ⑨ ★★★ الإشعار المضاعف للمُعتمِد — عطل موروث من 0334
--
--   محفّز `trg_notify_approval_step` مركَّب على **أربعة** جداول، منها
--   `hr_approval_steps` و`unified_approval_steps`. ومحفّز المرآة من
--   0334 (`trg_mirror_hr_step`) ينسخ كل خطوة HR إلى
--   `unified_approval_steps` — فيُطلَق الإشعار **مرّتين** للشخص نفسه
--   عن الطلب نفسه.
--
--   مُقاس على قاعدة نظيفة بـ270 مايجريشن:
--     verify-approval-lifecycle-0323 ⇒
--       «2.2 المشرف (الخطوة النشطة) أُشعِر 2 مرة»
--
--   ★ ليس انحداراً من 0339/0340/0341: المرآة من 0334، والاختبار كان
--     يُشغَّل على قاعدة لم تكن 0334 مطبَّقة عليها بعدُ في حينه. الفحص
--     الشامل من الصفر هو ما كشفه — وهذا بالضبط ما يُراد منه.
--
--   الإصلاح: المرآة نسخة للقراءة (بوابة المدير وبقية الوحدات)، ومصدر
--   الإشعار يبقى الجدول الأصلي وحده. نتخطّى صفوف `source_module='hr'`
--   في المحفّز — بقية المنطق منقول حرفياً وقُورن سطراً بسطر.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_skip_mirrored_hr_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- لا شيء: وجود هذه الدالة توثيقي فقط. الإسكات يتمّ بشرط WHEN أدناه.
  RETURN NEW;
END $$;

-- ★ نُعيد تركيب المحفّز على المرآة بشرط WHEN يستثني مصدر hr.
--   شرط WHEN أرخص من فحص داخل الدالة: المحفّز لا يُطلَق أصلاً.
DROP TRIGGER IF EXISTS trg_notify_approval_step ON public.unified_approval_steps;
CREATE TRIGGER trg_notify_approval_step
  AFTER INSERT OR UPDATE OF status ON public.unified_approval_steps
  FOR EACH ROW
  WHEN (NEW.source_module <> 'hr')
  EXECUTE FUNCTION public.tg_notify_approval_step();

COMMENT ON FUNCTION public.tg_skip_mirrored_hr_notification() IS
  '0341: توثيق قرار إسكات إشعار المرآة لمصدر hr. مُقاس قبل الإصلاح: '
  'المشرف أُشعِر مرّتين عن الطلب نفسه (مرآة 0334 + الجدول الأصلي).';

-- ─────────────────────────────────────────────────────────────────────────
-- ⑩ ★★★ صندوق الموافقات يعدّ خطوات HR مرّتين — عطل موروث من 0334
--
--   `my_approval_inbox` (0325) تبني `all_steps` بـ`UNION ALL` من أربعة
--   جداول، منها `unified_approval_steps` و`hr_approval_steps`. ومرآة
--   0334 تنسخ كل خطوة HR إلى الأولى ⇒ **كل خطوة تُعدّ مرّتين**.
--
--   مُقاس على قاعدة نظيفة بـ270 مايجريشن:
--     verify-approval-lifecycle-0323 ⇒
--       «3.3 إجمالي الخطوات في الصندوق = 4 (متوقَّع 2)»
--   أي أن المدير يرى «الخطوة 1 من 4» لسلسلة من خطوتين.
--
--   ★ ليس انحداراً من جولاتي: `UNION ALL` من 0325 والمرآة من 0334.
--     الفحص الشامل من الصفر هو ما كشف تفاعلهما.
--
--   الإصلاح: نستثني صفوف المرآة (`source_module='hr'`) من فرع
--   `unified_approval_steps` — الأصل `hr_approval_steps` يغطّيها.
--   بقية الدالة منقولة **حرفياً** من 0325 وقُورنت سطراً بسطر.
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
    SELECT s.source_module::TEXT AS source_module, s.source_id,
           s.status::TEXT AS status, s.step_order, s.approver_id
      FROM public.unified_approval_steps s
     WHERE s.tenant_id = v_tenant
       -- ★★★ 0341: استثناء صفوف مرآة 0334. الأصل hr_approval_steps
       --   يُضاف أدناه، وبدون هذا الشرط تُعدّ كل خطوة HR مرّتين.
       AND s.source_module <> 'hr'
    UNION ALL
    -- ★ hr_approval_steps يخدم الإجازات والطلبات المالية معاً:
    --   الوحدة تُشتقّ من request_type لا تُثبَّت على 'hr'.
    SELECT CASE WHEN r.request_type IN ('expense','loan')
                THEN 'employee_finance' ELSE 'hr' END,
           s.request_id, s.status, s.step_order, s.approver_id
      FROM public.hr_approval_steps s
      JOIN public.hr_approval_requests r ON r.id = s.request_id
     WHERE s.tenant_id = v_tenant
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
  'صندوق الموافقات الموحّد. ★ 0341: يستثني صفوف مرآة 0334 من '
  'unified_approval_steps وإلا عُدّت كل خطوة HR مرّتين (مُقاس: '
  '«الخطوة 1 من 4» لسلسلة من خطوتين).';

REVOKE ALL ON FUNCTION public.my_approval_inbox(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.my_approval_inbox(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.my_approval_inbox(TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ⑧ فهارس تخدم الترتيب والترشيح الجديدين
-- ─────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_incidents_inbox_open
  ON public.incidents (tenant_id, status, severity, created_at DESC)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_incidents_mine
  ON public.incidents (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_incidents_unassigned
  ON public.incidents (tenant_id)
  WHERE assigned_to IS NULL AND archived_at IS NULL;
