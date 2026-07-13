# Kyvzon — Canonical Development Schema

هذا هو مسار قاعدة التطوير النظيفة من الصفر. لا تستخدم `database/migrations/archive` ولا تنفذ `database/schema.sql` بالتوازي معه.

## الترتيب

```text
0001_core_schema.sql
0002_employee_features.sql
0003_hr_platform_modules.sql
0004_tawathul_core.sql
0005_tawathul_rls_features.sql
0006_hr_expansion.sql
0007_support_and_security.sql
```

## طريقة التنفيذ

على قاعدة Supabase تطويرية فارغة فقط:

```bash
supabase db push
```

أو انسخ الملفات إلى SQL Editor ونفذها بالترتيب أعلاه.

## ملاحظات تصميمية

- كل جدول بيانات له `tenant_id` حيث ينطبق.
- RLS يعتمد على `auth.uid()` و`profiles.tenant_id`.
- لا يوجد tenant افتراضي ثابت داخل Tawathul.
- إعدادات landing العامة تمر عبر `public_landing_config` ولا تكشف `ai_settings`.
- Service Role مطلوب فقط داخل Edge Functions.
- AI لا يعمل بدون secrets جديدة مضبوطة خادمياً.
- `0006_hr_expansion.sql` يحتوي على إنشاء جداول تاريخية إضافية. لأنه يعمل على قاعدة فارغة في بيئة التطوير، لا توجد بيانات ليتم حذفها؛ لا تستخدمه على قاعدة تحتوي بيانات دون مراجعة.

## فحص ما بعد التنفيذ

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

SELECT tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```
