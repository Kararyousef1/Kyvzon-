-- ============================================================================
-- verify-hr-communication-0371.sql — التحقق السلوكيّ من 0371
--
--   psql -h /home/user/.pgtest/sock -p 5512 -U postgres -f tools/dev/verify-hr-communication-0371.sql
--
-- ★ يعمل بدور postgres (BYPASSRLS). حرّاس الأدوار وRLS في
--   verify-hr-communication-0371-rls.sh
--
-- ★★★ مُرشَّحٌ بمستأجر الاختبار صراحةً + حارس تهيئة يرفض جدولاً ملوَّثاً
-- ============================================================================
\set ON_ERROR_STOP off
\pset pager off
\set QUIET on
\timing off

BEGIN;

\set TA '''a3710000-0000-0000-0000-00000000000a'''
\set TB '''b3710000-0000-0000-0000-00000000000b'''
\set HRA '''13710001-0000-0000-0000-000000000001'''
\set U1 '''23710002-0000-0000-0000-000000000002'''
\set U2 '''33710003-0000-0000-0000-000000000003'''
\set HRB '''43710004-0000-0000-0000-000000000004'''
\set UB '''53710005-0000-0000-0000-000000000005'''

CREATE TEMP TABLE _r(n TEXT, pass BOOLEAN, got TEXT, want TEXT);
CREATE OR REPLACE FUNCTION pg_temp.chk(n TEXT, got TEXT, want TEXT) RETURNS VOID
LANGUAGE sql AS $$ INSERT INTO _r VALUES (n, got IS NOT DISTINCT FROM want, got, want) $$;

-- ★★★ التنظيف يعطّل محفّز المنع **صراحةً** — لا `|| true` يبتلع الخطأ
CREATE OR REPLACE FUNCTION pg_temp.purge() RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE v_has BOOLEAN;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgrelid='public.hr_messages'::regclass
                    AND tgname='trg_block_hr_message_delete') INTO v_has;
  IF v_has THEN
    ALTER TABLE public.hr_messages DISABLE TRIGGER trg_block_hr_message_delete;
  END IF;
  DELETE FROM public.hr_messages
   WHERE tenant_id IN ('a3710000-0000-0000-0000-00000000000a',
                       'b3710000-0000-0000-0000-00000000000b');
  IF v_has THEN
    ALTER TABLE public.hr_messages ENABLE TRIGGER trg_block_hr_message_delete;
  END IF;
END $$;

-- ═══ حارس التهيئة ═══
DO $$
DECLARE v INTEGER;
BEGIN
  SELECT count(*) INTO v FROM public.hr_messages
   WHERE tenant_id IN ('a3710000-0000-0000-0000-00000000000a',
                       'b3710000-0000-0000-0000-00000000000b');
  IF v > 0 THEN RAISE EXCEPTION 'SETUP_DIRTY: % رسالةً متبقيّة', v; END IF;
END $$;

-- ══════════════════════════════════════════════════════════════════════
--  البذور
-- ══════════════════════════════════════════════════════════════════════
INSERT INTO public.tenants(id,name,name_ar,slug) VALUES
 (:TA,'T0371A','مستأجر ألف 0371','t-0371-a'),
 (:TB,'T0371B','مستأجر باء 0371','t-0371-b');

INSERT INTO auth.users(id,email) VALUES
 (:HRA,'hra0371@v.local'), (:U1,'u1-0371@v.local'), (:U2,'u2-0371@v.local'),
 (:HRB,'hrb0371@v.local'), (:UB,'ub-0371@v.local');

INSERT INTO public.profiles(id,tenant_id,full_name,email,role,department) VALUES
 (:HRA,:TA,'مدير الموارد ألف','hra0371@v.local','hr','الموارد البشرية'),
 (:U1, :TA,'سالم الأول','u1-0371@v.local','employee','الهندسة'),
 (:U2, :TA,'ريم الثانية','u2-0371@v.local','employee','المالية'),
 (:HRB,:TB,'مدير الموارد باء','hrb0371@v.local','hr','الموارد البشرية'),
 (:UB, :TB,'موظف باء','ub-0371@v.local','employee','قسم باء');

INSERT INTO public.departments(id,tenant_id,name_ar) VALUES
 ('d3710000-0000-0000-0000-0000000000d1',:TA,'الهندسة');

UPDATE public.employees SET department_id='d3710000-0000-0000-0000-0000000000d1',
       first_name='سالم', last_name='الأول' WHERE user_id=:U1;
UPDATE public.employees SET first_name='ريم', last_name='الثانية' WHERE user_id=:U2;

DO $$ BEGIN PERFORM set_config('request.jwt.claim.sub','13710001-0000-0000-0000-000000000001',true); END $$;

-- ══════════════════════════════════════════════════════════════════════
--  ① ★★★★ العطل ①: الاسم والقسم يظهران — لا سلسلةً فارغة
-- ══════════════════════════════════════════════════════════════════════
SELECT pg_temp.chk('1.0 ★★★ FK إلى profiles صار موجوداً (كان صفراً)',
  (SELECT count(*)::TEXT FROM pg_constraint
    WHERE conrelid='public.hr_messages'::regclass AND contype='f'
      AND confrelid='public.profiles'::regclass), '4');

INSERT INTO public.hr_messages(id,tenant_id,employee_id,subject,message,priority,status)
SELECT 'c3710000-0000-0000-0000-0000000000c1',:TA,e.id,
       'استفسار عن الراتب','متى يُصرف؟','urgent','new'
FROM public.employees e WHERE e.user_id=:U1;

SELECT pg_temp.chk('1.1 ★★★★ اسمُ المُرسِل يظهر (كان "" دائماً)',
  (SELECT sender_name FROM public.hr_message_board()
    WHERE subject='استفسار عن الراتب'), 'سالم الأول');

SELECT pg_temp.chk('1.2 ★★★★ وقسمُه كذلك',
  (SELECT sender_dept FROM public.hr_message_board()
    WHERE subject='استفسار عن الراتب'), 'الهندسة');

SELECT pg_temp.chk('1.3 ★★★ المحفّز ملأ sender_id تلقائياً',
  (SELECT sender_id::TEXT FROM public.hr_messages
    WHERE id='c3710000-0000-0000-0000-0000000000c1'),
  '23710002-0000-0000-0000-000000000002');

-- ★ التسلسل يعمل: موظفٌ بلا profile.department يقع على departments.name_ar
UPDATE public.profiles SET department=NULL WHERE id=:U1;
SELECT pg_temp.chk('1.4 ★ بلا قسمٍ في profiles يقع على departments.name_ar',
  (SELECT sender_dept FROM public.hr_message_board()
    WHERE subject='استفسار عن الراتب'), 'الهندسة');
UPDATE public.profiles SET department='الهندسة' WHERE id=:U1;

-- ══════════════════════════════════════════════════════════════════════
--  ② ★★★★ العطل ③: اتّساق الردّ
-- ══════════════════════════════════════════════════════════════════════
DO $$
DECLARE v TEXT := 'قُبِل';
BEGIN
  BEGIN
    UPDATE public.hr_messages SET status='replied'
     WHERE id='c3710000-0000-0000-0000-0000000000c1';
  EXCEPTION WHEN OTHERS THEN v := 'رُفض';
  END;
  PERFORM pg_temp.chk('2.1 ★★★★ status=replied بلا نصِّ ردٍّ مرفوض', v, 'رُفض');
END $$;

DO $$
DECLARE v TEXT := 'قُبِل';
BEGIN
  BEGIN
    INSERT INTO public.hr_messages(tenant_id,employee_id,subject,message,status,reply)
    SELECT 'a3710000-0000-0000-0000-00000000000a',e.id,'شبح','نصّ','new','ردٌّ شبح'
    FROM public.employees e WHERE e.user_id='23710002-0000-0000-0000-000000000002';
  EXCEPTION WHEN OTHERS THEN v := 'رُفض';
  END;
  -- ★★★ في INSERT لا يُفرغ المحفّزُ الحقل بل يتركه ليرفضه القيد بصوتٍ
  --   مسموع (درس 0369 · التأكيد 2.5b: المحفّز كان يبتلع التناقض)
  PERFORM pg_temp.chk('2.2 ★★★★ نصُّ ردٍّ بحالةٍ «جديدة» مرفوضٌ في INSERT', v, 'رُفض');
END $$;

-- ★ والتحديث يُفرغه بدل أن يرفض
UPDATE public.hr_messages SET status='read'
 WHERE id='c3710000-0000-0000-0000-0000000000c1';
SELECT pg_temp.chk('2.3 ★ والخروج من replied عبر UPDATE يُفرّغ الحقول',
  (SELECT COALESCE(reply,'NULL') FROM public.hr_messages
    WHERE id='c3710000-0000-0000-0000-0000000000c1'), 'NULL');

-- ══════════════════════════════════════════════════════════════════════
--  ③ ★★★★ العطل ②: الردّ يعمل فعلاً — والزرّ كان بلا onClick
-- ══════════════════════════════════════════════════════════════════════
SELECT public.hr_message_reply('c3710000-0000-0000-0000-0000000000c1','يُصرف يوم 25') \gset rep_
SELECT pg_temp.chk('3.1 hr_message_reply نجحت',
  (SELECT status FROM public.hr_messages
    WHERE id='c3710000-0000-0000-0000-0000000000c1'), 'replied');

SELECT pg_temp.chk('3.2 ★★★ الرادُّ ولحظتُه آليّان — لا يعتمدان على المتصفّح',
  (SELECT CASE WHEN replied_by IS NOT NULL AND replied_at IS NOT NULL
               THEN 'مملوءان' ELSE 'ناقصان' END
   FROM public.hr_messages WHERE id='c3710000-0000-0000-0000-0000000000c1'),
  'مملوءان');

SELECT pg_temp.chk('3.3 اسمُ الرادّ يظهر في اللوح',
  (SELECT replier_name FROM public.hr_message_board()
    WHERE subject='استفسار عن الراتب'), 'مدير الموارد ألف');

DO $$
DECLARE v TEXT := 'قُبِل';
BEGIN
  BEGIN
    PERFORM public.hr_message_reply('c3710000-0000-0000-0000-0000000000c1','   ');
  EXCEPTION WHEN OTHERS THEN
    v := CASE WHEN SQLERRM LIKE 'HR_MESSAGE_EMPTY_REPLY%' THEN 'رُفض' ELSE left(SQLERRM,40) END;
  END;
  PERFORM pg_temp.chk('3.4 ردٌّ من مسافات مرفوض', v, 'رُفض');
END $$;

-- ══════════════════════════════════════════════════════════════════════
--  ④ ★★★★ العطل ⑪: الردُّ يصل الحالةَ التي يقرؤها الموظف
-- ══════════════════════════════════════════════════════════════════════
INSERT INTO public.hr_cases(id,tenant_id,employee_id,case_type,subject,description,priority,status)
SELECT 'f3710000-0000-0000-0000-0000000000f1',:TA,e.id,'general_inquiry',
       'طلبٌ مرتبط','نصّ','normal','open'
FROM public.employees e WHERE e.user_id=:U2;

INSERT INTO public.hr_messages(id,tenant_id,employee_id,case_id,subject,message,priority,status)
SELECT 'c3710000-0000-0000-0000-0000000000c2',:TA,e.id,
       'f3710000-0000-0000-0000-0000000000f1','[استفسار] طلبٌ مرتبط','نصّ','normal','new'
FROM public.employees e WHERE e.user_id=:U2;

SELECT pg_temp.chk('4.0 قبل الردّ: الحالة open وبلا استجابةٍ أولى',
  (SELECT status || '|' || COALESCE(first_response_at::TEXT,'NULL')
   FROM public.hr_cases WHERE id='f3710000-0000-0000-0000-0000000000f1'),
  'open|NULL');

SELECT public.hr_message_reply('c3710000-0000-0000-0000-0000000000c2','سنراجع طلبك') \gset r2_

SELECT pg_temp.chk('4.1 ★★★★ الردُّ نقل الحالةَ إلى in_review',
  (SELECT status FROM public.hr_cases WHERE id='f3710000-0000-0000-0000-0000000000f1'),
  'in_review');

SELECT pg_temp.chk('4.2 ★★★★ وسجّل first_response_at فيراه الموظف',
  (SELECT CASE WHEN first_response_at IS NOT NULL THEN 'مسجَّل' ELSE 'مفقود' END
   FROM public.hr_cases WHERE id='f3710000-0000-0000-0000-0000000000f1'), 'مسجَّل');

SELECT pg_temp.chk('4.3 واللوح يعرض موضوع الحالة المرتبطة',
  (SELECT case_subject FROM public.hr_message_board()
    WHERE subject='[استفسار] طلبٌ مرتبط'), 'طلبٌ مرتبط');

-- ★★★ العطل ⑪ مقاساً: الرسائل غير المرتبطة
SELECT pg_temp.chk('4.4 ★★★ الملخّص يعدّ الرسائل غير المرتبطة بحالة',
  (SELECT unlinked::TEXT FROM public.hr_message_summary()), '1');

-- ══════════════════════════════════════════════════════════════════════
--  ⑤ ★★★ العطل ⑤: الأرشفة بديلُ الحذف
-- ══════════════════════════════════════════════════════════════════════
DO $$
DECLARE v TEXT := 'قُبِل';
BEGIN
  BEGIN
    DELETE FROM public.hr_messages WHERE id='c3710000-0000-0000-0000-0000000000c1';
  EXCEPTION WHEN OTHERS THEN
    v := CASE WHEN SQLERRM LIKE 'HR_MESSAGE_DELETE_BLOCKED%' THEN 'رُفض' ELSE left(SQLERRM,40) END;
  END;
  PERFORM pg_temp.chk('5.1 ★★★ الحذف النهائيّ مرفوض', v, 'رُفض');
END $$;

DO $$
DECLARE v TEXT := 'قُبِل';
BEGIN
  BEGIN
    PERFORM public.hr_message_archive('c3710000-0000-0000-0000-0000000000c1','   ');
  EXCEPTION WHEN OTHERS THEN
    v := CASE WHEN SQLERRM LIKE 'HR_MESSAGE_NO_REASON%' THEN 'رُفض' ELSE left(SQLERRM,40) END;
  END;
  PERFORM pg_temp.chk('5.2 أرشفةٌ بلا سببٍ مرفوضة', v, 'رُفض');
END $$;

SELECT public.hr_message_archive('c3710000-0000-0000-0000-0000000000c1','مُعالَجة') \gset ar_
SELECT pg_temp.chk('5.3 الأرشفة تملأ الحقول الثلاثة',
  (SELECT CASE WHEN archived_at IS NOT NULL AND archived_by IS NOT NULL
                 AND archive_reason='مُعالَجة' THEN 'كاملة' ELSE 'ناقصة' END
   FROM public.hr_messages WHERE id='c3710000-0000-0000-0000-0000000000c1'), 'كاملة');

SELECT pg_temp.chk('5.4 المؤرشفة تختفي من اللوح النشط',
  (SELECT count(*)::TEXT FROM public.hr_message_board()
    WHERE subject='استفسار عن الراتب'), '0');

SELECT pg_temp.chk('5.5 وتظهر في لوح الأرشيف',
  (SELECT count(*)::TEXT FROM public.hr_message_board(NULL,NULL,NULL,TRUE)
    WHERE subject='استفسار عن الراتب'), '1');

-- ★ قيدُ الأرشفة الجزئيّة
DO $$
DECLARE v TEXT := 'قُبِل';
BEGIN
  BEGIN
    UPDATE public.hr_messages SET archived_at = now()
     WHERE id='c3710000-0000-0000-0000-0000000000c2';
  EXCEPTION WHEN OTHERS THEN v := 'رُفض';
  END;
  PERFORM pg_temp.chk('5.6 ★★★ أرشفةٌ جزئيّة (لحظةٌ بلا فاعلٍ ولا سبب) مرفوضة', v, 'رُفض');
END $$;

-- ══════════════════════════════════════════════════════════════════════
--  ⑥ الإغلاق — «مكتمل» بلا ردٍّ كذبة
-- ══════════════════════════════════════════════════════════════════════
INSERT INTO public.hr_messages(id,tenant_id,employee_id,subject,message,status)
SELECT 'c3710000-0000-0000-0000-0000000000c3',:TA,e.id,'بلا ردّ','نصّ','new'
FROM public.employees e WHERE e.user_id=:U1;

DO $$
DECLARE v TEXT := 'قُبِل';
BEGIN
  BEGIN
    PERFORM public.hr_message_close('c3710000-0000-0000-0000-0000000000c3');
  EXCEPTION WHEN OTHERS THEN
    v := CASE WHEN SQLERRM LIKE 'HR_MESSAGE_NOT_REPLIED%' THEN 'رُفض' ELSE left(SQLERRM,40) END;
  END;
  PERFORM pg_temp.chk('6.1 ★★★ إغلاقٌ قبل الردّ مرفوض', v, 'رُفض');
END $$;

SELECT public.hr_message_close('c3710000-0000-0000-0000-0000000000c2') \gset cl_
SELECT pg_temp.chk('6.2 وبعد الردّ يُغلَق',
  (SELECT status FROM public.hr_messages
    WHERE id='c3710000-0000-0000-0000-0000000000c2'), 'closed');

SELECT pg_temp.chk('6.3 والمُغلِقُ ولحظتُه مسجَّلان',
  (SELECT CASE WHEN closed_at IS NOT NULL AND closed_by IS NOT NULL
               THEN 'مسجَّلان' ELSE 'ناقصان' END
   FROM public.hr_messages WHERE id='c3710000-0000-0000-0000-0000000000c2'), 'مسجَّلان');

-- ★★★ الإغلاق لا يمحو الردَّ (القيد يسمح بـclosed مع reply؟ لا — يُفرَّغ)
SELECT pg_temp.chk('6.4 ★★★ ملاحظةٌ مقصودة: الإغلاق يُفرِّغ الردَّ بحكم المحفّز',
  (SELECT COALESCE(reply,'NULL') FROM public.hr_messages
    WHERE id='c3710000-0000-0000-0000-0000000000c2'), 'NULL');

-- ══════════════════════════════════════════════════════════════════════
--  ⑦ العطل ⑥: نصوصٌ من مسافات
-- ══════════════════════════════════════════════════════════════════════
DO $$
DECLARE v TEXT := 'قُبِل';
BEGIN
  BEGIN
    INSERT INTO public.hr_messages(tenant_id,employee_id,subject,message)
    SELECT 'a3710000-0000-0000-0000-00000000000a',e.id,'   ','   '
    FROM public.employees e WHERE e.user_id='23710002-0000-0000-0000-000000000002';
  EXCEPTION WHEN OTHERS THEN v := 'رُفض';
  END;
  PERFORM pg_temp.chk('7.1 موضوعٌ ونصٌّ من مسافات مرفوضان', v, 'رُفض');
END $$;

-- ══════════════════════════════════════════════════════════════════════
--  ⑧ العطلان ⑦/④: العبور بين المستأجرين
-- ══════════════════════════════════════════════════════════════════════
DO $$
DECLARE v TEXT := 'قُبِل'; v_eb UUID;
BEGIN
  BEGIN
    SELECT id INTO v_eb FROM public.employees
     WHERE user_id='53710005-0000-0000-0000-000000000005';
    INSERT INTO public.hr_messages(tenant_id,employee_id,subject,message)
    VALUES ('a3710000-0000-0000-0000-00000000000a',v_eb,'عابرة','نصّ');
  EXCEPTION WHEN OTHERS THEN v := 'رُفض';
  END;
  PERFORM pg_temp.chk('8.1 ★★★ رسالةُ ألف بموظفٍ من باء مرفوضة', v, 'رُفض');
END $$;

-- ★★★★ عزلُ الحارسَين: التأكيد 8.1 وحده لا يُثبت أنّ **FK الموظف**
--   مركَّب. المحفّز يملأ `sender_id` من `employees.user_id` — أي من
--   مستأجر باء — فيرفضه `fk_hr_message_sender_tenant` **أولاً**.
--   ⇒ «حارسٌ سابق يمسك الحالة قبل الحارس المقصود» (درس التغطية).
--   نُمرّر `sender_id` صحيحاً من ألف كي يبقى FK الموظف وحده المتّهم.
DO $$
DECLARE v TEXT := 'قُبِل'; v_eb UUID;
BEGIN
  BEGIN
    SELECT id INTO v_eb FROM public.employees
     WHERE user_id='53710005-0000-0000-0000-000000000005';
    INSERT INTO public.hr_messages(tenant_id,employee_id,sender_id,subject,message)
    VALUES ('a3710000-0000-0000-0000-00000000000a',v_eb,
            '23710002-0000-0000-0000-000000000002','عابرةٌ ثانية','نصّ');
  EXCEPTION WHEN OTHERS THEN
    v := CASE WHEN SQLERRM LIKE '%fk_hr_message_employee_tenant%'
              THEN 'رُفض بـFK الموظف' ELSE 'رُفض بـ' || left(SQLERRM,40) END;
  END;
  PERFORM pg_temp.chk('8.1ب ★★★★ وFK الموظف نفسُه هو الرافض (لا حارسٌ سابق)',
                      v, 'رُفض بـFK الموظف');
END $$;

DO $$
DECLARE v TEXT := 'قُبِل';
BEGIN
  BEGIN
    UPDATE public.hr_messages
       SET status='replied', reply='ردٌّ عابر',
           replied_by='43710004-0000-0000-0000-000000000004', replied_at=now()
     WHERE id='c3710000-0000-0000-0000-0000000000c3';
  EXCEPTION WHEN OTHERS THEN v := 'رُفض';
  END;
  PERFORM pg_temp.chk('8.2 ★★★ رادٌّ من مستأجرٍ آخر مرفوض (FK مركَّب)', v, 'رُفض');
END $$;

DO $$
DECLARE v TEXT := 'قُبِل';
BEGIN
  BEGIN
    UPDATE public.hr_messages SET sender_id='43710004-0000-0000-0000-000000000004'
     WHERE id='c3710000-0000-0000-0000-0000000000c3';
  EXCEPTION WHEN OTHERS THEN v := 'رُفض';
  END;
  -- ★ المحفّز يُثبّت sender_id في UPDATE بـCOALESCE(OLD, NEW) ⇒ لا يتغيّر
  PERFORM pg_temp.chk('8.3 ★ المُرسِل ثابتٌ لا يُبدَّل بعد الإنشاء',
    (SELECT sender_id::TEXT FROM public.hr_messages
      WHERE id='c3710000-0000-0000-0000-0000000000c3'),
    '23710002-0000-0000-0000-000000000002');
END $$;

-- ★ حالةٌ من مستأجرٍ آخر
DO $$
DECLARE v TEXT := 'قُبِل';
BEGIN
  BEGIN
    INSERT INTO public.hr_cases(id,tenant_id,employee_id,case_type,subject,description,status)
    SELECT 'f3710000-0000-0000-0000-0000000000f2','b3710000-0000-0000-0000-00000000000b',
           e.id,'general_inquiry','حالةُ باء','نصّ','open'
    FROM public.employees e WHERE e.user_id='53710005-0000-0000-0000-000000000005';
    UPDATE public.hr_messages SET case_id='f3710000-0000-0000-0000-0000000000f2'
     WHERE id='c3710000-0000-0000-0000-0000000000c3';
  EXCEPTION WHEN OTHERS THEN v := 'رُفض';
  END;
  PERFORM pg_temp.chk('8.4 ★★★ ربطٌ بحالةٍ من مستأجرٍ آخر مرفوض', v, 'رُفض');
END $$;

-- ══════════════════════════════════════════════════════════════════════
--  ⑨ العطل ⑨: tenant_id NOT NULL
-- ══════════════════════════════════════════════════════════════════════
SELECT pg_temp.chk('9.1 ★★★ tenant_id صار NOT NULL',
  (SELECT is_nullable FROM information_schema.columns
    WHERE table_schema='public' AND table_name='hr_messages'
      AND column_name='tenant_id'), 'NO');

-- ══════════════════════════════════════════════════════════════════════
--  ⑩ العطل ⑧: اللوح والملخّص — أرقامٌ محسوبةٌ يدوياً
--     الحالة الآن في مستأجر ألف:
--       c1 «استفسار عن الراتب» → مؤرشفة
--       c2 «[استفسار] طلبٌ مرتبط» → closed
--       c3 «بلا ردّ» → new
-- ══════════════════════════════════════════════════════════════════════
SELECT pg_temp.chk('10.1 اللوح النشط يعرض صفَّين (c2 closed + c3 new)',
  (SELECT count(*)::TEXT FROM public.hr_message_board()), '2');

SELECT pg_temp.chk('10.2 المفتوحة = 1 (c3 فقط)',
  (SELECT total_open::TEXT FROM public.hr_message_summary()), '1');

SELECT pg_temp.chk('10.3 غير المقروءة = 1',
  (SELECT unread::TEXT FROM public.hr_message_summary()), '1');

SELECT pg_temp.chk('10.4 المؤرشفة = 1',
  (SELECT archived::TEXT FROM public.hr_message_summary()), '1');

SELECT pg_temp.chk('10.5 المردودُ عليها خلال 30 يوماً = 1 (c1 المؤرشفة)',
  (SELECT replied_30d::TEXT FROM public.hr_message_summary()), '1');

-- ★★★ رصدُ التأخّر — عاجلةٌ عمرُها 30 ساعة
INSERT INTO public.hr_messages(id,tenant_id,employee_id,subject,message,priority,status,created_at)
SELECT 'c3710000-0000-0000-0000-0000000000c4',:TA,e.id,'عاجلةٌ متأخّرة','نصّ','urgent','new',
       now() - INTERVAL '30 hours'
FROM public.employees e WHERE e.user_id=:U1;

SELECT pg_temp.chk('10.6 ★★★ عاجلةٌ بعد 24 ساعة = متأخّرة',
  (SELECT is_overdue::TEXT FROM public.hr_message_board()
    WHERE subject='عاجلةٌ متأخّرة'), 'true');

-- ★ عاديّةٌ بالعمر نفسه ليست متأخّرة (الحدّ 72 ساعة)
INSERT INTO public.hr_messages(id,tenant_id,employee_id,subject,message,priority,status,created_at)
SELECT 'c3710000-0000-0000-0000-0000000000c5',:TA,e.id,'عاديّةٌ بعمرها','نصّ','normal','new',
       now() - INTERVAL '30 hours'
FROM public.employees e WHERE e.user_id=:U1;

SELECT pg_temp.chk('10.7 ★★★ عاديّةٌ بالعمر نفسه ليست متأخّرة (72 ساعة)',
  (SELECT is_overdue::TEXT FROM public.hr_message_board()
    WHERE subject='عاديّةٌ بعمرها'), 'false');

SELECT pg_temp.chk('10.8 والملخّص يعدّ متأخّرةً واحدة',
  (SELECT overdue::TEXT FROM public.hr_message_summary()), '1');

SELECT pg_temp.chk('10.9 age_hours محسوبٌ صحيحاً = 30',
  (SELECT age_hours::TEXT FROM public.hr_message_board()
    WHERE subject='عاجلةٌ متأخّرة'), '30');

-- ★ الترشيح في القاعدة
SELECT pg_temp.chk('10.10 الترشيح بالأولوية يعمل',
  (SELECT count(*)::TEXT FROM public.hr_message_board(NULL,NULL,'urgent')), '1');

SELECT pg_temp.chk('10.11 والبحث بالاسم يعمل',
  (SELECT count(*)::TEXT FROM public.hr_message_board('سالم')), '3');

SELECT pg_temp.chk('10.12 والبحث في الموضوع',
  (SELECT count(*)::TEXT FROM public.hr_message_board('عاجلة')), '1');

-- ★★★★ الترتيب المذيَّل بـ`id`: `created_at DEFAULT now()` طابعُ
--   **المعاملة** لا العبارة ⇒ رسالتان في دفعةٍ واحدةٍ تتساويان
--   فيصير الترتيب غيرَ حتميّ. بلا صفَّين متساويَي الطابع لا يُختبَر
--   التذييلُ أصلاً (درس التغطية · أنجى INV20).
-- ★★★★ الـ`id` **معاكسٌ** لترتيب الإدراج عمداً: بلا التذييل يُعيد
--   Postgres ترتيبَ الإدراج (باء ثمّ ألف) فيخالف المرجع، ومعه
--   يُرتَّب بالـ`id` (e1 = «ألف» أولاً). لولا هذا التعاكس لوافق
--   العكسُ المرجعَ **صدفةً** — نمط «ترتيبٌ وافق المرجع صدفةً».
INSERT INTO public.hr_messages(id,tenant_id,employee_id,subject,message,created_at)
SELECT 'c3710000-0000-0000-0000-0000000000e2',:TA,e.id,'متساويةٌ باء','نصّ',
       TIMESTAMPTZ '2026-01-01 10:00:00+03'
FROM public.employees e WHERE e.user_id=:U1;
INSERT INTO public.hr_messages(id,tenant_id,employee_id,subject,message,created_at)
SELECT 'c3710000-0000-0000-0000-0000000000e1',:TA,e.id,'متساويةٌ ألف','نصّ',
       TIMESTAMPTZ '2026-01-01 10:00:00+03'
FROM public.employees e WHERE e.user_id=:U1;

SELECT pg_temp.chk('10.13 ★★★★ صفّان بالطابع نفسه يُرتَّبان بـid حتماً',
  (SELECT string_agg(subject, '|' ORDER BY rn) FROM (
     SELECT subject, row_number() OVER () AS rn
     FROM public.hr_message_board()
   ) z WHERE subject LIKE 'متساوية%'),
  'متساويةٌ ألف|متساويةٌ باء');

-- ══════════════════════════════════════════════════════════════════════
--  ⑪ فتح الرسالة
-- ══════════════════════════════════════════════════════════════════════
SELECT public.hr_message_mark_read('c3710000-0000-0000-0000-0000000000c4') \gset mr_
SELECT pg_temp.chk('11.1 الفتح ينقل new ⇒ read',
  (SELECT status FROM public.hr_messages
    WHERE id='c3710000-0000-0000-0000-0000000000c4'), 'read');

SELECT pg_temp.chk('11.2 ★ ويسجّل read_at',
  (SELECT CASE WHEN read_at IS NOT NULL THEN 'مسجَّل' ELSE 'مفقود' END
   FROM public.hr_messages WHERE id='c3710000-0000-0000-0000-0000000000c4'), 'مسجَّل');

-- ★★★ الفتح لا يُنزل حالةً متقدّمة
SELECT public.hr_message_mark_read('c3710000-0000-0000-0000-0000000000c2') \gset mr2_
SELECT pg_temp.chk('11.3 ★★★ الفتحُ لا يُنزل «مغلقة» إلى «مقروءة»',
  (SELECT status FROM public.hr_messages
    WHERE id='c3710000-0000-0000-0000-0000000000c2'), 'closed');

-- ══════════════════════════════════════════════════════════════════════
--  ⑫ الجدار (فحصٌ ثابت — التنفيذ الحقيقيّ في -rls.sh)
-- ══════════════════════════════════════════════════════════════════════
SELECT pg_temp.chk('12.1 ★★★ لا سياسة DELETE على hr_messages',
  (SELECT count(*)::TEXT FROM pg_policy
    WHERE polrelid='public.hr_messages'::regclass AND polcmd='d'), '0');

SELECT pg_temp.chk('12.2 ★★★ البوّابة الهجينة RESTRICTIVE',
  (SELECT polpermissive::TEXT FROM pg_policy
    WHERE polrelid='public.hr_messages'::regclass
      AND polname='hybrid_gate_hr_messages'), 'false');

SELECT pg_temp.chk('12.3 البوّابة على وحدة hr',
  (SELECT CASE WHEN pg_get_expr(polqual,polrelid) LIKE '%''hr''%' THEN 'نعم' ELSE 'لا' END
   FROM pg_policy WHERE polrelid='public.hr_messages'::regclass
     AND polname='hybrid_gate_hr_messages'), 'نعم');

SELECT pg_temp.chk('12.4 ★★★ authenticated لا يحذف',
  (SELECT CASE WHEN has_table_privilege('authenticated','public.hr_messages','DELETE')
   THEN 'له' ELSE 'محروم' END), 'محروم');

SELECT pg_temp.chk('12.5 ★★★ anon محرومٌ من الجدول',
  (SELECT CASE WHEN has_table_privilege('anon','public.hr_messages','SELECT')
   THEN 'له' ELSE 'محروم' END), 'محروم');

-- ★★★ pg_default_acl من 0268 ⇒ REVOKE … FROM anon هو الحارس الحقيقيّ
SELECT pg_temp.chk('12.6 ★★★ anon محرومٌ من hr_message_board',
  (SELECT CASE WHEN has_function_privilege('anon',
     'public.hr_message_board(TEXT,TEXT,TEXT,BOOLEAN,INTEGER)','EXECUTE')
   THEN 'له' ELSE 'محروم' END), 'محروم');

SELECT pg_temp.chk('12.7 ★★★ anon محرومٌ من hr_message_reply',
  (SELECT CASE WHEN has_function_privilege('anon',
     'public.hr_message_reply(UUID,TEXT)','EXECUTE')
   THEN 'له' ELSE 'محروم' END), 'محروم');

SELECT pg_temp.chk('12.8 ★★★ anon محرومٌ من hr_message_archive',
  (SELECT CASE WHEN has_function_privilege('anon',
     'public.hr_message_archive(UUID,TEXT)','EXECUTE')
   THEN 'له' ELSE 'محروم' END), 'محروم');

SELECT pg_temp.chk('12.9 ★★★ anon محرومٌ من hr_message_close',
  (SELECT CASE WHEN has_function_privilege('anon',
     'public.hr_message_close(UUID)','EXECUTE')
   THEN 'له' ELSE 'محروم' END), 'محروم');

SELECT pg_temp.chk('12.10 ★★★ anon محرومٌ من hr_message_summary',
  (SELECT CASE WHEN has_function_privilege('anon',
     'public.hr_message_summary()','EXECUTE')
   THEN 'له' ELSE 'محروم' END), 'محروم');

SELECT pg_temp.chk('12.11 ★★★ anon محرومٌ من hr_message_mark_read',
  (SELECT CASE WHEN has_function_privilege('anon',
     'public.hr_message_mark_read(UUID)','EXECUTE')
   THEN 'له' ELSE 'محروم' END), 'محروم');

-- ★★★★ الدوال الستّ SECURITY INVOKER
SELECT pg_temp.chk('12.12 ★★★★ hr_message_board هي SECURITY INVOKER',
  (SELECT prosecdef::TEXT FROM pg_proc
    WHERE oid='public.hr_message_board(TEXT,TEXT,TEXT,BOOLEAN,INTEGER)'::regprocedure), 'false');

SELECT pg_temp.chk('12.13 ★★★★ hr_message_reply هي SECURITY INVOKER',
  (SELECT prosecdef::TEXT FROM pg_proc
    WHERE oid='public.hr_message_reply(UUID,TEXT)'::regprocedure), 'false');

SELECT pg_temp.chk('12.14 hr_message_summary هي SECURITY INVOKER',
  (SELECT prosecdef::TEXT FROM pg_proc
    WHERE oid='public.hr_message_summary()'::regprocedure), 'false');

-- ★★★ فحص نصّ الدالة: المحفّز لا يستطيع إخفاء سقوطه (درس INV35/INV31)
SELECT pg_temp.chk('12.15 ★★★ نصّ hr_message_reply يحتوي حارس is_staff',
  (SELECT CASE WHEN pg_get_functiondef('public.hr_message_reply(UUID,TEXT)'::regprocedure)
                 LIKE '%HR_MESSAGE_FORBIDDEN%' THEN 'موجود' ELSE 'مفقود' END), 'موجود');

SELECT pg_temp.chk('12.16 ★★★★ ونصُّها يُحدّث hr_cases (العطل ⑪)',
  (SELECT CASE WHEN pg_get_functiondef('public.hr_message_reply(UUID,TEXT)'::regprocedure)
                 LIKE '%UPDATE public.hr_cases%' THEN 'موجود' ELSE 'مفقود' END), 'موجود');

SELECT pg_temp.chk('12.17 ★★★ ونصّ اللوح يبني الاسم من profiles',
  (SELECT CASE WHEN pg_get_functiondef(
     'public.hr_message_board(TEXT,TEXT,TEXT,BOOLEAN,INTEGER)'::regprocedure)
                 LIKE '%sp.full_name%' THEN 'موجود' ELSE 'مفقود' END), 'موجود');

SELECT pg_temp.chk('12.18 ★★★ ونصّ الأرشفة يشترط سبباً',
  (SELECT CASE WHEN pg_get_functiondef('public.hr_message_archive(UUID,TEXT)'::regprocedure)
                 LIKE '%HR_MESSAGE_NO_REASON%' THEN 'موجود' ELSE 'مفقود' END), 'موجود');

SELECT pg_temp.chk('12.19 ★★★ والإغلاق يشترط الردَّ أولاً',
  (SELECT CASE WHEN pg_get_functiondef('public.hr_message_close(UUID)'::regprocedure)
                 LIKE '%HR_MESSAGE_NOT_REPLIED%' THEN 'موجود' ELSE 'مفقود' END), 'موجود');

-- ══════════════════════════════════════════════════════════════════════
--  النتيجة
-- ══════════════════════════════════════════════════════════════════════
\set QUIET off
\echo ''
\echo '════════════════ نتائج verify-hr-communication-0371 ════════════════'
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
  IF v > 0 THEN RAISE EXCEPTION 'VERIFY_0371_FAILED: % تأكيداً فاشلاً', v; END IF;
  RAISE NOTICE '✅ verify-hr-communication-0371: كل التأكيدات ناجحة';
END $$;

ROLLBACK;
