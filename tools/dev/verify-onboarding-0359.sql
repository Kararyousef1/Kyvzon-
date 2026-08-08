-- ════════════════════════════════════════════════════════════════════════
--  التحقق السلوكيّ من 0359 — التعريف وإنهاء الخدمة
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
 ('a3590000-0000-0000-0000-00000000000a','T359A','شركة ألف','t359a'),
 ('b3590000-0000-0000-0000-00000000000b','T359B','شركة باء','t359b');

INSERT INTO auth.users(id,email) VALUES
 ('11590001-0000-0000-0000-000000000001','salem@t359a'),
 ('22590002-0000-0000-0000-000000000002','nasser@t359a'),
 ('33590003-0000-0000-0000-000000000003','huda@t359a'),
 ('44590004-0000-0000-0000-000000000004','munir@t359a'),
 ('55590005-0000-0000-0000-000000000005','adam@t359a'),
 ('66590006-0000-0000-0000-000000000006','emp@t359b'),
 ('77590007-0000-0000-0000-000000000007','hr@t359b');

INSERT INTO public.profiles (id,tenant_id,full_name,role,department) VALUES
 ('44590004-0000-0000-0000-000000000004','a3590000-0000-0000-0000-00000000000a','منير المدير','manager','المالية');
INSERT INTO public.departments (id,tenant_id,name_ar,manager_id) VALUES
 ('d3590000-0000-0000-0000-00000000000d','a3590000-0000-0000-0000-00000000000a','المالية',
  '44590004-0000-0000-0000-000000000004');
INSERT INTO public.profiles (id,tenant_id,full_name,role,department) VALUES
 ('11590001-0000-0000-0000-000000000001','a3590000-0000-0000-0000-00000000000a','سالم الأول','employee','المالية'),
 ('22590002-0000-0000-0000-000000000002','a3590000-0000-0000-0000-00000000000a','ناصر الثاني','employee','المالية'),
 ('33590003-0000-0000-0000-000000000003','a3590000-0000-0000-0000-00000000000a','هدى الموارد','hr','الموارد'),
 ('55590005-0000-0000-0000-000000000005','a3590000-0000-0000-0000-00000000000a','آدم المسؤول','admin','الإدارة'),
 ('66590006-0000-0000-0000-000000000006','b3590000-0000-0000-0000-00000000000b','أجنبي','employee','المالية'),
 ('77590007-0000-0000-0000-000000000007','b3590000-0000-0000-0000-00000000000b','مورد باء','hr','الموارد');

SELECT set_config('kyvzon.t359_e1',
  (SELECT e.id::TEXT FROM public.employees e WHERE e.user_id='11590001-0000-0000-0000-000000000001'), FALSE),
       set_config('kyvzon.t359_e2',
  (SELECT e.id::TEXT FROM public.employees e WHERE e.user_id='22590002-0000-0000-0000-000000000002'), FALSE),
       set_config('kyvzon.t359_hr',
  (SELECT e.id::TEXT FROM public.employees e WHERE e.user_id='33590003-0000-0000-0000-000000000003'), FALSE),
       set_config('kyvzon.t359_eb',
  (SELECT e.id::TEXT FROM public.employees e WHERE e.user_id='66590006-0000-0000-0000-000000000006'), FALSE);

-- ثلاث مهامّ: اثنتان إلزاميّتان وواحدة اختيارية · ورابعة معطَّلة
INSERT INTO public.onboarding_tasks
  (id, tenant_id, title, task_type, sort_order, is_mandatory, is_active) VALUES
 ('7a590000-0000-0000-0000-00000000000a','a3590000-0000-0000-0000-00000000000a',
  'توقيع العقد','document',1,TRUE,TRUE),
 ('7a590000-0000-0000-0000-00000000000b','a3590000-0000-0000-0000-00000000000a',
  'تسليم الحاسوب','equipment',2,TRUE,TRUE),
 ('7a590000-0000-0000-0000-00000000000c','a3590000-0000-0000-0000-00000000000a',
  'جولة تعريفية','general',3,FALSE,TRUE),
 ('7a590000-0000-0000-0000-00000000000d','a3590000-0000-0000-0000-00000000000a',
  'مهمة معطَّلة','general',4,FALSE,FALSE);

SET LOCAL request.jwt.claim.sub = '33590003-0000-0000-0000-000000000003';

\echo ''
\echo '═══ ★★★ ② بدء التعريف مرّتين لا يُضاعف المهام ═══'

DO $$
DECLARE v_n INTEGER;
BEGIN
  v_n := public.onboarding_start(current_setting('kyvzon.t359_e1')::UUID);
  -- ثلاث مهامّ مفعّلة (الرابعة معطَّلة)
  PERFORM pg_temp.chk('2.1 البدء يُنشئ 3 مهامّ', v_n::TEXT, '3');

  -- ★★★ الضغط الثاني — كان يُضاعف
  v_n := public.onboarding_start(current_setting('kyvzon.t359_e1')::UUID);
  PERFORM pg_temp.chk('2.2 الضغط الثاني يُنشئ 0', v_n::TEXT, '0');
  PERFORM pg_temp.chk('2.3 الصفوف تبقى 3',
    (SELECT count(*)::TEXT FROM public.employee_onboarding
      WHERE employee_id = current_setting('kyvzon.t359_e1')::UUID), '3');

  -- ★ والمعطَّلة لا تدخل
  PERFORM pg_temp.chk('2.4 المهمة المعطَّلة خارج',
    (SELECT count(*)::TEXT FROM public.employee_onboarding
      WHERE task_id = '7a590000-0000-0000-0000-00000000000d'), '0');
END $$;

-- ★★ والفهرس الفريد يحرس الإدراج المباشر
DO $$
DECLARE v_ok BOOLEAN := FALSE;
BEGIN
  BEGIN
    INSERT INTO public.employee_onboarding (tenant_id, employee_id, task_id, status)
    VALUES ('a3590000-0000-0000-0000-00000000000a',
            current_setting('kyvzon.t359_e1')::UUID,
            '7a590000-0000-0000-0000-00000000000a','pending');
  EXCEPTION WHEN unique_violation THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('2.5 uq_onboarding_emp_task يحرس', v_ok::TEXT, 'true');
END $$;

-- ★ مهمة جديدة تُضاف لاحقاً تلتحق بالتعريف القائم
DO $$
DECLARE v_n INTEGER;
BEGIN
  INSERT INTO public.onboarding_tasks
    (id, tenant_id, title, task_type, sort_order, is_mandatory, is_active)
  VALUES ('7a590000-0000-0000-0000-00000000000e','a3590000-0000-0000-0000-00000000000a',
          'بطاقة الدخول','equipment',5,TRUE,TRUE);
  v_n := public.onboarding_start(current_setting('kyvzon.t359_e1')::UUID);
  PERFORM pg_temp.chk('2.6 المهمة الجديدة تلتحق', v_n::TEXT, '1');
  PERFORM pg_temp.chk('2.7 المجموع صار 4',
    (SELECT count(*)::TEXT FROM public.employee_onboarding
      WHERE employee_id = current_setting('kyvzon.t359_e1')::UUID), '4');
END $$;

\echo ''
\echo '═══ ★★ حرّاس بدء التعريف ═══'

DO $$
DECLARE v_ok BOOLEAN; v_m TEXT;
BEGIN
  v_ok := FALSE;
  BEGIN PERFORM public.onboarding_start('ffffffff-ffff-ffff-ffff-ffffffffffff');
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('3.1 موظف غير موجود يرمي', v_ok::TEXT, 'true');

  -- ★ مستأجر بلا مهامّ
  v_ok := FALSE; v_m := '';
  PERFORM set_config('request.jwt.claim.sub',
    '77590007-0000-0000-0000-000000000007', TRUE);
  BEGIN PERFORM public.onboarding_start(current_setting('kyvzon.t359_eb')::UUID);
  EXCEPTION WHEN check_violation THEN v_ok := TRUE;
            GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('3.2 بلا مهامّ مفعّلة يرمي', v_ok::TEXT, 'true');
  PERFORM pg_temp.chk('3.3 رمز ONBOARDING_NO_TASKS',
    (position('ONBOARDING_NO_TASKS' IN v_m) > 0)::TEXT, 'true');
  PERFORM set_config('request.jwt.claim.sub',
    '33590003-0000-0000-0000-000000000003', TRUE);
END $$;

\echo ''
\echo '═══ ★★ ⑤/⑦ حالة المهمة و completed_by ═══'

DO $$
DECLARE v_rec UUID; v_ok BOOLEAN; v_m TEXT;
BEGIN
  SELECT o.id INTO v_rec FROM public.employee_onboarding o
   WHERE o.employee_id = current_setting('kyvzon.t359_e1')::UUID
     AND o.task_id = '7a590000-0000-0000-0000-00000000000a';
  PERFORM set_config('kyvzon.t359_rec1', v_rec::TEXT, FALSE);

  PERFORM public.onboarding_set_task(v_rec, 'completed');
  PERFORM pg_temp.chk('4.1 الإتمام يعمل',
    (SELECT status FROM public.employee_onboarding WHERE id=v_rec), 'completed');
  -- ★★ العطل ⑦: مَن أتمّ المهمة يُسجَّل
  PERFORM pg_temp.chk('4.2 completed_by يُكتب',
    (SELECT completed_by::TEXT FROM public.employee_onboarding WHERE id=v_rec),
    '33590003-0000-0000-0000-000000000003');
  PERFORM pg_temp.chk('4.3 completed_at يُختم',
    (SELECT (completed_at IS NOT NULL)::TEXT FROM public.employee_onboarding
      WHERE id=v_rec), 'true');

  -- التراجع يمسح الأثر
  PERFORM public.onboarding_set_task(v_rec, 'pending');
  PERFORM pg_temp.chk('4.4 التراجع يمسح completed_by',
    (SELECT (completed_by IS NULL)::TEXT FROM public.employee_onboarding
      WHERE id=v_rec), 'true');
  PERFORM pg_temp.chk('4.5 و completed_at',
    (SELECT (completed_at IS NULL)::TEXT FROM public.employee_onboarding
      WHERE id=v_rec), 'true');

  -- ★★ العطل ⑤: حالة مخترعة
  v_ok := FALSE; v_m := '';
  BEGIN PERFORM public.onboarding_set_task(v_rec, 'حالة مخترعة');
  EXCEPTION WHEN check_violation THEN v_ok := TRUE;
            GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('4.6 حالة مخترعة مرفوضة', v_ok::TEXT, 'true');
  PERFORM pg_temp.chk('4.7 رمز ONBOARDING_BAD_STATUS',
    (position('ONBOARDING_BAD_STATUS' IN v_m) > 0)::TEXT, 'true');

  -- ★ والقيد يحرس الإدراج المباشر
  v_ok := FALSE;
  BEGIN UPDATE public.employee_onboarding SET status='نصّ حرّ' WHERE id=v_rec;
  EXCEPTION WHEN check_violation THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('4.8 CHECK يحرس التعديل المباشر', v_ok::TEXT, 'true');

  -- التخطّي بسبب إلزاميّ
  v_ok := FALSE; v_m := '';
  BEGIN PERFORM public.onboarding_set_task(v_rec, 'skipped');
  EXCEPTION WHEN check_violation THEN v_ok := TRUE;
            GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('4.9 تخطٍّ بلا سبب يرمي', v_ok::TEXT, 'true');
  PERFORM pg_temp.chk('4.10 رمز ONBOARDING_NO_REASON',
    (position('ONBOARDING_NO_REASON' IN v_m) > 0)::TEXT, 'true');

  PERFORM public.onboarding_set_task(v_rec, 'skipped', 'العقد موقَّع سابقاً');
  PERFORM pg_temp.chk('4.11 التخطّي يعمل',
    (SELECT status FROM public.employee_onboarding WHERE id=v_rec), 'skipped');
  PERFORM pg_temp.chk('4.12 السبب يُحفظ',
    (SELECT skipped_reason FROM public.employee_onboarding WHERE id=v_rec),
    'العقد موقَّع سابقاً');
END $$;

\echo ''
\echo '═══ ★★ لوحة التعريف ═══'

DO $$
DECLARE r RECORD;
BEGIN
  -- ★ أتممنا مهمّتين: «تسليم الحاسوب» و«الجولة»، وتخطّينا «توقيع العقد»
  PERFORM public.onboarding_set_task(
    (SELECT id FROM public.employee_onboarding
      WHERE employee_id = current_setting('kyvzon.t359_e1')::UUID
        AND task_id='7a590000-0000-0000-0000-00000000000b'), 'completed');
  PERFORM public.onboarding_set_task(
    (SELECT id FROM public.employee_onboarding
      WHERE employee_id = current_setting('kyvzon.t359_e1')::UUID
        AND task_id='7a590000-0000-0000-0000-00000000000c'), 'completed');

  SELECT * INTO r FROM public.onboarding_board(NULL, 100)
   WHERE out_employee_id = current_setting('kyvzon.t359_e1')::UUID;

  PERFORM pg_temp.chk('5.1 المجموع', r.out_total::TEXT, '4');
  PERFORM pg_temp.chk('5.2 المكتمل', r.out_completed::TEXT, '2');
  PERFORM pg_temp.chk('5.3 المتخطّى', r.out_skipped::TEXT, '1');
  -- ★★ الإلزاميّ المتبقّي: «بطاقة الدخول» وحدها (العقد متخطّى والحاسوب مكتمل)
  PERFORM pg_temp.chk('5.4 الإلزاميّ المتبقّي', r.out_mandatory_left::TEXT, '1');
  -- ★★ التقدّم = (2 مكتمل + 1 متخطّى) ÷ 4 × 100 = 75.0
  PERFORM pg_temp.chk('5.5 التقدّم يحتسب المتخطّى', r.out_progress::TEXT, '75.0');

  PERFORM pg_temp.chk('5.6 الاسم من profiles', r.out_employee_name, 'سالم الأول');
  PERFORM pg_temp.chk('5.7 القسم', r.out_department, 'المالية');
  PERFORM pg_temp.chk('5.8 المهامّ في JSONB',
    jsonb_array_length(r.out_tasks)::TEXT, '4');
  -- ★ الترتيب بـsort_order: «توقيع العقد» أولاً
  PERFORM pg_temp.chk('5.9 الترتيب بـsort_order',
    (r.out_tasks -> 0 ->> 'title'), 'توقيع العقد');
  PERFORM pg_temp.chk('5.10 سبب التخطّي في JSONB',
    (r.out_tasks -> 0 ->> 'skippedReason'), 'العقد موقَّع سابقاً');
  -- ★ اسم مَن أتمّ المهمة
  PERFORM pg_temp.chk('5.11 اسم المُنجِز',
    (r.out_tasks -> 1 ->> 'completer'), 'هدى الموارد');
  PERFORM pg_temp.chk('5.12 علَم الإلزاميّ',
    (r.out_tasks -> 0 ->> 'mandatory'), 'true');
END $$;

\echo ''
\echo '═══ ★★★ ① إنهاء الخدمة — السجلّ والتعطيل معاً ═══'

DO $$
DECLARE v_id UUID;
BEGIN
  PERFORM pg_temp.chk('6.0 الموظف نشط قبل الإنهاء',
    (SELECT is_active::TEXT FROM public.employees
      WHERE id = current_setting('kyvzon.t359_e2')::UUID), 'true');

  v_id := public.offboarding_execute(
    current_setting('kyvzon.t359_e2')::UUID, DATE '2026-08-31',
    'فرصة أفضل', 'voluntary', 'مقابلة خروج إيجابية');
  PERFORM set_config('kyvzon.t359_off', v_id::TEXT, FALSE);

  PERFORM pg_temp.chk('6.1 السجلّ يُكتب', (v_id IS NOT NULL)::TEXT, 'true');
  -- ★★★ العطل ①: التعطيل كان يفشل ويترك السجلّ يتيماً
  PERFORM pg_temp.chk('6.2 الموظف عُطِّل فعلاً',
    (SELECT is_active::TEXT FROM public.employees
      WHERE id = current_setting('kyvzon.t359_e2')::UUID), 'false');
  PERFORM pg_temp.chk('6.3 conducted_by يُسجَّل',
    (SELECT conducted_by::TEXT FROM public.offboarding_records WHERE id=v_id),
    '33590003-0000-0000-0000-000000000003');
  PERFORM pg_temp.chk('6.4 ملاحظات المقابلة',
    (SELECT exit_interview_notes FROM public.offboarding_records WHERE id=v_id),
    'مقابلة خروج إيجابية');
END $$;

DO $$
DECLARE v_ok BOOLEAN; v_m TEXT;
BEGIN
  -- ★★ العطل ⑥: لا سجلّ ثانٍ
  v_ok := FALSE; v_m := '';
  BEGIN PERFORM public.offboarding_execute(
    current_setting('kyvzon.t359_e2')::UUID, DATE '2026-09-30','مرّة ثانية');
  EXCEPTION WHEN unique_violation THEN v_ok := TRUE;
            GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('6.5 لا سجلّ إنهاء ثانٍ', v_ok::TEXT, 'true');
  PERFORM pg_temp.chk('6.6 رمز OFFBOARDING_DUPLICATE',
    (position('OFFBOARDING_DUPLICATE' IN v_m) > 0)::TEXT, 'true');
  PERFORM pg_temp.chk('6.7 سجلّ واحد فقط',
    (SELECT count(*)::TEXT FROM public.offboarding_records
      WHERE employee_id = current_setting('kyvzon.t359_e2')::UUID), '1');

  -- ★ والفهرس يحرس الإدراج المباشر
  v_ok := FALSE;
  BEGIN
    INSERT INTO public.offboarding_records
      (tenant_id, employee_id, last_working_day, reason, exit_type)
    VALUES ('a3590000-0000-0000-0000-00000000000a',
            current_setting('kyvzon.t359_e2')::UUID, DATE '2026-10-01','مباشر','voluntary');
  EXCEPTION WHEN unique_violation THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('6.8 uq_offboarding_per_employee يحرس', v_ok::TEXT, 'true');
END $$;

\echo ''
\echo '═══ ★★ حرّاس إنهاء الخدمة ═══'

DO $$
DECLARE v_ok BOOLEAN; v_m TEXT;
BEGIN
  v_ok := FALSE; v_m := '';
  BEGIN PERFORM public.offboarding_execute(
    current_setting('kyvzon.t359_e1')::UUID, DATE '2026-08-31','س','نوع مخترع');
  EXCEPTION WHEN check_violation THEN v_ok := TRUE;
            GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('7.1 نوع مخترع يرمي', v_ok::TEXT, 'true');
  PERFORM pg_temp.chk('7.2 رمز OFFBOARDING_BAD_TYPE',
    (position('OFFBOARDING_BAD_TYPE' IN v_m) > 0)::TEXT, 'true');

  v_ok := FALSE; v_m := '';
  BEGIN PERFORM public.offboarding_execute(
    current_setting('kyvzon.t359_e1')::UUID, DATE '2026-08-31','   ');
  EXCEPTION WHEN check_violation THEN v_ok := TRUE;
            GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('7.3 سبب فارغ يرمي', v_ok::TEXT, 'true');
  PERFORM pg_temp.chk('7.4 رمز OFFBOARDING_NO_REASON',
    (position('OFFBOARDING_NO_REASON' IN v_m) > 0)::TEXT, 'true');

  v_ok := FALSE; v_m := '';
  BEGIN PERFORM public.offboarding_execute(
    current_setting('kyvzon.t359_e1')::UUID, NULL, 'سبب');
  EXCEPTION WHEN check_violation THEN v_ok := TRUE;
            GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('7.5 تاريخ ناقص يرمي', v_ok::TEXT, 'true');
  PERFORM pg_temp.chk('7.6 رمز OFFBOARDING_NO_DATE',
    (position('OFFBOARDING_NO_DATE' IN v_m) > 0)::TEXT, 'true');

  -- ★★ لا يُنهي المرء خدمة نفسه
  v_ok := FALSE; v_m := '';
  BEGIN PERFORM public.offboarding_execute(
    current_setting('kyvzon.t359_hr')::UUID, DATE '2026-08-31','ذاتيّ');
  EXCEPTION WHEN check_violation THEN v_ok := TRUE;
            GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('7.7 لا إنهاء ذاتيّ', v_ok::TEXT, 'true');
  PERFORM pg_temp.chk('7.8 رمز OFFBOARDING_SELF',
    (position('OFFBOARDING_SELF' IN v_m) > 0)::TEXT, 'true');
  PERFORM pg_temp.chk('7.9 و هدى ما زالت نشطة',
    (SELECT is_active::TEXT FROM public.employees
      WHERE id = current_setting('kyvzon.t359_hr')::UUID), 'true');

  -- ★ الحذف ممنوع
  v_ok := FALSE; v_m := '';
  BEGIN DELETE FROM public.offboarding_records
         WHERE id = current_setting('kyvzon.t359_off')::UUID;
  EXCEPTION WHEN check_violation THEN v_ok := TRUE;
            GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('7.10 حذف السجلّ ممنوع', v_ok::TEXT, 'true');
  PERFORM pg_temp.chk('7.11 رمز OFFBOARDING_IMMUTABLE',
    (position('OFFBOARDING_IMMUTABLE' IN v_m) > 0)::TEXT, 'true');
END $$;

\echo ''
\echo '═══ ★ ⑧ إجراءات ما بعد الإنهاء ═══'

DO $$
DECLARE r RECORD;
BEGIN
  PERFORM pg_temp.chk('8.1 الصلاحيات لم تُسحب بعد',
    (SELECT access_revoked::TEXT FROM public.offboarding_records
      WHERE id = current_setting('kyvzon.t359_off')::UUID), 'false');

  PERFORM public.offboarding_update_checklist(
    current_setting('kyvzon.t359_off')::UUID, TRUE, TRUE,
    ARRAY['حاسوب محمول','بطاقة دخول']);

  SELECT * INTO r FROM public.offboarding_board(NULL,NULL,100)
   WHERE out_id = current_setting('kyvzon.t359_off')::UUID;
  PERFORM pg_temp.chk('8.2 الصلاحيات سُحبت', r.out_access_revoked::TEXT, 'true');
  PERFORM pg_temp.chk('8.3 التصفية تمّت', r.out_settlement::TEXT, 'true');
  PERFORM pg_temp.chk('8.4 العهدة مُسجَّلة',
    array_length(r.out_assets,1)::TEXT, '2');
  PERFORM pg_temp.chk('8.5 اسم المُنفِّذ', r.out_conductor, 'هدى الموارد');
  -- ★★★ العطل ①: الكشف عن الحالة الشاذّة
  PERFORM pg_temp.chk('8.6 الموظف ليس نشطاً', r.out_still_active::TEXT, 'false');
END $$;

\echo ''
\echo '═══ ★★ لوحة إنهاء الخدمة ═══'

DO $$
DECLARE v_n INTEGER; r RECORD; v_ok BOOLEAN; v_m TEXT;
BEGIN
  SELECT count(*) INTO v_n FROM public.offboarding_board(NULL,NULL,100);
  PERFORM pg_temp.chk('9.1 سجلّ واحد', v_n::TEXT, '1');

  SELECT count(*) INTO v_n FROM public.offboarding_board('voluntary',NULL,100);
  PERFORM pg_temp.chk('9.2 ترشيح voluntary', v_n::TEXT, '1');
  SELECT count(*) INTO v_n FROM public.offboarding_board('retirement',NULL,100);
  PERFORM pg_temp.chk('9.3 ترشيح retirement', v_n::TEXT, '0');

  -- ★ end_contract نوعٌ مشروع (كان يظهر «تقاعد» في العرض)
  SELECT count(*) INTO v_n FROM public.offboarding_board('end_contract',NULL,100);
  PERFORM pg_temp.chk('9.4 end_contract نوع مقبول', v_n::TEXT, '0');

  SELECT count(*) INTO v_n FROM public.offboarding_board(NULL,'ناصر',100);
  PERFORM pg_temp.chk('9.5 البحث بالاسم', v_n::TEXT, '1');
  SELECT count(*) INTO v_n FROM public.offboarding_board(NULL,'فرصة',100);
  PERFORM pg_temp.chk('9.6 البحث بالسبب', v_n::TEXT, '1');
  SELECT count(*) INTO v_n FROM public.offboarding_board(NULL,'لا شيء',100);
  PERFORM pg_temp.chk('9.7 بحث بلا نتيجة', v_n::TEXT, '0');

  v_ok := FALSE; v_m := '';
  BEGIN PERFORM public.offboarding_board('مخترع',NULL,100);
  EXCEPTION WHEN check_violation THEN v_ok := TRUE;
            GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('9.8 نوع مخترع في اللوحة يرمي', v_ok::TEXT, 'true');
  PERFORM pg_temp.chk('9.9 رمز OFFBOARDING_BAD_TYPE',
    (position('OFFBOARDING_BAD_TYPE' IN v_m) > 0)::TEXT, 'true');

  SELECT * INTO r FROM public.offboarding_board(NULL,NULL,100);
  PERFORM pg_temp.chk('9.10 اسم الموظف', r.out_employee_name, 'ناصر الثاني');
  PERFORM pg_temp.chk('9.11 آخر يوم عمل', r.out_last_day::TEXT, '2026-08-31');
END $$;

\echo ''
\echo '═══ ★★ الملخّص ═══'

DO $$
DECLARE r RECORD;
BEGIN
  SELECT * INTO r FROM public.onboarding_summary();
  -- أربع مهامّ مفعّلة (والخامسة معطَّلة)
  PERFORM pg_temp.chk('10.1 المهامّ المفعّلة', r.out_tasks_active::TEXT, '4');
  -- الإلزاميّ: العقد · الحاسوب · بطاقة الدخول = 3
  PERFORM pg_temp.chk('10.2 الإلزاميّ منها', r.out_tasks_mandatory::TEXT, '3');
  -- سالم وحده لديه تعريف، وهو غير مكتمل (3 من 4)
  PERFORM pg_temp.chk('10.3 تعريف جارٍ', r.out_in_progress::TEXT, '1');
  PERFORM pg_temp.chk('10.4 تعريف مكتمل', r.out_finished::TEXT, '0');
  -- المتوسّط = 75.0 (موظف واحد)
  PERFORM pg_temp.chk('10.5 متوسّط التقدّم', r.out_avg_progress::TEXT, '75.0');
  PERFORM pg_temp.chk('10.6 إنهاءات الخدمة', r.out_offboarded::TEXT, '1');
  -- ★★★ لا حالة شاذّة: الموظف عُطِّل مع سجلّه
  PERFORM pg_temp.chk('10.7 لا سجلّ يتيم', r.out_orphan_active::TEXT, '0');
  PERFORM pg_temp.chk('10.8 صلاحيات معلَّقة', r.out_pending_access::TEXT, '0');
END $$;

-- ★★★ إثبات أن `out_orphan_active` يكشف العطل ① فعلاً:
--   نُعيد تنشيط الموظف يدوياً (محاكاة الحالة التي خلّفها العطل)
DO $$
DECLARE r RECORD;
BEGIN
  UPDATE public.employees SET is_active = TRUE
   WHERE id = current_setting('kyvzon.t359_e2')::UUID;
  SELECT * INTO r FROM public.onboarding_summary();
  PERFORM pg_temp.chk('10.9 الحالة الشاذّة تُكشَف', r.out_orphan_active::TEXT, '1');
  SELECT * INTO r FROM public.offboarding_board(NULL,NULL,100);
  PERFORM pg_temp.chk('10.10 واللوحة تُعلمها', r.out_still_active::TEXT, 'true');
  UPDATE public.employees SET is_active = FALSE
   WHERE id = current_setting('kyvzon.t359_e2')::UUID;
END $$;

-- ★★ «لا تعريف جارٍ» ≠ «تقدّم صفر» (درس 0353)
DO $$
DECLARE r RECORD;
BEGIN
  PERFORM set_config('request.jwt.claim.sub',
    '77590007-0000-0000-0000-000000000007', TRUE);
  SELECT * INTO r FROM public.onboarding_summary();
  PERFORM pg_temp.chk('10.11 بلا تعريف: NULL لا صفر',
    COALESCE(r.out_avg_progress::TEXT, 'NULL'), 'NULL');
  PERFORM pg_temp.chk('10.12 مهامّ باء صفر', r.out_tasks_active::TEXT, '0');
  PERFORM set_config('request.jwt.claim.sub',
    '33590003-0000-0000-0000-000000000003', TRUE);
END $$;

\echo ''
\echo '═══ ★★★ العزل بين المستأجرين ═══'

DO $$
DECLARE v_id UUID;
BEGIN
  PERFORM set_config('request.jwt.claim.sub',
    '77590007-0000-0000-0000-000000000007', TRUE);
  -- مهمة ثم تعريف ثم إنهاء في باء
  INSERT INTO public.onboarding_tasks
    (id, tenant_id, title, task_type, sort_order, is_mandatory, is_active)
  VALUES ('7b590000-0000-0000-0000-00000000000b','b3590000-0000-0000-0000-00000000000b',
          'مهمة باء','general',1,TRUE,TRUE);
  PERFORM public.onboarding_start(current_setting('kyvzon.t359_eb')::UUID);
  PERFORM set_config('kyvzon.t359_offb', '', FALSE);
  PERFORM pg_temp.chk('11.1 باء يرى تعريفه وحده',
    (SELECT count(*)::TEXT FROM public.onboarding_board(NULL,100)), '1');
  PERFORM set_config('request.jwt.claim.sub',
    '33590003-0000-0000-0000-000000000003', TRUE);
END $$;

DO $$
DECLARE v_n INTEGER; r RECORD; v_ok BOOLEAN; v_m TEXT;
BEGIN
  SELECT count(*) INTO v_n FROM public.onboarding_board(NULL,500);
  PERFORM pg_temp.chk('11.2 ألف يرى تعريفه وحده', v_n::TEXT, '1');

  SELECT count(*) INTO v_n FROM public.onboarding_board(NULL,500)
   WHERE out_employee_id = current_setting('kyvzon.t359_eb')::UUID;
  PERFORM pg_temp.chk('11.3 اللوحة لا تُسرّب', v_n::TEXT, '0');

  SELECT * INTO r FROM public.onboarding_summary();
  -- ★★ مهامّ ألف الأربع لا خمس (مهمة باء خارج)
  PERFORM pg_temp.chk('11.4 عدّ المهامّ لم يتلوّث', r.out_tasks_active::TEXT, '4');
  PERFORM pg_temp.chk('11.5 التعريف الجاري لم يتلوّث', r.out_in_progress::TEXT, '1');

  -- ★★ بدء تعريف لموظف أجنبيّ
  v_ok := FALSE;
  BEGIN PERFORM public.onboarding_start(current_setting('kyvzon.t359_eb')::UUID);
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('11.6 لا بدء لموظف أجنبيّ', v_ok::TEXT, 'true');

  -- ★★ إنهاء خدمة أجنبيّ
  v_ok := FALSE; v_m := '';
  BEGIN PERFORM public.offboarding_execute(
    current_setting('kyvzon.t359_eb')::UUID, DATE '2026-08-31','محاولة');
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE;
            GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('11.7 لا إنهاء لموظف أجنبيّ', v_ok::TEXT, 'true');
  PERFORM pg_temp.chk('11.8 الرسالة رسالة المستأجر',
    (position('غير موجود في هذا المستأجر' IN v_m) > 0)::TEXT, 'true');
  PERFORM pg_temp.chk('11.9 الأجنبيّ ما زال نشطاً',
    (SELECT is_active::TEXT FROM public.employees
      WHERE id = current_setting('kyvzon.t359_eb')::UUID), 'true');

  -- ★★ تعديل مهمة أجنبية
  v_ok := FALSE;
  BEGIN PERFORM public.onboarding_set_task(
    (SELECT id FROM public.employee_onboarding
      WHERE employee_id = current_setting('kyvzon.t359_eb')::UUID LIMIT 1),
    'completed');
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('11.10 لا تعديل مهمة أجنبية', v_ok::TEXT, 'true');
  PERFORM pg_temp.chk('11.11 حالتها لم تتغيّر',
    (SELECT status FROM public.employee_onboarding
      WHERE employee_id = current_setting('kyvzon.t359_eb')::UUID LIMIT 1), 'pending');
END $$;

\echo ''
\echo '═══ ★★ حرّاس الأدوار ═══'

-- ════════════════════════════════════════════════════════════════════
--  ★★★ ثغرات تغطية كشفتها جولة العكس: INV34 · INV42 · INV44 · INV45
--
--  لم تكن العيّنة تحوي **سجلّ إنهاء خدمة أجنبياً** إطلاقاً، فترشيح
--  المستأجر في `offboarding_board` و`onboarding_summary`
--  و`offboarding_update_checklist` غير مُختبَر — «شرطٌ لا تُوجَد
--  بياناتٌ تخالفه = شرط غير مُختبَر».
--
--  وكانت لوحة التعريف تعرض موظفاً واحداً في ألف، فالحدّ الأعلى بلا أثر.
-- ════════════════════════════════════════════════════════════════════
DO $$
DECLARE v_id UUID;
BEGIN
  PERFORM set_config('request.jwt.claim.sub',
    '77590007-0000-0000-0000-000000000007', TRUE);
  v_id := public.offboarding_execute(
    current_setting('kyvzon.t359_eb')::UUID, DATE '2026-07-15',
    'انتهاء عقد باء', 'end_contract', 'ملاحظات باء');
  PERFORM set_config('kyvzon.t359_offb', v_id::TEXT, FALSE);
  PERFORM pg_temp.chk('11.12 باء يرى إنهاءه وحده',
    (SELECT count(*)::TEXT FROM public.offboarding_board(NULL,NULL,100)), '1');
  PERFORM set_config('request.jwt.claim.sub',
    '33590003-0000-0000-0000-000000000003', TRUE);
END $$;

DO $$
DECLARE v_n INTEGER; r RECORD; v_ok BOOLEAN; v_m TEXT;
BEGIN
  -- ★★★ INV34: لوحة الإنهاء لا تُسرّب سجلّ باء
  SELECT count(*) INTO v_n FROM public.offboarding_board(NULL,NULL,500);
  PERFORM pg_temp.chk('11.13 لوحة الإنهاء: سجلّ ألف وحده', v_n::TEXT, '1');
  SELECT count(*) INTO v_n FROM public.offboarding_board(NULL,NULL,500)
   WHERE out_id = current_setting('kyvzon.t359_offb')::UUID;
  PERFORM pg_temp.chk('11.14 سجلّ باء غائب', v_n::TEXT, '0');
  -- ★ وترشيح النوع لا يكشفه: نوع باء end_contract
  SELECT count(*) INTO v_n FROM public.offboarding_board('end_contract',NULL,500);
  PERFORM pg_temp.chk('11.15 ترشيح end_contract لا يُسرّب', v_n::TEXT, '0');

  -- ★ INV42: عدّ الإنهاءات في الملخّص
  SELECT * INTO r FROM public.onboarding_summary();
  PERFORM pg_temp.chk('11.16 عدّ الإنهاءات لم يتلوّث', r.out_offboarded::TEXT, '1');
  PERFORM pg_temp.chk('11.17 الصلاحيات المعلَّقة لم تتلوّث',
    r.out_pending_access::TEXT, '0');

  -- ★★ INV45: تحديث إجراءات سجلّ أجنبيّ
  v_ok := FALSE; v_m := '';
  BEGIN PERFORM public.offboarding_update_checklist(
    current_setting('kyvzon.t359_offb')::UUID, TRUE, TRUE, NULL);
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE;
            GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('11.18 لا تحديث إجراءات سجلّ أجنبيّ', v_ok::TEXT, 'true');
  PERFORM pg_temp.chk('11.19 الرسالة رسالة المستأجر',
    (position('غير موجود في هذا المستأجر' IN v_m) > 0)::TEXT, 'true');
  PERFORM pg_temp.chk('11.20 سجلّ باء لم يتغيّر',
    (SELECT access_revoked::TEXT FROM public.offboarding_records
      WHERE id = current_setting('kyvzon.t359_offb')::UUID), 'false');
END $$;

-- ★ INV44: الحدّ الأعلى في لوحة التعريف — موظفان على الأقلّ
DO $$
DECLARE v_n INTEGER;
BEGIN
  PERFORM public.onboarding_start(current_setting('kyvzon.t359_e2')::UUID);
  SELECT count(*) INTO v_n FROM public.onboarding_board(NULL,500);
  PERFORM pg_temp.chk('11.21 موظفان في لوحة التعريف', v_n::TEXT, '2');
  SELECT count(*) INTO v_n FROM public.onboarding_board(NULL,1);
  PERFORM pg_temp.chk('11.22 الحدّ الأعلى يعمل', v_n::TEXT, '1');
  SELECT count(*) INTO v_n FROM public.onboarding_board('سالم',500);
  PERFORM pg_temp.chk('11.23 البحث بالاسم', v_n::TEXT, '1');
  SELECT count(*) INTO v_n FROM public.onboarding_board('لا أحد',500);
  PERFORM pg_temp.chk('11.24 بحث بلا نتيجة', v_n::TEXT, '0');
END $$;

DO $$
DECLARE v_ok BOOLEAN; v_m TEXT;
BEGIN
  PERFORM set_config('request.jwt.claim.sub',
    '11590001-0000-0000-0000-000000000001', TRUE);

  v_ok := FALSE;
  BEGIN PERFORM public.onboarding_board(NULL,10);
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('12.1 الموظف لا يرى اللوحة', v_ok::TEXT, 'true');

  v_ok := FALSE;
  BEGIN PERFORM public.offboarding_board(NULL,NULL,10);
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('12.2 الموظف لا يرى الإنهاءات', v_ok::TEXT, 'true');

  v_ok := FALSE;
  BEGIN PERFORM public.onboarding_summary();
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('12.3 الموظف لا يرى الملخّص', v_ok::TEXT, 'true');

  -- ★ نُمرّر **ناصر** لا سالم: حارس الدور هو المقصود لا حارس آخر
  v_ok := FALSE;
  BEGIN PERFORM public.onboarding_start(current_setting('kyvzon.t359_e2')::UUID);
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('12.4 الموظف لا يبدأ تعريفاً', v_ok::TEXT, 'true');

  -- ★★ ثغرة تغطية كشفها INV23: كان التأكيد يمرّر **سالم نفسه**
  --   فيمسكه حارس الإنهاء الذاتيّ (OFFBOARDING_SELF) قبل أن يصل
  --   إلى حارس الدور — والاختبار ينجح حتى بلا حارس الدور.
  --   نمرّر **منيراً** (موظف آخر) ونُلزم نصّ رسالة الدور.
  v_ok := FALSE; v_m := '';
  BEGIN PERFORM public.offboarding_execute(
    (SELECT id FROM public.employees
      WHERE user_id='44590004-0000-0000-0000-000000000004'),
    DATE '2026-08-31','محاولة');
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE;
            GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('12.5 الموظف لا يُنهي خدمة', v_ok::TEXT, 'true');
  PERFORM pg_temp.chk('12.5b الرسالة رسالة الدور لا الإنهاء الذاتيّ',
    (position('غير مصرَّح بإنهاء الخدمة' IN v_m) > 0)::TEXT, 'true');
  PERFORM pg_temp.chk('12.6 ومنير ما زال نشطاً',
    (SELECT is_active::TEXT FROM public.employees
      WHERE user_id = '44590004-0000-0000-0000-000000000004'), 'true');
  PERFORM pg_temp.chk('12.6b ولا سجلّ إنهاء له',
    (SELECT count(*)::TEXT FROM public.offboarding_records o
      JOIN public.employees e ON e.id = o.employee_id
     WHERE e.user_id = '44590004-0000-0000-0000-000000000004'), '0');

  v_ok := FALSE;
  BEGIN PERFORM public.onboarding_set_task(
    current_setting('kyvzon.t359_rec1')::UUID, 'completed');
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('12.7 الموظف لا يُتمّ مهمة', v_ok::TEXT, 'true');
END $$;

DO $$
DECLARE v_ok BOOLEAN := FALSE;
BEGIN
  -- المدير ليس staff
  PERFORM set_config('request.jwt.claim.sub',
    '44590004-0000-0000-0000-000000000004', TRUE);
  BEGIN PERFORM public.onboarding_board(NULL,10);
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('12.8 المدير ليس staff', v_ok::TEXT, 'true');
END $$;

DO $$
DECLARE v_n INTEGER;
BEGIN
  -- admin يعمل
  PERFORM set_config('request.jwt.claim.sub',
    '55590005-0000-0000-0000-000000000005', TRUE);
  SELECT count(*) INTO v_n FROM public.onboarding_board(NULL,100);
  -- ★ اثنان بعد التأكيد 11.21 (سالم وناصر)
  PERFORM pg_temp.chk('12.9 admin يرى اللوحة', v_n::TEXT, '2');
  PERFORM set_config('request.jwt.claim.sub',
    '33590003-0000-0000-0000-000000000003', TRUE);
END $$;

\echo ''
\echo '═══ ★ الصلاحيات والقيود ═══'

DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY['onboarding_start','onboarding_set_task',
                           'onboarding_board','onboarding_summary',
                           'offboarding_execute','offboarding_board',
                           'offboarding_update_checklist'] LOOP
    PERFORM pg_temp.chk('13.' || f || ' — لا PUBLIC',
      (SELECT bool_or(has_function_privilege('public', p.oid, 'EXECUTE'))::TEXT
         FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.proname=f), 'false');
    PERFORM pg_temp.chk('13.' || f || ' — لا anon',
      (SELECT bool_or(has_function_privilege('anon', p.oid, 'EXECUTE'))::TEXT
         FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.proname=f), 'false');
    PERFORM pg_temp.chk('13.' || f || ' — authenticated',
      (SELECT bool_or(has_function_privilege('authenticated', p.oid, 'EXECUTE'))::TEXT
         FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.proname=f), 'true');
  END LOOP;

  FOREACH f IN ARRAY ARRAY['employee_onboarding_status_chk',
                           'offboarding_records_type_chk',
                           'employee_onboarding_employee_id_fkey',
                           'offboarding_records_employee_id_fkey'] LOOP
    PERFORM pg_temp.chk('13.قيد ' || f,
      (SELECT count(*)::TEXT FROM pg_constraint WHERE conname = f), '1');
  END LOOP;

  FOREACH f IN ARRAY ARRAY['uq_onboarding_emp_task','uq_offboarding_per_employee'] LOOP
    PERFORM pg_temp.chk('13.فهرس ' || f,
      (SELECT count(*)::TEXT FROM pg_indexes WHERE indexname = f), '1');
  END LOOP;

  PERFORM pg_temp.chk('13.محفّز منع الحذف',
    (SELECT count(*)::TEXT FROM pg_trigger
      WHERE tgname = 'trg_block_offboarding_delete'), '1');
END $$;

\echo ''
\echo '✅ 0359 — كل التأكيدات مرّت'
ROLLBACK;
