-- ============================================================================
-- verify-attendance-vocabulary-0344.sql
--
-- بوابة الموظف: مفردات حالة الحضور · ربط الإجازة · طلبات التصحيح.
--
-- منهجية: يعمل بدور postgres (BYPASSRLS) فيقيس **منطق الدوال**.
--   العزل عبر RLS الحقيقي في verify-attendance-vocabulary-0344-rls.sh.
--
-- ★★★ درس التغطية — المرة التاسعة:
--   `src/test/myAttendanceContract.test.ts:87` كان ينسخ نصّ 0337
--   حرفياً ويطالب بمطابقته:
--     expect(body).toMatch(/status IN \('في الوقت','متأخر','حاضر'\)/)
--   فمرّ لأن الدالة تساوي نفسها. لو كتبتُ 'أبجد' لمرّ أيضاً.
--
--   لذلك **كل** تأكيد هنا يقارن بـرقم محسوب يدوياً في التعليق قبل
--   التشغيل، من بيانات معروفة سلفاً — لا من الدالة ولا من نصّها.
--
-- ─── حقائق بنيوية مُحقَّقة ─────────────────────────────────────────────────
--   attendance_summary: UNIQUE (tenant_id, employee_id, shift_date)
--     status TEXT NOT NULL DEFAULT 'غائب' · لا CHECK قبل 0344
--   holidays: tenant_id · date · name NOT NULL · applies_to NOT NULL
--   hr_cases: tenant_id NOT NULL بلا default · case_type NOT NULL
--     CHECK على status/priority/channel — **لا CHECK على case_type**
--   employees.id ≠ profiles.id · محفّز 0317 يُنشئ سجلّ الموظف
--   current_user_is_staff() = admin·hr·developer·it_admin **فقط**
-- ============================================================================
\set ON_ERROR_STOP on

DO $$
DECLARE
  v_t     UUID := gen_random_uuid();
  v_tb    UUID := gen_random_uuid();
  v_u     UUID := gen_random_uuid();   -- الموظف
  v_umgr  UUID := gen_random_uuid();   -- المدير
  v_uhr   UUID := gen_random_uuid();   -- الموارد
  v_ub    UUID := gen_random_uuid();   -- موظف مستأجر آخر
  v_d     UUID := gen_random_uuid();
  v_e     UUID;
  v_emgr  UUID;
  v_ehr   UUID;
  v_eb    UUID;
  v_n     INT;
  v_num   NUMERIC;
  v_txt   TEXT;
  v_err   TEXT;
  v_pass  INT := 0;
  r       RECORD;
BEGIN
  -- ═══ التجهيز ══════════════════════════════════════════════════════════
  INSERT INTO public.tenants(id,name,name_ar,slug) VALUES
    (v_t ,'A44','حضور أ','a44-'||substr(v_t::text ,1,8)),
    (v_tb,'B44','حضور ب','b44-'||substr(v_tb::text,1,8));
  INSERT INTO auth.users(id,email) VALUES
    (v_u   ,'e-'||substr(v_u::text   ,1,8)||'@a44.io'),
    (v_umgr,'m-'||substr(v_umgr::text,1,8)||'@a44.io'),
    (v_uhr ,'h-'||substr(v_uhr::text ,1,8)||'@a44.io'),
    (v_ub  ,'b-'||substr(v_ub::text  ,1,8)||'@a44.io');
  INSERT INTO public.departments(id,tenant_id,name_ar) VALUES (v_d,v_t,'الإنتاج');
  INSERT INTO public.profiles(id,tenant_id,full_name,role) VALUES
    (v_u   ,v_t ,'سعد المُحقَّق'   ,'employee'),
    (v_umgr,v_t ,'مدير الحضور'     ,'manager'),
    (v_uhr ,v_t ,'موارد الحضور'    ,'hr'),
    (v_ub  ,v_tb,'موظف المستأجر ب','employee');

  SELECT id INTO v_e    FROM public.employees WHERE user_id=v_u    AND tenant_id=v_t;
  SELECT id INTO v_emgr FROM public.employees WHERE user_id=v_umgr AND tenant_id=v_t;
  SELECT id INTO v_ehr  FROM public.employees WHERE user_id=v_uhr  AND tenant_id=v_t;
  SELECT id INTO v_eb   FROM public.employees WHERE user_id=v_ub   AND tenant_id=v_tb;
  UPDATE public.employees SET department_id=v_d WHERE id=v_e;

  ASSERT v_e IS NOT NULL AND v_emgr IS NOT NULL AND v_ehr IS NOT NULL AND v_eb IS NOT NULL,
    '0.1 ★ محفّز 0317 لم يُنشئ سجلّات الموظفين — التجهيز باطل';
  v_pass := v_pass + 1;

  ASSERT v_e <> v_u,
    '0.2 ★★ employees.id = profiles.id ⇒ الاختبار لا يقيس شيئاً';
  v_pass := v_pass + 1;

  -- ═══════════════════════════════════════════════════════════════════════
  -- ① التصنيف المركزي — القيم الثماني واحدةً واحدة
  --
  --   ★ لا حلقة على مصفوفة: الحلقة تُخفي أيّ عنصر فشل. كل قيمة تأكيد
  --     مستقلّ برسالة تُسمّيها.
  -- ═══════════════════════════════════════════════════════════════════════
  ASSERT public.attendance_status_bucket('حضور_بوقت') = 'present',
    format('1.1 حضور_بوقت ⇒ %s (متوقَّع present)', public.attendance_status_bucket('حضور_بوقت'));
  v_pass := v_pass + 1;
  ASSERT public.attendance_status_bucket('متأخر') = 'present',
    format('1.2 متأخر ⇒ %s', public.attendance_status_bucket('متأخر'));
  v_pass := v_pass + 1;
  ASSERT public.attendance_status_bucket('زمنية_معتمدة') = 'present',
    format('1.3 زمنية_معتمدة ⇒ %s', public.attendance_status_bucket('زمنية_معتمدة'));
  v_pass := v_pass + 1;
  ASSERT public.attendance_status_bucket('زمنية_انتظار') = 'present',
    format('1.4 ★ زمنية_انتظار ⇒ %s — بصم فحضر، والاعتماد إداريّ لاحق',
           public.attendance_status_bucket('زمنية_انتظار'));
  v_pass := v_pass + 1;
  ASSERT public.attendance_status_bucket('غائب') = 'absent',
    format('1.5 غائب ⇒ %s', public.attendance_status_bucket('غائب'));
  v_pass := v_pass + 1;
  ASSERT public.attendance_status_bucket('مجاز') = 'leave',
    format('1.6 مجاز ⇒ %s', public.attendance_status_bucket('مجاز'));
  v_pass := v_pass + 1;
  ASSERT public.attendance_status_bucket('إجازة_انتظار') = 'leave',
    format('1.7 ★ إجازة_انتظار ⇒ %s — لم يبصم، فليس حضوراً',
           public.attendance_status_bucket('إجازة_انتظار'));
  v_pass := v_pass + 1;
  ASSERT public.attendance_status_bucket('عطلة') = 'leave',
    format('1.8 عطلة ⇒ %s', public.attendance_status_bucket('عطلة'));
  v_pass := v_pass + 1;

  -- ★★★ المفردات المختلقة في 0337 يجب أن تكون **مجهولة**.
  --   هذا تأكيد موجب لا سلبي: لو صنّفناها present لعادت المشكلة مقلوبة.
  ASSERT public.attendance_status_bucket('في الوقت') = 'unknown',
    '1.9 ★★★ «في الوقت» من مفردات 0337 المختلقة — يجب أن تكون unknown';
  v_pass := v_pass + 1;
  ASSERT public.attendance_status_bucket('حاضر') = 'unknown',
    '1.10 ★★★ «حاضر» من مفردات 0337 المختلقة — يجب أن تكون unknown';
  v_pass := v_pass + 1;
  ASSERT public.attendance_status_bucket('إجازة') = 'unknown',
    '1.11 ★★★ «إجازة» (بلا لاحقة) من مفردات 0337 — يجب أن تكون unknown';
  v_pass := v_pass + 1;
  ASSERT public.attendance_status_bucket(NULL) = 'unknown',
    '1.12 NULL يجب أن يكون unknown لا NULL (وإلا سقط count المُرشَّح)';
  v_pass := v_pass + 1;

  -- ★★ الدالة IMMUTABLE — شرط استعمالها في فهرس/CHECK مستقبلاً
  SELECT p.provolatile INTO v_txt FROM pg_proc p
   WHERE p.proname = 'attendance_status_bucket';
  ASSERT v_txt = 'i', format('1.13 attendance_status_bucket ليست IMMUTABLE (provolatile=%s)', v_txt);
  v_pass := v_pass + 1;

  -- ═══════════════════════════════════════════════════════════════════════
  -- ② إحصاءات الشهر — الأرقام محسوبة يدوياً قبل التشغيل
  --
  --   بيانات مارس 2026 (سبعة أيام):
  --     3/1 حضور_بوقت    8.00 ساعات ·  0 د تأخير ·  0 د إضافي
  --     3/2 حضور_بوقت    8.00 ساعات ·  0 د       ·  0 د
  --     3/3 متأخر         7.00 ساعات · 30 د       ·  0 د
  --     3/4 زمنية_معتمدة 6.00 ساعات ·  0 د       · 45 د
  --     3/5 غائب          0.00 ساعات ·  0 د       ·  0 د
  --     3/8 مجاز          0.00 ساعات ·  0 د       ·  0 د
  --     3/9 عطلة          0.00 ساعات ·  0 د       ·  0 د
  --
  --   الحساب اليدوي:
  --     total   = 7
  --     present = 4  (حضور_بوقت ×2 + متأخر + زمنية_معتمدة)
  --     late    = 1  ('متأخر' وحدها — زمنية_معتمدة حضور لا تأخير)
  --     absent  = 1
  --     leave   = 2  (مجاز + عطلة)
  --     hours   = 8+8+7+6 = 29.00
  --     avg     = 29.00 / 4 = 7.25   ← ليس 29/7 ولا 8.00
  --     lateMin = 30
  --     overtime= 45
  --     unknown = 0
  --
  --   ★★ قبل 0344 كانت الدالة تُرجع: present=1 late=1 leave=0 avg=7.00
  -- ═══════════════════════════════════════════════════════════════════════
  INSERT INTO public.attendance_summary
    (tenant_id,employee_id,shift_date,status,total_hours,late_minutes,
     early_leave_minutes,overtime_minutes)
  VALUES
    (v_t,v_e,make_date(2026,3,1),'حضور_بوقت'   ,8.00, 0,0, 0),
    (v_t,v_e,make_date(2026,3,2),'حضور_بوقت'   ,8.00, 0,0, 0),
    (v_t,v_e,make_date(2026,3,3),'متأخر'        ,7.00,30,0, 0),
    (v_t,v_e,make_date(2026,3,4),'زمنية_معتمدة',6.00, 0,0,45),
    (v_t,v_e,make_date(2026,3,5),'غائب'         ,0.00, 0,0, 0),
    (v_t,v_e,make_date(2026,3,8),'مجاز'         ,0.00, 0,0, 0),
    (v_t,v_e,make_date(2026,3,9),'عطلة'         ,0.00, 0,0, 0);

  -- ★★★ ضجيج مستأجر آخر — بـ**نفس employee_id** عمداً.
  --
  --   درس التغطية (المرة العاشرة): عكسُ «إسقاط ترشيح المستأجر» لم
  --   يُسقط الاختبار لأن employee_id UUID فريد عالمياً، فترشيحه وحده
  --   يُقصي المستأجر الآخر **ضمناً** — والتأكيد يمرّ لسبب خاطئ.
  --   الدليل الوحيد على أن `a.tenant_id = v_tenant` يعمل هو صفٌّ
  --   يحمل employee_id نفسه في مستأجر آخر.
  --
  --   ★ نُدخله بحقن مباشر: FK يمنع employees.id من الانتماء لمستأجرين،
  --     لكن attendance_summary.tenant_id عمود مستقلّ لا قيد مركّب عليه.
  INSERT INTO public.attendance_summary
    (tenant_id,employee_id,shift_date,status,total_hours)
  VALUES
    (v_tb,v_e ,make_date(2026,3,1),'حضور_بوقت',12.00),
    (v_tb,v_e ,make_date(2026,3,2),'حضور_بوقت',12.00),
    (v_tb,v_eb,make_date(2026,3,1),'حضور_بوقت',12.00);

  -- ★★ وضجيج زميل في **نفس المستأجر** — ترشيح employee_id وحده
  --   لا يكفي دليلاً لأن UUID فريد عالمياً (درس 0343)
  INSERT INTO public.attendance_summary
    (tenant_id,employee_id,shift_date,status,total_hours)
  VALUES
    (v_t,v_emgr,make_date(2026,3,1),'حضور_بوقت',10.00),
    (v_t,v_emgr,make_date(2026,3,3),'غائب'      , 0.00);

  -- ★★ وشهر مجاور: الترشيح الزمني
  INSERT INTO public.attendance_summary
    (tenant_id,employee_id,shift_date,status,total_hours)
  VALUES
    (v_t,v_e,make_date(2026,2,25),'حضور_بوقت',9.00),
    (v_t,v_e,make_date(2026,4, 1),'حضور_بوقت',9.00);

  PERFORM set_config('request.jwt.claim.sub', v_u::text, TRUE);

  SELECT * INTO r FROM public.my_attendance_month_stats(2026,3);

  ASSERT r.out_total = 7,
    format('2.1 total = %s (متوقَّع 7 — ضجيج المستأجر/الزميل/الشهر تسرّب)', r.out_total);
  v_pass := v_pass + 1;

  ASSERT r.out_present = 4,
    format('2.2 ★★★ present = %s (متوقَّع 4). قبل 0344 كانت 1 — الموظف '
           'الذي حضر أربعة أيام يرى «حضور: 1»', r.out_present);
  v_pass := v_pass + 1;

  ASSERT r.out_late = 1,
    format('2.3 ★ late = %s (متوقَّع 1 — «متأخر» وحدها لا زمنية_معتمدة)', r.out_late);
  v_pass := v_pass + 1;

  ASSERT r.out_absent = 1,
    format('2.4 absent = %s (متوقَّع 1)', r.out_absent);
  v_pass := v_pass + 1;

  ASSERT r.out_leave = 2,
    format('2.5 ★★★ leave = %s (متوقَّع 2: مجاز + عطلة). قبل 0344 كانت 0 '
           '— اليومان يتبخّران من كل خانة', r.out_leave);
  v_pass := v_pass + 1;

  ASSERT r.out_total_hours = 29.00,
    format('2.6 totalHours = %s (متوقَّع 29.00)', r.out_total_hours);
  v_pass := v_pass + 1;

  -- ★★★ التأكيد الأهمّ: 7.25 قيمة **مستقلّة** لا تظهر في أي بيان إدراج
  --   ولا في نصّ الدالة. 29/7=4.14 و29/4=7.25 و8.00 (سلوك 0337).
  ASSERT r.out_avg_hours = 7.25,
    format('2.7 ★★★ avgHours = %s (متوقَّع 7.25 = 29.00/4 أيام حضور). '
           '4.14 يعني القسمة على كل الأيام · 7.00 يعني سلوك 0337',
           r.out_avg_hours);
  v_pass := v_pass + 1;

  ASSERT r.out_late_minutes = 30,
    format('2.8 lateMinutes = %s (متوقَّع 30)', r.out_late_minutes);
  v_pass := v_pass + 1;

  ASSERT r.out_overtime = 45,
    format('2.9 overtime = %s (متوقَّع 45)', r.out_overtime);
  v_pass := v_pass + 1;

  ASSERT r.out_unknown = 0,
    format('2.10 unknown = %s (متوقَّع 0 — كل الحالات ضمن المفردات)', r.out_unknown);
  v_pass := v_pass + 1;

  -- ★★ الأجزاء تُطابق الكلّ: حارس ضد تصنيف يبتلع صفّاً
  ASSERT r.out_present + r.out_absent + r.out_leave + r.out_unknown = r.out_total,
    format('2.11 ★★ present+absent+leave+unknown = %s ≠ total = %s ⇒ صفّ ضاع',
           r.out_present + r.out_absent + r.out_leave + r.out_unknown, r.out_total);
  v_pass := v_pass + 1;

  -- ═══ ② -ب الشهر المجاور — قيم مختلفة تماماً ═══
  SELECT * INTO r FROM public.my_attendance_month_stats(2026,2);
  ASSERT r.out_total = 1 AND r.out_present = 1 AND r.out_total_hours = 9.00,
    format('2.12 فبراير: total=%s present=%s hours=%s (متوقَّع 1/1/9.00)',
           r.out_total, r.out_present, r.out_total_hours);
  v_pass := v_pass + 1;

  -- ═══ ② -ج شهر فارغ ⇒ صفّ أصفار لا «لا شيء» ═══
  --   ★ شهر بلا بيانات يُرجع صفّ أصفار عبر المسار العادي (count=0)،
  --     فلا يُميّز الفرع الحارس. الفرع يُختبر بمُدخَل **غير صالح**:
  --     شهر 13 يخرج من الفرع الحارس وحده.
  SELECT count(*) INTO v_n FROM public.my_attendance_month_stats(2026,7);
  ASSERT v_n = 1, format('2.13 ★ شهر فارغ أعاد %s صفّاً (متوقَّع 1 صفّ أصفار)', v_n);
  v_pass := v_pass + 1;
  SELECT * INTO r FROM public.my_attendance_month_stats(2026,7);
  ASSERT r.out_total = 0 AND r.out_avg_hours = 0,
    format('2.14 شهر فارغ: total=%s avg=%s (متوقَّع 0/0)', r.out_total, r.out_avg_hours);
  v_pass := v_pass + 1;

  -- ★★★ الفرع الحارس: شهر 13 · شهر 0 · سنة 1800 — كلّها تُرجع **صفّاً**
  --   لا «لا شيء». الواجهة تعرض البطاقات دائماً؛ غياب الصفّ يجعل
  --   statsRow undefined ⇒ NaN على الشاشة.
  SELECT count(*) INTO v_n FROM public.my_attendance_month_stats(2026,13);
  ASSERT v_n = 1,
    format('2.14a ★★★ شهر 13 أعاد %s صفّاً (متوقَّع 1 صفّ أصفار لا RETURN فارغ)', v_n);
  v_pass := v_pass + 1;
  SELECT count(*) INTO v_n FROM public.my_attendance_month_stats(2026,0);
  ASSERT v_n = 1, format('2.14b شهر 0 أعاد %s صفّاً (متوقَّع 1)', v_n);
  v_pass := v_pass + 1;
  SELECT count(*) INTO v_n FROM public.my_attendance_month_stats(1800,3);
  ASSERT v_n = 1, format('2.14c سنة 1800 أعادت %s صفّاً (متوقَّع 1)', v_n);
  v_pass := v_pass + 1;
  SELECT * INTO r FROM public.my_attendance_month_stats(2026,13);
  ASSERT r.out_total = 0 AND r.out_present = 0 AND r.out_unknown = 0,
    format('2.14d شهر 13: total=%s present=%s (متوقَّع 0/0)', r.out_total, r.out_present);
  v_pass := v_pass + 1;

  -- ═══ ② -د الحالة المجهولة تُعدّ ولا تُبتلع ═══
  --
  --   ★★★ درس تغطية مُكتشَف في هذه الجولة نفسها: النسخة الأولى من هذا
  --     القسم كانت تُسقط القيد ثم **تعيد بناءه بنصّه الصحيح حرفياً**.
  --     فكان الاختبار يُصلح ما يفحصه: عكسُ القيد في المايجريشن (تفريغه
  --     أو حشوه بمفردات 0337) لم يُسقط شيئاً لأن الاختبار يعيد كتابته
  --     سليماً قبل أن يفحصه. ثلاثة عكوس (⑦.1 ⑦.2 ⑦.3) مرّت لهذا السبب.
  --
  --   ★ الحلّ: تعطيلٌ لا هدم. `SET CONSTRAINTS` لا يعمل مع CHECK،
  --     فنستعمل `ALTER TABLE ... DISABLE TRIGGER ALL`؟ لا — CHECK ليس
  --     محفّزاً. الطريقة الصحيحة: نُدرج الصفّ المجهول في **معاملة
  --     فرعية** بعد إسقاط القيد، ثم نستعيده بـ`pg_get_constraintdef`
  --     — أي بالنصّ **الذي وجدناه** لا بنصّ نكتبه نحن.
  SELECT pg_get_constraintdef(oid) INTO v_txt FROM pg_constraint
   WHERE conrelid='public.attendance_summary'::regclass
     AND conname='attendance_summary_status_vocab';
  ASSERT v_txt IS NOT NULL, '2.14b قيد المفردات غير موجود قبل الالتقاط';

  ALTER TABLE public.attendance_summary DROP CONSTRAINT attendance_summary_status_vocab;
  INSERT INTO public.attendance_summary(tenant_id,employee_id,shift_date,status,total_hours)
    VALUES (v_t,v_e,make_date(2026,3,10),'في الوقت',5.00);
  EXECUTE format(
    'ALTER TABLE public.attendance_summary ADD CONSTRAINT %I %s',
    'attendance_summary_status_vocab', v_txt);

  SELECT * INTO r FROM public.my_attendance_month_stats(2026,3);
  ASSERT r.out_unknown = 1,
    format('2.15 ★★★ unknown = %s (متوقَّع 1) — «في الوقت» يجب أن تُكشف '
           'لا أن تُبتلع صامتة كما فعل 0337', r.out_unknown);
  v_pass := v_pass + 1;
  ASSERT r.out_present = 4,
    format('2.16 ★★ present = %s — الحالة المجهولة لا تُحتسب حضوراً', r.out_present);
  v_pass := v_pass + 1;
  ASSERT r.out_avg_hours = 7.25,
    format('2.17 ★★ avg = %s — 5.00 ساعات المجهولة لا تدخل البسط '
           '(لو دخلت لصارت 34/4=8.50)', r.out_avg_hours);
  v_pass := v_pass + 1;
  ASSERT r.out_total = 8,
    format('2.18 total = %s (متوقَّع 8) — المجهول يُعدّ في الإجمالي', r.out_total);
  v_pass := v_pass + 1;

  DELETE FROM public.attendance_summary
   WHERE tenant_id=v_t AND employee_id=v_e AND shift_date=make_date(2026,3,10);

  -- ═══════════════════════════════════════════════════════════════════════
  -- ③ التتابع — محسوب يدوياً
  --
  --   بعد ترشيح present/absent فقط (مجاز/عطلة تُتخطّى)، ومن الأحدث:
  --     4/1  present   ← الأحدث
  --     3/4  present
  --     3/3  present
  --     3/2  present
  --     3/1  present
  --     2/25 present
  --     3/5  absent  ← بينها!
  --
  --   بالترتيب DESC الحقيقي: 4/1 · 3/5(absent) · 3/4 · 3/3 · 3/2 · 3/1 · 2/25
  --     current = 1   (4/1 وحده قبل غياب 3/5)
  --     longest = 5   (3/4·3/3·3/2·3/1·2/25 بعد الغياب نزولاً)
  --     lastAbsence = 2026-03-05
  --
  --   ★★ قبل 0344: current=0 longest=1 — لأن حضور_بوقت وزمنية_معتمدة
  --      كانتا خارج القائمة البيضاء فلم يبقَ إلا 'متأخر' (3/3) وحدها.
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT * INTO r FROM public.my_attendance_streak();

  ASSERT r.out_current_streak = 1,
    format('3.1 ★★ current = %s (متوقَّع 1: يوم 4/1 قبل غياب 3/5). '
           'قبل 0344 كانت 0', r.out_current_streak);
  v_pass := v_pass + 1;

  ASSERT r.out_longest_streak = 5,
    format('3.2 ★★★ longest = %s (متوقَّع 5: 3/4·3/3·3/2·3/1·2/25). '
           'قبل 0344 كانت 1 — حضور_بوقت وزمنية_معتمدة خارج القائمة',
           r.out_longest_streak);
  v_pass := v_pass + 1;

  ASSERT r.out_last_absence = make_date(2026,3,5),
    format('3.3 lastAbsence = %s (متوقَّع 2026-03-05)', r.out_last_absence);
  v_pass := v_pass + 1;

  -- ═══ ③ -ب الإجازة لا تكسر ولا تُحتسب ═══
  --
  --   ★★★ درس تغطية: النسخة الأولى وضعت يومَي الإجازة في 3/6 و3/7 —
  --     أي **بين** غياب 3/5 وحضور 4/1 نزولاً. وهناك السلسلة مكسورة
  --     أصلاً بالغياب، فسواء كسرت الإجازةُ أم لم تكسر فالنتيجة واحدة:
  --     عكسُ «الإجازة تكسر السلسلة» لم يُسقط شيئاً.
  --
  --   ★ الموضع الحاسم هو **داخل** سلسلة حضور متّصلة: نضع الإجازة في
  --     3/2 (بين حضور 3/1 و3/3) بعد إزالة سجلّ الحضور هناك. عندئذ:
  --       • لو تخطّت الإجازةُ ⇒ 3/1·3/3·3/4 + 2/25 تبقى سلسلةً واحدة
  --       • لو كسرت          ⇒ تنقسم إلى قسمين فينخفض longest
  --       • لو احتُسبت حضوراً ⇒ يرتفع longest
  --
  --   الحساب اليدوي بعد التعديل — الصفوف المُرشَّحة (present/absent)
  --   من الأحدث: 4/1 · 3/5(absent) · 3/4 · 3/3 · 3/1 · 2/25
  --     current = 1 · longest = 4 (3/4·3/3·3/1·2/25)
  DELETE FROM public.attendance_summary
   WHERE tenant_id=v_t AND employee_id=v_e AND shift_date=make_date(2026,3,2);
  INSERT INTO public.attendance_summary(tenant_id,employee_id,shift_date,status,total_hours)
  VALUES (v_t,v_e,make_date(2026,3,2),'مجاز',0);

  SELECT * INTO r FROM public.my_attendance_streak();
  ASSERT r.out_longest_streak = 4,
    format('3.4 ★★★ longest وإجازةٌ داخل السلسلة = %s (متوقَّع 4: '
           '3/4·3/3·3/1·2/25 متّصلة عبر الإجازة). أقلّ يعني أنها تكسر · '
           'أكثر يعني أنها تُحتسب حضوراً', r.out_longest_streak);
  v_pass := v_pass + 1;
  ASSERT r.out_current_streak = 1,
    format('3.5 ★ current = %s (متوقَّع 1: يوم 4/1)', r.out_current_streak);
  v_pass := v_pass + 1;

  -- ★★ و'إجازة_انتظار' مثلها — داخل السلسلة نفسها
  UPDATE public.attendance_summary SET status='إجازة_انتظار'
   WHERE tenant_id=v_t AND employee_id=v_e AND shift_date=make_date(2026,3,2);
  SELECT * INTO r FROM public.my_attendance_streak();
  ASSERT r.out_longest_streak = 4,
    format('3.5a ★★ إجازة_انتظار داخل السلسلة: longest = %s (متوقَّع 4)',
           r.out_longest_streak);
  v_pass := v_pass + 1;

  -- ★★ و'عطلة' مثلها
  UPDATE public.attendance_summary SET status='عطلة'
   WHERE tenant_id=v_t AND employee_id=v_e AND shift_date=make_date(2026,3,2);
  SELECT * INTO r FROM public.my_attendance_streak();
  ASSERT r.out_longest_streak = 4,
    format('3.5b ★★ عطلة داخل السلسلة: longest = %s (متوقَّع 4)',
           r.out_longest_streak);
  v_pass := v_pass + 1;

  -- ★★★ وبالمقابل: غيابٌ في الموضع نفسه **يجب** أن يكسر ⇒ longest=2
  --   (3/4·3/3 من جهة، و2/25 وحده من الأخرى)
  UPDATE public.attendance_summary SET status='غائب'
   WHERE tenant_id=v_t AND employee_id=v_e AND shift_date=make_date(2026,3,2);
  SELECT * INTO r FROM public.my_attendance_streak();
  ASSERT r.out_longest_streak = 2,
    format('3.5c ★★★ غيابٌ في الموضع نفسه: longest = %s (متوقَّع 2). '
           '4 يعني أن الغياب لا يكسر — وهو عطل 0337 الأصلي',
           r.out_longest_streak);
  v_pass := v_pass + 1;

  -- استرجاع الحالة الأصلية (حضور_بوقت 8.00 في 3/2)
  UPDATE public.attendance_summary SET status='حضور_بوقت', total_hours=8.00
   WHERE tenant_id=v_t AND employee_id=v_e AND shift_date=make_date(2026,3,2);

  -- ═══ ③ -ج التتابع لا يرى الزميل ═══
  --   للمدير في نفس المستأجر: 3/1 present · 3/3 absent
  --   ⇒ current=0 · longest=1 · lastAbsence=3/3 — قيم **مختلفة تماماً**
  PERFORM set_config('request.jwt.claim.sub', v_umgr::text, TRUE);
  SELECT * INTO r FROM public.my_attendance_streak();
  ASSERT r.out_last_absence = make_date(2026,3,3),
    format('3.6 ★★ تتابع المدير: lastAbsence = %s (متوقَّع 2026-03-03). '
           '2026-03-05 يعني أنه يرى بيانات الموظف', r.out_last_absence);
  v_pass := v_pass + 1;
  ASSERT r.out_longest_streak = 1,
    format('3.7 تتابع المدير: longest = %s (متوقَّع 1)', r.out_longest_streak);
  v_pass := v_pass + 1;

  PERFORM set_config('request.jwt.claim.sub', v_u::text, TRUE);

  -- ═══════════════════════════════════════════════════════════════════════
  -- ④ ربط الإجازة بالحضور
  -- ═══════════════════════════════════════════════════════════════════════

  -- ★★ الموظف نفسه لا يطبّق إجازته على الحضور
  BEGIN
    PERFORM public.apply_leave_to_attendance(v_e, make_date(2026,5,4), make_date(2026,5,6));
    RAISE EXCEPTION 'SENTINEL_41';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    ASSERT v_err <> 'SENTINEL_41',
      '4.1 ★★★ الموظف طبّق إجازته على حضوره بنفسه — ثغرة صلاحية';
    ASSERT v_err LIKE '%غير مصرَّح%',
      format('4.1 رُفض بسبب غير متوقَّع: %s', v_err);
    v_pass := v_pass + 1;
  END;

  -- ★ المدير يطبّق — 4 و5 و6 مايو 2026 (اثنين·ثلاثاء·أربعاء، لا جمعة)
  PERFORM set_config('request.jwt.claim.sub', v_umgr::text, TRUE);
  SELECT public.apply_leave_to_attendance(v_e, make_date(2026,5,4), make_date(2026,5,6))
    INTO v_n;
  ASSERT v_n = 3, format('4.2 أيام مطبَّقة = %s (متوقَّع 3)', v_n);
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM public.attendance_summary
   WHERE tenant_id=v_t AND employee_id=v_e AND status='مجاز'
     AND shift_date BETWEEN make_date(2026,5,4) AND make_date(2026,5,6);
  ASSERT v_n = 3,
    format('4.3 ★★★ صفوف «مجاز» في القاعدة = %s (متوقَّع 3). '
           'قبل 0344 كان الإدراج يفشل: null value in column "tenant_id"', v_n);
  v_pass := v_pass + 1;

  -- ★★ tenant_id مُلئ صحيحاً — لا NULL ولا مستأجر آخر
  SELECT count(*) INTO v_n FROM public.attendance_summary
   WHERE employee_id=v_e AND shift_date=make_date(2026,5,4) AND tenant_id=v_t;
  ASSERT v_n = 1, '4.4 ★★ tenant_id لم يُملأ بقيمة المستأجر الصحيحة';
  v_pass := v_pass + 1;

  -- ═══ ④ -ب الجمعة تُتخطّى ═══
  --   1 مايو 2026 جمعة · 2 سبت · 3 أحد ⇒ من 1 إلى 3 = يومان لا ثلاثة
  ASSERT EXTRACT(DOW FROM make_date(2026,5,1)) = 5,
    '4.5 ★ افتراض الاختبار خاطئ: 2026-05-01 ليست جمعة';
  v_pass := v_pass + 1;
  SELECT public.apply_leave_to_attendance(v_e, make_date(2026,5,1), make_date(2026,5,3))
    INTO v_n;
  ASSERT v_n = 2,
    format('4.6 ★★ من 1 إلى 3 مايو = %s يوم (متوقَّع 2 — الجمعة تُتخطّى)', v_n);
  v_pass := v_pass + 1;
  SELECT count(*) INTO v_n FROM public.attendance_summary
   WHERE tenant_id=v_t AND employee_id=v_e AND shift_date=make_date(2026,5,1);
  ASSERT v_n = 0, '4.7 ★★ أُنشئ صفّ ليوم الجمعة';
  v_pass := v_pass + 1;

  -- ═══ ④ -ج العطلة الرسمية تُتخطّى ═══
  INSERT INTO public.holidays(tenant_id,date,name,applies_to)
    VALUES (v_t, make_date(2026,5,11), 'عيد مُحقَّق', 'all');
  SELECT public.apply_leave_to_attendance(v_e, make_date(2026,5,11), make_date(2026,5,12))
    INTO v_n;
  ASSERT v_n = 1,
    format('4.8 ★★ من 11 إلى 12 مايو = %s (متوقَّع 1 — 11 عطلة رسمية)', v_n);
  v_pass := v_pass + 1;
  SELECT count(*) INTO v_n FROM public.attendance_summary
   WHERE tenant_id=v_t AND employee_id=v_e AND shift_date=make_date(2026,5,11);
  ASSERT v_n = 0, '4.9 ★★ أُنشئ صفّ ليوم العطلة الرسمية';
  v_pass := v_pass + 1;

  -- ═══ ④ -د يوم فيه حضور فعليّ لا يُطمس بلا داعٍ ═══
  --   ★ نُدرج يوماً بحضور وبصمة ثم نطبّق إجازةً عليه: الحالة تتغيّر إلى
  --     'مجاز' (الاعتماد قرار إداريّ) لكن **البصمة والساعات تبقى**.
  INSERT INTO public.attendance_summary
    (tenant_id,employee_id,shift_date,status,check_in,total_hours)
  VALUES (v_t,v_e,make_date(2026,5,18),'حضور_بوقت',
          '2026-05-18 08:00:00+03'::TIMESTAMPTZ, 8.00);
  SELECT public.apply_leave_to_attendance(v_e, make_date(2026,5,18), make_date(2026,5,18))
    INTO v_n;
  SELECT status, check_in, total_hours INTO r
    FROM public.attendance_summary
   WHERE tenant_id=v_t AND employee_id=v_e AND shift_date=make_date(2026,5,18);
  ASSERT r.status = 'مجاز',
    format('4.10 الحالة بعد التطبيق = %s (متوقَّع مجاز)', r.status);
  v_pass := v_pass + 1;
  ASSERT r.check_in IS NOT NULL AND r.total_hours = 8.00,
    format('4.11 ★★ البصمة/الساعات ضاعت: check_in=%s hours=%s', r.check_in, r.total_hours);
  v_pass := v_pass + 1;

  -- ═══ ④ -هـ عبور المستأجرات ممنوع ═══
  BEGIN
    PERFORM public.apply_leave_to_attendance(v_eb, make_date(2026,5,4), make_date(2026,5,4));
    RAISE EXCEPTION 'SENTINEL_412';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    ASSERT v_err <> 'SENTINEL_412',
      '4.12 ★★★ مدير المستأجر أ طبّق إجازة على موظف المستأجر ب';
    ASSERT v_err LIKE '%ليس ضمن هذا المستأجر%',
      format('4.12 رُفض بسبب غير متوقَّع: %s', v_err);
    v_pass := v_pass + 1;
  END;

  -- ═══ ④ -و النطاق المعكوس والمفرط ═══
  -- ★★★ تصحيح خطأ في اختباري: النسخة الأولى كانت
  --       RAISE EXCEPTION '4.13 نطاق معكوس قُبل';
  --     ثم تفحص  v_err LIKE '%معكوس%'  — ورسالة الفشل نفسها تحوي
  --     كلمة «معكوس»! فلو قَبِلت الدالةُ النطاقَ المعكوس لالتُقط
  --     الاستثناءُ الذي أطلقتُه أنا ولمرّ التأكيد. **تأكيد يمرّ لسبب
  --     خاطئ** — تماماً كنمط 0343. الحلّ: راية مميِّزة لا تتقاطع مع
  --     نصّ الدالة.
  BEGIN
    PERFORM public.apply_leave_to_attendance(v_e, make_date(2026,5,10), make_date(2026,5,4));
    RAISE EXCEPTION 'SENTINEL_413';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    ASSERT v_err <> 'SENTINEL_413',
      '4.13 ★★★ نطاق معكوس قُبل بلا اعتراض';
    ASSERT v_err LIKE '%معكوس%', format('4.13 سبب غير متوقَّع: %s', v_err);
    v_pass := v_pass + 1;
  END;
  -- ★★ ولا صفّ أُنشئ من النطاق المعكوس
  SELECT count(*) INTO v_n FROM public.attendance_summary
   WHERE tenant_id=v_t AND employee_id=v_e
     AND shift_date BETWEEN make_date(2026,5,4) AND make_date(2026,5,10)
     AND shift_date NOT IN (make_date(2026,5,4),make_date(2026,5,5),make_date(2026,5,6));
  ASSERT v_n = 0, format('4.13b النطاق المعكوس أنشأ %s صفّاً', v_n);
  v_pass := v_pass + 1;

  BEGIN
    PERFORM public.apply_leave_to_attendance(v_e, make_date(2026,1,1), make_date(2030,1,1));
    RAISE EXCEPTION 'SENTINEL_414';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    ASSERT v_err <> 'SENTINEL_414', '4.14 ★★ نطاق 4 سنوات قُبل';
    ASSERT v_err LIKE '%400 يوم%', format('4.14 سبب غير متوقَّع: %s', v_err);
    v_pass := v_pass + 1;
  END;

  -- ═══════════════════════════════════════════════════════════════════════
  -- ⑤ التراجع — بلا حذف نهائي
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT count(*) INTO v_n FROM public.attendance_summary
   WHERE tenant_id=v_t AND employee_id=v_e
     AND shift_date BETWEEN make_date(2026,5,4) AND make_date(2026,5,6);
  ASSERT v_n = 3, format('5.0 تجهيز التراجع: %s صفوف (متوقَّع 3)', v_n);
  v_pass := v_pass + 1;

  SELECT public.revert_leave_from_attendance(v_e, make_date(2026,5,4), make_date(2026,5,6))
    INTO v_n;
  ASSERT v_n = 3, format('5.1 أيام متراجَعة = %s (متوقَّع 3)', v_n);
  v_pass := v_pass + 1;

  -- ★★★ الصفوف **باقية** — لا حذف
  SELECT count(*) INTO v_n FROM public.attendance_summary
   WHERE tenant_id=v_t AND employee_id=v_e
     AND shift_date BETWEEN make_date(2026,5,4) AND make_date(2026,5,6);
  ASSERT v_n = 3,
    format('5.2 ★★★ الصفوف بعد التراجع = %s (متوقَّع 3 باقية). '
           'الكود القديم كان يحذفها نهائياً ثم يستدعي '
           'refresh_attendance_summary غير الموجودة ⇒ فقدان صافٍ', v_n);
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM public.attendance_summary
   WHERE tenant_id=v_t AND employee_id=v_e AND status='غائب'
     AND shift_date BETWEEN make_date(2026,5,4) AND make_date(2026,5,6);
  ASSERT v_n = 3, format('5.3 صفوف «غائب» بعد التراجع = %s (متوقَّع 3)', v_n);
  v_pass := v_pass + 1;

  -- ★★★ مدير المستأجر أ لا يتراجع عن إجازة موظف المستأجر ب.
  --   درس تغطية: بلا هذا التأكيد كان عكسُ «حذف فحص المستأجر» يمرّ،
  --   لأن جملة UPDATE مقيَّدة بـtenant_id فلا تُصيب شيئاً على أي حال
  --   — لكن **الاستثناء** هو الحارس الدلالي: عمليةٌ تُعيد 0 بصمت
  --   تختلف عن عمليةٍ تُرفض صراحةً.
  BEGIN
    PERFORM public.revert_leave_from_attendance(v_eb, make_date(2026,5,4), make_date(2026,5,6));
    RAISE EXCEPTION 'SENTINEL_53';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    ASSERT v_err <> 'SENTINEL_53',
      '5.3 ★★★ مدير المستأجر أ تراجع عن إجازة موظف المستأجر ب بلا اعتراض';
    ASSERT v_err LIKE '%ليس ضمن هذا المستأجر%',
      format('5.3 رُفض بسبب غير متوقَّع: %s', v_err);
    v_pass := v_pass + 1;
  END;

  -- ★★ والموظف نفسه لا يتراجع
  PERFORM set_config('request.jwt.claim.sub', v_u::text, TRUE);
  BEGIN
    PERFORM public.revert_leave_from_attendance(v_e, make_date(2026,5,4), make_date(2026,5,6));
    RAISE EXCEPTION 'SENTINEL_53b';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    ASSERT v_err <> 'SENTINEL_53b', '5.3b ★★ الموظف تراجع عن إجازته بنفسه';
    ASSERT v_err LIKE '%غير مصرَّح%', format('5.3b سبب غير متوقَّع: %s', v_err);
    v_pass := v_pass + 1;
  END;
  PERFORM set_config('request.jwt.claim.sub', v_umgr::text, TRUE);

  -- ★★ يوم البصمة (5/18) لا يُعلَن غياباً
  SELECT public.revert_leave_from_attendance(v_e, make_date(2026,5,18), make_date(2026,5,18))
    INTO v_n;
  ASSERT v_n = 0,
    format('5.4 ★★★ صفوف متراجَعة ليوم فيه بصمة = %s (متوقَّع 0)', v_n);
  v_pass := v_pass + 1;
  SELECT status INTO v_txt FROM public.attendance_summary
   WHERE tenant_id=v_t AND employee_id=v_e AND shift_date=make_date(2026,5,18);
  ASSERT v_txt = 'مجاز',
    format('5.5 ★★ يوم البصمة صار «%s» — إعلان الحاضر غائباً', v_txt);
  v_pass := v_pass + 1;

  -- ═══════════════════════════════════════════════════════════════════════
  -- ⑥ طلبات تصحيح الحضور
  -- ═══════════════════════════════════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_u::text, TRUE);

  INSERT INTO public.hr_cases
    (tenant_id,employee_id,case_type,subject,description,priority,status,channel,
     resolution_summary,resolved_at)
  VALUES
    (v_t,v_e ,'attendance_correction','تصحيح 3/3','نسيت البصمة','normal','open','employee_portal',NULL,NULL),
    -- ★ تصحيحُ انحدارٍ كشفه القيد `chk_hr_cases_resolved_complete` (0367):
    --   كان هذا الصفّ `resolved` بلا ملخّصٍ ولا `resolved_at` — وهو
    --   بالضبط العطل ⑫ الذي أُصلح. القيد رفضه بحقّ، فأُكمِل الصفّ.
    (v_t,v_e ,'attendance_correction','تصحيح 3/5','الجهاز معطّل','urgent','resolved','employee_portal',
     'صُحّح السجلّ يدوياً',now()),
    -- ★ نوع آخر لنفس الموظف: يجب ألّا يظهر
    (v_t,v_e ,'general_inquiry'       ,'سؤال عام','متى الراتب؟','normal','open','employee_portal',NULL,NULL),
    -- ★★ زميل في نفس المستأجر: يجب ألّا يظهر
    (v_t,v_emgr,'attendance_correction','تصحيح المدير','بصمة المدير','normal','open','employee_portal',NULL,NULL),
    -- ★★★ وطلبٌ في **مستأجر آخر**: الدليل على أن c.tenant_id = v_tenant
    --   يعمل. كان مكتوباً بـ`v_e` (موظف ألف) داخل `v_tb` (مستأجر باء)،
    --   وهو **بالضبط** العبورُ الذي يمنعه FK المركَّب في 0367
    --   (`fk_hr_cases_employee_tenant`). أُصلح إلى `v_eb` — موظف باء
    --   الحقيقيّ — والغرضُ محفوظٌ تماماً: صفٌّ أجنبيٌّ في العيّنة يجب
    --   ألّا يظهر لدالة الموظف. والدالة تُرشّح بـ(employee_id, tenant_id)
    --   معاً فيبقى التأكيد قائماً على معناه.
    (v_tb,v_eb,'attendance_correction','تصحيح المستأجر ب','تسريب','normal','open','employee_portal',NULL,NULL);

  SELECT count(*) INTO v_n FROM public.my_attendance_corrections(20);
  ASSERT v_n = 2,
    format('6.1 ★★ طلبات التصحيح = %s (متوقَّع 2). 3 يعني تسرّب '
           'general_inquiry · 4 يعني تسرّب طلب الزميل', v_n);
  v_pass := v_pass + 1;

  SELECT out_subject INTO v_txt FROM public.my_attendance_corrections(20) LIMIT 1;
  ASSERT v_txt IN ('تصحيح 3/3','تصحيح 3/5'),
    format('6.2 أول طلب = «%s» — قيمة غريبة', v_txt);
  v_pass := v_pass + 1;

  -- ★★ لا طلب الزميل ضمن النتائج — تأكيد موجب بالعدّ لا NOT LIKE
  SELECT count(*) INTO v_n FROM public.my_attendance_corrections(20)
   WHERE out_subject = 'تصحيح المدير';
  ASSERT v_n = 0, '6.3 ★★★ طلب الزميل ظهر في سجلّ الموظف';
  v_pass := v_pass + 1;

  -- ★★★ ولا طلب المستأجر الآخر — رغم أنه بنفس employee_id
  SELECT count(*) INTO v_n FROM public.my_attendance_corrections(20)
   WHERE out_subject = 'تصحيح المستأجر ب';
  ASSERT v_n = 0,
    '6.3b ★★★ طلبُ نفس الموظف في مستأجر آخر ظهر ⇒ ترشيح tenant_id معطَّل';
  v_pass := v_pass + 1;

  -- ★ الحالة والحلّ يُعادان (الموظف يحتاج أن يعرف المصير)
  SELECT out_status INTO v_txt FROM public.my_attendance_corrections(20)
   WHERE out_subject = 'تصحيح 3/5';
  ASSERT v_txt = 'resolved',
    format('6.4 حالة الطلب المحلول = «%s» (متوقَّع resolved)', v_txt);
  v_pass := v_pass + 1;

  -- ★ الحدّ يُقصّ ولا يُسقط
  SELECT count(*) INTO v_n FROM public.my_attendance_corrections(1);
  ASSERT v_n = 1, format('6.5 limit=1 أعاد %s', v_n);
  v_pass := v_pass + 1;
  SELECT count(*) INTO v_n FROM public.my_attendance_corrections(99999);
  ASSERT v_n = 2, format('6.6 limit مفرط أعاد %s (متوقَّع 2 لا استثناء)', v_n);
  v_pass := v_pass + 1;
  -- ★ limit سالب يُقصّ إلى الحدّ الأدنى 1 لا يُسقط الاستعلام:
  --   LEAST(GREATEST(-5,1),100) = 1. (كان توقّعي الأول 2 — خطأ مني،
  --   والتشغيل صحّحه.)
  SELECT count(*) INTO v_n FROM public.my_attendance_corrections(-5);
  ASSERT v_n = 1, format('6.7 limit سالب أعاد %s (متوقَّع 1 — قُصَّ لا أُسقط)', v_n);
  v_pass := v_pass + 1;
  SELECT count(*) INTO v_n FROM public.my_attendance_corrections(NULL);
  ASSERT v_n = 2, format('6.8 limit NULL أعاد %s (متوقَّع 2 — الافتراضي 20)', v_n);
  v_pass := v_pass + 1;

  -- ═══════════════════════════════════════════════════════════════════════
  -- ⑦ القيد الجديد يعمل فعلاً
  -- ═══════════════════════════════════════════════════════════════════════
  BEGIN
    INSERT INTO public.attendance_summary(tenant_id,employee_id,shift_date,status)
      VALUES (v_t,v_e,make_date(2026,9,1),'قيمة عشوائية لا معنى لها');
    RAISE EXCEPTION 'SENTINEL_71';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    ASSERT v_err <> 'SENTINEL_71',
      '7.1 ★★★ حالة عشوائية قُبلت — القيد لا يعمل';
    ASSERT v_err LIKE '%attendance_summary_status_vocab%',
      format('7.1 رُفض بسبب غير متوقَّع: %s', v_err);
    v_pass := v_pass + 1;
  END;

  -- ★★★ ومفردات 0337 المختلقة تُرفض هي أيضاً
  BEGIN
    INSERT INTO public.attendance_summary(tenant_id,employee_id,shift_date,status)
      VALUES (v_t,v_e,make_date(2026,9,2),'في الوقت');
    RAISE EXCEPTION 'SENTINEL_72';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    ASSERT v_err <> 'SENTINEL_72',
      '7.2 ★★★ «في الوقت» (من مفردات 0337) قُبلت — القيد لا يحرس';
    ASSERT v_err LIKE '%attendance_summary_status_vocab%',
      format('7.2 رُفض بسبب غير متوقَّع: %s', v_err);
    v_pass := v_pass + 1;
  END;

  -- ★ والثماني الصحيحة تُقبل كلّها
  INSERT INTO public.attendance_summary(tenant_id,employee_id,shift_date,status) VALUES
    (v_t,v_e,make_date(2026,9, 3),'حضور_بوقت'),
    (v_t,v_e,make_date(2026,9, 4),'متأخر'),
    (v_t,v_e,make_date(2026,9, 5),'زمنية_معتمدة'),
    (v_t,v_e,make_date(2026,9, 6),'زمنية_انتظار'),
    (v_t,v_e,make_date(2026,9, 7),'غائب'),
    (v_t,v_e,make_date(2026,9, 8),'مجاز'),
    (v_t,v_e,make_date(2026,9, 9),'إجازة_انتظار'),
    (v_t,v_e,make_date(2026,9,10),'عطلة');
  SELECT count(*) INTO v_n FROM public.attendance_summary
   WHERE tenant_id=v_t AND employee_id=v_e
     AND shift_date BETWEEN make_date(2026,9,3) AND make_date(2026,9,10);
  ASSERT v_n = 8, format('7.3 المفردات الثماني: أُدرج %s (متوقَّع 8)', v_n);
  v_pass := v_pass + 1;

  -- ⑦ -ب القيد NOT VALID (لا يُبطل تطبيق المايجريشن على بيانات قائمة)
  SELECT convalidated INTO v_txt FROM pg_constraint
   WHERE conrelid='public.attendance_summary'::regclass
     AND conname='attendance_summary_status_vocab';
  ASSERT v_txt = 'false',
    format('7.4 ★ القيد convalidated=%s (متوقَّع false — NOT VALID عمداً)', v_txt);
  v_pass := v_pass + 1;

  -- ═══════════════════════════════════════════════════════════════════════
  -- ⑧ الفهرس الجزئي
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT count(*) INTO v_n FROM pg_indexes
   WHERE schemaname='public' AND indexname='idx_hr_cases_attendance_correction';
  ASSERT v_n = 1, '8.1 فهرس طلبات التصحيح مفقود';
  v_pass := v_pass + 1;
  SELECT indexdef INTO v_txt FROM pg_indexes
   WHERE schemaname='public' AND indexname='idx_hr_cases_attendance_correction';
  ASSERT v_txt LIKE '%WHERE%attendance_correction%',
    format('8.2 ★ الفهرس ليس جزئياً: %s', v_txt);
  v_pass := v_pass + 1;

  -- ═══════════════════════════════════════════════════════════════════════
  -- ⑨ التوقيعات والصلاحيات
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN
     ('attendance_status_bucket','apply_leave_to_attendance',
      'revert_leave_from_attendance','my_attendance_corrections');
  ASSERT v_n = 4, format('9.1 دوال 0344 = %s (متوقَّع 4)', v_n);
  v_pass := v_pass + 1;

  -- ★★ الدالتان الكاتبتان DEFINER (سياسة INSERT تشترط staff)
  SELECT count(*) INTO v_n FROM pg_proc
   WHERE proname IN ('apply_leave_to_attendance','revert_leave_from_attendance')
     AND prosecdef IS TRUE;
  ASSERT v_n = 2, format('9.2 ★★ دوال DEFINER = %s (متوقَّع 2)', v_n);
  v_pass := v_pass + 1;

  -- ★★ والقارئتان INVOKER (RLS يحرسهما)
  SELECT count(*) INTO v_n FROM pg_proc
   WHERE proname IN ('my_attendance_month_stats','my_attendance_streak',
                     'my_attendance_corrections')
     AND prosecdef IS FALSE;
  ASSERT v_n = 3, format('9.3 ★★ دوال INVOKER = %s (متوقَّع 3)', v_n);
  v_pass := v_pass + 1;

  -- ★ anon محروم
  SELECT count(*) INTO v_n FROM information_schema.routine_privileges
   WHERE routine_schema='public' AND grantee='anon'
     AND routine_name IN ('my_attendance_month_stats','my_attendance_streak',
                          'my_attendance_corrections','apply_leave_to_attendance',
                          'revert_leave_from_attendance');
  ASSERT v_n = 0, format('9.4 ★★ anon يملك EXECUTE على %s دالة', v_n);
  v_pass := v_pass + 1;

  -- ★ authenticated ممنوح
  SELECT count(DISTINCT routine_name) INTO v_n FROM information_schema.routine_privileges
   WHERE routine_schema='public' AND grantee='authenticated'
     AND routine_name IN ('my_attendance_month_stats','my_attendance_streak',
                          'my_attendance_corrections','apply_leave_to_attendance',
                          'revert_leave_from_attendance','attendance_status_bucket');
  ASSERT v_n = 6, format('9.5 authenticated يملك EXECUTE على %s (متوقَّع 6)', v_n);
  v_pass := v_pass + 1;

  -- ★★ search_path مثبَّت على كل دوال 0344 (حقن schema)
  SELECT count(*) INTO v_n FROM pg_proc
   WHERE proname IN ('apply_leave_to_attendance','revert_leave_from_attendance',
                     'my_attendance_corrections','my_attendance_month_stats',
                     'my_attendance_streak')
     AND array_to_string(proconfig,',') LIKE '%search_path%';
  ASSERT v_n = 5, format('9.6 ★★ دوال بـsearch_path مثبَّت = %s (متوقَّع 5)', v_n);
  v_pass := v_pass + 1;

  RAISE NOTICE '✅ verify-attendance-vocabulary-0344: % تأكيداً ناجحاً', v_pass;
  RAISE EXCEPTION 'ROLLBACK_OK';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'ROLLBACK_OK' THEN RAISE; END IF;
END $$;
