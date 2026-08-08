-- ============================================================================
-- verify-kiosk-punch-0347.sql
--
-- بوابة الحارس: البصمة الذرّية · محفّز الملخّص · اللوحة · الإحصائيات.
--
-- منهجية: يعمل بدور postgres (BYPASSRLS) فيقيس **منطق الدوال**.
--   العزل عبر RLS الحقيقي في verify-kiosk-punch-0347-rls.sh.
--
-- ★★★ درس مُتكرِّر (0346): «شرطٌ لا تُوجَد بياناتٌ تخالفه = شرط غير
--   مُختبَر». لذلك التجهيز يحوي عمداً: بصمة خروج صريحة · لمسة مرتدّة ·
--   موظفاً في إجازة معتمَدة · موظفاً غير نشط · وموظف مستأجر آخر بنفس
--   المعرّف.
--
-- ─── حقائق بنيوية مُحقَّقة ─────────────────────────────────────────────────
--   attendance_logs: punch_type CHECK ∈ in·out·check-in·check-out
--     DEFAULT 'check-in' · UNIQUE (tenant_id, employee_id, punch_time)
--   attendance_summary: UNIQUE (tenant,employee,shift_date)
--     status CHECK بالمفردات الثماني (0344)
--   نوافذ الورديات: صباحي 06:00 · مسائي 14:00 · ليلي 22:00 · سماح 15د
--   employees: is_active · full_name_ar فارغ (درس 0346)
-- ============================================================================
\set ON_ERROR_STOP on

DO $$
DECLARE
  v_t    UUID := gen_random_uuid();
  v_tb   UUID := gen_random_uuid();
  v_d    UUID := gen_random_uuid();
  v_dbb  UUID := gen_random_uuid();
  v_u1 UUID := gen_random_uuid();  -- يبصم دخولاً ثم خروجاً
  v_u2 UUID := gen_random_uuid();  -- في إجازة معتمَدة
  v_u3 UUID := gen_random_uuid();  -- غائب
  v_u4 UUID := gen_random_uuid();  -- غير نشط
  v_u5 UUID := gen_random_uuid();  -- منصرف فعلاً (آخر بصمة خروج)
  v_u6 UUID := gen_random_uuid();  -- عدد زوجيّ وآخر بصمة **دخول**
  v_uhr UUID := gen_random_uuid();
  v_ub UUID := gen_random_uuid();
  v_e1 UUID; v_e2 UUID; v_e3 UUID; v_e4 UUID; v_e5 UUID; v_e6 UUID;
  v_ehr UUID; v_eb UUID;
  v_day  DATE := (NOW() AT TIME ZONE 'Asia/Baghdad')::DATE;
  v_n    INT;
  v_txt  TEXT;
  v_err  TEXT;
  v_ts   TIMESTAMPTZ;
  v_pass INT := 0;
  r      RECORD;
BEGIN
  -- ═══ التجهيز ══════════════════════════════════════════════════════════
  INSERT INTO public.tenants(id,name,name_ar,slug) VALUES
    (v_t ,'K47','كشك أ','k47a-'||substr(v_t::text ,1,8)),
    (v_tb,'K47B','كشك ب','k47b-'||substr(v_tb::text,1,8));
  INSERT INTO auth.users(id,email) VALUES
    (v_u1 ,'1-'||substr(v_u1::text ,1,8)||'@k47.io'),
    (v_u2 ,'2-'||substr(v_u2::text ,1,8)||'@k47.io'),
    (v_u3 ,'3-'||substr(v_u3::text ,1,8)||'@k47.io'),
    (v_u4 ,'4-'||substr(v_u4::text ,1,8)||'@k47.io'),
    (v_u5 ,'5-'||substr(v_u5::text ,1,8)||'@k47.io'),
    (v_u6 ,'6-'||substr(v_u6::text ,1,8)||'@k47.io'),
    (v_uhr,'h-'||substr(v_uhr::text,1,8)||'@k47.io'),
    (v_ub ,'z-'||substr(v_ub::text ,1,8)||'@k47.io');
  INSERT INTO public.departments(id,tenant_id,name_ar) VALUES
    (v_d,v_t,'الإنتاج'), (v_dbb,v_tb,'قسم ب');
  INSERT INTO public.profiles(id,tenant_id,full_name,role) VALUES
    (v_u1 ,v_t ,'أحمد الباصم','employee'),
    (v_u2 ,v_t ,'سارة المُجازة','employee'),
    (v_u3 ,v_t ,'خالد الغائب','employee'),
    (v_u4 ,v_t ,'ياسر المؤرشف','employee'),
    (v_u5 ,v_t ,'زينب المنصرفة','employee'),
    (v_u6 ,v_t ,'وليد المفقودة بصمته','employee'),
    (v_uhr,v_t ,'هالة الحارسة','hr'),
    (v_ub ,v_tb,'موظف ب','employee');

  SELECT id INTO v_e1  FROM public.employees WHERE user_id=v_u1;
  SELECT id INTO v_e2  FROM public.employees WHERE user_id=v_u2;
  SELECT id INTO v_e3  FROM public.employees WHERE user_id=v_u3;
  SELECT id INTO v_e4  FROM public.employees WHERE user_id=v_u4;
  SELECT id INTO v_e5  FROM public.employees WHERE user_id=v_u5;
  SELECT id INTO v_e6  FROM public.employees WHERE user_id=v_u6;
  SELECT id INTO v_ehr FROM public.employees WHERE user_id=v_uhr;
  SELECT id INTO v_eb  FROM public.employees WHERE user_id=v_ub;
  UPDATE public.employees SET department_id=v_d, employee_code='K-001' WHERE id=v_e1;
  UPDATE public.employees SET department_id=v_d, employee_code='K-002' WHERE id=v_e2;
  UPDATE public.employees SET department_id=v_d, employee_code='K-003' WHERE id=v_e3;
  UPDATE public.employees SET department_id=v_d, employee_code='K-004', is_active=FALSE WHERE id=v_e4;
  UPDATE public.employees SET department_id=v_d, employee_code='K-005' WHERE id=v_e5;
  UPDATE public.employees SET department_id=v_d, employee_code='K-006' WHERE id=v_e6;
  UPDATE public.employees SET department_id=v_d, employee_code='K-HR'  WHERE id=v_ehr;
  UPDATE public.employees SET department_id=v_dbb WHERE id=v_eb;

  ASSERT v_e1 IS NOT NULL AND v_eb IS NOT NULL,
    '0.1 محفّز 0317 لم يُنشئ سجلّات الموظفين';
  v_pass := v_pass + 1;

  -- ★★★ حقيقة بنيوية: الافتراضي 'check-in' (أساس العطل ①)
  -- ★★ الطوابع بتوقيت **بغداد** صريحاً: `v_day + TIME '03:00'` ينتج
  --   TIMESTAMP بلا منطقة فيُفسَّر بمنطقة الجلسة (UTC على الخادم)،
  --   والفارق ثلاث ساعات يقلب الوردية ويضيف 180 دقيقة تأخير وهميّ.
  INSERT INTO public.attendance_logs(tenant_id,employee_id,punch_time,shift_date)
    VALUES (v_t,v_ehr, (v_day + TIME '03:00') AT TIME ZONE 'Asia/Baghdad', v_day);
  SELECT punch_type, shift_type INTO r FROM public.attendance_logs
   WHERE tenant_id=v_t AND employee_id=v_ehr;
  ASSERT r.punch_type = 'check-in',
    format('0.2 ★★★ الافتراضي = «%s» (متوقَّع check-in)', r.punch_type);
  v_pass := v_pass + 1;
  -- ★ والمحفّز ملأ shift_type؟ لا — المحفّز يبني الملخّص لا يُعدّل السجلّ
  ASSERT r.shift_type IS NULL,
    '0.3 shift_type مملوء في إدراج مباشر — راجع الفرضية';
  v_pass := v_pass + 1;

  -- ★★★ لكن المحفّز **بنى الملخّص** (العطل ② الأصلي)
  SELECT count(*) INTO v_n FROM public.attendance_summary
   WHERE tenant_id=v_t AND employee_id=v_ehr AND shift_date=v_day;
  ASSERT v_n = 1,
    format('0.4 ★★★ صفوف الملخّص بعد إدراج مباشر = %s (متوقَّع 1). '
           'صفر يعني أن المحفّز لا يعمل — وهو العطل الأصلي', v_n);
  v_pass := v_pass + 1;

  DELETE FROM public.attendance_logs WHERE tenant_id=v_t AND employee_id=v_ehr;
  DELETE FROM public.attendance_summary WHERE tenant_id=v_t AND employee_id=v_ehr;

  PERFORM set_config('request.jwt.claim.sub', v_uhr::text, TRUE);

  -- ═══════════════════════════════════════════════════════════════════════
  -- ①.0 الحارس: الدوال تعمل بمستأجر حقيقي (درس 0345)
  -- ═══════════════════════════════════════════════════════════════════════
  ASSERT public.current_user_tenant_id() = v_t,
    '1.0a ★★★ السياق لم يُضبَط — كل ما بعده يقيس الفرع الفارغ';
  v_pass := v_pass + 1;
  SELECT count(*) INTO v_n FROM public.kiosk_board(NULL,300);
  ASSERT v_n = 6,
    format('1.0b ★★★ صفوف اللوحة = %s (متوقَّع 6 — ياسر غير نشط '
           'وموظف ب محجوب)', v_n);
  v_pass := v_pass + 1;
  SELECT count(*) INTO v_n FROM public.kiosk_stats();
  ASSERT v_n = 1, format('1.0c kiosk_stats أعادت %s صفّاً (متوقَّع 1)', v_n);
  v_pass := v_pass + 1;

  -- ═══════════════════════════════════════════════════════════════════════
  -- ① البصمة الأولى: دخول · بنوعه ووردية
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT * INTO r FROM public.kiosk_punch(v_e1,'finger','KIOSK-A');

  ASSERT r.out_punch_type = 'check-in',
    format('1.1 ★★★ أول بصمة = «%s» (متوقَّع check-in)', r.out_punch_type);
  v_pass := v_pass + 1;
  ASSERT r.out_debounced = FALSE,
    '1.2 أول بصمة عُوملت كمرتدّة';
  v_pass := v_pass + 1;
  ASSERT r.out_punch_count = 1,
    format('1.3 عدد البصمات = %s (متوقَّع 1)', r.out_punch_count);
  v_pass := v_pass + 1;

  -- ★★★ shift_type مكتوب فعلاً — كان NULL أبداً (العطل ①)
  SELECT punch_type, shift_type, source, verification_type, device_id
    INTO r FROM public.attendance_logs
   WHERE tenant_id=v_t AND employee_id=v_e1;
  ASSERT r.shift_type IS NOT NULL,
    '1.4 ★★★ shift_type = NULL — الصفحة تعرضه (سطر 584) فيظهر «—»';
  v_pass := v_pass + 1;
  ASSERT r.shift_type IN ('صباحي','مسائي','ليلي'),
    format('1.5 shift_type = «%s» — خارج الورديات الثلاث', r.shift_type);
  v_pass := v_pass + 1;
  ASSERT r.device_id = 'KIOSK-A',
    format('1.6 device_id = «%s» (متوقَّع KIOSK-A)', COALESCE(r.device_id,'NULL'));
  v_pass := v_pass + 1;
  ASSERT r.verification_type = 'finger',
    format('1.7 verification_type = «%s»', r.verification_type);
  v_pass := v_pass + 1;

  -- ═══════════════════════════════════════════════════════════════════════
  -- ② ★★★ المحفّز بنى الملخّص — العطل الأصلي
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT count(*) INTO v_n FROM public.attendance_summary
   WHERE tenant_id=v_t AND employee_id=v_e1 AND shift_date=v_day;
  ASSERT v_n = 1,
    format('2.1 ★★★ صفوف الملخّص = %s (متوقَّع 1). صفر يعني أن الكشك '
           'يعرض «حاضر: 0» مهما بصم الجميع — العطل الأصلي', v_n);
  v_pass := v_pass + 1;

  SELECT status, check_in, check_out, shift_type, total_hours
    INTO r FROM public.attendance_summary
   WHERE tenant_id=v_t AND employee_id=v_e1 AND shift_date=v_day;
  ASSERT r.status IN ('حضور_بوقت','متأخر'),
    format('2.2 ★★ حالة الملخّص = «%s» (متوقَّع حضور_بوقت أو متأخر)', r.status);
  v_pass := v_pass + 1;
  ASSERT r.check_in IS NOT NULL,
    '2.3 check_in في الملخّص فارغ';
  v_pass := v_pass + 1;
  -- ★★★ بصمة واحدة ⇒ لا خروج (لا نختلق خروجاً — درس 0346)
  ASSERT r.check_out IS NULL,
    format('2.4 ★★★ check_out = %s (متوقَّع NULL — بصمة واحدة)', r.check_out);
  v_pass := v_pass + 1;
  ASSERT r.total_hours = 0,
    format('2.5 ★★ الساعات = %s (متوقَّع 0 — لم ينصرف بعد)', r.total_hours);
  v_pass := v_pass + 1;

  -- ═══════════════════════════════════════════════════════════════════════
  -- ③ ★★★ نافذة الارتداد — لمسة مكرّرة ليست بصمة
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT * INTO r FROM public.kiosk_punch(v_e1,'finger','KIOSK-A');
  ASSERT r.out_debounced IS TRUE,
    '3.1 ★★★ لمسة خلال 60 ثانية لم تُعامَل كمرتدّة — إصبعٌ يلمس القارئ '
    'مرّتين يقلب التناوب';
  v_pass := v_pass + 1;
  ASSERT r.out_punch_type = 'check-in',
    format('3.2 المرتدّة أعادت «%s» (متوقَّع نوع البصمة القائمة check-in)',
           r.out_punch_type);
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM public.attendance_logs
   WHERE tenant_id=v_t AND employee_id=v_e1;
  ASSERT v_n = 1,
    format('3.3 ★★★ البصمات بعد اللمسة المكرّرة = %s (متوقَّع 1 — '
           'لم يُدرَج صفّ ثانٍ)', v_n);
  v_pass := v_pass + 1;

  -- ═══════════════════════════════════════════════════════════════════════
  -- ④ ★★★ البصمة الثانية: خروج — من النوع لا من العدّ
  -- ═══════════════════════════════════════════════════════════════════════
  -- ★ نُزيح البصمة الأولى للماضي كي نتجاوز نافذة الارتداد
  UPDATE public.attendance_logs
     SET punch_time = NOW() - INTERVAL '8 hours'
   WHERE tenant_id=v_t AND employee_id=v_e1;
  -- ★★ والمحفّز يعمل على UPDATE أيضاً — نتحقّق لاحقاً

  SELECT * INTO r FROM public.kiosk_punch(v_e1,'face','KIOSK-A');
  ASSERT r.out_punch_type = 'check-out',
    format('4.1 ★★★ البصمة الثانية = «%s» (متوقَّع check-out). '
           '«check-in» يعني أن النوع لا يُقرأ من آخر بصمة', r.out_punch_type);
  v_pass := v_pass + 1;
  ASSERT r.out_debounced = FALSE,
    '4.2 البصمة الثانية عُوملت كمرتدّة رغم فارق 8 ساعات';
  v_pass := v_pass + 1;
  ASSERT r.out_punch_count = 2,
    format('4.3 عدد البصمات = %s (متوقَّع 2)', r.out_punch_count);
  v_pass := v_pass + 1;

  -- ★★★ بصمة خروج **حقيقية** في القاعدة — كانت 0 أبداً
  SELECT count(*) INTO v_n FROM public.attendance_logs
   WHERE tenant_id=v_t AND punch_type IN ('out','check-out');
  ASSERT v_n = 1,
    format('4.4 ★★★ بصمات الخروج في القاعدة = %s (متوقَّع 1). صفر يعني '
           'العطل الأصلي: كل بصمة تُسجَّل «دخولاً»', v_n);
  v_pass := v_pass + 1;

  -- ★★ والملخّص تحدّث: خروج وساعات
  SELECT check_out, total_hours INTO r FROM public.attendance_summary
   WHERE tenant_id=v_t AND employee_id=v_e1 AND shift_date=v_day;
  ASSERT r.check_out IS NOT NULL,
    '4.5 ★★★ الملخّص لم يتحدّث بعد بصمة الخروج';
  v_pass := v_pass + 1;
  ASSERT r.total_hours > 7 AND r.total_hours < 9,
    format('4.6 ★★ ساعات العمل = %s (متوقَّع ≈8)', r.total_hours);
  v_pass := v_pass + 1;

  -- ★★★ والبصمة الثالثة تعود «دخولاً» (تناوب صحيح من النوع)
  UPDATE public.attendance_logs SET punch_time = punch_time - INTERVAL '5 minutes'
   WHERE tenant_id=v_t AND employee_id=v_e1 AND punch_type='check-out';
  SELECT * INTO r FROM public.kiosk_punch(v_e1,'finger',NULL);
  ASSERT r.out_punch_type = 'check-in',
    format('4.7 ★★ البصمة الثالثة = «%s» (متوقَّع check-in)', r.out_punch_type);
  v_pass := v_pass + 1;

  -- ═══════════════════════════════════════════════════════════════════════
  -- ④-ب الصفوف المميِّزة — كلٌّ يجعل شرطاً قابلاً للملاحظة
  -- ═══════════════════════════════════════════════════════════════════════

  -- ★★★ زينب: دخول ثم خروج ⇒ «منصرف» فعلاً.
  --   بلا موظفٍ منصرف لا يمكن التمييز بين «حاضر = مداوم» و«حاضر يشمل
  --   المنصرف» — عكسُ ⑤.5 كان يمرّ لهذا السبب.
  INSERT INTO public.attendance_logs
    (tenant_id,employee_id,punch_time,punch_type,shift_type,shift_date)
  VALUES
    (v_t,v_e5,(v_day + TIME '08:00') AT TIME ZONE 'Asia/Baghdad',
       'check-in','صباحي',v_day),
    (v_t,v_e5,(v_day + TIME '16:00') AT TIME ZONE 'Asia/Baghdad',
       'check-out','صباحي',v_day);

  -- ★★★★ وليد: **بصمتان** (عدد زوجيّ) وآخرهما **دخول**.
  --   هذا هو جوهر العطل الأصلي: منطق `length % 2` يستنتج «دخول»
  --   لأن العدد زوجيّ، بينما آخر بصمة فعلية **دخول** فالتالي خروج.
  --   يحدث كلّما ضاعت بصمة (شبكة · تكرار مُبتلَع في catch).
  --   بلا هذا الصفّ يتطابق المنطقان صدفةً ويمرّ العكس ④.1.
  INSERT INTO public.attendance_logs
    (tenant_id,employee_id,punch_time,punch_type,shift_type,shift_date)
  VALUES
    (v_t,v_e6,(v_day + TIME '09:00') AT TIME ZONE 'Asia/Baghdad',
       'check-out','صباحي',v_day),
    (v_t,v_e6,(v_day + TIME '10:00') AT TIME ZONE 'Asia/Baghdad',
       'check-in','صباحي',v_day);

  -- ★★★ ضجيج: بصمة بنفس employee_id في **مستأجر آخر**.
  --   employee_id فريد عالمياً ⇒ الانضمام يُقصيه ضمناً، فالدليل
  --   الوحيد على أن `l.tenant_id = v_tenant` يعمل هو هذا الصفّ.
  INSERT INTO public.attendance_logs
    (tenant_id,employee_id,punch_time,punch_type,shift_date)
  VALUES (v_tb,v_e5,(v_day + TIME '23:30') AT TIME ZONE 'Asia/Baghdad',
          'check-in',v_day);

  SELECT * INTO r FROM public.kiosk_board(NULL,300)
   WHERE out_employee_code = 'K-005';
  ASSERT r.out_status = 'منصرف',
    format('4.8 ★★★ زينب: الحالة = «%s» (متوقَّع «منصرف»)', r.out_status);
  v_pass := v_pass + 1;
  ASSERT r.out_next_action = 'check-in',
    format('4.9 زينب: الإجراء التالي = «%s» (متوقَّع check-in)',
           r.out_next_action);
  v_pass := v_pass + 1;
  -- ★★ ولا تتأثّر ببصمة المستأجر الآخر (23:30 ⇒ لو تسرّبت لصارت ليلي)
  ASSERT r.out_punch_count = 2,
    format('4.10 ★★★ زينب: بصمات = %s (متوقَّع 2). 3 يعني تسرّب بصمة '
           'المستأجر ب بنفس employee_id', r.out_punch_count);
  v_pass := v_pass + 1;
  ASSERT r.out_shift_type = 'صباحي',
    format('4.11 ★★ زينب: الوردية = «%s» (متوقَّع صباحي). «ليلي» يعني '
           'تسرّب بصمة 23:30 من المستأجر ب', r.out_shift_type);
  v_pass := v_pass + 1;

  -- ★★★★ وليد: العدد زوجيّ وآخر بصمة دخول
  SELECT * INTO r FROM public.kiosk_board(NULL,300)
   WHERE out_employee_code = 'K-006';
  ASSERT r.out_punch_count = 2,
    format('4.12 تجهيز باطل: وليد بصماته = %s (متوقَّع 2 — عدد زوجيّ)',
           r.out_punch_count);
  v_pass := v_pass + 1;
  ASSERT r.out_next_action = 'check-out',
    format('4.13 ★★★★ وليد: الإجراء التالي = «%s» (متوقَّع check-out — '
           'آخر بصمة **دخول**). «check-in» يعني الاعتماد على عدّ '
           'المصفوفة (length %% 2 = 0) — وهو العطل الأصلي الذي ينقلب '
           'كلّما ضاعت بصمة', r.out_next_action);
  v_pass := v_pass + 1;
  ASSERT r.out_status = 'مداوم',
    format('4.14 ★★★ وليد: الحالة = «%s» (متوقَّع «مداوم» — آخر بصمة '
           'دخول). «منصرف» يعني الاعتماد على وجود بصمة خروج',
           r.out_status);
  v_pass := v_pass + 1;

  -- ★★★ والبصمة التالية لوليد **خروج** فعلاً
  SELECT * INTO r FROM public.kiosk_punch(v_e6,'finger',NULL);
  ASSERT r.out_punch_type = 'check-out',
    format('4.15 ★★★★ بصمة وليد التالية = «%s» (متوقَّع check-out)',
           r.out_punch_type);
  v_pass := v_pass + 1;

  -- ★★★ المحفّز يعمل على UPDATE منفرداً (لا INSERT بعده)
  UPDATE public.attendance_logs
     SET punch_time = (v_day + TIME '05:00') AT TIME ZONE 'Asia/Baghdad'
   WHERE tenant_id=v_t AND employee_id=v_e5 AND punch_type='check-in';
  SELECT shift_type INTO v_txt FROM public.attendance_summary
   WHERE tenant_id=v_t AND employee_id=v_e5 AND shift_date=v_day;
  ASSERT v_txt = 'ليلي',
    format('4.16 ★★★ بعد UPDATE منفرد: وردية زينب = «%s» (متوقَّع «ليلي» '
           '— 05:00 ضمن النافذة الليلية). «صباحي» يعني أن المحفّز لا '
           'يعمل على UPDATE', COALESCE(v_txt,'NULL'));
  v_pass := v_pass + 1;
  -- استرجاع
  UPDATE public.attendance_logs
     SET punch_time = (v_day + TIME '08:00') AT TIME ZONE 'Asia/Baghdad'
   WHERE tenant_id=v_t AND employee_id=v_e5 AND punch_type='check-in';

  -- ★★★ موظف ببصمة **واحدة**: ساعاته صفر لا «حتى الآن».
  --   درس التغطية: كل موظفيّ كان لهم خروج، فالفرع `v_out IS NULL`
  --   لم يُنفَّذ قطّ وعكسُه (احتساب الساعات حتى NOW) مرّ صامتاً.
  --   خالد الآن ببصمة واحدة في 06:10 — لو حُسبت حتى الآن لظهرت ساعاتٍ
  --   طائلة بدل صفر.
  DELETE FROM public.attendance_logs WHERE tenant_id=v_t AND employee_id=v_e3;
  DELETE FROM public.attendance_summary
   WHERE tenant_id=v_t AND employee_id=v_e3 AND shift_date=v_day;
  INSERT INTO public.attendance_logs
    (tenant_id,employee_id,punch_time,punch_type,shift_date)
    VALUES (v_t,v_e3,(v_day + TIME '06:10') AT TIME ZONE 'Asia/Baghdad',
            'check-in',v_day);

  SELECT total_hours, check_out, status INTO r FROM public.attendance_summary
   WHERE tenant_id=v_t AND employee_id=v_e3 AND shift_date=v_day;
  ASSERT r.check_out IS NULL,
    format('4.17 ★★★ خالد ببصمة واحدة: check_out = %s (متوقَّع NULL)',
           r.check_out);
  v_pass := v_pass + 1;
  ASSERT r.total_hours = 0,
    format('4.18 ★★★★ خالد: الساعات = %s (متوقَّع 0). أيّ رقم أكبر يعني '
           'احتساب المدة حتى NOW() لمن لم ينصرف — فتظهر ساعاتٌ لم '
           'تُعمَل، وتتضخّم كلّما تأخّر الاستعلام', r.total_hours);
  v_pass := v_pass + 1;

  -- ★ ونُعيده غائباً كما تفترض الإحصائيات لاحقاً
  DELETE FROM public.attendance_logs WHERE tenant_id=v_t AND employee_id=v_e3;
  DELETE FROM public.attendance_summary
   WHERE tenant_id=v_t AND employee_id=v_e3 AND shift_date=v_day;

  -- ═══════════════════════════════════════════════════════════════════════
  -- ⑤ اللوحة: الإجراء التالي من النوع
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT * INTO r FROM public.kiosk_board(NULL,300)
   WHERE out_employee_code = 'K-001';
  ASSERT r.out_next_action = 'check-out',
    format('5.1 ★★★ الإجراء التالي = «%s» (متوقَّع check-out — آخر بصمة '
           'دخول). «check-in» يعني الاعتماد على عدّ المصفوفة',
           r.out_next_action);
  v_pass := v_pass + 1;
  ASSERT r.out_punch_count = 3,
    format('5.2 عدد البصمات في اللوحة = %s (متوقَّع 3)', r.out_punch_count);
  v_pass := v_pass + 1;
  ASSERT r.out_full_name = 'أحمد الباصم',
    format('5.3 ★★ الاسم = «%s» (متوقَّع «أحمد الباصم»). «بدون اسم» يعني '
           'الاعتماد على full_name_ar وحده — وهو NULL (درس 0346)',
           r.out_full_name);
  v_pass := v_pass + 1;
  ASSERT r.out_department = 'الإنتاج',
    format('5.4 القسم = «%s»', r.out_department);
  v_pass := v_pass + 1;
  ASSERT r.out_shift_type IN ('صباحي','مسائي','ليلي'),
    format('5.5 ★★ الوردية في اللوحة = «%s» (كانت «—» أبداً)', r.out_shift_type);
  v_pass := v_pass + 1;

  -- ★ من لم يبصم: الإجراء التالي دخول
  SELECT * INTO r FROM public.kiosk_board(NULL,300)
   WHERE out_employee_code = 'K-003';
  ASSERT r.out_next_action = 'check-in' AND r.out_status = 'غائب',
    format('5.6 خالد: action=«%s» status=«%s» (متوقَّع check-in/غائب)',
           r.out_next_action, r.out_status);
  v_pass := v_pass + 1;
  ASSERT r.out_punch_count = 0,
    format('5.7 خالد: بصمات = %s (متوقَّع 0)', r.out_punch_count);
  v_pass := v_pass + 1;

  -- ★★ غير النشط لا يظهر · ولا موظف المستأجر الآخر
  SELECT count(*) INTO v_n FROM public.kiosk_board(NULL,300)
   WHERE out_employee_code = 'K-004';
  ASSERT v_n = 0, '5.8 ★★★ ياسر غير النشط ظهر في اللوحة';
  v_pass := v_pass + 1;
  SELECT count(*) INTO v_n FROM public.kiosk_board(NULL,300)
   WHERE out_full_name = 'موظف ب';
  ASSERT v_n = 0, '5.9 ★★★ موظف المستأجر ب ظهر في اللوحة';
  v_pass := v_pass + 1;

  -- ★ البحث
  SELECT count(*) INTO v_n FROM public.kiosk_board('أحمد',300);
  ASSERT v_n = 1, format('5.10 البحث «أحمد» = %s (متوقَّع 1)', v_n);
  v_pass := v_pass + 1;
  SELECT count(*) INTO v_n FROM public.kiosk_board('K-003',300);
  ASSERT v_n = 1, format('5.11 ★★ البحث بالرمز = %s (متوقَّع 1)', v_n);
  v_pass := v_pass + 1;
  SELECT count(*) INTO v_n FROM public.kiosk_board('   ',300);
  ASSERT v_n = 6, format('5.12 ★★ بحث بمسافات = %s (متوقَّع 6)', v_n);
  v_pass := v_pass + 1;
  SELECT count(*) INTO v_n FROM public.kiosk_board(NULL,-5);
  ASSERT v_n = 1, format('5.13 limit سالب = %s (متوقَّع 1 — قُصَّ)', v_n);
  v_pass := v_pass + 1;

  -- ═══════════════════════════════════════════════════════════════════════
  -- ⑥ الإحصائيات — من البصمات لا من ملخّص فارغ
  -- ═══════════════════════════════════════════════════════════════════════
  -- ★ سارة في إجازة معتمَدة (يكتبها محرّك الاعتماد في attendance_summary)
  INSERT INTO public.attendance_summary
    (tenant_id,employee_id,shift_date,status,total_hours)
    VALUES (v_t,v_e2,v_day,'مجاز',0);

  SELECT * INTO r FROM public.kiosk_stats();

  ASSERT r.out_total = 6,
    format('6.1 الإجمالي = %s (متوقَّع 6)', r.out_total);
  v_pass := v_pass + 1;

  -- ★★★ أحمد مداوم (آخر بصمة دخول) — كان present=0 أبداً
  -- ★★★ «حاضر» = مداوم وحده. أحمد مداوم · زينب ووليد منصرفان
  --   (وليد بصم خروجاً في 4.15).
  --   1 صحيح · 3 يعني ضمّ المنصرف إلى الحاضر (وهو ما يُخفي من غادر).
  ASSERT r.out_present = 1,
    format('6.2 ★★★ حاضر = %s (متوقَّع 1: أحمد وحده). صفر يعني قراءة '
           'attendance_summary الفارغ — العطل الأصلي · 3 يعني ضمّ '
           'المنصرفَين إلى الحاضرين', r.out_present);
  v_pass := v_pass + 1;

  ASSERT r.out_left = 2,
    format('6.2b ★★★ منصرف = %s (متوقَّع 2: زينب ووليد). صفر يعني أن '
           'أحداً لم يُصنَّف منصرفاً — والتأكيد أعلاه لا يقيس شيئاً',
           r.out_left);
  v_pass := v_pass + 1;

  ASSERT r.out_on_leave = 1,
    format('6.3 ★★ في إجازة = %s (متوقَّع 1: سارة)', r.out_on_leave);
  v_pass := v_pass + 1;

  -- ★★★ الغائب لا يشمل المُجاز
  ASSERT r.out_absent = 2,
    format('6.4 ★★★ غائب = %s (متوقَّع 2: خالد وهالة — لا سارة المُجازة). '
           '3 يعني عدّ المُجاز غائباً', r.out_absent);
  v_pass := v_pass + 1;

  -- ★★★ إجازة **يوم آخر** يجب ألّا تُحتسب اليوم.
  --   بلا هذا الصفّ كان عكسُ ترشيح اليوم يمرّ.
  INSERT INTO public.attendance_summary
    (tenant_id,employee_id,shift_date,status,total_hours)
    VALUES (v_t,v_e3,v_day - 1,'مجاز',0);
  SELECT * INTO r FROM public.kiosk_stats();
  ASSERT r.out_on_leave = 1,
    format('6.4b ★★★ في إجازة = %s (متوقَّع 1 — إجازة خالد أمس لا '
           'تُحتسب اليوم). 2 يعني إهمال ترشيح shift_date',
           r.out_on_leave);
  v_pass := v_pass + 1;
  ASSERT r.out_absent = 2,
    format('6.4c ★★ غائب = %s (متوقَّع 2 — خالد ما زال غائباً اليوم)',
           r.out_absent);
  v_pass := v_pass + 1;

  ASSERT r.out_present + r.out_left + r.out_on_leave + r.out_absent = r.out_total,
    format('6.5 ★★ الأجزاء (%s) ≠ الكلّ (%s)',
           r.out_present + r.out_left + r.out_on_leave + r.out_absent,
           r.out_total);
  v_pass := v_pass + 1;

  -- ★★★ والمحفّز لا يمحو الإجازة: نبصم لسارة ونتحقّق
  SELECT * INTO r FROM public.kiosk_punch(v_e2,'finger',NULL);
  SELECT status INTO v_txt FROM public.attendance_summary
   WHERE tenant_id=v_t AND employee_id=v_e2 AND shift_date=v_day;
  ASSERT v_txt = 'مجاز',
    format('6.6 ★★★ حالة سارة بعد بصمة = «%s» (متوقَّع «مجاز» — بصمةٌ '
           'عارضة يجب ألّا تمحو قرار الاعتماد الإداريّ)', v_txt);
  v_pass := v_pass + 1;

  -- ═══════════════════════════════════════════════════════════════════════
  -- ⑦ الصلاحيات والحراسة
  -- ═══════════════════════════════════════════════════════════════════════
  -- ★★ موظف عادي لا يبصم لأحد
  PERFORM set_config('request.jwt.claim.sub', v_u3::text, TRUE);
  BEGIN
    PERFORM public.kiosk_punch(v_e1,'finger',NULL);
    RAISE EXCEPTION 'SENTINEL_71';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    ASSERT v_err <> 'SENTINEL_71',
      '7.1 ★★★ موظف عادي سجّل بصمة لزميله — تزوير حضور';
    ASSERT v_err LIKE '%غير مصرَّح%',
      format('7.1 رُفض بسبب غير متوقَّع: %s', v_err);
    v_pass := v_pass + 1;
  END;

  PERFORM set_config('request.jwt.claim.sub', v_uhr::text, TRUE);

  -- ★★ ولا يُبصَم لموظف مستأجر آخر
  BEGIN
    PERFORM public.kiosk_punch(v_eb,'finger',NULL);
    RAISE EXCEPTION 'SENTINEL_72';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    ASSERT v_err <> 'SENTINEL_72',
      '7.2 ★★★ حارس المستأجر أ بصم لموظف المستأجر ب';
    ASSERT v_err LIKE '%غير موجود أو غير نشط%',
      format('7.2 رُفض بسبب غير متوقَّع: %s', v_err);
    v_pass := v_pass + 1;
  END;

  -- ★★★ ولا لموظف غير نشط
  BEGIN
    PERFORM public.kiosk_punch(v_e4,'finger',NULL);
    RAISE EXCEPTION 'SENTINEL_73';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    ASSERT v_err <> 'SENTINEL_73',
      '7.3 ★★★ بصمة سُجّلت لموظف غير نشط (مفصول/مؤرشف)';
    ASSERT v_err LIKE '%غير موجود أو غير نشط%',
      format('7.3 رُفض بسبب غير متوقَّع: %s', v_err);
    v_pass := v_pass + 1;
  END;

  -- ═══════════════════════════════════════════════════════════════════════
  -- ⑧ تحديد الوردية
  -- ═══════════════════════════════════════════════════════════════════════
  ASSERT public.shift_for_punch('2026-03-16 07:00:00+03') = 'صباحي',
    format('8.1 07:00 ⇒ %s', public.shift_for_punch('2026-03-16 07:00:00+03'));
  v_pass := v_pass + 1;
  ASSERT public.shift_for_punch('2026-03-16 15:00:00+03') = 'مسائي',
    format('8.2 15:00 ⇒ %s', public.shift_for_punch('2026-03-16 15:00:00+03'));
  v_pass := v_pass + 1;
  -- ★★★ الليلي يعبر منتصف الليل — الحالتان الحدّيتان
  ASSERT public.shift_for_punch('2026-03-16 23:00:00+03') = 'ليلي',
    format('8.3 ★★ 23:00 ⇒ %s (متوقَّع ليلي)',
           public.shift_for_punch('2026-03-16 23:00:00+03'));
  v_pass := v_pass + 1;
  ASSERT public.shift_for_punch('2026-03-16 01:00:00+03') = 'ليلي',
    format('8.4 ★★★ 01:00 ⇒ %s (متوقَّع ليلي — النافذة تعبر منتصف الليل)',
           public.shift_for_punch('2026-03-16 01:00:00+03'));
  v_pass := v_pass + 1;
  ASSERT public.shift_for_punch('2026-03-16 06:00:00+03') = 'صباحي',
    format('8.5 ★★ 06:00 (حدّ) ⇒ %s',
           public.shift_for_punch('2026-03-16 06:00:00+03'));
  v_pass := v_pass + 1;
  ASSERT public.shift_for_punch('2026-03-16 22:00:00+03') = 'ليلي',
    format('8.6 ★★ 22:00 (حدّ) ⇒ %s',
           public.shift_for_punch('2026-03-16 22:00:00+03'));
  v_pass := v_pass + 1;

  -- ★★★ حارس المنطقة الزمنية: الخادم قد يكون على UTC والمنشأة في
  --   بغداد. لو اعتمدت الدالة منطقة الجلسة لعادت «ليلي» هنا.
  ASSERT current_setting('TimeZone') <> 'Asia/Baghdad',
    '8.6b ★★ الجلسة على توقيت بغداد — الحارس أدناه لا يقيس شيئاً';
  v_pass := v_pass + 1;
  ASSERT public.shift_for_punch('2026-03-16 07:00:00+03') = 'صباحي',
    format('8.6c ★★★ 07:00 بتوقيت بغداد ⇒ %s (متوقَّع صباحي). «ليلي» '
           'يعني قراءة الساعة بمنطقة الخادم (04:00 UTC)',
           public.shift_for_punch('2026-03-16 07:00:00+03'));
  v_pass := v_pass + 1;

  -- ★ IMMUTABLE — شرط الفهرسة
  SELECT p.provolatile INTO v_txt FROM pg_proc p WHERE p.proname='shift_for_punch';
  ASSERT v_txt = 'i', format('8.7 shift_for_punch ليست IMMUTABLE (%s)', v_txt);
  v_pass := v_pass + 1;

  -- ═══════════════════════════════════════════════════════════════════════
  -- ⑨ التأخير في الملخّص
  -- ═══════════════════════════════════════════════════════════════════════
  -- ★ بصمة صباحية متأخرة: 07:00 والوردية تبدأ 06:00 والسماح 15د
  --   ⇒ التأخير = 60 − 15 = 45 دقيقة · الحالة «متأخر»
  DELETE FROM public.attendance_logs WHERE tenant_id=v_t AND employee_id=v_e3;
  DELETE FROM public.attendance_summary WHERE tenant_id=v_t AND employee_id=v_e3;
  INSERT INTO public.attendance_logs(tenant_id,employee_id,punch_time,punch_type,shift_date)
    VALUES (v_t,v_e3, (v_day + TIME '07:00') AT TIME ZONE 'Asia/Baghdad',
            'check-in', v_day);
  SELECT status, late_minutes, shift_type INTO r FROM public.attendance_summary
   WHERE tenant_id=v_t AND employee_id=v_e3 AND shift_date=v_day;
  ASSERT r.shift_type = 'صباحي',
    format('9.1 وردية 07:00 = «%s» (متوقَّع صباحي)', r.shift_type);
  v_pass := v_pass + 1;
  ASSERT r.late_minutes = 45,
    format('9.2 ★★★ التأخير = %s دقيقة (متوقَّع 45 = 60 − 15 سماح). '
           '60 يعني إهمال فترة السماح', r.late_minutes);
  v_pass := v_pass + 1;
  ASSERT r.status = 'متأخر',
    format('9.3 ★★ الحالة = «%s» (متوقَّع «متأخر»)', r.status);
  v_pass := v_pass + 1;

  -- ★★ وبصمة في الوقت ⇒ «حضور_بوقت» بلا تأخير
  DELETE FROM public.attendance_logs WHERE tenant_id=v_t AND employee_id=v_e3;
  DELETE FROM public.attendance_summary WHERE tenant_id=v_t AND employee_id=v_e3;
  INSERT INTO public.attendance_logs(tenant_id,employee_id,punch_time,punch_type,shift_date)
    VALUES (v_t,v_e3, (v_day + TIME '06:10') AT TIME ZONE 'Asia/Baghdad',
            'check-in', v_day);
  SELECT status, late_minutes INTO r FROM public.attendance_summary
   WHERE tenant_id=v_t AND employee_id=v_e3 AND shift_date=v_day;
  ASSERT r.late_minutes = 0,
    format('9.4 ★★★ 06:10 ضمن السماح: التأخير = %s (متوقَّع 0)',
           r.late_minutes);
  v_pass := v_pass + 1;
  ASSERT r.status = 'حضور_بوقت',
    format('9.5 ★★ الحالة = «%s» (متوقَّع «حضور_بوقت»)', r.status);
  v_pass := v_pass + 1;

  -- ★★★ والمحفّز يعمل على الحذف أيضاً
  DELETE FROM public.attendance_logs WHERE tenant_id=v_t AND employee_id=v_e3;
  SELECT check_in INTO v_ts FROM public.attendance_summary
   WHERE tenant_id=v_t AND employee_id=v_e3 AND shift_date=v_day;
  -- ★ الملخّص يبقى (لا نحذفه) لكن refresh عاد مبكراً لغياب البصمات
  --   ⇒ القيم القديمة باقية. هذا مقصود: سجلّ اليوم لا يختفي بحذف بصمة.
  ASSERT v_ts IS NOT NULL,
    '9.6 ★★ الملخّص اختفى بحذف البصمة — سجلّ اليوم يجب أن يبقى';
  v_pass := v_pass + 1;

  -- ═══════════════════════════════════════════════════════════════════════
  -- ⑩ العزل والتوقيعات
  -- ═══════════════════════════════════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_ub::text, TRUE);
  SELECT count(*) INTO v_n FROM public.kiosk_board(NULL,300);
  ASSERT v_n = 1,
    format('10.1 ★★★ المستأجر ب يرى %s صفّاً (متوقَّع 1)', v_n);
  v_pass := v_pass + 1;
  SELECT * INTO r FROM public.kiosk_stats();
  ASSERT r.out_total = 1,
    format('10.2 ★★★ إحصائيات ب: الإجمالي = %s (متوقَّع 1)', r.out_total);
  v_pass := v_pass + 1;

  PERFORM set_config('request.jwt.claim.sub', gen_random_uuid()::text, TRUE);
  SELECT count(*) INTO v_n FROM public.kiosk_board(NULL,300);
  ASSERT v_n = 0, format('10.3 بلا مستأجر: %s صفّاً (متوقَّع 0)', v_n);
  v_pass := v_pass + 1;
  SELECT count(*) INTO v_n FROM public.kiosk_stats();
  ASSERT v_n = 1,
    format('10.4 ★★ بلا مستأجر: الإحصائيات أعادت %s (متوقَّع 1 صفّ أصفار)', v_n);
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN
     ('kiosk_punch','kiosk_board','kiosk_stats',
      'refresh_attendance_summary','shift_for_punch',
      'tg_refresh_attendance_summary');
  ASSERT v_n = 6, format('10.5 دوال 0347 = %s (متوقَّع 6)', v_n);
  v_pass := v_pass + 1;

  -- ★★ الكاتبات DEFINER (سياسة INSERT تشترط staff)
  SELECT count(*) INTO v_n FROM pg_proc
   WHERE proname IN ('kiosk_punch','refresh_attendance_summary',
                     'tg_refresh_attendance_summary')
     AND prosecdef IS TRUE;
  ASSERT v_n = 3, format('10.6 ★★ دوال DEFINER = %s (متوقَّع 3)', v_n);
  v_pass := v_pass + 1;

  -- ★★ والقارئتان INVOKER (RLS يحرسهما)
  SELECT count(*) INTO v_n FROM pg_proc
   WHERE proname IN ('kiosk_board','kiosk_stats') AND prosecdef IS FALSE;
  ASSERT v_n = 2, format('10.7 ★★ دوال INVOKER = %s (متوقَّع 2)', v_n);
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM information_schema.routine_privileges
   WHERE routine_schema='public' AND grantee='anon'
     AND routine_name IN ('kiosk_punch','kiosk_board','kiosk_stats',
                          'refresh_attendance_summary');
  ASSERT v_n = 0, format('10.8 ★★ anon يملك EXECUTE على %s دالة', v_n);
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM pg_proc
   WHERE proname IN ('kiosk_punch','kiosk_board','kiosk_stats',
                     'refresh_attendance_summary','tg_refresh_attendance_summary')
     AND array_to_string(proconfig,',') LIKE '%search_path%';
  ASSERT v_n = 5, format('10.9 ★★ دوال بـsearch_path = %s (متوقَّع 5)', v_n);
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM pg_trigger
   WHERE tgrelid='public.attendance_logs'::regclass
     AND tgname='trg_refresh_attendance_summary';
  ASSERT v_n = 1, '10.10 ★★★ محفّز الملخّص غير مُسجَّل';
  v_pass := v_pass + 1;

  RAISE NOTICE '✅ verify-kiosk-punch-0347: % تأكيداً ناجحاً', v_pass;
  RAISE EXCEPTION 'ROLLBACK_OK';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'ROLLBACK_OK' THEN RAISE; END IF;
END $$;
