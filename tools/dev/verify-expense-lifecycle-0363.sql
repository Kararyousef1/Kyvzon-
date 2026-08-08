-- ════════════════════════════════════════════════════════════════════════
--  التحقق السلوكيّ من 0363 — دورة حياة النفقات
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
 ('a3630000-0000-0000-0000-00000000000a','T363A','شركة ألف','t363a'),
 ('b3630000-0000-0000-0000-00000000000b','T363B','شركة باء','t363b');

INSERT INTO auth.users(id,email) VALUES
 ('11630001-0000-0000-0000-000000000001','salem@t363a'),
 ('22630002-0000-0000-0000-000000000002','nasser@t363a'),
 ('33630003-0000-0000-0000-000000000003','huda@t363a'),
 ('44630004-0000-0000-0000-000000000004','munir@t363a'),
 ('66630006-0000-0000-0000-000000000006','emp@t363b'),
 ('77630007-0000-0000-0000-000000000007','hr@t363b');

-- ★ المدير أولاً ثم القسم (درس 0357)
INSERT INTO public.profiles (id,tenant_id,full_name,role,department) VALUES
 ('44630004-0000-0000-0000-000000000004','a3630000-0000-0000-0000-00000000000a','منير المدير','manager','المالية');
INSERT INTO public.departments (id,tenant_id,name_ar,manager_id) VALUES
 ('d3630000-0000-0000-0000-00000000000d','a3630000-0000-0000-0000-00000000000a','المالية',
  '44630004-0000-0000-0000-000000000004');
INSERT INTO public.profiles (id,tenant_id,full_name,role,department) VALUES
 ('11630001-0000-0000-0000-000000000001','a3630000-0000-0000-0000-00000000000a','سالم الأول','employee','المالية'),
 ('22630002-0000-0000-0000-000000000002','a3630000-0000-0000-0000-00000000000a','ناصر الثاني','employee','المالية'),
 ('33630003-0000-0000-0000-000000000003','a3630000-0000-0000-0000-00000000000a','هدى الموارد','hr','الموارد'),
 ('66630006-0000-0000-0000-000000000006','b3630000-0000-0000-0000-00000000000b','أجنبي باء','employee','المالية'),
 ('77630007-0000-0000-0000-000000000007','b3630000-0000-0000-0000-00000000000b','مورد باء','hr','الموارد');

SELECT set_config('kyvzon.t363_e1',
  (SELECT e.id::TEXT FROM public.employees e WHERE e.user_id='11630001-0000-0000-0000-000000000001'), FALSE),
       set_config('kyvzon.t363_e2',
  (SELECT e.id::TEXT FROM public.employees e WHERE e.user_id='22630002-0000-0000-0000-000000000002'), FALSE),
       set_config('kyvzon.t363_eb',
  (SELECT e.id::TEXT FROM public.employees e WHERE e.user_id='66630006-0000-0000-0000-000000000006'), FALSE);

SET LOCAL request.jwt.claim.sub = '33630003-0000-0000-0000-000000000003';

\echo ''
\echo '═══ ① بنية الجدول والقيود ═══'

DO $$
BEGIN
  PERFORM pg_temp.chk('1.1 tenant_id صار NOT NULL',
    (SELECT is_nullable FROM information_schema.columns
      WHERE table_name='expense_requests' AND column_name='tenant_id'), 'NO');
  PERFORM pg_temp.chk('1.2 FK مركَّب (employee_id,tenant_id)',
    (SELECT count(*)::TEXT FROM pg_constraint
      WHERE conname='expense_requests_employee_tenant_fkey' AND contype='f'), '1');
  PERFORM pg_temp.chk('1.3 ON DELETE RESTRICT لا CASCADE',
    (SELECT (pg_get_constraintdef(oid) LIKE '%ON DELETE RESTRICT%')::TEXT
       FROM pg_constraint WHERE conname='expense_requests_employee_tenant_fkey'), 'true');
  PERFORM pg_temp.chk('1.4 قيد المبلغ الموجب',
    (SELECT count(*)::TEXT FROM pg_constraint
      WHERE conname='expense_requests_amount_chk'), '1');
  PERFORM pg_temp.chk('1.5 قيد الفئة',
    (SELECT count(*)::TEXT FROM pg_constraint
      WHERE conname='expense_requests_category_chk'), '1');
  PERFORM pg_temp.chk('1.6 قيد سبب الرفض',
    (SELECT count(*)::TEXT FROM pg_constraint
      WHERE conname='expense_requests_rejection_chk'), '1');
  PERFORM pg_temp.chk('1.7 قيد المعتمِد/الوقت',
    (SELECT count(*)::TEXT FROM pg_constraint
      WHERE conname='expense_requests_approved_chk'), '1');
  PERFORM pg_temp.chk('1.8 قيد وقت الدفع',
    (SELECT count(*)::TEXT FROM pg_constraint
      WHERE conname='expense_requests_paid_chk'), '1');
  PERFORM pg_temp.chk('1.9 محفّز منع الحذف',
    (SELECT count(*)::TEXT FROM pg_trigger
      WHERE tgname='trg_block_expense_delete'), '1');
  -- ★★★ hybrid_gate يبقى RESTRICTIVE (درس 0355)
  PERFORM pg_temp.chk('1.10 hybrid_gate RESTRICTIVE',
    (SELECT (NOT polpermissive)::TEXT FROM pg_policy
      WHERE polname='hybrid_gate_expense_requests'), 'true');
  -- ★ والحارس القديم ما زال قائماً (لم نُسقطه)
  PERFORM pg_temp.chk('1.11 trg_guard_status_bypass باقٍ',
    (SELECT count(*)::TEXT FROM pg_trigger
      WHERE tgrelid='public.expense_requests'::regclass
        AND tgname='trg_guard_status_bypass'), '1');
END $$;

\echo ''
\echo '═══ ★★★ ② العطل ⑰: الموظف يُقدّم نفقته بنفسه ═══'

DO $$
DECLARE v_x1 UUID; v_x2 UUID; v_x3 UUID;
BEGIN
  -- ★★★ سياسة INSERT تشترط staff — والدالة SECURITY DEFINER تتجاوزها
  PERFORM set_config('request.jwt.claim.sub',
    '11630001-0000-0000-0000-000000000001', TRUE);
  v_x1 := public.expense_submit('سفر بغداد','مهمة رسمية',500000,'travel',
    ((now() AT TIME ZONE 'Asia/Baghdad')::DATE - 3),'http://x/r1.pdf');
  PERFORM set_config('kyvzon.t363_x1', v_x1::TEXT, FALSE);

  PERFORM pg_temp.chk('2.1 الموظف أنشأ نفقته',
    (SELECT count(*)::TEXT FROM public.expense_requests WHERE id=v_x1), '1');
  PERFORM pg_temp.chk('2.2 وهي منسوبة إليه',
    (SELECT (employee_id = current_setting('kyvzon.t363_e1')::UUID)::TEXT
       FROM public.expense_requests WHERE id=v_x1), 'true');
  PERFORM pg_temp.chk('2.3 والحالة pending',
    (SELECT status FROM public.expense_requests WHERE id=v_x1), 'pending');

  -- ★★ ولا يُقدّم باسم غيره
  DECLARE v_m TEXT := '';
  BEGIN
    BEGIN PERFORM public.expense_submit('باسم ناصر','وصف',1000,'general',NULL,NULL,
      current_setting('kyvzon.t363_e2')::UUID);
    EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
    PERFORM pg_temp.chk('2.4 لا يُقدّم باسم غيره',
      (position('EXPENSE_NOT_AUTHORIZED' IN v_m) > 0)::TEXT, 'true');
  END;

  -- ★ و staff يُقدّم نيابةً
  PERFORM set_config('request.jwt.claim.sub',
    '33630003-0000-0000-0000-000000000003', TRUE);
  v_x2 := public.expense_submit('وجبات','ضيافة',75000,'meals',NULL,NULL,
    current_setting('kyvzon.t363_e2')::UUID);
  v_x3 := public.expense_submit('قرطاسية','مكتب',30000,'supplies',NULL,NULL,
    current_setting('kyvzon.t363_e1')::UUID);
  PERFORM set_config('kyvzon.t363_x2', v_x2::TEXT, FALSE);
  PERFORM set_config('kyvzon.t363_x3', v_x3::TEXT, FALSE);
  PERFORM pg_temp.chk('2.5 staff يُقدّم نيابةً',
    (SELECT (employee_id = current_setting('kyvzon.t363_e2')::UUID)::TEXT
       FROM public.expense_requests WHERE id=v_x2), 'true');
  PERFORM pg_temp.chk('2.6 ثلاث نفقات في ألف',
    (SELECT count(*)::TEXT FROM public.expense_requests
      WHERE tenant_id='a3630000-0000-0000-0000-00000000000a'), '3');
END $$;

\echo ''
\echo '═══ ★★ ③ حرّاس التقديم ═══'

DO $$
DECLARE v_m TEXT; v_before INTEGER;
BEGIN
  v_before := (SELECT count(*) FROM public.expense_requests);

  v_m := ''; BEGIN PERFORM public.expense_submit('  ','وصف',1000,'general',NULL,NULL,
    current_setting('kyvzon.t363_e1')::UUID);
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('3.1 EXPENSE_TITLE_REQUIRED',
    (position('EXPENSE_TITLE_REQUIRED' IN v_m) > 0)::TEXT, 'true');

  v_m := ''; BEGIN PERFORM public.expense_submit('عنوان','  ',1000,'general',NULL,NULL,
    current_setting('kyvzon.t363_e1')::UUID);
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('3.2 EXPENSE_DESCRIPTION_REQUIRED',
    (position('EXPENSE_DESCRIPTION_REQUIRED' IN v_m) > 0)::TEXT, 'true');

  -- ★ العطل ⑤: مبلغٌ صفر وسالب
  v_m := ''; BEGIN PERFORM public.expense_submit('ع','و',0,'general',NULL,NULL,
    current_setting('kyvzon.t363_e1')::UUID);
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('3.3 EXPENSE_AMOUNT_INVALID (صفر)',
    (position('EXPENSE_AMOUNT_INVALID' IN v_m) > 0)::TEXT, 'true');

  v_m := ''; BEGIN PERFORM public.expense_submit('ع','و',-50000,'general',NULL,NULL,
    current_setting('kyvzon.t363_e1')::UUID);
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('3.4 EXPENSE_AMOUNT_INVALID (سالب)',
    (position('EXPENSE_AMOUNT_INVALID' IN v_m) > 0)::TEXT, 'true');

  -- ★ العطل ⑦: فئةٌ مختلقة
  v_m := ''; BEGIN PERFORM public.expense_submit('ع','و',1000,'ThIsIsGaRbAgE',NULL,NULL,
    current_setting('kyvzon.t363_e1')::UUID);
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('3.5 EXPENSE_CATEGORY_INVALID',
    (position('EXPENSE_CATEGORY_INVALID' IN v_m) > 0)::TEXT, 'true');

  -- ★ العطل ⑥: تاريخٌ في المستقبل (غداً بتوقيت بغداد)
  v_m := ''; BEGIN PERFORM public.expense_submit('ع','و',1000,'general',
    ((now() AT TIME ZONE 'Asia/Baghdad')::DATE + 1),NULL,
    current_setting('kyvzon.t363_e1')::UUID);
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('3.6 EXPENSE_DATE_IN_FUTURE',
    (position('EXPENSE_DATE_IN_FUTURE' IN v_m) > 0)::TEXT, 'true');

  -- ★★★ العطل ④: موظفٌ من مستأجرٍ آخر
  v_m := ''; BEGIN PERFORM public.expense_submit('ع','و',1000,'general',NULL,NULL,
    current_setting('kyvzon.t363_eb')::UUID);
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('3.7 EXPENSE_EMPLOYEE_NOT_FOUND',
    (position('EXPENSE_EMPLOYEE_NOT_FOUND' IN v_m) > 0)::TEXT, 'true');
  -- ★★ والرمز رمزُ الحارس لا رسالةُ FK (درس 0361/INV13)
  PERFORM pg_temp.chk('3.8 الحارس سبق FK',
    (position('employee_tenant_fkey' IN v_m) > 0)::TEXT, 'false');

  PERFORM pg_temp.chk('3.9 لا صفّ دخل مع الحرّاس السبعة',
    (SELECT count(*)::TEXT FROM public.expense_requests), v_before::TEXT);
END $$;

\echo ''
\echo '═══ ★★ ④ القيود تحرس الكتابة المباشرة ═══'

DO $$
DECLARE v_ok BOOLEAN;
BEGIN
  v_ok := FALSE;
  BEGIN INSERT INTO public.expense_requests
          (tenant_id,employee_id,title,description,amount)
        VALUES ('a3630000-0000-0000-0000-00000000000a',
                'ffffffff-ffff-ffff-ffff-ffffffffffff','ع','و',1000);
  EXCEPTION WHEN foreign_key_violation THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('4.1 FK يرفض موظفاً معدوماً', v_ok::TEXT, 'true');

  -- ★★★ موظفٌ موجود لكن في مستأجرٍ آخر
  v_ok := FALSE;
  BEGIN INSERT INTO public.expense_requests
          (tenant_id,employee_id,title,description,amount)
        VALUES ('a3630000-0000-0000-0000-00000000000a',
                current_setting('kyvzon.t363_eb')::UUID,'ع','و',1000);
  EXCEPTION WHEN foreign_key_violation THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('4.2 FK المركَّب يرفض موظف مستأجر آخر', v_ok::TEXT, 'true');

  v_ok := FALSE;
  BEGIN INSERT INTO public.expense_requests
          (tenant_id,employee_id,title,description,amount)
        VALUES ('a3630000-0000-0000-0000-00000000000a',
                current_setting('kyvzon.t363_e1')::UUID,'ع','و',-5);
  EXCEPTION WHEN check_violation THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('4.3 CHECK يرفض مبلغاً سالباً', v_ok::TEXT, 'true');

  v_ok := FALSE;
  BEGIN INSERT INTO public.expense_requests
          (tenant_id,employee_id,title,description,amount,category)
        VALUES ('a3630000-0000-0000-0000-00000000000a',
                current_setting('kyvzon.t363_e1')::UUID,'ع','و',100,'مخترعة');
  EXCEPTION WHEN check_violation THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('4.4 CHECK يرفض فئةً مختلقة', v_ok::TEXT, 'true');

  -- ★★★ العطل ⑧: الرفض بلا سبب مستحيل بنيوياً
  v_ok := FALSE;
  BEGIN UPDATE public.expense_requests SET status='rejected'
         WHERE id = current_setting('kyvzon.t363_x3')::UUID;
  EXCEPTION WHEN check_violation THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('4.5 CHECK يرفض رفضاً بلا سبب', v_ok::TEXT, 'true');

  -- ★★★ العطل ⑩: المدفوع بلا وقتٍ مستحيل (نُعطّل المحفّز لنُثبت القيد)
  ALTER TABLE public.expense_requests DISABLE TRIGGER trg_expense_stamp;
  v_ok := FALSE;
  BEGIN UPDATE public.expense_requests
           SET status='paid', approved_by='33630003-0000-0000-0000-000000000003',
               approved_at=now()
         WHERE id = current_setting('kyvzon.t363_x3')::UUID;
  EXCEPTION WHEN check_violation THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('4.6 CHECK يرفض مدفوعاً بلا paid_at', v_ok::TEXT, 'true');

  -- ★★★ العطل ⑨: المعتمَد بلا معتمِد مستحيل
  v_ok := FALSE;
  BEGIN UPDATE public.expense_requests SET status='approved'
         WHERE id = current_setting('kyvzon.t363_x3')::UUID;
  EXCEPTION WHEN check_violation THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('4.7 CHECK يرفض معتمَداً بلا معتمِد', v_ok::TEXT, 'true');
  ALTER TABLE public.expense_requests ENABLE TRIGGER trg_expense_stamp;

  PERFORM pg_temp.chk('4.8 الحالة لم تتغيّر',
    (SELECT status FROM public.expense_requests
      WHERE id = current_setting('kyvzon.t363_x3')::UUID), 'pending');

  -- ★★ كشف العكسُ DDL07 أن قيد العنوان/الوصف لم يكن مُختبَراً:
  --   اختبرتُ EXPENSE_TITLE_REQUIRED في الدالة ونسيتُ القيد نفسه.
  v_ok := FALSE;
  BEGIN INSERT INTO public.expense_requests
          (tenant_id,employee_id,title,description,amount)
        VALUES ('a3630000-0000-0000-0000-00000000000a',
                current_setting('kyvzon.t363_e1')::UUID,'   ','وصف',100);
  EXCEPTION WHEN check_violation THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('4.9 CHECK يرفض عنواناً فارغاً', v_ok::TEXT, 'true');

  v_ok := FALSE;
  BEGIN INSERT INTO public.expense_requests
          (tenant_id,employee_id,title,description,amount)
        VALUES ('a3630000-0000-0000-0000-00000000000a',
                current_setting('kyvzon.t363_e1')::UUID,'عنوان','  ',100);
  EXCEPTION WHEN check_violation THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('4.10 CHECK يرفض وصفاً فارغاً', v_ok::TEXT, 'true');

  -- ★★ وكشف INV03 أن التجميد لم يكن مُختبَراً
  UPDATE public.expense_requests
     SET employee_id = current_setting('kyvzon.t363_e2')::UUID
   WHERE id = current_setting('kyvzon.t363_x3')::UUID;
  PERFORM pg_temp.chk('4.11 employee_id مُجمَّد بعد الإنشاء',
    (SELECT (employee_id = current_setting('kyvzon.t363_e1')::UUID)::TEXT
       FROM public.expense_requests
      WHERE id = current_setting('kyvzon.t363_x3')::UUID), 'true');

  -- ★★ وكشف INV04 أن حارس التاريخ في المحفّز لم يكن مُختبَراً.
  --   الدالة تمنع المستقبل — لكن الإدراج المباشر يمرّ منها.
  DECLARE v_fut UUID;
  BEGIN
    INSERT INTO public.expense_requests
      (tenant_id,employee_id,title,description,amount,expense_date)
    VALUES ('a3630000-0000-0000-0000-00000000000a',
            current_setting('kyvzon.t363_e1')::UUID,'تاريخ مستقبليّ','و',5000,
            ((now() AT TIME ZONE 'Asia/Baghdad')::DATE + 400))
    RETURNING id INTO v_fut;
    PERFORM pg_temp.chk('4.12 المحفّز يُثبّت التاريخ على اليوم',
      (SELECT expense_date::TEXT FROM public.expense_requests WHERE id=v_fut),
      ((now() AT TIME ZONE 'Asia/Baghdad')::DATE)::TEXT);
    -- تنظيف: الحذف ممنوع ⇒ نُعطّل المحفّز مؤقتاً
    ALTER TABLE public.expense_requests DISABLE TRIGGER trg_block_expense_delete;
    DELETE FROM public.expense_requests WHERE id=v_fut;
    ALTER TABLE public.expense_requests ENABLE TRIGGER trg_block_expense_delete;
  END;
END $$;

\echo ''
\echo '═══ ★★★ ⑤ العطل ⑨: المحفّز يملأ المعتمِد والوقت ═══'

DO $$
BEGIN
  PERFORM public.expense_decide(current_setting('kyvzon.t363_x1')::UUID,'approved');
  PERFORM pg_temp.chk('5.1 الحالة approved',
    (SELECT status FROM public.expense_requests
      WHERE id = current_setting('kyvzon.t363_x1')::UUID), 'approved');
  -- ★★★ كان UPDATE المباشر يترك العمودين فارغين
  PERFORM pg_temp.chk('5.2 approved_by = هدى',
    (SELECT approved_by::TEXT FROM public.expense_requests
      WHERE id = current_setting('kyvzon.t363_x1')::UUID),
    '33630003-0000-0000-0000-000000000003');
  PERFORM pg_temp.chk('5.3 approved_at غير فارغ',
    (SELECT (approved_at IS NOT NULL)::TEXT FROM public.expense_requests
      WHERE id = current_setting('kyvzon.t363_x1')::UUID), 'true');
  PERFORM pg_temp.chk('5.4 وpaid_at ما زال فارغاً',
    (SELECT (paid_at IS NULL)::TEXT FROM public.expense_requests
      WHERE id = current_setting('kyvzon.t363_x1')::UUID), 'true');
END $$;

\echo ''
\echo '═══ ★★★ ⑥ العطل ⑩: الصرف الذي لم يكن موجوداً ═══'

DO $$
DECLARE v_m TEXT;
BEGIN
  -- ★★ لا صرفَ لغير المعتمَد
  v_m := ''; BEGIN PERFORM public.expense_mark_paid(
    current_setting('kyvzon.t363_x2')::UUID);
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('6.1 EXPENSE_NOT_APPROVED للمعلَّق',
    (position('EXPENSE_NOT_APPROVED' IN v_m) > 0)::TEXT, 'true');

  PERFORM public.expense_mark_paid(current_setting('kyvzon.t363_x1')::UUID);
  PERFORM pg_temp.chk('6.2 الحالة paid',
    (SELECT status FROM public.expense_requests
      WHERE id = current_setting('kyvzon.t363_x1')::UUID), 'paid');
  PERFORM pg_temp.chk('6.3 paid_at امتلأ',
    (SELECT (paid_at IS NOT NULL)::TEXT FROM public.expense_requests
      WHERE id = current_setting('kyvzon.t363_x1')::UUID), 'true');
  -- ★ والمعتمِد لم يتغيّر
  PERFORM pg_temp.chk('6.4 approved_by محفوظ',
    (SELECT approved_by::TEXT FROM public.expense_requests
      WHERE id = current_setting('kyvzon.t363_x1')::UUID),
    '33630003-0000-0000-0000-000000000003');

  -- ★★ والمدفوع لا يُنقَض
  v_m := ''; BEGIN PERFORM public.expense_decide(
    current_setting('kyvzon.t363_x1')::UUID,'rejected','تراجع');
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('6.5 EXPENSE_ALREADY_PAID',
    (position('EXPENSE_ALREADY_PAID' IN v_m) > 0)::TEXT, 'true');
  -- ★ ولا صرفَ مرّتين
  v_m := ''; BEGIN PERFORM public.expense_mark_paid(
    current_setting('kyvzon.t363_x1')::UUID);
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('6.6 لا صرفَ مرّتين',
    (position('EXPENSE_NOT_APPROVED' IN v_m) > 0)::TEXT, 'true');
END $$;

\echo ''
\echo '═══ ★★ ⑦ حرّاس القرار ═══'

DO $$
DECLARE v_m TEXT;
BEGIN
  v_m := ''; BEGIN PERFORM public.expense_decide(
    current_setting('kyvzon.t363_x2')::UUID,'مخترع');
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('7.1 EXPENSE_DECISION_INVALID',
    (position('EXPENSE_DECISION_INVALID' IN v_m) > 0)::TEXT, 'true');

  -- ★★★ العطل ⑧: الرفض يحتاج سبباً
  v_m := ''; BEGIN PERFORM public.expense_decide(
    current_setting('kyvzon.t363_x2')::UUID,'rejected');
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('7.2 EXPENSE_REJECTION_REASON_REQUIRED',
    (position('EXPENSE_REJECTION_REASON_REQUIRED' IN v_m) > 0)::TEXT, 'true');

  v_m := ''; BEGIN PERFORM public.expense_decide(
    current_setting('kyvzon.t363_x2')::UUID,'rejected','   ');
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('7.3 وسببٌ من فراغات مرفوض',
    (position('EXPENSE_REJECTION_REASON_REQUIRED' IN v_m) > 0)::TEXT, 'true');

  -- الرفض الصحيح
  PERFORM public.expense_decide(
    current_setting('kyvzon.t363_x2')::UUID,'rejected','المبلغ مرتفع');
  PERFORM pg_temp.chk('7.4 الرفض نجح',
    (SELECT status FROM public.expense_requests
      WHERE id = current_setting('kyvzon.t363_x2')::UUID), 'rejected');
  PERFORM pg_temp.chk('7.5 والسبب مسجَّل',
    (SELECT rejection_reason FROM public.expense_requests
      WHERE id = current_setting('kyvzon.t363_x2')::UUID), 'المبلغ مرتفع');

  -- ★★ والمرفوض لا يُعاد بتّه
  v_m := ''; BEGIN PERFORM public.expense_decide(
    current_setting('kyvzon.t363_x2')::UUID,'approved');
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('7.6 EXPENSE_NOT_PENDING',
    (position('EXPENSE_NOT_PENDING' IN v_m) > 0)::TEXT, 'true');
END $$;

\echo ''
\echo '═══ ★★★ ⑧ العطل ①: كشف الطلب المجمَّد ═══'

DO $$
DECLARE r RECORD; v_m TEXT;
BEGIN
  -- ★★★ x3 معلَّق بلا سلسلة اعتماد إطلاقاً
  SELECT * INTO r FROM public.expense_chain_state(
    current_setting('kyvzon.t363_x3')::UUID);
  PERFORM pg_temp.chk('8.1 بلا طلب اعتماد', r.out_has_request::TEXT, 'false');
  PERFORM pg_temp.chk('8.2 وغير مجمَّد', r.out_is_stalled::TEXT, 'false');

  -- ★★★ ننشئ طلب اعتماد لموظفٍ **له قسمٌ بمدير**.
  --
  -- ★ تصحيحٌ لفرضيتي: ظننتُ الطلب سيُنشأ بصفر خطوة لأن المستأجر بلا
  --   `approval_rules`. **خطأ**: `create_financial_request_approval`
  --   فيها **مسارٌ احتياطيّ (ب)** يبني السلسلة من
  --   `resolve_department_chain` (مشرف · مدير · مدير مباشر) حين تُعيد
  --   `resolve_approval_chain` صفر مستوى. فالدالة **سليمة** وسالم له
  --   قسمٌ مديره منير ⇒ خطوةٌ واحدة نشطة.
  PERFORM public.create_financial_request_approval(
    'expense', current_setting('kyvzon.t363_x3')::UUID,
    current_setting('kyvzon.t363_e1')::UUID, 30000);

  SELECT * INTO r FROM public.expense_chain_state(
    current_setting('kyvzon.t363_x3')::UUID);
  PERFORM pg_temp.chk('8.3 صار له طلب اعتماد', r.out_has_request::TEXT, 'true');
  -- ★★ المسار الاحتياطيّ بنى خطوةً من مدير القسم (منير)
  PERFORM pg_temp.chk('8.4 خطوةٌ واحدة من مدير القسم', r.out_total_steps::TEXT, '1');
  PERFORM pg_temp.chk('8.5 وهي مفتوحة', r.out_open_steps::TEXT, '1');
  PERFORM pg_temp.chk('8.6 وغير مجمَّد (له خطوة)', r.out_is_stalled::TEXT, 'false');
END $$;

\echo ''
\echo '═══ ★★★ ⑧ب العطل ① الحقيقيّ: موظفٌ بلا قسم ⇒ صفر خطوة ═══'

DO $$
DECLARE r RECORD; v_x5 UUID; v_m TEXT;
BEGIN
  -- ★★★ **هنا** يقع العطل: `resolve_approval_chain` تُعيد صفراً
  --   (لا approval_rules) **والمسار الاحتياطيّ يفشل كذلك** لأن
  --   `resolve_department_chain(NULL)` بلا أحد. النتيجة: طلبٌ pending
  --   بصفر خطوة = **مجمَّدٌ إلى الأبد** — لا يظهر في أيّ صندوق موافقات
  --   ولا يحرسه `APPROVAL_CHAIN_BYPASS` (يعدّ الخطوات لا الطلبات).
  UPDATE public.employees SET department_id = NULL
   WHERE id = current_setting('kyvzon.t363_e2')::UUID;

  v_x5 := public.expense_submit('نفقة يتيمة','بلا قسم',44000,'general',NULL,NULL,
    current_setting('kyvzon.t363_e2')::UUID);
  PERFORM set_config('kyvzon.t363_x5', v_x5::TEXT, FALSE);

  PERFORM public.create_financial_request_approval(
    'expense', v_x5, current_setting('kyvzon.t363_e2')::UUID, 44000);

  SELECT * INTO r FROM public.expense_chain_state(v_x5);
  PERFORM pg_temp.chk('8b.1 له طلب اعتماد', r.out_has_request::TEXT, 'true');
  -- ★★★ صفر خطوة — لا من القواعد ولا من القسم
  PERFORM pg_temp.chk('8b.2 ★ صفر خطوة', r.out_total_steps::TEXT, '0');
  PERFORM pg_temp.chk('8b.3 وصفر مفتوحة', r.out_open_steps::TEXT, '0');
  PERFORM pg_temp.chk('8b.4 ★★★ مجمَّدٌ إلى الأبد', r.out_is_stalled::TEXT, 'true');

  -- ★★ واللوح يكشفه
  PERFORM pg_temp.chk('8b.5 اللوح يكشف التجمّد',
    (SELECT out_is_stalled::TEXT FROM public.expense_board(NULL,NULL,500)
      WHERE out_id = v_x5), 'true');
  -- ★★ والملخّص يعدّه
  PERFORM pg_temp.chk('8b.6 الملخّص يعدّ المجمَّد',
    (SELECT out_stalled::TEXT FROM public.expense_summary()), '1');
  -- ★★★ والطلب غائبٌ عن كل صندوق موافقات
  PERFORM set_config('request.jwt.claim.sub',
    '44630004-0000-0000-0000-000000000004', TRUE);
  -- ★ صندوق المدير فيه x3 (خطوته النشطة) — المطلوب أن **المجمَّد**
  --   وحده غائب، لا أن الصندوق فارغ.
  PERFORM pg_temp.chk('8b.7 المجمَّد غائبٌ عن صندوق المدير',
    (SELECT count(*)::TEXT FROM public.my_approval_inbox() i
      WHERE i::TEXT LIKE '%' || v_x5::TEXT || '%'), '0');
  PERFORM pg_temp.chk('8b.7b بينما x3 حاضرٌ فيه',
    (SELECT (count(*) > 0)::TEXT FROM public.my_approval_inbox()), 'true');
  PERFORM set_config('request.jwt.claim.sub',
    '33630003-0000-0000-0000-000000000003', TRUE);

  -- ★★★ والحارس القديم **صامت**: يعدّ الخطوات وهي صفر
  v_m := ''; BEGIN
    UPDATE public.expense_requests SET status='cancelled' WHERE id = v_x5;
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('8b.8 APPROVAL_CHAIN_BYPASS صامت مع صفر خطوة',
    (position('APPROVAL_CHAIN_BYPASS' IN v_m) > 0)::TEXT, 'false');
  -- استرجاع
  UPDATE public.expense_requests SET status='pending' WHERE id = v_x5;
  UPDATE public.employees SET department_id = 'd3630000-0000-0000-0000-00000000000d'
   WHERE id = current_setting('kyvzon.t363_e2')::UUID;
END $$;

\echo ''
\echo '═══ ★★★ ⑨ سلسلةٌ مفتوحة فعلاً تمنع القرار المباشر ═══'

DO $$
DECLARE v_x4 UUID; v_req UUID; v_m TEXT;
BEGIN
  v_x4 := public.expense_submit('نفقة بسلسلة','وصف',900000,'travel',NULL,NULL,
    current_setting('kyvzon.t363_e1')::UUID);
  PERFORM set_config('kyvzon.t363_x4', v_x4::TEXT, FALSE);

  -- ★★ نُنشئ طلباً وخطوةً **مفتوحة** يدوياً (المستأجر بلا قواعد)
  INSERT INTO public.hr_approval_requests
    (id,tenant_id,request_type,related_id,employee_id,amount)
  VALUES ('c3630000-0000-0000-0000-00000000000c',
          'a3630000-0000-0000-0000-00000000000a','expense',v_x4,
          current_setting('kyvzon.t363_e1')::UUID,900000)
  RETURNING id INTO v_req;
  -- ★ العمود `approver_role` لا `required_role` (خطأٌ منّي — مُحقَّق
  --   من نصّ create_financial_request_approval)
  INSERT INTO public.hr_approval_steps
    (request_id,tenant_id,step_order,approver_role,approver_id,status)
  VALUES (v_req,'a3630000-0000-0000-0000-00000000000a',1,'manager',
          '44630004-0000-0000-0000-000000000004','active');

  PERFORM pg_temp.chk('9.1 خطوةٌ مفتوحة واحدة',
    (SELECT out_open_steps::TEXT FROM public.expense_chain_state(v_x4)), '1');
  PERFORM pg_temp.chk('9.2 وغير مجمَّد (له خطوة)',
    (SELECT out_is_stalled::TEXT FROM public.expense_chain_state(v_x4)), 'false');

  -- ★★★ القرار المباشر ممنوع الآن
  v_m := ''; BEGIN PERFORM public.expense_decide(v_x4,'approved');
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('9.3 EXPENSE_CHAIN_OPEN',
    (position('EXPENSE_CHAIN_OPEN' IN v_m) > 0)::TEXT, 'true');
  PERFORM pg_temp.chk('9.4 والحالة لم تتغيّر',
    (SELECT status FROM public.expense_requests WHERE id=v_x4), 'pending');

  -- ★★★ والحارس القديم يمسك UPDATE المباشر كذلك
  v_m := ''; BEGIN UPDATE public.expense_requests SET status='approved',
    approved_by='33630003-0000-0000-0000-000000000003', approved_at=now()
    WHERE id=v_x4;
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('9.5 APPROVAL_CHAIN_BYPASS يعمل مع خطوة',
    (position('APPROVAL_CHAIN_BYPASS' IN v_m) > 0)::TEXT, 'true');
END $$;

\echo ''
\echo '═══ ★★★ ⑨ب العطل ⑲: سبب الرفض لا يضيع عبر صندوق الموافقات ═══'

DO $$
DECLARE v_x6 UUID; v_req UUID;
BEGIN
  -- ★★★ كشف هذا العطلَ **قيدي نفسه** أثناء الفحص الشامل:
  --   verify-financial-approvals-0325 سقط بـ
  --     «violates check constraint expense_requests_rejection_chk»
  --   لأن `sync_hr_source_status` توقيعُها بلا سبب فتكتب
  --   `status='rejected'` وتترك `rejection_reason` فارغاً.
  v_x6 := public.expense_submit('رفضٌ عبر الصندوق','وصف',120000,'travel',NULL,NULL,
    current_setting('kyvzon.t363_e1')::UUID);

  INSERT INTO public.hr_approval_requests
    (id,tenant_id,request_type,related_id,employee_id,amount)
  VALUES ('c6630000-0000-0000-0000-00000000000c',
          'a3630000-0000-0000-0000-00000000000a','expense',v_x6,
          current_setting('kyvzon.t363_e1')::UUID,120000)
  RETURNING id INTO v_req;
  INSERT INTO public.hr_approval_steps
    (request_id,tenant_id,step_order,approver_role,approver_id,status,comments,decided_at)
  VALUES (v_req,'a3630000-0000-0000-0000-00000000000a',1,'manager',
          '44630004-0000-0000-0000-000000000004','rejected','المبلغ يفوق السقف',now());

  -- ★ الدالة تستخرج التعليق
  PERFORM pg_temp.chk('9b.1 السبب يُستخرج من الخطوة',
    public.expense_apply_rejection_reason(v_req), 'المبلغ يفوق السقف');

  -- ★★★ والمحفّز يملؤه حين تكتب المزامنة بلا سبب
  UPDATE public.expense_requests SET status='rejected' WHERE id=v_x6;
  PERFORM pg_temp.chk('9b.2 الحالة rejected',
    (SELECT status FROM public.expense_requests WHERE id=v_x6), 'rejected');
  PERFORM pg_temp.chk('9b.3 ★ والسبب لم يضع',
    (SELECT rejection_reason FROM public.expense_requests WHERE id=v_x6),
    'المبلغ يفوق السقف');

  -- ★★★ خطوتان رافضتان ⇒ الأحدث تفوز. كشف العكسُ INV40 أن الترتيب
  --   الحتميّ لم يكن مُختبَراً: لا خطوتَين في العيّنة (درس التغطية).
  INSERT INTO public.hr_approval_steps
    (request_id,tenant_id,step_order,approver_role,approver_id,status,comments,decided_at)
  VALUES (v_req,'a3630000-0000-0000-0000-00000000000a',2,'manager',
          '33630003-0000-0000-0000-000000000003','rejected','سببٌ أحدث',
          now() + INTERVAL '1 hour');
  -- ★★★ الخطوة الأحدث أُدرجت **ثانيةً** فيراها Seq Scan أخيراً:
  --   `LIMIT 1` بلا `ORDER BY` يُعيد **الأقدم** (مُثبَت بـEXPLAIN:
  --   Limit ← Seq Scan). فالتأكيد يميّز الترتيبَين فعلاً.
  PERFORM pg_temp.chk('9b.1b الأحدث يفوز لا الأقدم',
    public.expense_apply_rejection_reason(v_req), 'سببٌ أحدث');

  -- ★★ وعند تساوي الطابع: step_order الأعلى يفوز (تسويةٌ حتميّة).
  --   نجعل الأقدم **أحدثَ طابعاً** ليُثبت أن المفتاح الثاني يعمل.
  UPDATE public.hr_approval_steps SET decided_at = now()
   WHERE request_id = v_req;
  PERFORM pg_temp.chk('9b.1c عند تساوي الطابع: step_order الأعلى',
    public.expense_apply_rejection_reason(v_req), 'سببٌ أحدث');
  -- استرجاع: نُبقي الأولى وحدها للتأكيدات التالية
  DELETE FROM public.hr_approval_steps
   WHERE request_id = v_req AND step_order = 2;

  -- ★★ وخطوةٌ رافضة بلا تعليق ⇒ سببٌ صريح لا فراغ
  DECLARE v_x7 UUID; v_req7 UUID;
  BEGIN
    v_x7 := public.expense_submit('رفضٌ بلا تعليق','وصف',9000,'general',NULL,NULL,
      current_setting('kyvzon.t363_e1')::UUID);
    INSERT INTO public.hr_approval_requests
      (id,tenant_id,request_type,related_id,employee_id,amount)
    VALUES ('c7630000-0000-0000-0000-00000000000c',
            'a3630000-0000-0000-0000-00000000000a','expense',v_x7,
            current_setting('kyvzon.t363_e1')::UUID,9000)
    RETURNING id INTO v_req7;
    INSERT INTO public.hr_approval_steps
      (request_id,tenant_id,step_order,approver_role,approver_id,status,decided_at)
    VALUES (v_req7,'a3630000-0000-0000-0000-00000000000a',1,'manager',
            '44630004-0000-0000-0000-000000000004','rejected',now());
    UPDATE public.expense_requests SET status='rejected' WHERE id=v_x7;
    PERFORM pg_temp.chk('9b.4 بلا تعليق ⇒ سببٌ صريح',
      (SELECT rejection_reason FROM public.expense_requests WHERE id=v_x7),
      'رُفض عبر صندوق الموافقات بلا تعليق');
  END;
END $$;

\echo ''
\echo '═══ ★★★ ⑩ العطل ⑫: الحذف ممنوع ═══'

DO $$
DECLARE v_ok BOOLEAN; v_m TEXT;
BEGIN
  v_ok := FALSE; v_m := '';
  BEGIN DELETE FROM public.expense_requests
         WHERE id = current_setting('kyvzon.t363_x1')::UUID;
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE;
            GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('10.1 الحذف يرمي', v_ok::TEXT, 'true');
  PERFORM pg_temp.chk('10.2 رمز EXPENSE_DELETE_BLOCKED',
    (position('EXPENSE_DELETE_BLOCKED' IN v_m) > 0)::TEXT, 'true');
  PERFORM pg_temp.chk('10.3 الصفّ باقٍ',
    (SELECT count(*)::TEXT FROM public.expense_requests
      WHERE id = current_setting('kyvzon.t363_x1')::UUID), '1');
END $$;

\echo ''
\echo '═══ ★★ ⑩ب إغلاق السلسلة يُتيح القرار المباشر ═══'

DO $$
BEGIN
  -- ★ x3 له خطوةٌ نشطة من مدير القسم (المسار الاحتياطيّ) ⇒ القرار
  --   المباشر ممنوع. نُغلق الخطوة كما يفعل صندوق الموافقات، ثم نعتمد.
  UPDATE public.hr_approval_steps s SET status='approved'
    FROM public.hr_approval_requests r
   WHERE r.id = s.request_id
     AND r.related_id = current_setting('kyvzon.t363_x3')::UUID;
  PERFORM pg_temp.chk('10b.1 لا خطوة مفتوحة',
    (SELECT out_open_steps::TEXT FROM public.expense_chain_state(
      current_setting('kyvzon.t363_x3')::UUID)), '0');

  -- ★★★ تصحيحٌ لتوقّعي: ظننتُني سأحتاج `expense_decide` بعد إغلاق
  --   الخطوة. **خطأ**: اعتماد آخر خطوة يُطلق محفّز المزامنة
  --   `sync_hr_source_status` (0323) الذي يكتب `approved` في
  --   `expense_requests` تلقائياً — وهو **السلوك الصحيح** للمنظومة.
  --   فالقرار المباشر يرمي `EXPENSE_NOT_PENDING: approved` بحقّ.
  PERFORM pg_temp.chk('10b.2 المزامنة اعتمدت النفقة تلقائياً',
    (SELECT status FROM public.expense_requests
      WHERE id = current_setting('kyvzon.t363_x3')::UUID), 'approved');
  -- ★★ ومحفّزنا ملأ approved_by/at رغم أن الكتابة جاءت من المزامنة
  PERFORM pg_temp.chk('10b.3 وapproved_by امتلأ',
    (SELECT (approved_by IS NOT NULL)::TEXT FROM public.expense_requests
      WHERE id = current_setting('kyvzon.t363_x3')::UUID), 'true');
  PERFORM pg_temp.chk('10b.4 وapproved_at كذلك',
    (SELECT (approved_at IS NOT NULL)::TEXT FROM public.expense_requests
      WHERE id = current_setting('kyvzon.t363_x3')::UUID), 'true');

  -- ★★ وإعادة البتّ ممنوعة
  DECLARE v_m TEXT := '';
  BEGIN
    BEGIN PERFORM public.expense_decide(
      current_setting('kyvzon.t363_x3')::UUID,'approved');
    EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
    PERFORM pg_temp.chk('10b.5 EXPENSE_NOT_PENDING بعد المزامنة',
      (position('EXPENSE_NOT_PENDING' IN v_m) > 0)::TEXT, 'true');
  END;
END $$;

\echo ''
\echo '═══ ★★ ⑪ اللوح: الأسماء والأعمار والترتيب ═══'

DO $$
DECLARE r RECORD; v_order TEXT;
BEGIN
  SELECT * INTO r FROM public.expense_board(NULL,NULL,500)
   WHERE out_id = current_setting('kyvzon.t363_x1')::UUID;
  -- ★ العطل ⑭: full_name_ar فارغ ⇒ الاحتياطيّ
  PERFORM pg_temp.chk('11.1 اسم الموظف من الاحتياطيّ', r.out_employee_name, 'سالم الأول');
  PERFORM pg_temp.chk('11.2 القسم', r.out_department, 'المالية');
  PERFORM pg_temp.chk('11.3 اسم المعتمِد', r.out_approver_name, 'هدى الموارد');
  -- ★ النفقة قُدّمت بتاريخ (اليوم - 3)
  PERFORM pg_temp.chk('11.4 عمر النفقة 3 أيام', r.out_age_days::TEXT, '3');
  PERFORM pg_temp.chk('11.5 الإيصال', r.out_receipt_url, 'http://x/r1.pdf');
  PERFORM pg_temp.chk('11.6 الفئة', r.out_category, 'travel');

  -- ★ بلا معتمِد: «—» لا فراغ
  PERFORM pg_temp.chk('11.7 بلا معتمِد = «—»',
    (SELECT out_approver_name FROM public.expense_board(NULL,NULL,500)
      WHERE out_id = current_setting('kyvzon.t363_x4')::UUID), '—');

  -- ★★★ الترتيب: المعلَّق أولاً (x4 pending · ثم المبتوتة)
  SELECT string_agg(out_status,'|' ORDER BY rn) INTO v_order
    FROM (SELECT out_status, row_number() OVER () rn
            FROM public.expense_board(NULL,NULL,500)) t;
  PERFORM pg_temp.chk('11.8 المعلَّق أوّلاً',
    split_part(v_order,'|',1), 'pending');

  PERFORM pg_temp.chk('11.9 ترشيح approved = 1',
    (SELECT count(*)::TEXT FROM public.expense_board('approved',NULL,500)), '1');
  -- ★ travel: «سفر بغداد» · «نفقة بسلسلة» · «رفضٌ عبر الصندوق» = 3
  PERFORM pg_temp.chk('11.10 ترشيح travel = 3',
    (SELECT count(*)::TEXT FROM public.expense_board(NULL,'travel',500)), '3');
  PERFORM pg_temp.chk('11.11 LIMIT = 2 يعمل',
    (SELECT count(*)::TEXT FROM public.expense_board(NULL,NULL,2)), '2');
END $$;

\echo ''
\echo '═══ ★★ ⑫ الملخّص بأرقام محسوبة يدوياً ═══'

DO $$
DECLARE r RECORD; v_c UUID;
BEGIN
  SELECT * INTO r FROM public.expense_summary();
  -- ★ الخمس المحسوبة يدوياً:
  --   x1 «سفر بغداد»    paid      500,000  (travel · له إيصال)
  --   x2 «وجبات»        rejected   75,000  (meals)
  --   x3 «قرطاسية»      approved   30,000  (supplies)
  --   x4 «نفقة بسلسلة»  pending   900,000  (travel)
  --   x5 «نفقة يتيمة»   pending    44,000  (general · مجمَّدة)
  PERFORM pg_temp.chk('12.1 الإجمالي',   r.out_total::TEXT,    '7');
  PERFORM pg_temp.chk('12.2 المعلَّق',    r.out_pending::TEXT,  '2');
  -- 900,000 + 44,000 = 944,000
  PERFORM pg_temp.chk('12.3 مبلغ المعلَّق', r.out_amt_pending::TEXT, '944000.00');
  PERFORM pg_temp.chk('12.4 المعتمَد',    r.out_approved::TEXT, '1');
  PERFORM pg_temp.chk('12.5 مبلغ المعتمَد', r.out_amt_approved::TEXT, '30000.00');
  PERFORM pg_temp.chk('12.6 المدفوع',    r.out_paid::TEXT,     '1');
  PERFORM pg_temp.chk('12.7 مبلغ المدفوع', r.out_amt_paid::TEXT, '500000.00');
  PERFORM pg_temp.chk('12.8 المرفوض',    r.out_rejected::TEXT, '3');
  PERFORM pg_temp.chk('12.9 الملغى',     r.out_cancelled::TEXT,'0');
  -- ★★ ينتظر الصرف = المعتمَد (x3)
  PERFORM pg_temp.chk('12.10 ينتظر الصرف', r.out_awaiting_pay::TEXT, '1');
  -- ★★ بلا إيصال: الستّ الباقية (x1 وحده له إيصال)
  PERFORM pg_temp.chk('12.11 بلا إيصال', r.out_no_receipt::TEXT, '6');
  -- ★★★ والمجمَّد ما زال واحداً (x5)
  PERFORM pg_temp.chk('12.12 المجمَّد',   r.out_stalled::TEXT,  '1');

  -- ★★ كشف العكسُ INV36 أن استثناء الملغى من «بلا إيصال» لم يُختبَر:
  --   لا نفقةَ ملغاة في العيّنة. نُنشئ واحدة بلا إيصال ونُلغيها.
  v_c := public.expense_submit('للإلغاء','بلا إيصال',7000,'general',NULL,NULL,
    current_setting('kyvzon.t363_e1')::UUID);
  SELECT * INTO r FROM public.expense_summary();
  -- صارت ستّاً · وبلا إيصال 5
  PERFORM pg_temp.chk('12.13 قبل الإلغاء: بلا إيصال = 7',
    r.out_no_receipt::TEXT, '7');
  PERFORM public.expense_decide(v_c,'cancelled');
  SELECT * INTO r FROM public.expense_summary();
  PERFORM pg_temp.chk('12.14 الملغى صار 1', r.out_cancelled::TEXT, '1');
  -- ★★★ الملغى يخرج من «بلا إيصال» ⇒ 4
  PERFORM pg_temp.chk('12.15 «بلا إيصال» يستثني الملغى',
    r.out_no_receipt::TEXT, '6');

  -- ★★ وكشف العكسُ INV35 أن `round(COALESCE(…))` لم يُختبَر: لا حالةَ
  --   بمجموعٍ فارغ في ألف. مستأجر باء بلا نفقاتٍ معلَّقة ⇒ 0.00 لا 0.
  PERFORM set_config('request.jwt.claim.sub',
    '77630007-0000-0000-0000-000000000007', TRUE);
  SELECT * INTO r FROM public.expense_summary();
  PERFORM pg_temp.chk('12.16 مجموعٌ فارغ = 0.00 لا 0',
    r.out_amt_pending::TEXT, '0.00');
  PERFORM pg_temp.chk('12.17 والمدفوع كذلك', r.out_amt_paid::TEXT, '0.00');
  PERFORM set_config('request.jwt.claim.sub',
    '33630003-0000-0000-0000-000000000003', TRUE);
END $$;

\echo ''
\echo '═══ ★★★ ⑬ عزل المستأجر ═══'

DO $$
DECLARE v_n INTEGER; v_m TEXT;
BEGIN
  PERFORM set_config('request.jwt.claim.sub',
    '77630007-0000-0000-0000-000000000007', TRUE);
  PERFORM public.expense_submit('نفقة باء','وصف',10000,'general',NULL,NULL,
    current_setting('kyvzon.t363_eb')::UUID);

  v_n := (SELECT count(*) FROM public.expense_board(NULL,NULL,500));
  PERFORM pg_temp.chk('13.1 باء يرى 1', v_n::TEXT, '1');
  PERFORM pg_temp.chk('13.2 ملخّص باء = 1',
    (SELECT out_total::TEXT FROM public.expense_summary()), '1');

  PERFORM set_config('request.jwt.claim.sub',
    '33630003-0000-0000-0000-000000000003', TRUE);
  v_n := (SELECT count(*) FROM public.expense_board(NULL,NULL,500));
  -- ★ ستّ نفقات في ألف بعد «للإلغاء» — ونفقة باء غائبة
  PERFORM pg_temp.chk('13.3 هدى ما زالت ترى 8 لا 9', v_n::TEXT, '8');
  PERFORM pg_temp.chk('13.4 نفقة باء غائبة',
    (SELECT count(*)::TEXT FROM public.expense_board(NULL,NULL,500)
      WHERE out_title='نفقة باء'), '0');
  PERFORM pg_temp.chk('13.5 والصفّ موجود فعلاً',
    (SELECT count(*)::TEXT FROM public.expense_requests
      WHERE title='نفقة باء'), '1');

  -- ★★★ وهدى لا تبتّ في نفقة باء
  v_m := ''; BEGIN PERFORM public.expense_decide(
    (SELECT id FROM public.expense_requests WHERE title='نفقة باء'),
    'rejected','رفض عابر');
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('13.6 EXPENSE_NOT_FOUND لنفقة باء',
    (position('EXPENSE_NOT_FOUND' IN v_m) > 0)::TEXT, 'true');
  PERFORM pg_temp.chk('13.7 وحالتها لم تتغيّر',
    (SELECT status FROM public.expense_requests WHERE title='نفقة باء'), 'pending');
END $$;

\echo ''
\echo '═══ ★★ ⑭ الموظف يرى نفقاته وحدها ═══'

DO $$
DECLARE v_n INTEGER; v_m TEXT;
BEGIN
  PERFORM set_config('request.jwt.claim.sub',
    '11630001-0000-0000-0000-000000000001', TRUE);
  -- سالم له: x1(سفر) · x3(قرطاسية) · x4(نفقة بسلسلة) = 3
  v_n := (SELECT count(*) FROM public.expense_board(NULL,NULL,500));
  -- سالم له: x1 · x3 · x4 · «للإلغاء» = 4 من 6
  PERFORM pg_temp.chk('14.1 سالم يرى 6 من 8', v_n::TEXT, '6');
  PERFORM pg_temp.chk('14.2 ولا يرى نفقة ناصر',
    (SELECT count(*)::TEXT FROM public.expense_board(NULL,NULL,500)
      WHERE out_employee_id = current_setting('kyvzon.t363_e2')::UUID), '0');

  -- ★★ والملخّص محجوب عنه
  v_m := ''; BEGIN PERFORM public.expense_summary();
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('14.3 الملخّص محجوب عن الموظف',
    (position('غير مصرَّح' IN v_m) > 0)::TEXT, 'true');

  -- ★★★ ولا يبتّ في نفقته
  v_m := ''; BEGIN PERFORM public.expense_decide(
    current_setting('kyvzon.t363_x4')::UUID,'approved');
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('14.4 الموظف لا يعتمد نفقته',
    (position('EXPENSE_NOT_AUTHORIZED' IN v_m) > 0)::TEXT, 'true');

  v_m := ''; BEGIN PERFORM public.expense_mark_paid(
    current_setting('kyvzon.t363_x3')::UUID);
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('14.5 ولا يصرفها',
    (position('EXPENSE_NOT_AUTHORIZED' IN v_m) > 0)::TEXT, 'true');

  -- ★★ والمدير ليس staff
  PERFORM set_config('request.jwt.claim.sub',
    '44630004-0000-0000-0000-000000000004', TRUE);
  v_m := ''; BEGIN PERFORM public.expense_decide(
    current_setting('kyvzon.t363_x4')::UUID,'approved');
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('14.6 المدير لا يعتمد (ليس staff)',
    (position('EXPENSE_NOT_AUTHORIZED' IN v_m) > 0)::TEXT, 'true');

  PERFORM set_config('request.jwt.claim.sub',
    '33630003-0000-0000-0000-000000000003', TRUE);
  PERFORM pg_temp.chk('14.7 لا صفّ تغيّر من الحرّاس',
    (SELECT status FROM public.expense_requests
      WHERE id = current_setting('kyvzon.t363_x4')::UUID), 'pending');
END $$;

\echo ''
\echo '════════════ كل تأكيدات 0363 نجحت ════════════'
ROLLBACK;
