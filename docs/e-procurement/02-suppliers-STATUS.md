# الوحدة 02: الموردون والتأهيل — حالة التنفيذ
### بوابة المشتريات — Kyvzon Platform

> **الحالة:** مكتملة محلياً ومُتحقَّق منها على Postgres 17
> **المايجريشنات:** `0258` · `0259` · **المرجع:** `03-supplier-onboarding-qualification.md`

---

## 🔴 فصيلة أعطال جديدة: دوال `STABLE` تنفّذ كتابة

### القاعدة
PostgreSQL يمنع الكتابة داخل دالة `STABLE`/`IMMUTABLE`، والخطأ يقع **وقت التنفيذ**:

```
ERROR: UPDATE is not allowed in a non-volatile function
```

لا يكشفه أي فحص ثابت — تُنشأ الدالة بنجاح ثم تفشل عند أول استدعاء.

### 1) `calculate_kraljic` — معطّلة كلياً (`0258`)

مصفوفة كراليتش **متطلب صريح** في التوثيق، وكانت تفشل عند كل استدعاء.
النتيجة: عمود `suppliers.kraljic_category` لا يُحدَّث أبداً.

**بعد الإصلاح:** ✅ `routine` تُحسب وتُحفظ فعلياً.

### 2) `calculate_supplier_otif` — الأخطر (`0259`)

نفس العلة، لكن بخداع إضافي:

```sql
IF v_total = 0 THEN RETURN 0; END IF;   -- تخرج قبل UPDATE
...
UPDATE public.supplier_spend_summary SET otif_score = ...
```

تخرج مبكراً حين لا توجد أوامر شراء، فتبدو سليمة في بيئة فارغة و**تفشل فور وجود بيانات حقيقية** — أسوأ أنواع الأعطال.

**الإثبات بعد الإصلاح:**

| قبل | بعد |
|---|---|
| `otif_score = 0.00` (لم يُكتب شيء) | ✅ `100.00` محسوبة ومحفوظة |

### 3) `forecast_spend` (3 معاملات) — (`0259`)

معلَّنة `STABLE` بينما تكتب في `spend_forecasts`. أُصلحت، وأُضيف تحصين: لم تعد تثق بالـ `tenant_id` الممرَّر بل تستخدم `current_user_tenant_id()`.

### 🛡️ حارس دائم

`0259` ينتهي بفحص آلي يفشل المايجريشن إن بقيت أي دالة `STABLE`/`IMMUTABLE` تكتب:

```sql
WHERE p.provolatile IN ('s','i')
  AND p.prosrc ~* '(insert into|update |delete from)'
```

وأُضيف اختبار عقود يمنع تكرار النمط في أي مايجريشن مشتريات جديد.

---

## التحقق بالتشغيل الفعلي

| الاختبار | النتيجة |
|---|---|
| تطبيق 188 مايجريشن | ✅ بلا خطأ |
| إنشاء مورد | ✅ `SUP-001` |
| تقييم مخاطر (5 أبعاد × 0–20) | ✅ `total_score=25` · `risk_level=low` محسوبان تلقائياً |
| `sync_supplier_risk_from_assessment` | ✅ `risk_score=25` |
| `decide_supplier_qualification('approve')` | ✅ `prospect → approved` |
| رفض قرار غير صالح | ✅ `INVALID_SUPPLIER_DECISION` |
| `calculate_kraljic` | ✅ `routine` محفوظة |
| `calculate_supplier_otif` | ✅ `100.00` محفوظة |
| تنبيهات انتهاء الوثائق | ✅ تظهر بعد التوثيق (`verified`) |
| مسح شامل للتقلّبية | ✅ **0 دالة مخالفة** |

> **قيم صحيحة مكتشفة:** درجات المخاطر **0–20** لكل بُعد (لا 0–100)، وقرارات التأهيل هي
> `approve` · `reject` · `suspend` · `reactivate` · `under_review`.

---

## تغطية متطلبات التوثيق

| المتطلب | الحالة |
|---|---|
| بوابة موردين ذاتية | ✅ `supplier_portal_invites` + `verify_supplier_portal_token` |
| نماذج التأهيل | ✅ `supplier_qualification_forms/responses` |
| سير الموافقة | ✅ `decide_supplier_qualification` |
| آلة تقييم المخاطر | ✅ 5 أبعاد + `total_score`/`risk_level` محسوبان |
| إدارة الوثائق + تنبيهات | ✅ `check_supplier_documents_expiry` |
| قائمة الموردين المعتمدين | ✅ `status` + `findApproved` |
| **مصفوفة كراليتش** | ✅ **بعد `0258`** (كانت معطّلة) |
| سجل التدقيق | ✅ `supplier_audit_log` + `tg_supplier_audit` |
| تنبيهات الامتثال | ✅ `supplier_expiry_alerts` |

---

## إصلاحات الواجهة

| المشكلة | الإصلاح |
|---|---|
| 7 × `as any` | أنواع صريحة |
| `doc_type` كنص حر | مقيّد بـ `SupplierDocumentRecord['doc_type']` |
| `recommendation` كنص حر | مقيّد بالقيم المسموحة |
| `riskTotal` عبر `(riskForm as any)[key]` | مصفوفة `as const` آمنة |

> إزالة `as any` **كشفت ثغرتَي أمان نوعي حقيقيتين**: النماذج كانت تسمح
> بإرسال قيم غير صالحة لقاعدة البيانات.

---

## الفحوصات

| الفحص | النتيجة |
|---|---|
| `type-check` | ✅ 0 أخطاء |
| `build` | ✅ |
| `db:contract-check` · `procurement-sql-check` | ✅ PASS |
| اختبار عقود الوحدة 02 | ✅ 14 |
| المشروع كاملاً | ✅ **595 اختباراً** |
| `lint` | ✅ 0 أخطاء · التحذيرات 1432 ← **1413** |

---

## ما لم يُنجز

- ❌ لم تُختبر في متصفح حقيقي.
- ❌ `npx supabase db push` لم يُنفَّذ لـ `0256`–`0259`.
- ⚠️ بوابة المورد الذاتية موجودة كبنية (دعوات ورموز) لكن **لا واجهة خارجية** للمورد.
- ⚠️ `SupplierDetailPage` (290 سطراً بأسطر طويلة جداً) يستحق تقسيماً.
