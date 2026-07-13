-- ============================================================================
-- Kyvzon Platform
-- Migration 100: Multi-Tenant Foundation - جدول الشركات
-- ============================================================================
-- هذا الملف يُنشئ البنية الأساسية لنظام Multi-Tenant
-- يعتمد على التصميم المعتمد في Architecture Design Freeze v1.0
-- ============================================================================

-- ============================================================================
-- 1. جدول الشركات (Tenants)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- اسم الشركة
  name_ar VARCHAR(200) NOT NULL,
  name_en VARCHAR(200),
  
  -- المعرف المختصر للـ Subdomain (مثال: kyvzon → kyvzon.platform.com)
  slug VARCHAR(100) UNIQUE NOT NULL,
  
  -- حالة الشركة
  status VARCHAR(20) NOT NULL DEFAULT 'trial'
    CHECK (status IN ('trial', 'active', 'suspended', 'expired', 'deleted')),
  
  -- الشعار والنطاق المخصص
  logo_url VARCHAR(500),
  domain VARCHAR(255),
  
  -- الإعدادات (JSONB)
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  -- الطابع الزمني
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- الحذف المنطقي (Soft Delete)
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES auth.users(id)
);

-- ============================================================================
-- 2. الفهارس
-- ============================================================================

CREATE INDEX idx_tenants_slug ON public.tenants(slug);
CREATE INDEX idx_tenants_status ON public.tenants(status);
CREATE INDEX idx_tenants_created_at ON public.tenants(created_at DESC);

-- ============================================================================
-- 3. مشغل تحديث updated_at تلقائياً
-- ============================================================================

DROP TRIGGER IF EXISTS update_tenants_updated_at ON public.tenants;
CREATE TRIGGER update_tenants_updated_at
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 4. دالة التحقق من slug فريد
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_slug_available(p_slug VARCHAR(100), p_exclude_id UUID DEFAULT NULL)
RETURNS BOOLEAN AS $$
BEGIN
  IF p_exclude_id IS NOT NULL THEN
    RETURN NOT EXISTS (
      SELECT 1 FROM public.tenants 
      WHERE slug = p_slug AND id != p_exclude_id AND deleted_at IS NULL
    );
  ELSE
    RETURN NOT EXISTS (
      SELECT 1 FROM public.tenants 
      WHERE slug = p_slug AND deleted_at IS NULL
    );
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- 5. صلاحيات الجدول (RLS)
-- ============================================================================

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

-- Platform Owner فقط يمكنه رؤية جميع الشركات
CREATE POLICY tenants_platform_select ON public.tenants
  FOR SELECT USING (
    current_setting('app.current_role', true) = 'platform_owner'
    OR current_setting('app.current_role', true) = 'developer'
  );

-- Platform Owner فقط يمكنه تعديل الشركات
CREATE POLICY tenants_platform_insert ON public.tenants
  FOR INSERT WITH CHECK (
    current_setting('app.current_role', true) = 'platform_owner'
  );

CREATE POLICY tenants_platform_update ON public.tenants
  FOR UPDATE USING (
    current_setting('app.current_role', true) = 'platform_owner'
  );

-- ============================================================================
-- تم الانتهاء من إنشاء جدول Tenants
-- ============================================================================