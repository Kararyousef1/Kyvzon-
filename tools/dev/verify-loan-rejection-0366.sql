-- ════════════════════════════════════════════════════════════════════════
--  verify-loan-rejection-0366.sql — سبب رفض القرض عبر صندوق الموافقات
--
--  البند المعلَّق منذ 0363 وقد صار مُثبتاً ثم مُصلحاً.
--
--  psql -h /home/user/.pgtest/sock -p 5501 -U postgres -f tools/dev/verify-loan-rejection-0366.sql
-- ════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on
\pset pager off
\t on

BEGIN;

-- ══════════════════════ العيّنة ══════════════════════
INSERT INTO tenants (id, name, name_ar, slug) VALUES
  ('a3660000-0000-0000-0000-00000000000a','A','شركة ألف','a366-loan');
INSERT INTO auth.users (id, email) VALUES
  ('13660001-0000-0000-0000-000000000001','mgr@a366'),
  ('23660002-0000-0000-0000-000000000002','salem@a366'),
  ('33660003-0000-0000-0000-000000000003','noor@a366');
INSERT INTO profiles (id, tenant_id, full_name, role, department) VALUES
  ('13660001-0000-0000-0000-000000000001','a3660000-0000-0000-0000-00000000000a','منير المدير','manager','المالية');
INSERT INTO departments (tenant_id, name_ar, manager_id) VALUES
  ('a3660000-0000-0000-0000-00000000000a','المالية','13660001-0000-0000-0000-000000000001');
INSERT INTO profiles (id, tenant_id, full_name, role, department) VALUES
  ('23660002-0000-0000-0000-000000000002','a3660000-0000-0000-0000-00000000000a','سالم','employee','المالية'),
  ('33660003-0000-0000-0000-000000000003','a3660000-0000-0000-0000-00000000000a','نور','employee','المالية');

CREATE TEMP TABLE t_ids AS
SELECT
  (SELECT id FROM employees WHERE user_id='23660002-0000-0000-0000-000000000002') AS salem,
  (SELECT id FROM employees WHERE user_id='33660003-0000-0000-0000-000000000003') AS noor;

\echo '════════ ① العطل الأصليّ: الرفض عبر الصندوق يحفظ تعليله ════════'

-- 1.1 ★★★ — المسار الكامل: قرض ⇒ طلب اعتماد ⇒ رفضٌ بتعليل
DO $$
DECLARE v_loan UUID; v_req UUID; v_emp UUID; v_reason TEXT; v_status TEXT;
BEGIN
  SELECT salem INTO v_emp FROM t_ids;
  ASSERT v_emp IS NOT NULL, '1.1 صفّ الموظف لم يُنشأ';

  INSERT INTO employee_loans (tenant_id, employee_id, amount, months_count,
                              start_date, status, purpose)
  VALUES ('a3660000-0000-0000-0000-00000000000a', v_emp, 1000000, 10,
          CURRENT_DATE, 'pending', 'شراء سيارة')
  RETURNING id INTO v_loan;

  PERFORM set_config('request.jwt.claim.sub','23660002-0000-0000-0000-000000000002',FALSE);
  v_req := create_hr_approval('loan', v_loan, v_emp);
  ASSERT v_req IS NOT NULL, '1.1 طلب الاعتماد لم يُنشأ';

  -- ★ العيّنة يجب أن تحوي خطوةً فعلاً وإلّا كان التأكيد فراغاً
  ASSERT (SELECT count(*) FROM hr_approval_steps WHERE request_id = v_req) > 0,
         '1.1 صفر خطوة — الاختبار لن يقيس شيئاً';

  PERFORM set_config('request.jwt.claim.sub','13660001-0000-0000-0000-000000000001',FALSE);
  PERFORM decide_hr_approval_step(v_req, 'rejected', 'الراتب لا يحتمل هذا القسط');

  SELECT status, rejection_reason INTO v_status, v_reason
    FROM employee_loans WHERE id = v_loan;

  ASSERT v_status = 'rejected', '1.1 الحالة ' || v_status;
  -- ★★★ هذا هو العطل بعينه: كان NULL
  ASSERT v_reason = 'الراتب لا يحتمل هذا القسط',
         '1.1 التعليل ضاع أو تشوّه: [' || COALESCE(v_reason,'<NULL>') || ']';
  RAISE NOTICE '  ✅ 1.1 الرفض عبر الصندوق يحفظ تعليله (كان NULL قبل 0366)';
END $$;

-- 1.2 ★★★ — رفضٌ **بلا** تعليق: نصٌّ صريحٌ يكشف نفسه لا NULL
DO $$
DECLARE v_loan UUID; v_req UUID; v_emp UUID; v_reason TEXT;
BEGIN
  SELECT noor INTO v_emp FROM t_ids;
  INSERT INTO employee_loans (tenant_id, employee_id, amount, months_count,
                              start_date, status, purpose)
  VALUES ('a3660000-0000-0000-0000-00000000000a', v_emp, 500000, 5,
          CURRENT_DATE, 'pending', 'علاج')
  RETURNING id INTO v_loan;

  PERFORM set_config('request.jwt.claim.sub','33660003-0000-0000-0000-000000000003',FALSE);
  v_req := create_hr_approval('loan', v_loan, v_emp);
  PERFORM set_config('request.jwt.claim.sub','13660001-0000-0000-0000-000000000001',FALSE);
  PERFORM decide_hr_approval_step(v_req, 'rejected', NULL);

  SELECT rejection_reason INTO v_reason FROM employee_loans WHERE id = v_loan;
  ASSERT v_reason = 'رُفض عبر صندوق الموافقات بلا تعليق',
         '1.2 الاحتياطيّ لم يُطبَّق: [' || COALESCE(v_reason,'<NULL>') || ']';
  RAISE NOTICE '  ✅ 1.2 رفضٌ بلا تعليق ⇒ نصٌّ يكشف نفسه لا NULL';
END $$;

\echo '════════ ② القيد — الذي كان غيابُه سببَ استتار العطل ════════'

-- 2.1 ★★★ — كتابةٌ مباشرة بلا سبب مرفوضة
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_emp UUID; v_loan UUID; v_msg TEXT;
BEGIN
  SELECT salem INTO v_emp FROM t_ids;
  INSERT INTO employee_loans (tenant_id, employee_id, amount, months_count,
                              start_date, status, purpose)
  VALUES ('a3660000-0000-0000-0000-00000000000a', v_emp, 300000, 3,
          CURRENT_DATE, 'pending', 'قرضٌ للاختبار')
  RETURNING id INTO v_loan;

  -- ★ لا طلب اعتمادٍ لهذا القرض ⇒ المحفّز لا يجد ما يملأ به ⇒ القيد يحرس
  BEGIN
    UPDATE employee_loans SET status = 'rejected' WHERE id = v_loan;
  EXCEPTION WHEN check_violation THEN v_ok := TRUE; v_msg := SQLERRM; END;

  ASSERT v_ok, '2.1 رفضٌ بلا سببٍ ولا سلسلةِ اعتمادٍ قُبِل';
  ASSERT position('chk_employee_loans_rejection_reason' IN v_msg) > 0,
         '2.1 مُنع بقيدٍ آخر: ' || v_msg;
  RAISE NOTICE '  ✅ 2.1 chk_employee_loans_rejection_reason يحرس الكتابة المباشرة';
END $$;

-- 2.2 ★ — وكتابةٌ مباشرة **بسبب** مقبولة
DO $$
DECLARE v_emp UUID; v_loan UUID; v_r TEXT;
BEGIN
  SELECT salem INTO v_emp FROM t_ids;
  INSERT INTO employee_loans (tenant_id, employee_id, amount, months_count,
                              start_date, status, purpose)
  VALUES ('a3660000-0000-0000-0000-00000000000a', v_emp, 200000, 2,
          CURRENT_DATE, 'pending', 'قرضٌ ثانٍ')
  RETURNING id INTO v_loan;

  UPDATE employee_loans
     SET status = 'rejected', rejection_reason = 'سببٌ صريحٌ من الواجهة'
   WHERE id = v_loan;

  SELECT rejection_reason INTO v_r FROM employee_loans WHERE id = v_loan;
  ASSERT v_r = 'سببٌ صريحٌ من الواجهة',
         '2.2 المحفّز دهس السبب الصريح: [' || v_r || ']';
  RAISE NOTICE '  ✅ 2.2 المحفّز لا يدهس سبباً صريحاً موجوداً';
END $$;

-- 2.3 ★ — مسافاتٌ فقط لا تُرضي القيد
DO $$
DECLARE v_ok BOOLEAN := FALSE; v_emp UUID; v_loan UUID; v_msg TEXT;
BEGIN
  SELECT noor INTO v_emp FROM t_ids;
  INSERT INTO employee_loans (tenant_id, employee_id, amount, months_count,
                              start_date, status, purpose)
  VALUES ('a3660000-0000-0000-0000-00000000000a', v_emp, 100000, 1,
          CURRENT_DATE, 'pending', 'قرضٌ ثالث')
  RETURNING id INTO v_loan;

  BEGIN
    UPDATE employee_loans SET status = 'rejected', rejection_reason = '   '
     WHERE id = v_loan;
  EXCEPTION WHEN check_violation THEN v_ok := TRUE; v_msg := SQLERRM; END;

  ASSERT v_ok, '2.3 سببٌ من مسافات قُبِل';
  ASSERT position('chk_employee_loans_rejection_reason' IN v_msg) > 0, '2.3 ' || v_msg;
  RAISE NOTICE '  ✅ 2.3 btrim محروس في القيد';
END $$;

-- ═══════════════════════════════════════════════════════════════
--  ★★★ 2.4–2.8 — أعكاسٌ نجت لأن «لا بيانات تخالفها»
--
--  أوّل تشغيلٍ لـ_invert_0366.py أعطى 5/10. خمسةٌ نجت:
--     INV02 (ترشيح request_type) · INV03 (ترشيح المستأجر)
--     INV04 (حارس «لا تدهس سبباً موجوداً»)
--     INV06 (شرط «تعليقٌ غير فارغ») · INV07 (شرط «خطوةٌ رافضة»)
--
--  والسبب في كلٍّ منها **مُشخَّصٌ لا مُخمَّن**:
--    · INV04 نجا رغم أن التأكيد 2.2 كُتب له خصّيصاً — لأن قرضَ 2.2
--      **بلا سلسلة اعتمادٍ أصلاً** ⇒ `v_req IS NULL` ⇒ المحفّز لا
--      يكتب شيئاً حتى لو سقط الحارس. تأكيدٌ يبدو مُغطّياً وهو فارغ.
--    · INV02/03/06/07 نجت لأن العيّنة فيها **طلبٌ واحدٌ من نوعٍ واحد
--      في مستأجرٍ واحد بخطوةٍ رافضةٍ واحدةٍ ذات تعليق** — فأيُّ شرطٍ
--      نُسقطه يُصيب الصفّ نفسه.
--
--  العلاج: بياناتٌ تخالف كل شرطٍ على حدة.
-- ═══════════════════════════════════════════════════════════════

-- 2.4 ★★★ [INV04] — قرضٌ **له سلسلةُ اعتماد** ومعه سببٌ صريح:
--     الحارس هو ما يمنع دهسه بتعليق الخطوة.
DO $$
DECLARE v_loan UUID; v_req UUID; v_emp UUID; v_r TEXT;
BEGIN
  SELECT salem INTO v_emp FROM t_ids;
  INSERT INTO employee_loans (tenant_id, employee_id, amount, months_count,
                              start_date, status, purpose)
  VALUES ('a3660000-0000-0000-0000-00000000000a', v_emp, 700000, 7,
          CURRENT_DATE, 'pending', 'قرضٌ بسلسلةٍ وسببٍ صريح')
  RETURNING id INTO v_loan;

  PERFORM set_config('request.jwt.claim.sub','23660002-0000-0000-0000-000000000002',FALSE);
  v_req := create_hr_approval('loan', v_loan, v_emp);
  PERFORM set_config('request.jwt.claim.sub','13660001-0000-0000-0000-000000000001',FALSE);
  PERFORM decide_hr_approval_step(v_req, 'rejected', 'تعليقُ الخطوة');

  -- ★★★ المحفّز `BEFORE INSERT OR UPDATE **OF status**`: تحديثٌ يمسّ
  --   `rejection_reason` وحده **لا يُشغّله** — ولهذا نجا INV04 في أول
  --   تشغيلٍ للعكس رغم كتابة هذا التأكيد له خصّيصاً. مُثبَتٌ من
  --   `pg_get_triggerdef`. ⇒ نُعيد كتابة `status` معه ليُشغَّل فعلاً.
  UPDATE employee_loans
     SET rejection_reason = 'سببٌ صريحٌ يجب ألّا يُدهَس',
         status = 'rejected'
   WHERE id = v_loan;

  SELECT rejection_reason INTO v_r FROM employee_loans WHERE id = v_loan;
  ASSERT v_r = 'سببٌ صريحٌ يجب ألّا يُدهَس',
         '2.4 المحفّز دهس السبب الصريح بتعليق الخطوة: [' || v_r || ']';
  RAISE NOTICE '  ✅ 2.4 [INV04] الحارس يمنع الدهس **والمحفّز مُشغَّلٌ فعلاً**';
END $$;

-- 2.5 ★★★ [INV02] — طلبٌ من نوعٍ آخر (leave) بالمعرّف نفسه:
--     ترشيح request_type هو ما يمنع التقاط تعليقه.
DO $$
DECLARE v_loan UUID; v_req_loan UUID; v_req_leave UUID; v_emp UUID; v_r TEXT;
BEGIN
  SELECT noor INTO v_emp FROM t_ids;
  INSERT INTO employee_loans (tenant_id, employee_id, amount, months_count,
                              start_date, status, purpose)
  VALUES ('a3660000-0000-0000-0000-00000000000a', v_emp, 800000, 8,
          CURRENT_DATE, 'pending', 'قرضٌ بطلبَين')
  RETURNING id INTO v_loan;

  -- ★★★ طلبُ إجازةٍ يشير إلى **معرّف القرض نفسه** (related_id بلا FK)
  --   وأحدثُ من طلب القرض ⇒ ORDER BY created_at DESC يلتقطه أولاً
  --   لو سقط ترشيح request_type.
  PERFORM set_config('request.jwt.claim.sub','33660003-0000-0000-0000-000000000003',FALSE);
  v_req_loan := create_hr_approval('loan', v_loan, v_emp);
  PERFORM set_config('request.jwt.claim.sub','13660001-0000-0000-0000-000000000001',FALSE);
  PERFORM decide_hr_approval_step(v_req_loan, 'rejected', 'تعليلُ القرض الصحيح');

  -- ★ الطلب المُشوِّش يُدرَج مباشرةً بطابعٍ أحدث
  INSERT INTO hr_approval_requests (tenant_id, request_type, related_id,
                                    employee_id, department_id, created_at)
  VALUES ('a3660000-0000-0000-0000-00000000000a','leave', v_loan, v_emp,
          (SELECT department_id FROM employees WHERE id = v_emp),
          now() + INTERVAL '1 hour')
  RETURNING id INTO v_req_leave;
  INSERT INTO hr_approval_steps (request_id, tenant_id, step_order,
                                 approver_role, approver_id, status,
                                 comments, decided_at)
  VALUES (v_req_leave,'a3660000-0000-0000-0000-00000000000a',1,'manager',
          '13660001-0000-0000-0000-000000000001','rejected',
          'تعليلُ إجازةٍ لا علاقة له بالقرض', now() + INTERVAL '1 hour');

  -- ★ نُفرغ السبب ثم نُعيد الرفض ليُشغَّل المحفّز من جديد
  UPDATE employee_loans SET rejection_reason = NULL, status = 'pending'
   WHERE id = v_loan;
  UPDATE employee_loans SET status = 'rejected' WHERE id = v_loan;

  SELECT rejection_reason INTO v_r FROM employee_loans WHERE id = v_loan;
  ASSERT v_r = 'تعليلُ القرض الصحيح',
         '2.5 التقط تعليل طلبٍ من نوعٍ آخر: [' || v_r || ']';
  RAISE NOTICE '  ✅ 2.5 [INV02] ترشيح request_type مُختبَرٌ بطلبٍ مُشوِّشٍ حقيقيّ';
END $$;

-- 2.6 ★★★ [INV03] — طلبُ قرضٍ في **مستأجرٍ آخر** بالمعرّف نفسه
DO $$
DECLARE v_loan UUID; v_req UUID; v_emp UUID; v_r TEXT; v_other UUID;
BEGIN
  -- مستأجرٌ ثانٍ بموظفٍ حقيقيّ
  INSERT INTO tenants (id, name, name_ar, slug) VALUES
    ('b3660000-0000-0000-0000-00000000000b','B','شركة باء','b366-loan');
  INSERT INTO auth.users (id, email) VALUES
    ('43660004-0000-0000-0000-000000000004','badr@b366');
  INSERT INTO profiles (id, tenant_id, full_name, role, department) VALUES
    ('43660004-0000-0000-0000-000000000004','b3660000-0000-0000-0000-00000000000b',
     'بدر','employee','الإنتاج');
  SELECT id INTO v_other FROM employees
   WHERE user_id='43660004-0000-0000-0000-000000000004';
  ASSERT v_other IS NOT NULL, '2.6 موظف باء لم يُنشأ — التأكيد سيكون فارغاً';

  SELECT salem INTO v_emp FROM t_ids;
  INSERT INTO employee_loans (tenant_id, employee_id, amount, months_count,
                              start_date, status, purpose)
  VALUES ('a3660000-0000-0000-0000-00000000000a', v_emp, 900000, 9,
          CURRENT_DATE, 'pending', 'قرضٌ بمستأجرَين')
  RETURNING id INTO v_loan;

  PERFORM set_config('request.jwt.claim.sub','23660002-0000-0000-0000-000000000002',FALSE);
  v_req := create_hr_approval('loan', v_loan, v_emp);
  PERFORM set_config('request.jwt.claim.sub','13660001-0000-0000-0000-000000000001',FALSE);
  PERFORM decide_hr_approval_step(v_req, 'rejected', 'تعليلُ مستأجر ألف');

  -- ★★★ طلبُ قرضٍ في باء يشير إلى المعرّف نفسه وأحدثُ طابعاً
  INSERT INTO hr_approval_requests (tenant_id, request_type, related_id,
                                    employee_id, created_at)
  VALUES ('b3660000-0000-0000-0000-00000000000b','loan', v_loan, v_other,
          now() + INTERVAL '2 hours');
  INSERT INTO hr_approval_steps (request_id, tenant_id, step_order,
                                 approver_role, approver_id, status,
                                 comments, decided_at)
  SELECT r.id,'b3660000-0000-0000-0000-00000000000b',1,'manager',
         '13660001-0000-0000-0000-000000000001','rejected',
         'تعليلُ مستأجرٍ أجنبيّ', now() + INTERVAL '2 hours'
    FROM hr_approval_requests r
   WHERE r.tenant_id='b3660000-0000-0000-0000-00000000000b'
     AND r.related_id = v_loan;

  UPDATE employee_loans SET rejection_reason = NULL, status = 'pending'
   WHERE id = v_loan;
  UPDATE employee_loans SET status = 'rejected' WHERE id = v_loan;

  SELECT rejection_reason INTO v_r FROM employee_loans WHERE id = v_loan;
  ASSERT v_r = 'تعليلُ مستأجر ألف',
         '2.6 التقط تعليل مستأجرٍ أجنبيّ: [' || v_r || ']';
  RAISE NOTICE '  ✅ 2.6 [INV03] ترشيح المستأجر مُختبَرٌ بصفٍّ أجنبيٍّ حقيقيّ';
END $$;

-- 2.7 ★★★ [INV06] — خطوةٌ رافضةٌ **أحدث** بتعليقٍ معدوم
DO $$
DECLARE v_loan UUID; v_req UUID; v_emp UUID; v_r TEXT;
BEGIN
  SELECT noor INTO v_emp FROM t_ids;
  INSERT INTO employee_loans (tenant_id, employee_id, amount, months_count,
                              start_date, status, purpose)
  VALUES ('a3660000-0000-0000-0000-00000000000a', v_emp, 250000, 3,
          CURRENT_DATE, 'pending', 'قرضٌ بخطوتَين')
  RETURNING id INTO v_loan;

  PERFORM set_config('request.jwt.claim.sub','33660003-0000-0000-0000-000000000003',FALSE);
  v_req := create_hr_approval('loan', v_loan, v_emp);
  PERFORM set_config('request.jwt.claim.sub','13660001-0000-0000-0000-000000000001',FALSE);
  PERFORM decide_hr_approval_step(v_req, 'rejected', 'التعليلُ الوحيد المكتوب');

  -- ★★★ خطوةٌ رافضةٌ أحدثُ **بتعليقٍ معدوم**: لو سقط شرط
  --   «تعليقٌ غير فارغ» لالتقطها الترتيب أولاً فعاد NULL ⇒ القيد يرفض.
  INSERT INTO hr_approval_steps (request_id, tenant_id, step_order,
                                 approver_role, approver_id, status,
                                 comments, decided_at)
  VALUES (v_req,'a3660000-0000-0000-0000-00000000000a',9,'manager',
          '13660001-0000-0000-0000-000000000001','rejected',
          NULL, now() + INTERVAL '3 hours');

  UPDATE employee_loans SET rejection_reason = NULL, status = 'pending'
   WHERE id = v_loan;
  UPDATE employee_loans SET status = 'rejected' WHERE id = v_loan;

  SELECT rejection_reason INTO v_r FROM employee_loans WHERE id = v_loan;
  ASSERT v_r = 'التعليلُ الوحيد المكتوب',
         '2.7 التقط خطوةً بتعليقٍ معدوم: [' || COALESCE(v_r,'<NULL>') || ']';
  RAISE NOTICE '  ✅ 2.7 [INV06] شرط «تعليقٌ غير فارغ» مُختبَرٌ بخطوةٍ صامتةٍ أحدث';
END $$;

-- 2.8 ★★★ [INV07] — خطوةٌ **موافِقة** أحدثُ بتعليقٍ مضلّل
DO $$
DECLARE v_loan UUID; v_req UUID; v_emp UUID; v_r TEXT;
BEGIN
  SELECT salem INTO v_emp FROM t_ids;
  INSERT INTO employee_loans (tenant_id, employee_id, amount, months_count,
                              start_date, status, purpose)
  VALUES ('a3660000-0000-0000-0000-00000000000a', v_emp, 350000, 4,
          CURRENT_DATE, 'pending', 'قرضٌ بموافقةٍ ورفض')
  RETURNING id INTO v_loan;

  PERFORM set_config('request.jwt.claim.sub','23660002-0000-0000-0000-000000000002',FALSE);
  v_req := create_hr_approval('loan', v_loan, v_emp);
  PERFORM set_config('request.jwt.claim.sub','13660001-0000-0000-0000-000000000001',FALSE);
  PERFORM decide_hr_approval_step(v_req, 'rejected', 'سببُ الرفض الحقيقيّ');

  -- ★★★ خطوةٌ **موافِقة** أحدثُ بتعليق: لو سقط شرط `status = 'rejected'`
  --   لالتقط الترتيبُ تعليقَ الموافقة فصار «سبب الرفض» موافقةً!
  INSERT INTO hr_approval_steps (request_id, tenant_id, step_order,
                                 approver_role, approver_id, status,
                                 comments, decided_at)
  VALUES (v_req,'a3660000-0000-0000-0000-00000000000a',8,'manager',
          '13660001-0000-0000-0000-000000000001','approved',
          'موافقٌ ومبارَك', now() + INTERVAL '4 hours');

  UPDATE employee_loans SET rejection_reason = NULL, status = 'pending'
   WHERE id = v_loan;
  UPDATE employee_loans SET status = 'rejected' WHERE id = v_loan;

  SELECT rejection_reason INTO v_r FROM employee_loans WHERE id = v_loan;
  ASSERT v_r = 'سببُ الرفض الحقيقيّ',
         '2.8 التقط تعليق خطوةٍ موافِقة: [' || v_r || ']';
  RAISE NOTICE '  ✅ 2.8 [INV07] شرط «خطوةٌ رافضة» مُختبَرٌ بموافقةٍ أحدث';
END $$;

\echo '════════ ③ الحالات الأخرى غير مُقيَّدة ════════'

-- 3.1 ★ — approved لا يحتاج سبباً
DO $$
DECLARE v_emp UUID; v_loan UUID;
BEGIN
  SELECT salem INTO v_emp FROM t_ids;
  INSERT INTO employee_loans (tenant_id, employee_id, amount, months_count,
                              start_date, status, purpose)
  VALUES ('a3660000-0000-0000-0000-00000000000a', v_emp, 400000, 4,
          CURRENT_DATE, 'approved', 'قرضٌ معتمَد')
  RETURNING id INTO v_loan;
  ASSERT (SELECT rejection_reason FROM employee_loans WHERE id=v_loan) IS NULL,
         '3.1 المحفّز ملأ السبب لقرضٍ معتمَد';
  RAISE NOTICE '  ✅ 3.1 approved بلا سبب — القيد لا يعترض والمحفّز لا يتدخّل';
END $$;

-- 3.2 ★ — cancelled كذلك
DO $$
DECLARE v_emp UUID; v_loan UUID;
BEGIN
  SELECT noor INTO v_emp FROM t_ids;
  INSERT INTO employee_loans (tenant_id, employee_id, amount, months_count,
                              start_date, status, purpose)
  VALUES ('a3660000-0000-0000-0000-00000000000a', v_emp, 150000, 2,
          CURRENT_DATE, 'cancelled', 'قرضٌ ملغى')
  RETURNING id INTO v_loan;
  ASSERT (SELECT rejection_reason FROM employee_loans WHERE id=v_loan) IS NULL,
         '3.2 المحفّز تدخّل في cancelled';
  RAISE NOTICE '  ✅ 3.2 cancelled بلا سبب';
END $$;

\echo '════════ ④ الصلاحيات ════════'
DO $$
BEGIN
  ASSERT NOT has_function_privilege('anon',
    'public.loan_apply_rejection_reason(uuid)', 'EXECUTE'),
    '④ anon يملك EXECUTE على loan_apply_rejection_reason';
  RAISE NOTICE '  ✅ ④ anon محجوب';
END $$;

\echo ''
\echo '════════════════════════════════════════'
\echo '  ✅ verify-loan-rejection-0366.sql — كل التأكيدات نجحت'
\echo '════════════════════════════════════════'

ROLLBACK;
