# Checklist تقني — الوحدة 01: BOM & Engineering Change

مصدر الحقيقة: `docs/mrp/01-bill-of-materials-BOM.md` + أساس MRP وحدة 00.

## 1) أنواع BOM
- [x] EBOM.
- [x] MBOM.
- [x] sBOM.
- [x] Sales BOM.
- [x] ربط وتحويل بين BOM types عبر source_bom_version_id.

## 2) هياكل BOM
- [x] Single-level BOM.
- [x] Multi-level/Indented BOM بدون حد عملي للمستويات.
- [x] Parent line للـ sub-assemblies.
- [x] Phantom assemblies.
- [x] Alternate BOM / default BOM.

## 3) سجل بند BOM الكامل
- [x] Part/item reference.
- [x] الوصف/UOM.
- [x] Quantity per.
- [x] Scrap % وصافي الكمية.
- [x] نوع المادة: raw/component/subassembly/packaging/phantom/service.
- [x] source: buy/make/subcontract/transfer.
- [x] Lead time.
- [x] Safety stock.
- [x] MOQ.
- [x] Order multiple.
- [x] الموردون المعتمدون والبدائل.
- [x] Notes.

## 4) BOM Explosion / MRP
- [x] RPC تفجير BOM متعدد المستويات.
- [x] احتساب scrap/yield.
- [x] طرح المخزون المتاح من Inventory Portal.
- [x] إخراج gross/net requirements.
- [x] توصية buy/make/subcontract.

## 5) Engineering Change Management
- [x] ECR.
- [x] ECO.
- [x] Impact analysis.
- [x] Effectivity date.
- [x] Affected BOMs/Items/Open orders placeholder contract.
- [x] Approval/Implementation lifecycle.
- [x] Audit trail.

## 6) Versioning / Effectivity
- [x] BOM Header.
- [x] BOM Version.
- [x] Status: draft/in_review/approved/effective/superseded/archived.
- [x] effective_from/effective_to.
- [x] لا تعديل مباشر على effective؛ يتم إصدار نسخة جديدة.

## 7) Availability Check
- [x] RPC فحص التوافر.
- [x] available = stock balance available_qty.
- [x] shortage lines.
- [x] recommendations.

## 8) Import/Export
- [x] import batch table.
- [x] export request table.
- [x] UI page للطلبات.
- [ ] معالجة ملف Excel/CSV Runtime لاحقاً عبر Edge Function.

## 9) UI Pages
- [x] /app/mrp/bom
- [x] /app/mrp/bom/builder
- [x] /app/mrp/bom/headers
- [x] /app/mrp/bom/versions
- [x] /app/mrp/bom/lines
- [x] /app/mrp/bom/explosion
- [x] /app/mrp/bom/availability
- [x] /app/mrp/bom/ecr
- [x] /app/mrp/bom/eco
- [x] /app/mrp/bom/import-export
- [x] /app/mrp/bom/reports

## 10) UX Requirements
- [x] Lookups للأصناف وBOM versions.
- [x] Line builder لبنود BOM.
- [x] Copy ID/Code.
- [x] Details modal.
- [x] Status actions audited.
- [x] Tree/Indented view للـ BOM.

## 11) Tests
- [x] Contract test.
- [x] type-check.
- [x] db checks.
- [x] test:run.
- [x] build/lint.
