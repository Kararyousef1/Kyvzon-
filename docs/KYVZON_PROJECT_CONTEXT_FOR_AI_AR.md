# Kyvzon — السياق الكامل للمشروع لأي ذكاء اصطناعي

> اقرأ هذا الملف مع:
>
> - `docs/AI_HANDOFF_README_AR.md`
> - `docs/DEVELOPER_PORTAL_CONTROL_PLANE_AR.md`
> - `docs/PORTAL_ENGINEERING_METHODOLOGY_AR.md`
>
> الهدف: إعطاء أي ذكاء اصطناعي صورة دقيقة عن بنية المشروع، البوابات، أسلوب التطوير، ومستوى الجودة المطلوب.

---

## 1) هوية المشروع

Kyvzon منصة SaaS متعددة الشركات لإدارة الموارد والعمليات.  
ليست مجرد HR system رغم أن جذورها كانت HR. أصبحت منصة بوابات مؤسسية تشمل:

- HR.
- Employee self-service.
- Finance.
- Procurement.
- Inventory/WMS.
- MRP/Manufacturing.
- CRM.
- Marketing.
- Technical portal.
- Developer Control Plane.
- Hybrid portal/subscription-based pages.

كل شركة داخل النظام هي Tenant مع عزل بيانات صارم.

---

## 2) الطبقات المعمارية الأساسية

## 2.1 Frontend

المسارات والصفحات في:

```text
src/pages/
src/router/
src/shared/
src/core/
```

الراوتر الرئيسي:

```text
src/router/AppRouter.tsx
```

الشريط الجانبي:

```text
src/shared/components/dashboard/Sidebar.tsx
```

حراس الوصول:

```text
src/router/guards/RequireAuth.tsx
src/router/guards/RequireRole.tsx
src/router/guards/RequireModule.tsx
src/router/guards/RequirePage.tsx
```

---

## 2.2 SDK Layer

أي تعامل من الواجهة مع قاعدة البيانات يجب أن يكون عبر:

```text
src/services/sdk/
```

الخدمة الأساسية:

```text
src/services/sdk/BaseService.ts
```

تصدير الخدمات:

```text
src/services/sdk/index.ts
```

قاعدة مهمة:

```text
لا تكرر منطق قاعدة البيانات داخل الصفحات.
لا تضع عمليات حساسة في الواجهة مباشرة.
```

---

## 2.3 Database / Supabase

الهجرات في:

```text
supabase/migrations/
```

النمط الأساسي:

- جداول tenant-scoped.
- RLS.
- RPCs.
- Views.
- Post migration checks.

---

## 2.4 Edge Functions

الدوال في:

```text
supabase/functions/
```

بعض العمليات الإدارية الحساسة مثل إنشاء المستخدم أو تغيير الدور يجب أن تتم عبر Edge Functions، وليس من الواجهة مباشرة.

---

## 3) النظام متعدد الشركات Multi-Tenant

كل شركة لها:

```text
tenant_id
```

كل جدول تشغيلي تقريباً يجب أن يحتوي tenant_id.  
كل قراءة/كتابة يجب أن تُحصر بـ:

```sql
tenant_id = public.current_user_tenant_id()
```

لا تثق أبداً بـ tenant_id يأتي من المستخدم أو الواجهة.

---

## 4) بوابة المطورين هي مركز التحكم

بوابة المطورين:

```text
/dev
```

هي التي تدير:

- الشركات.
- الاشتراكات.
- تفعيل البوابات.
- صحة المنصة.
- إعدادات الموقع العام.

ملفاتها:

```text
src/pages/devportal/
```

أي بوابة جديدة يجب أن تظهر كـ Module قابل للتفعيل من هناك.  
إذا أضفت بوابة ولم تربطها ببوابة المطور، فهي ناقصة كجزء من منصة SaaS.

---

## 5) حالة البوابات الرئيسية

## 5.1 بوابة المخزون Inventory/WMS

تم بناؤها بمنهجية صارمة وشملت:

```text
00 Foundation
01 Receiving & Inbound
02 Storage & Slotting
03 Picking & Fulfillment
04 Shipping & Outbound
05 Cycle Counting
06 Returns
07 Labor
08 Analytics
```

وتعلمنا منها معايير UX المهمة:

- Sidebar للوحدات الرئيسية فقط.
- UnitNav داخل الوحدة.
- Lookups بدل UUID.
- Record tools.
- Numbering/Barcode.
- Audit/Activity.
- لا hard delete.

---

## 5.2 بوابة التصنيع MRP

تم بناؤها من 00 إلى 10:

```text
00 Foundation
01 BOM / Engineering Change
02 Forecasting / MPS
03 Production Planning / Work Orders
04 Manufacturing Inventory / WIP
05 Procurement Integration
06 Quality Management
07 Shop Floor / MES
08 Maintenance / CMMS
09 Manufacturing Costing
10 Manufacturing Analytics
```

ثم تمت مرحلة UX/Buttons من migrations:

```text
0229 إلى 0239
```

لتغطية:

- أزرار ناقصة.
- Lookups.
- status changes.
- cancel/hold/close/archive مع سبب.
- Activity/Audit.

---

## 6) منهجية البوابات الكبيرة

للبوابات الكبيرة مثل Inventory وMRP:

### Sidebar

يعرض فقط الوحدات الرئيسية:

```text
Inventory Dashboard
Foundation
Receiving
Storage
...
```

أو:

```text
MRP Dashboard
Foundation
BOM
Forecasting
MPS
Planning
...
```

### داخل الوحدة

تظهر الخطوات كبطاقات صغيرة بأسهم:

```text
InventoryUnitNav
MrpUnitNav
```

لا تجعل Sidebar يحتوي 100 صفحة فرعية.

---

## 7) نمط بناء وحدة داخل بوابة

كل وحدة يجب أن تحتوي غالباً:

```text
1. official doc
2. technical checklist
3. migration
4. RLS
5. RPCs
6. views
7. SDK service
8. pages
9. routes
10. legacy redirect mapping
11. sidebar/hybrid/admin catalog
12. tests
13. post-migration checks
```

---

## 8) معنى “جاهز” في Kyvzon

هناك مستويات جاهزية:

### Local Complete

يعني:

- الكود مكتوب.
- type-check يمر.
- build يمر.
- tests تمر.

### DB Applied

يعني:

- migrations طُبقت على Supabase.
- PostgREST schema reload تم.

### Runtime Validated

يعني:

- فتحت الصفحات في المتصفح.
- شغلت الأزرار.
- أنشأت بيانات حقيقية.
- اختبرت RLS.
- عالجت أخطاء الأعمدة/العلاقات.

### Production Ready

يعني فوق ما سبق:

- تم اختبار تدفقات كاملة.
- تم اختبار مستخدمين بأدوار مختلفة.
- تم اختبار حجم بيانات مقبول.
- تم توثيق التشغيل.
- تم توثيق أي اعتماد خارجي.

لا تخلط بين هذه المستويات.

---

## 9) طريقة كتابة التقارير للمستخدم

المستخدم يتوقع دقة وصدقاً. لا تكتب:

```text
كل شيء تمام
```

إلا إذا كان فعلاً تم فحصه. اكتب دائماً:

- ماذا أضفت؟
- أين؟
- ما الملفات؟
- ما الفحوصات؟
- هل runtime تم أم لا؟
- ما المتبقي؟

مثال جيد:

```text
أضفت migration 0237، وعدلت SDK، وعدلت صفحة Maintenance، وشغلت type-check/db checks/test/build. لم أطبق migration على Supabase.
```

---

## 10) مبادئ UX لا تُكسر

- الموظف لا ينسخ UUID.
- كل قائمة اختيار تبحث بالكود/الاسم/status.
- كل سجل حساس لا يُحذف مباشرة.
- كل إلغاء أو إغلاق أو أرشفة يحتاج سبب.
- كل تغيير مهم يجب أن يظهر في audit/activity.
- كل صفحة تشغيلية يجب أن تحتوي أزرار العمل.
- كل وحدة كبيرة يجب أن تحتوي بطاقات خطوات داخلية.

---

## 11) مبادئ التكامل بين البوابات

### التصنيع MRP يتكامل مع:

- Inventory: المواد، المخزون، WIP، Finished Goods.
- Procurement: توصيات شراء وPR/PO/GR.
- Quality: inspections/NCR/CAPA/SPC/quarantine.
- Maintenance: breakdowns/PM/CMMS.
- Finance: costing/posting drafts.
- HR/Labor: العمالة والورديات.
- CRM/Sales: الطلبات والتنبؤ.

### المخزون يتكامل مع:

- Procurement.
- Sales/Shipping.
- Returns.
- Manufacturing.
- Finance.

أي بوابة يجب أن تُبنى وهي واعية بالبوابات التي تحتاجها.

---

## 12) الأمن والصلاحيات

### لا تعتمد فقط على الواجهة

حتى لو أخفيت زر من الواجهة، يجب أن تمنع العملية في DB/RLS/RPC.

### الأدوار

الأدوار موجودة في:

```text
src/shared/types/index.ts
```

لكن هناك قوائم يدوية يجب تحديثها عند إضافة دور:

```text
src/utils/userUtils.ts
src/pages/admin/AdminEmployeesPage.tsx
supabase/functions/_shared/adminAuth.ts
supabase/functions/admin-create-user/index.ts
```

راجع:

```text
docs/HOW_TO_ADD_A_PORTAL.md
```

---

## 13) ملاحظات حول Supabase Runtime

أخطاء شائعة لا تظهر محلياً:

- اسم عمود غير صحيح.
- View يعتمد على view قديم تغيرت أعمدته.
- RPC signature غير مطابق.
- RLS يمنع insert/update.
- enum/check constraint لا يقبل قيمة من الواجهة.
- `CREATE TABLE IF NOT EXISTS` يخفي اختلاف schema.

لذلك Runtime validation إلزامي.

---

## 14) خريطة ملفات مهمة

```text
src/router/AppRouter.tsx                         # كل المسارات
src/router/legacyRedirect.ts                     # view ids القديمة إلى paths
src/router/moduleMap.ts                          # path → module
src/router/constants.ts                          # default path per role
src/shared/components/dashboard/Sidebar.tsx      # Sidebar
src/pages/admin/AdminEmployeesPage.tsx           # أدوار/صفحات الموظفين
src/pages/hybridportal/hybridPagesCatalog.ts     # صفحات الاشتراك الهجين
src/services/sdk/TenantModuleCatalog.ts          # كتالوج بوابات الشركات
src/services/sdk/index.ts                        # تصدير SDK
scripts/tests/99_post_migration_checks.sql       # فحص DB بعد migrations
```

---

## 15) ماذا تفعل قبل أي تعديل؟

```bash
git status --short
git branch --show-current
git log --oneline -5
```

ثم اقرأ التوثيق المتعلق بالمهمة.  
لا تبدأ بالتعديل قبل فهم المجال.

---

## 16) ماذا تفعل بعد أي تعديل؟

- حدّث التوثيق إن تغير السلوك.
- حدّث الاختبار.
- شغل الفحوصات.
- اكتب تقريراً دقيقاً.
- لا تعمل push أو db push إلا إذا طلب المستخدم.

---

## 17) الرسالة لأي ذكاء اصطناعي جديد

أنت لا تعمل على مشروع واجهات فقط.  
أنت تعمل على منصة ERP/SaaS متعددة الشركات.  
كل بوابة يجب أن تكون جزءاً من منظومة:

```text
Developer Portal → Tenant Module → Role/Page Permission → Router → Sidebar → SDK → DB/RLS/RPC → Runtime Validation
```

إذا أهملت حلقة من هذه السلسلة، فالعمل ناقص.
