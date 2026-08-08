-- ════════════════════════════════════════════════════════════════════════
--  التحقق السلوكيّ من 0355 — دورة حياة السلف
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
  RAISE NOTICE 'ok   %  =  %', rpad(p_label, 46, '.'), p_want;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.cleanup_loan(p_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  -- ★ الإلغاء التقنيّ للعيّنة يمرّ بعلَم النظام: حارس السلسلة يمنع
  --   تغيير الحالة مباشرةً حين تكون خطوةٌ مفتوحة (وهو سلوك مقصود).
  PERFORM set_config('kyvzon.approval_sync','true',FALSE);
  UPDATE public.employee_loans SET status='cancelled', rejection_reason='تنظيف'
   WHERE id = p_id;
  PERFORM set_config('kyvzon.approval_sync','false',FALSE);
END $$;

-- ══════════════════════ العيّنة ══════════════════════
-- مستأجران لاختبار العزل.
INSERT INTO public.tenants (id,name,name_ar,slug) VALUES
 ('a3550000-0000-0000-0000-000000000001','T355A','شركة ألف','t355a'),
 ('a3550000-0000-0000-0000-000000000002','T355B','شركة باء','t355b');

INSERT INTO auth.users(id,email) VALUES
 ('b3550001-0000-0000-0000-000000000001','emp1@t355a'),
 ('b3550002-0000-0000-0000-000000000002','emp2@t355a'),
 ('b3550003-0000-0000-0000-000000000003','hr@t355a'),
 ('b3550004-0000-0000-0000-000000000004','mgr@t355a'),
 ('b3550005-0000-0000-0000-000000000005','emp@t355b'),
 ('b3550006-0000-0000-0000-000000000006','hr@t355b'),
 ('b3550007-0000-0000-0000-000000000007','admin@t355a');

-- المدير أولاً: departments.manager_id → profiles
INSERT INTO public.profiles (id,tenant_id,full_name,role,department,salary) VALUES
 ('b3550004-0000-0000-0000-000000000004','a3550000-0000-0000-0000-000000000001','منير المدير','manager','المالية',3000000);

INSERT INTO public.departments (id,tenant_id,name_ar,manager_id) VALUES
 ('d3550000-0000-0000-0000-000000000001','a3550000-0000-0000-0000-000000000001','المالية',
  'b3550004-0000-0000-0000-000000000004');

INSERT INTO public.profiles (id,tenant_id,full_name,role,department,salary) VALUES
 ('b3550001-0000-0000-0000-000000000001','a3550000-0000-0000-0000-000000000001','سالم الأول','employee','المالية',1000000),
 ('b3550002-0000-0000-0000-000000000002','a3550000-0000-0000-0000-000000000001','ناصر الثاني','employee','المالية',2000000),
 ('b3550003-0000-0000-0000-000000000003','a3550000-0000-0000-0000-000000000001','هدى الموارد','hr','الموارد',1500000),
 ('b3550007-0000-0000-0000-000000000007','a3550000-0000-0000-0000-000000000001','آدم المسؤول','admin','الإدارة',4000000),
 ('b3550005-0000-0000-0000-000000000005','a3550000-0000-0000-0000-000000000002','أجنبي','employee','المالية',1000000),
 ('b3550006-0000-0000-0000-000000000006','a3550000-0000-0000-0000-000000000002','مورد باء','hr','الموارد',1500000);

-- المحفّز أسند القسم للمدير قبل وجود departments ⇒ نُعيد المزامنة
UPDATE public.profiles SET full_name = full_name
 WHERE id = 'b3550004-0000-0000-0000-000000000004';

-- ★ psql لا يوسّع :'var' داخل $$ … $$ — نمرّر عبر إعدادات الجلسة
SELECT set_config('kyvzon.t355_e1',
  (SELECT e.id::TEXT FROM public.employees e WHERE e.user_id='b3550001-0000-0000-0000-000000000001'), FALSE),
       set_config('kyvzon.t355_e2',
  (SELECT e.id::TEXT FROM public.employees e WHERE e.user_id='b3550002-0000-0000-0000-000000000002'), FALSE),
       set_config('kyvzon.t355_e5',
  (SELECT e.id::TEXT FROM public.employees e WHERE e.user_id='b3550005-0000-0000-0000-000000000005'), FALSE);

INSERT INTO public.payroll_settings (id, working_days_per_month, tax_rate,
  social_security_rate, overtime_rate, absence_penalty_per_day)
VALUES (1,26,0,0,1.5,0)
ON CONFLICT (id) DO UPDATE SET tax_rate=0, social_security_rate=0,
  absence_penalty_per_day=0, working_days_per_month=26, overtime_rate=1.5;

\echo ''
\echo '═══ ① المفردات: القاعدة ترفض active/completed المُختلَقتين ═══'

SET LOCAL request.jwt.claim.sub = 'b3550003-0000-0000-0000-000000000003';


DO $$
DECLARE v_ok BOOLEAN := FALSE;
BEGIN
  BEGIN
    PERFORM public.loan_board('active', 10);
  EXCEPTION WHEN check_violation THEN v_ok := TRUE;
  END;
  PERFORM pg_temp.chk('1.1 loan_board(active) يرمي', v_ok::TEXT, 'true');
END $$;

DO $$
DECLARE v_ok BOOLEAN := FALSE; v_m TEXT;
BEGIN
  BEGIN
    PERFORM public.loan_board('completed', 10);
  EXCEPTION WHEN check_violation THEN
    v_ok := TRUE; GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT;
  END;
  PERFORM pg_temp.chk('1.2 loan_board(completed) يرمي', v_ok::TEXT, 'true');
  PERFORM pg_temp.chk('1.3 الرسالة تُسمّي الحالة',
    (position('completed' IN v_m) > 0)::TEXT, 'true');
END $$;

DO $$
DECLARE v_n INTEGER;
BEGIN
  SELECT count(*) INTO v_n FROM public.loan_board('pending', 10);
  PERFORM pg_temp.chk('1.4 loan_board(pending) لا يرمي', v_n::TEXT, '0');
  SELECT count(*) INTO v_n FROM public.loan_board('cancelled', 10);
  PERFORM pg_temp.chk('1.5 cancelled مفردة مقبولة', v_n::TEXT, '0');
END $$;

\echo ''
\echo '═══ ② الإنشاء: الحرّاس والتقويم وسلسلة الاعتماد ═══'

-- 31 يناير 2026 + 12 شهراً = 31 يناير 2027 (لا انزلاق هنا)
-- 31 يناير 2026 + 1  شهر  = 28 فبراير 2026 ← JS يعطي 3 مارس
DO $$
DECLARE v_id UUID; v_end DATE;
BEGIN
  v_id := public.loan_create(current_setting('kyvzon.t355_e1')::UUID, 1200000, 1, 'اختبار التقويم',
                             DATE '2026-01-31');
  SELECT end_date INTO v_end FROM public.employee_loans WHERE id = v_id;
  PERFORM pg_temp.chk('2.1 31 يناير + شهر = 28 فبراير', v_end::TEXT, '2026-02-28');
  PERFORM pg_temp.cleanup_loan(v_id);
END $$;

DO $$
DECLARE v_ok BOOLEAN; v_m TEXT;
BEGIN
  -- ⑦ القسمة على صفر
  v_ok := FALSE;
  BEGIN PERFORM public.loan_create(current_setting('kyvzon.t355_e1')::UUID, 1200000, 0, 'صفر أشهر');
  EXCEPTION WHEN check_violation THEN v_ok := TRUE;
            GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('2.2 صفر أشهر يرمي', v_ok::TEXT, 'true');
  PERFORM pg_temp.chk('2.3 رمز الخطأ LOAN_BAD_MONTHS',
    (position('LOAN_BAD_MONTHS' IN v_m) > 0)::TEXT, 'true');

  v_ok := FALSE;
  BEGIN PERFORM public.loan_create(current_setting('kyvzon.t355_e1')::UUID, 1200000, 61, '61 شهراً');
  EXCEPTION WHEN check_violation THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('2.4 61 شهراً يرمي', v_ok::TEXT, 'true');

  v_ok := FALSE; v_m := '';
  BEGIN PERFORM public.loan_create(current_setting('kyvzon.t355_e1')::UUID, 0, 12, 'مبلغ صفر');
  EXCEPTION WHEN check_violation THEN v_ok := TRUE;
            GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('2.5 مبلغ صفر يرمي', v_ok::TEXT, 'true');
  PERFORM pg_temp.chk('2.5b رمز LOAN_BAD_AMOUNT للصفر',
    (position('LOAN_BAD_AMOUNT' IN v_m) > 0)::TEXT, 'true');

  -- ★ ثغرة تغطية كشفها INV10: التأكيد كان يفحص «يرمي» فقط، وسلفة
  --   سالبة كانت ترمي حتى بلا الحارس (عبر مسار آخر). نُلزم الرمز.
  v_ok := FALSE; v_m := '';
  BEGIN PERFORM public.loan_create(current_setting('kyvzon.t355_e1')::UUID, -500, 12, 'مبلغ سالب');
  EXCEPTION WHEN check_violation THEN v_ok := TRUE;
            GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('2.6 مبلغ سالب يرمي', v_ok::TEXT, 'true');
  PERFORM pg_temp.chk('2.6b رمز LOAN_BAD_AMOUNT',
    (position('LOAN_BAD_AMOUNT' IN v_m) > 0)::TEXT, 'true');
  PERFORM pg_temp.chk('2.6c لا صفّ سالب في القاعدة',
    (SELECT count(*)::TEXT FROM public.employee_loans WHERE amount < 0), '0');

  v_ok := FALSE;
  BEGIN PERFORM public.loan_create(current_setting('kyvzon.t355_e1')::UUID, 1200000, 12, '   ');
  EXCEPTION WHEN check_violation THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('2.7 غرض فارغ يرمي', v_ok::TEXT, 'true');

  -- القسط أكبر من المبلغ
  v_ok := FALSE;
  BEGIN PERFORM public.loan_create(current_setting('kyvzon.t355_e1')::UUID, 100000, 12, 'قسط ضخم',
                                   NULL, 200000);
  EXCEPTION WHEN check_violation THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('2.8 قسط > المبلغ يرمي', v_ok::TEXT, 'true');
END $$;

-- تاريخ البداية يُحترم (العطل ⑥)
DO $$
DECLARE v_id UUID; v_s DATE; v_i NUMERIC;
BEGIN
  v_id := public.loan_create(current_setting('kyvzon.t355_e1')::UUID, 1200000, 12, 'تاريخ مستقبليّ',
                             DATE '2026-09-01');
  SELECT start_date, monthly_installment INTO v_s, v_i
    FROM public.employee_loans WHERE id = v_id;
  PERFORM pg_temp.chk('2.9 start_date يُحترم', v_s::TEXT, '2026-09-01');
  -- 1,200,000 ÷ 12 = 100,000.00
  PERFORM pg_temp.chk('2.10 القسط = المبلغ ÷ الأشهر', v_i::TEXT, '100000.00');
  PERFORM pg_temp.cleanup_loan(v_id);
END $$;

-- سلسلة الاعتماد تُبنى (العطل ⑤)
INSERT INTO public.approval_rules
  (tenant_id, unit_key, rule_name, min_amount, max_amount, level, required_role)
VALUES ('a3550000-0000-0000-0000-000000000001','finance','مدير المالية',
        0, 999999999, 1, 'manager');

DO $$
DECLARE v_id UUID; v_open INTEGER;
BEGIN
  v_id := public.loan_create(current_setting('kyvzon.t355_e1')::UUID, 600000, 6, 'سلفة بسلسلة');
  SELECT count(*) INTO v_open FROM public.hr_approval_steps s
    JOIN public.hr_approval_requests r ON r.id = s.request_id
   WHERE r.related_id = v_id AND s.status IN ('pending','active');
  PERFORM pg_temp.chk('2.11 السلسلة تُبنى عند الإنشاء', v_open::TEXT, '1');
  PERFORM set_config('kyvzon.t355_chain_loan', v_id::TEXT, FALSE);
END $$;

\echo ''
\echo '═══ ③ القرار: يحترم السلسلة ═══'

DO $$
DECLARE v_id UUID := current_setting('kyvzon.t355_chain_loan')::UUID;
        v_ok BOOLEAN := FALSE; v_m TEXT;
BEGIN
  BEGIN PERFORM public.loan_decide(v_id, 'approved');
  EXCEPTION WHEN check_violation THEN v_ok := TRUE;
            GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('3.1 hr لا يتجاوز سلسلة مفتوحة', v_ok::TEXT, 'true');
  PERFORM pg_temp.chk('3.2 رمز LOAN_CHAIN_OPEN',
    (position('LOAN_CHAIN_OPEN' IN v_m) > 0)::TEXT, 'true');
END $$;

-- admin يتجاوز (والأثر يُسجَّل في approved_by)
DO $$
DECLARE v_id UUID := current_setting('kyvzon.t355_chain_loan')::UUID;
        v_st TEXT; v_rem NUMERIC;
BEGIN
  PERFORM set_config('request.jwt.claim.sub',
    'b3550007-0000-0000-0000-000000000007', TRUE);
  PERFORM public.loan_decide(v_id, 'approved');
  SELECT status, remaining_amount INTO v_st, v_rem
    FROM public.employee_loans WHERE id = v_id;
  PERFORM pg_temp.chk('3.3 admin يتجاوز السلسلة', v_st, 'approved');
  -- 600,000 يُنسخ إلى remaining عند الاعتماد (كان يبقى صفراً)
  PERFORM pg_temp.chk('3.4 remaining يُملأ بالمبلغ', v_rem::TEXT, '600000.00');
  PERFORM set_config('request.jwt.claim.sub',
    'b3550003-0000-0000-0000-000000000003', TRUE);
END $$;

DO $$
DECLARE v_id UUID := current_setting('kyvzon.t355_chain_loan')::UUID;
        v_ok BOOLEAN := FALSE; v_m TEXT;
BEGIN
  BEGIN PERFORM public.loan_decide(v_id, 'rejected', 'تكرار');
  EXCEPTION WHEN check_violation THEN v_ok := TRUE;
            GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('3.5 لا بتّ مرّتين', v_ok::TEXT, 'true');
  PERFORM pg_temp.chk('3.6 رمز LOAN_ALREADY_DECIDED',
    (position('LOAN_ALREADY_DECIDED' IN v_m) > 0)::TEXT, 'true');
END $$;

DO $$
DECLARE v_id UUID; v_ok BOOLEAN := FALSE; v_m TEXT;
BEGIN
  DELETE FROM public.approval_rules
   WHERE tenant_id='a3550000-0000-0000-0000-000000000001';
  v_id := public.loan_create(current_setting('kyvzon.t355_e2')::UUID, 300000, 3, 'بلا سلسلة');

  BEGIN PERFORM public.loan_decide(v_id, 'rejected', '   ');
  EXCEPTION WHEN check_violation THEN v_ok := TRUE;
            GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('3.7 رفض بلا سبب يرمي', v_ok::TEXT, 'true');
  PERFORM pg_temp.chk('3.8 رمز LOAN_NO_REASON',
    (position('LOAN_NO_REASON' IN v_m) > 0)::TEXT, 'true');

  -- ★★ ثغرة تغطية كشفها INV31: قبول 'paid' كقرار كان ينجو، لأن
  --   التأكيد يفحص «يرمي» فقط — و'paid' يرمي أيضاً حين يُقبَل
  --   لأن الحارس التالي (سبب إلزاميّ) لا يشمله. نُلزم رمز القرار
  --   ونتحقّق أن الحالة **لم تتغيّر** فعلاً.
  v_ok := FALSE; v_m := '';
  BEGIN PERFORM public.loan_decide(v_id, 'paid');
  EXCEPTION WHEN check_violation THEN v_ok := TRUE;
            GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('3.9 قرار paid غير مقبول', v_ok::TEXT, 'true');
  PERFORM pg_temp.chk('3.9b رمز LOAN_BAD_DECISION',
    (position('LOAN_BAD_DECISION' IN v_m) > 0)::TEXT, 'true');
  PERFORM pg_temp.chk('3.9c الحالة بقيت pending',
    (SELECT status FROM public.employee_loans WHERE id=v_id), 'pending');
  -- ★ و'approved' وحده ليس بابَ سداد: لا صفّ تسديد يُخلق بالقرار
  PERFORM pg_temp.chk('3.9d القرار لا يُنشئ تسديداً',
    (SELECT count(*)::TEXT FROM public.loan_repayments WHERE loan_id=v_id), '0');

  -- ★★ حذف approval_rules لا يُلغي السلسلة: المسار (ب) في
  --   create_financial_request_approval يبني سلسلة القسم احتياطياً
  --   من resolve_department_chain (مدير المالية موجود). لذا نبتّ
  --   بدور admin — وهو الوحيد المخوَّل بتجاوز سلسلة قائمة.
  PERFORM set_config('request.jwt.claim.sub',
    'b3550007-0000-0000-0000-000000000007', TRUE);
  PERFORM public.loan_decide(v_id, 'rejected', 'الميزانية');
  PERFORM set_config('request.jwt.claim.sub',
    'b3550003-0000-0000-0000-000000000003', TRUE);
  PERFORM pg_temp.chk('3.10 سبب الرفض يُكتب',
    (SELECT rejection_reason FROM public.employee_loans WHERE id=v_id),
    'الميزانية');
  PERFORM pg_temp.chk('3.11 الحالة rejected',
    (SELECT status FROM public.employee_loans WHERE id=v_id), 'rejected');
  -- ★ الرفض لا يملأ remaining_amount
  PERFORM pg_temp.chk('3.12 المرفوضة بلا متبقٍّ',
    (SELECT remaining_amount::TEXT FROM public.employee_loans WHERE id=v_id), '0.00');
END $$;

\echo ''
\echo '═══ ④ التسديد — قلب الجولة ═══'

-- سلفة سالم: 1,200,000 على 12 شهراً ⇒ القسط 100,000
DO $$
DECLARE v_id UUID;
BEGIN
  v_id := public.loan_create(current_setting('kyvzon.t355_e1')::UUID, 1200000, 12, 'شراء سيارة',
                             DATE '2026-01-01');
  -- ★ سلسلة القسم قائمة (مدير المالية) ⇒ admin وحده يبتّ مباشرةً
  PERFORM set_config('request.jwt.claim.sub',
    'b3550007-0000-0000-0000-000000000007', TRUE);
  PERFORM public.loan_decide(v_id, 'approved');
  PERFORM set_config('request.jwt.claim.sub',
    'b3550003-0000-0000-0000-000000000003', TRUE);
  PERFORM set_config('kyvzon.t355_loan1', v_id::TEXT, FALSE);
END $$;

INSERT INTO public.payroll_periods (id,tenant_id,name,frequency,
  start_date,end_date,payment_date,status) VALUES
 ('e3550000-0000-0000-0000-00000000000a','a3550000-0000-0000-0000-000000000001',
  'فبراير 2026','monthly',DATE '2026-02-01',DATE '2026-02-28',DATE '2026-03-01','draft'),
 ('e3550000-0000-0000-0000-00000000000b','a3550000-0000-0000-0000-000000000001',
  'مارس 2026','monthly',DATE '2026-03-01',DATE '2026-03-31',DATE '2026-04-01','draft'),
 ('e3550000-0000-0000-0000-00000000000c','a3550000-0000-0000-0000-000000000001',
  'أبريل 2026','monthly',DATE '2026-04-01',DATE '2026-04-30',DATE '2026-05-01','draft');

-- ــ فترة 1 ــ
SELECT * FROM public.payroll_run('e3550000-0000-0000-0000-00000000000a') \gset r1_
SELECT public.payroll_approve('e3550000-0000-0000-0000-00000000000a') \gset a1_

DO $$
DECLARE v_id UUID := current_setting('kyvzon.t355_loan1')::UUID;
        v_rem NUMERIC; v_mp INTEGER; v_st TEXT;
BEGIN
  SELECT remaining_amount, months_paid, status INTO v_rem, v_mp, v_st
    FROM public.employee_loans WHERE id = v_id;
  -- 1,200,000 − 100,000 = 1,100,000
  PERFORM pg_temp.chk('4.1 المتبقّي بعد فترة 1', v_rem::TEXT, '1100000.00');
  PERFORM pg_temp.chk('4.2 months_paid = 1', v_mp::TEXT, '1');
  PERFORM pg_temp.chk('4.3 الحالة تبقى approved', v_st, 'approved');
END $$;

-- ★★★ الحاجز البنيويّ: إعادة اعتماد الفترة نفسها لا تُسدّد مرّتين
DO $$
DECLARE v_ok BOOLEAN := FALSE;
BEGIN
  BEGIN PERFORM public.payroll_approve('e3550000-0000-0000-0000-00000000000a');
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('4.4 إعادة اعتماد الفترة ترمي', v_ok::TEXT, 'true');
  PERFORM pg_temp.chk('4.5 المتبقّي لم يتغيّر',
    (SELECT remaining_amount::TEXT FROM public.employee_loans
      WHERE id = current_setting('kyvzon.t355_loan1')::UUID), '1100000.00');
END $$;

-- ★ الاستدعاء المباشر للفترة نفسها يرمي بالفهرس الفريد
DO $$
DECLARE v_ok BOOLEAN := FALSE;
BEGIN
  BEGIN
    PERFORM public.loan_apply_repayment(
      current_setting('kyvzon.t355_loan1')::UUID,
      'e3550000-0000-0000-0000-00000000000a', NULL, 'payroll');
  EXCEPTION WHEN unique_violation THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('4.6 uq_loan_repay_per_period يحرس', v_ok::TEXT, 'true');
END $$;

-- ــ فترة 2 ــ
SELECT * FROM public.payroll_run('e3550000-0000-0000-0000-00000000000b') \gset r2_
SELECT public.payroll_approve('e3550000-0000-0000-0000-00000000000b') \gset a2_

DO $$
DECLARE v_rem NUMERIC; v_mp INTEGER;
BEGIN
  SELECT remaining_amount, months_paid INTO v_rem, v_mp
    FROM public.employee_loans
   WHERE id = current_setting('kyvzon.t355_loan1')::UUID;
  -- 1,100,000 − 100,000 = 1,000,000
  PERFORM pg_temp.chk('4.7 المتبقّي بعد فترة 2', v_rem::TEXT, '1000000.00');
  PERFORM pg_temp.chk('4.8 months_paid = 2', v_mp::TEXT, '2');
END $$;

-- ★★ قصّ آخر قسط: نضبط المتبقّي على 40,000 والقسط 100,000
DO $$
DECLARE v_id UUID := current_setting('kyvzon.t355_loan1')::UUID;
        v_paid NUMERIC; v_rem NUMERIC; v_st TEXT; v_mp INTEGER;
BEGIN
  PERFORM set_config('kyvzon.approval_sync','true',FALSE);
  UPDATE public.employee_loans SET remaining_amount = 40000 WHERE id = v_id;
  PERFORM set_config('kyvzon.approval_sync','false',FALSE);

  v_paid := public.loan_apply_repayment(v_id, NULL, NULL, 'manual');
  SELECT remaining_amount, status, months_paid INTO v_rem, v_st, v_mp
    FROM public.employee_loans WHERE id = v_id;
  -- LEAST(100000, 40000) = 40,000 ← لا 100,000
  PERFORM pg_temp.chk('4.9 آخر قسط يُقصّ عند المتبقّي', v_paid::TEXT, '40000.00');
  PERFORM pg_temp.chk('4.10 المتبقّي يبلغ صفراً', v_rem::TEXT, '0.00');
  PERFORM pg_temp.chk('4.11 الحالة تصير paid', v_st, 'paid');
  PERFORM pg_temp.chk('4.12 months_paid = 3', v_mp::TEXT, '3');
END $$;

-- سلفة مسدَّدة لا تُخصم مرّة أخرى
DO $$
DECLARE v_ok BOOLEAN := FALSE;
BEGIN
  BEGIN PERFORM public.loan_apply_repayment(
    current_setting('kyvzon.t355_loan1')::UUID, NULL, NULL, 'manual');
  EXCEPTION WHEN check_violation THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('4.13 سلفة paid لا تُسدَّد', v_ok::TEXT, 'true');
END $$;

-- ★★★ فترة 3: سلفة loan1 صارت paid ⇒ لا تُخصم بعد الآن.
--
--   ★ تصحيح توقّعي: كتبتُ أوّلاً «الخصم = 0.00» فسقط التأكيد بـ
--     got=«100000.00». السبب أنّ لسالم (e1) **سلفتين**: loan1
--     المسدَّدة، و«سلفة بسلسلة» 600,000 على 6 أشهر التي اعتمدها
--     admin في القسم ③ ومتبقّيها 600,000. فالخصم الباقي منها هي.
--     السلوك صحيح والتوقّع كان خاطئاً — والدرس أنّ عيّنةً بسلفتين
--     لموظّف واحد تكشف ما لا تكشفه عيّنة بسلفة واحدة.
SELECT * FROM public.payroll_run('e3550000-0000-0000-0000-00000000000c') \gset r3_

DO $$
DECLARE v_d NUMERIC; v_mp INTEGER; v_st TEXT;
BEGIN
  SELECT total_deductions INTO v_d FROM public.payroll_records
   WHERE period_id = 'e3550000-0000-0000-0000-00000000000c'
     AND employee_id = current_setting('kyvzon.t355_e1')::UUID;
  -- الضريبة والضمان والغياب أصفار ⇒ الخصم كلّه أقساط.
  -- loan1 (paid) لا تُحتسب · «سلفة بسلسلة» قسطها 600,000 ÷ 6 = 100,000
  PERFORM pg_temp.chk('4.14 الخصم من السلفة السارية وحدها',
    v_d::TEXT, '100000.00');

  -- ★★ والمقصود الأصليّ: المسدَّدة لا تتحرّك بعد تشغيل جديد
  SELECT months_paid, status INTO v_mp, v_st FROM public.employee_loans
   WHERE id = current_setting('kyvzon.t355_loan1')::UUID;
  PERFORM pg_temp.chk('4.15 المسدَّدة لا تُخصم ثانيةً', v_mp::TEXT, '3');
  PERFORM pg_temp.chk('4.16 تبقى paid', v_st, 'paid');
END $$;

-- ★ ولإثبات الصفر فعلاً: نُلغي السلفة السارية ونُعيد التشغيل
DO $$
DECLARE v_id UUID; v_d NUMERIC;
BEGIN
  SELECT l.id INTO v_id FROM public.employee_loans l
   WHERE l.tenant_id = 'a3550000-0000-0000-0000-000000000001'
     AND l.status = 'approved' AND COALESCE(l.remaining_amount,0) > 0
   LIMIT 1;
  PERFORM pg_temp.cleanup_loan(v_id);
  PERFORM public.payroll_run('e3550000-0000-0000-0000-00000000000c');
  SELECT total_deductions INTO v_d FROM public.payroll_records
   WHERE period_id = 'e3550000-0000-0000-0000-00000000000c'
     AND employee_id = current_setting('kyvzon.t355_e1')::UUID;
  PERFORM pg_temp.chk('4.17 بلا سلفة سارية: صفر خصم', v_d::TEXT, '0.00');
END $$;

\echo ''
\echo '═══ ⑤ سجلّ التسديد ═══'

DO $$
DECLARE v_n INTEGER; v_sum NUMERIC; v_first NUMERIC; v_p TEXT;
BEGIN
  SELECT count(*), sum(out_amount) INTO v_n, v_sum
    FROM public.loan_repayment_history(current_setting('kyvzon.t355_loan1')::UUID);
  PERFORM pg_temp.chk('5.1 ثلاثة تسديدات', v_n::TEXT, '3');
  -- 100,000 + 100,000 + 40,000 = 240,000
  PERFORM pg_temp.chk('5.2 مجموعها 240,000', v_sum::TEXT, '240000.00');

  SELECT out_amount, out_period_name INTO v_first, v_p
    FROM public.loan_repayment_history(current_setting('kyvzon.t355_loan1')::UUID)
   WHERE out_no = 1;
  PERFORM pg_temp.chk('5.3 القسط الأول 100,000', v_first::TEXT, '100000.00');
  PERFORM pg_temp.chk('5.4 اسم الفترة مرفق', v_p, 'فبراير 2026');

  PERFORM pg_temp.chk('5.5 التسديد اليدويّ بلا فترة',
    (SELECT out_period_name FROM public.loan_repayment_history(
       current_setting('kyvzon.t355_loan1')::UUID) WHERE out_no = 3), '—');
END $$;

DO $$
DECLARE v_ok BOOLEAN := FALSE;
BEGIN
  BEGIN DELETE FROM public.loan_repayments
         WHERE loan_id = current_setting('kyvzon.t355_loan1')::UUID;
  EXCEPTION WHEN check_violation THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('5.6 حذف سجلّ التسديد ممنوع', v_ok::TEXT, 'true');
END $$;

\echo ''
\echo '═══ ⑥ البطاقات — loan_summary ═══'

-- حالة المستأجر ألف بعد التأكيد 4.17 (الذي ألغى السلفة السارية):
--   loan1  paid       amount 1,200,000  remaining 0
--   chain  cancelled  amount   600,000  remaining 600,000  ← أُلغيت في 4.17
--   e2     rejected   amount   300,000  remaining 0
--   + سلفتان cancelled (تقويم 1,200,000 · تاريخ 1,200,000)
--
--   ★ الإلغاء لا يصفّر remaining_amount: القيمة تبقى شاهدةً على ما
--     كان قائماً وقت الإلغاء. لذا out_outstanding — المحسوب على
--     approved وحدها — يصير صفراً.
-- ★★★ ثغرة تغطية كشفها INV17: بعد الإلغاء في 4.17 صارت «السارية» = 0،
--   فعكسُ الشرط إلى `status='active'` المُختلَقة يعطي 0 أيضاً وينجو.
--   «شرطٌ لا تُوجَد بياناتٌ تخالفه = شرط غير مُختبَر». نُضيف سلفة
--   approved بمتبقٍّ موجب: هي وحدها تُفرّق بين الصيغتين.
DO $$
DECLARE v_id UUID;
BEGIN
  v_id := public.loan_create(current_setting('kyvzon.t355_e2')::UUID,
                             480000, 4, 'سارية للتمييز');
  PERFORM set_config('request.jwt.claim.sub',
    'b3550007-0000-0000-0000-000000000007', TRUE);
  PERFORM public.loan_decide(v_id, 'approved');
  PERFORM set_config('request.jwt.claim.sub',
    'b3550003-0000-0000-0000-000000000003', TRUE);
  PERFORM set_config('kyvzon.t355_live', v_id::TEXT, FALSE);
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  SELECT * INTO r FROM public.loan_summary();
  PERFORM pg_temp.chk('6.1 الإجمالي',      r.out_total::TEXT,       '6');
  PERFORM pg_temp.chk('6.2 بانتظار',       r.out_pending::TEXT,     '0');
  PERFORM pg_temp.chk('6.3 السارية',       r.out_active::TEXT,      '1');
  PERFORM pg_temp.chk('6.4 المسدَّدة',      r.out_paid::TEXT,        '1');
  PERFORM pg_temp.chk('6.5 المرفوضة',      r.out_rejected::TEXT,    '1');
  PERFORM pg_temp.chk('6.6 الملغاة',       r.out_cancelled::TEXT,   '3');
  -- السارية الوحيدة متبقّيها 480,000 (لم يُسدَّد منها قسط)
  PERFORM pg_temp.chk('6.7 المتبقي القائم', r.out_outstanding::TEXT, '480000.00');
  -- 480,000 ÷ 4 = 120,000
  PERFORM pg_temp.chk('6.8 الالتزام الشهري', r.out_monthly::TEXT,    '120000.00');
  -- المصروف = approved(480,000) + paid(1,200,000) = 1,680,000
  PERFORM pg_temp.chk('6.9 المصروف',        r.out_disbursed::TEXT,  '1680000.00');
  -- المسدَّد = (1,200,000−0) + (480,000−480,000) = 1,200,000
  PERFORM pg_temp.chk('6.10 المسدَّد',       r.out_repaid::TEXT,     '1200000.00');
END $$;

\echo ''
\echo '═══ ⑦ اللوحة — loan_board ═══'

DO $$
DECLARE r RECORD; v_n INTEGER;
BEGIN
  SELECT count(*) INTO v_n FROM public.loan_board(NULL, 200);
  PERFORM pg_temp.chk('7.1 كل السلف', v_n::TEXT, '6');

  SELECT count(*) INTO v_n FROM public.loan_board('paid', 200);
  PERFORM pg_temp.chk('7.2 ترشيح paid', v_n::TEXT, '1');

  SELECT count(*) INTO v_n FROM public.loan_board(NULL, 2);
  PERFORM pg_temp.chk('7.3 الحدّ الأعلى يعمل', v_n::TEXT, '2');

  SELECT * INTO r FROM public.loan_board('paid', 10);
  -- full_name_ar = NULL لكل موظف ⇒ الاحتياطي first+last من «سالم الأول»
  PERFORM pg_temp.chk('7.4 اسم بديل عن full_name_ar الفارغ',
    r.out_employee_name, 'سالم الأول');
  PERFORM pg_temp.chk('7.5 القسم من departments', r.out_department, 'المالية');
  -- (1,200,000 − 0) ÷ 1,200,000 × 100 = 100.0
  PERFORM pg_temp.chk('7.6 التقدّم 100%', r.out_progress::TEXT, '100.0');
  PERFORM pg_temp.chk('7.7 السلسلة مغلقة', r.out_chain_open::TEXT, '0');

  SELECT * INTO r FROM public.loan_board('rejected', 10);
  PERFORM pg_temp.chk('7.8 سبب الرفض في اللوحة', r.out_rejection, 'الميزانية');
  PERFORM pg_temp.chk('7.9 تقدّم المرفوضة صفر', r.out_progress::TEXT, '0.0');
END $$;

\echo ''
\echo '═══ ⑧ العزل بين المستأجرين ═══'

-- سلفة في المستأجر باء بدور hr الخاص به
DO $$
DECLARE v_id UUID;
BEGIN
  PERFORM set_config('request.jwt.claim.sub',
    'b3550006-0000-0000-0000-000000000006', TRUE);
  v_id := public.loan_create(current_setting('kyvzon.t355_e5')::UUID, 900000, 9, 'سلفة أجنبية');
  PERFORM set_config('kyvzon.t355_foreign', v_id::TEXT, FALSE);
END $$;

DO $$
DECLARE r RECORD; v_n INTEGER;
BEGIN
  -- ما زلنا في سياق باء
  SELECT * INTO r FROM public.loan_summary();
  PERFORM pg_temp.chk('8.1 باء يرى سلفته وحدها', r.out_total::TEXT, '1');

  PERFORM set_config('request.jwt.claim.sub',
    'b3550003-0000-0000-0000-000000000003', TRUE);
  SELECT * INTO r FROM public.loan_summary();
  PERFORM pg_temp.chk('8.2 ألف لا يرى سلفة باء', r.out_total::TEXT, '6');

  SELECT count(*) INTO v_n FROM public.loan_board(NULL, 500)
   WHERE out_id = current_setting('kyvzon.t355_foreign')::UUID;
  PERFORM pg_temp.chk('8.3 اللوحة لا تُسرّب', v_n::TEXT, '0');
END $$;

-- ★★★ ثغرة تغطية كشفها INV07: التأكيد 8.4 كان يمرّ حتى بلا ترشيح
--   المستأجر، لأن السلفة الأجنبية `pending` فيمسكها حارس
--   «التسديد يتطلّب approved» أوّلاً. شرطٌ لا تُوجَد بياناتٌ تخالفه.
--   نُصلح العيّنة: سلفة أجنبية **معتمَدة بمتبقٍّ موجب** — لا يمسكها
--   إلا ترشيح المستأجر نفسه.
DO $$
DECLARE v_id UUID;
BEGIN
  PERFORM set_config('request.jwt.claim.sub',
    'b3550006-0000-0000-0000-000000000006', TRUE);
  v_id := public.loan_create(current_setting('kyvzon.t355_e5')::UUID,
                             450000, 5, 'أجنبية معتمَدة');
  PERFORM set_config('kyvzon.approval_sync','true',FALSE);
  UPDATE public.employee_loans
     SET status = 'approved', remaining_amount = 450000 WHERE id = v_id;
  PERFORM set_config('kyvzon.approval_sync','false',FALSE);
  PERFORM set_config('kyvzon.t355_foreign_ok', v_id::TEXT, FALSE);
  PERFORM set_config('request.jwt.claim.sub',
    'b3550003-0000-0000-0000-000000000003', TRUE);
END $$;

DO $$
DECLARE v_ok BOOLEAN := FALSE; v_m TEXT := '';
BEGIN
  BEGIN PERFORM public.loan_apply_repayment(
    current_setting('kyvzon.t355_foreign')::UUID, NULL, NULL, 'manual');
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('8.4 تسديد سلفة أجنبية يرمي', v_ok::TEXT, 'true');

  -- ★★ الاختبار الحاسم: أجنبية **معتمَدة** ⇒ ترشيح المستأجر وحده يمسكها
  v_ok := FALSE;
  BEGIN PERFORM public.loan_apply_repayment(
    current_setting('kyvzon.t355_foreign_ok')::UUID, NULL, NULL, 'manual');
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE;
            GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('8.4b تسديد أجنبية معتمَدة يرمي', v_ok::TEXT, 'true');
  PERFORM pg_temp.chk('8.4c الرسالة رسالة المستأجر لا الحالة',
    (position('غير موجودة في هذا المستأجر' IN v_m) > 0)::TEXT, 'true');
  PERFORM pg_temp.chk('8.4d متبقّي الأجنبية لم يتغيّر',
    (SELECT remaining_amount::TEXT FROM public.employee_loans
      WHERE id = current_setting('kyvzon.t355_foreign_ok')::UUID), '450000.00');
  PERFORM pg_temp.chk('8.4e لا صفّ تسديد أجنبيّ',
    (SELECT count(*)::TEXT FROM public.loan_repayments
      WHERE loan_id = current_setting('kyvzon.t355_foreign_ok')::UUID), '0');
END $$;

-- ★★ ثغرة تغطية كشفها INV33: سجلّ سلفة أجنبية. الحارس السابق كان
--   يفحص «موظف لا يرى سجلّ زميله» (نفس المستأجر) فلا يلمس ترشيح
--   المستأجر إطلاقاً.
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_m TEXT := '';
BEGIN
  BEGIN PERFORM public.loan_repayment_history(
    current_setting('kyvzon.t355_foreign_ok')::UUID);
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE;
            GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('8.7 سجلّ سلفة أجنبية يرمي', v_ok::TEXT, 'true');
  PERFORM pg_temp.chk('8.8 الرسالة رسالة المستأجر',
    (position('غير موجودة في هذا المستأجر' IN v_m) > 0)::TEXT, 'true');
END $$;

DO $$
DECLARE v_ok BOOLEAN := FALSE;
BEGIN
  BEGIN PERFORM public.loan_decide(
    current_setting('kyvzon.t355_foreign')::UUID, 'approved');
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('8.5 بتّ في سلفة أجنبية يرمي', v_ok::TEXT, 'true');
END $$;

DO $$
DECLARE v_ok BOOLEAN := FALSE;
BEGIN
  BEGIN PERFORM public.loan_create(current_setting('kyvzon.t355_e5')::UUID, 100000, 5, 'موظف أجنبي');
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('8.6 إنشاء لموظف أجنبي يرمي', v_ok::TEXT, 'true');
END $$;

\echo ''
\echo '═══ ⑨ حرّاس الأدوار ═══'

DO $$
DECLARE v_ok BOOLEAN;
BEGIN
  -- الموظف العاديّ
  PERFORM set_config('request.jwt.claim.sub',
    'b3550001-0000-0000-0000-000000000001', TRUE);

  v_ok := FALSE;
  BEGIN PERFORM public.loan_summary();
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('9.1 الموظف لا يرى الملخّص', v_ok::TEXT, 'true');

  v_ok := FALSE;
  BEGIN PERFORM public.loan_board(NULL, 10);
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('9.2 الموظف لا يرى اللوحة', v_ok::TEXT, 'true');

  v_ok := FALSE;
  BEGIN PERFORM public.loan_create(current_setting('kyvzon.t355_e1')::UUID, 50000, 5, 'ذاتيّ');
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('9.3 الموظف لا يُنشئ سلفة', v_ok::TEXT, 'true');

  v_ok := FALSE;
  BEGIN PERFORM public.loan_decide(
    current_setting('kyvzon.t355_loan1')::UUID, 'approved');
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('9.4 الموظف لا يبتّ', v_ok::TEXT, 'true');

  -- ★ لكنّه يرى سجلّ سلفته هو
  PERFORM pg_temp.chk('9.5 الموظف يرى سجلّ سلفته',
    (SELECT count(*)::TEXT FROM public.loan_repayment_history(
       current_setting('kyvzon.t355_loan1')::UUID)), '3');
END $$;

DO $$
DECLARE v_ok BOOLEAN := FALSE;
BEGIN
  -- ناصر يحاول رؤية سجلّ سلفة سالم
  PERFORM set_config('request.jwt.claim.sub',
    'b3550002-0000-0000-0000-000000000002', TRUE);
  BEGIN PERFORM public.loan_repayment_history(
    current_setting('kyvzon.t355_loan1')::UUID);
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('9.6 موظف لا يرى سجلّ زميله', v_ok::TEXT, 'true');
END $$;

DO $$
DECLARE v_ok BOOLEAN := FALSE;
BEGIN
  -- المدير ليس staff (مُحقَّق: current_user_is_staff = admin·hr·developer·it_admin)
  PERFORM set_config('request.jwt.claim.sub',
    'b3550004-0000-0000-0000-000000000004', TRUE);
  BEGIN PERFORM public.loan_summary();
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('9.7 المدير ليس staff', v_ok::TEXT, 'true');
END $$;

\echo ''
\echo '═══ ⑩ الصلاحيات ═══'

DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'loan_apply_repayment','loan_create','loan_summary',
    'loan_board','loan_decide','loan_repayment_history','payroll_approve']
  LOOP
    PERFORM pg_temp.chk('10.' || f || ' — لا PUBLIC',
      (SELECT bool_or(has_function_privilege('public', p.oid, 'EXECUTE'))::TEXT
         FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.proname=f), 'false');
    PERFORM pg_temp.chk('10.' || f || ' — لا anon',
      (SELECT bool_or(has_function_privilege('anon', p.oid, 'EXECUTE'))::TEXT
         FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.proname=f), 'false');
    PERFORM pg_temp.chk('10.' || f || ' — authenticated',
      (SELECT bool_or(has_function_privilege('authenticated', p.oid, 'EXECUTE'))::TEXT
         FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.proname=f), 'true');
  END LOOP;
END $$;

-- ★★ ثغرة تغطية كشفها DDL03: قيد موجبية المبلغ لم يكن مُختبَراً
--   إطلاقاً — لا بيانات تخالفه. نُدخل صفّاً سالباً مباشرةً.
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_m TEXT := '';
BEGIN
  BEGIN
    INSERT INTO public.loan_repayments
      (tenant_id, loan_id, employee_id, amount, installment_no, remaining_after)
    SELECT 'a3550000-0000-0000-0000-000000000001',
           current_setting('kyvzon.t355_live')::UUID,
           current_setting('kyvzon.t355_e2')::UUID, -1000, 1, 0;
  EXCEPTION WHEN check_violation THEN v_ok := TRUE;
            GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('10.A مبلغ تسديد سالب مرفوض', v_ok::TEXT, 'true');
  PERFORM pg_temp.chk('10.B القيد المُسمّى هو الرافض',
    (position('loan_repayments_amount_pos' IN v_m) > 0)::TEXT, 'true');

  v_ok := FALSE;
  BEGIN
    INSERT INTO public.loan_repayments
      (tenant_id, loan_id, employee_id, amount, installment_no, remaining_after)
    SELECT 'a3550000-0000-0000-0000-000000000001',
           current_setting('kyvzon.t355_live')::UUID,
           current_setting('kyvzon.t355_e2')::UUID, 0, 1, 0;
  EXCEPTION WHEN check_violation THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('10.C مبلغ تسديد صفر مرفوض', v_ok::TEXT, 'true');

  v_ok := FALSE;
  BEGIN
    INSERT INTO public.loan_repayments
      (tenant_id, loan_id, employee_id, amount, installment_no, remaining_after)
    SELECT 'a3550000-0000-0000-0000-000000000001',
           current_setting('kyvzon.t355_live')::UUID,
           current_setting('kyvzon.t355_e2')::UUID, 100, 1, -5;
  EXCEPTION WHEN check_violation THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('10.D متبقٍّ سالب بعد التسديد مرفوض', v_ok::TEXT, 'true');

  v_ok := FALSE;
  BEGIN
    INSERT INTO public.loan_repayments
      (tenant_id, loan_id, employee_id, amount, installment_no, remaining_after, source)
    SELECT 'a3550000-0000-0000-0000-000000000001',
           current_setting('kyvzon.t355_live')::UUID,
           current_setting('kyvzon.t355_e2')::UUID, 100, 1, 0, 'حوالة';
  EXCEPTION WHEN check_violation THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('10.E مصدر غير معروف مرفوض', v_ok::TEXT, 'true');
END $$;

-- ★★★ ثغرة تغطية كشفها INV02: التأكيد كان يفحص has_table_privilege
--   على INSERT وحده. وGRANT SELECT بعد REVOKE ALL يترك SELECT فقط،
--   لكن **بلا** REVOKE تبقى UPDATE/DELETE ممنوحتين ضمنياً من 0268
--   ولم يكن شيء يفحصهما. نفحص الأربع صراحةً.
DO $$
DECLARE p TEXT;
BEGIN
  FOREACH p IN ARRAY ARRAY['INSERT','UPDATE','DELETE','TRUNCATE'] LOOP
    PERFORM pg_temp.chk('10.F authenticated بلا ' || p,
      has_table_privilege('authenticated','loan_repayments',p)::TEXT, 'false');
  END LOOP;
  PERFORM pg_temp.chk('10.G المنحة الوحيدة هي SELECT',
    (SELECT string_agg(privilege_type, ',' ORDER BY privilege_type)
       FROM information_schema.role_table_grants
      WHERE table_name = 'loan_repayments' AND grantee = 'authenticated'),
    'SELECT');
END $$;

DO $$
BEGIN
  PERFORM pg_temp.chk('10.RLS مفعّلة على loan_repayments',
    (SELECT relrowsecurity::TEXT FROM pg_class WHERE oid='loan_repayments'::regclass),
    'true');
  PERFORM pg_temp.chk('10.لا سياسة INSERT/UPDATE/DELETE',
    (SELECT count(*)::TEXT FROM pg_policy
      WHERE polrelid='loan_repayments'::regclass
        AND polcmd IN ('a','w','d')), '0');
  PERFORM pg_temp.chk('10.anon بلا SELECT',
    has_table_privilege('anon','loan_repayments','SELECT')::TEXT, 'false');
  PERFORM pg_temp.chk('10.authenticated له SELECT',
    has_table_privilege('authenticated','loan_repayments','SELECT')::TEXT, 'true');
  PERFORM pg_temp.chk('10.authenticated بلا INSERT',
    has_table_privilege('authenticated','loan_repayments','INSERT')::TEXT, 'false');
END $$;

\echo ''
\echo '✅ 0355 — كل التأكيدات مرّت'
ROLLBACK;
