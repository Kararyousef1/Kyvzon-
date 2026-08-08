-- ============================================================================
-- post-push-healthcheck.sql
-- فحص صحّة بعد `supabase db push` — للتشغيل على قاعدة Supabase الحقيقية.
--
-- الاستعمال (SQL Editor في لوحة Supabase):
--   الصق الملف كاملاً واضغط Run.
--
-- ★ للقراءة فقط: لا يُنشئ ولا يُعدّل ولا يحذف أي صف.
--   آمن للتشغيل على الإنتاج في أي وقت.
--
-- المُخرَج: جدول واحد — كل سطر فحص، والعمود «الحالة» إمّا ✅ أو ❌.
-- ============================================================================

WITH
-- ═══ ① الجداول الأربعة الجديدة ══════════════════════════════════════════
t_tables AS (
  SELECT 'الجداول' AS "المجال",
         'الجداول الأربعة الجديدة موجودة' AS "الفحص",
         count(*)::TEXT || ' / 4' AS "النتيجة",
         CASE WHEN count(*) = 4 THEN '✅' ELSE '❌' END AS "الحالة"
    FROM information_schema.tables
   WHERE table_schema = 'public'
     AND table_name IN ('portal_unit_assignments','org_role_assignments',
                        'unified_approval_steps','approval_rules')
),

-- ═══ ② عرض الموافقات الموحّد ═══════════════════════════════════════════
t_view AS (
  SELECT 'المحرك الموحّد',
         'عرض unified_approvals موجود',
         CASE WHEN count(*) = 1 THEN 'موجود' ELSE 'مفقود' END,
         CASE WHEN count(*) = 1 THEN '✅' ELSE '❌' END
    FROM pg_views WHERE schemaname='public' AND viewname='unified_approvals'
),

-- ═══ ③ الدوال الأساسية ═════════════════════════════════════════════════
t_funcs AS (
  SELECT 'الدوال',
         'دوال المعمارية الجديدة',
         count(*)::TEXT || ' / 14',
         CASE WHEN count(*) = 14 THEN '✅' ELSE '❌' END
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN (
       'my_portal_units','has_portal_unit','is_in_my_team','require_portal_unit',
       'my_approval_inbox','unified_approval_decide','approval_steps_for',
       'can_view_approval_trail','build_approval_steps','resolve_approval_chain',
       'org_structure_overview','resolve_org_chain','assign_org_role',
       'detect_approval_rule_gaps')
),

-- ═══ ④ أدوار التصنيع (0312/0314/0315) ══════════════════════════════════
t_mrp AS (
  SELECT 'أدوار التصنيع',
         'دوال دورة الحياة الخمس',
         count(*)::TEXT || ' / 5',
         CASE WHEN count(*) = 5 THEN '✅' ELSE '❌' END
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public'
     AND p.proname IN ('mrp_role_catalog','can_manage_mrp_roles','assign_mrp_role',
                       'revoke_mrp_role','mrp_role_assignments_overview')
),
t_catalog AS (
  SELECT 'أدوار التصنيع',
         'الكتالوج يعيد 9 أدوار',
         count(*)::TEXT || ' / 9',
         CASE WHEN count(*) = 9 THEN '✅' ELSE '❌' END
    FROM public.mrp_role_catalog()
),

-- ═══ ⑤ المحفّزات ═══════════════════════════════════════════════════════
t_trg AS (
  SELECT 'المحفّزات',
         'محفّزات المزامنة الثلاثة',
         count(*)::TEXT || ' / 3',
         CASE WHEN count(*) = 3 THEN '✅' ELSE '❌' END
    FROM pg_trigger
   WHERE tgname IN ('trg_sync_movement_role_assignment',
                    'trg_sync_movement_role_from_unit',
                    'trg_sync_department_org_roles')
     AND NOT tgisinternal
),

-- ═══ ⑥ RLS مفعّلة على الجداول الجديدة ══════════════════════════════════
t_rls AS (
  SELECT 'الأمان',
         'RLS مفعّلة على الجداول الجديدة',
         count(*) FILTER (WHERE rowsecurity)::TEXT || ' / ' || count(*)::TEXT,
         CASE WHEN count(*) = count(*) FILTER (WHERE rowsecurity)
              THEN '✅' ELSE '❌' END
    FROM pg_tables
   WHERE schemaname='public'
     AND tablename IN ('portal_unit_assignments','org_role_assignments',
                       'unified_approval_steps','approval_rules')
),

-- ═══ ⑦ anon محروم من الدوال الحسّاسة ═══════════════════════════════════
t_anon AS (
  SELECT 'الأمان',
         'anon محروم من الدوال الحسّاسة',
         CASE WHEN bool_and(NOT has_function_privilege('anon', f, 'EXECUTE'))
              THEN 'محروم' ELSE '★ مكشوف' END,
         CASE WHEN bool_and(NOT has_function_privilege('anon', f, 'EXECUTE'))
              THEN '✅' ELSE '❌' END
    FROM unnest(ARRAY[
      'public.approval_steps_for(text,uuid)',
      'public.can_view_approval_trail(text,uuid)',
      'public.assign_mrp_role(uuid,text,uuid)',
      'public.revoke_mrp_role(uuid,text,uuid)',
      'public.my_portal_units()'
    ]) AS f
),

-- ═══ ⑧ البيانات: كم أُسنِد فعلاً ═══════════════════════════════════════
t_units AS (
  SELECT 'البيانات',
         'وحدات بوابة مُسنَدة (نشطة)',
         count(*)::TEXT || ' إسناد لـ ' ||
           count(DISTINCT user_id)::TEXT || ' مستخدم',
         CASE WHEN count(*) > 0 THEN '✅' ELSE '⚠️' END
    FROM public.portal_unit_assignments WHERE is_active
),
t_org AS (
  SELECT 'البيانات',
         'أدوار تنظيمية مُرحَّلة',
         count(*)::TEXT || ' صف',
         CASE WHEN count(*) > 0 THEN '✅' ELSE '⚠️' END
    FROM public.org_role_assignments WHERE is_active
),
t_rules AS (
  SELECT 'البيانات',
         'قواعد اعتماد مُعرَّفة',
         count(*)::TEXT || ' قاعدة',
         CASE WHEN count(*) > 0 THEN '✅' ELSE '⚠️ لا قواعد بعد' END
    FROM public.approval_rules WHERE is_active
),
t_inbox AS (
  SELECT 'البيانات',
         'طلبات معلّقة في المحرك الموحّد',
         count(*)::TEXT || ' طلب',
         '✅'
    FROM public.unified_approvals
),

-- ═══ ⑨ اتساق الجسر: وحدة الحركة ⇒ دور الحركة (0311) ════════════════════
t_bridge AS (
  SELECT 'الاتساق',
         'كل مدير بوحدة حركة له دور حركة',
         CASE WHEN count(*) = 0 THEN 'متّسق'
              ELSE count(*)::TEXT || ' غير مُجسَّر' END,
         CASE WHEN count(*) = 0 THEN '✅' ELSE '❌' END
    FROM public.portal_unit_assignments a
   WHERE a.is_active AND a.base_role='manager' AND a.unit_key='movement'
     AND NOT EXISTS (
       SELECT 1 FROM public.movement_role_assignments m
        WHERE m.user_id=a.user_id AND m.tenant_id=a.tenant_id AND m.is_active)
),

-- ═══ ⑩ المشرف لا يُجسَّر (حارس أمني) ═══════════════════════════════════
t_sup AS (
  SELECT 'الأمان',
         'لا مشرف حصل على دور حركة بالخطأ',
         CASE WHEN count(*) = 0 THEN 'سليم'
              ELSE '★ ' || count(*)::TEXT || ' تصعيد امتياز' END,
         CASE WHEN count(*) = 0 THEN '✅' ELSE '❌' END
    FROM public.movement_role_assignments m
   WHERE m.is_active AND m.origin = 'unit_sync'
     AND EXISTS (
       SELECT 1 FROM public.portal_unit_assignments a
        WHERE a.user_id=m.user_id AND a.is_active
          AND a.base_role='supervisor' AND a.unit_key='movement')
     AND NOT EXISTS (
       SELECT 1 FROM public.portal_unit_assignments a2
        WHERE a2.user_id=m.user_id AND a2.is_active
          AND a2.base_role='manager' AND a2.unit_key='movement')
),

-- ═══ ⑪ فجوات قواعد الاعتماد ════════════════════════════════════════════
t_gaps AS (
  SELECT 'الاتساق',
         'فجوات في قواعد الاعتماد',
         CASE WHEN count(*) = 0 THEN 'لا فجوات'
              ELSE count(*)::TEXT || ' فجوة — راجع صفحة قواعد الاعتماد' END,
         CASE WHEN count(*) = 0 THEN '✅' ELSE '⚠️' END
    FROM public.detect_approval_rule_gaps()
),

-- ═══ ⑫ الأعمدة القديمة سليمة (توافق خلفي) ══════════════════════════════
t_legacy AS (
  SELECT 'التوافق الخلفي',
         'أعمدة departments الأربعة سليمة',
         count(*)::TEXT || ' / 4',
         CASE WHEN count(*) = 4 THEN '✅' ELSE '❌' END
    FROM information_schema.columns
   WHERE table_schema='public' AND table_name='departments'
     AND column_name IN ('manager_id','supervisor_id',
                         'direct_manager_id','procurement_manager_id')
)

SELECT * FROM t_tables
UNION ALL SELECT * FROM t_view
UNION ALL SELECT * FROM t_funcs
UNION ALL SELECT * FROM t_mrp
UNION ALL SELECT * FROM t_catalog
UNION ALL SELECT * FROM t_trg
UNION ALL SELECT * FROM t_rls
UNION ALL SELECT * FROM t_anon
UNION ALL SELECT * FROM t_bridge
UNION ALL SELECT * FROM t_sup
UNION ALL SELECT * FROM t_gaps
UNION ALL SELECT * FROM t_legacy
UNION ALL SELECT * FROM t_units
UNION ALL SELECT * FROM t_org
UNION ALL SELECT * FROM t_rules
UNION ALL SELECT * FROM t_inbox;
