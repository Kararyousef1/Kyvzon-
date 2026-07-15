# 🏛️ Kyvzon Database Architecture

**النسخة:** 2.0
**التاريخ:** 2026-07-15
**المؤلف:** Platform Architect

---

## 1. نظرة عامة

Kyvzon منصة **HR SaaS متعددة الشركات** مبنية على **PostgreSQL (Supabase)** مع:
- **Row Level Security (RLS)** كطبقة أمان أساسية.
- **`tenant_id`** في كل جدول بيانات كمفتاح العزل.
- **دوال `SECURITY DEFINER`** كالمصدر الموثوق لسياق المستخدم.
- **~75 جدولاً** موزعة على 14 وحدة وظيفية.

---

## 2. نموذج العزل (Multi-Tenancy Model)

### 2.1 المبدأ الأساسي
```
┌────────────────────────────────────────────────────────────┐
│  المستخدم (auth.uid()) ─┐                                    │
│                         ↓                                    │
│  دالة موثوقة: current_user_tenant_id()                       │
│                         ↓                                    │
│  RLS Policy: WHERE tenant_id = current_user_tenant_id()      │
│                         ↓                                    │
│  النتيجة: المستخدم يرى فقط بيانات شركته                       │
└────────────────────────────────────────────────────────────┘
```

### 2.2 لماذا هذا التصميم؟
- ❌ **الطريقة الخطأ (السابقة):** الاعتماد على `current_setting('app.current_tenant_id')` يعني أن أي عميل يمكنه ضبطه بأي قيمة.
- ✅ **الطريقة الصحيحة (الحالية):** `SELECT tenant_id FROM profiles WHERE id = auth.uid()` — القيمة تأتي من قاعدة البيانات نفسها ولا يمكن انتحالها.

### 2.3 الدوال المساعدة الموثوقة (`0003_hr_platform_modules.sql` + `0010`)

| الدالة | الإرجاع | الاستخدام |
|---|---|---|
| `current_user_tenant_id()` | `UUID` | tenant الحالي |
| `current_user_role()` | `TEXT` | دور المستخدم |
| `current_user_is_staff()` | `BOOLEAN` | admin / hr / developer / it_admin؟ |
| `current_user_is_platform_owner()` | `BOOLEAN` | developer / it_admin؟ |
| `current_user_employee_id()` | `UUID` | employee id المرتبط بالمستخدم |
| `set_session_context()` | `JSONB` | يُستدعى بعد login (يقرأ فقط) |
| `clear_session_context()` | `VOID` | يُستدعى قبل logout |

كل هذه الدوال `SECURITY DEFINER` مع `SET search_path = public` وممنوعة عن `PUBLIC`.

---

## 3. خريطة الوحدات (Module Map)

### 3.1 وحدة Auth & Tenants (`0001_core_schema.sql`)

```
tenants                     ← الشركات (Companies)
├── id (UUID, PK)
├── name_ar, name_en
├── slug (unique)
├── status (trial|active|suspended|expired|deleted)
└── settings (JSONB)

profiles                    ← ملفات المستخدمين (يمتد auth.users)
├── id (UUID, PK, FK → auth.users)
├── tenant_id (UUID, FK → tenants)  ⚠️ مفتاح العزل
├── email, full_name, phone
├── role (employee|manager|hr|admin|developer|gatekeeper|it_admin)
└── permissions (JSONB)

user_tenants                ← علاقة N:M للمستخدمين متعددي الشركات
├── user_id (FK → profiles)
└── tenant_id (FK → tenants)
```

### 3.2 وحدة Structure (`0001` + `0012_gatekeeper_and_missing.sql`)

```
departments                 ← الأقسام
├── tenant_id
├── name_ar, name_en
└── parent_id (self-ref)

employees                   ← الموظفون (منفصل عن profiles للسجلات التاريخية)
├── tenant_id
├── user_id (FK → profiles)
├── employee_code (unique)
├── first_name, last_name
├── department_id
└── position

specialties                 ← التخصصات
├── tenant_id
├── name, name_en
├── description
└── department, role_level

structure_departments       ← هيكل تنظيمي متقدم
structure_positions
structure_ranks
structure_roles
structure_shifts
```

### 3.3 وحدة Employee (`0002` + `0003`)

```
attendance_logs             ← بصمات الحضور الخام
attendance_summary          ← ملخص يومي محسوب
leaves                      ← طلبات الإجازة
leave_balance               ← رصيد الإجازة
leave_settings              ← إعدادات الإجازة لكل شركة
holidays                    ← العطل الرسمية
permissions                 ← الأذونات
permissions_request         ← طلبات الأذونات
wellness_entries            ← تتبع الصحة والرفاهية
```

### 3.4 وحدة HR Ops (`0006_hr_expansion.sql`)

```
bonuses                     ← المكافآت والحوافز
disciplinary_actions        ← الإجراءات التأديبية
employee_documents          ← وثائق الموظف
employee_loans              ← القروض
loan_repayments             ← أقساط القروض  (⚠️ ربما dead)
expense_requests            ← طلبات المصاريف
employee_onboarding         ← تعيينات جديدة
onboarding_tasks            ← مهام Onboarding
offboarding_records         ← سجلات مغادرة
```

### 3.5 وحدة Payroll (`0006`)

```
payroll_periods             ← فترات الرواتب
payroll_records             ← سجلات الرواتب
payroll_settings            ← إعدادات الحساب
```

### 3.6 وحدة Recruitment (`0006` + `0012`)

```
job_postings                ← الوظائف المعلنة
job_applications            ← الطلبات المقدمة
```

### 3.7 وحدة Performance (`0006`)

```
performance_cycles          ← دورات التقييم
performance_reviews         ← تقييمات الأداء
```

### 3.8 وحدة Training (`0003`)

```
courses                     ← الدورات
course_progress             ← تقدم الموظف في الدورة
sops                        ← إجراءات العمل القياسية
sop_readings                ← سجل قراءة SOPs
```

### 3.9 وحدة Notifications (`0003` + `0009`)

```
notifications               ← الإشعارات
├── tenant_id + user_id + created_at (composite index)
├── is_read, read_at
├── priority, action_url, group_key, metadata, expires_at
└── RPC: create_notification(...)
```

### 3.10 وحدة Announcements (`0011_announcements.sql`) — جديد

```
announcements               ← التبليغات الرئيسية
├── type (text|image|video|poll)
├── priority (normal|important|urgent)
├── target_roles[], target_depts[]
├── author_id, has_notification, views
└── deleted_at (soft delete)

announcement_polls          ← استفتاءات
announcement_poll_options   ← خيارات الاستفتاء
announcement_votes          ← أصوات المستخدمين  (UNIQUE poll_id, user_id)
announcement_likes          ← الإعجابات        (PK announcement_id, user_id)

announcements_with_stats    ← VIEW: تبليغ + عدد الإعجابات + قائمة اللاعبين
```

### 3.11 وحدة Gatekeeper (`0012`) — جديد

```
gatekeeper_sessions         ← جلسات الحراس
├── gatekeeper_id
├── started_at, ended_at
├── is_active
└── handover_status, temp_pin

gatekeeper_visitors         ← سجل الزوار العام
├── name, phone, id_number
├── vehicle_number
└── purpose, host_name

gatekeeper_visitor_logs     ← سجل دخول/خروج الزوار (بالجلسة)
├── session_id
├── check_in_time, check_out_time
└── visitor_name, purpose

movements_log               ← حركة الموظفين خارج/داخل
├── employee_id
├── movement_type
├── departure_at, returned_at
└── destination, purpose

employee_breaks             ← استراحات الموظفين  (من 0002)
time_logs                   ← سجلات وقت متنوعة
```

### 3.12 وحدة Tawathul (`0004` + `0005`)

```
tawathul_settings           ← إعدادات البوابة لكل شركة
tawathul_conversations      ← المحادثات
├── type (dm|group|channel|entity)
├── is_private
└── last_message_at

tawathul_members            ← أعضاء المحادثة
tawathul_messages           ← الرسائل
├── body, reply_to_id
└── deleted_at (soft)

tawathul_attachments        ← المرفقات
tawathul_reactions          ← التفاعلات
tawathul_notifications      ← إشعارات Tawathul
tawathul_entity_links       ← ربط بمحادثات كيانات (شكوى، إعلان...)
```

### 3.13 وحدة Platform (`0010` + `0012`)

```
tenant_subscriptions        ← اشتراكات الشركات
├── tenant_id
├── plan (trial|basic|pro|enterprise)
├── started_at, expires_at
└── seats_limit

platform_audit_log          ← سجل تدقيق مستوى المنصة
audit_logs                  ← سجل تدقيق مستوى الشركة
permission_audit_logs       ← سجل تغييرات الصلاحيات
system_settings             ← إعدادات النظام (JSONB)
public_landing_config       ← VIEW: يخفي ai_settings ويعرض landing_config فقط
```

### 3.14 وحدة AI & Insights (`0012`)

```
ai_insights                 ← تحليلات AI
├── insight_type
├── scope (global|department|employee)
├── severity (info|warning|critical)
└── generated_at, valid_until

customer_reviews            ← تقييمات العملاء
├── employee_id
├── rating (1-5)
└── review_text

survey_responses            ← ردود الاستبيانات
```

### 3.15 وحدة Support & Security (`0007`)

```
error_logs                  ← سجل أخطاء التطبيق
security_events             ← أحداث أمنية
device_sync_nonces          ← منع replay attacks (ZKTeco)
sync_log                    ← سجل المزامنة
biometric_devices           ← أجهزة البصمة المسجلة
```

### 3.16 وحدة Incidents & Messaging (`0003` + `0008`)

```
incidents                   ← الشكاوى/الحوادث
incident_comments           ← تعليقات على الشكاوى
hr_messages                 ← رسائل HR للموظفين
```

---

## 4. أنماط RLS الأربعة

### النمط 1: Tenant Read + Owner Write
```sql
CREATE POLICY tbl_select ON public.my_table
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_user_tenant_id());

CREATE POLICY tbl_insert ON public.my_table
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.current_user_tenant_id()
    AND created_by = auth.uid()
  );
```

### النمط 2: Self-only + Staff Override
```sql
CREATE POLICY tbl_select ON public.my_table
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.current_user_tenant_id()
    AND (
      user_id = auth.uid()
      OR public.current_user_is_staff()
    )
  );
```

### النمط 3: Platform Owner Cross-tenant
```sql
CREATE POLICY tbl_select ON public.tenants
  FOR SELECT TO authenticated
  USING (
    id = public.current_user_tenant_id()
    OR public.current_user_is_platform_owner()
  );
```

### النمط 4: No-tenant Table (استثناء موثق)
جداول Gatekeeper بدون `tenant_id` تعتمد على `created_by = auth.uid()`.

---

## 5. الفهارس (Indexes)

**قاعدة عامة:** كل جدول ذي `tenant_id` عليه فهرس مركب:
```sql
CREATE INDEX idx_<tbl>_tenant_<sort> ON public.<tbl>(tenant_id, created_at DESC);
```

**فهارس خاصة:**
- `notifications`: `(tenant_id, user_id, created_at DESC)` + `(user_id, is_read, created_at DESC)`
- `announcements`: `(tenant_id, created_at DESC)` + `(priority)` + `(deleted_at) WHERE deleted_at IS NULL`
- `employees`: `(tenant_id, department_id)` + `UNIQUE(tenant_id, employee_code)`

---

## 6. Extensions المستخدمة

```sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; -- uuid_generate_v4() (احتياطي)
```

---

## 7. سياسة التطور (Evolution Policy)

عند الحاجة لتغيير schema:
1. **اقرأ** `docs/adr/0003-multi-tenancy-strategy.md`.
2. **أنشئ** ملفاً جديداً بترقيم متسلسل (`00XX_short_description.sql`).
3. **لا تعدّل** ملفاً قديماً — قد يكون منفَّذاً في production.
4. **استخدم** `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.
5. **حافظ على** RLS مفعّل.
6. **شغّل** `node scripts/check-db-contract.mjs` قبل الـ commit.
7. **اختبر** على staging قبل production.

---

**التوقيع:** Platform Architect
**آخر تحديث:** 2026-07-15
