# تقرير تنفيذ Phase 6 — الوحدة الرابعة PO/GR

**التاريخ:** 2026-07-26  
**الوحدة:** الوحدة الرابعة — أوامر الشراء واستلام البضائع  
**التوثيق المعتمد:** `docs/e-procurement/04-purchase-orders-goods-receipt.md`

---

## ما تم تنفيذه

### 1) قراءة التوثيق وتحويله إلى متطلبات

تمت مراجعة توثيق الوحدة الرابعة، والمتطلبات الأساسية كانت:

- إنشاء PO من PR أو يدوياً.
- دعم أنواع PO: standard / blanket / consolidated / open / emergency.
- إرسال PO للمورد وتتبع حالته.
- استلام البضائع GR.
- دعم الاستلام الجزئي.
- إدارة الانحرافات.
- IQC / Quality Hold.
- تحديث المخزون عند GR Posting.
- RTV للمورد.
- تنبيهات OTIF.
- مؤشرات أداء.

---

## 2) Migration جديدة للوحدة الرابعة

تم إنشاء:

```text
supabase/migrations/0199_procurement_po_gr_completion.sql
```

### أضافت الجداول التالية

```sql
po_audit_log
inventory_transactions
iqc_inspections
po_otif_alerts
```

### أضافت/حدّثت الدوال التالية

```sql
create_purchase_order_manual(...)
mark_po_sent(...)
acknowledge_po(...)
update_po_tracking(...)
receive_goods(...)
decide_iqc_inspection(...)
post_goods_receipt(...)
create_rtv(...)
detect_late_po_alerts()
```

### أضافت KPI view

```sql
po_gr_kpis
```

---

## 3) تحديث SDK

تم تعديل:

```text
src/services/sdk/Procurement/PurchaseOrderService.ts
```

وأضيف:

- `purchaseOrderService.createManual()`
- `purchaseOrderService.send()`
- `purchaseOrderService.acknowledge()`
- `purchaseOrderService.updateTracking()`
- `goodsReceiptService.decideIqc()`
- `iqcInspectionService`
- `inventoryTransactionService`
- `poOtifAlertService`

وتم تصديرها من:

```text
src/services/sdk/index.ts
```

---

## 4) تحديث صفحة أوامر الشراء

تمت إعادة بناء:

```text
src/pages/app/procurement/orders/PurchaseOrdersPage.tsx
```

وأصبحت تدعم:

- إنشاء PO من PR معتمد.
- إنشاء PO يدوي.
- اختيار نوع PO.
- إدخال شروط التسليم والدفع.
- إدخال بنود PO يدوياً.
- إرسال PO للمورد.
- فحص تنبيهات OTIF.
- فتح تفاصيل PO.

---

## 5) تحديث صفحة استلام البضائع

تمت إعادة بناء:

```text
src/pages/app/procurement/orders/GoodsReceiptPage.tsx
```

وأصبحت تدعم:

- اختيار PO قابل للاستلام.
- جلب بنود PO المفتوحة.
- إدخال الكميات المستلمة.
- إدخال الكميات المقبولة.
- تسجيل lot number.
- تسجيل expiry date.
- تسجيل location.
- تحديد وجود ضرر ووصفه.
- إنشاء GR.
- قرار IQC: قبول / رفض / جزئي.
- GR Posting لتحديث المخزون.

---

## 6) تحديث صفحة تفاصيل PO

تم تعديل:

```text
src/pages/app/procurement/orders/PoDetailPage.tsx
```

وأضيف:

- أزرار تحديث دورة حياة PO:
  - إرسال للمورد.
  - تأكيد المورد.
  - تم الشحن.
  - إغلاق PO.
- إنشاء RTV من أي GR مرتبط.

---

## 7) تحديث الفحوصات والاختبارات

تم تعديل:

```text
scripts/tests/99_post_migration_checks.sql
src/test/procurement/procurementSecurityContract.test.ts
```

للتأكد من وجود:

- `inventory_transactions`
- `iqc_inspections`
- `po_otif_alerts`
- `create_purchase_order_manual`
- `decide_iqc_inspection`
- واجهات إنشاء PO وتسجيل GR وRTV.

---

## نتائج التحقق

تم تشغيل:

```bash
npm run type-check
npm run db:contract-check
npm run sdk:boundary-check
npm run test:run
npm run build
```

النتائج:

| الأمر | النتيجة |
|---|---|
| TypeScript | نجح |
| DB contract check | نجح |
| SDK boundary check | نجح |
| Tests | نجحت — 39 ملف / 411 اختبار |
| Build | نجح مع تحذير chunk size |

---

## حالة الوحدة الرابعة مقابل التوثيق

| متطلب التوثيق | الحالة |
|---|---|
| إنشاء PO من PR | موجود |
| إنشاء PO يدوي | موجود |
| أنواع PO متعددة | موجودة |
| إرسال PO للمورد | موجود كأساس `sent`، والبريد يمكن ربطه لاحقاً |
| تتبع حالة PO | موجود |
| تسجيل GR | موجود |
| الاستلام الجزئي | موجود عبر pending/received quantities |
| الانحرافات | موجودة كأساس عبر accepted/rejected qty + RTV |
| IQC / Quality Hold | موجود |
| تحديث المخزون | موجود عبر `inventory_transactions` |
| RTV | موجود |
| OTIF alerts | موجودة عبر `detect_late_po_alerts` |
| KPIs | موجودة عبر `po_gr_kpis` |

---

## ملاحظات لاحقة

- إرسال PO بالبريد للمورد موجود كحالة `sent`، ويمكن إضافة Edge Function بريدية كاملة لاحقاً.
- التكامل مع AP/3-Way Matching سيكتمل عند العمل على وحدة الفواتير.
- المخزون حالياً transaction ledger، وليس نظام warehouse كامل، لكنه يحقق أساس التوثيق.

---

## الحكم

الوحدة الرابعة أصبحت الآن تملك سيراً عملياً:

```text
PR/Manual → PO → Sent/Acknowledged/Shipped → GR → IQC → Posting → Inventory → RTV/OTIF/KPIs
```
