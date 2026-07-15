-- ============================================================================
--  Supabase Shim — يحاكي جزءاً كافياً من بيئة Supabase محلياً لاختبار migrations
--
--  ما يحاكيه:
--    - schema auth
--    - جدول auth.users (نسخة مبسطة)
--    - roles: authenticated, anon, service_role
--    - دالة auth.uid() تقرأ من إعداد الجلسة request.jwt.claim.sub
--    - دالة auth.role() تقرأ من request.jwt.claim.role
--
--  لا يُستخدم إلا في بيئة الاختبار المحلية. Supabase الحقيقي عنده هذه
--  الأشياء مبنية.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS auth;

-- Roles (يخلقهم Supabase تلقائياً)
DO $$ BEGIN
  CREATE ROLE anon NOLOGIN NOINHERIT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE ROLE authenticated NOLOGIN NOINHERIT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- جدول auth.users مبسّط
CREATE TABLE IF NOT EXISTS auth.users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           VARCHAR(255) UNIQUE,
  encrypted_password VARCHAR(255),
  raw_user_meta_data JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- تفعيل pgcrypto إن لم تكن مفعّلة (auth.users يعتمد gen_random_uuid)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ────────────────────────────────────────────────────────────────────
-- دالة auth.uid()
--
-- في Supabase الحقيقي: تقرأ JWT الحقيقي.
-- هنا: تقرأ من session GUC اسمه request.jwt.claim.sub الذي نضعه في
-- الاختبار بأمر SET LOCAL.
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID
LANGUAGE SQL
STABLE
AS $$
  SELECT NULLIF(
    current_setting('request.jwt.claim.sub', true),
    ''
  )::UUID;
$$;

CREATE OR REPLACE FUNCTION auth.role()
RETURNS TEXT
LANGUAGE SQL
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    'anon'
  );
$$;

CREATE OR REPLACE FUNCTION auth.email()
RETURNS TEXT
LANGUAGE SQL
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.email', true), '');
$$;

-- صلاحيات
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT SELECT ON auth.users TO authenticated, service_role;

-- ────────────────────────────────────────────────────────────────────
-- Supabase defaults: authenticated و anon يحصلون على SELECT/INSERT/
-- UPDATE/DELETE على جميع الجداول في schema public (وتفعيل RLS يقيّد
-- الوصول لاحقاً). نُطبِّق نفس الإعدادات محلياً.
-- يُنفَّذ الآن + كـ default privileges للجداول الجديدة.
-- ────────────────────────────────────────────────────────────────────
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO authenticated, service_role, anon;
