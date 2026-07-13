# 📘 Migration Files Standards — Kyvzon Platform

**Version:** 2.0 (High Precision)  
**Date:** 2026-07-13  
**Status:** Mandatory for all migration files

---

## 1. File Naming Convention

### Recommended Format:
```
[NNN]_[descriptive_name].sql
```

**Examples:**
- `001_core_schema.sql`
- `002_rls_policies.sql`
- `010_fix_profiles_columns.sql`
- `050_create_courses_tables.sql`

### Rules:
- استخدم أرقام متسلسلة (001, 002, 010, 050...)
- استخدم أسماء وصفية واضحة
- تجنب الأسماء العامة مثل `schema.sql` أو `fix.sql`

---

## 2. File Header (Mandatory)

كل ملف يجب أن يبدأ بالهيدر التالي:

```sql
-- ════════════════════════════════════════════════════════════════
--  FILE: [اسم_الملف].sql
--  PURPOSE: [وصف مختصر وواضح]
--  EXECUTION ORDER: [رقم التنفيذ]
--  DEPENDS ON: [الملفات التي يعتمد عليها]
--  SAFETY LEVEL: HIGH / MEDIUM / LOW
--  ════════════════════════════════════════════════════════════════
```

---

## 3. Safety Rules (إلزامية)

| القاعدة | الوصف | الأولوية |
|---------|-------|---------|
| `IF NOT EXISTS` | استخدمه في كل `CREATE TABLE`, `CREATE INDEX`, `CREATE POLICY` | **إلزامي** |
| `DROP ... IF EXISTS` | استخدمه قبل إنشاء Trigger أو Function | **موصى به** |
| Comments | أضف تعليقات واضحة في كل قسم | **إلزامي** |
| Constraints | استخدم `CHECK` constraints عند الحاجة | **موصى به** |

---

## 4. Structure Inside File

يُفضل ترتيب المحتوى كالتالي:

```sql
-- 1. Extensions
-- 2. Tables (مع IF NOT EXISTS)
-- 3. Indexes (مع IF NOT EXISTS)
-- 4. Functions & Triggers
-- 5. Policies (RLS)
-- 6. Comments / Notes
```

---

## 5. Execution Order Guidelines

| النطاق       | الترتيب الموصى به     | أمثلة |
|--------------|-----------------------|------|
| Core Schema  | 001 – 009             | 001_core_schema.sql |
| RLS Policies | 010 – 019             | 010_rls_policies.sql |
| Indexes      | 020 – 029             | 020_performance_indexes.sql |
| Features     | 050 – 099             | 050_create_courses.sql |
| Fixes        | 100 – 199             | 110_fix_profiles_columns.sql |
| Modules      | 300 – 399             | 300_tawathul_core.sql |
| Final        | 999                   | 999_final_cleanup.sql |

---

## 6. Best Practices

- لا تستخدم `DROP TABLE` إلا في حالات نادرة جداً.
- استخدم `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` عند إضافة أعمدة.
- أضف تعليقات توضح **لماذا** تم إنشاء هذا الـ Migration.
- تجنب كتابة بيانات (INSERT) داخل ملفات الـ Migration إلا في حالات الـ Seed.

---

## 7. Review Checklist

قبل رفع أي ملف Migration جديد أو معدل، تأكد من:

- [ ] يحتوي على Header موحد
- [ ] يستخدم `IF NOT EXISTS` في كل الأوامر
- [ ] يحتوي على تعليقات واضحة
- [ ] يحدد ترتيب التنفيذ
- [ ] لا يحتوي على أوامر `DROP` خطيرة بدون حماية

---

**هذه المعايير إلزامية لجميع ملفات الـ Migration في المشروع.**