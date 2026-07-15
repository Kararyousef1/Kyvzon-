# 🛡️ تقرير اختبار عزل RLS ومحاكاة قاعدة نظيفة

**التاريخ:** 15 يوليو 2026
**الفرع:** `remediation/p0-security-and-build-health`
**المهندس:** Platform Architect
**البيئة:** PostgreSQL 17.10 (Debian) — محلي على منفذ 54322

---

## 🎯 الحكم النهائي

> ✅ **PASS** — كل 14 migration تعمل من الصفر على قاعدة فارغة، وكل 10 اختبارات عزل RLS بين الشركات نجحت.

---

## 1. نتائج تنفيذ Migrations من الصفر

| # | الملف | الزمن | الحالة |
|:---:|---|:---:|:---:|
| 0 | `0000_extensions.sql` | 41 ms | ✅ |
| 1 | `0001_core_schema.sql` | 50 ms | ✅ |
| 2 | `0002_employee_features.sql` | 67 ms | ✅ |
| 3 | `0003_hr_platform_modules.sql` | 129 ms | ✅ |
| 4 | `0004_tawathul_core.sql` | 59 ms | ✅ |
| 5 | `0005_tawathul_rls_features.sql` | 63 ms | ✅ |
| 6 | `0006_hr_expansion.sql` | 84 ms | ✅ |
| 7 | `0007_support_and_security.sql` | 169 ms | ✅ |
| 8 | `0008_incident_contract_fixes.sql` | 38 ms | ✅ |
| 9 | `0009_notifications_contract.sql` | 38 ms | ✅ |
| 10 | `0010_platform_tenant_rls_audit.sql` | 42 ms | ✅ |
| 11 | `0011_announcements.sql` | 72 ms | ✅ |
| 12 | `0012_gatekeeper_and_missing.sql` | 107 ms | ✅ |
| 13 | `0013_drop_dead_tables.sql` | 54 ms | ✅ |
| 14 | `0014_structure_reference_rls.sql` | 39 ms | ✅ |
| | **الإجمالي** | **~1.05 ثانية** | **15/15 ✅** |

### الحالة الناتجة

| المقياس | القيمة |
|---|:---:|
| **الجداول** | 79 |
| **الـ Views** | 2 |
| **جداول بدون RLS** | 0 |
| **الدوال المساعدة الموثوقة** | 7 (كلها موجودة) |
| **إجمالي RLS Policies** | 200+ |

---

## 2. المشكلات المكتشفة أثناء الاختبار — وإصلاحها

### 🔴 مشكلة 1: خطأ IMMUTABLE في فهرس `ai_insights`
**الخطأ:**
```
ERROR: functions in index predicate must be marked IMMUTABLE
```
في `0012_gatekeeper_and_missing.sql`:
```sql
CREATE INDEX idx_ai_insights_active ...
WHERE valid_until IS NULL OR valid_until > NOW();  -- ❌ NOW() ليست IMMUTABLE
```
**الإصلاح:** استبدل الفهرس الشرطي بفهرس عادي على `(tenant_id, valid_until)` مع تعليق يشرح أن الاستعلامات يجب أن تستخدم `now()` في `WHERE` مباشرةً.

### 🔴 مشكلة 2: جداول `structure_*` بدون RLS
اكتشف اختبار "Check B" أن 5 جداول مرجعية أُنشئت في `0001` **بدون** `ENABLE ROW LEVEL SECURITY`:
- `structure_departments`, `structure_positions`, `structure_ranks`, `structure_roles`, `structure_shifts`

**الأثر الأمني:** أي مستخدم مصادَق عليه كان يمكنه `TRUNCATE` أو `INSERT` بيانات مزيفة في هذه الجداول.

**الإصلاح:** أُضيف ملف جديد **`0014_structure_reference_rls.sql`** — يفعّل RLS بسياسة:
- SELECT: كل مصادَق عليه (بيانات مرجعية مشتركة).
- INSERT/UPDATE/DELETE: staff فقط (`current_user_is_staff()`).

### 🟡 مشكلة 3: انعدام GRANTs في shim
Supabase تلقائياً يمنح `authenticated` صلاحيات CRUD على الجداول في schema `public` (وRLS يقيّد الوصول لاحقاً). في shim المحلي لم يكن هذا مضبوطاً، فكانت الاختبارات تُرجع `permission denied` قبل حتى تصل لـ RLS.

**الإصلاح:** أُضيف إلى `00_supabase_shim.sql`:
```sql
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
```

---

## 3. نتائج اختبار عزل RLS (Cross-Tenant)

بنيت السيناريو التالي:

| الكيان | Company A | Company B |
|---|---|---|
| Tenant | `11111111-…` slug: `rls-test-a` | `22222222-…` slug: `rls-test-b` |
| المستخدم Employee | `UserA` (aaaa…) | `UserB` (bbbb…) |
| المستخدم Admin | `AdminA` (cccc…) | — |
| Announcements | 2 | 1 |
| Leaves | 1 (UserA) | 1 (UserB) |
| Employees | 1 (UserA linked) | 1 (UserB linked) |

### النتائج التفصيلية

| # | الاختبار | المتوقع | الفعلي | النتيجة |
|:---:|---|:---:|:---:|:---:|
| 1 | UserA يرى announcements شركته فقط | 2 | 2 | ✅ |
| 2 | UserB يرى announcements شركته فقط | 1 | 1 | ✅ |
| 3 | UserA يرى leaves شركته فقط | 1 | 1 | ✅ |
| 4 | UserB يرى leaves شركته فقط | 1 | 1 | ✅ |
| 5 | UserA يرى profiles شركته فقط (UserA + AdminA) | 2 | 2 | ✅ |
| 6 | `anon` (بلا JWT) لا يرى أي شيء | 0 | 0 | ✅ |
| 7 | **UserA يحاول كتابة announcement في شركة B** | **مرفوض** | `new row violates row-level security policy` | ✅ |
| 8 | **UserA يحاول تعديل profile لـ UserB** | 0 صف متأثر | 0 | ✅ |
| 9 | UserA يرى tenants (شركته فقط، لا كل الشركات) | 1 | 1 | ✅ |
| 10 | AdminA (دور admin) يرى profiles شركته فقط | 2 | 2 | ✅ |

**النتيجة: 10/10 نجحوا.**

### 🛡️ ما يعنيه هذا عملياً

- ✅ **العزل بين الشركات يعمل** حتى مع مستخدم أدمن في شركة A — لا يستطيع رؤية أو تعديل بيانات شركة B.
- ✅ **محاولات الكتابة المتقاطعة تُرفض** بـ `row-level security policy` (وليس تُقبل ثم تُهمَل صامتاً).
- ✅ **الزوار غير المصادق عليهم `anon`** يُحظرون تماماً من قراءة أي بيانات.
- ✅ **الدوال المساعدة `current_user_*`** تتصرف بشكل صحيح عند غياب JWT (تُرجع `NULL` بأمان).

---

## 4. البنية التحتية للاختبار

### 4.1 الملفات المُنشأة

```
scripts/tests/
├── 00_supabase_shim.sql              ← يحاكي auth schema + roles + GRANTs
├── 99_post_migration_checks.sql      ← فحوصات الحالة النهائية
├── rls_isolation_test.sql            ← 10 اختبارات عزل بين شركتين
└── run_clean_db_test.sh              ← الأوركسترا الرئيسية

supabase/migrations/
└── 0014_structure_reference_rls.sql  ← إصلاح ناتج عن الاختبار
```

### 4.2 كيفية التشغيل محلياً

```bash
# متطلب: Postgres 15+ يعمل على PGPORT (افتراضي 54322)
# لإعداد Postgres محلي (Ubuntu/Debian):
sudo apt install -y postgresql-17
sudo -u postgres pg_ctlcluster 17 main start

# ثم:
bash scripts/tests/run_clean_db_test.sh
```

المتغيرات القابلة للتخصيص:
```bash
PGHOST=/tmp PGPORT=54322 PGUSER=postgres \
  DB_NAME=my_test bash scripts/tests/run_clean_db_test.sh

# لتخطي اختبار RLS (يشتغل migrations فقط)
SKIP_RLS_TEST=1 bash scripts/tests/run_clean_db_test.sh
```

### 4.3 التكامل مع CI

أُضيف **job جديد** في `.github/workflows/quality.yml` باسم `database`:
- يُشغِّل PostgreSQL 17 كـ service container.
- يُنفِّذ `run_clean_db_test.sh` كاملاً.
- يفشل PR إذا:
  - أي migration فشل من الصفر.
  - أي جدول بدون RLS.
  - أي اختبار عزل RLS فشل.

هذا يضمن أن **أي كود يكسر العزل يُرفض تلقائياً** قبل الدمج.

---

## 5. ما لم يُختبَر بعد

هذه الاختبارات تركز على **RLS layer**. الأمور التالية تحتاج اختباراً منفصلاً:

| المكون | نوع الاختبار المطلوب | الأولوية |
|---|---|:---:|
| Edge Functions (admin-create-user, ai-chat, zkteco-sync) | Deno integration tests | 🟠 P1 |
| Real Supabase JWT (بدل shim GUC) | يحتاج staging + `supabase link` | 🟠 P1 |
| صلاحيات Storage Buckets | RLS بحد ذاتها + policies يدوية | 🟡 P2 |
| Realtime subscriptions مع RLS | Client-side integration | 🟡 P2 |
| Rate limiting على RPC | Load test بـ k6/Artillery | 🟢 P3 |

---

## 6. الأثر النهائي على المشروع

### قبل هذه المرحلة:
- ❌ لا دليل عملي أن migrations تعمل من الصفر.
- ❌ لا اختبار يثبت العزل بين الشركات.
- ❌ لا نعرف كم جدول بدون RLS.
- ❌ CI لا يمنع regressions أمنية.

### بعد هذه المرحلة:
- ✅ **دليل مُنفَّذ آلياً** — كل migration ثبت أنه يعمل من الصفر (~1 ثانية للـ 15 ملف).
- ✅ **10 اختبارات عزل** — كل عملية cross-tenant محسومة بالنتيجة.
- ✅ **0 جداول بدون RLS** — كُشف نقص أمني وأُصلح بـ `0014`.
- ✅ **CI Gate جديد** — أي PR يكسر شيئاً يُرفض قبل الدمج.
- ✅ **مستند قابل للإعادة** — أي مطور يمكنه تشغيل نفس السيناريو محلياً بأمر واحد.

---

## 7. التحقق النهائي (كل الفحوصات)

```
✅ DB Contract Check      PASS  (78 tables + 2 views)
✅ Type Check              PASS  (0 errors)
✅ Tests                   PASS  (163/163)
✅ Build                   PASS  (3.08s)
✅ Audit                   PASS  (0 vulnerabilities)
✅ Clean DB Migration      PASS  (15 migrations from scratch in 1.05s)
✅ Post-migration Checks   PASS  (all 7 checks A-G)
✅ RLS Isolation Tests     PASS  (10/10)
```

---

## 8. الخطوة التالية المقترحة

### الخيار أ: **الانتقال إلى Edge Functions**
اختبار وتصلّب `admin-create-user`, `ai-chat`, `zkteco-sync` مع:
- Transaction rollback في `admin-create-user`.
- Rate limiting.
- Integration tests بـ Deno.

### الخيار ب: **تنظيف طبقة SDK**
- إزالة ~30 استعلام Supabase مباشر خارج SDK (خصوصاً Tawathul).
- إضافة اختبارات وحدة لـ `BaseService<T>` و5 خدمات رئيسية.

### الخيار ج: **إعادة إحياء Router الحقيقي**
- إضافة `react-router-dom@6+`.
- استبدال `switch` في `App.tsx` بـ `<Routes>` + `<RequireRole>`.
- تفعيل deep-linking وbrowser history.

### الخيار د: **العمليات (Ops)**
- تدوير أسرار Supabase + `git filter-repo` لتنظيف التاريخ.
- نشر Edge Functions وضبط secrets.
- تطبيق كل ذلك على staging حقيقي.

---

**التوقيع:** Platform Architect
**الحالة:** ✅ **DATABASE + RLS SECURED — Ready for next phase**
