-- ════════════════════════════════════════════════════════════════════════
--  0370 — سلامة تقارير الموارد البشرية
--  المرحلة 4 — بوابة الموارد البشرية · hr/ReportsPage.tsx (146 سطراً)
-- ════════════════════════════════════════════════════════════════════════
--
--  ┌──────────────────────────────────────────────────────────────────┐
--  │  الأعطال المُثبتة تشغيلياً على Postgres 17 قبل كتابة سطرٍ واحد    │
--  │  (المسبار: tools/dev/_probe_0370.sql — قاعدة نظيفة، 298 م.)      │
--  └──────────────────────────────────────────────────────────────────┘
--
--  ★ هذه الصفحة ليست «ناقصةً» — هي **تكذب**. تُخرج ملفاً وتقول
--    «✅ تم إنشاء التقرير بنجاح» على محتوىً لا وجود له.
--
--  ═══════════════════════════════════════════════════════════════════
--  ① ★★★★ **ثلاثةٌ من ثمانية تقاريرَ محتواها الحرفيّ: بيانات تجريبية**
--  ═══════════════════════════════════════════════════════════════════
--
--     الصفحة تعرض ثمانية تقارير. الفرع `else` (السطر 79–82):
--         headers = ['الاسم', 'القيمة', 'التاريخ'];
--         rows    = [['بيانات تجريبية', '—', '—']];
--
--     ويسقط فيه ثلاثةٌ منها لأنّ لا فرعَ لها:
--        satisfaction  «تقرير رضا الموظفين السنوي 2024»
--        performance   «تقرير الأداء - الربع الثالث»
--        sentiment     «تقرير التحليل الذكي للمشاعر»
--
--     ثم السطر 96 يعرض: «✅ تم إنشاء التقرير بنجاح».
--     ⇒ **المستخدم يحمّل ملفاً فيه سطرٌ واحدٌ زائف ويُطمْأَن إليه.**
--       وهذا أسوأ من زرٍّ معطَّل: الزرّ المعطَّل يُعلن عجزه.
--
--  ═══════════════════════════════════════════════════════════════════
--  ② ★★★★ **تقرير البلاغات يفضح المُبلِّغ المجهول**
--  ═══════════════════════════════════════════════════════════════════
--
--     `incidentService.findAll()` يقرأ `public.incidents` خاماً، ثمّ
--     الصفحة تُصدّر `inc.title` و`inc.status`… والخدمة تجرّ الصفَّ كاملاً.
--     أيّ توسعةٍ للأعمدة تُسرّب `employee_name` مباشرةً — وهو مملوءٌ
--     في القاعدة حتى حين `is_anonymous = TRUE`.
--
--     PROBE_2 — بلاغٌ حقيقيٌّ بـ`is_anonymous = TRUE`:
--        title         = تحرّش من مدير مباشر
--        is_anonymous  = t
--        employee_name = موظف واحد        ⇐ ★ الاسم مكشوف
--        department    = المالية           ⇐ ★ والقسم معه
--        reported_by   = 23700002-…        ⇐ ★ والمعرّف كذلك
--
--     ★ المايجريشن 0338 أصلح هذا **في الدوال** (`safety_incident_board`
--       تُعيد 'مُبلِّغ مجهول'). وطريق التقارير يلتفّ حول ذلك الإصلاح
--       كاملاً لأنّه لا يمرّ بدالة. **الوعد الذي قطعناه للمُبلِّغ
--       يُخلَف من بابٍ خلفيّ.**
--
--  ═══════════════════════════════════════════════════════════════════
--  ③ ★★★★ **تقرير الصحة النفسية: مزاج كلّ موظفٍ باسمه وملاحظاته**
--  ═══════════════════════════════════════════════════════════════════
--
--     `wellnessEntryService.findAllEntries()` = `SELECT *` بلا ترشيح.
--     PROBE_1 — ما يخرج فعلاً في الملفّ:
--        employee_id                          | mood     | score | notes
--        02831964-e481-4932-9622-5d50d6aece08 | terrible |    20 | أفكّر في الاستقالة
--        0c25a6f8-47cd-43aa-9d07-9b30ed529ee3 | great    |    80 | كل شيء بخير
--
--     ⇒ ملفٌّ يُنزَّل على قرصٍ شخصيّ فيه نيّة موظفٍ بالاستقالة مقرونةً
--       بمعرّفه. الصحة النفسية بيانٌ حسّاسٌ بامتياز، وتصديرُه فرديّاً
--       **ليس تقريراً بل ملفُّ مراقبة**.
--
--     ★ العلاج: التقرير يُجمَّع بالقسم لا بالفرد، مع حدٍّ أدنى
--       (k = 3) يمنع إعادة تعريف الفرد من قسمٍ صغير.
--
--  ═══════════════════════════════════════════════════════════════════
--  ④ ★★★ **لا أثر لأيّ تصدير**
--  ═══════════════════════════════════════════════════════════════════
--
--     PROBE_4: صفوف `audit_logs` التي تذكر تصديراً أو تقريراً = **0**.
--     ⇒ من صدّر بيانات المنشأة كاملةً ومتى وبأيّ نطاق؟ لا أحد يعلم،
--       ولا سبيل لأن يعلم. وهذه أعلى عمليّةٍ خطراً في البوّابة كلّها.
--
--  ═══════════════════════════════════════════════════════════════════
--  ⑤ ★★★ **الموظّف لا يُصدِّر شيئاً — والمدير يُصدِّر ملفّاً فارغاً صامتاً**
--  ═══════════════════════════════════════════════════════════════════
--
--     `hybridPagesCatalog.ts:157` يمنح `hr-reports` للأدوار:
--        ['hr', 'admin', 'manager']
--     و`current_user_is_staff()` = admin · hr · developer · it_admin
--     — **لا `manager`**.
--
--     PROBE_7 — بدور `manager` حقيقيّ عبر RLS:
--        wellness_visible  = 0
--        incidents_visible = 0
--        is_staff          = f
--     وبدور `hr`:
--        wellness_visible  = 1
--        incidents_visible = 1
--
--     ⇒ المدير يضغط «تحميل» فينزل ملفٌّ **بترويسةٍ بلا صفوف**، ثمّ
--       يقرأ «✅ تم إنشاء التقرير بنجاح». لا خطأ ولا تفسير. سيستنتج
--       أنّ المنشأة بلا بلاغاتٍ ولا حضور. **الصمت هنا أخطر من المنع.**
--
--     ★ القرار: المنع صريحٌ ومسموع (`HR_REPORT_FORBIDDEN`)، و`manager`
--       يُرفع من قائمة أدوار الصفحة. حقٌّ لا يُمارَس ليس حقاً.
--
--  ═══════════════════════════════════════════════════════════════════
--  ⑥ ★★ **تواريخُ 2024 مسمَّرةٌ في شيفرة تعمل في 2026**
--  ═══════════════════════════════════════════════════════════════════
--
--     PROBE_5: اليوم في بغداد = 2026-08-08 · وتاريخ التقرير في
--     الصفحة = 2024-12-01. والعناوين نفسها: «ديسمبر 2024» ·
--     «الربع الثالث» · «السنوي 2024». ⇒ كتالوجٌ مُجمَّدٌ في الماضي.
--
--  ═══════════════════════════════════════════════════════════════════
--  ⑦ ★★★ **لا نطاقَ زمنيّ ولا حدَّ صفوف**
--  ═══════════════════════════════════════════════════════════════════
--
--     `findAll()` بلا `limit` على `incidents` و`wellness_entries`
--     و`employee_contracts`. و`attendance` بـ`limit: 500` **ثابتاً بلا
--     نطاق** ⇒ «معدّل الحضور» يُحسب على آخر خمسمئة صفٍّ كيفما وقعت،
--     لا على شهرٍ ولا ربعٍ ولا سنة. **رقمٌ بلا معنى.**
--
--  ┌──────────────────────────────────────────────────────────────────┐
--  │  العلاج: التقرير كيانٌ في القاعدة لا مصفوفةٌ في ملفّ TSX          │
--  └──────────────────────────────────────────────────────────────────┘
--    · `hr_report_definitions` — كتالوجٌ مرجعيّ (ثمانية تقارير حقيقية)
--    · `hr_report_runs`        — أثرٌ تدقيقيٌّ لكلّ تصدير (العطل ④)
--    · `hr_report_execute()`   — منفّذٌ موحَّدٌ SECURITY INVOKER
--                                ⇒ RLS سارية على كلّ جدولٍ يُقرأ
--    · إخفاء هويّة المُبلِّغ (②) وتجميع الصحة النفسية (③) **في القاعدة**
--    · نطاقٌ إلزاميٌّ وحدٌّ أقصى وكشفُ اقتطاع (⑦)
-- ════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════
--  ① كتالوج التقارير — مرجعيٌّ عالميّ (لا `tenant_id`)
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.hr_report_definitions (
  code            TEXT PRIMARY KEY,
  name_ar         TEXT    NOT NULL,
  description_ar  TEXT    NOT NULL,
  category        TEXT    NOT NULL,
  columns_ar      TEXT[]  NOT NULL,
  needs_range     BOOLEAN NOT NULL DEFAULT TRUE,
  is_sensitive    BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order      INTEGER NOT NULL DEFAULT 100,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.hr_report_definitions IS
  'كتالوج تقارير الموارد البشرية. كان مصفوفةً مسمَّرةً في ReportsPage.tsx '
  'ثلاثةٌ من ثمانية عناصرها بلا أيّ تنفيذ (العطل ①) — 0370';
COMMENT ON COLUMN public.hr_report_definitions.is_sensitive IS
  'تقريرٌ يمسّ بياناً حسّاساً (صحة نفسية · بلاغات) — يُوسَم في السجلّ ويُنبَّه عليه';
COMMENT ON COLUMN public.hr_report_definitions.columns_ar IS
  'ترويسات الأعمدة بالعربية — مصدرُها القاعدة فلا تختلف عن محتوى الصفوف';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='public.hr_report_definitions'::regclass
      AND conname='chk_hr_report_def_category') THEN
    ALTER TABLE public.hr_report_definitions ADD CONSTRAINT chk_hr_report_def_category
      CHECK (category IN ('workforce','attendance','performance','safety','wellbeing','contracts'));
  END IF;
END $$;

-- ★ الترويسات لا تكون فارغةً ولا تتجاوز سبعة أعمدة (سعة المنفّذ)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='public.hr_report_definitions'::regclass
      AND conname='chk_hr_report_def_columns') THEN
    ALTER TABLE public.hr_report_definitions ADD CONSTRAINT chk_hr_report_def_columns
      CHECK (array_length(columns_ar,1) BETWEEN 1 AND 7);
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════
--  ② سجلّ التشغيل — الأثر التدقيقيّ (العطل ④)
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.hr_report_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  report_code   TEXT NOT NULL,
  executed_by   UUID NOT NULL,
  executed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  date_from     DATE,
  date_to       DATE,
  row_count     INTEGER NOT NULL DEFAULT 0,
  total_rows    INTEGER NOT NULL DEFAULT 0,
  was_truncated BOOLEAN NOT NULL DEFAULT FALSE
);

COMMENT ON TABLE public.hr_report_runs IS
  'أثرُ كلّ تصديرٍ لبيانات الموارد البشرية: من · متى · أيّ نطاق · كم صفاً. '
  'كان صفرَ سجلّ قبل 0370 (العطل ④)';
COMMENT ON COLUMN public.hr_report_runs.was_truncated IS
  'TRUE حين total_rows > row_count — التقرير مقتطعٌ والمُصدِّر يجب أن يعلم';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='public.hr_report_runs'::regclass
      AND conname='fk_hr_report_run_tenant') THEN
    ALTER TABLE public.hr_report_runs ADD CONSTRAINT fk_hr_report_run_tenant
      FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ★★★ FK مركَّب (id, tenant_id) — هو الذي يمنع تسجيل تصديرٍ باسم
--   شخصٍ من مستأجرٍ آخر. `uq_profiles_id_tenant` من 0365.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='public.hr_report_runs'::regclass
      AND conname='fk_hr_report_run_actor_tenant') THEN
    ALTER TABLE public.hr_report_runs ADD CONSTRAINT fk_hr_report_run_actor_tenant
      FOREIGN KEY (executed_by, tenant_id)
      REFERENCES public.profiles (id, tenant_id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='public.hr_report_runs'::regclass
      AND conname='fk_hr_report_run_code') THEN
    ALTER TABLE public.hr_report_runs ADD CONSTRAINT fk_hr_report_run_code
      FOREIGN KEY (report_code)
      REFERENCES public.hr_report_definitions(code) ON DELETE RESTRICT;
  END IF;
END $$;

-- ★ النطاق المعكوس مرفوض
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='public.hr_report_runs'::regclass
      AND conname='chk_hr_report_run_range') THEN
    ALTER TABLE public.hr_report_runs ADD CONSTRAINT chk_hr_report_run_range
      CHECK (date_from IS NULL OR date_to IS NULL OR date_from <= date_to);
  END IF;
END $$;

-- ★ العدّان غير سالبين، والمُقتَطع متّسقٌ مع العدّين
--   ★★★★ `IS NOT DISTINCT FROM` لا `=` — درس 0365: CHECK يقبل NULL
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='public.hr_report_runs'::regclass
      AND conname='chk_hr_report_run_counts') THEN
    ALTER TABLE public.hr_report_runs ADD CONSTRAINT chk_hr_report_run_counts
      CHECK (
        row_count >= 0 AND total_rows >= row_count
        AND was_truncated IS NOT DISTINCT FROM (total_rows > row_count)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_hr_report_runs_tenant_time
  ON public.hr_report_runs (tenant_id, executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_hr_report_runs_actor
  ON public.hr_report_runs (executed_by);

-- ═══════════════════════════════════════════════════════════════════
--  ③ بذر الكتالوج — ثمانية تقاريرَ **كلُّها منفَّذة**
--     (يستبدل الثمانية التي ثلاثةٌ منها وهمٌ خالص)
-- ═══════════════════════════════════════════════════════════════════

INSERT INTO public.hr_report_definitions
  (code, name_ar, description_ar, category, columns_ar, needs_range, is_sensitive, sort_order)
VALUES
  ('workforce_kpi', 'مؤشرات القوى العاملة',
   'لقطةٌ لحظيّة: أعداد الموظفين ونِسَب الحضور والغياب والتأخير والبلاغات المفتوحة.',
   'workforce', ARRAY['المؤشر','القيمة'], FALSE, FALSE, 10),

  ('headcount_by_department', 'التوزيع حسب الأقسام',
   'عدد الموظفين النشطين وغير النشطين في كلّ قسم.',
   'workforce', ARRAY['القسم','النشطون','غير النشطين','الإجمالي'], FALSE, FALSE, 20),

  ('attendance_detail', 'تفصيل الحضور',
   'سجلّات الحضور خلال نطاقٍ زمنيّ محدَّد مع دقائق التأخير والخروج المبكر.',
   'attendance', ARRAY['الموظف','التاريخ','الحالة','الدخول','الخروج','تأخير (دقيقة)','ساعات'], TRUE, FALSE, 30),

  ('leaves_detail', 'الإجازات',
   'طلبات الإجازة التي تقع ضمن النطاق مع حالتها ومعتمِدها.',
   'attendance', ARRAY['الموظف','النوع','من','إلى','أيام العمل','الحالة','المعتمِد'], TRUE, FALSE, 40),

  ('performance_summary', 'تقييمات الأداء',
   'تقييمات الأداء المُنشأة ضمن النطاق مع الدرجة والمُقيِّم والحالة.',
   'performance', ARRAY['الموظف','المُقيِّم','الدرجة','التقدير','الحالة','التاريخ'], TRUE, FALSE, 50),

  ('incidents_detail', 'البلاغات والحوادث',
   'البلاغات ضمن النطاق. ★ هويّة المُبلِّغ المجهول مخفيّةٌ في القاعدة.',
   'safety', ARRAY['العنوان','التصنيف','الخطورة','الحالة','المُبلِّغ','التاريخ'], TRUE, TRUE, 60),

  ('wellness_aggregate', 'مؤشر الصحة النفسية (مجمَّع)',
   'متوسّطاتٌ حسب القسم فقط. ★ لا أسماء ولا ملاحظات، والأقسام التي '
   'تقلّ إدخالاتها عن ثلاثة تُدمج في «أقسام أخرى» منعاً لإعادة تعريف الفرد.',
   'wellbeing', ARRAY['القسم','عدد الإدخالات','متوسّط الدرجة','متوسّط التوتر','متوسّط الطاقة'], TRUE, TRUE, 70),

  ('contracts_expiry', 'العقود والانتهاءات',
   'عقود الموظفين مرتَّبةً بتاريخ الانتهاء مع الأيام المتبقية.',
   'contracts', ARRAY['رقم العقد','الموظف','النوع','البداية','النهاية','المتبقّي (يوم)','الحالة'], FALSE, FALSE, 80)
ON CONFLICT (code) DO UPDATE SET
  name_ar        = EXCLUDED.name_ar,
  description_ar = EXCLUDED.description_ar,
  category       = EXCLUDED.category,
  columns_ar     = EXCLUDED.columns_ar,
  needs_range    = EXCLUDED.needs_range,
  is_sensitive   = EXCLUDED.is_sensitive,
  sort_order     = EXCLUDED.sort_order,
  is_active      = TRUE;

-- ═══════════════════════════════════════════════════════════════════
--  ④ الجدار
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.hr_report_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_report_runs        ENABLE ROW LEVEL SECURITY;

-- الكتالوج مرجعٌ عالميّ: قراءةٌ للجميع، ولا كتابةَ لأحد (لا سياسة INSERT/UPDATE)
DROP POLICY IF EXISTS kyvzon_hr_report_definitions_select ON public.hr_report_definitions;
CREATE POLICY kyvzon_hr_report_definitions_select ON public.hr_report_definitions
  FOR SELECT USING (TRUE);

-- ★★★ البوّابة الهجينة على وحدة `hr` — RESTRICTIVE إلزاماً (درسٌ متكرّر)
DROP POLICY IF EXISTS hybrid_gate_hr_report_runs ON public.hr_report_runs;
CREATE POLICY hybrid_gate_hr_report_runs ON public.hr_report_runs
  AS RESTRICTIVE FOR ALL
  USING (public.hybrid_allows_module('hr'))
  WITH CHECK (public.hybrid_allows_module('hr'));

DROP POLICY IF EXISTS kyvzon_hr_report_runs_select ON public.hr_report_runs;
CREATE POLICY kyvzon_hr_report_runs_select ON public.hr_report_runs
  FOR SELECT USING (
    tenant_id = public.current_user_tenant_id()
    AND public.current_user_is_staff()
  );

-- ★ الإدراج باسم النفس فقط — لا تسجيل تصديرٍ بإسم غيرك
DROP POLICY IF EXISTS kyvzon_hr_report_runs_insert ON public.hr_report_runs;
CREATE POLICY kyvzon_hr_report_runs_insert ON public.hr_report_runs
  FOR INSERT WITH CHECK (
    tenant_id = public.current_user_tenant_id()
    AND public.current_user_is_staff()
    AND executed_by = auth.uid()
  );

-- ★★★ لا سياسة UPDATE ولا DELETE: السجلّ التدقيقيّ لا يُعدَّل ولا يُمحى.

-- ★★ ومحفّزٌ يمنع الحذف حتى من مسارٍ يتجاوز RLS
CREATE OR REPLACE FUNCTION public.tg_block_hr_report_run_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'HR_REPORT_RUN_IMMUTABLE: سجلّ تشغيل التقرير أثرٌ تدقيقيٌّ لا يُعدَّل ولا يُحذف (id=%)',
    OLD.id;
END $$;

DROP TRIGGER IF EXISTS trg_block_hr_report_run_change ON public.hr_report_runs;
CREATE TRIGGER trg_block_hr_report_run_change
  BEFORE UPDATE OR DELETE ON public.hr_report_runs
  FOR EACH ROW EXECUTE FUNCTION public.tg_block_hr_report_run_change();

-- ═══════════════════════════════════════════════════════════════════
--  ⑤ الكتالوج المقروء
-- ═══════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.hr_report_catalog();
CREATE FUNCTION public.hr_report_catalog()
RETURNS TABLE (
  code           TEXT,
  name_ar        TEXT,
  description_ar TEXT,
  category       TEXT,
  columns_ar     TEXT[],
  needs_range    BOOLEAN,
  is_sensitive   BOOLEAN,
  last_run_at    TIMESTAMPTZ,
  runs_30d       INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'HR_REPORT_FORBIDDEN: تقارير الموارد البشرية للموارد البشرية والإدارة فقط';
  END IF;

  RETURN QUERY
  SELECT d.code, d.name_ar, d.description_ar, d.category, d.columns_ar,
         d.needs_range, d.is_sensitive,
         (SELECT max(r.executed_at) FROM public.hr_report_runs r
           WHERE r.report_code = d.code),
         (SELECT count(*) FROM public.hr_report_runs r
           WHERE r.report_code = d.code
             AND r.executed_at >= now() - INTERVAL '30 days')::INTEGER
  FROM public.hr_report_definitions d
  WHERE d.is_active
  -- ★★★ التذييل بـ`code`: `sort_order` وحده قد يتساوى (درس التغطية)
  ORDER BY d.sort_order, d.code;
END $$;

REVOKE ALL ON FUNCTION public.hr_report_catalog() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_report_catalog() FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_report_catalog() TO authenticated;

-- ═══════════════════════════════════════════════════════════════════
--  ⑥ مُعَنوِنُ الموظف — مشتركٌ بين خمسة تقارير
--     ★ `employees.full_name_ar` فارغٌ بنيوياً (كشفُ جولاتٍ سابقة)
--       ⇒ التسلسل: full_name_ar ← first+last ← profiles.full_name ← الرمز
-- ═══════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.hr_report_employee_label(UUID);
CREATE FUNCTION public.hr_report_employee_label(p_employee_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
           NULLIF(btrim(e.full_name_ar), ''),
           NULLIF(btrim(COALESCE(e.first_name,'') || ' ' || COALESCE(e.last_name,'')), ''),
           NULLIF(btrim((SELECT p.full_name FROM public.profiles p WHERE p.id = e.user_id)), ''),
           e.employee_code,
           'غير محدَّد')
  FROM public.employees e
  WHERE e.id = p_employee_id;
$$;

REVOKE ALL ON FUNCTION public.hr_report_employee_label(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_report_employee_label(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_report_employee_label(UUID) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════
--  ⑦ ★★★★ المنفّذ الموحَّد
--     SECURITY INVOKER ⇒ RLS سارية على كلّ جدولٍ يُقرأ.
--     يُعيد `total_rows` في كلّ صفٍّ فيُكشَف الاقتطاع (العطل ⑦).
-- ═══════════════════════════════════════════════════════════════════

-- ★ النوع المركَّب الذي تُبنى فيه صفوف التقرير
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
                  WHERE n.nspname='public' AND t.typname='hr_report_line') THEN
    CREATE TYPE public.hr_report_line AS (
      ord INTEGER, c1 TEXT, c2 TEXT, c3 TEXT, c4 TEXT, c5 TEXT, c6 TEXT, c7 TEXT
    );
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.hr_report_execute(TEXT, DATE, DATE, INTEGER);
CREATE FUNCTION public.hr_report_execute(
  p_code  TEXT,
  p_from  DATE    DEFAULT NULL,
  p_to    DATE    DEFAULT NULL,
  p_limit INTEGER DEFAULT 2000
)
RETURNS TABLE (
  row_index  INTEGER,
  c1 TEXT, c2 TEXT, c3 TEXT, c4 TEXT, c5 TEXT, c6 TEXT, c7 TEXT,
  total_rows INTEGER
)
LANGUAGE plpgsql
VOLATILE                       -- ★ تكتب في hr_report_runs
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_def     public.hr_report_definitions%ROWTYPE;
  v_tenant  UUID := public.current_user_tenant_id();
  v_today   DATE := (now() AT TIME ZONE 'Asia/Baghdad')::DATE;
  v_from    DATE;
  v_to      DATE;
  v_limit   INTEGER;
  v_total   INTEGER := 0;
  v_rows    INTEGER := 0;
  v_data    public.hr_report_line[];
BEGIN
  -- ★★★ العطل ⑤: المنع صريحٌ ومسموع بدل ملفٍّ فارغٍ صامت
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'HR_REPORT_FORBIDDEN: تقارير الموارد البشرية للموارد البشرية والإدارة فقط';
  END IF;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'HR_REPORT_NO_TENANT: لا مستأجرَ للمستخدم الحاليّ';
  END IF;

  SELECT * INTO v_def FROM public.hr_report_definitions d
   WHERE d.code = p_code AND d.is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'HR_REPORT_UNKNOWN: لا تقريرَ بالرمز %', p_code;
  END IF;

  -- ═══ النطاق (العطل ⑦) ═══
  IF v_def.needs_range THEN
    v_from := COALESCE(p_from, v_today - 90);
    v_to   := COALESCE(p_to,   v_today);
    IF v_from > v_to THEN
      RAISE EXCEPTION 'HR_REPORT_BAD_RANGE: تاريخ البداية % بعد تاريخ النهاية %', v_from, v_to;
    END IF;
    IF (v_to - v_from) > 366 THEN
      RAISE EXCEPTION 'HR_REPORT_RANGE_TOO_WIDE: النطاق % يوماً يتجاوز سنةً واحدة', (v_to - v_from);
    END IF;
  ELSE
    v_from := NULL;
    v_to   := NULL;
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 2000), 1), 5000);

  -- ═══ التقارير ═══
  --  ★★ البناء في مصفوفةٍ من نوعٍ مركَّب لا في جدولٍ مؤقّت: الجدول
  --     المؤقّت المُنشأ داخل PL/pgSQL يُبطل الخطط المُخبّأة بين
  --     المعاملات (relation with OID … does not exist). المصفوفة لا.

  IF p_code = 'workforce_kpi' THEN
    SELECT COALESCE(array_agg(ROW(k.ord,k.label,k.val,NULL,NULL,NULL,NULL,NULL)::public.hr_report_line
                              ORDER BY k.ord), '{}')
      INTO v_data
    FROM (
      SELECT 1 AS ord, 'إجمالي الموظفين'::TEXT AS label,
             (SELECT count(*) FROM public.employees)::TEXT AS val
      UNION ALL SELECT 2, 'الموظفون النشطون',
             (SELECT count(*) FROM public.employees WHERE is_active)::TEXT
      UNION ALL SELECT 3, 'غير النشطين',
             (SELECT count(*) FROM public.employees WHERE NOT is_active)::TEXT
      UNION ALL SELECT 4, 'عدد الأقسام',
             (SELECT count(*) FROM public.departments)::TEXT
      UNION ALL SELECT 5, 'البلاغات المفتوحة',
             (SELECT count(*) FROM public.incidents
               WHERE status NOT IN ('resolved','closed'))::TEXT
      UNION ALL SELECT 6, 'البلاغات الجسيمة المفتوحة',
             (SELECT count(*) FROM public.incidents
               WHERE status NOT IN ('resolved','closed')
                 AND severity IN ('high','critical'))::TEXT
      UNION ALL SELECT 7, 'إجازات قيد الانتظار',
             (SELECT count(*) FROM public.leaves WHERE status = 'انتظار')::TEXT
      UNION ALL SELECT 8, 'عقود تنتهي خلال 30 يوماً',
             (SELECT count(*) FROM public.employee_contracts
               WHERE status = 'active' AND end_date IS NOT NULL
                 AND end_date BETWEEN v_today AND v_today + 30)::TEXT
      UNION ALL SELECT 9, 'عقود منتهيةٌ ولم تُغلق',
             (SELECT count(*) FROM public.employee_contracts
               WHERE status = 'active' AND end_date IS NOT NULL
                 AND end_date < v_today)::TEXT
      UNION ALL SELECT 10, 'تاريخ التوليد (بغداد)', v_today::TEXT
    ) k;

  ELSIF p_code = 'headcount_by_department' THEN
    SELECT COALESCE(array_agg(ROW(x.ord,x.c1,x.c2,x.c3,x.c4,NULL,NULL,NULL)::public.hr_report_line
                              ORDER BY x.ord), '{}')
      INTO v_data
    FROM (
      SELECT row_number() OVER (ORDER BY count(*) DESC, COALESCE(d.name_ar,'بلا قسم'))::INTEGER AS ord,
             COALESCE(d.name_ar, 'بلا قسم')                    AS c1,
             count(*) FILTER (WHERE e.is_active)::TEXT          AS c2,
             count(*) FILTER (WHERE NOT e.is_active)::TEXT      AS c3,
             count(*)::TEXT                                     AS c4
      FROM public.employees e
      LEFT JOIN public.departments d ON d.id = e.department_id
      GROUP BY d.name_ar
    ) x;

  ELSIF p_code = 'attendance_detail' THEN
    SELECT COALESCE(array_agg(ROW(x.ord,x.c1,x.c2,x.c3,x.c4,x.c5,x.c6,x.c7)::public.hr_report_line
                              ORDER BY x.ord), '{}')
      INTO v_data
    FROM (
      SELECT row_number() OVER (ORDER BY a.shift_date DESC, a.id)::INTEGER AS ord,
             public.hr_report_employee_label(a.employee_id)   AS c1,
             a.shift_date::TEXT                               AS c2,
             COALESCE(a.status,'—')                           AS c3,
             COALESCE(to_char(a.check_in  AT TIME ZONE 'Asia/Baghdad','HH24:MI'),'—') AS c4,
             COALESCE(to_char(a.check_out AT TIME ZONE 'Asia/Baghdad','HH24:MI'),'—') AS c5,
             COALESCE(a.late_minutes,0)::TEXT                 AS c6,
             COALESCE(round(a.total_hours,2)::TEXT,'—')       AS c7
      FROM public.attendance_summary a
      WHERE a.shift_date BETWEEN v_from AND v_to
    ) x;

  ELSIF p_code = 'leaves_detail' THEN
    SELECT COALESCE(array_agg(ROW(x.ord,x.c1,x.c2,x.c3,x.c4,x.c5,x.c6,x.c7)::public.hr_report_line
                              ORDER BY x.ord), '{}')
      INTO v_data
    FROM (
      SELECT row_number() OVER (ORDER BY l.date_from DESC, l.id)::INTEGER AS ord,
             public.hr_report_employee_label(l.employee_id) AS c1,
             COALESCE(l.leave_type,'—')                     AS c2,
             l.date_from::TEXT                              AS c3,
             l.date_to::TEXT                                AS c4,
             COALESCE(l.working_days_count,0)::TEXT         AS c5,
             COALESCE(l.status,'—')                         AS c6,
             COALESCE((SELECT p.full_name FROM public.profiles p WHERE p.id = l.approved_by), '—') AS c7
      FROM public.leaves l
      -- ★ التقاطع لا الاحتواء: إجازةٌ تبدأ قبل النطاق وتمتدّ داخله تُحتسب
      WHERE l.date_from <= v_to AND l.date_to >= v_from
    ) x;

  ELSIF p_code = 'performance_summary' THEN
    SELECT COALESCE(array_agg(ROW(x.ord,x.c1,x.c2,x.c3,x.c4,x.c5,x.c6,NULL)::public.hr_report_line
                              ORDER BY x.ord), '{}')
      INTO v_data
    FROM (
      SELECT row_number() OVER (ORDER BY r.created_at DESC, r.id)::INTEGER AS ord,
             public.hr_report_employee_label(r.employee_id) AS c1,
             COALESCE((SELECT p.full_name FROM public.profiles p WHERE p.id = r.reviewer_id), '—') AS c2,
             -- ★ trim_scale: `score` نوعه NUMERIC فيطبع 88.00 بلا هذا
             COALESCE(trim_scale(r.score)::TEXT, '—')       AS c3,
             COALESCE(r.rating::TEXT, '—')                  AS c4,
             COALESCE(r.status, '—')                        AS c5,
             (r.created_at AT TIME ZONE 'Asia/Baghdad')::DATE::TEXT AS c6
      FROM public.performance_reviews r
      WHERE r.archived_at IS NULL
        AND (r.created_at AT TIME ZONE 'Asia/Baghdad')::DATE BETWEEN v_from AND v_to
    ) x;

  ELSIF p_code = 'incidents_detail' THEN
    SELECT COALESCE(array_agg(ROW(x.ord,x.c1,x.c2,x.c3,x.c4,x.c5,x.c6,NULL)::public.hr_report_line
                              ORDER BY x.ord), '{}')
      INTO v_data
    FROM (
      SELECT row_number() OVER (ORDER BY i.created_at DESC, i.id)::INTEGER AS ord,
             i.title::TEXT              AS c1,
             COALESCE(i.category,'—')::TEXT AS c2,
             COALESCE(i.severity,'—')::TEXT AS c3,
             COALESCE(i.status,'—')::TEXT   AS c4,
             -- ★★★★ العطل ②: الوعد يُحترم في القاعدة لا في الواجهة (درس 0338)
             (CASE WHEN i.is_anonymous THEN 'مُبلِّغ مجهول'
                   ELSE COALESCE(NULLIF(btrim(i.employee_name),''), 'غير محدَّد')
              END)::TEXT                AS c5,
             (i.created_at AT TIME ZONE 'Asia/Baghdad')::DATE::TEXT AS c6
      FROM public.incidents i
      WHERE i.archived_at IS NULL
        AND (i.created_at AT TIME ZONE 'Asia/Baghdad')::DATE BETWEEN v_from AND v_to
    ) x;

  ELSIF p_code = 'wellness_aggregate' THEN
    -- ★★★★ العطل ③: تجميعٌ بالقسم لا بالفرد، وحدٌّ أدنى k = 3
    SELECT COALESCE(array_agg(ROW(x.ord,x.c1,x.c2,x.c3,x.c4,x.c5,NULL,NULL)::public.hr_report_line
                              ORDER BY x.ord), '{}')
      INTO v_data
    FROM (
      SELECT row_number() OVER (ORDER BY g.entries DESC, g.dept)::INTEGER AS ord,
             g.dept                        AS c1,
             g.entries::TEXT               AS c2,
             round(g.avg_score,1)::TEXT    AS c3,
             round(g.avg_stress,1)::TEXT   AS c4,
             round(g.avg_energy,1)::TEXT   AS c5
      FROM (
        SELECT bucket.dept,
               count(*)           AS entries,
               avg(bucket.score)  AS avg_score,
               avg(bucket.stress) AS avg_stress,
               avg(bucket.energy) AS avg_energy
        FROM (
          SELECT CASE WHEN cnt.n >= 3 THEN cnt.dept ELSE 'أقسام أخرى' END AS dept,
                 cnt.score, cnt.stress, cnt.energy
          FROM (
            SELECT COALESCE(d.name_ar,'بلا قسم') AS dept,
                   w.score, w.stress, w.energy,
                   count(*) OVER (PARTITION BY COALESCE(d.name_ar,'بلا قسم')) AS n
            FROM public.wellness_entries w
            LEFT JOIN public.employees   e ON e.id = w.employee_id
            LEFT JOIN public.departments d ON d.id = e.department_id
            WHERE w.date BETWEEN v_from AND v_to
          ) cnt
        ) bucket
        GROUP BY bucket.dept
      ) g
    ) x;

  ELSIF p_code = 'contracts_expiry' THEN
    SELECT COALESCE(array_agg(ROW(x.ord,x.c1,x.c2,x.c3,x.c4,x.c5,x.c6,x.c7)::public.hr_report_line
                              ORDER BY x.ord), '{}')
      INTO v_data
    FROM (
      SELECT row_number() OVER (ORDER BY c.end_date NULLS LAST, c.id)::INTEGER AS ord,
             COALESCE(c.contract_number,'—')                AS c1,
             public.hr_report_employee_label(c.employee_id) AS c2,
             COALESCE(c.contract_type,'—')                  AS c3,
             COALESCE(c.start_date::TEXT,'—')               AS c4,
             COALESCE(c.end_date::TEXT,'مفتوح')             AS c5,
             (CASE WHEN c.end_date IS NULL THEN '—'
                   ELSE (c.end_date - v_today)::TEXT END)   AS c6,
             COALESCE(c.status,'—')                         AS c7
      FROM public.employee_contracts c
    ) x;

  ELSE
    -- ★ لا فرعَ `else` يُخرج «بيانات تجريبية» — الرمز المجهول رُفض أعلاه
    RAISE EXCEPTION 'HR_REPORT_NOT_IMPLEMENTED: الرمز % مُعرَّفٌ بلا تنفيذ', p_code;
  END IF;

  v_total := COALESCE(array_length(v_data, 1), 0);
  v_rows  := LEAST(v_total, v_limit);

  -- ★★★ الأثر التدقيقيّ (العطل ④) — يُكتب حتى لو كانت النتيجة صفراً
  INSERT INTO public.hr_report_runs
    (tenant_id, report_code, executed_by, date_from, date_to,
     row_count, total_rows, was_truncated)
  VALUES (v_tenant, p_code, auth.uid(), v_from, v_to,
          v_rows, v_total, v_total > v_rows);

  RETURN QUERY
  SELECT o.ord, o.c1, o.c2, o.c3, o.c4, o.c5, o.c6, o.c7, v_total
  FROM unnest(v_data) AS o
  ORDER BY o.ord
  LIMIT v_limit;
END $$;

REVOKE ALL ON FUNCTION public.hr_report_execute(TEXT, DATE, DATE, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_report_execute(TEXT, DATE, DATE, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_report_execute(TEXT, DATE, DATE, INTEGER) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════
--  ⑧ لوح سجلّ التصديرات — «من صدّر ماذا ومتى»
-- ═══════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.hr_report_run_board(INTEGER);
CREATE FUNCTION public.hr_report_run_board(p_limit INTEGER DEFAULT 50)
RETURNS TABLE (
  id            UUID,
  report_code   TEXT,
  report_name   TEXT,
  is_sensitive  BOOLEAN,
  actor_name    TEXT,
  executed_at   TIMESTAMPTZ,
  date_from     DATE,
  date_to       DATE,
  row_count     INTEGER,
  total_rows    INTEGER,
  was_truncated BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'HR_REPORT_FORBIDDEN: سجلّ التصديرات للموارد البشرية والإدارة فقط';
  END IF;

  RETURN QUERY
  SELECT r.id, r.report_code, d.name_ar, d.is_sensitive,
         COALESCE(NULLIF(btrim(p.full_name),''), 'غير معروف'),
         r.executed_at, r.date_from, r.date_to,
         r.row_count, r.total_rows, r.was_truncated
  FROM public.hr_report_runs r
  JOIN public.hr_report_definitions d ON d.code = r.report_code
  LEFT JOIN public.profiles p ON p.id = r.executed_by
  -- ★★★ التذييل بـ`id`: `executed_at` طابعُ المعاملة فيتساوى في الدفعة
  ORDER BY r.executed_at DESC, r.id
  LIMIT LEAST(GREATEST(COALESCE(p_limit,50),1),500);
END $$;

REVOKE ALL ON FUNCTION public.hr_report_run_board(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_report_run_board(INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_report_run_board(INTEGER) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════
--  ⑨ الصلاحيات على الجدولين
--     ★★★ `pg_default_acl` من 0268 يمنح authenticated تلقائياً
--       ⇒ REVOKE … FROM anon هو الحارس الحقيقيّ
-- ═══════════════════════════════════════════════════════════════════

REVOKE ALL ON public.hr_report_definitions FROM anon;
REVOKE ALL ON public.hr_report_runs        FROM anon;
GRANT SELECT ON public.hr_report_definitions TO authenticated;
GRANT SELECT, INSERT ON public.hr_report_runs TO authenticated;
REVOKE UPDATE, DELETE ON public.hr_report_runs FROM authenticated;
