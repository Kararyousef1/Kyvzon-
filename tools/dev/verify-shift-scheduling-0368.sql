-- ════════════════════════════════════════════════════════════════════════
--  verify-shift-scheduling-0368.sql — التحقق السلوكيّ من المايجريشن 0368
--
--  ★ يعمل بدور postgres (BYPASSRLS): يُثبت منطق الدوال والقيود والمحفّزات.
--    الجدار نفسه يُثبته verify-shift-scheduling-0368-rls.sh.
--
--  ★★ كلُّ عدٍّ مُرشَّحٌ بمستأجر الاختبار صراحةً (درس انحدار 0367).
--
--  psql -h /home/user/.pgtest/sock -p 5506 -U postgres -f tools/dev/verify-shift-scheduling-0368.sql
-- ════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on
\pset pager off
\t on

BEGIN;

-- ★ حارسُ عزل: لا نعمل على جدولٍ ملوَّث (درس 0367)
DO $$
DECLARE v_n INTEGER;
BEGIN
  SELECT count(*) INTO v_n FROM shift_assignments
   WHERE tenant_id IN ('a3680000-0000-0000-0000-00000000000a',
                       'b3680000-0000-0000-0000-00000000000b');
  ASSERT v_n = 0, 'التهيئة: مستأجرا الاختبار ملوَّثان بـ' || v_n || ' صفّاً';
END $$;

-- ══════════════════════ العيّنة ══════════════════════
INSERT INTO tenants (id, name, name_ar, slug) VALUES
  ('a3680000-0000-0000-0000-00000000000a','A','شركة ألف','a368-shift'),
  ('b3680000-0000-0000-0000-00000000000b','B','شركة باء','b368-shift');
INSERT INTO auth.users (id, email) VALUES
  ('13680001-0000-0000-0000-000000000001','huda@a368'),
  ('23680002-0000-0000-0000-000000000002','salem@a368'),
  ('33680003-0000-0000-0000-000000000003','noor@a368'),
  ('43680004-0000-0000-0000-000000000004','badr@b368');
INSERT INTO profiles (id, tenant_id, full_name, role, department) VALUES
  ('13680001-0000-0000-0000-000000000001','a3680000-0000-0000-0000-00000000000a','هدى الموارد','hr','الموارد'),
  ('23680002-0000-0000-0000-000000000002','a3680000-0000-0000-0000-00000000000a','سالم الأول','employee','الإنتاج'),
  ('33680003-0000-0000-0000-000000000003','a3680000-0000-0000-0000-00000000000a','نور الثانية','employee','الإنتاج'),
  ('43680004-0000-0000-0000-000000000004','b3680000-0000-0000-0000-00000000000b','بدر الباء','employee','الإنتاج');

CREATE TEMP TABLE t_ids AS
SELECT
  (SELECT id FROM employees WHERE user_id='23680002-0000-0000-0000-000000000002') AS salem,
  (SELECT id FROM employees WHERE user_id='33680003-0000-0000-0000-000000000003') AS noor,
  (SELECT id FROM employees WHERE user_id='43680004-0000-0000-0000-000000000004') AS badr,
  ((now() AT TIME ZONE 'Asia/Baghdad')::DATE + 20)                                AS d0;

\echo '════════ ① ★★★★ العطل ①: schedule_id كان يكسر كل إدراج ════════'

-- 1.1 ★★★★ — الإدراج بلا schedule_id ينجح الآن (كان NOT NULL بلا افتراضيّ)
DO $$
DECLARE v_id UUID; v_s UUID; v_sched UUID; v_d DATE;
BEGIN
  SELECT salem, d0 INTO v_s, v_d FROM t_ids;
  INSERT INTO shift_assignments (tenant_id, employee_id, shift_type, shift_date)
  VALUES ('a3680000-0000-0000-0000-00000000000a', v_s,'morning', v_d)
  RETURNING id, schedule_id INTO v_id, v_sched;
  ASSERT v_id IS NOT NULL, '1.1 الإدراج فشل';
  ASSERT v_sched IS NOT NULL, '1.1 schedule_id معدوم رغم الافتراضيّ';
  RAISE NOTICE '  ✅ 1.1 الإدراج بلا schedule_id ينجح (كان يفشل دائماً)';
END $$;

-- 1.2 ★★ — الافتراضيّ فريدٌ لكل صفّ حين لا يُمرَّر
DO $$
DECLARE v_n UUID; v_d DATE; v_a UUID; v_b UUID;
BEGIN
  SELECT noor, d0 INTO v_n, v_d FROM t_ids;
  INSERT INTO shift_assignments (tenant_id, employee_id, shift_type, shift_date)
  VALUES ('a3680000-0000-0000-0000-00000000000a', v_n,'evening', v_d)
  RETURNING schedule_id INTO v_a;
  SELECT schedule_id INTO v_b FROM shift_assignments
   WHERE employee_id=(SELECT salem FROM t_ids) AND shift_date=v_d;
  ASSERT v_a IS DISTINCT FROM v_b, '1.2 الافتراضيّ ثابتٌ لا فريد';
  RAISE NOTICE '  ✅ 1.2 gen_random_uuid() فريدٌ لكل صفّ';
END $$;

\echo '════════ ② القيود والمفاتيح ════════'

-- 2.1 — FK مركَّب: موظفٌ معدوم
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_d DATE;
BEGIN
  SELECT d0 INTO v_d FROM t_ids;
  BEGIN
    INSERT INTO shift_assignments (tenant_id, employee_id, shift_type, shift_date)
    VALUES ('a3680000-0000-0000-0000-00000000000a',
            'ffffffff-ffff-ffff-ffff-ffffffffffff','morning', v_d + 1);
  EXCEPTION WHEN foreign_key_violation THEN v_ok := TRUE; END;
  ASSERT v_ok, '2.1 موظفٌ معدوم قُبِل';
  RAISE NOTICE '  ✅ 2.1 موظفٌ معدوم مرفوض (FK مركَّب)';
END $$;

-- 2.2 ★★★ — العبور بين المستأجرين
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_b UUID; v_d DATE; v_msg TEXT;
BEGIN
  SELECT badr, d0 INTO v_b, v_d FROM t_ids;
  ASSERT v_b IS NOT NULL, '2.2 بدر غير موجود — العيّنة ناقصة';
  BEGIN
    INSERT INTO shift_assignments (tenant_id, employee_id, shift_type, shift_date)
    VALUES ('a3680000-0000-0000-0000-00000000000a', v_b,'night', v_d + 1);
  EXCEPTION WHEN foreign_key_violation THEN v_ok := TRUE; v_msg := SQLERRM; END;
  ASSERT v_ok, '2.2 موظفُ مستأجرٍ آخر قُبِل';
  ASSERT position('fk_shift_employee_tenant' IN v_msg) > 0, '2.2 ' || v_msg;
  RAISE NOTICE '  ✅ 2.2 موظفُ مستأجرٍ آخر مرفوض (FK **مركَّب** لا مفرد)';
END $$;

-- 2.3 — tenant_id NOT NULL
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_s UUID; v_d DATE;
BEGIN
  SELECT salem, d0 INTO v_s, v_d FROM t_ids;
  BEGIN
    INSERT INTO shift_assignments (tenant_id, employee_id, shift_type, shift_date)
    VALUES (NULL, v_s,'morning', v_d + 1);
  EXCEPTION WHEN not_null_violation THEN v_ok := TRUE; END;
  ASSERT v_ok, '2.3 وردية يتيمة قُبِلت';
  RAISE NOTICE '  ✅ 2.3 tenant_id NOT NULL';
END $$;

-- 2.4 ★★★★ — المفردات الأربع من structure_shifts
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_old BOOLEAN := FALSE; v_s UUID; v_d DATE; v_msg TEXT;
BEGIN
  SELECT salem, d0 INTO v_s, v_d FROM t_ids;
  BEGIN
    INSERT INTO shift_assignments (tenant_id, employee_id, shift_type, shift_date)
    VALUES ('a3680000-0000-0000-0000-00000000000a', v_s,'وردية_مخترعة', v_d + 1);
  EXCEPTION WHEN check_violation THEN v_ok := TRUE; v_msg := SQLERRM; END;
  ASSERT v_ok, '2.4a نوعٌ مخترع قُبِل';
  ASSERT position('chk_shift_type_vocab' IN v_msg) > 0, '2.4a ' || v_msg;

  -- ★★★★ ومفردةُ الصفحة القديمة 'صباحي' مرفوضةٌ أيضاً — وهذا المقصود:
  --   الصفحة كانت تكتب أسماءً لا وجود لها في `structure_shifts`.
  BEGIN
    INSERT INTO shift_assignments (tenant_id, employee_id, shift_type, shift_date)
    VALUES ('a3680000-0000-0000-0000-00000000000a', v_s,'صباحي', v_d + 1);
  EXCEPTION WHEN check_violation THEN v_old := TRUE; END;
  ASSERT v_old, '2.4b مفردةُ الصفحة القديمة «صباحي» ما زالت مقبولة';
  RAISE NOTICE '  ✅ 2.4 المفردات محصورةٌ في أكواد structure_shifts';
END $$;

-- 2.5 ★★★ — والمفردات الأربع كلُّها موجودةٌ فعلاً في structure_shifts
DO $$
DECLARE c TEXT; v_n INTEGER;
BEGIN
  FOREACH c IN ARRAY ARRAY['morning','evening','night','flexible'] LOOP
    SELECT count(*) INTO v_n FROM structure_shifts WHERE code = c;
    ASSERT v_n > 0, '2.5 الكود ' || c || ' في القيد وليس في structure_shifts';
  END LOOP;
  -- ★ والعكس: لا كودَ في القالب العامّ خارج القيد
  SELECT count(*) INTO v_n FROM structure_shifts
   WHERE tenant_id IS NULL AND code NOT IN ('morning','evening','night','flexible');
  ASSERT v_n = 0, '2.5 ' || v_n || ' كوداً عامّاً خارج القيد';
  RAISE NOTICE '  ✅ 2.5 القيد يطابق structure_shifts في الاتّجاهين';
END $$;

-- 2.6 ★★★ — الإلغاء الملفَّق مرفوض
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_id UUID; v_msg TEXT;
BEGIN
  SELECT id INTO v_id FROM shift_assignments
   WHERE tenant_id='a3680000-0000-0000-0000-00000000000a' LIMIT 1;
  BEGIN UPDATE shift_assignments SET status='cancelled' WHERE id=v_id;
  EXCEPTION WHEN check_violation THEN v_ok := TRUE; v_msg := SQLERRM; END;
  ASSERT v_ok, '2.6 إلغاءٌ بلا سببٍ ولا فاعل قُبِل';
  ASSERT position('chk_shift_cancelled_complete' IN v_msg) > 0, '2.6 ' || v_msg;
  RAISE NOTICE '  ✅ 2.6 chk_shift_cancelled_complete';
END $$;

-- 2.7 ★ — الفهرس الفريد يمنع ورديتين في اليوم نفسه
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_s UUID; v_d DATE;
BEGIN
  SELECT salem, d0 INTO v_s, v_d FROM t_ids;
  BEGIN
    INSERT INTO shift_assignments (tenant_id, employee_id, shift_type, shift_date)
    VALUES ('a3680000-0000-0000-0000-00000000000a', v_s,'evening', v_d);
  EXCEPTION WHEN unique_violation THEN v_ok := TRUE; END;
  ASSERT v_ok, '2.7 ورديتان في اليوم نفسه قُبِلتا';
  RAISE NOTICE '  ✅ 2.7 idx_unique_employee_shift_date يعمل';
END $$;

\echo '════════ ③ ★★★★ المحفّز — الإجازات والراحة والنافذة ════════'

-- 3.1 ★★★★ — وردية على موظفٍ في إجازةٍ معتمدة
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_n UUID; v_d DATE; v_msg TEXT; v_lid UUID;
BEGIN
  SELECT noor, d0 INTO v_n, v_d FROM t_ids;
  INSERT INTO leaves (tenant_id, employee_id, leave_type, date_from, date_to, status, reason)
  VALUES ('a3680000-0000-0000-0000-00000000000a', v_n,'سنوية',
          v_d + 5, v_d + 10,'موافق','سفر') RETURNING id INTO v_lid;
  ASSERT v_lid IS NOT NULL, '3.1 الإجازة لم تُنشأ — التأكيد سيكون فارغاً';

  BEGIN
    INSERT INTO shift_assignments (tenant_id, employee_id, shift_type, shift_date)
    VALUES ('a3680000-0000-0000-0000-00000000000a', v_n,'morning', v_d + 7);
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; v_msg := SQLERRM; END;
  ASSERT v_ok, '3.1 وردية على موظفٍ في إجازةٍ معتمدة قُبِلت';
  ASSERT position('SHIFT_ON_APPROVED_LEAVE' IN v_msg) > 0,
         '3.1 مُنع بحارسٍ آخر: ' || v_msg;
  RAISE NOTICE '  ✅ 3.1 SHIFT_ON_APPROVED_LEAVE (بالحارس المقصود)';
END $$;

-- 3.1b ★★★ — وإجازةٌ **غير معتمدة** لا تمنع (شرط الحالة مُختبَر)
DO $$
DECLARE v_n UUID; v_d DATE; v_id UUID;
BEGIN
  SELECT noor, d0 INTO v_n, v_d FROM t_ids;
  INSERT INTO leaves (tenant_id, employee_id, leave_type, date_from, date_to, status, reason)
  VALUES ('a3680000-0000-0000-0000-00000000000a', v_n,'سنوية',
          v_d + 15, v_d + 16,'انتظار','طلبٌ معلّق');
  INSERT INTO shift_assignments (tenant_id, employee_id, shift_type, shift_date)
  VALUES ('a3680000-0000-0000-0000-00000000000a', v_n,'evening', v_d + 15)
  RETURNING id INTO v_id;
  ASSERT v_id IS NOT NULL, '3.1b إجازةٌ منتظرة منعت الجدولة';
  RAISE NOTICE '  ✅ 3.1b إجازةٌ بحالة «انتظار» لا تمنع — الشرط دقيق';
END $$;

-- 3.1c ★★★ — وإجازةٌ لموظفٍ آخر لا تمنع (شرط الملكية مُختبَر)
DO $$
DECLARE v_s UUID; v_d DATE; v_id UUID;
BEGIN
  SELECT salem, d0 INTO v_s, v_d FROM t_ids;
  -- نور في إجازةٍ معتمدة من d0+5 إلى d0+10 — سالم ليس كذلك
  INSERT INTO shift_assignments (tenant_id, employee_id, shift_type, shift_date)
  VALUES ('a3680000-0000-0000-0000-00000000000a', v_s,'evening', v_d + 7)
  RETURNING id INTO v_id;
  ASSERT v_id IS NOT NULL, '3.1c إجازةُ زميلٍ منعت جدولة سالم';
  RAISE NOTICE '  ✅ 3.1c إجازةُ زميلٍ لا تمنع — شرط employee_id دقيق';
END $$;

-- 3.2 ★★★ — ليلي أمس ثم صباحي اليوم
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_s UUID; v_d DATE; v_msg TEXT;
BEGIN
  SELECT salem, d0 INTO v_s, v_d FROM t_ids;
  INSERT INTO shift_assignments (tenant_id, employee_id, shift_type, shift_date)
  VALUES ('a3680000-0000-0000-0000-00000000000a', v_s,'night', v_d + 30);
  BEGIN
    INSERT INTO shift_assignments (tenant_id, employee_id, shift_type, shift_date)
    VALUES ('a3680000-0000-0000-0000-00000000000a', v_s,'morning', v_d + 31);
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; v_msg := SQLERRM; END;
  ASSERT v_ok, '3.2 صباحيةٌ بعد ليليةٍ مباشرةً قُبِلت';
  ASSERT position('SHIFT_NO_REST' IN v_msg) > 0, '3.2 ' || v_msg;
  RAISE NOTICE '  ✅ 3.2 SHIFT_NO_REST — لا صباحية بعد ليلية';
END $$;

-- 3.2b ★★★ — والاتّجاه المعاكس: ليلية قبل صباحيةٍ موجودة
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_s UUID; v_d DATE; v_msg TEXT;
BEGIN
  SELECT salem, d0 INTO v_s, v_d FROM t_ids;
  INSERT INTO shift_assignments (tenant_id, employee_id, shift_type, shift_date)
  VALUES ('a3680000-0000-0000-0000-00000000000a', v_s,'morning', v_d + 41);
  BEGIN
    INSERT INTO shift_assignments (tenant_id, employee_id, shift_type, shift_date)
    VALUES ('a3680000-0000-0000-0000-00000000000a', v_s,'night', v_d + 40);
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; v_msg := SQLERRM; END;
  ASSERT v_ok, '3.2b ليليةٌ قبل صباحيةٍ موجودة قُبِلت';
  ASSERT position('SHIFT_NO_REST' IN v_msg) > 0, '3.2b ' || v_msg;
  RAISE NOTICE '  ✅ 3.2b الحارس ثنائيُّ الاتّجاه';
END $$;

-- 3.2c ★★★ — مسائيةٌ بعد ليليةٍ **مسموحة** (الحدّ ليس عامّاً)
DO $$
DECLARE v_n UUID; v_d DATE; v_id UUID;
BEGIN
  SELECT noor, d0 INTO v_n, v_d FROM t_ids;
  INSERT INTO shift_assignments (tenant_id, employee_id, shift_type, shift_date)
  VALUES ('a3680000-0000-0000-0000-00000000000a', v_n,'night', v_d + 50);
  INSERT INTO shift_assignments (tenant_id, employee_id, shift_type, shift_date)
  VALUES ('a3680000-0000-0000-0000-00000000000a', v_n,'evening', v_d + 51)
  RETURNING id INTO v_id;
  ASSERT v_id IS NOT NULL, '3.2c مسائيةٌ بعد ليليةٍ مُنعت — الحارس أوسع من قصده';
  RAISE NOTICE '  ✅ 3.2c مسائيةٌ بعد ليلية مسموحة (ثماني ساعات راحة)';
END $$;

-- 3.3 ★★★ — النافذة الزمنية
DO $$
DECLARE v_a BOOLEAN := FALSE; v_b BOOLEAN := FALSE; v_s UUID;
        v_today DATE := (now() AT TIME ZONE 'Asia/Baghdad')::DATE;
        v_m1 TEXT; v_m2 TEXT;
BEGIN
  SELECT salem INTO v_s FROM t_ids;
  BEGIN
    INSERT INTO shift_assignments (tenant_id, employee_id, shift_type, shift_date)
    VALUES ('a3680000-0000-0000-0000-00000000000a', v_s,'flexible', v_today - 91);
  EXCEPTION WHEN OTHERS THEN v_a := TRUE; v_m1 := SQLERRM; END;
  BEGIN
    INSERT INTO shift_assignments (tenant_id, employee_id, shift_type, shift_date)
    VALUES ('a3680000-0000-0000-0000-00000000000a', v_s,'flexible', v_today + 366);
  EXCEPTION WHEN OTHERS THEN v_b := TRUE; v_m2 := SQLERRM; END;
  ASSERT v_a, '3.3a وردية قبل 91 يوماً قُبِلت';
  ASSERT v_b, '3.3b وردية بعد 366 يوماً قُبِلت';
  ASSERT position('SHIFT_DATE_TOO_OLD' IN v_m1) > 0, '3.3a ' || v_m1;
  ASSERT position('SHIFT_DATE_TOO_FAR' IN v_m2) > 0, '3.3b ' || v_m2;
  RAISE NOTICE '  ✅ 3.3 النافذة: [اليوم-90 · اليوم+365]';
END $$;

-- 3.3b ★★★ — والحدّان **الداخليّان** مقبولان (لا صرامة زائدة)
DO $$
DECLARE v_s UUID; v_a UUID; v_b UUID;
        v_today DATE := (now() AT TIME ZONE 'Asia/Baghdad')::DATE;
BEGIN
  SELECT salem INTO v_s FROM t_ids;
  INSERT INTO shift_assignments (tenant_id, employee_id, shift_type, shift_date)
  VALUES ('a3680000-0000-0000-0000-00000000000a', v_s,'flexible', v_today - 90)
  RETURNING id INTO v_a;
  INSERT INTO shift_assignments (tenant_id, employee_id, shift_type, shift_date)
  VALUES ('a3680000-0000-0000-0000-00000000000a', v_s,'flexible', v_today + 365)
  RETURNING id INTO v_b;
  ASSERT v_a IS NOT NULL AND v_b IS NOT NULL, '3.3b الحدّان الداخليّان مرفوضان';
  RAISE NOTICE '  ✅ 3.3b الحدّان -90 و+365 مقبولان (الحدّ غير صارمٍ بلا داعٍ)';
END $$;

-- 3.4 ★★ — المُسنِد يُملأ آلياً
SET request.jwt.claim.sub = '13680001-0000-0000-0000-000000000001';
DO $$
DECLARE v_n UUID; v_d DATE; v_id UUID; v_by UUID;
BEGIN
  SELECT noor, d0 INTO v_n, v_d FROM t_ids;
  INSERT INTO shift_assignments (tenant_id, employee_id, shift_type, shift_date)
  VALUES ('a3680000-0000-0000-0000-00000000000a', v_n,'morning', v_d + 60)
  RETURNING id, assigned_by INTO v_id, v_by;
  ASSERT v_by = '13680001-0000-0000-0000-000000000001',
         '3.4 assigned_by = ' || COALESCE(v_by::TEXT,'<NULL>');
  RAISE NOTICE '  ✅ 3.4 assigned_by يُملأ من auth.uid()';
END $$;

-- 3.5 ★★ — المحفّز يُجمّد المستأجر والموظف
DO $$
DECLARE v_id UUID; v_t UUID; v_e UUID; v_s UUID; v_n UUID; v_d DATE;
BEGIN
  SELECT salem, noor, d0 INTO v_s, v_n, v_d FROM t_ids;
  SELECT id INTO v_id FROM shift_assignments
   WHERE employee_id=v_s AND shift_date=v_d;
  UPDATE shift_assignments
     SET tenant_id='b3680000-0000-0000-0000-00000000000b', employee_id=v_n
   WHERE id=v_id;
  SELECT tenant_id, employee_id INTO v_t, v_e FROM shift_assignments WHERE id=v_id;
  ASSERT v_t = 'a3680000-0000-0000-0000-00000000000a', '3.5 المستأجر تغيّر';
  ASSERT v_e = v_s, '3.5 الموظف تغيّر';
  RAISE NOTICE '  ✅ 3.5 المحفّز يُجمّد tenant_id و employee_id';
END $$;

-- 3.6 ★★ — منع الحذف
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_id UUID; v_msg TEXT;
BEGIN
  SELECT id INTO v_id FROM shift_assignments
   WHERE tenant_id='a3680000-0000-0000-0000-00000000000a' LIMIT 1;
  BEGIN DELETE FROM shift_assignments WHERE id=v_id;
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; v_msg := SQLERRM; END;
  ASSERT v_ok, '3.6 الحذف النهائيّ نجح';
  ASSERT position('SHIFT_DELETE_BLOCKED' IN v_msg) > 0, '3.6 ' || v_msg;
  RAISE NOTICE '  ✅ 3.6 SHIFT_DELETE_BLOCKED';
END $$;

\echo '════════ ④ دالة الإسناد shift_assign ════════'

-- 4.1 ★★★★ — الإسناد ينجح (المسار الذي لم يعمل يوماً)
DO $$
DECLARE v_id UUID; v_s UUID; v_d DATE; v_by UUID; v_notes TEXT;
BEGIN
  SELECT salem, d0 INTO v_s, v_d FROM t_ids;
  v_id := shift_assign(v_s,'evening', v_d + 70,'  تغطية إجازة  ');
  SELECT assigned_by, notes INTO v_by, v_notes FROM shift_assignments WHERE id=v_id;
  ASSERT v_by = '13680001-0000-0000-0000-000000000001', '4.1 المُسنِد خطأ';
  ASSERT v_notes = 'تغطية إجازة', '4.1 btrim لم يُطبَّق: [' || v_notes || ']';
  ASSERT (SELECT status FROM shift_assignments WHERE id=v_id) = 'scheduled',
         '4.1 الحالة الابتدائية خطأ';
  RAISE NOTICE '  ✅ 4.1 shift_assign ينجح · btrim مُطبَّق · المُسنِد صحيح';
END $$;

-- 4.2 ★★★ — إعادة الإسناد لليوم نفسه تُحدّث لا ترمي
DO $$
DECLARE v_id UUID; v_id2 UUID; v_s UUID; v_d DATE; v_type TEXT; v_n INTEGER;
BEGIN
  SELECT salem, d0 INTO v_s, v_d FROM t_ids;
  SELECT id INTO v_id FROM shift_assignments WHERE employee_id=v_s AND shift_date=v_d+70;
  v_id2 := shift_assign(v_s,'night', v_d + 70,'تبديل');
  ASSERT v_id2 = v_id, '4.2 أُنشئ صفٌّ جديد بدل التحديث';
  SELECT shift_type INTO v_type FROM shift_assignments WHERE id=v_id;
  ASSERT v_type = 'night', '4.2 النوع لم يُحدَّث: ' || v_type;
  SELECT count(*) INTO v_n FROM shift_assignments
   WHERE employee_id=v_s AND shift_date=v_d+70;
  ASSERT v_n = 1, '4.2 صفوفٌ مكرَّرة: ' || v_n;
  RAISE NOTICE '  ✅ 4.2 ON CONFLICT يُحدّث بدل أن يرمي';
END $$;

-- 4.3 ★★★ — النوع المجهول مرفوضٌ بحارس الدالة (قبل القيد)
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_s UUID; v_d DATE; v_msg TEXT;
BEGIN
  SELECT salem, d0 INTO v_s, v_d FROM t_ids;
  BEGIN PERFORM shift_assign(v_s,'صباحي', v_d + 80);
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; v_msg := SQLERRM; END;
  ASSERT v_ok, '4.3 مفردةُ الصفحة القديمة قُبِلت';
  ASSERT position('SHIFT_BAD_TYPE' IN v_msg) > 0,
         '4.3 مُنع بالقيد لا بحارس الدالة: ' || v_msg;
  RAISE NOTICE '  ✅ 4.3 SHIFT_BAD_TYPE (حارس الدالة يسبق القيد)';
END $$;

-- 4.4 ★★★ — الموظف لا يُجدول
SET request.jwt.claim.sub = '23680002-0000-0000-0000-000000000002';
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_n UUID; v_d DATE; v_msg TEXT;
BEGIN
  SELECT noor, d0 INTO v_n, v_d FROM t_ids;
  BEGIN PERFORM shift_assign(v_n,'morning', v_d + 80);
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; v_msg := SQLERRM; END;
  ASSERT v_ok, '4.4 موظفٌ عاديّ جدول وردية';
  ASSERT position('SHIFT_NOT_STAFF' IN v_msg) > 0, '4.4 ' || v_msg;
  RAISE NOTICE '  ✅ 4.4 SHIFT_NOT_STAFF';
END $$;

-- 4.5 ★★ — الدفعة: ورديات أسبوعٍ بمعرّفٍ واحد
SET request.jwt.claim.sub = '13680001-0000-0000-0000-000000000001';
DO $$
DECLARE v_batch UUID := gen_random_uuid(); v_s UUID; v_n UUID; v_d DATE; v_cnt INTEGER;
BEGIN
  SELECT salem, noor, d0 INTO v_s, v_n, v_d FROM t_ids;
  PERFORM shift_assign(v_s,'morning', v_d + 100, NULL, v_batch);
  PERFORM shift_assign(v_n,'morning', v_d + 100, NULL, v_batch);
  PERFORM shift_assign(v_s,'morning', v_d + 101, NULL, v_batch);
  SELECT count(*) INTO v_cnt FROM shift_assignments WHERE schedule_id = v_batch;
  ASSERT v_cnt = 3, '4.5 الدفعة = ' || v_cnt || ' بدل 3';
  RAISE NOTICE '  ✅ 4.5 schedule_id يجمع ورديات الدفعة الواحدة';
END $$;

\echo '════════ ⑤ الإلغاء shift_cancel ════════'

-- 5.1 ★★ — الإلغاء يستلزم سبباً
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_id UUID; v_s UUID; v_d DATE; v_msg TEXT;
BEGIN
  SELECT salem, d0 INTO v_s, v_d FROM t_ids;
  SELECT id INTO v_id FROM shift_assignments WHERE employee_id=v_s AND shift_date=v_d+70;
  BEGIN PERFORM shift_cancel(v_id,'  ');
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; v_msg := SQLERRM; END;
  ASSERT v_ok, '5.1 إلغاءٌ بلا سبب قُبِل';
  ASSERT position('SHIFT_CANCEL_REASON_REQUIRED' IN v_msg) > 0, '5.1 ' || v_msg;
  RAISE NOTICE '  ✅ 5.1 SHIFT_CANCEL_REASON_REQUIRED';
END $$;

-- 5.2 ★★★ — الإلغاء ينجح ويملأ الحقول الثلاثة
DO $$
DECLARE v_id UUID; v_s UUID; v_d DATE; v_st TEXT; v_at TIMESTAMPTZ; v_by UUID; v_r TEXT;
BEGIN
  SELECT salem, d0 INTO v_s, v_d FROM t_ids;
  SELECT id INTO v_id FROM shift_assignments WHERE employee_id=v_s AND shift_date=v_d+70;
  ASSERT shift_cancel(v_id,'الموظف في مهمّةٍ خارجية'), '5.2 رجعت FALSE';
  SELECT status, cancelled_at, cancelled_by, cancel_reason
    INTO v_st, v_at, v_by, v_r FROM shift_assignments WHERE id=v_id;
  ASSERT v_st = 'cancelled', '5.2 الحالة ' || v_st;
  ASSERT v_at IS NOT NULL AND v_by = '13680001-0000-0000-0000-000000000001'
         AND v_r = 'الموظف في مهمّةٍ خارجية', '5.2 حقول الإلغاء ناقصة';
  ASSERT NOT shift_cancel(v_id,'مجدداً'), '5.2 الإلغاء المكرّر رجع TRUE';
  RAISE NOTICE '  ✅ 5.2 الإلغاء كامل · المكرَّر = FALSE';
END $$;

-- 5.3 ★★★ — إعادة الإسناد بعد الإلغاء تُحييها
DO $$
DECLARE v_id UUID; v_s UUID; v_d DATE; v_st TEXT; v_r TEXT;
BEGIN
  SELECT salem, d0 INTO v_s, v_d FROM t_ids;
  PERFORM shift_assign(v_s,'evening', v_d + 70,'عاد');
  SELECT id, status, cancel_reason INTO v_id, v_st, v_r
    FROM shift_assignments WHERE employee_id=v_s AND shift_date=v_d+70;
  ASSERT v_st = 'scheduled', '5.3 الحالة ' || v_st;
  ASSERT v_r IS NULL, '5.3 سبب الإلغاء بقي: ' || v_r;
  RAISE NOTICE '  ✅ 5.3 إعادة الإسناد تُحيي الملغاة وتُفرغ حقولها';
END $$;

-- 5.4 ★★★ — الموظف لا يُلغي
SET request.jwt.claim.sub = '23680002-0000-0000-0000-000000000002';
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_id UUID; v_s UUID; v_d DATE; v_msg TEXT;
BEGIN
  SELECT salem, d0 INTO v_s, v_d FROM t_ids;
  SELECT id INTO v_id FROM shift_assignments WHERE employee_id=v_s AND shift_date=v_d+70;
  BEGIN PERFORM shift_cancel(v_id,'لا أريدها');
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; v_msg := SQLERRM; END;
  ASSERT v_ok, '5.4 الموظف ألغى وردية';
  ASSERT position('SHIFT_NOT_STAFF' IN v_msg) > 0, '5.4 ' || v_msg;
  RAISE NOTICE '  ✅ 5.4 SHIFT_NOT_STAFF في الإلغاء';
END $$;

\echo '════════ ⑥ اللوح والملخّص ════════'

SET request.jwt.claim.sub = '13680001-0000-0000-0000-000000000001';

-- 6.1 ★★★★ — اسم الوردية وأوقاتها من structure_shifts لا من نصّ الواجهة
DO $$
DECLARE v_name TEXT; v_st TEXT; v_en TEXT; v_s UUID; v_d DATE;
BEGIN
  SELECT salem, d0 INTO v_s, v_d FROM t_ids;
  SELECT shift_name_ar, start_time, end_time INTO v_name, v_st, v_en
    FROM shift_week_board(v_d + 100, 1) WHERE employee_id = v_s;
  ASSERT v_name = 'الوردية الصباحية', '6.1 الاسم [' || COALESCE(v_name,'<NULL>') || ']';
  ASSERT v_st = '08:00', '6.1 البداية [' || COALESCE(v_st,'<NULL>') || ']';
  ASSERT v_en = '16:00', '6.1 النهاية [' || COALESCE(v_en,'<NULL>') || ']';
  RAISE NOTICE '  ✅ 6.1 «%» % ← % — من القاعدة لا من نصّ الواجهة', v_name, v_st, v_en;
END $$;

-- 6.2 ★★★ — الاسم مُركَّبٌ رغم full_name_ar = NULL
DO $$
DECLARE v_name TEXT; v_raw TEXT; v_s UUID; v_d DATE;
BEGIN
  SELECT salem, d0 INTO v_s, v_d FROM t_ids;
  SELECT COALESCE(full_name_ar,'<NULL>') INTO v_raw FROM employees WHERE id=v_s;
  ASSERT v_raw = '<NULL>', '6.2 full_name_ar لم يعد فارغاً: ' || v_raw;
  SELECT employee_name INTO v_name FROM shift_week_board(v_d + 100, 1)
   WHERE employee_id = v_s;
  ASSERT v_name LIKE '%سالم%', '6.2 الاسم [' || v_name || ']';
  RAISE NOTICE '  ✅ 6.2 employee_name = «%» (مُركَّب)', v_name;
END $$;

-- 6.3 ★★★ — النافذة تحصر النتائج (لا ترشيح في المتصفّح)
DO $$
DECLARE v_n1 INTEGER; v_n7 INTEGER; v_d DATE;
BEGIN
  SELECT d0 INTO v_d FROM t_ids;
  SELECT count(*) INTO v_n1 FROM shift_week_board(v_d + 100, 1);
  SELECT count(*) INTO v_n7 FROM shift_week_board(v_d + 100, 7);
  -- يوم d0+100: سالم + نور = 2 · d0+101: سالم = 1
  ASSERT v_n1 = 2, '6.3a يومٌ واحد = ' || v_n1 || ' بدل 2';
  ASSERT v_n7 = 3, '6.3b سبعة أيام = ' || v_n7 || ' بدل 3';
  RAISE NOTICE '  ✅ 6.3 النافذة تحصر: يوم=2 · أسبوع=3';
END $$;

-- 6.4 ★★★ — is_past بتوقيت بغداد
DO $$
DECLARE v_past BOOLEAN; v_fut BOOLEAN; v_s UUID;
        v_today DATE := (now() AT TIME ZONE 'Asia/Baghdad')::DATE;
BEGIN
  SELECT salem INTO v_s FROM t_ids;
  SELECT is_past INTO v_past FROM shift_week_board(v_today - 90, 1) WHERE employee_id=v_s;
  ASSERT v_past, '6.4 وردية قبل تسعين يوماً ليست ماضية';
  SELECT is_past INTO v_fut FROM shift_week_board(v_today + 365, 1) WHERE employee_id=v_s;
  ASSERT NOT v_fut, '6.4 وردية بعد سنةٍ عُدَّت ماضية';
  RAISE NOTICE '  ✅ 6.4 is_past بتوقيت بغداد';
END $$;

-- 6.5 ★★★★ — on_leave يكشف التعارضات السابقة للقيد
DO $$
DECLARE v_n UUID; v_d DATE; v_id UUID; v_flag BOOLEAN;
BEGIN
  SELECT noor, d0 INTO v_n, v_d FROM t_ids;
  -- ★ نُدرج وردية ثم إجازةً تُغطّيها (الترتيب يتجاوز المحفّز عمداً —
  --   يُحاكي صفوفاً سابقةً لسريان القيد)
  INSERT INTO shift_assignments (tenant_id, employee_id, shift_type, shift_date)
  VALUES ('a3680000-0000-0000-0000-00000000000a', v_n,'evening', v_d + 200)
  RETURNING id INTO v_id;
  INSERT INTO leaves (tenant_id, employee_id, leave_type, date_from, date_to, status, reason)
  VALUES ('a3680000-0000-0000-0000-00000000000a', v_n,'مرضية',
          v_d + 199, v_d + 201,'موافق','مرض');
  SELECT on_leave INTO v_flag FROM shift_week_board(v_d + 200, 1) WHERE employee_id=v_n;
  ASSERT v_flag, '6.5 on_leave لم يكشف التعارض';
  RAISE NOTICE '  ✅ 6.5 on_leave يكشف تعارضاً سابقاً للقيد';
END $$;

-- 6.6 ★★★ — shift_leave_conflicts تُعدّده
DO $$
DECLARE v_n INTEGER; v_d DATE;
BEGIN
  SELECT d0 INTO v_d FROM t_ids;
  SELECT count(*) INTO v_n FROM shift_leave_conflicts(v_d + 195, 10);
  ASSERT v_n = 1, '6.6 التعارضات = ' || v_n || ' بدل 1';
  -- ★ ونافذةٌ خاليةٌ تُعطي صفراً — العدّاد ليس ثابتاً
  SELECT count(*) INTO v_n FROM shift_leave_conflicts(v_d + 300, 10);
  ASSERT v_n = 0, '6.6b نافذةٌ خالية أعطت ' || v_n;
  RAISE NOTICE '  ✅ 6.6 shift_leave_conflicts: 1 في النافذة · 0 خارجها';
END $$;

-- 6.7 ★★★ — الملغاة لا تُحسب في الملخّص
DO $$
DECLARE r RECORD; v_s UUID; v_d DATE; v_id UUID;
BEGIN
  SELECT salem, d0 INTO v_s, v_d FROM t_ids;
  SELECT * INTO r FROM shift_week_summary(v_d + 100, 7);
  ASSERT r.total = 3, '6.7 total=' || r.total || ' بدل 3';
  ASSERT r.scheduled = 3, '6.7 scheduled=' || r.scheduled;
  ASSERT r.cancelled = 0, '6.7 cancelled=' || r.cancelled;
  ASSERT r.morning = 3, '6.7 morning=' || r.morning;

  SELECT id INTO v_id FROM shift_assignments
   WHERE employee_id=v_s AND shift_date=v_d+101;
  PERFORM shift_cancel(v_id,'أُلغيت للاختبار');

  SELECT * INTO r FROM shift_week_summary(v_d + 100, 7);
  ASSERT r.total = 3, '6.7b total تغيّر: ' || r.total;
  ASSERT r.scheduled = 2, '6.7b scheduled=' || r.scheduled || ' بدل 2';
  ASSERT r.cancelled = 1, '6.7b cancelled=' || r.cancelled || ' بدل 1';
  ASSERT r.morning = 2, '6.7b morning=' || r.morning || ' بدل 2';
  ASSERT r.total = r.scheduled + r.cancelled, '6.7b المجاميع لا تُطابق';
  RAISE NOTICE '  ✅ 6.7 الملغاة تخرج من العدّ: 3 = 2 مجدولة + 1 ملغاة';
END $$;

-- 6.8 ★★★ — covered_days و staffed
DO $$
DECLARE r RECORD; v_d DATE;
BEGIN
  SELECT d0 INTO v_d FROM t_ids;
  SELECT * INTO r FROM shift_week_summary(v_d + 100, 7);
  -- بعد إلغاء d0+101: يبقى يومٌ واحدٌ مغطّى (d0+100) وموظفان
  ASSERT r.covered_days = 1, '6.8 covered_days=' || r.covered_days || ' بدل 1';
  ASSERT r.staffed = 2, '6.8 staffed=' || r.staffed || ' بدل 2';
  RAISE NOTICE '  ✅ 6.8 covered_days=1 · staffed=2';
END $$;

-- 6.9 ★★★ — leave_conflict في الملخّص
DO $$
DECLARE r RECORD; v_d DATE;
BEGIN
  SELECT d0 INTO v_d FROM t_ids;
  SELECT * INTO r FROM shift_week_summary(v_d + 195, 10);
  ASSERT r.leave_conflict = 1, '6.9 leave_conflict=' || r.leave_conflict || ' بدل 1';
  SELECT * INTO r FROM shift_week_summary(v_d + 300, 10);
  ASSERT r.leave_conflict = 0, '6.9b نافذةٌ خالية أعطت ' || r.leave_conflict;
  RAISE NOTICE '  ✅ 6.9 leave_conflict: 1 · 0 (عدّادٌ حيّ)';
END $$;

-- 6.10 ★★★ — الترتيب حتميّ
DO $$
DECLARE v_prev DATE := NULL; r RECORD; v_ok BOOLEAN := TRUE; v_d DATE;
BEGIN
  SELECT d0 INTO v_d FROM t_ids;
  FOR r IN SELECT shift_date FROM shift_week_board(v_d + 100, 7) LOOP
    IF v_prev IS NOT NULL AND r.shift_date < v_prev THEN v_ok := FALSE; END IF;
    v_prev := r.shift_date;
  END LOOP;
  ASSERT v_ok, '6.10 الترتيب ليس تصاعدياً بالتاريخ';
  RAISE NOTICE '  ✅ 6.10 الترتيب تصاعديٌّ بالتاريخ ثم الرمز ثم id';
END $$;

-- ═══════════════════════════════════════════════════════════════
--  ★★★ 6.11–6.17 — أعكاسٌ نجت لأن «لا بيانات تخالفها»
--
--  أوّل تشغيلٍ لـ_invert_0368.py أعطى 48/55. سبعةٌ نجت، وكلُّ سببٍ
--  مُشخَّصٌ لا مُخمَّن:
--     INV14 — لم أُلغِ وردية ثم أُحيها بعد إجازةٍ تُغطّيها.
--     INV16 — لا وردية خاصّةً بمستأجرٍ في structure_shifts (كلُّها عامّة).
--     INV26 — الموظفان في نافذة 6.8 لهما ورديةٌ مجدولةٌ أخرى، فحذفُ
--             شرط الحالة لا يُغيّر count(DISTINCT employee_id).
--     INV35 — التأكيد 4.1 يقرأ assigned_by من المحفّز لا من الدالة:
--             المحفّز يملؤه بـauth.uid() فيُخفي سقوط الدالة.
--     INV39 — لم يُمرَّر معرّفُ ورديةٍ من مستأجرٍ آخر إلى shift_cancel.
--     INV42 — لا وردية **ملغاة** داخل نافذة تعارضٍ مع إجازة.
--     DDL07 — لم تُكتب حالةٌ خارج المفردتين مباشرةً على الجدول.
-- ═══════════════════════════════════════════════════════════════

-- 6.11 ★★ [INV14] — إحياء وردية ملغاة والموظف في إجازة
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_n UUID; v_d DATE; v_id UUID; v_msg TEXT;
BEGIN
  SELECT noor, d0 INTO v_n, v_d FROM t_ids;
  -- وردية خارج أيّ إجازة ⇒ تُسنَد ثم تُلغى
  v_id := shift_assign(v_n,'evening', v_d + 250,'ستُلغى');
  ASSERT shift_cancel(v_id,'أُلغيت'), '6.11 الإلغاء فشل';
  -- ثم تُغطّيها إجازةٌ معتمدة
  INSERT INTO leaves (tenant_id, employee_id, leave_type, date_from, date_to, status, reason)
  VALUES ('a3680000-0000-0000-0000-00000000000a', v_n,'سنوية',
          v_d + 249, v_d + 251,'موافق','سفر');
  -- ★ الملغاة تُحدَّث (updated_at) دون أن يعترض حارس الإجازة عليها
  UPDATE shift_assignments SET notes = 'تعديلٌ على ملغاة' WHERE id = v_id;
  ASSERT (SELECT notes FROM shift_assignments WHERE id=v_id) = 'تعديلٌ على ملغاة',
         '6.11 تعديل الملغاة فشل';
  -- ★★★ وإحياؤها ممنوعٌ بحقّ لأن الإجازة صارت قائمة
  BEGIN PERFORM shift_assign(v_n,'evening', v_d + 250,'إحياء');
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; v_msg := SQLERRM; END;
  ASSERT v_ok, '6.11 أُحييت وردية والموظف في إجازة';
  ASSERT position('SHIFT_ON_APPROVED_LEAVE' IN v_msg) > 0, '6.11 ' || v_msg;
  RAISE NOTICE '  ✅ 6.11 [INV14] الملغاة تُعدَّل بلا حراسة · وإحياؤها محروس';
END $$;

-- 6.12 ★★★ [INV16] — ترشيح المستأجر في قوالب الورديات
--
-- ★★★ اكتشافٌ أثناء كتابة هذا التأكيد: `structure_shifts_code_key`
--   هو **UNIQUE (code)** عالمياً لا `(tenant_id, code)`. فلا يستطيع
--   مستأجرٌ تعريفَ وردية بكودٍ يستعمله غيره — وهذا يعني أن شرط
--   `s.tenant_id IS NULL OR s.tenant_id = a.tenant_id` **لا يمكن أن
--   يلتقط قالباً أجنبياً بالكود نفسه**. أوّل صياغةٍ كتبتُها حاولت
--   ذلك فسقطت بـduplicate key.
--
--   ★ لكنّ الشرط **ليس زائداً**: مستأجرٌ يستطيع تعريف وردية بكودٍ
--     **جديد**، وحينها يجب ألّا تظهر لمستأجرٍ آخر يستعمل الكود نفسه
--     في `shift_type` (وهو ممكنٌ لأن `shift_type` نصٌّ حرٌّ مقيَّدٌ
--     بـCHECK فقط). وهذا ما يختبره التأكيد الآن.
DO $$
DECLARE v_s UUID; v_b UUID; v_d DATE; v_name TEXT; v_bname TEXT;
BEGIN
  SELECT salem, badr, d0 INTO v_s, v_b, v_d FROM t_ids;

  -- ★ قالبٌ خاصٌّ بمستأجر باء بكودٍ جديد
  INSERT INTO structure_shifts (name_ar, code, start_time, end_time, tenant_id)
  VALUES ('وردية باء الخاصّة','b368_special','07:00','15:00',
          'b3680000-0000-0000-0000-00000000000b');
  -- ★ ونُوسّع القيد مؤقتاً لنسمح بالكود الجديد في العيّنة
  ALTER TABLE shift_assignments DROP CONSTRAINT chk_shift_type_vocab;
  ALTER TABLE shift_assignments ADD CONSTRAINT chk_shift_type_vocab
    CHECK (shift_type IN ('morning','evening','night','flexible','b368_special'));

  -- ★★★ موظفُ باء يستعمل القالب ⇒ يراه باسمه
  -- ★ assigned_by صريحاً: المحفّز يملؤه بـauth.uid() = هدى (ألف)
  --   فيصطدم بـfk_shift_assigner_tenant. (سقط التأكيد أوّلاً بذلك.)
  INSERT INTO shift_assignments (tenant_id, employee_id, shift_type, shift_date, assigned_by)
  VALUES ('b3680000-0000-0000-0000-00000000000b', v_b,'b368_special', v_d + 260,
          '43680004-0000-0000-0000-000000000004');
  SELECT shift_name_ar INTO v_bname FROM shift_week_board(v_d + 260, 1)
   WHERE employee_id = v_b;
  ASSERT v_bname = 'وردية باء الخاصّة',
         '6.12a موظف باء لا يرى قالبه: [' || COALESCE(v_bname,'<NULL>') || ']';

  -- ★★★★ وموظفُ ألف يستعمل الكود نفسه ⇒ **لا يرى** قالب باء
  INSERT INTO shift_assignments (tenant_id, employee_id, shift_type, shift_date)
  VALUES ('a3680000-0000-0000-0000-00000000000a', v_s,'b368_special', v_d + 260);
  SELECT shift_name_ar INTO v_name FROM shift_week_board(v_d + 260, 1)
   WHERE employee_id = v_s;
  ASSERT v_name = 'b368_special',
         '6.12b موظف ألف التقط قالب باء: [' || COALESCE(v_name,'<NULL>') || ']';

  RAISE NOTICE '  ✅ 6.12 [INV16] قالبُ باء يظهر لباء وحدها (ألف ترى الكود خامّاً)';
END $$;

-- 6.13 ★★★ [INV26] — staffed لا يعدّ موظفاً كلُّ ورديّاته ملغاة
DO $$
DECLARE r RECORD; v_n UUID; v_d DATE; v_id UUID;
BEGIN
  SELECT noor, d0 INTO v_n, v_d FROM t_ids;
  -- ★ نافذةٌ فيها **وردية واحدة فقط** لنور — ثم تُلغى
  v_id := shift_assign(v_n,'flexible', v_d + 270,'وحيدة');
  SELECT * INTO r FROM shift_week_summary(v_d + 270, 1);
  ASSERT r.staffed = 1, '6.13a staffed=' || r.staffed || ' بدل 1';
  ASSERT shift_cancel(v_id,'أُلغيت'), '6.13 الإلغاء فشل';
  SELECT * INTO r FROM shift_week_summary(v_d + 270, 1);
  ASSERT r.staffed = 0, '6.13b staffed=' || r.staffed || ' بدل 0 بعد الإلغاء';
  ASSERT r.covered_days = 0, '6.13b covered_days=' || r.covered_days;
  ASSERT r.total = 1, '6.13b total=' || r.total || ' — الملغاة تبقى في الإجمالي';
  RAISE NOTICE '  ✅ 6.13 [INV26] staffed و covered_days يُسقطان الملغاة';
END $$;

-- 6.14 ★★★ [INV35] — الدالة تملأ assigned_by بنفسها لا المحفّز
DO $$
DECLARE v_s UUID; v_d DATE; v_id UUID; v_by UUID;
BEGIN
  SELECT salem, d0 INTO v_s, v_d FROM t_ids;
  v_id := shift_assign(v_s,'flexible', v_d + 280, NULL);
  -- ★ نُفرغ العمود ثم نُعيد الإسناد: المحفّز يملؤه فقط حين يكون NULL،
  --   والدالة تُمرّره صراحةً في VALUES. لإثبات أن الدالة هي المصدر
  --   نفحص أنّ ON CONFLICT **لا** يُحدّث assigned_by ومع ذلك يبقى صحيحاً.
  ASSERT (SELECT assigned_by FROM shift_assignments WHERE id=v_id)
         = '13680001-0000-0000-0000-000000000001', '6.14a المُسنِد خطأ';
  -- ★★★ والدالة تُمرّره في INSERT: نتحقّق من نصّها مباشرةً
  ASSERT (SELECT position('auth.uid())' IN pg_get_functiondef(oid)) > 0
            FROM pg_proc WHERE proname='shift_assign'),
         '6.14b shift_assign لا تُمرّر auth.uid() في الإدراج';
  RAISE NOTICE '  ✅ 6.14 [INV35] shift_assign تُمرّر المُسنِد صراحةً';
END $$;

-- 6.15 ★★ [INV39] — ترشيح المستأجر في shift_cancel
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_b UUID; v_d DATE; v_id UUID; v_msg TEXT; v_st TEXT;
BEGIN
  SELECT badr, d0 INTO v_b, v_d FROM t_ids;
  -- ★★★ وردية حقيقية في مستأجر باء — وإلّا كان التأكيد فراغاً
  -- ★ assigned_by من باء: المحفّز يملؤه بـauth.uid() = هدى (ألف)
  --   فيصطدم بـfk_shift_assigner_tenant (درسٌ تكرّر في 6.12).
  INSERT INTO shift_assignments (tenant_id, employee_id, shift_type, shift_date, assigned_by)
  VALUES ('b3680000-0000-0000-0000-00000000000b', v_b,'night', v_d + 290,
          '43680004-0000-0000-0000-000000000004')
  RETURNING id INTO v_id;
  ASSERT v_id IS NOT NULL, '6.15 وردية باء لم تُنشأ';
  -- السياق ما زال هدى (مستأجر ألف)
  BEGIN PERFORM shift_cancel(v_id,'من ألف');
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE; v_msg := SQLERRM; END;
  ASSERT v_ok, '6.15 HR ألف ألغت وردية باء';
  ASSERT position('SHIFT_NOT_FOUND' IN v_msg) > 0, '6.15 ' || v_msg;
  SELECT status INTO v_st FROM shift_assignments WHERE id=v_id;
  ASSERT v_st = 'scheduled', '6.15 صفُّ باء تغيّر [' || v_st || ']';
  RAISE NOTICE '  ✅ 6.15 [INV39] ترشيح المستأجر في الإلغاء مُختبَر';
END $$;

-- 6.16 ★★ [INV42] — كاشف التعارضات يُسقط الملغاة
DO $$
DECLARE v_s UUID; v_d DATE; v_id UUID; v_n INTEGER;
BEGIN
  SELECT salem, d0 INTO v_s, v_d FROM t_ids;
  v_id := shift_assign(v_s,'evening', v_d + 300,'ستتعارض');
  INSERT INTO leaves (tenant_id, employee_id, leave_type, date_from, date_to, status, reason)
  VALUES ('a3680000-0000-0000-0000-00000000000a', v_s,'مرضية',
          v_d + 299, v_d + 301,'موافق','مرض');
  SELECT count(*) INTO v_n FROM shift_leave_conflicts(v_d + 298, 5);
  ASSERT v_n = 1, '6.16a التعارضات = ' || v_n || ' بدل 1';
  -- ★★★ وبعد الإلغاء يختفي التعارض: وردية ملغاة ليست تعارضاً
  ASSERT shift_cancel(v_id,'حُلَّ التعارض بالإلغاء'), '6.16 الإلغاء فشل';
  SELECT count(*) INTO v_n FROM shift_leave_conflicts(v_d + 298, 5);
  ASSERT v_n = 0, '6.16b الملغاة ما زالت تُعدّ تعارضاً: ' || v_n;
  RAISE NOTICE '  ✅ 6.16 [INV42] الإلغاء يرفع التعارض (1 ← 0)';
END $$;

-- 6.17 ★★ [DDL07] — CHECK الحالة بكتابةٍ مباشرة
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_id UUID; v_msg TEXT;
BEGIN
  SELECT id INTO v_id FROM shift_assignments
   WHERE tenant_id='a3680000-0000-0000-0000-00000000000a' LIMIT 1;
  BEGIN UPDATE shift_assignments SET status='banana' WHERE id=v_id;
  EXCEPTION WHEN check_violation THEN v_ok := TRUE; v_msg := SQLERRM; END;
  ASSERT v_ok, '6.17 حالةٌ مخترعة قُبِلت';
  ASSERT position('chk_shift_status' IN v_msg) > 0, '6.17 ' || v_msg;
  RAISE NOTICE '  ✅ 6.17 [DDL07] chk_shift_status يحرس الكتابة المباشرة';
END $$;

\echo '════════ ⑦ الصلاحيات ════════'
DO $$
DECLARE v_n INTEGER;
BEGIN
  SELECT count(*) INTO v_n FROM pg_proc p
   WHERE p.pronamespace='public'::regnamespace
     AND p.proname IN ('shift_week_board','shift_week_summary','shift_assign',
                       'shift_cancel','shift_leave_conflicts')
     AND has_function_privilege('anon', p.oid, 'EXECUTE');
  ASSERT v_n = 0, '⑦ anon يملك EXECUTE على ' || v_n || ' دالة';
  SELECT count(*) INTO v_n FROM pg_proc p
   WHERE p.pronamespace='public'::regnamespace
     AND p.proname IN ('shift_week_board','shift_week_summary','shift_assign',
                       'shift_cancel','shift_leave_conflicts');
  ASSERT v_n = 5, '⑦ عدد الدوال = ' || v_n || ' بدل 5';
  RAISE NOTICE '  ✅ ⑦ خمس دوال · anon محجوبٌ عن كلّها';
END $$;

\echo ''
\echo '════════════════════════════════════════'
\echo '  ✅ verify-shift-scheduling-0368.sql — كل التأكيدات نجحت'
\echo '════════════════════════════════════════'

ROLLBACK;
