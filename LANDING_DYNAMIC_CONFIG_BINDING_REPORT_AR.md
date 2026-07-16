# تقرير ربط صفحة الهبوط بإعدادات بوابة المطور فعليًا

تاريخ التنفيذ: 2026-07-16

## الهدف

بعد إعادة كتابة صفحة إدارة صفحة الزوار، كان من الضروري ألا تبقى الإعدادات محفوظة فقط في قاعدة البيانات، بل يجب أن تؤثر فعليًا على صفحة الهبوط العامة.

تم تنفيذ هذا الربط في هذه المرحلة.

---

## ما تم ربطه فعليًا

### 1. إعدادات صفحة الهبوط الأساسية

صفحة الهبوط الآن تقوم بتحميل:

```text
settingsService.findLandingConfig()
```

وتستخدمها في:

- الشعار.
- لون الهوية.
- عنوان Hero.
- وصف Hero.
- معلومات التواصل.
- إظهار/إخفاء البوابات.
- الفوتر.

الملف المعدل:

```text
src/pages/public/LandingPage.tsx
```

---

### 2. إعدادات الموقع العام

صفحة الهبوط الآن تقوم بتحميل:

```text
publicSiteConfigService.getConfig()
```

وتستخدمها في:

- CTA الأساسي.
- رابط CTA الأساسي.
- بريد الدعم.
- هاتف الدعم.
- عناوين روابط الفوتر.

---

## الملفات التي تم تعديلها

```text
src/pages/public/LandingPage.tsx
src/pages/public/landing/sections/Header.tsx
src/pages/public/landing/sections/Hero.tsx
src/pages/public/landing/sections/Portals.tsx
src/pages/public/landing/sections/CTABanner.tsx
src/pages/public/landing/sections/Contact.tsx
src/pages/public/landing/sections/Footer.tsx
```

---

## التأثير العملي

الآن عندما تقوم من بوابة المطور بتعديل:

```text
إدارة صفحة الزوار
```

مثل:

- اللون الرئيسي.
- اسم الشعار.
- عنوان Hero.
- وصف Hero.
- CTA.
- إظهار/إخفاء بوابة.

فإن هذه التغييرات تُقرأ في صفحة الهبوط العامة.

وكذلك عند تعديل:

```text
الموقع العام
```

مثل:

- بريد الدعم.
- هاتف الدعم.
- أسماء صفحات الفوتر.
- CTA الأساسي.

فإنها تؤثر على الموقع العام.

---

## ملاحظات مهمة

1. لا تزال بعض النصوص التفصيلية للخطط والخدمات والبوابات تأتي من `data.ts` و `i18n.ts`، وهذا مقبول كمرحلة حالية.
2. تم ربط العناصر الأكثر أهمية إداريًا:
   - الهوية.
   - Hero.
   - CTA.
   - التواصل.
   - ظهور البوابات.
   - الفوتر.
3. يمكن لاحقًا جعل كل تفاصيل الخطط والخدمات Dynamic بالكامل من قاعدة البيانات إذا رغبت.

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
