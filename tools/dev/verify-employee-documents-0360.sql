-- ════════════════════════════════════════════════════════════════════════
--  التحقق السلوكيّ من 0360 — مستندات الموظفين
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
  RAISE NOTICE 'ok   %  =  %', rpad(p_label, 52, '.'), COALESCE(p_want,'NULL');
END $$;

-- ══════════════════════ العيّنة ══════════════════════
-- ★ UUIDات فريدة في **أول 8 حروف** (درس 0355: employee_code من 8 حروف)
INSERT INTO public.tenants (id,name,name_ar,slug) VALUES
 ('a3600000-0000-0000-0000-00000000000a','T360A','شركة ألف','t360a'),
 ('b3600000-0000-0000-0000-00000000000b','T360B','شركة باء','t360b');

INSERT INTO auth.users(id,email) VALUES
 ('11600001-0000-0000-0000-000000000001','salem@t360a'),
 ('22600002-0000-0000-0000-000000000002','nasser@t360a'),
 ('33600003-0000-0000-0000-000000000003','huda@t360a'),
 ('55600005-0000-0000-0000-000000000005','adam@t360a'),
 ('66600006-0000-0000-0000-000000000006','emp@t360b'),
 ('77600007-0000-0000-0000-000000000007','hr@t360b');

INSERT INTO public.profiles (id,tenant_id,full_name,role,department) VALUES
 ('11600001-0000-0000-0000-000000000001','a3600000-0000-0000-0000-00000000000a','سالم الأول','employee','المالية'),
 ('22600002-0000-0000-0000-000000000002','a3600000-0000-0000-0000-00000000000a','ناصر الثاني','employee','المالية'),
 ('33600003-0000-0000-0000-000000000003','a3600000-0000-0000-0000-00000000000a','هدى الموارد','hr','الموارد'),
 ('55600005-0000-0000-0000-000000000005','a3600000-0000-0000-0000-00000000000a','آدم المسؤول','admin','الإدارة'),
 ('66600006-0000-0000-0000-000000000006','b3600000-0000-0000-0000-00000000000b','أجنبي باء','employee','المالية'),
 ('77600007-0000-0000-0000-000000000007','b3600000-0000-0000-0000-00000000000b','مورد باء','hr','الموارد');

SELECT set_config('kyvzon.t360_e1',
  (SELECT e.id::TEXT FROM public.employees e WHERE e.user_id='11600001-0000-0000-0000-000000000001'), FALSE),
       set_config('kyvzon.t360_e2',
  (SELECT e.id::TEXT FROM public.employees e WHERE e.user_id='22600002-0000-0000-0000-000000000002'), FALSE),
       set_config('kyvzon.t360_hr',
  (SELECT e.id::TEXT FROM public.employees e WHERE e.user_id='33600003-0000-0000-0000-000000000003'), FALSE),
       set_config('kyvzon.t360_eb',
  (SELECT e.id::TEXT FROM public.employees e WHERE e.user_id='66600006-0000-0000-0000-000000000006'), FALSE);

SET LOCAL request.jwt.claim.sub = '33600003-0000-0000-0000-000000000003';

\echo ''
\echo '═══ ① بنية الجدول والقيود ═══'

DO $$
BEGIN
  PERFORM pg_temp.chk('1.1 tenant_id صار NOT NULL',
    (SELECT is_nullable FROM information_schema.columns
      WHERE table_name='employee_documents' AND column_name='tenant_id'), 'NO');

  PERFORM pg_temp.chk('1.2 FK مركَّب (employee_id,tenant_id)',
    (SELECT count(*)::TEXT FROM pg_constraint
      WHERE conname='employee_documents_employee_tenant_fkey'
        AND contype='f'), '1');

  PERFORM pg_temp.chk('1.3 CHECK على document_type',
    (SELECT count(*)::TEXT FROM pg_constraint
      WHERE conname='employee_documents_type_chk'), '1');

  PERFORM pg_temp.chk('1.4 محفّز منع الحذف قائم',
    (SELECT count(*)::TEXT FROM pg_trigger
      WHERE tgrelid='public.employee_documents'::regclass
        AND tgname='trg_block_employee_document_delete'), '1');

  -- ★★★ hybrid_gate يجب أن يبقى RESTRICTIVE (درس 0355)
  PERFORM pg_temp.chk('1.5 hybrid_gate ما زال RESTRICTIVE',
    (SELECT (NOT polpermissive)::TEXT FROM pg_policy
      WHERE polrelid='public.employee_documents'::regclass
        AND polname='hybrid_gate_employee_documents'), 'true');

  -- ★ سياسة القراءة الجديدة تذكر is_confidential
  PERFORM pg_temp.chk('1.6 سياسة SELECT تحترم السرّية',
    (SELECT (pg_get_expr(polqual,polrelid) ILIKE '%is_confidential%')::TEXT
       FROM pg_policy WHERE polrelid='public.employee_documents'::regclass
        AND polname='kyvzon_employee_documents_select'), 'true');
END $$;

\echo ''
\echo '═══ ★★★ ② العطل ②: النوع المختلق يُرفَض الآن ═══'

DO $$
DECLARE v_ok BOOLEAN := FALSE; v_m TEXT := '';
BEGIN
  -- على مستوى القيد
  BEGIN
    INSERT INTO public.employee_documents
      (tenant_id, employee_id, document_type, title, file_url)
    VALUES ('a3600000-0000-0000-0000-00000000000a',
            current_setting('kyvzon.t360_e1')::UUID,
            'ThIsIsGaRbAgE','نوع مختلق','http://x/1.pdf');
  EXCEPTION WHEN check_violation THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('2.1 CHECK يرفض النوع المختلق', v_ok::TEXT, 'true');

  -- على مستوى الدالة، برمز خطأ صريح
  v_ok := FALSE;
  BEGIN
    PERFORM public.document_upload(
      current_setting('kyvzon.t360_e1')::UUID,'ThIsIsGaRbAgE','ع','http://x/1.pdf');
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE;
            GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('2.2 document_upload يرمي', v_ok::TEXT, 'true');
  PERFORM pg_temp.chk('2.3 رمز DOCUMENT_TYPE_INVALID',
    (position('DOCUMENT_TYPE_INVALID' IN v_m) > 0)::TEXT, 'true');

  -- ★★ ولا صفّ دخل («يرمي» وحدها لا تكفي)
  PERFORM pg_temp.chk('2.4 لا صفّ بنوع مختلق',
    (SELECT count(*)::TEXT FROM public.employee_documents
      WHERE document_type='ThIsIsGaRbAgE'), '0');
END $$;

\echo ''
\echo '═══ ★★★ ③ العطل ③/④: الموظف المعدوم وموظف المستأجر الآخر ═══'

DO $$
DECLARE v_ok BOOLEAN; v_m TEXT;
BEGIN
  -- ③ موظف غير موجود
  v_ok := FALSE;
  BEGIN
    INSERT INTO public.employee_documents
      (tenant_id, employee_id, document_type, title, file_url)
    VALUES ('a3600000-0000-0000-0000-00000000000a',
            'ffffffff-ffff-ffff-ffff-ffffffffffff','contract','ع','http://x/3.pdf');
  EXCEPTION WHEN foreign_key_violation THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('3.1 FK يرفض موظفاً معدوماً', v_ok::TEXT, 'true');

  -- ★★★ ④ موظف موجود لكن في مستأجر آخر — الفخّ الحقيقيّ
  v_ok := FALSE;
  BEGIN
    INSERT INTO public.employee_documents
      (tenant_id, employee_id, document_type, title, file_url)
    VALUES ('a3600000-0000-0000-0000-00000000000a',
            current_setting('kyvzon.t360_eb')::UUID,'contract','ع','http://x/4.pdf');
  EXCEPTION WHEN foreign_key_violation THEN v_ok := TRUE; END;
  PERFORM pg_temp.chk('3.2 FK المركَّب يرفض موظف مستأجر آخر', v_ok::TEXT, 'true');

  -- وعبر الدالة برمز صريح
  v_ok := FALSE; v_m := '';
  BEGIN
    PERFORM public.document_upload(
      current_setting('kyvzon.t360_eb')::UUID,'contract','ع','http://x/4.pdf');
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE;
            GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('3.3 رمز DOCUMENT_EMPLOYEE_NOT_FOUND',
    (position('DOCUMENT_EMPLOYEE_NOT_FOUND' IN v_m) > 0)::TEXT, 'true');

  PERFORM pg_temp.chk('3.4 لا صفّ عابرٍ للمستأجرات',
    (SELECT count(*)::TEXT FROM public.employee_documents
      WHERE employee_id = current_setting('kyvzon.t360_eb')::UUID), '0');
END $$;

\echo ''
\echo '═══ ★★ ④ العطل ⑤: tenant_id لا يقبل NULL ═══'

DO $$
DECLARE v_ok BOOLEAN := FALSE;
BEGIN
  BEGIN
    -- ★ المحفّز يملأ tenant_id من السياق ⇒ نُعطّله بضبط سياق فارغ
    --   بدلاً من ذلك نختبر القيد مباشرة عبر UPDATE
    UPDATE public.employee_documents SET tenant_id = NULL WHERE FALSE;
    INSERT INTO public.employee_documents
      (tenant_id, employee_id, document_type, title, file_url)
    SELECT NULL, current_setting('kyvzon.t360_e1')::UUID,'contract','ع','http://x/2.pdf'
     WHERE public.current_user_tenant_id() IS NULL;
  EXCEPTION WHEN not_null_violation THEN v_ok := TRUE; END;
  -- ★★ الشرط أعلاه لا يُدرج شيئاً (المستأجر موجود) ⇒ نُثبت القيد بنيوياً
  PERFORM pg_temp.chk('4.1 القيد NOT NULL مفروض',
    (SELECT attnotnull::TEXT FROM pg_attribute
      WHERE attrelid='public.employee_documents'::regclass
        AND attname='tenant_id'), 'true');
END $$;

\echo ''
\echo '═══ ★★★ ⑤ العطل ⑧: uploaded_by يُملأ تلقائياً ═══'

DO $$
DECLARE v_d1 UUID; v_d2 UUID; v_d3 UUID; v_d4 UUID;
BEGIN
  -- هدى (hr) ترفع أربع وثائق
  v_d1 := public.document_upload(
    current_setting('kyvzon.t360_e1')::UUID,'contract','عقد سالم','http://x/c1.pdf',
    'c1.pdf','عقد العمل', 102400,'application/pdf', NULL, FALSE);
  v_d2 := public.document_upload(
    current_setting('kyvzon.t360_e1')::UUID,'medical','تقرير سالم الطبّي','http://x/m1.pdf');
  v_d3 := public.document_upload(
    current_setting('kyvzon.t360_e1')::UUID,'id_copy','هوية سالم','http://x/i1.pdf',
    NULL,NULL,NULL,NULL,
    ((now() AT TIME ZONE 'Asia/Baghdad')::DATE + 10), FALSE);
  v_d4 := public.document_upload(
    current_setting('kyvzon.t360_e2')::UUID,'certificate','شهادة ناصر','http://x/s1.pdf');

  PERFORM set_config('kyvzon.t360_d1', v_d1::TEXT, FALSE);
  PERFORM set_config('kyvzon.t360_d2', v_d2::TEXT, FALSE);
  PERFORM set_config('kyvzon.t360_d3', v_d3::TEXT, FALSE);

  -- ★ الرافع = هدى في الأربع
  PERFORM pg_temp.chk('5.1 uploaded_by = هدى في الأربع',
    (SELECT count(*)::TEXT FROM public.employee_documents
      WHERE uploaded_by='33600003-0000-0000-0000-000000000003'), '4');
  PERFORM pg_temp.chk('5.2 لا وثيقة بلا رافع',
    (SELECT count(*)::TEXT FROM public.employee_documents
      WHERE uploaded_by IS NULL), '0');

  -- ★★ العطل ①: الطبّي سرّيٌّ افتراضاً بلا طلبٍ من العميل
  PERFORM pg_temp.chk('5.3 الطبّي سرّيّ تلقائياً',
    (SELECT is_confidential::TEXT FROM public.employee_documents WHERE id=v_d2), 'true');
  PERFORM pg_temp.chk('5.4 العقد غير سرّيّ',
    (SELECT is_confidential::TEXT FROM public.employee_documents WHERE id=v_d1), 'false');

  -- ★ الرافع لا يتغيّر بعد الإنشاء (المحفّز يُجمّده)
  UPDATE public.employee_documents
     SET uploaded_by='55600005-0000-0000-0000-000000000005' WHERE id=v_d1;
  PERFORM pg_temp.chk('5.5 uploaded_by مُجمَّد بعد الإنشاء',
    (SELECT uploaded_by::TEXT FROM public.employee_documents WHERE id=v_d1),
    '33600003-0000-0000-0000-000000000003');

  -- ★ وemployee_id مُجمَّد كذلك (منع نقل وثيقة بين الموظفين)
  UPDATE public.employee_documents
     SET employee_id = current_setting('kyvzon.t360_e2')::UUID WHERE id=v_d1;
  PERFORM pg_temp.chk('5.6 employee_id مُجمَّد',
    (SELECT (employee_id = current_setting('kyvzon.t360_e1')::UUID)::TEXT
       FROM public.employee_documents WHERE id=v_d1), 'true');
END $$;

\echo ''
\echo '═══ ★★ ⑥ حرّاس document_upload ═══'

DO $$
DECLARE v_m TEXT; v_before INTEGER;
BEGIN
  v_before := (SELECT count(*) FROM public.employee_documents);

  -- عنوان فارغ
  v_m := '';
  BEGIN PERFORM public.document_upload(
    current_setting('kyvzon.t360_e1')::UUID,'contract','   ','http://x/z.pdf');
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('6.1 DOCUMENT_TITLE_REQUIRED',
    (position('DOCUMENT_TITLE_REQUIRED' IN v_m) > 0)::TEXT, 'true');

  -- ملف فارغ
  v_m := '';
  BEGIN PERFORM public.document_upload(
    current_setting('kyvzon.t360_e1')::UUID,'contract','عنوان','  ');
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('6.2 DOCUMENT_FILE_REQUIRED',
    (position('DOCUMENT_FILE_REQUIRED' IN v_m) > 0)::TEXT, 'true');

  -- ★ تاريخ انتهاء في الماضي — أمس بتوقيت بغداد
  v_m := '';
  BEGIN PERFORM public.document_upload(
    current_setting('kyvzon.t360_e1')::UUID,'contract','عنوان','http://x/z.pdf',
    NULL,NULL,NULL,NULL,
    ((now() AT TIME ZONE 'Asia/Baghdad')::DATE - 1), FALSE);
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('6.3 DOCUMENT_EXPIRY_IN_PAST',
    (position('DOCUMENT_EXPIRY_IN_PAST' IN v_m) > 0)::TEXT, 'true');

  -- ★ حجم يتجاوز 25MB
  v_m := '';
  BEGIN PERFORM public.document_upload(
    current_setting('kyvzon.t360_e1')::UUID,'contract','عنوان','http://x/z.pdf',
    NULL,NULL, 26214401,NULL,NULL,FALSE);
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('6.4 DOCUMENT_SIZE_INVALID',
    (position('DOCUMENT_SIZE_INVALID' IN v_m) > 0)::TEXT, 'true');

  -- ★★ ولا صفّ دخل في أيٍّ من الأربعة
  PERFORM pg_temp.chk('6.5 لا صفّ دخل مع الحرّاس الأربعة',
    (SELECT count(*)::TEXT FROM public.employee_documents), v_before::TEXT);
END $$;

\echo ''
\echo '═══ ★★★ ⑦ العطل ⑦: الحذف النهائيّ ممنوع ═══'

DO $$
DECLARE v_ok BOOLEAN := FALSE; v_m TEXT := '';
BEGIN
  BEGIN
    DELETE FROM public.employee_documents
      WHERE id = current_setting('kyvzon.t360_d1')::UUID;
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE;
            GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('7.1 الحذف يرمي', v_ok::TEXT, 'true');
  PERFORM pg_temp.chk('7.2 رمز DOCUMENT_DELETE_BLOCKED',
    (position('DOCUMENT_DELETE_BLOCKED' IN v_m) > 0)::TEXT, 'true');
  PERFORM pg_temp.chk('7.3 الصفّ باقٍ',
    (SELECT count(*)::TEXT FROM public.employee_documents
      WHERE id = current_setting('kyvzon.t360_d1')::UUID), '1');
END $$;

\echo ''
\echo '═══ ★★★ ⑧ العطل ⑥: الأرشفة تُخفي فعلاً ═══'

DO $$
DECLARE v_n INTEGER;
BEGIN
  -- قبل الأرشفة: أربع وثائق نشطة في ألف
  v_n := (SELECT count(*) FROM public.employee_documents_board(NULL, FALSE));
  PERFORM pg_temp.chk('8.1 اللوح قبل الأرشفة', v_n::TEXT, '4');

  UPDATE public.employee_documents SET is_archived = TRUE
   WHERE id = current_setting('kyvzon.t360_d3')::UUID;

  -- ★★★ كان استعلام الصفحة يُعيدها كما هي
  v_n := (SELECT count(*) FROM public.employee_documents_board(NULL, FALSE));
  PERFORM pg_temp.chk('8.2 اللوح بعد الأرشفة = 3', v_n::TEXT, '3');

  v_n := (SELECT count(*) FROM public.employee_documents_board(NULL, TRUE));
  PERFORM pg_temp.chk('8.3 لوح المؤرشف = 1', v_n::TEXT, '1');

  -- استرجاع للاختبارات التالية
  UPDATE public.employee_documents SET is_archived = FALSE
   WHERE id = current_setting('kyvzon.t360_d3')::UUID;
END $$;

\echo ''
\echo '═══ ★★★ ⑨ العطل ①: الموظف لا يرى وثيقته السرّية ═══'

DO $$
DECLARE v_n INTEGER;
BEGIN
  -- سالم موظف عاديّ: له ثلاث وثائق، إحداها طبّية سرّية
  PERFORM set_config('request.jwt.claim.sub',
    '11600001-0000-0000-0000-000000000001', TRUE);

  v_n := (SELECT count(*) FROM public.employee_documents_board(NULL, FALSE));
  -- عقد + هوية = 2 (الطبّي محجوب)
  PERFORM pg_temp.chk('9.1 سالم يرى 2 من 3', v_n::TEXT, '2');

  PERFORM pg_temp.chk('9.2 الطبّي محجوب عن سالم',
    (SELECT count(*)::TEXT FROM public.employee_documents_board(NULL, FALSE)
      WHERE out_document_type = 'medical'), '0');

  -- ★★ ووثيقة ناصر ليست لسالم
  PERFORM pg_temp.chk('9.3 سالم لا يرى وثيقة ناصر',
    (SELECT count(*)::TEXT FROM public.employee_documents_board(NULL, FALSE)
      WHERE out_employee_id = current_setting('kyvzon.t360_e2')::UUID), '0');

  -- هدى (hr) ترى الأربع
  PERFORM set_config('request.jwt.claim.sub',
    '33600003-0000-0000-0000-000000000003', TRUE);
  v_n := (SELECT count(*) FROM public.employee_documents_board(NULL, FALSE));
  PERFORM pg_temp.chk('9.4 هدى ترى الأربع', v_n::TEXT, '4');
  PERFORM pg_temp.chk('9.5 هدى ترى الطبّي',
    (SELECT count(*)::TEXT FROM public.employee_documents_board(NULL, FALSE)
      WHERE out_document_type = 'medical'), '1');
END $$;

\echo ''
\echo '═══ ★★★ ⑩ ترشيح المستأجر في اللوح ═══'

DO $$
DECLARE v_n INTEGER;
BEGIN
  -- ★★ صفّ أجنبيّ حقيقيّ: وثيقة في شركة باء لموظف باء
  PERFORM set_config('request.jwt.claim.sub',
    '77600007-0000-0000-0000-000000000007', TRUE);
  PERFORM public.document_upload(
    current_setting('kyvzon.t360_eb')::UUID,'contract','عقد باء','http://x/b1.pdf');

  -- مورد باء يرى وثيقته وحدها
  v_n := (SELECT count(*) FROM public.employee_documents_board(NULL, FALSE));
  PERFORM pg_temp.chk('10.1 باء يرى 1', v_n::TEXT, '1');

  -- ★★★ وهدى (ألف) لا ترى وثيقة باء رغم وجودها في الجدول
  PERFORM set_config('request.jwt.claim.sub',
    '33600003-0000-0000-0000-000000000003', TRUE);
  v_n := (SELECT count(*) FROM public.employee_documents_board(NULL, FALSE));
  PERFORM pg_temp.chk('10.2 هدى ما زالت ترى 4 لا 5', v_n::TEXT, '4');
  PERFORM pg_temp.chk('10.3 عقد باء غائب عن لوح ألف',
    (SELECT count(*)::TEXT FROM public.employee_documents_board(NULL, FALSE)
      WHERE out_title = 'عقد باء'), '0');
  -- ★ والصفّ موجود فعلاً (وإلا فالاختبار بلا معنى)
  PERFORM pg_temp.chk('10.4 الصفّ الأجنبيّ موجود في الجدول',
    (SELECT count(*)::TEXT FROM public.employee_documents
      WHERE title='عقد باء'), '1');
END $$;

\echo ''
\echo '═══ ★★ ⑪ العطل ⑩: حالة الانتهاء بتوقيت بغداد ═══'

DO $$
DECLARE v_state TEXT; v_days INTEGER; v_today DATE;
BEGIN
  v_today := (now() AT TIME ZONE 'Asia/Baghdad')::DATE;

  -- d3: ينتهي بعد 10 أيام ⇒ 'expiring' (الحدّ 30 يوماً)
  SELECT out_expiry_state, out_days_left INTO v_state, v_days
    FROM public.employee_documents_board(NULL, FALSE)
   WHERE out_id = current_setting('kyvzon.t360_d3')::UUID;
  PERFORM pg_temp.chk('11.1 وثيقة بعد 10 أيام = expiring', v_state, 'expiring');
  PERFORM pg_temp.chk('11.2 المتبقّي 10 أيام', v_days::TEXT, '10');

  -- ★ وثيقة بلا تاريخ = none لا expired
  SELECT out_expiry_state INTO v_state
    FROM public.employee_documents_board(NULL, FALSE)
   WHERE out_id = current_setting('kyvzon.t360_d1')::UUID;
  PERFORM pg_temp.chk('11.3 بلا تاريخ = none', v_state, 'none');

  -- ★★ وثيقة منتهية: تُدرَج مباشرة (الدالة تمنع الماضي عند الرفع)
  INSERT INTO public.employee_documents
    (tenant_id, employee_id, document_type, title, file_url, expires_at)
  VALUES ('a3600000-0000-0000-0000-00000000000a',
          current_setting('kyvzon.t360_e1')::UUID,'id_copy','إقامة منتهية',
          'http://x/exp.pdf', v_today - 5);
  SELECT out_expiry_state, out_days_left INTO v_state, v_days
    FROM public.employee_documents_board(NULL, FALSE)
   WHERE out_title = 'إقامة منتهية';
  PERFORM pg_temp.chk('11.4 منذ 5 أيام = expired', v_state, 'expired');
  PERFORM pg_temp.chk('11.5 المتبقّي -5', v_days::TEXT, '-5');

  -- ★ الحدّ بالضبط: 30 يوماً = expiring · 31 = valid
  INSERT INTO public.employee_documents
    (tenant_id, employee_id, document_type, title, file_url, expires_at)
  VALUES ('a3600000-0000-0000-0000-00000000000a',
          current_setting('kyvzon.t360_e1')::UUID,'id_copy','حدّ 30',
          'http://x/e30.pdf', v_today + 30),
         ('a3600000-0000-0000-0000-00000000000a',
          current_setting('kyvzon.t360_e1')::UUID,'id_copy','حدّ 31',
          'http://x/e31.pdf', v_today + 31);
  PERFORM pg_temp.chk('11.6 يوم 30 = expiring',
    (SELECT out_expiry_state FROM public.employee_documents_board(NULL, FALSE)
      WHERE out_title='حدّ 30'), 'expiring');
  PERFORM pg_temp.chk('11.7 يوم 31 = valid',
    (SELECT out_expiry_state FROM public.employee_documents_board(NULL, FALSE)
      WHERE out_title='حدّ 31'), 'valid');
END $$;

\echo ''
\echo '═══ ★★ ⑫ العطل ⑫: اسم الموظف لا يكون فارغاً ═══'

DO $$
DECLARE v_name TEXT; v_up TEXT;
BEGIN
  SELECT out_employee_name, out_uploader_name INTO v_name, v_up
    FROM public.employee_documents_board(NULL, FALSE)
   WHERE out_id = current_setting('kyvzon.t360_d1')::UUID;
  -- ★ full_name_ar = NULL ⇒ الاحتياطيّ first_name || ' ' || last_name
  --   المحفّز يكتب: split_part('سالم الأول',' ',1) = 'سالم'
  PERFORM pg_temp.chk('12.1 اسم الموظف من الاحتياطيّ', v_name, 'سالم الأول');
  PERFORM pg_temp.chk('12.2 اسم الرافع', v_up, 'هدى الموارد');
  PERFORM pg_temp.chk('12.3 لا اسم فارغ في اللوح',
    (SELECT count(*)::TEXT FROM public.employee_documents_board(NULL, FALSE)
      WHERE btrim(COALESCE(out_employee_name,'')) = ''), '0');
END $$;

\echo ''
\echo '═══ ★★ ⑬ ترشيح النوع + الترتيب الحتميّ ═══'

DO $$
DECLARE v_n INTEGER; v_board TEXT; v_want TEXT;
BEGIN
  -- ألف الآن: عقد · طبّي · هوية · شهادة(ناصر) · إقامة منتهية · حدّ30 · حدّ31 = 7
  v_n := (SELECT count(*) FROM public.employee_documents_board(NULL, FALSE));
  PERFORM pg_temp.chk('13.1 مجموع لوح ألف', v_n::TEXT, '7');

  -- id_copy: هوية · إقامة منتهية · حدّ30 · حدّ31 = 4
  v_n := (SELECT count(*) FROM public.employee_documents_board('id_copy', FALSE));
  PERFORM pg_temp.chk('13.2 ترشيح id_copy = 4', v_n::TEXT, '4');

  v_n := (SELECT count(*) FROM public.employee_documents_board('medical', FALSE));
  PERFORM pg_temp.chk('13.3 ترشيح medical = 1', v_n::TEXT, '1');

  -- ★★★ الترتيب حتميّ (created_at DESC, id DESC) — درس 0357
  --
  -- ★ تصحيحٌ لخطأٍ في نسختي الأولى: قارنتُ نتيجة اللوح **بنفسها**
  --   (`JOIN` بين استدعاءين للدالة على rn المتتالي) — وهذا يمرّ دائماً
  --   لأنّ الاستدعاءين يُرتَّبان بالطريقة نفسها أياً كانت. أثبته العكس
  --   INV24: أسقطتُ `ORDER BY` كلّه و«نجح» الاختبار. الصواب أن نقارن
  --   بترتيبٍ مرجعيّ **مستقلّ** محسوب من الجدول.
  --
  -- ★★ كل الصفوف أُدرجت في معاملة واحدة و`created_at DEFAULT now()`
  --   = طابع المعاملة ⇒ **متساوية كلها**، فالفرز يقع على `id` وحده.
  --   نُفرِّق الطوابع صراحةً ليُختبَر المفتاحان معاً.
  UPDATE public.employee_documents d
     SET created_at = now() - (s.rn || ' hours')::INTERVAL
    FROM (SELECT id, row_number() OVER (ORDER BY title) rn
            FROM public.employee_documents
           WHERE tenant_id='a3600000-0000-0000-0000-00000000000a') s
   WHERE d.id = s.id AND d.title <> 'حدّ 31';
  -- ★ «حدّ 31» تبقى بطابع المعاملة (الأحدث) لتُختبَر التسوية على id
  UPDATE public.employee_documents SET created_at = now()
   WHERE title IN ('حدّ 31','حدّ 30');

  -- الترتيب المرجعيّ المستقلّ
  SELECT string_agg(t.title, '|' ORDER BY t.created_at DESC, t.id DESC)
    INTO v_want
    FROM public.employee_documents t
   WHERE t.tenant_id='a3600000-0000-0000-0000-00000000000a'
     AND NOT t.is_archived;

  -- ترتيب اللوح كما خرج فعلاً
  SELECT string_agg(b.out_title, '|' ORDER BY b.rn) INTO v_board
    FROM (SELECT out_title, row_number() OVER () rn
            FROM public.employee_documents_board(NULL, FALSE)) b;

  PERFORM pg_temp.chk('13.4 ترتيب اللوح = المرجع الحتميّ', v_board, v_want);

  -- ★★ والمفتاحان مُفعَّلان فعلاً: طابعان متساويان يُفصَلان بـid تنازلياً
  PERFORM pg_temp.chk('13.5 التسوية على id تنازلياً',
    (SELECT (a.id > b.id)::TEXT
       FROM public.employee_documents a, public.employee_documents b
      WHERE a.title='حدّ 31' AND b.title='حدّ 30'
        AND a.created_at = b.created_at
        AND position(a.title||'|'||b.title IN v_board) > 0
      UNION ALL
     SELECT (b.id > a.id)::TEXT
       FROM public.employee_documents a, public.employee_documents b
      WHERE a.title='حدّ 31' AND b.title='حدّ 30'
        AND a.created_at = b.created_at
        AND position(b.title||'|'||a.title IN v_board) > 0), 'true');
END $$;

\echo ''
\echo '═══ ★★★ ⑭ العطل ①: ضبط السرّية والقفل ═══'

DO $$
DECLARE v_ok BOOLEAN; v_m TEXT; v_n INTEGER;
BEGIN
  -- هدى ترفع سرّية عقد سالم
  PERFORM public.document_set_confidential(
    current_setting('kyvzon.t360_d1')::UUID, TRUE);
  PERFORM pg_temp.chk('14.1 العقد صار سرّياً',
    (SELECT is_confidential::TEXT FROM public.employee_documents
      WHERE id = current_setting('kyvzon.t360_d1')::UUID), 'true');

  -- ★★ وسالم فقد رؤيته فوراً
  PERFORM set_config('request.jwt.claim.sub',
    '11600001-0000-0000-0000-000000000001', TRUE);
  v_n := (SELECT count(*) FROM public.employee_documents_board(NULL, FALSE));
  -- كان يرى: هوية · إقامة منتهية · حدّ30 · حدّ31 · عقد = 5 ⇒ صار 4
  PERFORM pg_temp.chk('14.2 سالم صار يرى 4', v_n::TEXT, '4');

  -- ★★★ والموظف لا يملك ضبط السرّية أصلاً
  v_ok := FALSE; v_m := '';
  BEGIN PERFORM public.document_set_confidential(
    current_setting('kyvzon.t360_d1')::UUID, FALSE);
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE;
            GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('14.3 الموظف لا يضبط السرّية', v_ok::TEXT, 'true');
  PERFORM pg_temp.chk('14.4 رمز DOCUMENT_NOT_AUTHORIZED',
    (position('DOCUMENT_NOT_AUTHORIZED' IN v_m) > 0)::TEXT, 'true');
  -- ★★ ولم تتغيّر القيمة فعلاً
  PERFORM pg_temp.chk('14.5 القيمة لم تتغيّر',
    (SELECT is_confidential::TEXT FROM public.employee_documents
      WHERE id = current_setting('kyvzon.t360_d1')::UUID), 'true');

  PERFORM set_config('request.jwt.claim.sub',
    '33600003-0000-0000-0000-000000000003', TRUE);

  -- ★★ الطبّي لا تُنزع سرّيته حتى من hr
  v_ok := FALSE; v_m := '';
  BEGIN PERFORM public.document_set_confidential(
    current_setting('kyvzon.t360_d2')::UUID, FALSE);
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE;
            GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('14.6 الطبّي مقفول', v_ok::TEXT, 'true');
  PERFORM pg_temp.chk('14.7 رمز DOCUMENT_CONFIDENTIAL_LOCKED',
    (position('DOCUMENT_CONFIDENTIAL_LOCKED' IN v_m) > 0)::TEXT, 'true');
  PERFORM pg_temp.chk('14.8 الطبّي ما زال سرّياً',
    (SELECT is_confidential::TEXT FROM public.employee_documents
      WHERE id = current_setting('kyvzon.t360_d2')::UUID), 'true');

  -- ★★★ وثيقة مستأجرٍ آخر: DOCUMENT_NOT_FOUND لا تسريب
  v_m := '';
  BEGIN PERFORM public.document_set_confidential(
    (SELECT id FROM public.employee_documents WHERE title='عقد باء'), TRUE);
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT; END;
  PERFORM pg_temp.chk('14.9 وثيقة باء = NOT_FOUND لهدى',
    (position('DOCUMENT_NOT_FOUND' IN v_m) > 0)::TEXT, 'true');

  -- استرجاع
  PERFORM public.document_set_confidential(
    current_setting('kyvzon.t360_d1')::UUID, FALSE);
END $$;

\echo ''
\echo '═══ ★★ ⑮ الملخّص بأرقام محسوبة يدوياً ═══'

DO $$
DECLARE r RECORD;
BEGIN
  SELECT * INTO r FROM public.employee_documents_summary();
  -- ألف: عقد · طبّي · هوية(+10) · شهادة ناصر · إقامة(-5) · حدّ30 · حدّ31 = 7
  PERFORM pg_temp.chk('15.1 الإجمالي',        r.out_total::TEXT,        '7');
  -- السرّيّ: الطبّي وحده (العقد أُعيد إلى false)
  PERFORM pg_temp.chk('15.2 السرّي',          r.out_confidential::TEXT, '1');
  -- المنتهي: إقامة(-5)
  PERFORM pg_temp.chk('15.3 المنتهي',         r.out_expired::TEXT,      '1');
  -- المُشرِف على الانتهاء: هوية(+10) · حدّ30 = 2  (حدّ31 خارج النافذة)
  PERFORM pg_temp.chk('15.4 يقارب الانتهاء',  r.out_expiring::TEXT,     '2');
  PERFORM pg_temp.chk('15.5 المؤرشف',         r.out_archived::TEXT,     '0');
  -- ★ ثلاث وثائق أُدرجت مباشرة (بلا الدالة) والمحفّز يملأ من auth.uid()
  --   والسياق هدى ⇒ لا وثيقة بلا رافع
  PERFORM pg_temp.chk('15.6 بلا رافع',        r.out_no_uploader::TEXT,  '0');

  -- ★★★ والملخّص محجوب عن الموظف
  PERFORM set_config('request.jwt.claim.sub',
    '11600001-0000-0000-0000-000000000001', TRUE);
  BEGIN
    SELECT * INTO r FROM public.employee_documents_summary();
    RAISE EXCEPTION 'FAIL: الملخّص لم يُحجب عن الموظف';
  EXCEPTION WHEN OTHERS THEN
    IF position('غير مصرَّح' IN SQLERRM) = 0 THEN RAISE; END IF;
  END;
  RAISE NOTICE 'ok   %  =  %', rpad('15.7 الملخّص محجوب عن الموظف',52,'.'), 'true';

  PERFORM set_config('request.jwt.claim.sub',
    '33600003-0000-0000-0000-000000000003', TRUE);
END $$;

\echo ''
\echo '═══ ★★ ⑯ ملخّص باء معزول ═══'

DO $$
DECLARE r RECORD;
BEGIN
  PERFORM set_config('request.jwt.claim.sub',
    '77600007-0000-0000-0000-000000000007', TRUE);
  SELECT * INTO r FROM public.employee_documents_summary();
  -- باء: عقد باء وحده
  PERFORM pg_temp.chk('16.1 إجمالي باء', r.out_total::TEXT, '1');
  PERFORM pg_temp.chk('16.2 سرّي باء',   r.out_confidential::TEXT, '0');
END $$;

\echo ''
\echo '════════════ كل تأكيدات 0360 نجحت ════════════'
ROLLBACK;
