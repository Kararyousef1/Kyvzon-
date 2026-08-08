-- ============================================================================
-- verify-hr-dashboard-0345.sql
--
-- لوحة الموارد البشرية: المؤشّرات · الأقسام · الاتجاه الشهري · العافية.
--
-- منهجية: يعمل بدور postgres (BYPASSRLS) فيقيس **منطق الدوال**.
--   العزل عبر RLS الحقيقي في verify-hr-dashboard-0345-rls.sh.
--
-- ★★★ درس مُكتشَف في هذه الجولة نفسها:
--   كتبتُ `i.archived` والعمود الحقيقي `archived_at`. **المايجريشن طُبِّق
--   بنجاح** لأن PL/pgSQL لا يفحص أجسام الاستعلامات عند الإنشاء، والاستدعاء
--   الأول عاد مبكراً من فرع `tenant_id IS NULL` فلم يبلغ السطر المعطوب.
--   ⇒ التأكيد ①.0 أدناه يستدعي كل دالة **بمستأجر حقيقي** قبل أي قياس،
--     لأن «الدالة أُنشئت» و«الدالة تعمل» ليسا الشيء نفسه.
--
-- ─── حقائق بنيوية مُحقَّقة ─────────────────────────────────────────────────
--   employees: is_active BOOLEAN DEFAULT true · **لا status**
--   wellness_entries: score INTEGER · mood VARCHAR · **لا mood_score**
--     UNIQUE (employee_id, date)
--   incidents: reported_by → **profiles** · employee_id → employees
--     archived_at TIMESTAMPTZ (**لا archived BOOLEAN**)
--     status ∈ pending·in_progress·resolved·closed
--   departments: name_ar (**لا name**)
--   محفّز 0317 يُنشئ سجلّ الموظف تلقائياً عند إدراج الملف
-- ============================================================================
\set ON_ERROR_STOP on

DO $$
DECLARE
  v_t     UUID := gen_random_uuid();
  v_tb    UUID := gen_random_uuid();
  v_dA    UUID := gen_random_uuid();
  v_dB    UUID := gen_random_uuid();
  v_dC    UUID := gen_random_uuid();
  v_dbb   UUID := gen_random_uuid();
  v_u1    UUID := gen_random_uuid();
  v_u2    UUID := gen_random_uuid();
  v_u3    UUID := gen_random_uuid();
  v_u4    UUID := gen_random_uuid();
  v_uhr   UUID := gen_random_uuid();
  v_ub    UUID := gen_random_uuid();
  v_e1 UUID; v_e2 UUID; v_e3 UUID; v_e4 UUID; v_ehr UUID; v_eb UUID;
  v_n     INT;
  v_txt   TEXT;
  v_pass  INT := 0;
  r       RECORD;
BEGIN
  -- ═══ التجهيز ══════════════════════════════════════════════════════════
  INSERT INTO public.tenants(id,name,name_ar,slug) VALUES
    (v_t ,'H45','موارد أ','h45a-'||substr(v_t::text ,1,8)),
    (v_tb,'H45B','موارد ب','h45b-'||substr(v_tb::text,1,8));
  INSERT INTO auth.users(id,email) VALUES
    (v_u1 ,'a-'||substr(v_u1::text ,1,8)||'@h45.io'),
    (v_u2 ,'b-'||substr(v_u2::text ,1,8)||'@h45.io'),
    (v_u3 ,'c-'||substr(v_u3::text ,1,8)||'@h45.io'),
    (v_u4 ,'d-'||substr(v_u4::text ,1,8)||'@h45.io'),
    (v_uhr,'h-'||substr(v_uhr::text,1,8)||'@h45.io'),
    (v_ub ,'z-'||substr(v_ub::text ,1,8)||'@h45.io');
  INSERT INTO public.departments(id,tenant_id,name_ar) VALUES
    (v_dA ,v_t ,'الإنتاج'),
    (v_dB ,v_t ,'الجودة'),
    (v_dC ,v_t ,'المالية'),      -- ★ قسم بلا موظفين ولا بلاغات
    (v_dbb,v_tb,'قسم المستأجر ب');
  INSERT INTO public.profiles(id,tenant_id,full_name,role) VALUES
    (v_u1 ,v_t ,'أحمد الإنتاج','employee'),
    (v_u2 ,v_t ,'سارة الإنتاج','employee'),
    (v_u3 ,v_t ,'خالد الجودة','employee'),
    (v_u4 ,v_t ,'نورا الجودة','employee'),
    (v_uhr,v_t ,'هالة الموارد','hr'),
    (v_ub ,v_tb,'موظف ب','employee');

  SELECT id INTO v_e1  FROM public.employees WHERE user_id=v_u1;
  SELECT id INTO v_e2  FROM public.employees WHERE user_id=v_u2;
  SELECT id INTO v_e3  FROM public.employees WHERE user_id=v_u3;
  SELECT id INTO v_e4  FROM public.employees WHERE user_id=v_u4;
  SELECT id INTO v_ehr FROM public.employees WHERE user_id=v_uhr;
  SELECT id INTO v_eb  FROM public.employees WHERE user_id=v_ub;

  UPDATE public.employees SET department_id=v_dA WHERE id IN (v_e1,v_e2);
  UPDATE public.employees SET department_id=v_dB WHERE id IN (v_e3,v_e4);
  UPDATE public.employees SET department_id=v_dA WHERE id=v_ehr;
  UPDATE public.employees SET department_id=v_dbb WHERE id=v_eb;
  -- ★ موظف واحد غير نشط: يفرّق total عن active
  UPDATE public.employees SET is_active=FALSE WHERE id=v_e4;

  ASSERT v_e1 IS NOT NULL AND v_eb IS NOT NULL,
    '0.1 محفّز 0317 لم يُنشئ سجلّات الموظفين — التجهيز باطل';
  v_pass := v_pass + 1;
  ASSERT v_e1 <> v_u1,
    '0.2 ★★ employees.id = profiles.id ⇒ الاختبار لا يقيس العطل ③';
  v_pass := v_pass + 1;

  -- ★★ حقيقة بنيوية: العمودان اللذان بُني عليهما العطلان ①② غائبان فعلاً
  SELECT count(*) INTO v_n FROM information_schema.columns
   WHERE table_schema='public' AND table_name='employees' AND column_name='status';
  ASSERT v_n = 0,
    '0.3 ★★★ عمود employees.status **موجود** — فرضية العطل ① باطلة، راجعها';
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM information_schema.columns
   WHERE table_schema='public' AND column_name='mood_score';
  ASSERT v_n = 0,
    '0.4 ★★★ عمود mood_score موجود في مكان ما — فرضية العطل ② باطلة';
  v_pass := v_pass + 1;

  -- ★★★ reported_by → profiles لا employees (أساس العطل ③)
  SELECT pg_get_constraintdef(oid) INTO v_txt FROM pg_constraint
   WHERE conrelid='public.incidents'::regclass AND contype='f'
     AND conname LIKE '%reported_by%';
  ASSERT v_txt LIKE '%REFERENCES profiles(id)%',
    format('0.5 ★★★ reported_by لا يشير إلى profiles: %s', v_txt);
  v_pass := v_pass + 1;

  -- ★★ و'escalated' ممنوعة بقيد (أساس العطل ④)
  SELECT pg_get_constraintdef(oid) INTO v_txt FROM pg_constraint
   WHERE conrelid='public.incidents'::regclass AND contype='c'
     AND pg_get_constraintdef(oid) LIKE '%status%';
  ASSERT v_txt NOT LIKE '%escalated%',
    '0.6 ★★ ''escalated'' مسموحة في القيد — فرضية العطل ④ باطلة';
  ASSERT v_txt LIKE '%pending%' AND v_txt LIKE '%closed%',
    format('0.7 قيد الحالة غير متوقَّع: %s', v_txt);
  v_pass := v_pass + 1;

  -- ═══════════════════════════════════════════════════════════════════════
  -- البيانات — الأرقام محسوبة يدوياً في التعليق قبل التشغيل
  --
  --   الموظفون (المستأجر أ): 5
  --     أحمد(الإنتاج·نشط) · سارة(الإنتاج·نشط) · هالة(الإنتاج·نشط·hr)
  --     خالد(الجودة·نشط)  · نورا(الجودة·**غير نشطة**)
  --   ⇒ total=5 · active=4 · departments=3 (الإنتاج·الجودة·المالية)
  --
  --   العافية (آخر 30 يوماً):
  --     أحمد: 80 و 60  ⇒ متوسطه 70
  --     سارة: 90       ⇒ متوسطه 90
  --     خالد: 40       ⇒ متوسطه 40
  --   ⇒ المتوسط العامّ على **الإدخالات** = (80+60+90+40)/4 = 67.5 ⇒ 68
  --     (round(67.5) في Postgres = 68 — تقريب نصفيّ بعيداً عن الصفر)
  --     samples = 4
  --   ⇒ متوسط قسم الإنتاج على **الموظفين** = (70+90)/2 = 80
  --     ★ لو حُسب على الإدخالات لكان (80+60+90)/3 = 76.67 ⇒ 77
  --       والفرق 80 مقابل 77 هو ما يُثبت أن التجميع على الموظف أولاً
  --   ⇒ متوسط قسم الجودة = 40 · المالية = 0 (لا بيانات — لا 75)
  --
  --   البلاغات:
  --     ب1 pending  · critical · department_id=الإنتاج
  --     ب2 in_progress · high  · employee_id=خالد(الجودة) · غير مُسنَد
  --     ب3 resolved · medium   · reported_by=profiles(أحمد) ⇒ الإنتاج
  --     ب4 closed   · low      · بلا أي نسبة ⇒ قسم مجهول
  --     ب5 pending  · critical · مؤرشَف ⇒ يُستبعَد كلياً
  --   ⇒ pending=1 · in_progress=1 · resolved=1 · closed=1 · total=4
  --     critical_open=1 (ب1 فقط — ب5 مؤرشَف)
  --     unassigned: ب1 وب2 مفتوحان بلا assigned_to ⇒ 2
  --   ⇒ الإنتاج: problems=2 (ب1,ب3) · open=1 (ب1)
  --     الجودة : problems=1 (ب2)    · open=1
  --     المالية: problems=0
  -- ═══════════════════════════════════════════════════════════════════════
  INSERT INTO public.wellness_entries(tenant_id,employee_id,date,score,mood,stress,energy) VALUES
    (v_t,v_e1,current_date    ,80,'good'   ,20,80),
    (v_t,v_e1,current_date - 1,60,'neutral',40,60),
    (v_t,v_e2,current_date    ,90,'great'  ,10,90),
    (v_t,v_e3,current_date    ,40,'bad'    ,70,30);
  -- ★★ ضجيج: إدخال قديم خارج نافذة الثلاثين يوماً
  INSERT INTO public.wellness_entries(tenant_id,employee_id,date,score,mood,stress,energy)
    VALUES (v_t,v_e1,current_date - 60,10,'terrible',95,5);
  -- ★★ وضجيج المستأجر الآخر
  INSERT INTO public.wellness_entries(tenant_id,employee_id,date,score,mood,stress,energy)
    VALUES (v_tb,v_eb,current_date,5,'terrible',99,1);

  INSERT INTO public.incidents
    (tenant_id,user_id,title,description,category,severity,status,
     department_id,employee_id,reported_by,assigned_to,created_at,updated_at)
  VALUES
    (v_t,v_u1,'ب1','وصف','safety'   ,'critical','pending'    ,v_dA ,NULL ,NULL ,NULL,NOW(),NOW()),
    (v_t,v_u3,'ب2','وصف','technical','high'    ,'in_progress',NULL ,v_e3 ,NULL ,NULL,NOW(),NOW()),
    (v_t,v_u1,'ب3','وصف','hr'       ,'medium'  ,'resolved'   ,NULL ,NULL ,v_u1 ,v_ehr,NOW(),NOW()),
    (v_t,v_u2,'ب4','وصف','other'    ,'low'     ,'closed'     ,NULL ,NULL ,NULL ,v_ehr,NOW(),NOW());
  -- ★★★ ب6 — الصفّ المميِّز الذي يُغطّي ثلاث ثغرات دفعةً واحدة.
  --
  --   درس تغطية مُكتشَف في جولة العكس: ثلاثة عكوس مرّت (critical يشمل
  --   المُغلقة · unassigned يشمل المُغلقة · resolved_month بلا حدّ زمني)
  --   لأن بياناتي **لا تحوي الحالة التي تُفرّق**: لم يكن ثمة بلاغ حرج
  --   مُغلق، ولا مُغلق بلا مُسنَد، ولا محلول خارج الشهر.
  --   شرطٌ لا تُوجَد بياناتٌ تخالفه = شرط غير مُختبَر.
  --
  --   ب6: closed · critical · بلا assigned_to · حُدِّث الشهر الماضي
  --   ⇒ يجب أن **يُقصى** من: critical_open · unassigned · resolved_month
  --   ⇒ ويُحتسب في: closed · incidents_total
  INSERT INTO public.incidents
    (tenant_id,user_id,title,description,category,severity,status,
     assigned_to,created_at,updated_at)
  VALUES (v_t,v_u2,'ب6','وصف','safety','critical','closed',
          NULL,
          date_trunc('month', current_date) - INTERVAL '10 days',
          date_trunc('month', current_date) - INTERVAL '10 days');

  -- ★★ بلاغ مؤرشَف — يجب أن يُستبعَد من كل عدّ
  INSERT INTO public.incidents
    (tenant_id,user_id,title,description,category,severity,status,
     department_id,archived_at,archived_by,created_at,updated_at)
  VALUES
    (v_t,v_u1,'ب5 مؤرشَف','وصف','safety','critical','pending',v_dA,NOW(),v_uhr,NOW(),NOW());
  -- ★★ وضجيج المستأجر الآخر
  INSERT INTO public.incidents
    (tenant_id,user_id,title,description,category,severity,status,created_at,updated_at)
  VALUES (v_tb,v_ub,'بلاغ ب','وصف','other','critical','pending',NOW(),NOW());

  PERFORM set_config('request.jwt.claim.sub', v_uhr::text, TRUE);

  -- ═══════════════════════════════════════════════════════════════════════
  -- ①.0 ★★★ الحارس: كل دالة تُستدعى بمستأجر حقيقي وتعود بصفوف
  --
  --   بلا هذا التأكيد كان عمود خاطئ (`i.archived`) يمرّ صامتاً — الدالة
  --   تُنشأ بنجاح والاستدعاء بلا مستأجر يعود مبكراً قبل السطر المعطوب.
  -- ═══════════════════════════════════════════════════════════════════════
  ASSERT public.current_user_tenant_id() = v_t,
    '1.0a ★★★ السياق لم يُضبَط — كل ما بعده يقيس الفرع الفارغ';
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM public.hr_dashboard_summary();
  ASSERT v_n = 1, format('1.0b summary أعادت %s صفّاً (متوقَّع 1)', v_n);
  v_pass := v_pass + 1;
  SELECT count(*) INTO v_n FROM public.hr_dashboard_departments(20);
  ASSERT v_n = 3, format('1.0c departments أعادت %s (متوقَّع 3)', v_n);
  v_pass := v_pass + 1;
  SELECT count(*) INTO v_n FROM public.hr_dashboard_monthly_trend(6);
  ASSERT v_n = 6, format('1.0d monthly أعادت %s (متوقَّع 6)', v_n);
  v_pass := v_pass + 1;
  SELECT count(*) INTO v_n FROM public.hr_dashboard_wellness_trend(7);
  ASSERT v_n = 7, format('1.0e wellness أعادت %s (متوقَّع 7)', v_n);
  v_pass := v_pass + 1;

  -- ═══════════════════════════════════════════════════════════════════════
  -- ① المؤشّرات
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT * INTO r FROM public.hr_dashboard_summary();

  ASSERT r.out_total_employees = 5,
    format('1.1 total = %s (متوقَّع 5 — 6 يعني تسرّب موظف المستأجر ب)',
           r.out_total_employees);
  v_pass := v_pass + 1;

  -- ★★★ العطل ①: كان صفراً دائماً
  ASSERT r.out_active_employees = 4,
    format('1.2 ★★★ active = %s (متوقَّع 4 — نورا غير نشطة). '
           'صفر يعني ترشيح e.status وهو عمود غير موجود · '
           '5 يعني إهمال is_active', r.out_active_employees);
  v_pass := v_pass + 1;

  -- ★★ الرقمان مختلفان فعلاً — وإلا لم يقس التأكيد شيئاً
  ASSERT r.out_active_employees <> r.out_total_employees,
    '1.3 ★★ active = total ⇒ التجهيز لا يميّز غير النشط';
  v_pass := v_pass + 1;

  ASSERT r.out_departments = 3,
    format('1.4 departments = %s (متوقَّع 3 — المالية فارغة لكنها موجودة)',
           r.out_departments);
  v_pass := v_pass + 1;

  -- ★★★ العطل ②: كان NaN
  ASSERT r.out_wellness_score = 68,
    format('1.5 ★★★ wellness = %s (متوقَّع 68 = round((80+60+90+40)/4)). '
           'صفر يعني قراءة mood_score غير الموجود · '
           '58 يعني إدخال الـ60 يوماً القديم', r.out_wellness_score);
  v_pass := v_pass + 1;

  ASSERT r.out_wellness_samples = 4,
    format('1.6 ★★ samples = %s (متوقَّع 4 — الإدخال القديم مُستبعَد '
           'وضجيج المستأجر ب محجوب)', r.out_wellness_samples);
  v_pass := v_pass + 1;

  ASSERT r.out_pending = 1,
    format('1.7 pending = %s (متوقَّع 1 — 2 يعني عدّ المؤرشَف)', r.out_pending);
  v_pass := v_pass + 1;
  ASSERT r.out_in_progress = 1,
    format('1.8 in_progress = %s (متوقَّع 1)', r.out_in_progress);
  v_pass := v_pass + 1;
  ASSERT r.out_resolved = 1,
    format('1.9 resolved = %s (متوقَّع 1)', r.out_resolved);
  v_pass := v_pass + 1;
  ASSERT r.out_closed = 2,
    format('1.10 closed = %s (متوقَّع 2: ب4 وب6)', r.out_closed);
  v_pass := v_pass + 1;

  -- ★★★ البلاغ المؤرشَف مُستبعَد من الإجمالي
  ASSERT r.out_incidents_total = 5,
    format('1.11 ★★★ total = %s (متوقَّع 5 — 6 يعني عدّ المؤرشَف · '
           '7 يعني تسرّب المستأجر ب)', r.out_incidents_total);
  v_pass := v_pass + 1;

  -- ★★ الأجزاء تساوي الكلّ — حارس ضدّ حالة تُبتلع
  ASSERT r.out_pending + r.out_in_progress + r.out_resolved + r.out_closed
         = r.out_incidents_total,
    format('1.12 ★★ مجموع الحالات %s ≠ الإجمالي %s',
           r.out_pending + r.out_in_progress + r.out_resolved + r.out_closed,
           r.out_incidents_total);
  v_pass := v_pass + 1;

  -- ★★★ الحرجة **المفتوحة** — لا الحرجة المُغلقة ولا المؤرشَفة
  -- ★★★ ثلاثة بلاغات حرجة: ب1(pending) · ب5(مؤرشَف) · ب6(closed)
  --   والمفتوح منها واحد فقط. رقمٌ أكبر يكشف أي شرط سقط:
  --     2 ⇒ عُدَّ ب6 المُغلق (شرط الحالة سقط)
  --     3 ⇒ عُدَّ المؤرشَف أيضاً
  ASSERT r.out_critical_open = 1,
    format('1.13 ★★★ critical_open = %s (متوقَّع 1: ب1 وحده). '
           '2 يعني عدّ ب6 المُغلق · 3 يعني عدّ المؤرشَف ب5',
           r.out_critical_open);
  v_pass := v_pass + 1;

  -- ★★★ بديل بطاقة escalated الميّتة
  -- ★★★ ثلاثة بلا مُسنَد: ب1(pending) · ب2(in_progress) · ب6(closed)
  --   والمفتوح منها اثنان. 3 يعني أن شرط الحالة سقط.
  ASSERT r.out_unassigned = 2,
    format('1.14 ★★★ unassigned = %s (متوقَّع 2: ب1 وب2). '
           '3 يعني عدّ ب6 المُغلق — بلاغ مُنتهٍ لا يحتاج إسناداً',
           r.out_unassigned);
  v_pass := v_pass + 1;

  -- ★★★ ثلاثة منتهية: ب3·ب4 هذا الشهر · ب6 الشهر الماضي.
  --   3 يعني أن الحدّ الزمني سقط فصار المؤشّر تراكمياً لا شهرياً.
  ASSERT r.out_resolved_month = 2,
    format('1.15 ★★★ resolved_month = %s (متوقَّع 2: ب3 وب4). '
           '3 يعني عدّ ب6 من الشهر الماضي — المؤشّر يصير تراكمياً',
           r.out_resolved_month);
  v_pass := v_pass + 1;

  -- ═══════════════════════════════════════════════════════════════════════
  -- ② الأقسام — جوهر العطل ③
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT * INTO r FROM public.hr_dashboard_departments(20)
   WHERE out_name = 'الإنتاج';

  ASSERT r.out_employee_count = 3,
    format('2.1 الإنتاج: موظفون = %s (متوقَّع 3: أحمد·سارة·هالة)',
           r.out_employee_count);
  v_pass := v_pass + 1;
  ASSERT r.out_active_count = 3,
    format('2.2 الإنتاج: نشطون = %s (متوقَّع 3)', r.out_active_count);
  v_pass := v_pass + 1;

  -- ★★★ العطل ③: كان صفراً لكل الأقسام
  ASSERT r.out_problem_count = 2,
    format('2.3 ★★★ الإنتاج: بلاغات = %s (متوقَّع 2: ب1 عبر '
           'department_id وب3 عبر reported_by→profiles→employees). '
           'صفر يعني ربط reported_by بـemployees.id · '
           '1 يعني إهمال مسار reported_by', r.out_problem_count);
  v_pass := v_pass + 1;

  ASSERT r.out_open_problems = 1,
    format('2.4 الإنتاج: مفتوحة = %s (متوقَّع 1: ب1)', r.out_open_problems);
  v_pass := v_pass + 1;

  -- ★★★ متوسط على الموظفين لا الإدخالات: 80 ≠ 77
  ASSERT r.out_wellness_avg = 80,
    format('2.5 ★★★ الإنتاج: عافية = %s (متوقَّع 80 = (70+90)/2 بعد '
           'تجميع كل موظف). 77 يعني المتوسط على الإدخالات مباشرة '
           '(80+60+90)/3 — فيطغى كثير التسجيل', r.out_wellness_avg);
  v_pass := v_pass + 1;

  ASSERT r.out_wellness_count = 2,
    format('2.6 الإنتاج: موظفون لهم سجلّ عافية = %s (متوقَّع 2)',
           r.out_wellness_count);
  v_pass := v_pass + 1;

  -- ═══ الجودة — قيم مختلفة تماماً ═══
  SELECT * INTO r FROM public.hr_dashboard_departments(20)
   WHERE out_name = 'الجودة';
  ASSERT r.out_employee_count = 2,
    format('2.7 الجودة: موظفون = %s (متوقَّع 2)', r.out_employee_count);
  v_pass := v_pass + 1;
  ASSERT r.out_active_count = 1,
    format('2.8 ★★ الجودة: نشطون = %s (متوقَّع 1 — نورا غير نشطة)',
           r.out_active_count);
  v_pass := v_pass + 1;
  -- ★★★ النسبة عبر employee_id (المسار الثاني)
  ASSERT r.out_problem_count = 1,
    format('2.9 ★★★ الجودة: بلاغات = %s (متوقَّع 1: ب2 عبر employee_id)',
           r.out_problem_count);
  v_pass := v_pass + 1;
  ASSERT r.out_wellness_avg = 40,
    format('2.10 الجودة: عافية = %s (متوقَّع 40)', r.out_wellness_avg);
  v_pass := v_pass + 1;

  -- ═══ المالية — قسم فارغ: صفر لا 75 مُختلَقة ═══
  SELECT * INTO r FROM public.hr_dashboard_departments(20)
   WHERE out_name = 'المالية';
  ASSERT r.out_employee_count = 0 AND r.out_problem_count = 0,
    format('2.11 المالية: موظفون=%s بلاغات=%s (متوقَّع 0/0)',
           r.out_employee_count, r.out_problem_count);
  v_pass := v_pass + 1;
  ASSERT r.out_wellness_avg = 0,
    format('2.12 ★★★ المالية: عافية = %s (متوقَّع 0). 75 يعني القيمة '
           'المُختلَقة التي كانت الصفحة تكتبها لكل قسم بلا بيانات',
           r.out_wellness_avg);
  v_pass := v_pass + 1;

  -- ★★ ولا قسم من المستأجر الآخر
  SELECT count(*) INTO v_n FROM public.hr_dashboard_departments(20)
   WHERE out_name = 'قسم المستأجر ب';
  ASSERT v_n = 0, '2.13 ★★★ قسم المستأجر ب ظهر في القائمة';
  v_pass := v_pass + 1;

  -- ★ الحدّ يُقصّ ولا يُسقط
  SELECT count(*) INTO v_n FROM public.hr_dashboard_departments(1);
  ASSERT v_n = 1, format('2.14 limit=1 أعاد %s', v_n);
  v_pass := v_pass + 1;
  SELECT count(*) INTO v_n FROM public.hr_dashboard_departments(-5);
  ASSERT v_n = 1, format('2.15 limit سالب أعاد %s (متوقَّع 1 — قُصَّ)', v_n);
  v_pass := v_pass + 1;
  SELECT count(*) INTO v_n FROM public.hr_dashboard_departments(99999);
  ASSERT v_n = 3, format('2.16 limit مفرط أعاد %s (متوقَّع 3)', v_n);
  v_pass := v_pass + 1;

  -- ═══════════════════════════════════════════════════════════════════════
  -- ③ الاتجاه الشهري — السنة تُحترم
  -- ═══════════════════════════════════════════════════════════════════════
  -- ★★★ بلاغ في نفس الشهر لكن **قبل سنتين**: العطل الأصلي (getMonth
  --   وحده) كان يحتسبه ضمن الشهر الحالي.
  INSERT INTO public.incidents
    (tenant_id,user_id,title,description,category,severity,status,created_at,updated_at)
  VALUES (v_t,v_u1,'بلاغ قديم جداً','وصف','other','critical','pending',
          NOW() - INTERVAL '2 years', NOW() - INTERVAL '2 years');

  SELECT * INTO r FROM public.hr_dashboard_monthly_trend(6)
   ORDER BY out_year DESC, out_month DESC LIMIT 1;

  ASSERT r.out_year = EXTRACT(YEAR FROM current_date)::INTEGER
     AND r.out_month = EXTRACT(MONTH FROM current_date)::INTEGER,
    format('3.1 آخر شهر = %s-%s (متوقَّع الشهر الحالي)', r.out_year, r.out_month);
  v_pass := v_pass + 1;

  ASSERT r.out_problems = 4,
    format('3.2 ★★★ بلاغات الشهر = %s (متوقَّع 4). 5 يعني احتساب بلاغ '
           'قبل سنتين في نفس الشهر — عطل getMonth() بلا سنة',
           r.out_problems);
  v_pass := v_pass + 1;

  ASSERT r.out_critical = 1,
    format('3.3 حرجة الشهر = %s (متوقَّع 1: ب1 — المؤرشَف والقديم مُستبعَدان)',
           r.out_critical);
  v_pass := v_pass + 1;

  ASSERT r.out_resolved = 2,
    format('3.4 محلولة الشهر = %s (متوقَّع 2)', r.out_resolved);
  v_pass := v_pass + 1;

  -- ★★ الأشهر الفارغة تظهر بصفر لا تختفي
  -- ★ ب6 أُنشئ الشهر الماضي ⇒ خمسة أشهر معروضة غير الحالي، أحدها
  --   (الماضي) فيه بلاغ واحد ⇒ الفارغة أربعة.
  SELECT count(*) INTO v_n FROM public.hr_dashboard_monthly_trend(6)
   WHERE out_problems = 0;
  ASSERT v_n = 4,
    format('3.5 ★★ أشهر بصفر = %s (متوقَّع 4 — الرسم يعرض الأشهر '
           'الفارغة ولا يقفز فوقها)', v_n);
  v_pass := v_pass + 1;

  -- ★★ والشهر الماضي فيه ب6 بالضبط — دليل موجب أن النافذة تمتدّ فعلاً
  SELECT * INTO r FROM public.hr_dashboard_monthly_trend(6)
   WHERE out_year  = EXTRACT(YEAR  FROM (date_trunc('month',current_date) - INTERVAL '1 month'))::INTEGER
     AND out_month = EXTRACT(MONTH FROM (date_trunc('month',current_date) - INTERVAL '1 month'))::INTEGER;
  ASSERT r.out_problems = 1,
    format('3.5b ★★ الشهر الماضي = %s بلاغ (متوقَّع 1: ب6)', r.out_problems);
  v_pass := v_pass + 1;
  ASSERT r.out_resolved = 1,
    format('3.5c الشهر الماضي: منتهية = %s (متوقَّع 1)', r.out_resolved);
  v_pass := v_pass + 1;

  -- ★★ والترتيب تصاعدي زمنياً (الرسم يُقرأ يساراً لليمين)
  SELECT count(*) INTO v_n FROM (
    SELECT out_year*12 + out_month AS ym,
           lag(out_year*12 + out_month) OVER () AS prev
      FROM public.hr_dashboard_monthly_trend(6)
  ) q WHERE prev IS NOT NULL AND ym <= prev;
  ASSERT v_n = 0, format('3.6 ★★ الترتيب غير تصاعدي (%s خرق)', v_n);
  v_pass := v_pass + 1;

  -- ★ الحدود
  SELECT count(*) INTO v_n FROM public.hr_dashboard_monthly_trend(1);
  ASSERT v_n = 1, format('3.7 months=1 أعاد %s', v_n);
  v_pass := v_pass + 1;
  SELECT count(*) INTO v_n FROM public.hr_dashboard_monthly_trend(999);
  ASSERT v_n = 36, format('3.8 months مفرط أعاد %s (متوقَّع 36)', v_n);
  v_pass := v_pass + 1;

  -- ═══════════════════════════════════════════════════════════════════════
  -- ④ اتجاه العافية — NULL لا صفر
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT * INTO r FROM public.hr_dashboard_wellness_trend(7)
   WHERE out_date = current_date;
  -- اليوم: أحمد 80 · سارة 90 · خالد 40 ⇒ (80+90+40)/3 = 70
  ASSERT r.out_score = 70,
    format('4.1 عافية اليوم = %s (متوقَّع 70)', r.out_score);
  v_pass := v_pass + 1;
  ASSERT r.out_samples = 3,
    format('4.2 عيّنات اليوم = %s (متوقَّع 3 — ضجيج المستأجر ب محجوب)',
           r.out_samples);
  v_pass := v_pass + 1;

  SELECT * INTO r FROM public.hr_dashboard_wellness_trend(7)
   WHERE out_date = current_date - 1;
  ASSERT r.out_score = 60,
    format('4.3 عافية الأمس = %s (متوقَّع 60)', r.out_score);
  v_pass := v_pass + 1;

  -- ★★★ يوم بلا بيانات ⇒ NULL لا صفر
  SELECT * INTO r FROM public.hr_dashboard_wellness_trend(7)
   WHERE out_date = current_date - 3;
  ASSERT r.out_score IS NULL,
    format('4.4 ★★★ يوم بلا بيانات = %s (متوقَّع NULL). صفر يعني '
           '«أسوأ حالة نفسية» في الرسم بينما المعنى «لا بيانات»',
           r.out_score);
  v_pass := v_pass + 1;
  ASSERT r.out_samples = 0,
    format('4.5 عيّنات يوم فارغ = %s (متوقَّع 0)', r.out_samples);
  v_pass := v_pass + 1;

  -- ★★ والإدخال القديم (60 يوماً) خارج النافذة تماماً
  SELECT count(*) INTO v_n FROM public.hr_dashboard_wellness_trend(7)
   WHERE out_score = 10;
  ASSERT v_n = 0, '4.6 ★★ الإدخال القديم (10) ظهر في نافذة 7 أيام';
  v_pass := v_pass + 1;

  -- ★ والنافذة تتّسع فتشمله
  SELECT count(*) INTO v_n FROM public.hr_dashboard_wellness_trend(90)
   WHERE out_score = 10;
  ASSERT v_n = 1,
    format('4.7 ★★ الإدخال القديم لا يظهر حتى في نافذة 90 يوماً (%s)', v_n);
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM public.hr_dashboard_wellness_trend(90);
  ASSERT v_n = 90, format('4.8 days=90 أعاد %s', v_n);
  v_pass := v_pass + 1;
  SELECT count(*) INTO v_n FROM public.hr_dashboard_wellness_trend(999);
  ASSERT v_n = 90, format('4.9 days مفرط أعاد %s (متوقَّع 90)', v_n);
  v_pass := v_pass + 1;

  -- ═══════════════════════════════════════════════════════════════════════
  -- ⑤ العزل: مستأجر آخر يرى بياناته وحدها
  -- ═══════════════════════════════════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_ub::text, TRUE);
  SELECT * INTO r FROM public.hr_dashboard_summary();
  ASSERT r.out_total_employees = 1,
    format('5.1 ★★★ موظفو المستأجر ب = %s (متوقَّع 1)', r.out_total_employees);
  v_pass := v_pass + 1;
  ASSERT r.out_incidents_total = 1,
    format('5.2 ★★★ بلاغات المستأجر ب = %s (متوقَّع 1)', r.out_incidents_total);
  v_pass := v_pass + 1;
  ASSERT r.out_wellness_score = 5,
    format('5.3 ★★★ عافية المستأجر ب = %s (متوقَّع 5 — قيمة مميِّزة '
           'لا تشبه شيئاً في المستأجر أ)', r.out_wellness_score);
  v_pass := v_pass + 1;

  -- ★ بلا سياق ⇒ صفّ أصفار لا «لا شيء»
  PERFORM set_config('request.jwt.claim.sub', gen_random_uuid()::text, TRUE);
  SELECT count(*) INTO v_n FROM public.hr_dashboard_summary();
  ASSERT v_n = 1,
    format('5.4 ★★ بلا مستأجر: summary أعادت %s صفّاً (متوقَّع 1 أصفار '
           '— غيابه يجعل البطاقات undefined فتظهر NaN)', v_n);
  v_pass := v_pass + 1;
  SELECT * INTO r FROM public.hr_dashboard_summary();
  ASSERT r.out_total_employees = 0 AND r.out_incidents_total = 0,
    '5.5 بلا مستأجر: القيم ليست أصفاراً';
  v_pass := v_pass + 1;

  -- ═══════════════════════════════════════════════════════════════════════
  -- ⑥ التوقيعات والصلاحيات
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN
     ('hr_dashboard_summary','hr_dashboard_departments',
      'hr_dashboard_monthly_trend','hr_dashboard_wellness_trend');
  ASSERT v_n = 4, format('6.1 دوال 0345 = %s (متوقَّع 4)', v_n);
  v_pass := v_pass + 1;

  -- ★★ كلها INVOKER — RLS هو الحارس
  SELECT count(*) INTO v_n FROM pg_proc
   WHERE proname LIKE 'hr_dashboard_%' AND prosecdef IS TRUE;
  ASSERT v_n = 0,
    format('6.2 ★★★ %s دالة لوحة تعمل DEFINER — تتجاوز RLS', v_n);
  v_pass := v_pass + 1;

  -- ★ search_path مثبَّت
  SELECT count(*) INTO v_n FROM pg_proc
   WHERE proname LIKE 'hr_dashboard_%'
     AND array_to_string(proconfig,',') LIKE '%search_path%';
  ASSERT v_n = 4, format('6.3 ★★ دوال بـsearch_path = %s (متوقَّع 4)', v_n);
  v_pass := v_pass + 1;

  -- ★ anon محروم
  SELECT count(*) INTO v_n FROM information_schema.routine_privileges
   WHERE routine_schema='public' AND grantee='anon'
     AND routine_name LIKE 'hr_dashboard_%';
  ASSERT v_n = 0, format('6.4 ★★ anon يملك EXECUTE على %s دالة', v_n);
  v_pass := v_pass + 1;

  SELECT count(DISTINCT routine_name) INTO v_n FROM information_schema.routine_privileges
   WHERE routine_schema='public' AND grantee='authenticated'
     AND routine_name LIKE 'hr_dashboard_%';
  ASSERT v_n = 4, format('6.5 authenticated يملك EXECUTE على %s (متوقَّع 4)', v_n);
  v_pass := v_pass + 1;

  -- ★ الفهارس
  SELECT count(*) INTO v_n FROM pg_indexes
   WHERE schemaname='public' AND indexname IN
     ('idx_incidents_tenant_created','idx_incidents_tenant_status_sev',
      'idx_wellness_emp_date','idx_employees_tenant_dept');
  ASSERT v_n = 4, format('6.6 فهارس 0345 = %s (متوقَّع 4)', v_n);
  v_pass := v_pass + 1;

  RAISE NOTICE '✅ verify-hr-dashboard-0345: % تأكيداً ناجحاً', v_pass;
  RAISE EXCEPTION 'ROLLBACK_OK';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'ROLLBACK_OK' THEN RAISE; END IF;
END $$;
