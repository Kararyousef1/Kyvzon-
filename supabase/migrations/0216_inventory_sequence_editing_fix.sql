-- ============================================================================
-- 0216 — Inventory UX: allow safe editing of sequence next_number
-- السبب: بعد إزالة أزرار التوليد، يجب أن يستطيع المدير تصحيح next_number إذا ارتفع
-- أثناء الاختبار، مع بقاء قيود uniqueness على السجلات النهائية كحماية.
-- ============================================================================

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
  IF COALESCE(p_next_number,1) < 1 THEN RAISE EXCEPTION 'NEXT_NUMBER_MUST_BE_POSITIVE'; END IF;
  IF p_is_default THEN
    UPDATE public.inventory_code_sequences SET is_default=false, updated_at=NOW() WHERE tenant_id=v_tenant AND entity_type=p_entity_type;
  END IF;

  INSERT INTO public.inventory_code_sequences(tenant_id,entity_type,sequence_name,prefix,separator,padding,next_number,suffix,include_year,include_month,barcode_prefix,barcode_type,is_default,created_by)
  VALUES(v_tenant,p_entity_type,COALESCE(p_sequence_name,p_entity_type||' sequence'),p_prefix,COALESCE(p_separator,'-'),COALESCE(p_padding,4),COALESCE(p_next_number,1),COALESCE(p_suffix,''),COALESCE(p_include_year,false),COALESCE(p_include_month,false),p_barcode_prefix,COALESCE(p_barcode_type,'code128'),COALESCE(p_is_default,true),auth.uid())
  ON CONFLICT (tenant_id,entity_type,prefix,suffix) DO UPDATE SET
    sequence_name=EXCLUDED.sequence_name,
    separator=EXCLUDED.separator,
    padding=EXCLUDED.padding,
    next_number=EXCLUDED.next_number,
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

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  IF to_regprocedure('public.upsert_inventory_code_sequence(text,text,text,text,integer,bigint,text,boolean,boolean,text,text,boolean)') IS NULL THEN
    RAISE EXCEPTION '0216 failed: sequence upsert function missing';
  END IF;
  RAISE NOTICE '✅ 0216: Inventory sequence editing fix applied';
END $$;
