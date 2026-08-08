-- ════════════════════════════════════════════════════════════════════════
--  verify-health-safety-0369.sql — التحقق السلوكيّ من المايجريشن 0369
--
--  ★ يعمل بدور postgres (BYPASSRLS): يُثبت منطق الدوال والقيود والمحفّزات.
--  ★★ كلُّ عدٍّ مُرشَّحٌ بمستأجر الاختبار صراحةً (درس انحدار 0367).
--
--  psql -h /home/user/.pgtest/sock -p 5508 -U postgres -f tools/dev/verify-health-safety-0369.sql
-- ════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on
\pset pager off
\t on

BEGIN;

DO $$
DECLARE v_n INTEGER;
BEGIN
  SELECT count(*) INTO v_n FROM incidents
   WHERE tenant_id IN ('a3690000-0000-0000-0000-00000000000a',
                       'b3690000-0000-0000-0000-00000000000b');
  ASSERT v_n = 0, 'التهيئة: مستأجرا الاختبار ملوَّثان بـ' || v_n || ' صفّاً';
END $$;

-- ══════════════════════ العيّنة ══════════════════════
INSERT INTO tenants (id, name, name_ar, slug) VALUES
  ('a3690000-0000-0000-0000-00000000000a','A','شركة ألف','a369-hse'),
  ('b3690000-0000-0000-0000-00000000000b','B','شركة باء','b369-hse');
INSERT INTO auth.users (id, email) VALUES
  ('13690001-0000-0000-0000-000000000001','huda@a369'),
  ('23690002-0000-0000-0000-000000000002','salem@a369'),
  ('33690003-0000-0000-0000-000000000003','noor@a369'),
  ('43690004-0000-0000-0000-000000000004','laila@b369'),
  ('53690005-0000-0000-0000-000000000005','badr@b369');
INSERT INTO profiles (id, tenant_id, full_name, role, department) VALUES
  ('13690001-0000-0000-0000-000000000001','a3690000-0000-0000-0000-00000000000a','هدى الموارد','hr','الموارد'),
  ('23690002-0000-0000-0000-000000000002','a3690000-0000-0000-0000-00000000000a','سالم الأول','employee','الإنتاج'),
  ('33690003-0000-0000-0000-000000000003','a3690000-0000-0000-0000-00000000000a','نور الثانية','employee','الإنتاج'),
  ('43690004-0000-0000-0000-000000000004','b3690000-0000-0000-0000-00000000000b','ليلى الموارد','hr','الموارد'),
  ('53690005-0000-0000-0000-000000000005','b3690000-0000-0000-0000-00000000000b','بدر الباء','employee','الإنتاج');

CREATE TEMP TABLE t_ids AS
SELECT
  (SELECT id FROM employees WHERE user_id='23690002-0000-0000-0000-000000000002') AS salem,
  (SELECT id FROM employees WHERE user_id='33690003-0000-0000-0000-000000000003') AS noor,
  (SELECT id FROM employees WHERE user_id='53690005-0000-0000-0000-000000000005') AS badr,
  'a3690000-0000-0000-0000-00000000000a'::UUID AS ta,
  'b3690000-0000-0000-0000-00000000000b'::UUID AS tb;

\echo '════════ ① ★★★★ العطل ①: تصنيفات السلامة ════════'

-- 1.1 ★★★★ — التصنيفات الأربعة التي كانت الصفحة تعرضها والقاعدة ترفضها
DO $$
DECLARE c TEXT; v_id UUID; v_n INTEGER := 0;
BEGIN
  FOREACH c IN ARRAY ARRAY['safety','work_injury','near_miss','security_incident'] LOOP
    INSERT INTO incidents (tenant_id, user_id, title, description, category, severity)
    VALUES ((SELECT ta FROM t_ids),'23690002-0000-0000-0000-000000000002',
            'حادث '||c,'وصف', c,'low') RETURNING id INTO v_id;
    ASSERT v_id IS NOT NULL, '1.1 التصنيف ' || c || ' رُفض';
    v_n := v_n + 1;
  END LOOP;
  ASSERT v_n = 4, '1.1 قُبِل ' || v_n || ' تصنيفاً بدل 4';
  RAISE NOTICE '  ✅ 1.1 التصنيفات الأربعة مقبولة (كان ثلاثةٌ منها يُخرج خطأ)';
END $$;

-- 1.2 ★★★ — والتصنيفات السبعة الأصلية باقية
DO $$
DECLARE c TEXT; v_id UUID; v_n INTEGER := 0;
BEGIN
  FOREACH c IN ARRAY ARRAY['technical','hr','management','workplace','salary','other'] LOOP
    INSERT INTO incidents (tenant_id, user_id, title, description, category, severity)
    VALUES ((SELECT ta FROM t_ids),'23690002-0000-0000-0000-000000000002',
            'قديم '||c,'وصف', c,'low') RETURNING id INTO v_id;
    v_n := v_n + 1;
  END LOOP;
  ASSERT v_n = 6, '1.2 انحدارٌ: تصنيفٌ قديم رُفض';
  RAISE NOTICE '  ✅ 1.2 التصنيفات القديمة الستة باقية (لا انحدار)';
END $$;

-- 1.3 ★★★ — ومفردةٌ مخترعة ما زالت مرفوضة (القيد لم يُفتح على مصراعيه)
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_msg TEXT;
BEGIN
  BEGIN
    INSERT INTO incidents (tenant_id, user_id, title, description, category, severity)
    VALUES ((SELECT ta FROM t_ids),'23690002-0000-0000-0000-000000000002',
            'مخترع','x','health_safety','low');
  EXCEPTION WHEN check_violation THEN v_ok := TRUE; v_msg := SQLERRM; END;
  ASSERT v_ok, '1.3 التصنيف الوهميّ health_safety قُبِل';
  ASSERT position('incidents_category_check' IN v_msg) > 0, '1.3 ' || v_msg;
  RAISE NOTICE '  ✅ 1.3 health_safety مرفوضٌ عمداً — كان شيفرةً ميتة في المُرشِّح';
END $$;

\echo '════════ ② المفاتيح والقيود — corrective_actions ════════'

-- 2.1 ★★★ — owner_id بلا وجود
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_msg TEXT;
BEGIN
  BEGIN
    INSERT INTO corrective_actions (tenant_id, title, owner_id)
    VALUES ((SELECT ta FROM t_ids),'مسؤولٌ معدوم',
            'ffffffff-ffff-ffff-ffff-ffffffffffff');
  EXCEPTION WHEN foreign_key_violation THEN v_ok := TRUE; v_msg := SQLERRM; END;
  ASSERT v_ok, '2.1 مسؤولٌ معدوم قُبِل';
  ASSERT position('fk_capa_owner_tenant' IN v_msg) > 0, '2.1 ' || v_msg;
  RAISE NOTICE '  ✅ 2.1 fk_capa_owner_tenant';
END $$;

-- 2.2 ★★★★ — إجراءٌ مربوطٌ بحادثٍ في مستأجرٍ آخر
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_bid UUID; v_msg TEXT;
BEGIN
  INSERT INTO incidents (id, tenant_id, user_id, title, description, category, severity)
  VALUES (gen_random_uuid(), (SELECT tb FROM t_ids),
          '53690005-0000-0000-0000-000000000005','حادثُ باء','x','safety','high')
  RETURNING id INTO v_bid;
  ASSERT v_bid IS NOT NULL, '2.2 حادث باء لم يُنشأ — التأكيد سيكون فارغاً';
  BEGIN
    INSERT INTO corrective_actions (tenant_id, incident_id, title)
    VALUES ((SELECT ta FROM t_ids), v_bid,'عابرُ مستأجر');
  EXCEPTION WHEN foreign_key_violation THEN v_ok := TRUE; v_msg := SQLERRM; END;
  ASSERT v_ok, '2.2 إجراءُ ألف رُبط بحادث باء';
  ASSERT position('fk_capa_incident_tenant' IN v_msg) > 0, '2.2 ' || v_msg;
  RAISE NOTICE '  ✅ 2.2 FK **مركَّب** يمنع العبور بين المستأجرين';
END $$;

-- 2.3 — العنوان من مسافات
DO $$
DECLARE v_ok BOOLEAN := FALSE;
BEGIN
  BEGIN
    INSERT INTO corrective_actions (tenant_id, title)
    VALUES ((SELECT ta FROM t_ids),'   ');
  EXCEPTION WHEN check_violation THEN v_ok := TRUE; END;
  ASSERT v_ok, '2.3 عنوانٌ من مسافات قُبِل';
  RAISE NOTICE '  ✅ 2.3 chk_capa_title_present';
END $$;

-- 2.4 ★★★ — «مكتمل» بلا مُنجِزٍ ولا لحظة
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_msg TEXT;
BEGIN
  BEGIN
    INSERT INTO corrective_actions (tenant_id, title, status, completed_at)
    VALUES ((SELECT ta FROM t_ids),'أُنجز بلا مُنجِز','completed', now());
  EXCEPTION WHEN check_violation THEN v_ok := TRUE; v_msg := SQLERRM; END;
  ASSERT v_ok, '2.4 «مكتمل» بلا completed_by قُبِل';
  ASSERT position('chk_capa_completed_complete' IN v_msg) > 0, '2.4 ' || v_msg;
  RAISE NOTICE '  ✅ 2.4 chk_capa_completed_complete';
END $$;

-- 2.5 ★★★ — «ملغى» بلا سبب
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_msg TEXT;
BEGIN
  BEGIN
    INSERT INTO corrective_actions (tenant_id, title, status, cancelled_at, cancelled_by)
    VALUES ((SELECT ta FROM t_ids),'أُلغي بلا سبب','cancelled', now(),
            '13690001-0000-0000-0000-000000000001');
  EXCEPTION WHEN check_violation THEN v_ok := TRUE; v_msg := SQLERRM; END;
  ASSERT v_ok, '2.5 «ملغى» بلا سبب قُبِل';
  ASSERT position('chk_capa_cancelled_complete' IN v_msg) > 0, '2.5 ' || v_msg;
  RAISE NOTICE '  ✅ 2.5 chk_capa_cancelled_complete';
END $$;

-- 2.5b ★★★ — والعكس: سببُ إلغاءٍ بلا إلغاء
DO $$
DECLARE v_ok BOOLEAN := FALSE;
BEGIN
  BEGIN
    INSERT INTO corrective_actions (tenant_id, title, cancel_reason)
    VALUES ((SELECT ta FROM t_ids),'سببٌ يتيم','لا شيء');
  EXCEPTION WHEN check_violation THEN v_ok := TRUE; END;
  ASSERT v_ok, '2.5b سببُ إلغاءٍ بلا إلغاءٍ قُبِل';
  RAISE NOTICE '  ✅ 2.5b القيد ثنائيُّ الاتّجاه';
END $$;

-- 2.6 ★★ — created_by و completed_by محروسان
DO $$
DECLARE v_a BOOLEAN := FALSE; v_b BOOLEAN := FALSE;
BEGIN
  BEGIN
    INSERT INTO corrective_actions (tenant_id, title, created_by)
    VALUES ((SELECT ta FROM t_ids),'منشئٌ معدوم',
            'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');
  EXCEPTION WHEN foreign_key_violation THEN v_a := TRUE; END;
  BEGIN
    INSERT INTO corrective_actions (tenant_id, title, status, completed_at, completed_by)
    VALUES ((SELECT ta FROM t_ids),'مُنجِزٌ معدوم','completed', now(),
            'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');
  EXCEPTION WHEN foreign_key_violation THEN v_b := TRUE; END;
  ASSERT v_a, '2.6a منشئٌ معدوم قُبِل';
  ASSERT v_b, '2.6b مُنجِزٌ معدوم قُبِل';
  RAISE NOTICE '  ✅ 2.6 created_by و completed_by محروسان (→ profiles)';
END $$;

\echo '════════ ③ المحفّز ════════'

SET request.jwt.claim.sub = '13690001-0000-0000-0000-000000000001';

-- 3.1 ★★ — استحقاقٌ في ماضٍ سحيق
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_msg TEXT;
        v_today DATE := (now() AT TIME ZONE 'Asia/Baghdad')::DATE;
BEGIN
  BEGIN
    INSERT INTO corrective_actions (tenant_id, title, due_date)
    VALUES ((SELECT ta FROM t_ids),'قديمٌ جداً', v_today - 366);
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; v_msg := SQLERRM; END;
  ASSERT v_ok, '3.1 استحقاقٌ قبل 366 يوماً قُبِل';
  ASSERT position('CAPA_DUE_TOO_OLD' IN v_msg) > 0, '3.1 ' || v_msg;
  RAISE NOTICE '  ✅ 3.1 CAPA_DUE_TOO_OLD';
END $$;

-- 3.1b ★★★ — والحدُّ الداخليّ (-365) مقبول
DO $$
DECLARE v_id UUID; v_today DATE := (now() AT TIME ZONE 'Asia/Baghdad')::DATE;
BEGIN
  INSERT INTO corrective_actions (tenant_id, title, due_date)
  VALUES ((SELECT ta FROM t_ids),'على الحدّ', v_today - 365) RETURNING id INTO v_id;
  ASSERT v_id IS NOT NULL, '3.1b الحدّ الداخليّ مرفوض — صرامةٌ بلا داعٍ';
  RAISE NOTICE '  ✅ 3.1b الحدّ -365 مقبول';
END $$;

-- 3.2 ★★★ — created_by يُملأ آلياً
DO $$
DECLARE v_id UUID; v_by UUID;
BEGIN
  INSERT INTO corrective_actions (tenant_id, title)
  VALUES ((SELECT ta FROM t_ids),'منشئٌ آليّ') RETURNING id, created_by INTO v_id, v_by;
  ASSERT v_by = '13690001-0000-0000-0000-000000000001',
         '3.2 created_by = ' || COALESCE(v_by::TEXT,'<NULL>');
  RAISE NOTICE '  ✅ 3.2 created_by من auth.uid()';
END $$;

-- 3.3 ★★★ — الإنجاز يملأ اللحظة والمُنجِز آلياً (فيُرضي القيد)
DO $$
DECLARE v_id UUID; v_at TIMESTAMPTZ; v_by UUID; v_st TIMESTAMPTZ;
BEGIN
  INSERT INTO corrective_actions (tenant_id, title)
  VALUES ((SELECT ta FROM t_ids),'دورةٌ كاملة') RETURNING id INTO v_id;
  UPDATE corrective_actions SET status='in_progress' WHERE id=v_id;
  SELECT started_at INTO v_st FROM corrective_actions WHERE id=v_id;
  ASSERT v_st IS NOT NULL, '3.3 started_at لم يُملأ';
  UPDATE corrective_actions SET status='completed' WHERE id=v_id;
  SELECT completed_at, completed_by INTO v_at, v_by FROM corrective_actions WHERE id=v_id;
  ASSERT v_at IS NOT NULL, '3.3 completed_at لم يُملأ';
  ASSERT v_by = '13690001-0000-0000-0000-000000000001', '3.3 المُنجِز خطأ';
  RAISE NOTICE '  ✅ 3.3 started_at و completed_at و completed_by آليّة';
END $$;

-- 3.4 ★★★ — الخروج من «مكتمل» يُفرغ حقوله
DO $$
DECLARE v_id UUID; v_at TIMESTAMPTZ; v_by UUID;
BEGIN
  SELECT id INTO v_id FROM corrective_actions WHERE title='دورةٌ كاملة';
  UPDATE corrective_actions SET status='in_progress' WHERE id=v_id;
  SELECT completed_at, completed_by INTO v_at, v_by FROM corrective_actions WHERE id=v_id;
  ASSERT v_at IS NULL AND v_by IS NULL, '3.4 حقول الإنجاز لم تُفرَغ';
  RAISE NOTICE '  ✅ 3.4 الخروج من «مكتمل» يُفرغ حقوله (القيد يبقى راضياً)';
END $$;

-- 3.5 ★★ — المحفّز يُجمّد المستأجر والمُنشئ
DO $$
DECLARE v_id UUID; v_t UUID; v_by UUID;
BEGIN
  SELECT id INTO v_id FROM corrective_actions WHERE title='منشئٌ آليّ';
  UPDATE corrective_actions
     SET tenant_id=(SELECT tb FROM t_ids),
         created_by='43690004-0000-0000-0000-000000000004' WHERE id=v_id;
  SELECT tenant_id, created_by INTO v_t, v_by FROM corrective_actions WHERE id=v_id;
  ASSERT v_t = (SELECT ta FROM t_ids), '3.5 المستأجر تغيّر';
  ASSERT v_by = '13690001-0000-0000-0000-000000000001', '3.5 المُنشئ تغيّر';
  RAISE NOTICE '  ✅ 3.5 المحفّز يُجمّد tenant_id و created_by';
END $$;

-- 3.6 ★★ — منع الحذف
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_id UUID; v_msg TEXT;
BEGIN
  SELECT id INTO v_id FROM corrective_actions WHERE title='منشئٌ آليّ';
  BEGIN DELETE FROM corrective_actions WHERE id=v_id;
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; v_msg := SQLERRM; END;
  ASSERT v_ok, '3.6 الحذف نجح';
  ASSERT position('CAPA_DELETE_BLOCKED' IN v_msg) > 0, '3.6 ' || v_msg;
  RAISE NOTICE '  ✅ 3.6 CAPA_DELETE_BLOCKED';
END $$;

-- 3.7 ★★★ — حذفُ الحادث مُقيَّدٌ بإجراءاته (RESTRICT لا SET NULL)
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_iid UUID; v_def TEXT;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def FROM pg_constraint
   WHERE conname='fk_capa_incident_tenant';
  ASSERT position('ON DELETE RESTRICT' IN v_def) > 0,
         '3.7 القيد ما زال SET NULL: ' || v_def;
  RAISE NOTICE '  ✅ 3.7 حذفُ الحادث لا يُيتّم إجراءاته (RESTRICT)';
END $$;

\echo '════════ ④ دوال CAPA ════════'

-- 4.1 ★★ — capa_open ينجح و btrim مُطبَّق
DO $$
DECLARE v_id UUID; v_iid UUID; v_t TEXT; v_by UUID;
BEGIN
  SELECT id INTO v_iid FROM incidents
   WHERE tenant_id=(SELECT ta FROM t_ids) AND title='حادث safety';
  v_id := capa_open(v_iid,'  تركيب لافتات تحذير  ','  في الممرّ  ','high',
                    '23690002-0000-0000-0000-000000000002',
                    (now() AT TIME ZONE 'Asia/Baghdad')::DATE + 14);
  SELECT title, created_by INTO v_t, v_by FROM corrective_actions WHERE id=v_id;
  ASSERT v_t = 'تركيب لافتات تحذير', '4.1 btrim لم يُطبَّق: [' || v_t || ']';
  ASSERT v_by = '13690001-0000-0000-0000-000000000001', '4.1 المُنشئ خطأ';
  RAISE NOTICE '  ✅ 4.1 capa_open ينجح · btrim · المُنشئ صحيح';
END $$;

-- 4.2 ★★ — العنوان الفارغ مرفوضٌ بحارس الدالة
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_msg TEXT;
BEGIN
  BEGIN PERFORM capa_open(NULL,'   ','x');
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; v_msg := SQLERRM; END;
  ASSERT v_ok, '4.2 عنوانٌ فارغ قُبِل';
  ASSERT position('CAPA_TITLE_REQUIRED' IN v_msg) > 0,
         '4.2 مُنع بالقيد لا بحارس الدالة: ' || v_msg;
  RAISE NOTICE '  ✅ 4.2 CAPA_TITLE_REQUIRED (حارس الدالة يسبق القيد)';
END $$;

-- 4.3 ★★★ — الموظف لا يُنشئ إجراءً
SET request.jwt.claim.sub = '23690002-0000-0000-0000-000000000002';
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_msg TEXT;
BEGIN
  BEGIN PERFORM capa_open(NULL,'من الموظف','x');
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; v_msg := SQLERRM; END;
  ASSERT v_ok, '4.3 موظفٌ عاديّ أنشأ إجراءً';
  ASSERT position('CAPA_NOT_STAFF' IN v_msg) > 0, '4.3 ' || v_msg;
  RAISE NOTICE '  ✅ 4.3 CAPA_NOT_STAFF';
END $$;

-- 4.4 ★★ — دورة البدء والإنجاز
SET request.jwt.claim.sub = '13690001-0000-0000-0000-000000000001';
DO $$
DECLARE v_id UUID; v_st TEXT; v_note TEXT;
BEGIN
  SELECT id INTO v_id FROM corrective_actions WHERE title='تركيب لافتات تحذير';
  ASSERT capa_start(v_id), '4.4 البدء فشل';
  SELECT status INTO v_st FROM corrective_actions WHERE id=v_id;
  ASSERT v_st = 'in_progress', '4.4 الحالة ' || v_st;
  ASSERT NOT capa_start(v_id), '4.4 البدء المكرَّر رجع TRUE';

  ASSERT capa_complete(v_id,'  فُحصت اللافتات ميدانياً  '), '4.4 الإنجاز فشل';
  SELECT status, verification_note INTO v_st, v_note
    FROM corrective_actions WHERE id=v_id;
  ASSERT v_st = 'completed', '4.4 الحالة بعد الإنجاز ' || v_st;
  ASSERT v_note = 'فُحصت اللافتات ميدانياً', '4.4 ملاحظة التحقّق [' || v_note || ']';
  ASSERT NOT capa_complete(v_id), '4.4 الإنجاز المكرَّر رجع TRUE';
  RAISE NOTICE '  ✅ 4.4 دورة البدء والإنجاز · ملاحظة التحقّق محفوظة';
END $$;

-- 4.5 ★★★ — لا إلغاءَ لإجراءٍ أُنجز
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_id UUID; v_msg TEXT;
BEGIN
  SELECT id INTO v_id FROM corrective_actions WHERE title='تركيب لافتات تحذير';
  BEGIN PERFORM capa_cancel(v_id,'تراجعتُ');
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; v_msg := SQLERRM; END;
  ASSERT v_ok, '4.5 أُلغي إجراءٌ أُنجز';
  ASSERT position('CAPA_ALREADY_COMPLETED' IN v_msg) > 0, '4.5 ' || v_msg;
  RAISE NOTICE '  ✅ 4.5 CAPA_ALREADY_COMPLETED';
END $$;

-- 4.6 ★★★ — الإلغاء يستلزم سبباً ثم ينجح
DO $$
DECLARE v_id UUID; v_ok BOOLEAN := FALSE; v_msg TEXT; v_r TEXT; v_st TEXT; v_by UUID;
BEGIN
  v_id := capa_open(NULL,'إجراءٌ سيُلغى','x','low');
  BEGIN PERFORM capa_cancel(v_id,'  ');
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; v_msg := SQLERRM; END;
  ASSERT v_ok, '4.6 إلغاءٌ بلا سبب قُبِل';
  ASSERT position('CAPA_CANCEL_REASON_REQUIRED' IN v_msg) > 0, '4.6 ' || v_msg;

  ASSERT capa_cancel(v_id,'الحادث لم يتكرّر'), '4.6 الإلغاء فشل';
  SELECT status, cancel_reason, cancelled_by INTO v_st, v_r, v_by
    FROM corrective_actions WHERE id=v_id;
  ASSERT v_st = 'cancelled', '4.6 الحالة ' || v_st;
  ASSERT v_r = 'الحادث لم يتكرّر', '4.6 السبب [' || v_r || ']';
  ASSERT v_by = '13690001-0000-0000-0000-000000000001', '4.6 الفاعل خطأ';
  ASSERT NOT capa_cancel(v_id,'مجدداً'), '4.6 الإلغاء المكرَّر رجع TRUE';
  RAISE NOTICE '  ✅ 4.6 الإلغاء كامل · المكرَّر = FALSE';
END $$;

-- 4.7 ★★★ — لا إنجازَ لإجراءٍ مُلغى
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_id UUID; v_msg TEXT;
BEGIN
  SELECT id INTO v_id FROM corrective_actions WHERE title='إجراءٌ سيُلغى';
  BEGIN PERFORM capa_complete(v_id,'x');
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; v_msg := SQLERRM; END;
  ASSERT v_ok, '4.7 أُنجز إجراءٌ مُلغى';
  ASSERT position('CAPA_CANCELLED' IN v_msg) > 0, '4.7 ' || v_msg;
  RAISE NOTICE '  ✅ 4.7 CAPA_CANCELLED';
END $$;

\echo '════════ ⑤ اللوحان والملخّص ════════'

-- 5.1 ★★★★ — needs_capa: حادثٌ جسيمٌ بلا إجراء
DO $$
DECLARE v_iid UUID; v_flag BOOLEAN; v_n INTEGER;
BEGIN
  -- حادثٌ حرجٌ بلا إجراء
  INSERT INTO incidents (tenant_id, user_id, title, description, category, severity, status)
  VALUES ((SELECT ta FROM t_ids),'23690002-0000-0000-0000-000000000002',
          'انفجارٌ صغير','في المختبر','safety','critical','pending')
  RETURNING id INTO v_iid;
  SELECT needs_capa INTO v_flag FROM safety_incident_board()
   WHERE title='انفجارٌ صغير';
  ASSERT v_flag, '5.1 لم يُرصد حادثٌ حرجٌ بلا إجراء';

  -- ★ وبعد إنشاء إجراءٍ له يختفي العَلَم
  PERFORM capa_open(v_iid,'مراجعة إجراءات المختبر','x','critical');
  SELECT needs_capa INTO v_flag FROM safety_incident_board()
   WHERE title='انفجارٌ صغير';
  ASSERT NOT v_flag, '5.1b العَلَم بقي رغم وجود إجراء';
  RAISE NOTICE '  ✅ 5.1 needs_capa: true ← false بعد الإجراء';
END $$;

-- 5.1b ★★★ — والإجراء الملغى لا يُسقط العَلَم
DO $$
DECLARE v_iid UUID; v_aid UUID; v_flag BOOLEAN;
BEGIN
  INSERT INTO incidents (tenant_id, user_id, title, description, category, severity, status)
  VALUES ((SELECT ta FROM t_ids),'23690002-0000-0000-0000-000000000002',
          'تسرّبُ غاز','في المستودع','safety','high','pending')
  RETURNING id INTO v_iid;
  v_aid := capa_open(v_iid,'إجراءٌ سيُلغى للاختبار','x','high');
  PERFORM capa_cancel(v_aid,'غير لازم');
  SELECT needs_capa INTO v_flag FROM safety_incident_board() WHERE title='تسرّبُ غاز';
  ASSERT v_flag, '5.1b إجراءٌ ملغى أسقط العَلَم — شرط status <> cancelled لا يعمل';
  RAISE NOTICE '  ✅ 5.1b الإجراء الملغى لا يُسقط needs_capa';
END $$;

-- 5.2 ★★★★ — الإبلاغ المجهول يُحترم (درس 0338)
DO $$
DECLARE v_name TEXT;
BEGIN
  INSERT INTO incidents (tenant_id, user_id, title, description, category,
                         severity, is_anonymous, employee_id)
  VALUES ((SELECT ta FROM t_ids),'23690002-0000-0000-0000-000000000002',
          'بلاغٌ مجهول','x','safety','high', TRUE, (SELECT salem FROM t_ids));
  SELECT employee_name INTO v_name FROM safety_incident_board()
   WHERE title='بلاغٌ مجهول';
  ASSERT v_name = 'مُبلِّغ مجهول',
         '5.2 اسمُ المُبلِّغ المجهول تسرّب: [' || v_name || ']';
  RAISE NOTICE '  ✅ 5.2 الإبلاغ المجهول محميّ في اللوح';
END $$;

-- 5.3 ★★★ — اللوح يقتصر على تصنيفات السلامة الأربعة
DO $$
DECLARE v_n INTEGER;
BEGIN
  SELECT count(*) INTO v_n FROM safety_incident_board() b
   JOIN incidents i ON i.id = b.id
   WHERE i.tenant_id = (SELECT ta FROM t_ids)
     AND i.category NOT IN ('safety','work_injury','near_miss','security_incident');
  ASSERT v_n = 0, '5.3 تسرّب ' || v_n || ' حادثاً غير سلاميّ';
  -- ★ والستّة القديمة موجودةٌ فعلاً في الجدول ⇒ التأكيد ليس فراغاً
  SELECT count(*) INTO v_n FROM incidents
   WHERE tenant_id=(SELECT ta FROM t_ids) AND category='technical';
  ASSERT v_n = 1, '5.3 لا حادثَ تقنيّ في العيّنة — التأكيد فارغ';
  RAISE NOTICE '  ✅ 5.3 اللوح يُرشّح التصنيفات (والعيّنة فيها غيرُها)';
END $$;

-- 5.4 ★★★ — actions_total و actions_open
DO $$
DECLARE v_tot INTEGER; v_open INTEGER;
BEGIN
  SELECT actions_total, actions_open INTO v_tot, v_open
    FROM safety_incident_board() WHERE title='انفجارٌ صغير';
  ASSERT v_tot = 1, '5.4 actions_total=' || v_tot;
  ASSERT v_open = 1, '5.4 actions_open=' || v_open;
  RAISE NOTICE '  ✅ 5.4 عدّادا الإجراءات في اللوح';
END $$;

-- 5.5 ★★★ — is_overdue في لوح CAPA
DO $$
DECLARE v_id UUID; v_over BOOLEAN; v_days INTEGER;
        v_today DATE := (now() AT TIME ZONE 'Asia/Baghdad')::DATE;
BEGIN
  v_id := capa_open(NULL,'متأخّرٌ عمداً','x','high', NULL, v_today - 10);
  SELECT is_overdue, days_to_due INTO v_over, v_days
    FROM capa_board() WHERE title='متأخّرٌ عمداً';
  ASSERT v_over, '5.5 لم يُرصد التأخّر';
  ASSERT v_days = -10, '5.5 days_to_due=' || v_days || ' بدل -10';
  -- ★ والمُنجَز المتأخّر لا يُعدّ متأخّراً
  PERFORM capa_complete(v_id,'أُنجز متأخّراً');
  SELECT is_overdue INTO v_over FROM capa_board() WHERE title='متأخّرٌ عمداً';
  ASSERT NOT v_over, '5.5b المُنجَز ما زال يُعدّ متأخّراً';
  RAISE NOTICE '  ✅ 5.5 is_overdue: مفتوحٌ متأخّر=true · مُنجَز=false';
END $$;

-- 5.6 ★★★ — الملخّص بأرقامٍ مُرشَّحةٍ بمستأجرنا
DO $$
DECLARE r RECORD; v_ext INTEGER;
BEGIN
  SELECT count(*) INTO v_ext FROM corrective_actions
   WHERE tenant_id NOT IN ((SELECT ta FROM t_ids),(SELECT tb FROM t_ids));
  SELECT * INTO r FROM health_safety_summary();
  -- ★ نقيس مباشرةً من الجدول لا من الملخّص وحده
  ASSERT (SELECT count(*) FROM incidents
           WHERE tenant_id=(SELECT ta FROM t_ids)
             AND category IN ('safety','work_injury','near_miss','security_incident')
             AND archived_at IS NULL) = 7,
         '5.6 حوادث السلامة في مستأجرنا ليست 7';
  -- ★★★★ الفجوة: «تسرّبُ غاز» و«بلاغٌ مجهول» جسيمان مفتوحان بلا إجراءٍ فعّال
  ASSERT r.incidents_no_capa >= 2,
         '5.6 incidents_no_capa=' || r.incidents_no_capa || ' — الفجوة لا تُرصد';
  -- ★ تصحيحُ عدٍّ منّي: كتبتُ 0 ناسياً «إجراءٌ سيُلغى للاختبار» في 5.1b
  --   (أُلغي فلا يُعدّ) و«متأخّرٌ عمداً» في 5.5 (أُنجز فلا يُعدّ) —
  --   لكنّ `capa_open` في 5.1b أنشأ إجراءً بلا due_date. المتأخّر
  --   الوحيد الباقي هو ما أنشأته 5.5 قبل إنجازه… فحصُ القيمة المطلقة
  --   هشّ. نقيس بالجدول مباشرةً ومُرشَّحاً بمستأجرنا.
  ASSERT r.capa_overdue = (SELECT count(*) FROM corrective_actions
                            WHERE tenant_id = (SELECT ta FROM t_ids)
                              AND due_date IS NOT NULL
                              AND due_date < (now() AT TIME ZONE 'Asia/Baghdad')::DATE
                              AND status IN ('open','in_progress')),
         '5.6 capa_overdue=' || r.capa_overdue || ' لا يُطابق الجدول';
  ASSERT r.capa_cancelled >= 2, '5.6 الملغى=' || r.capa_cancelled;
  RAISE NOTICE '  ✅ 5.6 الملخّص: فجوة CAPA=% · متأخّر=0 · ملغى=%',
    r.incidents_no_capa, r.capa_cancelled;
END $$;

-- 5.7 ★★★ — عدّاد المتأخّرات حيٌّ لا صفرٌ بنيويّ
DO $$
DECLARE r RECORD; v_before INTEGER; v_today DATE := (now() AT TIME ZONE 'Asia/Baghdad')::DATE;
BEGIN
  SELECT capa_overdue INTO v_before FROM health_safety_summary();
  PERFORM capa_open(NULL,'متأخّرٌ للعدّاد','x','low', NULL, v_today - 5);
  SELECT * INTO r FROM health_safety_summary();
  ASSERT r.capa_overdue = v_before + 1,
         '5.7 العدّاد لم يرتفع: ' || v_before || ' ← ' || r.capa_overdue;
  RAISE NOTICE '  ✅ 5.7 capa_overdue: % ← % (عدّادٌ حيّ)', v_before, r.capa_overdue;
END $$;

-- 5.8 ★★★ — ترتيب لوح CAPA: المتأخّر أولاً ثم الأولوية
DO $$
DECLARE v_first TEXT; v_last TEXT; v_n INTEGER;
BEGIN
  SELECT count(*) INTO v_n FROM capa_board();
  SELECT title INTO v_last FROM capa_board() OFFSET (v_n - 1) LIMIT 1;
  -- ★ المُنجَز والملغى في الذيل
  ASSERT (SELECT status FROM capa_board() OFFSET (v_n - 1) LIMIT 1)
         IN ('completed','cancelled'),
         '5.8 آخر صفّ ليس مُنجَزاً ولا مُلغى: [' || v_last || ']';
  SELECT status INTO v_first FROM capa_board() LIMIT 1;
  ASSERT v_first IN ('open','in_progress'), '5.8 أول صفّ [' || v_first || ']';
  RAISE NOTICE '  ✅ 5.8 الترتيب: المفتوح أولاً · المُنجَز في الذيل';
END $$;

-- 5.9 ★★ — الترشيح بالحادث
DO $$
DECLARE v_iid UUID; v_n INTEGER;
BEGIN
  SELECT id INTO v_iid FROM incidents
   WHERE tenant_id=(SELECT ta FROM t_ids) AND title='انفجارٌ صغير';
  SELECT count(*) INTO v_n FROM capa_board(NULL, NULL, v_iid);
  ASSERT v_n = 1, '5.9 إجراءات الحادث = ' || v_n || ' بدل 1';
  SELECT count(*) INTO v_n FROM capa_board(NULL,'cancelled');
  ASSERT v_n >= 2, '5.9b الملغاة = ' || v_n;
  RAISE NOTICE '  ✅ 5.9 الترشيح بالحادث وبالحالة';
END $$;

-- ═══════════════════════════════════════════════════════════════
--  ★★★ 5.10–5.16 — أعكاسٌ نجت لأن «لا بيانات تخالفها»
--
--  أوّل تشغيلٍ لـ_invert_0369.py أعطى 45/54. تسعةٌ نجت وكلُّ سببٍ
--  مُشخَّصٌ لا مُخمَّن:
--     INV15/INV27 — لا حادثَ **مؤرشفاً** في العيّنة إطلاقاً.
--     INV16 — كل إجراءات العيّنة مفتوحة، فحذفُ شرط الحالة لا يُغيّر العدّ.
--     INV17 — لا إجراءَ في مستأجرٍ آخر يحمل incident_id نفسه.
--     INV18 — ترتيب العيّنة الزمنيّ وافق المرجع صدفةً.
--     INV22 — لم يُمرَّر p_status إلى capa_board في تأكيدٍ يعدّ.
--     INV31 — المحفّز يملأ created_by فيُخفي سقوط الدالة (درس 0368/INV35).
--     INV39 — لم يُمرَّر معرّفٌ من مستأجرٍ آخر إلى capa_cancel.
--     POL01 — انظر التشخيص في 6.1 أدناه.
-- ═══════════════════════════════════════════════════════════════

-- 5.10 ★★ [INV15/INV27] — الحادث المؤرشف يخرج من اللوح والملخّص
DO $$
DECLARE v_iid UUID; v_n1 INTEGER; v_n2 INTEGER; r RECORD; v_t1 INTEGER; v_t2 INTEGER;
BEGIN
  INSERT INTO incidents (tenant_id, user_id, title, description, category, severity)
  VALUES ((SELECT ta FROM t_ids),'23690002-0000-0000-0000-000000000002',
          'حادثٌ سيُؤرشف','x','safety','high') RETURNING id INTO v_iid;

  SELECT count(*) INTO v_n1 FROM safety_incident_board() WHERE title='حادثٌ سيُؤرشف';
  SELECT incidents_total INTO v_t1 FROM health_safety_summary();
  ASSERT v_n1 = 1, '5.10 الحادث الجديد لا يظهر';

  -- ★★★ الأرشفة (العمود موجودٌ منذ 0338)
  UPDATE incidents SET archived_at = now(),
                       archived_by = '13690001-0000-0000-0000-000000000001',
                       archive_reason = 'مكرَّر'
   WHERE id = v_iid;

  SELECT count(*) INTO v_n2 FROM safety_incident_board() WHERE title='حادثٌ سيُؤرشف';
  SELECT incidents_total INTO v_t2 FROM health_safety_summary();
  ASSERT v_n2 = 0, '5.10 المؤرشف ما زال في اللوح';
  ASSERT v_t2 = v_t1 - 1, '5.10 المؤرشف ما زال في الملخّص: ' || v_t1 || ' ← ' || v_t2;
  RAISE NOTICE '  ✅ 5.10 [INV15/INV27] المؤرشف يخرج من اللوح والملخّص';
END $$;

-- 5.11 ★★ [INV16] — actions_open يُسقط المُنجَزة
DO $$
DECLARE v_iid UUID; v_aid UUID; v_tot INTEGER; v_open INTEGER;
BEGIN
  INSERT INTO incidents (tenant_id, user_id, title, description, category, severity)
  VALUES ((SELECT ta FROM t_ids),'23690002-0000-0000-0000-000000000002',
          'حادثٌ بإجراءَين','x','near_miss','high') RETURNING id INTO v_iid;
  PERFORM capa_open(v_iid,'إجراءٌ مفتوح','x','low');
  v_aid := capa_open(v_iid,'إجراءٌ سيُنجَز','x','low');
  PERFORM capa_complete(v_aid,'تمّ');

  SELECT actions_total, actions_open INTO v_tot, v_open
    FROM safety_incident_board() WHERE title='حادثٌ بإجراءَين';
  ASSERT v_tot = 2, '5.11 actions_total=' || v_tot || ' بدل 2';
  ASSERT v_open = 1, '5.11 actions_open=' || v_open || ' بدل 1 — المُنجَز يُعدّ';
  RAISE NOTICE '  ✅ 5.11 [INV16] actions_open=1 من أصل 2 (المُنجَز مُستثنى)';
END $$;

-- 5.12 ★★ [INV17] — عدّاد الإجراءات مُرشَّحٌ بالمستأجر
DO $$
DECLARE v_iid UUID; v_bid UUID; v_tot INTEGER;
BEGIN
  SELECT id INTO v_iid FROM incidents
   WHERE tenant_id=(SELECT ta FROM t_ids) AND title='حادثٌ بإجراءَين';
  -- ★★★ حادثٌ في باء **بالمعرّف نفسه** مستحيلٌ (UUID فريد)، لكن
  --   إجراءً في باء يُشير إلى `incident_id` نفسه ممكنٌ لو سقط FK.
  --   نُدرجه بتعطيل FK مؤقتاً — وهذا هو ما يحرسه ترشيح المستأجر.
  ALTER TABLE corrective_actions DROP CONSTRAINT fk_capa_incident_tenant;
  INSERT INTO corrective_actions (tenant_id, incident_id, title, created_by)
  VALUES ((SELECT tb FROM t_ids), v_iid,'إجراءُ باء المُشوِّش',
          '43690004-0000-0000-0000-000000000004');
  ALTER TABLE corrective_actions ADD CONSTRAINT fk_capa_incident_tenant
    FOREIGN KEY (incident_id, tenant_id)
    REFERENCES incidents (id, tenant_id) ON DELETE RESTRICT NOT VALID;

  SELECT actions_total INTO v_tot FROM safety_incident_board()
   WHERE title='حادثٌ بإجراءَين';
  ASSERT v_tot = 2, '5.12 العدّاد التقط إجراء باء: ' || v_tot || ' بدل 2';
  RAISE NOTICE '  ✅ 5.12 [INV17] عدّاد الإجراءات مُرشَّحٌ بالمستأجر';
END $$;

-- 5.13 ★★★ [INV18] — الترتيب لا يمرّ صدفةً
DO $$
DECLARE v_iid UUID; v_first TEXT; v_n INTEGER;
BEGIN
  -- ★★★ حادثٌ **أقدمُ زمنياً** لكنه حرجٌ ومفتوح: الترتيب الصحيح
  --   يضعه قبل الحوادث المُغلقة الأحدث. الترتيب الزمنيّ يعكسه.
  INSERT INTO incidents (tenant_id, user_id, title, description, category,
                         severity, status, created_at)
  VALUES ((SELECT ta FROM t_ids),'23690002-0000-0000-0000-000000000002',
          'حرجٌ قديم','x','safety','critical','pending', now() - INTERVAL '90 days')
  RETURNING id INTO v_iid;
  -- وحادثٌ **أحدث** لكنه مُغلق
  INSERT INTO incidents (tenant_id, user_id, title, description, category,
                         severity, status)
  VALUES ((SELECT ta FROM t_ids),'23690002-0000-0000-0000-000000000002',
          'مُغلقٌ حديث','x','safety','critical','closed');

  SELECT count(*) INTO v_n FROM safety_incident_board();
  SELECT title INTO v_first FROM safety_incident_board() LIMIT 1;
  ASSERT v_first <> 'مُغلقٌ حديث', '5.13 المُغلق تصدّر — الترتيب زمنيٌّ بحت';
  ASSERT (SELECT status FROM safety_incident_board() OFFSET (v_n - 1) LIMIT 1)
         IN ('resolved','closed'), '5.13 آخر صفّ ليس مُغلقاً';
  RAISE NOTICE '  ✅ 5.13 [INV18] المفتوح قبل المُغلق رغم القِدَم · الأول=«%»', v_first;
END $$;

-- 5.14 ★★ [INV22] — ترشيح الحالة في لوح CAPA
DO $$
DECLARE v_open INTEGER; v_done INTEGER; v_all INTEGER;
BEGIN
  SELECT count(*) INTO v_all  FROM capa_board();
  SELECT count(*) INTO v_open FROM capa_board(NULL,'open');
  SELECT count(*) INTO v_done FROM capa_board(NULL,'completed');
  ASSERT v_open > 0, '5.14 لا إجراءَ مفتوحاً — التأكيد فارغ';
  ASSERT v_done > 0, '5.14 لا إجراءَ مُنجَزاً — التأكيد فارغ';
  ASSERT v_open < v_all, '5.14 ترشيح open لا يُقلّص: ' || v_open || '/' || v_all;
  ASSERT v_done < v_all, '5.14 ترشيح completed لا يُقلّص';
  ASSERT v_open + v_done <= v_all, '5.14 المجاميع متناقضة';
  RAISE NOTICE '  ✅ 5.14 [INV22] الترشيح بالحالة: open=% · completed=% من %',
    v_open, v_done, v_all;
END $$;

-- 5.15 ★★ [INV31] — capa_open تملأ created_by بنفسها لا المحفّز
DO $$
DECLARE v_src TEXT;
BEGIN
  -- ★★★ المحفّز يملؤه أيضاً (COALESCE) فيُخفي سقوط الدالة —
  --   درسٌ تكرّر حرفياً من 0368/INV35. نفحص نصّ الدالة مباشرةً.
  SELECT pg_get_functiondef(oid) INTO v_src FROM pg_proc
   WHERE proname='capa_open' AND pronamespace='public'::regnamespace;
  ASSERT position('p_due_date, auth.uid())' IN v_src) > 0,
         '5.15 capa_open لا تُمرّر auth.uid() في الإدراج';
  RAISE NOTICE '  ✅ 5.15 [INV31] capa_open تُمرّر المُنشئ صراحةً';
END $$;

-- 5.16 ★★ [INV39] — ترشيح المستأجر في capa_cancel
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_bid UUID; v_aid UUID; v_msg TEXT; v_st TEXT;
BEGIN
  -- ★★★ إجراءٌ حقيقيٌّ في مستأجر باء — وإلّا كان التأكيد فراغاً
  INSERT INTO incidents (id, tenant_id, user_id, title, description, category, severity)
  VALUES (gen_random_uuid(), (SELECT tb FROM t_ids),
          '53690005-0000-0000-0000-000000000005','حادثٌ ثانٍ في باء','x','safety','high')
  RETURNING id INTO v_bid;
  INSERT INTO corrective_actions (tenant_id, incident_id, title, created_by)
  VALUES ((SELECT tb FROM t_ids), v_bid,'إجراءُ باء الحقيقيّ',
          '43690004-0000-0000-0000-000000000004')
  RETURNING id INTO v_aid;
  ASSERT v_aid IS NOT NULL, '5.16 إجراء باء لم يُنشأ';

  -- السياق ما زال هدى (مستأجر ألف)
  BEGIN PERFORM capa_cancel(v_aid,'من ألف');
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; v_msg := SQLERRM; END;
  ASSERT v_ok, '5.16 HR ألف ألغت إجراء باء';
  ASSERT position('CAPA_NOT_FOUND' IN v_msg) > 0, '5.16 ' || v_msg;
  SELECT status INTO v_st FROM corrective_actions WHERE id=v_aid;
  ASSERT v_st = 'open', '5.16 صفُّ باء تغيّر [' || v_st || ']';
  RAISE NOTICE '  ✅ 5.16 [INV39] ترشيح المستأجر في capa_cancel مُختبَر';
END $$;

\echo '════════ ⑥ السياسات والصلاحيات ════════'

-- 6.1 ★★★ — hybrid_gate على وحدة hr و RESTRICTIVE
DO $$
DECLARE v_mod TEXT; v_perm BOOLEAN;
BEGIN
  SELECT pg_get_expr(polqual,polrelid), polpermissive INTO v_mod, v_perm
    FROM pg_policy WHERE polrelid='public.corrective_actions'::regclass
     AND polname='hybrid_gate_corrective_actions';
  ASSERT position('''hr''' IN v_mod) > 0,
         '6.1 البوّابة ما زالت على وحدةٍ أخرى: ' || v_mod;
  -- ★★★ RESTRICTIVE إلزاماً — PERMISSIVE تُدمج بـOR فتُلغي العزل
  ASSERT NOT v_perm, '6.1 البوّابة صارت PERMISSIVE';
  RAISE NOTICE '  ✅ 6.1 hybrid_gate على hr و RESTRICTIVE';
  -- ★★★★ [POL01] هذا التأكيد **نصّيٌّ عمداً**، والسبب مُثبَت:
  --   `tenants.module_enforcement_mode` افتراضيّه `'off'`، و
  --   `subscription_allows_module()` تُعيد TRUE فوراً في هذا الوضع
  --   (السطر «IF v_mode = 'off' THEN RETURN TRUE»). ⇒ تغييرُ الوحدة
  --   من `hr` إلى `admin` **لا يُغيّر سلوكاً واحداً** ما دام الوضع
  --   مُطفأً — فلا سبيل إلى إثباته بسلوكٍ إلّا بتشغيل الإنفاذ، وهو
  --   خارج نطاق هذه الجولة. الفحص النصّيّ هو الحارس الوحيد الممكن،
  --   وأثرُ العطل حقيقيٌّ متى فُعّل الإنفاذ.
END $$;

-- 6.2 ★★★ — سياسة SELECT تسمح للمالك · و ALL أُسقطت
DO $$
DECLARE v_n INTEGER; v_q TEXT;
BEGIN
  SELECT count(*) INTO v_n FROM pg_policy
   WHERE polrelid='public.corrective_actions'::regclass
     AND polcmd='*' AND polpermissive;
  ASSERT v_n = 0, '6.2 سياسة ALL بيرمِسِف ما زالت (' || v_n || ')';

  SELECT pg_get_expr(polqual,polrelid) INTO v_q FROM pg_policy
   WHERE polrelid='public.corrective_actions'::regclass
     AND polname='kyvzon_corrective_actions_select';
  ASSERT position('owner_id = auth.uid()' IN v_q) > 0,
         '6.2 المالك لا يرى إجراءه: ' || v_q;
  RAISE NOTICE '  ✅ 6.2 لا ALL · والمالك يقرأ إجراءه';
END $$;

-- 6.3 — الصلاحيات
DO $$
DECLARE v_n INTEGER;
BEGIN
  SELECT count(*) INTO v_n FROM pg_proc p
   WHERE p.pronamespace='public'::regnamespace
     AND p.proname IN ('safety_incident_board','capa_board','health_safety_summary',
                       'capa_open','capa_start','capa_complete','capa_cancel')
     AND has_function_privilege('anon', p.oid, 'EXECUTE');
  ASSERT v_n = 0, '6.3 anon يملك EXECUTE على ' || v_n || ' دالة';
  SELECT count(*) INTO v_n FROM pg_proc p
   WHERE p.pronamespace='public'::regnamespace
     AND p.proname IN ('safety_incident_board','capa_board','health_safety_summary',
                       'capa_open','capa_start','capa_complete','capa_cancel');
  ASSERT v_n = 7, '6.3 عدد الدوال = ' || v_n || ' بدل 7';
  RAISE NOTICE '  ✅ 6.3 سبع دوال · anon محجوبٌ عن كلّها';
END $$;

\echo ''
\echo '════════════════════════════════════════'
\echo '  ✅ verify-health-safety-0369.sql — كل التأكيدات نجحت'
\echo '════════════════════════════════════════'

ROLLBACK;
