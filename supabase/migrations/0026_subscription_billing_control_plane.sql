-- ============================================================================
--  FILE: 0026_subscription_billing_control_plane.sql
--  PURPOSE: Mature SaaS subscription/billing contract for Kyvzon Developer Portal
--  DEPENDS ON: 0003_hr_platform_modules.sql (tenant_subscriptions),
--              0001_core_schema.sql (tenants)
--  SAFETY LEVEL: HIGH — additive, idempotent, tenant-scoped
-- ============================================================================
--
--  Adds commercial fields required by the SaaS Control Plane:
--    billing cycle, payment status, due/paid dates, invoice/contract refs,
--    payment provider, auto renew, plan limits, billing contact, metadata.
-- ============================================================================

ALTER TABLE IF EXISTS public.tenant_subscriptions
  ADD COLUMN IF NOT EXISTS billing_cycle TEXT NOT NULL DEFAULT 'monthly'
    CHECK (billing_cycle IN ('monthly','quarterly','semi_annual','annual','one_time','custom')),
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid','pending','paid','overdue','failed','refunded','cancelled')),
  ADD COLUMN IF NOT EXISTS payment_due_date DATE,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS base_amount NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_amount NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS invoice_number TEXT,
  ADD COLUMN IF NOT EXISTS contract_number TEXT,
  ADD COLUMN IF NOT EXISTS sales_owner TEXT,
  ADD COLUMN IF NOT EXISTS gateway_provider TEXT,
  ADD COLUMN IF NOT EXISTS billing_contact_name TEXT,
  ADD COLUMN IF NOT EXISTS billing_email TEXT,
  ADD COLUMN IF NOT EXISTS billing_phone TEXT,
  ADD COLUMN IF NOT EXISTS auto_renew BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS grace_period_days INTEGER NOT NULL DEFAULT 7 CHECK (grace_period_days >= 0),
  ADD COLUMN IF NOT EXISTS max_branches INTEGER,
  ADD COLUMN IF NOT EXISTS max_biometric_devices INTEGER,
  ADD COLUMN IF NOT EXISTS storage_gb INTEGER,
  ADD COLUMN IF NOT EXISTS custom_limits JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE public.tenant_subscriptions
SET
  base_amount = COALESCE(base_amount, amount),
  total_amount = COALESCE(total_amount, amount, 0) + COALESCE(tax_amount, 0) - COALESCE(discount_amount, 0)
WHERE base_amount IS NULL OR total_amount IS NULL;

CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_billing_status
  ON public.tenant_subscriptions(tenant_id, payment_status, payment_due_date);

CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_invoice
  ON public.tenant_subscriptions(invoice_number)
  WHERE invoice_number IS NOT NULL;

DROP TRIGGER IF EXISTS trg_tenant_subscriptions_updated_at ON public.tenant_subscriptions;
CREATE TRIGGER trg_tenant_subscriptions_updated_at
  BEFORE UPDATE ON public.tenant_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DO $$
BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='tenant_subscriptions' AND column_name='payment_status'
  ), 'tenant_subscriptions.payment_status must exist';
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='tenant_subscriptions' AND column_name='billing_cycle'
  ), 'tenant_subscriptions.billing_cycle must exist';
END $$;
