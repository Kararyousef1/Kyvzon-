# Checklist تقني — الوحدة 05: تكامل المشتريات وإدارة الموردين مع MRP

مصدر الحقيقة: `docs/mrp/05-procurement-supplier-management.md` + بوابة المشتريات القائمة.

## 1) Procure-to-Pay Integration
- [x] لا نعيد بناء PR/RFQ/PO/GR/Invoice؛ نستخدم بوابة المشتريات الحالية.
- [x] MRP يولد purchase recommendations.
- [x] تحويل recommendations إلى Purchase Requisition.
- [x] متابعة PR/PO/GR/Invoice من MRP.

## 2) PR Sources
- [x] MRP automatic.
- [x] Reorder point foundation.
- [x] Manual manufacturing request foundation.

## 3) RFQ / TCO / Supplier Selection
- [x] RFQ candidates foundation.
- [x] TCO evaluation fields: price, lead time, quality, delay risk.
- [x] supplier scorecard integration.

## 4) PO / GR / 3-Way Match
- [x] PO status view.
- [x] GR status view.
- [x] invoice/matching status view.

## 5) Supplier Management
- [x] Supplier classification integration.
- [x] Supplier scorecard calculated view.
- [x] Contract renewal alerts integration.

## 6) Alerts / KPIs
- [x] Material shortage recommendation alerts.
- [x] Contract expiry alerts.
- [x] Supplier OTIF/quality/price score.
- [x] Procurement cycle time and emergency purchase ratio foundation.

## 7) UI Pages
- [x] /app/mrp/procurement
- [x] /app/mrp/procurement/recommendations
- [x] /app/mrp/procurement/pr
- [x] /app/mrp/procurement/rfq
- [x] /app/mrp/procurement/po
- [x] /app/mrp/procurement/gr
- [x] /app/mrp/procurement/invoices
- [x] /app/mrp/procurement/suppliers
- [x] /app/mrp/procurement/contracts
- [x] /app/mrp/procurement/alerts
- [x] /app/mrp/procurement/reports

## 8) UX
- [x] Lookups للتوصيات والموردين.
- [x] تحويل إلى PR بزر واضح.
- [x] تفاصيل/نسخ/حالة.

## 9) Tests
- [x] Contract test.
- [x] type-check/db checks/test/build/lint.
