-- ════════════════════════════════════════════════════════════════════════
--  التحقق السلوكيّ من 0356 — سلامة تقييم الأداء
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
  RAISE NOTICE 'ok   %  =  %', rpad(p_label, 48, '.'), COALESCE(p_want,'NULL');
END $$;

-- ══════════════════════ العيّنة ══════════════════════
-- ★ UUIDات فريدة في **أول 8 حروف**: tg_ensure_employee_row يبني
--   employee_code من 8 حروف فقط و ON CONFLICT DO NOTHING يبتلع
--   التصادم صامتاً (درس 0355).
INSERT INTO public.tenants (id,name,name_ar,slug) VALUES
 ('a3560000-0000-0000-0000-00000000000a','T356A','شركة ألف','t356a'),
 ('b3560000-0000-0000-0000-00000000000b','T356B','شركة باء','t356b');

INSERT INTO auth.users(id,email) VALUES
 ('16560001-0000-0000-0000-000000000001','e1@t356a'),
 ('26560002-0000-0000-0000-000000000002','e2@t356a'),
 ('36560003-0000-0000-0000-000000000003','hr@t356a'),
 ('46560004-0000-0000-0000-000000000004','mgr@t356a'),
 ('56560005-0000-0000-0000-000000000005','adm@t356a'),
 ('66560006-0000-0000-0000-000000000006','e@t356b'),
 ('76560007-0000-0000-0000-000000000007','hr@t356b');

INSERT INTO public.profiles (id,tenant_id,full_name,role,department,salary) VALUES
 ('46560004-0000-0000-0000-000000000004','a3560000-0000-0000-0000-00000000000a','منير المدير','manager','المالية',3000000);

INSERT INTO public.departments (id,tenant_id,name_ar,manager_id) VALUES
 ('d6560000-0000-0000-0000-00000000000d','a3560000-0000-0000-0000-00000000000a','المالية',
  '46560004-0000-0000-0000-000000000004');

INSERT INTO public.profiles (id,tenant_id,full_name,role,department,salary) VALUES
 ('16560001-0000-0000-0000-000000000001','a3560000-0000-0000-0000-00000000000a','سالم الأول','employee','المالية',1000000),
 ('26560002-0000-0000-0000-000000000002','a3560000-0000-0000-0000-00000000000a','ناصر الثاني','employee','المالية',1200000),
 ('36560003-0000-0000-0000-000000000003','a3560000-0000-0000-0000-00000000000a','هدى الموارد','hr','الموارد',1500000),
 ('56560005-0000-0000-0000-000000000005','a3560000-0000-0000-0000-00000000000a','آدم المسؤول','admin','الإدارة',4000000),
 ('66560006-0000-0000-0000-000000000006','b3560000-0000-0000-0000-00000000000b','أجنبي','employee','المالية',1000000),
 ('76560007-0000-0000-0000-000000000007','b3560000-0000-0000-0000-00000000000b','مورد باء','hr','الموارد',1500000);

SELECT set_config('kyvzon.t356_e1',
  (SELECT e.id::TEXT FROM public.employees e WHERE e.user_id='16560001-0000-0000-0000-000000000001'), FALSE),
       set_config('kyvzon.t356_e2',
  (SELECT e.id::TEXT FROM public.employees e WHERE e.user_id='26560002-0000-0000-0000-000000000002'), FALSE),
       set_config('kyvzon.t356_eb',
  (SELECT e.id::TEXT FROM public.employees e WHERE e.user_id='66560006-0000-0000-0000-000000000006'), FALSE);

\echo ''
\echo '═══ ★★★ ① الأعمدة الناقصة — الإنشاء والتعديل كانا يفشلان ═══'

SET LOCAL request.jwt.claim.sub = '36560003-0000-0000-0000-000000000003';

DO $$
DECLARE c TEXT;
BEGIN
  FOREACH c IN ARRAY ARRAY['score','strengths','improvements',
                           'completed_at','updated_at','archived_at',
                           'archive_reason'] LOOP
    PERFORM pg_temp.chk('1.' || c || ' موجود',
      (SELECT count(*)::TEXT FROM information_schema.columns
        WHERE table_name='performance_reviews' AND column_name=c), '1');
  END LOOP;
END $$;

-- ★★★ العطل ②: أيُّ UPDATE كان يرمي «record new has no field updated_at»
INSERT INTO public.performance_reviews
  (id, tenant_id, employee_id, reviewer_id, score, status)
VALUES ('c3560000-0000-0000-0000-000000000001',
        'a3560000-0000-0000-0000-00000000000a',
        current_setting('kyvzon.t356_e1')::UUID,
        '36560003-0000-0000-0000-000000000003', 88, 'draft');

DO $$
DECLARE v_ok BOOLEAN := TRUE; v_m TEXT := '';
BEGIN
  BEGIN
    UPDATE public.performance_reviews SET comments = 'تعديل عاديّ'
     WHERE id='c3560000-0000-0000-0000-000000000001';
  EXCEPTION WHEN OTHERS THEN v_ok := FALSE;
            GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('1.8 ★★★ UPDATE عاديّ ينجح', v_ok::TEXT, 'true');
  PERFORM pg_temp.chk('1.9 المحفّز يكتب updated_at',
    (SELECT (updated_at IS NOT NULL)::TEXT FROM public.performance_reviews
      WHERE id='c3560000-0000-0000-0000-000000000001'), 'true');
END $$;

\echo ''
\echo '═══ ★★★ ③ السُّلَّم الواحد — rating يُشتقّ من score ═══'

-- 88 ÷ 20 = 4.4 ⇒ ceil = 5
DO $$
BEGIN
  PERFORM pg_temp.chk('3.1 score=88 ⇒ rating=5',
    (SELECT rating::TEXT FROM public.performance_reviews
      WHERE id='c3560000-0000-0000-0000-000000000001'), '5');
END $$;

-- الحدود المحسوبة يدوياً:
--   0   → GREATEST(1, ceil(0/20)=0)   = 1   ★ لولا GREATEST لخالف CHECK
--   20  → ceil(1.0)  = 1
--   21  → ceil(1.05) = 2
--   60  → ceil(3.0)  = 3
--   61  → ceil(3.05) = 4
--   100 → ceil(5.0)  = 5
DO $$
DECLARE v RECORD; v_id UUID;
BEGIN
  FOR v IN SELECT * FROM (VALUES (0,1),(20,1),(21,2),(60,3),(61,4),(100,5))
                          AS t(s, r) LOOP
    INSERT INTO public.performance_reviews
      (tenant_id, employee_id, reviewer_id, score, status)
    VALUES ('a3560000-0000-0000-0000-00000000000a',
            current_setting('kyvzon.t356_e1')::UUID,
            '36560003-0000-0000-0000-000000000003', v.s, 'draft')
    RETURNING id INTO v_id;
    PERFORM pg_temp.chk('3.2 score=' || v.s || ' ⇒ rating',
      (SELECT rating::TEXT FROM public.performance_reviews WHERE id=v_id),
      v.r::TEXT);
    DELETE FROM public.performance_reviews WHERE FALSE;  -- لا حذف: المحفّز يمنع
    UPDATE public.performance_reviews SET status='cancelled' WHERE id=v_id;
  END LOOP;
END $$;

-- الاتجاه العكسيّ: rating وحده ⇒ score = منتصف الشريحة
DO $$
DECLARE v_id UUID;
BEGIN
  INSERT INTO public.performance_reviews
    (tenant_id, employee_id, reviewer_id, rating, status)
  VALUES ('a3560000-0000-0000-0000-00000000000a',
          current_setting('kyvzon.t356_e2')::UUID,
          '36560003-0000-0000-0000-000000000003', 4, 'draft')
  RETURNING id INTO v_id;
  -- 4×20 − 10 = 70
  PERFORM pg_temp.chk('3.3 rating=4 ⇒ score=70',
    (SELECT score::TEXT FROM public.performance_reviews WHERE id=v_id), '70.00');
  UPDATE public.performance_reviews SET status='cancelled' WHERE id=v_id;
END $$;

\echo ''
\echo '═══ ★★ ④ مفردات الحالة — نصّ حرّ لم يعد يمرّ ═══'

DO $$
DECLARE v_ok BOOLEAN := FALSE; v_m TEXT := '';
BEGIN
  BEGIN
    INSERT INTO public.performance_reviews
      (tenant_id, employee_id, reviewer_id, score, status)
    VALUES ('a3560000-0000-0000-0000-00000000000a',
            current_setting('kyvzon.t356_e2')::UUID,
            '36560003-0000-0000-0000-000000000003', 50, 'حالة مخترعة');
  EXCEPTION WHEN check_violation THEN v_ok := TRUE;
            GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('4.1 نصّ عشوائيّ مرفوض', v_ok::TEXT, 'true');
  PERFORM pg_temp.chk('4.2 القيد المُسمّى هو الرافض',
    (position('performance_reviews_status_chk' IN v_m) > 0)::TEXT, 'true');
END $$;

DO $$
DECLARE v_ok BOOLEAN := FALSE; v_m TEXT := '';
BEGIN
  BEGIN PERFORM public.performance_reviews_board(NULL, 'مسودة', NULL, FALSE, 10);
  EXCEPTION WHEN check_violation THEN v_ok := TRUE;
            GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('4.3 حارس اللوحة يرفض حالة مجهولة', v_ok::TEXT, 'true');
  PERFORM pg_temp.chk('4.4 رمز REVIEW_BAD_STATUS',
    (position('REVIEW_BAD_STATUS' IN v_m) > 0)::TEXT, 'true');
END $$;

\echo ''
\echo '═══ ★★ ⑤ قيود الدورة ═══'

DO $$
DECLARE v_ok BOOLEAN; v_m TEXT;
BEGIN
  -- النهاية قبل البداية
  v_ok := FALSE; v_m := '';
  BEGIN PERFORM public.performance_cycle_create(
    'مقلوبة', NULL, DATE '2026-06-01', DATE '2026-01-01', 'quarterly');
  EXCEPTION WHEN check_violation THEN v_ok := TRUE;
            GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('5.1 النهاية قبل البداية مرفوضة', v_ok::TEXT, 'true');
  PERFORM pg_temp.chk('5.2 رمز CYCLE_BAD_RANGE',
    (position('CYCLE_BAD_RANGE' IN v_m) > 0)::TEXT, 'true');

  -- فترة مخترعة
  v_ok := FALSE; v_m := '';
  BEGIN PERFORM public.performance_cycle_create(
    'فترة', NULL, DATE '2026-01-01', DATE '2026-03-31', 'كل ثانية');
  EXCEPTION WHEN check_violation THEN v_ok := TRUE;
            GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('5.3 فترة مخترعة مرفوضة', v_ok::TEXT, 'true');
  PERFORM pg_temp.chk('5.4 رمز CYCLE_BAD_PERIOD',
    (position('CYCLE_BAD_PERIOD' IN v_m) > 0)::TEXT, 'true');

  -- اسم فارغ
  v_ok := FALSE;
  BEGIN PERFORM public.performance_cycle_create(
    '   ', NULL, DATE '2026-01-01', DATE '2026-03-31', 'quarterly');
  EXCEPTION WHEN check_violation THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('5.5 اسم فارغ مرفوض', v_ok::TEXT, 'true');

  -- تاريخ ناقص
  v_ok := FALSE;
  BEGIN PERFORM public.performance_cycle_create('بلا تاريخ');
  EXCEPTION WHEN check_violation THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('5.6 تاريخ ناقص مرفوض', v_ok::TEXT, 'true');

  -- ★ ولا القيد نفسه يُخترَق بإدراج مباشر
  v_ok := FALSE;
  BEGIN
    INSERT INTO public.performance_cycles
      (tenant_id,name,start_date,end_date,review_period,status)
    VALUES ('a3560000-0000-0000-0000-00000000000a','مباشر',
            DATE '2026-06-01', DATE '2026-01-01','quarterly','draft');
  EXCEPTION WHEN check_violation THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('5.7 القيد يحرس الإدراج المباشر', v_ok::TEXT, 'true');
END $$;

-- دورة صحيحة
DO $$
DECLARE v_id UUID;
BEGIN
  v_id := public.performance_cycle_create(
    'الربع الأول 2026', 'تقييم ربعيّ', DATE '2026-01-01', DATE '2026-03-31', 'quarterly');
  PERFORM set_config('kyvzon.t356_cyc', v_id::TEXT, FALSE);
  PERFORM pg_temp.chk('5.8 الدورة تُنشأ بحالة draft',
    (SELECT status FROM public.performance_cycles WHERE id=v_id), 'draft');
  PERFORM pg_temp.chk('5.9 created_by يُملأ',
    (SELECT (created_by IS NOT NULL)::TEXT FROM public.performance_cycles
      WHERE id=v_id), 'true');
END $$;

\echo ''
\echo '═══ ★★ ⑥ الفرادة — تقييمان لنفس الموظف في نفس الدورة ═══'

DO $$
DECLARE v_id UUID; v_ok BOOLEAN := FALSE; v_m TEXT := '';
BEGIN
  PERFORM public.performance_cycle_set_status(
    current_setting('kyvzon.t356_cyc')::UUID, 'active');

  v_id := public.performance_review_create(
    current_setting('kyvzon.t356_e1')::UUID,
    current_setting('kyvzon.t356_cyc')::UUID,
    '46560004-0000-0000-0000-000000000004', 88, 'دقيق', 'السرعة', 'ملاحظة');
  PERFORM set_config('kyvzon.t356_rev', v_id::TEXT, FALSE);
  PERFORM pg_temp.chk('6.1 التقييم يُنشأ', (v_id IS NOT NULL)::TEXT, 'true');

  BEGIN PERFORM public.performance_review_create(
    current_setting('kyvzon.t356_e1')::UUID,
    current_setting('kyvzon.t356_cyc')::UUID,
    '46560004-0000-0000-0000-000000000004', 60);
  EXCEPTION WHEN unique_violation THEN v_ok := TRUE;
            GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('6.2 التكرار مرفوض', v_ok::TEXT, 'true');
  PERFORM pg_temp.chk('6.3 رمز REVIEW_DUPLICATE',
    (position('REVIEW_DUPLICATE' IN v_m) > 0)::TEXT, 'true');
  PERFORM pg_temp.chk('6.4 صفٌّ واحد فقط',
    (SELECT count(*)::TEXT FROM public.performance_reviews
      WHERE cycle_id = current_setting('kyvzon.t356_cyc')::UUID), '1');
END $$;

-- ★ والفهرس نفسه يحرس الإدراج المباشر
DO $$
DECLARE v_ok BOOLEAN := FALSE;
BEGIN
  BEGIN
    INSERT INTO public.performance_reviews
      (tenant_id, cycle_id, employee_id, reviewer_id, score, status)
    VALUES ('a3560000-0000-0000-0000-00000000000a',
            current_setting('kyvzon.t356_cyc')::UUID,
            current_setting('kyvzon.t356_e1')::UUID,
            '36560003-0000-0000-0000-000000000003', 40, 'draft');
  EXCEPTION WHEN unique_violation THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('6.5 uq_review_per_employee_cycle يحرس', v_ok::TEXT, 'true');
END $$;

\echo ''
\echo '═══ ★★ ⑦ لا تقييم ذاتيّ ═══'

DO $$
DECLARE v_ok BOOLEAN := FALSE; v_m TEXT := '';
BEGIN
  BEGIN
    INSERT INTO public.performance_reviews
      (tenant_id, employee_id, reviewer_id, score, status)
    VALUES ('a3560000-0000-0000-0000-00000000000a',
            current_setting('kyvzon.t356_e1')::UUID,
            '16560001-0000-0000-0000-000000000001', 100, 'draft');
  EXCEPTION WHEN check_violation THEN v_ok := TRUE;
            GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('7.1 التقييم الذاتيّ مرفوض', v_ok::TEXT, 'true');
  PERFORM pg_temp.chk('7.2 رمز REVIEW_SELF_NOT_ALLOWED',
    (position('REVIEW_SELF_NOT_ALLOWED' IN v_m) > 0)::TEXT, 'true');
  -- ★ ولا صفّ بدرجة 100 دخل
  PERFORM pg_temp.chk('7.3 لا صفّ ذاتيّ في القاعدة',
    (SELECT count(*)::TEXT FROM public.performance_reviews r
      JOIN public.employees e ON e.id = r.employee_id
     WHERE e.user_id = r.reviewer_id), '0');
END $$;

\echo ''
\echo '═══ ★★ ⑧ FK على cycle_id ═══'

DO $$
DECLARE v_ok BOOLEAN := FALSE;
BEGIN
  BEGIN
    INSERT INTO public.performance_reviews
      (tenant_id, cycle_id, employee_id, reviewer_id, score, status)
    VALUES ('a3560000-0000-0000-0000-00000000000a',
            'ffffffff-ffff-ffff-ffff-ffffffffffff',
            current_setting('kyvzon.t356_e2')::UUID,
            '36560003-0000-0000-0000-000000000003', 50, 'draft');
  EXCEPTION WHEN foreign_key_violation THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('8.1 دورة غير موجودة مرفوضة', v_ok::TEXT, 'true');
END $$;

\echo ''
\echo '═══ ★★ انتقالات الحالة ═══'

DO $$
DECLARE v_id UUID := current_setting('kyvzon.t356_rev')::UUID;
        v_ok BOOLEAN; v_m TEXT;
BEGIN
  -- draft → completed ممنوع (يجب المرور بـsubmitted)
  v_ok := FALSE; v_m := '';
  BEGIN PERFORM public.performance_review_set_status(v_id, 'completed');
  EXCEPTION WHEN check_violation THEN v_ok := TRUE;
            GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('9.1 draft ⇸ completed', v_ok::TEXT, 'true');
  PERFORM pg_temp.chk('9.2 رمز REVIEW_BAD_TRANSITION',
    (position('REVIEW_BAD_TRANSITION' IN v_m) > 0)::TEXT, 'true');

  PERFORM public.performance_review_set_status(v_id, 'submitted');
  PERFORM pg_temp.chk('9.3 draft → submitted',
    (SELECT status FROM public.performance_reviews WHERE id=v_id), 'submitted');
  -- ★ المحفّز يختم submitted_at
  PERFORM pg_temp.chk('9.4 submitted_at يُختم',
    (SELECT (submitted_at IS NOT NULL)::TEXT FROM public.performance_reviews
      WHERE id=v_id), 'true');

  PERFORM public.performance_review_set_status(v_id, 'completed');
  PERFORM pg_temp.chk('9.5 submitted → completed',
    (SELECT status FROM public.performance_reviews WHERE id=v_id), 'completed');
  PERFORM pg_temp.chk('9.6 completed_at يُختم',
    (SELECT (completed_at IS NOT NULL)::TEXT FROM public.performance_reviews
      WHERE id=v_id), 'true');

  -- المكتملة نهائية
  v_ok := FALSE;
  BEGIN PERFORM public.performance_review_set_status(v_id, 'draft');
  EXCEPTION WHEN check_violation THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('9.7 completed نهائية', v_ok::TEXT, 'true');
END $$;

\echo ''
\echo '═══ ★★ إغلاق الدورة يُلغي المعلَّقة ═══'

DO $$
DECLARE v_cyc UUID; v_r1 UUID; v_ok BOOLEAN := FALSE;
BEGIN
  v_cyc := public.performance_cycle_create(
    'الربع الثاني', NULL, DATE '2026-04-01', DATE '2026-06-30', 'quarterly');
  PERFORM public.performance_cycle_set_status(v_cyc, 'active');
  v_r1 := public.performance_review_create(
    current_setting('kyvzon.t356_e2')::UUID, v_cyc,
    '46560004-0000-0000-0000-000000000004', 55);
  PERFORM pg_temp.chk('10.1 التقييم draft',
    (SELECT status FROM public.performance_reviews WHERE id=v_r1), 'draft');

  PERFORM public.performance_cycle_set_status(v_cyc, 'closed');
  PERFORM pg_temp.chk('10.2 الإغلاق يُلغي المعلَّقة',
    (SELECT status FROM public.performance_reviews WHERE id=v_r1), 'cancelled');

  -- المغلقة نهائية
  BEGIN PERFORM public.performance_cycle_set_status(v_cyc, 'active');
  EXCEPTION WHEN check_violation THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('10.3 closed نهائية', v_ok::TEXT, 'true');

  -- ★ ولا تقييم في دورة مغلقة
  v_ok := FALSE;
  BEGIN PERFORM public.performance_review_create(
    current_setting('kyvzon.t356_e1')::UUID, v_cyc,
    '46560004-0000-0000-0000-000000000004', 70);
  EXCEPTION WHEN check_violation THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('10.4 لا تقييم في دورة مغلقة', v_ok::TEXT, 'true');

  PERFORM set_config('kyvzon.t356_cyc2', v_cyc::TEXT, FALSE);
END $$;

\echo ''
\echo '═══ ★ الدرجة والحرّاس ═══'

DO $$
DECLARE v_ok BOOLEAN; v_m TEXT;
BEGIN
  v_ok := FALSE; v_m := '';
  BEGIN PERFORM public.performance_review_create(
    current_setting('kyvzon.t356_e2')::UUID, NULL, NULL, 150);
  EXCEPTION WHEN check_violation THEN v_ok := TRUE;
            GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('11.1 درجة 150 مرفوضة', v_ok::TEXT, 'true');
  PERFORM pg_temp.chk('11.2 رمز REVIEW_BAD_SCORE',
    (position('REVIEW_BAD_SCORE' IN v_m) > 0)::TEXT, 'true');

  v_ok := FALSE;
  BEGIN PERFORM public.performance_review_create(
    current_setting('kyvzon.t356_e2')::UUID, NULL, NULL, -5);
  EXCEPTION WHEN check_violation THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('11.3 درجة سالبة مرفوضة', v_ok::TEXT, 'true');

  v_ok := FALSE;
  BEGIN PERFORM public.performance_review_create(
    current_setting('kyvzon.t356_e2')::UUID, NULL, NULL, NULL);
  EXCEPTION WHEN check_violation THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('11.4 درجة NULL مرفوضة', v_ok::TEXT, 'true');

  -- ★ والقيد نفسه يحرس الإدراج المباشر
  v_ok := FALSE;
  BEGIN
    INSERT INTO public.performance_reviews
      (tenant_id, employee_id, reviewer_id, score, status)
    VALUES ('a3560000-0000-0000-0000-00000000000a',
            current_setting('kyvzon.t356_e2')::UUID,
            '36560003-0000-0000-0000-000000000003', 200, 'draft');
  EXCEPTION WHEN check_violation THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('11.5 CHECK يحرس الإدراج المباشر', v_ok::TEXT, 'true');
END $$;

\echo ''
\echo '═══ ★★ ⑨ الأرشفة بدل الحذف ═══'

DO $$
DECLARE v_ok BOOLEAN; v_m TEXT;
BEGIN
  v_ok := FALSE; v_m := '';
  BEGIN DELETE FROM public.performance_reviews
         WHERE id = current_setting('kyvzon.t356_rev')::UUID;
  EXCEPTION WHEN check_violation THEN v_ok := TRUE;
            GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('12.1 حذف التقييم ممنوع', v_ok::TEXT, 'true');
  PERFORM pg_temp.chk('12.2 رمز REVIEW_IMMUTABLE',
    (position('REVIEW_IMMUTABLE' IN v_m) > 0)::TEXT, 'true');

  v_ok := FALSE; v_m := '';
  BEGIN DELETE FROM public.performance_cycles
         WHERE id = current_setting('kyvzon.t356_cyc')::UUID;
  EXCEPTION WHEN check_violation THEN v_ok := TRUE;
            GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('12.3 حذف الدورة ممنوع', v_ok::TEXT, 'true');
  PERFORM pg_temp.chk('12.4 رمز CYCLE_IMMUTABLE',
    (position('CYCLE_IMMUTABLE' IN v_m) > 0)::TEXT, 'true');

  -- الأرشفة بسبب إلزاميّ
  v_ok := FALSE; v_m := '';
  BEGIN PERFORM public.performance_review_archive(
    current_setting('kyvzon.t356_rev')::UUID, '   ');
  EXCEPTION WHEN check_violation THEN v_ok := TRUE;
            GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('12.5 أرشفة بلا سبب مرفوضة', v_ok::TEXT, 'true');
  PERFORM pg_temp.chk('12.6 رمز REVIEW_NO_REASON',
    (position('REVIEW_NO_REASON' IN v_m) > 0)::TEXT, 'true');

  PERFORM public.performance_review_archive(
    current_setting('kyvzon.t356_rev')::UUID, 'خطأ إداريّ');
  PERFORM pg_temp.chk('12.7 الأرشفة تُختم',
    (SELECT (archived_at IS NOT NULL)::TEXT FROM public.performance_reviews
      WHERE id = current_setting('kyvzon.t356_rev')::UUID), 'true');
  PERFORM pg_temp.chk('12.8 السبب يُحفظ',
    (SELECT archive_reason FROM public.performance_reviews
      WHERE id = current_setting('kyvzon.t356_rev')::UUID), 'خطأ إداريّ');

  -- لا أرشفة مرّتين
  v_ok := FALSE;
  BEGIN PERFORM public.performance_review_archive(
    current_setting('kyvzon.t356_rev')::UUID, 'مرّة أخرى');
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('12.9 لا أرشفة مرّتين', v_ok::TEXT, 'true');

  -- المؤرشف لا يُعدَّل
  v_ok := FALSE; v_m := '';
  BEGIN PERFORM public.performance_review_set_status(
    current_setting('kyvzon.t356_rev')::UUID, 'cancelled');
  EXCEPTION WHEN check_violation THEN v_ok := TRUE;
            GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('12.10 المؤرشف لا يُعدَّل', v_ok::TEXT, 'true');
  PERFORM pg_temp.chk('12.11 رمز REVIEW_ARCHIVED',
    (position('REVIEW_ARCHIVED' IN v_m) > 0)::TEXT, 'true');
END $$;

-- ★ وأرشفة التقييم تُحرّر مكانه في الدورة (الفهرس جزئيّ)
DO $$
DECLARE v_id UUID;
BEGIN
  v_id := public.performance_review_create(
    current_setting('kyvzon.t356_e1')::UUID,
    current_setting('kyvzon.t356_cyc')::UUID,
    '46560004-0000-0000-0000-000000000004', 72);
  PERFORM pg_temp.chk('12.12 بعد الأرشفة يُقبل تقييم جديد',
    (v_id IS NOT NULL)::TEXT, 'true');
  PERFORM set_config('kyvzon.t356_rev2', v_id::TEXT, FALSE);
END $$;

\echo ''
\echo '═══ ★★ الملخّص — محسوب في القاعدة ═══'

-- حالة المستأجر ألف الآن:
--   دورتان غير مؤرشفتين: «الربع الأول» active · «الربع الثاني» closed
--   التقييمات غير المؤرشفة:
--     rev2   (e1, الربع الأول) score 72  draft
--     r1     (e2, الربع الثاني) score 55  cancelled  ← أُلغي بالإغلاق
--     6 صفوف من فحص السُّلَّم (e1) كلها cancelled
--     صفّ rating=4 (e2) score 70 cancelled
--     الصفّ c356…001 (e1) score 88 draft
--   المؤرشف: rev (88) — خارج كل حساب
DO $$
DECLARE r RECORD;
BEGIN
  SELECT * INTO r FROM public.performance_summary();
  PERFORM pg_temp.chk('13.1 الدورات', r.out_cycles::TEXT, '2');
  PERFORM pg_temp.chk('13.2 النشطة',  r.out_active::TEXT, '1');
  -- 2 draft (rev2 · c356…001) + 8 cancelled = 10
  PERFORM pg_temp.chk('13.3 التقييمات', r.out_reviews::TEXT, '10');
  PERFORM pg_temp.chk('13.4 مسوّدات',   r.out_draft::TEXT,   '2');
  PERFORM pg_temp.chk('13.5 ملغاة',     r.out_cancelled::TEXT, '8');
  -- ★★ المتوسّط على غير الملغاة: (72 + 88) ÷ 2 = 80.0
  PERFORM pg_temp.chk('13.6 المتوسّط يستثني الملغاة', r.out_avg_score::TEXT, '80.0');
  PERFORM pg_temp.chk('13.7 الأعلى', r.out_top_score::TEXT, '88.00');
  PERFORM pg_temp.chk('13.8 الأدنى', r.out_low_score::TEXT, '72.00');
END $$;

-- ★★★ «لم يُقيَّم أحد» ≠ «متوسّط صفر» (درس 0353)
DO $$
DECLARE r RECORD;
BEGIN
  SELECT * INTO r FROM public.performance_summary(
    current_setting('kyvzon.t356_cyc2')::UUID);
  -- الربع الثاني: تقييم واحد ملغى ⇒ لا درجة تُحتسب
  PERFORM pg_temp.chk('13.9 دورة بلا تقييم محتسَب: NULL لا صفر',
    COALESCE(r.out_avg_score::TEXT, 'NULL'), 'NULL');
  PERFORM pg_temp.chk('13.10 عدد تقييماتها', r.out_reviews::TEXT, '1');
END $$;

\echo ''
\echo '═══ ★★ اللوحات ═══'

DO $$
DECLARE r RECORD; v_n INTEGER;
BEGIN
  SELECT count(*) INTO v_n FROM public.performance_cycles_board(FALSE, 100);
  PERFORM pg_temp.chk('14.1 الدورات غير المؤرشفة', v_n::TEXT, '2');

  SELECT * INTO r FROM public.performance_cycles_board(FALSE, 100)
   WHERE out_id = current_setting('kyvzon.t356_cyc')::UUID;
  PERFORM pg_temp.chk('14.2 اسم الدورة', r.out_name, 'الربع الأول 2026');
  -- rev2 (72) وحده غير مؤرشف في هذه الدورة
  PERFORM pg_temp.chk('14.3 عدّ تقييماتها', r.out_reviews::TEXT, '1');
  PERFORM pg_temp.chk('14.4 متوسّطها', r.out_avg_score::TEXT, '72.0');

  SELECT count(*) INTO v_n FROM public.performance_reviews_board(NULL,NULL,NULL,FALSE,500);
  PERFORM pg_temp.chk('14.5 التقييمات غير المؤرشفة', v_n::TEXT, '10');
  SELECT count(*) INTO v_n FROM public.performance_reviews_board(NULL,NULL,NULL,TRUE,500);
  PERFORM pg_temp.chk('14.6 مع المؤرشفة', v_n::TEXT, '11');

  SELECT count(*) INTO v_n FROM public.performance_reviews_board(NULL,'draft',NULL,FALSE,500);
  PERFORM pg_temp.chk('14.7 ترشيح draft', v_n::TEXT, '2');

  SELECT count(*) INTO v_n FROM public.performance_reviews_board(NULL,NULL,NULL,FALSE,3);
  PERFORM pg_temp.chk('14.8 الحدّ الأعلى يعمل', v_n::TEXT, '3');

  SELECT * INTO r FROM public.performance_reviews_board(
    current_setting('kyvzon.t356_cyc')::UUID, NULL, NULL, FALSE, 10);
  -- ★ full_name_ar = NULL لكل موظف ⇒ الاحتياطيّ first+last
  PERFORM pg_temp.chk('14.9 اسم بديل عن full_name_ar', r.out_employee_name, 'سالم الأول');
  PERFORM pg_temp.chk('14.10 القسم من departments', r.out_department, 'المالية');
  PERFORM pg_temp.chk('14.11 اسم المقيّم', r.out_reviewer_name, 'منير المدير');
  PERFORM pg_temp.chk('14.12 اسم الدورة', r.out_cycle_name, 'الربع الأول 2026');
  PERFORM pg_temp.chk('14.13 الدرجة', r.out_score::TEXT, '72.00');
  -- 72 ÷ 20 = 3.6 ⇒ ceil = 4
  PERFORM pg_temp.chk('14.14 rating مشتقّ', r.out_rating::TEXT, '4');

  -- البحث
  SELECT count(*) INTO v_n FROM public.performance_reviews_board(
    NULL, NULL, 'سالم', FALSE, 500);
  PERFORM pg_temp.chk('14.15 البحث بالاسم', (v_n > 0)::TEXT, 'true');
  SELECT count(*) INTO v_n FROM public.performance_reviews_board(
    NULL, NULL, 'لا يوجد هذا الاسم', FALSE, 500);
  PERFORM pg_temp.chk('14.16 بحث بلا نتيجة', v_n::TEXT, '0');

  -- ★ التقييم بلا دورة يُسمّى صراحةً
  PERFORM pg_temp.chk('14.17 بلا دورة: نصّ صريح',
    (SELECT out_cycle_name FROM public.performance_reviews_board(NULL,NULL,NULL,FALSE,500)
      WHERE out_cycle_id IS NULL LIMIT 1), '— بلا دورة —');
END $$;

\echo ''
\echo '═══ ★★★ العزل بين المستأجرين ═══'

DO $$
DECLARE v_id UUID;
BEGIN
  PERFORM set_config('request.jwt.claim.sub',
    '76560007-0000-0000-0000-000000000007', TRUE);
  v_id := public.performance_review_create(
    current_setting('kyvzon.t356_eb')::UUID, NULL, NULL, 65);
  PERFORM set_config('kyvzon.t356_revb', v_id::TEXT, FALSE);
  PERFORM pg_temp.chk('15.1 باء يرى تقييمه وحده',
    (SELECT out_reviews::TEXT FROM public.performance_summary()), '1');
  PERFORM set_config('request.jwt.claim.sub',
    '36560003-0000-0000-0000-000000000003', TRUE);
END $$;

DO $$
DECLARE v_n INTEGER; v_ok BOOLEAN;
BEGIN
  PERFORM pg_temp.chk('15.2 ألف لا يرى تقييم باء',
    (SELECT out_reviews::TEXT FROM public.performance_summary()), '10');

  SELECT count(*) INTO v_n FROM public.performance_reviews_board(NULL,NULL,NULL,TRUE,500)
   WHERE out_id = current_setting('kyvzon.t356_revb')::UUID;
  PERFORM pg_temp.chk('15.3 اللوحة لا تُسرّب', v_n::TEXT, '0');

  -- ★★ الحاسم: التقييم الأجنبيّ `draft` قابلٌ للانتقال، فلا يمسكه
  --   إلا ترشيح المستأجر نفسه.
  v_ok := FALSE;
  BEGIN PERFORM public.performance_review_set_status(
    current_setting('kyvzon.t356_revb')::UUID, 'submitted');
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('15.4 لا انتقال عبر الحدود', v_ok::TEXT, 'true');
  PERFORM pg_temp.chk('15.5 حالة الأجنبيّ لم تتغيّر',
    (SELECT status FROM public.performance_reviews
      WHERE id = current_setting('kyvzon.t356_revb')::UUID), 'draft');

  v_ok := FALSE;
  BEGIN PERFORM public.performance_review_archive(
    current_setting('kyvzon.t356_revb')::UUID, 'محاولة');
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('15.6 لا أرشفة عبر الحدود', v_ok::TEXT, 'true');
  PERFORM pg_temp.chk('15.7 الأجنبيّ غير مؤرشف',
    (SELECT (archived_at IS NULL)::TEXT FROM public.performance_reviews
      WHERE id = current_setting('kyvzon.t356_revb')::UUID), 'true');

  v_ok := FALSE;
  BEGIN PERFORM public.performance_review_create(
    current_setting('kyvzon.t356_eb')::UUID, NULL, NULL, 80);
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('15.8 لا إنشاء لموظف أجنبيّ', v_ok::TEXT, 'true');

  -- ★ ولا دورة أجنبية
  v_ok := FALSE;
  BEGIN PERFORM public.performance_cycle_set_status(
    current_setting('kyvzon.t356_cyc')::UUID, 'closed');
    v_ok := TRUE;
  EXCEPTION WHEN OTHERS THEN v_ok := FALSE; END;
  PERFORM pg_temp.chk('15.9 دورة المستأجر نفسه تعمل', v_ok::TEXT, 'true');
END $$;

-- ★★ ثغرات تغطية كشفها INV21 و INV22 و INV38: لوحة الدورات وانتقال
--   حالتها لم يُختبرا **عبر الحدود** ولا بحدٍّ أعلى فعّال. ننشئ دورة
--   في المستأجر باء ثم نقيس من ألف.
DO $$
DECLARE v_id UUID;
BEGIN
  PERFORM set_config('request.jwt.claim.sub',
    '76560007-0000-0000-0000-000000000007', TRUE);
  v_id := public.performance_cycle_create(
    'دورة باء', NULL, DATE '2026-01-01', DATE '2026-03-31', 'quarterly');
  PERFORM set_config('kyvzon.t356_cycb', v_id::TEXT, FALSE);
  -- ★ باء يرى دورته وحدها
  PERFORM pg_temp.chk('15.10 باء يرى دورة واحدة',
    (SELECT count(*)::TEXT FROM public.performance_cycles_board(TRUE, 100)), '1');
  PERFORM set_config('request.jwt.claim.sub',
    '36560003-0000-0000-0000-000000000003', TRUE);
END $$;

DO $$
DECLARE v_n INTEGER; v_ok BOOLEAN := FALSE; v_m TEXT := '';
BEGIN
  -- ★★★ INV21: لوحة الدورات لا تُسرّب دورة باء إلى ألف
  SELECT count(*) INTO v_n FROM public.performance_cycles_board(TRUE, 500)
   WHERE out_id = current_setting('kyvzon.t356_cycb')::UUID;
  PERFORM pg_temp.chk('15.11 لوحة الدورات لا تُسرّب', v_n::TEXT, '0');

  -- ★ تصحيح توقّعي: كتبتُ «ثلاث دورات» فسقط التأكيد بـgot=«2».
  --   «دورة المسؤول» تُنشأ في القسم ⑯ **بعد** هذه النقطة. الموجود
  --   هنا دورتان: «الربع الأول 2026» و«الربع الثاني».
  SELECT count(*) INTO v_n FROM public.performance_cycles_board(TRUE, 500);
  PERFORM pg_temp.chk('15.12 دورات ألف وحدها', v_n::TEXT, '2');

  -- ★★ INV22: الحدّ الأعلى فعّال (دورتان ⇒ حدّ 1 يعطي 1)
  SELECT count(*) INTO v_n FROM public.performance_cycles_board(TRUE, 1);
  PERFORM pg_temp.chk('15.13 حدّ لوحة الدورات يعمل', v_n::TEXT, '1');

  -- ★★★ INV38: انتقال حالة دورة أجنبية.
  --   الدورة الأجنبية `draft` (انتقال مشروع إلى active)، فلا يمسكها
  --   إلا ترشيح المستأجر نفسه — لا حارس النهائية ولا جدول الانتقالات.
  BEGIN PERFORM public.performance_cycle_set_status(
    current_setting('kyvzon.t356_cycb')::UUID, 'active');
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE;
            GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('15.14 لا انتقال لدورة أجنبية', v_ok::TEXT, 'true');
  PERFORM pg_temp.chk('15.15 الرسالة رسالة المستأجر',
    (position('غير موجودة في هذا المستأجر' IN v_m) > 0)::TEXT, 'true');
  PERFORM pg_temp.chk('15.16 حالة الدورة الأجنبية لم تتغيّر',
    (SELECT status FROM public.performance_cycles
      WHERE id = current_setting('kyvzon.t356_cycb')::UUID), 'draft');
END $$;

\echo ''
\echo '═══ ★★ حرّاس الأدوار ═══'

DO $$
DECLARE v_ok BOOLEAN; v_m TEXT;
BEGIN
  PERFORM set_config('request.jwt.claim.sub',
    '16560001-0000-0000-0000-000000000001', TRUE);

  v_ok := FALSE;
  BEGIN PERFORM public.performance_summary();
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('16.1 الموظف لا يرى الملخّص', v_ok::TEXT, 'true');

  v_ok := FALSE;
  BEGIN PERFORM public.performance_reviews_board(NULL,NULL,NULL,FALSE,10);
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('16.2 الموظف لا يرى اللوحة', v_ok::TEXT, 'true');

  v_ok := FALSE;
  BEGIN PERFORM public.performance_cycles_board(FALSE, 10);
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('16.3 الموظف لا يرى الدورات', v_ok::TEXT, 'true');

  -- ★★ ثغرة تغطية كشفها INV31: التأكيد كان يمرّر e1 وهو **سالم نفسه**،
  --   فيمسكه حارس التقييم الذاتيّ قبل أن يصل إلى حارس الدور —
  --   والاختبار ينجح حتى بلا حارس الدور. «شرطٌ لا تُوجَد بياناتٌ
  --   تخالفه = شرط غير مُختبَر». نمرّر **ناصر** ونُلزم نصّ الرسالة.
  v_ok := FALSE; v_m := '';
  BEGIN PERFORM public.performance_review_create(
    current_setting('kyvzon.t356_e2')::UUID, NULL,
    '46560004-0000-0000-0000-000000000004', 100);
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE;
            GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('16.4 الموظف لا يُنشئ تقييماً', v_ok::TEXT, 'true');
  PERFORM pg_temp.chk('16.4b الرسالة رسالة الدور لا التقييم الذاتيّ',
    (position('غير مصرَّح بإنشاء تقييم' IN v_m) > 0)::TEXT, 'true');
  -- ★ ولا صفّ دخل فعلاً.
  --   تصحيح توقّعي: كتبتُ «لا صفّ بدرجة 100» فسقط بـgot=«1» — صفّ
  --   score=100 موجود أصلاً من فحص حدود السُّلَّم في القسم ③ (وهو
  --   ملغى). نُضيّق الشرط على **ناصر** وهو المستهدَف هنا.
  PERFORM pg_temp.chk('16.4c لا صفّ بدرجة 100 لناصر',
    (SELECT count(*)::TEXT FROM public.performance_reviews
      WHERE score = 100
        AND employee_id = current_setting('kyvzon.t356_e2')::UUID), '0');

  v_ok := FALSE;
  BEGIN PERFORM public.performance_cycle_create(
    'دورتي', NULL, DATE '2026-01-01', DATE '2026-02-01', 'monthly');
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('16.5 الموظف لا يُنشئ دورة', v_ok::TEXT, 'true');
END $$;

DO $$
DECLARE v_ok BOOLEAN := FALSE;
BEGIN
  -- المدير ليس staff (مُحقَّق: admin·hr·developer·it_admin فقط)
  PERFORM set_config('request.jwt.claim.sub',
    '46560004-0000-0000-0000-000000000004', TRUE);
  BEGIN PERFORM public.performance_summary();
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('16.6 المدير ليس staff', v_ok::TEXT, 'true');
END $$;

DO $$
DECLARE v_id UUID;
BEGIN
  -- admin يعمل
  PERFORM set_config('request.jwt.claim.sub',
    '56560005-0000-0000-0000-000000000005', TRUE);
  v_id := public.performance_cycle_create(
    'دورة المسؤول', NULL, DATE '2026-07-01', DATE '2026-09-30', 'quarterly');
  PERFORM pg_temp.chk('16.7 admin يُنشئ دورة', (v_id IS NOT NULL)::TEXT, 'true');
  PERFORM set_config('request.jwt.claim.sub',
    '36560003-0000-0000-0000-000000000003', TRUE);
END $$;

\echo ''
\echo '═══ ★ الصلاحيات ═══'

DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'performance_summary','performance_cycles_board','performance_reviews_board',
    'performance_cycle_create','performance_cycle_set_status',
    'performance_review_create','performance_review_set_status',
    'performance_review_archive'] LOOP
    PERFORM pg_temp.chk('17.' || f || ' — لا PUBLIC',
      (SELECT bool_or(has_function_privilege('public', p.oid, 'EXECUTE'))::TEXT
         FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.proname=f), 'false');
    PERFORM pg_temp.chk('17.' || f || ' — لا anon',
      (SELECT bool_or(has_function_privilege('anon', p.oid, 'EXECUTE'))::TEXT
         FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.proname=f), 'false');
    PERFORM pg_temp.chk('17.' || f || ' — authenticated',
      (SELECT bool_or(has_function_privilege('authenticated', p.oid, 'EXECUTE'))::TEXT
         FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.proname=f), 'true');
  END LOOP;
END $$;

DO $$
DECLARE c TEXT;
BEGIN
  FOREACH c IN ARRAY ARRAY['performance_reviews_status_chk',
                           'performance_reviews_score_chk',
                           'performance_reviews_cycle_id_fkey',
                           'performance_cycles_status_chk',
                           'performance_cycles_period_chk',
                           'performance_cycles_range_chk'] LOOP
    PERFORM pg_temp.chk('17.قيد ' || c,
      (SELECT count(*)::TEXT FROM pg_constraint WHERE conname = c), '1');
  END LOOP;
  PERFORM pg_temp.chk('17.الفهرس الفريد',
    (SELECT count(*)::TEXT FROM pg_indexes
      WHERE indexname = 'uq_review_per_employee_cycle'), '1');
END $$;

\echo ''
\echo '✅ 0356 — كل التأكيدات مرّت'
ROLLBACK;
