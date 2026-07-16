# تقرير نقل إدارة الخطط والخدمات والبوابات إلى بوابة المطور

تاريخ التنفيذ: 2026-07-16

## الهدف

تحويل الخطط والخدمات والبوابات في صفحة الهبوط من بيانات ثابتة داخل `data.ts` إلى بيانات قابلة للإدارة من بوابة المطور، مع إبقاء `data.ts` كـ fallback آمن عند عدم وجود إعدادات محفوظة.

---

## ما تم تنفيذه

### 1. توسيع إعدادات الموقع العام

تم تعديل:

```text
src/services/sdk/PublicSiteConfigService.ts
```

وإضافة أنواع ديناميكية:

```ts
PublicPlanConfig
PublicServiceConfig
PublicPortalConfig
```

وأصبحت `PublicSiteConfig` تدعم:

```ts
plans
services
portals
```

---

### 2. ربط صفحة الأسعار بالإعدادات الديناميكية

تم تعديل:

```text
src/pages/public/landing/sections/Pricing.tsx
```

الآن صفحة الأسعار تستخدم:

```ts
publicConfig.plans
```

إذا كانت موجودة، وإلا ترجع إلى:

```ts
PLANS من data.ts
```

---

### 3. ربط الخدمات بالإعدادات الديناميكية

تم تعديل:

```text
src/pages/public/landing/sections/Services.tsx
```

الآن الخدمات تستخدم:

```ts
publicConfig.services
```

وإذا لم توجد تستخدم:

```ts
EXTRA_SERVICES من data.ts
```

---

### 4. ربط البوابات بالإعدادات الديناميكية

تم تعديل:

```text
src/pages/public/landing/sections/Portals.tsx
src/pages/public/portals/PublicPortalsPage.tsx
src/pages/public/portals/PublicPortalDetailPage.tsx
```

الآن:

- قسم البوابات في صفحة الهبوط.
- صفحة `/portals`.
- صفحة `/portals/:portalId`.

تقرأ من:

```ts
publicConfig.portals
```

إذا كانت موجودة، وإلا تستخدم:

```ts
PORTALS من data.ts
```

---

### 5. إضافة محررات داخل صفحة إدارة صفحة الزوار

تم تعديل:

```text
src/pages/admin/AdminLandingPageCMS.tsx
```

داخل قسم "الموقع العام" أضيفت إدارة:

#### الخطط

- تهيئة من البيانات الحالية.
- إضافة خطة.
- تعديل اسم الخطة عربي/إنجليزي.
- تعديل وصف الخطة.
- إظهار/إخفاء الخطة.
- حذف الخطة.

#### الخدمات

- تهيئة من البيانات الحالية.
- إضافة خدمة.
- تعديل اسم الخدمة عربي/إنجليزي.
- تعديل اللون.
- تعديل الوصف.
- إظهار/إخفاء الخدمة.
- حذف الخدمة.

#### البوابات

- تهيئة من البيانات الحالية.
- إضافة بوابة.
- تعديل ID البوابة.
- تعديل الاسم.
- تعديل اللون.
- تعديل الوصف.
- إظهار/إخفاء البوابة.
- حذف البوابة.

---

## آلية الأمان والفallback

إذا لم يتم حفظ خطط أو خدمات أو بوابات في بوابة المطور، فإن صفحة الهبوط لا تتعطل ولا تظهر فارغة، بل تستخدم البيانات الثابتة القديمة من:

```text
src/pages/public/landing/data.ts
```

وهذا يحمي الصفحة من أي إعداد ناقص.

---

## الملفات المعدلة

```text
src/services/sdk/PublicSiteConfigService.ts
src/pages/public/LandingPage.tsx
src/pages/public/landing/sections/Pricing.tsx
src/pages/public/landing/sections/Services.tsx
src/pages/public/landing/sections/Portals.tsx
src/pages/public/portals/PublicPortalsPage.tsx
src/pages/public/portals/PublicPortalDetailPage.tsx
src/pages/admin/AdminLandingPageCMS.tsx
```

---

## أين يتم الحفظ؟

تحفظ البيانات داخل:

```text
system_settings.general_settings.public_site_config
```

ولا يوجد migration جديد لأننا نستخدم JSON داخل `general_settings`.

---

## التحقق الفني

تم تشغيل:

```bash
npm run type-check
npm run check:all
npm audit --audit-level=moderate
```

النتيجة:

```text
TypeScript type-check: PASS
SDK Boundary Check: PASS
DB Contract Check: PASS
Tests: 251 passed
Test Files: 16 passed
Production Build: PASS
npm audit: 0 vulnerabilities
```

تحذير غير حرج أثناء البناء:

```text
INEFFECTIVE_DYNAMIC_IMPORT
```

وهو تحذير bundling فقط ولا يمنع البناء.

---

## النتيجة

أصبحت بوابة المطور قادرة على إدارة:

- الخطط التسويقية المعروضة في صفحة الهبوط.
- الخدمات الإضافية.
- البوابات العامة ومستكشف البوابات.

بدل الاعتماد الكامل على `data.ts`.
