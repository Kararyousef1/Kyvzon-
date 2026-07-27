-- ============================================================================
-- 0214 — Inventory UX Completion: numbering, barcode, and master-data helpers
-- الهدف: ترميز وباركود قابل للتخصيص لكل شركة مع توليد تلقائي مستمر أو إدخال يدوي.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.inventory_code_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN (
    'item','warehouse','zone','location','dock','lpn','asn','receiving_session','pick_order','shipment','package','rma','rtv','labor_task','analytics_report','generic'
  )),
  sequence_name TEXT NOT NULL,
  prefix TEXT NOT NULL DEFAULT 'INV',
  separator TEXT NOT NULL DEFAULT '-',
  padding INT NOT NULL DEFAULT 4 CHECK (padding BETWEEN 1 AND 12),
  next_number BIGINT NOT NULL DEFAULT 1 CHECK (next_number >= 1),
  suffix TEXT NOT NULL DEFAULT '',
  include_year BOOLEAN NOT NULL DEFAULT false,
  include_month BOOLEAN NOT NULL DEFAULT false,
  reset_policy TEXT NOT NULL DEFAULT 'never' CHECK (reset_policy IN ('never','yearly','monthly')),
  barcode_prefix TEXT,
  barcode_type TEXT NOT NULL DEFAULT 'code128' CHECK (barcode_type IN ('code128','qr','ean13','manual')),
  allow_manual_override BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, entity_type, prefix, suffix)
);

CREATE INDEX IF NOT EXISTS idx_inventory_code_sequences_default ON public.inventory_code_sequences(tenant_id, entity_type, is_default, is_active);

ALTER TABLE public.inventory_code_sequences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inventory_code_sequences_select ON public.inventory_code_sequences;
DROP POLICY IF EXISTS inventory_code_sequences_write ON public.inventory_code_sequences;
CREATE POLICY inventory_code_sequences_select ON public.inventory_code_sequences
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_user_tenant_id() AND public.current_user_role() IN ('inventory','manager','admin','developer','it_admin'));
CREATE POLICY inventory_code_sequences_write ON public.inventory_code_sequences
  FOR ALL TO authenticated
  USING (tenant_id = public.current_user_tenant_id() AND public.current_user_role() IN ('inventory','manager','admin','developer','it_admin'))
  WITH CHECK (tenant_id = public.current_user_tenant_id() AND public.current_user_role() IN ('inventory','manager','admin','developer','it_admin'));

CREATE OR REPLACE FUNCTION public.inventory_format_sequence_code(
  p_prefix TEXT,
  p_separator TEXT,
  p_padding INT,
  p_number BIGINT,
  p_suffix TEXT DEFAULT '',
  p_include_year BOOLEAN DEFAULT false,
  p_include_month BOOLEAN DEFAULT false
) RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_code TEXT;
  v_period TEXT := '';
BEGIN
  IF COALESCE(p_include_year,false) AND COALESCE(p_include_month,false) THEN
    v_period := to_char(CURRENT_DATE,'YYYYMM');
  ELSIF COALESCE(p_include_year,false) THEN
    v_period := to_char(CURRENT_DATE,'YYYY');
  ELSIF COALESCE(p_include_month,false) THEN
    v_period := to_char(CURRENT_DATE,'MM');
  END IF;

  v_code := COALESCE(NULLIF(p_prefix,''),'INV');
  IF v_period <> '' THEN v_code := v_code || COALESCE(p_separator,'-') || v_period; END IF;
  v_code := v_code || COALESCE(p_separator,'-') || LPAD(p_number::TEXT, COALESCE(p_padding,4), '0');
  IF COALESCE(p_suffix,'') <> '' THEN v_code := v_code || COALESCE(p_separator,'-') || p_suffix; END IF;
  RETURN v_code;
END $$;
GRANT EXECUTE ON FUNCTION public.inventory_format_sequence_code(TEXT,TEXT,INT,BIGINT,TEXT,BOOLEAN,BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_inventory_code_sequence(
  p_entity_type TEXT,
  p_sequence_name TEXT,
  p_prefix TEXT,
  p_separator TEXT DEFAULT '-',
  p_padding INT DEFAULT 4,
  p_next_number BIGINT DEFAULT 1,
  p_suffix TEXT DEFAULT '',
  p_include_year BOOLEAN DEFAULT false,
  p_include_month BOOLEAN DEFAULT false,
  p_barcode_prefix TEXT DEFAULT NULL,
  p_barcode_type TEXT DEFAULT 'code128',
  p_is_default BOOLEAN DEFAULT true
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','manager']::TEXT[]);
  IF p_entity_type NOT IN ('item','warehouse','zone','location','dock','lpn','asn','receiving_session','pick_order','shipment','package','rma','rtv','labor_task','analytics_report','generic') THEN
    RAISE EXCEPTION 'INVALID_SEQUENCE_ENTITY_TYPE';
  END IF;
  IF COALESCE(p_prefix,'') = '' THEN RAISE EXCEPTION 'PREFIX_REQUIRED'; END IF;
  IF p_is_default THEN
    UPDATE public.inventory_code_sequences SET is_default=false, updated_at=NOW() WHERE tenant_id=v_tenant AND entity_type=p_entity_type;
  END IF;
  INSERT INTO public.inventory_code_sequences(tenant_id,entity_type,sequence_name,prefix,separator,padding,next_number,suffix,include_year,include_month,barcode_prefix,barcode_type,is_default,created_by)
  VALUES(v_tenant,p_entity_type,COALESCE(p_sequence_name,p_entity_type||' sequence'),p_prefix,COALESCE(p_separator,'-'),COALESCE(p_padding,4),GREATEST(COALESCE(p_next_number,1),1),COALESCE(p_suffix,''),COALESCE(p_include_year,false),COALESCE(p_include_month,false),p_barcode_prefix,COALESCE(p_barcode_type,'code128'),COALESCE(p_is_default,true),auth.uid())
  ON CONFLICT (tenant_id,entity_type,prefix,suffix) DO UPDATE SET
    sequence_name=EXCLUDED.sequence_name,
    separator=EXCLUDED.separator,
    padding=EXCLUDED.padding,
    next_number=GREATEST(public.inventory_code_sequences.next_number, EXCLUDED.next_number),
    include_year=EXCLUDED.include_year,
    include_month=EXCLUDED.include_month,
    barcode_prefix=EXCLUDED.barcode_prefix,
    barcode_type=EXCLUDED.barcode_type,
    is_default=EXCLUDED.is_default,
    is_active=true,
    updated_at=NOW()
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.upsert_inventory_code_sequence(TEXT,TEXT,TEXT,TEXT,INT,BIGINT,TEXT,BOOLEAN,BOOLEAN,TEXT,TEXT,BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.preview_inventory_next_code(p_entity_type TEXT, p_sequence_id UUID DEFAULT NULL)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_seq RECORD;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','manager']::TEXT[]);
  SELECT * INTO v_seq FROM public.inventory_code_sequences
  WHERE tenant_id=v_tenant AND is_active AND (p_sequence_id IS NULL OR id=p_sequence_id) AND (p_sequence_id IS NOT NULL OR entity_type=p_entity_type)
  ORDER BY CASE WHEN is_default THEN 0 ELSE 1 END, created_at
  LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'NO_ACTIVE_SEQUENCE_FOR_ENTITY'; END IF;
  RETURN public.inventory_format_sequence_code(v_seq.prefix,v_seq.separator,v_seq.padding,v_seq.next_number,v_seq.suffix,v_seq.include_year,v_seq.include_month);
END $$;
GRANT EXECUTE ON FUNCTION public.preview_inventory_next_code(TEXT,UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.generate_inventory_next_code(p_entity_type TEXT, p_sequence_id UUID DEFAULT NULL, p_manual_code TEXT DEFAULT NULL)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_seq RECORD; v_code TEXT;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','manager']::TEXT[]);
  IF COALESCE(p_manual_code,'') <> '' THEN
    RETURN p_manual_code;
  END IF;
  SELECT * INTO v_seq FROM public.inventory_code_sequences
  WHERE tenant_id=v_tenant AND is_active AND (p_sequence_id IS NULL OR id=p_sequence_id) AND (p_sequence_id IS NOT NULL OR entity_type=p_entity_type)
  ORDER BY CASE WHEN is_default THEN 0 ELSE 1 END, created_at
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NO_ACTIVE_SEQUENCE_FOR_ENTITY'; END IF;
  v_code := public.inventory_format_sequence_code(v_seq.prefix,v_seq.separator,v_seq.padding,v_seq.next_number,v_seq.suffix,v_seq.include_year,v_seq.include_month);
  UPDATE public.inventory_code_sequences SET next_number=next_number+1, updated_at=NOW() WHERE id=v_seq.id AND tenant_id=v_tenant;
  RETURN v_code;
END $$;
GRANT EXECUTE ON FUNCTION public.generate_inventory_next_code(TEXT,UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.generate_inventory_entity_barcode(p_entity_type TEXT, p_entity_code TEXT, p_sequence_id UUID DEFAULT NULL)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_seq RECORD; v_prefix TEXT;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','manager']::TEXT[]);
  SELECT * INTO v_seq FROM public.inventory_code_sequences
  WHERE tenant_id=v_tenant AND is_active AND (p_sequence_id IS NULL OR id=p_sequence_id) AND (p_sequence_id IS NOT NULL OR entity_type=p_entity_type)
  ORDER BY CASE WHEN is_default THEN 0 ELSE 1 END, created_at LIMIT 1;
  v_prefix := COALESCE(v_seq.barcode_prefix, UPPER(p_entity_type));
  RETURN v_prefix || '-' || regexp_replace(UPPER(COALESCE(p_entity_code,'')), '[^A-Z0-9_-]', '-', 'g');
END $$;
GRANT EXECUTE ON FUNCTION public.generate_inventory_entity_barcode(TEXT,TEXT,UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.register_inventory_entity_barcode(p_entity_type TEXT, p_entity_id UUID, p_barcode_value TEXT, p_barcode_type TEXT DEFAULT 'code128', p_is_primary BOOLEAN DEFAULT true)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID;
BEGIN
  PERFORM public.inventory_require_roles(ARRAY['inventory','manager']::TEXT[]);
  IF COALESCE(p_barcode_value,'') = '' THEN RAISE EXCEPTION 'BARCODE_REQUIRED'; END IF;
  INSERT INTO public.inventory_barcodes(tenant_id,entity_type,entity_id,barcode_value,barcode_type,is_primary)
  VALUES(v_tenant,p_entity_type,p_entity_id,p_barcode_value,COALESCE(p_barcode_type,'code128'),COALESCE(p_is_primary,true))
  ON CONFLICT (tenant_id,barcode_value) DO UPDATE SET entity_type=EXCLUDED.entity_type, entity_id=EXCLUDED.entity_id, barcode_type=EXCLUDED.barcode_type, is_primary=EXCLUDED.is_primary
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.register_inventory_entity_barcode(TEXT,UUID,TEXT,TEXT,BOOLEAN) TO authenticated;

CREATE OR REPLACE VIEW public.inventory_code_sequence_preview WITH (security_invoker=true) AS
SELECT s.*,
  public.inventory_format_sequence_code(s.prefix,s.separator,s.padding,s.next_number,s.suffix,s.include_year,s.include_month) AS next_code_preview,
  COALESCE(s.barcode_prefix, UPPER(s.entity_type)) || '-' || public.inventory_format_sequence_code(s.prefix,s.separator,s.padding,s.next_number,s.suffix,s.include_year,s.include_month) AS next_barcode_preview
FROM public.inventory_code_sequences s
WHERE s.tenant_id=public.current_user_tenant_id();
GRANT SELECT ON public.inventory_code_sequence_preview TO authenticated;

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  IF to_regclass('public.inventory_code_sequences') IS NULL OR to_regprocedure('public.generate_inventory_next_code(text,uuid,text)') IS NULL THEN
    RAISE EXCEPTION '0214 failed: inventory UX numbering/barcode helpers missing';
  END IF;
  RAISE NOTICE '✅ 0214: Inventory UX numbering and barcode helpers applied';
END $$;
