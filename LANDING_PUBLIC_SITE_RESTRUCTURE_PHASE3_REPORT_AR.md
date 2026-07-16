# تقرير تنفيذ المرحلة الثالثة — إدارة الموقع العام من بوابة المطور

تاريخ التنفيذ: 2026-07-16

## الهدف

إكمال تطوير بوابة المطور لتشمل إدارة صفحات الموقع العام الجديدة مثل:

- من نحن
- الوظائف
- المدونة
- الدعم الفني
- حالة النظام
- سياسة الخصوصية
- شروط الاستخدام
- الأمان
- تواصل معنا

بالإضافة إلى إعدادات عامة لتدفق التسجيل وCTA ومستكشف البوابات.

---

## ما تم تنفيذه

### 1. إنشاء خدمة إعدادات الموقع العام

تم إنشاء:

```text
src/services/sdk/PublicSiteConfigService.ts
```

وتدعم:

- جلب إعدادات الموقع العام.
- حفظ إعدادات الموقع العام.
- إعدادات افتراضية لكل صفحات الفوتر.

الإعدادات تحفظ داخل:

```text
system_settings.general_settings.public_site_config
```

وهذا يعني أنه لا نحتاج migration جديد لهذه المرحلة.

---

### 2. جعل صفحات الفوتر العامة تقرأ من إعدادات بوابة المطور

تم تعديل:

```text
src/pages/public/static/PublicInfoPage.tsx
```

والآن الصفحة تحاول قراءة محتواها من:

```text
PublicSiteConfigService
```

وإذا لم توجد إعدادات محفوظة، تستخدم المحتوى الافتراضي.

---

### 3. إنشاء صفحة إدارة الموقع العام داخل بوابة المطور

تم إنشاء:

```text
src/pages/devportal/pages/PublicSiteManagerPage.tsx
```

وتحتوي على:

#### إعدادات عامة

- تفعيل صفحة التسجيل.
- تفعيل مستكشف البوابات.
- إخفاء بوابة المطور عن الزوار.
- رابط CTA الأساسي.
- نص CTA الأساسي.
- بريد الدعم.
- هاتف الدعم.

#### إدارة صفحات الموقع

يمكن تحرير محتوى الصفحات التالية:

```text
/about
/careers
/blog
/support
/status
/privacy
/terms
/security
/contact
```

لكل صفحة يمكن تعديل:

- العنوان.
- الوصف.
- النقاط المختصرة.
- نص زر الصفحة.
- رابط زر الصفحة.
- إظهار أو إخفاء الصفحة.
- معاينة الصفحة.

---

### 4. ربط صفحة إدارة الموقع العام داخل بوابة المطور

تم تعديل:

```text
src/pages/devportal/KyvzonDevPortal.tsx
src/pages/devportal/components/Layout.tsx
src/pages/devportal/types/index.ts
```

وأضيف عنصر جديد في القائمة الجانبية باسم:

```text
الموقع العام
```

---

## الملفات المضافة/المعدلة

```text
src/services/sdk/PublicSiteConfigService.ts
src/services/sdk/index.ts
src/pages/public/static/PublicInfoPage.tsx
src/pages/devportal/pages/PublicSiteManagerPage.tsx
src/pages/devportal/KyvzonDevPortal.tsx
src/pages/devportal/components/Layout.tsx
src/pages/devportal/types/index.ts
```

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

## ملاحظات مهمة

1. لا يوجد migration جديد في هذه المرحلة، لأن الإعدادات تحفظ داخل `system_settings.general_settings`.
2. يجب أن تكون migrations السابقة مطبقة، خصوصًا:

```text
0027_public_signup_requests.sql
```

حتى تعمل صفحة طلبات الزوار.
3. صفحة الموقع العام الجديدة لا تلغي صفحة `صفحة الزوار` القديمة، بل تكملها:
   - صفحة الزوار القديمة: إدارة الهوية/المحتوى/المنتجات/الميديا القديمة.
   - الموقع العام: إدارة صفحات الفوتر وCTA وتدفق التسجيل العام.

---

## الحالة النهائية بعد هذه المرحلة

بوابة المطور أصبحت تحتوي الآن على أدوات لإدارة:

- الشركات.
- الاشتراكات.
- البوابات المفعلة.
- صحة المنصة.
- صفحة الزوار.
- طلبات الزوار.
- الموقع العام وصفحات الفوتر.

وهذا يجعلها أقرب إلى SaaS Control Plane متكامل.
