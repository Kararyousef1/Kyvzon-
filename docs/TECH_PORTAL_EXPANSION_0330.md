# 0330 — تطوير بوابة التقنية: السجلّ الموحّد والأخطاء والمهام

**التاريخ:** 2026-08-05 · **الفرع:** `remediation/p0-security-and-build-health`
**الحالة:** مُطبَّق ومُختبَر على Postgres 17.10 محلي

---

## السياق

بوابة التقنية مسؤولة عن الجانب التقني **لكل** البوابات. لكنها كانت تعرض
سبع صفحات تخصّ الحضور والأجهزة فقط، بينما البيانات التقنية الحقيقية بلا
واجهة إطلاقاً.

---

## الفجوات المُثبَتة بالفحص

### ① سجلّ التدقيق مُبعثَر على 16 جدولاً

```
audit_logs · audit_vault · contract_audit_log · crm_audit_log ·
finance_audit_events · inventory_audit_log · invoice_audit_log ·
movement_audit_events · mrp_audit_log · permission_audit_logs ·
po_audit_log · pr_audit_log · procurement_audit_events ·
rfx_event_audit_log · supplier_audit_log · platform_audit_log
```

مقيس: **صفر** دالة تجميع (الموجود كلّه `log_*_audit` للكتابة في جدول
بعينه). فمسؤول التقنية الذي يسأل «من غيّر هذا السجلّ؟» عليه أن يعرف
الوحدة أولاً ثم يفتح جدولها.

**الجداول متجانسة بنيوياً** (فُحص عمود عمود): كلها فيها `tenant_id` +
فاعل + فعل + وقت. لكن الأسماء تختلف:

| المفهوم | الأسماء الفعلية |
|---|---|
| الفاعل | `actor_id` · `user_id` · `changed_by` |
| الفعل | `action` · `event_type` |
| الوقت | `created_at` · `timestamp` |

### ② `error_logs` بلا واجهة

جدول فيه `severity` (`low`·`medium`·`high`·`critical`) و`stack_trace`
و`route` و`file_name` و`line_number` — أي كل ما يلزم لتشخيص عطل — ولا
صفحة تعرضه.

### ③ `scheduled_job_runs` بلا واجهة وبلا `tenant_id`

سياستها: `current_user_role() IN ('admin','developer','it_admin')` بلا
فلتر مستأجر — لأنها **بيانات منصة** (مهام تعمل عبر كل المستأجرين).

---

## قرارا عزل صريحان (امتداد لـ0328)

بوابة التقنية للشركة المستأجِرة، لا نافذة على داخل المنصة:

1. **`platform_audit_log` مُستثنى** من السجلّ الموحّد — بيانات منصة.
2. **المهام المجدولة تُعرض مُجمَّعة**: اسم المهمة · آخر تشغيل · نجاح ·
   مدّة. **بلا `tenants_processed` ولا `details`** — هذان يكشفان حجم
   العملاء الآخرين ونشاطهم.

مُثبَت بـRLS: الدالة تُعيد `runs_24h = 1` لا `tenants_processed = 99`.

---

## ما أُضيف

### القاعدة
| العنصر | الغرض |
|---|---|
| `tech_audit_unified` | عرض واحد فوق **15** جدولاً مع تطبيع الأعمدة |
| `tech_audit_trail()` | ترشيح بالوحدة + بحث نصّي + ترقيم |
| `tech_audit_modules()` | الوحدات وعدّادها — لبناء المرشّحات |
| `tech_error_log()` | سجلّ الأخطاء مع ترشيح بالخطورة |
| `tech_error_summary()` | ملخّص — **كل مستوى يظهر ولو بصفر** |
| `tech_scheduled_jobs()` | حالة المهام مُجمَّعة |

**الدوال الأربع الأولى `SECURITY INVOKER` عمداً**: العرض يقرأ 15 جدولاً
لكلٍّ سياساته، فتركها `INVOKER` يجعل RLS يعمل على كل جدول على حدة. لو
كانت `DEFINER` لتجاوزتها كلها.

**`tech_scheduled_jobs` استثناء مُعلَّل**: الجدول بلا `tenant_id` فلا
ينفع `INVOKER`؛ قُيِّد الدور يدوياً بـ`current_user_is_tenant_tech()`.

### الواجهة
| الصفحة | المسار |
|---|---|
| `AuditTrailPage` | `/app/tech-portal/audit-trail` |
| `ErrorLogsPage` | `/app/tech-portal/error-logs` |

تفاصيل صحيحة بالتصميم:
- **كل مستوى خطورة يظهر ولو بصفر** — البطاقة المفقودة تُقرأ «لا مشكلة» خطأً.
- **حالة فارغة مفسَّرة** لا شاشة بيضاء («سجلّ شركتك نظيف» مقابل «لا أخطاء
  بهذه الخطورة»).
- **`stack_trace` قابل للطيّ** بـ`dir="ltr"` (نصّ برمجي).
- **فشل خارج 24 ساعة لا يجعل المهمة غير سليمة** — وإلا صارت تنبيهاً دائماً.

---

## ⚠️ اكتشاف: مواضع التسجيل **ستة** لا خمسة

القاعدة الموثَّقة تقول خمسة مواضع. `tsc` أثبت وجود سادس:

```
permissions.ts(447,5): error TS2322:
  Type '"tech-audit-trail"' is not assignable to type ...
```

| # | الموضع |
|---|---|
| ① | `AppRouter.tsx` — `lazy` + `<Route>` |
| ② | `Sidebar.tsx` — عنصر التنقل **و**خريطة الوحدة |
| ③ | `hybridPagesCatalog.ts` — الكتالوج **و**قائمة `tech` |
| ④ | `permissions.ts` — الأدوار |
| ⑤ | **`permissions.ts` — `PERMISSION_KEYS`** ← المُغفَل |
| ⑥ | `legacyRedirect.ts` — `VIEW_TO_PATH` |

**الموضع ⑥ يحتاج توضيحاً:** `Sidebar.tsx:1351` يعتمد `VIEW_TO_PATH`
لتحويل معرّف عنصر التنقل إلى مسار. فرغم أن طبقة `?view=` **مهجورة**
(قرار `0329`)، تسجيل أي صفحة جديدة فيها **إلزامي** — وليس تعييناً
«قديماً». وُثّق ذلك في الملف نفسه وفي الاختبار.

---

## إثبات العكس

| العكس | التأكيد الساقط |
|---|---|
| إدراج `platform_audit_log` في السجلّ الموحّد | `1.4 ★★ platform_audit_log ضمن السجلّ الموحّد — تسريب بيانات منصة` |
| ملخّص الأخطاء يُسقط المستويات الصفرية | `6.1 ★ مستويات الخطورة = 2 (متوقَّع 4) — بطاقة مفقودة تُقرأ «لا مشكلة»` |

بعد كل استرجاع: `✅ verify-0330: 38/38`.

---

## ⚠️ خطآن وقعتُ فيهما

### ① حارس `0329` أوقف عملي — وكان محقّاً
اختبار «عدد التعيينات لم يزد» سقط: `expected 437 to be less than or
equal to 435`. الحارس الذي كتبتُه في الجولة السابقة التقط إضافتي
الجديدتين. **لم أُلغِ الحارس** بل صحّحتُ مرجعه وأضفتُ شرطاً يفرض أن
تكون كل إضافة **مُعلَّلة** في الملف نفسه — فلا تمرّ إضافة صامتة.

### ② أعمدة خمّنتُها
مسباري سقط مرتين:
```
inventory_audit_log.entity_table NOT NULL
finance_audit_events: legal_entity_id · aggregate_type · aggregate_id NOT NULL
```
وُثّقت في رأس ملف الاختبار.

---

## حالة الفحوص

```
259 مايجريشن من الصفر            صفر فشل
37/38 ملف سلوكي · 551 تأكيداً مرقّماً
verify-0330         38/38
verify-0330-rls     11/11  (RLS حقيقي)
verify-0329-rls     10/10 · verify-0328-rls 17/17
verify-0326-rls      8/8  · verify-0324-rls  5/5
2411/2411 اختبار وحدة في 123 ملفاً   (+37 جديداً)
tsc EXIT=0 · lint 0 خطأ (1322 تحذيراً) · build ✅ · contract-check PASS
```

**الملف الفاشل الوحيد:** `verify-procurement-0256-0269.sql` — أداة تشخيص
للسحابة تقرأ `supabase_migrations.schema_migrations` (غير موجود محلياً).

---

## ما لم يُختبر

- **المتصفح** — لم يُختبر في أي جولة. الصفحتان الجديدتان مبنيّتان على
  نفس أنماط الصفحات القائمة، لكن لم تُفتحا فعلياً.
- **حجم البيانات**: السجلّ الموحّد `UNION ALL` فوق 15 جدولاً. مع ترقيم
  (`LIMIT 500` أقصى) لكنه لم يُختبر بملايين الصفوف. قد يحتاج فهارس على
  `(tenant_id, created_at)` في الجداول الأكبر.

---

## ما تبقّى مقترحاً لبوابة التقنية

| الفكرة | الحاجة |
|---|---|
| صفحة تكاملات | `finance_integration_connectors` · `inventory_carrier_webhook_events` بلا واجهة |
| صفحة صادرات | `export_logs` · `*_report_exports` بلا واجهة |
| تنبيهات استباقية | ربط `error_logs` الحرجة بجرس الإشعارات (`notify_user`) |
| فهارس الأداء | `(tenant_id, created_at)` على جداول التدقيق الأكبر |

---

## الملفات

```
supabase/migrations/0330_tech_portal_unified_audit.sql   جديد
tools/dev/verify-tech-audit-0330.sql                     جديد · 38 تأكيداً
tools/dev/verify-tech-audit-0330-rls.sh                  جديد · 11 عبر RLS
src/test/techAuditContract.test.ts                       جديد · 37 اختباراً
src/services/sdk/TechAuditService.ts                     جديد
src/pages/techportal/pages/AuditTrailPage.tsx            جديد
src/pages/techportal/pages/ErrorLogsPage.tsx             جديد
src/router/AppRouter.tsx · Sidebar.tsx · hybridPagesCatalog.ts
src/core/constants/permissions.ts · src/router/legacyRedirect.ts
src/test/legacyDeprecationContract.test.ts               مرجع مُصحَّح
```
