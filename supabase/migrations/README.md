# 🗄️ Kyvzon — Canonical Database Migrations

> **⚠️ هذا هو المصدر الوحيد الرسمي لـ schema قاعدة بيانات Kyvzon.**
>
> - **لا** تُنفّذ أي ملف من `database/migrations/` (منقول لـ `database/legacy-DO-NOT-USE/`).
> - **لا** تُنفّذ `database/schema.sql` القديم.
> - **لا** تُضِف SQL في أي مسار آخر — سيفشل CI check.

---

## 📋 ترتيب التنفيذ (Strict Order)

نفّذ الملفات **بهذا الترتيب بالضبط** على قاعدة بيانات Supabase فارغة:

| # | الملف | الغرض | التبعية |
|:---:|---|---|---|
| 0 | `0000_extensions.sql` | تفعيل pgcrypto + uuid-ossp | — |
| 1 | `0001_core_schema.sql` | tenants, profiles, employees, departments | 0000 |
| 2 | `0002_employee_features.sql` | attendance, leaves, permissions, holidays | 0001 |
| 3 | `0003_hr_platform_modules.sql` | courses, sops, notifications, wellness, incidents | 0001 |
| 4 | `0004_tawathul_core.sql` | tawathul: settings, conversations, members, messages | 0001 |
| 5 | `0005_tawathul_rls_features.sql` | tawathul: attachments, reactions, notifications + RLS | 0004 |
| 6 | `0006_hr_expansion.sql` | bonuses, disciplinary, docs, loans, onboarding, jobs, payroll | 0001, 0002 |
| 7 | `0007_support_and_security.sql` | error_logs, device_sync_nonces, security_events | 0001 |
| 8 | `0008_incident_contract_fixes.sql` | ALTER for incidents contract | 0003 |
| 9 | `0009_notifications_contract.sql` | notifications: ALTER + RLS + RPC | 0003 |
| 10 | `0010_platform_tenant_rls_audit.sql` | Platform tables tenant RLS + owner functions | 0001 |
| 11 | `0011_announcements.sql` | announcements + polls + votes + likes + view | 0001 |
| 12 | `0012_gatekeeper_and_missing.sql` | gatekeeper + time_logs + specialties + ai_insights + reviews + job_applications + landing view | 0001 |
| 13 | `0013_drop_dead_tables.sql` | حذف الجداول غير المستخدمة (اختياري) | 0006 |
| 14 | `0014_structure_reference_rls.sql` | RLS لجداول `structure_*` المرجعية | 0001, 0007 |

---

## 🚀 طرق التنفيذ

### الطريقة 1: Supabase CLI (موصى بها)
```bash
# ربط المشروع أولاً
supabase link --project-ref <your-project-ref>

# دفع كل Migrations
supabase db push
```

### الطريقة 2: SQL Editor يدوياً
انسخ محتوى كل ملف بالترتيب أعلاه والصقه في Supabase Dashboard → SQL Editor → Run.

### الطريقة 3: محلياً عبر Docker
```bash
supabase start          # يشغل Postgres محلي على 54322
supabase db reset       # ينفذ كل migrations من الصفر
```

---

## ✅ فحص ما بعد التنفيذ

بعد تنفيذ كل الملفات، شغّل هذه الاستعلامات:

### 1. تحقق من عدد الجداول
```sql
SELECT COUNT(*) AS total_tables
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE';
-- المتوقع: ~75 جدول
```

### 2. تحقق من تفعيل RLS
```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND rowsecurity = false;
-- المتوقع: 0 نتائج (كل الجداول عليها RLS)
```

### 3. تحقق من الدوال المساعدة
```sql
SELECT proname
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN (
    'current_user_tenant_id',
    'current_user_role',
    'current_user_is_staff',
    'current_user_is_platform_owner',
    'set_session_context',
    'clear_session_context'
  );
-- المتوقع: 6 دوال
```

### 4. تحقق من عقد Frontend/DB
```bash
node scripts/check-db-contract.mjs
# المتوقع: "Missing canonical tables/views: 0"
```

---

## 🔐 مبادئ التصميم

1. **Multi-tenant صارم:** كل جدول بيانات عليه `tenant_id UUID NOT NULL`.
2. **RLS مبني على `auth.uid()`:** لا يعتمد على أي قيمة يرسلها العميل (لا `localStorage`, لا headers).
3. **الدوال الحرجة SECURITY DEFINER:** مع `SET search_path = public` لمنع injection.
4. **Idempotent:** كل ملف يستخدم `CREATE IF NOT EXISTS` / `DROP IF EXISTS ... CREATE` — يمكن إعادة تشغيله بأمان.
5. **Service Role حصراً في Edge Functions:** لا يُستخدم من المتصفح مطلقاً.
6. **Header قياسي:** كل ملف يبدأ بـ PURPOSE / DEPENDS ON / SAFETY LEVEL.

---

## 📊 خريطة الجداول بالوحدات

| الوحدة | الجداول | الملفات |
|---|---|:---:|
| **Auth & Tenants** | `tenants`, `profiles`, `user_tenants` | 0001 |
| **Structure** | `departments`, `employees`, `specialties`, `structure_*` | 0001, 0012 |
| **Employee** | `attendance_logs`, `attendance_summary`, `leaves`, `permissions`, `permissions_request`, `holidays`, `wellness_entries` | 0002, 0003 |
| **HR Ops** | `bonuses`, `disciplinary_actions`, `employee_documents`, `employee_loans`, `expense_requests`, `employee_onboarding` | 0006 |
| **Payroll** | `payroll_periods`, `payroll_records`, `payroll_settings` | 0006 |
| **Recruitment** | `job_postings`, `job_applications` | 0006, 0012 |
| **Performance** | `performance_cycles`, `performance_reviews` | 0006 |
| **Training** | `courses`, `course_progress`, `sops`, `sop_readings` | 0003 |
| **Notifications** | `notifications` | 0003, 0009 |
| **Announcements** | `announcements`, `announcement_polls`, `announcement_poll_options`, `announcement_votes`, `announcement_likes`, `announcements_with_stats` (view) | 0011 |
| **Gatekeeper** | `gatekeeper_sessions`, `gatekeeper_visitors`, `gatekeeper_visitor_logs`, `movements_log`, `employee_breaks`, `time_logs` | 0012 |
| **Tawathul** | `tawathul_settings`, `tawathul_conversations`, `tawathul_members`, `tawathul_messages`, `tawathul_attachments`, `tawathul_reactions`, `tawathul_notifications`, `tawathul_entity_links` | 0004, 0005 |
| **Platform** | `tenant_subscriptions`, `platform_audit_log`, `audit_logs`, `permission_audit_logs`, `system_settings`, `public_landing_config` (view) | 0003, 0010, 0012 |
| **AI & Insights** | `ai_insights`, `customer_reviews`, `survey_responses` | 0012 |
| **Support & Security** | `error_logs`, `security_events`, `device_sync_nonces`, `sync_log`, `biometric_devices` | 0007 |
| **Incidents** | `incidents`, `incident_comments`, `hr_messages` | 0003, 0008 |

---

## 🚨 محرمات (Do NOT)

- ❌ **لا** تضِف SQL خارج `supabase/migrations/`.
- ❌ **لا** تحذف عمود `tenant_id` من أي جدول.
- ❌ **لا** تعطّل RLS على جدول ذي بيانات.
- ❌ **لا** تكتب سياسة `USING (true)` على جدول بيانات (فتح كامل).
- ❌ **لا** تعتمد على `current_setting('app.current_tenant_id')` — استخدم `current_user_tenant_id()`.
- ❌ **لا** تعرِّض `SUPABASE_SERVICE_ROLE_KEY` في الواجهة.

---

## 📚 مراجع
- استراتيجية Multi-tenant: `docs/adr/0003-multi-tenancy-strategy.md`
- تصميم SDK Layer: `docs/adr/0002-sdk-layer-architecture.md`
- خريطة كاملة: `docs/DATABASE_ARCHITECTURE.md`
- سجل التحسين: `docs/SQL_REMEDIATION_PLAN_AR.md`

---

**آخر تحديث:** 2026-07-15
**المشرف:** Platform Architect
