-- ============================================================================
-- 0339_leave_request_integrity.sql
--
-- نزاهة طلبات الإجازات والزمنيات: الرصيد · التداخل · تضارب المصالح ·
-- الأيتام · الإلغاء بدل الحذف.
--
-- ══ الأعطال المُثبَتة تشغيلياً في هذه الجولة ═══════════════════════════
--   كلّ رقم أدناه مأخوذ من تشغيل فعلي على Postgres 17 محلي بعد تطبيق
--   الـ267 مايجريشن من الصفر. لا شيء منها تخمين.
--
--  ① ★★★ `approved_by` يستقبل `employees.id` بينما FK يشير إلى `profiles`.
--     `LeaveRequestPage.tsx:255` — `leaveService.approveLeave(id, realEmployeeId || user?.id || '')`
--     و`realEmployeeId` مضبوط من `employees[0].id` (السطر 165).
--     مُقاس بجلسة RLS حقيقية (SET ROLE authenticated · دور hr):
--        UPDATE leaves SET approved_by = <employees.id>
--        ⇒ insert or update on table "leaves" violates foreign key
--          constraint "leaves_approved_by_fkey"
--     الأثر: زرّ «موافقة» في بوابة الموارد البشرية **يفشل دائماً** حين
--     يكون للمُعتمِد سجلّ موظف — أي في الحالة الطبيعية. ولا يفشل حين
--     لا يكون له سجلّ (يسقط إلى `user?.id`) فيبدو العطل متقطّعاً.
--     ⇒ نفس عائلة عطل 0335: `profiles.id` ≠ `employees.id`.
--
--  ② ★★★ المدير يعتمد إجازة **نفسه**.
--     `create_hr_approval` (0153) تبني السلسلة من `resolve_department_chain`
--     بلا أي استثناء للطالب. مُقاس: مدير قسم طلب إجازة لنفسه ⇒
--        خطوات يكون فيها المدير معتمِدَ نفسه = 2
--        بعد قرارين ⇒ hr_approval_requests='approved' · leaves.status='موافق'
--     الأثر: كل مدير/مشرف قسم يمنح نفسه إجازات بلا رقيب.
--
--  ③ ★★ الرصيد لا يتحرك إطلاقاً — لا حجز ولا خصم.
--     مُقاس: موظف برصيد سنوي 21 · طلب 5 أيام · سلسلة اعتماد كاملة بقرارين
--        ⇒ leaves.status='موافق' · annual_used=0.000 · annual_pending=0.000
--     الأثر: `leave_balance` جدول زينة. الموظف يأخذ إجازات بلا نهاية
--     و`checkHajjEligibility` وحدها ما يمنع شيئاً (وهي في المتصفح).
--
--  ④ ★★ لا تحقق من الرصيد عند الطلب.
--     مُقاس: رصيد سنوي = 5 · طلب 30 يوماً ⇒ قُبِل بلا اعتراض.
--
--  ⑤ ★★ لا منع للتداخل.
--     مُقاس: طلبان على **نفس المدى حرفياً** (سنوية + مرضية) ⇒ كلاهما قُبِل.
--
--  ⑥ `working_days_count` يُحسب في المتصفح ويُكتب كما هو.
--     مُقاس: INSERT بيومين تقويميين و`working_days_count = 9999` ⇒ قُبِل.
--     `calculateWorkingDays` في `src/utils/leaveUtils.ts:173` تستثني الجمعة
--     فقط ولا تعرف `holidays` (المُعامل الثالث لا يُمرَّر من الصفحة أبداً).
--
--  ⑦ تواريخ الماضي البعيد مقبولة.
--     مُقاس: `date_from = current_date - 400` ⇒ قُبِل.
--
--  ⑧ ★★ `status` نصّ حرّ بلا CHECK.
--     مُقاس: `UPDATE leaves SET status='مقبووول'` ⇒ قُبِل.
--     كل الفلاتر في `LeaveRequestPage.tsx:363-365` تقارن بثلاث قيم — أي
--     قيمة أخرى تختفي من العدّادات وتبقى في القائمة.
--
--  ⑨ ★★ الطلبات اليتيمة (بند معلّق من الجولات السابقة — الآن مُقاس).
--     `hr_approval_requests.related_id` بلا FK (متعدد الأشكال عمداً).
--     مُقاس: إنشاء إجازة + سلسلة ثم `DELETE FROM leaves`
--        ⇒ hr_approval_requests الباقية = 1
--        ⇒ خطوات حيّة (active/pending) في صندوق المدير = 2
--     الأثر: صندوق موافقات المدير يعرض طلباً لإجازة غير موجودة.
--
--  ⑩ ★ قسم بلا معتمِدين ⇒ حالتان متناقضتان.
--     مُقاس: قسم بلا `supervisor_id`/`manager_id`/`direct_manager_id`
--        ⇒ hr_approval_requests.status = 'approved'  (اعتماد تلقائي)
--        ⇒ leaves.status = 'انتظار'                   ★ لم تُزامَن
--     السبب: فرع «لا معتمِدين» في `create_hr_approval` لا يستدعي
--     `sync_hr_source_status`. الموظف يرى «قيد المراجعة» أبداً.
--
--  ⑪ لا سقف للزمنيات. مُقاس: 8 طلبات زمنية في **يوم واحد** ⇒ كلها قُبِلت.
--
-- ══ المبدأ ══════════════════════════════════════════════════════════════
--   الطلب لا يُنشأ من المتصفح بـINSERT خام. يمرّ بدالة واحدة تحسب المدة
--   وتتحقق من الرصيد والتداخل وتحجز — ذرّياً. والمعتمِد لا يكون الطالب.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- ① تطبيع الحالات القائمة ثم CHECK
--
--    نُطبّع قبل القيد لأن العمود كان نصّاً حرّاً (عطل ⑧) وقد تحمل
--    قواعد التطوير قيماً لا نعرفها.
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE v_n INT;
BEGIN
  UPDATE public.leaves SET status = 'انتظار'
   WHERE status NOT IN ('انتظار','موافق','مرفوض','ملغى');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN
    RAISE NOTICE '0339: طُبِّعت % حالة إجازة خارج القيم المعروفة إلى ''انتظار''', v_n;
  END IF;

  UPDATE public.permissions_request SET status = 'انتظار'
   WHERE status NOT IN ('انتظار','موافق','مرفوض','ملغى');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN
    RAISE NOTICE '0339: طُبِّعت % حالة زمنية خارج القيم المعروفة', v_n;
  END IF;
END $$;

ALTER TABLE public.leaves DROP CONSTRAINT IF EXISTS leaves_status_check;
ALTER TABLE public.leaves ADD CONSTRAINT leaves_status_check
  CHECK (status IN ('انتظار','موافق','مرفوض','ملغى'));

ALTER TABLE public.permissions_request
  DROP CONSTRAINT IF EXISTS permissions_request_status_check;
ALTER TABLE public.permissions_request ADD CONSTRAINT permissions_request_status_check
  CHECK (status IN ('انتظار','موافق','مرفوض','ملغى'));

-- ★ 'ملغى' حالة إلغاء الموظف لطلبه — بديل الحذف النهائي الممنوع.
COMMENT ON CONSTRAINT leaves_status_check ON public.leaves IS
  'قبل 0339 كان status نصّاً حرّاً: UPDATE ... SET status=''مقبووول'' كان يُقبَل '
  'ويختفي من كل عدّادات LeaveRequestPage (عطل ⑧).';

-- ─────────────────────────────────────────────────────────────────────────
-- ② حساب أيام العمل في القاعدة — مصدر الحقيقة الوحيد
--
--    يستثني الجمعة (تطابق WEEKEND_DAYS في leaveUtils.ts:155) **و**
--    `holidays` الخاصة بالمستأجر — وهو ما لا يفعله المتصفح إطلاقاً
--    لأن المُعامل `holidays` في calculateWorkingDays لا يُمرَّر (عطل ⑥).
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.leave_working_days(UUID, DATE, DATE);

CREATE FUNCTION public.leave_working_days(
  p_tenant UUID,
  p_from   DATE,
  p_to     DATE
) RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(count(*), 0)::INTEGER
    FROM generate_series(p_from, p_to, INTERVAL '1 day') AS d(day)
   WHERE EXTRACT(ISODOW FROM d.day) <> 5          -- ISO: 5 = الجمعة
     AND NOT EXISTS (
       SELECT 1 FROM public.holidays h
        WHERE h.tenant_id = p_tenant
          AND h.date = d.day::DATE);
$$;

COMMENT ON FUNCTION public.leave_working_days(UUID, DATE, DATE) IS
  'أيام العمل الفعلية: تستثني الجمعة وعطل المستأجر. مصدر الحقيقة بدل '
  'calculateWorkingDays في المتصفح التي لا تعرف holidays (عطل ⑥ في 0339).';

REVOKE ALL ON FUNCTION public.leave_working_days(UUID, DATE, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.leave_working_days(UUID, DATE, DATE) FROM anon;
GRANT EXECUTE ON FUNCTION public.leave_working_days(UUID, DATE, DATE) TO authenticated;

-- معاينة للنموذج: المستأجر من الجلسة لا من المتصفح.
-- بدونها يستطيع المتصفح تمرير tenant_id غيره ويستنتج عدد عطلاته.
DROP FUNCTION IF EXISTS public.leave_preview_working_days(DATE, DATE);

CREATE FUNCTION public.leave_preview_working_days(p_from DATE, p_to DATE)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
           WHEN p_from IS NULL OR p_to IS NULL OR p_from > p_to THEN 0
           ELSE public.leave_working_days(public.current_user_tenant_id(), p_from, p_to)
         END;
$$;

COMMENT ON FUNCTION public.leave_preview_working_days(DATE, DATE) IS
  'معاينة أيام العمل للنموذج — المستأجر من الجلسة. الرقم المعروض في '
  'المتصفح كان يخالف المخزَّن لأن calculateWorkingDays لا تعرف holidays.';

REVOKE ALL ON FUNCTION public.leave_preview_working_days(DATE, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.leave_preview_working_days(DATE, DATE) FROM anon;
GRANT EXECUTE ON FUNCTION public.leave_preview_working_days(DATE, DATE) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ③ محرّك الرصيد — حجز عند الطلب · خصم عند الاعتماد · تحرير عند الرفض
--
--    الخريطة (من DEFAULT_LEAVE_SETTINGS في leaveUtils.ts:78):
--      'سنوية'  → annual_*      'مرضية' → sick_*
--      'حج'     → hajj_taken    البقية  → بلا رصيد (وفاة/زواج/امتحانات/…)
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.leave_balance_bucket(TEXT);

CREATE FUNCTION public.leave_balance_bucket(p_leave_type TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_leave_type
           WHEN 'سنوية' THEN 'annual'
           WHEN 'مرضية' THEN 'sick'
           ELSE NULL
         END;
$$;

COMMENT ON FUNCTION public.leave_balance_bucket(TEXT) IS
  'أي دلو رصيد يخصّ نوع الإجازة. NULL = نوع بلا رصيد (وفاة/زواج/تكليف/…).';

CREATE OR REPLACE FUNCTION public.tg_leave_balance_movement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bucket TEXT;
  v_days   NUMERIC;
  v_year   INT;
  v_old    TEXT;
  v_new    TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_old := OLD.status; v_new := 'ملغى';
    v_bucket := public.leave_balance_bucket(OLD.leave_type);
    v_days   := OLD.working_days_count;
    v_year   := EXTRACT(YEAR FROM OLD.date_from)::INT;
  ELSIF TG_OP = 'INSERT' THEN
    v_old := NULL; v_new := NEW.status;
    v_bucket := public.leave_balance_bucket(NEW.leave_type);
    v_days   := NEW.working_days_count;
    v_year   := EXTRACT(YEAR FROM NEW.date_from)::INT;
  ELSE
    v_old := OLD.status; v_new := NEW.status;
    v_bucket := public.leave_balance_bucket(NEW.leave_type);
    v_days   := NEW.working_days_count;
    v_year   := EXTRACT(YEAR FROM NEW.date_from)::INT;
    IF v_old IS NOT DISTINCT FROM v_new THEN RETURN NEW; END IF;
  END IF;

  IF v_bucket IS NULL OR COALESCE(v_days,0) = 0 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- سطر رصيد للسنة المعنية — يُنشأ عند الحاجة
  INSERT INTO public.leave_balance (tenant_id, employee_id, year)
  VALUES (COALESCE(NEW.tenant_id, OLD.tenant_id),
          COALESCE(NEW.employee_id, OLD.employee_id), v_year)
  ON CONFLICT (tenant_id, employee_id, year) DO NOTHING;

  -- ── الانتقالات ────────────────────────────────────────────────────
  --   → 'انتظار'  : حجز   (pending +=)
  --   'انتظار' → 'موافق' : تثبيت (pending -= · used +=)
  --   'انتظار' → مرفوض/ملغى : تحرير (pending -=)
  --   'موافق'  → مرفوض/ملغى : ردّ    (used -=)
  IF v_old IS DISTINCT FROM 'انتظار' AND v_new = 'انتظار' THEN
    IF v_bucket = 'annual' THEN
      UPDATE public.leave_balance SET annual_pending = annual_pending + v_days
       WHERE tenant_id = NEW.tenant_id AND employee_id = NEW.employee_id AND year = v_year;
    ELSE
      UPDATE public.leave_balance SET sick_pending = sick_pending + v_days
       WHERE tenant_id = NEW.tenant_id AND employee_id = NEW.employee_id AND year = v_year;
    END IF;

  ELSIF v_old = 'انتظار' AND v_new = 'موافق' THEN
    IF v_bucket = 'annual' THEN
      UPDATE public.leave_balance
         SET annual_pending = GREATEST(annual_pending - v_days, 0),
             annual_used    = annual_used + v_days
       WHERE tenant_id = NEW.tenant_id AND employee_id = NEW.employee_id AND year = v_year;
    ELSE
      UPDATE public.leave_balance
         SET sick_pending = GREATEST(sick_pending - v_days, 0),
             sick_used    = sick_used + v_days
       WHERE tenant_id = NEW.tenant_id AND employee_id = NEW.employee_id AND year = v_year;
    END IF;

  ELSIF v_old = 'انتظار' AND v_new IN ('مرفوض','ملغى') THEN
    IF v_bucket = 'annual' THEN
      UPDATE public.leave_balance SET annual_pending = GREATEST(annual_pending - v_days, 0)
       WHERE tenant_id = COALESCE(NEW.tenant_id, OLD.tenant_id)
         AND employee_id = COALESCE(NEW.employee_id, OLD.employee_id) AND year = v_year;
    ELSE
      UPDATE public.leave_balance SET sick_pending = GREATEST(sick_pending - v_days, 0)
       WHERE tenant_id = COALESCE(NEW.tenant_id, OLD.tenant_id)
         AND employee_id = COALESCE(NEW.employee_id, OLD.employee_id) AND year = v_year;
    END IF;

  ELSIF v_old = 'موافق' AND v_new IN ('مرفوض','ملغى') THEN
    IF v_bucket = 'annual' THEN
      UPDATE public.leave_balance SET annual_used = GREATEST(annual_used - v_days, 0)
       WHERE tenant_id = COALESCE(NEW.tenant_id, OLD.tenant_id)
         AND employee_id = COALESCE(NEW.employee_id, OLD.employee_id) AND year = v_year;
    ELSE
      UPDATE public.leave_balance SET sick_used = GREATEST(sick_used - v_days, 0)
       WHERE tenant_id = COALESCE(NEW.tenant_id, OLD.tenant_id)
         AND employee_id = COALESCE(NEW.employee_id, OLD.employee_id) AND year = v_year;
    END IF;
  END IF;

  -- إجازة الحجّ مرّة واحدة في الخدمة (checkHajjEligibility تقرأ hajj_taken)
  IF TG_OP <> 'DELETE' AND NEW.leave_type = 'حج' AND v_new = 'موافق' THEN
    UPDATE public.leave_balance SET hajj_taken = TRUE
     WHERE tenant_id = NEW.tenant_id AND employee_id = NEW.employee_id AND year = v_year;
  END IF;

  RETURN COALESCE(NEW, OLD);
END $$;

COMMENT ON FUNCTION public.tg_leave_balance_movement() IS
  'حركة رصيد الإجازات. قبل 0339: 5 أيام سنوية معتمَدة بسلسلة كاملة تركت '
  'annual_used=0.000 و annual_pending=0.000 — الرصيد لم يتحرك قط (عطل ③).';

DROP TRIGGER IF EXISTS trg_leave_balance_movement ON public.leaves;
CREATE TRIGGER trg_leave_balance_movement
  AFTER INSERT OR UPDATE OF status OR DELETE ON public.leaves
  FOR EACH ROW EXECUTE FUNCTION public.tg_leave_balance_movement();

-- ─────────────────────────────────────────────────────────────────────────
-- ④ بوّابة الطلب — دالة واحدة ذرّية بدل INSERT خام من المتصفح
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.submit_leave_request(TEXT, DATE, DATE, TEXT, TEXT);

CREATE FUNCTION public.submit_leave_request(
  p_leave_type     TEXT,
  p_date_from      DATE,
  p_date_to        DATE,
  p_reason         TEXT DEFAULT NULL,
  p_attachment_url TEXT DEFAULT NULL
) RETURNS TABLE (
  out_leave_id     UUID,
  out_request_id   UUID,
  out_working_days INTEGER
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_emp    UUID := public.current_user_employee_id();
  v_days   INTEGER;
  v_bucket TEXT;
  v_year   INT := EXTRACT(YEAR FROM p_date_from)::INT;
  v_total  NUMERIC;
  v_taken  NUMERIC;
  v_clash  INT;
  v_hajj   BOOLEAN;
  v_lv     UUID;
  v_req    UUID;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'LEAVE_NO_TENANT: لا سياق مستأجر' USING ERRCODE = 'check_violation';
  END IF;

  -- ★ لا نثق بمعرّف يأتي من المتصفح. نشتقّه من الجلسة.
  --   عطل 0335 (تمرير profiles.id مكان employees.id) لا يتكرر هنا.
  IF v_emp IS NULL THEN
    RAISE EXCEPTION 'LEAVE_NO_EMPLOYEE: لا سجلّ موظف مرتبط بحسابك'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_date_from IS NULL OR p_date_to IS NULL OR p_date_from > p_date_to THEN
    RAISE EXCEPTION 'LEAVE_BAD_RANGE: مدى تواريخ غير صالح'
      USING ERRCODE = 'check_violation';
  END IF;

  -- عطل ⑦: الماضي البعيد. نسمح بأسبوع للخلف (تسوية بأثر رجعي مشروعة).
  IF p_date_from < current_date - 7 THEN
    RAISE EXCEPTION 'LEAVE_TOO_OLD: لا يمكن طلب إجازة بدأت قبل أكثر من أسبوع'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.leave_settings
                  WHERE tenant_id = v_tenant AND leave_type = p_leave_type)
     AND p_leave_type NOT IN ('سنوية','مرضية','وفاة_أول','وفاة_ثاني','زواج',
                              'امتحانات','غير_مدفوعة','حج','تكليف') THEN
    RAISE EXCEPTION 'LEAVE_BAD_TYPE: نوع إجازة غير معروف: %', p_leave_type
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── عطل ⑥: المدة تُحسب هنا، لا في المتصفح ─────────────────────────
  v_days := public.leave_working_days(v_tenant, p_date_from, p_date_to);
  IF v_days = 0 THEN
    RAISE EXCEPTION 'LEAVE_NO_WORKDAYS: المدى لا يحتوي أيام عمل فعلية'
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── عطل ⑤: التداخل مع طلب قائم ───────────────────────────────────
  SELECT count(*) INTO v_clash
    FROM public.leaves l
   WHERE l.tenant_id   = v_tenant
     AND l.employee_id = v_emp
     AND l.status IN ('انتظار','موافق')
     AND l.date_from  <= p_date_to
     AND l.date_to    >= p_date_from;

  IF v_clash > 0 THEN
    RAISE EXCEPTION
      'LEAVE_OVERLAP: لديك % طلب إجازة يتداخل مع هذا المدى', v_clash
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── عطل ④: الرصيد ────────────────────────────────────────────────
  v_bucket := public.leave_balance_bucket(p_leave_type);
  IF v_bucket IS NOT NULL THEN
    INSERT INTO public.leave_balance (tenant_id, employee_id, year)
    VALUES (v_tenant, v_emp, v_year)
    ON CONFLICT (tenant_id, employee_id, year) DO NOTHING;

    IF v_bucket = 'annual' THEN
      SELECT annual_total, annual_used + annual_pending INTO v_total, v_taken
        FROM public.leave_balance
       WHERE tenant_id = v_tenant AND employee_id = v_emp AND year = v_year;
    ELSE
      SELECT sick_total, sick_used + sick_pending INTO v_total, v_taken
        FROM public.leave_balance
       WHERE tenant_id = v_tenant AND employee_id = v_emp AND year = v_year;
    END IF;

    IF v_taken + v_days > v_total THEN
      RAISE EXCEPTION
        'LEAVE_INSUFFICIENT_BALANCE: الرصيد المتبقّي % يوم، والمطلوب % يوم',
        (v_total - v_taken), v_days
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- ── الحجّ مرّة واحدة (كان يُفحص في المتصفح وحده) ─────────────────
  IF p_leave_type = 'حج' THEN
    SELECT bool_or(hajj_taken) INTO v_hajj
      FROM public.leave_balance
     WHERE tenant_id = v_tenant AND employee_id = v_emp;
    IF COALESCE(v_hajj, FALSE) THEN
      RAISE EXCEPTION 'LEAVE_HAJJ_USED: إجازة الحج تُمنح مرّة واحدة في الخدمة'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  INSERT INTO public.leaves (tenant_id, employee_id, leave_type, date_from,
                             date_to, working_days_count, status, reason,
                             attachment_url)
  VALUES (v_tenant, v_emp, p_leave_type, p_date_from, p_date_to, v_days,
          'انتظار', NULLIF(btrim(COALESCE(p_reason,'')), ''),
          NULLIF(btrim(COALESCE(p_attachment_url,'')), ''))
  RETURNING id INTO v_lv;

  -- سلسلة الاعتماد — تُنشأ في نفس المعاملة، فلا يبقى طلب بلا سلسلة
  v_req := public.create_hr_approval('leave', v_lv, v_emp);

  out_leave_id     := v_lv;
  out_request_id   := v_req;
  out_working_days := v_days;
  RETURN NEXT;
END $$;

COMMENT ON FUNCTION public.submit_leave_request(TEXT, DATE, DATE, TEXT, TEXT) IS
  'بوّابة طلب الإجازة الوحيدة: تحسب المدة وتفحص التداخل والرصيد وتحجز '
  'وتُنشئ السلسلة ذرّياً. قبل 0339 كان المتصفح يُدرج مباشرةً: طلب 30 يوماً '
  'على رصيد 5 قُبِل، وطلبان على نفس المدى قُبِلا (أعطال ④⑤ في 0339).';

REVOKE ALL ON FUNCTION public.submit_leave_request(TEXT, DATE, DATE, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_leave_request(TEXT, DATE, DATE, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_leave_request(TEXT, DATE, DATE, TEXT, TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ⑤ إلغاء الطلب — بديل الحذف النهائي
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.cancel_leave_request(UUID, TEXT);

CREATE FUNCTION public.cancel_leave_request(
  p_leave_id UUID,
  p_reason   TEXT DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_emp    UUID := public.current_user_employee_id();
  v_row    RECORD;
  v_staff  BOOLEAN := public.current_user_is_staff();
BEGIN
  SELECT * INTO v_row FROM public.leaves
   WHERE id = p_leave_id AND tenant_id = v_tenant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'LEAVE_NOT_FOUND' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT v_staff AND v_row.employee_id IS DISTINCT FROM v_emp THEN
    RAISE EXCEPTION 'LEAVE_NOT_OWNER: لا تملك هذا الطلب'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_row.status = 'ملغى' THEN RETURN FALSE; END IF;

  -- الموظف يلغي ما هو قيد المراجعة فقط؛ الموارد البشرية تلغي المعتمَد أيضاً
  IF NOT v_staff AND v_row.status <> 'انتظار' THEN
    RAISE EXCEPTION 'LEAVE_NOT_CANCELLABLE: لا يمكن إلغاء طلب حالته %', v_row.status
      USING ERRCODE = 'check_violation';
  END IF;

  -- إغلاق السلسلة أولاً وإلا صدّ حارس 0324 تغييرَ الحالة
  PERFORM set_config('kyvzon.approval_sync', 'true', TRUE);

  UPDATE public.hr_approval_steps s
     SET status = 'skipped', decided_at = NOW()
    FROM public.hr_approval_requests r
   WHERE s.request_id = r.id
     AND r.related_id = p_leave_id
     AND r.tenant_id  = v_tenant
     AND s.status IN ('pending','active');

  UPDATE public.hr_approval_requests
     SET status = 'rejected', updated_at = NOW()
   WHERE related_id = p_leave_id AND tenant_id = v_tenant AND status = 'pending';

  UPDATE public.leaves
     SET status = 'ملغى',
         reason = CASE WHEN btrim(COALESCE(p_reason,'')) = '' THEN reason
                       ELSE COALESCE(reason,'') || ' | إلغاء: ' || p_reason END
   WHERE id = p_leave_id AND tenant_id = v_tenant;

  RETURN TRUE;
END $$;

COMMENT ON FUNCTION public.cancel_leave_request(UUID, TEXT) IS
  'إلغاء طلب إجازة مع تحرير الرصيد المحجوز وإغلاق سلسلة الاعتماد. '
  'بديل الحذف النهائي: الطلب يبقى للتدقيق بحالة ''ملغى''.';

REVOKE ALL ON FUNCTION public.cancel_leave_request(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_leave_request(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_leave_request(UUID, TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ⑥ عطل ②: المعتمِد لا يكون الطالب + عطل ⑩: مزامنة الاعتماد التلقائي
--
--    نُعيد بناء create_hr_approval بتغييرين اثنين لا ثالث لهما:
--      (أ) تخطّي أي خطوة يكون معتمِدها هو صاحب الطلب نفسه.
--      (ب) عند غياب كل المعتمِدين ⇒ استدعاء sync_hr_source_status
--          حتى لا يبقى المصدر 'انتظار' والطلب 'approved'.
--    بقية المنطق منقول حرفياً من 0153 — قارنّاه سطراً بسطر.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_hr_approval(
  p_request_type TEXT,
  p_related_id   UUID,
  p_employee_id  UUID
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_dept UUID;
  v_chain RECORD;
  v_req_id UUID;
  v_order INT := 0;
  v_first_active INT := NULL;
  v_approvers UUID[];
  v_roles TEXT[];
  v_requester_uid UUID;
  v_skipped_self INT := 0;
  i INT;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'no tenant context'; END IF;

  SELECT department_id, user_id INTO v_dept, v_requester_uid
    FROM public.employees WHERE id = p_employee_id;
  SELECT * INTO v_chain FROM public.resolve_department_chain(v_dept);

  v_approvers := ARRAY[v_chain.supervisor_id, v_chain.manager_id, v_chain.direct_manager_id];
  v_roles := ARRAY['supervisor', 'manager', 'direct_manager'];

  INSERT INTO public.hr_approval_requests (tenant_id, request_type, related_id, employee_id, department_id)
  VALUES (v_tenant, p_request_type, p_related_id, p_employee_id, v_dept)
  RETURNING id INTO v_req_id;

  -- بناء المراحل (تخطّي الفارغ)
  FOR i IN 1..3 LOOP
    IF v_approvers[i] IS NOT NULL THEN
      -- ★★★ 0339: المعتمِد لا يكون الطالب.
      --     مُقاس قبل الإصلاح: مدير قسم طلب إجازة لنفسه ⇒ خطوتان
      --     معتمِدُهما هو نفسه ⇒ اعتمدها بقرارين ⇒ 'موافق'.
      IF v_requester_uid IS NOT NULL AND v_approvers[i] = v_requester_uid THEN
        v_skipped_self := v_skipped_self + 1;
        CONTINUE;
      END IF;

      v_order := v_order + 1;
      INSERT INTO public.hr_approval_steps (request_id, tenant_id, step_order, approver_role, approver_id, status)
      VALUES (
        v_req_id, v_tenant, v_order, v_roles[i], v_approvers[i],
        CASE WHEN v_first_active IS NULL THEN 'active' ELSE 'pending' END
      );
      IF v_first_active IS NULL THEN v_first_active := v_order; END IF;
    END IF;
  END LOOP;

  -- لا معتمِدين → اعتماد تلقائي
  IF v_order = 0 THEN
    UPDATE public.hr_approval_requests SET status = 'approved', updated_at = NOW() WHERE id = v_req_id;
    -- ★ 0339 عطل ⑩: كان المصدر يبقى 'انتظار' بينما الطلب 'approved'.
    PERFORM public.sync_hr_source_status(v_req_id, 'approved');
  ELSE
    UPDATE public.hr_approval_requests SET current_step = v_first_active WHERE id = v_req_id;
  END IF;

  IF v_skipped_self > 0 THEN
    RAISE NOTICE 'create_hr_approval: تُخطّيت % خطوة لأن المعتمِد هو الطالب نفسه', v_skipped_self;
  END IF;

  RETURN v_req_id;
END $$;

COMMENT ON FUNCTION public.create_hr_approval(TEXT, UUID, UUID) IS
  'يبني سلسلة الاعتماد. ★ 0339: يتخطّى الخطوة التي يكون معتمِدها هو الطالب '
  'نفسه (كان مدير القسم يعتمد إجازته بقرارين)، ويُزامن المصدر عند الاعتماد '
  'التلقائي (كان leaves تبقى ''انتظار'' والطلب ''approved'').';

-- ─────────────────────────────────────────────────────────────────────────
-- ⑦ عطل ⑨: الطلبات اليتيمة
--
--    `related_id` بلا FK لأنه متعدد الأشكال. المحفّز يقوم مقام
--    ON DELETE CASCADE يدوياً.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_close_orphan_hr_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type TEXT := CASE TG_TABLE_NAME WHEN 'leaves' THEN 'leave' ELSE 'permission' END;
BEGIN
  UPDATE public.hr_approval_steps s
     SET status = 'skipped', decided_at = NOW()
    FROM public.hr_approval_requests r
   WHERE s.request_id = r.id
     AND r.related_id = OLD.id
     AND r.tenant_id  = OLD.tenant_id
     AND r.request_type = v_type
     AND s.status IN ('pending','active');

  UPDATE public.hr_approval_requests
     SET status = 'rejected', updated_at = NOW()
   WHERE related_id = OLD.id
     AND tenant_id  = OLD.tenant_id
     AND request_type = v_type
     AND status = 'pending';

  RETURN OLD;
END $$;

COMMENT ON FUNCTION public.tg_close_orphan_hr_request() IS
  'يُغلق سلسلة الاعتماد عند حذف المصدر. مُقاس قبل 0339: حذف الإجازة ترك '
  'hr_approval_requests=1 وخطوتين حيّتين في صندوق المدير لطلب غير موجود.';

DROP TRIGGER IF EXISTS trg_close_orphan_hr_request ON public.leaves;
CREATE TRIGGER trg_close_orphan_hr_request
  BEFORE DELETE ON public.leaves
  FOR EACH ROW EXECUTE FUNCTION public.tg_close_orphan_hr_request();

DROP TRIGGER IF EXISTS trg_close_orphan_hr_request ON public.permissions_request;
CREATE TRIGGER trg_close_orphan_hr_request
  BEFORE DELETE ON public.permissions_request
  FOR EACH ROW EXECUTE FUNCTION public.tg_close_orphan_hr_request();

-- ─────────────────────────────────────────────────────────────────────────
-- ⑧ عطل ⑪: سقف الزمنيات
--
--    ثلاث زمنيات يومياً كحدّ أقصى (مُقاس: 8 في يوم واحد كانت تُقبل).
--    فهرس جزئي: الملغاة والمرفوضة لا تُحسب.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_permission_daily_cap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_n INT;
BEGIN
  SELECT count(*) INTO v_n
    FROM public.permissions_request p
   WHERE p.tenant_id   = NEW.tenant_id
     AND p.employee_id = NEW.employee_id
     AND p.date        = NEW.date
     AND p.status IN ('انتظار','موافق')
     AND p.id <> NEW.id;

  IF v_n >= 3 THEN
    RAISE EXCEPTION
      'PERMISSION_DAILY_CAP: لديك % طلب زمنية في %، والحدّ الأقصى 3', v_n, NEW.date
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

COMMENT ON FUNCTION public.tg_permission_daily_cap() IS
  'سقف 3 زمنيات في اليوم. مُقاس قبل 0339: 8 طلبات زمنية في يوم واحد قُبِلت.';

DROP TRIGGER IF EXISTS trg_permission_daily_cap ON public.permissions_request;
CREATE TRIGGER trg_permission_daily_cap
  BEFORE INSERT OR UPDATE OF date, status ON public.permissions_request
  FOR EACH ROW EXECUTE FUNCTION public.tg_permission_daily_cap();

-- ─────────────────────────────────────────────────────────────────────────
-- ⑨ فهارس تخدم الفحوص الجديدة
-- ─────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_leaves_overlap_probe
  ON public.leaves (tenant_id, employee_id, date_from, date_to)
  WHERE status IN ('انتظار','موافق');

CREATE INDEX IF NOT EXISTS idx_hr_requests_related
  ON public.hr_approval_requests (tenant_id, related_id, request_type);

CREATE INDEX IF NOT EXISTS idx_permissions_request_daily
  ON public.permissions_request (tenant_id, employee_id, date)
  WHERE status IN ('انتظار','موافق');

-- ─────────────────────────────────────────────────────────────────────────
-- ⑨-مكرر ★★★ المشرف والمدير لا يريان أي طلب إجازة إطلاقاً
--
--   اكتُشف أثناء كتابة اختبار RLS لهذه الجولة نفسها — لم يكن في القائمة.
--   `kyvzon_leaves_select` (من 0002) نصّها الحرفي:
--       (tenant_id = current_user_tenant_id())
--       AND (current_user_is_staff() OR employee_id = current_user_employee_id())
--   و`current_user_is_staff()` = role IN ('admin','hr','developer','it_admin').
--   **'supervisor' و'manager' ليسا فيها.**
--
--   مُقاس بجلسة RLS حقيقية (SET ROLE authenticated):
--     موظف قدّم طلباً · المشرفة معيَّنة supervisor_id للقسم · السلسلة بُنيت
--     وخطوتها 'active' باسمها.
--       بدور المشرفة:  SELECT count(*) FROM leaves        ⇒ 0
--                      is_staff = false
--                      خطوات السلسلة المرئية لها          ⇒ 1
--                      leave_requests_view('inbox',…)     ⇒ 0
--     أي: النظام يطلب منها قراراً في طلب **لا تستطيع رؤيته**.
--
--   الأثر: كل مسارات `/app/supervisor/...` و`/app/manager/...` في
--   `LeaveRequestPage` تعرض «لا توجد طلبات إجازة» أبداً. الصفحة كانت
--   «تعمل» لدور hr وحده لأنه staff — وهو بالضبط الدور الذي يجب ألّا
--   يعتمد وحده (حارس 0324).
--
--   الإصلاح: سياسة SELECT إضافية — من له خطوة في سلسلة الطلب يراه.
--   قراءة فقط: القرار يبقى حصراً عبر `decide_hr_approval_step`.
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS kyvzon_leaves_select_approver ON public.leaves;
CREATE POLICY kyvzon_leaves_select_approver ON public.leaves
  FOR SELECT
  USING (
    tenant_id = public.current_user_tenant_id()
    AND EXISTS (
      SELECT 1
        FROM public.hr_approval_steps s
        JOIN public.hr_approval_requests r ON r.id = s.request_id
       WHERE r.related_id   = public.leaves.id
         AND r.tenant_id    = public.leaves.tenant_id
         AND r.request_type = 'leave'
         AND s.approver_id  = auth.uid())
  );

COMMENT ON POLICY kyvzon_leaves_select_approver ON public.leaves IS
  '★★★ 0339: المعتمِد يرى ما يُطلب منه البتّ فيه. مُقاس قبل الإصلاح: '
  'مشرفة لها خطوة active ترى 0 طلباً — كل شاشات المشرف والمدير فارغة.';

DROP POLICY IF EXISTS kyvzon_permissions_request_select_approver ON public.permissions_request;
CREATE POLICY kyvzon_permissions_request_select_approver ON public.permissions_request
  FOR SELECT
  USING (
    tenant_id = public.current_user_tenant_id()
    AND EXISTS (
      SELECT 1
        FROM public.hr_approval_steps s
        JOIN public.hr_approval_requests r ON r.id = s.request_id
       WHERE r.related_id   = public.permissions_request.id
         AND r.tenant_id    = public.permissions_request.tenant_id
         AND r.request_type = 'permission'
         AND s.approver_id  = auth.uid())
  );

COMMENT ON POLICY kyvzon_permissions_request_select_approver ON public.permissions_request IS
  '★★★ 0339: نفس عطل leaves — المعتمِد لم يكن يرى طلب الزمنية المُحال إليه.';

-- ─────────────────────────────────────────────────────────────────────────
-- ⑩ قراءة موحّدة لطلبات الإجازة مع اسم صاحبها
--
--    الصفحة تعرض `req.employee_name` (LeaveRequestPage.tsx:376) لكن
--    `leaves` **لا تملك هذا العمود** — الحقل `undefined` دائماً فالبحث
--    في وضع الموارد البشرية لا يُطابق شيئاً أبداً.
--    مُحقَّق من information_schema: أعمدة leaves ثلاثة عشر وليس بينها
--    employee_name.  ⇒ نفس عائلة عطل 0336 (بحث يعمل لأسباب خاطئة).
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.leave_requests_view(TEXT, TEXT, INTEGER, INTEGER);

CREATE FUNCTION public.leave_requests_view(
  p_scope  TEXT DEFAULT 'mine',
  p_status TEXT DEFAULT NULL,
  p_limit  INTEGER DEFAULT 100,
  p_offset INTEGER DEFAULT 0
) RETURNS TABLE (
  out_id            UUID,
  out_employee_id   UUID,
  out_employee_name TEXT,
  out_leave_type    TEXT,
  out_date_from     DATE,
  out_date_to       DATE,
  out_working_days  INTEGER,
  out_status        TEXT,
  out_reason        TEXT,
  out_created_at    TIMESTAMPTZ,
  out_can_decide    BOOLEAN,
  out_can_cancel    BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER          -- ★ يحترم RLS جدول leaves عمداً
SET search_path = public
AS $$
DECLARE
  v_emp UUID := public.current_user_employee_id();
BEGIN
  RETURN QUERY
  SELECT l.id,
         l.employee_id,
         COALESCE(NULLIF(btrim(e.first_name || ' ' || e.last_name), ''),
                  p.full_name, '—')                        AS employee_name,
         l.leave_type,
         l.date_from,
         l.date_to,
         l.working_days_count,
         l.status,
         l.reason,
         l.created_at,
         -- يقرّر من كانت له خطوة نشطة — لا من فتح مساراً معيناً في URL
         EXISTS (SELECT 1
                   FROM public.hr_approval_steps s
                   JOIN public.hr_approval_requests r ON r.id = s.request_id
                  WHERE r.related_id = l.id
                    AND r.request_type = 'leave'
                    AND s.status = 'active'
                    AND s.approver_id = auth.uid())        AS can_decide,
         (l.employee_id = v_emp AND l.status = 'انتظار')   AS can_cancel
    FROM public.leaves l
    LEFT JOIN public.employees e ON e.id = l.employee_id
    LEFT JOIN public.profiles  p ON p.id = e.user_id
   WHERE (p_status IS NULL OR l.status = p_status)
     AND (CASE
            WHEN p_scope = 'mine'    THEN l.employee_id = v_emp
            WHEN p_scope = 'inbox'   THEN EXISTS (
                 SELECT 1 FROM public.hr_approval_steps s
                   JOIN public.hr_approval_requests r ON r.id = s.request_id
                  WHERE r.related_id = l.id
                    AND r.request_type = 'leave'
                    AND s.status = 'active'
                    AND s.approver_id = auth.uid())
            ELSE TRUE   -- 'all' — تبقى محكومة بـRLS
          END)
   ORDER BY l.created_at DESC
   LIMIT GREATEST(COALESCE(p_limit, 100), 0)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END $$;

COMMENT ON FUNCTION public.leave_requests_view(TEXT, TEXT, INTEGER, INTEGER) IS
  'قراءة طلبات الإجازة مع اسم الموظف وصلاحية القرار الحقيقية. '
  'قبل 0339 كانت الصفحة تعرض req.employee_name وهو عمود غير موجود في '
  'leaves ⇒ البحث في وضع الموارد البشرية لا يُطابق شيئاً، وصلاحية '
  'الاعتماد كانت تُشتقّ من مسار URL لا من السلسلة.';

REVOKE ALL ON FUNCTION public.leave_requests_view(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.leave_requests_view(TEXT, TEXT, INTEGER, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.leave_requests_view(TEXT, TEXT, INTEGER, INTEGER) TO authenticated;
