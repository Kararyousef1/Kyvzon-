-- ============================================================================
-- verify-tech-metrics-0327.sql
--
-- بوابة التقنية: قياسات حقيقية بدل المحاكاة · تعطيل الجهاز بدل حذفه.
--
-- منهجية: يعمل بدور postgres (BYPASSRLS) فيقيس **منطق الدوال** لا سياسات
-- RLS. لا نَدَّعي هنا ما لا نقيسه.
--
-- كل تأكيد ★ سقط فعلاً قبل 0327 (موثَّق في docs/BUGFIX_0327_*.md).
-- ============================================================================
\set ON_ERROR_STOP on

DO $$
DECLARE
  v_t     UUID := gen_random_uuid();
  v_tb    UUID := gen_random_uuid();
  v_u     UUID := gen_random_uuid();
  v_emp   UUID := gen_random_uuid();
  v_eid   UUID;
  v_d1    UUID := gen_random_uuid();
  v_d2    UUID := gen_random_uuid();
  v_d3    UUID := gen_random_uuid();
  v_i     INT;
  v_n     INT;
  v_peak  INT;
  v_sum   INT;
  v_txt   TEXT;
  v_bool  BOOLEAN;
  v_ok    BOOLEAN;
  v_pass  INT := 0;
BEGIN
  -- ═══ تهيئة ═══════════════════════════════════════════════════════════
  INSERT INTO public.tenants(id,name,name_ar,slug) VALUES
    (v_t ,'TA','تقنية أ','ta27-'||substr(v_t::text ,1,8)),
    (v_tb,'TB','تقنية ب','tb27-'||substr(v_tb::text,1,8));
  INSERT INTO auth.users(id,email) VALUES
    (v_u  ,'it-'||substr(v_u::text  ,1,8)||'@t27.io'),
    (v_emp,'e-' ||substr(v_emp::text,1,8)||'@t27.io');
  INSERT INTO public.profiles(id,tenant_id,full_name,role) VALUES
    (v_u  ,v_t,'مسؤول تقني','it_admin'),
    (v_emp,v_t,'موظف عادي','employee');
  SELECT e.id INTO v_eid FROM public.employees e WHERE e.user_id = v_emp;
  PERFORM set_config('request.jwt.claim.sub', v_u::TEXT, TRUE);

  -- ═══ ① البنية ════════════════════════════════════════════════════════
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN
     ('attendance_punches_hourly','attendance_punch_count',
      'deactivate_biometric_device','biometric_devices_health');
  ASSERT v_n = 4, format('1.1 دوال 0327 = %s (متوقَّع 4)', v_n);
  v_pass := v_pass + 1;

  -- ★ الكتابة تحتاج VOLATILE (درس 0320)
  ASSERT (SELECT p.provolatile FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.proname='deactivate_biometric_device') = 'v',
    '1.2 ★ deactivate_biometric_device ليست VOLATILE';
  v_pass := v_pass + 1;

  -- ═══ ② ★ التوزيع الساعي الحقيقي — عطل ① ══════════════════════════════
  -- ملاحظة عمود: shift_date NOT NULL · قيد فريد (tenant,employee,punch_time)
  FOR v_i IN 1..20 LOOP
    INSERT INTO public.attendance_logs
      (tenant_id,employee_id,punch_time,punch_type,shift_date,source)
    VALUES (v_t,v_eid, NOW()-INTERVAL '8 hours'+(v_i||' seconds')::INTERVAL,
            CASE WHEN v_i%2=0 THEN 'in' ELSE 'out' END, CURRENT_DATE,'biometric');
  END LOOP;
  FOR v_i IN 1..3 LOOP
    INSERT INTO public.attendance_logs
      (tenant_id,employee_id,punch_time,punch_type,shift_date,source)
    VALUES (v_t,v_eid, NOW()-INTERVAL '2 hours'+(v_i||' seconds')::INTERVAL,
            'in', CURRENT_DATE,'biometric');
  END LOOP;

  -- الساعات الصفرية محفوظة (وإلا انزاح الرسم)
  SELECT count(*) INTO v_n FROM public.attendance_punches_hourly(12);
  ASSERT v_n = 12, format('2.1 ★ أعمدة الرسم = %s (متوقَّع 12)', v_n);
  v_pass := v_pass + 1;

  -- ★ الذروة محفوظة — المحاكاة كانت تسطّحها إلى ~1
  SELECT max(out_total) INTO v_peak FROM public.attendance_punches_hourly(12);
  ASSERT v_peak = 20,
    format('2.2 ★ الذروة = %s (متوقَّع 20) — التسطيح يُخفي الازدحام', v_peak);
  v_pass := v_pass + 1;

  -- ساعتان فقط فيهما نشاط
  SELECT count(*) INTO v_n FROM public.attendance_punches_hourly(12) WHERE out_total > 0;
  ASSERT v_n = 2, format('2.3 ساعات النشاط = %s (متوقَّع 2)', v_n);
  v_pass := v_pass + 1;

  -- ★ التفريق بين الدخول والخروج (المحاكاة لا تعرفه أصلاً)
  SELECT out_punch_in, out_punch_out INTO v_n, v_i
    FROM public.attendance_punches_hourly(12) WHERE out_total = 20;
  ASSERT v_n = 10 AND v_i = 10,
    format('2.4 ★ تفصيل الدخول/الخروج = %s/%s (متوقَّع 10/10)', v_n, v_i);
  v_pass := v_pass + 1;

  -- المجموع يطابق العدّ المستقل — لا انحراف
  SELECT sum(out_total) INTO v_sum FROM public.attendance_punches_hourly(12);
  SELECT public.attendance_punch_count(12) INTO v_n;
  ASSERT v_sum = v_n AND v_n = 23,
    format('2.5 ★ مجموع الرسم=%s ≠ العدّ=%s (متوقَّع 23)', v_sum, v_n);
  v_pass := v_pass + 1;

  -- الترتيب زمنيّ تصاعدي
  ASSERT (SELECT bool_and(ok) FROM (
            SELECT out_bucket >= lag(out_bucket) OVER (ORDER BY out_bucket) AS ok
              FROM public.attendance_punches_hourly(12)) x
          WHERE ok IS NOT NULL),
    '2.6 الرسم غير مرتّب زمنياً';
  v_pass := v_pass + 1;

  -- ═══ ③ حدود النافذة ══════════════════════════════════════════════════
  SELECT count(*) INTO v_n FROM public.attendance_punches_hourly(1);
  ASSERT v_n = 1, format('3.1 نافذة ساعة = %s عمود', v_n);
  SELECT count(*) INTO v_n FROM public.attendance_punches_hourly(24);
  ASSERT v_n = 24, format('3.2 نافذة يوم = %s عمود', v_n);
  v_pass := v_pass + 2;

  -- ★ مدخلات شاذّة لا تنهار ولا تُرهق القاعدة
  SELECT count(*) INTO v_n FROM public.attendance_punches_hourly(0);
  ASSERT v_n = 1, format('3.3 ★ نافذة صفرية = %s (تُقصّ إلى 1)', v_n);
  SELECT count(*) INTO v_n FROM public.attendance_punches_hourly(-5);
  ASSERT v_n = 1, format('3.4 ★ نافذة سالبة = %s (تُقصّ إلى 1)', v_n);
  SELECT count(*) INTO v_n FROM public.attendance_punches_hourly(100000);
  ASSERT v_n = 168, format('3.5 ★ نافذة ضخمة = %s (سقف 168 ساعة)', v_n);
  SELECT count(*) INTO v_n FROM public.attendance_punches_hourly(NULL);
  ASSERT v_n = 12, format('3.6 NULL لا يُعيد الافتراضي (%s)', v_n);
  v_pass := v_pass + 4;

  -- ═══ ④ ★ صحّة الأجهزة — قياس لا رقم ثابت ═════════════════════════════
  INSERT INTO public.biometric_devices
    (id,tenant_id,name,ip_address,location,is_active,sync_interval_minutes,last_sync_at)
  VALUES
    (v_d1,v_t,'جهاز حديث'  ,'10.0.0.1','المدخل' ,TRUE ,5,NOW()-INTERVAL '2 minutes'),
    (v_d2,v_t,'جهاز متأخّر','10.0.0.2','المخرج' ,TRUE ,5,NOW()-INTERVAL '60 minutes'),
    (v_d3,v_t,'جهاز معطَّل','10.0.0.3','مستودع',FALSE,5,NULL);

  SELECT count(*) INTO v_n FROM public.biometric_devices_health();
  ASSERT v_n = 3, format('4.1 لوحة الأجهزة = %s صف', v_n);
  v_pass := v_pass + 1;

  SELECT out_is_stale INTO v_bool FROM public.biometric_devices_health()
   WHERE out_device_id = v_d1;
  ASSERT NOT v_bool, '4.2 جهاز زامن قبل دقيقتين عُدّ متأخّراً';
  v_pass := v_pass + 1;

  SELECT out_is_stale INTO v_bool FROM public.biometric_devices_health()
   WHERE out_device_id = v_d2;
  ASSERT v_bool, '4.3 ★ جهاز متأخّر 60 دقيقة (فترته 5) لم يُرصد';
  v_pass := v_pass + 1;

  -- ★ الجهاز المعطَّل لا يُعدّ متأخّراً (ضجيج يُدرَّب المستخدم على تجاهله)
  SELECT out_is_stale INTO v_bool FROM public.biometric_devices_health()
   WHERE out_device_id = v_d3;
  ASSERT NOT v_bool, '4.4 ★ جهاز معطَّل عُدّ متأخّراً';
  v_pass := v_pass + 1;

  -- التأخّر مقيس بالدقائق فعلاً
  SELECT out_minutes_behind INTO v_n FROM public.biometric_devices_health()
   WHERE out_device_id = v_d2;
  ASSERT v_n BETWEEN 59 AND 61, format('4.5 التأخّر = %s دقيقة (متوقَّع ~60)', v_n);
  v_pass := v_pass + 1;

  -- بلا مزامنة قطّ ⇒ التأخّر NULL لا صفر (الصفر يعني «زامن الآن»)
  SELECT out_minutes_behind INTO v_n FROM public.biometric_devices_health()
   WHERE out_device_id = v_d3;
  ASSERT v_n IS NULL, format('4.6 ★ جهاز لم يزامن قطّ تأخّره = %s (متوقَّع NULL)', v_n);
  v_pass := v_pass + 1;

  -- بصمات اليوم منسوبة للجهاز
  UPDATE public.attendance_logs SET device_id = v_d1::TEXT WHERE tenant_id = v_t;
  SELECT out_punches_today INTO v_n FROM public.biometric_devices_health()
   WHERE out_device_id = v_d1;
  ASSERT v_n = 23, format('4.7 بصمات اليوم للجهاز = %s (متوقَّع 23)', v_n);
  v_pass := v_pass + 1;

  -- ═══ ⑤ ★ التعطيل بدل الحذف — عطل ③ ═══════════════════════════════════
  SELECT public.deactivate_biometric_device(v_d1, FALSE) INTO v_txt;
  ASSERT v_txt = 'deactivated', format('5.1 التعطيل أعاد %s', v_txt);
  v_pass := v_pass + 1;

  -- ★ الاسم محفوظ ⇒ السجلّات تبقى معروفة النسب
  SELECT name INTO v_txt FROM public.biometric_devices WHERE id = v_d1;
  ASSERT v_txt = 'جهاز حديث',
    format('5.2 ★ اسم الجهاز ضاع (%s) — سجلّات يتيمة', COALESCE(v_txt,'NULL'));
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM public.attendance_logs
   WHERE tenant_id = v_t AND device_id = v_d1::TEXT;
  ASSERT v_n = 23, format('5.3 ★ سجلّات الحضور = %s بعد التعطيل', v_n);
  v_pass := v_pass + 1;

  -- استدعاء مكرّر آمن
  SELECT public.deactivate_biometric_device(v_d1, FALSE) INTO v_txt;
  ASSERT v_txt = 'already_inactive', format('5.4 تعطيل مكرّر = %s', v_txt);
  v_pass := v_pass + 1;

  -- وإعادة التفعيل تعمل
  SELECT public.deactivate_biometric_device(v_d1, TRUE) INTO v_txt;
  ASSERT v_txt = 'activated', format('5.5 إعادة التفعيل = %s', v_txt);
  ASSERT (SELECT is_active FROM public.biometric_devices WHERE id=v_d1),
    '5.6 الجهاز لم يُفعَّل';
  v_pass := v_pass + 2;

  -- ═══ ⑥ الصلاحيات والحالات الحدّية ════════════════════════════════════
  -- ★ الموظف العادي لا يُعطّل أجهزة البصمة
  PERFORM set_config('request.jwt.claim.sub', v_emp::TEXT, TRUE);
  v_ok := TRUE;
  BEGIN
    PERFORM public.deactivate_biometric_device(v_d2, FALSE);
    v_ok := FALSE;
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE;
  END;
  ASSERT v_ok, '6.1 ★ موظف عادي عطّل جهاز بصمة';
  v_pass := v_pass + 1;

  PERFORM set_config('request.jwt.claim.sub', v_u::TEXT, TRUE);
  v_ok := TRUE;
  BEGIN
    PERFORM public.deactivate_biometric_device(gen_random_uuid(), FALSE);
    v_ok := FALSE;
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE;
  END;
  ASSERT v_ok, '6.2 جهاز غير موجود لم يُرفض';
  v_pass := v_pass + 1;

  -- ═══ ⑦ العزل بين المستأجرين ══════════════════════════════════════════
  --    الدوال تفلتر بـcurrent_user_tenant_id — نتحقّق أنها لا تُسرّب.
  INSERT INTO public.biometric_devices(tenant_id,name,ip_address,location,is_active)
    VALUES (v_tb,'جهاز شركة أخرى','10.9.9.9','بعيد',TRUE);
  SELECT count(*) INTO v_n FROM public.biometric_devices_health();
  ASSERT v_n = 3, format('7.1 ★ لوحة الأجهزة تسرّب: %s صف (متوقَّع 3)', v_n);
  v_pass := v_pass + 1;

  ASSERT NOT EXISTS (
    SELECT 1 FROM public.biometric_devices_health() WHERE out_name = 'جهاز شركة أخرى'
  ), '7.2 ★ ظهر جهاز شركة أخرى';
  v_pass := v_pass + 1;

  -- ═══ ⑧ الصلاحيات على الدوال ══════════════════════════════════════════
  ASSERT NOT has_function_privilege('anon',
    'public.attendance_punches_hourly(integer)','EXECUTE'), '8.1 anon يقرأ الرسم';
  ASSERT NOT has_function_privilege('anon',
    'public.deactivate_biometric_device(uuid,boolean)','EXECUTE'),
    '8.2 ★ anon يُعطّل أجهزة البصمة';
  ASSERT NOT has_function_privilege('anon',
    'public.biometric_devices_health()','EXECUTE'), '8.3 anon يقرأ صحّة الأجهزة';
  ASSERT has_function_privilege('authenticated',
    'public.attendance_punch_count(integer)','EXECUTE'),
    '8.4 المستخدم المُصادَق لا يعدّ البصمات';
  v_pass := v_pass + 4;

  -- ═══ تنظيف ═══════════════════════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub','',TRUE);
  DELETE FROM public.attendance_logs    WHERE tenant_id IN (v_t,v_tb);
  DELETE FROM public.biometric_devices  WHERE tenant_id IN (v_t,v_tb);
  DELETE FROM public.employees          WHERE tenant_id IN (v_t,v_tb);
  DELETE FROM public.profiles WHERE id IN (v_u,v_emp);
  DELETE FROM auth.users      WHERE id IN (v_u,v_emp);
  DELETE FROM public.tenants  WHERE id IN (v_t,v_tb);

  RAISE NOTICE '✅ verify-0327: %/35 تأكيداً ناجحاً', v_pass;
END $$;
