-- ============================================================================
-- verify-approval-trail-0316.sql
-- اختبار سلوكي لمايجريشن 0316 — حراسة مسار الاعتماد.
--
-- يغطي: إغلاق التسريب · المسارات الأربعة المشروعة · حجب التعليقات ·
--        out_is_mine و out_is_current · العزل بين المستأجرين
-- ============================================================================
\set ON_ERROR_STOP on

DO $$
DECLARE
  v_t1    UUID := gen_random_uuid();
  v_t2    UUID := gen_random_uuid();
  v_d1    UUID := gen_random_uuid();
  v_req   UUID := gen_random_uuid();   -- ① مُقدّم الطلب
  v_ap1   UUID := gen_random_uuid();   -- ② معتمِد المستوى الأول (بتّ)
  v_ap2   UUID := gen_random_uuid();   -- ② معتمِد المستوى الثاني (معلّق)
  v_umgr  UUID := gen_random_uuid();   -- ③ مدير وحدة المالية
  v_adm   UUID := gen_random_uuid();   -- ④ مدير المنصة
  v_spy   UUID := gen_random_uuid();   -- ✗ لا حق له
  v_t2u   UUID := gen_random_uuid();   -- ✗ مستأجر آخر
  v_src   UUID := gen_random_uuid();
  v_je    UUID := gen_random_uuid();
  v_ref   UUID := gen_random_uuid();   -- reference_id (NOT NULL)
  v_n     INT;
  v_txt   TEXT;
  v_pass  INT := 0;
BEGIN
  -- ── تهيئة ────────────────────────────────────────────────────────────
  INSERT INTO public.tenants(id,name,name_ar,slug) VALUES
    (v_t1,'T1 316','مستأجر ١','t1-316-'||substr(v_t1::text,1,8)),
    (v_t2,'T2 316','مستأجر ٢','t2-316-'||substr(v_t2::text,1,8));
  INSERT INTO public.departments(id,tenant_id,name_ar) VALUES (v_d1,v_t1,'المالية');
  INSERT INTO auth.users(id,email) VALUES
    (v_req, 'r-'||substr(v_req::text,1,8) ||'@316.io'),
    (v_ap1, '1-'||substr(v_ap1::text,1,8) ||'@316.io'),
    (v_ap2, '2-'||substr(v_ap2::text,1,8) ||'@316.io'),
    (v_umgr,'u-'||substr(v_umgr::text,1,8)||'@316.io'),
    (v_adm, 'a-'||substr(v_adm::text,1,8) ||'@316.io'),
    (v_spy, 's-'||substr(v_spy::text,1,8) ||'@316.io'),
    (v_t2u, 'x-'||substr(v_t2u::text,1,8) ||'@316.io');
  INSERT INTO public.profiles(id,tenant_id,full_name,role) VALUES
    (v_req, v_t1,'مُقدّم الطلب','employee'),
    (v_ap1, v_t1,'المعتمِد الأول','manager'),
    (v_ap2, v_t1,'المعتمِد الثاني','manager'),
    (v_umgr,v_t1,'مدير وحدة المالية','manager'),
    (v_adm, v_t1,'مدير النظام','admin'),
    (v_spy, v_t1,'موظف فضولي','employee'),
    (v_t2u, v_t2,'مستأجر آخر','admin');

  -- مدير الوحدة يملك وحدة finance
  INSERT INTO public.portal_unit_assignments(tenant_id,user_id,base_role,unit_key,scope_type,scope_id)
    VALUES (v_t1,v_umgr,'manager','finance','department',v_d1);

  -- ★ تصحيح تشخيصي (اكتُشف بالتشغيل):
  --   ظننتُ أن مصدر صفوف unified_approvals للمالية هو journal_entries،
  --   فأدرجتُ قيداً محاسبياً ففشل التأكيد '2.1 مُقدّم الطلب محروم'.
  --   قراءة تعريف العرض أثبتت أن المصدر هو financial_approval_requests
  --   مع requester_id = r.requested_by و WHERE status='pending'.
  --   الاختبار كان يقيس الشيء الصحيح؛ بياناتي هي الخاطئة.
  --
  -- الأعمدة الإلزامية بلا افتراضي (من information_schema لا تخميناً):
  --   tenant_id · request_type · reference_id
  -- و request_type ∈ journal_entry·invoice·expense·budget·tax_filing
  INSERT INTO public.financial_approval_requests
    (id, tenant_id, request_type, reference_id, requested_by, status)
    VALUES (v_je, v_t1, 'journal_entry', v_ref, v_req, 'pending');

  -- خطوتان: الأولى معتمدة والثانية معلّقة
  INSERT INTO public.unified_approval_steps
    (tenant_id,source_module,source_id,step_order,required_role,approver_id,status,comments,decided_by,decided_at)
  VALUES
    (v_t1,'finance',v_je,1,'manager',v_ap1,'approved','تعليق المعتمِد الأول',v_ap1,NOW()),
    (v_t1,'finance',v_je,2,'direct_manager',v_ap2,'pending',NULL,NULL,NULL);

  -- ═══ 1) ★ التسريب أُغلق ════════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_spy::text, TRUE);
  ASSERT NOT public.can_view_approval_trail('finance', v_je),
    '1.1 الفضولي مُنح حق الرؤية';
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM public.approval_steps_for('finance', v_je);
  ASSERT v_n = 0, format('1.2 تسريب %s خطوة للفضولي (الثغرة قبل 0316)', v_n);
  v_pass := v_pass + 1;

  -- ═══ 2) ① مُقدّم الطلب يرى ═════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_req::text, TRUE);
  ASSERT public.can_view_approval_trail('finance', v_je), '2.1 مُقدّم الطلب محروم';
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM public.approval_steps_for('finance', v_je);
  ASSERT v_n = 2, format('2.2 مُقدّم الطلب يرى %s خطوة (متوقَّع 2)', v_n);
  v_pass := v_pass + 1;

  -- يرى تعليق من بتّ في طلبه (شفافية القرار)
  SELECT out_comments INTO v_txt FROM public.approval_steps_for('finance', v_je)
   WHERE out_step_order = 1;
  ASSERT v_txt = 'تعليق المعتمِد الأول', '2.3 مُقدّم الطلب لا يرى سبب القرار';
  v_pass := v_pass + 1;

  -- لكنه ليس صاحب أي خطوة
  ASSERT NOT EXISTS (SELECT 1 FROM public.approval_steps_for('finance', v_je) WHERE out_is_mine),
    '2.4 out_is_mine خاطئ لمُقدّم الطلب';
  v_pass := v_pass + 1;

  -- ═══ 3) ② المعتمِد يرى المسار كاملاً ═══════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_ap2::text, TRUE);
  ASSERT public.can_view_approval_trail('finance', v_je), '3.1 المعتمِد الثاني محروم';
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM public.approval_steps_for('finance', v_je);
  ASSERT v_n = 2, format('3.2 المعتمِد يرى %s خطوة', v_n);
  v_pass := v_pass + 1;

  -- خطوته مُعلَّمة
  ASSERT (SELECT out_is_mine FROM public.approval_steps_for('finance', v_je)
           WHERE out_step_order = 2),
    '3.3 out_is_mine لا يُعلّم خطوة المعتمِد';
  v_pass := v_pass + 1;

  ASSERT NOT (SELECT out_is_mine FROM public.approval_steps_for('finance', v_je)
               WHERE out_step_order = 1),
    '3.4 out_is_mine يُعلّم خطوة غيره';
  v_pass := v_pass + 1;

  -- الخطوة النشطة = أول معلّقة
  ASSERT (SELECT out_is_current FROM public.approval_steps_for('finance', v_je)
           WHERE out_step_order = 2),
    '3.5 out_is_current لا يُشير للخطوة المعلّقة';
  v_pass := v_pass + 1;

  ASSERT NOT (SELECT out_is_current FROM public.approval_steps_for('finance', v_je)
               WHERE out_step_order = 1),
    '3.6 out_is_current يُشير لخطوة مُنجَزة';
  v_pass := v_pass + 1;

  -- ★ حجب التعليق: المعتمِد الثاني لا يملك تعليق الأول تلقائياً
  -- (القاعدة المطبَّقة: يرى تعليق نفسه فقط ما لم يكن مديرَ وحدة)
  SELECT out_comments INTO v_txt FROM public.approval_steps_for('finance', v_je)
   WHERE out_step_order = 1;
  ASSERT v_txt IS NULL,
    format('3.7 تعليق المعتمِد الأول مكشوف للثاني: %s', v_txt);
  v_pass := v_pass + 1;

  -- لكنه يرى بنية الخطوة (كم بقي ومن)
  ASSERT EXISTS (SELECT 1 FROM public.approval_steps_for('finance', v_je)
                  WHERE out_step_order = 1 AND out_approver_name = 'المعتمِد الأول'),
    '3.8 حجب التعليق أخفى الخطوة كلها';
  v_pass := v_pass + 1;

  -- المعتمِد الأول يرى تعليق نفسه
  PERFORM set_config('request.jwt.claim.sub', v_ap1::text, TRUE);
  SELECT out_comments INTO v_txt FROM public.approval_steps_for('finance', v_je)
   WHERE out_step_order = 1;
  ASSERT v_txt = 'تعليق المعتمِد الأول', '3.9 المعتمِد لا يرى تعليق نفسه';
  v_pass := v_pass + 1;

  -- ═══ 4) ③ مدير الوحدة يرى كل شيء ═══════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_umgr::text, TRUE);
  ASSERT public.can_view_approval_trail('finance', v_je), '4.1 مدير الوحدة محروم';
  v_pass := v_pass + 1;

  SELECT out_comments INTO v_txt FROM public.approval_steps_for('finance', v_je)
   WHERE out_step_order = 1;
  ASSERT v_txt = 'تعليق المعتمِد الأول', '4.2 مدير الوحدة لا يرى التعليقات';
  v_pass := v_pass + 1;

  -- ★ مدير وحدة أخرى لا يرى
  UPDATE public.portal_unit_assignments SET unit_key='hr'
   WHERE user_id=v_umgr AND unit_key='finance';
  ASSERT NOT public.can_view_approval_trail('finance', v_je),
    '4.3 مدير وحدة hr يرى مسار طلب مالي';
  v_pass := v_pass + 1;

  UPDATE public.portal_unit_assignments SET unit_key='finance'
   WHERE user_id=v_umgr AND unit_key='hr';

  -- ═══ 5) ④ أدوار المنصة ═════════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_adm::text, TRUE);
  ASSERT public.can_view_approval_trail('finance', v_je), '5.1 admin محروم';
  v_pass := v_pass + 1;

  SELECT out_comments INTO v_txt FROM public.approval_steps_for('finance', v_je)
   WHERE out_step_order = 1;
  ASSERT v_txt = 'تعليق المعتمِد الأول', '5.2 admin لا يرى التعليقات';
  v_pass := v_pass + 1;

  -- ═══ 6) العزل بين المستأجرين ═══════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_t2u::text, TRUE);
  ASSERT NOT public.can_view_approval_trail('finance', v_je),
    '6.1 مستخدم مستأجر آخر (admin) يرى المسار';
  v_pass := v_pass + 1;

  SELECT count(*) INTO v_n FROM public.approval_steps_for('finance', v_je);
  ASSERT v_n = 0, format('6.2 تسرّب مستأجر: %s خطوة', v_n);
  v_pass := v_pass + 1;

  -- ═══ 7) طلب غير موجود ══════════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_adm::text, TRUE);
  SELECT count(*) INTO v_n FROM public.approval_steps_for('finance', v_src);
  ASSERT v_n = 0, '7.1 طلب غير موجود أعاد صفوفاً';
  v_pass := v_pass + 1;

  -- NULL آمن
  ASSERT NOT public.can_view_approval_trail('finance', NULL), '7.2 NULL يمنح الوصول';
  v_pass := v_pass + 1;

  -- ═══ 8) الترتيب والصلاحيات ═════════════════════════════════════════
  ASSERT (SELECT array_agg(out_step_order ORDER BY out_step_order)
            FROM public.approval_steps_for('finance', v_je)) = ARRAY[1,2],
    '8.1 الخطوات غير مرتّبة';
  v_pass := v_pass + 1;

  ASSERT NOT has_function_privilege('anon','public.approval_steps_for(text,uuid)','EXECUTE'),
    '8.2 anon يقرأ المسارات';
  ASSERT NOT has_function_privilege('anon','public.can_view_approval_trail(text,uuid)','EXECUTE'),
    '8.3 anon يفحص الوصول';
  ASSERT has_function_privilege('authenticated','public.approval_steps_for(text,uuid)','EXECUTE'),
    '8.4 authenticated محروم';
  v_pass := v_pass + 3;

  -- ═══ تنظيف ═════════════════════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub','',TRUE);
  DELETE FROM public.unified_approval_steps  WHERE source_id = v_je;
  DELETE FROM public.financial_approval_requests WHERE id = v_je;
  DELETE FROM public.portal_unit_assignments WHERE user_id IN (v_req,v_ap1,v_ap2,v_umgr,v_adm,v_spy,v_t2u);
  DELETE FROM public.profiles                WHERE id IN (v_req,v_ap1,v_ap2,v_umgr,v_adm,v_spy,v_t2u);
  DELETE FROM auth.users                     WHERE id IN (v_req,v_ap1,v_ap2,v_umgr,v_adm,v_spy,v_t2u);
  DELETE FROM public.departments             WHERE id = v_d1;
  DELETE FROM public.tenants                 WHERE id IN (v_t1,v_t2);

  RAISE NOTICE '✅ verify-0316: %/28 تأكيداً ناجحاً', v_pass;
END $$;
