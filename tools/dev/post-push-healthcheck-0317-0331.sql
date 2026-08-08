-- ============================================================================
-- post-push-healthcheck-0317-0331.sql
--
-- فحص صحّة بعد `supabase db push` للمايجريشنات 0317–0331.
--
-- الاستعمال: لوحة Supabase ← SQL Editor ← New query ← الصق كاملاً ← Run
--
-- ★★ للقراءة فقط تماماً: لا INSERT ولا UPDATE ولا DELETE ولا DDL.
--    آمن للتشغيل في أي وقت وأي عدد من المرات.
--
-- المُخرَج: جدول واحد. اقرأ عمود «الحالة»:
--    ✅ = سليم
--    ❌ = ناقص — لا ترفع حتى يُحلّ
--    ⚠️ = يحتاج انتباهك لكن ليس عطلاً
--
-- ملاحظة: هذا الملف يفحص **البنية** (هل وصل ما دُفع؟).
-- الفحص السلوكي (هل يعمل صحيحاً؟) في tools/dev/verify-*.sql وقد شُغّل محلياً.
-- ============================================================================

WITH

-- ═══ ① الدوال الجديدة — 0317 إلى 0331 ═══════════════════════════════════
f_all AS (
  -- ★ نحتفظ بـoid: has_function_privilege(oid) هي الصيغة الصحيحة.
  --   الصيغة النصّية تفشل لأن pg_get_function_identity_arguments()
  --   تُدرج **أسماء** المعاملات ('p_hours integer') لا أنواعها وحدها.
  SELECT p.oid AS fn_oid, p.proname, p.prosecdef, p.provolatile
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
),

c_0317 AS (
  SELECT 'الدوال · 0317-0319' AS "المجال",
         'التنسيب والأقسام والورديات' AS "الفحص",
         count(*)::TEXT || ' / 5' AS "النتيجة",
         CASE WHEN count(*) = 5 THEN '✅' ELSE '❌' END AS "الحالة"
    FROM f_all WHERE proname IN ('resolve_person_user_id','resolve_person_department',
      'shift_catalog','set_employee_placement','employee_placement')
),

c_0320 AS (
  SELECT 'الدوال · 0320-0321',
         'بوابة الاشتراك ووحدة التحكّم',
         count(*)::TEXT || ' / 6',
         CASE WHEN count(*) = 6 THEN '✅' ELSE '❌' END
    FROM f_all WHERE proname IN ('tenant_allowed_modules','subscription_allows_module',
      'preview_enforcement_impact','set_module_enforcement','enforcement_audit_summary',
      'enforcement_console_overview')
),

c_0322 AS (
  SELECT 'الدوال · 0322-0323',
         'الإشعارات ودورة حياة الاعتماد',
         count(*)::TEXT || ' / 5',
         CASE WHEN count(*) = 5 THEN '✅' ELSE '❌' END
    FROM f_all WHERE proname IN ('notify_user','notify_approval_pending',
      'notify_approval_decided','approval_source_info','sync_hr_source_status')
),

c_0324 AS (
  SELECT 'الدوال · 0324-0325',
         'الأرشفة والطلبات المالية',
         count(*)::TEXT || ' / 5',
         CASE WHEN count(*) = 5 THEN '✅' ELSE '❌' END
    FROM f_all WHERE proname IN ('archive_sop','archive_department',
      'create_financial_request_approval','record_financial_rejection_reason',
      'archive_employee_document')
),

c_0326 AS (
  SELECT 'الدوال · 0326-0327',
         'سطح الإشعارات وقياسات التقنية',
         count(*)::TEXT || ' / 6',
         CASE WHEN count(*) = 6 THEN '✅' ELSE '❌' END
    FROM f_all WHERE proname IN ('notify_inventory_inbound','notification_surface_overview',
      'my_unread_by_kind','attendance_punches_hourly','deactivate_biometric_device',
      'biometric_devices_health')
),

c_0328 AS (
  SELECT 'الدوال · 0328-0329',
         'عزل التقنية وقياس البوابة القديمة',
         count(*)::TEXT || ' / 6',
         CASE WHEN count(*) = 6 THEN '✅' ELSE '❌' END
    FROM f_all WHERE proname IN ('is_platform_tenant','current_user_is_tenant_tech',
      'my_isolation_report','record_legacy_route_hit','legacy_route_readiness',
      'legacy_route_summary')
),

c_0330 AS (
  SELECT 'الدوال · 0330-0331',
         'السجلّ الموحّد والتكاملات',
         count(*)::TEXT || ' / 10',
         CASE WHEN count(*) = 10 THEN '✅' ELSE '❌' END
    FROM f_all WHERE proname IN ('tech_audit_trail','tech_audit_modules','tech_error_log',
      'tech_error_summary','tech_scheduled_jobs','tech_integrations_health',
      'tech_integration_events','tech_export_log','tech_export_summary',
      'notify_critical_error')
),

-- ═══ ② الأمان — لا شيء مكشوف لـanon ═══════════════════════════════════
c_anon AS (
  SELECT 'الأمان ★★',
         'دوال بوابة التقنية محجوبة عن anon',
         CASE WHEN count(*) = 0 THEN 'لا انكشاف'
              ELSE count(*)::TEXT || ' دالة مكشوفة!' END,
         CASE WHEN count(*) = 0 THEN '✅' ELSE '❌' END
    FROM f_all f
   WHERE f.proname LIKE 'tech\_%'
     AND has_function_privilege('anon', f.fn_oid, 'EXECUTE')
),

-- ★ الدوال التي تكتب يجب أن تكون VOLATILE — STABLE يمنع الكتابة صامتاً
c_volatile AS (
  SELECT 'الأمان ★',
         'دوال الكتابة VOLATILE لا STABLE',
         CASE WHEN count(*) = 0 THEN 'سليم'
              ELSE count(*)::TEXT || ' دالة كتابة STABLE!' END,
         CASE WHEN count(*) = 0 THEN '✅' ELSE '❌' END
    FROM f_all
   WHERE proname IN ('notify_user','notify_critical_error','record_legacy_route_hit',
                     'deactivate_biometric_device','sync_hr_source_status',
                     'create_financial_request_approval','archive_sop','archive_department')
     AND provolatile <> 'v'
),

-- ★ دوال قراءة بوابة التقنية INVOKER — DEFINER يتجاوز RLS
c_invoker AS (
  SELECT 'الأمان ★★',
         'دوال قراءة التقنية INVOKER (تحترم RLS)',
         CASE WHEN count(*) = 0 THEN 'سليم'
              ELSE count(*)::TEXT || ' صارت DEFINER!' END,
         CASE WHEN count(*) = 0 THEN '✅' ELSE '❌' END
    FROM f_all
   WHERE proname IN ('tech_audit_trail','tech_audit_modules','tech_error_log',
                     'tech_error_summary','tech_integrations_health',
                     'tech_integration_events','tech_export_log','tech_export_summary')
     AND prosecdef
),

-- ═══ ③ الجداول والأعمدة الجديدة ════════════════════════════════════════
c_tables AS (
  SELECT 'الجداول',
         'الجداول الجديدة (0320 · 0329)',
         count(*)::TEXT || ' / 3',
         CASE WHEN count(*) = 3 THEN '✅' ELSE '❌' END
    FROM information_schema.tables
   WHERE table_schema = 'public'
     AND table_name IN ('subscription_access_log','legacy_route_usage',
                        'financial_approval_requests')
),

c_cols AS (
  SELECT 'الأعمدة',
         'أعمدة أُضيفت (0325 · 0318)',
         count(*)::TEXT || ' / 3',
         CASE WHEN count(*) = 3 THEN '✅' ELSE '❌' END
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND (   (table_name = 'hr_approval_requests' AND column_name = 'amount')
          OR (table_name = 'employee_documents'   AND column_name = 'is_archived')
          OR (table_name = 'employees'            AND column_name = 'branch_id') )
),

-- ★ توسيع قيد request_type ليقبل expense وloan (0325)
c_reqtype AS (
  SELECT 'القيود ★',
         'hr_approval_requests يقبل expense وloan',
         CASE WHEN count(*) = 1 THEN 'مُوسَّع' ELSE 'لم يُوسَّع' END,
         CASE WHEN count(*) = 1 THEN '✅' ELSE '❌' END
    FROM pg_constraint
   WHERE conrelid = 'public.hr_approval_requests'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) LIKE '%expense%'
     AND pg_get_constraintdef(oid) LIKE '%loan%'
),

-- ═══ ④ المحفّزات ═══════════════════════════════════════════════════════
-- ★ تصحيح: `trg_notify_approval_created` **يجب ألّا يوجد**.
--   0322 يحذفه عمداً من جداول الطلبات الأربعة: سباق زمني — المحفّز
--   AFTER INSERT على جدول الطلب يعمل **قبل** بناء الخطوات، فيُشعِر
--   بلا معتمِد. نُقل إلى جدول الخطوات باسم trg_notify_approval_step.
--   فحص وجوده كان خطأً في هذه الأداة لا عطلاً في القاعدة.
c_triggers AS (
  SELECT 'المحفّزات',
         'محفّزات الإشعار والحراسة',
         count(DISTINCT tgname)::TEXT || ' / 3',
         CASE WHEN count(DISTINCT tgname) = 3 THEN '✅' ELSE '❌' END
    FROM pg_trigger
   WHERE NOT tgisinternal
     AND tgname IN ('trg_notify_approval_step',
                    'trg_guard_status_bypass','trg_notify_critical_error')
),

-- ★★ والعكس: وجوده يعني عودة السباق الزمني
c_no_created AS (
  SELECT 'المحفّزات ★★',
         'المحفّز ذو السباق الزمني محذوف (0322)',
         CASE WHEN count(*) = 0 THEN 'محذوف'
              ELSE count(*)::TEXT || ' عاد!' END,
         CASE WHEN count(*) = 0 THEN '✅' ELSE '❌' END
    FROM pg_trigger
   WHERE NOT tgisinternal AND tgname = 'trg_notify_approval_created'
),

-- ★ محفّز الخطوات على الجداول الأربعة
c_step_tables AS (
  SELECT 'المحفّزات ★',
         'محفّز إشعار الخطوة على جداول الخطوات',
         count(*)::TEXT || ' / 4',
         CASE WHEN count(*) >= 2 THEN '✅' ELSE '❌' END
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
   WHERE NOT t.tgisinternal
     AND t.tgname = 'trg_notify_approval_step'
     AND c.relname IN ('unified_approval_steps','hr_approval_steps',
                       'procurement_approval_steps','contract_approval_steps')
),

-- ★★ حارس تجاوز الاعتماد على الجداول الأربعة (0324 · 0325)
c_guard AS (
  SELECT 'الأمان ★★',
         'حارس تجاوز السلسلة على 4 جداول',
         count(*)::TEXT || ' / 4',
         CASE WHEN count(*) = 4 THEN '✅' ELSE '❌' END
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
   WHERE NOT t.tgisinternal
     AND t.tgname = 'trg_guard_status_bypass'
     AND c.relname IN ('leaves','permissions_request','expense_requests','employee_loans')
),

-- ═══ ⑤ عزل بوابة التقنية — 0328 ════════════════════════════════════════
c_syssettings AS (
  SELECT 'العزل ★★ · 0328',
         'system_settings معزول بالمستأجر',
         count(*)::TEXT || ' سياسة',
         CASE WHEN count(*) >= 2 THEN '✅' ELSE '❌' END
    FROM pg_policies
   WHERE tablename = 'system_settings'
     AND (qual LIKE '%tenant_id%' OR with_check LIKE '%tenant_id%')
),

c_rls AS (
  SELECT 'العزل ★',
         'RLS مُفعّل على الجداول الحسّاسة',
         count(*)::TEXT || ' / 4',
         CASE WHEN count(*) = 4 THEN '✅' ELSE '❌' END
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relrowsecurity
     AND c.relname IN ('system_settings','tenant_modules',
                       'subscription_access_log','legacy_route_usage')
),

-- ═══ ⑥ بوابة الاشتراك — الوضع الحالي (تحذير لا خطأ) ════════════════════
c_enforce AS (
  SELECT 'الاشتراك ⚠️',
         'وضع الإقفال لكل الشركات',
         COALESCE((SELECT string_agg(DISTINCT
                     COALESCE(module_enforcement_mode,'off'), ' · ')
                     FROM public.tenants), 'لا شركات'),
         '⚠️'
),

c_gate AS (
  SELECT 'الاشتراك',
         'بوابة الاشتراك مركّبة على الجداول',
         count(*)::TEXT || ' جدول',
         CASE WHEN count(*) > 250 THEN '✅' ELSE '⚠️' END
    FROM pg_policies WHERE policyname = 'kyvzon_subscription_gate'
),

-- ═══ ⑦ سلامة البيانات بعد الترحيل ══════════════════════════════════════
c_orphan_emp AS (
  SELECT 'البيانات',
         'موظفون بقسم غير موجود',
         count(*)::TEXT,
         CASE WHEN count(*) = 0 THEN '✅' ELSE '⚠️' END
    FROM public.employees e
   WHERE e.department_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.departments d WHERE d.id = e.department_id)
),

c_profiles_noemp AS (
  SELECT 'البيانات ⚠️',
         'ملفات بلا سجلّ موظف (0317 يربطها)',
         count(*)::TEXT,
         CASE WHEN count(*) = 0 THEN '✅' ELSE '⚠️' END
    FROM public.profiles p
   WHERE p.tenant_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.employees e WHERE e.user_id = p.id)
),

-- ★ الإجازات المعتمَدة التي بقيت 'انتظار' — العطل الذي أصلحه 0323
c_stuck_leaves AS (
  SELECT 'البيانات ★ · 0323',
         'إجازات معتمَدة بقيت «انتظار»',
         count(*)::TEXT,
         CASE WHEN count(*) = 0 THEN '✅' ELSE '⚠️' END
    FROM public.leaves l
   WHERE l.status = 'انتظار'
     AND EXISTS (
       SELECT 1 FROM public.hr_approval_requests r
        WHERE r.related_id = l.id AND r.status = 'approved')
),

-- ═══ ⑧ المستأجرون والخطط ═══════════════════════════════════════════════
c_plan AS (
  SELECT 'الخطط · 0318',
         'plan يطابق subscription_plan',
         CASE WHEN count(*) = 0 THEN 'موحّد'
              ELSE count(*)::TEXT || ' مستأجر مختلف' END,
         CASE WHEN count(*) = 0 THEN '✅' ELSE '⚠️' END
    FROM public.tenants t
   WHERE t.plan IS DISTINCT FROM t.subscription_plan
),

c_platform AS (
  SELECT 'المنصة ★',
         'مستأجر المنصة kyvzon موجود',
         CASE WHEN count(*) = 1 THEN 'موجود' ELSE count(*)::TEXT END,
         CASE WHEN count(*) = 1 THEN '✅' ELSE '⚠️' END
    FROM public.tenants WHERE slug = 'kyvzon'
),

-- ═══ ⑨ العدّ الإجمالي ══════════════════════════════════════════════════
c_total AS (
  SELECT 'الإجمالي',
         'دوال public الكلّية',
         count(*)::TEXT,
         '⚠️'
    FROM f_all
)

SELECT * FROM c_0317
UNION ALL SELECT * FROM c_0320
UNION ALL SELECT * FROM c_0322
UNION ALL SELECT * FROM c_0324
UNION ALL SELECT * FROM c_0326
UNION ALL SELECT * FROM c_0328
UNION ALL SELECT * FROM c_0330
UNION ALL SELECT * FROM c_anon
UNION ALL SELECT * FROM c_volatile
UNION ALL SELECT * FROM c_invoker
UNION ALL SELECT * FROM c_tables
UNION ALL SELECT * FROM c_cols
UNION ALL SELECT * FROM c_reqtype
UNION ALL SELECT * FROM c_triggers
UNION ALL SELECT * FROM c_no_created
UNION ALL SELECT * FROM c_step_tables
UNION ALL SELECT * FROM c_guard
UNION ALL SELECT * FROM c_syssettings
UNION ALL SELECT * FROM c_rls
UNION ALL SELECT * FROM c_enforce
UNION ALL SELECT * FROM c_gate
UNION ALL SELECT * FROM c_orphan_emp
UNION ALL SELECT * FROM c_profiles_noemp
UNION ALL SELECT * FROM c_stuck_leaves
UNION ALL SELECT * FROM c_plan
UNION ALL SELECT * FROM c_platform
UNION ALL SELECT * FROM c_total;
