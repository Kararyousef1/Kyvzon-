-- ════════════════════════════════════════════════════════════════════════
--  التحقق السلوكيّ من 0361 — تخطيط التعاقب
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
 ('a3610000-0000-0000-0000-00000000000a','T361A','شركة ألف','t361a'),
 ('b3610000-0000-0000-0000-00000000000b','T361B','شركة باء','t361b');

INSERT INTO auth.users(id,email) VALUES
 ('11610001-0000-0000-0000-000000000001','salem@t361a'),
 ('22610002-0000-0000-0000-000000000002','nasser@t361a'),
 ('33610003-0000-0000-0000-000000000003','huda@t361a'),
 ('44610004-0000-0000-0000-000000000004','munir@t361a'),
 ('55610005-0000-0000-0000-000000000005','adam@t361a'),
 ('66610006-0000-0000-0000-000000000006','emp@t361b'),
 ('77610007-0000-0000-0000-000000000007','hr@t361b');

-- ★ المدير أولاً ثم القسم (درس 0357: منير أُنشئ قبل departments)
INSERT INTO public.profiles (id,tenant_id,full_name,role,department) VALUES
 ('44610004-0000-0000-0000-000000000004','a3610000-0000-0000-0000-00000000000a','منير المدير','manager','المالية');
INSERT INTO public.departments (id,tenant_id,name_ar,manager_id) VALUES
 ('d3610000-0000-0000-0000-00000000000d','a3610000-0000-0000-0000-00000000000a','المالية',
  '44610004-0000-0000-0000-000000000004'),
 ('d3610000-0000-0000-0000-00000000000e','b3610000-0000-0000-0000-00000000000b','مالية باء',NULL);
INSERT INTO public.profiles (id,tenant_id,full_name,role,department) VALUES
 ('11610001-0000-0000-0000-000000000001','a3610000-0000-0000-0000-00000000000a','سالم الأول','employee','المالية'),
 ('22610002-0000-0000-0000-000000000002','a3610000-0000-0000-0000-00000000000a','ناصر الثاني','employee','المالية'),
 ('33610003-0000-0000-0000-000000000003','a3610000-0000-0000-0000-00000000000a','هدى الموارد','hr','الموارد'),
 ('55610005-0000-0000-0000-000000000005','a3610000-0000-0000-0000-00000000000a','آدم المسؤول','admin','الإدارة'),
 ('66610006-0000-0000-0000-000000000006','b3610000-0000-0000-0000-00000000000b','أجنبي باء','employee','المالية'),
 ('77610007-0000-0000-0000-000000000007','b3610000-0000-0000-0000-00000000000b','مورد باء','hr','الموارد');

SELECT set_config('kyvzon.t361_e1',
  (SELECT e.id::TEXT FROM public.employees e WHERE e.user_id='11610001-0000-0000-0000-000000000001'), FALSE),
       set_config('kyvzon.t361_e2',
  (SELECT e.id::TEXT FROM public.employees e WHERE e.user_id='22610002-0000-0000-0000-000000000002'), FALSE),
       set_config('kyvzon.t361_mg',
  (SELECT e.id::TEXT FROM public.employees e WHERE e.user_id='44610004-0000-0000-0000-000000000004'), FALSE),
       set_config('kyvzon.t361_ad',
  (SELECT e.id::TEXT FROM public.employees e WHERE e.user_id='55610005-0000-0000-0000-000000000005'), FALSE),
       set_config('kyvzon.t361_eb',
  (SELECT e.id::TEXT FROM public.employees e WHERE e.user_id='66610006-0000-0000-0000-000000000006'), FALSE);

-- ★★ منصبٌ في باء يوجد **منذ العيّنة** — يحتاجه التأكيد 5.5 (كشفه INV13)
INSERT INTO public.critical_positions (id,tenant_id,title,risk_level)
VALUES ('c3610000-0000-0000-0000-00000000000b','b3610000-0000-0000-0000-00000000000b',
        'منصب باء الأصلي','high');

SET LOCAL request.jwt.claim.sub = '33610003-0000-0000-0000-000000000003';

\echo ''
\echo '═══ ① بنية الجداول والقيود ═══'

DO $$
BEGIN
  PERFORM pg_temp.chk('1.1 FK الشاغل مركَّب',
    (SELECT count(*)::TEXT FROM pg_constraint
      WHERE conname='critical_positions_incumbent_tenant_fkey' AND contype='f'), '1');
  PERFORM pg_temp.chk('1.2 FK القسم مركَّب',
    (SELECT count(*)::TEXT FROM pg_constraint
      WHERE conname='critical_positions_department_tenant_fkey' AND contype='f'), '1');
  PERFORM pg_temp.chk('1.3 FK المرشّح مركَّب',
    (SELECT count(*)::TEXT FROM pg_constraint
      WHERE conname='succession_candidates_employee_tenant_fkey' AND contype='f'), '1');
  PERFORM pg_temp.chk('1.4 FK المنصب مركَّب',
    (SELECT count(*)::TEXT FROM pg_constraint
      WHERE conname='succession_candidates_position_tenant_fkey' AND contype='f'), '1');

  -- ★★★ العطل ⑪: CASCADE القديم أُسقط
  PERFORM pg_temp.chk('1.5 FK المنصب القديم (CASCADE) أُسقط',
    (SELECT count(*)::TEXT FROM pg_constraint
      WHERE conname='succession_candidates_critical_position_id_fkey'), '0');
  PERFORM pg_temp.chk('1.6 والجديد RESTRICT لا CASCADE',
    (SELECT (pg_get_constraintdef(oid) LIKE '%ON DELETE RESTRICT%')::TEXT
       FROM pg_constraint
      WHERE conname='succession_candidates_position_tenant_fkey'), 'true');

  PERFORM pg_temp.chk('1.7 قيد اتّساق الدرجة/المستوى',
    (SELECT count(*)::TEXT FROM pg_constraint
      WHERE conname='succession_candidates_score_level_chk'), '1');
  PERFORM pg_temp.chk('1.8 readiness_score صار NOT NULL',
    (SELECT attnotnull::TEXT FROM pg_attribute
      WHERE attrelid='public.succession_candidates'::regclass
        AND attname='readiness_score'), 'true');

  PERFORM pg_temp.chk('1.9 محفّزا منع الحذف',
    (SELECT count(*)::TEXT FROM pg_trigger
      WHERE tgname IN ('trg_block_succession_candidate_delete',
                       'trg_block_critical_position_delete')), '2');

  -- ★★★ hybrid_gate يبقى RESTRICTIVE في الجدولين (درس 0355)
  PERFORM pg_temp.chk('1.10 hybrid_gate المناصب RESTRICTIVE',
    (SELECT (NOT polpermissive)::TEXT FROM pg_policy
      WHERE polname='hybrid_gate_critical_positions'), 'true');
  PERFORM pg_temp.chk('1.11 hybrid_gate المرشّحين RESTRICTIVE',
    (SELECT (NOT polpermissive)::TEXT FROM pg_policy
      WHERE polname='hybrid_gate_succession_candidates'), 'true');
END $$;

\echo ''
\echo '═══ ★★★ ② رتبة الجاهزية منطقية لا أبجدية (العطل ①) ═══'

DO $$
BEGIN
  PERFORM pg_temp.chk('2.1 ready_now = 1',
    public.succession_readiness_rank('ready_now')::TEXT, '1');
  PERFORM pg_temp.chk('2.2 ready_6_months = 2',
    public.succession_readiness_rank('ready_6_months')::TEXT, '2');
  PERFORM pg_temp.chk('2.3 ready_12_months = 3',
    public.succession_readiness_rank('ready_12_months')::TEXT, '3');
  PERFORM pg_temp.chk('2.4 future_potential = 4',
    public.succession_readiness_rank('future_potential')::TEXT, '4');

  -- ★★★ الترتيب الأبجديّ كان يعطي: future < ready_12 < ready_6 < ready_now
  --   أي أن ready_now **الأخير** فيُقصيه slice(0,3)
  PERFORM pg_temp.chk('2.5 الأبجديّ يضع ready_now آخراً',
    (SELECT string_agg(l,'<' ORDER BY l) FROM
      (VALUES ('ready_now'),('ready_6_months'),('ready_12_months'),
              ('future_potential')) t(l)),
    'future_potential<ready_12_months<ready_6_months<ready_now');
  PERFORM pg_temp.chk('2.6 والمنطقيّ يضعه أولاً',
    (SELECT string_agg(l,'<' ORDER BY public.succession_readiness_rank(l)) FROM
      (VALUES ('ready_now'),('ready_6_months'),('ready_12_months'),
              ('future_potential')) t(l)),
    'ready_now<ready_6_months<ready_12_months<future_potential');
END $$;

\echo ''
\echo '═══ ★★★ ③ العطلان ②/③: الشاغل المعدوم والأجنبيّ ═══'

DO $$
DECLARE v_ok BOOLEAN; v_m TEXT; v_before INTEGER;
BEGIN
  v_before := (SELECT count(*) FROM public.critical_positions);

  v_ok := FALSE;
  BEGIN
    INSERT INTO public.critical_positions (tenant_id,title,incumbent_employee_id,risk_level)
    VALUES ('a3610000-0000-0000-0000-00000000000a','منصب',
            'ffffffff-ffff-ffff-ffff-ffffffffffff','high');
  EXCEPTION WHEN foreign_key_violation THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('3.1 FK يرفض شاغلاً معدوماً', v_ok::TEXT, 'true');

  -- ★★★ الفخّ الحقيقيّ: شاغلٌ موجود لكن في مستأجرٍ آخر
  v_ok := FALSE;
  BEGIN
    INSERT INTO public.critical_positions (tenant_id,title,incumbent_employee_id,risk_level)
    VALUES ('a3610000-0000-0000-0000-00000000000a','منصب',
            current_setting('kyvzon.t361_eb')::UUID,'high');
  EXCEPTION WHEN foreign_key_violation THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('3.2 FK المركَّب يرفض شاغل مستأجر آخر', v_ok::TEXT, 'true');

  -- ★ والقسم كذلك
  v_ok := FALSE;
  BEGIN
    INSERT INTO public.critical_positions (tenant_id,title,department_id,risk_level)
    VALUES ('a3610000-0000-0000-0000-00000000000a','منصب',
            'd3610000-0000-0000-0000-00000000000e','high');
  EXCEPTION WHEN foreign_key_violation THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('3.3 FK يرفض قسم مستأجر آخر', v_ok::TEXT, 'true');

  -- وعبر الدالة برمز صريح
  v_m := '';
  BEGIN PERFORM public.succession_position_upsert(
    NULL,'منصب',NULL,current_setting('kyvzon.t361_eb')::UUID,'high');
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('3.4 رمز SUCCESSION_INCUMBENT_NOT_FOUND',
    (position('SUCCESSION_INCUMBENT_NOT_FOUND' IN v_m) > 0)::TEXT, 'true');

  v_m := '';
  BEGIN PERFORM public.succession_position_upsert(
    NULL,'منصب','d3610000-0000-0000-0000-00000000000e',NULL,'high');
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('3.5 رمز SUCCESSION_DEPARTMENT_NOT_FOUND',
    (position('SUCCESSION_DEPARTMENT_NOT_FOUND' IN v_m) > 0)::TEXT, 'true');

  -- ★★ ولا صفّ دخل («يرمي» وحدها لا تكفي)
  PERFORM pg_temp.chk('3.6 لا منصب دخل مع الحرّاس الخمسة',
    (SELECT count(*)::TEXT FROM public.critical_positions), v_before::TEXT);
END $$;

\echo ''
\echo '═══ ★★ ④ إنشاء المناصب عبر الدالة ═══'

DO $$
DECLARE v_p1 UUID; v_p2 UUID; v_p3 UUID;
BEGIN
  -- منصب حرج بشاغل (منير المدير)
  v_p1 := public.succession_position_upsert(
    NULL,'المدير المالي','d3610000-0000-0000-0000-00000000000d',
    current_setting('kyvzon.t361_mg')::UUID,'critical','توقّف الإقفال الشهري',
    ARRAY['IFRS','قيادة']);
  -- منصب عالي الخطر بلا شاغل
  v_p2 := public.succession_position_upsert(
    NULL,'مدير التقنية',NULL,NULL,'high','انقطاع الأنظمة');
  -- منصب متوسط
  v_p3 := public.succession_position_upsert(
    NULL,'مشرف المخزن',NULL,NULL,'medium');

  PERFORM set_config('kyvzon.t361_p1', v_p1::TEXT, FALSE);
  PERFORM set_config('kyvzon.t361_p2', v_p2::TEXT, FALSE);
  PERFORM set_config('kyvzon.t361_p3', v_p3::TEXT, FALSE);

  PERFORM pg_temp.chk('4.1 ثلاثة مناصب',
    (SELECT count(*)::TEXT FROM public.critical_positions
      WHERE tenant_id='a3610000-0000-0000-0000-00000000000a'), '3');
  PERFORM pg_temp.chk('4.2 created_by = هدى',
    (SELECT created_by::TEXT FROM public.critical_positions WHERE id=v_p1),
    '33610003-0000-0000-0000-000000000003');
  PERFORM pg_temp.chk('4.3 المهارات مصفوفة',
    (SELECT array_length(required_skills,1)::TEXT
       FROM public.critical_positions WHERE id=v_p1), '2');
  PERFORM pg_temp.chk('4.4 بلا مهارات = مصفوفة فارغة لا NULL',
    (SELECT (required_skills = ARRAY[]::TEXT[])::TEXT
       FROM public.critical_positions WHERE id=v_p3), 'true');
END $$;

-- ★★ قيد العنوان الفارغ يحرس الكتابة **المباشرة** لا الدالة وحدها.
--   كشف العكسُ DDL07 أن القيد لم يكن مُختبَراً: اختبرتُ
--   `SUCCESSION_TITLE_REQUIRED` في الدالة ونسيتُ القيد نفسه.
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_m TEXT := ''; v_before INTEGER;
BEGIN
  v_before := (SELECT count(*) FROM public.critical_positions);
  BEGIN
    INSERT INTO public.critical_positions (tenant_id,title,risk_level)
    VALUES ('a3610000-0000-0000-0000-00000000000a','   ','high');
  EXCEPTION WHEN check_violation THEN v_ok := TRUE;
            GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('4.5 القيد يرفض عنواناً فارغاً', v_ok::TEXT, 'true');
  PERFORM pg_temp.chk('4.6 باسم critical_positions_title_chk',
    (position('critical_positions_title_chk' IN v_m) > 0)::TEXT, 'true');

  -- ★ والتحديث كذلك
  v_ok := FALSE;
  BEGIN
    UPDATE public.critical_positions SET title = ''
     WHERE tenant_id='a3610000-0000-0000-0000-00000000000a';
  EXCEPTION WHEN check_violation THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('4.7 والتحديث بعنوانٍ فارغ مرفوض', v_ok::TEXT, 'true');

  -- ★★ والدالة ترمي رمزاً مفهوماً قبل أن يصل القيد
  v_m := '';
  BEGIN PERFORM public.succession_position_upsert(NULL,'   ',NULL,NULL,'high');
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('4.8 رمز SUCCESSION_TITLE_REQUIRED',
    (position('SUCCESSION_TITLE_REQUIRED' IN v_m) > 0)::TEXT, 'true');

  -- ★ ومستوى خطرٍ مخترع
  v_m := '';
  BEGIN PERFORM public.succession_position_upsert(NULL,'منصب',NULL,NULL,'مخترع');
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('4.9 رمز SUCCESSION_RISK_INVALID',
    (position('SUCCESSION_RISK_INVALID' IN v_m) > 0)::TEXT, 'true');

  PERFORM pg_temp.chk('4.10 لا صفّ دخل مع الحرّاس الأربعة',
    (SELECT count(*)::TEXT FROM public.critical_positions), v_before::TEXT);
END $$;

\echo ''
\echo '═══ ★★★ ⑤ العطلان ④/⑤/⑥: المرشّح والمنصب من المستأجر نفسه ═══'

DO $$
DECLARE v_ok BOOLEAN; v_m TEXT; v_before INTEGER;
BEGIN
  v_before := (SELECT count(*) FROM public.succession_candidates);

  v_ok := FALSE;
  BEGIN
    INSERT INTO public.succession_candidates
      (tenant_id,critical_position_id,employee_id,readiness_level,readiness_score)
    VALUES ('a3610000-0000-0000-0000-00000000000a',
            current_setting('kyvzon.t361_p1')::UUID,
            'ffffffff-ffff-ffff-ffff-ffffffffffff','ready_now',90);
  EXCEPTION WHEN foreign_key_violation THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('5.1 FK يرفض مرشّحاً معدوماً', v_ok::TEXT, 'true');

  -- ★★★ مرشّحٌ موجود لكن في مستأجرٍ آخر
  v_ok := FALSE;
  BEGIN
    INSERT INTO public.succession_candidates
      (tenant_id,critical_position_id,employee_id,readiness_level,readiness_score)
    VALUES ('a3610000-0000-0000-0000-00000000000a',
            current_setting('kyvzon.t361_p1')::UUID,
            current_setting('kyvzon.t361_eb')::UUID,'ready_now',90);
  EXCEPTION WHEN foreign_key_violation THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('5.2 FK المركَّب يرفض مرشّح مستأجر آخر', v_ok::TEXT, 'true');

  v_m := '';
  BEGIN PERFORM public.succession_candidate_nominate(
    current_setting('kyvzon.t361_p1')::UUID,
    current_setting('kyvzon.t361_eb')::UUID,'ready_now',90);
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('5.3 رمز SUCCESSION_EMPLOYEE_NOT_FOUND',
    (position('SUCCESSION_EMPLOYEE_NOT_FOUND' IN v_m) > 0)::TEXT, 'true');

  -- ★★★ منصبٌ في مستأجرٍ آخر: الحارس في الدالة يجب أن يمسكه **قبل** FK.
  --   كشف العكسُ INV13 أن هذا الفرع لم يكن مُختبَراً: FK المركَّب أمسك
  --   الحالة أولاً فنجا الحارس. الحلّ منصبٌ في باء ومرشّحٌ في ألف —
  --   فالحارس هو أول من يراه (الرمز يُميّزه عن رسالة FK).
  v_m := '';
  BEGIN PERFORM public.succession_candidate_nominate(
    'c3610000-0000-0000-0000-00000000000b'::UUID,
    current_setting('kyvzon.t361_e1')::UUID,'ready_now',90);
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('5.5 رمز SUCCESSION_POSITION_NOT_FOUND',
    (position('SUCCESSION_POSITION_NOT_FOUND' IN v_m) > 0)::TEXT, 'true');
  -- ★★ والرمز رمزُ الحارس لا رسالةُ FK (وإلا فالحارس غير مُختبَر)
  PERFORM pg_temp.chk('5.6 الحارس سبق FK لا العكس',
    (position('position_tenant_fkey' IN v_m) > 0)::TEXT, 'false');

  PERFORM pg_temp.chk('5.4 لا مرشّح دخل',
    (SELECT count(*)::TEXT FROM public.succession_candidates), v_before::TEXT);
END $$;

\echo ''
\echo '═══ ★★★ ⑥ العطل ⑦: الشاغل لا يخلف نفسه ═══'

DO $$
DECLARE v_ok BOOLEAN := FALSE; v_m TEXT := '';
BEGIN
  -- منير شاغل المنصب p1
  BEGIN
    PERFORM public.succession_candidate_nominate(
      current_setting('kyvzon.t361_p1')::UUID,
      current_setting('kyvzon.t361_mg')::UUID,'ready_now',95);
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE;
            GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('6.1 خلافة النفس ترمي', v_ok::TEXT, 'true');
  PERFORM pg_temp.chk('6.2 رمز SUCCESSION_SELF_NOMINATION',
    (position('SUCCESSION_SELF_NOMINATION' IN v_m) > 0)::TEXT, 'true');
  PERFORM pg_temp.chk('6.3 ولا صفّ دخل',
    (SELECT count(*)::TEXT FROM public.succession_candidates
      WHERE employee_id = current_setting('kyvzon.t361_mg')::UUID), '0');

  -- ★★ والإدراج المباشر يُمسَك كذلك (المحفّز لا الدالة)
  v_ok := FALSE;
  BEGIN
    INSERT INTO public.succession_candidates
      (tenant_id,critical_position_id,employee_id,readiness_level,readiness_score)
    VALUES ('a3610000-0000-0000-0000-00000000000a',
            current_setting('kyvzon.t361_p1')::UUID,
            current_setting('kyvzon.t361_mg')::UUID,'ready_now',95);
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('6.4 المحفّز يمسك الإدراج المباشر', v_ok::TEXT, 'true');
END $$;

\echo ''
\echo '═══ ★★ ⑦ العطل ⑧: الدرجة تتّسق مع المستوى ═══'

DO $$
DECLARE v_m TEXT; v_before INTEGER;
BEGIN
  v_before := (SELECT count(*) FROM public.succession_candidates);

  -- «جاهز الآن» بدرجة 3 — كان يمرّ
  v_m := '';
  BEGIN PERFORM public.succession_candidate_nominate(
    current_setting('kyvzon.t361_p1')::UUID,
    current_setting('kyvzon.t361_e1')::UUID,'ready_now',3);
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('7.1 رمز SUCCESSION_SCORE_LEVEL_MISMATCH',
    (position('SUCCESSION_SCORE_LEVEL_MISMATCH' IN v_m) > 0)::TEXT, 'true');

  -- ★ الحدّ بالضبط: 79 يُرفَض · 80 يُقبَل
  v_m := '';
  BEGIN PERFORM public.succession_candidate_nominate(
    current_setting('kyvzon.t361_p1')::UUID,
    current_setting('kyvzon.t361_e1')::UUID,'ready_now',79);
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('7.2 درجة 79 لـready_now مرفوضة',
    (position('SUCCESSION_SCORE_LEVEL_MISMATCH' IN v_m) > 0)::TEXT, 'true');

  -- خارج المدى
  v_m := '';
  BEGIN PERFORM public.succession_candidate_nominate(
    current_setting('kyvzon.t361_p1')::UUID,
    current_setting('kyvzon.t361_e1')::UUID,'ready_now',101);
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('7.3 رمز SUCCESSION_SCORE_RANGE',
    (position('SUCCESSION_SCORE_RANGE' IN v_m) > 0)::TEXT, 'true');

  -- مستوى مخترع
  v_m := '';
  BEGIN PERFORM public.succession_candidate_nominate(
    current_setting('kyvzon.t361_p1')::UUID,
    current_setting('kyvzon.t361_e1')::UUID,'مخترع',90);
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('7.4 رمز SUCCESSION_LEVEL_INVALID',
    (position('SUCCESSION_LEVEL_INVALID' IN v_m) > 0)::TEXT, 'true');

  PERFORM pg_temp.chk('7.5 لا صفّ دخل مع الحرّاس الأربعة',
    (SELECT count(*)::TEXT FROM public.succession_candidates), v_before::TEXT);

  -- ★★ والقيد نفسه يحرس الكتابة المباشرة
  v_m := '';
  BEGIN
    INSERT INTO public.succession_candidates
      (tenant_id,critical_position_id,employee_id,readiness_level,readiness_score)
    VALUES ('a3610000-0000-0000-0000-00000000000a',
            current_setting('kyvzon.t361_p2')::UUID,
            current_setting('kyvzon.t361_e1')::UUID,'ready_now',10);
  EXCEPTION WHEN check_violation THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('7.6 القيد يحرس الإدراج المباشر',
    (position('score_level_chk' IN v_m) > 0)::TEXT, 'true');
END $$;

\echo ''
\echo '═══ ★★ ⑧ ترشيحٌ صحيح + إعادة الترشيح تُحدِّث ولا تُكرِّر ═══'

DO $$
DECLARE v_c1 UUID; v_c2 UUID; v_again UUID;
BEGIN
  -- p1 (المدير المالي · حرج): سالم جاهز الآن 90 · ناصر موهبة 25
  v_c1 := public.succession_candidate_nominate(
    current_setting('kyvzon.t361_p1')::UUID,
    current_setting('kyvzon.t361_e1')::UUID,'ready_now',90,'خبرة IFRS','قيادة');
  v_c2 := public.succession_candidate_nominate(
    current_setting('kyvzon.t361_p1')::UUID,
    current_setting('kyvzon.t361_e2')::UUID,'future_potential',25);
  PERFORM set_config('kyvzon.t361_c1', v_c1::TEXT, FALSE);
  PERFORM set_config('kyvzon.t361_c2', v_c2::TEXT, FALSE);

  PERFORM pg_temp.chk('8.1 مرشّحان على p1',
    (SELECT count(*)::TEXT FROM public.succession_candidates
      WHERE critical_position_id = current_setting('kyvzon.t361_p1')::UUID), '2');
  PERFORM pg_temp.chk('8.2 nominated_by = هدى',
    (SELECT nominated_by::TEXT FROM public.succession_candidates WHERE id=v_c1),
    '33610003-0000-0000-0000-000000000003');

  -- ★★ إعادة الترشيح: تحديث لا تكرار
  v_again := public.succession_candidate_nominate(
    current_setting('kyvzon.t361_p1')::UUID,
    current_setting('kyvzon.t361_e2')::UUID,'ready_6_months',65);
  PERFORM pg_temp.chk('8.3 المعرّف نفسه', (v_again = v_c2)::TEXT, 'true');
  PERFORM pg_temp.chk('8.4 ما زالا اثنين لا ثلاثة',
    (SELECT count(*)::TEXT FROM public.succession_candidates
      WHERE critical_position_id = current_setting('kyvzon.t361_p1')::UUID), '2');
  PERFORM pg_temp.chk('8.5 المستوى تحدَّث',
    (SELECT readiness_level FROM public.succession_candidates WHERE id=v_c2),
    'ready_6_months');
  -- ★ والحقول غير المُرسَلة لم تُمحَ
  PERFORM pg_temp.chk('8.6 نقاط قوة سالم باقية',
    (SELECT strengths FROM public.succession_candidates WHERE id=v_c1), 'خبرة IFRS');
END $$;

\echo ''
\echo '═══ ★★★ ⑨ العطل ①: اللوح يُظهر «جاهز الآن» أولاً ═══'

DO $$
DECLARE v_first TEXT; v_rank INTEGER; v_total INTEGER;
BEGIN
  -- p1 له مرشّحان: سالم ready_now(90) · ناصر ready_6_months(65)
  SELECT (out_candidates -> 0 ->> 'level'),
         (out_candidates -> 0 ->> 'rank')::INTEGER,
         out_candidates_total
    INTO v_first, v_rank, v_total
    FROM public.succession_board(NULL, NULL, 'active', 500)
   WHERE out_id = current_setting('kyvzon.t361_p1')::UUID;

  -- ★★★ كان الترتيب الأبجديّ يضع ready_6_months أولاً و ready_now آخراً
  PERFORM pg_temp.chk('9.1 الأول = ready_now', v_first, 'ready_now');
  PERFORM pg_temp.chk('9.2 رتبته 1', v_rank::TEXT, '1');
  PERFORM pg_temp.chk('9.3 المجموع 2', v_total::TEXT, '2');
  PERFORM pg_temp.chk('9.4 اسم الأول',
    (SELECT out_candidates -> 0 ->> 'employeeName'
       FROM public.succession_board(NULL,NULL,'active',500)
      WHERE out_id = current_setting('kyvzon.t361_p1')::UUID), 'سالم الأول');
  PERFORM pg_temp.chk('9.5 ready_now في اللوح = 1',
    (SELECT out_ready_now::TEXT FROM public.succession_board(NULL,NULL,'active',500)
      WHERE out_id = current_setting('kyvzon.t361_p1')::UUID), '1');
  -- ★ أفضل رتبة = 1 · والمعدّل (90+65)/2 = 77.5
  PERFORM pg_temp.chk('9.6 أفضل رتبة 1',
    (SELECT out_best_rank::TEXT FROM public.succession_board(NULL,NULL,'active',500)
      WHERE out_id = current_setting('kyvzon.t361_p1')::UUID), '1');
  PERFORM pg_temp.chk('9.7 معدّل الجاهزية 77.5',
    (SELECT out_avg_score::TEXT FROM public.succession_board(NULL,NULL,'active',500)
      WHERE out_id = current_setting('kyvzon.t361_p1')::UUID), '77.5');

  -- ★★ والمنصب بلا مرشّحين: NULL لا صفر (درس 0353)
  PERFORM pg_temp.chk('9.8 بلا مرشّح: best_rank = NULL',
    (SELECT out_best_rank::TEXT FROM public.succession_board(NULL,NULL,'active',500)
      WHERE out_id = current_setting('kyvzon.t361_p2')::UUID), NULL);
  PERFORM pg_temp.chk('9.9 بلا مرشّح: avg = NULL لا صفر',
    (SELECT out_avg_score::TEXT FROM public.succession_board(NULL,NULL,'active',500)
      WHERE out_id = current_setting('kyvzon.t361_p2')::UUID), NULL);
  PERFORM pg_temp.chk('9.10 بلا مرشّح: total = 0 لا NULL',
    (SELECT out_candidates_total::TEXT FROM public.succession_board(NULL,NULL,'active',500)
      WHERE out_id = current_setting('kyvzon.t361_p2')::UUID), '0');
  PERFORM pg_temp.chk('9.11 ومصفوفة فارغة لا NULL',
    (SELECT out_candidates::TEXT FROM public.succession_board(NULL,NULL,'active',500)
      WHERE out_id = current_setting('kyvzon.t361_p2')::UUID), '[]');
END $$;

\echo ''
\echo '═══ ★★ ⑩ الشاغل والقسم في اللوح ═══'

DO $$
BEGIN
  -- ★ full_name_ar = NULL لكل موظف ⇒ الاحتياطيّ first_name || last_name
  PERFORM pg_temp.chk('10.1 اسم الشاغل من الاحتياطيّ',
    (SELECT out_incumbent_name FROM public.succession_board(NULL,NULL,'active',500)
      WHERE out_id = current_setting('kyvzon.t361_p1')::UUID), 'منير المدير');
  PERFORM pg_temp.chk('10.2 القسم',
    (SELECT out_department FROM public.succession_board(NULL,NULL,'active',500)
      WHERE out_id = current_setting('kyvzon.t361_p1')::UUID), 'المالية');
  -- ★ بلا شاغل: «—» لا فراغ ولا NULL
  PERFORM pg_temp.chk('10.3 بلا شاغل = «—»',
    (SELECT out_incumbent_name FROM public.succession_board(NULL,NULL,'active',500)
      WHERE out_id = current_setting('kyvzon.t361_p2')::UUID), '—');
  PERFORM pg_temp.chk('10.4 بلا قسم = «—»',
    (SELECT out_department FROM public.succession_board(NULL,NULL,'active',500)
      WHERE out_id = current_setting('kyvzon.t361_p2')::UUID), '—');
END $$;

\echo ''
\echo '═══ ★★ ⑪ الترتيب والترشيح والبحث ═══'

DO $$
DECLARE v_order TEXT;
BEGIN
  -- ★★★ المكشوف أولاً ثم الأخطر: p2(high,0) · p3(medium,0) · p1(critical,2)
  SELECT string_agg(out_title, '|' ORDER BY rn) INTO v_order
    FROM (SELECT out_title, row_number() OVER () rn
            FROM public.succession_board(NULL,NULL,'active',500)) t;
  PERFORM pg_temp.chk('11.1 المكشوف أولاً ثم الأخطر', v_order,
    'مدير التقنية|مشرف المخزن|المدير المالي');

  PERFORM pg_temp.chk('11.2 ترشيح critical = 1',
    (SELECT count(*)::TEXT FROM public.succession_board(NULL,'critical','active',500)), '1');
  PERFORM pg_temp.chk('11.3 ترشيح high = 1',
    (SELECT count(*)::TEXT FROM public.succession_board(NULL,'high','active',500)), '1');
  PERFORM pg_temp.chk('11.4 بحث «المالي»',
    (SELECT count(*)::TEXT FROM public.succession_board('المالي',NULL,'active',500)), '1');
  PERFORM pg_temp.chk('11.5 بحث باسم الشاغل «منير»',
    (SELECT count(*)::TEXT FROM public.succession_board('منير',NULL,'active',500)), '1');
  PERFORM pg_temp.chk('11.6 بحث بالقسم «المالية»',
    (SELECT count(*)::TEXT FROM public.succession_board('المالية',NULL,'active',500)), '1');
  PERFORM pg_temp.chk('11.7 بحثٌ فارغ = الكل',
    (SELECT count(*)::TEXT FROM public.succession_board('   ',NULL,'active',500)), '3');
  -- ★ الحدّ الأعلى فعّال (العيّنة 3 والحدّ 2)
  PERFORM pg_temp.chk('11.8 LIMIT = 2 يعمل',
    (SELECT count(*)::TEXT FROM public.succession_board(NULL,NULL,'active',2)), '2');
END $$;

\echo ''
\echo '═══ ★★★ ⑫ العطلان ⑫/⑬: status يعمل فعلاً ═══'

DO $$
BEGIN
  -- قبل: 3 مناصب نشطة · 2 مرشّح · 1 جاهز الآن · مكشوفان (p2,p3)
  PERFORM pg_temp.chk('12.1 المناصب النشطة',
    (SELECT out_positions::TEXT FROM public.succession_summary()), '3');
  PERFORM pg_temp.chk('12.2 المكشوفة',
    (SELECT out_uncovered::TEXT FROM public.succession_summary()), '2');
  -- ★★ المكشوف **والحرج**: p2 (high) وحده — p3 متوسط
  PERFORM pg_temp.chk('12.3 المكشوف والحرج',
    (SELECT out_critical_uncovered::TEXT FROM public.succession_summary()), '1');
  PERFORM pg_temp.chk('12.4 جاهزون الآن',
    (SELECT out_ready_now::TEXT FROM public.succession_summary()), '1');
  PERFORM pg_temp.chk('12.5 عالي الخطر (critical+high)',
    (SELECT out_high_risk::TEXT FROM public.succession_summary()), '2');

  -- ★★★ إغلاق p3 يُخرجه من كل حساب
  PERFORM public.succession_position_close(
    current_setting('kyvzon.t361_p3')::UUID, 'closed');
  PERFORM pg_temp.chk('12.6 بعد الإغلاق: 2 نشط',
    (SELECT out_positions::TEXT FROM public.succession_summary()), '2');
  PERFORM pg_temp.chk('12.7 والمغلق = 1',
    (SELECT out_closed::TEXT FROM public.succession_summary()), '1');
  PERFORM pg_temp.chk('12.8 والمكشوف صار 1',
    (SELECT out_uncovered::TEXT FROM public.succession_summary()), '1');
  -- ★★★ هذا التأكيد أمسك نقصاً في مايجريشني نفسه: الملخّص كان يحترم
  --   `status` واللوح لا يحترمه ⇒ رقمان متناقضان في شاشة واحدة.
  PERFORM pg_temp.chk('12.9 واللوح صار 2',
    (SELECT count(*)::TEXT FROM public.succession_board(NULL,NULL,'active',500)), '2');
  -- ★★ حارسٌ عامّ: عدد اللوح = عدد الملخّص دائماً
  PERFORM pg_temp.chk('12.9b اللوح والملخّص متطابقان',
    (SELECT count(*)::TEXT FROM public.succession_board(NULL,NULL,'active',500)),
    (SELECT out_positions::TEXT FROM public.succession_summary()));
  -- ★ و p_status = NULL يعرض الجميع (النشط والمغلق)
  PERFORM pg_temp.chk('12.9c بلا فلتر status = 3',
    (SELECT count(*)::TEXT FROM public.succession_board(NULL,NULL,NULL,500)), '3');
  PERFORM pg_temp.chk('12.9d فلتر closed = 1',
    (SELECT count(*)::TEXT FROM public.succession_board(NULL,NULL,'closed',500)), '1');

  -- ★★★ تعطيل سالم (ready_now) يُخرجه من البطاقة
  PERFORM public.succession_candidate_set_status(
    current_setting('kyvzon.t361_c1')::UUID, 'inactive');
  PERFORM pg_temp.chk('12.10 جاهزون الآن صار 0',
    (SELECT out_ready_now::TEXT FROM public.succession_summary()), '0');
  PERFORM pg_temp.chk('12.11 والمرشّحون صاروا 1',
    (SELECT out_candidates::TEXT FROM public.succession_summary()), '1');
  PERFORM pg_temp.chk('12.12 واللوح لا يعرضه',
    (SELECT out_candidates_total::TEXT FROM public.succession_board(NULL,NULL,'active',500)
      WHERE out_id = current_setting('kyvzon.t361_p1')::UUID), '1');
  -- ★ والمعدّل صار 65 وحده لا 77.5
  PERFORM pg_temp.chk('12.13 المعدّل صار 65.0',
    (SELECT out_avg_score::TEXT FROM public.succession_board(NULL,NULL,'active',500)
      WHERE out_id = current_setting('kyvzon.t361_p1')::UUID), '65.0');

  -- استرجاع
  PERFORM public.succession_candidate_set_status(
    current_setting('kyvzon.t361_c1')::UUID, 'active');
  PERFORM public.succession_position_close(
    current_setting('kyvzon.t361_p3')::UUID, 'active');
END $$;

\echo ''
\echo '═══ ★★★ ⑬ العطلان ⑩/⑪: الحذف ممنوع ولا إبادة بالتتالي ═══'

DO $$
DECLARE v_ok BOOLEAN; v_m TEXT;
BEGIN
  v_ok := FALSE; v_m := '';
  BEGIN DELETE FROM public.succession_candidates
         WHERE id = current_setting('kyvzon.t361_c1')::UUID;
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE;
            GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('13.1 حذف المرشّح يرمي', v_ok::TEXT, 'true');
  PERFORM pg_temp.chk('13.2 رمز SUCCESSION_DELETE_BLOCKED',
    (position('SUCCESSION_DELETE_BLOCKED' IN v_m) > 0)::TEXT, 'true');

  v_ok := FALSE;
  BEGIN DELETE FROM public.critical_positions
         WHERE id = current_setting('kyvzon.t361_p1')::UUID;
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('13.3 حذف المنصب يرمي', v_ok::TEXT, 'true');

  -- ★★★ العطل ⑪: حتى لو عُطِّل المحفّز، RESTRICT يمنع الإبادة
  ALTER TABLE public.critical_positions DISABLE TRIGGER trg_block_critical_position_delete;
  v_ok := FALSE; v_m := '';
  BEGIN DELETE FROM public.critical_positions
         WHERE id = current_setting('kyvzon.t361_p1')::UUID;
  EXCEPTION WHEN foreign_key_violation THEN v_ok := TRUE;
            GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('13.4 RESTRICT يمنع إبادة المرشّحين', v_ok::TEXT, 'true');
  ALTER TABLE public.critical_positions ENABLE TRIGGER trg_block_critical_position_delete;

  PERFORM pg_temp.chk('13.5 المرشّحان باقيان',
    (SELECT count(*)::TEXT FROM public.succession_candidates
      WHERE critical_position_id = current_setting('kyvzon.t361_p1')::UUID), '2');
END $$;

\echo ''
\echo '═══ ★★ ⑭ الحارس المعاكس: المرشّح النشط لا يصير شاغلاً ═══'

DO $$
DECLARE v_ok BOOLEAN := FALSE; v_m TEXT := '';
BEGIN
  -- سالم مرشّح نشط على p1 — محاولة جعله الشاغل
  BEGIN
    UPDATE public.critical_positions
       SET incumbent_employee_id = current_setting('kyvzon.t361_e1')::UUID
     WHERE id = current_setting('kyvzon.t361_p1')::UUID;
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE;
            GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('14.1 المرشّح النشط لا يصير شاغلاً', v_ok::TEXT, 'true');
  PERFORM pg_temp.chk('14.2 رمز SUCCESSION_INCUMBENT_IS_CANDIDATE',
    (position('SUCCESSION_INCUMBENT_IS_CANDIDATE' IN v_m) > 0)::TEXT, 'true');
  PERFORM pg_temp.chk('14.3 الشاغل لم يتغيّر',
    (SELECT (incumbent_employee_id = current_setting('kyvzon.t361_mg')::UUID)::TEXT
       FROM public.critical_positions
      WHERE id = current_setting('kyvzon.t361_p1')::UUID), 'true');
END $$;

\echo ''
\echo '═══ ★★★ ⑮ عزل المستأجر ═══'

DO $$
DECLARE v_n INTEGER;
BEGIN
  -- ★★ صفٌّ أجنبيّ حقيقيّ (وإلا فالاختبار بلا معنى)
  PERFORM set_config('request.jwt.claim.sub',
    '77610007-0000-0000-0000-000000000007', TRUE);
  PERFORM public.succession_position_upsert(
    NULL,'منصب باء',NULL,current_setting('kyvzon.t361_eb')::UUID,'critical');

  -- ★ باء عنده الآن: «منصب باء الأصلي» (من العيّنة) + «منصب باء» = 2
  v_n := (SELECT count(*) FROM public.succession_board(NULL,NULL,'active',500));
  PERFORM pg_temp.chk('15.1 باء يرى 2', v_n::TEXT, '2');
  PERFORM pg_temp.chk('15.2 ملخّص باء = 2',
    (SELECT out_positions::TEXT FROM public.succession_summary()), '2');

  -- ★★★ وهدى (ألف) لا ترى منصب باء
  PERFORM set_config('request.jwt.claim.sub',
    '33610003-0000-0000-0000-000000000003', TRUE);
  v_n := (SELECT count(*) FROM public.succession_board(NULL,NULL,'active',500));
  PERFORM pg_temp.chk('15.3 هدى ما زالت ترى 3 لا 4', v_n::TEXT, '3');
  PERFORM pg_temp.chk('15.4 منصب باء غائب',
    (SELECT count(*)::TEXT FROM public.succession_board(NULL,NULL,'active',500)
      WHERE out_title='منصب باء'), '0');
  PERFORM pg_temp.chk('15.5 والصفّ موجود فعلاً في الجدول',
    (SELECT count(*)::TEXT FROM public.critical_positions
      WHERE title='منصب باء'), '1');

  -- ★★ وهدى لا تُغلق منصب باء
  DECLARE v_m TEXT := '';
  BEGIN
    BEGIN PERFORM public.succession_position_close(
      (SELECT id FROM public.critical_positions WHERE title='منصب باء'), 'closed');
    EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
    PERFORM pg_temp.chk('15.6 هدى لا تُغلق منصب باء',
      (position('SUCCESSION_POSITION_NOT_FOUND' IN v_m) > 0)::TEXT, 'true');
  END;
END $$;

\echo ''
\echo '═══ ★★ ⑯ حرّاس الدور ═══'

DO $$
DECLARE v_m TEXT;
BEGIN
  -- الموظف
  PERFORM set_config('request.jwt.claim.sub',
    '11610001-0000-0000-0000-000000000001', TRUE);
  v_m := '';
  BEGIN PERFORM public.succession_summary();
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('16.1 الموظف محجوب عن الملخّص',
    (position('غير مصرَّح' IN v_m) > 0)::TEXT, 'true');

  v_m := '';
  BEGIN PERFORM public.succession_board(NULL,NULL,'active',10);
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('16.2 الموظف محجوب عن اللوح',
    (position('غير مصرَّح' IN v_m) > 0)::TEXT, 'true');

  v_m := '';
  BEGIN PERFORM public.succession_position_upsert(NULL,'منصبي',NULL,NULL,'high');
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('16.3 الموظف لا يُنشئ منصباً',
    (position('SUCCESSION_NOT_AUTHORIZED' IN v_m) > 0)::TEXT, 'true');

  -- ★★ والمدير ليس staff
  PERFORM set_config('request.jwt.claim.sub',
    '44610004-0000-0000-0000-000000000004', TRUE);
  v_m := '';
  BEGIN PERFORM public.succession_candidate_nominate(
    current_setting('kyvzon.t361_p2')::UUID,
    current_setting('kyvzon.t361_e2')::UUID,'ready_now',90);
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('16.4 المدير لا يُرشِّح',
    (position('SUCCESSION_NOT_AUTHORIZED' IN v_m) > 0)::TEXT, 'true');

  PERFORM set_config('request.jwt.claim.sub',
    '33610003-0000-0000-0000-000000000003', TRUE);
  PERFORM pg_temp.chk('16.5 لا صفّ دخل من الحرّاس',
    (SELECT count(*)::TEXT FROM public.critical_positions
      WHERE title='منصبي'), '0');
END $$;

\echo ''
\echo '════════════ كل تأكيدات 0361 نجحت ════════════'
ROLLBACK;
