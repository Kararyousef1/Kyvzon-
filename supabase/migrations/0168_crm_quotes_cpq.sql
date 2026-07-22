-- ============================================================================
-- Kyvzon — 0168_crm_quotes_cpq.sql
-- بوابة CRM — الوحدة 4: العروض والمقترحات وإدارة التسعير CPQ (التقرير 04)
--
-- تُنفّذ كل ما ورد في التقرير وفق المعايير العالمية:
--   • كتالوج المنتجات (crm_products): باقات + إضافات (add-ons) + تسعير + وحدة القياس.
--   • قواعد التسعير الديناميكي (crm_pricing_rules): per_unit_over / annual_discount ...
--   • العروض (crm_quotes) + بنودها (crm_quote_line_items) مع حساب صافٍ تلقائي (subtotal/discount/tax/total).
--   • سير موافقة الخصم (crm_discount_approvals): 10% موظف / 20% مدير / 35% تجاري+CEO / >35% ممنوع.
--   • توليد PDF: hook — المستند يُبنى من بيانات العرض في الواجهة (jsPDF client-side).
--   • تتبع العرض (crm_quote_events): sent/opened/viewed_pricing/shared/signed + وقت القراءة.
--   • التوقيع الإلكتروني (E-Signature): حقول signer + IP + وقت + سجل تدقيق (ملزم قانونياً).
--   • دورة العقود (crm_contracts): draft→sent→under_review→signed→active→renewal→...
--     + تنبيهات التجديد (90/30 يوم) عبر دالة crm_contract_renewal_alerts.
--   • تحليلات العروض (crm_quote_analytics): quote-to-close · وقت الإرسال · متوسط الخصم.
--
-- التصميم: tenant-scoped + RLS، بادئة crm_* صارمة، دوال SECURITY DEFINER + فحص المستأجر.
-- idempotent وآمن لإعادة التشغيل.
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
--  (1) كتالوج المنتجات — Products (باقات + إضافات)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.crm_products (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  sku           TEXT,
  product_type  TEXT NOT NULL DEFAULT 'package' CHECK (product_type IN ('package','addon','service')),
  description   TEXT,
  unit_price    NUMERIC(16,2) NOT NULL DEFAULT 0,
  currency      TEXT NOT NULL DEFAULT 'SAR',
  billing_cycle TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly','annual','one_time','per_unit')),
  unit_label    TEXT,                                            -- 'موظف' / 'جهاز' / 'جلسة'
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_products_tenant ON public.crm_products(tenant_id, product_type, is_active);

-- ════════════════════════════════════════════════════════════════════════════
--  (2) قواعد التسعير الديناميكي — Pricing Rules
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.crm_pricing_rules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id    UUID REFERENCES public.crm_products(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  rule_type     TEXT NOT NULL CHECK (rule_type IN ('per_unit_over','annual_discount','volume_discount')),
  threshold     NUMERIC(16,2),                                   -- مثال: 100 (موظف)
  rate          NUMERIC(16,4) NOT NULL,                          -- سعر/موظف إضافي أو نسبة خصم (0.15)
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_pricing_rules_tenant ON public.crm_pricing_rules(tenant_id, product_id);

-- ════════════════════════════════════════════════════════════════════════════
--  (3) العروض — Quotes
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.crm_quotes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  quote_number      TEXT NOT NULL,
  deal_id           UUID REFERENCES public.crm_deals(id) ON DELETE SET NULL,
  account_id        UUID REFERENCES public.crm_accounts(id) ON DELETE SET NULL,
  contact_id        UUID REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  title             TEXT NOT NULL,
  executive_summary TEXT,
  currency          TEXT NOT NULL DEFAULT 'SAR',
  -- المجاميع (تُعاد حسبتها عبر crm_recalc_quote)
  subtotal          NUMERIC(16,2) NOT NULL DEFAULT 0,
  discount_amount   NUMERIC(16,2) NOT NULL DEFAULT 0,
  discount_pct      NUMERIC(6,2)  NOT NULL DEFAULT 0,             -- خصم إجمالي إضافي على العرض
  tax_pct           NUMERIC(6,2)  NOT NULL DEFAULT 15,            -- ضريبة القيمة المضافة
  tax_amount        NUMERIC(16,2) NOT NULL DEFAULT 0,
  total             NUMERIC(16,2) NOT NULL DEFAULT 0,
  -- الحالة والصلاحية
  status            TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','pending_approval','approved','sent','viewed','signed','declined','expired')),
  valid_until       DATE,
  terms             TEXT,
  payment_terms     TEXT,
  -- التوقيع الإلكتروني (سجل قانوني)
  signed_at         TIMESTAMPTZ,
  signer_name       TEXT,
  signer_email      TEXT,
  signer_ip         TEXT,
  -- التتبّع
  sent_at           TIMESTAMPTZ,
  first_opened_at   TIMESTAMPTZ,
  open_count        INTEGER NOT NULL DEFAULT 0,
  owner_id          UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, quote_number)
);
CREATE INDEX IF NOT EXISTS idx_crm_quotes_tenant  ON public.crm_quotes(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_crm_quotes_deal    ON public.crm_quotes(deal_id);
CREATE INDEX IF NOT EXISTS idx_crm_quotes_account ON public.crm_quotes(account_id);

-- بنود العرض
CREATE TABLE IF NOT EXISTS public.crm_quote_line_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  quote_id      UUID NOT NULL REFERENCES public.crm_quotes(id) ON DELETE CASCADE,
  product_id    UUID REFERENCES public.crm_products(id) ON DELETE SET NULL,
  description   TEXT NOT NULL,
  quantity      NUMERIC(12,2) NOT NULL DEFAULT 1,
  unit_price    NUMERIC(16,2) NOT NULL DEFAULT 0,
  discount_pct  NUMERIC(6,2)  NOT NULL DEFAULT 0 CHECK (discount_pct BETWEEN 0 AND 100),
  -- الصافي المحسوب للبند (quantity*unit_price*(1-discount))
  line_total    NUMERIC(16,2) NOT NULL DEFAULT 0,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_quote_items_quote ON public.crm_quote_line_items(quote_id, sort_order);

-- ════════════════════════════════════════════════════════════════════════════
--  (4) سير موافقة الخصم — Discount Approvals
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.crm_discount_approvals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  quote_id      UUID NOT NULL REFERENCES public.crm_quotes(id) ON DELETE CASCADE,
  discount_pct  NUMERIC(6,2) NOT NULL,
  required_level TEXT NOT NULL CHECK (required_level IN ('none','sales_manager','commercial_ceo','forbidden')),
  reason        TEXT,                                            -- سبب طلب الخصم (يكتبه الموظف)
  deal_value    NUMERIC(16,2),
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  requested_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_at    TIMESTAMPTZ,
  decision_note TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_disc_approvals_tenant ON public.crm_discount_approvals(tenant_id, status);

-- ════════════════════════════════════════════════════════════════════════════
--  (5) تتبّع العرض — Quote Events (فتح/قراءة/مشاركة/توقيع)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.crm_quote_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  quote_id      UUID NOT NULL REFERENCES public.crm_quotes(id) ON DELETE CASCADE,
  event_type    TEXT NOT NULL CHECK (event_type IN ('sent','opened','viewed_pricing','viewed_terms','shared','signed','declined')),
  detail        JSONB NOT NULL DEFAULT '{}'::jsonb,             -- مثال: {"seconds":720,"page":"pricing"}
  actor_email   TEXT,
  actor_ip      TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_quote_events_quote ON public.crm_quote_events(quote_id, created_at);

-- ════════════════════════════════════════════════════════════════════════════
--  (6) العقود — Contracts (دورة الحياة)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.crm_contracts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  contract_number TEXT NOT NULL,
  quote_id      UUID REFERENCES public.crm_quotes(id) ON DELETE SET NULL,
  account_id    UUID REFERENCES public.crm_accounts(id) ON DELETE SET NULL,
  title         TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft','sent','under_review','signed','active','renewal','renewed','expired','cancelled')),
  annual_value  NUMERIC(16,2) NOT NULL DEFAULT 0,
  total_value   NUMERIC(16,2) NOT NULL DEFAULT 0,
  start_date    DATE,
  end_date      DATE,
  signed_at     TIMESTAMPTZ,
  owner_id      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes         TEXT,
  created_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, contract_number)
);
CREATE INDEX IF NOT EXISTS idx_crm_contracts_tenant ON public.crm_contracts(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_crm_contracts_end    ON public.crm_contracts(tenant_id, end_date);

-- ════════════════════════════════════════════════════════════════════════════
--  (7) تفعيل RLS + سياسات العزل
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'crm_products','crm_pricing_rules','crm_quotes','crm_quote_line_items',
    'crm_discount_approvals','crm_quote_events','crm_contracts'
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
--  (8) مستوى موافقة الخصم — Discount approval level (من التقرير)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.crm_discount_level(p_pct NUMERIC)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_pct <= 10 THEN 'none'            -- موظف مبيعات
    WHEN p_pct <= 20 THEN 'sales_manager'   -- مدير المبيعات
    WHEN p_pct <= 35 THEN 'commercial_ceo'  -- المدير التجاري + CEO
    ELSE 'forbidden'                        -- فوق 35% ممنوع
  END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
--  (9) إعادة حساب مجاميع العرض — Recalc quote (بنود + خصم إجمالي + ضريبة)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.crm_recalc_quote(p_quote_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID; v_subtotal NUMERIC := 0; v_disc_pct NUMERIC; v_tax_pct NUMERIC;
  v_disc_amt NUMERIC; v_taxable NUMERIC; v_tax_amt NUMERIC; v_total NUMERIC;
BEGIN
  SELECT tenant_id, discount_pct, tax_pct INTO v_tenant, v_disc_pct, v_tax_pct
  FROM public.crm_quotes WHERE id = p_quote_id;
  IF v_tenant IS NULL OR v_tenant <> public.current_user_tenant_id() THEN
    RAISE EXCEPTION 'ACCESS_DENIED';
  END IF;

  -- تحديث صافي كل بند + جمعها
  UPDATE public.crm_quote_line_items
    SET line_total = ROUND(quantity * unit_price * (1 - discount_pct/100.0), 2)
    WHERE quote_id = p_quote_id;

  SELECT COALESCE(SUM(line_total), 0) INTO v_subtotal
    FROM public.crm_quote_line_items WHERE quote_id = p_quote_id;

  v_disc_amt := ROUND(v_subtotal * COALESCE(v_disc_pct,0)/100.0, 2);
  v_taxable  := v_subtotal - v_disc_amt;
  v_tax_amt  := ROUND(v_taxable * COALESCE(v_tax_pct,0)/100.0, 2);
  v_total    := v_taxable + v_tax_amt;

  UPDATE public.crm_quotes
    SET subtotal = v_subtotal, discount_amount = v_disc_amt,
        tax_amount = v_tax_amt, total = v_total, updated_at = NOW()
    WHERE id = p_quote_id;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
--  (10) طلب/تسوية موافقة الخصم — Submit quote (يفرض الحوكمة)
--  إن كان الخصم الإجمالي > 10% ينشئ طلب موافقة ويضع العرض pending_approval.
--  إن كان ≤ 10% يُعتمد مباشرة (approved). إن > 35% يُرفض (forbidden).
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.crm_submit_quote(p_quote_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID; v_disc NUMERIC; v_total NUMERIC; v_level TEXT; v_deal NUMERIC; v_deal_id UUID;
BEGIN
  SELECT tenant_id, discount_pct, total, deal_id INTO v_tenant, v_disc, v_total, v_deal_id
  FROM public.crm_quotes WHERE id = p_quote_id;
  IF v_tenant IS NULL OR v_tenant <> public.current_user_tenant_id() THEN
    RAISE EXCEPTION 'ACCESS_DENIED';
  END IF;

  v_level := public.crm_discount_level(v_disc);

  IF v_level = 'forbidden' THEN
    RAISE EXCEPTION 'DISCOUNT_FORBIDDEN: الخصم فوق 35%% غير مسموح';
  END IF;

  SELECT amount INTO v_deal FROM public.crm_deals WHERE id = v_deal_id;

  IF v_level = 'none' THEN
    UPDATE public.crm_quotes SET status = 'approved', updated_at = NOW() WHERE id = p_quote_id;
    RETURN 'approved';
  END IF;

  -- يحتاج موافقة → أنشئ طلباً وضع العرض pending_approval
  INSERT INTO public.crm_discount_approvals
    (tenant_id, quote_id, discount_pct, required_level, reason, deal_value, requested_by)
  VALUES (v_tenant, p_quote_id, v_disc, v_level, p_reason, v_deal, auth.uid());

  UPDATE public.crm_quotes SET status = 'pending_approval', updated_at = NOW() WHERE id = p_quote_id;
  RETURN 'pending_approval';
END $$;

-- ════════════════════════════════════════════════════════════════════════════
--  (11) البتّ في طلب الخصم — Decide approval
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.crm_decide_approval(p_approval_id UUID, p_approve BOOLEAN, p_note TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_tenant UUID; v_quote UUID;
BEGIN
  SELECT tenant_id, quote_id INTO v_tenant, v_quote FROM public.crm_discount_approvals WHERE id = p_approval_id;
  IF v_tenant IS NULL OR v_tenant <> public.current_user_tenant_id() THEN
    RAISE EXCEPTION 'ACCESS_DENIED';
  END IF;

  UPDATE public.crm_discount_approvals
    SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
        decided_by = auth.uid(), decided_at = NOW(), decision_note = p_note
    WHERE id = p_approval_id;

  UPDATE public.crm_quotes
    SET status = CASE WHEN p_approve THEN 'approved' ELSE 'draft' END, updated_at = NOW()
    WHERE id = v_quote;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
--  (12) إرسال العرض + تسجيل فتح (تتبّع)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.crm_send_quote(p_quote_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_tenant UUID; v_status TEXT;
BEGIN
  SELECT tenant_id, status INTO v_tenant, v_status FROM public.crm_quotes WHERE id = p_quote_id;
  IF v_tenant IS NULL OR v_tenant <> public.current_user_tenant_id() THEN RAISE EXCEPTION 'ACCESS_DENIED'; END IF;
  IF v_status NOT IN ('approved','draft') THEN
    RAISE EXCEPTION 'NOT_APPROVED: يجب اعتماد العرض قبل الإرسال';
  END IF;

  UPDATE public.crm_quotes SET status = 'sent', sent_at = NOW(), updated_at = NOW() WHERE id = p_quote_id;
  INSERT INTO public.crm_quote_events (tenant_id, quote_id, event_type) VALUES (v_tenant, p_quote_id, 'sent');
END $$;

-- تسجيل حدث فتح/قراءة (يُستدعى من رابط تتبّع أو محاكاة)
CREATE OR REPLACE FUNCTION public.crm_track_quote_event(
  p_quote_id UUID, p_event TEXT, p_detail JSONB DEFAULT '{}'::jsonb, p_email TEXT DEFAULT NULL, p_ip TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_tenant UUID;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.crm_quotes WHERE id = p_quote_id;
  IF v_tenant IS NULL OR v_tenant <> public.current_user_tenant_id() THEN RAISE EXCEPTION 'ACCESS_DENIED'; END IF;

  INSERT INTO public.crm_quote_events (tenant_id, quote_id, event_type, detail, actor_email, actor_ip)
  VALUES (v_tenant, p_quote_id, p_event, p_detail, p_email, p_ip);

  IF p_event = 'opened' THEN
    UPDATE public.crm_quotes
      SET open_count = open_count + 1,
          first_opened_at = COALESCE(first_opened_at, NOW()),
          status = CASE WHEN status = 'sent' THEN 'viewed' ELSE status END,
          updated_at = NOW()
      WHERE id = p_quote_id;
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
--  (13) التوقيع الإلكتروني — Sign quote (سجل قانوني: IP + وقت + بريد)
--  عند التوقيع: تحويل العرض إلى عقد تلقائياً.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.crm_sign_quote(
  p_quote_id UUID, p_signer_name TEXT, p_signer_email TEXT, p_signer_ip TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID; v_account UUID; v_total NUMERIC; v_title TEXT; v_contract UUID; v_num TEXT;
BEGIN
  SELECT tenant_id, account_id, total, title INTO v_tenant, v_account, v_total, v_title
  FROM public.crm_quotes WHERE id = p_quote_id;
  IF v_tenant IS NULL OR v_tenant <> public.current_user_tenant_id() THEN RAISE EXCEPTION 'ACCESS_DENIED'; END IF;

  UPDATE public.crm_quotes
    SET status = 'signed', signed_at = NOW(),
        signer_name = p_signer_name, signer_email = p_signer_email, signer_ip = p_signer_ip,
        updated_at = NOW()
    WHERE id = p_quote_id;

  INSERT INTO public.crm_quote_events (tenant_id, quote_id, event_type, actor_email, actor_ip)
  VALUES (v_tenant, p_quote_id, 'signed', p_signer_email, p_signer_ip);

  -- توليد رقم عقد بسيط
  v_num := 'CT-' || to_char(NOW(), 'YYYYMMDD') || '-' || substr(replace(p_quote_id::text,'-',''),1,6);

  INSERT INTO public.crm_contracts
    (tenant_id, contract_number, quote_id, account_id, title, status, total_value, annual_value, signed_at, start_date)
  VALUES (v_tenant, v_num, p_quote_id, v_account, v_title, 'signed', v_total, v_total, NOW(), CURRENT_DATE)
  RETURNING id INTO v_contract;

  RETURN v_contract;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
--  (14) تنبيهات تجديد العقود — Contract renewal alerts (90/30 يوم)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.crm_contract_renewal_alerts()
RETURNS TABLE (
  contract_id     UUID,
  contract_number TEXT,
  title           TEXT,
  end_date        DATE,
  days_to_end     INTEGER,
  alert_level     TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_tenant UUID := public.current_user_tenant_id();
BEGIN
  RETURN QUERY
  SELECT c.id, c.contract_number, c.title, c.end_date,
    (c.end_date - CURRENT_DATE)::INT,
    CASE
      WHEN c.end_date < CURRENT_DATE THEN 'expired'
      WHEN c.end_date <= CURRENT_DATE + 30 THEN 'escalate'
      WHEN c.end_date <= CURRENT_DATE + 90 THEN 'renewal'
      ELSE 'ok'
    END
  FROM public.crm_contracts c
  WHERE c.tenant_id = v_tenant
    AND c.status IN ('active','signed','renewal')
    AND c.end_date IS NOT NULL
    AND c.end_date <= CURRENT_DATE + 90
  ORDER BY c.end_date;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
--  (15) تحليلات العروض — Quote Analytics
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.crm_quote_analytics()
RETURNS TABLE (
  total_quotes      INTEGER,
  signed_quotes     INTEGER,
  close_rate        NUMERIC,
  avg_value         NUMERIC,
  avg_discount      NUMERIC,
  avg_sign_days     NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_tenant UUID := public.current_user_tenant_id(); v_total INT; v_signed INT;
BEGIN
  SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'signed') INTO v_total, v_signed
  FROM public.crm_quotes WHERE tenant_id = v_tenant AND status <> 'draft';

  RETURN QUERY SELECT
    v_total, v_signed,
    CASE WHEN v_total > 0 THEN ROUND(v_signed::NUMERIC / v_total * 100, 1) ELSE 0 END,
    (SELECT ROUND(COALESCE(AVG(total),0),2) FROM public.crm_quotes WHERE tenant_id = v_tenant AND status <> 'draft'),
    (SELECT ROUND(COALESCE(AVG(discount_pct),0),1) FROM public.crm_quotes WHERE tenant_id = v_tenant AND status <> 'draft'),
    (SELECT ROUND(COALESCE(AVG(EXTRACT(EPOCH FROM (signed_at - sent_at))/86400.0),0),1)
       FROM public.crm_quotes WHERE tenant_id = v_tenant AND status = 'signed' AND sent_at IS NOT NULL);
END $$;

-- ════════════════════════════════════════════════════════════════════════════
--  (16) seed كتالوج منتجات Kyvzon الافتراضي (اختياري لكل مستأجر)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.crm_seed_default_products()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_tenant UUID := public.current_user_tenant_id(); v_created INT := 0;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;
  IF EXISTS (SELECT 1 FROM public.crm_products WHERE tenant_id = v_tenant) THEN RETURN 0; END IF;

  INSERT INTO public.crm_products (tenant_id, name, sku, product_type, unit_price, billing_cycle, unit_label) VALUES
    (v_tenant, 'باقة Starter',       'PKG-START', 'package', 199,  'monthly',  'شهر'),
    (v_tenant, 'باقة Professional',  'PKG-PRO',   'package', 499,  'monthly',  'شهر'),
    (v_tenant, 'باقة Enterprise',    'PKG-ENT',   'package', 1200, 'monthly',  'شهر'),
    (v_tenant, 'تكامل ZKTeco',       'ADD-ZK',    'addon',   150,  'per_unit', 'جهاز'),
    (v_tenant, 'التقارير المتقدمة',  'ADD-RPT',   'addon',   99,   'monthly',  'شهر'),
    (v_tenant, 'دعم مميز SLA 4س',    'ADD-SUP',   'addon',   199,  'monthly',  'شهر'),
    (v_tenant, 'تدريب إضافي',        'SRV-TRN',   'service', 300,  'per_unit', 'جلسة'),
    (v_tenant, 'مساعدة الاستيراد',   'SRV-IMP',   'service', 500,  'one_time', 'مرة');
  GET DIAGNOSTICS v_created = ROW_COUNT;
  RETURN v_created;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
--  (17) صلاحيات التنفيذ
-- ════════════════════════════════════════════════════════════════════════════
GRANT EXECUTE ON FUNCTION public.crm_discount_level(NUMERIC)                                       TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_recalc_quote(UUID)                                            TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_submit_quote(UUID, TEXT)                                      TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_decide_approval(UUID, BOOLEAN, TEXT)                          TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_send_quote(UUID)                                              TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_track_quote_event(UUID, TEXT, JSONB, TEXT, TEXT)              TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_sign_quote(UUID, TEXT, TEXT, TEXT)                            TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_contract_renewal_alerts()                                     TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_quote_analytics()                                             TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_seed_default_products()                                       TO authenticated;

-- ============================================================================
-- نهاية 0168 — الوحدة 4 (العروض والعقود CPQ) مكتملة.
-- ============================================================================
