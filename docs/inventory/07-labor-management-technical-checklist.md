# الوحدة 07 — Checklist تقني: إدارة العمالة وإنتاجية القوى العاملة

مصدر الحقيقة: `docs/inventory/07-labor-management-productivity.md`.

> قاعدة التنفيذ: الكمال الحرفي — لا تخرج الوحدة من الحالة "مكتملة" حتى يكون كل بند في الوثيقة ممثلاً في قاعدة البيانات، RPC، SDK، الواجهات، المسارات، والاختبارات، أو موسوماً كتكامل خارجي مستقبلي.

## 1) Labor Standards
- [x] تعريف وقت قياسي لكل نوع مهمة قابل للتعديل.
- [x] دعم Engineered Standards: حركة/مسافة/إعداد/مسح/تنفيذ.
- [x] دعم Historical Standards: متوسط أداء تاريخي.
- [x] معايير أمثلة المستودع: receiving pallet، putaway pallet، low/high pick، small/large pack، count location، forklift transfer.
- [x] ربط المعيار بالمستودع، المنطقة، المهارة المطلوبة، ومعدل الخطأ المقبول.

## 2) Workforce Planning
- [x] تخطيط يومي لعبء العمل المتوقع بالدقائق.
- [x] مقارنة عبء العمل بالطاقة المتاحة: employees × shift minutes × efficiency factor.
- [x] تخطيط weekly/monthly عبر horizon وإصدار توصيات زيادة/نقص العمالة.
- [x] مصادر عبء العمل من الاستلام، التخزين، السحب، التعبئة، الشحن، الجرد، والمرتجعات.
- [x] توصيات عند وجود فائض: Replenishment/Cycle Count.

## 3) Task Assignment & Dispatching
- [x] Assignment يدوي لمدير الوردية.
- [x] Dynamic Dispatching حسب priority/location/skill/load.
- [x] إرسال المهمة التالية للموظف كرسالة/Task payload للواجهة المحمولة.
- [x] Task Interleaving بدمج مهام قريبة في نفس رحلة الحركة.
- [x] قياس dead travel savings عند دمج المهام.

## 4) Individual Performance Tracking
- [x] لوحة الموظف الفردي: completed tasks، actual time، standard time، productivity %.
- [x] أنواع المهام حسب receiving/putaway/picking/packing/counting/replenishment/shipping/returns.
- [x] Errors وaccuracy للموظف.
- [x] Real-time status للوردية.

## 5) Time Tracking
- [x] Direct time.
- [x] Indirect time.
- [x] Personal time.
- [x] Unexplained time.
- [x] الأهداف: direct ≥70%, indirect ≤15%, personal ≤10%, unexplained ≤5%.

## 6) Non-Productive Time Analysis
- [x] waiting.
- [x] dead_travel.
- [x] searching.
- [x] rework.
- [x] equipment_wait.
- [x] recommended action لكل سبب.

## 7) Incentive Programs
- [x] مستويات 85-95 / 95-105 / 105-115 / 115+.
- [x] شرط دقة/أخطاء أقل من 0.5%.
- [x] احتساب مكافأة الأداء من productivity + error rate.
- [x] Shift leaderboard مع rank/medals/team average/target.

## 8) Skills & Training Management
- [x] Skill catalog.
- [x] ملف مهارات لكل موظف: certified/in_training/not_qualified/expired.
- [x] منع التوزيع الذكي عند غياب skill certification.
- [x] Training records وتجديد الشهادات.

## 9) Labor KPIs
- [x] Overall productivity rate.
- [x] Utilization rate.
- [x] Unexplained time percent.
- [x] Labor cost per unit.
- [x] TRIR injury rate.
- [x] Turnover rate.

## 10) UI/SDK/Tests
- [x] SDK `Inventory/LaborService.ts` لكل الجداول وRPC والتحليلات.
- [x] واجهات: dashboard, standards, planning, availability, dispatch, interleaving, time tracking, employee performance, manager dashboard, non-productive analysis, skills/training, incentives, productivity reports, safety KPIs.
- [x] Routes وLegacy IDs وSidebar/Hybrid catalog/Admin pages.
- [x] Contract tests تثبت وجود الوثيقة، migration، RPCs، SDK، routes.

## 11) تكاملات خارجية/زمن تشغيل لاحق
- [ ] تكامل attendance/payroll الحقيقي لحساب التكلفة/الساعات من نظام HR: ممثل بجداول availability/time logs وhourly_cost لحين الربط النهائي.
- [ ] تكامل أجهزة RF/Mobile realtime push: ممثل بتحديث dispatch payload وحالة task؛ الإشعارات اللحظية تحتاج runtime channel لاحقاً.
- [ ] تكامل MRP/Production plan الرسمي للتخطيط الأسبوعي/الشهري: ممثل بحقول source_payload وmanual/imported workload lines لحين اكتمال بوابة الإنتاج.
