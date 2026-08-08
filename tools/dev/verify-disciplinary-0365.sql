-- ════════════════════════════════════════════════════════════════════════
--  verify-disciplinary-0365.sql — التحقق السلوكيّ من المايجريشن 0365
--
--  ★ يعمل بدور postgres (BYPASSRLS): يُثبت منطق الدوال والقيود والمحفّزات.
--    الجدار نفسه يُثبته verify-disciplinary-0365-rls.sh بدور authenticated.
--
--  كل رقمٍ في التأكيدات محسوبٌ يدوياً في تعليقه.
--
--  psql -h /home/user/.pgtest/sock -p 5499 -U postgres -f tools/dev/verify-disciplinary-0365.sql
-- ════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on
\pset pager off
\t on

BEGIN;

-- ══════════════════════ العيّنة ══════════════════════
-- مستأجران. ألف فيه: هدى (hr) · سالم · نور · فادي.  باء فيه: ليلى (hr) · بدر.
INSERT INTO tenants (id, name, name_ar, slug) VALUES
  ('a3650000-0000-0000-0000-00000000000a','A','شركة ألف','a365-disc'),
  ('b3650000-0000-0000-0000-00000000000b','B','شركة باء','b365-disc');

INSERT INTO auth.users (id, email) VALUES
  ('13650001-0000-0000-0000-000000000001','huda@a365'),
  ('23650002-0000-0000-0000-000000000002','salem@a365'),
  ('33650003-0000-0000-0000-000000000003','noor@a365'),
  ('43650004-0000-0000-0000-000000000004','fadi@a365'),
  ('53650005-0000-0000-0000-000000000005','laila@b365'),
  ('63650006-0000-0000-0000-000000000006','badr@b365');

INSERT INTO profiles (id, tenant_id, full_name, email, role, department) VALUES
  ('13650001-0000-0000-0000-000000000001','a3650000-0000-0000-0000-00000000000a','هدى الموارد','huda@a365','hr','الموارد'),
  ('23650002-0000-0000-0000-000000000002','a3650000-0000-0000-0000-00000000000a','سالم الأول','salem@a365','employee','الإنتاج'),
  ('33650003-0000-0000-0000-000000000003','a3650000-0000-0000-0000-00000000000a','نور الثانية','noor@a365','employee','الإنتاج'),
  ('43650004-0000-0000-0000-000000000004','a3650000-0000-0000-0000-00000000000a','فادي الثالث','fadi@a365','employee','الإنتاج'),
  ('53650005-0000-0000-0000-000000000005','b3650000-0000-0000-0000-00000000000b','ليلى الموارد','laila@b365','hr','الموارد'),
  ('63650006-0000-0000-0000-000000000006','b3650000-0000-0000-0000-00000000000b','بدر الباء','badr@b365','employee','الإنتاج');

-- المحفّز tg_ensure_employee_row أنشأ صفوف employees.
CREATE TEMP TABLE t_ids AS
SELECT
  (SELECT id FROM employees WHERE user_id='23650002-0000-0000-0000-000000000002') AS salem,
  (SELECT id FROM employees WHERE user_id='33650003-0000-0000-0000-000000000003') AS noor,
  (SELECT id FROM employees WHERE user_id='43650004-0000-0000-0000-000000000004') AS fadi,
  (SELECT id FROM employees WHERE user_id='63650006-0000-0000-0000-000000000006') AS badr;

\echo '════════ ① القيود والمفاتيح ════════'

-- 1.1 — FK مركَّب على الموظف يمنع الموظف المعدوم
DO $$
DECLARE v_ok BOOLEAN := FALSE;
BEGIN
  BEGIN
    INSERT INTO disciplinary_actions (tenant_id, employee_id, type, reason, severity, incident_date, issued_by)
    VALUES ('a3650000-0000-0000-0000-00000000000a','ffffffff-ffff-ffff-ffff-ffffffffffff',
            'written_warning','معدوم','low',CURRENT_DATE,'13650001-0000-0000-0000-000000000001');
  EXCEPTION WHEN foreign_key_violation THEN v_ok := TRUE; END;
  ASSERT v_ok, '1.1 موظفٌ معدوم قُبِل';
  RAISE NOTICE '  ✅ 1.1 موظفٌ معدوم مرفوض (FK مركَّب)';
END $$;

-- 1.2 — FK مركَّب على المُصدِر
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_s UUID;
BEGIN
  SELECT salem INTO v_s FROM t_ids;
  BEGIN
    INSERT INTO disciplinary_actions (tenant_id, employee_id, type, reason, severity, incident_date, issued_by)
    VALUES ('a3650000-0000-0000-0000-00000000000a', v_s,
            'written_warning','مُصدِرٌ معدوم','low',CURRENT_DATE,'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');
  EXCEPTION WHEN foreign_key_violation THEN v_ok := TRUE; END;
  ASSERT v_ok, '1.2 مُصدِرٌ معدوم قُبِل';
  RAISE NOTICE '  ✅ 1.2 مُصدِرٌ معدوم مرفوض';
END $$;

-- 1.3 ★★★ — العبور بين المستأجرين: بدر (باء) داخل مستأجر ألف
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_b UUID;
BEGIN
  SELECT badr INTO v_b FROM t_ids;
  ASSERT v_b IS NOT NULL, '1.3 بدر غير موجود — العيّنة ناقصة';
  BEGIN
    INSERT INTO disciplinary_actions (tenant_id, employee_id, type, reason, severity, incident_date, issued_by)
    VALUES ('a3650000-0000-0000-0000-00000000000a', v_b,
            'suspension','عبورُ مستأجر','high',CURRENT_DATE,'13650001-0000-0000-0000-000000000001');
  EXCEPTION WHEN foreign_key_violation THEN v_ok := TRUE; END;
  ASSERT v_ok, '1.3 موظفُ مستأجرٍ آخر قُبِل';
  RAISE NOTICE '  ✅ 1.3 موظفُ مستأجرٍ آخر مرفوض (FK **مركَّب** لا مفرد)';
END $$;

-- 1.4 — tenant_id NOT NULL
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_s UUID;
BEGIN
  SELECT salem INTO v_s FROM t_ids;
  BEGIN
    INSERT INTO disciplinary_actions (tenant_id, employee_id, type, reason, severity, incident_date, issued_by)
    VALUES (NULL, v_s,'verbal_warning','يتيم','low',CURRENT_DATE,'13650001-0000-0000-0000-000000000001');
  EXCEPTION WHEN not_null_violation THEN v_ok := TRUE; END;
  ASSERT v_ok, '1.4 صفٌّ بلا مستأجر قُبِل';
  RAISE NOTICE '  ✅ 1.4 tenant_id NOT NULL';
END $$;

-- 1.5 — المفردات الثلاث (type · severity · status)
DO $$
DECLARE v_s UUID; v_t BOOLEAN := FALSE; v_v BOOLEAN := FALSE; v_st BOOLEAN := FALSE;
BEGIN
  SELECT salem INTO v_s FROM t_ids;
  BEGIN INSERT INTO disciplinary_actions (tenant_id,employee_id,type,reason,severity,incident_date,issued_by)
        VALUES ('a3650000-0000-0000-0000-00000000000a',v_s,'execution','x','low',CURRENT_DATE,'13650001-0000-0000-0000-000000000001');
  EXCEPTION WHEN check_violation THEN v_t := TRUE; END;
  BEGIN INSERT INTO disciplinary_actions (tenant_id,employee_id,type,reason,severity,incident_date,issued_by)
        VALUES ('a3650000-0000-0000-0000-00000000000a',v_s,'verbal_warning','x','apocalyptic',CURRENT_DATE,'13650001-0000-0000-0000-000000000001');
  EXCEPTION WHEN check_violation THEN v_v := TRUE; END;
  BEGIN INSERT INTO disciplinary_actions (tenant_id,employee_id,type,reason,severity,incident_date,issued_by,status)
        VALUES ('a3650000-0000-0000-0000-00000000000a',v_s,'verbal_warning','x','low',CURRENT_DATE,'13650001-0000-0000-0000-000000000001','banana');
  EXCEPTION WHEN check_violation THEN v_st := TRUE; END;
  ASSERT v_t,  '1.5a type شاذّ قُبِل';
  ASSERT v_v,  '1.5b severity شاذّ قُبِل';
  ASSERT v_st, '1.5c status شاذّ قُبِل';
  RAISE NOTICE '  ✅ 1.5 المفردات الثلاث محروسة';
END $$;

-- 1.6 — سببٌ من مسافات
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_s UUID;
BEGIN
  SELECT salem INTO v_s FROM t_ids;
  BEGIN
    INSERT INTO disciplinary_actions (tenant_id,employee_id,type,reason,severity,incident_date,issued_by)
    VALUES ('a3650000-0000-0000-0000-00000000000a',v_s,'termination','   ','critical',CURRENT_DATE,'13650001-0000-0000-0000-000000000001');
  EXCEPTION WHEN check_violation THEN v_ok := TRUE; END;
  ASSERT v_ok, '1.6 فصلٌ بسببٍ من مسافات قُبِل';
  RAISE NOTICE '  ✅ 1.6 btrim(reason) <> '''' محروس';
END $$;

-- 1.7 — valid_until قبل incident_date
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_s UUID;
BEGIN
  SELECT salem INTO v_s FROM t_ids;
  BEGIN
    INSERT INTO disciplinary_actions (tenant_id,employee_id,type,reason,severity,incident_date,valid_until,issued_by)
    VALUES ('a3650000-0000-0000-0000-00000000000a',v_s,'written_warning','x','low',
            CURRENT_DATE, CURRENT_DATE - 400,'13650001-0000-0000-0000-000000000001');
  EXCEPTION WHEN check_violation THEN v_ok := TRUE; END;
  ASSERT v_ok, '1.7 صلاحيةٌ قبل الواقعة قُبِلت';
  RAISE NOTICE '  ✅ 1.7 valid_until >= incident_date';
END $$;

-- ═══════════════════════════════════════════════════════════════
--  ★★★ 1.8–1.11 — قيودٌ نجت من العكس لأن «لا بيانات تخالفها»
--
--  في أول تشغيلٍ لـ_invert_0365.py نجت أربعة أعكاسٍ DDL:
--     DDL10 (appeal_coherent) · DDL14 (expired_complete)
--     DDL15 (appeal_decided_complete) · DDL16 (appeal_decision)
--  والسبب واحد: **كلُّ مساراتي تمرّ عبر الدوال، والدوال تُرضي القيود
--  دائماً** ⇒ القيد يحرس بابًا لا يطرقه أحدٌ في الاختبار.
--
--  وهذه بالضبط حالة «شرطٌ لا تُوجَد بياناتٌ تخالفه = شرط غير مُختبَر».
--  القيود ليست زائدة — العطل ⑫ (PROBE_12) أُثبت بكتابةٍ **مباشرة** على
--  الجدول، وهي ما تحرسه. فالعلاج تأكيداتٌ بكتابةٍ مباشرة لا حذفُ القيد.
-- ═══════════════════════════════════════════════════════════════

-- 1.8 ★★★ — العطل ⑫ بكتابةٍ مباشرة: ردُّ تظلّمٍ بلا تظلّم
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_s UUID; v_msg TEXT;
BEGIN
  SELECT salem INTO v_s FROM t_ids;
  BEGIN
    INSERT INTO disciplinary_actions
      (tenant_id,employee_id,type,reason,severity,incident_date,issued_by,
       is_appealed,appeal_response)
    VALUES ('a3650000-0000-0000-0000-00000000000a',v_s,'suspension','ردٌّ بلا تظلّم','high',
            CURRENT_DATE,'13650001-0000-0000-0000-000000000001',FALSE,'رُفض التظلّم');
  EXCEPTION WHEN check_violation THEN v_ok := TRUE; v_msg := SQLERRM; END;
  ASSERT v_ok, '1.8 ردُّ تظلّمٍ بلا تظلّم قُبِل';
  ASSERT position('chk_disciplinary_appeal_coherent' IN v_msg) > 0,
         '1.8 مُنع بقيدٍ آخر: ' || v_msg;
  RAISE NOTICE '  ✅ 1.8 chk_disciplinary_appeal_coherent (كتابةٌ مباشرة)';
END $$;

-- 1.8b ★ — والصورة الأخرى: appealed_at بلا is_appealed
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_s UUID; v_msg TEXT;
BEGIN
  SELECT salem INTO v_s FROM t_ids;
  BEGIN
    INSERT INTO disciplinary_actions
      (tenant_id,employee_id,type,reason,severity,incident_date,issued_by,
       is_appealed,appealed_at)
    VALUES ('a3650000-0000-0000-0000-00000000000a',v_s,'suspension','لحظةٌ بلا تظلّم','high',
            CURRENT_DATE,'13650001-0000-0000-0000-000000000001',FALSE,now());
  EXCEPTION WHEN check_violation THEN v_ok := TRUE; v_msg := SQLERRM; END;
  ASSERT v_ok, '1.8b appealed_at بلا is_appealed قُبِل';
  ASSERT position('chk_disciplinary_appeal_coherent' IN v_msg) > 0, '1.8b ' || v_msg;
  RAISE NOTICE '  ✅ 1.8b appealed_at بلا تظلّمٍ مرفوض';
END $$;

-- 1.9 ★★★ — حالة expired بلا expired_at (كتابةٌ مباشرة)
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_s UUID; v_msg TEXT;
BEGIN
  SELECT salem INTO v_s FROM t_ids;
  BEGIN
    INSERT INTO disciplinary_actions
      (tenant_id,employee_id,type,reason,severity,incident_date,valid_until,issued_by,status)
    VALUES ('a3650000-0000-0000-0000-00000000000a',v_s,'written_warning','منتهٍ ملفَّق','low',
            CURRENT_DATE - 100, CURRENT_DATE - 10,
            '13650001-0000-0000-0000-000000000001','expired');
  EXCEPTION WHEN check_violation THEN v_ok := TRUE; v_msg := SQLERRM; END;
  ASSERT v_ok, '1.9 expired بلا expired_at قُبِل';
  ASSERT position('chk_disciplinary_expired_complete' IN v_msg) > 0, '1.9 ' || v_msg;
  RAISE NOTICE '  ✅ 1.9 chk_disciplinary_expired_complete';
END $$;

-- 1.9b ★ — expired_at موجودٌ والحالة ليست expired
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_s UUID; v_msg TEXT;
BEGIN
  SELECT salem INTO v_s FROM t_ids;
  BEGIN
    INSERT INTO disciplinary_actions
      (tenant_id,employee_id,type,reason,severity,incident_date,issued_by,status,expired_at)
    VALUES ('a3650000-0000-0000-0000-00000000000a',v_s,'written_warning','نشطٌ ومنتهٍ معاً','low',
            CURRENT_DATE,'13650001-0000-0000-0000-000000000001','active',now());
  EXCEPTION WHEN check_violation THEN v_ok := TRUE; v_msg := SQLERRM; END;
  ASSERT v_ok, '1.9b active مع expired_at قُبِل';
  ASSERT position('chk_disciplinary_expired_complete' IN v_msg) > 0, '1.9b ' || v_msg;
  RAISE NOTICE '  ✅ 1.9b نشطٌ ومنتهٍ معاً مرفوض';
END $$;

-- 1.10 ★★★ — قرار تظلّمٍ بلا مُقرِّرٍ ولا لحظة
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_s UUID; v_msg TEXT;
BEGIN
  SELECT salem INTO v_s FROM t_ids;
  BEGIN
    INSERT INTO disciplinary_actions
      (tenant_id,employee_id,type,reason,severity,incident_date,issued_by,
       is_appealed,appealed_at,appeal_decision)
    VALUES ('a3650000-0000-0000-0000-00000000000a',v_s,'suspension','قرارٌ يتيم','high',
            CURRENT_DATE,'13650001-0000-0000-0000-000000000001',TRUE,now(),'upheld');
  EXCEPTION WHEN check_violation THEN v_ok := TRUE; v_msg := SQLERRM; END;
  ASSERT v_ok, '1.10 قرارٌ بلا مُقرِّر قُبِل';
  ASSERT position('chk_disciplinary_appeal_decided_complete' IN v_msg) > 0, '1.10 ' || v_msg;
  RAISE NOTICE '  ✅ 1.10 chk_disciplinary_appeal_decided_complete';
END $$;

-- 1.11 ★★★ — قرار تظلّمٍ من خارج المفردات الثلاث
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_s UUID; v_msg TEXT;
BEGIN
  SELECT salem INTO v_s FROM t_ids;
  BEGIN
    INSERT INTO disciplinary_actions
      (tenant_id,employee_id,type,reason,severity,incident_date,issued_by,
       is_appealed,appealed_at,appeal_decision,appeal_decided_by,appeal_decided_at)
    VALUES ('a3650000-0000-0000-0000-00000000000a',v_s,'suspension','قرارٌ مخترع','high',
            CURRENT_DATE,'13650001-0000-0000-0000-000000000001',TRUE,now(),
            'annihilated','13650001-0000-0000-0000-000000000001',now());
  EXCEPTION WHEN check_violation THEN v_ok := TRUE; v_msg := SQLERRM; END;
  ASSERT v_ok, '1.11 قرارٌ من خارج المفردات قُبِل';
  ASSERT position('chk_disciplinary_appeal_decision' IN v_msg) > 0, '1.11 ' || v_msg;
  RAISE NOTICE '  ✅ 1.11 chk_disciplinary_appeal_decision';
END $$;

\echo '════════ ② المحفّز — المستقبل والعقاب الذاتيّ ════════'

-- 2.1 — واقعةٌ في المستقبل (CHECK لا يصلح: CURRENT_DATE غير IMMUTABLE)
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_s UUID; v_msg TEXT;
BEGIN
  SELECT salem INTO v_s FROM t_ids;
  BEGIN
    INSERT INTO disciplinary_actions (tenant_id,employee_id,type,reason,severity,incident_date,issued_by)
    VALUES ('a3650000-0000-0000-0000-00000000000a',v_s,'written_warning','x','low',
            (now() AT TIME ZONE 'Asia/Baghdad')::DATE + 730,'13650001-0000-0000-0000-000000000001');
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; v_msg := SQLERRM; END;
  ASSERT v_ok, '2.1 واقعةٌ بعد سنتين قُبِلت';
  ASSERT position('DISCIPLINARY_FUTURE_INCIDENT' IN v_msg) > 0,
         '2.1 مُنع بحارسٍ آخر لا بالحارس المقصود: ' || v_msg;
  RAISE NOTICE '  ✅ 2.1 DISCIPLINARY_FUTURE_INCIDENT (بالحارس المقصود لا بغيره)';
END $$;

-- 2.1b ★ اليوم نفسه مقبول — الحدُّ ليس صارماً بلا داعٍ
DO $$
DECLARE v_s UUID; v_id UUID;
BEGIN
  SELECT salem INTO v_s FROM t_ids;
  INSERT INTO disciplinary_actions (tenant_id,employee_id,type,reason,severity,incident_date,issued_by)
  VALUES ('a3650000-0000-0000-0000-00000000000a',v_s,'verbal_warning','واقعةُ اليوم','low',
          (now() AT TIME ZONE 'Asia/Baghdad')::DATE,'13650001-0000-0000-0000-000000000001')
  RETURNING id INTO v_id;
  ASSERT v_id IS NOT NULL, '2.1b واقعةُ اليوم رُفضت';
  DELETE FROM disciplinary_actions WHERE FALSE;  -- لا حذف؛ نتركها
  RAISE NOTICE '  ✅ 2.1b واقعةُ اليوم (بتوقيت بغداد) مقبولة';
END $$;

-- 2.2 ★★★ — العقاب الذاتيّ. المقارنة المباشرة لا تكشفه (عنوانان مختلفان)
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_s UUID; v_msg TEXT;
BEGIN
  SELECT salem INTO v_s FROM t_ids;
  -- إثباتٌ أن employee_id <> issued_by **لا يكفي**: القيمتان مختلفتان أصلاً
  ASSERT v_s <> '23650002-0000-0000-0000-000000000002',
    '2.2 employees.id ساوى profiles.id — الافتراض المنهجيّ سقط';
  BEGIN
    INSERT INTO disciplinary_actions (tenant_id,employee_id,type,reason,severity,incident_date,issued_by)
    VALUES ('a3650000-0000-0000-0000-00000000000a',v_s,'verbal_warning','أعاقب نفسي','low',
            CURRENT_DATE,'23650002-0000-0000-0000-000000000002');
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; v_msg := SQLERRM; END;
  ASSERT v_ok, '2.2 الموظف عاقب نفسه';
  ASSERT position('DISCIPLINARY_SELF_ISSUE' IN v_msg) > 0,
         '2.2 مُنع بحارسٍ آخر: ' || v_msg;
  RAISE NOTICE '  ✅ 2.2 DISCIPLINARY_SELF_ISSUE — المحفّز يترجم profiles.id ← employees.id';
END $$;

-- 2.3 — الحذف النهائيّ ممنوع
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_msg TEXT; v_s UUID; v_id UUID;
BEGIN
  SELECT salem INTO v_s FROM t_ids;
  INSERT INTO disciplinary_actions (tenant_id,employee_id,type,reason,severity,incident_date,issued_by)
  VALUES ('a3650000-0000-0000-0000-00000000000a',v_s,'termination','سيُمحى','critical',
          CURRENT_DATE,'13650001-0000-0000-0000-000000000001') RETURNING id INTO v_id;
  BEGIN DELETE FROM disciplinary_actions WHERE id = v_id;
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; v_msg := SQLERRM; END;
  ASSERT v_ok, '2.3 الحذف النهائيّ نجح';
  ASSERT position('DISCIPLINARY_DELETE_BLOCKED' IN v_msg) > 0, '2.3 مُنع بغير الحارس: ' || v_msg;
  RAISE NOTICE '  ✅ 2.3 DISCIPLINARY_DELETE_BLOCKED';
END $$;

\echo '════════ ③ الإصدار disciplinary_issue ════════'

-- 3.1 — HR تُصدر بنجاح
SET request.jwt.claim.sub = '13650001-0000-0000-0000-000000000001';
DO $$
DECLARE v_id UUID; v_s UUID; v_by UUID; v_st TEXT;
BEGIN
  SELECT salem INTO v_s FROM t_ids;
  v_id := disciplinary_issue(v_s,'written_warning','  تأخّرٌ متكرّر  ','medium','ثلاث مرّات',NULL,
                             (now() AT TIME ZONE 'Asia/Baghdad')::DATE + 90);
  SELECT issued_by, status INTO v_by, v_st FROM disciplinary_actions WHERE id = v_id;
  ASSERT v_by = '13650001-0000-0000-0000-000000000001', '3.1 المُصدِر خطأ';
  ASSERT v_st = 'active', '3.1 الحالة ليست active';
  ASSERT (SELECT reason FROM disciplinary_actions WHERE id=v_id) = 'تأخّرٌ متكرّر',
         '3.1 btrim لم يُطبَّق على السبب';
  RAISE NOTICE '  ✅ 3.1 الإصدار ينجح · issued_by = auth.uid() · btrim مُطبَّق';
END $$;

-- 3.2 — السبب الفارغ مرفوض في الدالة (قبل القيد)
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_s UUID; v_msg TEXT;
BEGIN
  SELECT salem INTO v_s FROM t_ids;
  BEGIN PERFORM disciplinary_issue(v_s,'verbal_warning','   ','low');
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; v_msg := SQLERRM; END;
  ASSERT v_ok, '3.2 سببٌ فارغ قُبِل';
  ASSERT position('DISCIPLINARY_REASON_REQUIRED' IN v_msg) > 0,
         '3.2 مُنع بالقيد لا بحارس الدالة: ' || v_msg;
  RAISE NOTICE '  ✅ 3.2 حارس الدالة يسبق القيد (رسالةٌ مفهومة للمستخدم)';
END $$;

-- 3.3 ★ — الموظف (غير staff) لا يُصدر
SET request.jwt.claim.sub = '23650002-0000-0000-0000-000000000002';
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_n UUID; v_msg TEXT;
BEGIN
  SELECT noor INTO v_n FROM t_ids;
  BEGIN PERFORM disciplinary_issue(v_n,'suspension','انتقام','high');
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; v_msg := SQLERRM; END;
  ASSERT v_ok, '3.3 موظفٌ عاديّ أصدر إجراءً تأديبياً';
  ASSERT position('DISCIPLINARY_NOT_STAFF' IN v_msg) > 0, '3.3 مُنع بغير حارس الدور: ' || v_msg;
  RAISE NOTICE '  ✅ 3.3 DISCIPLINARY_NOT_STAFF';
END $$;

\echo '════════ ④ ★★★ التظلّم — العطل ⑯ ════════'

-- 4.1 — سالم يتظلّم على إجرائه (وهو لا يملك UPDATE على الجدول أصلاً)
DO $$
DECLARE v_id UUID; v_s UUID; v_st TEXT; v_at TIMESTAMPTZ; v_r TEXT;
BEGIN
  SELECT salem INTO v_s FROM t_ids;
  SELECT id INTO v_id FROM disciplinary_actions
   WHERE employee_id = v_s AND reason = 'تأخّرٌ متكرّر';
  ASSERT v_id IS NOT NULL, '4.1 إجراء 3.1 غير موجود';
  PERFORM disciplinary_appeal(v_id, '  كنتُ في مهمّةٍ رسمية  ');
  SELECT status, appealed_at, appeal_reason INTO v_st, v_at, v_r
    FROM disciplinary_actions WHERE id = v_id;
  ASSERT v_st = 'appealed', '4.1 الحالة لم تصر appealed بل ' || v_st;
  ASSERT v_at IS NOT NULL, '4.1 appealed_at معدوم';
  ASSERT v_r = 'كنتُ في مهمّةٍ رسمية', '4.1 btrim لم يُطبَّق: [' || v_r || ']';
  ASSERT (SELECT is_appealed FROM disciplinary_actions WHERE id=v_id), '4.1 is_appealed لم يُرفع';
  RAISE NOTICE '  ✅ 4.1 الموظف تظلّم فعلاً — الحقّ صار قابلاً للممارسة';
END $$;

-- 4.2 — لا تظلّم مرّتين
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_id UUID; v_s UUID; v_msg TEXT;
BEGIN
  SELECT salem INTO v_s FROM t_ids;
  SELECT id INTO v_id FROM disciplinary_actions WHERE employee_id=v_s AND reason='تأخّرٌ متكرّر';
  BEGIN PERFORM disciplinary_appeal(v_id,'مرّةً أخرى');
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; v_msg := SQLERRM; END;
  ASSERT v_ok, '4.2 التظلّم تكرّر';
  ASSERT position('DISCIPLINARY_ALREADY_APPEALED' IN v_msg) > 0, '4.2 مُنع بغير الحارس: ' || v_msg;
  RAISE NOTICE '  ✅ 4.2 DISCIPLINARY_ALREADY_APPEALED';
END $$;

-- 4.3 ★★★ — نور لا تتظلّم على إجراء سالم (حارس صاحب الشأن)
SET request.jwt.claim.sub = '33650003-0000-0000-0000-000000000003';
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_id UUID; v_s UUID; v_msg TEXT;
BEGIN
  SELECT salem INTO v_s FROM t_ids;
  SELECT id INTO v_id FROM disciplinary_actions WHERE employee_id=v_s AND reason='تأخّرٌ متكرّر';
  BEGIN PERFORM disciplinary_appeal(v_id,'أتظلّم نيابةً عنه');
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; v_msg := SQLERRM; END;
  ASSERT v_ok, '4.3 زميلٌ تظلّم على إجراء غيره';
  ASSERT position('DISCIPLINARY_NOT_OWNER' IN v_msg) > 0, '4.3 مُنع بغير حارس الملكية: ' || v_msg;
  RAISE NOTICE '  ✅ 4.3 DISCIPLINARY_NOT_OWNER — لا تظلّم بالنيابة';
END $$;

-- 4.4 — سبب التظلّم مطلوب
SET request.jwt.claim.sub = '13650001-0000-0000-0000-000000000001';
DO $$
DECLARE v_id UUID; v_n UUID; v_ok BOOLEAN := FALSE; v_msg TEXT;
BEGIN
  SELECT noor INTO v_n FROM t_ids;
  v_id := disciplinary_issue(v_n,'verbal_warning','إهمال','low');
  PERFORM set_config('request.jwt.claim.sub','33650003-0000-0000-0000-000000000003',FALSE);
  BEGIN PERFORM disciplinary_appeal(v_id,'   ');
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; v_msg := SQLERRM; END;
  ASSERT v_ok, '4.4 تظلّمٌ بلا سبب قُبِل';
  ASSERT position('DISCIPLINARY_APPEAL_REASON_REQUIRED' IN v_msg) > 0, '4.4 ' || v_msg;
  RAISE NOTICE '  ✅ 4.4 DISCIPLINARY_APPEAL_REASON_REQUIRED';
END $$;

\echo '════════ ⑤ البتّ في التظلّم ════════'

-- 5.1 ★ — الموظف لا يبتّ في تظلّم نفسه
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_id UUID; v_s UUID; v_msg TEXT;
BEGIN
  PERFORM set_config('request.jwt.claim.sub','23650002-0000-0000-0000-000000000002',FALSE);
  SELECT salem INTO v_s FROM t_ids;
  SELECT id INTO v_id FROM disciplinary_actions WHERE employee_id=v_s AND reason='تأخّرٌ متكرّر';
  BEGIN PERFORM disciplinary_appeal_decide(v_id,'overturned','ألغيتُ عقوبتي');
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; v_msg := SQLERRM; END;
  ASSERT v_ok, '5.1 الموظف ألغى عقوبته بنفسه';
  ASSERT position('DISCIPLINARY_NOT_STAFF' IN v_msg) > 0, '5.1 ' || v_msg;
  RAISE NOTICE '  ✅ 5.1 الموظف لا يبتّ في تظلّمه';
END $$;

-- 5.2 ★★★ — التعليل إلزاميّ (درس العطل ⑲ في 0363: قرارٌ بلا سبب)
SET request.jwt.claim.sub = '13650001-0000-0000-0000-000000000001';
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_id UUID; v_s UUID; v_msg TEXT;
BEGIN
  SELECT salem INTO v_s FROM t_ids;
  SELECT id INTO v_id FROM disciplinary_actions WHERE employee_id=v_s AND reason='تأخّرٌ متكرّر';
  BEGIN PERFORM disciplinary_appeal_decide(v_id,'upheld','  ');
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; v_msg := SQLERRM; END;
  ASSERT v_ok, '5.2 قرارٌ بلا تعليل قُبِل';
  ASSERT position('DISCIPLINARY_RESPONSE_REQUIRED' IN v_msg) > 0, '5.2 ' || v_msg;
  RAISE NOTICE '  ✅ 5.2 DISCIPLINARY_RESPONSE_REQUIRED — لا قرار بلا سبب';
END $$;

-- 5.3 ★★★ — «مُخفَّف» يُنزل الخطورة فعلياً: medium ← low
DO $$
DECLARE v_id UUID; v_s UUID; v_sev TEXT; v_st TEXT; v_new TEXT;
BEGIN
  SELECT salem INTO v_s FROM t_ids;
  SELECT id INTO v_id FROM disciplinary_actions WHERE employee_id=v_s AND reason='تأخّرٌ متكرّر';
  -- الخطورة قبل البتّ = medium (من 3.1)
  ASSERT (SELECT severity FROM disciplinary_actions WHERE id=v_id) = 'medium',
         '5.3 الخطورة الابتدائية ليست medium';
  v_new := disciplinary_appeal_decide(v_id,'reduced','المهمّة الرسمية ثابتة جزئياً');
  SELECT severity, status INTO v_sev, v_st FROM disciplinary_actions WHERE id = v_id;
  -- medium ← low حسب سُلَّم الدالة: critical→high · high→medium · وإلّا low
  ASSERT v_sev = 'low', '5.3 الخطورة لم تنزل، هي ' || v_sev;
  ASSERT v_st = 'active', '5.3 الحالة بعد reduced يجب أن تعود active لا ' || v_st;
  ASSERT v_new = 'active', '5.3 القيمة المُعادة ' || v_new;
  ASSERT (SELECT appeal_decided_by FROM disciplinary_actions WHERE id=v_id)
         = '13650001-0000-0000-0000-000000000001', '5.3 المُقرِّر خطأ';
  RAISE NOTICE '  ✅ 5.3 reduced: medium ← low فعلياً · العودة إلى active';
END $$;

-- 5.4 — لا بتَّ مرّتين
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_id UUID; v_s UUID; v_msg TEXT;
BEGIN
  SELECT salem INTO v_s FROM t_ids;
  SELECT id INTO v_id FROM disciplinary_actions WHERE employee_id=v_s AND reason='تأخّرٌ متكرّر';
  BEGIN PERFORM disciplinary_appeal_decide(v_id,'upheld','مرّةً ثانية');
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; v_msg := SQLERRM; END;
  ASSERT v_ok, '5.4 البتّ تكرّر';
  -- الحالة عادت active ⇒ الحارس الذي يمسكها هو NO_PENDING_APPEAL
  ASSERT position('DISCIPLINARY_NO_PENDING_APPEAL' IN v_msg) > 0, '5.4 ' || v_msg;
  RAISE NOTICE '  ✅ 5.4 DISCIPLINARY_NO_PENDING_APPEAL';
END $$;

-- 5.5 ★ — «مُلغى» يُحوّل الحالة إلى overturned ويُرضي القيد
DO $$
DECLARE v_id UUID; v_f UUID; v_st TEXT;
BEGIN
  PERFORM set_config('request.jwt.claim.sub','13650001-0000-0000-0000-000000000001',FALSE);
  SELECT fadi INTO v_f FROM t_ids;
  v_id := disciplinary_issue(v_f,'suspension','غيابٌ مزعوم','high');
  PERFORM set_config('request.jwt.claim.sub','43650004-0000-0000-0000-000000000004',FALSE);
  PERFORM disciplinary_appeal(v_id,'كنتُ في إجازةٍ معتمدة');
  PERFORM set_config('request.jwt.claim.sub','13650001-0000-0000-0000-000000000001',FALSE);
  PERFORM disciplinary_appeal_decide(v_id,'overturned','الإجازة موثّقة — يُلغى الإجراء');
  SELECT status INTO v_st FROM disciplinary_actions WHERE id = v_id;
  ASSERT v_st = 'overturned', '5.5 الحالة ' || v_st;
  RAISE NOTICE '  ✅ 5.5 overturned + chk_disciplinary_overturned_needs_appeal راضٍ';
END $$;

-- 5.6 ★★★ — القيد يمنع overturned المُلفَّقة (بلا قرار تظلّم)
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_n UUID; v_id UUID; v_msg TEXT;
BEGIN
  SELECT noor INTO v_n FROM t_ids;
  v_id := disciplinary_issue(v_n,'demotion','خفضٌ للتجربة','high');
  BEGIN
    UPDATE disciplinary_actions SET status='overturned' WHERE id = v_id;
  EXCEPTION WHEN check_violation THEN v_ok := TRUE; v_msg := SQLERRM; END;
  ASSERT v_ok, '5.6 حالة overturned مُلفَّقة قُبِلت';
  ASSERT position('chk_disciplinary_overturned_needs_appeal' IN v_msg) > 0, '5.6 ' || v_msg;
  RAISE NOTICE '  ✅ 5.6 لا إلغاء بلا قرار تظلّمٍ بالإلغاء';
END $$;

\echo '════════ ⑥ الإقرار بالاطّلاع ════════'

-- 6.1 — صاحب الشأن يُقرّ، والمرّة الثانية FALSE بلا تغيير الطابع
DO $$
DECLARE v_id UUID; v_n UUID; v_a TIMESTAMPTZ; v_b TIMESTAMPTZ; v_r1 BOOLEAN; v_r2 BOOLEAN;
BEGIN
  SELECT noor INTO v_n FROM t_ids;
  SELECT id INTO v_id FROM disciplinary_actions WHERE employee_id=v_n AND reason='إهمال';
  PERFORM set_config('request.jwt.claim.sub','33650003-0000-0000-0000-000000000003',FALSE);
  v_r1 := disciplinary_acknowledge(v_id);
  SELECT acknowledged_at INTO v_a FROM disciplinary_actions WHERE id=v_id;
  v_r2 := disciplinary_acknowledge(v_id);
  SELECT acknowledged_at INTO v_b FROM disciplinary_actions WHERE id=v_id;
  ASSERT v_r1, '6.1 الإقرار الأول رجع FALSE';
  ASSERT NOT v_r2, '6.1 الإقرار الثاني رجع TRUE';
  ASSERT v_a = v_b, '6.1 الطابع الأول تغيّر';
  RAISE NOTICE '  ✅ 6.1 الإقرار مرّةً واحدة · الطابع الأول محفوظ';
END $$;

-- 6.2 — الزميل لا يُقرّ نيابةً
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_id UUID; v_n UUID; v_msg TEXT;
BEGIN
  SELECT noor INTO v_n FROM t_ids;
  SELECT id INTO v_id FROM disciplinary_actions WHERE employee_id=v_n AND reason='خفضٌ للتجربة';
  PERFORM set_config('request.jwt.claim.sub','23650002-0000-0000-0000-000000000002',FALSE);
  BEGIN PERFORM disciplinary_acknowledge(v_id);
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; v_msg := SQLERRM; END;
  ASSERT v_ok, '6.2 الزميل أقرّ نيابةً';
  ASSERT position('DISCIPLINARY_NOT_OWNER' IN v_msg) > 0, '6.2 ' || v_msg;
  RAISE NOTICE '  ✅ 6.2 الإقرار لصاحب الشأن وحده';
END $$;

\echo '════════ ⑦ الإلغاء الإداريّ — بديل الحذف ════════'

SET request.jwt.claim.sub = '13650001-0000-0000-0000-000000000001';

-- 7.1 — الإلغاء يستلزم سبباً
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_id UUID; v_n UUID; v_msg TEXT;
BEGIN
  SELECT noor INTO v_n FROM t_ids;
  SELECT id INTO v_id FROM disciplinary_actions WHERE employee_id=v_n AND reason='خفضٌ للتجربة';
  BEGIN PERFORM disciplinary_revoke(v_id,'  ');
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; v_msg := SQLERRM; END;
  ASSERT v_ok, '7.1 إلغاءٌ بلا سبب قُبِل';
  ASSERT position('DISCIPLINARY_REVOKE_REASON_REQUIRED' IN v_msg) > 0, '7.1 ' || v_msg;
  RAISE NOTICE '  ✅ 7.1 DISCIPLINARY_REVOKE_REASON_REQUIRED';
END $$;

-- 7.2 — الإلغاء ينجح ويملأ الحقول الثلاثة (القيد chk_disciplinary_revoked_complete)
DO $$
DECLARE v_id UUID; v_n UUID; v_st TEXT; v_at TIMESTAMPTZ; v_by UUID; v_r TEXT; v_ret BOOLEAN;
BEGIN
  SELECT noor INTO v_n FROM t_ids;
  SELECT id INTO v_id FROM disciplinary_actions WHERE employee_id=v_n AND reason='خفضٌ للتجربة';
  v_ret := disciplinary_revoke(v_id,'صدر بالخطأ على الموظف الخطأ');
  SELECT status, revoked_at, revoked_by, revocation_reason
    INTO v_st, v_at, v_by, v_r FROM disciplinary_actions WHERE id=v_id;
  ASSERT v_ret, '7.2 رجعت FALSE';
  ASSERT v_st = 'revoked', '7.2 الحالة ' || v_st;
  ASSERT v_at IS NOT NULL AND v_by = '13650001-0000-0000-0000-000000000001'
         AND v_r = 'صدر بالخطأ على الموظف الخطأ', '7.2 حقول الإلغاء ناقصة';
  -- والمرّة الثانية FALSE بلا استثناء
  ASSERT NOT disciplinary_revoke(v_id,'مجدداً'), '7.2 الإلغاء المكرّر رجع TRUE';
  RAISE NOTICE '  ✅ 7.2 الإلغاء كامل · مُعاد الإلغاء = FALSE';
END $$;

-- 7.3 ★★★ — القيد يمنع revoked المُلفَّقة (بلا سبب/فاعل/لحظة)
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_s UUID; v_id UUID; v_msg TEXT;
BEGIN
  SELECT salem INTO v_s FROM t_ids;
  v_id := disciplinary_issue(v_s,'verbal_warning','للاختبار السابع','low');
  BEGIN UPDATE disciplinary_actions SET status='revoked' WHERE id=v_id;
  EXCEPTION WHEN check_violation THEN v_ok := TRUE; v_msg := SQLERRM; END;
  ASSERT v_ok, '7.3 revoked مُلفَّقة قُبِلت';
  ASSERT position('chk_disciplinary_revoked_complete' IN v_msg) > 0, '7.3 ' || v_msg;
  RAISE NOTICE '  ✅ 7.3 لا إلغاء بلا سببٍ وفاعلٍ ولحظة';
END $$;

\echo '════════ ⑧ ★★★ الانتهاء التلقائيّ — العطل ⑭ ════════'

-- 8.1 — الحالة قبل النداء: نشطٌ وقد انقضى أجله
DO $$
DECLARE v_s UUID; v_id UUID; v_n INTEGER; v_st TEXT; v_exp TIMESTAMPTZ;
        v_today DATE := (now() AT TIME ZONE 'Asia/Baghdad')::DATE;
BEGIN
  SELECT salem INTO v_s FROM t_ids;
  -- إنذارٌ وقع قبل ٥٠٠ يوم وانتهى أجله قبل ٢٠٠ يوم
  INSERT INTO disciplinary_actions (tenant_id,employee_id,type,reason,severity,
                                    incident_date,valid_until,issued_by,status)
  VALUES ('a3650000-0000-0000-0000-00000000000a',v_s,'written_warning','منتهي الأجل','medium',
          v_today - 500, v_today - 200,'13650001-0000-0000-0000-000000000001','active')
  RETURNING id INTO v_id;

  SELECT count(*) INTO v_n FROM disciplinary_actions
   WHERE tenant_id='a3650000-0000-0000-0000-00000000000a'
     AND status='active' AND valid_until IS NOT NULL AND valid_until < v_today;
  ASSERT v_n = 1, '8.1 المتوقّع صفٌّ واحدٌ منتهي الأجل، وُجد ' || v_n;

  v_n := disciplinary_expire_due();
  ASSERT v_n = 1, '8.1 expire_due حدّثت ' || v_n || ' بدل 1';

  SELECT status, expired_at INTO v_st, v_exp FROM disciplinary_actions WHERE id=v_id;
  ASSERT v_st = 'expired', '8.1 الحالة ' || v_st;
  ASSERT v_exp IS NOT NULL, '8.1 expired_at معدوم';
  RAISE NOTICE '  ✅ 8.1 expire_due: 1 صفّ ← expired · expired_at مملوء';
END $$;

-- 8.2 ★ — النداء الثاني لا يُحدّث شيئاً (idempotent)
DO $$
DECLARE v_n INTEGER;
BEGIN
  v_n := disciplinary_expire_due();
  ASSERT v_n = 0, '8.2 النداء الثاني حدّث ' || v_n || ' — ليست idempotent';
  RAISE NOTICE '  ✅ 8.2 النداء الثاني = 0';
END $$;

-- 8.3 ★★★ — أجلٌ **اليوم** لا ينتهي (الحدّ `< v_today` صارمٌ عمداً)
DO $$
DECLARE v_s UUID; v_id UUID; v_n INTEGER;
        v_today DATE := (now() AT TIME ZONE 'Asia/Baghdad')::DATE;
BEGIN
  SELECT salem INTO v_s FROM t_ids;
  INSERT INTO disciplinary_actions (tenant_id,employee_id,type,reason,severity,
                                    incident_date,valid_until,issued_by,status)
  VALUES ('a3650000-0000-0000-0000-00000000000a',v_s,'verbal_warning','ينتهي اليوم','low',
          v_today - 10, v_today,'13650001-0000-0000-0000-000000000001','active')
  RETURNING id INTO v_id;
  v_n := disciplinary_expire_due();
  ASSERT v_n = 0, '8.3 أجلُ اليوم انتهى قبل أوانه (' || v_n || ')';
  ASSERT (SELECT status FROM disciplinary_actions WHERE id=v_id) = 'active', '8.3 الحالة تغيّرت';
  RAISE NOTICE '  ✅ 8.3 أجلُ اليوم يظلّ نافذاً حتى نهايته';
END $$;

-- 8.4 ★★★ — عزل المستأجر: إجراءُ باء المنتهي لا تمسّه دالة ألف
DO $$
DECLARE v_b UUID; v_id UUID; v_n INTEGER;
        v_today DATE := (now() AT TIME ZONE 'Asia/Baghdad')::DATE;
BEGIN
  SELECT badr INTO v_b FROM t_ids;
  INSERT INTO disciplinary_actions (tenant_id,employee_id,type,reason,severity,
                                    incident_date,valid_until,issued_by,status)
  VALUES ('b3650000-0000-0000-0000-00000000000b',v_b,'written_warning','منتهي في باء','medium',
          v_today - 300, v_today - 100,'53650005-0000-0000-0000-000000000005','active')
  RETURNING id INTO v_id;
  -- ما زال السياق هدى (مستأجر ألف)
  v_n := disciplinary_expire_due();
  ASSERT v_n = 0, '8.4 دالةُ ألف مسّت ' || v_n || ' صفّاً في باء';
  ASSERT (SELECT status FROM disciplinary_actions WHERE id=v_id) = 'active',
         '8.4 صفُّ باء تغيّر بسياق ألف';
  -- وبسياق ليلى (باء) ينتهي
  PERFORM set_config('request.jwt.claim.sub','53650005-0000-0000-0000-000000000005',FALSE);
  v_n := disciplinary_expire_due();
  ASSERT v_n = 1, '8.4 دالةُ باء حدّثت ' || v_n || ' بدل 1';
  RAISE NOTICE '  ✅ 8.4 ترشيح المستأجر مُختبَرٌ بصفٍّ أجنبيٍّ حقيقيّ';
  PERFORM set_config('request.jwt.claim.sub','13650001-0000-0000-0000-000000000001',FALSE);
END $$;

\echo '════════ ⑨ اللوح disciplinary_board ════════'

-- 9.1 ★★★ — ترتيبٌ حتميّ بـ incident_date DESC
--
-- ★ تصحيحٌ لعدٍّ خاطئٍ منّي: كتبتُ أوّلاً `= 9` عادّاً صفوف ألف وحدها،
--   فسقط التأكيد بـ«اللوح أعاد 10 بدل 9». والصواب أن اللوح
--   `SECURITY INVOKER` يعمل هنا بدور **postgres وهو BYPASSRLS**
--   ⇒ يرى صفَّ باء أيضاً. عزلُ المستأجر يُثبته سكربت الـRLS لا هذا الملف.
--
-- صفوف ألف (بترتيب الإدراج):
--   ① تأخّرٌ متكرّر        (اليوم)      salem   active(بعد reduced)
--   ② واقعةُ اليوم        (اليوم)      salem   active
--   ③ سيُمحى              (اليوم)      salem   active
--   ④ إهمال               (اليوم)      noor    active
--   ⑤ غيابٌ مزعوم         (اليوم)      fadi    overturned
--   ⑥ خفضٌ للتجربة        (اليوم)      noor    revoked
--   ⑦ للاختبار السابع     (اليوم)      salem   active
--   ⑧ منتهي الأجل         (اليوم-500)  salem   expired
--   ⑨ ينتهي اليوم         (اليوم-10)   salem   active
-- وصفُّ باء:
--   ⑩ منتهي في باء        (اليوم-300)  badr    expired
-- ⇒ الإجمالي **عشرة**. والترتيب DESC يضع الأقدم (اليوم-500) في الذيل،
--   ويسبقه مباشرةً صفُّ باء (اليوم-300) ثم «ينتهي اليوم» (اليوم-10).
DO $$
DECLARE v_n INTEGER; v_last TEXT; v_before TEXT;
BEGIN
  SELECT count(*) INTO v_n FROM disciplinary_board();
  ASSERT v_n = 10, '9.1 اللوح أعاد ' || v_n || ' بدل 10';
  SELECT reason INTO v_last   FROM disciplinary_board() OFFSET 9 LIMIT 1;
  SELECT reason INTO v_before FROM disciplinary_board() OFFSET 8 LIMIT 1;
  ASSERT v_last = 'منتهي الأجل',
         '9.1 آخر صفّ [' || v_last || '] — الترتيب ليس incident_date DESC';
  -- ★ تأكيدٌ لا يمرّ صدفةً: الصفّ قبل الأخير يجب أن يكون (اليوم-300) لا (اليوم-10)
  ASSERT v_before = 'منتهي في باء',
         '9.1 قبل الأخير [' || v_before || '] — الترتيب لم يُفرّق بين -300 و-10';
  RAISE NOTICE '  ✅ 9.1 اللوح 10 صفوف · الترتيب -10 ← -300 ← -500 في الذيل';
END $$;

-- 9.2 ★★★ — الاسم مُركَّبٌ من first_name/last_name لأن full_name_ar فارغٌ بنيوياً
DO $$
DECLARE v_name TEXT; v_raw TEXT;
BEGIN
  SELECT employee_name INTO v_name FROM disciplinary_board() WHERE reason='إهمال';
  SELECT COALESCE(full_name_ar,'<NULL>') INTO v_raw
    FROM employees WHERE id = (SELECT noor FROM t_ids);
  ASSERT v_raw = '<NULL>', '9.2 full_name_ar لم يعد فارغاً — راجع الافتراض: ' || v_raw;
  ASSERT v_name <> 'موظف غير معروف' AND btrim(v_name) <> '',
         '9.2 الاسم المُركَّب فشل: [' || v_name || ']';
  ASSERT v_name LIKE '%نور%', '9.2 الاسم لا يحوي «نور»: ' || v_name;
  RAISE NOTICE '  ✅ 9.2 employee_name = «%» (مُركَّبٌ رغم full_name_ar = NULL)', v_name;
END $$;

-- 9.3 — اسم المُصدِر من profiles (وهو العنوان الصحيح — PROBE_17)
DO $$
DECLARE v_iss TEXT;
BEGIN
  SELECT issuer_name INTO v_iss FROM disciplinary_board() WHERE reason='إهمال';
  ASSERT v_iss = 'هدى الموارد', '9.3 المُصدِر [' || v_iss || ']';
  RAISE NOTICE '  ✅ 9.3 issuer_name من profiles';
END $$;

-- 9.4 ★ — days_remaining بحساب بغداد. «ينتهي اليوم» ⇒ 0
DO $$
DECLARE v_d INTEGER; v_soon BOOLEAN;
BEGIN
  SELECT days_remaining, is_expiring_soon INTO v_d, v_soon
    FROM disciplinary_board() WHERE reason='ينتهي اليوم';
  ASSERT v_d = 0, '9.4 days_remaining = ' || v_d || ' بدل 0';
  ASSERT v_soon, '9.4 «ينتهي اليوم» ليس ضمن الثلاثين يوماً';
  RAISE NOTICE '  ✅ 9.4 days_remaining = 0 · is_expiring_soon = true';
END $$;

-- 9.5 ★ — بلا أجل ⇒ days_remaining معدوم و is_expiring_soon = false
DO $$
DECLARE v_d INTEGER; v_soon BOOLEAN;
BEGIN
  SELECT days_remaining, is_expiring_soon INTO v_d, v_soon
    FROM disciplinary_board() WHERE reason='إهمال';
  ASSERT v_d IS NULL, '9.5 days_remaining ليس NULL بل ' || v_d;
  ASSERT NOT v_soon, '9.5 بلا أجلٍ عُدَّ قريب الانتهاء';
  RAISE NOTICE '  ✅ 9.5 بلا أجل ⇒ NULL / false';
END $$;

-- 9.6 ★★★ — can_appeal: بسياق سالم، إجراءٌ نافذٌ له لم يُتظلَّم عليه = TRUE
-- «للاختبار السابع» (سالم · active · is_appealed=false) ⇒ TRUE
-- «تأخّرٌ متكرّر» (سالم · active · is_appealed=**true**)  ⇒ FALSE
-- «إهمال» (نور)                                            ⇒ FALSE
DO $$
DECLARE v_a BOOLEAN; v_b BOOLEAN; v_c BOOLEAN;
BEGIN
  PERFORM set_config('request.jwt.claim.sub','23650002-0000-0000-0000-000000000002',FALSE);
  SELECT can_appeal INTO v_a FROM disciplinary_board() WHERE reason='للاختبار السابع';
  SELECT can_appeal INTO v_b FROM disciplinary_board() WHERE reason='تأخّرٌ متكرّر';
  SELECT can_appeal INTO v_c FROM disciplinary_board() WHERE reason='إهمال';
  ASSERT v_a, '9.6a سالم لا يستطيع التظلّم على إجرائه النافذ';
  ASSERT NOT v_b, '9.6b التظلّم متاحٌ مرّتين';
  ASSERT NOT v_c, '9.6c سالم يستطيع التظلّم على إجراء نور';
  RAISE NOTICE '  ✅ 9.6 can_appeal: نافذٌ له=true · مُتظلَّمٌ عليه=false · لغيره=false';
  PERFORM set_config('request.jwt.claim.sub','13650001-0000-0000-0000-000000000001',FALSE);
END $$;

-- 9.7 — الترشيح بالحالة والنوع والبحث
DO $$
DECLARE v_n INTEGER;
BEGIN
  -- active من الجدول أعلاه: ①②③④⑦⑨ = ستة
  SELECT count(*) INTO v_n FROM disciplinary_board(NULL,'active');
  ASSERT v_n = 6, '9.7a active = ' || v_n || ' بدل 6';
  -- verbal_warning: ②«واقعةُ اليوم» ④«إهمال» ⑦«للاختبار السابع» ⑨«ينتهي اليوم» = أربعة
  SELECT count(*) INTO v_n FROM disciplinary_board(NULL,NULL,'verbal_warning');
  ASSERT v_n = 4, '9.7b verbal = ' || v_n || ' بدل 4';
  -- بحثٌ بالسبب. ★ «منتهي» يطابق «منتهي الأجل» **و**«منتهي في باء» = اثنان
  --   (بدور postgres لا ترشيح RLS — انظر تصحيح 9.1)
  SELECT count(*) INTO v_n FROM disciplinary_board('منتهي');
  ASSERT v_n = 2, '9.7c بحث «منتهي» = ' || v_n || ' بدل 2';
  -- وبحثٌ يُميّز صفَّ ألف وحده
  SELECT count(*) INTO v_n FROM disciplinary_board('الأجل');
  ASSERT v_n = 1, '9.7c2 بحث «الأجل» = ' || v_n || ' بدل 1';
  -- ★ بحثٌ باسم الموظف المُركَّب (لا full_name_ar)
  SELECT count(*) INTO v_n FROM disciplinary_board('نور');
  ASSERT v_n = 2, '9.7d بحث «نور» = ' || v_n || ' بدل 2';
  RAISE NOTICE '  ✅ 9.7 الترشيح: حالة=6 · نوع=4 · سبب=2/1 · اسمٌ مُركَّب=2';
END $$;

-- 9.8 ★★★ — اللوح SECURITY INVOKER: صفوف باء لا تظهر لهدى بسبب RLS
--   ★ بدور postgres (BYPASSRLS) لا نستطيع إثبات هذا هنا — الإثبات في
--     سكربت الـRLS. لكن نُثبت أن **صفَّ باء موجودٌ فعلاً** حتى لا يكون
--     التأكيد هناك فراغاً.
DO $$
DECLARE v_n INTEGER;
BEGIN
  SELECT count(*) INTO v_n FROM disciplinary_actions
   WHERE tenant_id='b3650000-0000-0000-0000-00000000000b';
  ASSERT v_n = 1, '9.8 صفوف باء = ' || v_n || ' — عيّنةُ RLS ستكون فارغة';
  RAISE NOTICE '  ✅ 9.8 صفُّ باء موجود (%) — عزلُه يُثبته سكربت RLS', v_n;
END $$;

\echo '════════ ⑩ الملخّص disciplinary_summary ════════'

-- 10.1 — الأرقام محسوبةٌ يدوياً من جدول ⑨ (سياق هدى ⇒ postgres يرى الكلّ)
--   ★ بدور postgres لا ترشيح RLS ⇒ الملخّص يشمل صفَّ باء أيضاً = 10 صفوف.
--   total=10 · active=6 · appealed=0 · overturned=1 · expired=2 · revoked=1
--   (expired: «منتهي الأجل» في ألف + «منتهي في باء»)
DO $$
DECLARE r RECORD;
BEGIN
  SELECT * INTO r FROM disciplinary_summary();
  ASSERT r.total = 10, '10.1 total=' || r.total || ' بدل 10';
  ASSERT r.active = 6, '10.1 active=' || r.active || ' بدل 6';
  ASSERT r.appealed = 0, '10.1 appealed=' || r.appealed;
  ASSERT r.overturned = 1, '10.1 overturned=' || r.overturned;
  ASSERT r.expired = 2, '10.1 expired=' || r.expired || ' بدل 2';
  ASSERT r.revoked = 1, '10.1 revoked=' || r.revoked;
  ASSERT r.total = r.active + r.appealed + r.overturned + r.expired + r.revoked,
         '10.1 المجاميع لا تُطابق الإجمالي';
  RAISE NOTICE '  ✅ 10.1 total=10 = 6+0+1+2+1';
END $$;

-- 10.2 ★ — overdue_expiry = 0 بعد النداءَين (كلاهما انتهى)
DO $$
DECLARE r RECORD;
BEGIN
  SELECT * INTO r FROM disciplinary_summary();
  ASSERT r.overdue_expiry = 0, '10.2 overdue=' || r.overdue_expiry || ' — expire_due لم تُنظّف';
  -- ونُدخل واحداً متأخّراً فيصير 1 — إثباتُ أن العدّاد ليس صفراً بنيوياً
  INSERT INTO disciplinary_actions (tenant_id,employee_id,type,reason,severity,
                                    incident_date,valid_until,issued_by,status)
  VALUES ('a3650000-0000-0000-0000-00000000000a',(SELECT fadi FROM t_ids),
          'written_warning','متأخّرٌ للعدّاد','low',
          (now() AT TIME ZONE 'Asia/Baghdad')::DATE - 60,
          (now() AT TIME ZONE 'Asia/Baghdad')::DATE - 5,
          '13650001-0000-0000-0000-000000000001','active');
  SELECT * INTO r FROM disciplinary_summary();
  ASSERT r.overdue_expiry = 1, '10.2 العدّاد لم يرتفع: ' || r.overdue_expiry;
  RAISE NOTICE '  ✅ 10.2 overdue_expiry: 0 ← 1 (العدّاد حيٌّ لا صفرٌ بنيويّ)';
END $$;

-- 10.3 ★ — unacknowledged: النشطة بلا إقرار.
--   النشطة الآن سبعة (الستّة + «متأخّرٌ للعدّاد»)، وأُقرَّ منها **صفر**
--   لأن الإقرار الوحيد (6.1) كان على «إهمال»… وهي نشطة ⇒ 7-1 = 6
DO $$
DECLARE r RECORD; v_ack INTEGER;
BEGIN
  SELECT count(*) INTO v_ack FROM disciplinary_actions
   WHERE status='active' AND acknowledged_at IS NOT NULL;
  ASSERT v_ack = 1, '10.3 المُقَرّ بها النشطة = ' || v_ack || ' بدل 1';
  SELECT * INTO r FROM disciplinary_summary();
  ASSERT r.unacknowledged = 6, '10.3 unacknowledged=' || r.unacknowledged || ' بدل 6';
  RAISE NOTICE '  ✅ 10.3 unacknowledged = 6 (7 نشطة − 1 مُقَرَّة)';
END $$;

-- 10.4 ★ — severe = suspension+demotion+termination
--   «غيابٌ مزعوم» suspension · «خفضٌ للتجربة» demotion · «سيُمحى» termination = 3
DO $$
DECLARE r RECORD;
BEGIN
  SELECT * INTO r FROM disciplinary_summary();
  ASSERT r.severe = 3, '10.4 severe=' || r.severe || ' بدل 3';
  RAISE NOTICE '  ✅ 10.4 severe = 3';
END $$;

\echo '════════ ⑪ REVOKE عن anon ════════'
DO $$
DECLARE v_n INTEGER;
BEGIN
  SELECT count(*) INTO v_n FROM pg_proc p
   WHERE p.pronamespace='public'::regnamespace
     AND p.proname LIKE 'disciplinary!_%' ESCAPE '!'
     AND has_function_privilege('anon', p.oid, 'EXECUTE');
  ASSERT v_n = 0, '⑪ anon يملك EXECUTE على ' || v_n || ' دالة';
  SELECT count(*) INTO v_n FROM pg_proc p
   WHERE p.pronamespace='public'::regnamespace
     AND p.proname LIKE 'disciplinary!_%' ESCAPE '!';
  -- ★ تصحيحُ عدٍّ منّي: كتبتُ 7 سهواً. الدوال **ثمانٍ**:
  --   acknowledge · appeal · appeal_decide · board
  --   expire_due · issue · revoke · summary
  ASSERT v_n = 8, '⑪ عدد دوال disciplinary_* = ' || v_n || ' بدل 8';
  RAISE NOTICE '  ✅ ⑪ ثماني دوال · anon محجوبٌ عن كلّها';
END $$;

\echo ''
\echo '════════════════════════════════════════'
\echo '  ✅ verify-disciplinary-0365.sql — كل التأكيدات نجحت'
\echo '════════════════════════════════════════'

ROLLBACK;
