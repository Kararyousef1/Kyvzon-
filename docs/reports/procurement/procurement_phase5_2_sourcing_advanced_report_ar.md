# تقرير تنفيذ Phase 5.2 — إكمال المتبقي من الوحدة الثانية RFx

**التاريخ:** 2026-07-26  
**الوحدة:** الوحدة الثانية — Strategic Sourcing / RFI / RFQ / RFP / Reverse Auctions  
**التوثيق المعتمد:**

```text
docs/e-procurement/02-strategic-sourcing-RFx.md
```

---

## 1) المتبقي من الوحدة الثانية قبل هذه الدفعة

بعد تنفيذ Phase 5، بقيت فجوات متقدمة مقابل التوثيق:

1. RFx Builder بقوالب RFI/RFQ/RFP.
2. واجهة MECCA للتقييم متعدد المعايير.
3. تشغيل مزاد من RFx بأنواع British/Japanese/Dutch.
4. أرشفة الأسعار التاريخية من العرض الفائز.
5. تحسين واجهة تفاصيل RFx لتجمع هذه الأدوات في مكان واحد.

---

## 2) Migration جديدة للمتطلبات المتقدمة

تم إنشاء:

```text
supabase/migrations/0195_procurement_sourcing_advanced_completion.sql
```

### الجداول الجديدة

#### `rfx_templates`

لقوالب RFI/RFQ/RFP/Auction:

- sections
- default_criteria
- type
- is_active

#### `rfx_evaluation_criteria`

لمعايير تقييم MECCA لكل حدث:

- criterion_key
- label_ar
- weight_percent
- max_score
- sort_order

#### `rfx_bid_scorecards`

لتقييم كل عرض من المعتمدين:

- scores JSONB
- weighted_total
- evaluator_id
- notes

---

## 3) دوال جديدة

### `seed_default_rfx_templates()`

تنشئ قوالب افتراضية:

- RFI — بحث سوق.
- RFQ — خامات معيارية.
- RFP — حل مخصص.

### `apply_rfx_template(event_id, template_id)`

تطبق القالب على حدث RFx:

- تنشئ أقسام الوثيقة في `rfx_documents`.
- تنشئ معايير التقييم في `rfx_evaluation_criteria`.
- تسجل audit.

### `score_bid_mecca(bid_id, scores, notes)`

تحسب الدرجة الموزونة MECCA:

```text
weighted_total = sum(score/max_score * weight) / total_weight * 100
```

وتحفظها في:

```sql
rfx_bid_scorecards
```

### `start_procurement_auction_from_event(event_id, auction_type, duration)`

تبدأ مزاداً من حدث RFx، وتدعم الأنواع:

- British
- Japanese
- Dutch

### `close_procurement_auction(auction_id)`

تغلق المزاد وتسجل audit.

### `archive_awarded_bid_price(bid_id)`

تؤرشف سعر العرض الفائز في:

```sql
procurement_price_history
```

ليستخدم لاحقاً في تحليل اتجاه الأسعار.

---

## 4) View جديدة للمقارنة بالـ MECCA

تم إنشاء:

```sql
rfx_mecca_comparison
```

تعرض:

- bid
- supplier
- effective_price
- lead_time
- mecca_score
- rank_by_value

---

## 5) تحديث SDK

تم تعديل:

```text
src/services/sdk/Procurement/SourcingService.ts
```

وأضيفت أنواع وخدمات:

- `RfxTemplateRecord`
- `RfxDocumentRecord`
- `RfxEvaluationCriterionRecord`
- `RfxBidScorecardRecord`
- `rfxTemplateService`
- `rfxDocumentService`
- `rfxEvaluationCriteriaService`
- `rfxBidScorecardService`
- `auctionService.startFromEvent()`
- `auctionService.close()`

وتم تصديرها من:

```text
src/services/sdk/index.ts
```

---

## 6) تحديث واجهة RFx Detail

تم تعديل:

```text
src/pages/app/procurement/sourcing/RfxDetailPage.tsx
```

### أضيف RFx Builder

يدعم:

- تجهيز القوالب الافتراضية.
- اختيار قالب.
- تطبيق القالب على الحدث.
- عرض أقسام الوثيقة.
- عرض معايير التقييم.

### أضيف MECCA Scoring

في جدول العروض:

- يظهر score الحالي.
- يمكن تقييم العرض عبر زر `MECCA`.
- يتم إدخال درجات المعايير حسب القالب.
- تحفظ النتيجة عبر `score_bid_mecca`.

### أضيف قسم المزادات العكسية

يدعم:

- اختيار نوع المزاد:
  - British
  - Japanese
  - Dutch
- بدء مزاد من حدث RFx.
- أرشفة سعر العرض الفائز في price history.

---

## 7) تحديث الاختبارات والفحوصات

تم تعديل:

```text
src/test/procurement/procurementSecurityContract.test.ts
scripts/tests/99_post_migration_checks.sql
```

وأضيف التحقق من:

- `rfx_templates`
- `rfx_evaluation_criteria`
- `rfx_bid_scorecards`
- `score_bid_mecca`
- `start_procurement_auction_from_event`
- وجود RFx Builder وMECCA وبدء المزاد في الصفحة.

---

## 8) نتائج التحقق

تم تشغيل:

```bash
npm run type-check
npm run db:contract-check
npm run test:run
npm run build
npm run sdk:boundary-check
npm run lint
```

النتائج:

| الأمر | النتيجة |
|---|---|
| `npm run type-check` | نجح |
| `npm run db:contract-check` | نجح |
| `npm run test:run` | نجح — 39 ملفات / 407 اختبار |
| `npm run build` | نجح مع تحذير chunk size |
| `npm run sdk:boundary-check` | نجح |
| `npm run lint` | 0 errors، مع warnings متراكمة |

---

## 9) حالة الوحدة الثانية بعد الإكمال

| متطلب التوثيق | الحالة بعد Phase 5.2 |
|---|---|
| منشئ RFI/RFQ/RFP بقوالب | موجود بقوالب افتراضية وتطبيقها على الحدث |
| بوابة الموردين لتقديم عروض | موجودة عبر `/supplier-rfx/:token` |
| مقارنة TCO | موجودة |
| Q&A | موجودة |
| الترسية | موجودة |
| Audit | موجود |
| KPIs | موجودة |
| MECCA | موجودة كمعايير وscorecards وواجهة تقييم |
| المزادات العكسية | موجود بدء مزاد من RFx بثلاثة أنواع |
| أرشيف الأسعار | موجود عبر archive awarded price |

---

## 10) ملاحظات هندسية

- تنفيذ Japanese/Dutch في `start_procurement_auction_from_event` يجهز النوع ويفتح المزاد، لكن منطق المزايدة التفصيلي لا يزال يعتمد على منطق `place_auction_bid` الأساسي. يمكن لاحقاً تخصيص منطق bid لكل نوع بشكل أعمق.
- MECCA الآن عملي: معايير + أوزان + scorecards. ويمكن تحسينه لاحقاً بجداول عرض أجمل بدلاً من prompts.
- RFx Builder الآن موجود كقوالب وأقسام ومعايير، ويمكن لاحقاً إضافة محرر نصوص Rich Editor للأقسام.

---

## 11) الحكم

الوحدة الثانية أصبحت الآن مكتملة كأساس عملي قوي وفق التوثيق:

```text
RFx Builder
→ Supplier Invitations
→ Supplier RFx Portal
→ Q&A
→ Bid Submission
→ TCO + MECCA Comparison
→ Award
→ Auction Option
→ Price Archive
→ Audit/KPIs
```

أي تحسينات لاحقة ستكون تحسينات تجربة واكتمال متقدم، وليست غياباً جوهرياً في الوحدة.
