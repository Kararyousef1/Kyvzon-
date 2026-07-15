# 🗄️ خطة إعادة هيكلة ودمج استعلامات SQL — Kyvzon Platform

**التاريخ:** 15 يوليو 2026
**المهندس:** مهندس نظم ومنصات
**الفرع:** `remediation/p0-security-and-build-health`
**النطاق:** كامل ملفات SQL في المشروع (`database/`, `supabase/`)

---

## 1. الملخص التنفيذي

المشروع يعاني من **فوضى تاريخية في ملفات SQL** — يوجد **4 مسارات SQL متوازية**، بعضها يتناقض مع بعض، مع فجوات حرجة بين ما يستخدمه الكود وما تنشئه Migrations.

### 1.1 الأرقام الحقيقية

| المصدر | الملفات | إجمالي الأسطر | الحالة |
|---|:---:|:---:|:---:|
| `supabase/migrations/` | **10** (0001-0010) | ~144 KB | ✅ الرسمي الحديث |
| `database/migrations/` (جذر) | **50** ملف نشط | ~186 KB | ❌ مصدر ارتباك — قديم/متداخل |
| `database/migrations/archive/` | **49** ملف | مؤرشف | 🟡 يجب حذفه |
| `database/migrations/consolidated/` | **9** ملفات | ~65 KB | ❌ محاولة توحيد قديمة — مربكة |
| `database/schema.sql` | 1 ملف | 1,513 سطر | ❌ ناقص وغير محدَّث |
| `database/seeds/` | 3 ملفات | ~35 KB | ✅ يبقى |

### 1.2 الفجوات الحرجة المكتشفة

**أ) جداول تستخدم في الكود لكنها ليست في migrations الرسمية (`supabase/migrations/`):**

| # | الجدول | المستخدم في | الأولوية |
|:---:|---|---|:---:|
| 1 | `announcements` | `AnnouncementService.ts` | 🔴 P0 |
| 2 | `announcement_likes` | `AnnouncementService.ts` | 🔴 P0 |
| 3 | `announcement_polls` | `AnnouncementService.ts` | 🔴 P0 |
| 4 | `announcement_poll_options` | `AnnouncementService.ts` | 🔴 P0 |
| 5 | `announcement_votes` | `AnnouncementService.ts` | 🔴 P0 |
| 6 | `announcements_with_stats` (view) | `AnnouncementService.ts` | 🔴 P0 |
| 7 | `gatekeeper_sessions` | `GatekeeperService.ts` | 🔴 P0 |
| 8 | `gatekeeper_visitors` | `GatekeeperVisitorService.ts` | 🔴 P0 |
| 9 | `gatekeeper_visitor_logs` | `GatekeeperService.ts` | 🔴 P0 |
| 10 | `movements_log` | `GatekeeperService.ts` | 🔴 P0 |
| 11 | `time_logs` | `TimeLogService.ts` | 🔴 P0 |
| 12 | `specialties` | `DepartmentService.ts` | 🔴 P0 |
| 13 | `job_applications` | `RecruitmentService.ts` | 🟠 P1 |
| 14 | `ai_insights` | `AIService.ts` | 🟠 P1 |
| 15 | `customer_reviews` | `ReviewService.ts` | 🟠 P1 |
| 16 | `public_landing_config` | `uiStore.ts` | 🟠 P1 |

> 🚨 **معنى ذلك:** إذا نفَّذ فريقكم `supabase/migrations/0001-0010` على قاعدة بيانات فارغة الآن، **ستكسر 16 خدمة SDK فور تشغيل التطبيق** لأن الجداول التي تحاول القراءة/الكتابة منها غير موجودة.

**ب) جداول أُنشئت في migrations لكنها غير مستخدمة (Dead tables):**

| # | الجدول | التوصية |
|:---:|---|---|
| 1 | `course_modules` | 🟡 حذف أو تفعيل استخدامه |
| 2 | `export_logs` | 🟡 حذف أو ربط بـ logger |
| 3 | `loan_repayments` | 🟡 حذف أو توسيع `EmployeeLoanService` |
| 4 | `overtime_log` | 🟡 حذف أو توسيع `AttendanceService` |
| 5 | `shift_schedules` | 🟡 حذف (لدينا `shift_assignments`) |

> ملاحظة: الجداول `tawathul_*` الخمسة الأخرى (`attachments`, `entity_links`, `notifications`, `reactions`, `settings`) **تُستخدم** عبر `TawathulService` بأسماء ثابتة داخلياً، فهي ليست dead.

### 1.3 التقييم: **حالة SQL الحالية 4/10**
رغم وجود migrations رسمية جيدة، فإن التعايش مع المسارات القديمة يجعل النظام **غير قابل للتنفيذ من الصفر** بشكل موثوق.

---

## 2. تحليل معمق للمسارات الأربعة

### 2.1 مسار `supabase/migrations/` — ✅ المصدر الأمثل
```
0001_core_schema.sql              → tenants, profiles, employees, departments
0002_employee_features.sql        → attendance, leaves, permissions, holidays
0003_hr_platform_modules.sql     → courses, sops, notifications, audit, incidents, wellness
0004_tawathul_core.sql           → tawathul_settings, conversations, members, messages
0005_tawathul_rls_features.sql   → tawathul_attachments, reactions, notifications
0006_hr_expansion.sql            → bonuses, disciplinary, docs, loans, onboarding, jobs, payroll
0007_support_and_security.sql    → error_logs, device_sync_nonces, security_events
0008_incident_contract_fixes.sql → ALTER فقط لـ incidents
0009_notifications_contract.sql   → ALTER + RLS + RPC للـ notifications
0010_platform_tenant_rls_audit  → RLS نهائي لـ platform tables + دوال owner
```

**نقاط قوة:**
- ✅ ترقيم منظم (4 أرقام متسلسلة)
- ✅ كل ملف موصوف بغرض واضح
- ✅ يستخدم `IF NOT EXISTS`
- ✅ RLS مبني على `auth.uid()` وليس `localStorage`
- ✅ Idempotent — يمكن إعادة تشغيله

**نقاط ضعف:**
- ❌ يفتقد 16 جدول (الفجوة أعلاه)
- ❌ لا يوجد `0000_extensions.sql` (يعتمد على `pgcrypto` بدون تنصيبه صراحة في البداية)
- ❌ لا يوجد `README` يشير للفريق أنه المصدر الوحيد بوضوح

### 2.2 مسار `database/migrations/` (50 ملف) — ❌ أرشيف عملي
هذا المجلد كان مسار التطوير التاريخي. تحليله:

| المجموعة | العدد | الاستنتاج |
|---|:---:|---|
| ملفات `001_*` متعارضة | 3 (initial, add_missing, unify) | تناقضات — أنشأت الأمر نفسه بطرق مختلفة |
| ملفات `fix_*` قديمة | 12 | كلها إصلاحات مؤقتة انتهت صلاحيتها |
| ملفات `010`-`090` | 15 | جداول أساسية — **مغطاة الآن في `supabase/migrations/0002-0003`** |
| ملفات `100-107` | 10 | Multi-tenant + RLS — **مغطاة الآن في `0010` والدوال المشتركة** |
| ملفات `200-202` | 3 | Kyvzon Dev Portal — **مغطاة جزئياً في `0010`** |
| ملفات `300-302` | 3 | Tawathul — **مغطاة الآن في `0004-0005`** |
| ملفات `400-999` | 3 | Indexes + cleanup — **مدموجة الآن ضمن الملفات الرسمية** |

**الحكم:** كل هذه الملفات **تكرار لما هو موجود في `supabase/migrations/`**. الاحتفاظ بها = ارتباك مضمون + خطر تنفيذ خاطئ.

### 2.3 مسار `database/migrations/consolidated/` — ❌ محاولة قديمة فاشلة
هذا المجلد يمثل **محاولة سابقة للتوحيد**، لكنه:
- ❌ ينتهي بترقيم `001-009` — يتعارض مع الترقيم الرسمي الجديد `0001-0010`.
- ❌ ينقصه ما هو موجود في `0007` (support_and_security), `0008`, `0009`, `0010` من المسار الرسمي.
- ❌ `EXECUTION_GUIDE.md` يشير لهذا المسار كأنه المرجع، بينما `README_AR.md` في `supabase/migrations/` يقول إنه هو المرجع.

**الحكم:** محاولة توحيد لم تكتمل. يجب حذفها بالكامل.

### 2.4 مسار `database/schema.sql` — ❌ قديم ومضلل
- 1,513 سطر تصف schema قديمة (16 جدول فقط).
- ينقصه: multi-tenant، RLS الحديث، معظم وحدات HR، Tawathul بالكامل، Announcements، Gatekeeper.
- **يجب حذفه** — لا يمكن الاعتماد عليه ولا يتزامن مع أي مسار آخر.

---

## 3. الخطة التنفيذية الكاملة

### 🎯 الهدف النهائي
> مصدر SQL **واحد فقط**: `supabase/migrations/` — يمكن تنفيذه من الصفر على قاعدة بيانات فارغة وينتج نظاماً يعمل 100%.

### 3.1 المراحل الأربعة

```
┌─────────────────────────────────────────────────────────────┐
│ المرحلة 1: التوثيق والتخطيط           │ يوم 1        (0.5 يوم) │
├─────────────────────────────────────────────────────────────┤
│ المرحلة 2: إنشاء Migrations المفقودة   │ يوم 1-2      (1 يوم)   │
├─────────────────────────────────────────────────────────────┤
│ المرحلة 3: التحقق على قاعدة نظيفة      │ يوم 2-3      (1 يوم)   │
├─────────────────────────────────────────────────────────────┤
│ المرحلة 4: الأرشفة والتنظيف           │ يوم 3        (0.5 يوم) │
└─────────────────────────────────────────────────────────────┘
                إجمالي: 3 أيام عمل
```

---

## 4. المرحلة 1: التوثيق والتخطيط (0.5 يوم)

### المهمة 1.1: كتابة `supabase/migrations/README.md` جديد (بديل واضح)
- يعلن صراحة: **هذا هو المسار الوحيد**.
- يذكر ترتيب التنفيذ.
- يذكر متطلبات ما قبل التنفيذ (extensions).
- يذكر آلية الفحص بعد التنفيذ.

### المهمة 1.2: إنشاء `docs/DATABASE_ARCHITECTURE.md`
- مخطط ERD مبسط.
- خريطة الجداول بالوحدات (Auth, HR, Employee, Gatekeeper, Tawathul, Platform).
- شرح استراتيجية Multi-tenant + RLS.
- شرح إدارة `tenant_id` عبر الطبقات.

### المهمة 1.3: تحديث `.github/workflows/quality.yml`
- إضافة step لتشغيل `check-db-contract.mjs` كـ CI gate.
- منع أي PR يضيف `.from('table')` في الكود دون migration مقابل.

**المخرجات:**
- ✅ `supabase/migrations/README.md` (جديد وواضح)
- ✅ `docs/DATABASE_ARCHITECTURE.md`
- ✅ CI step فعّال

---

## 5. المرحلة 2: إنشاء Migrations المفقودة (1 يوم)

سنُضيف **3 ملفات جديدة** إلى `supabase/migrations/` لسد الفجوات:

### 5.1 `0000_extensions.sql` (جديد — قاعدة الأساس)
```sql
-- إعلان صريح للـ extensions المطلوبة
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```
- **السبب:** بعض الملفات الرسمية تستخدم `gen_random_uuid()` دون ضمان وجود `pgcrypto`.
- **الحجم المتوقع:** ~10 سطر.

### 5.2 `0011_announcements.sql` (جديد — Announcements)
- إنشاء 5 جداول: `announcements`, `announcement_likes`, `announcement_polls`, `announcement_poll_options`, `announcement_votes`.
- إنشاء View: `announcements_with_stats`.
- إضافة `tenant_id` + RLS مبني على `current_user_tenant_id()`.
- Indexes لـ `tenant_id`, `created_at DESC`, `author_id`.
- **المصدر:** `database/migrations/080_create_announcements_table.sql` (نأخذه ونحدّثه).
- **الحجم المتوقع:** ~200 سطر.

### 5.3 `0012_gatekeeper_and_missing.sql` (جديد — الجداول المتبقية)
- إنشاء الجداول:
  - `gatekeeper_sessions`
  - `gatekeeper_visitors`
  - `gatekeeper_visitor_logs`
  - `movements_log`
  - `time_logs`
  - `specialties`
  - `job_applications`
  - `ai_insights`
  - `customer_reviews`
  - `public_landing_config` (كـ View منفصل عن `system_settings`)
- إضافة `tenant_id` + RLS لكل منها.
- Indexes مناسبة.
- **الحجم المتوقع:** ~500 سطر.

### 5.4 مراجعة الجداول الميتة (Dead Tables)
- `course_modules`, `export_logs`, `loan_repayments`, `overtime_log`, `shift_schedules`:
  - إما نضيف SDK Service لها (إذا مطلوبة مستقبلاً).
  - أو نُنشئ `0013_drop_dead_tables.sql` نحذفها فيه بصراحة.
- **قرار:** يُترك للمطور — سنسأل قبل التنفيذ.

**المخرجات:**
- ✅ `supabase/migrations/0000_extensions.sql`
- ✅ `supabase/migrations/0011_announcements.sql`
- ✅ `supabase/migrations/0012_gatekeeper_and_missing.sql`
- ✅ (اختياري) `supabase/migrations/0013_drop_dead_tables.sql`

---

## 6. المرحلة 3: التحقق على قاعدة نظيفة (1 يوم)

### 6.1 إعداد قاعدة اختبار
- إنشاء Supabase project جديد فارغ (أو استخدام `supabase start` محلياً).
- تنفيذ Migrations بالترتيب: `0000` → `0012`.

### 6.2 قائمة تحقق (Checklist)
```
[ ] كل ملف ينفَّذ دون أخطاء
[ ] عدد الجداول النهائي = ما يتوقعه check-db-contract.mjs
[ ] كل الجداول عليها RLS مُفعَّل
[ ] كل RLS policy موجودة (استعلام pg_policies)
[ ] كل الدوال المساعدة تعمل: current_user_tenant_id(), current_user_role(), set_session_context()
[ ] Seed data ينفَّذ بنجاح (complete_demo.sql)
[ ] تسجيل دخول تجريبي + استعلام على 3-5 جداول من الواجهة
```

### 6.3 اختبار العزل (Cross-Tenant)
- إنشاء `tenant_A` + مستخدم داخله.
- إنشاء `tenant_B` + مستخدم داخله.
- تسجيل دخول مستخدم `tenant_A` → استعلام `SELECT * FROM employees` → **يجب ألا يرى بيانات B**.
- كتابة نتائج التجربة في `docs/RLS_ISOLATION_TEST_REPORT.md`.

**المخرجات:**
- ✅ تقرير `docs/CLEAN_DB_TEST_REPORT.md`
- ✅ تقرير `docs/RLS_ISOLATION_TEST_REPORT.md`
- ✅ Screenshots للنجاح

---

## 7. المرحلة 4: الأرشفة والتنظيف (0.5 يوم)

### 7.1 إعادة الهيكلة النهائية

**قبل:**
```
database/
├── migrations/         ← 50 ملف نشط (فوضى)
│   ├── archive/        ← 49 ملف
│   └── consolidated/   ← 9 ملفات
├── schema.sql          ← 1,513 سطر (قديم)
└── seeds/              ← يبقى
```

**بعد:**
```
database/
├── legacy-DO-NOT-USE/          ← نُنقل إليه كل شيء قديم (للاطلاع فقط)
│   ├── migrations-2026/        ← 50 ملف
│   ├── archive-2026/           ← 49 ملف
│   ├── consolidated-2026/      ← 9 ملفات
│   ├── schema.sql              ← نُنقله هنا
│   ├── EXECUTION_GUIDE.md      ← قديم — يبقى للاطلاع
│   └── README.md               ← يوضح: "هذه ملفات تاريخية. المصدر الفعلي: supabase/migrations/"
└── seeds/                       ← يبقى مكانه
    ├── complete_demo.sql
    ├── gatekeeper_extra.sql
    └── seed_courses_sops_data.sql

supabase/
└── migrations/                  ← 🎯 المصدر الوحيد
    ├── README.md                ← محدَّث
    ├── 0000_extensions.sql
    ├── 0001_core_schema.sql
    ├── 0002_employee_features.sql
    ├── 0003_hr_platform_modules.sql
    ├── 0004_tawathul_core.sql
    ├── 0005_tawathul_rls_features.sql
    ├── 0006_hr_expansion.sql
    ├── 0007_support_and_security.sql
    ├── 0008_incident_contract_fixes.sql
    ├── 0009_notifications_contract.sql
    ├── 0010_platform_tenant_rls_audit.sql
    ├── 0011_announcements.sql          ← جديد
    ├── 0012_gatekeeper_and_missing.sql ← جديد
    └── (اختياري) 0013_drop_dead_tables.sql
```

### 7.2 تحديثات مصاحبة
- ✅ حذف `EXECUTION_GUIDE.md` القديم (المضلل) من `database/migrations/`.
- ✅ تحديث `docs/PROJECT_SUMMARY.md` ليشير للمسار الجديد فقط.
- ✅ إضافة `.gitignore` rule لمنع إضافة SQL في مسارات قديمة.
- ✅ تحديث `README.md` الرئيسي: قسم "Database Setup" ينقل للـ `supabase/migrations/README.md`.

### 7.3 Commit Strategy
```
Commit 1: docs(db): add DATABASE_ARCHITECTURE.md and new supabase/migrations/README.md
Commit 2: feat(db): add 0000_extensions.sql
Commit 3: feat(db): add 0011_announcements.sql with RLS
Commit 4: feat(db): add 0012_gatekeeper_and_missing.sql
Commit 5: chore(db): move legacy migrations to database/legacy-DO-NOT-USE/
Commit 6: ci(db): enforce check-db-contract.mjs in quality workflow
Commit 7: (اختياري) chore(db): drop dead tables migration 0013
```

**المخرجات:**
- ✅ مصدر SQL واحد نظيف.
- ✅ أرشيف تاريخي محفوظ للرجوع.
- ✅ CI يحمي من الانحراف مستقبلاً.

---

## 8. مصفوفة المخاطر أثناء التنفيذ

| المخاطرة | الاحتمال | الأثر | التخفيف |
|---|:---:|:---:|---|
| كسر تطبيق production | متوسط | 🔴 حرج | التنفيذ على staging أولاً، لا نلمس prod |
| تعارض `announcements` الجديد مع بيانات موجودة | منخفض | 🟡 متوسط | استخدام `CREATE TABLE IF NOT EXISTS` + توثيق backfill |
| مطور آخر يضيف SQL في المسار القديم | متوسط | 🟠 كبير | CI check يمنع + PR template + notice في `legacy-DO-NOT-USE/README.md` |
| Migrations لا تعمل من الصفر | منخفض | 🔴 حرج | اختبار كامل على قاعدة فارغة قبل الدمج |
| RLS مفتوح بطريق الخطأ على جدول جديد | متوسط | 🔴 حرج | template SQL يفرض `ALTER TABLE ENABLE ROW LEVEL SECURITY` |

---

## 9. معايير القبول (Definition of Done)

قبل إعلان انتهاء هذه المهمة، يجب أن تتحقق كل النقاط:

```
[ ] supabase/migrations/ يحوي 12-13 ملف بالترتيب الصحيح
[ ] كل ملف يبدأ بـ header قياسي (PURPOSE, DEPENDS ON, SAFETY LEVEL)
[ ] تنفيذ من الصفر على Supabase فارغة = نجاح 100%
[ ] node scripts/check-db-contract.mjs = 0 جداول مفقودة
[ ] كل الجداول ذات البيانات عليها RLS مُفعَّل
[ ] كل جدول يحوي tenant_id عليه policy تعزل بـ current_user_tenant_id()
[ ] اختبار Cross-tenant يثبت العزل
[ ] database/migrations/ محذوف أو منقول لـ legacy-DO-NOT-USE/
[ ] database/schema.sql محذوف من مساره القديم
[ ] CI workflow يفشل عند إضافة .from('table_missing_from_migrations')
[ ] README رئيسي يشير لمسار واحد فقط
[ ] docs/DATABASE_ARCHITECTURE.md موجود ومحدَّث
[ ] الاختبارات (npm run test:run) تنجح 163/163
[ ] Build ينجح
```

---

## 10. الخطوة التالية الفورية

**قبل بدء التنفيذ، أحتاج قراراتك في 4 نقاط:**

1. **الجداول الميتة (dead tables):** هل نحذفها أم نُبقيها لاستخدام مستقبلي؟
   - (أ) نحذفها في `0013_drop_dead_tables.sql`
   - (ب) نُبقيها ونضيف SDK Services لها لاحقاً
   - (ج) نحتفظ ببعضها فقط (اذكر أيها)

2. **مسار `database/migrations/` القديم:** هل ننقله كاملاً لـ `legacy-DO-NOT-USE/` أم نحذفه من Git تماماً؟
   - (أ) ننقل — يبقى في التاريخ للرجوع
   - (ب) نحذف — تنظيف كامل (يبقى محفوظاً في Git history على أي حال)

3. **بيئة الاختبار للتحقق:** ما المتاح لديك؟
   - (أ) Supabase project ثاني (staging) نظيف
   - (ب) `supabase start` محلي (Docker)
   - (ج) لا شيء — أحتاج تحضير أولاً

4. **`public_landing_config`:** هل هو جدول مستقل أم View من `system_settings`؟
   - الكود يقرأ منه فقط `.select('landing_config').eq('id', 'singleton')`.
   - (أ) View من `system_settings` (أنظف)
   - (ب) جدول مستقل (أبسط)

بعد إجابتك على هذه الأسئلة، **أبدأ فوراً بتنفيذ المرحلة 1** (كتابة README و DATABASE_ARCHITECTURE)، ثم أنتقل للمرحلة 2 (كتابة `0000`, `0011`, `0012`).

---

**التوقيع:** مهندس نظم ومنصات
**الحالة:** بانتظار قرار المطور
