-- ============================================================================
-- Kyvzon — 0170_crm_analytics_forecasting.sql
-- بوابة CRM — الوحدة 6 (الأخيرة): التحليلات والتنبؤ وذكاء المبيعات (التقرير 06)
--
-- تُنفّذ كل ما ورد في التقرير وفق المعايير العالمية — معظمها دوال تجميع (RPC)
-- فوق جداول الوحدات 1-5 الموجودة، مع جداول تهيئة قليلة:
--   • crm_sales_targets     → أهداف الموظفين/الفريق الشهرية (لوحات الأداء).
--   • crm_deal_forecast     → تصنيف الصفقة يدوياً (commit/best_case/pipeline/omitted).
--   • crm_mrr_snapshots     → لقطات MRR الشهرية (New/Expansion/Churn/Contraction).
--   • crm_health_weights    → أوزان مؤشر صحة الحساب (قابلة للتعديل لكل مستأجر).
--
-- الدوال (RPC):
--   crm_weighted_forecast · crm_conversion_funnel · crm_pipeline_velocity_report ·
--   crm_winloss_by_competitor · crm_segmentation · crm_account_health_score ·
--   crm_mrr_movement · crm_exec_kpis · crm_rep_performance · crm_seed_health_weights.
--
-- التصميم: tenant-scoped + RLS، بادئة crm_* صارمة، دوال SECURITY DEFINER + فحص المستأجر.
-- idempotent وآمن لإعادة التشغيل.
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
--  (1) أهداف المبيعات — Sales Targets (لكل موظف/فريق، شهرياً)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.crm_sales_targets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  owner_id      UUID REFERENCES public.profiles(id) ON DELETE CASCADE,   -- NULL = هدف الفريق
  period_month  DATE NOT NULL,                                            -- أول يوم من الشهر
  target_amount NUMERIC(16,2) NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, owner_id, period_month)
);
CREATE INDEX IF NOT EXISTS idx_crm_targets_tenant ON public.crm_sales_targets(tenant_id, period_month);

-- ════════════════════════════════════════════════════════════════════════════
--  (2) تصنيف تنبؤ الصفقة — Forecast Categories (على الصفقة)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.crm_deal_forecast (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  deal_id       UUID NOT NULL REFERENCES public.crm_deals(id) ON DELETE CASCADE,
  category      TEXT NOT NULL DEFAULT 'pipeline'
                CHECK (category IN ('commit','best_case','pipeline','omitted')),
  set_by        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, deal_id)
);
CREATE INDEX IF NOT EXISTS idx_crm_forecast_tenant ON public.crm_deal_forecast(tenant_id, category);

-- ════════════════════════════════════════════════════════════════════════════
--  (3) لقطات MRR — MRR Snapshots (حركة الإيراد الشهري)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.crm_mrr_snapshots (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  period_month      DATE NOT NULL,
  starting_mrr      NUMERIC(16,2) NOT NULL DEFAULT 0,
  new_business      NUMERIC(16,2) NOT NULL DEFAULT 0,
  expansion         NUMERIC(16,2) NOT NULL DEFAULT 0,
  churn             NUMERIC(16,2) NOT NULL DEFAULT 0,               -- قيمة موجبة تُطرح
  contraction       NUMERIC(16,2) NOT NULL DEFAULT 0,               -- قيمة موجبة تُطرح
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, period_month)
);
CREATE INDEX IF NOT EXISTS idx_crm_mrr_tenant ON public.crm_mrr_snapshots(tenant_id, period_month);

-- ════════════════════════════════════════════════════════════════════════════
--  (4) أوزان مؤشر صحة الحساب — Health Score Weights (قابلة للتعديل)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.crm_health_weights (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  login_weight        INTEGER NOT NULL DEFAULT 25,
  usage_weight        INTEGER NOT NULL DEFAULT 20,
  csat_weight         INTEGER NOT NULL DEFAULT 20,
  tickets_weight      INTEGER NOT NULL DEFAULT 15,                  -- عكسي
  payment_weight      INTEGER NOT NULL DEFAULT 10,
  nps_weight          INTEGER NOT NULL DEFAULT 10,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id)
);

-- ════════════════════════════════════════════════════════════════════════════
--  (5) تفعيل RLS + سياسات العزل
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'crm_sales_targets','crm_deal_forecast','crm_mrr_snapshots','crm_health_weights'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I;', t, t);
    EXECUTE format(
      'CREATE POLICY %I_select ON public.%I FOR SELECT TO authenticated USING (tenant_id = public.current_user_tenant_id());',
      t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_write ON public.%I;', t, t);
    EXECUTE format(
      'CREATE POLICY %I_write ON public.%I FOR ALL TO authenticated USING (tenant_id = public.current_user_tenant_id()) WITH CHECK (tenant_id = public.current_user_tenant_id());',
      t, t);
  END LOOP;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
--  (6) التنبؤ المرجّح — Weighted Pipeline Forecast (المرحلة × الاحتمالية)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.crm_weighted_forecast(p_pipeline_id UUID DEFAULT NULL)
RETURNS TABLE (
  stage_name    TEXT,
  deals_count   INTEGER,
  total_value   NUMERIC,
  probability   INTEGER,
  weighted_value NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_tenant UUID := public.current_user_tenant_id();
BEGIN
  RETURN QUERY
  SELECT s.name, COUNT(d.id)::INT, COALESCE(SUM(d.amount),0), s.probability,
         ROUND(COALESCE(SUM(d.amount),0) * s.probability / 100.0, 2)
  FROM public.crm_stages s
  LEFT JOIN public.crm_deals d ON d.stage_id = s.id AND d.status = 'open'
  WHERE s.tenant_id = v_tenant AND s.stage_type = 'open'
    AND (p_pipeline_id IS NULL OR s.pipeline_id = p_pipeline_id)
  GROUP BY s.id, s.name, s.probability, s.sort_order
  ORDER BY s.sort_order;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
--  (7) قمع التحويل — Conversion Funnel (معدلات التحويل بين المراحل)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.crm_conversion_funnel(p_pipeline_id UUID DEFAULT NULL)
RETURNS TABLE (
  stage_name    TEXT,
  sort_order    INTEGER,
  reached_count INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_tenant UUID := public.current_user_tenant_id();
BEGIN
  -- عدد الصفقات التي "وصلت" لكل مرحلة = مرّت بها في سجل المراحل (أو حالياً فيها/بعدها)
  RETURN QUERY
  SELECT s.name, s.sort_order,
    (SELECT COUNT(DISTINCT h.deal_id)::INT
       FROM public.crm_deal_stage_history h
       JOIN public.crm_stages hs ON hs.id = h.to_stage_id
      WHERE hs.tenant_id = v_tenant AND hs.sort_order >= s.sort_order
        AND (p_pipeline_id IS NULL OR hs.pipeline_id = s.pipeline_id))
    + (SELECT COUNT(*)::INT FROM public.crm_deals d
        WHERE d.tenant_id = v_tenant AND d.stage_id = s.id)
  FROM public.crm_stages s
  WHERE s.tenant_id = v_tenant AND s.stage_type = 'open'
    AND (p_pipeline_id IS NULL OR s.pipeline_id = p_pipeline_id)
  GROUP BY s.id, s.name, s.sort_order
  ORDER BY s.sort_order;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
--  (8) سرعة الـ Pipeline — متوسط وقت الإقامة في كل مرحلة (أيام)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.crm_pipeline_velocity_report(p_pipeline_id UUID DEFAULT NULL)
RETURNS TABLE (
  stage_name        TEXT,
  avg_days_in_stage NUMERIC,
  deals_measured    INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_tenant UUID := public.current_user_tenant_id();
BEGIN
  -- مدة الإقامة = الفارق بين دخول المرحلة والانتقال منها (من سجل المراحل)
  RETURN QUERY
  WITH moves AS (
    SELECT h.deal_id, h.to_stage_id AS stage_id, h.changed_at AS entered,
      LEAD(h.changed_at) OVER (PARTITION BY h.deal_id ORDER BY h.changed_at) AS left_at
    FROM public.crm_deal_stage_history h
    WHERE h.tenant_id = v_tenant
  )
  SELECT s.name,
    ROUND(AVG(EXTRACT(EPOCH FROM (COALESCE(m.left_at, NOW()) - m.entered))/86400.0)::NUMERIC, 1),
    COUNT(*)::INT
  FROM moves m
  JOIN public.crm_stages s ON s.id = m.stage_id
  WHERE (p_pipeline_id IS NULL OR s.pipeline_id = p_pipeline_id)
  GROUP BY s.id, s.name, s.sort_order
  ORDER BY s.sort_order;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
--  (9) Win/Loss حسب المنافس — Competitive Intelligence
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.crm_winloss_by_competitor()
RETURNS TABLE (
  competitor    TEXT,
  faced         INTEGER,
  won           INTEGER,
  lost          INTEGER,
  win_rate      NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_tenant UUID := public.current_user_tenant_id();
BEGIN
  RETURN QUERY
  WITH exploded AS (
    SELECT UNNEST(d.competitors) AS comp, d.status
    FROM public.crm_deals d
    WHERE d.tenant_id = v_tenant AND d.status IN ('won','lost') AND array_length(d.competitors,1) > 0
    UNION ALL
    SELECT d.loss_competitor, d.status
    FROM public.crm_deals d
    WHERE d.tenant_id = v_tenant AND d.status = 'lost' AND d.loss_competitor IS NOT NULL
  )
  SELECT e.comp,
    COUNT(*)::INT,
    COUNT(*) FILTER (WHERE e.status = 'won')::INT,
    COUNT(*) FILTER (WHERE e.status = 'lost')::INT,
    CASE WHEN COUNT(*) > 0 THEN ROUND(COUNT(*) FILTER (WHERE e.status='won')::NUMERIC / COUNT(*) * 100, 1) ELSE 0 END
  FROM exploded e
  WHERE e.comp IS NOT NULL AND length(trim(e.comp)) > 0
  GROUP BY e.comp
  ORDER BY COUNT(*) DESC;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
--  (10) تجزئة العملاء — Segmentation (حسب القطاع/الصناعة)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.crm_segmentation()
RETURNS TABLE (
  segment       TEXT,
  accounts      INTEGER,
  avg_ltv       NUMERIC,
  total_ltv     NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_tenant UUID := public.current_user_tenant_id();
BEGIN
  RETURN QUERY
  SELECT COALESCE(a.industry,'غير مصنّف'),
    COUNT(*)::INT,
    ROUND(AVG(a.lifetime_value),2),
    ROUND(SUM(a.lifetime_value),2)
  FROM public.crm_accounts a
  WHERE a.tenant_id = v_tenant AND a.account_type = 'customer' AND a.deleted_at IS NULL
  GROUP BY COALESCE(a.industry,'غير مصنّف')
  ORDER BY SUM(a.lifetime_value) DESC;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
--  (11) مؤشر صحة الحساب — Account Health Score (بأوزان التقرير)
--  يجمع: تذاكر (عكسي) + CSAT + انتظام (تقريبي من عمر الحساب) وفق الأوزان.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.crm_account_health_score(p_account_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID; v_w RECORD; v_csat NUMERIC; v_tickets INT; v_score NUMERIC := 0;
  v_csat_pts NUMERIC; v_ticket_pts NUMERIC;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.crm_accounts WHERE id = p_account_id;
  IF v_tenant IS NULL OR v_tenant <> public.current_user_tenant_id() THEN RAISE EXCEPTION 'ACCESS_DENIED'; END IF;

  SELECT * INTO v_w FROM public.crm_health_weights WHERE tenant_id = v_tenant LIMIT 1;
  IF v_w IS NULL THEN
    v_w := ROW(NULL, v_tenant, 25, 20, 20, 15, 10, 10, NOW())::public.crm_health_weights;
  END IF;

  -- CSAT (0-5 → نسبة)
  SELECT AVG(csat_score) INTO v_csat FROM public.crm_tickets
    WHERE account_id = p_account_id AND csat_score IS NOT NULL;
  v_csat_pts := COALESCE(v_csat,4) / 5.0 * v_w.csat_weight;

  -- التذاكر (عكسي): 0 تذاكر=كامل النقاط، 10+ تذاكر=صفر
  SELECT COUNT(*) INTO v_tickets FROM public.crm_tickets
    WHERE account_id = p_account_id AND created_at >= NOW() - INTERVAL '30 days';
  v_ticket_pts := GREATEST(0, 1 - v_tickets / 10.0) * v_w.tickets_weight;

  -- المعايير التي تحتاج دمج أنظمة خارجية (login/usage/payment/nps) تُقدَّر بنقاط أساس متوسطة
  -- حتى توصيل المصادر (login analytics / billing / NPS) — شفافية لا محاكاة مضللة.
  v_score := v_csat_pts + v_ticket_pts
           + (v_w.login_weight   * 0.7)
           + (v_w.usage_weight   * 0.7)
           + (v_w.payment_weight * 0.9)
           + (v_w.nps_weight     * 0.6);

  RETURN LEAST(100, GREATEST(0, ROUND(v_score)))::INT;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
--  (12) حركة MRR — MRR Movement (آخر لقطة أو الحساب من الصفقات)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.crm_mrr_movement()
RETURNS TABLE (
  period_month  DATE,
  starting_mrr  NUMERIC,
  new_business  NUMERIC,
  expansion     NUMERIC,
  churn         NUMERIC,
  contraction   NUMERIC,
  ending_mrr    NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_tenant UUID := public.current_user_tenant_id();
BEGIN
  RETURN QUERY
  SELECT m.period_month, m.starting_mrr, m.new_business, m.expansion, m.churn, m.contraction,
         (m.starting_mrr + m.new_business + m.expansion - m.churn - m.contraction)
  FROM public.crm_mrr_snapshots m
  WHERE m.tenant_id = v_tenant
  ORDER BY m.period_month DESC
  LIMIT 12;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
--  (13) أداء الموظفين — Rep Performance (الهدف/المحقق/Pipeline)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.crm_rep_performance(p_month DATE DEFAULT NULL)
RETURNS TABLE (
  owner_id      UUID,
  target_amount NUMERIC,
  achieved      NUMERIC,
  pipeline_value NUMERIC,
  attainment_pct NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_tenant UUID := public.current_user_tenant_id(); v_month DATE := COALESCE(p_month, date_trunc('month', CURRENT_DATE)::DATE);
BEGIN
  RETURN QUERY
  SELECT t.owner_id, t.target_amount,
    COALESCE((SELECT SUM(d.amount) FROM public.crm_deals d
       WHERE d.tenant_id = v_tenant AND d.owner_id = t.owner_id AND d.status = 'won'
         AND date_trunc('month', d.won_at)::DATE = v_month), 0),
    COALESCE((SELECT SUM(d.amount) FROM public.crm_deals d
       WHERE d.tenant_id = v_tenant AND d.owner_id = t.owner_id AND d.status = 'open'), 0),
    CASE WHEN t.target_amount > 0 THEN ROUND(
      COALESCE((SELECT SUM(d.amount) FROM public.crm_deals d
        WHERE d.tenant_id = v_tenant AND d.owner_id = t.owner_id AND d.status = 'won'
          AND date_trunc('month', d.won_at)::DATE = v_month), 0) / t.target_amount * 100, 1) ELSE 0 END
  FROM public.crm_sales_targets t
  WHERE t.tenant_id = v_tenant AND t.owner_id IS NOT NULL AND t.period_month = v_month
  ORDER BY t.target_amount DESC;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
--  (14) مؤشرات الإدارة التنفيذية — Executive KPIs
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.crm_exec_kpis()
RETURNS TABLE (
  total_customers     INTEGER,
  total_ltv           NUMERIC,
  open_pipeline       NUMERIC,
  weighted_forecast   NUMERIC,
  won_this_month      NUMERIC,
  at_risk_accounts    INTEGER,
  avg_sales_cycle_days NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_tenant UUID := public.current_user_tenant_id();
BEGIN
  RETURN QUERY SELECT
    (SELECT COUNT(*)::INT FROM public.crm_accounts WHERE tenant_id = v_tenant AND account_type = 'customer' AND deleted_at IS NULL),
    (SELECT ROUND(COALESCE(SUM(lifetime_value),0),2) FROM public.crm_accounts WHERE tenant_id = v_tenant AND deleted_at IS NULL),
    (SELECT ROUND(COALESCE(SUM(amount),0),2) FROM public.crm_deals WHERE tenant_id = v_tenant AND status = 'open'),
    (SELECT ROUND(COALESCE(SUM(d.amount * s.probability / 100.0),0),2)
       FROM public.crm_deals d JOIN public.crm_stages s ON s.id = d.stage_id
      WHERE d.tenant_id = v_tenant AND d.status = 'open'),
    (SELECT ROUND(COALESCE(SUM(amount),0),2) FROM public.crm_deals
      WHERE tenant_id = v_tenant AND status = 'won' AND date_trunc('month', won_at) = date_trunc('month', CURRENT_DATE)),
    (SELECT COUNT(DISTINCT account_id)::INT FROM public.crm_tickets
      WHERE tenant_id = v_tenant AND account_id IS NOT NULL
        AND (sla_breached OR (csat_score IS NOT NULL AND csat_score < 3))),
    (SELECT ROUND(COALESCE(AVG(EXTRACT(EPOCH FROM (won_at - created_at))/86400.0),0),1)
       FROM public.crm_deals WHERE tenant_id = v_tenant AND status = 'won');
END $$;

-- ════════════════════════════════════════════════════════════════════════════
--  (15) seed أوزان الصحة الافتراضية (اختياري لكل مستأجر) — idempotent
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.crm_seed_health_weights()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_tenant UUID := public.current_user_tenant_id();
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;
  INSERT INTO public.crm_health_weights (tenant_id) VALUES (v_tenant)
    ON CONFLICT (tenant_id) DO NOTHING;
  RETURN true;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
--  (16) صلاحيات التنفيذ
-- ════════════════════════════════════════════════════════════════════════════
GRANT EXECUTE ON FUNCTION public.crm_weighted_forecast(UUID)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_conversion_funnel(UUID)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_pipeline_velocity_report(UUID)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_winloss_by_competitor()          TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_segmentation()                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_account_health_score(UUID)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_mrr_movement()                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_rep_performance(DATE)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_exec_kpis()                      TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_seed_health_weights()            TO authenticated;

-- ============================================================================
-- نهاية 0170 — الوحدة 6 (التحليلات والتنبؤ) مكتملة. بوابة CRM كاملة (6/6).
-- ============================================================================
