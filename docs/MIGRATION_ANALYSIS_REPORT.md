# 📋 Migration Files Analysis Report

**Date:** 2026-07-13  
**Task:** TD-006 — Consolidate 49 Migration Files  
**Status:** Analysis Phase

---

## 1. Current State

| Metric                    | Value     |
|---------------------------|-----------|
| **Total Migration Files** | 49        |
| **Total Size**            | 536 KB    |
| **Folder**                | `database/migrations` |

---

## 2. Problems Identified

### 2.1 Naming Inconsistency
- بعض الملفات تبدأ بأرقام (`001_`, `002_`, `010_`, `050_`)
- بعض الملفات لا تبدأ بأرقام (`schema.sql`, `add_developer_role.sql`)
- أرقام غير متسلسلة (يوجد قفزات كبيرة)

### 2.2 Duplication & Redundancy
- `001_initial_schema.sql` + `schema.sql` (محتمل التكرار)
- `001_unify_profiles_employees.sql` + `010_fix_profiles_columns.sql`
- `050_fix_notifications_complete.sql` + `060_unify_notifications.sql`

### 2.3 Lack of Logical Grouping
- لا يوجد فصل واضح بين:
  - Schema definitions
  - RLS Policies
  - Indexes
  - Functions & Triggers
  - Seed data

---

## 3. File Categorization (Preliminary)

| Category              | Estimated Files | Examples |
|-----------------------|------------------|----------|
| **Core Schema**       | 8-10            | `001_initial_schema.sql`, `schema.sql`, `006_multi_tenant.sql` |
| **RLS Policies**      | 10-12           | `030_fix_system_settings_rls.sql`, `041_fix_rls_notifications_security.sql` |
| **Indexes**           | 3-5             | `400_add_missing_indexes.sql` |
| **Fixes & Patches**   | 15-18           | `010_fix_profiles_columns.sql`, `011_fix_profiles_users.sql` |
| **New Features**      | 8-10            | `050_create_courses_tables.sql`, `300_tawathul_core.sql` |
| **Miscellaneous**     | 4-6             | `add_developer_role.sql`, `create_error_logs_table.sql` |

---

## 4. Proposed Consolidation Strategy

### Recommended Structure (6-8 Files)

| New File Name                          | Purpose                                      | Source Files |
|----------------------------------------|----------------------------------------------|--------------|
| `001_core_schema.sql`                  | الجداول الأساسية + Multi-tenancy            | 001, 006, schema |
| `002_rls_policies.sql`                 | جميع سياسات RLS                            | 030, 041, 050, 060 |
| `003_indexes.sql`                      | الفهارس المحسنة                            | 400 |
| `004_fixes_and_patches.sql`            | التصحيحات والإصلاحات                       | 010-012, fix_* |
| `005_employee_features.sql`            | جداول الموظفين والحضور والإجازات           | 004, 020, 021 |
| `006_hr_modules.sql`                   | الدورات، SOPs، الإشعارات                   | 050, 060 |
| `007_tawathul_module.sql`              | وحدة التواصل (Tawathul)                     | 300-302 |
| `008_final_cleanup.sql`                | التنظيف النهائي + الفهارس المفقودة         | 999, 201, 202 |

---

## 5. Recommended Approach

### Option A: Full Consolidation (Recommended)
- دمج كل الملفات في 6-8 ملفات رئيسية
- الحفاظ على ترتيب زمني منطقي
- إضافة تعليقات واضحة في كل ملف

### Option B: Keep Historical + New Structure
- الاحتفاظ بالملفات القديمة في مجلد `archive/`
- إنشاء ملفات جديدة نظيفة

### Option C: Hybrid
- دمج الملفات الصغيرة فقط
- الاحتفاظ بالملفات الكبيرة كما هي

---

## 6. Next Steps

1. **Review this analysis** with the team
2. **Choose consolidation strategy** (A/B/C)
3. **Create consolidated files** one by one
4. **Test on a staging database**
5. **Update documentation**

---

**Report Version:** 1.0  
**Prepared by:** Platform Architect