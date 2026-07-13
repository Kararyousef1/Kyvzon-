-- ============================================================================
-- Kyvzon Platform - Developer Portal Migration
-- بوابه المطور الخاصه بـ Kyvzon لإدارة الشركات المشتركه
-- ============================================================================
-- هذا الملف ينشئ:
-- 1. جدول tenant_subscriptions - تفاصيل اشتراكات الشركات
-- 2. جدول platform_audit_log - سجل عمليات المنصة
-- 3. جدول platform_settings - إعدادات المنصة العامة
-- 4. توسيع جدول tenants بحقول إضافية
-- ============================================================================

-- ============================================================================
-- 1. توسيع جدول tenants - إضافة حقول الإدارة
-- ============================================================================

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS contact_name VARCHAR(200),
  ADD COLUMN IF NOT EXISTS contact_email VARCHAR(200),
  ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(50),
  ADD COLUMN IF NOT EXISTS max_employees INTEGER DEFAULT 50,
  ADD COLUMN IF NOT EXISTS subscription_plan VARCHAR(50) DEFAULT 'basic'
    CHECK (subscription_plan IN ('basic', 'professional', 'enterprise', 'custom')),
  ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(30) DEFAULT 'active'
    CHECK (subscription_status IN ('trial', 'active', 'grace_period', 'expired', 'cancelled')),
  ADD COLUMN IF NOT EXISTS subscription_start_date DATE,
  ADD COLUMN IF NOT EXISTS subscription_end_date DATE,
  ADD COLUMN IF NOT EXISTS features JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS enabled_modules JSONB DEFAULT '["employee","hr","admin","gatekeeper","tawathul"]'::jsonb;

-- تحديث الشركات الحالية بقيم افتراضية
UPDATE public.tenants 
SET 
  subscription_plan = COALESCE(subscription_plan, 'basic'),
  subscription_status = CASE 
    WHEN status = 'trial' THEN 'trial'
    WHEN status = 'active' THEN 'active'
    WHEN status = 'suspended' THEN 'expired'
    ELSE 'active'
  END,
  subscription_start_date = COALESCE(subscription_start_date, created_at::DATE),
  max_employees = COALESCE(max_employees, 50),
  features = COALESCE(features, '[]'::jsonb)
WHERE subscription_plan IS NULL;

-- ============================================================================
-- 2. جدول اشتراكات الشركات (سجل تاريخي)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tenant_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  
  -- تفاصيل الاشتراك
  plan VARCHAR(50) NOT NULL DEFAULT 'basic'
    CHECK (plan IN ('basic', 'professional', 'enterprise', 'custom')),
  status VARCHAR(30) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'cancelled', 'expired', 'upgraded')),
  
  -- الفترة
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  
  -- المبلغ والعملة
  amount DECIMAL(12,2),
  currency VARCHAR(10) DEFAULT 'IQD',
  payment_method VARCHAR(50),
  payment_reference VARCHAR(200),
  
  -- العداد
  max_employees INTEGER DEFAULT 50,
  features JSONB DEFAULT '[]'::jsonb,
  
  -- ملاحظات
  notes TEXT,
  
  -- الطوابع
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- فهارس
CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_tenant ON public.tenant_subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_status ON public.tenant_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_dates ON public.tenant_subscriptions(start_date, end_date);

-- مشغل updated_at
DROP TRIGGER IF EXISTS update_tenant_subscriptions_updated_at ON public.tenant_subscriptions;
CREATE TRIGGER update_tenant_subscriptions_updated_at
  BEFORE UPDATE ON public.tenant_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.tenant_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_subscriptions_platform_select ON public.tenant_subscriptions
  FOR SELECT USING (
    current_setting('app.current_role', true) IN ('platform_owner', 'developer')
  );

CREATE POLICY tenant_subscriptions_platform_all ON public.tenant_subscriptions
  FOR ALL USING (
    current_setting('app.current_role', true) = 'platform_owner'
  );

-- ============================================================================
-- 3. جدول سجل عمليات المنصة (Platform Audit Log)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.platform_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- نوع العملية
  action VARCHAR(50) NOT NULL,
  category VARCHAR(50) NOT NULL DEFAULT 'general'
    CHECK (category IN ('company', 'subscription', 'security', 'system', 'general')),
  
  -- الفاعل
  actor_id UUID REFERENCES auth.users(id),
  actor_name VARCHAR(200),
  actor_role VARCHAR(50),
  
  -- الهدف
  target_type VARCHAR(50),
  target_id UUID,
  target_name VARCHAR(200),
  
  -- التفاصيل
  details JSONB DEFAULT '{}'::jsonb,
  description TEXT,
  
  -- معلومات الجهاز
  ip_address VARCHAR(45),
  user_agent TEXT,
  
  -- الطابع الزمني
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- فهارس
CREATE INDEX IF NOT EXISTS idx_platform_audit_action ON public.platform_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_platform_audit_category ON public.platform_audit_log(category);
CREATE INDEX IF NOT EXISTS idx_platform_audit_created ON public.platform_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_audit_actor ON public.platform_audit_log(actor_id);

-- RLS
ALTER TABLE public.platform_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY platform_audit_select ON public.platform_audit_log
  FOR SELECT USING (
    current_setting('app.current_role', true) IN ('platform_owner', 'developer')
  );

CREATE POLICY platform_audit_insert ON public.platform_audit_log
  FOR INSERT WITH CHECK (
    current_setting('app.current_role', true) IN ('platform_owner', 'developer')
  );

-- ============================================================================
-- 4. دالة مساعدة: إحصاءات الشركة
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_tenant_stats(p_tenant_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
  v_total_users INTEGER;
  v_active_users INTEGER;
  v_total_incidents INTEGER;
  v_open_incidents INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_total_users FROM public.profiles WHERE tenant_id = p_tenant_id;
  SELECT COUNT(*) INTO v_active_users FROM public.profiles WHERE tenant_id = p_tenant_id AND status = 'active';
  SELECT COUNT(*) INTO v_total_incidents FROM public.incidents WHERE tenant_id = p_tenant_id;
  SELECT COUNT(*) INTO v_open_incidents FROM public.incidents WHERE tenant_id = p_tenant_id AND status IN ('pending', 'in_progress');
  
  v_result := jsonb_build_object(
    'total_users', v_total_users,
    'active_users', v_active_users,
    'total_incidents', v_total_incidents,
    'open_incidents', v_open_incidents
  );
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================================
-- 5. إضافة بيانات تجريبية للشركات (للتطوير)
-- ============================================================================

-- تحديث الشركة الافتراضية بمعلومات Kyvzon
UPDATE public.tenants 
SET 
  name_ar = 'Kyvzon Platform',
  name_en = 'Kyvzon Platform',
  slug = 'kyvzon',
  contact_name = 'فريق Kyvzon',
  contact_email = 'admin@kyvzon.com',
  subscription_plan = 'enterprise',
  subscription_status = 'active',
  subscription_start_date = '2025-01-01',
  subscription_end_date = '2030-12-31',
  max_employees = 9999,
  features = '["all"]'::jsonb,
  logo_url = '/icons/icon-512.png'
WHERE slug = 'default-company';

-- ============================================================================
-- تم الانتهاء من Migration 200
-- ============================================================================
