# الوحدة 08 — Checklist تقني: تحليلات المستودع ولوحة المؤشرات

مصدر الحقيقة: `docs/inventory/08-warehouse-analytics-KPI-dashboard.md`.

> قاعدة التنفيذ: الكمال الحرفي — لا تخرج الوحدة من الحالة "مكتملة" حتى يكون كل بند في الوثيقة ممثلاً في قاعدة البيانات، RPC، SDK، الواجهات، المسارات، والاختبارات، أو موسوماً كتكامل خارجي مستقبلي.

## 1) لوحات حسب الأدوار
- [x] Executive Dashboard: قيمة المخزون، دقة المخزون، استغلال المساحة، Perfect Order Rate، اتجاهات وتنبيهات.
- [x] Operations Manager Dashboard: أوامر/مهام معالجة، إنتاجية الفريق، مهام انتظار، أرصفة، أوامر حرجة.
- [x] Shift Supervisor Dashboard: موظفون الآن، إنتاجية مباشرة، خمول، ازدحام packing/queue.

## 2) KPI Groups
- [x] Receiving KPIs: Dock-to-Stock, ASN Compliance, Receiving Accuracy, Dock Utilization, OS&D Rate.
- [x] Storage/Inventory KPIs: Putaway Time, IRA, Space Utilization, Inventory Turnover, Slow Moving, Stockout Rate.
- [x] Picking/Fulfillment KPIs: Pick Accuracy, Pick Rate, Short Pick Rate, Order Cycle Time.
- [x] Shipping KPIs: On-Time Shipping, Perfect Order Rate, Shipping Cost/Order, Carrier OTIF.
- [x] Labor/Cost KPIs: Labor Utilization, Cost per Unit, Productivity Rate, Error Cost.
- [x] Returns KPIs: Return Rate, Processing Time, Value Recovery.

## 3) Trend & Pattern Analysis
- [x] KPI snapshots تاريخية يومية/أسبوعية/شهرية.
- [x] تحليل موسمي لحركة المخزون 24 شهراً.
- [x] Heatmap للحركة حسب warehouse/zone/aisle/location مع تصنيف hot/warm/cold.

## 4) Automatic Root Cause Analysis
- [x] Root cause عند انحراف KPI عن الهدف.
- [x] تحليل المناطق المتأثرة، الأصناف، الفترة الزمنية، الفريق/الوردية.
- [x] توصية نصية قابلة للتنفيذ.

## 5) Periodic Reports
- [x] Daily Operations Report.
- [x] Weekly Performance Report.
- [x] Monthly Warehouse Review.
- [x] جداول schedules وruns وpayload للتقرير.
- [x] Export requests Excel/PDF.

## 6) Proactive Alerts
- [x] ثلاثة مستويات: urgent/warning/info.
- [x] مخزون حرج وصل الصفر.
- [x] شحنة عميل/VIP أو شحنة ستتأخر.
- [x] خطأ استلام جوهري > 5% / OS&D critical.
- [x] انقطاع barcode ممثل كـ rule/event خارجي.
- [x] صنف A وصل ROP.
- [x] موقع/منطقة وصلت 95%.
- [x] IRA أقل من 99%.
- [x] موظف أقل من 70%.
- [x] Expiry, slow moving > 90 days, labor plan variance.

## 7) Target Comparison & Colors
- [x] KPI targets مع direction higher/lower/range.
- [x] Color coding green/yellow/red.
- [x] Alert severity بناءً على الانحراف.

## 8) Operating Cost Dashboard
- [x] Labor cost.
- [x] Shipping cost.
- [x] Maintenance/manual cost entries.
- [x] Total cost/unit.

## 9) UI/SDK/Tests
- [x] SDK `Inventory/AnalyticsService.ts` لكل الجداول وRPC والتحليلات.
- [x] واجهات: executive, operations, supervisor, KPI scorecard, trends, heatmap, root cause, alerts, reports, exports, costs, targets.
- [x] Routes وLegacy IDs وSidebar/Hybrid/Admin pages.
- [x] Contract tests تثبت وجود الوثيقة، migration، RPCs، SDK، routes.

## 10) تكاملات خارجية/زمن تشغيل لاحق
- [ ] إرسال البريد الحقيقي للتقارير اليومية/الأسبوعية/الشهرية: ممثل بجداول schedule/run/export؛ يحتاج Edge Function/cron/secrets runtime لاحقاً.
- [ ] Export PDF/Excel الفعلي: ممثل بطلب export مع format/status/file_url؛ توليد الملف Runtime لاحقاً.
- [ ] Barcode outage من جهاز فعلي: ممثل بتنبيه manual/external_event rule؛ يحتاج تكامل أجهزة لاحقاً.
- [ ] MRP feed الموسمي الرسمي: ممثل بتحليل stock movements ويغذي ROP كمخرجات، والربط الفعلي مع MRP لاحقاً.
