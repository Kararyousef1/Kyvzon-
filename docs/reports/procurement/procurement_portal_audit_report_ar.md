# تقرير فحص بوابة المشتريات في Kyvzon

**الفرع المفحوص:** `remediation/p0-security-and-build-health`  
**النطاق:** التوثيقات `docs/e-procurement/*.md` + ربط الدور/الوحدة حسب دليل إنشاء بوابة جديدة + كود الواجهة + SDK + migrations + Edge Functions.  
**تاريخ الفحص:** 2026-07-26

---

## 1) الخلاصة التنفيذية

**النتيجة المختصرة:** بوابة المشتريات مبنية جزئياً فقط. الهيكل العام موجود، والربط الأساسي كدور/وحدة موجود، والبناء البرمجي ينجح، لكن التنفيذ لا يطابق التوثيقات تفصيلياً ولا يصلح كنسخة إنتاجية كاملة.

يمكن اعتبارها **نسخة Beta / Skeleton وظيفي أولي** يحتوي على جداول وواجهات أولية وRPCs، لكن لا يمكن اعتبارها «بوابة مشتريات كاملة 100%» كما تدّعي تعليقات بعض الملفات.

### نقاط القوة

- دور `procurement` مضاف في أغلب نقاط الربط الإلزامية.
- وحدة `procurement` مضافة في كتالوج الوحدات وخطط الاشتراك المناسبة.
- المسار `/app/procurement` محمي بـ `RequireRole` و `RequireModule`.
- توجد migrations تغطي ظاهرياً الوحدات السبع: PR، RFx، الموردين، PO/GR، الفواتير، العقود، التحليلات.
- توجد خدمات SDK لكل جزء تقريباً.
- `npm run type-check` نجح.
- `npm run build` نجح.
- `npm run test:run` نجح: **38 ملف اختبار / 399 اختبار**.
- `npm run sdk:boundary-check` و `npm run db:contract-check` نجحا.

### نقاط الخطر

- الواجهات غير مكتملة بشكل واضح: عدة صفحات مجرد placeholder أو قراءة فقط.
- كثير من وظائف قاعدة البيانات `SECURITY DEFINER` ممنوحة لكل `authenticated` بدون فحص الدور داخلياً.
- عدة دوال تقبل `tenant_id` كوسيط من العميل، مما يفتح احتمالات تسريب/تلاعب عبر الشركات.
- كل Views الخاصة بالمشتريات تقريباً منشأة كـ views عادية وممنوحة لـ authenticated بدون `security_invoker` أو فلتر `current_user_tenant_id()` داخل الـ view.
- صفحة تفاصيل المورد وصفحة تفاصيل PR هما placeholders صريحان.
- صفحات مهمة موجودة لكنها غير مربوطة بالراوتر مثل `ToleranceRulesPage` و `PoReleasesPage`.
- `scripts/tests/99_post_migration_checks.sql` لا يحتوي فحوصات Procurement، رغم أن دليل البناء يطلب إضافتها.
- اختبارات المشتريات الحالية سطحية/Mock-heavy ولا تختبر قاعدة حقيقية أو RLS فعلي.

**التقييم العام التقريبي:**

| المحور | التقييم |
|---|---:|
| ربط الدور والوحدة | جيد جداً |
| وجود schema/SDK | جيد إلى متوسط |
| مطابقة التوثيقات وظيفياً | ضعيف إلى متوسط |
| جاهزية الواجهة | ضعيفة |
| الأمن وعزل الشركات | يحتاج إصلاحات حرجة |
| جاهزية الإنتاج | غير جاهزة |

---

## 2) نتائج أوامر التحقق

نفذت الأوامر التالية داخل المشروع:

```bash
npm ci
npm run type-check
npm run lint
npm run test:run
npm run build
npm run sdk:boundary-check
npm run db:contract-check
npm audit --omit=dev
```

### النتائج

| الأمر | النتيجة |
|---|---|
| `npm ci` | نجح، لكنه أظهر 7 ثغرات high إجمالاً عند audit الكامل |
| `npm audit --omit=dev` | ثغرتان high في runtime: `react-router`, `react-router-dom` |
| `npm run type-check` | نجح بلا أخطاء |
| `npm run lint` | 0 errors، لكن 1361 warning |
| `npm run test:run` | نجح: 38 files / 399 tests |
| `npm run build` | نجح |
| `npm run sdk:boundary-check` | نجح |
| `npm run db:contract-check` | نجح |
| `scripts/tests/run_clean_db_test.sh` | لم يعمل في البيئة لأن `psql` غير موجود |

---

## 3) فحص قائمة إنشاء دور جديد Role

الدور `procurement` موجود في النقاط الأساسية:

| البند | الملف | الحالة |
|---|---|---|
| نوع `UserRole` | `src/shared/types/index.ts` | موجود |
| صلاحيات الدور | `src/core/constants/permissions.ts` | موجود |
| Sidebar / ROLE_CONFIG | `src/shared/components/dashboard/Sidebar.tsx` | موجود |
| Badge | `src/utils/userUtils.ts` | موجود |
| `normalizeRole().validRoles` | `src/utils/userUtils.ts` | موجود، لا يبتلع الدور |
| default path | `src/router/constants.ts` | موجود: `/app/procurement` |
| قائمة أدوار إدارة الموظفين | `src/pages/admin/AdminEmployeesPage.tsx` | موجود |
| `ROLE_MODULE_MAP` | `src/pages/admin/AdminEmployeesPage.tsx` | موجود: `procurement: 'procurement'` |
| Edge `_shared/adminAuth.TARGET_ROLES` | `supabase/functions/_shared/adminAuth.ts` | موجود |
| Edge `admin-create-user` TARGET_ROLES | `supabase/functions/admin-create-user/index.ts` | موجود |
| migration قيد `profiles.role` | `supabase/migrations/0181_add_procurement_role.sql` | موجود |
| Hybrid roles | `src/pages/hybridportal/hybridPagesCatalog.ts` | موجود |

**الحكم:** ربط الدور تم بشكل صحيح غالباً.

ملاحظة: يجب التأكد عملياً بعد النشر أن Edge Functions التالية أعيد نشرها:

```bash
npx supabase functions deploy admin-create-user
npx supabase functions deploy admin-update-role
```

---

## 4) فحص قائمة إنشاء وحدة/بوابة Module

| البند | الحالة |
|---|---|
| `ModuleKey` و `MODULE_CATALOG` | موجود: `procurement` |
| `PLAN_ALLOWED_MODULES` | موجود في professional/enterprise/custom |
| `ROUTE_MODULE_MAP` | موجود: `/app/procurement` |
| `AppRouter` | موجود مع مسارات فرعية |
| `RequireModule` | موجود حول بوابة المشتريات |
| صفحات الوحدة | موجودة لكنها غير مكتملة |
| SDK Services | موجودة لمعظم الكيانات |
| migrations | موجودة 0181 إلى 0189 |
| post migration checks | ناقصة: لا يوجد Procurement في `99_post_migration_checks.sql` |
| Sidebar مخصص | غير موجود، لكنه اختياري؛ يتم استخدام Sidebar العام |

**الحكم:** الربط المعماري الأساسي موجود، لكن بند فحوصات ما بعد migration غير منفذ، والصفحات ليست كاملة.

---

## 5) تقييم مطابقة الوحدات السبع للتوثيقات

### 5.1 الوحدة 01 — طلب الشراء وسير الموافقات PR

**الموجود:**

- جداول: `purchase_requisitions`, `pr_line_items`, `pr_attachments`, `procurement_approval_rules`, `procurement_approval_requests`, `procurement_approval_steps`, `procurement_reorder_points`.
- RPCs: `create_purchase_requisition_full`, `approve_procurement_step`, `consolidate_prs`, `check_pr_budget`, `resolve_procurement_approval_chain`.
- واجهة قائمة PR وإنشاء PR بسيط.

**النواقص مقابل التوثيق:**

- نموذج PR في الواجهة لا يحتوي حقول أساسية كثيرة: القسم، مركز التكلفة، تاريخ الحاجة، نوع الطلب، الصنف، الوحدة التفصيلية، المورد المقترح، مرفقات.
- صفحة تفاصيل PR مجرد placeholder: `RequisitionDetailPage.tsx` تقول صراحةً إنها ستعرض البنود والمرفقات وسير الموافقة لاحقاً.
- لا توجد واجهة مرفقات فعلية.
- لا يوجد توليد فعلي من MRP أو نقاط إعادة الطلب، فقط جدول `procurement_reorder_points`.
- `procurement_approval_rules` موجودة لكن `resolve_procurement_approval_chain` لا يستخدمها فعلياً؛ يستخدم منطقاً ثابتاً.
- منطق الموافقات لا يطابق التوثيق بدقة:
  - التوثيق: مدير قسم → مدير مشتريات → CFO → CEO حسب حدود 5K/50K/250K.
  - الكود: supervisor → manager إذا >= 5000 → procurement دائماً → finance إذا > 50000 → admin إذا > 500000.
- لا توجد قواعد Routing متقدمة حقيقية: CAPEX، مورد غير معتمد، IT approval، emergency fast-track، production criticality.
- فحص الميزانية محدود بمركز تكلفة وسنة مالية، وليس شهري/فئة/مشروع/CAPEX كما في التوثيق.
- إذا تجاوزت الميزانية تحت 50K لا يضمن الكود إضافة المالية للموافقة.
- حالات `under_review` و `revision_required` غير موجودة في enum رغم وجودها في التوثيق.
- سجل تدقيق كامل غير موجود على مستوى PR.
- إشعارات تذكير المعتمدين غير مكتملة.

**الحكم:** تنفيذ جزئي؛ قاعدة البيانات أقوى من الواجهة، لكن سير العمل لا يطابق الوثيقة بالكامل.

---

### 5.2 الوحدة 02 — التوريد الاستراتيجي RFx والمزادات

**الموجود:**

- جداول: `sourcing_events`, `rfx_line_items`, `rfx_documents`, `supplier_bids`, `bid_evaluations`, `procurement_auctions`, `auction_bids`.
- RPCs: `create_sourcing_event_from_pr`, `submit_supplier_bid`, `evaluate_bid`, `start_procurement_auction`, `place_auction_bid`.
- صفحة أحداث RFx، صفحة تفاصيل RFx، صفحة Auction Live.
- Edge Function لإرسال RFQ: `procurement-send-rfq`.

**النواقص:**

- لا يوجد منشئ RFx كامل بقوالب RFI/RFQ/RFP؛ الإنشاء فقط من PR وبحقول قليلة.
- لا توجد واجهة لإدارة وثائق RFx وأقسامها ومعايير التقييم.
- لا توجد بوابة موردين حقيقية لتقديم العروض؛ صفحة RFx تسمح للموظف الداخلي بتقديم عرض نيابة عن المورد.
- لا يوجد Q&A للموردين.
- MECCA/التقييم متعدد المعايير موجود كجدول ودالة، لكن ليس متكاملاً في تجربة اختيار/ترسية كاملة.
- لا يوجد مسار award/shortlist فعلي واضح في الواجهة.
- المزادات موجودة DB/RPC، لكن لا توجد واجهة إنشاء مزاد من الحدث، فقط صفحة live لعروض موجودة.
- إرسال RFQ عبر البريد يعود إلى `simulated` إذا لا يوجد Resend key، وهذا مقبول كـ beta لكنه ليس اكتمالاً إنتاجياً.

**الحكم:** Skeleton جيد، لكنه لا يغطي دورة RFx الكاملة كما في الوثيقة.

---

### 5.3 الوحدة 03 — تأهيل الموردين Supplier Onboarding

**الموجود:**

- توسعة جدول `suppliers`.
- جداول: `supplier_documents`, `supplier_contacts`, `supplier_risk_assessments`, `supplier_portal_invites`, `supplier_site_visits`.
- RPCs: `calculate_kraljic`, `check_supplier_documents_expiry`, `invite_supplier_portal`, `verify_supplier_portal_token`.
- Edge Functions: دعوة المورد، cron لانتهاء الوثائق.
- صفحة قائمة موردين وإنشاء مورد أولي.

**النواقص:**

- صفحة تفاصيل المورد placeholder صريح، ولا تعرض التبويبات الستة المذكورة.
- لا توجد بوابة self-service عامة للمورد رغم أن رابط الدعوة يشير إلى `/supplier-portal/:token`؛ لا يوجد route/صفحة مقابلة.
- لا توجد نماذج تأهيل قابلة للتخصيص.
- لا يوجد سير موافقة المورد حسب المخاطر والقيمة.
- لا توجد واجهة رفع/تحقق وثائق المورد.
- لا توجد واجهة تقييم مخاطر 5 أبعاد أو زيارات ميدانية.
- لا يوجد audit trail للتغييرات على المورد.
- في Edge Function دعوة المورد: `generateToken()` يعيد `hash: token` ثم لاحقاً يتم عمل SHA-256؛ المتغير الأول غير مستخدم، ليس خطراً مباشراً لكنه مؤشر عدم نظافة.
- الدعوة ترجع `token` في وضع simulated، وهذا يجب أن يبقى محصوراً خارج الإنتاج.

**الحكم:** قاعدة البيانات موجودة، لكن تجربة التأهيل الفعلية غير مبنية.

---

### 5.4 الوحدة 04 — أوامر الشراء واستلام البضائع PO/GR

**الموجود:**

- جداول: `purchase_orders`, `po_line_items`, `po_releases`, `goods_receipts`, `gr_line_items`, `return_to_vendor`.
- RPCs: `create_po_from_pr`, `receive_goods`, `post_goods_receipt`, `create_rtv`.
- صفحات: قائمة PO، تفاصيل PO، قائمة GR.

**النواقص:**

- صفحة PO قراءة فقط؛ لا يوجد زر إنشاء PO من PR معتمد.
- لا يوجد إرسال PO للمورد من الواجهة.
- صفحة GR قراءة فقط؛ لا توجد واجهة استلام بضائع ولا Posting.
- لا توجد واجهة RTV.
- `PoReleasesPage.tsx` موجودة لكنها غير مربوطة بالراوتر.
- `post_goods_receipt` يذكر أن تحديث المخزون سيحدث مستقبلاً في تعليق؛ لا يوجد تكامل مخزون فعلي.
- لا توجد تنبيهات OTIF فعلية.
- لا يوجد فحص جودة IQC متكامل؛ فقط status `quality_hold`.

**الحكم:** طبقة قاعدة البيانات جيدة كبداية، الواجهة غير كافية لإدارة دورة PO/GR.

---

### 5.5 الوحدة 05 — الفواتير والمطابقة الثلاثية

**الموجود:**

- جداول: `supplier_invoices`, `invoice_line_items`, `procurement_tolerance_rules`, `procurement_matching_results`, `procurement_duplicate_checks`, `procurement_payment_schedules`.
- RPCs: `match_invoice`, `detect_duplicate_invoice`, `seed_procurement_tolerance_rules`, `calculate_early_discount_saving`.
- Edge Function OCR: `procurement-invoice-ocr`.
- صفحات: قائمة فواتير، تفاصيل مطابقة.

**النواقص:**

- لا توجد واجهة إنشاء فاتورة أو إدخال بنود فاتورة.
- OCR Function لا يقرأ PDF فعلياً؛ هو يرسل `file_url` كنص إلى نموذج دردشة، فلا يوجد تحميل للملف أو Vision حقيقي على محتوى المستند.
- لا يوجد تكامل OCR مع إنشاء invoice/lines في DB.
- `ToleranceRulesPage.tsx` موجودة لكنها غير مربوطة بالراوتر.
- المطابقة لا تعالج flow الاستثناءات بالكامل ولا approvals للدفع.
- لا توجد واجهة Early Payment Discounts أو Dynamic Discounting.
- لا توجد أرشفة/بحث متقدم/تصدير.

**الحكم:** محرك أولي، غير مكتمل كتجربة P2P فعلية.

---

### 5.6 الوحدة 06 — دورة حياة العقود CLM

**الموجود:**

- جداول: `procurement_contracts`, `contract_templates`, `contract_clauses`, `contract_versions`, `contract_obligations`, `contract_amendments`, `contract_signatures`.
- RPCs: `create_contract_version`, `sign_contract`.
- Edge Function لتوقيع DocuSign: `procurement-send-signature`.
- صفحات: العقود، القوالب، الالتزامات، الإصدارات، التوقيعات.

**النواقص/الأخطاء:**

- لا توجد واجهة إنشاء/تحرير عقد كاملة.
- لا يوجد redlining تعاوني فعلي.
- لا يوجد سير موافقات قانوني/مالي متعدد المستويات.
- `SignaturesPage` يبحث عن عقود `status='approved'`، لكن enum جدول `procurement_contracts.status` لا يحتوي `approved` أصلاً؛ هذا يجعل قائمة عقود التوقيع غالباً فارغة.
- `sign_contract` يسجل `otp_verified=true` مباشرة وIP ثابت من الواجهة `127.0.0.1`؛ هذا ليس توقيعاً قانونياً حقيقياً.
- Edge Function DocuSign يعيد `mode: simulated` إذا لا توجد مفاتيح، بل وحتى في وضع live يسجل audit ويعيد envelope id شكلي `ENV-${Date.now()}` بدل استدعاء DocuSign فعلي حسب التعليق.
- RLS يذكر دور `legal` لكن `UserRole` لا يحتوي `legal`، فتلك الصلاحية غير قابلة للاستخدام حالياً.

**الحكم:** schema أولي فقط؛ CLM غير مكتمل وظيفياً، والتوقيع الإلكتروني غير جاهز إنتاجياً.

---

### 5.7 الوحدة 07 — تحليل الإنفاق وذكاء المشتريات

**الموجود:**

- جداول: `spend_transactions`, `spend_categories`, `supplier_spend_summary`, `procurement_price_history`, `spend_forecasts`.
- RPCs: `classify_spend_transaction`, `detect_maverick_spend`, `calculate_supplier_otif`, `forecast_spend`.
- Views: `spend_pareto_80_20`, `price_trend`.
- صفحات: Spend Analytics، Category، Price Trend، Forecast.

**النواقص/الأخطاء:**

- لا يوجد data collector فعلي يملأ `spend_transactions` من PO/invoices/P-Cards/expenses/contracts.
- لا يوجد تنظيف بيانات أو دمج أسماء موردين متكررة.
- لا يوجد AI classification فعلي لـ UNSPSC.
- في `SpendAnalyticsPage` توجد أرقام hardcoded: 12.4M، 487K، 158، 12؛ ليست محسوبة من البيانات.
- `SpendForecastService.forecast()` يحاول جلب أول tenant من جدول `tenants` بدلاً من استخدام tenant الحالي، وهذا خطأ معماري ووظيفي.
- لا يوجد Export Excel/PDF.

**الحكم:** تحليلات أولية محدودة جداً وليست ذكاء مشتريات كامل.

---

## 6) مشاكل أمنية ومعمارية حرجة

### 6.1 دوال SECURITY DEFINER بدون فحص دور داخلي

أغلب RPCs الحساسة تستخدم `SECURITY DEFINER` و `SET search_path = public` وهذا جيد من ناحية search_path، لكنها ممنوحة لـ `authenticated` ولا تفحص دور المستخدم داخل الدالة.

أمثلة خطرة:

- `create_sourcing_event_from_pr`
- `submit_supplier_bid`
- `evaluate_bid`
- `start_procurement_auction`
- `place_auction_bid`
- `create_po_from_pr`
- `receive_goods`
- `post_goods_receipt`
- `create_rtv`
- `match_invoice`
- `seed_procurement_tolerance_rules`
- `detect_duplicate_invoice`
- `create_contract_version`
- `sign_contract`
- `forecast_spend`

**المطلوب:** كل دالة حساسة يجب أن تبدأ بفحص مثل:

```sql
IF public.current_user_role() NOT IN ('procurement','admin','finance') THEN
  RAISE EXCEPTION 'NOT_AUTHORIZED';
END IF;
```

مع اختلاف الأدوار حسب العملية.

---

### 6.2 دوال تقبل tenant_id من العميل

دوال مثل:

- `detect_duplicate_invoice(p_tenant_id, ...)`
- `forecast_spend(p_tenant_id, ...)`
- `seed_procurement_tolerance_rules(p_tenant_id)`

تقبل `tenant_id` كمدخل مباشر. هذا خطر في نظام multi-tenant، خصوصاً مع `SECURITY DEFINER`.

**المطلوب:** لا تقبل `tenant_id` من العميل في RPCs العامة. استخدم دائماً:

```sql
v_tenant := public.current_user_tenant_id();
```

وافرض أن أي مدخل متعلق بالكيانات ينتمي لنفس `v_tenant`.

---

### 6.3 Views قد تتجاوز RLS وتسرّب بيانات شركات أخرى

Views التالية منشأة كـ `CREATE OR REPLACE VIEW` وممنوحة لـ `authenticated` دون `security_invoker=true` ودون فلتر tenant داخل الـ view:

- `pr_pending_with_age`
- `pr_rogue_spending`
- `supplier_expiry_alerts`
- `rfq_tco_comparison`
- `auction_savings`
- `po_tracking`
- `otif_metrics`
- `invoice_stp_metrics`
- `invoice_dispute_breakdown`
- `contract_renewals_upcoming`
- `spend_pareto_80_20`
- `price_trend`

**المطلوب:** إما:

```sql
CREATE OR REPLACE VIEW public.some_view
WITH (security_invoker = true) AS ...
```

أو أضف داخل كل view:

```sql
WHERE tenant_id = public.current_user_tenant_id()
```

والأفضل استخدام الاثنين حسب إصدار Postgres.

---

### 6.4 علاقات cross-tenant غير محمية بمفاتيح مركبة

عدة جداول فيها `tenant_id` ومعها FK إلى كيان آخر لا يضمن نفس tenant. مثال: `supplier_id`, `event_id`, `po_id`, `contract_id` يمكن تمرير UUID من tenant آخر في دالة `SECURITY DEFINER` إذا لم يتم التحقق.

**المطلوب:** داخل كل RPC تحقق صريحاً:

```sql
SELECT 1 FROM suppliers WHERE id = p_supplier_id AND tenant_id = v_tenant;
```

أو استخدم مفاتيح مركبة `(tenant_id, id)` حيث أمكن.

---

### 6.5 الاختبارات لا تثبت RLS فعلياً

اختبارات `src/test/procurement/*` تستخدم دوال محاكاة مثل `canAccess(...)` ولا تشغّل قاعدة Postgres ولا policies فعلية. لذلك نجاح 399 اختبار لا يعني أن عزل الشركات أو سياسات RLS تعمل فعلياً.

**المطلوب:** اختبارات DB integration حقيقية تطبق migrations وتستخدم مستخدمين من شركتين وتتحقق من الرفض/السماح فعلياً.

---

## 7) مشاكل ربط/واجهة واضحة

| المشكلة | الأثر |
|---|---|
| `RequisitionDetailPage.tsx` placeholder | تفاصيل PR غير مبنية |
| `SupplierDetailPage.tsx` placeholder | تأهيل الموردين غير مبني |
| `ToleranceRulesPage.tsx` غير مربوطة بالراوتر | حدود التسامح غير قابلة للإدارة من الواجهة |
| `PoReleasesPage.tsx` غير مربوطة بالراوتر | أوامر الإطار/الإطلاق غير ظاهرة |
| PO/GR صفحات قراءة فقط | لا يمكن إكمال دورة الشراء من الواجهة |
| Contracts status mismatch `approved` | توقيعات العقود قد لا تظهر |
| توقيع بعلامة OTP true وIP ثابت | غير قانوني/غير آمن |
| أرقام Spend Dashboard hardcoded | تضليل للمستخدم بأنها بيانات حقيقية |
| لا Supplier Portal route | دعوات المورد لا تقود لتسجيل فعلي |
| لا Procurement post-migration checks | مخالفة مباشرة لدليل إنشاء بوابة جديدة |

---

## 8) الحكم النهائي

### هل تم بناء بوابة المشتريات وفق المعايير؟

**لا، ليس بالكامل.**

تم بناء **إطار معماري أولي جيد** للبوابة: دور، وحدة، routes، SDK، migrations، وجزء من الـ RPCs. لكن البوابة لا تطابق التوثيقات التفصيلية كوحدة أعمال كاملة، وفيها فجوات أمنية ووظيفية كبيرة.

### التصنيف المناسب حالياً

- ليست Production-ready.
- تصلح كـ Beta داخلية فقط بعد حجب claims مثل “100% حقيقي”.
- تحتاج إصلاحات P0 أمنية قبل أي استخدام حقيقي ببيانات شركات.

---

## 9) أولويات الإصلاح المقترحة

### P0 — أمني/حرج

1. إضافة فحص دور داخل كل RPC `SECURITY DEFINER`.
2. منع تمرير `tenant_id` من العميل واستبداله بـ `current_user_tenant_id()`.
3. إصلاح كل views بإضافة `security_invoker=true` أو فلتر tenant صريح.
4. التحقق من أن كل FK حساس ينتمي لنفس tenant داخل RPCs.
5. إضافة اختبارات RLS integration حقيقية بشركتين.
6. تحديث `99_post_migration_checks.sql` بفحوصات Procurement.

### P1 — إكمال مسارات العمل

1. بناء تفاصيل PR كاملة: مرفقات، history، approvals، comments، revision.
2. جعل approval rules قابلة للتخصيص ومستخدمة فعلاً.
3. بناء Supplier Detail tabs والتأهيل والوثائق والمخاطر والزيارات.
4. بناء Supplier Portal route فعلي.
5. بناء إنشاء PO من PR + إرسال PO + GR receive/post + RTV.
6. ربط ToleranceRules وPoReleases بالراوتر.
7. بناء إنشاء الفواتير وبنودها وOCR متصل بقاعدة البيانات.
8. إصلاح CLM status وإضافة إنشاء/تحرير وموافقات وتوقيع حقيقي.

### P2 — تحسينات وتحليلات

1. Data ingestion للإنفاق من PO/Invoices/Contracts/P-Cards.
2. إزالة الأرقام hardcoded من Spend Dashboard.
3. Export Excel/PDF.
4. تنبيهات حقيقية للمعتمدين، الوثائق، العقود، OTIF.
5. Audit trail موحد لكل أحداث المشتريات.

---

## 10) خلاصة قصيرة لصاحب القرار

بوابة المشتريات ليست مجرد واجهة ناقصة؛ هناك هيكل جيد لكنه يحتاج تشديد أمني وإكمال workflow. إذا تم إطلاقها الآن لمستخدمين حقيقيين، أكبر خطرين هما:

1. **عمليات حساسة قد يستطيع أي مستخدم authenticated تنفيذها عبر RPCs مباشرة.**
2. **Views و RPCs قد تفتح احتمالات تسريب بيانات بين الشركات إن لم تُصلح.**

بعد إصلاح P0 يمكن اعتبارها Beta آمنة، وبعد P1 يمكن تقييمها كبوابة مشتريات فعلية مطابقة للتوثيقات.
