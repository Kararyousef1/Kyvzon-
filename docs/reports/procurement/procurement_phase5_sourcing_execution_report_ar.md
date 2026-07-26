# تقرير تنفيذ Phase 5 — Strategic Sourcing RFx وفق التوثيق

**التاريخ:** 2026-07-26  
**الوحدة:** الوحدة الثانية — Strategic Sourcing / RFI / RFQ / RFP / Reverse Auctions  
**التوثيق المقروء قبل التنفيذ:**

```text
docs/e-procurement/02-strategic-sourcing-RFx.md
```

---

## 1) المتطلبات المستخرجة من التوثيق

الوحدة الثانية تطلب:

- منشئ أحداث RFI/RFQ/RFP بقوالب جاهزة.
- بوابة موردين لتقديم العروض مباشرة.
- مقارنة عروض TCO تلقائية.
- مزادات عكسية British/Japanese/Dutch بضوابط زمنية.
- إدارة أسئلة Q&A بين الموردين والمشتريات.
- سير حدث التوريد من الإصدار إلى الترسية مع audit.
- تقييم متعدد المعايير MECCA.
- أرشيف أحداث التوريد وKPIs.

---

## 2) Migration جديدة لإكمال أساس RFx

تم إنشاء:

```text
supabase/migrations/0194_procurement_sourcing_completion.sql
```

### ما أضافته؟

#### 2.1 حقول إضافية على `sourcing_events`

- `evaluation_method`
- `award_supplier_id`
- `awarded_bid_id`
- `award_reason`
- `issued_at`
- `awarded_at`

هذه تدعم سير الحدث حتى الترسية.

---

#### 2.2 جدول دعوات الموردين

```sql
rfx_supplier_invitations
```

يدعم:

- event_id
- supplier_id
- email
- token_hash
- status: invited/viewed/responded/declined/expired/cancelled
- bid_id
- invited_at/responded_at/expires_at

وهذا يربط RFx ببوابة الموردين.

---

#### 2.3 جدول الأسئلة والإجابات

```sql
rfx_questions
```

يدعم:

- سؤال المورد.
- إجابة المشتريات.
- رؤية السؤال: all_suppliers/private.
- الحالة: open/answered/closed.

وهذا يحقق متطلب إدارة الأسئلة.

---

#### 2.4 سجل تدقيق RFx

```sql
rfx_event_audit_log
```

يسجل:

- الدعوات.
- الأسئلة.
- الإجابات.
- الترسية.
- أحداث RFx المهمة.

---

#### 2.5 دوال جديدة

```sql
log_rfx_audit(...)
invite_suppliers_to_rfx(uuid, uuid[])
answer_rfx_question(uuid, text)
award_supplier_bid(uuid, text)
```

##### `award_supplier_bid`

تقوم بـ:

- ترسية bid.
- رفض بقية العروض.
- تحديث `sourcing_events` إلى `awarded`.
- حفظ supplier الفائز وسبب الترسية.
- تحديث الدعوة المرتبطة.
- تسجيل audit.

---

#### 2.6 KPI View

```sql
sourcing_event_kpis
```

تعرض:

- عدد الأحداث.
- عدد الأحداث المرساة.
- متوسط دورة التوريد بالأيام.
- متوسط الموردين المدعوين.
- متوسط العروض المستلمة.

---

## 3) Edge Function لبوابة المورد الخاصة بـ RFx

تم إنشاء:

```text
supabase/functions/procurement-supplier-rfx/index.ts
```

### الإجراءات المدعومة

#### verify

يفتح دعوة RFx من token ويعيد:

- بيانات الحدث.
- البنود.
- الأسئلة.
- العروض السابقة للمورد.
- بيانات المورد.

#### submit_bid

يسمح للمورد بتقديم العرض عبر رابط الدعوة.

يحفظ في:

```sql
supplier_bids
```

ويحدث:

```sql
rfx_supplier_invitations.status = responded
```

#### ask_question

يسمح للمورد بإرسال سؤال إلى المشتريات.

يحفظ في:

```sql
rfx_questions
```

---

## 4) تحديث Edge Function إرسال RFQ

تمت إعادة بناء:

```text
supabase/functions/procurement-send-rfq/index.ts
```

### التحسينات

- تتحقق من JWT ودور المستخدم.
- تتحقق من أن الحدث والموردين داخل نفس tenant.
- تختار فقط الموردين `approved`.
- تنشئ token آمن لكل مورد.
- تخزن `token_hash` فقط داخل `rfx_supplier_invitations`.
- ترسل رابط:

```text
/supplier-rfx/:token
```

- إذا لا يوجد Resend key، تعمل بوضع simulated وتعيد الروابط للاختبار.
- تسجل audit.

---

## 5) صفحة عامة للمورد لتقديم RFx

تم إنشاء:

```text
src/pages/public/supplier/SupplierRfxPortalPage.tsx
```

وربطها بالراوتر:

```text
/supplier-rfx/:token
```

### الصفحة تتيح للمورد

- فتح الدعوة من الرابط.
- مشاهدة حدث RFx.
- مشاهدة البنود والمتطلبات.
- تقديم السعر الإجمالي.
- تحديد العملة.
- إدخال Lead Time.
- إدخال نسبة الخصم.
- طرح سؤال للمشتريات.
- رؤية الإجابات.

---

## 6) تحديث صفحة تفاصيل RFx الداخلية

تمت إعادة بناء:

```text
src/pages/app/procurement/sourcing/RfxDetailPage.tsx
```

### أصبحت تدعم

- عرض بيانات الحدث.
- اختيار موردين معتمدين.
- إرسال RFx عبر Edge Function.
- تسجيل دعوات فقط عبر RPC.
- عرض حالات الدعوات.
- عرض العروض وترتيبها حسب TCO.
- ترسية العرض الفائز مع سبب.
- عرض Q&A والإجابة على أسئلة الموردين.

---

## 7) تحديث SDK

تم تعديل:

```text
src/services/sdk/Procurement/SourcingService.ts
```

وأضيف:

- `RfxInvitationRecord`
- `RfxQuestionRecord`
- `rfxInvitationService`
- `rfxQuestionService`
- `supplierBidService.award()`

وتم تصديرها من:

```text
src/services/sdk/index.ts
```

---

## 8) تحديث Post Migration Checks

تم تعديل:

```text
scripts/tests/99_post_migration_checks.sql
```

ليتحقق من:

- `rfx_supplier_invitations`
- `rfx_questions`
- `rfx_event_audit_log`
- `award_supplier_bid(uuid,text)`

---

## 9) تحديث الاختبارات

تم تحديث:

```text
src/test/procurement/procurementSecurityContract.test.ts
```

وأضيف فحص أن:

- migration `0194` موجودة.
- جداول الدعوات والأسئلة موجودة.
- دالة الترسية موجودة.
- route `/supplier-rfx/:token` موجود.
- Edge Function المورد للـ RFx تدعم `submit_bid` و `ask_question`.

---

## 10) نتائج التحقق

تم تشغيل:

```bash
npm run type-check
npm run db:contract-check
npm run sdk:boundary-check
npm run test:run
npm run build
npm run lint
```

النتائج:

| الأمر | النتيجة |
|---|---|
| `npm run type-check` | نجح |
| `npm run db:contract-check` | نجح |
| `npm run sdk:boundary-check` | نجح |
| `npm run test:run` | نجح — 39 ملفات / 406 اختبار |
| `npm run build` | نجح مع تحذير chunk size |
| `npm run lint` | 0 errors، مع warnings متراكمة |

---

## 11) مدى مطابقة الوحدة الثانية للتوثيق بعد هذه الدفعة

| متطلب التوثيق | الحالة |
|---|---|
| إنشاء RFI/RFQ/RFP من PR | موجود سابقاً عبر `create_sourcing_event_from_pr` |
| بوابة الموردين لتقديم عروض | أضيفت `/supplier-rfx/:token` |
| دعوات الموردين | أضيفت `rfx_supplier_invitations` + Edge إرسال RFx |
| مقارنة TCO | موجودة في صفحة التفاصيل + DB effective_price |
| Q&A | أضيفت `rfx_questions` + واجهة داخلية وخارجية |
| ترسية واختيار مورد | أضيفت `award_supplier_bid` + زر ترسية |
| Audit للحدث | أضيف `rfx_event_audit_log` |
| KPIs | أضيف `sourcing_event_kpis` |
| MECCA | موجود جزئياً عبر `bid_evaluations` القديم؛ يحتاج واجهة تقييم كاملة لاحقاً |
| المزادات العكسية | موجودة سابقاً، لكنها تحتاج تحسين واجهة الإنشاء والأنواع المتقدمة |
| قوالب RFI/RFQ/RFP | موجودة جزئياً عبر `rfx_documents`; واجهة القوالب تحتاج تحسين لاحق |

---

## 12) المتبقي للوحدة الثانية

الوحدة الثانية أصبحت عملية بشكل واضح، لكن للوصول إلى اكتمال كامل جداً حسب التوثيق نحتاج لاحقاً:

1. واجهة RFx Builder متقدمة لإدارة أقسام الوثيقة والقوالب.
2. واجهة MECCA كاملة لإدخال أوزان التقييم وعرض الدرجة الموحدة.
3. تحسين واجهة إنشاء المزاد من RFx.
4. تطبيق أنواع المزاد Japanese/Dutch بشكل تفصيلي أكثر.
5. أرشيف تسعير تاريخي يربط نتائج RFx بـ `procurement_price_history`.

---

## 13) الحكم

تم تحويل وحدة التوريد الاستراتيجي من مجرد جداول وواجهة محدودة إلى سير RFx عملي:

```text
RFx Event → Supplier Invitations → Supplier Portal Bid → Q&A → TCO Comparison → Award → Audit/KPIs
```

وبهذا أصبح أساس الوحدة الثانية مطابقاً لمعظم بنود التوثيق، مع بقاء تحسينات متقدمة للـ MECCA والمزادات والقوالب.
