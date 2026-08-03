# دليل تسليم المعرفة لأي ذكاء اصطناعي يعمل على Kyvzon

> هذا الملف هو نقطة البداية الإلزامية لأي ذكاء اصطناعي أو مطوّر يستلم العمل على مشروع Kyvzon.  
> الهدف منه أن يصل القارئ إلى نفس الفهم التشغيلي والمعماري الذي وصل إليه الفريق أثناء بناء بوابات: المشتريات، المخزون، التصنيع، CRM، التسويق، المالية وغيرها.

---

## 1) ما هو Kyvzon؟

Kyvzon منصة SaaS متعددة الشركات `Multi-Tenant` لإدارة عمليات الشركات عبر بوابات متخصصة مترابطة. كل شركة داخل النظام تسمى:

```text
Tenant / Company
```

وكل شركة يمكن تفعيل بوابات مختلفة لها حسب الخطة والاشتراك، مثل:

- بوابة الموظف.
- HR.
- المالية.
- المشتريات.
- المخزون والمستودعات.
- التصنيع MRP.
- CRM.
- التسويق.
- البوابة التقنية.
- بوابة المطور.

النظام ليس تطبيقاً واحداً بسيطاً، بل منصة بوابات. كل بوابة قد تحتوي وحدات داخلية وصفحات وتدفقات أعمال وRLS وRPCs وSDK وواجهات واختبارات.

---

## 2) أهم حقيقة: بوابة المطورين هي Control Plane المنصة

بوابة المطورين ليست مجرد شاشة للمطور. هي **بوابة التحكم المركزية** في منصة Kyvzon، ومنها تُدار الشركات والاشتراكات والتفعيل المؤسسي للبوابات.

المسار:

```text
/dev
```

الأدوار المسموحة:

```text
developer
it_admin
```

وظيفتها الأساسية:

- إدارة الشركات `Companies/Tenants`.
- إنشاء الشركات وتجهيز بياناتها الأولية.
- إدارة اشتراكات الشركات.
- تفعيل/تعطيل البوابات لكل شركة.
- مراقبة صحة المنصة.
- إدارة Public Site / Landing configuration.
- الاطلاع على سجل العمليات والمنصة.
- تشغيل أدوات هندسية/تشخيصية.

أي ذكاء اصطناعي يعمل على بوابة جديدة يجب أن يفهم أن تفعيل البوابة لشركة لا يتم فقط من الشريط الجانبي، بل يجب أن تكون البوابة معرفة في **كتالوج الوحدات** وتظهر في بوابة المطور لإدارة تفعيلها.

راجع أيضاً:

```text
docs/DEVELOPER_PORTAL_CONTROL_PLANE_AR.md
```

---

## 3) الفرق بين Role وModule وPage

يجب عدم الخلط بين هذه المفاهيم:

| المفهوم | المعنى | مثال |
|---|---|---|
| Role | دور المستخدم داخل الشركة | `manufacturing`, `inventory`, `procurement` |
| Module | بوابة أو وحدة تُفعّل للشركة | `mrp`, `inventory`, `procurement` |
| Page | صفحة محددة داخل بوابة | `mrp-work-orders`, `inventory-items` |
| Tenant | الشركة/المؤسسة | شركة أدوية، مصنع، متجر، إلخ |

مثال:

```text
Role: manufacturing
Module: mrp
Pages: mrp-dashboard, mrp-bom, mrp-planning, ...
```

وقد يكون المستخدم Admin أو Developer لكنه يحتاج كذلك إلى أن تكون الوحدة مفعّلة للشركة حسب منطق الاشتراك، إلا أن بعض الأدوار المنصّية مثل `developer` و`it_admin` لها صلاحيات منصة أوسع.

---

## 4) المنهجية الذهبية لبناء أي بوابة

لا تُبنى أي بوابة في Kyvzon بعشوائية. المنهجية المعتمدة التي أثبتت نجاحها في المخزون والتصنيع هي:

```text
1. قراءة التوثيق الرسمي للبوابة/الوحدة.
2. استخراج Technical Checklist.
3. بناء قاعدة البيانات والجداول والـ RLS.
4. بناء RPCs للعمليات الحساسة.
5. بناء Views للوحات والتقارير والـ Lookups.
6. بناء SDK في src/services/sdk.
7. بناء UI Pages.
8. ربط Routes.
9. ربط Sidebar.
10. ربط Admin Employees permissions catalog.
11. ربط Hybrid Catalog.
12. ربط Tenant Module Catalog / Developer Portal activation.
13. إضافة post-migration checks.
14. إضافة contract tests.
15. تشغيل type-check/db checks/tests/build/lint.
16. اختبار Runtime بعد تطبيق migrations.
17. عدم اعتبار العمل جاهزاً حتى تعمل الأزرار والصفحات والتدفقات فعلياً.
```

راجع المنهجية التفصيلية:

```text
docs/PORTAL_ENGINEERING_METHODOLOGY_AR.md
```

---

## 5) قاعدة عدم الخروج من الوحدة

القاعدة المعتمدة في بناء بوابات Kyvzon:

> لا نخرج من وحدة أو صفحة حتى يكون كل ما وثقناه موجوداً في الكود أو قاعدة البيانات أو الواجهة أو الاختبار، أو موسوماً صراحةً كاعتماد خارجي/مستقبلي.

هذا يعني أن عبارة "أنشأنا الصفحة" لا تكفي. يجب أن تحتوي الصفحة على:

- بيانات من View أو Table حقيقية.
- أزرار العمليات المطلوبة.
- Lookups بدل نسخ UUID.
- معالجة حالات الإغلاق/الإلغاء/الأرشفة مع سبب.
- أدوات نسخ/تفاصيل قدر الإمكان.
- SDK/RPC حقيقيان.
- RLS.
- اختبار عقد.

---

## 6) فلسفة UX المعتمدة

تعلمنا من بوابة المخزون ثم طبقناها في التصنيع:

### ممنوع الاعتماد على نسخ UUID

لا تجعل الموظف ينسخ:

```text
warehouse_id
item_id
work_order_id
bom_version_id
supplier_id
```

بل استخدم:

```text
Lookup / Search / Select by code-name-status
```

### لا hard delete للسجلات الحرجة

بدلاً من الحذف:

```text
archive
cancel
close
retire
deactivate
```

مع سبب إلزامي وتسجيل Audit.

### كل تعديل/إغلاق مهم يحتاج سبب

مثلاً:

- إغلاق Work Order.
- إلغاء MPS.
- إغلاق NCR/CAPA.
- إلغاء Posting Draft.
- تعطيل سياسة تقييم.
- تغيير حالة أصل أو محطة.

يجب أن يظهر السبب في Audit أو Activity.

### الشريط الجانبي لا يعرض كل الصفحات الفرعية

للبوابات الكبيرة مثل Inventory وMRP:

- Sidebar يعرض الوحدات الرئيسية فقط.
- داخل كل وحدة توجد بطاقات خطوات صغيرة بأسهم، مثل `InventoryUnitNav` و`MrpUnitNav`.

---

## 7) قاعدة DB/RLS/RPC

كل جدول tenant-scoped يجب أن يحتوي:

```sql
tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE
```

ويجب تفعيل RLS:

```sql
ALTER TABLE public.<table> ENABLE ROW LEVEL SECURITY;
```

ويجب أن تمنع السياسات عبور الشركات:

```sql
tenant_id = public.current_user_tenant_id()
```

والعمليات الحساسة يجب أن تكون RPC:

```sql
SECURITY DEFINER
SET search_path = public
```

ولا تستقبل أبداً:

```text
p_tenant_id
```

من العميل.

الـ tenant يأتي من:

```sql
public.current_user_tenant_id()
```

---

## 8) ملفات الربط التي غالباً تُنسى

عند إضافة بوابة أو دور أو صفحات، راجع دائماً:

```text
src/shared/types/index.ts
src/core/constants/permissions.ts
src/router/constants.ts
src/router/moduleMap.ts
src/router/AppRouter.tsx
src/router/legacyRedirect.ts
src/shared/components/dashboard/Sidebar.tsx
src/pages/admin/AdminEmployeesPage.tsx
src/pages/hybridportal/hybridPagesCatalog.ts
src/services/sdk/TenantModuleCatalog.ts
src/services/sdk/index.ts
supabase/functions/_shared/adminAuth.ts
supabase/functions/admin-create-user/index.ts
scripts/tests/99_post_migration_checks.sql
```

وإذا أضفت Edge Function أو عدلت أدواراً فيها، تذكر أن Git push لا ينشرها تلقائياً؛ يجب deploy للـ functions.

---

## 9) فحوصات إلزامية قبل التسليم

بعد أي تعديل جوهري:

```bash
npm run type-check
npm run db:contract-check
npm run db:procurement-sql-check
npm run test:run
npm run build
npm run lint
```

القبول:

- TypeScript: صفر أخطاء.
- Build: ينجح.
- Tests: تمر.
- Lint: صفر errors، والتحذيرات القديمة مقبولة إن كانت موجودة مسبقاً.
- DB checks: تمر.

---

## 10) الفرق بين Local/Static وRuntime

لا تقل إن البوابة جاهزة للإنتاج فقط لأن:

```text
type-check PASS
build PASS
tests PASS
```

هذه فحوصات محلية/static. الجاهزية الحقيقية تتطلب:

```text
npx supabase db push
```

ثم اختبار Runtime داخل المتصفح ببيانات حقيقية:

- إنشاء بيانات أساسية.
- تشغيل الأزرار.
- التأكد من RPCs.
- التأكد من RLS.
- التأكد من Views.
- التأكد من عدم وجود أخطاء أعمدة مثل `received_date` بدل `received_at`.

---

## 11) حالة البوابات الكبيرة المنجزة

### Inventory/WMS

أنجزت بمنهجية صارمة من Foundation حتى Analytics، مع UX polish لاحق:

- Lookups.
- Line builders.
- Record tools.
- Activity/Audit.
- Numbering/Barcode.
- Sidebar main units only.

### MRP/Manufacturing

أنجزت من Unit 00 إلى Unit 10:

```text
00 Foundation
01 BOM/ECO
02 Forecasting/MPS
03 Planning/Work Orders
04 Manufacturing Inventory/WIP
05 Procurement Integration
06 Quality
07 Shop Floor/MES
08 Maintenance/CMMS
09 Costing
10 Analytics
```

ثم أضيفت مرحلة UX/Buttons من migrations 0229 إلى 0239.

---

## 12) كيف يتصرف أي ذكاء اصطناعي جديد؟

عند استلام مهمة:

1. اقرأ هذا الملف.
2. اقرأ `DEVELOPER_PORTAL_CONTROL_PLANE_AR.md`.
3. اقرأ `PORTAL_ENGINEERING_METHODOLOGY_AR.md`.
4. اقرأ توثيق البوابة المعنية.
5. افحص Git status قبل أي تعديل.
6. لا تفترض أن migrations مطبقة إلا إذا أخبر المستخدم أو ظهرت في DB.
7. لا تعمل push أو db push إلا بتصريح واضح.
8. كن صادقاً في التقرير: ما تم محلياً وما تم Runtime.
9. لا تقدم ملخصات سطحية؛ اذكر الملفات والفحوصات والنتائج.

---

## 13) مبدأ الجودة النهائي

Kyvzon يجب أن يُبنى كمشروع شركات حقيقي، لا كتجربة واجهات. لذلك كل بوابة يجب أن تكون:

- دقيقة.
- قابلة للاستخدام من موظف غير تقني.
- معزولة tenant-wise.
- قابلة للتدقيق audit-ready.
- قابلة للتوسع.
- متكاملة مع البوابات الأخرى.
- موثقة بحيث يستطيع أي ذكاء اصطناعي أو مطور فهمها وإكمالها بنفس المستوى.

أي حل لا يحقق هذه المبادئ يعتبر ناقصاً حتى لو كان الكود يعمل.
