-- ═══════════════════════════════════════════════════════════════════════════
-- 0378 — المرحلة الخامسة: تنفيذ الزمنيات وربط طلبها بسجل الحركة الفعلي
-- واجهات SOP/البصمة/الحركة تعتمد RPCs القائمة وتُغلق في React بعقود.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE UNIQUE INDEX IF NOT EXISTS uq_permissions_request_id_tenant_0378
  ON public.permissions_request(id,tenant_id);

ALTER TABLE public.permissions
  ADD COLUMN IF NOT EXISTS source_request_id UUID,
  ADD COLUMN IF NOT EXISTS execution_recorded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS execution_recorded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS execution_note TEXT;

-- Backfill حتمي لأقدم/أحدث تطابق: نعتمد أحدث طلب موافق قبل سجل التنفيذ.
WITH matches AS (
  SELECT x.id AS execution_id,
         (SELECT pr.id
            FROM public.permissions_request pr
           WHERE pr.tenant_id=x.tenant_id
             AND pr.employee_id=x.employee_id
             AND pr.date=x.date
             AND pr.expected_out_time=x.expected_out_time
             AND pr.status='موافق'
           ORDER BY pr.reviewed_at DESC NULLS LAST,pr.created_at DESC,pr.id DESC
           LIMIT 1) AS request_id,
         x.created_at
    FROM public.permissions x
   WHERE x.source_request_id IS NULL
), ranked AS (
  SELECT m.*,row_number() OVER (
    PARTITION BY m.request_id ORDER BY m.created_at DESC,m.execution_id DESC
  ) AS rn
  FROM matches m WHERE m.request_id IS NOT NULL
)
UPDATE public.permissions x
   SET source_request_id=r.request_id
  FROM ranked r
 WHERE x.id=r.execution_id AND r.rn=1;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname='permissions_source_request_tenant_fkey') THEN
    ALTER TABLE public.permissions
      ADD CONSTRAINT permissions_source_request_tenant_fkey
      FOREIGN KEY (source_request_id,tenant_id)
      REFERENCES public.permissions_request(id,tenant_id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname='permissions_actual_times_chk') THEN
    ALTER TABLE public.permissions
      ADD CONSTRAINT permissions_actual_times_chk CHECK (
        actual_return_time IS NULL OR actual_out_time IS NULL
        OR actual_return_time>actual_out_time
      );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_permissions_source_request
  ON public.permissions(tenant_id,source_request_id)
  WHERE source_request_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.tg_link_permission_execution_source()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.source_request_id IS NULL THEN
    SELECT pr.id INTO NEW.source_request_id
      FROM public.permissions_request pr
     WHERE pr.tenant_id=NEW.tenant_id
       AND pr.employee_id=NEW.employee_id
       AND pr.date=NEW.date
       AND pr.expected_out_time=NEW.expected_out_time
       AND pr.status='موافق'
     ORDER BY pr.reviewed_at DESC NULLS LAST,pr.created_at DESC,pr.id DESC
     LIMIT 1;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_link_permission_execution_source ON public.permissions;
CREATE TRIGGER trg_link_permission_execution_source
  BEFORE INSERT ON public.permissions
  FOR EACH ROW EXECUTE FUNCTION public.tg_link_permission_execution_source();

DROP FUNCTION IF EXISTS public.permission_execution_record(UUID,TIMESTAMPTZ,TIMESTAMPTZ,TEXT);
CREATE FUNCTION public.permission_execution_record(
  p_request_id UUID,
  p_actual_out TIMESTAMPTZ,
  p_actual_return TIMESTAMPTZ DEFAULT NULL,
  p_note TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_tenant UUID:=public.current_user_tenant_id();
  v_request RECORD;
  v_execution UUID;
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL OR NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'PERMISSION_EXECUTION_NOT_AUTHORIZED';
  END IF;
  SELECT pr.* INTO v_request FROM public.permissions_request pr
   WHERE pr.id=p_request_id AND pr.tenant_id=v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'PERMISSION_EXECUTION_REQUEST_NOT_FOUND'; END IF;
  IF v_request.status<>'موافق' THEN RAISE EXCEPTION 'PERMISSION_EXECUTION_NOT_APPROVED'; END IF;
  IF p_actual_out IS NULL THEN RAISE EXCEPTION 'PERMISSION_ACTUAL_OUT_REQUIRED'; END IF;
  IF (p_actual_out AT TIME ZONE 'Asia/Baghdad')::DATE<>v_request.date THEN
    RAISE EXCEPTION 'PERMISSION_ACTUAL_OUT_WRONG_DATE';
  END IF;
  IF p_actual_return IS NOT NULL
     AND (p_actual_return AT TIME ZONE 'Asia/Baghdad')::DATE
         NOT IN (v_request.date,v_request.date+1) THEN
    RAISE EXCEPTION 'PERMISSION_ACTUAL_RETURN_WRONG_DATE';
  END IF;
  IF v_request.permission_type<>'مغادرة' AND p_actual_return IS NULL THEN
    RAISE EXCEPTION 'PERMISSION_ACTUAL_RETURN_REQUIRED';
  END IF;
  IF p_actual_return IS NOT NULL AND p_actual_return<=p_actual_out THEN
    RAISE EXCEPTION 'PERMISSION_ACTUAL_TIMES_INVALID';
  END IF;

  SELECT x.id INTO v_execution FROM public.permissions x
   WHERE x.tenant_id=v_tenant
     AND (x.source_request_id=p_request_id OR (
       x.source_request_id IS NULL AND x.employee_id=v_request.employee_id
       AND x.date=v_request.date AND x.expected_out_time=v_request.expected_out_time
     ))
   ORDER BY x.created_at DESC LIMIT 1 FOR UPDATE;
  IF v_execution IS NULL THEN RAISE EXCEPTION 'PERMISSION_EXECUTION_ROW_NOT_FOUND'; END IF;

  UPDATE public.permissions
     SET source_request_id=p_request_id,
         actual_out_time=p_actual_out,
         actual_return_time=CASE WHEN v_request.permission_type='مغادرة'
                                 THEN NULL ELSE p_actual_return END,
         execution_note=NULLIF(btrim(COALESCE(p_note,'')),''),
         execution_recorded_by=auth.uid(),execution_recorded_at=NOW(),updated_at=NOW()
   WHERE id=v_execution AND tenant_id=v_tenant;
  RETURN v_execution;
END $$;
REVOKE ALL ON FUNCTION public.permission_execution_record(UUID,TIMESTAMPTZ,TIMESTAMPTZ,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.permission_execution_record(UUID,TIMESTAMPTZ,TIMESTAMPTZ,TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.permission_execution_record(UUID,TIMESTAMPTZ,TIMESTAMPTZ,TEXT)
  TO authenticated;

-- توسيع view 0340 دون نسخ منطق النطاق والاعتماد القديم.
ALTER FUNCTION public.permission_requests_view(TEXT,TEXT,INTEGER,INTEGER)
  RENAME TO permission_requests_view_pre_0378;
REVOKE ALL ON FUNCTION public.permission_requests_view_pre_0378(TEXT,TEXT,INTEGER,INTEGER)
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.permission_requests_view(
  p_scope TEXT DEFAULT 'mine',p_status TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 100,p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
  out_id UUID,out_employee_id UUID,out_employee_name TEXT,out_department TEXT,
  out_permission_type TEXT,out_date DATE,out_out_time TIME,out_return_time TIME,
  out_status TEXT,out_reason TEXT,out_rejection TEXT,out_reviewed_at TIMESTAMPTZ,
  out_created_at TIMESTAMPTZ,out_can_decide BOOLEAN,out_can_cancel BOOLEAN,
  out_executed BOOLEAN,out_execution_id UUID,out_actual_out TIMESTAMPTZ,
  out_actual_return TIMESTAMPTZ,out_execution_note TEXT,
  out_can_record_execution BOOLEAN
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
  SELECT q.*,x.id,x.actual_out_time,x.actual_return_time,x.execution_note,
         (public.current_user_is_staff() AND q.out_status='موافق' AND x.id IS NOT NULL)
    FROM public.permission_requests_view_pre_0378(p_scope,p_status,p_limit,p_offset) q
    LEFT JOIN LATERAL (
      SELECT px.* FROM public.permissions px
       WHERE px.tenant_id=public.current_user_tenant_id()
         AND (px.source_request_id=q.out_id OR (
           px.source_request_id IS NULL AND px.employee_id=q.out_employee_id
           AND px.date=q.out_date AND px.expected_out_time=q.out_out_time
         ))
       ORDER BY (px.source_request_id=q.out_id) DESC,px.created_at DESC,px.id DESC
       LIMIT 1
    ) x ON TRUE
   ORDER BY q.out_created_at DESC;
$$;
REVOKE ALL ON FUNCTION public.permission_requests_view(TEXT,TEXT,INTEGER,INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.permission_requests_view(TEXT,TEXT,INTEGER,INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.permission_requests_view(TEXT,TEXT,INTEGER,INTEGER)
  TO authenticated;
