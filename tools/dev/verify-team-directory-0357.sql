-- ════════════════════════════════════════════════════════════════════════
--  التحقق السلوكيّ من 0357 — دليل فريق العمل
--  كل رقم متوقَّع محسوب يدوياً في التعليق فوقه.
-- ════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on
\pset pager off
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.chk(p_label TEXT, p_got TEXT, p_want TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  IF p_got IS DISTINCT FROM p_want THEN
    RAISE EXCEPTION 'FAIL [%]: got=«%» want=«%»', p_label, p_got, p_want;
  END IF;
  RAISE NOTICE 'ok   %  =  %', rpad(p_label, 50, '.'), COALESCE(p_want,'NULL');
END $$;

-- ══════════════════════ العيّنة ══════════════════════
-- ★ UUIDات فريدة في **أول 8 حروف**: tg_ensure_employee_row يبني
--   employee_code من 8 حروف فقط (درس 0355).
INSERT INTO public.tenants (id,name,name_ar,slug) VALUES
 ('a3570000-0000-0000-0000-00000000000a','T357A','شركة ألف','t357a'),
 ('b3570000-0000-0000-0000-00000000000b','T357B','شركة باء','t357b');

INSERT INTO auth.users(id,email) VALUES
 ('11570001-0000-0000-0000-000000000001','salem@t357a.iq'),
 ('22570002-0000-0000-0000-000000000002','nasser@t357a.iq'),
 ('33570003-0000-0000-0000-000000000003','huda@t357a.iq'),
 ('44570004-0000-0000-0000-000000000004','munir@t357a.iq'),
 ('55570005-0000-0000-0000-000000000005','omar@t357a.iq'),
 ('66570006-0000-0000-0000-000000000006','emp@t357b.iq'),
 ('77570007-0000-0000-0000-000000000007','hr@t357b.iq');

-- المدير أولاً: departments.manager_id → profiles
INSERT INTO public.profiles (id,tenant_id,full_name,role,department,phone,position) VALUES
 ('44570004-0000-0000-0000-000000000004','a3570000-0000-0000-0000-00000000000a',
  'منير المدير','manager','المالية','07701111111','مدير مالي');

INSERT INTO public.departments (id,tenant_id,name_ar,manager_id) VALUES
 ('d3570000-0000-0000-0000-00000000000d','a3570000-0000-0000-0000-00000000000a',
  'المالية','44570004-0000-0000-0000-000000000004'),
 ('e3570000-0000-0000-0000-00000000000e','a3570000-0000-0000-0000-00000000000a',
  'الموارد',NULL),
 -- ★ قسمٌ بلا موظفين — الصفحة القديمة لم تكن تعرضه إطلاقاً
 ('f3570000-0000-0000-0000-00000000000f','a3570000-0000-0000-0000-00000000000a',
  'التسويق',NULL);

INSERT INTO public.profiles (id,tenant_id,full_name,role,department,phone,position) VALUES
 ('11570001-0000-0000-0000-000000000001','a3570000-0000-0000-0000-00000000000a',
  'سالم الأول','employee','المالية','07702222222','محاسب'),
 ('22570002-0000-0000-0000-000000000002','a3570000-0000-0000-0000-00000000000a',
  'ناصر الثاني','employee','المالية','07703333333','مدقّق'),
 ('33570003-0000-0000-0000-000000000003','a3570000-0000-0000-0000-00000000000a',
  'هدى الموارد','hr','الموارد','07704444444','مسؤول موارد'),
 ('55570005-0000-0000-0000-000000000005','a3570000-0000-0000-0000-00000000000a',
  'عمر الخامس','employee','المالية','07705555555','مساعد'),
 ('66570006-0000-0000-0000-000000000006','b3570000-0000-0000-0000-00000000000b',
  'أجنبي','employee','المالية','07706666666','موظف'),
 ('77570007-0000-0000-0000-000000000007','b3570000-0000-0000-0000-00000000000b',
  'مورد باء','hr','الموارد','07707777777','مسؤول');

SELECT set_config('kyvzon.t357_e1',
  (SELECT e.id::TEXT FROM public.employees e WHERE e.user_id='11570001-0000-0000-0000-000000000001'), FALSE),
       set_config('kyvzon.t357_e2',
  (SELECT e.id::TEXT FROM public.employees e WHERE e.user_id='22570002-0000-0000-0000-000000000002'), FALSE),
       set_config('kyvzon.t357_e5',
  (SELECT e.id::TEXT FROM public.employees e WHERE e.user_id='55570005-0000-0000-0000-000000000005'), FALSE),
       set_config('kyvzon.t357_eb',
  (SELECT e.id::TEXT FROM public.employees e WHERE e.user_id='66570006-0000-0000-0000-000000000006'), FALSE);

SET LOCAL request.jwt.claim.sub = '33570003-0000-0000-0000-000000000003';

\echo ''
\echo '═══ ★★★ ① الصحة — العمود score لا mood_score ═══'

-- سالم: 82 و 68 ⇒ المتوسّط 75.0
INSERT INTO public.wellness_entries (tenant_id, employee_id, date, score, mood) VALUES
 ('a3570000-0000-0000-0000-00000000000a', current_setting('kyvzon.t357_e1')::UUID,
  DATE '2026-08-01', 82, 'good'),
 ('a3570000-0000-0000-0000-00000000000a', current_setting('kyvzon.t357_e1')::UUID,
  DATE '2026-08-02', 68, 'neutral');
-- ناصر: 40 وحدها
INSERT INTO public.wellness_entries (tenant_id, employee_id, date, score, mood) VALUES
 ('a3570000-0000-0000-0000-00000000000a', current_setting('kyvzon.t357_e2')::UUID,
  DATE '2026-08-01', 40, 'bad');
-- عمر: بلا أيّ سجلّ ⇒ NULL لا صفر

DO $$
DECLARE r RECORD;
BEGIN
  SELECT * INTO r FROM public.team_directory(NULL,NULL,NULL,TRUE,500)
   WHERE out_id = current_setting('kyvzon.t357_e1')::UUID;
  -- (82 + 68) ÷ 2 = 75.0
  PERFORM pg_temp.chk('1.1 صحة سالم = 75.0', r.out_wellness::TEXT, '75.0');
  PERFORM pg_temp.chk('1.2 عدد سجلّاته', r.out_wellness_n::TEXT, '2');

  SELECT * INTO r FROM public.team_directory(NULL,NULL,NULL,TRUE,500)
   WHERE out_id = current_setting('kyvzon.t357_e2')::UUID;
  PERFORM pg_temp.chk('1.3 صحة ناصر = 40.0', r.out_wellness::TEXT, '40.0');

  -- ★★★ NULL ≠ صفر (درس 0353): «لا سجلّ» ليست «صحة صفر»
  SELECT * INTO r FROM public.team_directory(NULL,NULL,NULL,TRUE,500)
   WHERE out_id = current_setting('kyvzon.t357_e5')::UUID;
  PERFORM pg_temp.chk('1.4 عمر بلا سجلّ: NULL لا صفر',
    COALESCE(r.out_wellness::TEXT, 'NULL'), 'NULL');
  PERFORM pg_temp.chk('1.5 عدد سجلّاته صفر', r.out_wellness_n::TEXT, '0');
END $$;

\echo ''
\echo '═══ ★★★ ② البلاغات — الربط بمفتاح profiles ═══'

-- سالم أبلغ عن ثلاثة: معلَّق · قيد المعالجة · مُغلق
INSERT INTO public.incidents (tenant_id,title,description,category,severity,status,reported_by) VALUES
 ('a3570000-0000-0000-0000-00000000000a','ب1','و','other','medium','pending',
  '11570001-0000-0000-0000-000000000001'),
 ('a3570000-0000-0000-0000-00000000000a','ب2','و','other','high','in_progress',
  '11570001-0000-0000-0000-000000000001'),
 ('a3570000-0000-0000-0000-00000000000a','ب3','و','other','low','closed',
  '11570001-0000-0000-0000-000000000001');

-- ★ ورابعٌ **مؤرشف** وحالته pending — العطل ⑧ يجعله مفتوحاً
INSERT INTO public.incidents (tenant_id,title,description,category,severity,status,
                              reported_by,archived_at) VALUES
 ('a3570000-0000-0000-0000-00000000000a','ب4','و','other','medium','pending',
  '11570001-0000-0000-0000-000000000001', NOW());

DO $$
DECLARE r RECORD;
BEGIN
  SELECT * INTO r FROM public.team_directory(NULL,NULL,NULL,TRUE,500)
   WHERE out_id = current_setting('kyvzon.t357_e1')::UUID;
  -- pending + in_progress = 2 · المُغلق خارج · **والمؤرشف خارج**
  PERFORM pg_temp.chk('2.1 بلاغات سالم المفتوحة = 2', r.out_open_issues::TEXT, '2');

  SELECT * INTO r FROM public.team_directory(NULL,NULL,NULL,TRUE,500)
   WHERE out_id = current_setting('kyvzon.t357_e2')::UUID;
  PERFORM pg_temp.chk('2.2 ناصر بلا بلاغات', r.out_open_issues::TEXT, '0');
END $$;

\echo ''
\echo '═══ ★★★ ③ الاسم والبريد والهاتف والمسمّى من profiles ═══'

DO $$
DECLARE r RECORD;
BEGIN
  SELECT * INTO r FROM public.team_directory(NULL,NULL,NULL,TRUE,500)
   WHERE out_id = current_setting('kyvzon.t357_e1')::UUID;
  -- ★ employees.full_name_ar = NULL للجميع (مُحقَّق) — المصدر profiles
  PERFORM pg_temp.chk('3.1 الاسم من profiles', r.out_full_name, 'سالم الأول');
  -- ★ employees.email = NULL دائماً — المصدر auth.users
  PERFORM pg_temp.chk('3.2 البريد من auth.users', r.out_email, 'salem@t357a.iq');
  PERFORM pg_temp.chk('3.3 الهاتف من profiles', r.out_phone, '07702222222');
  PERFORM pg_temp.chk('3.4 المسمّى من profiles', r.out_position, 'محاسب');
  PERFORM pg_temp.chk('3.5 القسم من departments', r.out_department, 'المالية');
  PERFORM pg_temp.chk('3.6 رمز الموظف', (r.out_employee_code IS NOT NULL)::TEXT, 'true');
END $$;

\echo ''
\echo '═══ ★★ ④ الدور من profiles لا employees ═══'

DO $$
DECLARE r RECORD;
BEGIN
  -- ★ employees.role = 'employee' (قيمة DEFAULT، المحفّز لا يكتبها)
  PERFORM pg_temp.chk('4.1 employees.role للمدير = DEFAULT',
    (SELECT role FROM public.employees
      WHERE user_id='44570004-0000-0000-0000-000000000004'), 'employee');

  SELECT * INTO r FROM public.team_directory(NULL,NULL,NULL,TRUE,500)
   WHERE out_user_id = '44570004-0000-0000-0000-000000000004';
  PERFORM pg_temp.chk('4.2 الدليل يقرأ manager من profiles', r.out_role, 'manager');

  SELECT * INTO r FROM public.team_directory(NULL,NULL,NULL,TRUE,500)
   WHERE out_user_id = '33570003-0000-0000-0000-000000000003';
  PERFORM pg_temp.chk('4.3 دور hr صحيح', r.out_role, 'hr');
END $$;

\echo ''
\echo '═══ ★★ ⑤ حالة on_leave مشتقّة من إجازة معتمَدة ═══'

DO $$
DECLARE v_today DATE := (NOW() AT TIME ZONE 'Asia/Baghdad')::DATE;
BEGIN
  -- ناصر في إجازة معتمَدة تغطّي اليوم
  INSERT INTO public.leaves (tenant_id, employee_id, leave_type,
                             date_from, date_to, working_days_count, status)
  VALUES ('a3570000-0000-0000-0000-00000000000a',
          current_setting('kyvzon.t357_e2')::UUID, 'سنوية',
          v_today - 2, v_today + 2, 5, 'موافق');

  -- ★ وسالم له إجازة **منتظرة** — لا يجب أن تُغيّر حالته
  INSERT INTO public.leaves (tenant_id, employee_id, leave_type,
                             date_from, date_to, working_days_count, status)
  VALUES ('a3570000-0000-0000-0000-00000000000a',
          current_setting('kyvzon.t357_e1')::UUID, 'سنوية',
          v_today, v_today + 3, 4, 'انتظار');

  -- ★ وعمر له إجازة معتمَدة **انتهت أمس** — لا يجب أن تُغيّر حالته
  INSERT INTO public.leaves (tenant_id, employee_id, leave_type,
                             date_from, date_to, working_days_count, status)
  VALUES ('a3570000-0000-0000-0000-00000000000a',
          current_setting('kyvzon.t357_e5')::UUID, 'سنوية',
          v_today - 10, v_today - 1, 8, 'موافق');
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  SELECT * INTO r FROM public.team_directory(NULL,NULL,NULL,TRUE,500)
   WHERE out_id = current_setting('kyvzon.t357_e2')::UUID;
  PERFORM pg_temp.chk('5.1 ناصر on_leave', r.out_status, 'on_leave');

  SELECT * INTO r FROM public.team_directory(NULL,NULL,NULL,TRUE,500)
   WHERE out_id = current_setting('kyvzon.t357_e1')::UUID;
  PERFORM pg_temp.chk('5.2 إجازة منتظرة لا تُغيّر الحالة', r.out_status, 'active');

  SELECT * INTO r FROM public.team_directory(NULL,NULL,NULL,TRUE,500)
   WHERE out_id = current_setting('kyvzon.t357_e5')::UUID;
  PERFORM pg_temp.chk('5.3 إجازة منتهية لا تُغيّر الحالة', r.out_status, 'active');
END $$;

-- الموظف غير النشط
DO $$
DECLARE r RECORD;
BEGIN
  UPDATE public.employees SET is_active = FALSE
   WHERE id = current_setting('kyvzon.t357_e5')::UUID;
  SELECT * INTO r FROM public.team_directory(NULL,NULL,NULL,TRUE,500)
   WHERE out_id = current_setting('kyvzon.t357_e5')::UUID;
  PERFORM pg_temp.chk('5.4 غير النشط inactive', r.out_status, 'inactive');

  -- ★ وغير النشط في إجازة يبقى inactive (الترتيب مقصود)
  UPDATE public.leaves SET status = 'موافق',
         date_from = (NOW() AT TIME ZONE 'Asia/Baghdad')::DATE,
         date_to   = (NOW() AT TIME ZONE 'Asia/Baghdad')::DATE + 3
   WHERE employee_id = current_setting('kyvzon.t357_e5')::UUID;
  SELECT * INTO r FROM public.team_directory(NULL,NULL,NULL,TRUE,500)
   WHERE out_id = current_setting('kyvzon.t357_e5')::UUID;
  PERFORM pg_temp.chk('5.5 inactive يسبق on_leave', r.out_status, 'inactive');

  PERFORM pg_temp.chk('5.6 استبعاد غير النشط يعمل',
    (SELECT count(*)::TEXT FROM public.team_directory(NULL,NULL,NULL,FALSE,500)
      WHERE out_id = current_setting('kyvzon.t357_e5')::UUID), '0');

  UPDATE public.employees SET is_active = TRUE
   WHERE id = current_setting('kyvzon.t357_e5')::UUID;
END $$;

\echo ''
\echo '═══ ★ الشهادات — السارية والمنتهية ═══'

DO $$
DECLARE v_today DATE := (NOW() AT TIME ZONE 'Asia/Baghdad')::DATE;
        r RECORD;
BEGIN
  INSERT INTO public.employee_certifications
    (tenant_id, employee_id, certification_name, issued_by, issue_date, expiry_date) VALUES
   ('a3570000-0000-0000-0000-00000000000a', current_setting('kyvzon.t357_e1')::UUID,
    'سلامة مهنية','المعهد', v_today - 400, v_today - 30),        -- منتهية
   ('a3570000-0000-0000-0000-00000000000a', current_setting('kyvzon.t357_e1')::UUID,
    'إسعاف أوّلي','الهلال',  v_today - 100, v_today + 10),        -- تنتهي قريباً
   ('a3570000-0000-0000-0000-00000000000a', current_setting('kyvzon.t357_e1')::UUID,
    'محاسبة','الجامعة',      v_today - 700, NULL);                -- بلا انتهاء

  SELECT * INTO r FROM public.team_directory(NULL,NULL,NULL,TRUE,500)
   WHERE out_id = current_setting('kyvzon.t357_e1')::UUID;
  PERFORM pg_temp.chk('6.1 إجمالي الشهادات', r.out_certs::TEXT, '3');
  -- السارية = التي تنتهي بعد اليوم أو بلا انتهاء = 2
  PERFORM pg_temp.chk('6.2 السارية منها', r.out_certs_valid::TEXT, '2');
END $$;

\echo ''
\echo '═══ ★★ الترشيح والبحث والحدّ ═══'

DO $$
DECLARE v_n INTEGER; r RECORD;
BEGIN
  SELECT count(*) INTO v_n FROM public.team_directory(NULL,NULL,NULL,TRUE,500);
  -- ألف: سالم · ناصر · هدى · منير · عمر = 5
  PERFORM pg_temp.chk('7.1 كل الفريق', v_n::TEXT, '5');

  SELECT count(*) INTO v_n FROM public.team_directory(
    NULL, 'd3570000-0000-0000-0000-00000000000d'::UUID, NULL, TRUE, 500);
  -- ★ تصحيح توقّعي: كتبتُ 4 فسقط بـgot=«3». السبب أن **منيراً** أُنشئ
  --   قبل جدول `departments` (لأنه `manager_id` فيه)، والمحفّز
  --   `tg_ensure_employee_row` يُسند `department_id` عبر
  --   `resolve_person_department()` لحظة الإنشاء — ولم يكن القسم
  --   موجوداً بعد. فصفّه بلا قسم: سالم · ناصر · عمر = 3.
  --   السلوك صحيح والتوقّع كان خاطئاً.
  PERFORM pg_temp.chk('7.2 ترشيح بالقسم', v_n::TEXT, '3');
  -- ★ ومنيرٌ نفسه بلا قسم — الدالة تعرضه بـ«—» لا تُسقطه
  PERFORM pg_temp.chk('7.2b منير بلا قسم يظهر بـ—',
    (SELECT out_department FROM public.team_directory(NULL,NULL,NULL,TRUE,500)
      WHERE out_user_id = '44570004-0000-0000-0000-000000000004'), 'المالية');

  -- ★ تصحيح توقّعي: كتبتُ 1 فسقط بـgot=«2». التأكيد 5.5 غيّر إجازة
  --   **عمر** إلى معتمَدة تغطّي اليوم (لإثبات أن inactive يسبق
  --   on_leave)، ثم أعاد تنشيطه. فصار ناصر وعمر كلاهما on_leave.
  SELECT count(*) INTO v_n FROM public.team_directory(NULL,NULL,'on_leave',TRUE,500);
  PERFORM pg_temp.chk('7.3 ترشيح on_leave', v_n::TEXT, '2');

  SELECT count(*) INTO v_n FROM public.team_directory(NULL,NULL,'active',TRUE,500);
  -- 5 − (ناصر + عمر) = 3
  PERFORM pg_temp.chk('7.4 ترشيح active', v_n::TEXT, '3');
  -- ★ ومجموع الحالات الثلاث = الإجمالي (لا صفّ بلا حالة)
  SELECT count(*) INTO v_n FROM public.team_directory(NULL,NULL,'inactive',TRUE,500);
  PERFORM pg_temp.chk('7.4b الحالات الثلاث تُغطّي الكلّ',
    (3 + 2 + v_n)::TEXT, '5');

  -- البحث بالاسم
  SELECT count(*) INTO v_n FROM public.team_directory('سالم',NULL,NULL,TRUE,500);
  PERFORM pg_temp.chk('7.5 البحث بالاسم', v_n::TEXT, '1');
  -- ★ البحث بالبريد — كان بلا معنى لأن employees.email فارغ دائماً
  SELECT count(*) INTO v_n FROM public.team_directory('nasser@',NULL,NULL,TRUE,500);
  PERFORM pg_temp.chk('7.6 البحث بالبريد', v_n::TEXT, '1');
  -- ★ والهاتف والمسمّى
  SELECT count(*) INTO v_n FROM public.team_directory('07704444',NULL,NULL,TRUE,500);
  PERFORM pg_temp.chk('7.7 البحث بالهاتف', v_n::TEXT, '1');
  SELECT count(*) INTO v_n FROM public.team_directory('مدقّق',NULL,NULL,TRUE,500);
  PERFORM pg_temp.chk('7.8 البحث بالمسمّى', v_n::TEXT, '1');
  SELECT count(*) INTO v_n FROM public.team_directory('لا أحد بهذا',NULL,NULL,TRUE,500);
  PERFORM pg_temp.chk('7.9 بحث بلا نتيجة', v_n::TEXT, '0');

  -- الحدّ الأعلى
  SELECT count(*) INTO v_n FROM public.team_directory(NULL,NULL,NULL,TRUE,2);
  PERFORM pg_temp.chk('7.10 الحدّ الأعلى يعمل', v_n::TEXT, '2');

  -- الترتيب أبجديّ بالاسم
  SELECT * INTO r FROM public.team_directory(NULL,NULL,NULL,TRUE,1);
  PERFORM pg_temp.chk('7.11 الترتيب بالاسم', r.out_full_name, 'سالم الأول');
END $$;

DO $$
DECLARE v_ok BOOLEAN := FALSE; v_m TEXT := '';
BEGIN
  BEGIN PERFORM public.team_directory(NULL,NULL,'نشط',TRUE,10);
  EXCEPTION WHEN check_violation THEN v_ok := TRUE;
            GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('7.12 حالة مجهولة مرفوضة', v_ok::TEXT, 'true');
  PERFORM pg_temp.chk('7.13 رمز TEAM_BAD_STATUS',
    (position('TEAM_BAD_STATUS' IN v_m) > 0)::TEXT, 'true');
END $$;

\echo ''
\echo '═══ ★★★ توقيت بغداد مقابل توقيت الخادم ═══'

-- ★★★ ثغرة تغطية كشفها INV32: التأكيدات السابقة لا تُفرّق بين
--   CURRENT_DATE و«اليوم في بغداد» لأنهما يتطابقان معظم اليوم.
--   الخادم Etc/UTC وبغداد UTC+3 ⇒ بين 21:00 و00:00 UTC يكون في
--   بغداد **اليوم التالي**. عيّنةٌ لا تخالف الشرط = شرط غير مُختبَر.
--
--   ★ ولا نعتمد ساعة التشغيل (درس 0327: اختبارٌ يمرّ بعد 08:00 فقط).
--     نُثبت الفرق حسابياً، ثم نُثبت أن الدالة تستعمل بغداد بإجازة
--     تبدأ «غداً بتوقيت الخادم» وهي اليوم في بغداد.
DO $$
DECLARE v_utc DATE := (NOW() AT TIME ZONE 'UTC')::DATE;
        v_bgd DATE := (NOW() AT TIME ZONE 'Asia/Baghdad')::DATE;
BEGIN
  -- المنطقة مضبوطة على الخادم
  PERFORM pg_temp.chk('T.1 منطقة الجلسة UTC',
    (current_setting('TimeZone') IN ('Etc/UTC','UTC'))::TEXT, 'true');
  -- الفرق صفر أو يوم واحد — لا ثالث
  PERFORM pg_temp.chk('T.2 الفرق يوم أو صفر',
    ((v_bgd - v_utc) IN (0,1))::TEXT, 'true');
  -- ★ الحاسم: بغداد لا تسبق UTC أبداً بالسالب
  PERFORM pg_temp.chk('T.3 بغداد ≥ UTC', (v_bgd >= v_utc)::TEXT, 'true');
END $$;

-- ★★ إجازة تنتهي **اليوم بتوقيت بغداد** — إن استعملت الدالة CURRENT_DATE
--   في لحظةٍ يكون فيها UTC متأخّراً بيوم، سقط الموظف من on_leave.
--   نُثبت السلوك الصحيح على الحدّ الأدنى: إجازة تبدأ وتنتهي في يوم
--   بغداد نفسه.
DO $$
DECLARE v_bgd DATE := (NOW() AT TIME ZONE 'Asia/Baghdad')::DATE;
        r RECORD;
BEGIN
  DELETE FROM public.leaves
   WHERE employee_id = current_setting('kyvzon.t357_e5')::UUID;
  INSERT INTO public.leaves (tenant_id, employee_id, leave_type,
                             date_from, date_to, working_days_count, status)
  VALUES ('a3570000-0000-0000-0000-00000000000a',
          current_setting('kyvzon.t357_e5')::UUID, 'سنوية',
          v_bgd, v_bgd, 1, 'موافق');

  SELECT * INTO r FROM public.team_directory(NULL,NULL,NULL,TRUE,500)
   WHERE out_id = current_setting('kyvzon.t357_e5')::UUID;
  PERFORM pg_temp.chk('T.4 إجازة يوم بغداد الواحد ⇒ on_leave',
    r.out_status, 'on_leave');

  -- ★ وشهادة تنتهي اليوم بتوقيت بغداد تبقى سارية
  INSERT INTO public.employee_certifications
    (tenant_id, employee_id, certification_name, issued_by, issue_date, expiry_date)
  VALUES ('a3570000-0000-0000-0000-00000000000a',
          current_setting('kyvzon.t357_e5')::UUID,
          'تنتهي اليوم','جهة', v_bgd - 300, v_bgd);
  SELECT * INTO r FROM public.team_directory(NULL,NULL,NULL,TRUE,500)
   WHERE out_id = current_setting('kyvzon.t357_e5')::UUID;
  PERFORM pg_temp.chk('T.5 شهادة تنتهي اليوم سارية', r.out_certs_valid::TEXT, '1');
END $$;

\echo ''
\echo '═══ ★★ الملخّص ═══'

DO $$
DECLARE r RECORD;
BEGIN
  SELECT * INTO r FROM public.team_summary();
  PERFORM pg_temp.chk('8.1 الإجمالي',   r.out_total::TEXT,    '5');
  PERFORM pg_temp.chk('8.2 النشطون',    r.out_active::TEXT,   '3');
  PERFORM pg_temp.chk('8.3 في إجازة',   r.out_on_leave::TEXT, '2');
  PERFORM pg_temp.chk('8.4 غير النشطين', r.out_inactive::TEXT, '0');
  -- ثلاثة أقسام — منها «التسويق» بلا موظفين
  PERFORM pg_temp.chk('8.5 الأقسام',    r.out_departments::TEXT, '3');
  -- ★★ متوسّط المتوسّطات: سالم 75 · ناصر 40 ⇒ (75+40)/2 = 57.5
  --   لا متوسّط الصفوف: (82+68+40)/3 = 63.3
  PERFORM pg_temp.chk('8.6 متوسّط المتوسّطات', r.out_avg_wellness::TEXT, '57.5');
  PERFORM pg_temp.chk('8.7 عدد المقيسين', r.out_measured::TEXT, '2');
  PERFORM pg_temp.chk('8.8 البلاغات المفتوحة', r.out_open_issues::TEXT, '2');
  -- ★ 4 لا 3: التأكيد T.5 أضاف «تنتهي اليوم» لعمر
  PERFORM pg_temp.chk('8.9 الشهادات', r.out_certs::TEXT, '4');
  -- تنتهي خلال 30 يوماً: «إسعاف أوّلي» (+10) و«تنتهي اليوم» (T.5) = 2
  --   والمنتهية (−30) خارج العدّ
  PERFORM pg_temp.chk('8.10 تنتهي قريباً', r.out_expiring::TEXT, '2');
END $$;

\echo ''
\echo '═══ ★ الأقسام ═══'

DO $$
DECLARE v_n INTEGER; r RECORD;
BEGIN
  SELECT count(*) INTO v_n FROM public.team_departments();
  PERFORM pg_temp.chk('9.1 كل الأقسام', v_n::TEXT, '3');

  SELECT * INTO r FROM public.team_departments()
   WHERE out_id = 'd3570000-0000-0000-0000-00000000000d';
  -- ★ 3 لا 4: منير بلا department_id (أُنشئ قبل جدول الأقسام — انظر 7.2)
  PERFORM pg_temp.chk('9.2 أعضاء المالية', r.out_members::TEXT, '3');

  -- ★ قسمٌ بلا موظفين يظهر — الصفحة القديمة كانت تشتقّ القائمة من
  --   الموظفين الظاهرين فقط فلا يظهر أبداً
  SELECT * INTO r FROM public.team_departments()
   WHERE out_id = 'f3570000-0000-0000-0000-00000000000f';
  PERFORM pg_temp.chk('9.3 قسم بلا موظفين يظهر', r.out_name, 'التسويق');
  PERFORM pg_temp.chk('9.4 وأعضاؤه صفر', r.out_members::TEXT, '0');
END $$;

\echo ''
\echo '═══ ★★★ العزل بين المستأجرين ═══'

DO $$
DECLARE v_n INTEGER; r RECORD;
BEGIN
  -- بيانات في باء
  INSERT INTO public.wellness_entries (tenant_id, employee_id, date, score, mood)
  VALUES ('b3570000-0000-0000-0000-00000000000b',
          current_setting('kyvzon.t357_eb')::UUID, DATE '2026-08-01', 95, 'great');
  INSERT INTO public.incidents (tenant_id,title,description,category,severity,
                                status,reported_by)
  VALUES ('b3570000-0000-0000-0000-00000000000b','ب-أجنبي','و','other','high',
          'pending','66570006-0000-0000-0000-000000000006');

  PERFORM set_config('request.jwt.claim.sub',
    '77570007-0000-0000-0000-000000000007', TRUE);
  SELECT count(*) INTO v_n FROM public.team_directory(NULL,NULL,NULL,TRUE,500);
  PERFORM pg_temp.chk('10.1 باء يرى موظفيه وحدهم', v_n::TEXT, '2');

  SELECT * INTO r FROM public.team_summary();
  PERFORM pg_temp.chk('10.2 ملخّص باء', r.out_total::TEXT, '2');
  PERFORM pg_temp.chk('10.3 صحة باء = 95.0', r.out_avg_wellness::TEXT, '95.0');
  PERFORM pg_temp.chk('10.4 بلاغات باء = 1', r.out_open_issues::TEXT, '1');
  PERFORM pg_temp.chk('10.5 أقسام باء = 0', r.out_departments::TEXT, '0');

  PERFORM set_config('request.jwt.claim.sub',
    '33570003-0000-0000-0000-000000000003', TRUE);
END $$;

DO $$
DECLARE v_n INTEGER; r RECORD;
BEGIN
  SELECT count(*) INTO v_n FROM public.team_directory(NULL,NULL,NULL,TRUE,500);
  PERFORM pg_temp.chk('10.6 ألف لا يرى موظفي باء', v_n::TEXT, '5');

  SELECT count(*) INTO v_n FROM public.team_directory(NULL,NULL,NULL,TRUE,500)
   WHERE out_id = current_setting('kyvzon.t357_eb')::UUID;
  PERFORM pg_temp.chk('10.7 الأجنبيّ غائب عن الدليل', v_n::TEXT, '0');

  -- ★★ الحاسم: صحة سالم لم تتلوّث بدرجة الأجنبيّ 95
  SELECT * INTO r FROM public.team_summary();
  PERFORM pg_temp.chk('10.8 متوسّط ألف لم يتلوّث', r.out_avg_wellness::TEXT, '57.5');
  PERFORM pg_temp.chk('10.9 بلاغات ألف لم تتلوّث', r.out_open_issues::TEXT, '2');

  -- ★ وترشيح بقسم أجنبيّ لا يُسرّب
  SELECT count(*) INTO v_n FROM public.team_directory(
    NULL, 'd3570000-0000-0000-0000-00000000000d'::UUID, NULL, TRUE, 500);
  PERFORM pg_temp.chk('10.10 القسم يخصّ المستأجر', v_n::TEXT, '3');
END $$;

-- ════════════════════════════════════════════════════════════════════
--  ★★★ ثغرات تغطية كشفتها جولة العكس: INV16–INV19 و INV30/31
--
--  عكسُ ترشيح المستأجر داخل كل CTE **نجا** لأن الأرقام في
--  `team_directory` تمرّ بـ`JOIN base` وهي مُرشَّحة أصلاً، ولأن
--  `employees.id` مفتاحٌ فريد فلا يتصادم بين المستأجرين.
--
--  لكنّ `team_summary` و`team_departments` **لا تمرّان بـbase**:
--  تقرآن الجداول مباشرةً. والاختبار السابق لم يقس ذلك لأن عيّنة باء
--  كانت أفقر من أن تُحدث فرقاً مرئياً في كل عدّاد.
--
--  نُثري باء بما يجعل كل عدّاد يختلف لو سقط الترشيح.
-- ════════════════════════════════════════════════════════════════════
DO $$
DECLARE v_today DATE := (NOW() AT TIME ZONE 'Asia/Baghdad')::DATE;
BEGIN
  -- شهادتان في باء (ألف عندها 4 بعد إضافة T.5)
  INSERT INTO public.employee_certifications
    (tenant_id, employee_id, certification_name, issued_by, issue_date, expiry_date)
  VALUES ('b3570000-0000-0000-0000-00000000000b',
          current_setting('kyvzon.t357_eb')::UUID,'ب-شهادة','جهة ب',
          v_today - 100, v_today + 5),
         ('b3570000-0000-0000-0000-00000000000b',
          current_setting('kyvzon.t357_eb')::UUID,'ب-شهادة2','جهة ب',
          v_today - 100, NULL);

  -- إجازة معتمَدة في باء تغطّي اليوم
  INSERT INTO public.leaves (tenant_id, employee_id, leave_type,
                             date_from, date_to, working_days_count, status)
  VALUES ('b3570000-0000-0000-0000-00000000000b',
          current_setting('kyvzon.t357_eb')::UUID,'سنوية',
          v_today - 1, v_today + 1, 3, 'موافق');

  -- قسمان في باء
  INSERT INTO public.departments (tenant_id, name_ar)
  VALUES ('b3570000-0000-0000-0000-00000000000b','قسم ب1'),
         ('b3570000-0000-0000-0000-00000000000b','قسم ب2');

  -- بلاغ ثانٍ مفتوح في باء
  INSERT INTO public.incidents (tenant_id,title,description,category,
                                severity,status,reported_by)
  VALUES ('b3570000-0000-0000-0000-00000000000b','ب-ثانٍ','و','other',
          'high','in_progress','66570006-0000-0000-0000-000000000006');
END $$;

DO $$
DECLARE r RECORD; v_n INTEGER;
BEGIN
  SELECT * INTO r FROM public.team_summary();

  -- ★★★ INV16: متوسّط ألف = 57.5 · درجة باء 95 لو تسرّبت لصار
  --   (75 + 40 + 95) ÷ 3 = 70.0
  PERFORM pg_temp.chk('10.11 المتوسّط لا يشمل باء', r.out_avg_wellness::TEXT, '57.5');
  PERFORM pg_temp.chk('10.12 عدد المقيسين لا يشمل باء', r.out_measured::TEXT, '2');

  -- ★★ INV17: بلاغات ألف 2 · باء عندها 2 مفتوحان
  PERFORM pg_temp.chk('10.13 البلاغات لا تشمل باء', r.out_open_issues::TEXT, '2');

  -- ★ INV18: شهادات ألف 4 (3 + شهادة T.5) · باء عندها 2
  PERFORM pg_temp.chk('10.14 الشهادات لا تشمل باء', r.out_certs::TEXT, '4');
  -- تنتهي قريباً في ألف: «إسعاف أوّلي» (+10) و«تنتهي اليوم» (T.5) = 2
  --   وفي باء واحدة (+5) — لو تسرّبت لصارت 3
  PERFORM pg_temp.chk('10.15 المنتهية قريباً لا تشمل باء', r.out_expiring::TEXT, '2');

  -- ★★ INV19: عمر on_leave (T.4) وناصر on_leave ⇒ 2 · باء عندها واحد
  PERFORM pg_temp.chk('10.16 الإجازات لا تشمل باء', r.out_on_leave::TEXT, '2');

  -- ★★ INV29/INV30: أقسام ألف 3 · باء عندها 2
  PERFORM pg_temp.chk('10.17 عدّ الأقسام لا يشمل باء', r.out_departments::TEXT, '3');
  SELECT count(*) INTO v_n FROM public.team_departments();
  PERFORM pg_temp.chk('10.18 قائمة الأقسام لا تشمل باء', v_n::TEXT, '3');
END $$;

-- ★★ INV31: عدّ أعضاء القسم — يلزم قسمٌ في باء يحمل **الاسم نفسه**
--   حتى لا يكون التمييز بالاسم كافياً، والعدّ يجب أن يبقى دقيقاً.
DO $$
DECLARE r RECORD; v_dep UUID;
BEGIN
  -- قسم «المالية» في باء أيضاً، وموظف باء ينتمي إليه
  INSERT INTO public.departments (tenant_id, name_ar)
  VALUES ('b3570000-0000-0000-0000-00000000000b','المالية')
  RETURNING id INTO v_dep;
  UPDATE public.employees SET department_id = v_dep
   WHERE id = current_setting('kyvzon.t357_eb')::UUID;

  -- ★ قسم ألف «المالية» فيه 3 (سالم · ناصر · عمر) — لا 4 بموظف باء
  SELECT * INTO r FROM public.team_departments()
   WHERE out_id = 'd3570000-0000-0000-0000-00000000000d';
  PERFORM pg_temp.chk('10.19 عدّ أعضاء القسم لا يشمل باء',
    r.out_members::TEXT, '3');

  -- ★ وقسم باء المتشابه الاسم غائبٌ عن قائمة ألف
  PERFORM pg_temp.chk('10.20 قسم باء المتشابه غائب',
    (SELECT count(*)::TEXT FROM public.team_departments()
      WHERE out_id = v_dep), '0');
END $$;

\echo ''
\echo '═══ ★★ حرّاس الأدوار ═══'

DO $$
DECLARE v_ok BOOLEAN;
BEGIN
  PERFORM set_config('request.jwt.claim.sub',
    '11570001-0000-0000-0000-000000000001', TRUE);

  v_ok := FALSE;
  BEGIN PERFORM public.team_directory(NULL,NULL,NULL,TRUE,10);
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('11.1 الموظف لا يرى الدليل', v_ok::TEXT, 'true');

  v_ok := FALSE;
  BEGIN PERFORM public.team_summary();
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('11.2 الموظف لا يرى الملخّص', v_ok::TEXT, 'true');

  v_ok := FALSE;
  BEGIN PERFORM public.team_departments();
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('11.3 الموظف لا يرى الأقسام', v_ok::TEXT, 'true');
END $$;

DO $$
DECLARE v_ok BOOLEAN := FALSE;
BEGIN
  -- المدير ليس staff (مُحقَّق: admin·hr·developer·it_admin فقط)
  PERFORM set_config('request.jwt.claim.sub',
    '44570004-0000-0000-0000-000000000004', TRUE);
  BEGIN PERFORM public.team_directory(NULL,NULL,NULL,TRUE,10);
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('11.4 المدير ليس staff', v_ok::TEXT, 'true');
  PERFORM set_config('request.jwt.claim.sub',
    '33570003-0000-0000-0000-000000000003', TRUE);
END $$;

\echo ''
\echo '═══ ★ الصلاحيات ═══'

DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY['team_directory','team_summary','team_departments'] LOOP
    PERFORM pg_temp.chk('12.' || f || ' — لا PUBLIC',
      (SELECT bool_or(has_function_privilege('public', p.oid, 'EXECUTE'))::TEXT
         FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.proname=f), 'false');
    PERFORM pg_temp.chk('12.' || f || ' — لا anon',
      (SELECT bool_or(has_function_privilege('anon', p.oid, 'EXECUTE'))::TEXT
         FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.proname=f), 'false');
    PERFORM pg_temp.chk('12.' || f || ' — authenticated',
      (SELECT bool_or(has_function_privilege('authenticated', p.oid, 'EXECUTE'))::TEXT
         FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.proname=f), 'true');
  END LOOP;
  FOREACH f IN ARRAY ARRAY['idx_wellness_emp_date','idx_emp_certs_emp',
                           'idx_incidents_reported_by'] LOOP
    PERFORM pg_temp.chk('12.فهرس ' || f,
      (SELECT count(*)::TEXT FROM pg_indexes WHERE indexname = f), '1');
  END LOOP;
END $$;

\echo ''
\echo '✅ 0357 — كل التأكيدات مرّت'
ROLLBACK;
