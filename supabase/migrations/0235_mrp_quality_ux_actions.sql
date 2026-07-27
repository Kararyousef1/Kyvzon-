-- ============================================================================
-- 0235 — MRP Quality UX Actions Completion
-- Adds checklist templates/items, inspection points, device creation, quarantine,
-- inspection cancellation and lookup views for easier UI usage.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_mrp_quality_checklist_template(p_template_code TEXT,p_name_ar TEXT,p_inspection_stage TEXT DEFAULT 'IPQC')
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID; v_code TEXT;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','quality_inspector','production_manager']::TEXT[]);
  v_code := public.generate_mrp_next_code('quality_checklist_template',p_template_code);
  INSERT INTO public.mrp_quality_checklist_templates(tenant_id,template_code,name_ar,inspection_stage)
  VALUES(v_tenant,v_code,p_name_ar,COALESCE(p_inspection_stage,'IPQC')) RETURNING id INTO v_id;
  PERFORM public.log_mrp_audit_event('quality','mrp_quality_checklist_templates',v_id,'create',NULL,jsonb_build_object('template_code',v_code),'إنشاء قالب قائمة فحص');
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.create_mrp_quality_checklist_template(TEXT,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.add_mrp_quality_checklist_item(p_template_id UUID,p_sequence_no INT,p_check_text TEXT,p_response_type TEXT DEFAULT 'pass_fail',p_required BOOLEAN DEFAULT true,p_lower_spec_limit NUMERIC DEFAULT NULL,p_upper_spec_limit NUMERIC DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','quality_inspector','production_manager']::TEXT[]);
  INSERT INTO public.mrp_quality_checklist_items(tenant_id,template_id,sequence_no,check_text,response_type,required,lower_spec_limit,upper_spec_limit)
  VALUES(v_tenant,p_template_id,p_sequence_no,p_check_text,COALESCE(p_response_type,'pass_fail'),COALESCE(p_required,true),p_lower_spec_limit,p_upper_spec_limit)
  ON CONFLICT (tenant_id,template_id,sequence_no) DO UPDATE SET check_text=EXCLUDED.check_text,response_type=EXCLUDED.response_type,required=EXCLUDED.required,lower_spec_limit=EXCLUDED.lower_spec_limit,upper_spec_limit=EXCLUDED.upper_spec_limit
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.add_mrp_quality_checklist_item(UUID,INT,TEXT,TEXT,BOOLEAN,NUMERIC,NUMERIC) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_mrp_quality_inspection_point(p_plan_id UUID,p_point_code TEXT,p_name_ar TEXT,p_operation_id UUID DEFAULT NULL,p_routing_operation_id UUID DEFAULT NULL,p_ccp BOOLEAN DEFAULT false,p_specification TEXT DEFAULT NULL,p_lower_spec_limit NUMERIC DEFAULT NULL,p_upper_spec_limit NUMERIC DEFAULT NULL,p_target_value NUMERIC DEFAULT NULL,p_frequency_text TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID; v_code TEXT;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','quality_inspector','production_manager']::TEXT[]);
  v_code := public.generate_mrp_next_code('quality_point',p_point_code);
  INSERT INTO public.mrp_quality_inspection_points(tenant_id,plan_id,operation_id,routing_operation_id,point_code,name_ar,ccp,specification,lower_spec_limit,upper_spec_limit,target_value,frequency_text)
  VALUES(v_tenant,p_plan_id,p_operation_id,p_routing_operation_id,v_code,p_name_ar,COALESCE(p_ccp,false),p_specification,p_lower_spec_limit,p_upper_spec_limit,p_target_value,p_frequency_text)
  ON CONFLICT (tenant_id,plan_id,point_code) DO UPDATE SET name_ar=EXCLUDED.name_ar,operation_id=EXCLUDED.operation_id,routing_operation_id=EXCLUDED.routing_operation_id,ccp=EXCLUDED.ccp,specification=EXCLUDED.specification,lower_spec_limit=EXCLUDED.lower_spec_limit,upper_spec_limit=EXCLUDED.upper_spec_limit,target_value=EXCLUDED.target_value,frequency_text=EXCLUDED.frequency_text,status='active'
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.create_mrp_quality_inspection_point(UUID,TEXT,TEXT,UUID,UUID,BOOLEAN,TEXT,NUMERIC,NUMERIC,NUMERIC,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_mrp_quality_inspection(p_inspection_id UUID,p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_old JSONB;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','quality_inspector','production_manager']::TEXT[]);
  IF COALESCE(p_reason,'')='' THEN RAISE EXCEPTION 'CANCEL_REASON_REQUIRED'; END IF;
  SELECT to_jsonb(i) INTO v_old FROM public.mrp_quality_inspections i WHERE id=p_inspection_id AND tenant_id=v_tenant FOR UPDATE;
  IF v_old IS NULL THEN RAISE EXCEPTION 'INSPECTION_NOT_FOUND'; END IF;
  UPDATE public.mrp_quality_inspections SET status='cancelled' WHERE id=p_inspection_id AND tenant_id=v_tenant AND status IN ('open','in_inspection');
  IF NOT FOUND THEN RAISE EXCEPTION 'INSPECTION_NOT_CANCELLABLE'; END IF;
  PERFORM public.log_mrp_audit_event('quality','mrp_quality_inspections',p_inspection_id,'cancel',v_old,jsonb_build_object('status','cancelled'),p_reason);
END $$;
GRANT EXECUTE ON FUNCTION public.cancel_mrp_quality_inspection(UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_mrp_quality_measurement_device(p_device_code TEXT,p_name_ar TEXT,p_device_type TEXT DEFAULT 'gauge',p_standard_reference TEXT DEFAULT NULL,p_calibration_frequency_days INT DEFAULT 180,p_next_calibration_date DATE DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID; v_code TEXT;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','quality_inspector','production_manager']::TEXT[]);
  v_code := public.generate_mrp_next_code('quality_device',p_device_code);
  INSERT INTO public.mrp_quality_measurement_devices(tenant_id,device_code,name_ar,device_type,standard_reference,calibration_frequency_days,next_calibration_date,status)
  VALUES(v_tenant,v_code,p_name_ar,COALESCE(p_device_type,'gauge'),p_standard_reference,COALESCE(p_calibration_frequency_days,180),p_next_calibration_date,CASE WHEN p_next_calibration_date IS NOT NULL AND p_next_calibration_date<CURRENT_DATE THEN 'overdue' ELSE 'active' END)
  ON CONFLICT (tenant_id,device_code) DO UPDATE SET name_ar=EXCLUDED.name_ar,device_type=EXCLUDED.device_type,standard_reference=EXCLUDED.standard_reference,calibration_frequency_days=EXCLUDED.calibration_frequency_days,next_calibration_date=EXCLUDED.next_calibration_date,status=EXCLUDED.status
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.upsert_mrp_quality_measurement_device(TEXT,TEXT,TEXT,TEXT,INT,DATE) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_mrp_quality_quarantine_decision(p_ncr_id UUID,p_item_id UUID,p_lot_id UUID,p_quantity NUMERIC,p_decision TEXT,p_reason TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant UUID:=public.current_user_tenant_id(); v_id UUID;
BEGIN
  PERFORM public.mrp_require_roles(ARRAY['manufacturing','quality_inspector','production_manager']::TEXT[]);
  IF COALESCE(p_reason,'')='' THEN RAISE EXCEPTION 'QUARANTINE_DECISION_REASON_REQUIRED'; END IF;
  INSERT INTO public.mrp_quality_quarantine_decisions(tenant_id,ncr_id,item_id,lot_id,quantity,decision,reason,decided_by)
  VALUES(v_tenant,p_ncr_id,p_item_id,p_lot_id,COALESCE(p_quantity,0),p_decision,p_reason,auth.uid()) RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.create_mrp_quality_quarantine_decision(UUID,UUID,UUID,NUMERIC,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE VIEW public.mrp_quality_checklist_template_board WITH (security_invoker=true) AS
SELECT t.*, (SELECT COUNT(*) FROM public.mrp_quality_checklist_items i WHERE i.tenant_id=t.tenant_id AND i.template_id=t.id) AS item_count
FROM public.mrp_quality_checklist_templates t
WHERE t.tenant_id=public.current_user_tenant_id()
ORDER BY t.created_at DESC;
GRANT SELECT ON public.mrp_quality_checklist_template_board TO authenticated;

CREATE OR REPLACE VIEW public.mrp_quality_inspection_point_lookup WITH (security_invoker=true) AS
SELECT p.id,p.point_code,p.name_ar,p.status,p.specification,pl.plan_code,pl.inspection_stage
FROM public.mrp_quality_inspection_points p
JOIN public.mrp_quality_inspection_plans pl ON pl.id=p.plan_id AND pl.tenant_id=p.tenant_id
WHERE p.tenant_id=public.current_user_tenant_id();
GRANT SELECT ON public.mrp_quality_inspection_point_lookup TO authenticated;

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  IF to_regprocedure('public.create_mrp_quality_checklist_template(text,text,text)') IS NULL OR to_regprocedure('public.cancel_mrp_quality_inspection(uuid,text)') IS NULL OR to_regprocedure('public.upsert_mrp_quality_measurement_device(text,text,text,text,integer,date)') IS NULL THEN
    RAISE EXCEPTION '0235 failed: MRP quality UX action RPCs missing';
  END IF;
  RAISE NOTICE '✅ 0235: MRP quality UX actions applied';
END $$;
