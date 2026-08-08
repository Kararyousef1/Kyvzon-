-- ============================================================================
-- verify-subscription-enforcement-0320.sql
-- اختبار سلوكي لإقفال الاشتراك على مستوى القاعدة.
--
-- يغطي: الأوضاع الثلاثة · منع القفل (lockout) · التدرّج الإلزامي ·
--        الهجين · أدوار المنصة · السجل · العزل بين المستأجرين
--
-- ملاحظة منهجية: هذا الملف يعمل بدور postgres (BYPASSRLS) فيقيس
-- **منطق الدوال** لا فلترة RLS. إثبات RLS الفعلي جرى بمسبار منفصل
-- بدور authenticated وموثَّق في docs — لا نَدَّعي هنا ما لا نقيسه.
-- ============================================================================
\set ON_ERROR_STOP on

DO $$
DECLARE
  v_t1   UUID := gen_random_uuid();   -- basic · {employee,hr}
  v_t2   UUID := gen_random_uuid();   -- hybrid
  v_u1   UUID := gen_random_uuid();
  v_dev  UUID := gen_random_uuid();
  v_u2   UUID := gen_random_uuid();
  v_n    INT;
  v_txt  TEXT;
  v_pass INT := 0;
BEGIN
  -- ── تهيئة ────────────────────────────────────────────────────────────
  INSERT INTO public.tenants(id,name,name_ar,slug,subscription_plan,enabled_modules) VALUES
    (v_t1,'E1','شركة أساسية','e1-'||substr(v_t1::text,1,8),'basic',ARRAY['employee','hr']),
    (v_t2,'E2','شركة هجينة', 'e2-'||substr(v_t2::text,1,8),'hybrid',ARRAY['employee']);
  UPDATE public.tenants SET features = ARRAY['hr-dashboard','employee-profile'] WHERE id = v_t2;

  INSERT INTO auth.users(id,email) VALUES
    (v_u1, 'a-'||substr(v_u1::text,1,8) ||'@e.io'),
    (v_dev,'d-'||substr(v_dev::text,1,8)||'@k.io'),
    (v_u2, 'b-'||substr(v_u2::text,1,8) ||'@e.io');
  INSERT INTO public.profiles(id,tenant_id,full_name,role) VALUES
    (v_u1, v_t1,'مدير الشركة','admin'),
    (v_dev,v_t1,'مطوّر منصة','developer'),
    (v_u2, v_t2,'مدير الهجينة','admin');

  -- ═══ ① الوضع الافتراضي off — لا تغيير سلوكي ════════════════════════
  SELECT module_enforcement_mode INTO v_txt FROM public.tenants WHERE id = v_t1;
  ASSERT v_txt = 'off', format('1.1 الافتراضي = %s (متوقَّع off)', v_txt);
  v_pass := v_pass + 1;

  PERFORM set_config('request.jwt.claim.sub', v_u1::TEXT, TRUE);
  ASSERT public.subscription_allows_module('inventory'),
    '1.2 ★ وضع off يجب أن يمرّ على كل شيء — لا كسر للعملاء';
  ASSERT public.subscription_allows_module('mrp'),  '1.3 off منع mrp';
  v_pass := v_pass + 2;

  -- ولا يُسجَّل شيء في off
  SELECT count(*) INTO v_n FROM public.subscription_access_log WHERE tenant_id = v_t1;
  ASSERT v_n = 0, format('1.4 وضع off سجّل %s محاولة', v_n);
  v_pass := v_pass + 1;

  -- ═══ ② الوضع audit — يمرّ ويُسجّل ══════════════════════════════════
  UPDATE public.tenants SET module_enforcement_mode = 'audit' WHERE id = v_t1;

  ASSERT public.subscription_allows_module('inventory'),
    '2.1 ★ وضع audit يجب ألّا يمنع';
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM public.subscription_access_log
   WHERE tenant_id = v_t1 AND module_key = 'inventory' AND outcome = 'would_block';
  ASSERT v_n >= 1, '2.2 وضع audit لم يُسجّل';
  v_pass := v_pass + 1;

  -- المسموح لا يُسجَّل (لا ضجيج)
  ASSERT public.subscription_allows_module('hr'), '2.3 hr مسموحة ومُنعت';
  SELECT count(*) INTO v_n FROM public.subscription_access_log
   WHERE tenant_id = v_t1 AND module_key = 'hr';
  ASSERT v_n = 0, format('2.4 سُجّلت وحدة مسموحة (%s)', v_n);
  v_pass := v_pass + 2;

  -- ═══ ③ الوضع enforce — يمنع فعلاً ══════════════════════════════════
  UPDATE public.tenants SET module_enforcement_mode = 'enforce' WHERE id = v_t1;

  ASSERT NOT public.subscription_allows_module('inventory'),
    '3.1 ★ وضع enforce لم يمنع';
  ASSERT NOT public.subscription_allows_module('mrp'), '3.2 enforce سمح بـ mrp';
  v_pass := v_pass + 2;

  ASSERT public.subscription_allows_module('hr'),
    '3.3 ★ enforce منع وحدة داخل الاشتراك';
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM public.subscription_access_log
   WHERE tenant_id = v_t1 AND outcome = 'blocked';
  ASSERT v_n >= 1, '3.4 enforce لم يُسجّل المنع';
  v_pass := v_pass + 1;

  -- ═══ ④ ★ منع القفل — وحدات لا تُقفَل أبداً ═════════════════════════
  FOR v_txt IN SELECT unnest(ARRAY['employee','admin','tawathul']) LOOP
    ASSERT public.subscription_allows_module(v_txt),
      format('4.1 ★ الوحدة %s مُنِعت — قفل لا مخرج منه (lockout)', v_txt);
  END LOOP;
  v_pass := v_pass + 1;

  -- حتى لو حُذفت من enabled_modules
  UPDATE public.tenants SET enabled_modules = ARRAY[]::TEXT[] WHERE id = v_t1;
  ASSERT public.subscription_allows_module('employee'),
    '4.2 ★ employee مُنِعت بعد تفريغ enabled_modules — lockout كامل';
  ASSERT public.subscription_allows_module('admin'),
    '4.3 ★ admin مُنِعت — لا يستطيع مدير النظام إصلاح الإعداد';
  v_pass := v_pass + 2;

  UPDATE public.tenants SET enabled_modules = ARRAY['employee','hr'] WHERE id = v_t1;

  -- ═══ ⑤ أدوار المنصة تمرّ للتشخيص ═══════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_dev::TEXT, TRUE);
  ASSERT public.subscription_allows_module('inventory'),
    '5.1 مطوّر المنصة مُنِع — يفقد قدرة التشخيص';
  v_pass := v_pass + 1;

  -- ولا يُلوَّث السجل بمروره
  SELECT count(*) INTO v_n FROM public.subscription_access_log
   WHERE tenant_id = v_t1 AND user_id = v_dev;
  ASSERT v_n = 0, format('5.2 مرور المطوّر لوّث السجل (%s)', v_n);
  v_pass := v_pass + 1;

  -- ═══ ⑥ الهجين يشتقّ من features ════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_u2::TEXT, TRUE);
  UPDATE public.tenants SET module_enforcement_mode = 'enforce' WHERE id = v_t2;

  ASSERT public.subscription_allows_module('hr'),
    '6.1 ★ الهجين: hr مشتقّة من features ومُنِعت';
  ASSERT NOT public.subscription_allows_module('inventory'),
    '6.2 ★ الهجين سمح بوحدة خارج features';
  v_pass := v_pass + 2;

  -- ═══ ⑦ العزل بين المستأجرين ════════════════════════════════════════
  SELECT count(*) INTO v_n FROM public.subscription_access_log WHERE tenant_id = v_t2;
  ASSERT v_n >= 1, '7.1 سجل الهجينة فارغ';
  SELECT count(*) INTO v_n FROM public.subscription_access_log
   WHERE tenant_id = v_t2 AND module_key = 'mrp';
  ASSERT v_n = 0, '7.2 تسرّب سجل بين المستأجرين';
  v_pass := v_pass + 2;

  -- ═══ ⑧ حارس التدرّج ════════════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_dev::TEXT, TRUE);
  UPDATE public.tenants SET module_enforcement_mode = 'off' WHERE id = v_t1;

  BEGIN
    PERFORM public.set_module_enforcement(v_t1, 'enforce');
    RAISE EXCEPTION '8.1 ★ قفز من off إلى enforce بلا audit';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%MUST_AUDIT_BEFORE_ENFORCE%' THEN RAISE; END IF;
  END;
  v_pass := v_pass + 1;

  -- المسار الصحيح يعمل
  PERFORM public.set_module_enforcement(v_t1, 'audit');
  SELECT module_enforcement_mode INTO v_txt FROM public.tenants WHERE id = v_t1;
  ASSERT v_txt = 'audit', '8.2 التبديل إلى audit فشل';
  PERFORM public.set_module_enforcement(v_t1, 'enforce');
  SELECT module_enforcement_mode INTO v_txt FROM public.tenants WHERE id = v_t1;
  ASSERT v_txt = 'enforce', '8.3 التبديل إلى enforce فشل بعد audit';
  v_pass := v_pass + 2;

  -- وضع مجهول مرفوض
  BEGIN
    PERFORM public.set_module_enforcement(v_t1, 'bogus');
    RAISE EXCEPTION '8.4 قُبل وضع مجهول';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%INVALID_ENFORCEMENT_MODE%' THEN RAISE; END IF;
  END;
  v_pass := v_pass + 1;

  -- غير المنصة لا يبدّل
  PERFORM set_config('request.jwt.claim.sub', v_u1::TEXT, TRUE);
  BEGIN
    PERFORM public.set_module_enforcement(v_t1, 'off');
    RAISE EXCEPTION '8.5 ★ مدير شركة بدّل وضع الإقفال';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%NOT_AUTHORIZED_TO_SET_ENFORCEMENT%' THEN RAISE; END IF;
  END;
  v_pass := v_pass + 1;

  -- ═══ ⑨ أدوات المراجعة ══════════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_dev::TEXT, TRUE);
  SELECT count(*) INTO v_n FROM public.enforcement_audit_summary();
  ASSERT v_n >= 1, '9.1 ملخّص التدقيق فارغ للمنصة';
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM public.preview_enforcement_impact(v_t1);
  ASSERT v_n >= 5, format('9.2 تقرير الأثر = %s صف', v_n);
  v_pass := v_pass + 1;

  -- يميّز المسموح من الممنوع
  ASSERT EXISTS (SELECT 1 FROM public.preview_enforcement_impact(v_t1)
                  WHERE out_module='hr' AND out_allowed),
    '9.3 تقرير الأثر يعدّ hr ممنوعة';
  ASSERT EXISTS (SELECT 1 FROM public.preview_enforcement_impact(v_t1)
                  WHERE out_module='inventory' AND NOT out_allowed),
    '9.4 تقرير الأثر يعدّ inventory مسموحة';
  v_pass := v_pass + 2;

  -- ★ غير المنصة لا يرى الأدوات
  PERFORM set_config('request.jwt.claim.sub', v_u1::TEXT, TRUE);
  SELECT count(*) INTO v_n FROM public.enforcement_audit_summary();
  ASSERT v_n = 0, format('9.5 ★ مدير شركة يقرأ ملخّص المنصة (%s)', v_n);
  SELECT count(*) INTO v_n FROM public.preview_enforcement_impact(v_t1);
  ASSERT v_n = 0, format('9.6 ★ مدير شركة يقرأ تقرير الأثر (%s)', v_n);
  v_pass := v_pass + 2;

  -- ═══ ⑩ البوابات مقيِّدة لا موسِّعة ══════════════════════════════════
  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname='public' AND policyname='kyvzon_subscription_gate'
     AND permissive <> 'RESTRICTIVE';
  ASSERT v_n = 0, format('10.1 ★ %s بوابة PERMISSIVE — قد توسّع الوصول', v_n);
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname='public' AND policyname='kyvzon_subscription_gate';
  ASSERT v_n > 100, format('10.2 البوابات = %s (متوقَّع >100)', v_n);
  v_pass := v_pass + 1;

  -- ═══ تنظيف ═════════════════════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub','',TRUE);
  DELETE FROM public.subscription_access_log WHERE tenant_id IN (v_t1,v_t2);
  DELETE FROM public.employees WHERE tenant_id IN (v_t1,v_t2);
  DELETE FROM public.profiles  WHERE id IN (v_u1,v_dev,v_u2);
  DELETE FROM auth.users       WHERE id IN (v_u1,v_dev,v_u2);
  DELETE FROM public.tenants   WHERE id IN (v_t1,v_t2);

  RAISE NOTICE '✅ verify-0320: %/34 تأكيداً ناجحاً', v_pass;
END $$;
