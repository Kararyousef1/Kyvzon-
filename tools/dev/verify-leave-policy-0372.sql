-- ============================================================================
-- verify-leave-policy-0372.sql — التحقق السلوكيّ من 0372
--
--   psql -h /home/user/.pgtest/sock -p 5515 -U postgres -f tools/dev/verify-leave-policy-0372.sql
--
-- ★ يعمل بدور postgres (BYPASSRLS). حرّاس الأدوار في -rls.sh
-- ★★★ مُرشَّحٌ بمستأجر الاختبار صراحةً + حارس تهيئة
-- ============================================================================
\set ON_ERROR_STOP off
\pset pager off
\set QUIET on
\timing off

BEGIN;

\set TA '''a3730000-0000-0000-0000-00000000000a'''
\set TB '''b3730000-0000-0000-0000-00000000000b'''
\set HRA '''13730001-0000-0000-0000-000000000001'''
\set U1 '''23730002-0000-0000-0000-000000000002'''
\set U2 '''33730003-0000-0000-0000-000000000003'''
\set U3 '''63730006-0000-0000-0000-000000000006'''
\set HRB '''43730004-0000-0000-0000-000000000004'''

CREATE TEMP TABLE _r(n TEXT, pass BOOLEAN, got TEXT, want TEXT);
CREATE OR REPLACE FUNCTION pg_temp.chk(n TEXT, got TEXT, want TEXT) RETURNS VOID
LANGUAGE sql AS $$ INSERT INTO _r VALUES (n, got IS NOT DISTINCT FROM want, got, want) $$;

DO $$
DECLARE v INTEGER;
BEGIN
  SELECT count(*) INTO v FROM public.tenants
   WHERE id IN ('a3730000-0000-0000-0000-00000000000a',
                'b3730000-0000-0000-0000-00000000000b');
  IF v > 0 THEN RAISE EXCEPTION 'SETUP_DIRTY: % مستأجرٍ متبقٍّ', v; END IF;
END $$;

-- ══════════════════════════════════════════════════════════════════════
--  البذور
-- ══════════════════════════════════════════════════════════════════════
INSERT INTO public.tenants(id,name,name_ar,slug) VALUES
 (:TA,'T0372A','مستأجر ألف 0372','t-0372-a'),
 (:TB,'T0372B','مستأجر باء 0372','t-0372-b');

INSERT INTO auth.users(id,email) VALUES
 (:HRA,'hra0372@v.local'), (:U1,'u1-0372@v.local'), (:U2,'u2-0372@v.local'),
 (:U3,'u3-0372@v.local'), (:HRB,'hrb0372@v.local');

INSERT INTO public.profiles(id,tenant_id,full_name,email,role) VALUES
 (:HRA,:TA,'مدير الموارد ألف','hra0372@v.local','hr'),
 (:U1, :TA,'سالم الأول','u1-0372@v.local','employee'),
 (:U2, :TA,'ريم الثانية','u2-0372@v.local','employee'),
 (:U3, :TA,'عمر المدير','u3-0372@v.local','manager'),
 (:HRB,:TB,'مدير الموارد باء','hrb0372@v.local','hr');

-- ══════════════════════════════════════════════════════════════════════
--  ① ★★★★ العطل ①: الرصيد لم يعد صفراً
-- ══════════════════════════════════════════════════════════════════════
SELECT pg_temp.chk('1.0 ★★★ سياسةٌ افتراضيّةٌ بُذرت لكلّ منشأة',
  (SELECT count(*)::TEXT FROM public.leave_policies WHERE tenant_id IN (:TA,:TB)), '2');

SELECT pg_temp.chk('1.1 الافتراضيّ 21 يوماً سنوياً',
  (SELECT annual_days::TEXT FROM public.leave_policies WHERE tenant_id=:TA), '21.000');

-- ★★★★ جوهر العطل: المحفّز فتح رصيد كلّ موظفٍ أُنشئ مع profiles
SELECT pg_temp.chk('1.2 ★★★★ كلُّ موظفٍ جديدٍ له رصيدٌ غيرُ صفر',
  (SELECT count(*)::TEXT FROM public.leave_balance b
    JOIN public.employees e ON e.id = b.employee_id
   WHERE e.tenant_id = :TA AND b.annual_total > 0), '4');

SELECT pg_temp.chk('1.3 ★★★★ وصفرُ موظفٍ برصيدٍ صفر',
  (SELECT count(*)::TEXT FROM public.leave_balance b
    JOIN public.employees e ON e.id = b.employee_id
   WHERE e.tenant_id = :TA AND b.annual_total = 0), '0');

-- ══════════════════════════════════════════════════════════════════════
--  ② الاستحقاق: الأقدميّة والتناسب — أرقامٌ محسوبةٌ يدوياً
-- ══════════════════════════════════════════════════════════════════════
-- سالم: التحق قبل 12 سنة ⇒ 21 + (12/5)*1 = 21 + 2 = 23
UPDATE public.employees SET hire_date = (CURRENT_DATE - INTERVAL '12 years')::DATE
 WHERE user_id = :U1;
SELECT pg_temp.chk('2.1 أقدميّة 12 سنة ⇒ 21 + 2 = 23 يوماً',
  (SELECT annual::TEXT FROM public.leave_entitlement(
     (SELECT id FROM public.employees WHERE user_id=:U1),
     EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER)), '23.000');

-- ريم: التحقت قبل 40 سنة ⇒ 21 + 8 = 29 ولكن الحدّ 30 ⇒ 29
UPDATE public.employees SET hire_date = (CURRENT_DATE - INTERVAL '40 years')::DATE
 WHERE user_id = :U2;
SELECT pg_temp.chk('2.2 ★ الحدُّ الأقصى يحكم: 21+8=29 (دون 30)',
  (SELECT annual::TEXT FROM public.leave_entitlement(
     (SELECT id FROM public.employees WHERE user_id=:U2),
     EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER)), '29.000');

-- ★★★ الحدّ الأقصى فعليّاً: أقدميّة 60 سنة ⇒ 21+12=33 ⇒ يُقصّ إلى 30
UPDATE public.employees SET hire_date = (CURRENT_DATE - INTERVAL '60 years')::DATE
 WHERE user_id = :U3;
SELECT pg_temp.chk('2.3 ★★★ 21+12=33 يُقصّ إلى الحدّ 30',
  (SELECT annual::TEXT FROM public.leave_entitlement(
     (SELECT id FROM public.employees WHERE user_id=:U3),
     EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER)), '30.000');

-- ★★★ التناسب: التحق في تموز من السنة الجارية ⇒ 6 أشهر ⇒ 21*6/12 = 10.5
UPDATE public.employees
   SET hire_date = make_date(EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER, 7, 1)
 WHERE user_id = :U1;
SELECT pg_temp.chk('2.4 ★★★ التناسب في سنة الالتحاق: 21×6/12 = 10.5',
  (SELECT annual::TEXT FROM public.leave_entitlement(
     (SELECT id FROM public.employees WHERE user_id=:U1),
     EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER)), '10.500');

-- ★ وسنةٌ لاحقة بلا تناسب: 21 + (1/5)*1 = 21
SELECT pg_temp.chk('2.5 ★ والسنة التالية بلا تناسب = 21',
  (SELECT annual::TEXT FROM public.leave_entitlement(
     (SELECT id FROM public.employees WHERE user_id=:U1),
     EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER + 1)), '21.000');

-- ★★★★ منشأةٌ **بلا سياسة**: الاحتياطُ داخل `leave_entitlement` يجب
--   أن يُعيد الأساس لا صفراً. بلا هذا التأكيد لا يُختبَر الاحتياط
--   أصلاً — كلُّ منشأةٍ في العيّنة لها سياسةٌ بحكم المحفّز
--   (نمط «شرطٌ لا تُوجَد بياناتٌ تخالفه»؛ أنجى INV7).
DELETE FROM public.leave_policies WHERE tenant_id = :TB;
INSERT INTO auth.users(id,email) VALUES
 ('73730007-0000-0000-0000-000000000007','u7-0372@v.local');
INSERT INTO public.profiles(id,tenant_id,full_name,email,role) VALUES
 ('73730007-0000-0000-0000-000000000007',:TB,'موظف باء','u7-0372@v.local','employee');
UPDATE public.employees SET hire_date = (CURRENT_DATE - INTERVAL '2 years')::DATE
 WHERE user_id = '73730007-0000-0000-0000-000000000007';

SELECT pg_temp.chk('2.7 ★★★★ منشأةٌ بلا سياسةٍ تأخذ الأساس 21 لا صفراً',
  (SELECT annual::TEXT FROM public.leave_entitlement(
     (SELECT id FROM public.employees WHERE user_id='73730007-0000-0000-0000-000000000007'),
     EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER)), '21.000');

-- ★ ونُعيد سياسة باء كي لا تتلوّث التأكيدات اللاحقة
INSERT INTO public.leave_policies (tenant_id) VALUES (:TB)
ON CONFLICT (tenant_id) DO NOTHING;

-- ★ موظفٌ بلا تاريخ التحاق لا يسقط إلى صفر
UPDATE public.employees SET hire_date = NULL WHERE user_id = :U2;
SELECT pg_temp.chk('2.6 ★★ موظفٌ بلا تاريخ التحاقٍ يأخذ الأساس لا صفراً',
  (SELECT annual::TEXT FROM public.leave_entitlement(
     (SELECT id FROM public.employees WHERE user_id=:U2),
     EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER)), '21.000');

-- ══════════════════════════════════════════════════════════════════════
--  ③ ★★★★ الطلب ينجح — كان يُرفض حتماً
-- ══════════════════════════════════════════════════════════════════════
UPDATE public.employees SET hire_date = (CURRENT_DATE - INTERVAL '3 years')::DATE
 WHERE user_id IN (:U1,:U2);
SELECT public.ensure_leave_balance(
  (SELECT id FROM public.employees WHERE user_id=:U1),
  EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER) \gset e1_

SET request.jwt.claim.sub = '23730002-0000-0000-0000-000000000002';

DO $$
DECLARE v TEXT := 'فشل';
BEGIN
  BEGIN
    PERFORM public.submit_leave_request('سنوية', CURRENT_DATE+30, CURRENT_DATE+32, 'اختبار', NULL);
    v := 'نجح';
  EXCEPTION WHEN OTHERS THEN v := 'فشل: ' || left(SQLERRM,60);
  END;
  PERFORM pg_temp.chk('3.1 ★★★★ طلبُ إجازةٍ سنويّةٍ ينجح (كان يُرفض حتماً)', v, 'نجح');
END $$;

SELECT pg_temp.chk('3.2 والطلب مُسجَّلٌ فعلاً',
  (SELECT count(*)::TEXT FROM public.leaves WHERE tenant_id=:TA), '1');

-- ★★★ وحارسُ الرصيد ما زال يعمل: طلبٌ يفوق الرصيد يُرفض
DO $$
DECLARE v TEXT := 'قُبِل';
BEGIN
  BEGIN
    PERFORM public.submit_leave_request('سنوية', CURRENT_DATE+100, CURRENT_DATE+160, 'طويل', NULL);
  EXCEPTION WHEN OTHERS THEN
    v := CASE WHEN SQLERRM LIKE 'LEAVE_INSUFFICIENT_BALANCE%' THEN 'رُفض'
              ELSE 'رُفض بـ' || left(SQLERRM,40) END;
  END;
  PERFORM pg_temp.chk('3.3 ★★★ وحارسُ الرصيد لم يُعطَّل — طلبٌ مُفرِطٌ يُرفض', v, 'رُفض');
END $$;

RESET request.jwt.claim.sub;

-- ══════════════════════════════════════════════════════════════════════
--  ④ ★★★★ العطل ②: حارس النطاق
-- ══════════════════════════════════════════════════════════════════════
SELECT pg_temp.chk('4.1 mine متاحٌ للجميع',
  (SELECT public.can_use_request_scope('mine','leave')::TEXT), 'true');

SET request.jwt.claim.sub = '23730002-0000-0000-0000-000000000002';
SELECT pg_temp.chk('4.2 ★★★★ الموظف: all ممنوع',
  (SELECT public.can_use_request_scope('all','leave')::TEXT), 'false');
SELECT pg_temp.chk('4.3 ★★★★ الموظف: inbox ممنوع (لا خطوةَ اعتمادٍ له)',
  (SELECT public.can_use_request_scope('inbox','leave')::TEXT), 'false');
SELECT pg_temp.chk('4.4 والموظف: mine متاح',
  (SELECT public.can_use_request_scope('mine','leave')::TEXT), 'true');

SET request.jwt.claim.sub = '13730001-0000-0000-0000-000000000001';
SELECT pg_temp.chk('4.5 الموارد البشرية: all متاح',
  (SELECT public.can_use_request_scope('all','leave')::TEXT), 'true');
SELECT pg_temp.chk('4.6 والموارد البشرية: inbox متاح',
  (SELECT public.can_use_request_scope('inbox','leave')::TEXT), 'true');

-- ★★★ المدير يصير له صندوقٌ حين تُسنَد إليه خطوةُ اعتمادٍ فعليّة
SET request.jwt.claim.sub = '63730006-0000-0000-0000-000000000006';
SELECT pg_temp.chk('4.7 ★★★ المدير بلا خطوةٍ: inbox ممنوع',
  (SELECT public.can_use_request_scope('inbox','leave')::TEXT), 'false');

RESET request.jwt.claim.sub;
INSERT INTO public.hr_approval_requests(id,tenant_id,request_type,related_id,employee_id,status)
SELECT 'aa730000-0000-0000-0000-0000000000a1',:TA,'leave',l.id,l.employee_id,'pending'
FROM public.leaves l WHERE l.tenant_id=:TA LIMIT 1;
INSERT INTO public.hr_approval_steps(request_id,tenant_id,step_order,approver_role,approver_id,status)
VALUES ('aa730000-0000-0000-0000-0000000000a1',:TA,1,'manager',:U3,'active');

SET request.jwt.claim.sub = '63730006-0000-0000-0000-000000000006';
SELECT pg_temp.chk('4.8 ★★★★ وبخطوةٍ مُسنَدةٍ إليه: inbox متاح',
  (SELECT public.can_use_request_scope('inbox','leave')::TEXT), 'true');

-- ★★★ وخطوةُ الإجازات لا تفتح صندوق الزمنيات
SELECT pg_temp.chk('4.9 ★★★ لكنّ صندوق الزمنيات يبقى مغلقاً (نوعٌ مختلف)',
  (SELECT public.can_use_request_scope('inbox','permission')::TEXT), 'false');

-- ══════════════════════════════════════════════════════════════════════
--  ⑤ الحارس مفعَّلٌ داخل الدالتين
-- ══════════════════════════════════════════════════════════════════════
SET request.jwt.claim.sub = '23730002-0000-0000-0000-000000000002';

DO $$
DECLARE v TEXT := 'قُبِل';
BEGIN
  BEGIN
    PERFORM count(*) FROM public.leave_requests_view('all', NULL, 10, 0);
  EXCEPTION WHEN OTHERS THEN
    v := CASE WHEN SQLERRM LIKE 'LEAVE_SCOPE_FORBIDDEN%' THEN 'رُفض'
              ELSE 'رُفض بـ' || left(SQLERRM,40) END;
  END;
  PERFORM pg_temp.chk('5.1 ★★★★ الموظف على نطاق all ⇒ LEAVE_SCOPE_FORBIDDEN', v, 'رُفض');
END $$;

DO $$
DECLARE v TEXT := 'قُبِل';
BEGIN
  BEGIN
    PERFORM count(*) FROM public.permission_requests_view('all', NULL, 10, 0);
  EXCEPTION WHEN OTHERS THEN
    v := CASE WHEN SQLERRM LIKE 'PERM_SCOPE_FORBIDDEN%' THEN 'رُفض'
              ELSE 'رُفض بـ' || left(SQLERRM,40) END;
  END;
  PERFORM pg_temp.chk('5.2 ★★★★ والزمنيات كذلك ⇒ PERM_SCOPE_FORBIDDEN', v, 'رُفض');
END $$;

-- ★★★ وnطاق mine يعمل — المنعُ لا يكسر الحقّ المشروع
SELECT pg_temp.chk('5.3 ★★★ ونطاق mine يعمل للموظف',
  (SELECT count(*)::TEXT FROM public.leave_requests_view('mine', NULL, 10, 0)), '1');

SET request.jwt.claim.sub = '13730001-0000-0000-0000-000000000001';
SELECT pg_temp.chk('5.4 والموارد البشرية تقرأ all بلا منع',
  (SELECT count(*)::TEXT FROM public.leave_requests_view('all', NULL, 10, 0)), '1');

RESET request.jwt.claim.sub;

-- ══════════════════════════════════════════════════════════════════════
--  ⑥ لوح السياسة وتحديثها
-- ══════════════════════════════════════════════════════════════════════
SET request.jwt.claim.sub = '13730001-0000-0000-0000-000000000001';

SELECT pg_temp.chk('6.1 اللوح يعرض 21 يوماً',
  (SELECT annual_days::TEXT FROM public.leave_policy_board()), '21.000');

SELECT pg_temp.chk('6.2 ★★★ واللوح يعدّ من بقي برصيدٍ صفر',
  (SELECT employees_zero::TEXT FROM public.leave_policy_board()), '0');

SELECT public.leave_policy_update(25, 30, 2, 4, 40, TRUE) \gset up_
SELECT pg_temp.chk('6.3 التحديث يُعيد عدد الأرصدة المُحدَّثة = 4',
  (SELECT public.leave_policy_update(25, 30, 2, 4, 40, TRUE)::TEXT), '4');

SELECT pg_temp.chk('6.4 والسياسة تغيّرت إلى 25',
  (SELECT annual_days::TEXT FROM public.leave_policies WHERE tenant_id=:TA), '25.000');

-- ★★★★ الرصيد ارتفع فعلاً: سالم بأقدميّة 3 سنوات ⇒ 25 + (3/4)*2 = 25
SELECT pg_temp.chk('6.5 ★★★★ ورصيدُ سالم ارتفع إلى 25',
  (SELECT b.annual_total::TEXT FROM public.leave_balance b
    JOIN public.employees e ON e.id=b.employee_id
   WHERE e.user_id=:U1 AND b.year = EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER),
  '25.000');

-- ★★★★ ولا يهبط رصيدٌ مُنِح يدوياً
UPDATE public.leave_balance b SET annual_total = 40
  FROM public.employees e
 WHERE e.id = b.employee_id AND e.user_id = :U2
   AND b.year = EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER;
SELECT public.leave_policy_update(25, 30, 2, 4, 40, TRUE) \gset up2_
SELECT pg_temp.chk('6.6 ★★★★ رصيدٌ استثنائيٌّ (40) لا تمحوه إعادةُ الحساب',
  (SELECT b.annual_total::TEXT FROM public.leave_balance b
    JOIN public.employees e ON e.id=b.employee_id
   WHERE e.user_id=:U2 AND b.year = EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER),
  '40.000');

-- ★★★ التحديث يمسّ مستأجرَه وحده
SELECT pg_temp.chk('6.7 ★★★ سياسةُ باء لم تتغيّر',
  (SELECT annual_days::TEXT FROM public.leave_policies WHERE tenant_id=:TB), '21.000');

RESET request.jwt.claim.sub;

-- ══════════════════════════════════════════════════════════════════════
--  ⑦ قيود السياسة
-- ══════════════════════════════════════════════════════════════════════
DO $$
DECLARE v TEXT := 'قُبِل';
BEGIN
  BEGIN
    UPDATE public.leave_policies SET annual_days = 200
     WHERE tenant_id = 'a3730000-0000-0000-0000-00000000000a';
  EXCEPTION WHEN OTHERS THEN v := 'رُفض';
  END;
  PERFORM pg_temp.chk('7.1 رصيدٌ سنويٌّ 200 يوماً مرفوض', v, 'رُفض');
END $$;

DO $$
DECLARE v TEXT := 'قُبِل';
BEGIN
  BEGIN
    UPDATE public.leave_policies SET annual_days = 40, annual_days_max = 20
     WHERE tenant_id = 'a3730000-0000-0000-0000-00000000000a';
  EXCEPTION WHEN OTHERS THEN v := 'رُفض';
  END;
  PERFORM pg_temp.chk('7.2 ★★★ حدٌّ أقصى أدنى من الأساس مرفوض', v, 'رُفض');
END $$;

DO $$
DECLARE v TEXT := 'قُبِل';
BEGIN
  BEGIN
    UPDATE public.leave_policies SET seniority_step_years = 0
     WHERE tenant_id = 'a3730000-0000-0000-0000-00000000000a';
  EXCEPTION WHEN OTHERS THEN v := 'رُفض';
  END;
  -- ★★★ لولا هذا القيد لوقعت قسمةٌ على صفرٍ في leave_entitlement
  PERFORM pg_temp.chk('7.3 ★★★★ خطوةُ أقدميّةٍ = 0 مرفوضة (قسمةٌ على صفر)', v, 'رُفض');
END $$;

-- ══════════════════════════════════════════════════════════════════════
--  ⑧ الجدار (فحصٌ ثابت — التنفيذ في -rls.sh)
-- ══════════════════════════════════════════════════════════════════════
SELECT pg_temp.chk('8.1 RLS مفعَّلةٌ على leave_policies',
  (SELECT relrowsecurity::TEXT FROM pg_class WHERE oid='public.leave_policies'::regclass), 'true');

SELECT pg_temp.chk('8.2 ★★★ البوّابة الهجينة RESTRICTIVE',
  (SELECT polpermissive::TEXT FROM pg_policy
    WHERE polrelid='public.leave_policies'::regclass
      AND polname='hybrid_gate_leave_policies'), 'false');

SELECT pg_temp.chk('8.3 ★★★ لا سياسة DELETE على السياسة',
  (SELECT count(*)::TEXT FROM pg_policy
    WHERE polrelid='public.leave_policies'::regclass AND polcmd='d'), '0');

SELECT pg_temp.chk('8.4 ★★★ anon محرومٌ من الجدول',
  (SELECT CASE WHEN has_table_privilege('anon','public.leave_policies','SELECT')
   THEN 'له' ELSE 'محروم' END), 'محروم');

SELECT pg_temp.chk('8.5 ★★★ anon محرومٌ من can_use_request_scope',
  (SELECT CASE WHEN has_function_privilege('anon',
     'public.can_use_request_scope(TEXT,TEXT)','EXECUTE')
   THEN 'له' ELSE 'محروم' END), 'محروم');

SELECT pg_temp.chk('8.6 ★★★ anon محرومٌ من leave_policy_update',
  (SELECT CASE WHEN has_function_privilege('anon',
     'public.leave_policy_update(NUMERIC,NUMERIC,NUMERIC,INTEGER,NUMERIC,BOOLEAN)','EXECUTE')
   THEN 'له' ELSE 'محروم' END), 'محروم');

SELECT pg_temp.chk('8.7 ★★★ anon محرومٌ من ensure_leave_balance',
  (SELECT CASE WHEN has_function_privilege('anon',
     'public.ensure_leave_balance(UUID,INTEGER)','EXECUTE')
   THEN 'له' ELSE 'محروم' END), 'محروم');

-- ★★★ فحصُ نصّ الدوال: الحقنُ نجح فعلاً
SELECT pg_temp.chk('8.8 ★★★★ حارسُ النطاق محقونٌ في leave_requests_view',
  (SELECT CASE WHEN pg_get_functiondef(oid) LIKE '%LEAVE_SCOPE_FORBIDDEN%'
               THEN 'محقون' ELSE 'مفقود' END
   FROM pg_proc WHERE pronamespace='public'::regnamespace
     AND proname='leave_requests_view'), 'محقون');

SELECT pg_temp.chk('8.9 ★★★★ وفي permission_requests_view',
  (SELECT CASE WHEN pg_get_functiondef(oid) LIKE '%PERM_SCOPE_FORBIDDEN%'
               THEN 'محقون' ELSE 'مفقود' END
   FROM pg_proc WHERE pronamespace='public'::regnamespace
     AND proname='permission_requests_view'), 'محقون');

SELECT pg_temp.chk('8.10 ★★★★ وضمانُ الرصيد في submit_leave_request',
  (SELECT CASE WHEN pg_get_functiondef(oid) LIKE '%ensure_leave_balance%'
               THEN 'محقون' ELSE 'مفقود' END
   FROM pg_proc WHERE pronamespace='public'::regnamespace
     AND proname='submit_leave_request'), 'محقون');

-- ★★★ والحقنُ لم يُتلف الدوال: النطاق mine ما زال يعمل (أُثبت في 5.3)
SELECT pg_temp.chk('8.11 ★★★ الحقن لم يُغيّر توقيع الدالة',
  (SELECT pg_get_function_arguments(oid) FROM pg_proc
    WHERE pronamespace='public'::regnamespace AND proname='leave_requests_view'),
  'p_scope text DEFAULT ''mine''::text, p_status text DEFAULT NULL::text, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0');

SELECT pg_temp.chk('8.12 ★★★ محفّزُ بذر الرصيد موجود',
  (SELECT count(*)::TEXT FROM pg_trigger
    WHERE tgrelid='public.employees'::regclass
      AND tgname='trg_seed_leave_balance'), '1');

-- ══════════════════════════════════════════════════════════════════════
--  النتيجة
-- ══════════════════════════════════════════════════════════════════════
\set QUIET off
\echo ''
\echo '════════════════ نتائج verify-leave-policy-0372 ════════════════'
SELECT n AS "التأكيد",
       CASE WHEN pass THEN '✅' ELSE '❌' END AS "ح",
       CASE WHEN pass THEN '' ELSE 'حصلنا: '||COALESCE(got,'NULL')||' · نتوقّع: '||COALESCE(want,'NULL') END AS "التفصيل"
FROM _r ORDER BY row_number() OVER ();

SELECT count(*) FILTER (WHERE pass) AS "ناجح",
       count(*) FILTER (WHERE NOT pass) AS "فاشل",
       count(*) AS "الإجمالي"
FROM _r;

DO $$
DECLARE v INTEGER;
BEGIN
  SELECT count(*) INTO v FROM _r WHERE NOT pass;
  IF v > 0 THEN RAISE EXCEPTION 'VERIFY_0372_FAILED: % تأكيداً فاشلاً', v; END IF;
  RAISE NOTICE '✅ verify-leave-policy-0372: كل التأكيدات ناجحة';
END $$;

ROLLBACK;
