# Checklist تقني — الوحدة 04: إدارة المخزون التصنيعي وWIP

مصدر الحقيقة: `docs/mrp/04-inventory-management.md`.

## 1) Manufacturing Inventory Types
- [x] Raw Materials via Inventory Portal.
- [x] WIP inventory by work order / operation / work center.
- [x] Finished Goods receipts via work order completion.

## 2) Valuation
- [x] FIFO policy.
- [x] FEFO policy.
- [x] Weighted Average Cost policy.
- [x] Actual/Specific identification foundation.
- [x] item valuation policy per item.

## 3) Lot & Serial Traceability
- [x] raw material lot consumption by WO.
- [x] finished good lot creation/link.
- [x] forward traceability raw lot -> WO -> FG lot.
- [x] backward traceability FG lot -> WO -> raw lots.

## 4) Multi-location / WIP
- [x] WIP location by line/work center.
- [x] WIP movement ledger.
- [x] WIP bottleneck report.

## 5) Safety Stock / ROP / EOQ
- [x] Safety stock calculator.
- [x] EOQ calculator.
- [x] ROP recommendations.
- [x] service level Z factor.

## 6) ABC / Cycle Count Integration
- [x] Use inventory ABC/cycle count as source.
- [x] MRP inventory KPI views.

## 7) Material Reservation / Issue
- [x] View for WO reservations/materials.
- [x] Issue integration from unit 03.
- [x] Reconciliation variance view.

## 8) UI Pages
- [x] /app/mrp/inventory
- [x] /app/mrp/inventory/raw-materials
- [x] /app/mrp/inventory/wip
- [x] /app/mrp/inventory/finished-goods
- [x] /app/mrp/inventory/valuation
- [x] /app/mrp/inventory/lots-traceability
- [x] /app/mrp/inventory/safety-stock
- [x] /app/mrp/inventory/material-issues
- [x] /app/mrp/inventory/reconciliation
- [x] /app/mrp/inventory/reports

## 9) UX
- [x] Item/WO/Lot lookups where needed.
- [x] Details/copy/actions.
- [x] Audit activity.

## 10) Tests
- [x] Contract test.
- [x] type-check/db checks/test/build/lint.
