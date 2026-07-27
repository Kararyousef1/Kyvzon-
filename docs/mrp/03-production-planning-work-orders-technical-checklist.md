# Checklist تقني — الوحدة 03: تخطيط الإنتاج وأوامر العمل

مصدر الحقيقة: `docs/mrp/03-production-planning-work-orders.md`.

## 1) MRP Run
- [x] تشغيل MRP من MPS.
- [x] تفجير BOM وربط net requirements.
- [x] توليد مقترحات أوامر إنتاج للـ make.
- [x] توليد مقترحات شراء foundation للـ buy/subcontract.
- [x] مراجعة/اعتماد/إلغاء المقترحات.

## 2) Work Orders
- [x] Standard Production WO.
- [x] Custom/ETO WO.
- [x] Rework WO.
- [x] Subcontract/Sub-operation WO.
- [x] دورة حياة كاملة: draft/planned/firmed/released/material_reserved/in_progress/paused/completed/closed/cancelled/on_hold.

## 3) Routing / Operations
- [x] نسخ Routing operations إلى Work Order operations.
- [x] setup/run/queue/move minutes.
- [x] مركز العمل لكل عملية.
- [x] quality gate flag.

## 4) Work Centers / Capacity
- [x] استخدام work_center_shift_capacity من وحدة 00.
- [x] الجدولة الأمامية.
- [x] الجدولة العكسية.
- [x] FCS foundation عبر التحقق من الطاقة.
- [x] sequencing rules: FIFO/EDD/SPT/CR/setup_minimization foundation.

## 5) Material Reservation & Issue
- [x] حجز مواد عند Release.
- [x] إصدار مواد عند بدء الإنتاج أو يدوياً.
- [x] reconciliation foundation عند الإكمال.
- [x] integration مع reserve_inventory وpost_inventory_movement.

## 6) Critical Ratio / Alerts
- [x] Critical Ratio تلقائي.
- [x] CR bands.
- [x] late start alert.
- [x] late completion alert.
- [x] material shortage alert.

## 7) UI Pages
- [x] /app/mrp/planning
- [x] /app/mrp/planning/mrp-runs
- [x] /app/mrp/planning/proposals
- [x] /app/mrp/planning/work-orders
- [x] /app/mrp/planning/materials
- [x] /app/mrp/planning/operations
- [x] /app/mrp/planning/scheduling
- [x] /app/mrp/planning/dispatch
- [x] /app/mrp/planning/alerts
- [x] /app/mrp/planning/reports

## 8) UX
- [x] Lookups لـ MPS plan/BOM/Routing/Work Center/Work Order.
- [x] Details/copy/status actions.
- [x] Audit/status عبر RPCs.

## 9) Tests
- [x] Contract test.
- [x] type-check/db checks/test/build/lint.
