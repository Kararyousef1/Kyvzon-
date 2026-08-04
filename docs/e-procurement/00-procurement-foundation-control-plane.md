# الوحدة 00: الأساس ولوحة التحكم (Procurement Foundation & Control Plane)
### بوابة المشتريات — Kyvzon Platform

> **الحالة:** مكتملة محلياً ومُتحقَّق منها على Postgres 17 · **المايجريشن:** `0256`

---

## لماذا هذه الوحدة أولاً؟

كل وحدة لاحقة تعتمد عليها:

| الوحدة | تعتمد على |
|---|---|
| 01 طلبات الشراء | **قواعد الموافقة** — بدونها لا يجد الطلب معتمِداً |
| 04 أوامر الشراء | **السياسات** — عتبات الاستلام الزائد |
| 07 تحليل الإنفاق | **فئات الإنفاق** — بدونها الإنفاق غير مصنّف |
| كل الوحدات | **سجل التدقيق** — لتتبّع من غيّر وماذا ولماذا |

---

## المكوّنات

### 1) فئات الإنفاق (UNSPSC)

تصنيف هرمي على أربعة مستويات:

```
1 قطاع  →  2 فئة  →  3 صنف  →  4 منتج
```

**قواعد ملزمة في قاعدة البيانات:**

| القاعدة | رسالة الرفض |
|---|---|
| مستوى > 1 يتطلب أباً | `NON_ROOT_CATEGORY_REQUIRES_PARENT` |
| الأب أعلى بمستوى واحد فقط | `PARENT_LEVEL_MUST_BE_ONE_ABOVE_CHILD` |
| لا يمكن أن تكون الفئة أباً لنفسها | `CATEGORY_CANNOT_BE_ITS_OWN_PARENT` |
| لا تعطيل فئة لها أبناء نشطون | `CATEGORY_HAS_ACTIVE_CHILDREN` |
| التعطيل يتطلب سبباً | `CATEGORY_STATUS_REASON_REQUIRED` |

### 2) قواعد الموافقة

تحدد **من يعتمد** طلب الشراء حسب المبلغ والقسم والمستوى (1–5).

**الأدوار المسموحة:** `supervisor` · `direct_manager` · `manager` · `finance` · `procurement` · `admin`

| القاعدة | رسالة الرفض |
|---|---|
| الحد الأعلى يتجاوز الأدنى | `MAX_AMOUNT_MUST_EXCEED_MIN_AMOUNT` |
| دور صالح فقط | `INVALID_REQUIRED_ROLE` |
| المستوى 1–5 | `RULE_LEVEL_MUST_BE_1_TO_5` |
| التعطيل يتطلب سبباً | `RULE_STATUS_REASON_REQUIRED` |

> القسم `NULL` يعني «كل الأقسام».

### 3) سياسات المشتريات

ضوابط على مستوى الشركة، تُعرض في الواجهة **كحقول مفهومة لا JSON خام**:

| المفتاح | الوصف |
|---|---|
| `pr_auto_approve_limit` | حد الاعتماد التلقائي |
| `pr_require_budget_check` | إلزام فحص الميزانية |
| `po_require_three_quotes` | إلزام ثلاثة عروض فوق عتبة |
| `gr_allow_over_receipt` | نسبة الاستلام الزائد المسموحة |
| `supplier_require_documents` | منع التعامل مع مورد بوثائق منتهية |

### 4) سجل التدقيق

جدول `procurement_audit_events` يسجّل: الحدث · النوع · الفاعل · **السبب** · الحالة قبل وبعد.

### 5) فحص الجاهزية

`validate_procurement_foundation()` يكشف الفجوات قبل التشغيل:

| الرمز | الخطورة |
|---|---|
| `NO_ACTIVE_APPROVAL_RULES` | 🔴 خطأ |
| `APPROVAL_RULE_OVERLAP` | 🟡 تحذير |
| `NO_SPEND_CATEGORIES` | 🟡 تحذير |
| `ORPHAN_CATEGORIES` | 🟡 تحذير |
| `NO_ACTIVE_SUPPLIERS` | 🟡 تحذير |

---

## الكائنات المُنشأة (0256)

**جداول:** `procurement_audit_events` · `procurement_policies`

**RPCs:**
```
log_procurement_audit_event · upsert_spend_category · set_spend_category_status
upsert_procurement_approval_rule · set_procurement_approval_rule_status
upsert_procurement_policy · validate_procurement_foundation
```

**Views (كلها `security_invoker`):**
```
procurement_category_tree · procurement_category_lookup
procurement_approval_rule_board · procurement_audit_board
procurement_policy_board · procurement_foundation_dashboard
```

---

## الصفحات

| المسار | الوصف |
|---|---|
| `/app/procurement/foundation` | لوحة المؤشرات + فحص الجاهزية |
| `/app/procurement/foundation/categories` | شجرة فئات الإنفاق |
| `/app/procurement/foundation/approval-rules` | قواعد الموافقة |
| `/app/procurement/foundation/policies` | السياسات |
| `/app/procurement/foundation/audit` | سجل التدقيق |

---

## ما أُصلح في هذه الوحدة

| المشكلة | الإصلاح |
|---|---|
| الداشبورد يعرض «خارطة طريق» ثابتة وأرقاماً خاطئة (عدّ بـ `limit`) | مؤشرات حقيقية من `procurement_foundation_dashboard` |
| `as any` في الداشبورد | أنواع صريحة |
| **لا يوجد `ProcurementUnitNav`** | أُنشئ بـ 9 وحدات |
| الشريط الجانبي 9 عناصر مسطّحة | وحدات فقط + `splitInventorySection` |
| **صفر صفحة مشتريات في `hybridPagesCatalog`** | 15 صفحة |
| شاشة الصلاحيات: 9 صفحات | 13 صفحة |
| صفحة إدارية مكرّرة بـ `confirm()` و **حذف نهائي** | حُوّلت إلى `Navigate` للصفحة المعتمدة |
| خدمة `BaseService<any>` تسمح بالحذف | حُذفت — الآن RPCs مع سبب وتدقيق |

---

## التحقق المُنجز

| الفحص | النتيجة |
|---|---|
| تطبيق 185 مايجريشن على Postgres 17 | ✅ بلا خطأ |
| الـ6 Views تُقرأ فعلياً | ✅ |
| RPCs بمدخلات صحيحة وخاطئة | ✅ كل التحققات تعمل |
| مسح 60 دالة `RETURNS TABLE` | ✅ 0 تعارض أنواع |
| `type-check` · `build` · `lint` | ✅ 0 أخطاء |
| اختبار العقود | ✅ 19 اختباراً |
| اختبارات المشروع كاملاً | ✅ 566 اختباراً |

> **بُغيت أثناء التطوير وأُصلحت:** `spend_transactions.category_code` (لا `category_id`)
> و`departments.name_ar` (لا `name`) — كشفهما التشغيل الفعلي، لا الفحص النصي.

---

## ما لم يُنجز

- ❌ لم تُختبر في متصفح حقيقي.
- ❌ `npx supabase db push` لم يُنفَّذ للمايجريشن `0256`.
- ⚠️ بذور UNSPSC القياسية غير محمّلة (تُدخل يدوياً أو تُستورد لاحقاً).
