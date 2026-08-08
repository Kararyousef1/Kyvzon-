-- ============================================================================
-- 0338_incident_anonymity_and_inbox.sql
--
-- البلاغات: حماية هوية المُبلِّغ المجهول · فصل شاشتَي الموظف والموارد.
--
-- ═══ العطل ①★★★ — البلاغ «المجهول» يكشف هوية صاحبه ═══════════════════════
--
--   `ProblemsList.tsx` تستعلم عن `incidents` مباشرةً بـ`select('*')`
--   ثم تبني الصفّ:
--
--     employeeName: isHR ? d.employee_name || 'موظف' : user.full_name,
--     department:   isHR ? d.department || ''        : user.department,
--     employeeId:   d.user_id,
--
--   **بلا أي فحص لـ`is_anonymous`.** والسطر 450 يعرض شارة «مجهول»
--   بينما الاسم معروض بجانبها.
--
--   الإثبات على Postgres — بلاغ بـ`is_anonymous = TRUE`:
--
--     employee_name = أحمد الموظف   ⇐ الاسم مكشوف رغم is_anonymous
--     user_id       = 6ec487e9-…    ⇐ والمعرّف أيضاً
--
--   ⇒ موظف يُبلّغ عن تحرّش أو فساد معتمداً على وعد «بلاغ مجهول»،
--     ومسؤول الموارد يرى اسمه كاملاً. هذه ليست ثغرة عرض — إنها
--     **إخلال بوعد صريح** قد يُعرّض المُبلِّغ للانتقام.
--
--   ★ الحل في القاعدة لا الواجهة: أي شاشة جديدة قد تُكرّر الخطأ.
--     الدالة تُخفي الهوية **قبل** أن تغادر البيانات القاعدة.
--
--   ★★ ويبقى `employee_id` مخفياً أيضاً — لا يكفي حجب الاسم:
--     من يملك قائمة الموظفين يربط المعرّف بالاسم في ثانية.
--
-- ═══ العطل ② — شاشة واحدة لدورين ══════════════════════════════════════════
--
--   `AppRouter.tsx:737`   employee/problems → <ProblemsList isHR={false} />
--   `AppRouter.tsx:1275`  hr/problems       → <ProblemsList isHR={true}  />
--
--   539 سطراً يخدم الدورين بمفتاح واحد. والدوران يحتاجان شاشتين:
--
--     الموظف يحتاج            | مسؤول الموارد يحتاج
--     ─────────────────────── | ──────────────────────────
--     بلاغاتي أنا             | كل بلاغات الشركة
--     تقديم بلاغ              | إسناد البلاغ لمسؤول
--     متابعة حالة بلاغي       | تغيير الحالة · الإغلاق
--     —                       | تصنيف · أولوية · SLA
--     —                       | تحليلات: أي قسم يبلّغ أكثر
--
--   هذه الجولة تبني **طبقة البيانات** للفصل. تقسيم المكوّن نفسه
--   يأتي بعدها.
--
-- ═══ ما يفعله هذا المايجريشن ══════════════════════════════════════════════
--   ① my_incidents()          — بلاغات الموظف (شاشته)
--   ② hr_incidents_inbox()    — صندوق الموارد مع إخفاء الهوية
--   ③ hr_incident_stats()     — تحليلات الصندوق
--   ④ assign_incident()       — إسناد البلاغ (كان مفقوداً)
--   ⑤ فهارس
--
-- ─── حقائق بنيوية مُحقَّقة (information_schema/pg_constraint) ─────────────
--   incidents: id·title·description·category·severity·status NOT NULL
--     is_anonymous BOOLEAN NOT NULL
--     ★ حقول مكرّرة: employee_name نصّ **و** employee_id مرجع
--       department نصّ **و** department_id مرجع
--     user_id → auth.users · employee_id → employees
--     reported_by → profiles · assigned_to → employees
--   سياسة kyvzon_incidents_select:
--     tenant_id = current_user_tenant_id()
--     AND (current_user_is_staff() OR user_id = auth.uid())
--   ⇒ الموظف يرى بلاغاته بـ`user_id` لا `employee_id`
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- ① بلاغاتي — شاشة الموظف
--
--    ★ الترشيح بـ`user_id` لا `employee_id`: هذا ما تفعله السياسة
--      `kyvzon_incidents_select`، والبلاغات القديمة سُجّلت به.
--      الترشيح بـ`employee_id` كان سيُخفي بلاغات الموظف عن نفسه.
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.my_incidents(TEXT, INTEGER, INTEGER);

CREATE FUNCTION public.my_incidents(
  p_status TEXT    DEFAULT NULL,
  p_limit  INTEGER DEFAULT 100,
  p_offset INTEGER DEFAULT 0
) RETURNS TABLE(
  out_id           UUID,
  out_title        TEXT,
  out_description  TEXT,
  out_category     TEXT,
  out_severity     TEXT,
  out_status       TEXT,
  out_is_anonymous BOOLEAN,
  out_assigned_to  UUID,
  out_assignee     TEXT,
  out_created_at   TIMESTAMPTZ,
  out_updated_at   TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_uid    UUID := auth.uid();
  v_lim    INTEGER := GREATEST(1, LEAST(COALESCE(p_limit, 100), 500));
  v_off    INTEGER := GREATEST(0, COALESCE(p_offset, 0));
BEGIN
  IF v_tenant IS NULL OR v_uid IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT i.id,
         i.title::TEXT,
         i.description,
         i.category::TEXT,
         i.severity::TEXT,
         i.status::TEXT,
         i.is_anonymous,
         i.assigned_to,
         COALESCE(
           NULLIF(btrim(e.first_name || ' ' || e.last_name), ''),
           '—'
         )::TEXT,
         i.created_at,
         i.updated_at
    FROM public.incidents i
    LEFT JOIN public.employees e ON e.id = i.assigned_to
   WHERE i.tenant_id = v_tenant
     AND i.user_id = v_uid
     AND (p_status IS NULL OR i.status = p_status)
   ORDER BY i.created_at DESC
   LIMIT v_lim OFFSET v_off;
END $$;

COMMENT ON FUNCTION public.my_incidents(TEXT,INTEGER,INTEGER) IS
  'بلاغات الموظف نفسه. الترشيح بـuser_id لا employee_id — هذا ما '
  'تفعله سياسة kyvzon_incidents_select، والبلاغات القديمة سُجّلت به.';

REVOKE ALL ON FUNCTION public.my_incidents(TEXT,INTEGER,INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.my_incidents(TEXT,INTEGER,INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.my_incidents(TEXT,INTEGER,INTEGER) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ② صندوق الموارد البشرية — العطل ①★★★
--
--    ★★★ إخفاء الهوية يحدث **هنا** لا في الواجهة: أي شاشة جديدة
--      تستدعي هذه الدالة تحصل على الحماية مجاناً، ولا يمكن نسيانها.
--
--    ★★ ونُخفي `employee_id` أيضاً لا الاسم وحده: من يملك قائمة
--      الموظفين يربط المعرّف بالاسم فوراً.
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.hr_incidents_inbox(TEXT, TEXT, TEXT, INTEGER, INTEGER);

CREATE FUNCTION public.hr_incidents_inbox(
  p_status   TEXT    DEFAULT NULL,
  p_severity TEXT    DEFAULT NULL,
  p_search   TEXT    DEFAULT NULL,
  p_limit    INTEGER DEFAULT 100,
  p_offset   INTEGER DEFAULT 0
) RETURNS TABLE(
  out_id           UUID,
  out_title        TEXT,
  out_description  TEXT,
  out_category     TEXT,
  out_severity     TEXT,
  out_status       TEXT,
  out_is_anonymous BOOLEAN,
  out_employee_id  UUID,
  out_reporter     TEXT,
  out_department   TEXT,
  out_assigned_to  UUID,
  out_assignee     TEXT,
  out_age_hours    NUMERIC,
  out_created_at   TIMESTAMPTZ,
  out_updated_at   TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_lim    INTEGER := GREATEST(1, LEAST(COALESCE(p_limit, 100), 500));
  v_off    INTEGER := GREATEST(0, COALESCE(p_offset, 0));
  v_q      TEXT := NULLIF(btrim(COALESCE(p_search, '')), '');
BEGIN
  IF v_tenant IS NULL THEN RETURN; END IF;

  -- ★ الصندوق لموظفي الموارد والإدارة وحدهم. السياسة تسمح لكل
  --   staff بالقراءة، لكن الصندوق سطح إداري لا يُفتح لأي دور.
  IF NOT public.current_user_is_staff() THEN RETURN; END IF;

  RETURN QUERY
  SELECT i.id,
         i.title::TEXT,
         i.description,
         i.category::TEXT,
         i.severity::TEXT,
         i.status::TEXT,
         i.is_anonymous,
         -- ★★★ الهوية مخفيّة عند is_anonymous — في القاعدة لا الواجهة
         CASE WHEN i.is_anonymous THEN NULL ELSE i.employee_id END,
         CASE WHEN i.is_anonymous THEN 'مُبلِّغ مجهول'
              ELSE COALESCE(
                     NULLIF(btrim(i.employee_name), ''),
                     NULLIF(btrim(pr.full_name), ''),
                     '—')
         END::TEXT,
         -- ★★ والقسم أيضاً: في شركة صغيرة القسم يكشف الشخص
         CASE WHEN i.is_anonymous THEN '—'
              ELSE COALESCE(
                     NULLIF(btrim(i.department), ''),
                     NULLIF(btrim(d.name_ar), ''),
                     '—')
         END::TEXT,
         i.assigned_to,
         COALESCE(
           NULLIF(btrim(ae.first_name || ' ' || ae.last_name), ''),
           '—'
         )::TEXT,
         round(EXTRACT(EPOCH FROM (NOW() - i.created_at)) / 3600.0, 1),
         i.created_at,
         i.updated_at
    FROM public.incidents i
    LEFT JOIN public.profiles    pr ON pr.id = i.user_id
    LEFT JOIN public.departments d  ON d.id  = i.department_id
    LEFT JOIN public.employees   ae ON ae.id = i.assigned_to
   WHERE i.tenant_id = v_tenant
     AND (p_status   IS NULL OR i.status   = p_status)
     AND (p_severity IS NULL OR i.severity = p_severity)
     AND (
       v_q IS NULL
       OR i.title ILIKE '%' || v_q || '%'
       OR i.description ILIKE '%' || v_q || '%'
       -- ★★ البحث بالاسم **لا يشمل** البلاغات المجهولة: وإلا كُشفت
       --   الهوية بالاستنتاج — يكتب اسماً فتظهر بلاغاته «المجهولة».
       OR (NOT i.is_anonymous AND i.employee_name ILIKE '%' || v_q || '%')
     )
   ORDER BY
     -- الحرج أولاً ثم الأقدم: البلاغ الحرج المُعلَّق أخطر ما في الصندوق
     CASE i.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2
                     WHEN 'medium'   THEN 3 ELSE 4 END,
     i.created_at ASC
   LIMIT v_lim OFFSET v_off;
END $$;

COMMENT ON FUNCTION public.hr_incidents_inbox(TEXT,TEXT,TEXT,INTEGER,INTEGER) IS
  'صندوق بلاغات الموارد البشرية. ★★★ يُخفي هوية المُبلِّغ المجهول في '
  'القاعدة: الاسم والمعرّف والقسم. ProblemsList كانت تعرض '
  'employee_name بلا فحص is_anonymous — إخلال بوعد صريح للمُبلِّغ.';

REVOKE ALL ON FUNCTION public.hr_incidents_inbox(TEXT,TEXT,TEXT,INTEGER,INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_incidents_inbox(TEXT,TEXT,TEXT,INTEGER,INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_incidents_inbox(TEXT,TEXT,TEXT,INTEGER,INTEGER)
  TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ③ تحليلات الصندوق
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.hr_incident_stats(INTEGER);

CREATE FUNCTION public.hr_incident_stats(p_days INTEGER DEFAULT 30)
RETURNS TABLE(
  out_total        INTEGER,
  out_pending      INTEGER,
  out_in_progress  INTEGER,
  out_resolved     INTEGER,
  out_critical     INTEGER,
  out_unassigned   INTEGER,
  out_anonymous    INTEGER,
  out_oldest_hours NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_d      INTEGER := GREATEST(1, LEAST(COALESCE(p_days, 30), 365));
BEGIN
  -- ★ صفّ أصفار لا «لا شيء»: الواجهة تعرض بطاقات دائماً
  IF v_tenant IS NULL OR NOT public.current_user_is_staff() THEN
    RETURN QUERY SELECT 0,0,0,0,0,0,0, 0::NUMERIC;
    RETURN;
  END IF;

  RETURN QUERY
  WITH w AS (
    SELECT i.status, i.severity, i.assigned_to, i.is_anonymous, i.created_at
      FROM public.incidents i
     WHERE i.tenant_id = v_tenant
       AND i.created_at >= NOW() - (v_d || ' days')::INTERVAL
  )
  SELECT count(*)::INTEGER,
         count(*) FILTER (WHERE status = 'pending')::INTEGER,
         count(*) FILTER (WHERE status = 'in_progress')::INTEGER,
         count(*) FILTER (WHERE status IN ('resolved','closed'))::INTEGER,
         count(*) FILTER (WHERE severity = 'critical')::INTEGER,
         -- ★ غير المُسنَد **والمفتوح**: بلاغ محلول بلا مُسنَد ليس مشكلة
         count(*) FILTER (WHERE assigned_to IS NULL
                            AND status NOT IN ('resolved','closed'))::INTEGER,
         count(*) FILTER (WHERE is_anonymous)::INTEGER,
         COALESCE(
           round(EXTRACT(EPOCH FROM (
             NOW() - min(created_at) FILTER (WHERE status NOT IN ('resolved','closed'))
           )) / 3600.0, 1), 0)
    FROM w;
END $$;

COMMENT ON FUNCTION public.hr_incident_stats(INTEGER) IS
  'تحليلات صندوق البلاغات. «غير مُسنَد» يعدّ المفتوح وحده — بلاغ '
  'محلول بلا مُسنَد ليس مشكلة تحتاج تنبيهاً.';

REVOKE ALL ON FUNCTION public.hr_incident_stats(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_incident_stats(INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_incident_stats(INTEGER) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ④ إسناد البلاغ — كان مفقوداً تماماً
--
--    لا شاشة ولا دالة تُسنِد بلاغاً لمسؤول. `assigned_to` عمود موجود
--    ولا شيء يكتب فيه.
--
--    ★ VOLATILE — تكتب (درس 0320)
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.assign_incident(UUID, UUID);

CREATE FUNCTION public.assign_incident(
  p_incident_id UUID,
  p_employee_id UUID DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_n      INTEGER;
BEGIN
  IF v_tenant IS NULL THEN RETURN FALSE; END IF;
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED_TO_ASSIGN';
  END IF;

  -- ★ المُسنَد إليه يجب أن يكون من نفس المستأجر — وإلا أُسنِد بلاغ
  --   لموظف شركة أخرى.
  IF p_employee_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.employees e
     WHERE e.id = p_employee_id AND e.tenant_id = v_tenant
  ) THEN
    RAISE EXCEPTION 'ASSIGNEE_NOT_IN_TENANT';
  END IF;

  UPDATE public.incidents
     SET assigned_to = p_employee_id,
         updated_at  = NOW()
   WHERE id = p_incident_id
     AND tenant_id = v_tenant;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n > 0;
END $$;

COMMENT ON FUNCTION public.assign_incident(UUID,UUID) IS
  'إسناد بلاغ لموظف (أو إلغاء الإسناد بـNULL). كان assigned_to عموداً '
  'بلا أي كاتب. يرفض المُسنَد إليه من مستأجر آخر.';

REVOKE ALL ON FUNCTION public.assign_incident(UUID,UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assign_incident(UUID,UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.assign_incident(UUID,UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ⑤ فهارس
-- ─────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_incidents_user_created
  ON public.incidents (tenant_id, user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_incidents_tenant_status
  ON public.incidents (tenant_id, status, created_at DESC);

-- فهرس جزئي: المفتوح غير المُسنَد هو ما يُستعلَم عنه بإلحاح
CREATE INDEX IF NOT EXISTS idx_incidents_unassigned_open
  ON public.incidents (tenant_id, created_at)
  WHERE assigned_to IS NULL AND status NOT IN ('resolved','closed');
