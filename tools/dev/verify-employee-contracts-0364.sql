-- ════════════════════════════════════════════════════════════════════════
--  التحقق السلوكيّ من 0364 — عقود الموظفين
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
  RAISE NOTICE 'ok   %  =  %', rpad(p_label, 54, '.'), COALESCE(p_want,'NULL');
END $$;

-- ══════════════════════ العيّنة ══════════════════════
-- ★ UUIDات فريدة في **أول 8 حروف** (درس 0355)
INSERT INTO public.tenants (id,name,name_ar,slug) VALUES
 ('a3640000-0000-0000-0000-00000000000a','T364A','شركة ألف','t364a'),
 ('b3640000-0000-0000-0000-00000000000b','T364B','شركة باء','t364b');

INSERT INTO auth.users(id,email) VALUES
 ('11640001-0000-0000-0000-000000000001','salem@t364a'),
 ('22640002-0000-0000-0000-000000000002','nasser@t364a'),
 ('33640003-0000-0000-0000-000000000003','huda@t364a'),
 ('44640004-0000-0000-0000-000000000004','munir@t364a'),
 ('66640006-0000-0000-0000-000000000006','emp@t364b'),
 ('77640007-0000-0000-0000-000000000007','hr@t364b');

-- ★ المدير أولاً ثم القسم (درس 0357)
INSERT INTO public.profiles (id,tenant_id,full_name,role,department) VALUES
 ('44640004-0000-0000-0000-000000000004','a3640000-0000-0000-0000-00000000000a','منير المدير','manager','المالية');
INSERT INTO public.departments (id,tenant_id,name_ar,manager_id) VALUES
 ('d3640000-0000-0000-0000-00000000000d','a3640000-0000-0000-0000-00000000000a','المالية',
  '44640004-0000-0000-0000-000000000004');
INSERT INTO public.profiles (id,tenant_id,full_name,role,department) VALUES
 ('11640001-0000-0000-0000-000000000001','a3640000-0000-0000-0000-00000000000a','سالم الأول','employee','المالية'),
 ('22640002-0000-0000-0000-000000000002','a3640000-0000-0000-0000-00000000000a','ناصر الثاني','employee','المالية'),
 ('33640003-0000-0000-0000-000000000003','a3640000-0000-0000-0000-00000000000a','هدى الموارد','hr','الموارد'),
 ('66640006-0000-0000-0000-000000000006','b3640000-0000-0000-0000-00000000000b','أجنبي باء','employee','المالية'),
 ('77640007-0000-0000-0000-000000000007','b3640000-0000-0000-0000-00000000000b','مورد باء','hr','الموارد');
-- ★ موظفٌ ثانٍ في باء — يحتاجه التأكيد 12.9 (كشفه INV10)
INSERT INTO auth.users(id,email) VALUES
 ('88640008-0000-0000-0000-000000000008','emp2@t364b');
INSERT INTO public.profiles (id,tenant_id,full_name,role,department) VALUES
 ('88640008-0000-0000-0000-000000000008','b3640000-0000-0000-0000-00000000000b','أجنبي ثانٍ','employee','المالية');

SELECT set_config('kyvzon.t364_e1',
  (SELECT e.id::TEXT FROM public.employees e WHERE e.user_id='11640001-0000-0000-0000-000000000001'), FALSE),
       set_config('kyvzon.t364_e2',
  (SELECT e.id::TEXT FROM public.employees e WHERE e.user_id='22640002-0000-0000-0000-000000000002'), FALSE),
       set_config('kyvzon.t364_eb',
  (SELECT e.id::TEXT FROM public.employees e WHERE e.user_id='66640006-0000-0000-0000-000000000006'), FALSE),
       set_config('kyvzon.t364_eb2',
  (SELECT e.id::TEXT FROM public.employees e WHERE e.user_id='88640008-0000-0000-0000-000000000008'), FALSE);

SET LOCAL request.jwt.claim.sub = '33640003-0000-0000-0000-000000000003';

\echo ''
\echo '═══ ★★★ ① العطل ①: الشرط الميّت أُسقط من السياسة ═══'

DO $$
DECLARE v_pol TEXT;
BEGIN
  SELECT pg_get_expr(polqual,polrelid) INTO v_pol
    FROM pg_policy WHERE polname='kyvzon_employee_contracts_select';

  -- ★★★ `employee_id = auth.uid()` شرطٌ ميّت: employees.id ≠ auth.users.id
  PERFORM pg_temp.chk('1.1 ★ auth.uid() اختفى من السياسة',
    (position('auth.uid()' IN v_pol) > 0)::TEXT, 'false');
  PERFORM pg_temp.chk('1.2 وcurrent_user_employee_id باقٍ',
    (position('current_user_employee_id' IN v_pol) > 0)::TEXT, 'true');

  -- ★★ وإثبات أن الشرط كان ميّتاً فعلاً: صفر صفّ يطابق id = user_id
  PERFORM pg_temp.chk('1.3 صفوف employees حيث id = user_id',
    (SELECT count(*)::TEXT FROM public.employees WHERE id = user_id), '0');
END $$;

\echo ''
\echo '═══ ① بنية الجدول والقيود ═══'

DO $$
BEGIN
  PERFORM pg_temp.chk('1.4 FK مركَّب (employee_id,tenant_id)',
    (SELECT count(*)::TEXT FROM pg_constraint
      WHERE conname='employee_contracts_employee_tenant_fkey' AND contype='f'), '1');
  PERFORM pg_temp.chk('1.5 ON DELETE RESTRICT',
    (SELECT (pg_get_constraintdef(oid) LIKE '%ON DELETE RESTRICT%')::TEXT
       FROM pg_constraint WHERE conname='employee_contracts_employee_tenant_fkey'), 'true');
  PERFORM pg_temp.chk('1.6 قيد التواريخ',
    (SELECT count(*)::TEXT FROM pg_constraint
      WHERE conname='employee_contracts_dates_chk'), '1');
  PERFORM pg_temp.chk('1.7 قيد محدد المدة',
    (SELECT count(*)::TEXT FROM pg_constraint
      WHERE conname='employee_contracts_term_chk'), '1');
  PERFORM pg_temp.chk('1.8 قيد مدّة التنبيه',
    (SELECT count(*)::TEXT FROM pg_constraint
      WHERE conname='employee_contracts_notice_chk'), '1');
  PERFORM pg_temp.chk('1.9 قيدا الراتب والعملة',
    (SELECT count(*)::TEXT FROM pg_constraint
      WHERE conname IN ('employee_contracts_salary_chk',
                        'employee_contracts_currency_chk')), '2');
  PERFORM pg_temp.chk('1.10 قيد الإنهاء',
    (SELECT count(*)::TEXT FROM pg_constraint
      WHERE conname='employee_contracts_termination_chk'), '1');
  PERFORM pg_temp.chk('1.11 فهرس العقد النشط الواحد',
    (SELECT count(*)::TEXT FROM pg_indexes
      WHERE indexname='uq_employee_contracts_one_active'), '1');
  PERFORM pg_temp.chk('1.12 محفّز منع الحذف',
    (SELECT count(*)::TEXT FROM pg_trigger
      WHERE tgname='trg_block_employee_contract_delete'), '1');
  -- ★★★ hybrid_gate يبقى RESTRICTIVE (درس 0355)
  PERFORM pg_temp.chk('1.13 hybrid_gate RESTRICTIVE',
    (SELECT (NOT polpermissive)::TEXT FROM pg_policy
      WHERE polname='hybrid_gate_employee_contracts'), 'true');
  -- ★ الأعمدة الجديدة
  PERFORM pg_temp.chk('1.14 أعمدة التجديد والإنهاء والربط',
    (SELECT count(*)::TEXT FROM information_schema.columns
      WHERE table_name='employee_contracts'
        AND column_name IN ('renewed_from','previous_end_date','renewal_count',
                            'terminated_at','termination_reason',
                            'job_application_id','offboarding_id')), '7');
END $$;

\echo ''
\echo '═══ ★★ ② حرّاس الإنشاء ═══'

DO $$
DECLARE v_m TEXT; v_before INTEGER;
BEGIN
  v_before := (SELECT count(*) FROM public.employee_contracts);

  -- ★★★ العطلان ②/③: موظفٌ معدوم ومن مستأجرٍ آخر
  v_m := ''; BEGIN PERFORM public.contract_upsert(
    NULL,'ffffffff-ffff-ffff-ffff-ffffffffffff','permanent');
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('2.1 CONTRACT_EMPLOYEE_NOT_FOUND (معدوم)',
    (position('CONTRACT_EMPLOYEE_NOT_FOUND' IN v_m) > 0)::TEXT, 'true');

  v_m := ''; BEGIN PERFORM public.contract_upsert(
    NULL,current_setting('kyvzon.t364_eb')::UUID,'permanent');
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('2.2 CONTRACT_EMPLOYEE_NOT_FOUND (مستأجر آخر)',
    (position('CONTRACT_EMPLOYEE_NOT_FOUND' IN v_m) > 0)::TEXT, 'true');
  -- ★★ والرمز رمزُ الحارس لا رسالةُ FK (درس 0361/INV13)
  PERFORM pg_temp.chk('2.3 الحارس سبق FK',
    (position('employee_tenant_fkey' IN v_m) > 0)::TEXT, 'false');

  -- ★★★ العطل ④
  v_m := ''; BEGIN PERFORM public.contract_upsert(
    NULL,current_setting('kyvzon.t364_e1')::UUID,'fixed_term',NULL,NULL,
    ((now() AT TIME ZONE 'Asia/Baghdad')::DATE),
    ((now() AT TIME ZONE 'Asia/Baghdad')::DATE - 400));
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('2.4 CONTRACT_END_BEFORE_START',
    (position('CONTRACT_END_BEFORE_START' IN v_m) > 0)::TEXT, 'true');

  -- ★★★ العطل ⑥
  v_m := ''; BEGIN PERFORM public.contract_upsert(
    NULL,current_setting('kyvzon.t364_e1')::UUID,'fixed_term');
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('2.5 CONTRACT_TERM_NEEDS_END',
    (position('CONTRACT_TERM_NEEDS_END' IN v_m) > 0)::TEXT, 'true');

  -- ★★ العطل ⑧
  v_m := ''; BEGIN PERFORM public.contract_upsert(
    NULL,current_setting('kyvzon.t364_e1')::UUID,'permanent',NULL,NULL,NULL,NULL,-30);
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('2.6 CONTRACT_NOTICE_INVALID (سالب)',
    (position('CONTRACT_NOTICE_INVALID' IN v_m) > 0)::TEXT, 'true');

  v_m := ''; BEGIN PERFORM public.contract_upsert(
    NULL,current_setting('kyvzon.t364_e1')::UUID,'permanent',NULL,NULL,NULL,NULL,400);
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('2.7 CONTRACT_NOTICE_INVALID (فوق 365)',
    (position('CONTRACT_NOTICE_INVALID' IN v_m) > 0)::TEXT, 'true');

  -- ★★ العطل ⑨
  v_m := ''; BEGIN PERFORM public.contract_upsert(
    NULL,current_setting('kyvzon.t364_e1')::UUID,'permanent',NULL,NULL,NULL,NULL,30,-5000);
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('2.8 CONTRACT_SALARY_INVALID',
    (position('CONTRACT_SALARY_INVALID' IN v_m) > 0)::TEXT, 'true');

  v_m := ''; BEGIN PERFORM public.contract_upsert(
    NULL,current_setting('kyvzon.t364_e1')::UUID,'permanent',NULL,NULL,NULL,NULL,30,
    1000,'XYZ');
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('2.9 CONTRACT_CURRENCY_INVALID',
    (position('CONTRACT_CURRENCY_INVALID' IN v_m) > 0)::TEXT, 'true');

  v_m := ''; BEGIN PERFORM public.contract_upsert(
    NULL,current_setting('kyvzon.t364_e1')::UUID,'مخترع');
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('2.10 CONTRACT_TYPE_INVALID',
    (position('CONTRACT_TYPE_INVALID' IN v_m) > 0)::TEXT, 'true');

  -- ★★ ولا صفّ دخل من العشرة
  PERFORM pg_temp.chk('2.11 لا عقد دخل مع الحرّاس العشرة',
    (SELECT count(*)::TEXT FROM public.employee_contracts), v_before::TEXT);
END $$;

\echo ''
\echo '═══ ★★ ③ القيود تحرس الكتابة المباشرة ═══'

DO $$
DECLARE v_ok BOOLEAN;
BEGIN
  v_ok := FALSE;
  BEGIN INSERT INTO public.employee_contracts
          (tenant_id,employee_id,contract_type,start_date)
        VALUES ('a3640000-0000-0000-0000-00000000000a',
                'ffffffff-ffff-ffff-ffff-ffffffffffff','permanent',CURRENT_DATE);
  EXCEPTION WHEN foreign_key_violation THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('3.1 FK يرفض موظفاً معدوماً', v_ok::TEXT, 'true');

  v_ok := FALSE;
  BEGIN INSERT INTO public.employee_contracts
          (tenant_id,employee_id,contract_type,start_date)
        VALUES ('a3640000-0000-0000-0000-00000000000a',
                current_setting('kyvzon.t364_eb')::UUID,'permanent',CURRENT_DATE);
  EXCEPTION WHEN foreign_key_violation THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('3.2 FK المركَّب يرفض موظف مستأجر آخر', v_ok::TEXT, 'true');

  v_ok := FALSE;
  BEGIN INSERT INTO public.employee_contracts
          (tenant_id,employee_id,contract_type,start_date,end_date)
        VALUES ('a3640000-0000-0000-0000-00000000000a',
                current_setting('kyvzon.t364_e1')::UUID,'fixed_term',
                CURRENT_DATE, CURRENT_DATE - 10);
  EXCEPTION WHEN check_violation THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('3.3 CHECK يرفض نهايةً قبل بداية', v_ok::TEXT, 'true');

  v_ok := FALSE;
  BEGIN INSERT INTO public.employee_contracts
          (tenant_id,employee_id,contract_type,start_date)
        VALUES ('a3640000-0000-0000-0000-00000000000a',
                current_setting('kyvzon.t364_e1')::UUID,'fixed_term',CURRENT_DATE);
  EXCEPTION WHEN check_violation THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('3.4 CHECK يرفض محدد المدة بلا نهاية', v_ok::TEXT, 'true');

  v_ok := FALSE;
  BEGIN INSERT INTO public.employee_contracts
          (tenant_id,employee_id,contract_type,start_date,renewal_notice_days)
        VALUES ('a3640000-0000-0000-0000-00000000000a',
                current_setting('kyvzon.t364_e1')::UUID,'permanent',CURRENT_DATE,0);
  EXCEPTION WHEN check_violation THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('3.5 CHECK يرفض تنبيهاً صفراً', v_ok::TEXT, 'true');

  v_ok := FALSE;
  BEGIN INSERT INTO public.employee_contracts
          (tenant_id,employee_id,contract_type,start_date,salary_amount)
        VALUES ('a3640000-0000-0000-0000-00000000000a',
                current_setting('kyvzon.t364_e1')::UUID,'permanent',CURRENT_DATE,-5);
  EXCEPTION WHEN check_violation THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('3.6 CHECK يرفض راتباً سالباً', v_ok::TEXT, 'true');

  v_ok := FALSE;
  BEGIN INSERT INTO public.employee_contracts
          (tenant_id,employee_id,contract_type,start_date,salary_currency)
        VALUES ('a3640000-0000-0000-0000-00000000000a',
                current_setting('kyvzon.t364_e1')::UUID,'permanent',CURRENT_DATE,'XYZ');
  EXCEPTION WHEN check_violation THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('3.7 CHECK يرفض عملةً مختلقة', v_ok::TEXT, 'true');

  -- ★★★ العطل ⑫: الإنهاء بلا سببٍ مستحيل بنيوياً
  v_ok := FALSE;
  BEGIN INSERT INTO public.employee_contracts
          (tenant_id,employee_id,contract_type,start_date,status)
        VALUES ('a3640000-0000-0000-0000-00000000000a',
                current_setting('kyvzon.t364_e1')::UUID,'permanent',
                CURRENT_DATE,'terminated');
  EXCEPTION WHEN check_violation THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('3.8 CHECK يرفض إنهاءً بلا سبب', v_ok::TEXT, 'true');

  -- ★★ العطل ⑱: رقمٌ من فراغات
  v_ok := FALSE;
  BEGIN
    -- المحفّز يُطبّعه إلى NULL ⇒ نُعطّله لنُثبت القيد
    ALTER TABLE public.employee_contracts DISABLE TRIGGER trg_employee_contract_stamp;
    BEGIN INSERT INTO public.employee_contracts
            (tenant_id,employee_id,contract_type,start_date,contract_number)
          VALUES ('a3640000-0000-0000-0000-00000000000a',
                  current_setting('kyvzon.t364_e1')::UUID,'permanent',
                  CURRENT_DATE,'   ');
    EXCEPTION WHEN check_violation THEN v_ok := TRUE; END;
    ALTER TABLE public.employee_contracts ENABLE TRIGGER trg_employee_contract_stamp;
  END;
  PERFORM pg_temp.chk('3.9 CHECK يرفض رقماً من فراغات', v_ok::TEXT, 'true');
END $$;

\echo ''
\echo '═══ ★★ ④ الإنشاء والمحفّز ═══'

DO $$
DECLARE v_c1 UUID; v_c2 UUID; v_today DATE;
BEGIN
  v_today := (now() AT TIME ZONE 'Asia/Baghdad')::DATE;

  -- عقدٌ دائم لسالم
  v_c1 := public.contract_upsert(
    NULL, current_setting('kyvzon.t364_e1')::UUID, 'permanent',
    'CT-001','مهندس أول', v_today - 100, NULL, 30, 1500000, 'IQD',
    'http://x/c1.pdf','ملاحظة');
  -- عقدٌ محدد المدة لناصر ينتهي بعد 20 يوماً (داخل نافذة التنبيه 30)
  v_c2 := public.contract_upsert(
    NULL, current_setting('kyvzon.t364_e2')::UUID, 'fixed_term',
    'CT-002','محاسب', v_today - 300, v_today + 20, 30, 900000, 'IQD');

  PERFORM set_config('kyvzon.t364_c1', v_c1::TEXT, FALSE);
  PERFORM set_config('kyvzon.t364_c2', v_c2::TEXT, FALSE);

  PERFORM pg_temp.chk('4.1 عقدان في ألف',
    (SELECT count(*)::TEXT FROM public.employee_contracts
      WHERE tenant_id='a3640000-0000-0000-0000-00000000000a'), '2');
  -- ★ العطل ⑰: المنشئ يُملأ تلقائياً
  PERFORM pg_temp.chk('4.2 created_by = هدى',
    (SELECT created_by::TEXT FROM public.employee_contracts WHERE id=v_c1),
    '33640003-0000-0000-0000-000000000003');
  PERFORM pg_temp.chk('4.3 updated_by = هدى',
    (SELECT updated_by::TEXT FROM public.employee_contracts WHERE id=v_c1),
    '33640003-0000-0000-0000-000000000003');
  PERFORM pg_temp.chk('4.4 renewal_count يبدأ صفراً',
    (SELECT renewal_count::TEXT FROM public.employee_contracts WHERE id=v_c1), '0');

  -- ★★ كشف العكسُ INV03 أن تجميد الموظف/المستأجر لم يكن مُختبَراً
  UPDATE public.employee_contracts
     SET employee_id = current_setting('kyvzon.t364_e2')::UUID
   WHERE id = v_c1;
  PERFORM pg_temp.chk('4.8 employee_id مُجمَّد بعد الإنشاء',
    (SELECT (employee_id = current_setting('kyvzon.t364_e1')::UUID)::TEXT
       FROM public.employee_contracts WHERE id=v_c1), 'true');
  UPDATE public.employee_contracts
     SET tenant_id = 'b3640000-0000-0000-0000-00000000000b' WHERE id = v_c1;
  PERFORM pg_temp.chk('4.9 tenant_id مُجمَّد كذلك',
    (SELECT (tenant_id = 'a3640000-0000-0000-0000-00000000000a')::TEXT
       FROM public.employee_contracts WHERE id=v_c1), 'true');
  -- ★ و created_by مُجمَّد
  UPDATE public.employee_contracts
     SET created_by = '44640004-0000-0000-0000-000000000004' WHERE id = v_c1;
  PERFORM pg_temp.chk('4.10 created_by مُجمَّد',
    (SELECT created_by::TEXT FROM public.employee_contracts WHERE id=v_c1),
    '33640003-0000-0000-0000-000000000003');

  -- ★★ وكشف INV05 أن تطبيع رقم العقد لم يكن مُختبَراً
  DECLARE v_cn UUID;
  BEGIN
    v_cn := public.contract_upsert(
      NULL, current_setting('kyvzon.t364_e2')::UUID, 'permanent',
      '  CT-TRIM  ', NULL, NULL, NULL, 30, NULL, 'IQD', NULL, NULL, 'draft');
    PERFORM pg_temp.chk('4.11 رقم العقد يُطبَّع (تُقصّ الفراغات)',
      (SELECT contract_number FROM public.employee_contracts WHERE id=v_cn), 'CT-TRIM');
    -- ★ ورقمٌ من فراغات يصير NULL لا سلسلةً فارغة
    UPDATE public.employee_contracts SET contract_number='    ' WHERE id=v_cn;
    PERFORM pg_temp.chk('4.12 وفراغاتٌ محضة تصير NULL',
      (SELECT (contract_number IS NULL)::TEXT FROM public.employee_contracts
        WHERE id=v_cn), 'true');
    PERFORM set_config('kyvzon.t364_cn', v_cn::TEXT, FALSE);
  END;

  -- ★★★ العطل ⑤: عقدٌ نشطٌ ثانٍ لسالم مرفوض
  DECLARE v_m TEXT := '';
  BEGIN
    BEGIN PERFORM public.contract_upsert(
      NULL, current_setting('kyvzon.t364_e1')::UUID, 'consultant',
      NULL,NULL, v_today, v_today + 100);
    EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
    PERFORM pg_temp.chk('4.5 CONTRACT_ACTIVE_EXISTS',
      (position('CONTRACT_ACTIVE_EXISTS' IN v_m) > 0)::TEXT, 'true');
  END;

  -- ★★ والفهرس الفريد يحرس الكتابة المباشرة
  DECLARE v_ok BOOLEAN := FALSE;
  BEGIN
    BEGIN INSERT INTO public.employee_contracts
            (tenant_id,employee_id,contract_type,start_date,status)
          VALUES ('a3640000-0000-0000-0000-00000000000a',
                  current_setting('kyvzon.t364_e1')::UUID,'consultant',
                  v_today,'active');
    EXCEPTION WHEN unique_violation THEN v_ok := TRUE; END;
    PERFORM pg_temp.chk('4.6 الفهرس الفريد يحرس المباشر', v_ok::TEXT, 'true');
  END;

  -- ★ ورقم عقدٍ مكرَّر مرفوض (الفرادة القائمة)
  DECLARE v_ok2 BOOLEAN := FALSE;
  BEGIN
    BEGIN PERFORM public.contract_upsert(
      NULL, current_setting('kyvzon.t364_e2')::UUID, 'permanent','CT-001');
    EXCEPTION WHEN OTHERS THEN v_ok2 := TRUE; END;
    PERFORM pg_temp.chk('4.7 رقم عقدٍ مكرَّر مرفوض', v_ok2::TEXT, 'true');
  END;
END $$;

\echo ''
\echo '═══ ★★★ ⑤ العطل ⑮: الحساب بتوقيت بغداد ═══'

DO $$
DECLARE r RECORD; v_today DATE;
BEGIN
  v_today := (now() AT TIME ZONE 'Asia/Baghdad')::DATE;

  SELECT * INTO r FROM public.contract_board(NULL,NULL,500)
   WHERE out_id = current_setting('kyvzon.t364_c2')::UUID;
  -- ينتهي بعد 20 يوماً ونافذة التنبيه 30 ⇒ expiring
  PERFORM pg_temp.chk('5.1 المتبقّي 20 يوماً', r.out_days_left::TEXT, '20');
  PERFORM pg_temp.chk('5.2 الحالة expiring', r.out_expiry_state, 'expiring');

  -- ★ العقد الدائم بلا نهاية: NULL لا صفر (درس 0353)
  SELECT * INTO r FROM public.contract_board(NULL,NULL,500)
   WHERE out_id = current_setting('kyvzon.t364_c1')::UUID;
  PERFORM pg_temp.chk('5.3 بلا نهاية: days_left = NULL', r.out_days_left::TEXT, NULL);
  PERFORM pg_temp.chk('5.4 والحالة open_ended', r.out_expiry_state, 'open_ended');

  -- ★★ الحدّ بالضبط: نافذة 30 ⇒ يوم 30 = expiring · 31 = valid
  DECLARE v_c3 UUID; v_c4 UUID;
  BEGIN
    v_c3 := public.contract_upsert(
      NULL, current_setting('kyvzon.t364_e1')::UUID, 'fixed_term',
      'CT-030',NULL, v_today - 10, v_today + 30, 30, NULL,'IQD',NULL,NULL,'draft');
    PERFORM pg_temp.chk('5.5 يوم 30 = expiring',
      (SELECT out_expiry_state FROM public.contract_board(NULL,NULL,500)
        WHERE out_id = v_c3), 'expiring');
    v_c4 := public.contract_upsert(
      NULL, current_setting('kyvzon.t364_e2')::UUID, 'fixed_term',
      'CT-031',NULL, v_today - 10, v_today + 31, 30, NULL,'IQD',NULL,NULL,'draft');
    PERFORM pg_temp.chk('5.6 يوم 31 = valid',
      (SELECT out_expiry_state FROM public.contract_board(NULL,NULL,500)
        WHERE out_id = v_c4), 'valid');
    PERFORM set_config('kyvzon.t364_c3', v_c3::TEXT, FALSE);
    PERFORM set_config('kyvzon.t364_c4', v_c4::TEXT, FALSE);
  END;
END $$;

\echo ''
\echo '═══ ★★★ ⑥ العطل ⑦: الحالة تتحرّك ═══'

DO $$
DECLARE v_c5 UUID; v_n INTEGER; v_today DATE;
BEGIN
  v_today := (now() AT TIME ZONE 'Asia/Baghdad')::DATE;

  -- ★★★ عقدٌ «نشط» انتهى منذ 400 يوم — أُدرج مباشرةً (الدالة تمنعه)
  --   نُنشئه بحالة draft ثم نُحوّله لنُحاكي البيانات القديمة.
  INSERT INTO public.employee_contracts
    (id,tenant_id,employee_id,contract_type,contract_number,
     start_date,end_date,status)
  VALUES ('c5640000-0000-0000-0000-00000000000c',
          'a3640000-0000-0000-0000-00000000000a',
          current_setting('kyvzon.t364_e2')::UUID,'fixed_term','CT-OLD',
          v_today - 800, v_today - 400,'draft')
  RETURNING id INTO v_c5;
  -- ناصر له c2 نشط ⇒ نُلغي نشاطه مؤقتاً لنُفعّل القديم
  UPDATE public.employee_contracts SET status='draft'
   WHERE id = current_setting('kyvzon.t364_c2')::UUID;
  UPDATE public.employee_contracts SET status='active' WHERE id=v_c5;

  PERFORM pg_temp.chk('6.1 عقدٌ «نشط» انتهى فعلاً',
    (SELECT count(*)::TEXT FROM public.employee_contracts
      WHERE status='active' AND end_date IS NOT NULL AND end_date < v_today), '1');
  -- ★★ والملخّص يكشف التناقض
  PERFORM pg_temp.chk('6.2 الملخّص يعدّ المتناقض',
    (SELECT out_stale::TEXT FROM public.contract_summary()), '1');

  -- ★★★ والترحيل يُصلحه
  v_n := public.contract_expire_due();
  PERFORM pg_temp.chk('6.3 رُحّل عقدٌ واحد', v_n::TEXT, '1');
  PERFORM pg_temp.chk('6.4 صار expired',
    (SELECT status FROM public.employee_contracts WHERE id=v_c5), 'expired');
  PERFORM pg_temp.chk('6.5 ولم يعد متناقضاً',
    (SELECT out_stale::TEXT FROM public.contract_summary()), '0');
  -- ★ والترحيل ثانيةً لا يفعل شيئاً
  PERFORM pg_temp.chk('6.6 الترحيل ثانيةً = 0',
    public.contract_expire_due()::TEXT, '0');

  -- استرجاع c2 نشطاً
  UPDATE public.employee_contracts SET status='active'
   WHERE id = current_setting('kyvzon.t364_c2')::UUID;
  PERFORM set_config('kyvzon.t364_c5', v_c5::TEXT, FALSE);
END $$;

\echo ''
\echo '═══ ★★★ ⑦ العطل ⑪: التجديد يحفظ السلسلة ═══'

DO $$
DECLARE v_new UUID; v_today DATE; v_m TEXT;
BEGIN
  v_today := (now() AT TIME ZONE 'Asia/Baghdad')::DATE;

  -- ★★ حرّاس التجديد أولاً
  v_m := ''; BEGIN PERFORM public.contract_renew(
    current_setting('kyvzon.t364_c2')::UUID, NULL);
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('7.1 CONTRACT_RENEW_NEEDS_END',
    (position('CONTRACT_RENEW_NEEDS_END' IN v_m) > 0)::TEXT, 'true');

  -- نهايةٌ ليست بعد القديمة (القديمة v_today + 20)
  v_m := ''; BEGIN PERFORM public.contract_renew(
    current_setting('kyvzon.t364_c2')::UUID, v_today + 10);
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('7.2 CONTRACT_RENEW_NOT_LATER',
    (position('CONTRACT_RENEW_NOT_LATER' IN v_m) > 0)::TEXT, 'true');

  -- ★★★ التجديد الصحيح
  v_new := public.contract_renew(
    current_setting('kyvzon.t364_c2')::UUID, v_today + 400, 1100000, 'CT-002-R1');
  PERFORM set_config('kyvzon.t364_c2r', v_new::TEXT, FALSE);

  -- ★★★ القديم صار renewed لا مكتوباً فوقه
  PERFORM pg_temp.chk('7.3 القديم صار renewed',
    (SELECT status FROM public.employee_contracts
      WHERE id = current_setting('kyvzon.t364_c2')::UUID), 'renewed');
  PERFORM pg_temp.chk('7.4 ونهايته القديمة محفوظة',
    (SELECT end_date::TEXT FROM public.employee_contracts
      WHERE id = current_setting('kyvzon.t364_c2')::UUID), (v_today + 20)::TEXT);
  -- ★★★ والجديد مرتبطٌ به
  PERFORM pg_temp.chk('7.5 renewed_from يشير للقديم',
    (SELECT (renewed_from = current_setting('kyvzon.t364_c2')::UUID)::TEXT
       FROM public.employee_contracts WHERE id=v_new), 'true');
  PERFORM pg_temp.chk('7.6 previous_end_date محفوظ',
    (SELECT previous_end_date::TEXT FROM public.employee_contracts
      WHERE id=v_new), (v_today + 20)::TEXT);
  PERFORM pg_temp.chk('7.7 renewal_count = 1',
    (SELECT renewal_count::TEXT FROM public.employee_contracts WHERE id=v_new), '1');
  -- ★ والبداية الجديدة = اليوم التالي للنهاية القديمة
  PERFORM pg_temp.chk('7.8 البداية = نهاية القديم + 1',
    (SELECT start_date::TEXT FROM public.employee_contracts WHERE id=v_new),
    (v_today + 21)::TEXT);
  -- ★ NUMERIC يُطبَع بمنزلتين (درس متكرّر)
  PERFORM pg_temp.chk('7.9 والراتب المُحدَّث',
    (SELECT salary_amount::TEXT FROM public.employee_contracts WHERE id=v_new),
    '1100000.00');
  -- ★★ وعقدٌ نشطٌ واحد لناصر
  PERFORM pg_temp.chk('7.10 عقدٌ نشطٌ واحد لناصر',
    (SELECT count(*)::TEXT FROM public.employee_contracts
      WHERE employee_id = current_setting('kyvzon.t364_e2')::UUID
        AND status='active'), '1');

  -- ★★★ والتجديد الثاني يرفع العدّاد
  DECLARE v_new2 UUID;
  BEGIN
    v_new2 := public.contract_renew(v_new, v_today + 800);
    PERFORM pg_temp.chk('7.11 renewal_count = 2',
      (SELECT renewal_count::TEXT FROM public.employee_contracts WHERE id=v_new2), '2');
    PERFORM pg_temp.chk('7.12 وسلسلةٌ من ثلاثة عقود',
      (SELECT count(*)::TEXT FROM public.employee_contracts
        WHERE employee_id = current_setting('kyvzon.t364_e2')::UUID
          AND contract_number LIKE 'CT-002%'), '2');
    PERFORM set_config('kyvzon.t364_c2r2', v_new2::TEXT, FALSE);
  END;
END $$;

\echo ''
\echo '═══ ★★★ ⑧ العطل ⑫: الإنهاء بسببٍ وتاريخ ═══'

DO $$
DECLARE v_m TEXT; v_today DATE;
BEGIN
  v_today := (now() AT TIME ZONE 'Asia/Baghdad')::DATE;

  v_m := ''; BEGIN PERFORM public.contract_terminate(
    current_setting('kyvzon.t364_c1')::UUID, '   ');
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('8.1 CONTRACT_TERMINATION_REASON_REQUIRED',
    (position('CONTRACT_TERMINATION_REASON_REQUIRED' IN v_m) > 0)::TEXT, 'true');

  -- ★ تاريخٌ قبل البداية
  v_m := ''; BEGIN PERFORM public.contract_terminate(
    current_setting('kyvzon.t364_c1')::UUID, 'استقالة', v_today - 500);
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('8.2 CONTRACT_TERMINATION_BEFORE_START',
    (position('CONTRACT_TERMINATION_BEFORE_START' IN v_m) > 0)::TEXT, 'true');

  -- الإنهاء الصحيح
  PERFORM public.contract_terminate(
    current_setting('kyvzon.t364_c1')::UUID, 'استقالة بطلب الموظف');
  PERFORM pg_temp.chk('8.3 الحالة terminated',
    (SELECT status FROM public.employee_contracts
      WHERE id = current_setting('kyvzon.t364_c1')::UUID), 'terminated');
  PERFORM pg_temp.chk('8.4 والسبب مسجَّل',
    (SELECT termination_reason FROM public.employee_contracts
      WHERE id = current_setting('kyvzon.t364_c1')::UUID), 'استقالة بطلب الموظف');
  PERFORM pg_temp.chk('8.5 وterminated_at امتلأ',
    (SELECT (terminated_at IS NOT NULL)::TEXT FROM public.employee_contracts
      WHERE id = current_setting('kyvzon.t364_c1')::UUID), 'true');
  -- ★★ والنهاية صارت اليوم
  PERFORM pg_temp.chk('8.6 end_date = اليوم بتوقيت بغداد',
    (SELECT end_date::TEXT FROM public.employee_contracts
      WHERE id = current_setting('kyvzon.t364_c1')::UUID), v_today::TEXT);

  -- ★★ كشف العكسُ INV04 أن ملء terminated_at في **المحفّز** لم يكن
  --   مُختبَراً: الدالة تُمرّره صراحةً. نختبر الكتابة المباشرة.
  DECLARE v_ct UUID;
  BEGIN
    v_ct := public.contract_upsert(
      NULL, current_setting('kyvzon.t364_e1')::UUID, 'permanent',
      'CT-TERM', NULL, v_today - 50, NULL, 30, NULL,'IQD',NULL,NULL,'draft');
    UPDATE public.employee_contracts
       SET status='terminated', termination_reason='إنهاءٌ مباشر'
     WHERE id = v_ct;
    PERFORM pg_temp.chk('8.9 المحفّز ملأ terminated_at',
      (SELECT (terminated_at IS NOT NULL)::TEXT FROM public.employee_contracts
        WHERE id=v_ct), 'true');
  END;

  -- ★★ ولا إنهاءَ مرّتين
  v_m := ''; BEGIN PERFORM public.contract_terminate(
    current_setting('kyvzon.t364_c1')::UUID, 'مرّة أخرى');
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('8.7 CONTRACT_ALREADY_TERMINATED',
    (position('CONTRACT_ALREADY_TERMINATED' IN v_m) > 0)::TEXT, 'true');

  -- ★★ والمنهى لا يُجدَّد
  v_m := ''; BEGIN PERFORM public.contract_renew(
    current_setting('kyvzon.t364_c1')::UUID, v_today + 100);
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('8.8 CONTRACT_NOT_RENEWABLE',
    (position('CONTRACT_NOT_RENEWABLE' IN v_m) > 0)::TEXT, 'true');
END $$;

\echo ''
\echo '═══ ★★★ ⑨ العطل ⑩: الحذف ممنوع ═══'

DO $$
DECLARE v_ok BOOLEAN; v_m TEXT;
BEGIN
  v_ok := FALSE; v_m := '';
  BEGIN DELETE FROM public.employee_contracts
         WHERE id = current_setting('kyvzon.t364_c1')::UUID;
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE;
            GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('9.1 الحذف يرمي', v_ok::TEXT, 'true');
  PERFORM pg_temp.chk('9.2 رمز CONTRACT_DELETE_BLOCKED',
    (position('CONTRACT_DELETE_BLOCKED' IN v_m) > 0)::TEXT, 'true');
  PERFORM pg_temp.chk('9.3 الصفّ باقٍ',
    (SELECT count(*)::TEXT FROM public.employee_contracts
      WHERE id = current_setting('kyvzon.t364_c1')::UUID), '1');
END $$;

\echo ''
\echo '═══ ★★ ⑩ اللوح: الأسماء والترتيب والترشيح ═══'

DO $$
DECLARE r RECORD; v_order TEXT;
BEGIN
  SELECT * INTO r FROM public.contract_board(NULL,NULL,500)
   WHERE out_id = current_setting('kyvzon.t364_c2r2')::UUID;
  -- ★ العطل ⑯: full_name_ar فارغ ⇒ الاحتياطيّ
  PERFORM pg_temp.chk('10.1 اسم الموظف من الاحتياطيّ', r.out_employee_name, 'ناصر الثاني');
  PERFORM pg_temp.chk('10.2 القسم', r.out_department, 'المالية');
  PERFORM pg_temp.chk('10.3 اسم المنشئ', r.out_creator_name, 'هدى الموارد');
  PERFORM pg_temp.chk('10.4 عدّاد التجديد', r.out_renewal_count::TEXT, '2');

  -- ★ بلا رقم عقد: «—» لا فراغ
  PERFORM pg_temp.chk('10.5 بلا رقم = «—»',
    (SELECT out_contract_number FROM public.contract_board(NULL,NULL,500)
      WHERE out_id = current_setting('kyvzon.t364_c5')::UUID), 'CT-OLD');

  -- ★★★ الترتيب: النشط أوّلاً
  SELECT string_agg(out_status,'|' ORDER BY rn) INTO v_order
    FROM (SELECT out_status, row_number() OVER () rn
            FROM public.contract_board(NULL,NULL,500)) t;
  PERFORM pg_temp.chk('10.6 النشط أوّلاً', split_part(v_order,'|',1), 'active');

  PERFORM pg_temp.chk('10.7 ترشيح active',
    (SELECT count(*)::TEXT FROM public.contract_board('active',NULL,500)), '1');
  -- ★ c1 و CT-TERM = 2
  PERFORM pg_temp.chk('10.8 ترشيح terminated',
    (SELECT count(*)::TEXT FROM public.contract_board('terminated',NULL,500)), '2');
  PERFORM pg_temp.chk('10.9 ترشيح fixed_term',
    (SELECT count(*)::TEXT FROM public.contract_board(NULL,'fixed_term',500)), '6');
  PERFORM pg_temp.chk('10.10 LIMIT = 2 يعمل',
    (SELECT count(*)::TEXT FROM public.contract_board(NULL,NULL,2)), '2');
END $$;

\echo ''
\echo '═══ ★★ ⑪ الملخّص بأرقام محسوبة يدوياً ═══'

DO $$
DECLARE r RECORD;
BEGIN
  SELECT * INTO r FROM public.contract_summary();
  -- العقود: c1 terminated · c2 renewed · c2r renewed · c2r2 active
  --         c3 draft · c4 draft · c5 expired  = 7
  PERFORM pg_temp.chk('11.1 الإجمالي',   r.out_total::TEXT,      '9');
  PERFORM pg_temp.chk('11.2 النشط',      r.out_active::TEXT,     '1');
  PERFORM pg_temp.chk('11.3 المسودة',    r.out_draft::TEXT,      '3');
  PERFORM pg_temp.chk('11.4 المنتهي',    r.out_expired::TEXT,    '1');
  PERFORM pg_temp.chk('11.5 المنهى',     r.out_terminated::TEXT, '2');
  -- c2r2 ينتهي بعد 800 يوم ونافذته 30 ⇒ ليس expiring
  PERFORM pg_temp.chk('11.6 قريب الانتهاء', r.out_expiring::TEXT, '0');
  PERFORM pg_temp.chk('11.7 المتناقض',   r.out_stale::TEXT,      '0');
  -- ★★ موظفون نشطون بلا عقدٍ نشط: سالم (c1 منهى) · منير · هدى = 3
  --   (ناصر له c2r2 نشط)
  PERFORM pg_temp.chk('11.8 بلا عقدٍ نشط', r.out_uncovered::TEXT, '3');
  -- ★ النشط الوحيد c2r2 ورّث document_url من c2 (كان NULL)
  PERFORM pg_temp.chk('11.9 نشطٌ بلا مستند', r.out_no_document::TEXT, '1');
END $$;

\echo ''
\echo '═══ ★★★ ⑫ عزل المستأجر ═══'

DO $$
DECLARE v_n INTEGER; v_m TEXT;
BEGIN
  PERFORM set_config('request.jwt.claim.sub',
    '77640007-0000-0000-0000-000000000007', TRUE);
  PERFORM public.contract_upsert(
    NULL, current_setting('kyvzon.t364_eb')::UUID, 'permanent','CT-B01');

  v_n := (SELECT count(*) FROM public.contract_board(NULL,NULL,500));
  PERFORM pg_temp.chk('12.1 باء يرى 1', v_n::TEXT, '1');
  PERFORM pg_temp.chk('12.2 ملخّص باء = 1',
    (SELECT out_total::TEXT FROM public.contract_summary()), '1');

  PERFORM set_config('request.jwt.claim.sub',
    '33640003-0000-0000-0000-000000000003', TRUE);
  v_n := (SELECT count(*) FROM public.contract_board(NULL,NULL,500));
  PERFORM pg_temp.chk('12.3 هدى ما زالت ترى 9 لا 10', v_n::TEXT, '9');
  PERFORM pg_temp.chk('12.4 عقد باء غائب',
    (SELECT count(*)::TEXT FROM public.contract_board(NULL,NULL,500)
      WHERE out_contract_number='CT-B01'), '0');
  PERFORM pg_temp.chk('12.5 والصفّ موجود فعلاً',
    (SELECT count(*)::TEXT FROM public.employee_contracts
      WHERE contract_number='CT-B01'), '1');

  -- ★★★ وهدى لا تُنهي عقد باء
  v_m := ''; BEGIN PERFORM public.contract_terminate(
    (SELECT id FROM public.employee_contracts WHERE contract_number='CT-B01'),
    'إنهاءٌ عابر');
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('12.6 CONTRACT_NOT_FOUND لعقد باء',
    (position('CONTRACT_NOT_FOUND' IN v_m) > 0)::TEXT, 'true');
  PERFORM pg_temp.chk('12.7 وحالته لم تتغيّر',
    (SELECT status FROM public.employee_contracts
      WHERE contract_number='CT-B01'), 'active');

  -- ★★★ وترحيل الحالة لا يعبر الحدود. كشف العكسُ INV10 أن هذا لم
  --   يكن مُختبَراً: لا عقدَ منتهٍ في **باء**. ننشئ واحداً.
  INSERT INTO public.employee_contracts
    (tenant_id,employee_id,contract_type,contract_number,start_date,end_date,status)
  VALUES ('b3640000-0000-0000-0000-00000000000b',
          current_setting('kyvzon.t364_eb2')::UUID,'fixed_term','CT-B-OLD',
          ((now() AT TIME ZONE 'Asia/Baghdad')::DATE - 900),
          ((now() AT TIME ZONE 'Asia/Baghdad')::DATE - 500),'draft');
  UPDATE public.employee_contracts SET status='active' WHERE contract_number='CT-B-OLD';

  PERFORM pg_temp.chk('12.8 contract_expire_due لألف = 0',
    public.contract_expire_due()::TEXT, '0');
  -- ★★★ وعقد باء المنتهي **لم يُرحَّل** رغم استحقاقه
  PERFORM pg_temp.chk('12.9 عقد باء بقي active',
    (SELECT status FROM public.employee_contracts
      WHERE contract_number='CT-B-OLD'), 'active');
  -- ★★ وباء يُرحّله بنفسه
  PERFORM set_config('request.jwt.claim.sub',
    '77640007-0000-0000-0000-000000000007', TRUE);
  PERFORM pg_temp.chk('12.10 باء يُرحّل عقده = 1',
    public.contract_expire_due()::TEXT, '1');
  PERFORM set_config('request.jwt.claim.sub',
    '33640003-0000-0000-0000-000000000003', TRUE);
END $$;

\echo ''
\echo '═══ ★★ ⑬ الموظف يرى عقوده وحدها ═══'

DO $$
DECLARE v_n INTEGER; v_m TEXT;
BEGIN
  PERFORM set_config('request.jwt.claim.sub',
    '11640001-0000-0000-0000-000000000001', TRUE);
  -- سالم له: c1 (منهى) · c3 (draft) = 2
  v_n := (SELECT count(*) FROM public.contract_board(NULL,NULL,500));
  -- سالم: c1 · c3 · CT-TERM = 3
  PERFORM pg_temp.chk('13.1 سالم يرى 3 من 9', v_n::TEXT, '3');
  PERFORM pg_temp.chk('13.2 ولا يرى عقود ناصر',
    (SELECT count(*)::TEXT FROM public.contract_board(NULL,NULL,500)
      WHERE out_employee_id = current_setting('kyvzon.t364_e2')::UUID), '0');

  -- ★★ والملخّص محجوب عنه
  v_m := ''; BEGIN PERFORM public.contract_summary();
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('13.3 الملخّص محجوب عن الموظف',
    (position('غير مصرَّح' IN v_m) > 0)::TEXT, 'true');

  -- ★★★ ولا يُنشئ عقداً ولا يُنهي ولا يُرحّل
  v_m := ''; BEGIN PERFORM public.contract_upsert(
    NULL, current_setting('kyvzon.t364_e1')::UUID, 'permanent');
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('13.4 الموظف لا يُنشئ عقداً',
    (position('CONTRACT_NOT_AUTHORIZED' IN v_m) > 0)::TEXT, 'true');

  v_m := ''; BEGIN PERFORM public.contract_expire_due();
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('13.5 ولا يُرحّل الحالات',
    (position('غير مصرَّح' IN v_m) > 0)::TEXT, 'true');

  -- ★★ والمدير ليس staff
  PERFORM set_config('request.jwt.claim.sub',
    '44640004-0000-0000-0000-000000000004', TRUE);
  v_m := ''; BEGIN PERFORM public.contract_renew(
    current_setting('kyvzon.t364_c2r2')::UUID,
    ((now() AT TIME ZONE 'Asia/Baghdad')::DATE + 900));
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('13.6 المدير لا يُجدّد (ليس staff)',
    (position('CONTRACT_NOT_AUTHORIZED' IN v_m) > 0)::TEXT, 'true');

  PERFORM set_config('request.jwt.claim.sub',
    '33640003-0000-0000-0000-000000000003', TRUE);
  PERFORM pg_temp.chk('13.7 لا صفّ تغيّر من الحرّاس',
    (SELECT count(*)::TEXT FROM public.employee_contracts
      WHERE tenant_id='a3640000-0000-0000-0000-00000000000a'), '9');
END $$;

\echo ''
\echo '════════════ كل تأكيدات 0364 نجحت ════════════'
ROLLBACK;
