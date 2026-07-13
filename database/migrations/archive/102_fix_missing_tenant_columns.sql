-- ============================================================================
-- Kyvzon Platform
-- Migration 102: إضافة tenant_id للجداول المفقودة
-- ============================================================================
-- ملاحظة: الشركة الافتراضية (00000000-0000-0000-0000-000000000001) موجودة مسبقاً
-- من Migration 006 أو 101، هذا الملف فقط يضيف tenant_id للجداول الناقصة
-- ============================================================================

-- ============================================================================
-- 1. إضافة tenant_id إلى الجداول المفقودة
-- ============================================================================

ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);
ALTER TABLE public.incident_comments ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);
ALTER TABLE public.sops ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);
ALTER TABLE public.sop_readings ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);
ALTER TABLE public.course_modules ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);
ALTER TABLE public.course_progress ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);
ALTER TABLE public.survey_responses ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);
ALTER TABLE public.wellness_entries ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);
ALTER TABLE public.hr_messages ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);

-- ============================================================================
-- 2. تحديث البيانات الحالية بالشركة الافتراضية (الموجودة مسبقاً)
-- ============================================================================

UPDATE public.incidents SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE public.incident_comments SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE public.sops SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE public.sop_readings SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE public.courses SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE public.course_modules SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE public.course_progress SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE public.survey_responses SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE public.wellness_entries SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE public.hr_messages SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;

-- ============================================================================
-- 3. تعيين NOT NULL بعد التأكد من عدم وجود NULLs
-- ============================================================================

ALTER TABLE public.incidents ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.incident_comments ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.sops ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.sop_readings ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.courses ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.course_modules ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.course_progress ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.survey_responses ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.wellness_entries ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.hr_messages ALTER COLUMN tenant_id SET NOT NULL;

-- ============================================================================
-- 4. إنشاء Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_incidents_tenant_id ON public.incidents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_incident_comments_tenant_id ON public.incident_comments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sops_tenant_id ON public.sops(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sop_readings_tenant_id ON public.sop_readings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_courses_tenant_id ON public.courses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_course_modules_tenant_id ON public.course_modules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_course_progress_tenant_id ON public.course_progress(tenant_id);
CREATE INDEX IF NOT EXISTS idx_survey_responses_tenant_id ON public.survey_responses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_wellness_entries_tenant_id ON public.wellness_entries(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hr_messages_tenant_id ON public.hr_messages(tenant_id);

-- ============================================================================
-- 5. إضافة مشغلات لتعيين tenant_id تلقائياً عند INSERT
-- ============================================================================

DROP TRIGGER IF EXISTS set_tenant_on_insert_incidents ON public.incidents;
CREATE TRIGGER set_tenant_on_insert_incidents
  BEFORE INSERT ON public.incidents
  FOR EACH ROW
  WHEN (NEW.tenant_id IS NULL)
  EXECUTE FUNCTION public.set_tenant_context();

DROP TRIGGER IF EXISTS set_tenant_on_insert_incident_comments ON public.incident_comments;
CREATE TRIGGER set_tenant_on_insert_incident_comments
  BEFORE INSERT ON public.incident_comments
  FOR EACH ROW
  WHEN (NEW.tenant_id IS NULL)
  EXECUTE FUNCTION public.set_tenant_context();

DROP TRIGGER IF EXISTS set_tenant_on_insert_sops ON public.sops;
CREATE TRIGGER set_tenant_on_insert_sops
  BEFORE INSERT ON public.sops
  FOR EACH ROW
  WHEN (NEW.tenant_id IS NULL)
  EXECUTE FUNCTION public.set_tenant_context();

DROP TRIGGER IF EXISTS set_tenant_on_insert_sop_readings ON public.sop_readings;
CREATE TRIGGER set_tenant_on_insert_sop_readings
  BEFORE INSERT ON public.sop_readings
  FOR EACH ROW
  WHEN (NEW.tenant_id IS NULL)
  EXECUTE FUNCTION public.set_tenant_context();

DROP TRIGGER IF EXISTS set_tenant_on_insert_courses ON public.courses;
CREATE TRIGGER set_tenant_on_insert_courses
  BEFORE INSERT ON public.courses
  FOR EACH ROW
  WHEN (NEW.tenant_id IS NULL)
  EXECUTE FUNCTION public.set_tenant_context();

DROP TRIGGER IF EXISTS set_tenant_on_insert_course_modules ON public.course_modules;
CREATE TRIGGER set_tenant_on_insert_course_modules
  BEFORE INSERT ON public.course_modules
  FOR EACH ROW
  WHEN (NEW.tenant_id IS NULL)
  EXECUTE FUNCTION public.set_tenant_context();

DROP TRIGGER IF EXISTS set_tenant_on_insert_course_progress ON public.course_progress;
CREATE TRIGGER set_tenant_on_insert_course_progress
  BEFORE INSERT ON public.course_progress
  FOR EACH ROW
  WHEN (NEW.tenant_id IS NULL)
  EXECUTE FUNCTION public.set_tenant_context();

DROP TRIGGER IF EXISTS set_tenant_on_insert_survey_responses ON public.survey_responses;
CREATE TRIGGER set_tenant_on_insert_survey_responses
  BEFORE INSERT ON public.survey_responses
  FOR EACH ROW
  WHEN (NEW.tenant_id IS NULL)
  EXECUTE FUNCTION public.set_tenant_context();

DROP TRIGGER IF EXISTS set_tenant_on_insert_wellness_entries ON public.wellness_entries;
CREATE TRIGGER set_tenant_on_insert_wellness_entries
  BEFORE INSERT ON public.wellness_entries
  FOR EACH ROW
  WHEN (NEW.tenant_id IS NULL)
  EXECUTE FUNCTION public.set_tenant_context();

DROP TRIGGER IF EXISTS set_tenant_on_insert_hr_messages ON public.hr_messages;
CREATE TRIGGER set_tenant_on_insert_hr_messages
  BEFORE INSERT ON public.hr_messages
  FOR EACH ROW
  WHEN (NEW.tenant_id IS NULL)
  EXECUTE FUNCTION public.set_tenant_context();

-- ============================================================================
-- 6. إضافة سياسات RLS
-- ============================================================================

-- 6.1 Incidents
DROP POLICY IF EXISTS incidents_select ON public.incidents;
CREATE POLICY incidents_select ON public.incidents
  FOR SELECT USING (public.is_platform_owner() OR public.is_same_tenant(tenant_id));
DROP POLICY IF EXISTS incidents_insert ON public.incidents;
CREATE POLICY incidents_insert ON public.incidents
  FOR INSERT WITH CHECK (public.is_platform_owner() OR public.is_same_tenant(tenant_id));
DROP POLICY IF EXISTS incidents_update ON public.incidents;
CREATE POLICY incidents_update ON public.incidents
  FOR UPDATE USING (public.is_platform_owner() OR public.is_same_tenant(tenant_id));
DROP POLICY IF EXISTS incidents_delete ON public.incidents;
CREATE POLICY incidents_delete ON public.incidents
  FOR DELETE USING (public.is_platform_owner() OR public.is_same_tenant(tenant_id));

-- 6.2 Incident Comments
DROP POLICY IF EXISTS incident_comments_select ON public.incident_comments;
CREATE POLICY incident_comments_select ON public.incident_comments
  FOR SELECT USING (public.is_platform_owner() OR public.is_same_tenant(tenant_id));
DROP POLICY IF EXISTS incident_comments_insert ON public.incident_comments;
CREATE POLICY incident_comments_insert ON public.incident_comments
  FOR INSERT WITH CHECK (public.is_platform_owner() OR public.is_same_tenant(tenant_id));
DROP POLICY IF EXISTS incident_comments_update ON public.incident_comments;
CREATE POLICY incident_comments_update ON public.incident_comments
  FOR UPDATE USING (public.is_platform_owner() OR public.is_same_tenant(tenant_id));
DROP POLICY IF EXISTS incident_comments_delete ON public.incident_comments;
CREATE POLICY incident_comments_delete ON public.incident_comments
  FOR DELETE USING (public.is_platform_owner() OR public.is_same_tenant(tenant_id));

-- 6.3 SOPs
DROP POLICY IF EXISTS sops_select ON public.sops;
CREATE POLICY sops_select ON public.sops
  FOR SELECT USING (public.is_platform_owner() OR public.is_same_tenant(tenant_id));
DROP POLICY IF EXISTS sops_insert ON public.sops;
CREATE POLICY sops_insert ON public.sops
  FOR INSERT WITH CHECK (public.is_platform_owner() OR public.is_same_tenant(tenant_id));
DROP POLICY IF EXISTS sops_update ON public.sops;
CREATE POLICY sops_update ON public.sops
  FOR UPDATE USING (public.is_platform_owner() OR public.is_same_tenant(tenant_id));
DROP POLICY IF EXISTS sops_delete ON public.sops;
CREATE POLICY sops_delete ON public.sops
  FOR DELETE USING (public.is_platform_owner() OR public.is_same_tenant(tenant_id));

-- 6.4 SOP Readings
DROP POLICY IF EXISTS sop_readings_select ON public.sop_readings;
CREATE POLICY sop_readings_select ON public.sop_readings
  FOR SELECT USING (public.is_platform_owner() OR public.is_same_tenant(tenant_id));
DROP POLICY IF EXISTS sop_readings_insert ON public.sop_readings;
CREATE POLICY sop_readings_insert ON public.sop_readings
  FOR INSERT WITH CHECK (public.is_platform_owner() OR public.is_same_tenant(tenant_id));
DROP POLICY IF EXISTS sop_readings_update ON public.sop_readings;
CREATE POLICY sop_readings_update ON public.sop_readings
  FOR UPDATE USING (public.is_platform_owner() OR public.is_same_tenant(tenant_id));
DROP POLICY IF EXISTS sop_readings_delete ON public.sop_readings;
CREATE POLICY sop_readings_delete ON public.sop_readings
  FOR DELETE USING (public.is_platform_owner() OR public.is_same_tenant(tenant_id));

-- 6.5 Courses
DROP POLICY IF EXISTS courses_select ON public.courses;
CREATE POLICY courses_select ON public.courses
  FOR SELECT USING (public.is_platform_owner() OR public.is_same_tenant(tenant_id));
DROP POLICY IF EXISTS courses_insert ON public.courses;
CREATE POLICY courses_insert ON public.courses
  FOR INSERT WITH CHECK (public.is_platform_owner() OR public.is_same_tenant(tenant_id));
DROP POLICY IF EXISTS courses_update ON public.courses;
CREATE POLICY courses_update ON public.courses
  FOR UPDATE USING (public.is_platform_owner() OR public.is_same_tenant(tenant_id));
DROP POLICY IF EXISTS courses_delete ON public.courses;
CREATE POLICY courses_delete ON public.courses
  FOR DELETE USING (public.is_platform_owner() OR public.is_same_tenant(tenant_id));

-- 6.6 Course Modules
DROP POLICY IF EXISTS course_modules_select ON public.course_modules;
CREATE POLICY course_modules_select ON public.course_modules
  FOR SELECT USING (public.is_platform_owner() OR public.is_same_tenant(tenant_id));
DROP POLICY IF EXISTS course_modules_insert ON public.course_modules;
CREATE POLICY course_modules_insert ON public.course_modules
  FOR INSERT WITH CHECK (public.is_platform_owner() OR public.is_same_tenant(tenant_id));
DROP POLICY IF EXISTS course_modules_update ON public.course_modules;
CREATE POLICY course_modules_update ON public.course_modules
  FOR UPDATE USING (public.is_platform_owner() OR public.is_same_tenant(tenant_id));
DROP POLICY IF EXISTS course_modules_delete ON public.course_modules;
CREATE POLICY course_modules_delete ON public.course_modules
  FOR DELETE USING (public.is_platform_owner() OR public.is_same_tenant(tenant_id));

-- 6.7 Course Progress
DROP POLICY IF EXISTS course_progress_select ON public.course_progress;
CREATE POLICY course_progress_select ON public.course_progress
  FOR SELECT USING (public.is_platform_owner() OR public.is_same_tenant(tenant_id));
DROP POLICY IF EXISTS course_progress_insert ON public.course_progress;
CREATE POLICY course_progress_insert ON public.course_progress
  FOR INSERT WITH CHECK (public.is_platform_owner() OR public.is_same_tenant(tenant_id));
DROP POLICY IF EXISTS course_progress_update ON public.course_progress;
CREATE POLICY course_progress_update ON public.course_progress
  FOR UPDATE USING (public.is_platform_owner() OR public.is_same_tenant(tenant_id));
DROP POLICY IF EXISTS course_progress_delete ON public.course_progress;
CREATE POLICY course_progress_delete ON public.course_progress
  FOR DELETE USING (public.is_platform_owner() OR public.is_same_tenant(tenant_id));

-- 6.8 Survey Responses
DROP POLICY IF EXISTS survey_responses_select ON public.survey_responses;
CREATE POLICY survey_responses_select ON public.survey_responses
  FOR SELECT USING (public.is_platform_owner() OR public.is_same_tenant(tenant_id));
DROP POLICY IF EXISTS survey_responses_insert ON public.survey_responses;
CREATE POLICY survey_responses_insert ON public.survey_responses
  FOR INSERT WITH CHECK (public.is_platform_owner() OR public.is_same_tenant(tenant_id));
DROP POLICY IF EXISTS survey_responses_update ON public.survey_responses;
CREATE POLICY survey_responses_update ON public.survey_responses
  FOR UPDATE USING (public.is_platform_owner() OR public.is_same_tenant(tenant_id));
DROP POLICY IF EXISTS survey_responses_delete ON public.survey_responses;
CREATE POLICY survey_responses_delete ON public.survey_responses
  FOR DELETE USING (public.is_platform_owner() OR public.is_same_tenant(tenant_id));

-- 6.9 Wellness Entries
DROP POLICY IF EXISTS wellness_entries_select ON public.wellness_entries;
CREATE POLICY wellness_entries_select ON public.wellness_entries
  FOR SELECT USING (public.is_platform_owner() OR public.is_same_tenant(tenant_id));
DROP POLICY IF EXISTS wellness_entries_insert ON public.wellness_entries;
CREATE POLICY wellness_entries_insert ON public.wellness_entries
  FOR INSERT WITH CHECK (public.is_platform_owner() OR public.is_same_tenant(tenant_id));
DROP POLICY IF EXISTS wellness_entries_update ON public.wellness_entries;
CREATE POLICY wellness_entries_update ON public.wellness_entries
  FOR UPDATE USING (public.is_platform_owner() OR public.is_same_tenant(tenant_id));
DROP POLICY IF EXISTS wellness_entries_delete ON public.wellness_entries;
CREATE POLICY wellness_entries_delete ON public.wellness_entries
  FOR DELETE USING (public.is_platform_owner() OR public.is_same_tenant(tenant_id));

-- 6.10 HR Messages
DROP POLICY IF EXISTS hr_messages_select ON public.hr_messages;
CREATE POLICY hr_messages_select ON public.hr_messages
  FOR SELECT USING (public.is_platform_owner() OR public.is_same_tenant(tenant_id));
DROP POLICY IF EXISTS hr_messages_insert ON public.hr_messages;
CREATE POLICY hr_messages_insert ON public.hr_messages
  FOR INSERT WITH CHECK (public.is_platform_owner() OR public.is_same_tenant(tenant_id));
DROP POLICY IF EXISTS hr_messages_update ON public.hr_messages;
CREATE POLICY hr_messages_update ON public.hr_messages
  FOR UPDATE USING (public.is_platform_owner() OR public.is_same_tenant(tenant_id));
DROP POLICY IF EXISTS hr_messages_delete ON public.hr_messages;
CREATE POLICY hr_messages_delete ON public.hr_messages
  FOR DELETE USING (public.is_platform_owner() OR public.is_same_tenant(tenant_id));

-- ============================================================================
-- 7. تفعيل RLS للجداول التي لا تزال غير مفعلة
-- ============================================================================

ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sop_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.survey_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wellness_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_messages ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- تم الانتهاء
-- ============================================================================