-- Accounts Payable foundation. Invoice posting to GL will use approved posting
-- rules in the next stage; invoices remain draft/approved operational records.

CREATE TABLE IF NOT EXISTS public.vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  legal_entity_id UUID NOT NULL REFERENCES public.legal_entities(id) ON DELETE CASCADE,
  vendor_code TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  name_en TEXT,
  tax_number TEXT,
  registration_number TEXT,
  email TEXT,
  phone TEXT,
  payment_terms_days INTEGER NOT NULL DEFAULT 30 CHECK (payment_terms_days >= 0),
  currency_code CHAR(3) NOT NULL DEFAULT 'IQD' REFERENCES public.currencies(code),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (legal_entity_id, vendor_code)
);

ALTER TABLE public.accounts_payable
  ADD COLUMN IF NOT EXISTS legal_entity_id UUID REFERENCES public.legal_entities(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES public.vendors(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS invoice_date DATE,
  ADD COLUMN IF NOT EXISTS currency_code CHAR(3) REFERENCES public.currencies(code),
  ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(24,10) NOT NULL DEFAULT 1 CHECK (exchange_rate > 0),
  ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS posted_journal_entry_id UUID REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS notes TEXT;

UPDATE public.accounts_payable ap SET legal_entity_id = entity.id, currency_code = 'IQD', invoice_date = COALESCE(ap.created_at::DATE, CURRENT_DATE)
FROM public.legal_entities entity WHERE entity.tenant_id=ap.tenant_id AND entity.code='DEFAULT' AND ap.legal_entity_id IS NULL;
ALTER TABLE public.accounts_payable ALTER COLUMN legal_entity_id SET NOT NULL;
ALTER TABLE public.accounts_payable ALTER COLUMN currency_code SET NOT NULL;
ALTER TABLE public.accounts_payable ALTER COLUMN invoice_date SET NOT NULL;
ALTER TABLE public.accounts_payable DROP CONSTRAINT IF EXISTS accounts_payable_status_check;
ALTER TABLE public.accounts_payable ADD CONSTRAINT accounts_payable_status_check CHECK (status IN ('draft','submitted','approved','partially_paid','paid','overdue','voided'));
CREATE UNIQUE INDEX IF NOT EXISTS uq_ap_vendor_invoice ON public.accounts_payable(legal_entity_id, vendor_id, invoice_number) WHERE vendor_id IS NOT NULL;

ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts_payable ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS finance_vendors_access ON public.vendors;
DROP POLICY IF EXISTS finance_ap_access ON public.accounts_payable;
CREATE POLICY finance_vendors_access ON public.vendors FOR ALL TO authenticated USING (public.current_user_can_access_legal_entity(legal_entity_id)) WITH CHECK (public.current_user_can_manage_legal_entity(legal_entity_id));
CREATE POLICY finance_ap_access ON public.accounts_payable FOR ALL TO authenticated USING (public.current_user_can_access_legal_entity(legal_entity_id)) WITH CHECK (public.current_user_can_manage_legal_entity(legal_entity_id));
