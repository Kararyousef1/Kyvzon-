-- ════════════════════════════════════════════════════════════════════════
--  verify-hr-service-center-0367.sql — التحقق السلوكيّ من المايجريشن 0367
--
--  ★ يعمل بدور postgres (BYPASSRLS): يُثبت منطق الدوال والقيود والمحفّزات.
--    الجدار نفسه يُثبته verify-hr-service-center-0367-rls.sh.
--
--  psql -h /home/user/.pgtest/sock -p 5503 -U postgres -f tools/dev/verify-hr-service-center-0367.sql
-- ════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on
\pset pager off
\t on

BEGIN;

-- ══════════════════════ العيّنة ══════════════════════
INSERT INTO tenants (id, name, name_ar, slug) VALUES
  ('a3670000-0000-0000-0000-00000000000a','A','شركة ألف','a367-svc'),
  ('b3670000-0000-0000-0000-00000000000b','B','شركة باء','b367-svc');
INSERT INTO auth.users (id, email) VALUES
  ('13670001-0000-0000-0000-000000000001','huda@a367'),
  ('23670002-0000-0000-0000-000000000002','salem@a367'),
  ('33670003-0000-0000-0000-000000000003','noor@a367'),
  ('43670004-0000-0000-0000-000000000004','laila@b367'),
  ('53670005-0000-0000-0000-000000000005','badr@b367');
INSERT INTO profiles (id, tenant_id, full_name, role, department) VALUES
  ('13670001-0000-0000-0000-000000000001','a3670000-0000-0000-0000-00000000000a','هدى الموارد','hr','الموارد'),
  ('23670002-0000-0000-0000-000000000002','a3670000-0000-0000-0000-00000000000a','سالم الأول','employee','الإنتاج'),
  ('33670003-0000-0000-0000-000000000003','a3670000-0000-0000-0000-00000000000a','نور الثانية','employee','الإنتاج'),
  ('43670004-0000-0000-0000-000000000004','b3670000-0000-0000-0000-00000000000b','ليلى الموارد','hr','الموارد'),
  ('53670005-0000-0000-0000-000000000005','b3670000-0000-0000-0000-00000000000b','بدر الباء','employee','الإنتاج');

-- ★★★ حارسُ عزلٍ كشفه انحدارٌ حقيقيّ: `verify-attendance-vocabulary-0344-rls.sh`
--   كان يترك أربعة صفوفٍ في `hr_cases` (تنظيفه اصطدم بمحفّز المنع الجديد
--   و`|| true` ابتلع الخطأ). فسقط التأكيد 6.1 بـ«اللوح أعاد 9 بدل 5».
--   العلاج مزدوج: أُصلح تنظيفُ ذلك السكربت، **وهذا الملف صار يُرشّح
--   بمستأجره صراحةً** فلا يعتمد نظافة الجدول أصلاً.
DO $$
DECLARE v_n INTEGER;
BEGIN
  SELECT count(*) INTO v_n FROM hr_cases
   WHERE tenant_id IN ('a3670000-0000-0000-0000-00000000000a',
                       'b3670000-0000-0000-0000-00000000000b');
  ASSERT v_n = 0, 'التهيئة: مستأجرا الاختبار ملوَّثان بـ' || v_n || ' صفّاً';
END $$;

-- ★ دالتان مساعدتان: العدُّ مُرشَّحٌ بمستأجر الاختبار دائماً، فلا
--   يتأثّر أيُّ تأكيدٍ بصفوفٍ تركها ملفٌّ آخر (درسُ الانحدار أعلاه).
CREATE OR REPLACE FUNCTION pg_temp.board_mine(
  p_search TEXT DEFAULT NULL, p_status TEXT DEFAULT NULL, p_priority TEXT DEFAULT NULL)
RETURNS TABLE (id UUID, subject TEXT, employee_name TEXT, issuer TEXT,
               is_overdue BOOLEAN, hours_to_sla NUMERIC, can BOOLEAN)
LANGUAGE sql STABLE AS $fn$
  -- ★★★ JOIN يُبدّد ترتيب الدالة ⇒ نُثبّته برقمٍ تسلسليّ مأخوذٍ من
  --   ناتج اللوح نفسه. (سقط التأكيد 6.10 «المُغلق تصدّر» حين أغفلتُه.)
  SELECT b.id, b.subject, b.employee_name, b.assignee_name, b.is_overdue,
         b.hours_to_sla, TRUE
    FROM (SELECT x.*, row_number() OVER () AS rn
            FROM public.hr_case_board(p_search, p_status, p_priority, 200) x) b
    JOIN public.hr_cases c ON c.id = b.id
   WHERE c.tenant_id = 'a3670000-0000-0000-0000-00000000000a'
   ORDER BY b.rn;
$fn$;

CREATE TEMP TABLE t_ids AS
SELECT
  (SELECT id FROM employees WHERE user_id='23670002-0000-0000-0000-000000000002') AS salem,
  (SELECT id FROM employees WHERE user_id='33670003-0000-0000-0000-000000000003') AS noor,
  (SELECT id FROM employees WHERE user_id='53670005-0000-0000-0000-000000000005') AS badr;

\echo '════════ ① القيود والمفاتيح — hr_cases ════════'

-- 1.1 — FK مركَّب: موظفٌ معدوم
DO $$
DECLARE v_ok BOOLEAN := FALSE;
BEGIN
  BEGIN
    INSERT INTO hr_cases (tenant_id, employee_id, case_type, subject, description)
    VALUES ('a3670000-0000-0000-0000-00000000000a','ffffffff-ffff-ffff-ffff-ffffffffffff',
            'payroll','معدوم','x');
  EXCEPTION WHEN foreign_key_violation THEN v_ok := TRUE; END;
  ASSERT v_ok, '1.1 موظفٌ معدوم قُبِل';
  RAISE NOTICE '  ✅ 1.1 موظفٌ معدوم مرفوض (FK مركَّب)';
END $$;

-- 1.2 ★★★ — العبور بين المستأجرين
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_b UUID;
BEGIN
  SELECT badr INTO v_b FROM t_ids;
  ASSERT v_b IS NOT NULL, '1.2 بدر غير موجود — العيّنة ناقصة';
  BEGIN
    INSERT INTO hr_cases (tenant_id, employee_id, case_type, subject, description)
    VALUES ('a3670000-0000-0000-0000-00000000000a', v_b,'payroll','عبور','x');
  EXCEPTION WHEN foreign_key_violation THEN v_ok := TRUE; END;
  ASSERT v_ok, '1.2 موظفُ مستأجرٍ آخر قُبِل';
  RAISE NOTICE '  ✅ 1.2 موظفُ مستأجرٍ آخر مرفوض (FK **مركَّب** لا مفرد)';
END $$;

-- 1.3 — assigned_to بلا وجود
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_s UUID;
BEGIN
  SELECT salem INTO v_s FROM t_ids;
  BEGIN
    INSERT INTO hr_cases (tenant_id, employee_id, case_type, subject, description, assigned_to)
    VALUES ('a3670000-0000-0000-0000-00000000000a', v_s,'payroll','مسنَد','x',
            'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');
  EXCEPTION WHEN foreign_key_violation THEN v_ok := TRUE; END;
  ASSERT v_ok, '1.3 مُسنَدٌ إلى معدوم قُبِل';
  RAISE NOTICE '  ✅ 1.3 assigned_to محروس (→ profiles)';
END $$;

-- 1.4 ★★★ — مسافاتٌ في الموضوع والوصف
DO $$
DECLARE v_a BOOLEAN := FALSE; v_b BOOLEAN := FALSE; v_s UUID;
BEGIN
  SELECT salem INTO v_s FROM t_ids;
  BEGIN INSERT INTO hr_cases (tenant_id, employee_id, case_type, subject, description)
        VALUES ('a3670000-0000-0000-0000-00000000000a', v_s,'payroll','   ','وصف');
  EXCEPTION WHEN check_violation THEN v_a := TRUE; END;
  BEGIN INSERT INTO hr_cases (tenant_id, employee_id, case_type, subject, description)
        VALUES ('a3670000-0000-0000-0000-00000000000a', v_s,'payroll','موضوع','   ');
  EXCEPTION WHEN check_violation THEN v_b := TRUE; END;
  ASSERT v_a, '1.4a موضوعٌ من مسافات قُبِل';
  ASSERT v_b, '1.4b وصفٌ من مسافات قُبِل';
  RAISE NOTICE '  ✅ 1.4 btrim محروسٌ في الحقلين معاً';
END $$;

-- 1.5 ★★★ — «تم الحل» بلا ملخّص (كتابةٌ مباشرة)
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_s UUID; v_msg TEXT;
BEGIN
  SELECT salem INTO v_s FROM t_ids;
  BEGIN
    INSERT INTO hr_cases (tenant_id, employee_id, case_type, subject, description,
                          status, resolved_at)
    VALUES ('a3670000-0000-0000-0000-00000000000a', v_s,'payroll','حُلَّ بلا حلّ','x',
            'resolved', now());
  EXCEPTION WHEN check_violation THEN v_ok := TRUE; v_msg := SQLERRM; END;
  ASSERT v_ok, '1.5 «تم الحل» بلا ملخّص قُبِل';
  ASSERT position('chk_hr_cases_resolved_complete' IN v_msg) > 0, '1.5 ' || v_msg;
  RAISE NOTICE '  ✅ 1.5 chk_hr_cases_resolved_complete';
END $$;

-- 1.5b ★ — والصورة الأخرى: ملخّصٌ بلا لحظة
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_s UUID;
BEGIN
  SELECT salem INTO v_s FROM t_ids;
  BEGIN
    INSERT INTO hr_cases (tenant_id, employee_id, case_type, subject, description,
                          status, resolution_summary)
    VALUES ('a3670000-0000-0000-0000-00000000000a', v_s,'payroll','بلا لحظة','x',
            'closed','ملخّصٌ موجود');
  EXCEPTION WHEN check_violation THEN v_ok := TRUE; END;
  ASSERT v_ok, '1.5b «مغلق» بلا resolved_at قُبِل';
  RAISE NOTICE '  ✅ 1.5b الإغلاق يستلزم اللحظة أيضاً';
END $$;

\echo '════════ ② القيود والمفاتيح — employee_letter_requests ════════'

-- 2.1 ★★★ — «تم التسليم» بلا ملفّ
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_s UUID; v_msg TEXT;
BEGIN
  SELECT salem INTO v_s FROM t_ids;
  BEGIN
    INSERT INTO employee_letter_requests (tenant_id, employee_id, letter_type,
                                          status, delivered_at)
    VALUES ('a3670000-0000-0000-0000-00000000000a', v_s,'salary_certificate',
            'delivered', now());
  EXCEPTION WHEN check_violation THEN v_ok := TRUE; v_msg := SQLERRM; END;
  ASSERT v_ok, '2.1 خطابٌ مُسلَّمٌ بلا ملفّ قُبِل';
  ASSERT position('chk_letter_ready_needs_document' IN v_msg) > 0, '2.1 ' || v_msg;
  RAISE NOTICE '  ✅ 2.1 chk_letter_ready_needs_document';
END $$;

-- 2.2 ★★★ — «مرفوض» بلا سبب
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_s UUID; v_msg TEXT;
BEGIN
  SELECT salem INTO v_s FROM t_ids;
  BEGIN
    INSERT INTO employee_letter_requests (tenant_id, employee_id, letter_type, status)
    VALUES ('a3670000-0000-0000-0000-00000000000a', v_s,'other','rejected');
  EXCEPTION WHEN check_violation THEN v_ok := TRUE; v_msg := SQLERRM; END;
  ASSERT v_ok, '2.2 رفضٌ بلا سبب قُبِل';
  ASSERT position('chk_letter_rejected_needs_reason' IN v_msg) > 0, '2.2 ' || v_msg;
  RAISE NOTICE '  ✅ 2.2 chk_letter_rejected_needs_reason';
END $$;

-- 2.2b ★★★ — والعكس: سببُ رفضٍ بلا رفض
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_s UUID;
BEGIN
  SELECT salem INTO v_s FROM t_ids;
  BEGIN
    INSERT INTO employee_letter_requests (tenant_id, employee_id, letter_type,
                                          status, rejection_reason)
    VALUES ('a3670000-0000-0000-0000-00000000000a', v_s,'other','submitted','سببٌ يتيم');
  EXCEPTION WHEN check_violation THEN v_ok := TRUE; END;
  ASSERT v_ok, '2.2b سببُ رفضٍ بلا رفضٍ قُبِل';
  RAISE NOTICE '  ✅ 2.2b سببٌ بلا رفضٍ مرفوض (القيد ثنائيّ الاتّجاه)';
END $$;

-- 2.3 ★ — «مُسلَّم» بلا لحظة تسليم
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_s UUID;
BEGIN
  SELECT salem INTO v_s FROM t_ids;
  BEGIN
    INSERT INTO employee_letter_requests (tenant_id, employee_id, letter_type,
                                          status, document_url)
    VALUES ('a3670000-0000-0000-0000-00000000000a', v_s,'other','delivered','http://x/a.pdf');
  EXCEPTION WHEN check_violation THEN v_ok := TRUE; END;
  ASSERT v_ok, '2.3 مُسلَّمٌ بلا delivered_at قُبِل';
  RAISE NOTICE '  ✅ 2.3 chk_letter_delivered_complete';
END $$;

-- 2.4 — FK المُراجِع
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_s UUID;
BEGIN
  SELECT salem INTO v_s FROM t_ids;
  BEGIN
    INSERT INTO employee_letter_requests (tenant_id, employee_id, letter_type,
                                          reviewed_by, reviewed_at)
    VALUES ('a3670000-0000-0000-0000-00000000000a', v_s,'other',
            'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', now());
  EXCEPTION WHEN foreign_key_violation THEN v_ok := TRUE; END;
  ASSERT v_ok, '2.4 مُراجِعٌ معدوم قُبِل';
  RAISE NOTICE '  ✅ 2.4 reviewed_by محروس (→ profiles)';
END $$;

\echo '════════ ③ ★★★ المحفّز — sla_due_at كان عموداً ميتاً ════════'

-- 3.1 ★★★ — المهل الثلاث محسوبةٌ بدقّة
--   عاجل 4 ساعات · عادي يومان (48) · منخفض خمسة أيام (120)
DO $$
DECLARE v_s UUID; v_u UUID; v_n UUID; v_l UUID; v_hu NUMERIC; v_hn NUMERIC; v_hl NUMERIC;
BEGIN
  SELECT salem INTO v_s FROM t_ids;
  INSERT INTO hr_cases (tenant_id, employee_id, case_type, subject, description, priority)
  VALUES ('a3670000-0000-0000-0000-00000000000a', v_s,'payroll','عاجل','x','urgent')
  RETURNING id INTO v_u;
  INSERT INTO hr_cases (tenant_id, employee_id, case_type, subject, description, priority)
  VALUES ('a3670000-0000-0000-0000-00000000000a', v_s,'benefits','عادي','x','normal')
  RETURNING id INTO v_n;
  INSERT INTO hr_cases (tenant_id, employee_id, case_type, subject, description, priority)
  VALUES ('a3670000-0000-0000-0000-00000000000a', v_s,'documents','منخفض','x','low')
  RETURNING id INTO v_l;

  SELECT EXTRACT(EPOCH FROM (sla_due_at - created_at))/3600 INTO v_hu FROM hr_cases WHERE id=v_u;
  SELECT EXTRACT(EPOCH FROM (sla_due_at - created_at))/3600 INTO v_hn FROM hr_cases WHERE id=v_n;
  SELECT EXTRACT(EPOCH FROM (sla_due_at - created_at))/3600 INTO v_hl FROM hr_cases WHERE id=v_l;

  ASSERT v_hu = 4,   '3.1 عاجل = ' || v_hu || ' ساعة بدل 4';
  ASSERT v_hn = 48,  '3.1 عادي = ' || v_hn || ' ساعة بدل 48';
  ASSERT v_hl = 120, '3.1 منخفض = ' || v_hl || ' ساعة بدل 120';
  RAISE NOTICE '  ✅ 3.1 sla_due_at يُملأ: 4 · 48 · 120 ساعة (كان NULL دائماً)';
END $$;

-- 3.2 ★★★ — تغيّر الأولوية يُعيد الحساب
DO $$
DECLARE v_s UUID; v_id UUID; v_h NUMERIC;
BEGIN
  SELECT salem INTO v_s FROM t_ids;
  SELECT id INTO v_id FROM hr_cases WHERE subject='منخفض';
  UPDATE hr_cases SET priority='urgent' WHERE id=v_id;
  SELECT EXTRACT(EPOCH FROM (sla_due_at - created_at))/3600 INTO v_h FROM hr_cases WHERE id=v_id;
  ASSERT v_h = 4, '3.2 لم يُعَد الحساب: ' || v_h;
  RAISE NOTICE '  ✅ 3.2 رفعُ الأولوية يُقرّب الاستحقاق (120 ← 4)';
END $$;

-- 3.3 ★★★ — first_response_at يُملأ عند أول تحرّك
DO $$
DECLARE v_id UUID; v_before TIMESTAMPTZ; v_after TIMESTAMPTZ;
BEGIN
  SELECT id INTO v_id FROM hr_cases WHERE subject='عادي';
  SELECT first_response_at INTO v_before FROM hr_cases WHERE id=v_id;
  ASSERT v_before IS NULL, '3.3 first_response_at مملوءٌ عند الإنشاء';
  UPDATE hr_cases SET status='in_review' WHERE id=v_id;
  SELECT first_response_at INTO v_after FROM hr_cases WHERE id=v_id;
  ASSERT v_after IS NOT NULL, '3.3 first_response_at لم يُملأ';
  RAISE NOTICE '  ✅ 3.3 first_response_at: NULL ← لحظةٌ عند أول تحرّك';
END $$;

-- 3.4 ★★★ — إعادة الفتح تُعدّ وتُفرغ الحلّ
DO $$
DECLARE v_id UUID; v_c INTEGER; v_r TIMESTAMPTZ; v_s TEXT;
BEGIN
  SELECT id INTO v_id FROM hr_cases WHERE subject='عاجل';
  UPDATE hr_cases SET status='resolved', resolution_summary='صُرف الفرق' WHERE id=v_id;
  ASSERT (SELECT resolved_at FROM hr_cases WHERE id=v_id) IS NOT NULL,
         '3.4 resolved_at لم يُملأ آلياً';
  -- ★ إعادة الفتح
  UPDATE hr_cases SET status='open' WHERE id=v_id;
  SELECT reopened_count, resolved_at, resolution_summary INTO v_c, v_r, v_s
    FROM hr_cases WHERE id=v_id;
  ASSERT v_c = 1, '3.4 reopened_count = ' || v_c || ' بدل 1';
  ASSERT v_r IS NULL, '3.4 resolved_at لم يُفرَغ';
  ASSERT v_s IS NULL, '3.4 resolution_summary لم يُفرَغ';
  RAISE NOTICE '  ✅ 3.4 إعادة الفتح: العدّاد 1 · الحلُّ أُفرِغ (والقيد راضٍ)';
END $$;

-- 3.5 ★★ — المحفّز يُجمّد المستأجر والموظف
DO $$
DECLARE v_id UUID; v_t UUID; v_e UUID; v_s UUID; v_n UUID;
BEGIN
  SELECT salem, noor INTO v_s, v_n FROM t_ids;
  SELECT id INTO v_id FROM hr_cases WHERE subject='عادي';
  UPDATE hr_cases SET tenant_id='b3670000-0000-0000-0000-00000000000b',
                      employee_id = v_n WHERE id=v_id;
  SELECT tenant_id, employee_id INTO v_t, v_e FROM hr_cases WHERE id=v_id;
  ASSERT v_t = 'a3670000-0000-0000-0000-00000000000a', '3.5 المستأجر تغيّر';
  ASSERT v_e = v_s, '3.5 الموظف تغيّر';
  RAISE NOTICE '  ✅ 3.5 المحفّز يُجمّد tenant_id و employee_id';
END $$;

-- 3.6 ★★★ — منع الحذف على الجدولين
DO $$
DECLARE v_a BOOLEAN := FALSE; v_b BOOLEAN := FALSE; v_msg TEXT; v_id UUID; v_s UUID; v_lid UUID;
BEGIN
  SELECT salem INTO v_s FROM t_ids;
  SELECT id INTO v_id FROM hr_cases WHERE subject='عاجل';
  BEGIN DELETE FROM hr_cases WHERE id=v_id;
  EXCEPTION WHEN OTHERS THEN v_a := TRUE; v_msg := SQLERRM; END;
  ASSERT v_a, '3.6a حذفُ طلبٍ نجح';
  ASSERT position('SERVICE_CENTER_DELETE_BLOCKED' IN v_msg) > 0, '3.6a ' || v_msg;

  INSERT INTO employee_letter_requests (tenant_id, employee_id, letter_type)
  VALUES ('a3670000-0000-0000-0000-00000000000a', v_s,'other') RETURNING id INTO v_lid;
  BEGIN DELETE FROM employee_letter_requests WHERE id=v_lid;
  EXCEPTION WHEN OTHERS THEN v_b := TRUE; END;
  ASSERT v_b, '3.6b حذفُ خطابٍ نجح';
  RAISE NOTICE '  ✅ 3.6 SERVICE_CENTER_DELETE_BLOCKED على الجدولين';
END $$;

\echo '════════ ④ دوال الطلبات ════════'

SET request.jwt.claim.sub = '13670001-0000-0000-0000-000000000001';

-- 4.1 — HR تفتح طلباً لأيّ موظف
DO $$
DECLARE v_id UUID; v_n UUID; v_sub TEXT;
BEGIN
  SELECT noor INTO v_n FROM t_ids;
  v_id := hr_case_open(v_n,'benefits','  تأمينٌ صحّي  ','  لم يُفعَّل  ','urgent');
  SELECT subject INTO v_sub FROM hr_cases WHERE id=v_id;
  ASSERT v_sub = 'تأمينٌ صحّي', '4.1 btrim لم يُطبَّق: [' || v_sub || ']';
  ASSERT (SELECT sla_due_at FROM hr_cases WHERE id=v_id) IS NOT NULL, '4.1 sla معدوم';
  RAISE NOTICE '  ✅ 4.1 hr_case_open ينجح · btrim مُطبَّق · sla مملوء';
END $$;

-- 4.2 ★★★ — الموظف لا يفتح طلباً باسم غيره
SET request.jwt.claim.sub = '23670002-0000-0000-0000-000000000002';
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_n UUID; v_msg TEXT;
BEGIN
  SELECT noor INTO v_n FROM t_ids;
  BEGIN PERFORM hr_case_open(v_n,'payroll','باسم نور','x');
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; v_msg := SQLERRM; END;
  ASSERT v_ok, '4.2 الموظف فتح طلباً باسم زميلته';
  ASSERT position('CASE_NOT_OWNER' IN v_msg) > 0, '4.2 ' || v_msg;
  RAISE NOTICE '  ✅ 4.2 CASE_NOT_OWNER';
END $$;

-- 4.3 ★ — والموظف يفتح لنفسه بنجاح
DO $$
DECLARE v_id UUID; v_s UUID;
BEGIN
  SELECT salem INTO v_s FROM t_ids;
  v_id := hr_case_open(NULL,'payroll','خصمٌ غير مفهوم','راتبي ناقص');
  ASSERT (SELECT employee_id FROM hr_cases WHERE id=v_id) = v_s,
         '4.3 الطلب لم يُنسب إلى صاحبه';
  RAISE NOTICE '  ✅ 4.3 الموظف يفتح لنفسه (employee_id من السياق)';
END $$;

-- 4.4 ★★★ — الموظف لا يُغيّر حالة طلبه (العطل ②)
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_id UUID; v_msg TEXT;
BEGIN
  SELECT id INTO v_id FROM hr_cases WHERE subject='خصمٌ غير مفهوم';
  BEGIN PERFORM hr_case_set_status(v_id,'resolved','حللتُه بنفسي');
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; v_msg := SQLERRM; END;
  ASSERT v_ok, '4.4 الموظف أغلق شكواه';
  ASSERT position('CASE_NOT_STAFF' IN v_msg) > 0, '4.4 ' || v_msg;
  RAISE NOTICE '  ✅ 4.4 CASE_NOT_STAFF — الموظف لا يُغلق شكواه';
END $$;

-- 4.5 ★★★ — الموظف لا يُسنِد الطلب لنفسه (العطل ③)
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_id UUID; v_msg TEXT;
BEGIN
  SELECT id INTO v_id FROM hr_cases WHERE subject='خصمٌ غير مفهوم';
  BEGIN PERFORM hr_case_assign(v_id,'23670002-0000-0000-0000-000000000002');
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; v_msg := SQLERRM; END;
  ASSERT v_ok, '4.5 الموظف أسنَد الطلب لنفسه';
  ASSERT position('CASE_NOT_STAFF' IN v_msg) > 0, '4.5 ' || v_msg;
  RAISE NOTICE '  ✅ 4.5 CASE_NOT_STAFF — لا إسنادَ ذاتيّ';
END $$;

-- 4.6 ★★★ — HR تُسنِد فتنتقل الحالة إلى «قيد المراجعة»
SET request.jwt.claim.sub = '13670001-0000-0000-0000-000000000001';
DO $$
DECLARE v_id UUID; v_st TEXT; v_a UUID;
BEGIN
  SELECT id INTO v_id FROM hr_cases WHERE subject='خصمٌ غير مفهوم';
  PERFORM hr_case_assign(v_id, NULL);
  SELECT status, assigned_to INTO v_st, v_a FROM hr_cases WHERE id=v_id;
  ASSERT v_st = 'in_review', '4.6 الحالة ' || v_st;
  ASSERT v_a = '13670001-0000-0000-0000-000000000001', '4.6 المُسنَد إليه خطأ';
  ASSERT (SELECT first_response_at FROM hr_cases WHERE id=v_id) IS NOT NULL,
         '4.6 first_response_at لم يُملأ بالإسناد';
  RAISE NOTICE '  ✅ 4.6 الإسناد ينقل open ← in_review ويُسجّل أول ردّ';
END $$;

-- 4.7 ★★★ — لا إغلاق بلا ملخّص (العطل ⑫)
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_id UUID; v_msg TEXT;
BEGIN
  SELECT id INTO v_id FROM hr_cases WHERE subject='خصمٌ غير مفهوم';
  BEGIN PERFORM hr_case_set_status(v_id,'resolved', NULL);
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; v_msg := SQLERRM; END;
  ASSERT v_ok, '4.7 أُغلق بلا ملخّص';
  ASSERT position('CASE_SUMMARY_REQUIRED' IN v_msg) > 0,
         '4.7 مُنع بالقيد لا بحارس الدالة: ' || v_msg;
  RAISE NOTICE '  ✅ 4.7 CASE_SUMMARY_REQUIRED (حارس الدالة يسبق القيد)';
END $$;

-- 4.8 ★ — والإغلاق بملخّصٍ ينجح ويملأ اللحظتين
DO $$
DECLARE v_id UUID; v_r TIMESTAMPTZ; v_c TIMESTAMPTZ;
BEGIN
  SELECT id INTO v_id FROM hr_cases WHERE subject='خصمٌ غير مفهوم';
  PERFORM hr_case_set_status(v_id,'resolved','صُرف الفرق في راتب الشهر');
  SELECT resolved_at INTO v_r FROM hr_cases WHERE id=v_id;
  ASSERT v_r IS NOT NULL, '4.8 resolved_at معدوم';
  PERFORM hr_case_set_status(v_id,'closed', NULL);
  SELECT closed_at INTO v_c FROM hr_cases WHERE id=v_id;
  ASSERT v_c IS NOT NULL, '4.8 closed_at معدوم';
  -- ★ الملخّص السابق يكفي للإغلاق (لا نُلزم بتكراره)
  RAISE NOTICE '  ✅ 4.8 الإغلاق يملأ resolved_at و closed_at · الملخّص السابق يكفي';
END $$;

\echo '════════ ⑤ ★★★★ دوال الخطابات — العطل الأخطر ════════'

-- 5.1 ★★★★ — الموظف لا يُصدر شهادة راتبه (العطل ①)
SET request.jwt.claim.sub = '23670002-0000-0000-0000-000000000002';
DO $$
DECLARE v_id UUID; v_ok BOOLEAN := FALSE; v_msg TEXT;
BEGIN
  v_id := letter_request_open(NULL,'salary_certificate','قرضٌ مصرفيّ');
  ASSERT (SELECT status FROM employee_letter_requests WHERE id=v_id) = 'submitted',
         '5.1 الحالة الابتدائية خطأ';
  BEGIN PERFORM letter_request_issue(v_id,'http://fake/شهادة-مزوّرة.pdf');
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; v_msg := SQLERRM; END;
  ASSERT v_ok, '5.1 ★★★★ الموظف أصدر شهادة راتبه بنفسه';
  ASSERT position('LETTER_NOT_STAFF' IN v_msg) > 0, '5.1 ' || v_msg;
  RAISE NOTICE '  ✅ 5.1 LETTER_NOT_STAFF — الموظف لا يُصدر شهادة راتبه';
END $$;

-- 5.2 ★★★ — ولا يُسلّمها
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_id UUID; v_msg TEXT;
BEGIN
  SELECT id INTO v_id FROM employee_letter_requests WHERE purpose='قرضٌ مصرفيّ';
  BEGIN PERFORM letter_request_deliver(v_id);
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; v_msg := SQLERRM; END;
  ASSERT v_ok, '5.2 الموظف سلّم خطابه';
  ASSERT position('LETTER_NOT_STAFF' IN v_msg) > 0, '5.2 ' || v_msg;
  RAISE NOTICE '  ✅ 5.2 LETTER_NOT_STAFF — ولا يُسلّمها';
END $$;

-- 5.3 ★★★ — لا تسليمَ لخطابٍ لم يُصدَر (العطل ⑬)
SET request.jwt.claim.sub = '13670001-0000-0000-0000-000000000001';
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_id UUID; v_msg TEXT;
BEGIN
  SELECT id INTO v_id FROM employee_letter_requests WHERE purpose='قرضٌ مصرفيّ';
  BEGIN PERFORM letter_request_deliver(v_id);
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; v_msg := SQLERRM; END;
  ASSERT v_ok, '5.3 سُلِّم خطابٌ بلا ملفّ';
  ASSERT position('LETTER_NOT_ISSUED' IN v_msg) > 0, '5.3 ' || v_msg;
  RAISE NOTICE '  ✅ 5.3 LETTER_NOT_ISSUED';
END $$;

-- 5.4 ★★★ — الإصدار بلا ملفّ مرفوض
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_id UUID; v_msg TEXT;
BEGIN
  SELECT id INTO v_id FROM employee_letter_requests WHERE purpose='قرضٌ مصرفيّ';
  BEGIN PERFORM letter_request_issue(v_id,'   ');
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; v_msg := SQLERRM; END;
  ASSERT v_ok, '5.4 أُصدر بلا ملفّ';
  ASSERT position('LETTER_DOCUMENT_REQUIRED' IN v_msg) > 0, '5.4 ' || v_msg;
  RAISE NOTICE '  ✅ 5.4 LETTER_DOCUMENT_REQUIRED';
END $$;

-- 5.5 ★★★ — HR تُصدر ثم تُسلّم: اللحظتان تُملآن آلياً
DO $$
DECLARE v_id UUID; v_st TEXT; v_iss TIMESTAMPTZ; v_del TIMESTAMPTZ; v_by UUID;
BEGIN
  SELECT id INTO v_id FROM employee_letter_requests WHERE purpose='قرضٌ مصرفيّ';
  PERFORM letter_request_issue(v_id,'  https://docs/salary-2026.pdf  ');
  SELECT status, issued_at, reviewed_by INTO v_st, v_iss, v_by
    FROM employee_letter_requests WHERE id=v_id;
  ASSERT v_st = 'ready', '5.5 الحالة ' || v_st;
  ASSERT v_iss IS NOT NULL, '5.5 issued_at معدوم';
  ASSERT v_by = '13670001-0000-0000-0000-000000000001', '5.5 المُراجِع خطأ';
  ASSERT (SELECT document_url FROM employee_letter_requests WHERE id=v_id)
         = 'https://docs/salary-2026.pdf', '5.5 btrim لم يُطبَّق على الرابط';

  PERFORM letter_request_deliver(v_id);
  SELECT status, delivered_at INTO v_st, v_del FROM employee_letter_requests WHERE id=v_id;
  ASSERT v_st = 'delivered', '5.5 الحالة بعد التسليم ' || v_st;
  ASSERT v_del IS NOT NULL, '5.5 delivered_at معدوم';
  RAISE NOTICE '  ✅ 5.5 الإصدار ثم التسليم · issued_at و delivered_at آليّان';
END $$;

-- 5.6 ★ — تسليمٌ مكرَّر يُعيد FALSE
DO $$
DECLARE v_id UUID;
BEGIN
  SELECT id INTO v_id FROM employee_letter_requests WHERE purpose='قرضٌ مصرفيّ';
  ASSERT NOT letter_request_deliver(v_id), '5.6 التسليم المكرّر رجع TRUE';
  RAISE NOTICE '  ✅ 5.6 التسليم المكرَّر = FALSE بلا استثناء';
END $$;

-- 5.7 ★★★ — لا رفضَ لخطابٍ سُلِّم
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_id UUID; v_msg TEXT;
BEGIN
  SELECT id INTO v_id FROM employee_letter_requests WHERE purpose='قرضٌ مصرفيّ';
  BEGIN PERFORM letter_request_reject(v_id,'تراجعتُ');
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; v_msg := SQLERRM; END;
  ASSERT v_ok, '5.7 رُفض خطابٌ سُلِّم';
  ASSERT position('LETTER_ALREADY_DELIVERED' IN v_msg) > 0, '5.7 ' || v_msg;
  RAISE NOTICE '  ✅ 5.7 LETTER_ALREADY_DELIVERED';
END $$;

-- 5.8 ★★★ — الرفض يستلزم سبباً، ثم ينجح ويملأ الحقول (العطل ⑭)
DO $$
DECLARE v_id UUID; v_ok BOOLEAN := FALSE; v_msg TEXT; v_r TEXT; v_st TEXT;
BEGIN
  v_id := letter_request_open((SELECT noor FROM t_ids),'experience_letter','سفر');
  BEGIN PERFORM letter_request_reject(v_id,'  ');
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; v_msg := SQLERRM; END;
  ASSERT v_ok, '5.8 رفضٌ بلا سبب قُبِل';
  ASSERT position('LETTER_REJECT_REASON_REQUIRED' IN v_msg) > 0, '5.8 ' || v_msg;

  PERFORM letter_request_reject(v_id,'مدّة الخدمة أقلّ من سنة');
  SELECT status, rejection_reason INTO v_st, v_r
    FROM employee_letter_requests WHERE id=v_id;
  ASSERT v_st = 'rejected', '5.8 الحالة ' || v_st;
  ASSERT v_r = 'مدّة الخدمة أقلّ من سنة', '5.8 السبب [' || v_r || ']';
  RAISE NOTICE '  ✅ 5.8 الرفض يستلزم سبباً ويحفظه (كانت حالةً بلا عمودٍ ولا زرّ)';
END $$;

-- 5.9 ★★★ — الخروج من «مرفوض» يُفرغ السبب فيبقى القيد متّسقاً
DO $$
DECLARE v_id UUID; v_r TEXT;
BEGIN
  SELECT id INTO v_id FROM employee_letter_requests WHERE purpose='سفر';
  UPDATE employee_letter_requests SET status='in_review' WHERE id=v_id;
  SELECT rejection_reason INTO v_r FROM employee_letter_requests WHERE id=v_id;
  ASSERT v_r IS NULL, '5.9 السبب بقي بعد الخروج من الرفض: [' || v_r || ']';
  RAISE NOTICE '  ✅ 5.9 المحفّز يُفرغ السبب عند الخروج من «مرفوض»';
END $$;

\echo '════════ ⑥ اللوح والملخّص ════════'

-- 6.1 ★★★ — ترتيبٌ حتميّ: المفتوح أولاً، فالعاجل، فالأقرب استحقاقاً
DO $$
DECLARE v_first TEXT; v_n INTEGER;
BEGIN
  -- ★ اللوح SECURITY INVOKER وبدور postgres (BYPASSRLS) يرى كل مستأجر
  --   ⇒ نعدّ صفوف مستأجرنا وحدها عبر الانضمام بالمعرّفات.
  SELECT count(*) INTO v_n FROM hr_case_board() b
   JOIN hr_cases c ON c.id = b.id
   WHERE c.tenant_id = 'a3670000-0000-0000-0000-00000000000a';
  -- الطلبات المُنشأة: عاجل(reopened→open) · عادي · منخفض→urgent · تأمينٌ صحّي(urgent)
  --                   · خصمٌ غير مفهوم(closed)
  ASSERT v_n = 5, '6.1 اللوح أعاد ' || v_n || ' بدل 5';
  SELECT b.subject INTO v_first FROM hr_case_board() b
   JOIN hr_cases c ON c.id = b.id
   WHERE c.tenant_id = 'a3670000-0000-0000-0000-00000000000a' LIMIT 1;
  -- ★ «خصمٌ غير مفهوم» مُغلق ⇒ يجب أن يكون **آخر** صفوف مستأجرنا
  ASSERT (SELECT b.subject FROM hr_case_board() b
           JOIN hr_cases c ON c.id = b.id
           WHERE c.tenant_id = 'a3670000-0000-0000-0000-00000000000a'
           OFFSET 4 LIMIT 1) = 'خصمٌ غير مفهوم',
         '6.1 المُغلق ليس في الذيل';
  RAISE NOTICE '  ✅ 6.1 اللوح 5 صفوف · المُغلق في الذيل · الأول = «%»', v_first;
END $$;

-- 6.2 ★★★ — الاسم مُركَّبٌ رغم full_name_ar = NULL
DO $$
DECLARE v_name TEXT; v_raw TEXT;
BEGIN
  SELECT employee_name INTO v_name FROM pg_temp.board_mine() WHERE subject='تأمينٌ صحّي';
  SELECT COALESCE(full_name_ar,'<NULL>') INTO v_raw
    FROM employees WHERE id=(SELECT noor FROM t_ids);
  ASSERT v_raw = '<NULL>', '6.2 full_name_ar لم يعد فارغاً: ' || v_raw;
  ASSERT v_name LIKE '%نور%', '6.2 الاسم [' || v_name || ']';
  RAISE NOTICE '  ✅ 6.2 employee_name = «%» (مُركَّبٌ رغم full_name_ar = NULL)', v_name;
END $$;

-- 6.3 ★★★ — is_overdue و hours_to_sla
DO $$
DECLARE v_s UUID; v_id UUID; v_over BOOLEAN; v_h NUMERIC;
BEGIN
  SELECT salem INTO v_s FROM t_ids;
  INSERT INTO hr_cases (tenant_id, employee_id, case_type, subject, description,
                        priority, sla_due_at)
  VALUES ('a3670000-0000-0000-0000-00000000000a', v_s,'payroll','متأخّرٌ عمداً','x',
          'urgent', now() - INTERVAL '10 hours')
  RETURNING id INTO v_id;
  SELECT is_overdue, hours_to_sla INTO v_over, v_h
    FROM pg_temp.board_mine() WHERE subject='متأخّرٌ عمداً';
  ASSERT v_over, '6.3 لم يُرصد التأخّر';
  ASSERT v_h < 0, '6.3 hours_to_sla = ' || v_h || ' وليست سالبة';
  -- ★ والمُغلق المتأخّر لا يُعدّ متأخّراً
  UPDATE hr_cases SET status='resolved', resolution_summary='حُلّ' WHERE id=v_id;
  SELECT is_overdue INTO v_over FROM pg_temp.board_mine() WHERE subject='متأخّرٌ عمداً';
  ASSERT NOT v_over, '6.3 المُغلق ما زال يُعدّ متأخّراً';
  RAISE NOTICE '  ✅ 6.3 is_overdue: نشطٌ متأخّر=true · مُغلقٌ متأخّر=false';
END $$;

-- 6.4 ★ — الترشيح
--
-- ★ تصحيحُ عدٍّ منّي: كتبتُ أوّلاً open=2 فسقط بـ«open = 3 بدل 2» —
--   أغفلتُ أن التأكيد 6.3 أضاف «متأخّرٌ عمداً» ثم أغلقه، **و6.7 لم
--   يكن قد عمل بعد**. الجرد الصريح لحظة تنفيذ 6.4:
--     ① عاجل            open       urgent   (أُعيد فتحه في 3.4)
--     ② عادي            in_review  normal
--     ③ منخفض           open       urgent   (رُفعت أولويته في 3.2)
--     ④ تأمينٌ صحّي      open       urgent
--     ⑤ خصمٌ غير مفهوم   closed     normal
--     ⑥ متأخّرٌ عمداً     resolved   urgent   (من 6.3)
--   ⇒ open = ①③④ = **3** · urgent = ①③④⑥ = **4**
DO $$
DECLARE v_n INTEGER;
BEGIN
  SELECT count(*) INTO v_n FROM pg_temp.board_mine(NULL,'open');
  ASSERT v_n = 3, '6.4a open = ' || v_n || ' بدل 3';
  SELECT count(*) INTO v_n FROM pg_temp.board_mine(NULL,NULL,'urgent');
  ASSERT v_n = 4, '6.4b urgent = ' || v_n || ' بدل 4';
  -- ★ تأكيدٌ لا يمرّ صدفةً: in_review صفٌّ واحد فقط
  SELECT count(*) INTO v_n FROM pg_temp.board_mine(NULL,'in_review');
  ASSERT v_n = 1, '6.4b2 in_review = ' || v_n || ' بدل 1';
  SELECT count(*) INTO v_n FROM pg_temp.board_mine('تأمين');
  ASSERT v_n = 1, '6.4c بحث «تأمين» = ' || v_n;
  -- ★ بحثٌ بالاسم المُركَّب
  SELECT count(*) INTO v_n FROM pg_temp.board_mine('نور');
  ASSERT v_n = 1, '6.4d بحث «نور» = ' || v_n || ' بدل 1';
  RAISE NOTICE '  ✅ 6.4 الترشيح: open=3 · in_review=1 · urgent=4 · موضوع=1 · اسم=1';
END $$;

-- 6.5 ★★★ — لوح الخطابات: waiting_days بتوقيت بغداد
DO $$
DECLARE v_s UUID; v_id UUID; v_d INTEGER; v_dn INTEGER;
BEGIN
  SELECT salem INTO v_s FROM t_ids;
  INSERT INTO employee_letter_requests (tenant_id, employee_id, letter_type,
                                        purpose, created_at)
  VALUES ('a3670000-0000-0000-0000-00000000000a', v_s,'other','قديمٌ عمداً',
          now() - INTERVAL '9 days') RETURNING id INTO v_id;
  SELECT waiting_days INTO v_d FROM letter_request_board() WHERE purpose='قديمٌ عمداً';
  ASSERT v_d = 9, '6.5 waiting_days = ' || v_d || ' بدل 9';
  -- ★ والمُنجز لا يُحسب له انتظار
  SELECT waiting_days INTO v_dn FROM letter_request_board() WHERE purpose='قرضٌ مصرفيّ';
  ASSERT v_dn IS NULL, '6.5 المُسلَّم له waiting_days = ' || v_dn;
  RAISE NOTICE '  ✅ 6.5 waiting_days = 9 للمعلّق · NULL للمُنجز';
END $$;

-- 6.6 ★★★ — الملخّص بأرقامٍ محسوبةٍ يدوياً
--   hr_cases (بدور postgres ⇒ كلُّ المستأجرين):
--     ① عاجل            open       urgent   (أُعيد فتحه)
--     ② عادي            in_review  normal
--     ③ منخفض           open       urgent   (رُفعت أولويته)
--     ④ تأمينٌ صحّي      open       urgent
--     ⑤ خصمٌ غير مفهوم   closed     normal
--     ⑥ متأخّرٌ عمداً     resolved   urgent
--   ⇒ total=6 · open(open+in_review+waiting)=4 · urgent غير مُغلق=3
--     resolved(resolved+closed)=2 · reopened=1
DO $$
DECLARE r RECORD; v_ext INTEGER;
BEGIN
  -- ★★★ الملخّص يعدّ ما تراه RLS، وبدور postgres يرى كل مستأجر.
  --   نقيس «الغرباء» أولاً ونطرحهم — فيبقى التأكيد صحيحاً مهما
  --   تركت الملفّاتُ الأخرى من صفوف.
  SELECT count(*) INTO v_ext FROM hr_cases
   WHERE tenant_id NOT IN ('a3670000-0000-0000-0000-00000000000a',
                           'b3670000-0000-0000-0000-00000000000b');
  SELECT * INTO r FROM service_center_summary();
  ASSERT r.cases_total - v_ext = 6,
         '6.6 cases_total=' || r.cases_total || ' غرباء=' || v_ext || ' ⇒ ' ||
         (r.cases_total - v_ext) || ' بدل 6';
  ASSERT (SELECT count(*) FROM hr_cases
           WHERE tenant_id = 'a3670000-0000-0000-0000-00000000000a'
             AND status IN ('open','in_review','waiting_employee')) = 4,
         '6.6 المفتوح في مستأجرنا ليس 4';
  ASSERT (SELECT count(*) FROM hr_cases
           WHERE tenant_id = 'a3670000-0000-0000-0000-00000000000a'
             AND priority = 'urgent'
             AND status NOT IN ('resolved','closed')) = 3, '6.6 العاجل ليس 3';
  ASSERT (SELECT count(*) FROM hr_cases
           WHERE tenant_id = 'a3670000-0000-0000-0000-00000000000a'
             AND status IN ('resolved','closed')) = 2, '6.6 المُنجز ليس 2';
  ASSERT r.cases_open + r.cases_resolved = r.cases_total, '6.6 المجاميع لا تُطابق';
  ASSERT (SELECT count(*) FROM hr_cases
           WHERE tenant_id = 'a3670000-0000-0000-0000-00000000000a'
             AND reopened_count > 0) = 1, '6.6 المُعاد فتحه ليس 1';
  -- ★★★ وعدّادُ الملخّص نفسه حيٌّ لا صفرٌ بنيويّ.
  --   تحصيني الأول ضدّ التلوّث أسقط هذا التأكيد سهواً: بدّلتُ
  --   `r.cases_reopened` بعدٍّ مباشرٍ من الجدول، فنجا العكس INV22
  --   («العدّاد يصير صفراً») لأن لا تأكيدَ يقرأ الملخّص. أُعيد.
  ASSERT r.cases_reopened >= 1,
         '6.6 عدّاد الملخّص cases_reopened = ' || r.cases_reopened || ' — صفرٌ بنيويّ؟';
  RAISE NOTICE '  ✅ 6.6 الملخّص: 6 = 4 مفتوح + 2 منجز · عاجل=3 · معادُ فتحه=1';
END $$;

-- 6.7 ★★★ — عدّاد المتأخّرات حيٌّ لا صفرٌ بنيويّ
DO $$
DECLARE r RECORD; v_s UUID; v_before INTEGER;
BEGIN
  -- ★ نقيس الفرق لا القيمة المطلقة — فلا يتأثّر بصفوف غيرنا
  SELECT * INTO r FROM service_center_summary();
  v_before := r.cases_overdue;
  ASSERT (SELECT count(*) FROM hr_cases
           WHERE tenant_id = 'a3670000-0000-0000-0000-00000000000a'
             AND sla_due_at IS NOT NULL AND sla_due_at < now()
             AND status NOT IN ('resolved','closed')) = 0,
         '6.7 متأخّرٌ في مستأجرنا قبل الإدراج';
  SELECT salem INTO v_s FROM t_ids;
  INSERT INTO hr_cases (tenant_id, employee_id, case_type, subject, description,
                        priority, sla_due_at)
  VALUES ('a3670000-0000-0000-0000-00000000000a', v_s,'payroll','متأخّرٌ للعدّاد','x',
          'urgent', now() - INTERVAL '3 hours');
  SELECT * INTO r FROM service_center_summary();
  ASSERT r.cases_overdue = v_before + 1,
         '6.7 العدّاد لم يرتفع: ' || v_before || ' ← ' || r.cases_overdue;
  RAISE NOTICE '  ✅ 6.7 cases_overdue: 0 ← 1 (العدّاد حيٌّ)';
END $$;

-- 6.8 ★ — عدّادا الخطابات
DO $$
DECLARE r RECORD;
BEGIN
  SELECT * INTO r FROM service_center_summary();
  -- ★ تصحيحُ عدٍّ ثانٍ منّي: كتبتُ 3 فسقط بـ«letters_total=4 بدل 3» —
  --   أغفلتُ الخطاب المُنشأ في 3.6 لاختبار منع الحذف (لم يُحذف لأن
  --   المحفّز منعه، وهذا هو المقصود). الجرد الصريح:
  --     ① (من 3.6) other        submitted   ← بقي لأن الحذف مُنع
  --     ② قرضٌ مصرفيّ   salary   delivered
  --     ③ سفر          experience in_review  (خرج من rejected في 5.9)
  --     ④ قديمٌ عمداً    other      submitted
  --   ⇒ total=4 · delivered=1 · pending(submitted+in_review)=3 · rejected=0
  -- ★ العدُّ مُرشَّحٌ بمستأجرنا صراحةً (درسُ الانحدار)
  ASSERT (SELECT count(*) FROM employee_letter_requests
           WHERE tenant_id = 'a3670000-0000-0000-0000-00000000000a') = 4,
         '6.8 خطابات مستأجرنا ليست 4';
  ASSERT (SELECT count(*) FROM employee_letter_requests
           WHERE tenant_id = 'a3670000-0000-0000-0000-00000000000a'
             AND status = 'delivered') = 1, '6.8 المُسلَّم ليس 1';
  ASSERT (SELECT count(*) FROM employee_letter_requests
           WHERE tenant_id = 'a3670000-0000-0000-0000-00000000000a'
             AND status IN ('submitted','in_review')) = 3, '6.8 المعلّق ليس 3';
  ASSERT (SELECT count(*) FROM employee_letter_requests
           WHERE tenant_id = 'a3670000-0000-0000-0000-00000000000a'
             AND status IN ('rejected','ready')) = 0, '6.8 مرفوض/جاهز ليس 0';
  ASSERT r.letters_total = r.letters_pending + r.letters_ready
                         + r.letters_delivered + r.letters_rejected,
         '6.8 المجاميع لا تُطابق الإجمالي';
  RAISE NOTICE '  ✅ 6.8 الخطابات: 4 = 3 معلّق + 1 مُسلَّم (والمجاميع تُطابق)';
END $$;

-- ═══════════════════════════════════════════════════════════════
--  ★★★ 6.9–6.15 — أعكاسٌ نجت لأن «لا بيانات تخالفها»
--
--  أوّل تشغيلٍ لـ_invert_0367.py أعطى 54/63. تسعةٌ نجت، وكلُّ سببٍ
--  مُشخَّصٌ لا مُخمَّن:
--     INV20 — عكسٌ **وهميّ** (NO_MATCH): مسافتان بادئتان في نصّي.
--     INV15 — الترتيب: عيّنتي كان ترتيبها الزمنيّ موافقاً صدفةً.
--     INV24 — لا صفَّ بحالة `waiting_employee` في العيّنة إطلاقاً.
--     INV26 — hr_case_open لم تُستدعَ قطُّ بموضوعٍ فارغ (القيد كان
--             يُختبَر بكتابةٍ مباشرة، لا عبر الدالة).
--     INV32 — لا طلبَ من مستأجرٍ آخر يُمرَّر إلى hr_case_set_status.
--     INV35 — لم يُستدعَ letter_request_issue على خطابٍ مُنجز.
--     INV39 — لم يُختبَر رفضُ الخطاب بدور موظف.
--     INV42 — لم يُستدعَ letter_request_open باسم موظفٍ آخر.
--     DDL04 — كل خطابات العيّنة لموظفين موجودين بمستأجرٍ صحيح.
-- ═══════════════════════════════════════════════════════════════

-- 6.9 ★★★ [DDL04] — FK الموظف على الخطابات بكتابةٍ مباشرة
DO $$
DECLARE v_a BOOLEAN := FALSE; v_b BOOLEAN := FALSE; v_bd UUID;
BEGIN
  BEGIN
    INSERT INTO employee_letter_requests (tenant_id, employee_id, letter_type)
    VALUES ('a3670000-0000-0000-0000-00000000000a',
            'ffffffff-ffff-ffff-ffff-ffffffffffff','other');
  EXCEPTION WHEN foreign_key_violation THEN v_a := TRUE; END;
  ASSERT v_a, '6.9a خطابٌ لموظفٍ معدوم قُبِل';

  -- ★★★ وموظفُ مستأجرٍ آخر — FK **مركَّب** لا مفرد
  SELECT badr INTO v_bd FROM t_ids;
  ASSERT v_bd IS NOT NULL, '6.9 بدر غير موجود — التأكيد سيكون فارغاً';
  BEGIN
    INSERT INTO employee_letter_requests (tenant_id, employee_id, letter_type)
    VALUES ('a3670000-0000-0000-0000-00000000000a', v_bd,'other');
  EXCEPTION WHEN foreign_key_violation THEN v_b := TRUE; END;
  ASSERT v_b, '6.9b خطابٌ لموظف مستأجرٍ آخر قُبِل';
  RAISE NOTICE '  ✅ 6.9 [DDL04] FK الخطابات: معدومٌ ومستأجرٌ آخر مرفوضان';
END $$;

-- 6.10 ★★★ [INV15] — الترتيب لا يمرّ صدفةً
--   نُدرج صفّاً **أقدم زمنياً** لكنه عاجلٌ ومفتوح: الترتيب الصحيح
--   يضعه قبل الصفوف المُغلقة الأحدث. الترتيب الزمنيّ وحده يعكسها.
DO $$
DECLARE v_s UUID; v_id UUID; v_first TEXT; v_last TEXT; v_n INTEGER;
BEGIN
  SELECT salem INTO v_s FROM t_ids;
  INSERT INTO hr_cases (tenant_id, employee_id, case_type, subject, description,
                        priority, status, created_at, sla_due_at)
  VALUES ('a3670000-0000-0000-0000-00000000000a', v_s,'payroll',
          'أقدمُ وأعجلُ','x','urgent','open',
          now() - INTERVAL '30 days', now() + INTERVAL '1 hour')
  RETURNING id INTO v_id;

  SELECT count(*) INTO v_n FROM pg_temp.board_mine();
  SELECT subject INTO v_first FROM pg_temp.board_mine() LIMIT 1;
  SELECT subject INTO v_last  FROM pg_temp.board_mine() OFFSET (v_n - 1) LIMIT 1;

  -- ★ المُغلق في الذيل رغم أنه **أحدث** إنشاءً
  ASSERT v_last IN ('خصمٌ غير مفهوم','متأخّرٌ عمداً'),
         '6.10 آخر صفّ [' || v_last || '] — المُغلق ليس في الذيل';
  -- ★ والأقدمُ العاجلُ ليس في الذيل رغم قِدَمه ثلاثين يوماً
  ASSERT v_first <> 'خصمٌ غير مفهوم',
         '6.10 المُغلق تصدّر — الترتيب زمنيٌّ بحت';
  RAISE NOTICE '  ✅ 6.10 [INV15] الترتيب: المفتوح قبل المُغلق رغم القِدَم · الأول=«%»', v_first;
END $$;

-- 6.11 ★★ [INV24] — حالة waiting_employee تُحسب ضمن «المفتوح»
DO $$
DECLARE v_s UUID; v_id UUID; r RECORD; v_before INTEGER;
BEGIN
  SELECT cases_open INTO v_before FROM service_center_summary();
  SELECT salem INTO v_s FROM t_ids;
  INSERT INTO hr_cases (tenant_id, employee_id, case_type, subject, description,
                        status)
  VALUES ('a3670000-0000-0000-0000-00000000000a', v_s,'documents',
          'بانتظار الموظف','x','waiting_employee') RETURNING id INTO v_id;
  SELECT * INTO r FROM service_center_summary();
  ASSERT r.cases_open = v_before + 1,
         '6.11 waiting_employee لا يُعدّ مفتوحاً: ' || v_before || ' ← ' || r.cases_open;
  -- ★ ويظهر في اللوح بترشيح حالته
  ASSERT (SELECT count(*) FROM pg_temp.board_mine(NULL,'waiting_employee')) = 1,
         '6.11 الترشيح بـwaiting_employee لا يُرجع شيئاً';
  RAISE NOTICE '  ✅ 6.11 [INV24] waiting_employee محسوبٌ ضمن المفتوح';
END $$;

-- 6.12 ★★ [INV26] — حارس الموضوع في hr_case_open (عبر الدالة لا القيد)
SET request.jwt.claim.sub = '13670001-0000-0000-0000-000000000001';
DO $$
DECLARE v_a BOOLEAN := FALSE; v_b BOOLEAN := FALSE; v_s UUID; v_m1 TEXT; v_m2 TEXT;
BEGIN
  SELECT salem INTO v_s FROM t_ids;
  BEGIN PERFORM hr_case_open(v_s,'payroll','   ','وصفٌ سليم');
  EXCEPTION WHEN OTHERS THEN v_a := TRUE; v_m1 := SQLERRM; END;
  BEGIN PERFORM hr_case_open(v_s,'payroll','موضوعٌ سليم','   ');
  EXCEPTION WHEN OTHERS THEN v_b := TRUE; v_m2 := SQLERRM; END;
  ASSERT v_a, '6.12a موضوعٌ فارغ قُبِل عبر الدالة';
  ASSERT v_b, '6.12b وصفٌ فارغ قُبِل عبر الدالة';
  -- ★★★ حارس الدالة يجب أن يسبق القيد — رسالةٌ مفهومة للمستخدم
  ASSERT position('CASE_SUBJECT_REQUIRED' IN v_m1) > 0,
         '6.12a مُنع بالقيد لا بحارس الدالة: ' || v_m1;
  ASSERT position('CASE_SUBJECT_REQUIRED' IN v_m2) > 0,
         '6.12b مُنع بالقيد لا بحارس الدالة: ' || v_m2;
  RAISE NOTICE '  ✅ 6.12 [INV26] CASE_SUBJECT_REQUIRED يسبق القيد في الحقلين';
END $$;

-- 6.13 ★★ [INV32] — ترشيح المستأجر في hr_case_set_status
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_bd UUID; v_id UUID; v_msg TEXT; v_st TEXT;
BEGIN
  SELECT badr INTO v_bd FROM t_ids;
  -- ★★★ طلبٌ حقيقيٌّ في مستأجر باء — وإلّا كان التأكيد فراغاً
  INSERT INTO hr_cases (tenant_id, employee_id, case_type, subject, description)
  VALUES ('b3670000-0000-0000-0000-00000000000b', v_bd,'payroll','طلبُ باء','x')
  RETURNING id INTO v_id;

  -- السياق ما زال هدى (مستأجر ألف)
  BEGIN PERFORM hr_case_set_status(v_id,'closed','أُغلق من ألف');
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; v_msg := SQLERRM; END;
  ASSERT v_ok, '6.13 HR ألف أغلقت طلبَ باء';
  ASSERT position('CASE_NOT_FOUND' IN v_msg) > 0, '6.13 ' || v_msg;
  SELECT status INTO v_st FROM hr_cases WHERE id = v_id;
  ASSERT v_st = 'open', '6.13 صفُّ باء تغيّر [' || v_st || ']';
  RAISE NOTICE '  ✅ 6.13 [INV32] ترشيح المستأجر مُختبَرٌ بصفٍّ أجنبيٍّ حقيقيّ';
END $$;

-- 6.14 ★★ [INV35] — لا إعادة إصدارٍ لخطابٍ مُنجز
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_id UUID; v_msg TEXT; v_url TEXT;
BEGIN
  SELECT id INTO v_id FROM employee_letter_requests WHERE purpose='قرضٌ مصرفيّ';
  ASSERT (SELECT status FROM employee_letter_requests WHERE id=v_id) = 'delivered',
         '6.14 الخطاب ليس مُسلَّماً — التأكيد سيكون فارغاً';
  BEGIN PERFORM letter_request_issue(v_id,'https://docs/نسخةٌ-ثانية.pdf');
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; v_msg := SQLERRM; END;
  ASSERT v_ok, '6.14 أُعيد إصدارُ خطابٍ مُسلَّم';
  ASSERT position('LETTER_ALREADY_CLOSED' IN v_msg) > 0, '6.14 ' || v_msg;
  SELECT document_url INTO v_url FROM employee_letter_requests WHERE id=v_id;
  ASSERT v_url = 'https://docs/salary-2026.pdf', '6.14 الملفّ الأصليّ دُهس: ' || v_url;
  RAISE NOTICE '  ✅ 6.14 [INV35] LETTER_ALREADY_CLOSED · الملفّ الأصليّ محفوظ';
END $$;

-- 6.15 ★★★ [INV39/INV42] — حارسا الرفض والملكية بدور الموظف
SET request.jwt.claim.sub = '23670002-0000-0000-0000-000000000002';
DO $$
DECLARE v_a BOOLEAN := FALSE; v_b BOOLEAN := FALSE; v_id UUID; v_n UUID;
        v_m1 TEXT; v_m2 TEXT;
BEGIN
  -- ★★★ [INV39] الموظف يرفض خطاباً
  SELECT id INTO v_id FROM employee_letter_requests WHERE purpose='سفر';
  ASSERT v_id IS NOT NULL, '6.15 خطاب «سفر» غير موجود';
  BEGIN PERFORM letter_request_reject(v_id,'لا أريده');
  EXCEPTION WHEN OTHERS THEN v_a := TRUE; v_m1 := SQLERRM; END;
  ASSERT v_a, '6.15a الموظف رفض خطاباً';
  ASSERT position('LETTER_NOT_STAFF' IN v_m1) > 0, '6.15a ' || v_m1;

  -- ★★★ [INV42] والموظف يطلب خطاباً باسم زميلته
  SELECT noor INTO v_n FROM t_ids;
  BEGIN PERFORM letter_request_open(v_n,'salary_certificate','باسم نور');
  EXCEPTION WHEN OTHERS THEN v_b := TRUE; v_m2 := SQLERRM; END;
  ASSERT v_b, '6.15b الموظف طلب خطاباً باسم زميلته';
  ASSERT position('LETTER_NOT_OWNER' IN v_m2) > 0, '6.15b ' || v_m2;
  RAISE NOTICE '  ✅ 6.15 [INV39/INV42] LETTER_NOT_STAFF و LETTER_NOT_OWNER';
END $$;

SET request.jwt.claim.sub = '13670001-0000-0000-0000-000000000001';

\echo '════════ ⑦ الصلاحيات ════════'
DO $$
DECLARE v_n INTEGER;
BEGIN
  SELECT count(*) INTO v_n FROM pg_proc p
   WHERE p.pronamespace='public'::regnamespace
     AND (p.proname LIKE 'hr!_case!_%' ESCAPE '!'
          OR p.proname LIKE 'letter!_request!_%' ESCAPE '!'
          OR p.proname = 'service_center_summary')
     AND has_function_privilege('anon', p.oid, 'EXECUTE');
  ASSERT v_n = 0, '⑦ anon يملك EXECUTE على ' || v_n || ' دالة';

  SELECT count(*) INTO v_n FROM pg_proc p
   WHERE p.pronamespace='public'::regnamespace
     AND (p.proname LIKE 'hr!_case!_%' ESCAPE '!'
          OR p.proname LIKE 'letter!_request!_%' ESCAPE '!'
          OR p.proname = 'service_center_summary');
  ASSERT v_n = 10, '⑦ عدد الدوال = ' || v_n || ' بدل 10';
  RAISE NOTICE '  ✅ ⑦ عشر دوال · anon محجوبٌ عن كلّها';
END $$;

\echo '════════ ⑧ السياسات — الشرط الميّت أُسقط ════════'
DO $$
DECLARE v_n INTEGER;
BEGIN
  -- ★★★ العطل ⑤: `employee_id = auth.uid()` شرطٌ ميّت
  SELECT count(*) INTO v_n FROM pg_policy
   WHERE polrelid IN ('public.hr_cases'::regclass,
                      'public.employee_letter_requests'::regclass)
     AND (COALESCE(pg_get_expr(polqual,polrelid),'') LIKE '%employee_id = auth.uid()%'
          OR COALESCE(pg_get_expr(polwithcheck,polrelid),'') LIKE '%employee_id = auth.uid()%');
  ASSERT v_n = 0, '⑧ الشرط الميّت ما زال في ' || v_n || ' سياسة';

  -- ★★★★ العطل ①: لا سياسة ALL على جدول الخطابات
  SELECT count(*) INTO v_n FROM pg_policy
   WHERE polrelid='public.employee_letter_requests'::regclass
     AND polcmd='*' AND polpermissive;
  ASSERT v_n = 0, '⑧ سياسة ALL بيرمِسِف عادت (' || v_n || ')';

  -- ★ وسياسة hybrid_gate يجب أن تبقى RESTRICTIVE
  SELECT count(*) INTO v_n FROM pg_policy
   WHERE polrelid IN ('public.hr_cases'::regclass,
                      'public.employee_letter_requests'::regclass)
     AND polname LIKE 'hybrid_gate%' AND NOT polpermissive;
  ASSERT v_n = 2, '⑧ hybrid_gate ليست RESTRICTIVE على الجدولين (' || v_n || ')';
  RAISE NOTICE '  ✅ ⑧ الشرط الميّت أُسقط · لا ALL · hybrid_gate RESTRICTIVE';
END $$;

\echo ''
\echo '════════════════════════════════════════'
\echo '  ✅ verify-hr-service-center-0367.sql — كل التأكيدات نجحت'
\echo '════════════════════════════════════════'

ROLLBACK;
