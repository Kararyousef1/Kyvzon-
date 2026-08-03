# مراجعة بوابة CRM مقابل التوثيقات — Kyvzon

**التاريخ:** 2026-07-28  
**النطاق:** مراجعة التوثيقات الموجودة في `src/pages/CRM/*.md` مقابل التنفيذ الحالي في قاعدة البيانات، SDK، الواجهة، الراوتر، الكتالوجات، والاختبارات.  
**الخلاصة المختصرة:** بوابة CRM مبنية بشكل قوي تقنياً وتغطي الوحدات الست الأساسية، لكنها ليست بنفس مستوى النضج التشغيلي وUX الذي وصلنا إليه لاحقاً في المخزون والتصنيع. توجد فجوات مهمة قبل اعتبارها “جاهزة لشركة” بنفس معيارنا الجديد.

---

## 1) مصادر التوثيق التي تمت مراجعتها

التوثيقات الرسمية الحالية موجودة داخل:

```text
src/pages/CRM/
```

وتشمل:

```text
01-contact-account-management.md
02-pipeline-deal-management.md
03-sales-activities-automation.md
04-quotes-proposals-cpq.md
05-customer-support-ticketing.md
06-analytics-forecasting-intelligence.md
```

كما تمت مراجعة:

```text
docs/CRM_BUILD_PLAN.md
docs/CRM_FULL_TEST_REPORT.md
```

---

## 2) التنفيذ الحالي للبوابة

### صفحات CRM

الصفحات موجودة تحت:

```text
src/pages/crmportal/
```

وتغطي:

```text
contacts
pipeline
activities
quotes
support
analytics
```

### SDK

الخدمات موجودة:

```text
src/services/sdk/CrmContactsService.ts
src/services/sdk/CrmPipelineService.ts
src/services/sdk/CrmActivitiesService.ts
src/services/sdk/CrmQuotesService.ts
src/services/sdk/CrmSupportService.ts
src/services/sdk/CrmAnalyticsService.ts
```

### migrations

الجداول والـ RPCs موجودة عبر:

```text
0165_crm_contacts_accounts.sql
0166_crm_pipeline_deals.sql
0167_crm_activities_automation.sql
0168_crm_quotes_cpq.sql
0169_crm_support_ticketing.sql
0170_crm_analytics_forecasting.sql
0173_crm_finance_link.sql
0175_crm_enrichment_apply.sql
0176_crm_esignature.sql
0177_oauth_integrations.sql
```

---

## 3) نتائج الفحوصات الحالية

تم تشغيل:

```bash
npm run type-check
```

النتيجة:

```text
PASS
```

وتم تشغيل اختبارات CRM المحددة:

```bash
npm run test:run -- src/test/crmContacts.test.ts src/test/crmPipeline.test.ts src/test/crmActivities.test.ts src/test/crmQuotes.test.ts src/test/crmSupport.test.ts src/test/crmAnalytics.test.ts src/test/crmFoundation.test.ts
```

النتيجة:

```text
7 test files passed
43 tests passed
```

وتم تشغيل:

```bash
npm run db:contract-check
npm run db:procurement-sql-check
npm run build
```

النتيجة:

```text
PASS
```

مع تحذير build المعروف حول chunk size فقط.

---

## 4) تقييم عام

بوابة CRM **ليست سطحية**. يوجد فيها:

- DB حقيقي.
- RLS على جداول CRM.
- RPCs للعمليات الأساسية.
- SDK منظم.
- صفحات تشغيلية.
- اختبارات لكل وحدة.
- تكاملات مقصودة مع التسويق، المالية، الدعم، التوقيع، الإثراء.

لكن مقارنةً بالمعيار الجديد الذي أصبحنا نعتمده بعد المخزون والتصنيع، توجد فجوات:

1. التوثيقات موجودة في `src/pages/CRM` وليس `docs/crm`.
2. لا توجد Technical Checklists تفصيلية لكل وحدة مثل inventory/mrp.
3. route الخاص بـ CRM لا يحتوي حالياً على `RequireModule moduleKey="crm"` رغم أن التوثيق يقول إنها وحدة تُفعّل للشركات.
4. `hybridPagesCatalog.ts` لا يحتوي صفحات CRM حالياً، رغم أن الاشتراكات الهجينة تحتاج catalog واضحاً للصفحات.
5. `Sidebar.tsx` العام لا يحتوي CRM entries لأن CRM يستخدم `CrmSidebar` داخل المسار؛ هذا مقبول جزئياً، لكن يجب التأكد من نقطة الدخول للمستخدم خارج `/app/crm`.
6. AdminEmployeesPage يحتوي صفحات CRM الرئيسية فقط، وليس كل الصفحات الفرعية الدقيقة.
7. بعض الميزات موثقة كتكاملات خارجية أو محاكاة وليست Live حقيقية.
8. UX جيد، لكنه لم يمر بمرحلة `UX + Buttons + Lookups + Record Tools Completion` بنفس عمق MRP.

---

## 5) Matrix — هل ما في التوثيق موجود؟

## 5.1 التقرير 01 — Contacts & Accounts

| بند التوثيق | حالة التنفيذ | ملاحظات |
|---|---|---|
| Contact vs Account separation | موجود | `crm_contacts`, `crm_accounts` |
| Contact 360 data | موجود جزئياً جيد | حقول واسعة + detail pages |
| Account record + hierarchy | موجود | `parent_account_id`, firmographics |
| Unified timeline | موجود | `crm_activities_timeline` |
| Deduplication | موجود | `crm_find_duplicate_contacts`, `crm_merge_contacts` |
| Data enrichment | موجود كـ hook/simulated | يحتاج مزود خارجي Live |
| GDPR / privacy | موجود جزئياً | `crm_gdpr_erase_contact`, audit |
| بحث وتصفية متقدمة | موجود جزئياً | صفحات فيها بحث/فلترة، ليس محرك بحث شامل متعدد الأبعاد لكل الكيانات |
| صلاحيات حسب الدور | موجود أساسياً عبر role/RLS | يحتاج مراجعة page-level/hybrid أكثر |

**التقييم:** قوي، لكن يحتاج Technical Checklist وUX pass إضافي.

---

## 5.2 التقرير 02 — Pipeline & Deals

| بند التوثيق | حالة التنفيذ | ملاحظات |
|---|---|---|
| Flexible pipeline builder | موجود جزئياً | جداول pipelines/stages وseed، لكن UI builder محدود |
| Exit criteria | موجود في schema/stage | يظهر في Kanban |
| Kanban visual | موجود | `KanbanBoard` |
| Deal record | موجود | `crm_deals` + detail |
| Deal velocity | موجود | RPC/service |
| Stagnation alerts | موجود | RPC/service |
| Win/Loss analysis | موجود | loss reasons + close modal + reports |
| Multiple pipelines | موجود | `pipeline_type` وpipeline selector |
| Drag/drop فعلي | غير واضح/جزئي | يوجد select لتحريك المرحلة وليس drag/drop كامل |

**التقييم:** جيد جداً، يحتاج تحسين UX builder وdrag/drop إن كان مطلوباً حرفياً.

---

## 5.3 التقرير 03 — Activities & Automation

| بند التوثيق | حالة التنفيذ | ملاحظات |
|---|---|---|
| Tasks | موجود | create/complete |
| Calls/meetings/manual logging | موجود | logCall |
| Sequences engine | موجود | tables + seed/enroll/advance |
| Automation rules | موجود | قواعد if-then أساسية |
| Personal task board | موجود | MyTasks |
| Activity analytics | موجود | stats/gaps |
| Auto assignment | موجود | assignment rules |
| Email/calendar/VoIP auto logging | hook / مؤجل | OAuth migrations موجودة للبريد، لكن live auto-logging يحتاج مزودات |
| WhatsApp/SMS integration | مؤجل/خارجي | ليس Live حالياً |

**التقييم:** قوي داخلياً، التكاملات الخارجية مؤجلة كما في التقرير.

---

## 5.4 التقرير 04 — Quotes / CPQ

| بند التوثيق | حالة التنفيذ | ملاحظات |
|---|---|---|
| Product catalog | موجود | `crm_products`, seed |
| Pricing rules | موجود | `crm_pricing_rules` |
| Quote builder | موجود | quotes + line items |
| Recalculation | موجود | `crm_recalc_quote` |
| Discount approval workflow | موجود | discount approvals |
| PDF generation | موجود كطباعة/واجهة | ليس مولد PDF server-side متقدم |
| Proposal tracking | موجود | `crm_quote_events` |
| E-signature | موجود داخلي + hook خارجي | `0176_crm_esignature`، DocuSign خارجي مؤجل |
| Contracts repository | موجود | `crm_contracts` |
| Quote analytics | موجود | RPC |

**التقييم:** قوي، لكن PDF والتوقيع الخارجي يحتاجان Runtime/provider validation.

---

## 5.5 التقرير 05 — Support & Ticketing

| بند التوثيق | حالة التنفيذ | ملاحظات |
|---|---|---|
| Tickets | موجود | create/list/detail |
| SLA policies | موجود | seed + status |
| Replies/internal notes | موجود | ticket replies |
| Canned responses | موجود | settings page |
| Knowledge base | موجود | KB articles |
| Routing rules | موجود | settings page |
| SLA escalation | موجود جزئياً | SLA fields/KPIs، يحتاج اختبار runtime للتصعيد التلقائي الكامل |
| Omnichannel inbox | schema/channel موجود | القنوات الخارجية live مؤجلة |
| CSAT | موجود | submit CSAT |
| Churn risk | موجود | RPC/service |

**التقييم:** جيد جداً، Omnichannel live يحتاج تكامل خارجي.

---

## 5.6 التقرير 06 — Analytics / Forecasting / Intelligence

| بند التوثيق | حالة التنفيذ | ملاحظات |
|---|---|---|
| Executive dashboard | موجود | ExecOverview + RPCs |
| Weighted forecast | موجود | `crm_weighted_forecast` |
| Conversion funnel | موجود | RPC |
| Pipeline velocity | موجود | RPC |
| Win/loss by competitor | موجود | RPC |
| Segmentation | موجود | RPC |
| Account health | موجود | health weights + score |
| MRR movement | موجود | snapshots + page |
| Rep performance | موجود | RPC |
| Scheduled report emailing | غير مكتمل | لا يظهر كجدولة إرسال بريد حقيقية |
| Export Excel/PDF | غير مكتمل/جزئي | لا يظهر نظام export queue مثل MRP analytics |

**التقييم:** تحليلات قوية، لكن reporting automation/export needs enhancement.

---

## 6) نقاط القوة

1. البوابة تغطي كل التقارير الستة من حيث الهيكل العام.
2. وجود migrations منظمة من 0165 إلى 0170 وما بعدها.
3. RLS موجود على جداول CRM حسب التقرير السابق.
4. SDK منظم ومقسّم حسب الوحدات.
5. UI ليس مجرد placeholders؛ فيه صفحات حقيقية وأزرار إنشاء وتشغيل.
6. اختبارات CRM تمر حالياً.
7. التكامل مع marketing leads موجود عبر convert lead.
8. التكامل مع finance موجود كـ `crm_link_deal_to_finance`.
9. التوقيع الإلكتروني والإثراء موجودان كـ hooks/محاكاة مع إمكانية live لاحقاً.

---

## 7) الفجوات الحرجة أو المهمة

## 7.1 CRM route لا يستخدم RequireModule

في `src/router/AppRouter.tsx`:

```tsx
<Route path="crm" element={<RequireRole roles={['sales', 'admin', 'developer']} />}>
```

لكن لا يوجد:

```tsx
<RequireModule moduleKey="crm" />
```

هذا يعني أن تفعيل/تعطيل CRM من Developer Portal قد لا يمنع الوصول المباشر للمسار إذا كان لدى المستخدم role مناسب.

**الأثر:** High — لأن Developer Portal يفترض أنها تتحكم بتفعيل البوابات للشركات.

**المطلوب:** لف CRM مثل procurement/inventory/mrp:

```tsx
<Route path="crm" element={<RequireRole roles={['sales','admin','developer']} />}>
  <Route element={<RequireModule moduleKey="crm" />}>
    ...
  </Route>
</Route>
```

مع الانتباه لـ developer/it_admin إن كانت لهم استثناءات مقصودة.

---

## 7.2 CRM غير موجود في Hybrid Catalog

البحث في:

```text
src/pages/hybridportal/hybridPagesCatalog.ts
```

لا يظهر `crm-*`.

**الأثر:** Medium/High حسب استخدام الخطة hybrid.  
إذا شركة hybrid تحتاج CRM pages، فلن تُدار صفحات CRM بدقة من الكتالوج الهجين.

**المطلوب:** إضافة صفحات CRM الرئيسية والفرعية إلى hybrid catalog، أو توثيق أن CRM غير مدعوم في hybrid.

---

## 7.3 AdminEmployeesPage يحتوي صفحات CRM الرئيسية فقط

الموجود:

```text
crm-dashboard
crm-contacts
crm-pipeline
crm-activities
crm-quotes
crm-support
crm-analytics
```

لكن لا توجد pages فرعية مثل:

```text
crm-contacts-accounts
crm-contacts-people
crm-pipeline-board
crm-quotes-approvals
crm-support-kb
crm-analytics-forecast
```

**الأثر:** Medium.  
إذا أردنا صلاحيات دقيقة لكل صفحة مثل Inventory/MRP، يجب توسيع catalog.

---

## 7.4 لا توجد Technical Checklists لوحدات CRM

الموجود تقارير تشغيلية في `src/pages/CRM/*.md`، لكن لا يوجد:

```text
docs/crm/01-...-technical-checklist.md
```

بنفس نمط inventory/mrp.

**الأثر:** Medium.  
يصعب على AI جديد التأكد من أن كل تفصيل موثق موجود في DB/RPC/UI/tests.

---

## 7.5 موقع التوثيق غير مثالي

التوثيقات داخل:

```text
src/pages/CRM
```

وهذا غير مناسب، لأن `src/pages` يجب أن يكون للكود/الصفحات لا للتوثيق الرسمي.

**المطلوب:** نقل/نسخ التوثيقات إلى:

```text
docs/crm/
```

مع ترك redirect note إن لزم.

---

## 7.6 UX ليس بنفس نضج Inventory/MRP بعد آخر تحسين

CRM فيه أزرار كثيرة وصفحات حقيقية، لكنه لم يمر بنفس مرحلة:

```text
UX + Buttons + Lookups + Record Tools Completion
```

التي نفذناها في MRP.

أمثلة تحتاج مراجعة:

- هل كل status change يحتاج reason؟
- هل كل إلغاء/إغلاق يسجل audit؟
- هل كل صفحة تشغيلية فيها زر مناسب؟
- هل كل صفحة تعتمد Lookups بدل UUID؟
- هل هناك RecordTools موحدة؟
- هل هناك UnitNav داخلي بدل sidebar ضخم؟

---

## 8) هل بوابة CRM قوية؟

نعم، من حيث البنية الأساسية، هي قوية:

- 6 وحدات مبنية.
- جداول حقيقية.
- RPCs حقيقية.
- RLS.
- SDK.
- UI فعلي.
- Tests.

لكن هل هي بمستوى نضج بوابة التصنيع بعد آخر UX pass؟

**لا، ليست بعد.**

التصنيع والمخزون أصبحا أكثر صرامة من ناحية:

- Technical checklists.
- UnitNav.
- Buttons completeness.
- Reasons on close/cancel.
- Hybrid/Admin page catalog التفصيلي.
- Runtime-oriented UX.

---

## 9) هل كل ما في التوثيق موجود؟

الجواب الدقيق:

```text
معظم الجوهر موجود، لكن ليس كل التفاصيل موجودة بنفس العمق أو بشكل Live كامل.
```

الموجود بقوة:

- Contacts/accounts.
- Pipeline/deals.
- Activities/tasks/sequences.
- CPQ/quotes/contracts.
- Support/tickets/KB/SLA.
- Analytics/forecasting/health/MRR.

الموجود كـ hook/محاكاة أو جزئي:

- Gmail/Outlook auto logging.
- VoIP/Calendar integrations.
- WhatsApp/SMS CRM communication.
- Clearbit/Apollo live enrichment.
- DocuSign live e-signature.
- Omnichannel live ticket creation.
- Scheduled report emails.
- Export center كامل.
- Fine-grained hybrid/admin page catalog.

---

## 10) التوصية

لا أبدأ بتعديل عشوائي الآن. التوصية هي تنفيذ مرحلة منظمة:

```text
CRM Remediation & UX Completion Pass
```

بالترتيب:

1. نقل/تنظيم التوثيق إلى `docs/crm`.
2. إنشاء technical checklist لكل تقرير من الستة.
3. إصلاح route بإضافة `RequireModule moduleKey="crm"`.
4. إضافة CRM pages إلى hybrid catalog أو توثيق استثنائها.
5. توسيع AdminEmployeesPage ليشمل الصفحات الفرعية المهمة.
6. مراجعة كل صفحة CRM وإضافة الأزرار الناقصة.
7. تحويل أي إدخال UUID إلى Lookup.
8. إضافة reason/audit لكل close/cancel/archive/status change.
9. إضافة contract test جديد يفحص route/module/hybrid/admin completeness.
10. تشغيل الفحوصات الكاملة.

---

## 11) الحكم النهائي

### هل تم إنشاء بوابة CRM بشكل صحيح؟

نعم، **تم إنشاؤها بشكل صحيح من ناحية الأساس التقني العام**.

### هل هي قوية؟

نعم، **قوية كبنية أولى**، وليست مجرد واجهات.

### هل كل شيء في التوثيق موجود؟

ليس 100%. الموجود يغطي أغلب الجوهر، لكن بعض التفاصيل موضوعة كـ hooks/محاكاة أو ناقصة من حيث UX/catalog/runtime.

### هل جاهزة كشركة تستخدمها بنفس معيار Inventory/MRP؟

ليس قبل تنفيذ Remediation/UX pass المذكور أعلاه، خصوصاً إصلاح `RequireModule` وHybrid/Admin catalogs والتوثيق الفني.

---

## 12) الفحوصات التي تمت أثناء هذه المراجعة

```bash
npm run type-check
# PASS

npm run test:run -- src/test/crmContacts.test.ts src/test/crmPipeline.test.ts src/test/crmActivities.test.ts src/test/crmQuotes.test.ts src/test/crmSupport.test.ts src/test/crmAnalytics.test.ts src/test/crmFoundation.test.ts
# PASS — 7 files / 43 tests

npm run db:contract-check
# PASS

npm run db:procurement-sql-check
# PASS

npm run build
# PASS مع تحذير chunk size المعروف
```
