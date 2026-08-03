# منهجية هندسة بوابات Kyvzon — إنشاء أو تعديل بوابة باحترافية عالية

> هذا التوثيق هو الدستور العملي لبناء أو تعديل أي بوابة في Kyvzon.  
> الهدف أن يتبع أي ذكاء اصطناعي أو مطور نفس المنهجية الصارمة التي اتبعناها في بوابة المخزون وبوابة التصنيع.

---

## 1) المبدأ الأعلى

لا نضيف صفحة لمجرد أن تظهر في الواجهة.  
ولا نضيف جدولاً لمجرد أن يكون موجوداً.  
كل شيء يجب أن يخدم تدفقاً تشغيلياً حقيقياً لشركة.

المبدأ:

```text
وثّق → خطط → ابنِ DB/RPC/RLS → ابنِ SDK → ابنِ UI → اربط Routes/Sidebar/Admin/Hybrid → اختبر → طبّق Runtime → راجع UX
```

---

## 2) مراحل بناء بوابة جديدة

## المرحلة 0 — فهم المجال Domain Understanding

قبل كتابة أي كود:

- اقرأ التوثيق الرسمي إن كان موجوداً.
- إن لم يكن موجوداً، أنشئ توثيقاً تشغيلياً مفصلاً أولاً.
- افهم دورة العمل الحقيقية للموظف.
- افهم البوابات التي ستتكامل معها.
- افهم السجلات الحرجة التي لا يجب حذفها.

أمثلة للأسئلة:

- ما هو الكيان الرئيسي؟
- من ينشئه؟
- من يراجعه؟
- من يغلقه؟
- ما الحالات الممكنة؟
- ما السبب المطلوب عند الإغلاق؟
- ما التكاملات المطلوبة؟
- ما التقارير والمؤشرات؟

---

## المرحلة 1 — التوثيق الرسمي

يجب إنشاء توثيق تشغيلي للبوابة أو الوحدة داخل:

```text
docs/<portal>/
```

مثال:

```text
docs/mrp/07-shop-floor-control.md
```

يجب أن يشرح:

- الهدف.
- المفاهيم.
- دورة العمل.
- الصفحات المطلوبة.
- التكاملات.
- KPI.
- الحالات.
- الاستثناءات.

---

## المرحلة 2 — Technical Checklist

بعد التوثيق الرسمي، أنشئ checklist تقنية:

```text
docs/<portal>/<unit>-technical-checklist.md
```

يجب أن تربط كل بند توثيقي بما يقابله في:

- Tables.
- RPCs.
- Views.
- RLS.
- SDK.
- UI pages.
- Routes.
- Sidebar.
- Admin catalog.
- Hybrid catalog.
- Tests.

أي بند غير منفذ يجب أن يوسم:

```text
Future / External Dependency
```

ولا يجوز تركه غامضاً.

---

## المرحلة 3 — قاعدة البيانات

### الجداول

كل جدول تشغيلي يجب أن يكون tenant-scoped:

```sql
tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE
```

إلا إذا كان جدولاً عاماً بعناية مثل public reference data، ويجب تبرير ذلك.

### التسمية

استخدم prefix واضح:

```text
inventory_...
mrp_...
crm_...
marketing_...
```

قبل إنشاء جدول جديد، ابحث عن تعارض:

```bash
grep -R "CREATE TABLE IF NOT EXISTS public.<name>" supabase/migrations
```

### حالات السجلات

كل سجل تشغيلي مهم يحتاج status واضح:

```text
draft
active
in_progress
completed
closed
cancelled
archived
```

حسب المجال.

---

## المرحلة 4 — RLS

كل جدول tenant-scoped يجب أن يحتوي:

```sql
ALTER TABLE public.<table> ENABLE ROW LEVEL SECURITY;
```

وسياسات:

```sql
USING (tenant_id = public.current_user_tenant_id())
WITH CHECK (tenant_id = public.current_user_tenant_id())
```

ولا تعتمد على الواجهة لمنع تسريب البيانات.

---

## المرحلة 5 — RPCs

كل عملية حساسة يجب أن تكون RPC لا insert/update مباشر من الواجهة.

أمثلة:

- إنشاء أمر عمل.
- اعتماد BOM.
- تحويل توصية شراء إلى PR.
- إغلاق NCR.
- إلغاء MPS.
- تغيير حالة أصل.
- ترحيل تكلفة.

RPC يجب أن يكون:

```sql
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
```

ويجب أن يستخدم:

```sql
public.current_user_tenant_id()
```

ولا يستقبل:

```text
p_tenant_id
```

من العميل.

---

## المرحلة 6 — Views

كل صفحة عرض أو Dashboard يجب أن تعتمد على View واضحة قدر الإمكان:

- Dashboard view.
- Queue view.
- Board view.
- Lookup view.
- KPI view.
- Integration health view.

مثال:

```text
mrp_work_order_dashboard
mrp_andon_board
inventory_receiving_dashboard
```

Views يجب أن تكون:

```sql
WITH (security_invoker=true)
```

كلما أمكن.

---

## المرحلة 7 — SDK

كل الوصول للبيانات من الواجهة يجب أن يكون عبر:

```text
src/services/sdk/
```

وقاعدة عامة:

```text
لا تستخدم supabase مباشرة في صفحات التشغيل إلا للـ Lookups البسيطة أو كحل مؤقت موثق.
```

الخدمة ترث غالباً:

```ts
BaseService<T>
```

وتُصدّر في:

```text
src/services/sdk/index.ts
```

---

## المرحلة 8 — UI Pages

كل صفحة يجب أن تحتوي:

- عنوان واضح.
- شرح مختصر.
- جدول بيانات أو Dashboard.
- أزرار العمليات المناسبة.
- Lookups بدل UUID.
- رسائل نجاح/خطأ.
- أدوات نسخ/تفاصيل قدر الإمكان.

### لا تجعل الصفحة مجرد جدول إذا كانت تشغيلية

مثلاً صفحة `Work Orders` يجب أن تحتوي أزرار:

- Create.
- Release.
- Start.
- Complete.
- Close.
- Hold.
- Cancel.

وليس فقط عرض الأوامر.

### صفحات التقارير

قد تكون عرض فقط، لكن إذا فيها report/export يجب أن تحتوي:

- Generate report.
- Request export.
- Cancel/Update export status عند الحاجة.

---

## المرحلة 9 — Navigation

### Sidebar

للبوابات الكبيرة:

```text
Sidebar يعرض الوحدات الرئيسية فقط.
```

ولا يعرض كل الصفحات الفرعية حتى لا يصبح صعب الاستخدام.

### داخل الوحدة

استخدم بطاقات خطوات أفقية:

- Inventory: `InventoryUnitNav`.
- MRP: `MrpUnitNav`.

هذا النمط هو المعتمد للبوابات الكبيرة.

---

## المرحلة 10 — Routes

أضف Lazy imports في:

```text
src/router/AppRouter.tsx
```

واربط المسارات داخل:

```tsx
<RequireRole>
<RequireModule>
```

مثال:

```text
/app/mrp/planning/work-orders
```

ثم أضف legacy view mapping في:

```text
src/router/legacyRedirect.ts
```

---

## المرحلة 11 — Admin Employees Catalog

كل صفحة قابلة للتخصيص يجب أن تظهر في:

```text
src/pages/admin/AdminEmployeesPage.tsx
```

حتى يستطيع admin منح/منع صفحات لموظفي الشركة.

لا تنس:

- `portalLabel`.
- `moduleKey`.
- قائمة pages.

---

## المرحلة 12 — Hybrid Portal Catalog

أضف الصفحات إلى:

```text
src/pages/hybridportal/hybridPagesCatalog.ts
```

حتى تعمل في الاشتراكات/البوابة الهجينة.

تأكد أن:

```text
id
label
path
module
roles
group
```

كلها صحيحة.

---

## المرحلة 13 — Developer Portal / Tenant Modules

أي بوابة جديدة يجب أن تكون قابلة للتفعيل من بوابة المطور.

راجع:

```text
src/services/sdk/TenantModuleCatalog.ts
```

أضف:

- `ModuleKey`.
- `MODULE_CATALOG` item.
- `PLAN_ALLOWED_MODULES`.
- `PLAN_LIMITS` إن لزم.

ثم تأكد أن:

```text
src/router/moduleMap.ts
```

يربط المسار بالموديل.

---

## المرحلة 14 — Tests

لكل وحدة أو بوابة أضف contract test.

مثال:

```text
src/test/mrp/mrpQualityContract.test.ts
src/test/inventory/inventoryReceivingContract.test.ts
```

يجب أن يتحقق من:

- وجود التوثيق.
- وجود checklist.
- وجود migration objects.
- وجود RPCs.
- عدم وجود `p_tenant_id`.
- وجود SDK exports.
- وجود routes/sidebar/hybrid/admin إن لزم.

---

## المرحلة 15 — Post Migration Checks

أضف checks في:

```text
scripts/tests/99_post_migration_checks.sql
```

حتى يكشف Supabase Runtime غياب الجداول أو الدوال.

مثال:

```sql
IF to_regclass('public.mrp_work_orders') IS NULL
   OR to_regprocedure('public.create_mrp_work_order(uuid,numeric,uuid,uuid,text,timestamp with time zone,uuid)') IS NULL THEN
  RAISE EXCEPTION 'FAILED: MRP planning unit missing';
END IF;
```

---

## المرحلة 16 — الفحوصات قبل التسليم

شغل:

```bash
npm run type-check
npm run db:contract-check
npm run db:procurement-sql-check
npm run test:run
npm run build
npm run lint
```

إذا كان التعديل صغيراً، شغل على الأقل:

```bash
npm run type-check
npm run test:run -- <relevant-test>
npm run build
```

لكن قبل تسليم بوابة كاملة، يجب تشغيل الكل.

---

## المرحلة 17 — Runtime Validation

بعد تطبيق migrations:

```bash
npx supabase db push
```

يجب اختبار Runtime:

- فتح الصفحة.
- تشغيل كل زر.
- اختيار Lookups.
- التأكد أن RLS لا يمنع ما يجب أن يعمل.
- التأكد أن RLS يمنع ما يجب أن يُمنع.
- التأكد من عدم وجود أخطاء أعمدة.
- اختبار بيانات حقيقية.

---

## 18) منهجية تعديل بوابة قائمة

عند تعديل بوابة موجودة:

1. اقرأ توثيقها الحالي.
2. افحص صفحاتها الحالية.
3. افحص SDK وRPCs.
4. لا تكسر المسارات القديمة.
5. لا تحذف جداول أو أعمدة إلا بهجرة آمنة جداً.
6. إن أضفت زر جديد، أضف RPC إن كانت العملية حساسة.
7. إن أضفت صفحة، أضفها في router/sidebar/admin/hybrid.
8. حدث الاختبار.
9. شغل الفحوصات.
10. اكتب تقرير صادق بما تم وما بقي.

---

## 19) نمط إكمال UX بعد البناء التقني

بعد بناء بوابة كاملة تقنياً، يجب عمل pass خاص باسم:

```text
UX + Buttons + Lookups + Record Tools Completion
```

يهدف إلى:

- إضافة أزرار ناقصة.
- إزالة UUID اليدوي.
- إضافة Lookups.
- إضافة close/cancel/archive مع سبب.
- إضافة status updates.
- إضافة activity/audit views.
- تحسين بطاقات التنقل.

هذا ما حدث في Inventory ثم MRP. لا تعتبر البوابة مكتملة للموظفين قبل هذه المرحلة.

---

## 20) الأخطاء التي يجب تجنبها

### خطأ 1: صفحة بلا زر

إذا الصفحة تشغيلية وليست تقريراً، يجب أن تحتوي أزرار العمل.

### خطأ 2: UUID يدوي

استبدله بـ Lookup.

### خطأ 3: Hard Delete

استبدله بـ archive/cancel/close مع سبب.

### خطأ 4: تجاهل Developer Portal

أي بوابة لا تظهر في control plane ليست بوابة منصة كاملة.

### خطأ 5: الاعتماد على type-check فقط

Runtime قد يكشف أخطاء لا تراها TypeScript، مثل اختلاف اسم عمود في DB.

---

## 21) مبدأ التقارير النهائية

عند الانتهاء من أي عمل، التقرير يجب أن يذكر:

- الملفات التي أُضيفت.
- الملفات التي عُدلت.
- migrations الجديدة.
- RPCs الجديدة.
- الصفحات الجديدة/المعدلة.
- الفحوصات التي شُغّلت ونتائجها.
- ما لم يتم اختباره Runtime.
- أي اعتماد مستقبلي.

لا تكتب فقط:

```text
تم الانتهاء
```

بل اكتب تقريراً يمكن للمالك أو مطور آخر الاعتماد عليه.

---

## 22) الخلاصة

منهجية Kyvzon لا تقبل الحلول السطحية.  
كل بوابة يجب أن تكون:

```text
موثقة
معمارية
آمنة
tenant-scoped
مرتبطة بالمنصة
سهلة الاستخدام
قابلة للتدقيق
مختبرة
قابلة للتوسع
```

أي ذكاء اصطناعي يعمل على المشروع يجب أن يتصرف كمهندس منصة Senior، لا كمولّد صفحات.
