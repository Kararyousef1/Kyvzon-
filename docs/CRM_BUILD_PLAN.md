# 🗺️ خطة بناء بوابة CRM — للمراجعة قبل التنفيذ

> مبنية على التقارير الستة في `src/pages/CRM/` + دليل `HOW_TO_ADD_A_PORTAL.md` (لتفادي أخطائنا السابقة).
> **هذه خطة للمراجعة — لن يُنفَّذ شيء قبل موافقتك.**

---

## 1. القرارات المعمارية الكبرى (تحتاج موافقتك)

| القرار | التوصية | السبب |
|--------|---------|-------|
| **اسم الوحدة** | `crm` | مفتاح جديد في `ModuleKey` |
| **الخطة الدنيا** | `professional` فما فوق | مثل `marketing` تماماً |
| **المسار** | `/app/crm` | بوابة مستقلة بشريط جانبي خاص |
| **الدور الجديد** | `sales` (فريق المبيعات) | يحتاج دوراً خاصاً — واتباع قائمة الـ12 نقطة كاملةً |
| **بادئة الجداول** | `crm_*` | **إلزامي** لتفادي تعارض `customers`/`contracts`/`contacts` القائمة |
| **الترقيم** | migrations من `0164` فصاعداً | آخر رقم حالي = `0163` |

---

## 2. الربط بالنظام القائم (بدل التكرار)

CRM لا يعمل بمعزل — يجب ربطه بما بنينا:

```
marketing_leads (تسويق)  ──(تحويل lead → contact)──►  crm_contacts
crm_contacts  ──(ينتمي لـ)──►  crm_accounts  ──(عند الفوز)──►  customers (المالي/AR)
crm_deals (Closed Won)  ──(إشعار)──►  قسم الفواتير (AR) + Onboarding
crm_tickets  ──(CSAT)──►  استبيانات التسويق / Account Health
كل إرسال (بريد/SMS) من CRM  ──►  يمرّ عبر governance_check (نظام المناعة العلائقية)
```

- **تحويل Lead → Contact**: زر في بوابة التسويق/CRM ينقل `marketing_leads` إلى `crm_contacts` (يحافظ على المصدر والـ owner).
- **Deal فائز → Customer مالي**: عند `Closed Won`، خيار إنشاء/ربط سجل في جدول `customers` المالي (لإصدار الفواتير) — دون تكرار البيانات.
- **الحوكمة**: أي بريد/رسالة يرسلها CRM تستدعي `governance_check` (الوحدة 7) — احترام رصيد العلاقة.

---

## 3. الوحدات الفرعية الست (حسب التقارير)

| # | الوحدة الفرعية | المسار | الجداول الرئيسية (بادئة crm_) | migration |
|---|----------------|--------|-------------------------------|-----------|
| 0 | الأساس (الدور sales + تسجيل وحدة crm) | — | (توسيع `profiles.role`) | `0164` ✅ |
| 1 | جهات الاتصال والحسابات | `/app/crm/contacts` | `crm_accounts`, `crm_contacts`, `crm_activities_timeline`, `crm_merge_log`, `crm_audit_log` | `0165` ✅ |
| 2 | Pipeline والصفقات | `/app/crm/pipeline` | `crm_pipelines`, `crm_stages`, `crm_deals`, `crm_deal_loss_reasons`, `crm_deal_stage_history` | `0166` ✅ |
| 3 | الأنشطة والأتمتة | `/app/crm/activities` | `crm_tasks`, `crm_sequences`, `crm_sequence_steps`, `crm_sequence_enrollments`, `crm_automation_rules`, `crm_automation_log`, `crm_assignment_rules` | `0167` ✅ |
| 4 | العروض والعقود (CPQ) | `/app/crm/quotes` | `crm_products`, `crm_pricing_rules`, `crm_quotes`, `crm_quote_line_items`, `crm_discount_approvals`, `crm_quote_events`, `crm_contracts` | `0168` ✅ |
| 5 | الدعم والتذاكر | `/app/crm/support` | `crm_tickets`, `crm_ticket_replies`, `crm_kb_articles`, `crm_canned_responses`, `crm_sla_policies`, `crm_routing_rules` | `0169` ✅ |
| 6 | التحليلات والتنبؤ | `/app/crm/analytics` | `crm_sales_targets`, `crm_deal_forecast`, `crm_mrr_snapshots`, `crm_health_weights` (+ 10 دوال تجميع RPC) | `0170` ✅ |

> **✅ بوابة CRM مكتملة 6/6 — كل الوحدات مرفوعة/جاهزة.** migrations 0164→0170، CHECK T→Y، خدمات SDK: CrmContactsService · CrmPipelineService · CrmActivitiesService · CrmQuotesService · CrmSupportService · CrmAnalyticsService.

> ملاحظة: بعض المفاهيم (Account Health, MRR Movement, Forecasting) ستُبنى كـ **دوال تجميع (RPC)** فوق الجداول الموجودة، لا جداول جديدة.

---

## 4. الأدوار — قائمة التحقق الإلزامية للدور `sales`

**تحذير من دليلنا:** إضافة دور تحتاج تعديل **12 موضعاً**، بعضها لا يكتشفه المترجم (سبب أخطائنا). عند بناء CRM سنعدّل **كل** هذه (للدور `sales`):

1. `src/shared/types/index.ts` → `UserRole`
2. `src/core/constants/permissions.ts` → `DEFAULT_ROLE_PERMISSIONS`
3. `src/shared/components/dashboard/Sidebar.tsx` → `ROLE_CONFIG`
4. `src/utils/userUtils.ts` → `getUserRoleBadge()`
5. ⚠️ `src/utils/userUtils.ts` → `normalizeRole()` → `validRoles` **(الخطأ الذي كلّفنا وقتاً)**
6. `src/router/constants.ts` → `ROLE_DEFAULT_PATH` (`sales: '/app/crm'`)
7. ⚠️ `src/pages/admin/AdminEmployeesPage.tsx` → `ROLES`
8. ⚠️ `src/pages/admin/AdminEmployeesPage.tsx` → `ROLE_MODULE_MAP` (`sales: 'crm'`) + `PORTAL_PAGES`
9. ⚠️ `supabase/functions/_shared/adminAuth.ts` → `TARGET_ROLES`
10. ⚠️ `supabase/functions/admin-create-user/index.ts` → `TARGET_ROLES`
11. `supabase/migrations/0164_...` → توسيع قيد `profiles.role` ليقبل `sales`
12. `src/pages/hybridportal/hybridPagesCatalog.ts` → `ALL_ROLES`

+ إعادة نشر Edge Functions بعد الرفع + اختبار حماية لـ `normalizeRole('sales')`.

---

## 5. نقاط ربط الوحدة (Module) الإلزامية

1. `TenantModuleCatalog.ts`: `ModuleKey` + `MODULE_CATALOG` (`{ key:'crm', minPlan:'professional', category:'advanced', status:'beta' }`) + `PLAN_ALLOWED_MODULES.professional`.
2. `moduleMap.ts`: `{ pathPrefix:'/app/crm', moduleKey:'crm', label:'بوابة CRM' }`.
3. `AppRouter.tsx`: `RequireRole roles={['sales','admin','developer']}` + المسارات الفرعية.
4. `AppLayout.tsx`: `CrmSidebar` عند `/app/crm`.
5. `99_post_migration_checks.sql`: CHECK T→Y (وحدة لكل تقرير).

---

## 6. المعايير التقنية (نفس بوابة التسويق)

- كل جدول: `tenant_id NOT NULL REFERENCES tenants(id)` + **RLS إلزامي** (select/write على `current_user_tenant_id()`).
- كل خدمة SDK ترث `BaseService<T>` وتُصدَّر من `src/services/sdk/index.ts`.
- العمليات الحساسة: دوال `SECURITY DEFINER` + `SET search_path = public` + فحص tenant.
- الأطراف الخارجية (Gmail/Outlook/VoIP/E-Signature/Enrichment): **adapter + وضع محاكاة** يُفعَّل بمفتاح لاحقاً.
- كل وحدة فرعية: معاينة `crm-*-preview.html` (لا تُرفع).

---

## 7. الترتيب المرحلي المقترح

```
المرحلة 0: الأساس — الوحدة crm + الدور sales + الشريط الجانبي + لوحة CRM (بلا وحدات بعد)
المرحلة 1: جهات الاتصال والحسابات (0164) — القلب، وكل شيء يرتبط به
المرحلة 2: Pipeline والصفقات (0165)
المرحلة 3: الأنشطة والأتمتة (0166)
المرحلة 4: العروض والعقود CPQ (0167)
المرحلة 5: الدعم والتذاكر (0168)
المرحلة 6: التحليلات والتنبؤ (0169) — يجمع كل ما سبق
```
بعد كل مرحلة: تحقق شامل (tsc + lint + tests + build + migration test) + معاينة + أوامر رفع.

---

## 8. المخاطر المعروفة والتعامل معها

| الخطر | التعامل |
|-------|---------|
| تعارض أسماء (`customers`, `contracts`, `contacts`) | بادئة `crm_*` صارمة |
| تكرار مع التسويق (Sequences/Workflows، تذاكر/استبيانات) | CRM = دورة مبيعات B2B فردية؛ التسويق = حملات جماهيرية. الربط لا التكرار |
| نسيان نقطة ربط الدور | اتباع قائمة الـ12 حرفياً + اختبار حماية |
| حجم البناء الكبير | بناء مرحلي، وحدة تلو الأخرى، مع تحقق بعد كل مرحلة |
| بيئة العمل تُعاد أحياناً | `npm ci` + إعادة Postgres عند الحاجة (موثّق) |

---

## نقاط تحتاج قرارك قبل البدء
1. **اسم الدور**: `sales` أم تفضّل اسماً آخر (مثل `crm`)؟
2. **هل CRM بوابة مستقلة** (`/app/crm`) أم وحدة داخل بوابة التسويق؟ (توصيتي: مستقلة).
3. **الربط بالمالية**: هل نربط Deal الفائز بجدول `customers` المالي الآن، أم نتركه hook لاحقاً؟
4. **الترتيب**: نبدأ بالمرحلة 0 (الأساس) ثم الوحدة 1؟

---

*خطة للمراجعة — يوليو 2026. لا تنفيذ قبل الموافقة.*
