-- ============================================================================
-- verify-hr-daily-attendance-0346.sql
--
-- لوحة الحضور اليومي: الاشتقاق الزمني · الاستراحات · الترشيح · الملخّص.
--
-- منهجية: يعمل بدور postgres (BYPASSRLS) فيقيس **منطق الدوال**.
--   العزل عبر RLS الحقيقي في verify-hr-daily-attendance-0346-rls.sh.
--
-- ★★★ الأرقام كلها محسوبة **يدوياً في التعليق قبل التشغيل** من بيانات
--   معروفة سلفاً — لا من الدالة ولا من نصّها (درس 0344).
--
-- ★★ ونستعمل طوابع **مثبَّتة** لا NOW(): `worked_minutes` لمن لم ينصرف
--   يُحتسب حتى `now()`، فيوم مثبَّت في الماضي يجعل الرقم قابلاً للتنبّؤ.
--
-- ─── حقائق بنيوية مُحقَّقة ─────────────────────────────────────────────────
--   attendance_logs: punch_type CHECK ∈ in·out·check-in·check-out
--     DEFAULT 'check-in' · UNIQUE (tenant_id, employee_id, punch_time)
--   employee_breaks: duration_minutes CHECK (1..720) DEFAULT 15
--     status DEFAULT 'active' · destination TEXT
--   employees: is_active · **لا status** · full_name_ar · employee_code
--   محفّز 0317 يُنشئ سجلّ الموظف تلقائياً
-- ============================================================================
\set ON_ERROR_STOP on

DO $$
DECLARE
  v_t    UUID := gen_random_uuid();
  v_tb   UUID := gen_random_uuid();
  v_dA   UUID := gen_random_uuid();
  v_dB   UUID := gen_random_uuid();
  v_dbb  UUID := gen_random_uuid();
  v_u1 UUID := gen_random_uuid();  -- مداوم (بصمة واحدة)
  v_u2 UUID := gen_random_uuid();  -- منصرف (بصمتان)
  v_u3 UUID := gen_random_uuid();  -- في استراحة
  v_u4 UUID := gen_random_uuid();  -- غائب
  v_u5 UUID := gen_random_uuid();  -- غير نشط
  v_u6 UUID := gen_random_uuid();  -- منصرف + استراحة نشطة (تداخل الحالة)
  v_u7 UUID := gen_random_uuid();  -- بصمة out صريحة ليست الأخيرة
  v_u8 UUID := gen_random_uuid();  -- غائب اسمه أوّل أبجدياً
  v_u9 UUID := gen_random_uuid();  -- انصرف واستراحته لم تُغلَق (تداخل)
  v_uhr UUID := gen_random_uuid();
  v_ub UUID := gen_random_uuid();
  v_e1 UUID; v_e2 UUID; v_e3 UUID; v_e4 UUID; v_e5 UUID;
  v_e6 UUID; v_e7 UUID; v_e8 UUID; v_e9 UUID; v_ehr UUID; v_eb UUID;
  -- ★ يوم مثبَّت في الماضي: يجعل worked_minutes قابلاً للتنبّؤ
  v_day  DATE := DATE '2026-03-16';
  v_base TIMESTAMPTZ := '2026-03-16 08:00:00+03';
  v_n    INT;
  v_txt  TEXT;
  v_pass INT := 0;
  r      RECORD;
BEGIN
  -- ═══ التجهيز ══════════════════════════════════════════════════════════
  INSERT INTO public.tenants(id,name,name_ar,slug) VALUES
    (v_t ,'A46','حضور أ','a46-'||substr(v_t::text ,1,8)),
    (v_tb,'B46','حضور ب','b46-'||substr(v_tb::text,1,8));
  INSERT INTO auth.users(id,email) VALUES
    (v_u1 ,'1-'||substr(v_u1::text ,1,8)||'@a46.io'),
    (v_u2 ,'2-'||substr(v_u2::text ,1,8)||'@a46.io'),
    (v_u3 ,'3-'||substr(v_u3::text ,1,8)||'@a46.io'),
    (v_u4 ,'4-'||substr(v_u4::text ,1,8)||'@a46.io'),
    (v_u5 ,'5-'||substr(v_u5::text ,1,8)||'@a46.io'),
    (v_u6 ,'6-'||substr(v_u6::text ,1,8)||'@a46.io'),
    (v_u7 ,'7-'||substr(v_u7::text ,1,8)||'@a46.io'),
    (v_u8 ,'8-'||substr(v_u8::text ,1,8)||'@a46.io'),
    (v_u9 ,'9-'||substr(v_u9::text ,1,8)||'@a46.io'),
    (v_uhr,'h-'||substr(v_uhr::text,1,8)||'@a46.io'),
    (v_ub ,'z-'||substr(v_ub::text ,1,8)||'@a46.io');
  INSERT INTO public.departments(id,tenant_id,name_ar) VALUES
    (v_dA ,v_t ,'الإنتاج'), (v_dB,v_t,'الجودة'), (v_dbb,v_tb,'قسم ب');
  INSERT INTO public.profiles(id,tenant_id,full_name,role) VALUES
    (v_u1 ,v_t ,'أحمد المداوم','employee'),
    (v_u2 ,v_t ,'سارة المنصرفة','employee'),
    (v_u3 ,v_t ,'خالد المستريح','employee'),
    (v_u4 ,v_t ,'نورا الغائبة','employee'),
    (v_u5 ,v_t ,'ياسر المؤرشف','employee'),
    (v_u6 ,v_t ,'زينب المنصرفة','employee'),
    (v_u7 ,v_t ,'طارق الصريح','employee'),
    -- ★★★ «آمنة» تسبق كل الأسماء أبجدياً — بلا هذا الصفّ كان عكسُ
    --   ترتيب «الغائبون آخراً» يمرّ لأن أسماء الغائبين (نورا·هالة)
    --   تأتي متأخرة أبجدياً **صدفةً**.
    (v_u8 ,v_t ,'آمنة الغائبة','employee'),
    (v_u9 ,v_t ,'وليد المتداخل','employee'),
    (v_uhr,v_t ,'هالة الموارد','hr'),
    (v_ub ,v_tb,'موظف ب','employee');

  SELECT id INTO v_e1  FROM public.employees WHERE user_id=v_u1;
  SELECT id INTO v_e2  FROM public.employees WHERE user_id=v_u2;
  SELECT id INTO v_e3  FROM public.employees WHERE user_id=v_u3;
  SELECT id INTO v_e4  FROM public.employees WHERE user_id=v_u4;
  SELECT id INTO v_e5  FROM public.employees WHERE user_id=v_u5;
  SELECT id INTO v_e6  FROM public.employees WHERE user_id=v_u6;
  SELECT id INTO v_e7  FROM public.employees WHERE user_id=v_u7;
  SELECT id INTO v_e8  FROM public.employees WHERE user_id=v_u8;
  SELECT id INTO v_e9  FROM public.employees WHERE user_id=v_u9;
  SELECT id INTO v_ehr FROM public.employees WHERE user_id=v_uhr;
  SELECT id INTO v_eb  FROM public.employees WHERE user_id=v_ub;

  UPDATE public.employees SET department_id=v_dA, employee_code='E-001' WHERE id=v_e1;
  UPDATE public.employees SET department_id=v_dA, employee_code='E-002' WHERE id=v_e2;
  UPDATE public.employees SET department_id=v_dB, employee_code='E-003' WHERE id=v_e3;
  UPDATE public.employees SET department_id=v_dB, employee_code='E-004' WHERE id=v_e4;
  UPDATE public.employees SET department_id=v_dA, employee_code='E-005', is_active=FALSE WHERE id=v_e5;
  UPDATE public.employees SET department_id=v_dA, employee_code='E-006' WHERE id=v_e6;
  UPDATE public.employees SET department_id=v_dA, employee_code='E-007' WHERE id=v_e7;
  UPDATE public.employees SET department_id=v_dB, employee_code='E-008' WHERE id=v_e8;
  UPDATE public.employees SET department_id=v_dA, employee_code='E-009' WHERE id=v_e9;
  UPDATE public.employees SET department_id=v_dA, employee_code='E-HR'  WHERE id=v_ehr;
  UPDATE public.employees SET department_id=v_dbb WHERE id=v_eb;

  ASSERT v_e1 IS NOT NULL AND v_eb IS NOT NULL,
    '0.1 محفّز 0317 لم يُنشئ سجلّات الموظفين';
  v_pass := v_pass + 1;

  -- ★★★ حقيقة بنيوية: 'check_in' بشرطة سفلية **مرفوض** (أساس العطل ①)
  BEGIN
    INSERT INTO public.attendance_logs(tenant_id,employee_id,punch_time,punch_type,shift_date)
      VALUES (v_t,v_e1,v_base - INTERVAL '5 hours','check_in',v_day);
    RAISE EXCEPTION 'SENTINEL_02';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM <> 'SENTINEL_02',
      '0.2 ★★★ ''check_in'' بشرطة سفلية قُبل — فرضية العطل ① باطلة';
    ASSERT SQLERRM LIKE '%punch_type%',
      format('0.2 رُفض بسبب غير متوقَّع: %s', SQLERRM);
    v_pass := v_pass + 1;
  END;

  -- ★★ والافتراضي 'check-in' يُطبَّق حين لا يُمرَّر (أساس العطل ②)
  INSERT INTO public.attendance_logs(tenant_id,employee_id,punch_time,shift_date)
    VALUES (v_t,v_ehr,v_base,v_day);
  SELECT punch_type INTO v_txt FROM public.attendance_logs
   WHERE tenant_id=v_t AND employee_id=v_ehr;
  ASSERT v_txt = 'check-in',
    format('0.3 ★★★ الافتراضي = «%s» (متوقَّع check-in)', v_txt);
  v_pass := v_pass + 1;
  DELETE FROM public.attendance_logs WHERE tenant_id=v_t AND employee_id=v_ehr;

  -- ═══════════════════════════════════════════════════════════════════════
  -- البيانات — الحساب اليدوي
  --
  --   يوم 2026-03-16 · الأساس 08:00 (+03)
  --
  --   أحمد (v_e1 · الإنتاج · E-001):
  --     بصمة واحدة 08:00  ⇒ دخول 08:00 · **لا خروج** (بصمة واحدة)
  --     ⇒ status = 'مداوم' · punch_count = 1
  --     ★ worked لمن لم ينصرف في يوم **ماضٍ** = 0 (لا نخترع ساعات)
  --
  --   سارة (v_e2 · الإنتاج · E-002):
  --     بصمتان 08:30 و 16:30 ⇒ دخول 08:30 · خروج 16:30 = 480 دقيقة
  --     استراحة واحدة 20 دقيقة (out 12:00 · return 12:20 · returned)
  --     ⇒ worked = 480 − 20 = **460** · status = 'منصرف'
  --
  --   خالد (v_e3 · الجودة · E-003):
  --     بصمة واحدة 09:00 ⇒ دخول · لا خروج
  --     استراحة **نشطة** بلا رجوع · destination = 'العيادة' · 15 دقيقة
  --     ⇒ status = 'في استراحة' · on_break = TRUE
  --     ⇒ worked = 0 − 15 ⇒ GREATEST(...,0) = **0**
  --
  --   نورا (v_e4 · الجودة · E-004): بلا بصمة ⇒ 'غائب' · punch_count = 0
  --   ياسر (v_e5): غير نشط ⇒ **لا يظهر إطلاقاً**
  --   هالة (v_ehr · الإنتاج · E-HR): بلا بصمة ⇒ 'غائب'
  --
  --   زينب (v_e6 · الإنتاج · E-006):
  --     بصمتان 08:15 و 17:00 ⇒ منصرفة (525 دقيقة)
  --     استراحة status='active' **ومعها** return_time (10 دقائق فعلية)
  --     ★★★ on_break يجب أن يكون FALSE (رجعت فعلاً) ⇒ 'منصرف'
  --     ⇒ worked = 525 − 10 = **515**
  --
  --   طارق (v_e7 · الإنتاج · E-007):
  --     دخول 08:45 · خروج **صريح** 14:00 · بصمة عابرة 17:00
  --     ⇒ خروج = 14:00 (الصريح يسبق آخر بصمة) = 315 دقيقة
  --     ⇒ worked = **315** · لا استراحة
  --
  --   آمنة (v_e8 · الجودة · E-008): بلا بصمة ⇒ 'غائب'
  --     ★ اسمها يسبق الجميع أبجدياً — يُثبت أن الترتيب يؤخّر الغائبين
  --
  --   ⇒ الصفوف المعروضة = 8 (أحمد·سارة·خالد·نورا·هالة·زينب·طارق·آمنة)
  --   ⇒ الملخّص: total=8 · present=5 · on_break=1 · left=3 · absent=3
  --     avg على غير الغائبين = (0+460+0+515+315)/5 = 258
  -- ═══════════════════════════════════════════════════════════════════════
  INSERT INTO public.attendance_logs(tenant_id,employee_id,punch_time,shift_date) VALUES
    (v_t,v_e1,v_base                        ,v_day),
    (v_t,v_e2,v_base + INTERVAL '30 minutes',v_day),
    (v_t,v_e2,v_base + INTERVAL '8 hours 30 minutes',v_day),
    (v_t,v_e3,v_base + INTERVAL '1 hour'    ,v_day),
    -- زينب: بصمتان ⇒ منصرفة · ولها استراحة نشطة (تداخل الحالة)
    (v_t,v_e6,v_base + INTERVAL '15 minutes',v_day),
    (v_t,v_e6,v_base + INTERVAL '9 hours'   ,v_day),
    -- وليد: بصمتان ⇒ منصرف · **و**استراحته لم تُغلَق (التداخل)
    (v_t,v_e9,v_base + INTERVAL '20 minutes',v_day),
    (v_t,v_e9,v_base + INTERVAL '7 hours'   ,v_day);

  -- ★★★ طارق: بصمة خروج **صريحة** ليست آخر بصمة زمنياً.
  --   دخول 08:45 · خروج صريح 14:00 · ثم بصمة عابرة 17:00.
  --   بلا التمييز الصريح لعُدَّ خروجه 17:00 (آخر بصمة) بدل 14:00.
  --   وهذا يجعل عكسَ `explicit_out` قابلاً للملاحظة.
  INSERT INTO public.attendance_logs
    (tenant_id,employee_id,punch_time,punch_type,shift_date)
  VALUES
    (v_t,v_e7,v_base + INTERVAL '45 minutes','check-in' ,v_day),
    (v_t,v_e7,v_base + INTERVAL '6 hours'   ,'check-out',v_day),
    (v_t,v_e7,v_base + INTERVAL '9 hours'   ,'check-in' ,v_day);

  -- ★★ ضجيج: بصمة **يوم آخر** لنفس الموظف
  INSERT INTO public.attendance_logs(tenant_id,employee_id,punch_time,shift_date)
    VALUES (v_t,v_e1,v_base - INTERVAL '1 day',v_day - 1);
  -- ★★ وضجيج المستأجر الآخر
  INSERT INTO public.attendance_logs(tenant_id,employee_id,punch_time,shift_date)
    VALUES (v_tb,v_eb,v_base,v_day);

  -- ★★★ صفٌّ مميِّز لترشيح المستأجر: **نفس** employee_id في مستأجر آخر.
  --   درس التغطية (المرة الحادية عشرة): employee_id فريد عالمياً،
  --   والانضمام بـemployees المُرشَّح بالمستأجر يُقصي الأجنبي **ضمناً**
  --   ⇒ عكسُ `a.tenant_id = v_tenant` لا يُسقط شيئاً. الدليل الوحيد
  --   على أن الشرط يعمل هو صفٌّ يحمل employee_id نفسه في tenant آخر.
  INSERT INTO public.attendance_logs(tenant_id,employee_id,punch_time,shift_date)
    VALUES (v_tb,v_e1,v_base - INTERVAL '3 hours',v_day);
  INSERT INTO public.employee_breaks
    (tenant_id,employee_id,destination,duration_minutes,status,created_at)
    VALUES (v_tb,v_e1,'وجهة أجنبية',77,'active', v_base);

  INSERT INTO public.employee_breaks
    (tenant_id,employee_id,destination,duration_minutes,status,out_time,return_time,created_at)
  VALUES
    (v_t,v_e2,'الكافتيريا',15,'returned',
       v_base + INTERVAL '4 hours', v_base + INTERVAL '4 hours 20 minutes',
       v_base + INTERVAL '4 hours'),
    (v_t,v_e3,'العيادة',15,'active', v_base + INTERVAL '2 hours', NULL,
       v_base + INTERVAL '2 hours'),
    -- ★★★ استراحة `active` **ومعها** return_time: بيانات غير متّسقة
    --   واقعية (المشرف نسي إغلاق التصريح والحارس سجّل الرجوع).
    --   بلا هذا الصفّ كان عكسُ `AND b.return_time IS NULL` يمرّ لأن
    --   شرط `status='active'` وحده يكفي لإقصاء كل استراحاتي.
    (v_t,v_e6,'المخزن',10,'active',
       v_base + INTERVAL '3 hours', v_base + INTERVAL '3 hours 10 minutes',
       v_base + INTERVAL '3 hours'),
    -- ★★★ وليد: استراحة نشطة **بلا رجوع** ثم بصم خروجاً نهائياً.
    --   حالة تشغيلية واقعية (المشرف نسي إغلاق التصريح). بلا هذا الصفّ
    --   لا يتقاطع on_break مع check_out فيصير ترتيب الفرعين بلا أثر.
    (v_t,v_e9,'الورشة',30,'active', v_base + INTERVAL '5 hours', NULL,
       v_base + INTERVAL '5 hours');
  -- ★★ وضجيج: استراحة **يوم آخر**
  INSERT INTO public.employee_breaks
    (tenant_id,employee_id,destination,duration_minutes,status,created_at)
    VALUES (v_t,v_e1,'أمس',99,'returned', v_base - INTERVAL '1 day');

  PERFORM set_config('request.jwt.claim.sub', v_uhr::text, TRUE);

  -- ═══ ①.0 الحارس: الدوال تعمل بمستأجر حقيقي (درس 0345) ═══
  ASSERT public.current_user_tenant_id() = v_t,
    '1.0a ★★★ السياق لم يُضبَط — كل ما بعده يقيس الفرع الفارغ';
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM public.hr_daily_attendance(v_day,NULL,NULL,NULL,200);
  ASSERT v_n = 9,
    format('1.0b ★★★ صفوف اللوحة = %s (متوقَّع 9 — ياسر غير نشط '
           'و موظف المستأجر ب محجوب)', v_n);
  v_pass := v_pass + 1;

  -- ═══════════════════════════════════════════════════════════════════════
  -- ① أحمد — بصمة واحدة: دخول بلا خروج
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT * INTO r FROM public.hr_daily_attendance(v_day,NULL,NULL,NULL,200)
   WHERE out_employee_code = 'E-001';

  ASSERT r.out_check_in = v_base,
    format('1.1 ★★★ أحمد: دخول = %s (متوقَّع %s). NULL يعني أن الاشتقاق '
           'الزمني لا يعمل — العطل ① الأصلي', r.out_check_in, v_base);
  v_pass := v_pass + 1;

  ASSERT r.out_check_out IS NULL,
    format('1.2 ★★★ أحمد: خروج = %s (متوقَّع NULL). قيمةٌ تساوي الدخول '
           'تعني اختلاق خروج من بصمة واحدة', r.out_check_out);
  v_pass := v_pass + 1;

  ASSERT r.out_punch_count = 1,
    format('1.3 ★★ أحمد: بصمات = %s (متوقَّع 1 — بصمة الأمس مُستبعَدة)',
           r.out_punch_count);
  v_pass := v_pass + 1;

  ASSERT r.out_status = 'مداوم',
    format('1.4 ★★★ أحمد: الحالة = «%s» (متوقَّع «مداوم»). «غائب» يعني '
           'العطل الأصلي: البحث عن punch_type=''check_in''', r.out_status);
  v_pass := v_pass + 1;

  ASSERT r.out_department = 'الإنتاج',
    format('1.5 أحمد: القسم = «%s»', r.out_department);
  v_pass := v_pass + 1;

  -- ★★★ العطل ⑥: full_name_ar فارغ لكل موظف (محفّز 0317 يملأ
  --   first_name/last_name فقط) ⇒ الصفحة كانت تعرض «بدون اسم» للجميع.
  --   الاسم هنا مُشتقّ من first_name + last_name.
  ASSERT r.out_full_name = 'أحمد المداوم',
    format('1.6 ★★★ أحمد: الاسم = «%s» (متوقَّع «أحمد المداوم»). '
           '«بدون اسم» يعني الاعتماد على full_name_ar وحده — وهو NULL '
           'لكل موظف في القاعدة', r.out_full_name);
  v_pass := v_pass + 1;

  -- ★★ إثبات أن العمود فارغ فعلاً — وإلا فالتأكيد أعلاه يمرّ لسبب خاطئ
  SELECT count(*) INTO v_n FROM public.employees
   WHERE tenant_id = v_t AND NULLIF(btrim(COALESCE(full_name_ar,'')),'') IS NOT NULL;
  ASSERT v_n = 0,
    format('1.6b ★★★ %s موظف له full_name_ar — فرضية العطل ⑥ باطلة '
           'والتأكيد 1.6 لا يقيس الاشتقاق', v_n);
  v_pass := v_pass + 1;

  -- ★★ والأولوية تحترم full_name_ar حين يوجد فعلاً
  UPDATE public.employees SET full_name_ar = 'الاسم الرسميّ' WHERE id = v_e1;
  SELECT out_full_name INTO v_txt
    FROM public.hr_daily_attendance(v_day,NULL,NULL,'E-001',200);
  ASSERT v_txt = 'الاسم الرسميّ',
    format('1.6c ★★ الأولوية: الاسم = «%s» (متوقَّع «الاسم الرسميّ» — '
           'full_name_ar يسبق first+last حين يوجد)', v_txt);
  v_pass := v_pass + 1;

  -- ★★ والبحث يجده بالاسم الرسميّ أيضاً
  SELECT count(*) INTO v_n
    FROM public.hr_daily_attendance(v_day,NULL,NULL,'الرسميّ',200);
  ASSERT v_n = 1,
    format('1.6d ★★ البحث في full_name_ar = %s (متوقَّع 1)', v_n);
  v_pass := v_pass + 1;
  UPDATE public.employees SET full_name_ar = NULL WHERE id = v_e1;

  -- ★★ استراحة الأمس لا تُحتسب اليوم
  ASSERT r.out_break_minutes = 0,
    format('1.7 ★★★ أحمد: دقائق استراحة = %s (متوقَّع 0 — استراحة الأمس '
           '99 دقيقة يجب أن تُستبعَد)', r.out_break_minutes);
  v_pass := v_pass + 1;

  -- ★★ ويوم ماضٍ بلا انصراف ⇒ صفر لا حساب حتى الآن
  ASSERT r.out_worked_minutes = 0,
    format('1.8 ★★★ أحمد: دقائق عمل = %s (متوقَّع 0 — يوم ماضٍ بلا '
           'انصراف لا تُخترَع له ساعات)', r.out_worked_minutes);
  v_pass := v_pass + 1;

  -- ═══════════════════════════════════════════════════════════════════════
  -- ② سارة — بصمتان واستراحة منتهية
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT * INTO r FROM public.hr_daily_attendance(v_day,NULL,NULL,NULL,200)
   WHERE out_employee_code = 'E-002';

  ASSERT r.out_check_in = v_base + INTERVAL '30 minutes',
    format('2.1 سارة: دخول = %s', r.out_check_in);
  v_pass := v_pass + 1;

  ASSERT r.out_check_out = v_base + INTERVAL '8 hours 30 minutes',
    format('2.2 ★★★ سارة: خروج = %s (متوقَّع 16:30). NULL يعني أن '
           'الاشتقاق من آخر بصمة لا يعمل — والقاعدة لا تحوي ولا بصمة '
           'خروج صريحة (العطل ②)', r.out_check_out);
  v_pass := v_pass + 1;

  ASSERT r.out_status = 'منصرف',
    format('2.3 سارة: الحالة = «%s» (متوقَّع «منصرف»)', r.out_status);
  v_pass := v_pass + 1;

  -- ★★★ المدة الفعلية 20 دقيقة لا المصرّح بها 15
  ASSERT r.out_break_minutes = 20,
    format('2.4 ★★★ سارة: استراحة = %s دقيقة (متوقَّع 20 = الفعلية من '
           'out_time إلى return_time). 15 يعني استعمال duration_minutes '
           'المصرّح بها بدل الواقع', r.out_break_minutes);
  v_pass := v_pass + 1;

  ASSERT r.out_break_count = 1,
    format('2.5 سارة: عدد الاستراحات = %s', r.out_break_count);
  v_pass := v_pass + 1;

  -- ★★★ 480 − 20 = 460 — قيمة مستقلّة لا تظهر في أي بيان إدراج
  ASSERT r.out_worked_minutes = 460,
    format('2.6 ★★★ سارة: عمل = %s دقيقة (متوقَّع 460 = 480 − 20). '
           '480 يعني إهمال خصم الاستراحة · 465 يعني خصم 15 المصرّح بها',
           r.out_worked_minutes);
  v_pass := v_pass + 1;

  ASSERT r.out_on_break = FALSE,
    '2.7 سارة: on_break يجب أن يكون FALSE (استراحتها انتهت)';
  v_pass := v_pass + 1;

  ASSERT r.out_destination IS NULL,
    format('2.8 ★★ سارة: الوجهة = «%s» (متوقَّع NULL — الوجهة تُعرض '
           'للنشطة وحدها لا للمنتهية)', r.out_destination);
  v_pass := v_pass + 1;

  -- ═══════════════════════════════════════════════════════════════════════
  -- ③ خالد — استراحة نشطة
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT * INTO r FROM public.hr_daily_attendance(v_day,NULL,NULL,NULL,200)
   WHERE out_employee_code = 'E-003';

  ASSERT r.out_status = 'في استراحة',
    format('3.1 ★★★ خالد: الحالة = «%s» (متوقَّع «في استراحة»). «مداوم» '
           'يعني إهمال employee_breaks تماماً', r.out_status);
  v_pass := v_pass + 1;

  ASSERT r.out_on_break IS TRUE,
    '3.2 خالد: on_break يجب أن يكون TRUE';
  v_pass := v_pass + 1;

  -- ★★★ العمود الذي كان **فارغاً دائماً** في الصفحة
  ASSERT r.out_destination = 'العيادة',
    format('3.3 ★★★ خالد: الوجهة = «%s» (متوقَّع «العيادة»). NULL يعني '
           'أن العمود ما زال بلا مصدر كما كان (currentDestination: '''')',
           COALESCE(r.out_destination,'NULL'));
  v_pass := v_pass + 1;

  -- ★ استراحة نشطة بلا return_time ⇒ المدة المصرّح بها
  ASSERT r.out_break_minutes = 15,
    format('3.4 خالد: استراحة = %s (متوقَّع 15 — نشطة بلا طابع رجوع '
           'فنستعمل المصرّح به)', r.out_break_minutes);
  v_pass := v_pass + 1;

  ASSERT r.out_worked_minutes = 0,
    format('3.5 ★★ خالد: عمل = %s (متوقَّع 0 — GREATEST يمنع السالب)',
           r.out_worked_minutes);
  v_pass := v_pass + 1;

  -- ═══════════════════════════════════════════════════════════════════════
  -- ④ نورا — غائبة · وياسر لا يظهر
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT * INTO r FROM public.hr_daily_attendance(v_day,NULL,NULL,NULL,200)
   WHERE out_employee_code = 'E-004';
  ASSERT r.out_status = 'غائب',
    format('4.1 نورا: الحالة = «%s»', r.out_status);
  v_pass := v_pass + 1;
  ASSERT r.out_check_in IS NULL AND r.out_punch_count = 0,
    '4.2 نورا: يجب ألّا يكون لها دخول ولا بصمات';
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM public.hr_daily_attendance(v_day,NULL,NULL,NULL,200)
   WHERE out_employee_code = 'E-005';
  ASSERT v_n = 0,
    '4.3 ★★★ ياسر غير النشط ظهر في اللوحة (is_active=FALSE)';
  v_pass := v_pass + 1;

  -- ★★ ولا موظف المستأجر الآخر
  SELECT count(*) INTO v_n FROM public.hr_daily_attendance(v_day,NULL,NULL,NULL,200)
   WHERE out_full_name = 'موظف ب';
  ASSERT v_n = 0, '4.4 ★★★ موظف المستأجر ب ظهر في اللوحة';
  v_pass := v_pass + 1;

  -- ═══════════════════════════════════════════════════════════════════════
  -- ④-ب الصفوف المميِّزة — كلٌّ منها يجعل شرطاً قابلاً للملاحظة
  -- ═══════════════════════════════════════════════════════════════════════

  -- ★★★ زينب: استراحة `active` **ومعها** return_time ⇒ رجعت فعلاً
  SELECT * INTO r FROM public.hr_daily_attendance(v_day,NULL,NULL,NULL,200)
   WHERE out_employee_code = 'E-006';
  ASSERT r.out_on_break = FALSE,
    format('4.5 ★★★ زينب: on_break = %s (متوقَّع FALSE). استراحتها '
           'status=''active'' لكن return_time مملوء ⇒ رجعت. TRUE يعني '
           'الاعتماد على status وحده', r.out_on_break);
  v_pass := v_pass + 1;

  ASSERT r.out_status = 'منصرف',
    format('4.6 ★★★ زينب: الحالة = «%s» (متوقَّع «منصرف»). «في استراحة» '
           'يعني أن ترتيب الفروع خاطئ أو أن on_break يتجاهل return_time',
           r.out_status);
  v_pass := v_pass + 1;

  ASSERT r.out_destination IS NULL,
    format('4.7 ★★ زينب: الوجهة = «%s» (متوقَّع NULL — رجعت)',
           COALESCE(r.out_destination,'NULL'));
  v_pass := v_pass + 1;

  -- 525 − 10 = 515
  ASSERT r.out_worked_minutes = 515,
    format('4.8 زينب: عمل = %s (متوقَّع 515 = 525 − 10)', r.out_worked_minutes);
  v_pass := v_pass + 1;

  -- ★★★ وليد: منصرف **و**استراحته نشطة ⇒ أيّ فرع يفوز؟
  --   الأولوية لـ«في استراحة»: التصريح مفتوح والحارس يحتاج أن يعرف
  --   أن أحداً ما زال بالخارج رسمياً — وهو ما يحتاج تدخّلاً إدارياً.
  SELECT * INTO r FROM public.hr_daily_attendance(v_day,NULL,NULL,NULL,200)
   WHERE out_employee_code = 'E-009';
  ASSERT r.out_check_out IS NOT NULL,
    '4.8b تجهيز باطل: وليد يجب أن يكون له خروج';
  v_pass := v_pass + 1;
  ASSERT r.out_on_break IS TRUE,
    '4.8c تجهيز باطل: وليد يجب أن يكون on_break';
  v_pass := v_pass + 1;
  ASSERT r.out_status = 'في استراحة',
    format('4.8d ★★★ وليد: الحالة = «%s» (متوقَّع «في استراحة»). '
           '«منصرف» يعني أن فرع الانصراف يسبق فرع الاستراحة فيُخفي '
           'تصريحاً مفتوحاً يحتاج إغلاقاً', r.out_status);
  v_pass := v_pass + 1;
  ASSERT r.out_destination = 'الورشة',
    format('4.8e ★★ وليد: الوجهة = «%s» (متوقَّع «الورشة»)',
           COALESCE(r.out_destination,'NULL'));
  v_pass := v_pass + 1;

  -- ★★★ طارق: بصمة خروج **صريحة** ليست الأخيرة زمنياً
  SELECT * INTO r FROM public.hr_daily_attendance(v_day,NULL,NULL,NULL,200)
   WHERE out_employee_code = 'E-007';
  ASSERT r.out_check_out = v_base + INTERVAL '6 hours',
    format('4.9 ★★★ طارق: خروج = %s (متوقَّع 14:00 — البصمة الصريحة '
           '''check-out''). 17:00 يعني تجاهلها والأخذ بآخر بصمة',
           r.out_check_out);
  v_pass := v_pass + 1;

  ASSERT r.out_punch_count = 3,
    format('4.10 طارق: بصمات = %s (متوقَّع 3)', r.out_punch_count);
  v_pass := v_pass + 1;

  ASSERT r.out_worked_minutes = 315,
    format('4.11 ★★ طارق: عمل = %s (متوقَّع 315 = 08:45→14:00). '
           '495 يعني الحساب حتى 17:00', r.out_worked_minutes);
  v_pass := v_pass + 1;

  -- ★★★ ترشيح المستأجر: أحمد له بصمة واستراحة في المستأجر ب بنفس
  --   employee_id. لو تسرّبتا لتغيّر دخوله وظهرت وجهة أجنبية.
  SELECT * INTO r FROM public.hr_daily_attendance(v_day,NULL,NULL,NULL,200)
   WHERE out_employee_code = 'E-001';
  ASSERT r.out_check_in = v_base,
    format('4.12 ★★★ أحمد: دخول = %s (متوقَّع 08:00). 05:00 يعني تسرّب '
           'بصمة المستأجر ب بنفس employee_id', r.out_check_in);
  v_pass := v_pass + 1;
  ASSERT r.out_destination IS NULL AND r.out_break_minutes = 0,
    format('4.13 ★★★ أحمد: وجهة=«%s» استراحة=%s (متوقَّع NULL/0). '
           '«وجهة أجنبية» أو 77 يعني تسرّب استراحة المستأجر ب',
           COALESCE(r.out_destination,'NULL'), r.out_break_minutes);
  v_pass := v_pass + 1;

  -- ═══════════════════════════════════════════════════════════════════════
  -- ⑤ الترتيب: الغائبون آخراً
  -- ═══════════════════════════════════════════════════════════════════════

  -- ★★★ «آمنة» غائبة واسمها يسبق الجميع أبجدياً. بلا هذا الصفّ كان
  --   عكسُ الترتيب يمرّ لأن أسماء الغائبين تأتي متأخرة **صدفةً**.
  SELECT count(*) INTO v_n FROM (
    SELECT out_status, out_full_name, row_number() OVER () AS rn
      FROM public.hr_daily_attendance(v_day,NULL,NULL,NULL,200)
  ) q WHERE out_full_name = 'آمنة الغائبة' AND rn <= 6;
  ASSERT v_n = 0,
    '5.0 ★★★ «آمنة الغائبة» ظهرت ضمن أول ستة صفوف — الترتيب يرتّب '
    'أبجدياً بدل تأخير الغائبين';
  v_pass := v_pass + 1;
  SELECT out_employee_code INTO v_txt
    FROM public.hr_daily_attendance(v_day,NULL,NULL,NULL,200) LIMIT 1;
  ASSERT v_txt = 'E-001',
    format('5.1 ★★ أول صفّ = «%s» (متوقَّع E-001 — أبكر دخول 08:00)', v_txt);
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM (
    SELECT out_status, row_number() OVER () AS rn
      FROM public.hr_daily_attendance(v_day,NULL,NULL,NULL,200)
  ) q WHERE out_status = 'غائب' AND rn <= 6;
  ASSERT v_n = 0,
    format('5.2 ★★ غائبٌ ظهر ضمن أول ستة صفوف (%s) — الترتيب لا يؤخّرهم', v_n);
  v_pass := v_pass + 1;

  -- ═══════════════════════════════════════════════════════════════════════
  -- ⑥ الترشيحات — لم تكن موجودة إطلاقاً
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT count(*) INTO v_n
    FROM public.hr_daily_attendance(v_day,v_dA,NULL,NULL,200);
  ASSERT v_n = 6,
    format('6.1 ★★★ ترشيح قسم الإنتاج = %s (متوقَّع 6)', v_n);
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n
    FROM public.hr_daily_attendance(v_day,v_dB,NULL,NULL,200);
  ASSERT v_n = 3,
    format('6.2 ترشيح قسم الجودة = %s (متوقَّع 3: خالد·نورا·آمنة)', v_n);
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n
    FROM public.hr_daily_attendance(v_day,NULL,'غائب',NULL,200);
  ASSERT v_n = 3,
    format('6.3 ★★★ ترشيح الحالة «غائب» = %s (متوقَّع 3: نورا·هالة·آمنة)', v_n);
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n
    FROM public.hr_daily_attendance(v_day,NULL,'في استراحة',NULL,200);
  ASSERT v_n = 2,
    format('6.4 ترشيح «في استراحة» = %s (متوقَّع 2: خالد·وليد)', v_n);
  v_pass := v_pass + 1;

  -- ★★ البحث بالاسم
  SELECT count(*) INTO v_n
    FROM public.hr_daily_attendance(v_day,NULL,NULL,'سارة',200);
  ASSERT v_n = 1,
    format('6.5 ★★★ البحث «سارة» = %s (متوقَّع 1)', v_n);
  v_pass := v_pass + 1;

  -- ★★ وبالرمز الوظيفي
  SELECT count(*) INTO v_n
    FROM public.hr_daily_attendance(v_day,NULL,NULL,'E-003',200);
  ASSERT v_n = 1,
    format('6.6 ★★ البحث بالرمز «E-003» = %s (متوقَّع 1)', v_n);
  v_pass := v_pass + 1;

  -- ★ بحث فارغ/مسافات ⇒ لا ترشيح
  SELECT count(*) INTO v_n
    FROM public.hr_daily_attendance(v_day,NULL,NULL,'   ',200);
  ASSERT v_n = 9,
    format('6.7 ★★ بحث بمسافات = %s (متوقَّع 9 — يُعامَل كلا بحث)', v_n);
  v_pass := v_pass + 1;

  -- ★★ الترشيحان معاً يتقاطعان لا يتجاهلان
  SELECT count(*) INTO v_n
    FROM public.hr_daily_attendance(v_day,v_dB,'غائب',NULL,200);
  ASSERT v_n = 2,
    format('6.8 ★★★ الجودة + غائب = %s (متوقَّع 2: نورا·آمنة)', v_n);
  v_pass := v_pass + 1;

  -- ★ الحدّ يُقصّ
  SELECT count(*) INTO v_n FROM public.hr_daily_attendance(v_day,NULL,NULL,NULL,2);
  ASSERT v_n = 2, format('6.9 limit=2 أعاد %s', v_n);
  v_pass := v_pass + 1;
  SELECT count(*) INTO v_n FROM public.hr_daily_attendance(v_day,NULL,NULL,NULL,-5);
  ASSERT v_n = 1, format('6.10 limit سالب أعاد %s (متوقَّع 1 — قُصَّ)', v_n);
  v_pass := v_pass + 1;
  SELECT count(*) INTO v_n FROM public.hr_daily_attendance(v_day,NULL,NULL,NULL,99999);
  ASSERT v_n = 9, format('6.11 limit مفرط أعاد %s (متوقَّع 9)', v_n);
  v_pass := v_pass + 1;

  -- ═══ ⑥ -ب يوم آخر: قيم مختلفة تماماً ═══
  SELECT count(*) INTO v_n
    FROM public.hr_daily_attendance(v_day - 1,NULL,'غائب',NULL,200);
  ASSERT v_n = 8,
    format('6.12 ★★★ الأمس: غائبون = %s (متوقَّع 8 — أحمد وحده بصم أمس). '
           'لو كان الترشيح بالتاريخ معطّلاً لعاد 3', v_n);
  v_pass := v_pass + 1;

  SELECT out_status INTO v_txt
    FROM public.hr_daily_attendance(v_day - 1,NULL,NULL,'E-001',200);
  ASSERT v_txt = 'مداوم',
    format('6.13 ★★ الأمس: أحمد = «%s» (متوقَّع «مداوم»)', v_txt);
  v_pass := v_pass + 1;

  -- ═══════════════════════════════════════════════════════════════════════
  -- ⑦ الملخّص — لم يكن موجوداً إطلاقاً
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT * INTO r FROM public.hr_daily_attendance_summary(v_day,NULL);

  ASSERT r.out_total = 9,
    format('7.1 الملخّص: الإجمالي = %s (متوقَّع 9)', r.out_total);
  v_pass := v_pass + 1;

  -- ★★★ «حاضر» يشمل من في استراحة
  ASSERT r.out_present = 6,
    format('7.2 ★★★ حاضر = %s (متوقَّع 6: مداوم + في استراحة + منصرف). '
           '4 يعني عدّ من في استراحة غائباً', r.out_present);
  v_pass := v_pass + 1;

  ASSERT r.out_on_break = 2,
    format('7.3 في استراحة = %s (متوقَّع 2: خالد·وليد)', r.out_on_break);
  v_pass := v_pass + 1;
  ASSERT r.out_left = 3,
    format('7.4 منصرف = %s (متوقَّع 3: سارة·زينب·طارق)', r.out_left);
  v_pass := v_pass + 1;
  ASSERT r.out_absent = 3,
    format('7.5 غائب = %s (متوقَّع 3)', r.out_absent);
  v_pass := v_pass + 1;

  -- ★★ الأجزاء تساوي الكلّ
  ASSERT r.out_present + r.out_absent = r.out_total,
    format('7.6 ★★ حاضر(%s) + غائب(%s) ≠ الإجمالي(%s)',
           r.out_present, r.out_absent, r.out_total);
  v_pass := v_pass + 1;

  -- ★★★ المتوسط على غير الغائبين: (0+460+0)/3 = 153.33 ⇒ 153
  -- (0 + 460 + 0 + 515 + 315) / 5 = 1290/5 = 258
  -- (0 + 460 + 0 + 515 + 315 + 370) / 6 = 1660/6 = 276.67 ⇒ 277
  ASSERT r.out_avg_minutes = 277,
    format('7.7 ★★★ متوسط الدقائق = %s (متوقَّع 277 = 1660/6 على '
           'الحاضرين). 184 يعني القسمة على التسعة كلهم', r.out_avg_minutes);
  v_pass := v_pass + 1;

  ASSERT r.out_first_in = v_base,
    format('7.8 أبكر دخول = %s (متوقَّع 08:00)', r.out_first_in);
  v_pass := v_pass + 1;
  ASSERT r.out_last_out = v_base + INTERVAL '9 hours',
    format('7.9 آخر خروج = %s (متوقَّع 17:00 — زينب)', r.out_last_out);
  v_pass := v_pass + 1;

  -- ★★ ملخّص مُرشَّح بقسم: قيم مختلفة تماماً
  SELECT * INTO r FROM public.hr_daily_attendance_summary(v_day,v_dB);
  ASSERT r.out_total = 3 AND r.out_absent = 2 AND r.out_on_break = 1,
    format('7.10 ★★★ ملخّص الجودة: total=%s absent=%s on_break=%s '
           '(متوقَّع 3/2/1)', r.out_total, r.out_absent, r.out_on_break);
  v_pass := v_pass + 1;

  -- ★ يوم بلا أي بيانات ⇒ صفّ بالكلّ غائبين لا «لا شيء»
  SELECT count(*) INTO v_n
    FROM public.hr_daily_attendance_summary(v_day - 30,NULL);
  ASSERT v_n = 1,
    format('7.11 ★★ يوم فارغ أعاد %s صفّاً (متوقَّع 1)', v_n);
  v_pass := v_pass + 1;
  SELECT * INTO r FROM public.hr_daily_attendance_summary(v_day - 30,NULL);
  ASSERT r.out_total = 9 AND r.out_absent = 9 AND r.out_present = 0,
    format('7.12 يوم فارغ: total=%s absent=%s present=%s (متوقَّع 9/9/0)',
           r.out_total, r.out_absent, r.out_present);
  v_pass := v_pass + 1;
  ASSERT r.out_avg_minutes = 0,
    format('7.13 ★★ يوم فارغ: المتوسط = %s (متوقَّع 0 لا NULL)',
           r.out_avg_minutes);
  v_pass := v_pass + 1;

  -- ═══════════════════════════════════════════════════════════════════════
  -- ⑧ العزل: مستأجر آخر
  -- ═══════════════════════════════════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_ub::text, TRUE);
  SELECT count(*) INTO v_n FROM public.hr_daily_attendance(v_day,NULL,NULL,NULL,200);
  ASSERT v_n = 1,
    format('8.1 ★★★ المستأجر ب يرى %s صفّاً (متوقَّع 1)', v_n);
  v_pass := v_pass + 1;
  SELECT * INTO r FROM public.hr_daily_attendance_summary(v_day,NULL);
  ASSERT r.out_total = 1 AND r.out_present = 1,
    format('8.2 ★★★ ملخّص ب: total=%s present=%s (متوقَّع 1/1)',
           r.out_total, r.out_present);
  v_pass := v_pass + 1;

  -- ★ بلا مستأجر
  PERFORM set_config('request.jwt.claim.sub', gen_random_uuid()::text, TRUE);
  SELECT count(*) INTO v_n FROM public.hr_daily_attendance(v_day,NULL,NULL,NULL,200);
  ASSERT v_n = 0, format('8.3 بلا مستأجر: %s صفّاً (متوقَّع 0)', v_n);
  v_pass := v_pass + 1;
  SELECT count(*) INTO v_n FROM public.hr_daily_attendance_summary(v_day,NULL);
  ASSERT v_n = 1,
    format('8.4 ★★ بلا مستأجر: الملخّص أعاد %s (متوقَّع 1 صفّ أصفار — '
           'غيابه يجعل البطاقات NaN)', v_n);
  v_pass := v_pass + 1;

  -- ═══════════════════════════════════════════════════════════════════════
  -- ⑨ التوقيعات والصلاحيات
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN
     ('hr_daily_attendance','hr_daily_attendance_summary');
  ASSERT v_n = 2, format('9.1 دوال 0346 = %s (متوقَّع 2)', v_n);
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM pg_proc
   WHERE proname LIKE 'hr_daily_attendance%' AND prosecdef IS TRUE;
  ASSERT v_n = 0,
    format('9.2 ★★★ %s دالة تعمل DEFINER — تتجاوز RLS', v_n);
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM pg_proc
   WHERE proname LIKE 'hr_daily_attendance%'
     AND array_to_string(proconfig,',') LIKE '%search_path%';
  ASSERT v_n = 2, format('9.3 ★★ دوال بـsearch_path = %s (متوقَّع 2)', v_n);
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM information_schema.routine_privileges
   WHERE routine_schema='public' AND grantee='anon'
     AND routine_name LIKE 'hr_daily_attendance%';
  ASSERT v_n = 0, format('9.4 ★★ anon يملك EXECUTE على %s دالة', v_n);
  v_pass := v_pass + 1;

  SELECT count(DISTINCT routine_name) INTO v_n FROM information_schema.routine_privileges
   WHERE routine_schema='public' AND grantee='authenticated'
     AND routine_name LIKE 'hr_daily_attendance%';
  ASSERT v_n = 2, format('9.5 authenticated يملك EXECUTE على %s (متوقَّع 2)', v_n);
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM pg_indexes
   WHERE schemaname='public' AND indexname IN
     ('idx_att_logs_tenant_shift_date','idx_emp_breaks_tenant_created',
      'idx_emp_breaks_employee');
  ASSERT v_n = 3, format('9.6 فهارس 0346 = %s (متوقَّع 3)', v_n);
  v_pass := v_pass + 1;

  RAISE NOTICE '✅ verify-hr-daily-attendance-0346: % تأكيداً ناجحاً', v_pass;
  RAISE EXCEPTION 'ROLLBACK_OK';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'ROLLBACK_OK' THEN RAISE; END IF;
END $$;
