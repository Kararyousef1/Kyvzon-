/*
  ⚠️ pgcrypto في schema `extensions` لا `public` — يحاكي Supabase.

  السبب: db push فشل بـ
    ERROR: function gen_random_bytes(integer) does not exist (SQLSTATE 42883)
  بينما نجح محلياً، لأن الـshim كان يُثبّت pgcrypto في public.
  هذا الفرق البيئي أخفى العيب حتى وصل الإنتاج.

  الآن المختبر يطابق Supabase: أي مايجريشن يستدعي دالة pgcrypto بلا
  تأهيل schema سيفشل هنا قبل أن يصل قاعدتك.
*/
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE SCHEMA IF NOT EXISTS auth; CREATE SCHEMA IF NOT EXISTS extensions;
CREATE TABLE IF NOT EXISTS auth.users (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT, raw_user_meta_data JSONB DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID LANGUAGE SQL STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS TEXT LANGUAGE SQL STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role',true),''),'authenticated') $$;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS JSONB LANGUAGE SQL STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb) $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticator') THEN CREATE ROLE authenticator LOGIN NOINHERIT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='supabase_admin') THEN CREATE ROLE supabase_admin NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='supabase_auth_admin') THEN CREATE ROLE supabase_auth_admin NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='pgrst') THEN CREATE ROLE pgrst NOLOGIN; END IF;
END $$;
GRANT anon, authenticated, service_role TO authenticator;
GRANT USAGE ON SCHEMA auth, extensions, public TO anon, authenticated, service_role;
-- ★ محاكاة سلوك Supabase الحقيقي: منح EXECUTE تلقائياً لكل دالة جديدة
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

-- ★★ منح صلاحيات الجداول لدور authenticated (سلوك Supabase الحقيقي).
--
--    اكتُشف في الجولة 0324: بدون هذا كان كل مسبار RLS يعود بـ
--    `permission denied for table X` — وهو **قيد بيئة الاختبار لا نتيجة
--    سياسة**. الخطر أن يُقرأ الصدّ على أنه «RLS يحمي» بينما السياسة
--    الحقيقية قد تكون مفتوحة على مصراعيها في Supabase.
--
--    Supabase يمنح anon/authenticated صلاحيات الجداول افتراضياً ويعتمد
--    على RLS وحده للحماية. نُطابق ذلك ليقيس المسبار السياسات فعلاً.
--    ★★ تصحيح ذاتي (نفس الجولة): نسختي الأولى منحت `anon` صلاحية
--    SELECT على كل الجداول أيضاً — فأسقطت تأكيد
--    «anon لا يقرأ unified_approvals» في verify-0305.
--    السقوط كان صحيحاً والشيم خاطئاً: المشروع يسحب صلاحيات anon
--    صراحةً في مايجريشناته، ومنحها هنا كان يُخفي ذلك السحب.
--    نمنح `authenticated` وحده.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated, service_role;
