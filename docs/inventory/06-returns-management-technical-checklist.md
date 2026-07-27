# الوحدة 06 — Checklist تقني: إدارة المرتجعات واللوجستيات العكسية

مصدر الحقيقة: `docs/inventory/06-returns-management-reverse-logistics.md`.

> قاعدة التنفيذ: الكمال الحرفي — لا تخرج الوحدة من الحالة "مكتملة" حتى يكون كل بند في الوثيقة ممثلاً في قاعدة البيانات، RPC، SDK، الواجهات، المسارات، والاختبارات، أو موسوماً كتكامل خارجي مستقبلي.

## 1) أنواع المرتجعات
- [x] Customer Returns: RMA مرتبط بالعميل والشحنة/الفاتورة/أمر البيع الأصلي.
- [x] Production Returns: طلب إرجاع داخلي من أمر إنتاج مع اللوت والكمية وتعديل تكلفة ممثل بسجل Cost Adjustment.
- [x] Returns to Vendor (RTV): مطالبات RTV وتقارير موردين وتجميع للمطالبة/الاستبدال/Credit Note.
- [x] Inter-Warehouse Transfers: ممثلة عبر `transfer` كمصدر RMA/Disposition ومسار route/return_out/return_in من الأساس التقني؛ ليست تدفقاً منفصلاً عن وحدة التحويلات المستقبلية.

## 2) RMA Process
- [x] إصدار رقم RMA يمنع المرتجعات غير المتوقعة.
- [x] تحقق سياسة الإرجاع: warranty، reason، returnable، صلاحية 30 يوماً، وتعليمات التعبئة والشحن.
- [x] إرسال ملصق/تعليمات الإرجاع للعميل عبر جدول الإشعارات.
- [x] ربط المستودع بإشعار مسبق بما سيصل، مشابه ASN.
- [x] استلام مادي: scan RMA، حالة الطرد، العد، المقارنة بالمتوقع.
- [x] ربط المرتجع بـ RMA والشحنة/الفاتورة/أمر البيع الأصلي.
- [x] تحويل أولي إلى موقع حجر/فرز returns/quarantine.

## 3) Sorting & Grading
- [x] Grade A: كالجديد → Restock.
- [x] Grade B: تلف بسيط/إعادة تعبئة → Repack/Refurbish & Resell.
- [x] Grade C: قابل للإصلاح → Internal Repair أو RTV حسب السبب.
- [x] Grade D: تالف غير قابل للإصلاح → Scrap/Recycling.
- [x] التقاط صور/ملاحظات/سبب العيب والقيمة الأصلية والمتوقعة المستردة.

## 4) Disposition Routing
- [x] Restock: ترحيل حركة `return_in` إلى المخزون.
- [x] Repack/Refurbish & Resell: مهمة repack وإدخال SKU مجدّد اختياري.
- [x] Return to Vendor: مطالبة RTV مرتبطة بمورد وPO اختياري وCredit Note.
- [x] Internal Repair: أمر إصلاح داخلي وإعادة تقييم/إغلاق.
- [x] Dispose/Scrap: سجل خردة/إتلاف بقيمة ووثيقة بيئية.

## 5) Production Returns
- [x] طلب إرجاع من الإنتاج مرتبط بـ WO.
- [x] إرجاع اللوت نفسه للمخزون بعد الفحص.
- [x] فحص بصري إلزامي وحالة جودة.
- [x] تمثيل تعديل تكاليف أمر العمل بسجل cost adjustment payload.
- [x] المواد الحساسة/المرفوضة يمكن تحويلها إلى NCR أو scrap.

## 6) Quality Improvement
- [x] كل عيب defect ينشئ NCR تلقائياً في `inventory_quality_ncr_cases`.
- [x] CAPA ممثلة عبر `inventory_return_capa_actions` لسبب الجذر والإجراء التصحيحي/الوقائي.
- [x] تقارير أسباب العيوب ومصدرها: مادة خام/إنتاج/IQC/OQC/تعبئة/شحن.

## 7) Analytics & KPIs
- [x] Return Rate.
- [x] Processing Time from receipt to closure.
- [x] Value Recovery %.
- [x] Grading Accuracy %.
- [x] Cost per Return.
- [x] Monthly condition distribution A/B/C/D.
- [x] أسباب المرتجعات واتجاهاتها.

## 8) Notifications & Supplier Reports
- [x] إشعارات العملاء على حالات RMA/استلام/تقييم/إغلاق.
- [x] تقارير الموردين لتجميع RTV والمطالبة.
- [x] Credit Note/Replacement/Claim status fields.

## 9) UI/SDK/Tests
- [x] SDK `Inventory/ReturnsService.ts` لكل الجداول وRPC والتحليلات.
- [x] واجهات: dashboard, RMA, receiving, grading, disposition, production, RTV, notifications, supplier reports, analytics, quality/CAPA.
- [x] Routes وLegacy IDs وSidebar/Hybrid catalog.
- [x] Contract tests تثبت وجود الوثيقة، migration، RPCs، SDK، routes.

## 10) تكاملات خارجية/زمن تشغيل لاحق
- [ ] بوابة عميل خارجية ذات تتبع عام public token: ممثلة كإشعارات وحالة RMA؛ فتح Portal خارجي كامل يعتمد على وحدة CRM/Customer Portal المستقبلية.
- [ ] تكامل مالي حقيقي لإصدار Credit Note وتعديل تكلفة WO في ERP/MRP: ممثل بجداول payload وسجلات cost adjustment لحين وحدة الإنتاج/المالية النهائية.
- [ ] تكاملات ناقل فعلية لطباعة ملصقات الإرجاع: ممثلة بحقل return_label_url وnotification payload؛ الربط API الخارجي لاحقاً.
