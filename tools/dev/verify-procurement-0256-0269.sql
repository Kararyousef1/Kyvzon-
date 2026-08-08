-- ============================================================================
-- التحقق القاطع من تطبيق المايجريشنات 0256–0269 على Supabase
--
-- شغّله في: Supabase Dashboard → SQL Editor → New query
-- المخرجات: 6 جداول نتائج. اقرأ عمود "الحالة" في كل منها.
-- آمن تماماً: قراءة فقط — لا يعدّل شيئاً.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────
-- 1) ما الذي سجّله Supabase كمُطبَّق؟
-- ─────────────────────────────────────────────────────────────
SELECT '① سجل المايجريشنات' AS "الفحص";

SELECT version, name
FROM supabase_migrations.schema_migrations
WHERE version ~ '^02[5-6][0-9]'
ORDER BY version;
-- المتوقَّع: 14 صفاً من 0256 إلى 0269
-- إن كانت أقل ⇒ Supabase لم يسجّلها (قد تكون طُبِّقت أو لا — تابع)


-- ─────────────────────────────────────────────────────────────
-- 2) ★ الفحص الحاسم: هل الكائنات موجودة فعلاً؟
--    هذا أهم من السجل — السجل قد يكذب، الكائنات لا.
-- ─────────────────────────────────────────────────────────────
SELECT '② وجود الكائنات' AS "الفحص";

WITH expected(migration, kind, object_name) AS (
  VALUES
    -- 0256
    ('0256','table','procurement_audit_events'),
    ('0256','table','procurement_policies'),
    -- 0263
    ('0263','view','contract_renewal_alerts'),
    -- 0265
    ('0265','view','procurement_rtv_inventory_status'),
    -- 0266
    ('0266','table','procurement_notification_log'),
    ('0266','function','run_procurement_daily_notifications'),
    -- 0267
    ('0267','view','procurement_inventory_item_lookup'),
    ('0267','view','procurement_warehouse_lookup'),
    ('0267','view','procurement_expense_account_lookup'),
    ('0267','view','procurement_integration_health'),
    ('0267','function','link_po_line_integration'),
    ('0267','function','set_goods_receipt_warehouse'),
    -- 0268  ← الأحدث
    ('0268','function','notify_procurement_roles_for_tenant'),
    ('0268','function','dispatch_contract_renewal_notifications_for_tenant'),
    ('0268','function','dispatch_pr_approval_reminders_for_tenant'),
    ('0268','function','dispatch_supplier_document_expiry_for_tenant'),
    ('0268','function','dispatch_po_otif_alerts_for_tenant'),
    ('0268','function','run_procurement_daily_notifications_cron'),
    ('0268','view','procurement_notification_dispatch_status'),
    -- 0269  ← الأحدث
    ('0269','table','auction_participant_status'),
    ('0269','function','withdraw_from_auction'),
    ('0269','view','auction_live_status')
)
SELECT
  e.migration              AS "المايجريشن",
  e.kind                   AS "النوع",
  e.object_name            AS "الكائن",
  CASE
    WHEN e.kind = 'function'
      THEN COALESCE((SELECT true FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                      WHERE n.nspname='public' AND p.proname=e.object_name LIMIT 1), false)
    ELSE to_regclass('public.'||e.object_name) IS NOT NULL
  END                      AS "موجود",
  CASE
    WHEN (CASE WHEN e.kind='function'
            THEN COALESCE((SELECT true FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                            WHERE n.nspname='public' AND p.proname=e.object_name LIMIT 1), false)
            ELSE to_regclass('public.'||e.object_name) IS NOT NULL END)
    THEN '✅ مطبَّق'
    ELSE '❌ مفقود — لم يُطبَّق'
  END                      AS "الحالة"
FROM expected e
ORDER BY e.migration, e.kind, e.object_name;


-- ─────────────────────────────────────────────────────────────
-- 3) ★★ الفحص الأمني: هل ثغرة anon مغلقة؟
--    هذه هي الثغرة التي أسقطت 0268 سابقاً.
-- ─────────────────────────────────────────────────────────────
SELECT '③ الأمان — صلاحيات anon' AS "الفحص";

SELECT
  p.proname                                              AS "الدالة",
  has_function_privilege('anon',          p.oid,'EXECUTE') AS "anon",
  has_function_privilege('authenticated', p.oid,'EXECUTE') AS "authenticated",
  has_function_privilege('service_role',  p.oid,'EXECUTE') AS "service_role",
  CASE
    WHEN has_function_privilege('anon', p.oid, 'EXECUTE')
      THEN '🔴 ثغرة — anon يستطيع التنفيذ'
    WHEN has_function_privilege('authenticated', p.oid, 'EXECUTE')
      THEN '🟠 authenticated يستطيع — يجب سحبه'
    WHEN NOT has_function_privilege('service_role', p.oid, 'EXECUTE')
      THEN '🟡 service_role محروم — cron لن يعمل'
    ELSE '✅ سليم'
  END                                                    AS "الحالة"
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND (p.proname LIKE '%_for_tenant'
       OR p.proname = 'run_procurement_daily_notifications_cron')
ORDER BY p.proname;
-- المتوقَّع لكل صف: anon=false · authenticated=false · service_role=true


-- ─────────────────────────────────────────────────────────────
-- 4) دوال المزاد (0269) — anon ممنوع · authenticated مسموح
-- ─────────────────────────────────────────────────────────────
SELECT '④ دوال المزاد' AS "الفحص";

SELECT
  p.proname                                              AS "الدالة",
  has_function_privilege('anon',          p.oid,'EXECUTE') AS "anon",
  has_function_privilege('authenticated', p.oid,'EXECUTE') AS "authenticated",
  CASE
    WHEN has_function_privilege('anon', p.oid,'EXECUTE') THEN '🔴 anon يجب أن يُمنع'
    WHEN NOT has_function_privilege('authenticated', p.oid,'EXECUTE') THEN '🟠 الموظف محروم — الواجهة ستتعطل'
    ELSE '✅ سليم'
  END                                                    AS "الحالة"
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public'
  AND p.proname IN ('place_auction_bid','withdraw_from_auction')
ORDER BY p.proname;


-- ─────────────────────────────────────────────────────────────
-- 5) التحقق من منطق 0269 — سقف السعر وأنواع المزاد
--    نقرأ نص الدالة: هل يحوي الإصلاحات؟
-- ─────────────────────────────────────────────────────────────
SELECT '⑤ منطق المزاد' AS "الفحص";

SELECT
  CASE WHEN prosrc LIKE '%BID_ABOVE_CEILING%'
       THEN '✅ سقف السعر مفروض' ELSE '❌ السقف غير مفروض — 0269 لم يُطبَّق' END AS "سقف السعر",
  CASE WHEN prosrc LIKE '%JAPANESE_CANNOT_ACCEPT_HIGHER_LEVEL%'
       THEN '✅ المزاد الياباني يعمل' ELSE '❌ الياباني معطّل' END               AS "الياباني",
  CASE WHEN prosrc LIKE '%DUTCH_AUCTION_ALREADY_ACCEPTED%'
       THEN '✅ المزاد الهولندي يعمل' ELSE '❌ الهولندي معطّل' END               AS "الهولندي"
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='place_auction_bid';


-- ─────────────────────────────────────────────────────────────
-- 6) صحة عامة: دوال معطوبة أو تكتب وهي STABLE
-- ─────────────────────────────────────────────────────────────
SELECT '⑥ الصحة العامة' AS "الفحص";

SELECT
  (SELECT count(*) FROM pg_tables  WHERE schemaname='public')            AS "الجداول",
  (SELECT count(*) FROM pg_views   WHERE schemaname='public')            AS "الـ Views",
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.provolatile IN ('s','i')
      AND p.prosrc ~* '(^|[^a-z_])(insert into|update |delete from)')    AS "دوال STABLE تكتب",
  CASE WHEN (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
              WHERE n.nspname='public' AND p.provolatile IN ('s','i')
                AND p.prosrc ~* '(^|[^a-z_])(insert into|update |delete from)') = 0
       THEN '✅ سليم' ELSE '🔴 توجد دوال مخالفة' END                      AS "الحالة";
-- المرجع المحلي: 586 جدولاً · 294 view · 0 دوال مخالفة
