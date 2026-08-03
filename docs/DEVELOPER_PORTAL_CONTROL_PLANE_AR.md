# بوابة المطورين في Kyvzon — Control Plane إدارة الشركات والمنصة

> هذا التوثيق يشرح الدور الحقيقي لبوابة المطورين في Kyvzon.  
> أي ذكاء اصطناعي أو مطور يجب أن يفهم أن بوابة المطور ليست بوابة تشغيل يومية لشركة واحدة، بل هي مركز التحكم بالمنصة والشركات والاشتراكات والبوابات.

---

## 1) التعريف المختصر

بوابة المطورين هي:

```text
Kyvzon Platform Control Plane
```

وليست مجرد صفحة Developer. منها تُدار الشركات المستفيدة من النظام، وتُدار البوابات التي تملكها كل شركة، وتُراقب صحة المنصة.

المسار:

```text
/dev
```

الأدوار المسموحة:

```text
developer
it_admin
```

الملف الرئيسي:

```text
src/pages/devportal/KyvzonDevPortal.tsx
```

صفحاتها:

```text
src/pages/devportal/pages/DashboardPage.tsx
src/pages/devportal/pages/CompaniesPage.tsx
src/pages/devportal/pages/SubscriptionsPage.tsx
src/pages/devportal/pages/ModulesPage.tsx
src/pages/devportal/pages/PublicSiteManagerPage.tsx
src/pages/devportal/pages/PlatformHealthPage.tsx
src/pages/devportal/pages/EngineeringConsolePage.tsx
src/pages/devportal/pages/AuditLogPage.tsx
src/pages/devportal/pages/SettingsPage.tsx
src/pages/devportal/pages/VisitorLeadsPage.tsx
```

---

## 2) الفرق بين Control Plane وTenant Portal

### Control Plane

هي طبقة المنصة المركزية. يديرها فريق Kyvzon أو مسؤولو النظام. تتحكم في:

- الشركات.
- الاشتراكات.
- الوحدات المفعلة.
- صحة المنصة.
- إعدادات الموقع العام.
- إعدادات هندسية وتشخيصية.

### Tenant Portal

هي بوابة شركة معينة. يستخدمها موظفو شركة واحدة فقط، مثل:

- HR.
- Inventory.
- MRP.
- Finance.
- Procurement.

ولا يجب أن تستطيع شركة رؤية بيانات شركة أخرى.

---

## 3) مسؤوليات بوابة المطورين

## 3.1 إدارة الشركات Tenants / Companies

صفحة:

```text
CompaniesPage
```

المسؤوليات:

- إنشاء شركة جديدة.
- عرض الشركات.
- تحديث بيانات الشركة.
- عرض تفاصيل شركة.
- إدارة الحالة العامة للشركة.
- ربط الشركة بخطة أو اشتراك.
- فتح إدارة البوابات/الوحدات للشركة.

أي شركة داخل Kyvzon يجب أن تكون معزولة بـ:

```text
tenant_id
```

ولا يوجد تشغيل حقيقي لأي بوابة بدون Tenant.

---

## 3.2 إدارة الاشتراكات Subscriptions

صفحة:

```text
SubscriptionsPage
```

المسؤوليات:

- إنشاء اشتراك للشركة.
- ربط الاشتراك بخطة.
- احتساب القيمة.
- تحديد البوابات/features المسموحة.
- تتبع حالة الاشتراك.

الاشتراك ليس مجرد فاتورة، بل يحدد ما الذي تراه الشركة من وحدات.

---

## 3.3 إدارة البوابات/الوحدات Modules

صفحة:

```text
ModulesPage
```

المسؤوليات:

- تفعيل بوابة لشركة.
- تعطيل بوابة لشركة.
- عرض كتالوج البوابات.
- ربط التفعيل بخطة الاشتراك.
- تسجيل audit للتفعيل/التعطيل.

الكتالوج الرئيسي موجود في:

```text
src/services/sdk/TenantModuleCatalog.ts
```

وفيه:

```text
ModuleKey
MODULE_CATALOG
PLAN_ALLOWED_MODULES
PLAN_LIMITS
```

إذا أضفت بوابة جديدة ولم تضفها هنا، فلن تكون جزءاً حقيقياً من المنصة.

---

## 3.4 إدارة الموقع العام Public Site

صفحة:

```text
PublicSiteManagerPage
```

المسؤوليات:

- إدارة محتوى Landing/Public Site.
- الخطط والخدمات المعروضة.
- البوابات المعروضة للزوار.
- محتوى التسويق العام.

لا تخلط بين الموقع العام وبين بوابات الشركات الداخلية.

---

## 3.5 صحة المنصة Platform Health

صفحة:

```text
PlatformHealthPage
```

المسؤوليات:

- مراقبة صحة المنصة.
- كشف أخطاء runtime أو integrations.
- عرض مؤشرات هندسية.
- مساعدة فريق التطوير في التشخيص.

---

## 3.6 Engineering Console

صفحة:

```text
EngineeringConsolePage
```

المسؤوليات:

- أدوات تشخيصية وهندسية.
- عمليات خاصة بالمطورين.
- لا يجب أن تُتاح لموظفي الشركات.

---

## 3.7 Audit Log

صفحة:

```text
AuditLogPage
```

المسؤوليات:

- عرض أحداث المنصة.
- تتبع عمليات حساسة.
- مراجعة تغييرات الشركات والوحدات والاشتراكات.

---

## 4) العلاقة بين Developer Portal وTenant Modules

أي بوابة جديدة لا تُعتبر جاهزة حتى تُضاف إلى:

```text
src/services/sdk/TenantModuleCatalog.ts
```

ثم تُربط بالمسارات في:

```text
src/router/moduleMap.ts
```

ثم تُعرض في كتالوج الصفحات الهجين:

```text
src/pages/hybridportal/hybridPagesCatalog.ts
```

ثم تظهر في Admin Employees permissions catalog:

```text
src/pages/admin/AdminEmployeesPage.tsx
```

ثم تكون قابلة للتفعيل/التعطيل من بوابة المطور.

---

## 5) Developer Portal ليست بديلاً عن Admin Portal

يوجد فرق:

| البوابة | من يستخدمها | ماذا تدير |
|---|---|---|
| Developer Portal | Kyvzon / platform admins | الشركات، الاشتراكات، تفعيل البوابات، صحة المنصة |
| Admin Portal | مسؤول داخل شركة معينة | موظفي شركته، صلاحيات شركته، إعدادات شركته |

Admin لا يدير كل الشركات. Developer يدير المنصة.

---

## 6) قاعدة تفعيل بوابة لشركة

لتفعيل بوابة جديدة لشركة يجب توفر كل التالي:

1. Module موجود في `TenantModuleCatalog.ts`.
2. الخطة تسمح به أو تم تخصيصه.
3. `tenant_modules` يحتوي التفعيل.
4. Route مربوط بـ `RequireModule`.
5. Sidebar يحترم module enabled.
6. Hybrid catalog يحتوي صفحات البوابة إن كانت ضمن الاشتراك الهجين.
7. المستخدم لديه role أو allowed_pages مناسبة.

إذا نقص واحد من هذه، قد تظهر الصفحة للمطور محلياً لكنها لن تعمل كشكل SaaS صحيح.

---

## 7) الأدوار المنصّية Platform Roles

الأدوار التالية ليست أدوار تشغيل عادية داخل شركة:

```text
developer
it_admin
```

تملك صلاحيات أعلى للمنصة، لكن يجب الحذر:

- لا تُستخدم كحل لتجاوز RLS في بوابات الشركات.
- لا تمنحها لموظفي عميل عادي.
- لا تربط منطق العمليات اليومية بها.
- استخدمها فقط لإدارة المنصة والصيانة والتشخيص.

---

## 8) أين تُضاف البوابة الجديدة؟

عند إضافة بوابة مثل `manufacturing` أو `inventory` أو `crm`:

### في الكتالوج

```text
src/services/sdk/TenantModuleCatalog.ts
```

### في الموديل ماب

```text
src/router/moduleMap.ts
```

### في الراوتر

```text
src/router/AppRouter.tsx
```

### في الشريط الجانبي

```text
src/shared/components/dashboard/Sidebar.tsx
```

### في Admin Employees

```text
src/pages/admin/AdminEmployeesPage.tsx
```

### في Hybrid Catalog

```text
src/pages/hybridportal/hybridPagesCatalog.ts
```

### في Edge Auth إن كان هناك Role جديد

```text
supabase/functions/_shared/adminAuth.ts
supabase/functions/admin-create-user/index.ts
```

---

## 9) ماذا يجب أن يرى الذكاء الاصطناعي عند تعديل بوابة المطور؟

أي تعديل في بوابة المطور يجب أن يحافظ على:

- عدم كسر إدارة الشركات.
- عدم كسر تفعيل الوحدات.
- عدم خلط tenant data.
- عدم إظهار أدوات منصة لموظف عادي.
- عدم جعل subscription مجرد واجهة؛ يجب أن يؤثر على module availability.
- عدم تجاهل audit.

---

## 10) معايير القبول لبوابة المطور

لا نقول إن تعديل بوابة المطور مكتمل إلا إذا:

- يعمل `/dev` للـ developer/it_admin فقط.
- تظهر الشركات.
- يمكن فتح تفاصيل الشركة.
- يمكن إدارة الوحدات/البوابات.
- يمكن إدارة الاشتراك أو على الأقل لا ينكسر عرضه.
- التفعيل ينعكس على `RequireModule` في بوابات الشركات.
- لا توجد بيانات شركة تظهر لشركة أخرى.
- الفحوصات تمر.

---

## 11) تحذيرات مهمة

### لا تضف بوابة في Sidebar فقط

هذا خطأ. البوابة يجب أن تكون في:

- Module catalog.
- Router.
- Sidebar.
- Admin permissions.
- Hybrid catalog.
- Tests.
- RLS/DB إن لها بيانات.

### لا تجعل Developer Portal يعتمد على بيانات وهمية دائمة

إن وجدت mock data مؤقتة يجب توثيقها كدين تقني أو استبدالها بـ SDK/RPC حقيقي.

### لا تخلط حالة الاشتراك بحالة المستخدم

الشركة قد تكون مفعلة لبوابة، لكن المستخدم لا يملك صفحة. والعكس أيضاً ممكن. كلاهما يجب أن يُحترم.

---

## 12) الخلاصة

بوابة المطورين هي قلب إدارة منصة Kyvzon.  
أي بوابة جديدة لا تصبح جزءاً حقيقياً من المنصة حتى تستطيع بوابة المطور إدارتها وتفعيلها للشركات.

أي ذكاء اصطناعي يعمل على المشروع يجب أن يتعامل معها كـ:

```text
Platform Control Plane
```

وليس كصفحة ثانوية.
