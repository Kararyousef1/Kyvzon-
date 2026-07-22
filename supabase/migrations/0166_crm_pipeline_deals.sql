-- ============================================================================
-- Kyvzon — 0166_crm_pipeline_deals.sql
-- بوابة CRM — الوحدة 2: خط الأنابيب والصفقات (التقرير 02)
--
-- تُنفّذ كل ما ورد في تقرير "إدارة خط الأنابيب والصفقات" وفق المعايير العالمية:
--   • Pipelines متعددة (new_business / renewals / expansion / partner) — كل واحد بمراحله.
--   • المراحل (Stages): اسم + احتمالية إغلاق + شرط خروج (Exit Criteria) + ترتيب + نوع (open/won/lost).
--   • الصفقات (Deals): سجل كامل — قيمة، تاريخ إغلاق متوقع (إلزامي)، مصدر، صاحب صفقة،
--     ربط بالحساب وجهة الاتصال، السياق التنافسي (نقاط قوة/مخاطر/مؤيدون/معارضون/منافسون).
--   • تأهيل BANT (Budget/Authority/Need/Timeline) على مستوى الصفقة.
--   • Kanban: يعتمد على stage_id + الترتيب (الواجهة).
--   • تنبيهات الركود (Stagnation) عبر دالة crm_deal_stagnation_alerts (عتبات التقرير).
--   • تحليل Win/Loss: أسباب خسارة معيارية (crm_deal_loss_reasons) + إلزام السبب عند الخسارة.
--   • Deal Velocity: دالة crm_deal_velocity = (عدد×متوسط×معدل فوز)÷دورة المبيعات.
--   • سجل مراحل الصفقة (stage history) لحساب مدة كل مرحلة ودورة المبيعات.
--   • الربط: صفقة فائزة → ترفع lifetime_value للحساب + تحوّله customer + تسجّل في الجدول الزمني.
--
-- التصميم:
--   - كل جدول tenant-scoped مع RLS — بادئة crm_* صارمة.
--   - الدوال الحساسة SECURITY DEFINER + SET search_path = public + فحص tenant_id.
--   - seed لخطوط الأنابيب الافتراضية عبر دالة crm_seed_default_pipeline (اختياري لكل مستأجر).
--
-- idempotent وآمن لإعادة التشغيل.
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
--  (1) خطوط الأنابيب — Pipelines (متعددة)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.crm_pipelines (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  pipeline_type TEXT NOT NULL DEFAULT 'new_business'
                CHECK (pipeline_type IN ('new_business','renewals','expansion','partner')),
  description   TEXT,
  is_default    BOOLEAN NOT NULL DEFAULT false,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_pipelines_tenant ON public.crm_pipelines(tenant_id, pipeline_type);

-- ════════════════════════════════════════════════════════════════════════════
--  (2) المراحل — Stages (احتمالية + شرط خروج + نوع)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.crm_stages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  pipeline_id   UUID NOT NULL REFERENCES public.crm_pipelines(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  -- نوع المرحلة: مفتوحة / فوز / خسارة (لتمييز الإغلاق)
  stage_type    TEXT NOT NULL DEFAULT 'open' CHECK (stage_type IN ('open','won','lost')),
  probability   INTEGER NOT NULL DEFAULT 0 CHECK (probability BETWEEN 0 AND 100),
  exit_criteria TEXT,                                              -- شرط الخروج (العقد)
  -- عتبة الركود بالأيام لهذه المرحلة (تنبيه إذا لم تتحرك الصفقة)
  stagnation_days INTEGER,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_stages_pipeline ON public.crm_stages(pipeline_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_crm_stages_tenant   ON public.crm_stages(tenant_id);

-- ════════════════════════════════════════════════════════════════════════════
--  (3) أسباب الخسارة — Loss Reasons (معيارية، لتحليل Win/Loss)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.crm_deal_loss_reasons (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code          TEXT NOT NULL,                                     -- price / features / timing / build_internal / trust / not_fit
  label         TEXT NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, code)
);
CREATE INDEX IF NOT EXISTS idx_crm_loss_reasons_tenant ON public.crm_deal_loss_reasons(tenant_id);

-- ════════════════════════════════════════════════════════════════════════════
--  (4) الصفقات — Deals (السجل الكامل + السياق التنافسي + BANT)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.crm_deals (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  pipeline_id         UUID NOT NULL REFERENCES public.crm_pipelines(id) ON DELETE CASCADE,
  stage_id            UUID NOT NULL REFERENCES public.crm_stages(id) ON DELETE RESTRICT,
  name                TEXT NOT NULL,
  account_id          UUID REFERENCES public.crm_accounts(id) ON DELETE SET NULL,
  primary_contact_id  UUID REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  -- القيمة
  amount              NUMERIC(16,2) NOT NULL DEFAULT 0,
  currency            TEXT NOT NULL DEFAULT 'SAR',
  value_type          TEXT NOT NULL DEFAULT 'annual' CHECK (value_type IN ('annual','one_time','lifetime')),
  expected_close_date DATE NOT NULL,                              -- إلزامي (لا صفقة بلا تاريخ)
  -- الحالة
  status              TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','won','lost')),
  probability         INTEGER NOT NULL DEFAULT 0 CHECK (probability BETWEEN 0 AND 100),
  source              TEXT,                                        -- website / referral / event / outbound
  owner_id            UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- السياق التنافسي
  competitors         TEXT[] NOT NULL DEFAULT '{}',
  our_strengths       TEXT,
  risks               TEXT,
  champions           TEXT,                                        -- المؤيدون داخل الحساب
  detractors          TEXT,                                        -- المعارضون
  -- تأهيل BANT
  bant_budget         BOOLEAN,
  bant_authority      BOOLEAN,
  bant_need           BOOLEAN,
  bant_timeline       BOOLEAN,
  -- الإغلاق
  won_at              TIMESTAMPTZ,
  lost_at             TIMESTAMPTZ,
  loss_reason_id      UUID REFERENCES public.crm_deal_loss_reasons(id) ON DELETE SET NULL,
  loss_competitor     TEXT,                                        -- من فاز بدلاً منا
  loss_learning       TEXT,                                        -- ماذا كان يمكن فعله
  -- الربط المالي (يُملأ عند التوصيل الصريح بالمالية لاحقاً)
  finance_customer_id UUID,
  -- تتبّع الركود
  last_stage_change_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity_at     TIMESTAMPTZ,
  notes               TEXT,
  created_by          UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_deals_tenant   ON public.crm_deals(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_crm_deals_pipeline ON public.crm_deals(pipeline_id, stage_id);
CREATE INDEX IF NOT EXISTS idx_crm_deals_account  ON public.crm_deals(account_id);
CREATE INDEX IF NOT EXISTS idx_crm_deals_owner    ON public.crm_deals(tenant_id, owner_id);
CREATE INDEX IF NOT EXISTS idx_crm_deals_close    ON public.crm_deals(tenant_id, expected_close_date);

-- ════════════════════════════════════════════════════════════════════════════
--  (5) سجل مراحل الصفقة — Stage history (لحساب مدة كل مرحلة ودورة المبيعات)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.crm_deal_stage_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  deal_id       UUID NOT NULL REFERENCES public.crm_deals(id) ON DELETE CASCADE,
  from_stage_id UUID REFERENCES public.crm_stages(id) ON DELETE SET NULL,
  to_stage_id   UUID NOT NULL REFERENCES public.crm_stages(id) ON DELETE CASCADE,
  changed_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  changed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_stage_history_deal ON public.crm_deal_stage_history(deal_id, changed_at);

-- ════════════════════════════════════════════════════════════════════════════
--  (6) تفعيل RLS + سياسات العزل
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'crm_pipelines','crm_stages','crm_deal_loss_reasons','crm_deals','crm_deal_stage_history'
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
--  (7) نقل صفقة بين المراحل — Move deal (يحدّث الاحتمالية + يسجّل التاريخ)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.crm_move_deal_stage(p_deal_id UUID, p_to_stage_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID; v_from UUID; v_prob INTEGER; v_stage_type TEXT; v_stage_tenant UUID;
BEGIN
  SELECT tenant_id, stage_id INTO v_tenant, v_from FROM public.crm_deals WHERE id = p_deal_id;
  IF v_tenant IS NULL OR v_tenant <> public.current_user_tenant_id() THEN
    RAISE EXCEPTION 'ACCESS_DENIED: deal not in tenant';
  END IF;

  SELECT tenant_id, probability, stage_type INTO v_stage_tenant, v_prob, v_stage_type
  FROM public.crm_stages WHERE id = p_to_stage_id;
  IF v_stage_tenant IS NULL OR v_stage_tenant <> v_tenant THEN
    RAISE EXCEPTION 'INVALID: target stage not in tenant';
  END IF;

  -- ملاحظة: الانتقال لمرحلة فوز/خسارة يجب أن يمرّ عبر crm_close_deal لضمان توثيق السبب.
  IF v_stage_type IN ('won','lost') THEN
    RAISE EXCEPTION 'USE_CLOSE_DEAL: closing stages require crm_close_deal (win/loss documentation)';
  END IF;

  UPDATE public.crm_deals
    SET stage_id = p_to_stage_id, probability = v_prob,
        last_stage_change_at = NOW(), updated_at = NOW()
    WHERE id = p_deal_id;

  INSERT INTO public.crm_deal_stage_history (tenant_id, deal_id, from_stage_id, to_stage_id, changed_by)
  VALUES (v_tenant, p_deal_id, v_from, p_to_stage_id, auth.uid());
END $$;

-- ════════════════════════════════════════════════════════════════════════════
--  (8) إغلاق صفقة — Close deal (win/loss) مع إلزام سبب الخسارة + الربط بالحساب
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.crm_close_deal(
  p_deal_id         UUID,
  p_outcome         TEXT,                                          -- 'won' | 'lost'
  p_loss_reason_id  UUID    DEFAULT NULL,
  p_loss_competitor TEXT    DEFAULT NULL,
  p_loss_learning   TEXT    DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID; v_from UUID; v_amount NUMERIC; v_account UUID; v_close_stage UUID; v_pipeline UUID;
BEGIN
  IF p_outcome NOT IN ('won','lost') THEN
    RAISE EXCEPTION 'INVALID: outcome must be won or lost';
  END IF;

  SELECT tenant_id, stage_id, amount, account_id, pipeline_id
    INTO v_tenant, v_from, v_amount, v_account, v_pipeline
  FROM public.crm_deals WHERE id = p_deal_id;
  IF v_tenant IS NULL OR v_tenant <> public.current_user_tenant_id() THEN
    RAISE EXCEPTION 'ACCESS_DENIED';
  END IF;

  -- تحليل Win/Loss: سبب الخسارة إلزامي عند الخسارة
  IF p_outcome = 'lost' AND p_loss_reason_id IS NULL THEN
    RAISE EXCEPTION 'LOSS_REASON_REQUIRED: توثيق سبب الخسارة إلزامي';
  END IF;

  -- المرحلة الإغلاقية المطابقة في نفس الـ pipeline
  SELECT id INTO v_close_stage FROM public.crm_stages
    WHERE pipeline_id = v_pipeline AND stage_type = p_outcome
    ORDER BY sort_order LIMIT 1;

  IF p_outcome = 'won' THEN
    UPDATE public.crm_deals
      SET status = 'won', probability = 100, won_at = NOW(),
          stage_id = COALESCE(v_close_stage, stage_id),
          last_stage_change_at = NOW(), updated_at = NOW()
      WHERE id = p_deal_id;

    -- الربط: رفع lifetime_value وتحويل الحساب لعميل + تسجيل في الجدول الزمني
    IF v_account IS NOT NULL THEN
      UPDATE public.crm_accounts
        SET lifetime_value = lifetime_value + COALESCE(v_amount, 0),
            account_type = 'customer',
            last_deal_at = NOW(),
            first_deal_at = COALESCE(first_deal_at, NOW()),
            updated_at = NOW()
        WHERE id = v_account;

      INSERT INTO public.crm_activities_timeline
        (tenant_id, account_id, activity_type, direction, title, body, logged_via, created_by)
      VALUES (v_tenant, v_account, 'deal', 'internal',
              'فوز بصفقة',
              format('تم كسب صفقة بقيمة %s', COALESCE(v_amount, 0)), 'auto', auth.uid());
    END IF;
  ELSE
    UPDATE public.crm_deals
      SET status = 'lost', probability = 0, lost_at = NOW(),
          loss_reason_id = p_loss_reason_id, loss_competitor = p_loss_competitor,
          loss_learning = p_loss_learning,
          stage_id = COALESCE(v_close_stage, stage_id),
          last_stage_change_at = NOW(), updated_at = NOW()
      WHERE id = p_deal_id;

    IF v_account IS NOT NULL THEN
      INSERT INTO public.crm_activities_timeline
        (tenant_id, account_id, activity_type, direction, title, logged_via, created_by)
      VALUES (v_tenant, v_account, 'deal', 'internal', 'خسارة صفقة', 'auto', auth.uid());
    END IF;
  END IF;

  -- سجل المرحلة
  IF v_close_stage IS NOT NULL AND v_close_stage <> v_from THEN
    INSERT INTO public.crm_deal_stage_history (tenant_id, deal_id, from_stage_id, to_stage_id, changed_by)
    VALUES (v_tenant, p_deal_id, v_from, v_close_stage, auth.uid());
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
--  (9) مقياس سرعة الصفقة — Deal Velocity
--  = (عدد الصفقات المفتوحة × متوسط القيمة × معدل الفوز) ÷ متوسط دورة المبيعات (أيام)
--  معدل الفوز ودورة المبيعات محسوبان من الصفقات المُغلقة تاريخياً.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.crm_deal_velocity(p_pipeline_id UUID DEFAULT NULL)
RETURNS TABLE (
  open_deals      INTEGER,
  avg_value       NUMERIC,
  win_rate        NUMERIC,
  avg_cycle_days  NUMERIC,
  velocity_per_day NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_open INT; v_avg NUMERIC; v_won INT; v_closed INT; v_winrate NUMERIC; v_cycle NUMERIC;
BEGIN
  SELECT COUNT(*), COALESCE(AVG(amount), 0)
    INTO v_open, v_avg
  FROM public.crm_deals
  WHERE tenant_id = v_tenant AND status = 'open'
    AND (p_pipeline_id IS NULL OR pipeline_id = p_pipeline_id);

  SELECT
    COUNT(*) FILTER (WHERE status = 'won'),
    COUNT(*) FILTER (WHERE status IN ('won','lost'))
    INTO v_won, v_closed
  FROM public.crm_deals
  WHERE tenant_id = v_tenant
    AND (p_pipeline_id IS NULL OR pipeline_id = p_pipeline_id);

  v_winrate := CASE WHEN v_closed > 0 THEN v_won::NUMERIC / v_closed ELSE 0 END;

  SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (COALESCE(won_at, lost_at) - created_at)) / 86400.0), 0)
    INTO v_cycle
  FROM public.crm_deals
  WHERE tenant_id = v_tenant AND status IN ('won','lost')
    AND (p_pipeline_id IS NULL OR pipeline_id = p_pipeline_id);

  RETURN QUERY SELECT
    v_open,
    ROUND(v_avg, 2),
    ROUND(v_winrate * 100, 1),
    ROUND(v_cycle, 1),
    CASE WHEN v_cycle > 0 THEN ROUND((v_open * v_avg * v_winrate) / v_cycle, 2) ELSE 0 END;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
--  (10) تنبيهات ركود الصفقات — Stagnation Alerts (عتبات التقرير/المرحلة)
--  يعيد الصفقات المفتوحة التي تجاوزت عتبة الركود لمرحلتها، أو تجاوزت تاريخ الإغلاق.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.crm_deal_stagnation_alerts()
RETURNS TABLE (
  deal_id         UUID,
  deal_name       TEXT,
  stage_name      TEXT,
  days_in_stage   INTEGER,
  threshold_days  INTEGER,
  alert_type      TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_tenant UUID := public.current_user_tenant_id();
BEGIN
  RETURN QUERY
  SELECT
    d.id, d.name, s.name,
    FLOOR(EXTRACT(EPOCH FROM (NOW() - d.last_stage_change_at)) / 86400.0)::INT,
    s.stagnation_days,
    CASE
      WHEN d.expected_close_date < CURRENT_DATE THEN 'overdue_close'
      WHEN s.stagnation_days IS NOT NULL
           AND EXTRACT(EPOCH FROM (NOW() - d.last_stage_change_at)) / 86400.0 > s.stagnation_days
           THEN 'stagnant'
      WHEN d.expected_close_date <= CURRENT_DATE + 7 THEN 'closing_soon'
      ELSE 'ok'
    END
  FROM public.crm_deals d
  JOIN public.crm_stages s ON s.id = d.stage_id
  WHERE d.tenant_id = v_tenant AND d.status = 'open'
    AND (
      d.expected_close_date <= CURRENT_DATE + 7
      OR (s.stagnation_days IS NOT NULL
          AND EXTRACT(EPOCH FROM (NOW() - d.last_stage_change_at)) / 86400.0 > s.stagnation_days)
    );
END $$;

-- ════════════════════════════════════════════════════════════════════════════
--  (11) seed خط أنابيب افتراضي + أسباب الخسارة (اختياري لكل مستأجر)
--  ينشئ Pipeline "مبيعات جديدة" بالمراحل الست من التقرير إن لم يوجد.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.crm_seed_default_pipeline()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_pid UUID;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  SELECT id INTO v_pid FROM public.crm_pipelines
    WHERE tenant_id = v_tenant AND pipeline_type = 'new_business' AND is_default = true LIMIT 1;
  IF v_pid IS NOT NULL THEN RETURN v_pid; END IF;

  INSERT INTO public.crm_pipelines (tenant_id, name, pipeline_type, is_default, created_by)
  VALUES (v_tenant, 'مبيعات جديدة', 'new_business', true, auth.uid())
  RETURNING id INTO v_pid;

  INSERT INTO public.crm_stages (tenant_id, pipeline_id, name, stage_type, probability, exit_criteria, stagnation_days, sort_order) VALUES
    (v_tenant, v_pid, 'عميل محتمل جديد', 'open', 8,  'التحقق من البريد والهاتف وتحديد موعد للتأهيل', NULL, 1),
    (v_tenant, v_pid, 'تأهيل',           'open', 22, 'الإجابة على BANT (ميزانية/صلاحية/حاجة/توقيت)', 7,    2),
    (v_tenant, v_pid, 'اجتماع اكتشاف',   'open', 35, 'خريطة المشكلات موثّقة + معايير الحكم على الحل', 14,   3),
    (v_tenant, v_pid, 'عرض/حل مقترح',    'open', 55, 'تلقّوا العرض وأبدوا ردود فعل محددة',           10,   4),
    (v_tenant, v_pid, 'تفاوض',           'open', 75, 'العرض النهائي أُرسل أو العقد قيد المراجعة',    NULL, 5),
    (v_tenant, v_pid, 'فوز',             'won',  100,'تم التوقيع والدفع',                            NULL, 6),
    (v_tenant, v_pid, 'خسارة',           'lost', 0,  'خسرنا الصفقة — مع توثيق السبب',                NULL, 7);

  -- أسباب الخسارة المعيارية
  INSERT INTO public.crm_deal_loss_reasons (tenant_id, code, label) VALUES
    (v_tenant, 'price',          'السعر — أغلى من المنافس أو الميزانية'),
    (v_tenant, 'features',       'الميزات — المنافس لديه ميزة نفتقرها'),
    (v_tenant, 'timing',         'التوقيت — المشروع تأجّل أو تجمّدت الميزانية'),
    (v_tenant, 'build_internal', 'التنافس الداخلي — قرروا بناء الحل بأنفسهم'),
    (v_tenant, 'trust',          'الثقة — لم نبنِ ثقة كافية مع صاحب القرار'),
    (v_tenant, 'not_fit',        'عدم الملاءمة — لم نكن الحل الصحيح')
  ON CONFLICT (tenant_id, code) DO NOTHING;

  RETURN v_pid;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
--  (12) صلاحيات التنفيذ
-- ════════════════════════════════════════════════════════════════════════════
GRANT EXECUTE ON FUNCTION public.crm_move_deal_stage(UUID, UUID)                        TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_close_deal(UUID, TEXT, UUID, TEXT, TEXT)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_deal_velocity(UUID)                                TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_deal_stagnation_alerts()                           TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_seed_default_pipeline()                            TO authenticated;

-- ============================================================================
-- نهاية 0166 — الوحدة 2 (خط الأنابيب والصفقات) مكتملة.
-- ============================================================================
