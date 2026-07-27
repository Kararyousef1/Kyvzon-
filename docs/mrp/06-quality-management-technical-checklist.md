# Checklist تقني — الوحدة 06: إدارة الجودة MRP

مصدر الحقيقة: `docs/mrp/06-quality-management.md`.

## 1) Inspection Stages
- [x] IQC عند الاستلام.
- [x] IPQC أثناء الإنتاج.
- [x] OQC / Final QC.
- [x] Critical Control Points CCP.

## 2) Inspection Plans & Digital Checklists
- [x] quality_inspection_plans.
- [x] inspection points.
- [x] checklist templates/items.
- [x] inspection execution records.

## 3) AQL Engine
- [x] AQL rules table.
- [x] sample size / accept / reject.
- [x] RPC لحساب عينة AQL.
- [x] دعم critical/major/minor/observation defects.

## 4) NCR / CAPA
- [x] NCR Management.
- [x] Impact analysis.
- [x] Disposition: RTV / use_as_is / rework / scrap.
- [x] CAPA root cause via 5 Whys/Fishbone categories.
- [x] Closure with reason/audit.

## 5) Calibration
- [x] Measurement devices.
- [x] Calibration events.
- [x] Due alerts.
- [x] Measurement invalidity warning foundation.

## 6) SPC
- [x] SPC measurements.
- [x] UCL/LCL/centerline.
- [x] out-of-control alert foundation.

## 7) Inventory/WO integration
- [x] link to receiving/session/lot/work order/operation.
- [x] quarantine decision foundation.
- [x] quality status affects records through disposition views/RPCs.

## 8) UI Pages
- [x] /app/mrp/quality
- [x] /app/mrp/quality/plans
- [x] /app/mrp/quality/checklists
- [x] /app/mrp/quality/inspections
- [x] /app/mrp/quality/aql
- [x] /app/mrp/quality/ncr
- [x] /app/mrp/quality/capa
- [x] /app/mrp/quality/calibration
- [x] /app/mrp/quality/spc
- [x] /app/mrp/quality/quarantine
- [x] /app/mrp/quality/reports

## 9) KPIs
- [x] FPY.
- [x] Scrap Rate.
- [x] Rework Rate.
- [x] Incoming Acceptance.
- [x] NCR Closure Time.
- [x] COPQ foundation.

## 10) Tests
- [x] Contract test.
- [x] type-check/db checks/test/build/lint.
