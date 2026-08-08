-- ============================================================================
-- 0342_incident_intake_and_thread.sql
--
-- رفع البلاغ ومحادثته: الإدراج · الهوية المجهولة · خيط التعليقات.
-- يُكمل دورة البلاغات التي بدأها 0338 (الإخفاء) و0341 (دورة الحياة).
--
-- ══ الأعطال المُثبَتة تشغيلياً في هذه الجولة ═══════════════════════════
--   قاعدة Postgres 17 من الصفر بـ270 مايجريشن، وجلسات RLS حقيقية
--   (SET ROLE authenticated). كل رقم من تشغيل فعلي.
--
--  ① ★★★ رفع أي بلاغ **مستحيل** من الواجهة.
--     `NewProblemPage.tsx:187` تُدرج مباشرةً في `incidents`:
--        .insert({ title, description, category, severity, is_anonymous,
--                  reported_by, user_id, status, ai_analysis })
--     **لا `tenant_id`**. وسياسة `kyvzon_incidents_insert` نصّها الحرفي:
--        (tenant_id = current_user_tenant_id())
--        AND (current_user_is_staff() OR user_id = auth.uid())
--     و`NULL <> أي قيمة` ⇒ `WITH CHECK` يفشل.
--
--     مُقاس بجلسة RLS بدور موظف:
--        ERROR: new row violates row-level security policy for table "incidents"
--
--     ★★ تصحيح ظنّ أوّلي لي: حسبتُ أن `NOT NULL` الذي فرضتُه في 0341 هو
--        السبب. الفصل أثبت العكس — الحاجز الأول هو **RLS**، والصفحة
--        كانت معطّلة **قبل 0341** منذ وجود سياسة الإدراج. مُقاس:
--          بدور authenticated ⇒ خطأ RLS
--          بدور postgres     ⇒ خطأ NOT NULL (الحاجز الثاني)
--
--  ② ★★★ البلاغ المجهول: ميزة معلَنة ومستحيلة التنفيذ.
--     الصفحة تُفرّغ العمودين عند `isAnonymous`:
--        reported_by: null, user_id: null
--     لكن السياسة تشترط `user_id = auth.uid()` ⇒ الإدراج يُصدّ.
--     مُقاس: ERROR: new row violates row-level security policy
--
--     وحتى لو مرّ، النتيجة أسوأ: `my_incidents` ترشّح بـ`user_id`
--     ⇒ صاحب البلاغ **يفقد بلاغه للأبد**: لا يتابعه ولا يسحبه.
--     مُقاس: صاحبه يراه في «بلاغاتي» ⇒ **0**
--
--     ★ وهذا يناقض 0338 نفسه: الإخفاء هناك **في العرض** لا في التخزين.
--       مُقاس بتخزين `user_id` صحيحاً: صاحبه يراه (1) والصندوق يعرض
--       'مُبلِّغ مجهول'. الحلّ الصحيح موجود منذ 0338 ولم تستعمله الصفحة.
--
--  ③ ★★★ خيط التعليقات أحادي الاتجاه.
--     `kyvzon_incident_comments_select`:
--        (tenant_id = …) AND (current_user_is_staff() OR user_id = auth.uid())
--     الشرط على **كاتب التعليق** لا على صاحب البلاغ.
--
--     مُقاس على بلاغ فيه ثلاثة تعليقات:
--        صاحب البلاغ (سعد) يرى: 1 — «تعليق الموظف نفسه» وحده
--        الموارد البشرية ترى:   3 — الكل
--     ⇒ **ردّ الموارد العلني غير مرئي لصاحب البلاغ.** الموظف يكتب
--       ولا يرى الجواب أبداً.
--
--  ④ ★★ `is_internal` عمود بلا أثر.
--     مُقاس: عدد السياسات التي تذكره = **0**. ولا حاجة له ما دام
--     الموظف لا يرى شيئاً من الموارد أصلاً (عطل ③). بعد إصلاح ③
--     يصير ضرورياً وإلا انكشفت الملاحظات الإدارية.
--
--  ⑤ ★★ الإدراج لا يملأ `employee_id` ولا `department_id`.
--     مُقاس بعد إدراج ناجح: كلاهما `NULL` في كل الصفوف.
--     الأثر: `hr_incidents_inbox` (0341) تربط القسم بـ`department_id`
--     ⇒ العمود المعروض `'—'` دائماً. مُقاس: `department=—`
--
--  ⑥ ★ إدراج التعليق يفشل هو الآخر.
--     `IncidentCommentService.addComment` لا تمرّر `tenant_id`
--     (مُقاس: صفر إشارة إليه في الدالة) والسياسة تشترطه.
--     مُقاس: ERROR: new row violates row-level security policy
--            for table "incident_comments"
--
--  ⑦ ★ `ai_analysis` يُخزَّن ولا يُعرض.
--     العمود `jsonb` موجود، والصفحة تكتب فيه `{severity, actions, summary}`،
--     و`hr_incidents_inbox` (0341) **لا تُعيده إطلاقاً**.
--
-- ══ المبدأ ══════════════════════════════════════════════════════════════
--   البلاغ يُرفع ببوّابة واحدة تشتقّ السياق كلّه من الجلسة. والهوية
--   تُخفى في العرض لا بإتلاف الرابط. والمحادثة طرفان لا طرف واحد.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- ① بوّابة رفع البلاغ — دالة واحدة ذرّية
--
--    تشتقّ tenant_id و user_id و employee_id و department_id من الجلسة.
--    ★ `user_id` يُخزَّن **دائماً** حتى للمجهول — الإخفاء في العرض (0338).
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.submit_incident(TEXT, TEXT, TEXT, TEXT, BOOLEAN, JSONB);

CREATE FUNCTION public.submit_incident(
  p_title       TEXT,
  p_description TEXT,
  p_category    TEXT DEFAULT 'other',
  p_severity    TEXT DEFAULT 'medium',
  p_anonymous   BOOLEAN DEFAULT FALSE,
  p_ai_analysis JSONB DEFAULT NULL
) RETURNS TABLE (
  out_id           UUID,
  out_is_anonymous BOOLEAN
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_uid    UUID := auth.uid();
  v_emp    UUID := public.current_user_employee_id();
  v_dept   UUID;
  v_name   TEXT;
  v_deptnm TEXT;
  v_id     UUID;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'INCIDENT_NO_CONTEXT: لا سياق مستخدم أو شركة'
      USING ERRCODE = 'check_violation';
  END IF;

  IF btrim(COALESCE(p_title,'')) = '' OR btrim(COALESCE(p_description,'')) = '' THEN
    RAISE EXCEPTION 'INCIDENT_EMPTY: العنوان والوصف مطلوبان'
      USING ERRCODE = 'check_violation';
  END IF;

  -- القيم المسموحة من قيود الجدول القائمة (incidents_category_check …)
  IF p_category NOT IN ('technical','hr','management','workplace','salary','safety','other') THEN
    RAISE EXCEPTION 'INCIDENT_BAD_CATEGORY: تصنيف غير معروف: %', p_category
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_severity NOT IN ('low','medium','high','critical') THEN
    RAISE EXCEPTION 'INCIDENT_BAD_SEVERITY: أولوية غير معروفة: %', p_severity
      USING ERRCODE = 'check_violation';
  END IF;

  -- ★★ السياق من الجلسة: employee_id و department_id كانا NULL دائماً
  --   لأن الصفحة لا تُرسلهما، فالقسم يظهر '—' في صندوق الموارد.
  SELECT e.department_id,
         COALESCE(NULLIF(btrim(p.full_name), ''),
                  NULLIF(btrim(e.first_name || ' ' || e.last_name), '')),
         d.name_ar
    INTO v_dept, v_name, v_deptnm
    FROM public.employees e
    LEFT JOIN public.profiles    p ON p.id = e.user_id
    LEFT JOIN public.departments d ON d.id = e.department_id
   WHERE e.id = v_emp;

  IF v_name IS NULL THEN
    SELECT full_name, department INTO v_name, v_deptnm
      FROM public.profiles WHERE id = v_uid;
  END IF;

  INSERT INTO public.incidents (
    tenant_id, user_id, employee_id, department_id,
    employee_name, department, title, description,
    category, severity, status, is_anonymous, reported_by, ai_analysis)
  VALUES (
    v_tenant,
    -- ★★★ يُخزَّن دائماً — الإخفاء في العرض لا بإتلاف الرابط (0338).
    --   تفريغه كان يُفقد صاحبَ البلاغ بلاغَه للأبد: `my_incidents`
    --   ترشّح بـuser_id ⇒ 0 صفوف.
    v_uid,
    v_emp, v_dept,
    v_name, v_deptnm,
    btrim(p_title), btrim(p_description),
    p_category, p_severity, 'pending',
    COALESCE(p_anonymous, FALSE),
    -- `reported_by` حقل عرض إداري: يبقى NULL للمجهول
    CASE WHEN COALESCE(p_anonymous, FALSE) THEN NULL ELSE v_uid END,
    COALESCE(p_ai_analysis, '{}'::JSONB))
  RETURNING id INTO v_id;

  out_id           := v_id;
  out_is_anonymous := COALESCE(p_anonymous, FALSE);
  RETURN NEXT;
END $$;

COMMENT ON FUNCTION public.submit_incident(TEXT, TEXT, TEXT, TEXT, BOOLEAN, JSONB) IS
  'بوّابة رفع البلاغ الوحيدة. قبل 0342 كانت الصفحة تُدرج بلا tenant_id '
  'فتُصدّ بـRLS (رفع أي بلاغ مستحيل)، وتُفرّغ user_id للمجهول فيفقد '
  'صاحبُه بلاغَه. الآن السياق كلّه من الجلسة والإخفاء في العرض.';

REVOKE ALL ON FUNCTION public.submit_incident(TEXT, TEXT, TEXT, TEXT, BOOLEAN, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_incident(TEXT, TEXT, TEXT, TEXT, BOOLEAN, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_incident(TEXT, TEXT, TEXT, TEXT, BOOLEAN, JSONB) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ② ★★★ خيط التعليقات: صاحب البلاغ طرف في محادثته
--
--    السياسة القائمة تشترط `user_id = auth.uid()` — أي **كاتب التعليق**.
--    نُضيف سياسة قراءة ثانية: من يملك البلاغ يرى تعليقاته **غير
--    الداخلية**. والداخلية تبقى للموارد وحدها — وهنا يصير `is_internal`
--    ذا أثر لأول مرّة.
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS kyvzon_incident_comments_select_owner ON public.incident_comments;
CREATE POLICY kyvzon_incident_comments_select_owner ON public.incident_comments
  FOR SELECT
  USING (
    tenant_id = public.current_user_tenant_id()
    AND COALESCE(is_internal, FALSE) = FALSE
    AND EXISTS (
      SELECT 1 FROM public.incidents i
       WHERE i.id = public.incident_comments.incident_id
         AND i.tenant_id = public.incident_comments.tenant_id
         AND i.user_id = auth.uid())
  );

COMMENT ON POLICY kyvzon_incident_comments_select_owner ON public.incident_comments IS
  '★★★ 0342: صاحب البلاغ يرى الردود العلنية عليه. مُقاس قبل الإصلاح: '
  'بلاغ فيه 3 تعليقات — صاحبه يرى 1 (تعليقه هو) والموارد ترى 3 ⇒ '
  'المحادثة أحادية الاتجاه. والداخلية تبقى محجوبة (is_internal كان '
  'عموداً بلا أثر: صفر سياسات تذكره).';

-- ─────────────────────────────────────────────────────────────────────────
-- ③ بوّابة إضافة التعليق — tenant_id من الجلسة
--
--    `addComment` لا تمرّره فتُصدّ بـRLS. ونمنع الموظف من كتابة
--    ملاحظة «داخلية» (هي أداة إدارية).
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.add_incident_comment(UUID, TEXT, BOOLEAN);

CREATE FUNCTION public.add_incident_comment(
  p_incident_id UUID,
  p_text        TEXT,
  p_internal    BOOLEAN DEFAULT FALSE
) RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_uid    UUID := auth.uid();
  v_staff  BOOLEAN := public.current_user_is_staff();
  v_row    RECORD;
  v_id     UUID;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'INCIDENT_NO_CONTEXT: لا سياق مستخدم أو شركة'
      USING ERRCODE = 'check_violation';
  END IF;

  IF btrim(COALESCE(p_text,'')) = '' THEN
    RAISE EXCEPTION 'COMMENT_EMPTY: نصّ التعليق مطلوب'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_row FROM public.incidents
   WHERE id = p_incident_id AND tenant_id = v_tenant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INCIDENT_NOT_FOUND' USING ERRCODE = 'no_data_found';
  END IF;

  -- غير الموظفين الإداريين: صاحب البلاغ وحده يعلّق
  IF NOT v_staff AND v_row.user_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'COMMENT_NOT_PARTY: لست طرفاً في هذا البلاغ'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ★ الملاحظة الداخلية أداة إدارية — لا يكتبها الموظف
  IF COALESCE(p_internal, FALSE) AND NOT v_staff THEN
    RAISE EXCEPTION 'COMMENT_INTERNAL_STAFF_ONLY: الملاحظة الداخلية لفريق الموارد'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ★ التعليق على بلاغ مؤرشف لا معنى له
  IF v_row.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'INCIDENT_ARCHIVED: البلاغ مؤرشف'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.incident_comments (tenant_id, incident_id, user_id, text, is_internal)
  VALUES (v_tenant, p_incident_id, v_uid, btrim(p_text), COALESCE(p_internal, FALSE))
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

COMMENT ON FUNCTION public.add_incident_comment(UUID, TEXT, BOOLEAN) IS
  'إضافة تعليق مع tenant_id من الجلسة. قبل 0342 كانت addComment لا '
  'تمرّره فتُصدّ بـRLS. وتمنع الموظف من كتابة ملاحظة داخلية.';

REVOKE ALL ON FUNCTION public.add_incident_comment(UUID, TEXT, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_incident_comment(UUID, TEXT, BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION public.add_incident_comment(UUID, TEXT, BOOLEAN) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ④ قراءة الخيط — مع إخفاء هوية المُبلِّغ المجهول في تعليقاته أيضاً
--
--    البلاغ المجهول لا يُفيد إخفاؤه إن كشف اسمُ كاتبِ التعليق صاحبَه.
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.incident_thread(UUID);

CREATE FUNCTION public.incident_thread(p_incident_id UUID)
RETURNS TABLE (
  out_id          UUID,
  out_text        TEXT,
  out_is_internal BOOLEAN,
  out_author_id   UUID,
  out_author      TEXT,
  out_is_mine     BOOLEAN,
  out_created_at  TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER          -- ★ يحترم RLS جدول incident_comments عمداً
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT c.id,
         c.text,
         COALESCE(c.is_internal, FALSE),
         -- ★★ هوية كاتب التعليق تُخفى إن كان هو صاحب بلاغ مجهول
         CASE WHEN i.is_anonymous AND c.user_id = i.user_id
              THEN NULL ELSE c.user_id END,
         CASE WHEN i.is_anonymous AND c.user_id = i.user_id
              THEN 'مُبلِّغ مجهول'
              ELSE COALESCE(NULLIF(btrim(p.full_name), ''), '—')
         END::TEXT,
         (c.user_id = auth.uid()),
         c.created_at
    FROM public.incident_comments c
    JOIN public.incidents i ON i.id = c.incident_id
    LEFT JOIN public.profiles p ON p.id = c.user_id
   WHERE c.incident_id = p_incident_id
   ORDER BY c.created_at ASC;
END $$;

COMMENT ON FUNCTION public.incident_thread(UUID) IS
  'خيط تعليقات البلاغ. INVOKER فالرؤية محكومة بسياسات RLS: صاحب البلاغ '
  'يرى العلني، والموارد ترى الكل. ★ يُخفي اسم صاحب البلاغ المجهول في '
  'تعليقاته أيضاً — وإلا كُشفت الهوية من الخيط.';

REVOKE ALL ON FUNCTION public.incident_thread(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.incident_thread(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.incident_thread(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ⑤ `ai_analysis` في الصندوق — كان يُخزَّن ولا يُعرض (عطل ⑦)
--
--    نُعيد بناء `hr_incidents_inbox` بإضافة عمود واحد لا غير.
--    بقية الدالة منقولة **حرفياً** من 0341 وقُورنت سطراً بسطر.
-- ─────────────────────────────────────────────────────────────────────────
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
  out_ai_analysis JSONB,
  out_comment_count BIGINT,
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
           --   يُملأ وقت الرفع ولا يتبع profiles بعدها.
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
           -- ★ 0342: التحليل كان يُخزَّن ولا يُعرض إطلاقاً
           COALESCE(i.ai_analysis, '{}'::JSONB)                 AS f_ai,
           (SELECT count(*) FROM public.incident_comments c
             WHERE c.incident_id = i.id)                        AS f_ccount,
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
         f.f_age, f.f_arch, f.f_ai, f.f_ccount, f.f_created, f.f_updated,
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
  'صندوق بلاغات الموارد. ★ 0342: يُضيف out_ai_analysis (كان يُخزَّن ولا '
  'يُعرض) و out_comment_count. بقية المنطق من 0341: الاسم من profiles '
  'الحيّ · out_total · استبعاد المؤرشف · إخفاء الهوية من 0338.';

REVOKE ALL ON FUNCTION public.hr_incidents_inbox(TEXT, TEXT, TEXT, BOOLEAN, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_incidents_inbox(TEXT, TEXT, TEXT, BOOLEAN, INTEGER, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_incidents_inbox(TEXT, TEXT, TEXT, BOOLEAN, INTEGER, INTEGER) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ⑥ إثراء البلاغات القائمة بالسياق المفقود (عطل ⑤)
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE v_n INT;
BEGIN
  UPDATE public.incidents i
     SET employee_id   = e.id,
         department_id = COALESCE(i.department_id, e.department_id)
    FROM public.employees e
   WHERE i.employee_id IS NULL
     AND e.user_id = i.user_id
     AND e.tenant_id = i.tenant_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN
    RAISE NOTICE '0342: رُبِط % بلاغاً بسجلّ موظفه وقسمه', v_n;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- ⑦ فهرس يخدم عدّ التعليقات
-- ─────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_incident_comments_incident
  ON public.incident_comments (incident_id, created_at);
