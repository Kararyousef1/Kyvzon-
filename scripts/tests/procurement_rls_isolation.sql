-- ============================================================================
-- Procurement RLS Isolation Smoke Test
-- الهدف: اختبار عزل tenant حقيقي لبوابة المشتريات بعد تطبيق migrations.
-- التشغيل المقترح داخل قاعدة اختبار بعد إنشاء مستخدمين/JWT claims مناسبة.
-- ملاحظة: هذا الملف توثيقي/قابل للتوسيع لأن auth.uid() في Supabase يحتاج سياق JWT.
-- ============================================================================

\echo '=== Procurement RLS Isolation Smoke Test ==='

-- هذه الفحوصات يجب تحويلها في CI إلى اختبار pgTAP أو harness يضبط request.jwt.claims:
-- 1) tenant A procurement user creates supplier/PR.
-- 2) tenant B procurement user cannot SELECT tenant A rows.
-- 3) employee cannot execute create_po_from_pr / receive_goods / match_invoice.
-- 4) views return only current_user_tenant_id().

DO $$
BEGIN
  IF to_regprocedure('public.procurement_require_roles(text[])') IS NULL THEN
    RAISE EXCEPTION 'procurement_require_roles missing — run 0190 first';
  END IF;

  IF to_regclass('public.purchase_requisitions') IS NULL
     OR to_regclass('public.purchase_orders') IS NULL
     OR to_regclass('public.supplier_invoices') IS NULL
     OR to_regclass('public.spend_transactions') IS NULL THEN
    RAISE EXCEPTION 'procurement core tables missing';
  END IF;

  RAISE NOTICE 'Procurement RLS smoke prerequisites passed. Add JWT-context harness for full isolation assertions.';
END $$;
