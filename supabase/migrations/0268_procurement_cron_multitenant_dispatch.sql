-- ============================================================================
-- 0268 — تشغيل إشعارات المشتريات المجدولة عبر cron (متعدد المستأجرين)
--
-- ─────────────────────────────────────────────────────────────────────────
-- النقص المكتشف بالتشغيل الفعلي (Postgres 17 محلي، لا فحص ثابت):
--
--   SET ROLE service_role;
--   SELECT * FROM public.run_procurement_daily_notifications();
--   ERROR:  permission denied for function run_procurement_daily_notifications
--
--   سببان مستقلان، كلاهما يمنع الجدولة نهائياً:
--
--   1) الصلاحية: دوال 0266 مُنحت لـ authenticated فقط. مُشغِّل cron
--      (Edge Function / pg_cron) يعمل بـ service_role → permission denied.
--
--   2) أعمق وأخطر: كل دوال 0266 تبدأ بـ
--        v_tenant := public.current_user_tenant_id();
--        IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT';
--      و procurement_require_roles() ترفع 'NO_AUTH' عند auth.uid() IS NULL.
--      cron لا يملك جلسة مستخدم ولا مستأجراً → حتى مع GRANT ستفشل.
--      وحتى لو نجحت، كانت ستخدم مستأجراً واحداً فقط لا كل المستأجرين.
--
--   ⇒ النتيجة العملية: الدوال الثلاث في 0266 كانت قابلة للاستدعاء يدوياً
--     من موظف مشتريات مسجَّل الدخول فقط. الجدولة التلقائية — وهي الغرض
--     الأصلي منها — كانت مستحيلة تقنياً.
--
-- الحل في هذا المايجريشن:
--   دوال cron مستقلة بلاحقة _for_tenant تستقبل p_tenant_id صراحةً
--   بدل الاعتماد على سياق الجلسة، ومُشغِّل يمر على كل المستأجرين النشطين.
--   الأمان: EXECUTE لـ service_role فقط (لا anon، لا authenticated).
--
-- إضافة: تغطية po_otif_alerts — كانت مذكورة في تعليقات 0266 كنقص
--   ("تُخزَّن ولا تُرسَل") لكن لم تُنفَّذ لها دالة dispatch إطلاقاً.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- 1) مساعد: إشعار أدوار داخل مستأجر محدد (بلا اعتماد على الجلسة)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_procurement_roles_for_tenant(
  p_tenant_id UUID,
  p_roles TEXT[],
  p_type TEXT,
  p_title TEXT,
  p_message TEXT,
  p_related_table TEXT DEFAULT NULL,
  p_related_id UUID DEFAULT NULL,
  p_priority TEXT DEFAULT 'normal'
)
RETURNS INTEGER
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count INTEGER := 0;
BEGIN
  IF p_tenant_id IS NULL THEN RETURN 0; END IF;

  INSERT INTO public.notifications(
    tenant_id, user_id, type, title, message, related_table, related_id, priority)
  SELECT p_tenant_id, p.id, p_type, p_title, p_message,
         p_related_table, p_related_id, COALESCE(p_priority, 'normal')
  FROM public.profiles p
  WHERE p.tenant_id = p_tenant_id
    AND p.role = ANY(p_roles);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

REVOKE ALL ON FUNCTION public.notify_procurement_roles_for_tenant(UUID,TEXT[],TEXT,TEXT,TEXT,TEXT,UUID,TEXT) FROM PUBLIC;
-- Supabase يمنح EXECUTE تلقائياً لـ anon/authenticated عبر
-- ALTER DEFAULT PRIVILEGES؛ و REVOKE FROM PUBLIC لا يسحب منحة صريحة.
REVOKE ALL ON FUNCTION public.notify_procurement_roles_for_tenant(UUID,TEXT[],TEXT,TEXT,TEXT,TEXT,UUID,TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_procurement_roles_for_tenant(UUID,TEXT[],TEXT,TEXT,TEXT,TEXT,UUID,TEXT) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 2) تجديد العقود — نسخة cron
--    لا نقرأ من contract_renewal_alerts لأنها security_invoker وتفلتر
--    بـ current_user_tenant_id() (تُرجع صفراً تحت cron). نكرّر المنطق
--    صراحةً على المستأجر الممرَّر.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.dispatch_contract_renewal_notifications_for_tenant(
  p_tenant_id UUID
)
RETURNS TABLE(contracts_notified INTEGER, notifications_created INTEGER)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row RECORD;
  v_contracts INTEGER := 0;
  v_notifs INTEGER := 0;
  v_sent INTEGER;
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN QUERY SELECT 0, 0; RETURN;
  END IF;

  FOR v_row IN
    SELECT c.id AS contract_id,
           c.contract_number,
           s.legal_name AS supplier_name,
           (c.end_date - CURRENT_DATE)::INT AS days_remaining,
           CASE
             WHEN c.end_date <= CURRENT_DATE + 7  THEN 'critical'
             WHEN c.end_date <= CURRENT_DATE + 30 THEN 'urgent'
             ELSE 'upcoming'
           END::TEXT AS alert_level,
           (c.renewal_decision IS NULL) AS needs_decision
    FROM public.procurement_contracts c
    LEFT JOIN public.suppliers s ON s.id = c.supplier_id
    WHERE c.tenant_id = p_tenant_id
      AND c.status IN ('active', 'signed')
      AND c.end_date IS NOT NULL
      AND c.end_date >= CURRENT_DATE          -- المنتهية فعلاً ليست "تجديداً قادماً"
      AND c.end_date <= CURRENT_DATE + 90
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.procurement_notification_log
       WHERE tenant_id = p_tenant_id
         AND notification_kind = 'contract_renewal'
         AND entity_id = v_row.contract_id
         AND alert_level = v_row.alert_level
         AND sent_on = CURRENT_DATE
    ) THEN CONTINUE; END IF;

    v_sent := public.notify_procurement_roles_for_tenant(
      p_tenant_id,
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
      v_row.contract_id,
      CASE WHEN v_row.alert_level = 'critical' THEN 'high' ELSE 'normal' END
    );

    INSERT INTO public.procurement_notification_log(
      tenant_id, notification_kind, entity_type, entity_id, alert_level, recipients_count)
    VALUES (p_tenant_id, 'contract_renewal', 'procurement_contract',
            v_row.contract_id, v_row.alert_level, v_sent);

    v_contracts := v_contracts + 1;
    v_notifs := v_notifs + v_sent;
  END LOOP;

  RETURN QUERY SELECT v_contracts, v_notifs;
END $$;

REVOKE ALL ON FUNCTION public.dispatch_contract_renewal_notifications_for_tenant(UUID) FROM PUBLIC;
-- Supabase يمنح EXECUTE تلقائياً لـ anon/authenticated عبر
-- ALTER DEFAULT PRIVILEGES؛ و REVOKE FROM PUBLIC لا يسحب منحة صريحة.
REVOKE ALL ON FUNCTION public.dispatch_contract_renewal_notifications_for_tenant(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_contract_renewal_notifications_for_tenant(UUID) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 3) تذكير موافقات طلبات الشراء — نسخة cron
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.dispatch_pr_approval_reminders_for_tenant(
  p_tenant_id UUID,
  p_hours_threshold INTEGER DEFAULT 48
)
RETURNS TABLE(requests_notified INTEGER, notifications_created INTEGER)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row RECORD;
  v_requests INTEGER := 0;
  v_notifs INTEGER := 0;
  v_sent INTEGER;
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN QUERY SELECT 0, 0; RETURN;
  END IF;

  FOR v_row IN
    SELECT pr.id, pr.pr_number, pr.total_estimated,
           EXTRACT(EPOCH FROM (NOW() - pr.created_at)) / 3600 AS hours_pending
    FROM public.purchase_requisitions pr
    WHERE pr.tenant_id = p_tenant_id
      AND pr.status = 'pending_approval'
      AND pr.created_at < NOW() - (GREATEST(COALESCE(p_hours_threshold, 48), 1) || ' hours')::INTERVAL
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.procurement_notification_log
       WHERE tenant_id = p_tenant_id
         AND notification_kind = 'pr_approval_reminder'
         AND entity_id = v_row.id
         AND sent_on = CURRENT_DATE
    ) THEN CONTINUE; END IF;

    v_sent := public.notify_procurement_roles_for_tenant(
      p_tenant_id,
      ARRAY['procurement','admin','manager'],
      'pr_approval_reminder',
      'تذكير: طلب شراء بانتظار الموافقة',
      'طلب الشراء ' || v_row.pr_number || ' معلّق منذ ' ||
      ROUND(v_row.hours_pending)::TEXT || ' ساعة بقيمة ' ||
      COALESCE(v_row.total_estimated, 0)::TEXT,
      'purchase_requisitions',
      v_row.id,
      'high'
    );

    INSERT INTO public.procurement_notification_log(
      tenant_id, notification_kind, entity_type, entity_id, alert_level, recipients_count)
    VALUES (p_tenant_id, 'pr_approval_reminder', 'purchase_requisition', v_row.id, 'pending', v_sent);

    v_requests := v_requests + 1;
    v_notifs := v_notifs + v_sent;
  END LOOP;

  RETURN QUERY SELECT v_requests, v_notifs;
END $$;

REVOKE ALL ON FUNCTION public.dispatch_pr_approval_reminders_for_tenant(UUID,INTEGER) FROM PUBLIC;
-- Supabase يمنح EXECUTE تلقائياً لـ anon/authenticated عبر
-- ALTER DEFAULT PRIVILEGES؛ و REVOKE FROM PUBLIC لا يسحب منحة صريحة.
REVOKE ALL ON FUNCTION public.dispatch_pr_approval_reminders_for_tenant(UUID,INTEGER) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_pr_approval_reminders_for_tenant(UUID,INTEGER) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 4) وثائق الموردين المنتهية — نسخة cron
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.dispatch_supplier_document_expiry_for_tenant(
  p_tenant_id UUID,
  p_days INTEGER DEFAULT 30
)
RETURNS TABLE(documents_notified INTEGER, notifications_created INTEGER)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row RECORD;
  v_docs INTEGER := 0;
  v_notifs INTEGER := 0;
  v_sent INTEGER;
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN QUERY SELECT 0, 0; RETURN;
  END IF;

  FOR v_row IN
    SELECT sd.id, sd.doc_type, s.legal_name,
           (sd.expiry_date - CURRENT_DATE)::INT AS days_left
    FROM public.supplier_documents sd
    JOIN public.suppliers s ON s.id = sd.supplier_id
    WHERE sd.tenant_id = p_tenant_id
      AND sd.verification_status = 'verified'
      AND sd.expiry_date IS NOT NULL
      AND sd.expiry_date <= CURRENT_DATE + GREATEST(COALESCE(p_days, 30), 0)
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.procurement_notification_log
       WHERE tenant_id = p_tenant_id
         AND notification_kind = 'supplier_doc_expiry'
         AND entity_id = v_row.id
         AND sent_on = CURRENT_DATE
    ) THEN CONTINUE; END IF;

    v_sent := public.notify_procurement_roles_for_tenant(
      p_tenant_id,
      ARRAY['procurement','admin'],
      'supplier_doc_expiry',
      'وثيقة مورد على وشك الانتهاء',
      'وثيقة ' || v_row.doc_type || ' للمورد ' || v_row.legal_name ||
      CASE WHEN v_row.days_left < 0 THEN ' منتهية منذ ' || ABS(v_row.days_left)::TEXT || ' يوماً'
           ELSE ' تنتهي بعد ' || v_row.days_left::TEXT || ' يوماً' END,
      'supplier_documents',
      v_row.id,
      CASE WHEN v_row.days_left < 0 THEN 'high' ELSE 'normal' END
    );

    INSERT INTO public.procurement_notification_log(
      tenant_id, notification_kind, entity_type, entity_id, alert_level, recipients_count)
    VALUES (p_tenant_id, 'supplier_doc_expiry', 'supplier_document', v_row.id,
            CASE WHEN v_row.days_left < 0 THEN 'expired' ELSE 'expiring' END, v_sent);

    v_docs := v_docs + 1;
    v_notifs := v_notifs + v_sent;
  END LOOP;

  RETURN QUERY SELECT v_docs, v_notifs;
END $$;

REVOKE ALL ON FUNCTION public.dispatch_supplier_document_expiry_for_tenant(UUID,INTEGER) FROM PUBLIC;
-- Supabase يمنح EXECUTE تلقائياً لـ anon/authenticated عبر
-- ALTER DEFAULT PRIVILEGES؛ و REVOKE FROM PUBLIC لا يسحب منحة صريحة.
REVOKE ALL ON FUNCTION public.dispatch_supplier_document_expiry_for_tenant(UUID,INTEGER) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_supplier_document_expiry_for_tenant(UUID,INTEGER) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 5) تنبيهات OTIF غير المُرسَلة — النقص المذكور في 0266 وغير المنفَّذ
--    po_otif_alerts تُكتب بواسطة 0199 وتبقى في الجدول بلا إشعار.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.dispatch_po_otif_alerts_for_tenant(
  p_tenant_id UUID
)
RETURNS TABLE(alerts_notified INTEGER, notifications_created INTEGER)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row RECORD;
  v_alerts INTEGER := 0;
  v_notifs INTEGER := 0;
  v_sent INTEGER;
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN QUERY SELECT 0, 0; RETURN;
  END IF;

  FOR v_row IN
    SELECT a.id, a.po_id, a.alert_type, a.severity, a.message, po.po_number
    FROM public.po_otif_alerts a
    LEFT JOIN public.purchase_orders po ON po.id = a.po_id
    WHERE a.tenant_id = p_tenant_id
      AND a.resolved_at IS NULL
      AND a.created_at >= NOW() - INTERVAL '30 days'
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.procurement_notification_log
       WHERE tenant_id = p_tenant_id
         AND notification_kind = 'po_otif_alert'
         AND entity_id = v_row.id
         AND sent_on = CURRENT_DATE
    ) THEN CONTINUE; END IF;

    v_sent := public.notify_procurement_roles_for_tenant(
      p_tenant_id,
      ARRAY['procurement','admin'],
      'po_otif_alert',
      CASE v_row.alert_type
        WHEN 'late_delivery'   THEN 'تأخر تسليم أمر شراء'
        WHEN 'partial_overdue' THEN 'استلام جزئي متأخر'
        WHEN 'open_balance'    THEN 'رصيد أمر شراء مفتوح'
        ELSE 'ارتفاع معدل المرتجعات'
      END,
      COALESCE(v_row.message, 'تنبيه أداء تسليم') ||
      COALESCE(' — أمر الشراء ' || v_row.po_number, ''),
      'purchase_orders',
      v_row.po_id,
      CASE WHEN v_row.severity = 'critical' THEN 'high' ELSE 'normal' END
    );

    INSERT INTO public.procurement_notification_log(
      tenant_id, notification_kind, entity_type, entity_id, alert_level, recipients_count)
    VALUES (p_tenant_id, 'po_otif_alert', 'po_otif_alert', v_row.id, v_row.severity, v_sent);

    v_alerts := v_alerts + 1;
    v_notifs := v_notifs + v_sent;
  END LOOP;

  RETURN QUERY SELECT v_alerts, v_notifs;
END $$;

REVOKE ALL ON FUNCTION public.dispatch_po_otif_alerts_for_tenant(UUID) FROM PUBLIC;
-- Supabase يمنح EXECUTE تلقائياً لـ anon/authenticated عبر
-- ALTER DEFAULT PRIVILEGES؛ و REVOKE FROM PUBLIC لا يسحب منحة صريحة.
REVOKE ALL ON FUNCTION public.dispatch_po_otif_alerts_for_tenant(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_po_otif_alerts_for_tenant(UUID) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 6) المُشغِّل الرئيسي: يمر على كل المستأجرين الذين فعّلوا وحدة المشتريات
--    عزل الأخطاء: فشل مستأجر واحد لا يوقف البقية.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.run_procurement_daily_notifications_cron(
  p_pr_hours INTEGER DEFAULT 48,
  p_doc_days INTEGER DEFAULT 30
)
RETURNS TABLE(
  tenant_id UUID,
  job TEXT,
  entities INTEGER,
  notifications INTEGER,
  error_message TEXT
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant RECORD;
  v_r RECORD;
BEGIN
  FOR v_tenant IN
    SELECT t.id
    FROM public.tenants t
    WHERE EXISTS (
      SELECT 1 FROM public.tenant_modules tm
       WHERE tm.tenant_id = t.id
         AND tm.module_key = 'procurement'
         AND tm.is_enabled = true
    )
  LOOP
    -- تجديد العقود
    BEGIN
      SELECT * INTO v_r FROM public.dispatch_contract_renewal_notifications_for_tenant(v_tenant.id);
      RETURN QUERY SELECT v_tenant.id, 'contract_renewal'::TEXT,
                          v_r.contracts_notified, v_r.notifications_created, NULL::TEXT;
    EXCEPTION WHEN OTHERS THEN
      RETURN QUERY SELECT v_tenant.id, 'contract_renewal'::TEXT, 0, 0, SQLERRM::TEXT;
    END;

    -- تذكير موافقات طلبات الشراء
    BEGIN
      SELECT * INTO v_r FROM public.dispatch_pr_approval_reminders_for_tenant(v_tenant.id, p_pr_hours);
      RETURN QUERY SELECT v_tenant.id, 'pr_approval_reminder'::TEXT,
                          v_r.requests_notified, v_r.notifications_created, NULL::TEXT;
    EXCEPTION WHEN OTHERS THEN
      RETURN QUERY SELECT v_tenant.id, 'pr_approval_reminder'::TEXT, 0, 0, SQLERRM::TEXT;
    END;

    -- وثائق الموردين
    BEGIN
      SELECT * INTO v_r FROM public.dispatch_supplier_document_expiry_for_tenant(v_tenant.id, p_doc_days);
      RETURN QUERY SELECT v_tenant.id, 'supplier_doc_expiry'::TEXT,
                          v_r.documents_notified, v_r.notifications_created, NULL::TEXT;
    EXCEPTION WHEN OTHERS THEN
      RETURN QUERY SELECT v_tenant.id, 'supplier_doc_expiry'::TEXT, 0, 0, SQLERRM::TEXT;
    END;

    -- تنبيهات OTIF
    BEGIN
      SELECT * INTO v_r FROM public.dispatch_po_otif_alerts_for_tenant(v_tenant.id);
      RETURN QUERY SELECT v_tenant.id, 'po_otif_alert'::TEXT,
                          v_r.alerts_notified, v_r.notifications_created, NULL::TEXT;
    EXCEPTION WHEN OTHERS THEN
      RETURN QUERY SELECT v_tenant.id, 'po_otif_alert'::TEXT, 0, 0, SQLERRM::TEXT;
    END;
  END LOOP;

  RETURN;
END $$;

REVOKE ALL ON FUNCTION public.run_procurement_daily_notifications_cron(INTEGER,INTEGER) FROM PUBLIC;
-- Supabase يمنح EXECUTE تلقائياً لـ anon/authenticated عبر
-- ALTER DEFAULT PRIVILEGES؛ و REVOKE FROM PUBLIC لا يسحب منحة صريحة.
REVOKE ALL ON FUNCTION public.run_procurement_daily_notifications_cron(INTEGER,INTEGER) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_procurement_daily_notifications_cron(INTEGER,INTEGER) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 7) View لمراقبة تشغيل الجدولة من لوحة صحة التكامل
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.procurement_notification_dispatch_status
WITH (security_invoker = true) AS
SELECT
  l.notification_kind,
  MAX(l.sent_on)                                        AS last_dispatch_date,
  (CURRENT_DATE - MAX(l.sent_on))::INT                  AS days_since_last,
  COUNT(*) FILTER (WHERE l.sent_on = CURRENT_DATE)      AS dispatched_today,
  SUM(l.recipients_count) FILTER (WHERE l.sent_on = CURRENT_DATE) AS recipients_today,
  COUNT(*)                                              AS total_dispatched,
  CASE
    WHEN MAX(l.sent_on) = CURRENT_DATE                  THEN 'healthy'
    WHEN MAX(l.sent_on) >= CURRENT_DATE - 2             THEN 'stale'
    ELSE 'not_running'
  END::TEXT                                             AS dispatch_health
FROM public.procurement_notification_log l
WHERE l.tenant_id = public.current_user_tenant_id()
GROUP BY l.notification_kind;

GRANT SELECT ON public.procurement_notification_dispatch_status TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────
-- 8) تأكيدات — تفشل المايجريشن إن نقص أي كائن أو صلاحية
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_missing TEXT := '';
  v_fn TEXT;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.notify_procurement_roles_for_tenant(uuid,text[],text,text,text,text,uuid,text)',
    'public.dispatch_contract_renewal_notifications_for_tenant(uuid)',
    'public.dispatch_pr_approval_reminders_for_tenant(uuid,integer)',
    'public.dispatch_supplier_document_expiry_for_tenant(uuid,integer)',
    'public.dispatch_po_otif_alerts_for_tenant(uuid)',
    'public.run_procurement_daily_notifications_cron(integer,integer)'
  ] LOOP
    IF to_regprocedure(v_fn) IS NULL THEN
      v_missing := v_missing || ' ' || v_fn;
    END IF;
  END LOOP;

  IF v_missing <> '' THEN
    RAISE EXCEPTION '0268 failed: missing functions:%', v_missing;
  END IF;

  -- service_role يجب أن يملك EXECUTE على المُشغِّل، وإلا فالجدولة مستحيلة
  IF NOT has_function_privilege('service_role',
        'public.run_procurement_daily_notifications_cron(integer,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION '0268 failed: service_role cannot execute the cron dispatcher';
  END IF;

  /*
    ولا يجوز أن يملكها anon أو authenticated — على أي من الدوال الست.

    سبب هذا الفحص الموسَّع: Supabase يضبط على مشاريعه
      ALTER DEFAULT PRIVILEGES IN SCHEMA public
        GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
    فتُمنَح كل دالة جديدة لـ anon تلقائياً بمنحة **صريحة**
    (proacl: anon=X/postgres). و REVOKE ... FROM PUBLIC لا يسحب منحة
    صريحة — إنما يسحب منحة PUBLIC الضمنية فقط.

    النتيجة قبل الإصلاح (مُثبَتة بالتشغيل): زائر غير مسجَّل استطاع
    تنفيذ dispatch_*_for_tenant على مستأجر لا يملكه وكتابة إشعارات
    في notifications. هذه الدوال لا تفحص auth.uid() لأنها مصمَّمة
    لتعمل تحت cron بلا جلسة — فالصلاحية هي خط الدفاع الوحيد لها.
  */
  FOREACH v_fn IN ARRAY ARRAY[
    'public.notify_procurement_roles_for_tenant(uuid,text[],text,text,text,text,uuid,text)',
    'public.dispatch_contract_renewal_notifications_for_tenant(uuid)',
    'public.dispatch_pr_approval_reminders_for_tenant(uuid,integer)',
    'public.dispatch_supplier_document_expiry_for_tenant(uuid,integer)',
    'public.dispatch_po_otif_alerts_for_tenant(uuid)',
    'public.run_procurement_daily_notifications_cron(integer,integer)'
  ] LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION '0268 failed: anon must not execute %', v_fn;
    END IF;
    IF has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION '0268 failed: authenticated must not execute %', v_fn;
    END IF;
  END LOOP;

  IF to_regclass('public.procurement_notification_dispatch_status') IS NULL THEN
    RAISE EXCEPTION '0268 failed: dispatch status view missing';
  END IF;

  RAISE NOTICE '✅ 0268: procurement multi-tenant cron dispatch applied';
END $$;
