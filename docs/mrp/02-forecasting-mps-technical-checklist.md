# Checklist تقني — الوحدة 02: التنبؤ بالطلب والجدول الرئيسي للإنتاج MPS

مصدر الحقيقة: `docs/mrp/02-demand-forecasting-MPS.md` + وحدة 00 Foundation + وحدة 01 BOM.

## 1) Demand Sources
- [x] المبيعات التاريخية.
- [x] الأوامر المؤكدة الحالية.
- [x] حركة المخزون/الاستهلاك الفعلي.
- [x] خطط المبيعات.
- [x] مؤشرات خارجية/موسمية/تسويقية كـ payload قابل للتوسع.

## 2) Forecasting Methods
- [x] Simple Moving Average.
- [x] Weighted Moving Average.
- [x] Exponential Smoothing.
- [x] Seasonal Index / seasonal decomposition foundation.
- [x] AI Forecasting كتكامل خارجي مستقبلي مع payload/model provider.

## 3) Demand Types
- [x] independent demand.
- [x] dependent demand linkage to BOM explosion.
- [x] confirmed demand.
- [x] forecast demand.

## 4) Forecast Accuracy
- [x] MAPE calculation.
- [x] forecast accuracy snapshots.
- [x] thresholds: ممتاز/جيد/مقبول/ضعيف.

## 5) MPS
- [x] MPS plans.
- [x] MPS lines by item + time bucket.
- [x] weekly/monthly/daily buckets.
- [x] formula: forecast + confirmed + safety stock - inventory - scheduled receipts.
- [x] beginning/ending inventory.
- [x] firming/frozen horizon.
- [x] manual override مع reason/audit.

## 6) Planning Horizon
- [x] short/medium/long horizon.
- [x] 2 to 52 weeks.
- [x] validation for horizon limits.

## 7) Strategies
- [x] MTS.
- [x] MTO.
- [x] ATO.
- [x] ETO.
- [x] product planning policy per item.

## 8) RCCP
- [x] RCCP runs.
- [x] load by work center.
- [x] available vs required hours.
- [x] utilization %.
- [x] overload detection.
- [x] recommendations: reduce MPS/add shift/subcontract/pull ahead.

## 9) Alerts
- [x] capacity gap.
- [x] material gap foundation.
- [x] stockout risk.
- [x] forecast error high.
- [x] frozen-period change warning.

## 10) UI Pages
- [x] /app/mrp/forecasting
- [x] /app/mrp/forecasting/history
- [x] /app/mrp/forecasting/models
- [x] /app/mrp/forecasting/runs
- [x] /app/mrp/forecasting/accuracy
- [x] /app/mrp/forecasting/policies
- [x] /app/mrp/mps
- [x] /app/mrp/mps/board
- [x] /app/mrp/mps/plans
- [x] /app/mrp/mps/lines
- [x] /app/mrp/mps/rccp
- [x] /app/mrp/mps/alerts
- [x] /app/mrp/mps/reports

## 11) UX Requirements
- [x] Item lookup بدل UUID.
- [x] إنشاء Demand History من الواجهة.
- [x] إنشاء Forecast Model.
- [x] تشغيل Forecast.
- [x] إنشاء MPS من Forecast.
- [x] تعديل/override MPS line بسبب إلزامي.
- [x] تشغيل RCCP.
- [x] تفاصيل/نسخ/تدقيق.

## 12) Tests
- [x] Contract test.
- [x] type-check.
- [x] db checks.
- [x] test:run.
- [x] build/lint.
