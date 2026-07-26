# تقرير تنفيذ Phase 9 — الوحدة السابعة: تحليل الإنفاق وذكاء المشتريات

**التاريخ:** 2026-07-26  
**الوحدة:** الوحدة السابعة — Spend Analysis & Procurement Intelligence  
**التوثيق المعتمد:** `docs/e-procurement/07-spend-analysis-procurement-intelligence.md`

---

## 1) قراءة التوثيق والمتطلبات

تمت قراءة توثيق الوحدة السابعة قبل التنفيذ، والمتطلبات الأساسية كانت:

- تجميع بيانات الإنفاق من PO والفواتير وP-Cards والعقود.
- تنظيف البيانات وتوحيد أسماء الموردين.
- تصنيف الإنفاق إلى فئات/UNSPSC.
- تحليل الموردين Pareto 80/20.
- كشف Maverick Spend وTail Spend.
- تتبع اتجاهات الأسعار.
- لوحة تنفيذية حقيقية دون أرقام ثابتة.
- تقارير الفئات.
- التنبؤ بالإنفاق.
- تنبيهات ذكاء المشتريات.
- تصدير التقارير.

---

## 2) Migration جديدة للوحدة السابعة

تم إنشاء:

```text
supabase/migrations/0202_procurement_spend_intelligence_completion.sql
```

### أضافت جداول

```sql
p_card_transactions
supplier_name_aliases
spend_category_strategies
spend_intelligence_alerts
```

---

## 3) مجمّع بيانات الإنفاق

أضيفت دالة:

```sql
collect_procurement_spend_transactions()
```

تجمع الإنفاق من:

- `purchase_orders`
- `supplier_invoices`
- `procurement_contracts`
- `p_card_transactions`

إلى:

```sql
spend_transactions
```

وهذا يحقق متطلب Data Collection.

---

## 4) تنظيف البيانات وتوحيد الموردين

أضيفت:

```sql
normalize_supplier_name(text)
cleanse_supplier_aliases()
```

وتنشئ aliases لأسماء الموردين القانونية والتجارية في:

```sql
supplier_name_aliases
```

هذا يحقق أساس Data Cleansing.

---

## 5) التصنيف الآلي للإنفاق

أضيفت:

```sql
auto_classify_spend_transactions()
```

وتصنف المعاملات غير المصنفة إلى:

- `CONTRACT`
- `P-CARD`
- `UNCLASSIFIED`

مع استمرار دعم التصنيف اليدوي/UNSPSC الموجود سابقاً.

---

## 6) تحديث ملخص إنفاق الموردين

أضيفت:

```sql
refresh_supplier_spend_summary()
```

تحدث:

```sql
supplier_spend_summary
```

وتحسب:

- total_spend
- last_12m_spend
- maverick_spend
- tail_spend_flag

---

## 7) تنبيهات ذكاء المشتريات

أضيفت:

```sql
generate_spend_intelligence_alerts()
```

وتنشئ تنبيهات لـ:

- تركّز الموردين.
- ارتفاع الأسعار.
- قرب انتهاء العقود.

في:

```sql
spend_intelligence_alerts
```

---

## 8) Views تنفيذية وتقارير

أضيفت:

```sql
procurement_executive_kpis
spend_category_report
procurement_export_spend_report
```

### `procurement_executive_kpis`

يعرض:

- إجمالي الإنفاق YTD.
- Maverick Spend.
- عدد الموردين النشطين.
- العقود المنتهية خلال 90 يوم.
- متوسط OTIF.
- توفير المزادات.

### `spend_category_report`

يعرض الإنفاق حسب الفئة:

- category_code
- category_name
- total_spend
- transaction_count
- supplier_count
- maverick_spend

### `procurement_export_spend_report`

مخصص لتصدير تقارير الإنفاق.

---

## 9) تحديث SDK

تمت إعادة بناء:

```text
src/services/sdk/Procurement/SpendAnalyticsService.ts
```

وأضيفت خدمات:

- `procurementExecutiveKpiService`
- `spendCategoryReportService`
- `spendAlertService`
- `spendCategoryStrategyService`
- `pCardTransactionService`

ودوال:

- `spendTransactionService.collect()`
- `spendTransactionService.cleanseAliases()`
- `spendTransactionService.autoClassify()`
- `spendTransactionService.refreshSupplierSummary()`
- `spendAlertService.generate()`

وتم تصديرها من:

```text
src/services/sdk/index.ts
```

---

## 10) تحديث لوحة تحليل الإنفاق

تمت إعادة بناء:

```text
src/pages/app/procurement/analytics/SpendAnalyticsPage.tsx
```

### أهم الإصلاحات

- إزالة الأرقام الثابتة مثل:
  - `12.4M`
  - `487K`
  - `158`
  - `12`

- أصبحت اللوحة تقرأ من:
  ```sql
  procurement_executive_kpis
  ```

- أضيف زر:
  ```text
  تحديث بيانات الإنفاق
  ```

يقوم بتشغيل pipeline:

```text
cleanse aliases
→ collect spend
→ classify spend
→ refresh supplier summary
→ generate alerts
```

- أضيف تصدير CSV لتقارير الفئات.

---

## 11) تحديث الاختبارات والفحوصات

تم تحديث:

```text
scripts/tests/99_post_migration_checks.sql
src/test/procurement/procurementSecurityContract.test.ts
```

للتأكد من وجود:

- `collect_procurement_spend_transactions`
- `cleanse_supplier_aliases`
- `auto_classify_spend_transactions`
- `procurement_executive_kpis`
- `procurement_export_spend_report`
- إزالة الرقم الثابت `12.4M ريال` من الصفحة.

---

## 12) نتائج التحقق

تم تشغيل:

```bash
npm run type-check
npm run db:contract-check
npm run test:run
npm run build
npm run sdk:boundary-check
```

النتائج:

| الأمر | النتيجة |
|---|---|
| `npm run type-check` | نجح |
| `npm run db:contract-check` | نجح |
| `npm run test:run` | نجح — 39 ملف / 414 اختبار |
| `npm run build` | نجح مع تحذير chunk size |
| `npm run sdk:boundary-check` | نجح |

---

## 13) حالة الوحدة السابعة مقابل التوثيق

| متطلب التوثيق | الحالة |
|---|---|
| مجمّع البيانات من PO/Invoices/P-Cards/Contracts | موجود |
| تنظيف البيانات وتوحيد أسماء الموردين | موجود كأساس |
| تصنيف الإنفاق UNSPSC/AI | موجود كأساس rule-based + يدوي؛ AI عميق لاحقاً |
| Pareto 80/20 | موجود |
| Maverick Spend | موجود |
| Tail Spend | موجود عبر flags/summary |
| Price Trend | موجود |
| Category Reports | موجود |
| Forecasting | موجود سابقاً عبر `forecast_spend` |
| Executive Dashboard حقيقي | موجود بدون hardcoded KPIs |
| Alerts | موجودة |
| Export | موجود CSV من الواجهة + export view |

---

## 14) الحكم

الوحدة السابعة أصبحت تملك سير ذكاء مشتريات عملياً:

```text
Data Collection
→ Data Cleansing
→ Spend Classification
→ Supplier Summary
→ Pareto/Maverick/Tail
→ Price Trend
→ Category Reports
→ Forecasting
→ Alerts
→ Executive KPIs
→ Export
```

وبذلك تم إكمال أساس الوحدة السابعة وفق التوثيق. المتبقي مستقبلاً هو تحسين AI classification العميق وربط مصادر خارجية فعلية لـ P-Cards/EDI، لكن الأساس المؤسسي موجود.
