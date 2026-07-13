-- ============================================
-- إضافة خيار 'developer' إلى ENUM user_role
-- في PostgreSQL، يجب commit قيمة ENUM الجديدة قبل استخدامها
-- ============================================

-- الخطوة 1: فحص نوع العمود
SELECT data_type, udt_name
FROM information_schema.columns
WHERE table_name = 'profiles' AND column_name = 'role';

-- الخطوة 2: إضافة قيمة 'developer' للـ ENUM
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'developer';

-- *** هام: يجب تشغيل هذا وحفظ الـ commit قبل الخطوات التالية ***
-- إذا ظهرت أخطاء في الخطوات التالية بسبب "new value not committed":
--   1. شغّل ALTER TYPE مرة أخرى
--   2. أغلق SQL Editor وافتحه من جديد
--   3. شغّل الخطوات التالية

-- الخطوة 3: إضافة حقل is_developer
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_developer BOOLEAN DEFAULT FALSE;

-- الخطوة 4: عرض الأدوار الموجودة (سيُظهر 'developer' الآن)
SELECT role, COUNT(*) as count
FROM profiles
GROUP BY role
ORDER BY role;

-- الخطوة 5: تعيين is_developer = true لأي مستخدم developer
-- إذا فشل، شغّل ALTER TYPE مرة أخرى وأعد التشغيل
UPDATE profiles
SET is_developer = true
WHERE role = 'developer' AND is_developer = false;

-- الخطوة 6: منح الصلاحيات الافتراضية للمطورين
UPDATE profiles
SET permissions = ARRAY['developer-dashboard', 'developer-attendance', 'developer-logs', 'developer-db', 'notifications', 'dashboard']
WHERE role = 'developer' AND COALESCE(array_length(permissions, 1), 0) = 0;

-- الخطوة 7: عرض كل مطور موجود
SELECT id, full_name, email, role, is_developer, permissions
FROM profiles
WHERE role = 'developer';

-- ============================================
-- بديل إذا كان ALTER TYPE لا يعمل:
-- إنشاء ENUM جديد وتحويل العمود إليه
-- ============================================

-- DO $$
-- BEGIN
--   -- إذا كان العمود ENUM وأردت استبداله بالكامل
--   ALTER TABLE profiles ALTER COLUMN role DROP DEFAULT;
--   ALTER TABLE profiles ALTER COLUMN role TYPE VARCHAR(50) USING role::text;
--   DROP TYPE IF EXISTS user_role;
--   CREATE TYPE user_role AS ENUM ('employee', 'hr', 'admin', 'gatekeeper', 'developer', 'supervisor', 'manager');
--   ALTER TABLE profiles ALTER COLUMN role TYPE user_role USING role::user_role;
--   ALTER TABLE profiles ALTER COLUMN role SET DEFAULT 'employee';
-- END $$;