-- ============================================================================
-- FILE: tools/dev/verify-org-structure-0304.sql
-- PURPOSE: اختبار سلوكي للهيكل التنظيمي الموحّد (0304)
-- ============================================================================

\set ON_ERROR_STOP on
\pset pager off

CREATE TEMP TABLE IF NOT EXISTS vo_results (
  seq SERIAL, name TEXT, passed BOOLEAN, detail TEXT
) ON COMMIT PRESERVE ROWS;
TRUNCATE vo_results;

DO $$
DECLARE
  v_tenant UUID;
  v_root   UUID;  -- الشركة
  v_mid    UUID;  -- التقنية
  v_leaf   UUID;  -- التطوير
  v_ceo    UUID := gen_random_uuid();
  v_mgr    UUID := gen_random_uuid();
  v_sup    UUID := gen_random_uuid();
  v_proc   UUID := gen_random_uuid();
  v_new    UUID := gen_random_uuid();
  v_cnt    INT;
  v_txt    TEXT;
  v_uid    UUID;
  v_inh    BOOLEAN;
BEGIN
  INSERT INTO public.tenants (name_ar, slug)
  VALUES ('مستأجر هيكل', 'verify-org-' || substr(gen_random_uuid()::text,1,8))
  RETURNING id INTO v_tenant;

  INSERT INTO public.departments (tenant_id,name_ar) VALUES (v_tenant,'الشركة') RETURNING id INTO v_root;
  INSERT INTO public.departments (tenant_id,name_ar,parent_department_id) VALUES (v_tenant,'التقنية',v_root) RETURNING id INTO v_mid;
  INSERT INTO public.departments (tenant_id,name_ar,parent_department_id) VALUES (v_tenant,'التطوير',v_mid) RETURNING id INTO v_leaf;

  INSERT INTO auth.users (id,email) VALUES
    (v_ceo,'vo-ceo@t.local'),(v_mgr,'vo-mgr@t.local'),
    (v_sup,'vo-sup@t.local'),(v_proc,'vo-proc@t.local'),(v_new,'vo-new@t.local');
  INSERT INTO public.profiles (id,tenant_id,full_name,email,role) VALUES
    (v_ceo, v_tenant,'المدير العام','vo-ceo@t.local','admin'),
    (v_mgr, v_tenant,'مدير التقنية','vo-mgr@t.local','manager'),
    (v_sup, v_tenant,'مشرف التطوير','vo-sup@t.local','supervisor'),
    (v_proc,v_tenant,'مدير المشتريات','vo-proc@t.local','procurement'),
    (v_new, v_tenant,'مدير جديد','vo-new@t.local','manager');

  -- ══ 1-4) المحفّز: الكتابة في الأعمدة تُنشئ صفوفاً ═════════════════════
  UPDATE public.departments SET direct_manager_id=v_ceo WHERE id=v_root;
  UPDATE public.departments SET manager_id=v_mgr, procurement_manager_id=v_proc WHERE id=v_mid;
  UPDATE public.departments SET supervisor_id=v_sup WHERE id=v_leaf;

  SELECT count(*) INTO v_cnt FROM public.org_role_assignments
   WHERE tenant_id=v_tenant AND is_active;
  INSERT INTO vo_results(name,passed,detail) VALUES
    ('المحفّز يُنشئ صفاً لكل عمود مملوء', v_cnt=4, 'rows='||v_cnt);

  SELECT org_role INTO v_txt FROM public.org_role_assignments
   WHERE department_id=v_mid AND unit_key='procurement' AND is_active;
  INSERT INTO vo_results(name,passed,detail) VALUES
    ('procurement_manager_id يصير unit_manager', v_txt='unit_manager', 'role='||COALESCE(v_txt,'NULL'));

  SELECT origin INTO v_txt FROM public.org_role_assignments
   WHERE department_id=v_leaf AND org_role='supervisor';
  INSERT INTO vo_results(name,passed,detail) VALUES
    ('الصفوف المُرحَّلة تُوسم column_sync', v_txt='column_sync', 'origin='||COALESCE(v_txt,'NULL'));

  -- ══ 5) تغيير العمود يُعطّل القديم ويُنشئ الجديد ═══════════════════════
  UPDATE public.departments SET manager_id=v_new WHERE id=v_mid;
  SELECT user_id INTO v_uid FROM public.org_role_assignments
   WHERE department_id=v_mid AND org_role='manager' AND is_active;
  INSERT INTO vo_results(name,passed,detail) VALUES
    ('تغيير العمود يُحدّث الصف الفعّال', v_uid=v_new, 'match='||(v_uid=v_new));

  SELECT count(*) INTO v_cnt FROM public.org_role_assignments
   WHERE department_id=v_mid AND org_role='manager' AND is_active;
  INSERT INTO vo_results(name,passed,detail) VALUES
    ('لا ازدواج بعد التغيير', v_cnt=1, 'active='||v_cnt);

  UPDATE public.departments SET manager_id=v_mgr WHERE id=v_mid;  -- استرجاع

  -- ══ 6) تفريغ العمود يُعطّل الصف ══════════════════════════════════════
  UPDATE public.departments SET supervisor_id=NULL WHERE id=v_leaf;
  SELECT count(*) INTO v_cnt FROM public.org_role_assignments
   WHERE department_id=v_leaf AND org_role='supervisor' AND is_active;
  INSERT INTO vo_results(name,passed,detail) VALUES
    ('تفريغ العمود يُعطّل الصف', v_cnt=0, 'active='||v_cnt);

  SELECT count(*) INTO v_cnt FROM public.org_role_assignments
   WHERE department_id=v_leaf AND org_role='supervisor';
  INSERT INTO vo_results(name,passed,detail) VALUES
    ('لا حذف — الصف باقٍ للتدقيق', v_cnt=1, 'rows='||v_cnt);

  UPDATE public.departments SET supervisor_id=v_sup WHERE id=v_leaf;  -- استرجاع

  -- ══ 7-10) resolve_org_chain: الوراثة ═════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_mgr::text, TRUE);

  SELECT count(*) INTO v_cnt FROM public.resolve_org_chain(v_leaf);
  INSERT INTO vo_results(name,passed,detail) VALUES
    ('سلسلة القسم الأعمق = 3 أدوار', v_cnt=3, 'count='||v_cnt);

  SELECT out_inherited INTO v_inh FROM public.resolve_org_chain(v_leaf)
   WHERE out_org_role='supervisor';
  INSERT INTO vo_results(name,passed,detail) VALUES
    ('المشرف من القسم نفسه (غير موروث)', v_inh IS FALSE, 'inherited='||v_inh);

  SELECT out_inherited, out_user_id INTO v_inh, v_uid FROM public.resolve_org_chain(v_leaf)
   WHERE out_org_role='manager';
  INSERT INTO vo_results(name,passed,detail) VALUES
    ('المدير موروث من القسم الأب', v_inh IS TRUE AND v_uid=v_mgr, 'inherited='||v_inh);

  SELECT out_inherited, out_user_id INTO v_inh, v_uid FROM public.resolve_org_chain(v_leaf)
   WHERE out_org_role='direct_manager';
  INSERT INTO vo_results(name,passed,detail) VALUES
    ('المدير المباشر موروث من الجذر', v_inh IS TRUE AND v_uid=v_ceo, 'inherited='||v_inh);

  -- ══ 11) المشرف لا يُورَث للأبناء ═════════════════════════════════════
  -- مشرف التطوير يجب ألا يظهر في سلسلة التقنية (أعلى منه)
  SELECT count(*) INTO v_cnt FROM public.resolve_org_chain(v_mid)
   WHERE out_org_role='supervisor';
  INSERT INTO vo_results(name,passed,detail) VALUES
    ('مشرف القسم الابن لا يظهر في سلسلة الأب', v_cnt=0, 'count='||v_cnt);

  -- ══ 12) مدير الوحدة يظهر عند طلب وحدته فقط ═══════════════════════════
  SELECT count(*) INTO v_cnt FROM public.resolve_org_chain(v_leaf)
   WHERE out_org_role='unit_manager';
  INSERT INTO vo_results(name,passed,detail) VALUES
    ('مدير الوحدة لا يظهر بلا طلب وحدة', v_cnt=0, 'count='||v_cnt);

  SELECT count(*) INTO v_cnt FROM public.resolve_org_chain(v_leaf,'procurement')
   WHERE out_org_role='unit_manager';
  INSERT INTO vo_results(name,passed,detail) VALUES
    ('مدير المشتريات يظهر عند طلب وحدته (موروث)', v_cnt=1, 'count='||v_cnt);

  SELECT count(*) INTO v_cnt FROM public.resolve_org_chain(v_leaf,'movement')
   WHERE out_org_role='unit_manager';
  INSERT INTO vo_results(name,passed,detail) VALUES
    ('وحدة أخرى لا تُرجع مدير المشتريات', v_cnt=0, 'count='||v_cnt);

  -- ══ 13) قيد تماسك unit_key ═══════════════════════════════════════════
  BEGIN
    INSERT INTO public.org_role_assignments (tenant_id,department_id,user_id,org_role,unit_key)
    VALUES (v_tenant,v_leaf,v_new,'unit_manager',NULL);
    INSERT INTO vo_results(name,passed,detail) VALUES
      ('يرفض unit_manager بلا unit_key', FALSE, 'قُبل!');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO vo_results(name,passed,detail) VALUES
      ('يرفض unit_manager بلا unit_key', TRUE, 'رُفض كما يجب');
  END;

  BEGIN
    INSERT INTO public.org_role_assignments (tenant_id,department_id,user_id,org_role,unit_key)
    VALUES (v_tenant,v_leaf,v_new,'manager','procurement');
    INSERT INTO vo_results(name,passed,detail) VALUES
      ('يرفض دوراً هرمياً مع unit_key', FALSE, 'قُبل!');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO vo_results(name,passed,detail) VALUES
      ('يرفض دوراً هرمياً مع unit_key', TRUE, 'رُفض كما يجب');
  END;

  -- ══ 14) التفرّد ══════════════════════════════════════════════════════
  BEGIN
    INSERT INTO public.org_role_assignments (tenant_id,department_id,user_id,org_role,unit_key)
    VALUES (v_tenant,v_mid,v_new,'manager',NULL);
    INSERT INTO vo_results(name,passed,detail) VALUES
      ('يمنع دورين هرميين متطابقين لنفس القسم', FALSE, 'قُبل التكرار!');
  EXCEPTION WHEN unique_violation THEN
    INSERT INTO vo_results(name,passed,detail) VALUES
      ('يمنع دورين هرميين متطابقين لنفس القسم', TRUE, 'رُفض كما يجب');
  END;

  -- ══ 15) وحدتان مختلفتان لنفس القسم مسموحتان ══════════════════════════
  BEGIN
    INSERT INTO public.org_role_assignments (tenant_id,department_id,user_id,org_role,unit_key)
    VALUES (v_tenant,v_mid,v_new,'unit_manager','movement');
    INSERT INTO vo_results(name,passed,detail) VALUES
      ('يقبل مديري وحدتين مختلفتين لنفس القسم', TRUE, 'أُدرج');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO vo_results(name,passed,detail) VALUES
      ('يقبل مديري وحدتين مختلفتين لنفس القسم', FALSE, SQLERRM);
  END;

  -- ══ 16) org_structure_overview ═══════════════════════════════════════
  SELECT count(DISTINCT out_department_id) INTO v_cnt FROM public.org_structure_overview();
  INSERT INTO vo_results(name,passed,detail) VALUES
    ('نظرة الهيكل تشمل الأقسام الثلاثة', v_cnt=3, 'depts='||v_cnt);

  SELECT out_employee_count INTO v_cnt FROM public.org_structure_overview()
   WHERE out_department_id=v_leaf LIMIT 1;
  INSERT INTO vo_results(name,passed,detail) VALUES
    ('نظرة الهيكل تعدّ الموظفين', v_cnt IS NOT NULL, 'count='||COALESCE(v_cnt::TEXT,'NULL'));

  -- ══ 17) التوافق الخلفي: الأعمدة والدالة القديمة سليمة ════════════════
  SELECT count(*) INTO v_cnt FROM information_schema.columns
   WHERE table_schema='public' AND table_name='departments'
     AND column_name IN ('manager_id','supervisor_id','direct_manager_id','procurement_manager_id');
  INSERT INTO vo_results(name,passed,detail) VALUES
    ('الأعمدة الأربعة لم تُحذف', v_cnt=4, 'cols='||v_cnt);

  SELECT count(*) INTO v_cnt FROM public.resolve_department_chain(v_leaf);
  INSERT INTO vo_results(name,passed,detail) VALUES
    ('resolve_department_chain (0153) ما زالت تعمل', v_cnt=1, 'rows='||v_cnt);

  -- تطابق النتيجتين: القديمة والجديدة تعطيان المدير نفسه
  SELECT rdc.manager_id INTO v_uid FROM public.resolve_department_chain(v_leaf) rdc;
  SELECT out_user_id INTO v_txt FROM public.resolve_org_chain(v_leaf) WHERE out_org_role='manager';
  INSERT INTO vo_results(name,passed,detail) VALUES
    ('الدالة القديمة والجديدة تتفقان على المدير', v_uid::TEXT = v_txt,
     'old='||COALESCE(v_uid::TEXT,'—')||' new='||COALESCE(v_txt,'—'));

  -- ══ 18) عزل المستأجرين ═══════════════════════════════════════════════
  SELECT count(*) INTO v_cnt FROM public.org_role_assignments
   WHERE tenant_id <> v_tenant AND department_id IN (v_root,v_mid,v_leaf);
  INSERT INTO vo_results(name,passed,detail) VALUES
    ('لا إسناد يعبر حدود المستأجر', v_cnt=0, 'cross='||v_cnt);

  -- ══ 19) RLS و anon ═══════════════════════════════════════════════════
  INSERT INTO vo_results(name,passed,detail)
  SELECT 'RLS مفعَّلة على org_role_assignments',
         (SELECT rowsecurity FROM pg_tables WHERE schemaname='public' AND tablename='org_role_assignments'),
         'checked';

  INSERT INTO vo_results(name,passed,detail)
  SELECT 'anon لا ينفّذ '||fn,
         NOT has_function_privilege('anon', fn, 'EXECUTE'), 'checked'
    FROM unnest(ARRAY[
      'public.resolve_org_chain(uuid,text)',
      'public.org_structure_overview()'
    ]) AS fn;

  PERFORM set_config('request.jwt.claim.sub','',TRUE);

  -- تنظيف
  DELETE FROM public.org_role_assignments WHERE tenant_id=v_tenant;
  DELETE FROM public.profiles WHERE tenant_id=v_tenant;
  DELETE FROM auth.users WHERE id IN (v_ceo,v_mgr,v_sup,v_proc,v_new);
  DELETE FROM public.departments WHERE tenant_id=v_tenant;
  DELETE FROM public.tenants WHERE id=v_tenant;
END $$;

SELECT seq AS "#",
       CASE WHEN passed THEN '✅' ELSE '❌' END AS "الحالة",
       name AS "الاختبار", detail AS "التفصيل"
  FROM vo_results ORDER BY seq;

DO $$
DECLARE v_pass INT; v_fail INT; v_total INT;
BEGIN
  SELECT count(*) FILTER (WHERE passed), count(*) FILTER (WHERE NOT passed), count(*)
    INTO v_pass, v_fail, v_total FROM vo_results;
  RAISE NOTICE '════════════════════════════════════════';
  RAISE NOTICE '  الهيكل التنظيمي 0304: % / % نجحت', v_pass, v_total;
  IF v_fail > 0 THEN
    RAISE EXCEPTION '❌ % اختباراً فشل', v_fail;
  END IF;
  RAISE NOTICE '  ✅ كل الاختبارات نجحت';
  RAISE NOTICE '════════════════════════════════════════';
END $$;
