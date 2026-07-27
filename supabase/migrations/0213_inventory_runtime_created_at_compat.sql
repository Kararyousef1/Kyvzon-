-- ============================================================================
-- 0213 — Inventory runtime compatibility: created_at columns for generic lists
-- سببها: بعض صفحات الواجهة العامة كانت ترتب بـ created_at، بينما هذه الجداول
-- صُممت بزمن تشغيلي متخصص. نضيف created_at كطبقة توافق آمنة ولا نغير المنطق.
-- ============================================================================

ALTER TABLE public.inventory_stock_balances
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
UPDATE public.inventory_stock_balances SET created_at = COALESCE(created_at, updated_at, NOW());

ALTER TABLE public.inventory_receiving_sessions
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
UPDATE public.inventory_receiving_sessions SET created_at = COALESCE(created_at, started_at, NOW());

ALTER TABLE public.inventory_receiving_scans
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
UPDATE public.inventory_receiving_scans SET created_at = COALESCE(created_at, scanned_at, NOW());

ALTER TABLE public.inventory_lpn_label_prints
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
UPDATE public.inventory_lpn_label_prints SET created_at = COALESCE(created_at, printed_at, NOW());

CREATE INDEX IF NOT EXISTS idx_inventory_stock_balances_created_at ON public.inventory_stock_balances(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_receiving_sessions_created_at ON public.inventory_receiving_sessions(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_receiving_scans_created_at ON public.inventory_receiving_scans(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_lpn_label_prints_created_at ON public.inventory_lpn_label_prints(tenant_id, created_at DESC);

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='inventory_stock_balances' AND column_name='created_at'
  ) THEN RAISE EXCEPTION '0213 failed: inventory_stock_balances.created_at missing'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='inventory_receiving_sessions' AND column_name='created_at'
  ) THEN RAISE EXCEPTION '0213 failed: inventory_receiving_sessions.created_at missing'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='inventory_receiving_scans' AND column_name='created_at'
  ) THEN RAISE EXCEPTION '0213 failed: inventory_receiving_scans.created_at missing'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='inventory_lpn_label_prints' AND column_name='created_at'
  ) THEN RAISE EXCEPTION '0213 failed: inventory_lpn_label_prints.created_at missing'; END IF;
  RAISE NOTICE '✅ 0213: Inventory runtime created_at compatibility applied';
END $$;
