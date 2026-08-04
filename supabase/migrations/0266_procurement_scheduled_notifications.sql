-- ============================================================================
-- 0266 — إشعارات المشتريات المجدولة
--
-- ─────────────────────────────────────────────────────────────────────────
-- النقص المسجَّل:
--   • تنبيهات تجديد العقود موجودة كـ View فقط (contract_renewal_alerts)
--     — لا إشعار يصل المستخدم إطلاقاً، فمن لا يفتح الصفحة لا يعلم.
--   • تنبيهات تأخر التسليم (po_otif_alerts) تُخزَّن ولا تُرسَل.
--   • موافقات طلبات الشراء المعلّقة بلا تذكير (التوثيق يطلب تذكيراً
--     بعد X ساعات).
--   • وثائق الموردين المنتهية بلا إشعار للمشتريات.
--
-- الحل:
--   دوال تولّد صفوفاً في جدول notifications القائم، بحماية من التكرار
--   (لا تُرسَل نفس الإشعار مرتين في اليوم لنفس الكيان).
--   تُستدعى من Edge Function مجدولة أو cron خارجي.
--
-- ملاحظة صريحة: هذه الدوال **تُنشئ الإشعارات فقط**. الجدولة نفسها
-- (cron) خارج نطاق قاعدة البيانات وتحتاج إعداداً في Supabase.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- 1) جدول تتبّع الإشعارات المرسلة (منع التكرار)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.procurement_notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  notification_kind TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  alert_level TEXT,
  sent_on DATE NOT NULL DEFAULT CURRENT_DATE,
  recipients_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, notification_kind, entity_id, alert_level, sent_on)
);
CREATE INDEX IF NOT EXISTS idx_proc_notif_log_tenant
  ON public.procurement_notification_log(tenant_id, sent_on DESC);

ALTER TABLE public.procurement_notification_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS procurement_notification_log_select ON public.procurement_notification_log;
DROP POLICY IF EXISTS procurement_notification_log_write ON public.procurement_notification_log;
CREATE POLICY procurement_notification_log_select ON public.procurement_notification_log
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_user_tenant_id()
     AND (public.current_user_is_staff() OR public.current_user_role() IN ('procurement','admin','finance')));
CREATE POLICY procurement_notification_log_write ON public.procurement_notification_log
  FOR ALL TO authenticated
  USING (tenant_id = public.current_user_tenant_id()
     AND (public.current_user_is_staff() OR public.current_user_role() IN ('procurement','admin')))
  WITH CHECK (tenant_id = public.current_user_tenant_id()
     AND (public.current_user_is_staff() OR public.current_user_role() IN ('procurement','admin')));

-- ─────────────────────────────────────────────────────────────────────────
-- 2) دالة مساعدة: إرسال إشعار لكل مستخدمي أدوار محددة
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_procurement_roles(
  p_roles TEXT[],
  p_type TEXT,
  p_title TEXT,
  p_message TEXT,
  p_related_table TEXT DEFAULT NULL,
  p_related_id UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_count INTEGER := 0;
BEGIN
  IF v_tenant IS NULL THEN RETURN 0; END IF;

  INSERT INTO public.notifications(tenant_id, user_id, type, title, message, related_table, related_id)
  SELECT v_tenant, p.id, p_type, p_title, p_message, p_related_table, p_related_id
  FROM public.profiles p
  WHERE p.tenant_id = v_tenant
    AND p.role = ANY(p_roles);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;
REVOKE ALL ON FUNCTION public.notify_procurement_roles(TEXT[],TEXT,TEXT,TEXT,TEXT,UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_procurement_roles(TEXT[],TEXT,TEXT,TEXT,TEXT,UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 3) إشعارات تجديد العقود (90 / 30 / 7 أيام)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.dispatch_contract_renewal_notifications()
RETURNS TABLE(contracts_notified INTEGER, notifications_created INTEGER)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_row RECORD;
  v_contracts INTEGER := 0;
  v_notifs INTEGER := 0;
  v_sent INTEGER;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;
  PERFORM public.procurement_require_roles(ARRAY['procurement','admin']::TEXT[]);

  FOR v_row IN
    SELECT * FROM public.contract_renewal_alerts
     WHERE alert_level IN ('critical', 'urgent', 'upcoming')
  LOOP
    -- منع التكرار: نفس العقد ونفس المستوى في نفس اليوم
    IF EXISTS (
      SELECT 1 FROM public.procurement_notification_log
       WHERE tenant_id = v_tenant
         AND notification_kind = 'contract_renewal'
         AND entity_id = v_row.contract_id
         AND alert_level = v_row.alert_level
         AND sent_on = CURRENT_DATE
    ) THEN CONTINUE; END IF;

    v_sent := public.notify_procurement_roles(
      ARRAY['procurement','admin'],
      'contract_renewal',
      CASE v_row.alert_level
        WHEN 'critical' THEN 'عاجل: عقد ينتهي خلال أيام'
        WHEN 'urgent'   THEN 'تنبيه: عقد ينتهي خلال شهر'
        ELSE 'تذكير: عقد ينتهي خلال ثلاثة أشهر'
      END,
      'العقد ' || v_row.contract_number || ' مع ' || COALESCE(v_row.supplier_name, 'مورد') ||
      ' ينتهي بعد ' || v_row.days_remaining || ' يوماً' ||
      CASE WHEN v_row.needs_decision THEN ' — لم يُتخذ قرار التجديد بعد.' ELSE '.' END,
      'procurement_contracts',
      v_row.contract_id
    );

    INSERT INTO public.procurement_notification_log(
      tenant_id, notification_kind, entity_type, entity_id, alert_level, recipients_count)
    VALUES (v_tenant, 'contract_renewal', 'procurement_contract', v_row.contract_id, v_row.alert_level, v_sent);

    v_contracts := v_contracts + 1;
    v_notifs := v_notifs + v_sent;
  END LOOP;

  RETURN QUERY SELECT v_contracts::INTEGER, v_notifs::INTEGER;
END $$;
REVOKE ALL ON FUNCTION public.dispatch_contract_renewal_notifications() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dispatch_contract_renewal_notifications() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 4) تذكير موافقات طلبات الشراء المتأخرة
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.dispatch_pr_approval_reminders(
  p_hours_threshold INTEGER DEFAULT 48
)
RETURNS TABLE(requests_notified INTEGER, notifications_created INTEGER)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_row RECORD;
  v_requests INTEGER := 0;
  v_notifs INTEGER := 0;
  v_sent INTEGER;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;
  PERFORM public.procurement_require_roles(ARRAY['procurement','admin']::TEXT[]);

  FOR v_row IN
    SELECT pr.id, pr.pr_number, pr.total_estimated, pr.created_at,
           EXTRACT(EPOCH FROM (NOW() - pr.created_at)) / 3600 AS hours_pending
    FROM public.purchase_requisitions pr
    WHERE pr.tenant_id = v_tenant
      AND pr.status = 'pending_approval'
      AND pr.created_at < NOW() - (p_hours_threshold || ' hours')::INTERVAL
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.procurement_notification_log
       WHERE tenant_id = v_tenant
         AND notification_kind = 'pr_approval_reminder'
         AND entity_id = v_row.id
         AND sent_on = CURRENT_DATE
    ) THEN CONTINUE; END IF;

    v_sent := public.notify_procurement_roles(
      ARRAY['procurement','admin','manager'],
      'pr_approval_reminder',
      'تذكير: طلب شراء بانتظار الموافقة',
      'طلب الشراء ' || v_row.pr_number || ' معلّق منذ ' ||
      ROUND(v_row.hours_pending)::TEXT || ' ساعة بقيمة ' ||
      COALESCE(v_row.total_estimated, 0)::TEXT,
      'purchase_requisitions',
      v_row.id
    );

    INSERT INTO public.procurement_notification_log(
      tenant_id, notification_kind, entity_type, entity_id, alert_level, recipients_count)
    VALUES (v_tenant, 'pr_approval_reminder', 'purchase_requisition', v_row.id, 'pending', v_sent);

    v_requests := v_requests + 1;
    v_notifs := v_notifs + v_sent;
  END LOOP;

  RETURN QUERY SELECT v_requests::INTEGER, v_notifs::INTEGER;
END $$;
REVOKE ALL ON FUNCTION public.dispatch_pr_approval_reminders(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dispatch_pr_approval_reminders(INTEGER) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 5) إشعارات وثائق الموردين المنتهية
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.dispatch_supplier_document_expiry_notifications(
  p_days INTEGER DEFAULT 30
)
RETURNS TABLE(documents_notified INTEGER, notifications_created INTEGER)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_row RECORD;
  v_docs INTEGER := 0;
  v_notifs INTEGER := 0;
  v_sent INTEGER;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;
  PERFORM public.procurement_require_roles(ARRAY['procurement','admin']::TEXT[]);

  FOR v_row IN
    SELECT sd.id, sd.doc_type, sd.expiry_date, s.legal_name,
           (sd.expiry_date - CURRENT_DATE)::INT AS days_left
    FROM public.supplier_documents sd
    JOIN public.suppliers s ON s.id = sd.supplier_id
    WHERE sd.tenant_id = v_tenant
      AND sd.verification_status = 'verified'
      AND sd.expiry_date IS NOT NULL
      AND sd.expiry_date <= CURRENT_DATE + p_days
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.procurement_notification_log
       WHERE tenant_id = v_tenant
         AND notification_kind = 'supplier_doc_expiry'
         AND entity_id = v_row.id
         AND sent_on = CURRENT_DATE
    ) THEN CONTINUE; END IF;

    v_sent := public.notify_procurement_roles(
      ARRAY['procurement','admin'],
      'supplier_doc_expiry',
      'وثيقة مورد على وشك الانتهاء',
      'وثيقة ' || v_row.doc_type || ' للمورد ' || v_row.legal_name ||
      CASE WHEN v_row.days_left < 0 THEN ' منتهية منذ ' || ABS(v_row.days_left)::TEXT || ' يوماً'
           ELSE ' تنتهي بعد ' || v_row.days_left::TEXT || ' يوماً' END,
      'supplier_documents',
      v_row.id
    );

    INSERT INTO public.procurement_notification_log(
      tenant_id, notification_kind, entity_type, entity_id, alert_level, recipients_count)
    VALUES (v_tenant, 'supplier_doc_expiry', 'supplier_document', v_row.id,
            CASE WHEN v_row.days_left < 0 THEN 'expired' ELSE 'expiring' END, v_sent);

    v_docs := v_docs + 1;
    v_notifs := v_notifs + v_sent;
  END LOOP;

  RETURN QUERY SELECT v_docs::INTEGER, v_notifs::INTEGER;
END $$;
REVOKE ALL ON FUNCTION public.dispatch_supplier_document_expiry_notifications(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dispatch_supplier_document_expiry_notifications(INTEGER) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 6) مُشغِّل موحّد لكل الإشعارات المجدولة
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.run_procurement_daily_notifications()
RETURNS TABLE(job TEXT, entities INTEGER, notifications INTEGER)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD;
BEGIN
  PERFORM public.procurement_require_roles(ARRAY['procurement','admin']::TEXT[]);

  SELECT * INTO r FROM public.dispatch_contract_renewal_notifications();
  RETURN QUERY SELECT 'contract_renewal'::TEXT, r.contracts_notified, r.notifications_created;

  SELECT * INTO r FROM public.dispatch_pr_approval_reminders(48);
  RETURN QUERY SELECT 'pr_approval_reminder'::TEXT, r.requests_notified, r.notifications_created;

  SELECT * INTO r FROM public.dispatch_supplier_document_expiry_notifications(30);
  RETURN QUERY SELECT 'supplier_doc_expiry'::TEXT, r.documents_notified, r.notifications_created;

  RETURN;
END $$;
REVOKE ALL ON FUNCTION public.run_procurement_daily_notifications() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_procurement_daily_notifications() TO authenticated;

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  IF to_regclass('public.procurement_notification_log') IS NULL
     OR to_regprocedure('public.dispatch_contract_renewal_notifications()') IS NULL
     OR to_regprocedure('public.dispatch_pr_approval_reminders(integer)') IS NULL
     OR to_regprocedure('public.run_procurement_daily_notifications()') IS NULL
  THEN
    RAISE EXCEPTION '0266 failed: scheduled notification objects missing';
  END IF;
  RAISE NOTICE '✅ 0266: procurement scheduled notifications applied';
END $$;
