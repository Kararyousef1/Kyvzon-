-- ============================================================================
-- verify-payroll-run-0348.sql
--
-- نظام الرواتب: مصدر الراتب · الحضور الفعليّ · الخصومات · الاعتماد.
--
-- منهجية: يعمل بدور postgres (BYPASSRLS) فيقيس **منطق الدوال**.
--   العزل عبر RLS الحقيقي في verify-payroll-run-0348-rls.sh.
--
-- ★★★ كل رقم محسوب **يدوياً في التعليق قبل التشغيل** من بيانات معروفة
--   سلفاً — لا من الدالة ولا من نصّها (درس 0344).
--
-- ★★ ودرس 0346/0347 مُطبَّق: لكل شرطٍ بياناتٌ تخالفه. التجهيز يحوي
--   عمداً: موظفاً براتب من العقد · وآخر من الملف · وثالثاً بالافتراضي ·
--   وقرضاً يتجاوز الراتب · وفترة معتمَدة · وموظف مستأجر آخر.
--
-- ─── حقائق بنيوية مُحقَّقة ─────────────────────────────────────────────────
--   payroll_periods: **لا frequency/payment_date/updated_at** قبل 0348
--     ومحفّز BEFORE UPDATE يُسند NEW.updated_at ⇒ كل UPDATE يفشل
--   payroll_records: **لا قيد فريد** على (period,employee) قبل 0348
--   الراتب: employee_contracts.salary_amount · profiles.salary
--     · payroll_settings.default_basic_salary — **لا employees.salary**
--   payroll_settings: صفّ id=1 · working_days_per_month · overtime_rate
--   attendance_summary: المفردات الثماني (0344) · يُبنى من البصمات (0347)
-- ============================================================================
\set ON_ERROR_STOP on

DO $$
DECLARE
  v_t    UUID := gen_random_uuid();
  v_tb   UUID := gen_random_uuid();
  v_u1 UUID := gen_random_uuid();  -- راتب من العقد
  v_u2 UUID := gen_random_uuid();  -- راتب من الملف
  v_u3 UUID := gen_random_uuid();  -- بلا عقد ولا ملف ⇒ الافتراضي
  v_u4 UUID := gen_random_uuid();  -- قرض يتجاوز الراتب
  v_u5 UUID := gen_random_uuid();  -- غير نشط
  v_uhr UUID := gen_random_uuid();
  v_ub UUID := gen_random_uuid();
  v_e1 UUID; v_e2 UUID; v_e3 UUID; v_e4 UUID; v_e5 UUID; v_ehr UUID; v_eb UUID;
  v_p  UUID := gen_random_uuid();
  v_p2 UUID := gen_random_uuid();
  v_pb UUID := gen_random_uuid();
  v_s  DATE := DATE '2026-03-01';
  v_en DATE := DATE '2026-03-31';
  v_n    INT;
  v_num  NUMERIC;
  v_txt  TEXT;
  v_err  TEXT;
  v_pass INT := 0;
  r      RECORD;
BEGIN
  -- ═══ التجهيز ══════════════════════════════════════════════════════════
  INSERT INTO public.tenants(id,name,name_ar,slug) VALUES
    (v_t ,'R48','رواتب أ','r48a-'||substr(v_t::text ,1,8)),
    (v_tb,'R48B','رواتب ب','r48b-'||substr(v_tb::text,1,8));
  INSERT INTO auth.users(id,email) VALUES
    (v_u1 ,'1-'||substr(v_u1::text ,1,8)||'@r48.io'),
    (v_u2 ,'2-'||substr(v_u2::text ,1,8)||'@r48.io'),
    (v_u3 ,'3-'||substr(v_u3::text ,1,8)||'@r48.io'),
    (v_u4 ,'4-'||substr(v_u4::text ,1,8)||'@r48.io'),
    (v_u5 ,'5-'||substr(v_u5::text ,1,8)||'@r48.io'),
    (v_uhr,'h-'||substr(v_uhr::text,1,8)||'@r48.io'),
    (v_ub ,'z-'||substr(v_ub::text ,1,8)||'@r48.io');

  -- ★★ سارة راتبها في الملف · والبقية بلا راتب في الملف
  INSERT INTO public.profiles(id,tenant_id,full_name,role,salary) VALUES
    (v_u1 ,v_t ,'أحمد العقد'    ,'employee', NULL),
    (v_u2 ,v_t ,'سارة الملف'    ,'employee', 800000),
    (v_u3 ,v_t ,'خالد الافتراضي','employee', NULL),
    (v_u4 ,v_t ,'نورا المقترضة' ,'employee', 500000),
    (v_u5 ,v_t ,'ياسر المؤرشف'  ,'employee', 900000),
    (v_uhr,v_t ,'هالة الموارد'  ,'hr'      , NULL),
    (v_ub ,v_tb,'موظف ب'        ,'employee', 700000);

  SELECT id INTO v_e1  FROM public.employees WHERE user_id=v_u1;
  SELECT id INTO v_e2  FROM public.employees WHERE user_id=v_u2;
  SELECT id INTO v_e3  FROM public.employees WHERE user_id=v_u3;
  SELECT id INTO v_e4  FROM public.employees WHERE user_id=v_u4;
  SELECT id INTO v_e5  FROM public.employees WHERE user_id=v_u5;
  SELECT id INTO v_ehr FROM public.employees WHERE user_id=v_uhr;
  SELECT id INTO v_eb  FROM public.employees WHERE user_id=v_ub;
  UPDATE public.employees SET employee_code='R-001' WHERE id=v_e1;
  UPDATE public.employees SET employee_code='R-002' WHERE id=v_e2;
  UPDATE public.employees SET employee_code='R-003' WHERE id=v_e3;
  UPDATE public.employees SET employee_code='R-004' WHERE id=v_e4;
  UPDATE public.employees SET employee_code='R-005', is_active=FALSE WHERE id=v_e5;
  UPDATE public.employees SET employee_code='R-HR'  WHERE id=v_ehr;

  ASSERT v_e1 IS NOT NULL AND v_eb IS NOT NULL,
    '0.1 محفّز 0317 لم يُنشئ سجلّات الموظفين';
  v_pass := v_pass + 1;

  -- ★★★ حقيقة بنيوية: employees لا يحوي عمود راتب (أساس العطل ②)
  SELECT count(*) INTO v_n FROM information_schema.columns
   WHERE table_schema='public' AND table_name='employees'
     AND column_name IN ('base_salary','salary');
  ASSERT v_n = 0,
    format('0.2 ★★★ employees يحوي %s عمود راتب — فرضية العطل ② باطلة', v_n);
  v_pass := v_pass + 1;

  -- ★★★ ومحفّز updated_at موجود (أساس العطل ⑨)
  SELECT count(*) INTO v_n FROM pg_trigger
   WHERE tgrelid='public.payroll_periods'::regclass AND NOT tgisinternal
     AND tgname='update_payroll_periods_updated_at';
  ASSERT v_n = 1,
    '0.3 ★★ محفّز updated_at غير موجود — فرضية العطل ⑨ باطلة';
  v_pass := v_pass + 1;
  -- ★ والعمود صار موجوداً الآن (0348)
  SELECT count(*) INTO v_n FROM information_schema.columns
   WHERE table_schema='public' AND table_name='payroll_periods'
     AND column_name='updated_at';
  ASSERT v_n = 1,
    '0.4 ★★★ عمود updated_at مفقود ⇒ كل UPDATE على الفترة يفشل';
  v_pass := v_pass + 1;

  -- ═══════════════════════════════════════════════════════════════════════
  -- الإعدادات والبيانات — الحساب اليدوي
  --
  --   الإعدادات: working_days=25 · tax=10% · ss=5% · overtime=2.0
  --              absence_penalty=20000 · default_basic=300000
  --
  --   أحمد (R-001): عقد نافذ 1,200,000 · حضر 20 · غاب 2 · أوفرتايم 10 ساعات
  --     ★ الملف NULL ⇒ لولا العقد لأخذ الافتراضي
  --     أجر الساعة = 1,200,000 / (25×8) = 6,000
  --     أوفرتايم   = 10 × 6,000 × 2.0 = 120,000
  --     غياب       = 2 × 20,000 = 40,000
  --     ضريبة      = 1,200,000 × 10% = 120,000
  --     ضمان       = 1,200,000 × 5%  = 60,000
  --     خصم        = 40,000 + 120,000 + 60,000 = 220,000
  --     صافي       = 1,200,000 + 120,000 − 220,000 = **1,100,000**
  --
  --   سارة (R-002): بلا عقد نافذ ⇒ الملف 800,000 · بلا حضور ⇒ 0/0
  --     ★★★★ قرضان approved: (100k/متبقّي 20k) و(150k/متبقّي 900k)
  --       القصّ لكل قرض: 20,000 + 150,000 = 170,000
  --       (بالمجموع لكانت LEAST(250k,920k) = 250,000 — فرق 80,000)
  --     وقرض ثالث pending ⇒ لا يُخصم
  --     خصم = 80,000 ضريبة + 40,000 ضمان + 170,000 قرض = 290,000
  --     صافي = 800,000 − 290,000 = **510,000**
  --
  --   خالد (R-003): بلا عقد نافذ وبلا ملف ⇒ الافتراضي **300,000**
  --     ★★★ وله قرضان: (250,000/متبقّي 60,000) و(400,000/متبقّي 0)
  --       القصّ لكل قرض: LEAST(250k,60k) + المُسدَّد مُقصى = 60,000
  --     خصم = 30,000 ضريبة + 15,000 ضمان + 60,000 قرض = 105,000
  --     صافي = **195,000**
  --
  --   نورا (R-004): ملف 500,000 · قرض قسطه 900,000 (يتجاوز الراتب!)
  --     خصم الخام = 0 + 50,000 + 25,000 + 900,000 = 975,000
  --     ★★★ والقصّ يمنع الصافي السالب: LEAST(975,000, 500,000) = 500,000
  --     صافي = 500,000 − 500,000 = **0**
  --
  --   ياسر (R-005): غير نشط ⇒ **لا سجلّ له**
  --   هالة (R-HR) : بلا عقد ولا ملف ⇒ الافتراضي 300,000 · صافي 255,000
  --
  --   ⇒ السجلّات = 5 · الإجمالي = 1,200,000+120,000+800,000+300,000
  --                            +500,000+300,000 = 3,220,000
  --     الخصومات = 220,000+290,000+105,000+500,000+45,000 = 1,160,000
  --     الصافي   = 1,100,000+510,000+195,000+0+255,000 = 2,060,000
  -- ═══════════════════════════════════════════════════════════════════════
  UPDATE public.payroll_settings
     SET working_days_per_month = 25, tax_rate = 10, social_security_rate = 5,
         overtime_rate = 2.0, absence_penalty_per_day = 20000,
         default_basic_salary = 300000
   WHERE id = 1;

  -- عقد أحمد النافذ
  INSERT INTO public.employee_contracts
    (tenant_id,employee_id,contract_type,start_date,end_date,salary_amount,status)
  VALUES (v_t,v_e1,'permanent','2026-01-01',NULL,1200000,'active');
  -- ★★ وعقد **منتهٍ** لسارة بمبلغ مختلف: يجب ألّا يُستعمل
  INSERT INTO public.employee_contracts
    (tenant_id,employee_id,contract_type,start_date,end_date,salary_amount,status)
  VALUES (v_t,v_e2,'fixed_term','2025-01-01','2025-12-31',9999999,'expired');

  -- حضور أحمد: 20 حاضر · 2 غائب · 10 ساعات أوفرتايم (600 دقيقة)
  INSERT INTO public.attendance_summary
    (tenant_id,employee_id,shift_date,status,total_hours,overtime_minutes)
  SELECT v_t, v_e1, v_s + g, 'حضور_بوقت', 8, CASE WHEN g < 10 THEN 60 ELSE 0 END
    FROM generate_series(0,19) g;
  INSERT INTO public.attendance_summary
    (tenant_id,employee_id,shift_date,status,total_hours)
  VALUES (v_t,v_e1,v_s + 20,'غائب',0), (v_t,v_e1,v_s + 21,'غائب',0);

  -- ★★ حضور **خارج الفترة**: يجب ألّا يُحتسب
  INSERT INTO public.attendance_summary
    (tenant_id,employee_id,shift_date,status,total_hours,overtime_minutes)
  VALUES (v_t,v_e1,v_s - 5,'حضور_بوقت',8,600);

  -- قرض نورا
  INSERT INTO public.employee_loans
    (tenant_id,employee_id,amount,remaining_amount,monthly_installment,
     months_count,months_paid,start_date,purpose,status)
  VALUES (v_t,v_e4,3000000,2000000,900000,10,1,'2026-01-01','سكن','approved');
  -- ★★ وقرض **مُسدَّد** لأحمد: يجب ألّا يُخصم
  INSERT INTO public.employee_loans
    (tenant_id,employee_id,amount,remaining_amount,monthly_installment,
     months_count,months_paid,start_date,purpose,status)
  VALUES (v_t,v_e1,1000000,0,100000,10,10,'2025-01-01','سلفة مُسدَّدة','approved');

  -- ★★★ عقد **نشط لكن منتهي المدة** لخالد: يجب ألّا يُستعمل.
  --   بلا هذا الصفّ كان عكسُ شرط `end_date >= v_day` يمرّ، لأن عقد
  --   سارة المنتهي يُقصى بـstatus='expired' قبل بلوغ شرط التاريخ.
  --   شرطان يحرسان الحالة نفسها ⇒ أحدهما لا يُختبَر.
  INSERT INTO public.employee_contracts
    (tenant_id,employee_id,contract_type,start_date,end_date,salary_amount,status)
  VALUES (v_t,v_e3,'fixed_term','2025-01-01','2025-06-30',7777777,'active');

  -- ★★★ قرض نورا الثاني: قسطه (500000) **أكبر من متبقّيه** (120000).
  --   آخر قسط في قرضٍ يوشك على السداد. بلا هذا الصفّ كان عكسُ
  --   `LEAST(installment, remaining)` يمرّ لأن قسطها الأول أصغر من
  --   متبقّيه فلا أثر للقصّ.
  --   ⇒ مجموع أقساطها = 900000 + 500000 = 1400000
  --     ومجموع متبقّيها = 2000000 + 120000 = 2120000
  --     LEAST(1400000, 2120000) = 1400000 — والقصّ بالراتب يُبقيها 500000
  INSERT INTO public.employee_loans
    (tenant_id,employee_id,amount,remaining_amount,monthly_installment,
     months_count,months_paid,start_date,purpose,status)
  VALUES (v_t,v_e4,1000000,120000,500000,4,3,'2025-11-01','سلفة','approved');

  -- ★★★★ قرضا سارة المميِّزان: مجموع الأقساط (250,000) **أصغر** من
  --   مجموع المتبقّي (920,000) — لكن أحدهما قسطه أكبر من متبقّيه.
  --     لكل قرض : LEAST(100k,20k) + LEAST(150k,900k) = 170,000
  --     بالمجموع: LEAST(250k, 920k)                  = 250,000
  --   الفرق 80,000 يظهر في الصافي ⇒ يجعل عكسَ «القصّ بالمجموع»
  --   قابلاً للملاحظة. وراتبها 800,000 يكفي فلا يُخفيه القصّ بالراتب.
  INSERT INTO public.employee_loans
    (tenant_id,employee_id,amount,remaining_amount,monthly_installment,
     months_count,months_paid,start_date,purpose,status)
  VALUES (v_t,v_e2,300000,20000,100000,3,2,'2026-01-01','آخر قسط','approved'),
         (v_t,v_e2,1200000,900000,150000,8,2,'2026-01-01','سكن','approved');

  -- ★★★ وقرض **قيد الانتظار** لسارة: remaining>0 لكن status='pending'
  --   ⇒ يجب ألّا يُخصم. بلا هذا الصفّ كان عكسُ شرط الحالة يمرّ لأن
  --   قرض أحمد المُسدَّد يُصفّره القصّ أصلاً (LEAST(x, 0) = 0).
  INSERT INTO public.employee_loans
    (tenant_id,employee_id,amount,remaining_amount,monthly_installment,
     months_count,months_paid,start_date,purpose,status)
  VALUES (v_t,v_e2,600000,600000,200000,3,0,'2026-03-01','طلب','pending');

  -- ★★★★ خالد: قرضٌ **واحد** قسطه 250000 ومتبقّيه 60000 (آخر قسط).
  --   راتبه 300000 يكفي للخصم ⇒ الفرق يظهر في الصافي مباشرةً:
  --     القصّ لكل قرض ⇒ 60000  · بلا قصّ ⇒ 250000
  --   وهذا يجعل عكسَي ④.2 و④.3 قابلَين للملاحظة.
  --   خصمه = 30000 ضريبة + 15000 ضمان + 60000 قرض = 105000
  --   صافيه = 300000 − 105000 = **195000**
  INSERT INTO public.employee_loans
    (tenant_id,employee_id,amount,remaining_amount,monthly_installment,
     months_count,months_paid,start_date,purpose,status)
  VALUES (v_t,v_e3,500000,60000,250000,2,1,'2026-01-01','آخر قسط','approved');

  -- ★★★ وقرض **مُسدَّد بالكامل** لخالد: remaining=0 ⇒ الشرط يُقصيه.
  --   بلا هذا الصفّ كان عكسُ `remaining_amount > 0` بلا أثر.
  INSERT INTO public.employee_loans
    (tenant_id,employee_id,amount,remaining_amount,monthly_installment,
     months_count,months_paid,start_date,purpose,status)
  VALUES (v_t,v_e3,400000,0,400000,1,1,'2025-01-01','مُسدَّد','approved');

  -- ★★ وضجيج المستأجر الآخر
  INSERT INTO public.payroll_periods(id,tenant_id,name,frequency,start_date,end_date,status)
    VALUES (v_pb,v_tb,'مارس ب','monthly',v_s,v_en,'draft');

  -- ★★★ ضجيج مميِّز لترشيح المستأجر (درس 0343 — المرة الثالثة عشرة):
  --   employee_id و period_id فريدان عالمياً، فالترشيح بهما يُقصي
  --   الأجنبي **ضمناً** وعكسُ `tenant_id = v_tenant` لا يُسقط شيئاً.
  --   الدليل الوحيد: صفوف تحمل **نفس** المعرّفات في مستأجر آخر.
  INSERT INTO public.attendance_summary
    (tenant_id,employee_id,shift_date,status,total_hours,overtime_minutes)
  VALUES (v_tb,v_e1,v_s + 3,'غائب',0,0), (v_tb,v_e1,v_s + 4,'غائب',0,0),
         (v_tb,v_e1,v_s + 5,'حضور_بوقت',8,1200);
  INSERT INTO public.employee_loans
    (tenant_id,employee_id,amount,remaining_amount,monthly_installment,
     months_count,months_paid,start_date,purpose,status)
  VALUES (v_tb,v_e1,9000000,9000000,777000,12,0,'2026-01-01','أجنبي','approved');
  -- ★ وسجلّ راتب بنفس period_id في المستأجر ب
  INSERT INTO public.payroll_records
    (tenant_id,period_id,employee_id,basic_salary,net_salary,
     working_days,present_days,absent_days,leave_days,overtime_hours)
  VALUES (v_tb,v_pb,v_eb,999999,999999,25,25,0,0,0);

  PERFORM set_config('request.jwt.claim.sub', v_uhr::text, TRUE);

  -- ═══════════════════════════════════════════════════════════════════════
  -- ① العطل ①: إنشاء الفترة كان مستحيلاً
  -- ═══════════════════════════════════════════════════════════════════════
  INSERT INTO public.payroll_periods
    (id,tenant_id,name,frequency,start_date,end_date,payment_date,status)
  VALUES (v_p,v_t,'مارس 2026','monthly',v_s,v_en,'2026-04-05','draft');
  SELECT count(*) INTO v_n FROM public.payroll_periods WHERE id=v_p;
  ASSERT v_n = 1,
    '1.1 ★★★ إنشاء الفترة بـfrequency/payment_date فشل — العطل ①';
  v_pass := v_pass + 1;

  -- ★★★ والتحديث يعمل الآن (العطل ⑨)
  UPDATE public.payroll_periods SET status='draft' WHERE id=v_p;
  ASSERT TRUE, '1.2 التحديث';
  v_pass := v_pass + 1;

  -- ═══════════════════════════════════════════════════════════════════════
  -- ② مصدر الراتب — ثلاث أولويات
  -- ═══════════════════════════════════════════════════════════════════════
  ASSERT public.employee_monthly_salary(v_e1, v_en) = 1200000,
    format('2.1 ★★★ أحمد: الراتب = %s (متوقَّع 1200000 من العقد النافذ). '
           '300000 يعني تجاهل العقد',
           public.employee_monthly_salary(v_e1, v_en));
  v_pass := v_pass + 1;

  ASSERT public.employee_monthly_salary(v_e2, v_en) = 800000,
    format('2.2 ★★★ سارة: الراتب = %s (متوقَّع 800000 من الملف). '
           '9999999 يعني استعمال عقدها **المنتهي**',
           public.employee_monthly_salary(v_e2, v_en));
  v_pass := v_pass + 1;

  -- ★★★ خالد له عقد status='active' لكنّ مدّته انتهت 2025-06-30
  --   ⇒ يجب أن يسقط إلى الافتراضي. 7777777 يعني إهمال شرط end_date.
  ASSERT public.employee_monthly_salary(v_e3, v_en) = 300000,
    format('2.3 ★★★ خالد: الراتب = %s (متوقَّع 300000 الافتراضي). '
           '7777777 يعني قبول عقد نشط **منتهي المدة**',
           public.employee_monthly_salary(v_e3, v_en));
  v_pass := v_pass + 1;

  -- ★★ والعقد يُقيَّم **بتاريخ الفترة** لا باليوم
  ASSERT public.employee_monthly_salary(v_e1, DATE '2025-06-01') = 300000,
    format('2.4 ★★★ أحمد قبل بدء عقده = %s (متوقَّع 300000 الافتراضي — '
           'العقد يبدأ 2026-01-01)',
           public.employee_monthly_salary(v_e1, DATE '2025-06-01'));
  v_pass := v_pass + 1;

  -- ═══════════════════════════════════════════════════════════════════════
  -- ③ تشغيل الرواتب
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT * INTO r FROM public.payroll_run(v_p);

  ASSERT r.out_employees = 5,
    format('3.1 ★★★ سجلّات = %s (متوقَّع 5 — ياسر غير نشط وموظف ب محجوب)',
           r.out_employees);
  v_pass := v_pass + 1;

  ASSERT r.out_gross = 3220000,
    format('3.2 ★★★ الإجمالي = %s (متوقَّع 3220000)', r.out_gross);
  v_pass := v_pass + 1;
  ASSERT r.out_deductions = 1160000,
    format('3.3 ★★★ الخصومات = %s (متوقَّع 1160000)', r.out_deductions);
  v_pass := v_pass + 1;
  ASSERT r.out_net = 2060000,
    format('3.4 ★★★ الصافي = %s (متوقَّع 2060000)', r.out_net);
  v_pass := v_pass + 1;

  -- ═══ أحمد: كل مكوّن على حدة ═══
  SELECT * INTO r FROM public.payroll_records
   WHERE tenant_id=v_t AND period_id=v_p AND employee_id=v_e1;

  ASSERT r.basic_salary = 1200000,
    format('3.5 ★★★ أحمد: الأساسي = %s (متوقَّع 1200000). صفر يعني قراءة '
           'employees.base_salary غير الموجود — العطل ②', r.basic_salary);
  v_pass := v_pass + 1;

  ASSERT r.working_days = 25,
    format('3.6 ★★★ أيام العمل = %s (متوقَّع 25 من الإعدادات). '
           '26 يعني الرقم المكتوب يدوياً — العطل ③', r.working_days);
  v_pass := v_pass + 1;

  ASSERT r.present_days = 20,
    format('3.7 ★★★ أحمد: أيام الحضور = %s (متوقَّع 20 من '
           'attendance_summary). 25 يعني present_days=working_days '
           'المكتوب يدوياً', r.present_days);
  v_pass := v_pass + 1;

  ASSERT r.absent_days = 2,
    format('3.8 ★★★ أحمد: أيام الغياب = %s (متوقَّع 2). صفر يعني '
           'absent_days=0 المكتوب يدوياً — لا غياب لأحد أبداً',
           r.absent_days);
  v_pass := v_pass + 1;

  -- ★★ 10 ساعات أوفرتايم (600 دقيقة) — والـ600 خارج الفترة مُستبعَدة
  ASSERT r.overtime_hours = 10,
    format('3.9 ★★★ أحمد: ساعات الأوفرتايم = %s (متوقَّع 10). 20 يعني '
           'احتساب اليوم خارج الفترة', r.overtime_hours);
  v_pass := v_pass + 1;

  -- 10 × (1200000/200) × 2.0 = 120000
  ASSERT r.overtime_pay = 120000,
    format('3.10 ★★★ أحمد: أجر الأوفرتايم = %s (متوقَّع 120000 = '
           '10 × 6000 × 2.0). صفر يعني تجاهل overtime_rate',
           r.overtime_pay);
  v_pass := v_pass + 1;

  -- 40000 غياب + 120000 ضريبة + 60000 ضمان = 220000
  ASSERT r.total_deductions = 220000,
    format('3.11 ★★★ أحمد: الخصومات = %s (متوقَّع 220000 = 40000 غياب + '
           '120000 ضريبة + 60000 ضمان). صفر يعني تجاهل الإعدادات كلها. '
           '320000 يعني خصم قرضه المُسدَّد', r.total_deductions);
  v_pass := v_pass + 1;

  ASSERT r.net_salary = 1100000,
    format('3.12 ★★★ أحمد: الصافي = %s (متوقَّع 1100000)', r.net_salary);
  v_pass := v_pass + 1;

  -- ★★★ ترشيح المستأجر: لأحمد في المستأجر ب يومان غياب و20 ساعة
  --   أوفرتايم وقرض قسطه 777000 — بنفس employee_id.
  ASSERT r.absent_days = 2,
    format('3.12b ★★★ أحمد: الغياب = %s (متوقَّع 2). 4 يعني تسرّب '
           'غياب المستأجر ب بنفس employee_id', r.absent_days);
  v_pass := v_pass + 1;
  ASSERT r.overtime_hours = 10,
    format('3.12c ★★★ أحمد: الأوفرتايم = %s (متوقَّع 10). 30 يعني تسرّب '
           'ساعات المستأجر ب', r.overtime_hours);
  v_pass := v_pass + 1;
  ASSERT r.total_deductions = 220000,
    format('3.12d ★★★ أحمد: الخصم = %s (متوقَّع 220000). 997000 يعني '
           'خصم قرض المستأجر ب', r.total_deductions);
  v_pass := v_pass + 1;

  -- ★★ والمعادلة تتماسك
  ASSERT r.net_salary = r.basic_salary + r.total_allowances + r.overtime_pay
                        + r.bonus_amount - r.total_deductions,
    '3.13 ★★★ معادلة الصافي مكسورة';
  v_pass := v_pass + 1;

  -- ═══ نورا: القرض يتجاوز الراتب ⇒ القصّ ═══
  SELECT * INTO r FROM public.payroll_records
   WHERE tenant_id=v_t AND period_id=v_p AND employee_id=v_e4;
  ASSERT r.basic_salary = 500000,
    format('3.14 نورا: الأساسي = %s (متوقَّع 500000)', r.basic_salary);
  v_pass := v_pass + 1;
  -- ★★★ قرضاها: 900000 (متبقّي 2000000) + 500000 (متبقّي 120000)
  --   ★★★ القصّ **لكل قرض**: LEAST(900000,2000000)+LEAST(500000,120000)
  --                        = 900000 + 120000 = 1020000
  --     (لو جُمعت الأقساط أولاً لصارت LEAST(1400000,2120000)=1400000)
  --   الخصم الخام = 0 + 50000 + 25000 + 1020000 = 1095000
  --   والقصّ بالراتب: LEAST(1095000, 500000) = 500000
  ASSERT r.total_deductions = 500000,
    format('3.15 ★★★ نورا: الخصم = %s (متوقَّع 500000 — قُصَّ بالراتب '
           'كي لا يصير الصافي سالباً)', r.total_deductions);
  v_pass := v_pass + 1;
  ASSERT r.net_salary = 0,
    format('3.16 ★★★ نورا: الصافي = %s (متوقَّع 0 لا سالباً)', r.net_salary);
  v_pass := v_pass + 1;

  -- ═══ سارة: من الملف · بلا حضور ═══
  SELECT * INTO r FROM public.payroll_records
   WHERE tenant_id=v_t AND period_id=v_p AND employee_id=v_e2;
  -- ★★★ سارة لها قرض remaining=600000 لكن status='pending'
  --   ⇒ لا يُخصم. 480000 يعني خصمه (680000 − 200000).
  ASSERT r.basic_salary = 800000 AND r.net_salary = 510000,
    format('3.17 ★★★ سارة: أساسي=%s صافي=%s (متوقَّع 800000/510000). '
           '310000 يعني خصم قرضها **قيد الانتظار** أيضاً',
           r.basic_salary, r.net_salary);
  v_pass := v_pass + 1;

  ASSERT r.total_deductions = 290000,
    format('3.17b ★★★★ سارة: الخصم = %s (متوقَّع 290000 = 120000 '
           'ضريبة+ضمان + 170000 قرضان مقصوصان لكلٍّ على حدة). '
           '370000 يعني القصّ بمجموع المتبقّي (250000) · '
           '490000 يعني خصم قرضها قيد الانتظار', r.total_deductions);
  v_pass := v_pass + 1;
  ASSERT r.present_days = 0 AND r.absent_days = 0,
    format('3.18 ★★ سارة بلا سجلّ حضور: حضور=%s غياب=%s (متوقَّع 0/0)',
           r.present_days, r.absent_days);
  v_pass := v_pass + 1;

  -- ═══ ★★★★ خالد: القصّ لكل قرض على حدة ═══
  SELECT * INTO r FROM public.payroll_records
   WHERE tenant_id=v_t AND period_id=v_p AND employee_id=v_e3;
  ASSERT r.basic_salary = 300000,
    format('3.18b خالد: الأساسي = %s (متوقَّع 300000)', r.basic_salary);
  v_pass := v_pass + 1;
  ASSERT r.total_deductions = 105000,
    format('3.18c ★★★★ خالد: الخصم = %s (متوقَّع 105000 = 30000 ضريبة + '
           '15000 ضمان + 60000 قرض مقصوص بمتبقّيه). '
           '295000 يعني خصم القسط كاملاً (250000) بلا قصّ · '
           '505000 يعني خصم القرض المُسدَّد أيضاً', r.total_deductions);
  v_pass := v_pass + 1;
  ASSERT r.net_salary = 195000,
    format('3.18d ★★★ خالد: الصافي = %s (متوقَّع 195000)', r.net_salary);
  v_pass := v_pass + 1;

  -- ═══ ياسر غير النشط لا سجلّ له · ولا موظف المستأجر ب ═══
  SELECT count(*) INTO v_n FROM public.payroll_records
   WHERE period_id=v_p AND employee_id=v_e5;
  ASSERT v_n = 0, '3.19 ★★★ ياسر غير النشط له سجلّ راتب';
  v_pass := v_pass + 1;
  SELECT count(*) INTO v_n FROM public.payroll_records
   WHERE period_id=v_p AND employee_id=v_eb;
  ASSERT v_n = 0, '3.20 ★★★ موظف المستأجر ب له سجلّ في فترة أ';
  v_pass := v_pass + 1;

  -- ★★ وحالة الفترة انتقلت
  SELECT status INTO v_txt FROM public.payroll_periods WHERE id=v_p;
  ASSERT v_txt = 'pending_approval',
    format('3.21 ★★ حالة الفترة = «%s» (متوقَّع pending_approval)', v_txt);
  v_pass := v_pass + 1;

  -- ═══════════════════════════════════════════════════════════════════════
  -- ④ ★★★ التشغيل مرّتين لا يُضاعف — العطل ⑧
  -- ═══════════════════════════════════════════════════════════════════════
  UPDATE public.payroll_periods SET status='draft' WHERE id=v_p;
  SELECT * INTO r FROM public.payroll_run(v_p);
  SELECT count(*) INTO v_n FROM public.payroll_records
   WHERE tenant_id=v_t AND period_id=v_p;
  ASSERT v_n = 5,
    format('4.1 ★★★ السجلّات بعد تشغيلين = %s (متوقَّع 5). 10 يعني '
           'التضاعف — upsertRecords كان create في حلقة بلا قيد فريد', v_n);
  v_pass := v_pass + 1;
  ASSERT r.out_net = 2060000,
    format('4.2 ★★ الصافي بعد التشغيل الثاني = %s (متوقَّع 2060000 ثابتاً)',
           r.out_net);
  v_pass := v_pass + 1;

  -- ═══════════════════════════════════════════════════════════════════════
  -- ⑤ الاعتماد — حراسة وأثر تدقيق
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT public.payroll_approve(v_p) INTO v_n;
  ASSERT v_n = 5, format('5.1 اعتماد = %s سجلّاً (متوقَّع 5)', v_n);
  v_pass := v_pass + 1;

  SELECT status, approved_by, approved_at, locked_at INTO r
    FROM public.payroll_periods WHERE id=v_p;
  ASSERT r.status = 'approved',
    format('5.2 الحالة = «%s»', r.status);
  v_pass := v_pass + 1;
  ASSERT r.approved_by = v_uhr,
    format('5.3 ★★★ approved_by = %s (متوقَّع %s) — أثر التدقيق',
           COALESCE(r.approved_by::text,'NULL'), v_uhr);
  v_pass := v_pass + 1;
  ASSERT r.approved_at IS NOT NULL AND r.locked_at IS NOT NULL,
    '5.4 ★★ approved_at أو locked_at فارغ';
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM public.payroll_records
   WHERE tenant_id=v_t AND period_id=v_p AND status='approved';
  ASSERT v_n = 5, format('5.5 سجلّات معتمَدة = %s (متوقَّع 5)', v_n);
  v_pass := v_pass + 1;

  -- ★★★ الاعتماد مرّتين مرفوض
  BEGIN
    PERFORM public.payroll_approve(v_p);
    RAISE EXCEPTION 'SENTINEL_56';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    ASSERT v_err <> 'SENTINEL_56',
      '5.6 ★★★ اعتماد الفترة مرّتين قُبل — لا حراسة انتقال';
    ASSERT v_err LIKE '%pending_approval%',
      format('5.6 رُفض بسبب غير متوقَّع: %s', v_err);
    v_pass := v_pass + 1;
  END;

  -- ★★★ والتشغيل على فترة معتمَدة مرفوض — العطل ⑦
  BEGIN
    PERFORM public.payroll_run(v_p);
    RAISE EXCEPTION 'SENTINEL_57';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    ASSERT v_err <> 'SENTINEL_57',
      '5.7 ★★★ تشغيل الرواتب على فترة **معتمَدة** قُبل — كتابة فوق '
      'سجلّات مُقفَلة';
    ASSERT v_err LIKE '%approved%',
      format('5.7 رُفض بسبب غير متوقَّع: %s', v_err);
    v_pass := v_pass + 1;
  END;

  -- ★★ واعتماد فترة بلا سجلّات مرفوض
  INSERT INTO public.payroll_periods
    (id,tenant_id,name,frequency,start_date,end_date,status)
  VALUES (v_p2,v_t,'أبريل','monthly','2026-04-01','2026-04-30','pending_approval');
  BEGIN
    PERFORM public.payroll_approve(v_p2);
    RAISE EXCEPTION 'SENTINEL_58';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    ASSERT v_err <> 'SENTINEL_58',
      '5.8 ★★ اعتماد فترة بلا سجلّات قُبل';
    ASSERT v_err LIKE '%لا سجلّات%',
      format('5.8 رُفض بسبب غير متوقَّع: %s', v_err);
    v_pass := v_pass + 1;
  END;

  -- ═══════════════════════════════════════════════════════════════════════
  -- ⑥ القيود
  -- ═══════════════════════════════════════════════════════════════════════
  -- ★★★ صافٍ لا يطابق المعادلة مرفوض
  BEGIN
    INSERT INTO public.payroll_records
      (tenant_id,period_id,employee_id,basic_salary,total_allowances,
       total_deductions,overtime_pay,bonus_amount,net_salary,
       working_days,present_days,absent_days,leave_days,overtime_hours)
    VALUES (v_t,v_p2,v_e3,100000,0,0,0,0, 999999, 25,25,0,0,0);
    RAISE EXCEPTION 'SENTINEL_61';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    ASSERT v_err <> 'SENTINEL_61',
      '6.1 ★★★ صافٍ لا يطابق المعادلة قُبل';
    ASSERT v_err LIKE '%payroll_records_net_check%',
      format('6.1 رُفض بسبب غير متوقَّع: %s', v_err);
    v_pass := v_pass + 1;
  END;

  -- ★★★ وصافٍ سالب مرفوض
  BEGIN
    INSERT INTO public.payroll_records
      (tenant_id,period_id,employee_id,basic_salary,total_allowances,
       total_deductions,overtime_pay,bonus_amount,net_salary,
       working_days,present_days,absent_days,leave_days,overtime_hours)
    VALUES (v_t,v_p2,v_e3,100000,0,150000,0,0, -50000, 25,25,0,0,0);
    RAISE EXCEPTION 'SENTINEL_62';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    ASSERT v_err <> 'SENTINEL_62', '6.2 ★★★ صافٍ سالب قُبل';
    ASSERT v_err LIKE '%payroll_records_net_nonneg%',
      format('6.2 رُفض بسبب غير متوقَّع: %s', v_err);
    v_pass := v_pass + 1;
  END;

  -- ★★ وحالة فترة غير مشروعة مرفوضة
  BEGIN
    INSERT INTO public.payroll_periods
      (tenant_id,name,frequency,start_date,end_date,status)
    VALUES (v_t,'خطأ','monthly','2026-05-01','2026-05-31','حالة مخترعة');
    RAISE EXCEPTION 'SENTINEL_63';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    ASSERT v_err <> 'SENTINEL_63', '6.3 ★★ حالة فترة مخترعة قُبلت';
    ASSERT v_err LIKE '%payroll_periods_status_check%',
      format('6.3 رُفض بسبب غير متوقَّع: %s', v_err);
    v_pass := v_pass + 1;
  END;

  -- ★★ ونطاق تاريخ معكوس مرفوض
  BEGIN
    INSERT INTO public.payroll_periods
      (tenant_id,name,frequency,start_date,end_date,status)
    VALUES (v_t,'معكوس','monthly','2026-05-31','2026-05-01','draft');
    RAISE EXCEPTION 'SENTINEL_64';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    ASSERT v_err <> 'SENTINEL_64', '6.4 ★★ نطاق معكوس قُبل';
    ASSERT v_err LIKE '%payroll_periods_range_check%',
      format('6.4 رُفض بسبب غير متوقَّع: %s', v_err);
    v_pass := v_pass + 1;
  END;

  -- ★★★ والقيد الفريد يمنع التكرار المباشر
  BEGIN
    INSERT INTO public.payroll_records
      (tenant_id,period_id,employee_id,basic_salary,net_salary,
       working_days,present_days,absent_days,leave_days,overtime_hours)
    VALUES (v_t,v_p,v_e1,1,1,25,25,0,0,0);
    RAISE EXCEPTION 'SENTINEL_65';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    ASSERT v_err <> 'SENTINEL_65',
      '6.5 ★★★ سجلّ راتب مكرّر لنفس (فترة، موظف) قُبل';
    ASSERT v_err LIKE '%payroll_records_unique_run%',
      format('6.5 رُفض بسبب غير متوقَّع: %s', v_err);
    v_pass := v_pass + 1;
  END;

  -- ═══════════════════════════════════════════════════════════════════════
  -- ⑦ الملخّص
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT * INTO r FROM public.payroll_period_summary(v_p);
  -- ★★★ سجلّ المستأجر ب يحمل period_id مختلفاً (v_pb) — لكن الملخّص
  --   لو أسقط ترشيح المستأجر لظهر في فترة v_pb. نفحص الفترتين.
  ASSERT r.out_records = 5,
    format('7.1 الملخّص: سجلّات = %s (متوقَّع 5)', r.out_records);
  v_pass := v_pass + 1;

  -- ★★★ ملخّص فترة المستأجر ب بجلسة أ ⇒ صفر (RLS + ترشيح المستأجر)
  SELECT * INTO r FROM public.payroll_period_summary(v_pb);
  ASSERT r.out_records = 0,
    format('7.1b ★★★ ملخّص فترة المستأجر ب بجلسة أ = %s سجلّاً '
           '(متوقَّع 0). 1 يعني إسقاط ترشيح tenant_id', r.out_records);
  v_pass := v_pass + 1;
  SELECT * INTO r FROM public.payroll_period_summary(v_p);
  v_pass := v_pass + 1;
  ASSERT r.out_gross = 3220000,
    format('7.2 الملخّص: الإجمالي = %s (متوقَّع 3220000)', r.out_gross);
  v_pass := v_pass + 1;
  ASSERT r.out_net = 2060000,
    format('7.3 الملخّص: الصافي = %s (متوقَّع 2060000)', r.out_net);
  v_pass := v_pass + 1;
  -- 2290000 / 5 = 458000
  ASSERT r.out_avg_net = 412000,
    format('7.4 ★★ متوسط الصافي = %s (متوقَّع 412000 = 2060000/5)', r.out_avg_net);
  v_pass := v_pass + 1;
  ASSERT r.out_absent = 2,
    format('7.5 أيام الغياب = %s (متوقَّع 2)', r.out_absent);
  v_pass := v_pass + 1;
  ASSERT r.out_overtime = 10,
    format('7.6 ساعات الأوفرتايم = %s (متوقَّع 10)', r.out_overtime);
  v_pass := v_pass + 1;

  -- ★ فترة بلا سجلّات ⇒ أصفار لا «لا شيء»
  SELECT count(*) INTO v_n FROM public.payroll_period_summary(v_p2);
  ASSERT v_n = 1, format('7.7 ★★ فترة فارغة أعادت %s صفّاً (متوقَّع 1)', v_n);
  v_pass := v_pass + 1;
  SELECT * INTO r FROM public.payroll_period_summary(NULL);
  ASSERT r.out_records = 0 AND r.out_net = 0,
    '7.8 ★★ فترة NULL: القيم ليست أصفاراً';
  v_pass := v_pass + 1;

  -- ═══════════════════════════════════════════════════════════════════════
  -- ⑧ الصلاحيات والعزل
  -- ═══════════════════════════════════════════════════════════════════════
  -- ★★★ موارد المستأجر أ لا يُشغّل فترة المستأجر ب (الجلسة ما زالت هالة)
  BEGIN
    PERFORM public.payroll_run(v_pb);
    RAISE EXCEPTION 'SENTINEL_80';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    ASSERT v_err <> 'SENTINEL_80',
      '8.0 ★★★ موارد المستأجر أ شغّل فترة المستأجر ب';
    ASSERT v_err LIKE '%غير موجودة في هذا المستأجر%',
      format('8.0 رُفض بسبب غير متوقَّع: %s', v_err);
    v_pass := v_pass + 1;
  END;

  -- ★★★ موظف عادي لا يُشغّل الرواتب
  PERFORM set_config('request.jwt.claim.sub', v_u3::text, TRUE);
  BEGIN
    PERFORM public.payroll_run(v_p2);
    RAISE EXCEPTION 'SENTINEL_81';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    ASSERT v_err <> 'SENTINEL_81',
      '8.1 ★★★ موظف عادي شغّل الرواتب';
    ASSERT v_err LIKE '%غير مصرَّح%',
      format('8.1 رُفض بسبب غير متوقَّع: %s', v_err);
    v_pass := v_pass + 1;
  END;
  BEGIN
    PERFORM public.payroll_approve(v_p2);
    RAISE EXCEPTION 'SENTINEL_82';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    ASSERT v_err <> 'SENTINEL_82', '8.2 ★★★ موظف عادي اعتمد الرواتب';
    ASSERT v_err LIKE '%غير مصرَّح%',
      format('8.2 رُفض بسبب غير متوقَّع: %s', v_err);
    v_pass := v_pass + 1;
  END;

  -- ★★★ وحارس مستأجر آخر لا يُشغّل فترة أ
  PERFORM set_config('request.jwt.claim.sub', v_ub::text, TRUE);
  BEGIN
    PERFORM public.payroll_run(v_p2);
    RAISE EXCEPTION 'SENTINEL_83';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    ASSERT v_err <> 'SENTINEL_83',
      '8.3 ★★★ موظف المستأجر ب شغّل فترة المستأجر أ';
    v_pass := v_pass + 1;
  END;

  -- ═══════════════════════════════════════════════════════════════════════
  -- ⑨ التوقيعات
  -- ═══════════════════════════════════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_uhr::text, TRUE);

  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN
     ('payroll_run','payroll_approve','payroll_period_summary',
      'employee_monthly_salary');
  ASSERT v_n = 4, format('9.1 دوال 0348 = %s (متوقَّع 4)', v_n);
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM pg_proc
   WHERE proname IN ('payroll_run','payroll_approve','employee_monthly_salary')
     AND prosecdef IS TRUE;
  ASSERT v_n = 3, format('9.2 ★★ دوال DEFINER = %s (متوقَّع 3)', v_n);
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM pg_proc
   WHERE proname = 'payroll_period_summary' AND prosecdef IS FALSE;
  ASSERT v_n = 1, '9.3 ★★ الملخّص يجب أن يكون INVOKER (RLS يحرسه)';
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM pg_proc
   WHERE proname IN ('payroll_run','payroll_approve','payroll_period_summary',
                     'employee_monthly_salary')
     AND array_to_string(proconfig,',') LIKE '%search_path%';
  ASSERT v_n = 4, format('9.4 ★★ دوال بـsearch_path = %s (متوقَّع 4)', v_n);
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM information_schema.routine_privileges
   WHERE routine_schema='public' AND grantee='anon'
     AND routine_name IN ('payroll_run','payroll_approve',
                          'payroll_period_summary','employee_monthly_salary');
  ASSERT v_n = 0, format('9.5 ★★ anon يملك EXECUTE على %s دالة', v_n);
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM pg_indexes
   WHERE schemaname='public' AND indexname IN
     ('idx_payroll_records_tenant_period','idx_payroll_periods_tenant_status',
      'idx_emp_contracts_emp_dates','idx_emp_loans_tenant_status');
  ASSERT v_n = 4, format('9.6 فهارس 0348 = %s (متوقَّع 4)', v_n);
  v_pass := v_pass + 1;

  RAISE NOTICE '✅ verify-payroll-run-0348: % تأكيداً ناجحاً', v_pass;
  RAISE EXCEPTION 'ROLLBACK_OK';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'ROLLBACK_OK' THEN RAISE; END IF;
END $$;
