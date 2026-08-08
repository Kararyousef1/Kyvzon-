-- ============================================================================
-- verify-hr-reports-0370.sql — التحقق السلوكيّ من 0370
--
--   psql -h /home/user/.pgtest/sock -p 5510 -U postgres -f tools/dev/verify-hr-reports-0370.sql
--
-- ★ يعمل بدور postgres (BYPASSRLS). حرّاس الأدوار وRLS في
--   verify-hr-reports-0370-rls.sh
--
-- ★★★ مُرشَّحٌ بمستأجر الاختبار صراحةً + حارس تهيئة يرفض جدولاً ملوَّثاً
--   (درس الانحدارات الثلاثة في 0367)
-- ============================================================================
\set ON_ERROR_STOP off
\pset pager off
\set QUIET on
\timing off

BEGIN;

\set TA '''a3700000-0000-0000-0000-00000000000a'''
\set TB '''b3700000-0000-0000-0000-00000000000b'''
\set HRA '''13700001-0000-0000-0000-000000000001'''
\set U1 '''23700002-0000-0000-0000-000000000002'''
\set U2 '''33700003-0000-0000-0000-000000000003'''
\set U3 '''63700006-0000-0000-0000-000000000006'''
\set HRB '''43700004-0000-0000-0000-000000000004'''
\set UB '''53700005-0000-0000-0000-000000000005'''

CREATE TEMP TABLE _r(n TEXT, pass BOOLEAN, got TEXT, want TEXT);
CREATE OR REPLACE FUNCTION pg_temp.chk(n TEXT, got TEXT, want TEXT) RETURNS VOID
LANGUAGE sql AS $$ INSERT INTO _r VALUES (n, got IS NOT DISTINCT FROM want, got, want) $$;

-- ★★★ تصفير سجلّ التشغيل بين المراحل: المحفّز `trg_block_hr_report_run_change`
--   يمنع الحذف عمداً (وهو المقصود). نُعطّله **صراحةً** ونُعيد تفعيله —
--   لا `|| true` يبتلع الخطأ (انحدار 0367).
CREATE OR REPLACE FUNCTION pg_temp.reset_runs() RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE v_has BOOLEAN;
BEGIN
  -- ★ التسامح مع غياب المحفّز: لو كان مفقوداً (كما في اختبار العكس)
  --   لأجهض `ALTER` المعاملةَ كلَّها فلا تُطبع نتيجةٌ واحدة.
  SELECT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgrelid='public.hr_report_runs'::regclass
                    AND tgname='trg_block_hr_report_run_change') INTO v_has;
  IF v_has THEN
    ALTER TABLE public.hr_report_runs DISABLE TRIGGER trg_block_hr_report_run_change;
  END IF;
  DELETE FROM public.hr_report_runs
   WHERE tenant_id IN ('a3700000-0000-0000-0000-00000000000a',
                       'b3700000-0000-0000-0000-00000000000b');
  IF v_has THEN
    ALTER TABLE public.hr_report_runs ENABLE TRIGGER trg_block_hr_report_run_change;
  END IF;
END $$;

-- ═══ حارس التهيئة: الجدولان يجب أن يكونا نظيفَين من مستأجري الاختبار ═══
DO $$
DECLARE v INTEGER;
BEGIN
  SELECT count(*) INTO v FROM public.hr_report_runs
   WHERE tenant_id IN ('a3700000-0000-0000-0000-00000000000a',
                       'b3700000-0000-0000-0000-00000000000b');
  IF v > 0 THEN
    RAISE EXCEPTION 'SETUP_DIRTY: % صفّ تشغيلٍ متبقٍّ من تشغيلٍ سابق', v;
  END IF;
END $$;

-- ══════════════════════════════════════════════════════════════════════
--  البذور
-- ══════════════════════════════════════════════════════════════════════
INSERT INTO public.tenants(id,name,name_ar,slug) VALUES
 (:TA,'T0370A','مستأجر ألف 0370','t-0370-a'),
 (:TB,'T0370B','مستأجر باء 0370','t-0370-b');

INSERT INTO auth.users(id,email) VALUES
 (:HRA,'hra0370@v.local'), (:U1,'u1-0370@v.local'), (:U2,'u2-0370@v.local'),
 (:U3,'u3-0370@v.local'), (:HRB,'hrb0370@v.local'), (:UB,'ub-0370@v.local');

INSERT INTO public.profiles(id,tenant_id,full_name,email,role) VALUES
 (:HRA,:TA,'مدير الموارد ألف','hra0370@v.local','hr'),
 (:U1, :TA,'سالم الأول','u1-0370@v.local','employee'),
 (:U2, :TA,'ريم الثانية','u2-0370@v.local','employee'),
 (:U3, :TA,'عمر الثالث','u3-0370@v.local','employee'),
 (:HRB,:TB,'مدير الموارد باء','hrb0370@v.local','hr'),
 (:UB, :TB,'موظف باء','ub-0370@v.local','employee');

-- الأقسام
INSERT INTO public.departments(id,tenant_id,name_ar) VALUES
 ('d3700000-0000-0000-0000-0000000000d1',:TA,'الهندسة'),
 ('d3700000-0000-0000-0000-0000000000d2',:TA,'المالية'),
 ('d3700000-0000-0000-0000-0000000000d3',:TB,'قسم باء');

-- ★ المحفّز tg_ensure_employee_row أنشأ صفوف employees؛ نربطها بالأقسام
UPDATE public.employees SET department_id='d3700000-0000-0000-0000-0000000000d1'
 WHERE user_id IN (:U1,:U2,:U3);
UPDATE public.employees SET department_id='d3700000-0000-0000-0000-0000000000d3'
 WHERE user_id = :UB;

-- الأسماء (first/last فيها الاسم — full_name_ar فارغٌ بنيوياً)
UPDATE public.employees SET first_name='سالم', last_name='الأول'   WHERE user_id=:U1;
UPDATE public.employees SET first_name='ريم',  last_name='الثانية' WHERE user_id=:U2;
UPDATE public.employees SET first_name='عمر',  last_name='الثالث'  WHERE user_id=:U3;
UPDATE public.employees SET is_active = FALSE WHERE user_id=:U3;

-- ══════════════════════════════════════════════════════════════════════
--  ① الكتالوج: ثمانية تقارير · كلُّها منفَّذة
-- ══════════════════════════════════════════════════════════════════════
SELECT pg_temp.chk('1.1 عدد التقارير النشطة = 8',
  (SELECT count(*)::TEXT FROM public.hr_report_definitions WHERE is_active), '8');

SELECT pg_temp.chk('1.2 التقارير الحسّاسة = 2 (بلاغات · صحة نفسية)',
  (SELECT count(*)::TEXT FROM public.hr_report_definitions WHERE is_sensitive), '2');

-- ★★★ الغرض الحقيقيّ: لا تقريرَ مُعرَّفٌ بلا تنفيذ (العطل ①)
DO $$
DECLARE r RECORD; v_bad TEXT := '';
BEGIN
  PERFORM set_config('request.jwt.claim.sub','13700001-0000-0000-0000-000000000001',true);
  FOR r IN SELECT code FROM public.hr_report_definitions WHERE is_active LOOP
    BEGIN
      PERFORM public.hr_report_execute(r.code, NULL, NULL, 10);
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE 'HR_REPORT_NOT_IMPLEMENTED%' THEN
        v_bad := v_bad || r.code || ' ';
      ELSE
        v_bad := v_bad || r.code || '(' || left(SQLERRM,40) || ') ';
      END IF;
    END;
  END LOOP;
  PERFORM pg_temp.chk('1.3 ★ كل تقريرٍ في الكتالوج قابلٌ للتنفيذ', COALESCE(NULLIF(v_bad,''),'—'), '—');
END $$;

-- تنظيف صفوف التشغيل التي ولّدها التأكيد 1.3 كي لا تلوّث العدّ لاحقاً
SELECT pg_temp.reset_runs();

-- ══════════════════════════════════════════════════════════════════════
--  ② تقرير القوى العاملة — أرقامٌ محسوبةٌ يدوياً
--     موظفو ألف: سالم(نشط) · ريم(نشط) · عمر(غير نشط) = 3
--     ★ مدير الموارد hr مستثنىً من المحفّز؟ لا — الاستثناء
--       لـdeveloper/it_admin فقط ⇒ صفُّ HRA موجود ⇒ الإجمالي 4، النشط 3
-- ══════════════════════════════════════════════════════════════════════
SELECT pg_temp.chk('2.0 صفوف employees في ألف = 4',
  (SELECT count(*)::TEXT FROM public.employees WHERE tenant_id = :TA), '4');

DO $$ BEGIN PERFORM set_config('request.jwt.claim.sub','13700001-0000-0000-0000-000000000001',true); END $$;

SELECT pg_temp.chk('2.1 إجمالي الموظفين (بدور postgres يرى الكلّ) موجود',
  (SELECT CASE WHEN c1='إجمالي الموظفين' THEN 'نعم' ELSE 'لا' END
   FROM public.hr_report_execute('workforce_kpi') WHERE row_index=1), 'نعم');

SELECT pg_temp.chk('2.2 عدد صفوف مؤشرات القوى العاملة = 10',
  (SELECT count(*)::TEXT FROM public.hr_report_execute('workforce_kpi')), '10');

SELECT pg_temp.chk('2.3 تاريخ التوليد بتوقيت بغداد لا UTC',
  (SELECT c2 FROM public.hr_report_execute('workforce_kpi') WHERE row_index=10),
  ((now() AT TIME ZONE 'Asia/Baghdad')::DATE)::TEXT);

-- ══════════════════════════════════════════════════════════════════════
--  ③ ★★★★ العطل ②: البلاغ المجهول لا يُفشي مُبلِّغه
-- ══════════════════════════════════════════════════════════════════════
INSERT INTO public.incidents(id,tenant_id,user_id,employee_id,title,description,
                             category,severity,status,employee_name,department,is_anonymous,reported_by)
SELECT 'c3700000-0000-0000-0000-0000000000c1',:TA,:U1,e.id,'بلاغٌ مجهول','وصف',
       'hr','critical','pending','سالم الأول','الهندسة',TRUE,:U1
FROM public.employees e WHERE e.user_id=:U1;

INSERT INTO public.incidents(id,tenant_id,user_id,employee_id,title,description,
                             category,severity,status,employee_name,department,is_anonymous,reported_by)
SELECT 'c3700000-0000-0000-0000-0000000000c2',:TA,:U2,e.id,'بلاغٌ معلوم','وصف',
       'safety','low','pending','ريم الثانية','الهندسة',FALSE,:U2
FROM public.employees e WHERE e.user_id=:U2;

-- بلاغٌ في مستأجرٍ آخر — يجب ألّا يظهر (postgres يتجاوز RLS ⇒ نُرشِّح يدوياً أدناه)
INSERT INTO public.incidents(id,tenant_id,user_id,employee_id,title,description,
                             category,severity,status,employee_name,is_anonymous,reported_by)
SELECT 'c3700000-0000-0000-0000-0000000000c3',:TB,:UB,e.id,'بلاغ باء','وصف',
       'hr','high','pending','موظف باء',FALSE,:UB
FROM public.employees e WHERE e.user_id=:UB;

SELECT pg_temp.chk('3.1 ★★★★ المُبلِّغ المجهول يظهر «مُبلِّغ مجهول»',
  (SELECT c5 FROM public.hr_report_execute('incidents_detail') WHERE c1='بلاغٌ مجهول'),
  'مُبلِّغ مجهول');

SELECT pg_temp.chk('3.2 ★ ولا يظهر اسمه الحقيقيّ في أيّ عمود',
  (SELECT count(*)::TEXT FROM public.hr_report_execute('incidents_detail') x
    WHERE x.c1='بلاغٌ مجهول'
      AND (COALESCE(x.c1,'')||COALESCE(x.c2,'')||COALESCE(x.c3,'')||COALESCE(x.c4,'')
          ||COALESCE(x.c5,'')||COALESCE(x.c6,'')||COALESCE(x.c7,'')) LIKE '%سالم%'), '0');

SELECT pg_temp.chk('3.3 المُبلِّغ المعلوم يظهر باسمه',
  (SELECT c5 FROM public.hr_report_execute('incidents_detail') WHERE c1='بلاغٌ معلوم'),
  'ريم الثانية');

-- ★★★ صفٌّ أجنبيّ في العيّنة: بدون هذا لا يُختبَر ترشيح المستأجر أصلاً
SELECT pg_temp.chk('3.4 ★ ملاحظة: postgres يتجاوز RLS ⇒ يرى بلاغ باء (الترشيح في -rls.sh)',
  (SELECT count(*)::TEXT FROM public.hr_report_execute('incidents_detail') WHERE c1='بلاغ باء'), '1');

-- ══════════════════════════════════════════════════════════════════════
--  ④ ★★★★ العطل ③: الصحة النفسية مجمَّعةٌ لا فرديّة
--     الهندسة: سالم 20 · ريم 60 · عمر 40  ⇒ n=3 ≥ 3 ⇒ باسمها
--     المالية: صفرٌ من الإدخالات
--     مدير الموارد (بلا قسم): إدخالٌ واحد ⇒ n=1 < 3 ⇒ «أقسام أخرى»
--     المتوسّط للهندسة = (20+60+40)/3 = 40.0
-- ══════════════════════════════════════════════════════════════════════
INSERT INTO public.wellness_entries(tenant_id,employee_id,date,score,mood,stress,energy,notes)
SELECT :TA,e.id,CURRENT_DATE,20,'terrible',90,10,'أفكّر في الاستقالة'
FROM public.employees e WHERE e.user_id=:U1;
INSERT INTO public.wellness_entries(tenant_id,employee_id,date,score,mood,stress,energy,notes)
SELECT :TA,e.id,CURRENT_DATE,60,'good',30,70,'بخير'
FROM public.employees e WHERE e.user_id=:U2;
INSERT INTO public.wellness_entries(tenant_id,employee_id,date,score,mood,stress,energy,notes)
SELECT :TA,e.id,CURRENT_DATE,40,'neutral',60,40,'عاديّ'
FROM public.employees e WHERE e.user_id=:U3;
-- إدخالٌ وحيدٌ لمدير الموارد (بلا قسم) ⇒ يجب أن يُدمج
INSERT INTO public.wellness_entries(tenant_id,employee_id,date,score,mood,stress,energy)
SELECT :TA,e.id,CURRENT_DATE,95,'great',5,95
FROM public.employees e WHERE e.user_id=:HRA;

SELECT pg_temp.chk('4.1 متوسّط الهندسة = 40.0 (حُسِب يدوياً)',
  (SELECT c3 FROM public.hr_report_execute('wellness_aggregate') WHERE c1='الهندسة'), '40.0');

SELECT pg_temp.chk('4.2 عدد إدخالات الهندسة = 3',
  (SELECT c2 FROM public.hr_report_execute('wellness_aggregate') WHERE c1='الهندسة'), '3');

SELECT pg_temp.chk('4.3 ★★★★ القسم ذو الإدخال الواحد مُدمَجٌ في «أقسام أخرى»',
  (SELECT c2 FROM public.hr_report_execute('wellness_aggregate') WHERE c1='أقسام أخرى'), '1');

SELECT pg_temp.chk('4.4 ★★★★ لا اسمَ موظفٍ في تقرير الصحة النفسية البتّة',
  (SELECT count(*)::TEXT FROM public.hr_report_execute('wellness_aggregate') x
    WHERE (COALESCE(x.c1,'')||COALESCE(x.c2,'')||COALESCE(x.c3,'')||COALESCE(x.c4,'')
          ||COALESCE(x.c5,'')||COALESCE(x.c6,'')||COALESCE(x.c7,''))
          ~ 'سالم|ريم|عمر'), '0');

SELECT pg_temp.chk('4.5 ★★★★ ولا ملاحظةَ شخصيّة («أفكّر في الاستقالة»)',
  (SELECT count(*)::TEXT FROM public.hr_report_execute('wellness_aggregate') x
    WHERE (COALESCE(x.c1,'')||COALESCE(x.c2,'')||COALESCE(x.c3,'')||COALESCE(x.c4,'')
          ||COALESCE(x.c5,'')||COALESCE(x.c6,'')||COALESCE(x.c7,'')) LIKE '%استقالة%'), '0');

-- ══════════════════════════════════════════════════════════════════════
--  ⑤ ★★★ العطل ④: الأثر التدقيقيّ
-- ══════════════════════════════════════════════════════════════════════
SELECT pg_temp.reset_runs();

SELECT count(*) FROM public.hr_report_execute('workforce_kpi') \gset x_
SELECT pg_temp.chk('5.1 تشغيلٌ واحدٌ يُسجَّل صفّاً واحداً',
  (SELECT count(*)::TEXT FROM public.hr_report_runs WHERE tenant_id=:TA), '1');

SELECT pg_temp.chk('5.2 السجلّ يحفظ فاعل التصدير',
  (SELECT executed_by::TEXT FROM public.hr_report_runs WHERE tenant_id=:TA),
  '13700001-0000-0000-0000-000000000001');

SELECT pg_temp.chk('5.3 السجلّ يحفظ عدد الصفوف = 10',
  (SELECT row_count::TEXT FROM public.hr_report_runs WHERE tenant_id=:TA), '10');

SELECT pg_temp.chk('5.4 تقريرٌ بلا نطاق ⇒ date_from فارغ',
  (SELECT COALESCE(date_from::TEXT,'NULL') FROM public.hr_report_runs WHERE tenant_id=:TA), 'NULL');

-- ★ تقريرٌ ذو نطاق يُسجّل نطاقه
SELECT pg_temp.reset_runs();
SELECT count(*) FROM public.hr_report_execute('incidents_detail', CURRENT_DATE-10, CURRENT_DATE) \gset y_
SELECT pg_temp.chk('5.5 تقريرٌ ذو نطاق يُسجّل حدَّيه',
  (SELECT date_from::TEXT||'..'||date_to::TEXT FROM public.hr_report_runs WHERE tenant_id=:TA),
  (CURRENT_DATE-10)::TEXT||'..'||CURRENT_DATE::TEXT);

-- ★★★ السجلّ لا يُعدَّل ولا يُحذف
DO $$
DECLARE v TEXT := 'لم يُرفَض';
BEGIN
  BEGIN
  UPDATE public.hr_report_runs SET row_count = 0
   WHERE tenant_id='a3700000-0000-0000-0000-00000000000a';
  EXCEPTION WHEN OTHERS THEN
  v := CASE WHEN SQLERRM LIKE 'HR_REPORT_RUN_IMMUTABLE%' THEN 'رُفض' ELSE left(SQLERRM,30) END;
  END;
  -- ★★★ التأكيد **خارج** المُعالِج: كان بداخله فلم يُنفَّذ حين لا
  --   يُرمى استثناءٌ أصلاً — فلا صفَّ في `_r` ولا فشل. أنجى INV11.
  PERFORM pg_temp.chk('5.6 ★★★ تعديل سجلّ التصدير مرفوض', v, 'رُفض');
END $$;

DO $$
DECLARE v TEXT := 'لم يُرفَض';
BEGIN
  BEGIN
  DELETE FROM public.hr_report_runs
   WHERE tenant_id='a3700000-0000-0000-0000-00000000000a';
  EXCEPTION WHEN OTHERS THEN
  v := CASE WHEN SQLERRM LIKE 'HR_REPORT_RUN_IMMUTABLE%' THEN 'رُفض' ELSE left(SQLERRM,30) END;
  END;
  -- ★★★ التأكيد **خارج** المُعالِج: كان بداخله فلم يُنفَّذ حين لا
  --   يُرمى استثناءٌ أصلاً — فلا صفَّ في `_r` ولا فشل. أنجى INV11.
  PERFORM pg_temp.chk('5.7 ★★★ حذف سجلّ التصدير مرفوض', v, 'رُفض');
END $$;

-- ══════════════════════════════════════════════════════════════════════
--  ⑥ العطل ⑦: النطاق والاقتطاع
-- ══════════════════════════════════════════════════════════════════════
DO $$
DECLARE v TEXT := 'قُبِل';
BEGIN
  BEGIN
    PERFORM public.hr_report_execute('incidents_detail', CURRENT_DATE, CURRENT_DATE-1);
  EXCEPTION WHEN OTHERS THEN
    v := CASE WHEN SQLERRM LIKE 'HR_REPORT_BAD_RANGE%' THEN 'رُفض' ELSE left(SQLERRM,40) END;
  END;
  PERFORM pg_temp.chk('6.1 نطاقٌ معكوس مرفوض', v, 'رُفض');
END $$;

DO $$
DECLARE v TEXT := 'قُبِل';
BEGIN
  BEGIN
    PERFORM public.hr_report_execute('incidents_detail', CURRENT_DATE-400, CURRENT_DATE);
  EXCEPTION WHEN OTHERS THEN
    v := CASE WHEN SQLERRM LIKE 'HR_REPORT_RANGE_TOO_WIDE%' THEN 'رُفض' ELSE left(SQLERRM,40) END;
  END;
  PERFORM pg_temp.chk('6.2 نطاقٌ يتجاوز سنةً مرفوض', v, 'رُفض');
END $$;

DO $$
DECLARE v TEXT := 'قُبِل';
BEGIN
  BEGIN
    PERFORM public.hr_report_execute('ghost_report');
  EXCEPTION WHEN OTHERS THEN
    v := CASE WHEN SQLERRM LIKE 'HR_REPORT_UNKNOWN%' THEN 'رُفض' ELSE left(SQLERRM,40) END;
  END;
  PERFORM pg_temp.chk('6.3 ★ رمزٌ مجهول يُرفَض بدل «بيانات تجريبية»', v, 'رُفض');
END $$;

-- ★★★ الاقتطاع مكشوف: ثلاثة بلاغاتٍ بحدٍّ = 2
SELECT pg_temp.reset_runs();
SELECT pg_temp.chk('6.4 حدُّ 2 يُعيد صفَّين',
  (SELECT count(*)::TEXT FROM public.hr_report_execute('incidents_detail',CURRENT_DATE-30,CURRENT_DATE,2)), '2');

SELECT pg_temp.chk('6.5 ★★★ total_rows يكشف الإجمالي الحقيقيّ = 3',
  (SELECT DISTINCT total_rows::TEXT FROM public.hr_report_execute('incidents_detail',CURRENT_DATE-30,CURRENT_DATE,2)), '3');

SELECT pg_temp.chk('6.6 ★★★ السجلّ يوسم الاقتطاع',
  (SELECT was_truncated::TEXT FROM public.hr_report_runs
    WHERE tenant_id=:TA ORDER BY executed_at DESC, id LIMIT 1), 'true');

SELECT count(*) FROM public.hr_report_execute('workforce_kpi') \gset z_
SELECT pg_temp.chk('6.7 وبلا اقتطاعٍ لا يُوسَم',
  (SELECT was_truncated::TEXT FROM public.hr_report_runs
    WHERE tenant_id=:TA AND report_code='workforce_kpi'
    ORDER BY executed_at DESC, id LIMIT 1), 'false');

-- ══════════════════════════════════════════════════════════════════════
--  ⑦ القيود على سجلّ التشغيل
-- ══════════════════════════════════════════════════════════════════════
DO $$
DECLARE v TEXT := 'قُبِل';
BEGIN
  BEGIN
    INSERT INTO public.hr_report_runs(tenant_id,report_code,executed_by,row_count,total_rows,was_truncated)
    VALUES ('a3700000-0000-0000-0000-00000000000a','workforce_kpi',
            '13700001-0000-0000-0000-000000000001', 5, 3, FALSE);
  EXCEPTION WHEN OTHERS THEN v := 'رُفض';
  END;
  PERFORM pg_temp.chk('7.1 total_rows < row_count مرفوض', v, 'رُفض');
END $$;

DO $$
DECLARE v TEXT := 'قُبِل';
BEGIN
  BEGIN
    INSERT INTO public.hr_report_runs(tenant_id,report_code,executed_by,row_count,total_rows,was_truncated)
    VALUES ('a3700000-0000-0000-0000-00000000000a','workforce_kpi',
            '13700001-0000-0000-0000-000000000001', 2, 9, FALSE);
  EXCEPTION WHEN OTHERS THEN v := 'رُفض';
  END;
  PERFORM pg_temp.chk('7.2 ★★★ اقتطاعٌ غير موسومٍ مرفوض (IS NOT DISTINCT FROM)', v, 'رُفض');
END $$;

-- ★★★★ الثغرة الثلاثية: NULL في was_truncated لا يمرّ
DO $$
DECLARE v TEXT := 'قُبِل';
BEGIN
  BEGIN
    INSERT INTO public.hr_report_runs(tenant_id,report_code,executed_by,row_count,total_rows,was_truncated)
    VALUES ('a3700000-0000-0000-0000-00000000000a','workforce_kpi',
            '13700001-0000-0000-0000-000000000001', 2, 9, NULL);
  EXCEPTION WHEN OTHERS THEN v := 'رُفض';
  END;
  PERFORM pg_temp.chk('7.3 ★★★★ was_truncated = NULL مرفوض', v, 'رُفض');
END $$;

-- ★★★ FK مركَّب: فاعلٌ من مستأجرٍ آخر
DO $$
DECLARE v TEXT := 'قُبِل';
BEGIN
  BEGIN
    INSERT INTO public.hr_report_runs(tenant_id,report_code,executed_by,row_count,total_rows,was_truncated)
    VALUES ('a3700000-0000-0000-0000-00000000000a','workforce_kpi',
            '43700004-0000-0000-0000-000000000004', 1, 1, FALSE);
  EXCEPTION WHEN OTHERS THEN v := 'رُفض';
  END;
  PERFORM pg_temp.chk('7.4 ★★★ فاعلٌ من مستأجرٍ آخر مرفوض (FK مركَّب)', v, 'رُفض');
END $$;

DO $$
DECLARE v TEXT := 'قُبِل';
BEGIN
  BEGIN
    INSERT INTO public.hr_report_runs(tenant_id,report_code,executed_by,row_count,total_rows,was_truncated,date_from,date_to)
    VALUES ('a3700000-0000-0000-0000-00000000000a','workforce_kpi',
            '13700001-0000-0000-0000-000000000001', 1, 1, FALSE, CURRENT_DATE, CURRENT_DATE-5);
  EXCEPTION WHEN OTHERS THEN v := 'رُفض';
  END;
  PERFORM pg_temp.chk('7.5 نطاقٌ معكوسٌ في السجلّ مرفوض', v, 'رُفض');
END $$;

DO $$
DECLARE v TEXT := 'قُبِل';
BEGIN
  BEGIN
    INSERT INTO public.hr_report_runs(tenant_id,report_code,executed_by,row_count,total_rows,was_truncated)
    VALUES ('a3700000-0000-0000-0000-00000000000a','ghost_code',
            '13700001-0000-0000-0000-000000000001', 1, 1, FALSE);
  EXCEPTION WHEN OTHERS THEN v := 'رُفض';
  END;
  PERFORM pg_temp.chk('7.6 رمزُ تقريرٍ غير موجودٍ مرفوض (FK)', v, 'رُفض');
END $$;

-- ══════════════════════════════════════════════════════════════════════
--  ⑧ الكتالوج المقروء
-- ══════════════════════════════════════════════════════════════════════
SELECT pg_temp.chk('8.1 hr_report_catalog يُعيد 8',
  (SELECT count(*)::TEXT FROM public.hr_report_catalog()), '8');

SELECT pg_temp.chk('8.2 الترتيب بـsort_order: الأول workforce_kpi',
  (SELECT code FROM public.hr_report_catalog() LIMIT 1), 'workforce_kpi');

SELECT pg_temp.chk('8.3 الأخير contracts_expiry',
  (SELECT code FROM public.hr_report_catalog() OFFSET 7 LIMIT 1), 'contracts_expiry');

SELECT pg_temp.chk('8.4 runs_30d يعدّ التشغيلات الحديثة',
  (SELECT CASE WHEN runs_30d > 0 THEN 'نعم' ELSE 'لا' END
   FROM public.hr_report_catalog() WHERE code='incidents_detail'), 'نعم');

-- ══════════════════════════════════════════════════════════════════════
--  ⑨ اللوح
-- ══════════════════════════════════════════════════════════════════════
SELECT pg_temp.chk('9.1 اللوح يعرض اسم الفاعل',
  (SELECT DISTINCT actor_name FROM public.hr_report_run_board() WHERE report_code='incidents_detail'),
  'مدير الموارد ألف');

-- ★ اللوح لا يعرض إلّا ما شُغِّل فعلاً — نُشغِّل الحسّاس هنا صراحةً
SELECT count(*) FROM public.hr_report_execute('wellness_aggregate') \gset w_
SELECT pg_temp.chk('9.2 اللوح يعرض اسم التقرير العربيّ',
  (SELECT DISTINCT report_name FROM public.hr_report_run_board() WHERE report_code='wellness_aggregate' LIMIT 1),
  'مؤشر الصحة النفسية (مجمَّع)');

SELECT pg_temp.chk('9.3 ★ اللوح يوسم التقرير الحسّاس',
  (SELECT DISTINCT is_sensitive::TEXT FROM public.hr_report_run_board() WHERE report_code='incidents_detail'),
  'true');

-- ══════════════════════════════════════════════════════════════════════
--  ⑩ التقارير التفصيلية — أرقامٌ محسوبةٌ يدوياً
-- ══════════════════════════════════════════════════════════════════════
-- الأقسام: الهندسة 3 (سالم نشط · ريم نشط · عمر غير نشط) — مدير الموارد بلا قسم
SELECT pg_temp.chk('10.1 الهندسة: 2 نشط · 1 غير نشط · 3 إجمالي',
  (SELECT c2||'/'||c3||'/'||c4 FROM public.hr_report_execute('headcount_by_department')
    WHERE c1='الهندسة'), '2/1/3');

-- الحضور
INSERT INTO public.attendance_summary(tenant_id,employee_id,shift_date,status,late_minutes,total_hours)
SELECT :TA,e.id,CURRENT_DATE-1,'متأخر',15,7.5 FROM public.employees e WHERE e.user_id=:U1;
INSERT INTO public.attendance_summary(tenant_id,employee_id,shift_date,status,late_minutes,total_hours)
SELECT :TA,e.id,CURRENT_DATE-200,'غائب',0,0 FROM public.employees e WHERE e.user_id=:U1;

SELECT pg_temp.chk('10.2 ★ النطاق الافتراضيّ 90 يوماً يستبعد صفَّ 200 يوم',
  (SELECT count(*)::TEXT FROM public.hr_report_execute('attendance_detail')), '1');

SELECT pg_temp.chk('10.3 وباتّساع النطاق يظهر الصفّان',
  (SELECT count(*)::TEXT FROM public.hr_report_execute('attendance_detail',CURRENT_DATE-300,CURRENT_DATE)), '2');

SELECT pg_temp.chk('10.4 معنونُ الموظف يبني الاسم من first+last',
  (SELECT c1 FROM public.hr_report_execute('attendance_detail') LIMIT 1), 'سالم الأول');

-- الإجازات: واحدةٌ تبدأ قبل النطاق وتمتدّ داخله ⇒ التقاطع لا الاحتواء
INSERT INTO public.leaves(tenant_id,employee_id,leave_type,date_from,date_to,working_days_count,status,approved_by)
SELECT :TA,e.id,'سنوية',CURRENT_DATE-95,CURRENT_DATE-80,10,'موافق',:HRA
FROM public.employees e WHERE e.user_id=:U2;

SELECT pg_temp.chk('10.5 ★ إجازةٌ تبدأ قبل النطاق وتمتدّ داخله تُحتسب (تقاطع)',
  (SELECT count(*)::TEXT FROM public.hr_report_execute('leaves_detail')), '1');

SELECT pg_temp.chk('10.6 المعتمِد يظهر باسمه',
  (SELECT c7 FROM public.hr_report_execute('leaves_detail') LIMIT 1), 'مدير الموارد ألف');

-- العقود
INSERT INTO public.employee_contracts(tenant_id,employee_id,contract_number,contract_type,
                                      title,start_date,end_date,status,created_by)
SELECT :TA,e.id,'C-0370-1','permanent','عقد',CURRENT_DATE-365,CURRENT_DATE+20,'active',:HRA
FROM public.employees e WHERE e.user_id=:U1;

SELECT pg_temp.chk('10.7 المتبقّي على العقد = 20 يوماً',
  (SELECT c6 FROM public.hr_report_execute('contracts_expiry') WHERE c1='C-0370-1'), '20');

SELECT pg_temp.chk('10.8 «عقود تنتهي خلال 30 يوماً» في المؤشرات ≥ 1',
  (SELECT CASE WHEN c2::INTEGER >= 1 THEN 'نعم' ELSE 'لا' END
   FROM public.hr_report_execute('workforce_kpi') WHERE c1='عقود تنتهي خلال 30 يوماً'), 'نعم');

-- الأداء
INSERT INTO public.performance_reviews(tenant_id,employee_id,reviewer_id,score,rating,status)
SELECT :TA,e.id,:HRA,88,4,'completed' FROM public.employees e WHERE e.user_id=:U1;

SELECT pg_temp.chk('10.9 تقييمُ أداءٍ واحدٌ ضمن النطاق',
  (SELECT count(*)::TEXT FROM public.hr_report_execute('performance_summary')), '1');

SELECT pg_temp.chk('10.10 الدرجة 88 والمُقيِّم يظهران',
  (SELECT c3||'|'||c2 FROM public.hr_report_execute('performance_summary') LIMIT 1),
  '88|مدير الموارد ألف');

-- ══════════════════════════════════════════════════════════════════════
--  ⑪ الجدار والصلاحيات (فحصٌ ثابت — التنفيذ الحقيقيّ في -rls.sh)
-- ══════════════════════════════════════════════════════════════════════
SELECT pg_temp.chk('11.1 RLS مفعَّلةٌ على hr_report_runs',
  (SELECT relrowsecurity::TEXT FROM pg_class WHERE oid='public.hr_report_runs'::regclass), 'true');

SELECT pg_temp.chk('11.2 ★★★ البوّابة الهجينة RESTRICTIVE',
  (SELECT polpermissive::TEXT FROM pg_policy
    WHERE polrelid='public.hr_report_runs'::regclass AND polname='hybrid_gate_hr_report_runs'), 'false');

SELECT pg_temp.chk('11.3 البوّابة على وحدة hr',
  (SELECT CASE WHEN pg_get_expr(polqual,polrelid) LIKE '%''hr''%' THEN 'نعم' ELSE 'لا' END
   FROM pg_policy WHERE polrelid='public.hr_report_runs'::regclass
     AND polname='hybrid_gate_hr_report_runs'), 'نعم');

SELECT pg_temp.chk('11.4 ★★★ لا سياسة UPDATE ولا DELETE على السجلّ',
  (SELECT count(*)::TEXT FROM pg_policy
    WHERE polrelid='public.hr_report_runs'::regclass AND polcmd IN ('w','d')), '0');

SELECT pg_temp.chk('11.5 ★★★ anon محرومٌ من hr_report_execute',
  (SELECT CASE WHEN has_function_privilege('anon',
     'public.hr_report_execute(TEXT,DATE,DATE,INTEGER)','EXECUTE')
   THEN 'له' ELSE 'محروم' END), 'محروم');

SELECT pg_temp.chk('11.6 ★★★ anon محرومٌ من hr_report_catalog',
  (SELECT CASE WHEN has_function_privilege('anon','public.hr_report_catalog()','EXECUTE')
   THEN 'له' ELSE 'محروم' END), 'محروم');

SELECT pg_temp.chk('11.7 ★★★ anon محرومٌ من hr_report_run_board',
  (SELECT CASE WHEN has_function_privilege('anon','public.hr_report_run_board(INTEGER)','EXECUTE')
   THEN 'له' ELSE 'محروم' END), 'محروم');

SELECT pg_temp.chk('11.8 ★★★ anon لا يقرأ سجلّ التصديرات',
  (SELECT CASE WHEN has_table_privilege('anon','public.hr_report_runs','SELECT')
   THEN 'له' ELSE 'محروم' END), 'محروم');

SELECT pg_temp.chk('11.9 authenticated لا يُعدّل السجلّ',
  (SELECT CASE WHEN has_table_privilege('authenticated','public.hr_report_runs','UPDATE')
   THEN 'له' ELSE 'محروم' END), 'محروم');

SELECT pg_temp.chk('11.10 authenticated لا يحذف السجلّ',
  (SELECT CASE WHEN has_table_privilege('authenticated','public.hr_report_runs','DELETE')
   THEN 'له' ELSE 'محروم' END), 'محروم');

SELECT pg_temp.chk('11.11 ★ الكتالوج بلا سياسة كتابة',
  (SELECT count(*)::TEXT FROM pg_policy
    WHERE polrelid='public.hr_report_definitions'::regclass AND polcmd <> 'r'), '0');

-- ★★★ المنفّذ SECURITY INVOKER — لولا ذلك لتجاوز RLS على كلّ جدولٍ يقرؤه
SELECT pg_temp.chk('11.12 ★★★★ hr_report_execute هي SECURITY INVOKER',
  (SELECT prosecdef::TEXT FROM pg_proc
    WHERE oid='public.hr_report_execute(TEXT,DATE,DATE,INTEGER)'::regprocedure), 'false');

SELECT pg_temp.chk('11.13 hr_report_catalog هي SECURITY INVOKER',
  (SELECT prosecdef::TEXT FROM pg_proc
    WHERE oid='public.hr_report_catalog()'::regprocedure), 'false');

SELECT pg_temp.chk('11.14 hr_report_run_board هي SECURITY INVOKER',
  (SELECT prosecdef::TEXT FROM pg_proc
    WHERE oid='public.hr_report_run_board(INTEGER)'::regprocedure), 'false');

-- ★★★ فحص نصّ الدالة: المحفّز لا يستطيع إخفاء سقوط هذا (درس INV35/INV31)
SELECT pg_temp.chk('11.15 ★★★ نصّ hr_report_execute يحتوي حارس is_staff',
  (SELECT CASE WHEN pg_get_functiondef('public.hr_report_execute(TEXT,DATE,DATE,INTEGER)'::regprocedure)
                 LIKE '%HR_REPORT_FORBIDDEN%' THEN 'موجود' ELSE 'مفقود' END), 'موجود');

SELECT pg_temp.chk('11.16 ★★★ نصّ الدالة يحتوي إخفاء المُبلِّغ المجهول',
  (SELECT CASE WHEN pg_get_functiondef('public.hr_report_execute(TEXT,DATE,DATE,INTEGER)'::regprocedure)
                 LIKE '%مُبلِّغ مجهول%' THEN 'موجود' ELSE 'مفقود' END), 'موجود');

SELECT pg_temp.chk('11.17 ★★★ نصّ الدالة يحتوي حدَّ الإخفاء k = 3',
  (SELECT CASE WHEN pg_get_functiondef('public.hr_report_execute(TEXT,DATE,DATE,INTEGER)'::regprocedure)
                 LIKE '%cnt.n >= 3%' THEN 'موجود' ELSE 'مفقود' END), 'موجود');

SELECT pg_temp.chk('11.18 ★★★ نصّ الدالة يكتب في hr_report_runs',
  (SELECT CASE WHEN pg_get_functiondef('public.hr_report_execute(TEXT,DATE,DATE,INTEGER)'::regprocedure)
                 LIKE '%INSERT INTO public.hr_report_runs%' THEN 'موجود' ELSE 'مفقود' END), 'موجود');

SELECT pg_temp.chk('11.19 ★★★ توقيت بغداد صريحٌ في الدالة',
  (SELECT CASE WHEN pg_get_functiondef('public.hr_report_execute(TEXT,DATE,DATE,INTEGER)'::regprocedure)
                 LIKE '%Asia/Baghdad%' THEN 'موجود' ELSE 'مفقود' END), 'موجود');

-- ══════════════════════════════════════════════════════════════════════
--  النتيجة
-- ══════════════════════════════════════════════════════════════════════
\set QUIET off
\echo ''
\echo '════════════════ نتائج verify-hr-reports-0370 ════════════════'
SELECT n AS "التأكيد",
       CASE WHEN pass THEN '✅' ELSE '❌' END AS "ح",
       CASE WHEN pass THEN '' ELSE 'حصلنا: '||COALESCE(got,'NULL')||' · نتوقّع: '||COALESCE(want,'NULL') END AS "التفصيل"
FROM _r ORDER BY row_number() OVER ();

SELECT count(*) FILTER (WHERE pass) AS "ناجح",
       count(*) FILTER (WHERE NOT pass) AS "فاشل",
       count(*) AS "الإجمالي"
FROM _r;

DO $$
DECLARE v INTEGER;
BEGIN
  SELECT count(*) INTO v FROM _r WHERE NOT pass;
  IF v > 0 THEN RAISE EXCEPTION 'VERIFY_0370_FAILED: % تأكيداً فاشلاً', v; END IF;
  RAISE NOTICE '✅ verify-hr-reports-0370: كل التأكيدات ناجحة';
END $$;

ROLLBACK;
