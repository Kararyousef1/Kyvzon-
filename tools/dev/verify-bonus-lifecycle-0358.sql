-- ════════════════════════════════════════════════════════════════════════
--  التحقق السلوكيّ من 0358 — دورة حياة المكافآت
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
-- ★ UUIDات فريدة في **أول 8 حروف** (درس 0355)
INSERT INTO public.tenants (id,name,name_ar,slug) VALUES
 ('a3580000-0000-0000-0000-00000000000a','T358A','شركة ألف','t358a'),
 ('b3580000-0000-0000-0000-00000000000b','T358B','شركة باء','t358b');

INSERT INTO auth.users(id,email) VALUES
 ('11580001-0000-0000-0000-000000000001','salem@t358a'),
 ('22580002-0000-0000-0000-000000000002','nasser@t358a'),
 ('33580003-0000-0000-0000-000000000003','huda@t358a'),
 ('44580004-0000-0000-0000-000000000004','munir@t358a'),
 ('55580005-0000-0000-0000-000000000005','adam@t358a'),
 ('66580006-0000-0000-0000-000000000006','emp@t358b'),
 ('77580007-0000-0000-0000-000000000007','hr@t358b');

INSERT INTO public.profiles (id,tenant_id,full_name,role,department) VALUES
 ('44580004-0000-0000-0000-000000000004','a3580000-0000-0000-0000-00000000000a','منير المدير','manager','المالية');
INSERT INTO public.departments (id,tenant_id,name_ar,manager_id) VALUES
 ('d3580000-0000-0000-0000-00000000000d','a3580000-0000-0000-0000-00000000000a','المالية',
  '44580004-0000-0000-0000-000000000004');
INSERT INTO public.profiles (id,tenant_id,full_name,role,department) VALUES
 ('11580001-0000-0000-0000-000000000001','a3580000-0000-0000-0000-00000000000a','سالم الأول','employee','المالية'),
 ('22580002-0000-0000-0000-000000000002','a3580000-0000-0000-0000-00000000000a','ناصر الثاني','employee','المالية'),
 ('33580003-0000-0000-0000-000000000003','a3580000-0000-0000-0000-00000000000a','هدى الموارد','hr','الموارد'),
 ('55580005-0000-0000-0000-000000000005','a3580000-0000-0000-0000-00000000000a','آدم المسؤول','admin','الإدارة'),
 ('66580006-0000-0000-0000-000000000006','b3580000-0000-0000-0000-00000000000b','أجنبي','employee','المالية'),
 ('77580007-0000-0000-0000-000000000007','b3580000-0000-0000-0000-00000000000b','مورد باء','hr','الموارد');

SELECT set_config('kyvzon.t358_e1',
  (SELECT e.id::TEXT FROM public.employees e WHERE e.user_id='11580001-0000-0000-0000-000000000001'), FALSE),
       set_config('kyvzon.t358_e2',
  (SELECT e.id::TEXT FROM public.employees e WHERE e.user_id='22580002-0000-0000-0000-000000000002'), FALSE),
       set_config('kyvzon.t358_eb',
  (SELECT e.id::TEXT FROM public.employees e WHERE e.user_id='66580006-0000-0000-0000-000000000006'), FALSE);

SET LOCAL request.jwt.claim.sub = '33580003-0000-0000-0000-000000000003';

\echo ''
\echo '═══ ★★★ ③ توحيد المبلغ — bonus_amount مرآة لا حقل مستقلّ ═══'

DO $$
DECLARE v_id UUID;
BEGIN
  -- ★ المُدخَلان مختلفان — المحفّز القديم كان يتركهما
  INSERT INTO public.bonuses
    (tenant_id, employee_id, bonus_type, amount, bonus_amount, reason)
  VALUES ('a3580000-0000-0000-0000-00000000000a',
          current_setting('kyvzon.t358_e1')::UUID,'annual',100000,999999,'تضارب')
  RETURNING id INTO v_id;

  PERFORM pg_temp.chk('3.1 amount كما أُدخل',
    (SELECT amount::TEXT FROM public.bonuses WHERE id=v_id), '100000.00');
  -- ★★★ المرآة: 100000 لا 999999
  PERFORM pg_temp.chk('3.2 bonus_amount مرآة لا 999999',
    (SELECT bonus_amount::TEXT FROM public.bonuses WHERE id=v_id), '100000.00');
  PERFORM pg_temp.chk('3.3 لا تضارب',
    (SELECT (amount = bonus_amount)::TEXT FROM public.bonuses WHERE id=v_id), 'true');

  -- ★ والاتجاه الآخر: bonus_amount وحده يملأ amount
  INSERT INTO public.bonuses
    (tenant_id, employee_id, bonus_type, bonus_amount, reason)
  VALUES ('a3580000-0000-0000-0000-00000000000a',
          current_setting('kyvzon.t358_e1')::UUID,'spot',300000,'فورية')
  RETURNING id INTO v_id;
  PERFORM pg_temp.chk('3.4 bonus_amount وحده يملأ amount',
    (SELECT amount::TEXT FROM public.bonuses WHERE id=v_id), '300000.00');

  -- ★ والتعديل لاحقاً يُبقي المرآة
  UPDATE public.bonuses SET amount = 250000 WHERE id=v_id;
  PERFORM pg_temp.chk('3.5 التعديل يُحدّث المرآة',
    (SELECT bonus_amount::TEXT FROM public.bonuses WHERE id=v_id), '250000.00');

  PERFORM pg_temp.chk('3.6 العملة الافتراضية',
    (SELECT currency FROM public.bonuses WHERE id=v_id), 'IQD');

  -- ★★ ثغرة تغطية كشفها INV04: التأكيد أعلاه يمرّ بفضل
  --   `DEFAULT 'IQD'` على العمود، فحارس المحفّز غير مُختبَر.
  --   والعمود `NOT NULL` **لا يمنع السلسلة الفارغة** — نُمرّرها صراحةً.
  INSERT INTO public.bonuses
    (tenant_id, employee_id, bonus_type, amount, reason, currency)
  VALUES ('a3580000-0000-0000-0000-00000000000a',
          current_setting('kyvzon.t358_e1')::UUID,'other',1000,'عملة فارغة','')
  RETURNING id INTO v_id;
  PERFORM pg_temp.chk('3.7 السلسلة الفارغة تصير IQD',
    (SELECT currency FROM public.bonuses WHERE id=v_id), 'IQD');

  -- ★ وعملة صريحة تُحترَم
  INSERT INTO public.bonuses
    (tenant_id, employee_id, bonus_type, amount, reason, currency)
  VALUES ('a3580000-0000-0000-0000-00000000000a',
          current_setting('kyvzon.t358_e1')::UUID,'other',1000,'دولار','USD')
  RETURNING id INTO v_id;
  PERFORM pg_temp.chk('3.8 العملة الصريحة تُحترَم',
    (SELECT currency FROM public.bonuses WHERE id=v_id), 'USD');

  -- تنظيف
  UPDATE public.bonuses SET status='cancelled'
   WHERE tenant_id='a3580000-0000-0000-0000-00000000000a';
END $$;

\echo ''
\echo '═══ ★★★ ②/④/⑤ القيود ═══'

DO $$
DECLARE v_ok BOOLEAN; v_m TEXT;
BEGIN
  -- ★★★ العطل ②: المفردة العربية لم تعد تمرّ
  v_ok := FALSE; v_m := '';
  BEGIN
    INSERT INTO public.bonuses (tenant_id, employee_id, bonus_type, amount, reason, status)
    VALUES ('a3580000-0000-0000-0000-00000000000a',
            current_setting('kyvzon.t358_e1')::UUID,'other',1000,'عربي','موافق');
  EXCEPTION WHEN check_violation THEN v_ok := TRUE;
            GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('4.1 المفردة «موافق» مرفوضة', v_ok::TEXT, 'true');
  PERFORM pg_temp.chk('4.2 القيد المُسمّى هو الرافض',
    (position('bonuses_status_chk' IN v_m) > 0)::TEXT, 'true');

  v_ok := FALSE;
  BEGIN
    INSERT INTO public.bonuses (tenant_id, employee_id, bonus_type, amount, reason, status)
    VALUES ('a3580000-0000-0000-0000-00000000000a',
            current_setting('kyvzon.t358_e1')::UUID,'other',1000,'ملغي','ملغي');
  EXCEPTION WHEN check_violation THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('4.3 المفردة «ملغي» مرفوضة', v_ok::TEXT, 'true');

  v_ok := FALSE;
  BEGIN
    INSERT INTO public.bonuses (tenant_id, employee_id, bonus_type, amount, reason, status)
    VALUES ('a3580000-0000-0000-0000-00000000000a',
            current_setting('kyvzon.t358_e1')::UUID,'other',1000,'نصّ','حالة مخترعة');
  EXCEPTION WHEN check_violation THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('4.4 نصّ عشوائيّ مرفوض', v_ok::TEXT, 'true');

  -- ★★ العطل ⑤: النوع
  v_ok := FALSE; v_m := '';
  BEGIN
    INSERT INTO public.bonuses (tenant_id, employee_id, bonus_type, amount, reason)
    VALUES ('a3580000-0000-0000-0000-00000000000a',
            current_setting('kyvzon.t358_e1')::UUID,'نوع مخترع',1000,'نوع');
  EXCEPTION WHEN check_violation THEN v_ok := TRUE;
            GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('4.5 نوع مخترع مرفوض', v_ok::TEXT, 'true');
  PERFORM pg_temp.chk('4.6 القيد المُسمّى',
    (position('bonuses_type_chk' IN v_m) > 0)::TEXT, 'true');

  -- ★ referral نوعٌ مشروع (كان مفقوداً من أزرار الفلترة)
  PERFORM pg_temp.chk('4.7 referral نوع مقبول',
    (SELECT count(*)::TEXT FROM public.bonus_board(NULL,'referral',NULL,TRUE,10)), '0');

  -- ★★ العطل ④: المبلغ السالب
  v_ok := FALSE;
  BEGIN
    INSERT INTO public.bonuses (tenant_id, employee_id, bonus_type, amount, reason)
    VALUES ('a3580000-0000-0000-0000-00000000000a',
            current_setting('kyvzon.t358_e1')::UUID,'other',-50000,'سالب');
  EXCEPTION WHEN check_violation THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('4.8 مبلغ سالب مرفوض', v_ok::TEXT, 'true');

  v_ok := FALSE;
  BEGIN
    INSERT INTO public.bonuses (tenant_id, employee_id, bonus_type, amount, reason)
    VALUES ('a3580000-0000-0000-0000-00000000000a',
            current_setting('kyvzon.t358_e1')::UUID,'other',0,'صفر');
  EXCEPTION WHEN check_violation THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('4.9 مبلغ صفر مرفوض', v_ok::TEXT, 'true');

  -- ★★ العطل ⑥: FK
  v_ok := FALSE;
  BEGIN
    INSERT INTO public.bonuses (tenant_id, employee_id, bonus_type, amount, reason)
    VALUES ('a3580000-0000-0000-0000-00000000000a',
            'ffffffff-ffff-ffff-ffff-ffffffffffff','other',1000,'وهمي');
  EXCEPTION WHEN foreign_key_violation THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('4.10 موظف غير موجود مرفوض', v_ok::TEXT, 'true');

  -- ★ مدى الفترة
  v_ok := FALSE;
  BEGIN
    INSERT INTO public.bonuses (tenant_id, employee_id, bonus_type, amount, reason,
                                period_start, period_end)
    VALUES ('a3580000-0000-0000-0000-00000000000a',
            current_setting('kyvzon.t358_e1')::UUID,'other',1000,'مقلوبة',
            DATE '2026-06-01', DATE '2026-01-01');
  EXCEPTION WHEN check_violation THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('4.11 نهاية قبل بداية مرفوضة', v_ok::TEXT, 'true');
END $$;

\echo ''
\echo '═══ ★★ الإنشاء عبر الدالة ═══'

DO $$
DECLARE v_id UUID; v_ok BOOLEAN; v_m TEXT;
BEGIN
  v_id := public.bonus_create(current_setting('kyvzon.t358_e1')::UUID,
            'performance', 500000, 'أداء ممتاز',
            DATE '2026-07-01', DATE '2026-07-31');
  PERFORM set_config('kyvzon.t358_b1', v_id::TEXT, FALSE);
  PERFORM pg_temp.chk('5.1 المكافأة تُنشأ بحالة pending',
    (SELECT status FROM public.bonuses WHERE id=v_id), 'pending');
  -- ★★ العطل ⑧: الفترة تُمرَّر فعلاً الآن
  PERFORM pg_temp.chk('5.2 period_start يُحفظ',
    (SELECT period_start::TEXT FROM public.bonuses WHERE id=v_id), '2026-07-01');
  PERFORM pg_temp.chk('5.3 period_end يُحفظ',
    (SELECT period_end::TEXT FROM public.bonuses WHERE id=v_id), '2026-07-31');
  -- ★ bonus_date يأخذ period_start
  PERFORM pg_temp.chk('5.4 bonus_date من period_start',
    (SELECT bonus_date::TEXT FROM public.bonuses WHERE id=v_id), '2026-07-01');
  PERFORM pg_temp.chk('5.5 المرآة صحيحة',
    (SELECT bonus_amount::TEXT FROM public.bonuses WHERE id=v_id), '500000.00');

  -- الحرّاس
  v_ok := FALSE; v_m := '';
  BEGIN PERFORM public.bonus_create(current_setting('kyvzon.t358_e1')::UUID,
          'other', -100, 'سالب');
  EXCEPTION WHEN check_violation THEN v_ok := TRUE;
            GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('5.6 مبلغ سالب يرمي', v_ok::TEXT, 'true');
  PERFORM pg_temp.chk('5.7 رمز BONUS_BAD_AMOUNT',
    (position('BONUS_BAD_AMOUNT' IN v_m) > 0)::TEXT, 'true');

  v_ok := FALSE; v_m := '';
  BEGIN PERFORM public.bonus_create(current_setting('kyvzon.t358_e1')::UUID,
          'مخترع', 1000, 'نوع');
  EXCEPTION WHEN check_violation THEN v_ok := TRUE;
            GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('5.8 نوع مخترع يرمي', v_ok::TEXT, 'true');
  PERFORM pg_temp.chk('5.9 رمز BONUS_BAD_TYPE',
    (position('BONUS_BAD_TYPE' IN v_m) > 0)::TEXT, 'true');

  v_ok := FALSE; v_m := '';
  BEGIN PERFORM public.bonus_create(current_setting('kyvzon.t358_e1')::UUID,
          'other', 1000, '   ');
  EXCEPTION WHEN check_violation THEN v_ok := TRUE;
            GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('5.10 سبب فارغ يرمي', v_ok::TEXT, 'true');
  PERFORM pg_temp.chk('5.11 رمز BONUS_NO_REASON',
    (position('BONUS_NO_REASON' IN v_m) > 0)::TEXT, 'true');

  v_ok := FALSE; v_m := '';
  BEGIN PERFORM public.bonus_create(current_setting('kyvzon.t358_e1')::UUID,
          'other', 1000, 'فترة', DATE '2026-06-01', DATE '2026-01-01');
  EXCEPTION WHEN check_violation THEN v_ok := TRUE;
            GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('5.12 فترة مقلوبة ترمي', v_ok::TEXT, 'true');
  PERFORM pg_temp.chk('5.13 رمز BONUS_BAD_PERIOD',
    (position('BONUS_BAD_PERIOD' IN v_m) > 0)::TEXT, 'true');
END $$;

\echo ''
\echo '═══ ★★★ ①/② البتّ — approved_by و المفردات ═══'

DO $$
DECLARE v_id UUID := current_setting('kyvzon.t358_b1')::UUID;
        v_ok BOOLEAN; v_m TEXT;
BEGIN
  -- ★★★ العطل ①: كان approveBonus(id,"system") يرمي
  --   invalid input syntax for type uuid: "system"
  PERFORM public.bonus_decide(v_id, 'approved');
  PERFORM pg_temp.chk('6.1 الاعتماد ينجح',
    (SELECT status FROM public.bonuses WHERE id=v_id), 'approved');
  -- ★★★ approved_by يأخذ auth.uid() لا نصّاً
  PERFORM pg_temp.chk('6.2 approved_by = المستخدم الحاليّ',
    (SELECT approved_by::TEXT FROM public.bonuses WHERE id=v_id),
    '33580003-0000-0000-0000-000000000003');
  PERFORM pg_temp.chk('6.3 decided_at يُختم',
    (SELECT (decided_at IS NOT NULL)::TEXT FROM public.bonuses WHERE id=v_id), 'true');

  -- انتقالات محدَّدة
  v_ok := FALSE; v_m := '';
  BEGIN PERFORM public.bonus_decide(v_id, 'approved');
  EXCEPTION WHEN check_violation THEN v_ok := TRUE;
            GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('6.4 لا اعتماد مرّتين', v_ok::TEXT, 'true');
  PERFORM pg_temp.chk('6.5 رمز BONUS_BAD_TRANSITION',
    (position('BONUS_BAD_TRANSITION' IN v_m) > 0)::TEXT, 'true');

  -- approved → paid
  PERFORM public.bonus_decide(v_id, 'paid');
  PERFORM pg_temp.chk('6.6 approved → paid',
    (SELECT status FROM public.bonuses WHERE id=v_id), 'paid');

  -- paid نهائية
  v_ok := FALSE;
  BEGIN PERFORM public.bonus_decide(v_id, 'cancelled', 'محاولة');
  EXCEPTION WHEN check_violation THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('6.7 paid نهائية', v_ok::TEXT, 'true');

  -- قرار غير معروف
  v_ok := FALSE; v_m := '';
  BEGIN PERFORM public.bonus_decide(v_id, 'موافق');
  EXCEPTION WHEN check_violation THEN v_ok := TRUE;
            GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('6.8 القرار «موافق» غير مقبول', v_ok::TEXT, 'true');
  PERFORM pg_temp.chk('6.9 رمز BONUS_BAD_DECISION',
    (position('BONUS_BAD_DECISION' IN v_m) > 0)::TEXT, 'true');
END $$;

DO $$
DECLARE v_id UUID; v_ok BOOLEAN; v_m TEXT;
BEGIN
  v_id := public.bonus_create(current_setting('kyvzon.t358_e2')::UUID,
            'spot', 200000, 'إنجاز');
  PERFORM set_config('kyvzon.t358_b2', v_id::TEXT, FALSE);

  -- الإلغاء بسبب إلزاميّ
  v_ok := FALSE; v_m := '';
  BEGIN PERFORM public.bonus_decide(v_id, 'cancelled');
  EXCEPTION WHEN check_violation THEN v_ok := TRUE;
            GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('6.10 إلغاء بلا سبب يرمي', v_ok::TEXT, 'true');
  PERFORM pg_temp.chk('6.11 رمز BONUS_NO_NOTE',
    (position('BONUS_NO_NOTE' IN v_m) > 0)::TEXT, 'true');

  PERFORM public.bonus_decide(v_id, 'cancelled', 'الميزانية');
  PERFORM pg_temp.chk('6.12 الإلغاء ينجح',
    (SELECT status FROM public.bonuses WHERE id=v_id), 'cancelled');
  PERFORM pg_temp.chk('6.13 السبب يُحفظ',
    (SELECT decision_note FROM public.bonuses WHERE id=v_id), 'الميزانية');
  -- ★ الملغاة لا تُسنَد لمعتمِد
  PERFORM pg_temp.chk('6.14 الملغاة بلا معتمِد',
    (SELECT (approved_by IS NULL)::TEXT FROM public.bonuses WHERE id=v_id), 'true');
END $$;

\echo ''
\echo '═══ ★ ⑦ الأرشفة بدل الحذف ═══'

DO $$
DECLARE v_ok BOOLEAN; v_m TEXT; v_id UUID;
BEGIN
  v_ok := FALSE; v_m := '';
  BEGIN DELETE FROM public.bonuses
         WHERE id = current_setting('kyvzon.t358_b1')::UUID;
  EXCEPTION WHEN check_violation THEN v_ok := TRUE;
            GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('7.1 الحذف ممنوع', v_ok::TEXT, 'true');
  PERFORM pg_temp.chk('7.2 رمز BONUS_IMMUTABLE',
    (position('BONUS_IMMUTABLE' IN v_m) > 0)::TEXT, 'true');

  v_ok := FALSE; v_m := '';
  BEGIN PERFORM public.bonus_archive(
    current_setting('kyvzon.t358_b1')::UUID, '  ');
  EXCEPTION WHEN check_violation THEN v_ok := TRUE;
            GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('7.3 أرشفة بلا سبب ترمي', v_ok::TEXT, 'true');

  PERFORM public.bonus_archive(current_setting('kyvzon.t358_b1')::UUID, 'خطأ إداريّ');
  PERFORM pg_temp.chk('7.4 الأرشفة تُختم',
    (SELECT (archived_at IS NOT NULL)::TEXT FROM public.bonuses
      WHERE id = current_setting('kyvzon.t358_b1')::UUID), 'true');
  PERFORM pg_temp.chk('7.5 السبب يُحفظ',
    (SELECT archive_reason FROM public.bonuses
      WHERE id = current_setting('kyvzon.t358_b1')::UUID), 'خطأ إداريّ');

  v_ok := FALSE;
  BEGIN PERFORM public.bonus_archive(
    current_setting('kyvzon.t358_b1')::UUID, 'مرّة أخرى');
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('7.6 لا أرشفة مرّتين', v_ok::TEXT, 'true');

  -- المؤرشف لا يُبَتّ فيه
  v_id := public.bonus_create(current_setting('kyvzon.t358_e2')::UUID,
            'other', 50000, 'للأرشفة');
  PERFORM public.bonus_archive(v_id, 'تجربة');
  v_ok := FALSE; v_m := '';
  BEGIN PERFORM public.bonus_decide(v_id, 'approved');
  EXCEPTION WHEN check_violation THEN v_ok := TRUE;
            GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('7.7 المؤرشف لا يُبَتّ فيه', v_ok::TEXT, 'true');
  PERFORM pg_temp.chk('7.8 رمز BONUS_ARCHIVED',
    (position('BONUS_ARCHIVED' IN v_m) > 0)::TEXT, 'true');
END $$;

\echo ''
\echo '═══ ★★ الملخّص ═══'

-- حالة ألف الآن (غير المؤرشف):
--   «تضارب» 100,000 cancelled · «فورية» 250,000 cancelled
--   b1 500,000 paid — **مؤرشف** ⇒ خارج كل حساب
--   b2 200,000 cancelled
--   «للأرشفة» 50,000 — مؤرشف ⇒ خارج
DO $$
DECLARE r RECORD;
BEGIN
  SELECT * INTO r FROM public.bonus_summary();
  PERFORM pg_temp.chk('8.1 الإجمالي غير المؤرشف', r.out_total::TEXT, '5');
  PERFORM pg_temp.chk('8.2 بانتظار',  r.out_pending::TEXT,   '0');
  PERFORM pg_temp.chk('8.3 معتمدة',   r.out_approved::TEXT,  '0');
  PERFORM pg_temp.chk('8.4 مدفوعة',   r.out_paid::TEXT,      '0');
  PERFORM pg_temp.chk('8.5 ملغاة',    r.out_cancelled::TEXT, '5');
  -- 100,000 + 250,000 + 200,000 = 550,000 كلّها ملغاة ⇒ المبالغ صفر
  PERFORM pg_temp.chk('8.6 مبلغ المعتمدة', r.out_amt_approved::TEXT, '0.00');
  PERFORM pg_temp.chk('8.7 مبلغ المدفوعة', r.out_amt_paid::TEXT, '0.00');
  PERFORM pg_temp.chk('8.8 موظفون بمكافآت فعّالة', r.out_employees::TEXT, '0');
END $$;

-- ★ نُضيف مكافآت فعّالة لقياس المبالغ
DO $$
DECLARE v_a UUID; v_b UUID; v_c UUID;
        v_today DATE := (NOW() AT TIME ZONE 'Asia/Baghdad')::DATE;
BEGIN
  v_a := public.bonus_create(current_setting('kyvzon.t358_e1')::UUID,
           'performance', 400000, 'ربعية', v_today, v_today);
  v_b := public.bonus_create(current_setting('kyvzon.t358_e2')::UUID,
           'referral', 150000, 'إحالة', v_today, v_today);
  v_c := public.bonus_create(current_setting('kyvzon.t358_e1')::UUID,
           'annual', 600000, 'سنوية', v_today, v_today);
  PERFORM public.bonus_decide(v_a, 'approved');
  PERFORM public.bonus_decide(v_b, 'approved');
  PERFORM public.bonus_decide(v_b, 'paid');
  -- v_c يبقى pending
  PERFORM set_config('kyvzon.t358_ba', v_a::TEXT, FALSE);
  PERFORM set_config('kyvzon.t358_bc', v_c::TEXT, FALSE);
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  SELECT * INTO r FROM public.bonus_summary();
  PERFORM pg_temp.chk('8.9 الإجمالي', r.out_total::TEXT, '8');
  PERFORM pg_temp.chk('8.10 بانتظار', r.out_pending::TEXT,  '1');
  PERFORM pg_temp.chk('8.11 معتمدة',  r.out_approved::TEXT, '1');
  PERFORM pg_temp.chk('8.12 مدفوعة',  r.out_paid::TEXT,     '1');
  PERFORM pg_temp.chk('8.13 مبلغ بانتظار', r.out_amt_pending::TEXT,  '600000.00');
  PERFORM pg_temp.chk('8.14 مبلغ معتمدة',  r.out_amt_approved::TEXT, '400000.00');
  PERFORM pg_temp.chk('8.15 مبلغ مدفوعة',  r.out_amt_paid::TEXT,     '150000.00');
  -- ★ مكافآت الشهر (approved + paid) = 400,000 + 150,000 = 550,000
  PERFORM pg_temp.chk('8.16 مبلغ الشهر', r.out_amt_month::TEXT, '550000.00');
  -- سالم (approved) وناصر (paid) = 2
  PERFORM pg_temp.chk('8.17 موظفون بمكافآت فعّالة', r.out_employees::TEXT, '2');
END $$;

\echo ''
\echo '═══ ★★ اللوحة ═══'

DO $$
DECLARE r RECORD; v_n INTEGER;
BEGIN
  SELECT count(*) INTO v_n FROM public.bonus_board(NULL,NULL,NULL,FALSE,500);
  PERFORM pg_temp.chk('9.1 غير المؤرشف', v_n::TEXT, '8');
  SELECT count(*) INTO v_n FROM public.bonus_board(NULL,NULL,NULL,TRUE,500);
  PERFORM pg_temp.chk('9.2 مع المؤرشف', v_n::TEXT, '10');

  SELECT count(*) INTO v_n FROM public.bonus_board('approved',NULL,NULL,FALSE,500);
  PERFORM pg_temp.chk('9.3 ترشيح approved', v_n::TEXT, '1');
  -- ★ referral كان مفقوداً من أزرار الفلترة
  SELECT count(*) INTO v_n FROM public.bonus_board(NULL,'referral',NULL,FALSE,500);
  PERFORM pg_temp.chk('9.4 ترشيح referral', v_n::TEXT, '1');

  SELECT count(*) INTO v_n FROM public.bonus_board(NULL,NULL,NULL,FALSE,2);
  PERFORM pg_temp.chk('9.5 الحدّ الأعلى يعمل', v_n::TEXT, '2');

  SELECT * INTO r FROM public.bonus_board('approved',NULL,NULL,FALSE,10);
  -- ★ full_name_ar = NULL لكل موظف ⇒ الاحتياطيّ من profiles
  PERFORM pg_temp.chk('9.6 اسم بديل عن full_name_ar', r.out_employee_name, 'سالم الأول');
  PERFORM pg_temp.chk('9.7 القسم من departments', r.out_department, 'المالية');
  PERFORM pg_temp.chk('9.8 اسم المعتمِد', r.out_approver_name, 'هدى الموارد');
  PERFORM pg_temp.chk('9.9 المبلغ', r.out_amount::TEXT, '400000.00');
  PERFORM pg_temp.chk('9.10 العملة', r.out_currency, 'IQD');

  -- البحث
  SELECT count(*) INTO v_n FROM public.bonus_board(NULL,NULL,'سالم',FALSE,500);
  PERFORM pg_temp.chk('9.11 البحث بالاسم', (v_n > 0)::TEXT, 'true');
  SELECT count(*) INTO v_n FROM public.bonus_board(NULL,NULL,'إحالة',FALSE,500);
  PERFORM pg_temp.chk('9.12 البحث بالسبب', v_n::TEXT, '1');
  SELECT count(*) INTO v_n FROM public.bonus_board(NULL,NULL,'لا شيء',FALSE,500);
  PERFORM pg_temp.chk('9.13 بحث بلا نتيجة', v_n::TEXT, '0');
END $$;

DO $$
DECLARE v_ok BOOLEAN; v_m TEXT;
BEGIN
  v_ok := FALSE; v_m := '';
  BEGIN PERFORM public.bonus_board('موافق',NULL,NULL,FALSE,10);
  EXCEPTION WHEN check_violation THEN v_ok := TRUE;
            GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('9.14 حالة عربية مرفوضة', v_ok::TEXT, 'true');
  PERFORM pg_temp.chk('9.15 رمز BONUS_BAD_STATUS',
    (position('BONUS_BAD_STATUS' IN v_m) > 0)::TEXT, 'true');

  v_ok := FALSE; v_m := '';
  BEGIN PERFORM public.bonus_board(NULL,'مخترع',NULL,FALSE,10);
  EXCEPTION WHEN check_violation THEN v_ok := TRUE;
            GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('9.16 نوع مخترع مرفوض', v_ok::TEXT, 'true');
  PERFORM pg_temp.chk('9.17 رمز BONUS_BAD_TYPE',
    (position('BONUS_BAD_TYPE' IN v_m) > 0)::TEXT, 'true');
END $$;

\echo ''
\echo '═══ ★★★ العزل بين المستأجرين ═══'

DO $$
DECLARE v_id UUID;
BEGIN
  PERFORM set_config('request.jwt.claim.sub',
    '77580007-0000-0000-0000-000000000007', TRUE);
  v_id := public.bonus_create(current_setting('kyvzon.t358_eb')::UUID,
            'annual', 900000, 'مكافأة باء');
  PERFORM public.bonus_decide(v_id, 'approved');
  PERFORM set_config('kyvzon.t358_bb', v_id::TEXT, FALSE);

  PERFORM pg_temp.chk('10.1 باء يرى مكافأته وحدها',
    (SELECT out_total::TEXT FROM public.bonus_summary()), '1');
  PERFORM pg_temp.chk('10.2 مبلغ باء',
    (SELECT out_amt_approved::TEXT FROM public.bonus_summary()), '900000.00');

  PERFORM set_config('request.jwt.claim.sub',
    '33580003-0000-0000-0000-000000000003', TRUE);
END $$;

DO $$
DECLARE r RECORD; v_n INTEGER; v_ok BOOLEAN; v_m TEXT;
BEGIN
  SELECT * INTO r FROM public.bonus_summary();
  PERFORM pg_temp.chk('10.3 ألف لا يرى مكافأة باء', r.out_total::TEXT, '8');
  -- ★★ الحاسم: 900,000 لو تسرّبت لصار المعتمَد 1,300,000
  PERFORM pg_temp.chk('10.4 المبلغ لم يتلوّث', r.out_amt_approved::TEXT, '400000.00');
  PERFORM pg_temp.chk('10.5 مبلغ الشهر لم يتلوّث', r.out_amt_month::TEXT, '550000.00');

  SELECT count(*) INTO v_n FROM public.bonus_board(NULL,NULL,NULL,TRUE,500)
   WHERE out_id = current_setting('kyvzon.t358_bb')::UUID;
  PERFORM pg_temp.chk('10.6 اللوحة لا تُسرّب', v_n::TEXT, '0');

  -- ★★ البتّ عبر الحدود: مكافأة باء `approved` (انتقال مشروع إلى paid)
  --   فلا يمسكها إلا ترشيح المستأجر نفسه.
  v_ok := FALSE; v_m := '';
  BEGIN PERFORM public.bonus_decide(
    current_setting('kyvzon.t358_bb')::UUID, 'paid');
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE;
            GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('10.7 لا بتّ عبر الحدود', v_ok::TEXT, 'true');
  PERFORM pg_temp.chk('10.8 الرسالة رسالة المستأجر',
    (position('غير موجودة في هذا المستأجر' IN v_m) > 0)::TEXT, 'true');
  PERFORM pg_temp.chk('10.9 حالة الأجنبية لم تتغيّر',
    (SELECT status FROM public.bonuses
      WHERE id = current_setting('kyvzon.t358_bb')::UUID), 'approved');

  v_ok := FALSE;
  BEGIN PERFORM public.bonus_archive(
    current_setting('kyvzon.t358_bb')::UUID, 'محاولة');
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('10.10 لا أرشفة عبر الحدود', v_ok::TEXT, 'true');
  PERFORM pg_temp.chk('10.11 الأجنبية غير مؤرشفة',
    (SELECT (archived_at IS NULL)::TEXT FROM public.bonuses
      WHERE id = current_setting('kyvzon.t358_bb')::UUID), 'true');

  v_ok := FALSE;
  BEGIN PERFORM public.bonus_create(current_setting('kyvzon.t358_eb')::UUID,
          'other', 1000, 'أجنبي');
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('10.12 لا إنشاء لموظف أجنبيّ', v_ok::TEXT, 'true');
END $$;

\echo ''
\echo '═══ ★★ حرّاس الأدوار ═══'

DO $$
DECLARE v_ok BOOLEAN;
BEGIN
  PERFORM set_config('request.jwt.claim.sub',
    '11580001-0000-0000-0000-000000000001', TRUE);

  v_ok := FALSE;
  BEGIN PERFORM public.bonus_summary();
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('11.1 الموظف لا يرى الملخّص', v_ok::TEXT, 'true');

  v_ok := FALSE;
  BEGIN PERFORM public.bonus_board(NULL,NULL,NULL,FALSE,10);
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('11.2 الموظف لا يرى اللوحة', v_ok::TEXT, 'true');

  -- ★ نُمرّر **ناصر** لا سالم: لو مرّرنا سالم لأمكن أن يمسكه حارس آخر
  v_ok := FALSE;
  BEGIN PERFORM public.bonus_create(current_setting('kyvzon.t358_e2')::UUID,
          'other', 1000, 'ذاتيّ');
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('11.3 الموظف لا يُنشئ مكافأة', v_ok::TEXT, 'true');

  v_ok := FALSE;
  BEGIN PERFORM public.bonus_decide(
    current_setting('kyvzon.t358_bc')::UUID, 'approved');
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('11.4 الموظف لا يبتّ', v_ok::TEXT, 'true');
  PERFORM pg_temp.chk('11.5 الحالة لم تتغيّر',
    (SELECT status FROM public.bonuses
      WHERE id = current_setting('kyvzon.t358_bc')::UUID), 'pending');
END $$;

DO $$
DECLARE v_ok BOOLEAN := FALSE;
BEGIN
  -- المدير ليس staff
  PERFORM set_config('request.jwt.claim.sub',
    '44580004-0000-0000-0000-000000000004', TRUE);
  BEGIN PERFORM public.bonus_summary();
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('11.6 المدير ليس staff', v_ok::TEXT, 'true');
END $$;

DO $$
DECLARE v_id UUID;
BEGIN
  -- admin يعمل
  PERFORM set_config('request.jwt.claim.sub',
    '55580005-0000-0000-0000-000000000005', TRUE);
  v_id := public.bonus_create(current_setting('kyvzon.t358_e1')::UUID,
            'other', 75000, 'من المسؤول');
  PERFORM pg_temp.chk('11.7 admin يُنشئ مكافأة', (v_id IS NOT NULL)::TEXT, 'true');
  PERFORM public.bonus_decide(v_id, 'approved');
  PERFORM pg_temp.chk('11.8 approved_by = admin',
    (SELECT approved_by::TEXT FROM public.bonuses WHERE id=v_id),
    '55580005-0000-0000-0000-000000000005');
  PERFORM set_config('request.jwt.claim.sub',
    '33580003-0000-0000-0000-000000000003', TRUE);
END $$;

\echo ''
\echo '═══ ★ الصلاحيات والقيود ═══'

DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY['bonus_summary','bonus_board','bonus_create',
                           'bonus_decide','bonus_archive'] LOOP
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

  FOREACH f IN ARRAY ARRAY['bonuses_status_chk','bonuses_type_chk',
                           'bonuses_amount_pos','bonuses_period_chk',
                           'bonuses_employee_id_fkey'] LOOP
    PERFORM pg_temp.chk('12.قيد ' || f,
      (SELECT count(*)::TEXT FROM pg_constraint WHERE conname = f), '1');
  END LOOP;

  PERFORM pg_temp.chk('12.محفّز منع الحذف',
    (SELECT count(*)::TEXT FROM pg_trigger
      WHERE tgname = 'trg_block_bonus_delete'), '1');
END $$;

\echo ''
\echo '✅ 0358 — كل التأكيدات مرّت'
ROLLBACK;
