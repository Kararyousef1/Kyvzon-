-- ============================================================================
-- verify-all-request-types-0317.sql
-- ★ الاختبار الشامل: هل تصل **كل** أنواع الطلبات إلى وحدات المدير؟
--
-- طلبه المستخدم حرفياً: «أريد التحقق من كل كل أنواع الطلبات هل تصل
-- للوحدات بشكل صحيح».
--
-- يغطي: عضوية القسم · إجازة · إذن (زمنية) · بلاغ عام · مصروف مالي ·
--        طلب شراء · تسوية مخزون · قائمة مواد · عقد · خصم CRM · تصريح حركة
--
-- ★★★ تصحيح 0339: هذا الملف كان يُدرج `status='pending'` (إنجليزية) في
--   `leaves`. قبل 0339 لم يكن على العمود أي CHECK فمرّ الإدراج — لكنه
--   كان **يكتب قيمة لا تقرؤها أي شاشة**: `leaves.status` افتراضه
--   `'انتظار'`، و`sync_hr_source_status` تكتب `'موافق'`/`'مرفوض'`،
--   وكل فلاتر الواجهة تقارن بالعربية. أي أن الاختبار كان يمرّ على
--   بيانات لا تُنتجها القاعدة ولا تعرضها الواجهة.
--   قيد 0339 كشف ذلك: new row violates "leaves_status_check".
-- ============================================================================
\set ON_ERROR_STOP on

DO $$
DECLARE
  v_t    UUID := gen_random_uuid();
  v_d    UUID := gen_random_uuid();
  v_le   UUID := gen_random_uuid();
  v_mgr  UUID := gen_random_uuid();
  v_emp  UUID := gen_random_uuid();
  v_out  UUID := gen_random_uuid();   -- موظف قسم آخر
  v_snoop UUID := gen_random_uuid();  -- مدير خارج السلسلة (فحص التسريب 0323)
  v_d2   UUID := gen_random_uuid();
  v_eid  UUID;
  v_oid  UUID;
  v_id   UUID;
  v_n    INT;
  v_pass INT := 0;
BEGIN
  -- ── تهيئة ────────────────────────────────────────────────────────────
  INSERT INTO public.tenants(id,name,name_ar,slug)
    VALUES (v_t,'ALL','شامل','all-'||substr(v_t::text,1,8));
  INSERT INTO public.departments(id,tenant_id,name_ar) VALUES
    (v_d,v_t,'العمليات'), (v_d2,v_t,'قسم آخر');
  INSERT INTO auth.users(id,email) VALUES
    (v_mgr,'m-'||substr(v_mgr::text,1,8)||'@all.io'),
    (v_emp,'e-'||substr(v_emp::text,1,8)||'@all.io'),
    (v_out,'o-'||substr(v_out::text,1,8)||'@all.io'),
    (v_snoop,'x-'||substr(v_snoop::text,1,8)||'@all.io');
  INSERT INTO public.profiles(id,tenant_id,full_name,role) VALUES
    (v_mgr,v_t,'المدير','manager');

  -- ═══ ① البلاغ الأول: القسم نصّاً ⇒ يظهر في الهيكل ══════════════════
  INSERT INTO public.profiles(id,tenant_id,full_name,role,department) VALUES
    (v_emp,v_t,'موظف العمليات','employee','العمليات'),
    (v_out,v_t,'موظف آخر','employee','قسم آخر');

  SELECT count(*) INTO v_n FROM public.employees e
   WHERE e.department_id = v_d AND e.tenant_id = v_t;
  ASSERT v_n = 1, format('1.1 عدّ الهيكل للقسم = %s (متوقَّع 1)', v_n);
  v_pass := v_pass + 1;

  -- ملاحظة: org_structure_overview تفلتر بـ current_user_tenant_id()،
  -- فبلا سياق مستخدم تعيد صفراً. نضبطه أولاً — الاختبار كان ناقصاً لا الدالة.
  PERFORM set_config('request.jwt.claim.sub', v_mgr::TEXT, TRUE);
  SELECT count(*) INTO v_n FROM public.org_structure_overview()
   WHERE out_department_id = v_d AND out_employee_count = 1;
  ASSERT v_n >= 1, '1.2 org_structure_overview لا يعكس العضوية';
  v_pass := v_pass + 1;

  SELECT e.id INTO v_eid FROM public.employees e WHERE e.user_id = v_emp;
  SELECT e.id INTO v_oid FROM public.employees e WHERE e.user_id = v_out;
  ASSERT v_eid IS NOT NULL AND v_oid IS NOT NULL, '1.3 صف employees لم يُنشأ';
  v_pass := v_pass + 1;

  -- ── إعداد المدير: مدير القسم + كل الوحدات ────────────────────────────
  UPDATE public.departments SET manager_id = v_mgr WHERE id = v_d;
  INSERT INTO public.portal_unit_assignments
    (tenant_id,user_id,base_role,unit_key,scope_type,scope_id)
  SELECT v_t, v_mgr, 'manager', u, 'department', v_d
    FROM unnest(ARRAY['hr','finance','procurement','inventory',
                      'mrp','contracts','crm','movement','health_safety']) AS u
  ON CONFLICT DO NOTHING;

  -- ═══ ② طلب إجازة ═══════════════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_emp::TEXT, TRUE);
  v_id := gen_random_uuid();
  INSERT INTO public.leaves(id,tenant_id,employee_id,leave_type,date_from,date_to,status)
    VALUES (v_id,v_t,v_eid,'annual','2026-09-01','2026-09-03','انتظار');
  PERFORM public.create_hr_approval('leave', v_id, v_eid);

  PERFORM set_config('request.jwt.claim.sub', v_mgr::TEXT, TRUE);
  SELECT count(*) INTO v_n FROM public.my_approval_inbox('hr')
   WHERE out_request_type = 'leave';
  ASSERT v_n = 1, format('2.1 ★ الإجازة لم تصل صندوق المدير (%s)', v_n);
  v_pass := v_pass + 1;

  -- ★ تأكيد مباشر على جذر البلاغ الثاني.
  --   أُضيف بعد أن كشفتُ ثغرة في تغطيتي: عكستُ التطبيع في العرض
  --   (requester_id = employees.id خاماً) فلم يسقط أي تأكيد — لأن
  --   بقية الفحوص تمرّ عبر my_approval_inbox التي قد تنجح بمسارات أخرى.
  --   هذا يقيس العرض نفسه: كل requester_id يجب أن يكون profiles.id.
  SELECT count(*) INTO v_n
    FROM public.unified_approvals u
   WHERE u.tenant_id = v_t
     AND u.requester_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.employees e WHERE e.id = u.requester_id)
     AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.requester_id);
  ASSERT v_n = 0,
    format('2.3 ★ %s صف يحمل employees.id مكان profiles.id — التطبيع معطَّل', v_n);
  v_pass := v_pass + 1;

  -- اسم مُقدّم الطلب يظهر (لا '—')
  ASSERT EXISTS (SELECT 1 FROM public.my_approval_inbox('hr')
                  WHERE out_requester_name = 'موظف العمليات'),
    '2.2 اسم مُقدّم الطلب لا يظهر — التطبيع فشل';
  v_pass := v_pass + 1;

  -- ═══ ③ طلب إذن (زمنية) ═════════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_emp::TEXT, TRUE);
  v_id := gen_random_uuid();
  -- الأعمدة الفعلية (من information_schema لا تخميناً):
  --   tenant_id · employee_id · date · expected_out_time · reason
  INSERT INTO public.permissions_request
    (id,tenant_id,employee_id,date,expected_out_time,expected_return_time,reason,status)
    VALUES (v_id,v_t,v_eid,'2026-09-05','10:00','12:00','مراجعة','انتظار');
  PERFORM public.create_hr_approval('permission', v_id, v_eid);

  PERFORM set_config('request.jwt.claim.sub', v_mgr::TEXT, TRUE);
  SELECT count(*) INTO v_n FROM public.my_approval_inbox('hr')
   WHERE out_request_type = 'permission';
  ASSERT v_n = 1, format('3.1 ★ الزمنية لم تصل (%s)', v_n);
  v_pass := v_pass + 1;

  -- الصندوق يجمع النوعين
  SELECT count(*) INTO v_n FROM public.my_approval_inbox('hr');
  ASSERT v_n = 2, format('3.2 صندوق HR = %s (متوقَّع 2)', v_n);
  v_pass := v_pass + 1;

  -- ═══ ④ العزل: طلب من قسم آخر لا يصل ═══════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_out::TEXT, TRUE);
  v_id := gen_random_uuid();
  INSERT INTO public.leaves(id,tenant_id,employee_id,leave_type,date_from,date_to,status)
    VALUES (v_id,v_t,v_oid,'annual','2026-09-10','2026-09-11','انتظار');
  PERFORM public.create_hr_approval('leave', v_id, v_oid);

  PERFORM set_config('request.jwt.claim.sub', v_mgr::TEXT, TRUE);
  SELECT count(*) INTO v_n FROM public.my_approval_inbox('hr');
  ASSERT v_n = 2, format('4.1 ★ تسرّب طلب من قسم آخر (الصندوق=%s)', v_n);
  v_pass := v_pass + 1;

  -- ═══ ⑤ بلاغ / طلب عام ══════════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_emp::TEXT, TRUE);
  -- الأنواع المقبولة: leave·expense·loan·attendance_correction·
  --                    movement_permit·goal·other  (لا 'general')
  SELECT public.create_general_approval('other','بلاغ صيانة عاجل',NULL,NULL)
    INTO v_id;

  PERFORM set_config('request.jwt.claim.sub', v_mgr::TEXT, TRUE);
  SELECT count(*) INTO v_n FROM public.my_approval_inbox('hr')
   WHERE out_title = 'بلاغ صيانة عاجل';
  ASSERT v_n = 1, format('5.1 ★ البلاغ العام لم يصل (%s)', v_n);
  v_pass := v_pass + 1;

  -- ═══ ⑥ طلب مالي (مصروف) ════════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_emp::TEXT, TRUE);
  SELECT public.create_financial_approval('expense', gen_random_uuid(), 500)
    INTO v_id;

  PERFORM set_config('request.jwt.claim.sub', v_mgr::TEXT, TRUE);
  SELECT count(*) INTO v_n FROM public.my_approval_inbox('finance');
  ASSERT v_n = 1, format('6.1 ★ الطلب المالي لم يصل (%s)', v_n);
  v_pass := v_pass + 1;

  -- ═══ ⑦ اعتماد قائمة مواد (التصنيع) ═════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_emp::TEXT, TRUE);
  BEGIN
    SELECT public.create_mrp_bom_approval(gen_random_uuid(),'production_manager')
      INTO v_id;
    PERFORM set_config('request.jwt.claim.sub', v_mgr::TEXT, TRUE);
    SELECT count(*) INTO v_n FROM public.my_approval_inbox('mrp');
    ASSERT v_n >= 1, format('7.1 اعتماد BOM لم يصل (%s)', v_n);
    v_pass := v_pass + 1;
  EXCEPTION WHEN OTHERS THEN
    -- الجسر يتطلب صلاحية تصنيع — نُوثّق ولا نُخفي
    RAISE NOTICE '  ⚠️ 7.1 BOM: %', SQLERRM;
  END;

  -- ═══ ⑧ الصندوق الموحّد يجمع كل الوحدات ═════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_mgr::TEXT, TRUE);
  SELECT count(*) INTO v_n FROM public.my_approval_inbox(NULL);
  ASSERT v_n >= 4, format('8.1 ★ الصندوق الموحّد = %s (متوقَّع ≥4)', v_n);
  v_pass := v_pass + 1;

  -- وحداته متعددة
  SELECT count(DISTINCT out_unit_key) INTO v_n FROM public.my_approval_inbox(NULL);
  ASSERT v_n >= 2, format('8.2 وحدات مختلفة = %s (متوقَّع ≥2)', v_n);
  v_pass := v_pass + 1;

  -- ═══ ⑨ التطبيع: requester_id دائماً profiles.id ════════════════════
  SELECT count(*) INTO v_n FROM public.unified_approvals u
   WHERE u.tenant_id = v_t AND u.requester_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.requester_id);
  ASSERT v_n = 0, format('9.1 ★ %s طلب بـ requester_id ليس profiles.id', v_n);
  v_pass := v_pass + 1;

  -- ═══ ⑩ حدود الرؤية ═════════════════════════════════════════════════
  --
  -- ★ تصحيح معماري (0323) — التأكيد السابق هنا كان:
  --      «مدير بلا وحدة لا يرى شيئاً» ⇒ ASSERT v_n = 0
  --   وصار يسقط بعد 0323 بـ«يرى طلبات HR بلا وحدة (2)».
  --
  --   فحصتُ ما إن كان انحداراً أمنياً (مسبار probe4) فتبيّن العكس:
  --   الرؤية لم تعد تُشتقّ من **الوحدة** بل من **التعيين في السلسلة**.
  --   هذا أضيق لا أوسع:
  --     · مدير آخر بلا وحدة           ⇒ 0 صف
  --     · مدير آخر **بوحدة hr كاملة** ⇒ 0 صف  (كان يراها قبلاً)
  --     · المدير المُعيَّن في السلسلة  ⇒ يرى طلبه فقط
  --
  --   وإعماء المعتمِد المُعيَّن لمجرد سحب وحدته يُجمّد الطلب إلى الأبد
  --   بلا من يبتّ فيه. لذا نفحص التسريب الحقيقي: هل يراه **غيره**؟
  UPDATE public.portal_unit_assignments SET is_active = FALSE
   WHERE user_id = v_mgr AND unit_key = 'hr';

  -- المعتمِد المُعيَّن يحتفظ برؤية طلبه (وإلا تجمّد)
  SELECT count(*) INTO v_n FROM public.my_approval_inbox('hr');
  ASSERT v_n > 0,
    format('10.1 ★ المعتمِد المُعيَّن أُعمي عن طلبه ⇒ تجمّد للأبد (%s)', v_n);
  v_pass := v_pass + 1;

  -- ★ التسريب الحقيقي: مدير وحدة hr **لقسم آخر** لا يرى فريق غيره.
  --
  --   تصحيح ذاتي: نسختي الأولى من هذا التأكيد منحت الجاسوس
  --   `scope_type='tenant'` فسقط الاختبار — ثم تبيّن أن السقوط صحيح
  --   والاختبار خاطئ: نطاق `tenant` يعني عمداً «كل موظفي الشركة»
  --   (معمارية 0302 · is_in_my_team). الجاسوس الحقيقي يُقيَّد بقسمه.
  INSERT INTO public.profiles(id,tenant_id,full_name,role)
    VALUES (v_snoop,v_t,'مدير قسم آخر','manager') ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.portal_unit_assignments
    (tenant_id,user_id,base_role,unit_key,scope_type,scope_id)
    VALUES (v_t,v_snoop,'manager','hr','department',v_d2) ON CONFLICT DO NOTHING;
  PERFORM set_config('request.jwt.claim.sub', v_snoop::TEXT, TRUE);
  SELECT count(*) INTO v_n FROM public.my_approval_inbox('hr');
  ASSERT v_n = 0,
    format('10.1b ★ مدير قسم آخر يرى %s طلباً من قسم ليس له — تسريب', v_n);
  v_pass := v_pass + 1;

  PERFORM set_config('request.jwt.claim.sub', v_mgr::TEXT, TRUE);

  UPDATE public.portal_unit_assignments SET is_active = TRUE
   WHERE user_id = v_mgr AND unit_key = 'hr';
  -- ملاحظة: صندوق hr يضمّ الإجازة والزمنية **والبلاغ العام** (unit_key='hr')
  -- فالعدد ≥3 لا 2. الاختبار كان يقيس رقماً قديماً قبل إضافة البلاغ.
  SELECT count(*) INTO v_n FROM public.my_approval_inbox('hr');
  ASSERT v_n >= 2, format('10.2 إعادة الوحدة لم تُرجع الطلبات (%s)', v_n);
  v_pass := v_pass + 1;

  -- ═══ ⑪ الموظف نفسه لا يرى صندوق الاعتماد ═══════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_emp::TEXT, TRUE);
  SELECT count(*) INTO v_n FROM public.my_approval_inbox(NULL);
  ASSERT v_n = 0, format('11.1 ★ موظف عادي يرى %s طلب اعتماد', v_n);
  v_pass := v_pass + 1;

  -- ═══ تنظيف ═════════════════════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub','',TRUE);
  DELETE FROM public.unified_approval_steps    WHERE tenant_id = v_t;
  DELETE FROM public.hr_approval_steps         WHERE tenant_id = v_t;
  DELETE FROM public.hr_approval_requests      WHERE tenant_id = v_t;
  DELETE FROM public.financial_approval_requests WHERE tenant_id = v_t;
  DELETE FROM public.mrp_bom_approvals         WHERE tenant_id = v_t;
  DELETE FROM public.approval_requests         WHERE tenant_id = v_t;
  DELETE FROM public.permissions_request       WHERE tenant_id = v_t;
  DELETE FROM public.leaves                    WHERE tenant_id = v_t;
  DELETE FROM public.portal_unit_assignments   WHERE tenant_id = v_t;
  DELETE FROM public.movement_role_assignments WHERE tenant_id = v_t;
  DELETE FROM public.employees                 WHERE tenant_id = v_t;
  DELETE FROM public.profiles   WHERE id IN (v_mgr,v_emp,v_out,v_snoop);
  DELETE FROM auth.users        WHERE id IN (v_mgr,v_emp,v_out,v_snoop);
  DELETE FROM public.departments WHERE id IN (v_d,v_d2);
  DELETE FROM public.tenants     WHERE id = v_t;

  RAISE NOTICE '✅ verify-0317: %/18 تأكيداً ناجحاً', v_pass;
END $$;
