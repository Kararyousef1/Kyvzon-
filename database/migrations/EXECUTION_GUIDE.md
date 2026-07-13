# 🚀 Migration Execution Guide — Kyvzon Platform

**Version:** 2.0 (High Precision)  
**Date:** 2026-07-13  
**Status:** Ready for First Execution  
**Important:** هذا هو **أول تنفيذ** على قاعدة البيانات.

---

## ⚠️ تحذيرات هامة جداً

1. **لا تنفذ هذه الملفات إلا بعد أخذ نسخة احتياطية** من قاعدة البيانات.
2. **نفذ الملفات بالترتيب المحدد فقط**.
3. **لا تعدل** على الملفات قبل التنفيذ إلا بعد استشارة مهندس المنصة.
4. **استخدم Supabase SQL Editor** وليس أي أداة أخرى في التنفيذ الأول.

---

## 📋 خطوات التنفيذ (بالترتيب الصارم)

### الخطوة 1: التحضير

```sql
-- 1. تأكد من وجود الـ Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
```

### الخطوة 2: تنفيذ الملفات (بالترتيب)

نفذ الملفات **بالترتيب التالي** في Supabase SQL Editor:

| الترتيب | الملف | الغرض | ملاحظات |
|--------|-------|-------|--------|
| **1** | `001_core_schema.sql` | إنشاء الجداول الأساسية | يجب أن ينجح 100% |
| **2** | `002_rls_policies.sql` | تفعيل RLS وسياسات الأمان | مهم جداً |
| **3** | `003_indexes.sql` | إنشاء الفهارس | يمكن تنفيذه لاحقاً |
| **4** | `005_employee_features.sql` | جداول الحضور والإجازات | يعتمد على 001 |
| **5** | `006_hr_modules.sql` | الدورات + SOPs + الإشعارات | يعتمد على 001 |
| **6** | `007_tawathul_module.sql` | وحدة التواصل | مستقل |
| **7** | `004_fixes_and_patches.sql` | التصحيحات | يُفضل بعد 001-006 |
| **8** | `008_final_cleanup.sql` | التنظيف النهائي | يُنفذ أخيراً |
| **9** | `103_secure_tenant_isolation.sql` | عزل tenant مبني على auth.uid() | يُنفذ بعد اكتمال schema ووجود `profiles.tenant_id` |

---

## 🛡️ معايير الأمان المطبقة في الملفات

- كل `CREATE TABLE` يستخدم `IF NOT EXISTS`
- كل `CREATE POLICY` يستخدم `IF NOT EXISTS` (عند الإمكان)
- كل `CREATE INDEX` يستخدم `IF NOT EXISTS`
- تمت إضافة تعليقات واضحة في كل ملف
- تم فصل الجداول عن الـ RLS

---

## 🔍 كيفية التحقق من النجاح

بعد تنفيذ كل ملف، نفذ الاستعلام التالي:

```sql
-- التحقق من وجود الجداول الرئيسية
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('profiles', 'employees', 'departments', 'tenants');
```

---

## 📞 في حال حدوث خطأ

1. **لا تحذف** أي جدول.
2. أرسل رسالة الخطأ كاملة إلى مهندس المنصة.
3. لا تحاول "إصلاح" الخطأ بنفسك في التنفيذ الأول.

---

## ✅ Checklist قبل التنفيذ

- [ ] أخذت نسخة احتياطية من Supabase
- [ ] قرأت هذا الملف كاملاً
- [ ] سأنفذ الملفات بالترتيب المحدد
- [ ] سأستخدم Supabase SQL Editor فقط

---

**تم إعداد هذا الدليل بدقة عالية لضمان سلامة التنفيذ الأول.**