# تقرير تنفيذ المرحلة الأولى — إعادة هيكلة موقع KYVZON العام

تاريخ التنفيذ: 2026-07-16

## ما تم تنفيذه

### 1. إزالة بوابة مطوري Kyvzon من صفحة الهبوط

تم حذف ظهور بوابة المطور من بيانات صفحة الهبوط العامة لأن بوابة المطور خاصة بفريق Kyvzon وليست بوابة للعملاء.

الملف:

```text
src/pages/public/landing/data.ts
```

ملاحظة: لم يتم حذف بوابة المطور من النظام أو من `/dev`، فقط أزيل ظهورها من صفحة الزوار.

---

### 2. إنشاء صفحة تسجيل مستقلة بدل الـ Modal

تم إنشاء صفحة مستقلة:

```text
/signup
```

الملف:

```text
src/pages/public/signup/SignupPage.tsx
```

وتدعم الروابط:

```text
/signup?intent=demo
/signup?intent=plan&plan=basic
/signup?intent=plan&plan=professional
/signup?intent=service&service=...
/signup?intent=review
```

وتعمل بالخطوات:

1. إدخال البريد الإلكتروني.
2. إرسال OTP.
3. إدخال OTP.
4. إكمال البيانات:
   - الاسم الكامل.
   - كلمة المرور.
   - رقم الهاتف.
   - الدولة.
   - المحافظة.
   - اسم الشركة.
5. حفظ الطلب في `public_signup_requests`.

---

### 3. إنشاء بروفايل عام للزائر / العميل

تم إنشاء صفحة:

```text
/account
```

الملف:

```text
src/pages/public/account/PublicAccountPage.tsx
```

وتعرض:

- الاسم.
- البريد.
- الهاتف.
- الدولة.
- المحافظة.
- حالة توثيق البريد.
- زر إضافة تقييم أو طلب جديد.
- زر طلب حذف الحساب.
- زر تسجيل الخروج.

مهم: هذا الحساب ليس بوابة موظف وليس Tenant Portal. هو حساب زائر / عميل محتمل.

---

### 4. إنشاء صفحة استكشاف البوابات

تم إنشاء:

```text
/portals
```

الملف:

```text
src/pages/public/portals/PublicPortalsPage.tsx
```

تعرض كل البوابات العامة بعد إزالة بوابة المطور.

---

### 5. إنشاء صفحة تفاصيل لكل بوابة

تم إنشاء:

```text
/portals/:portalId
```

الملف:

```text
src/pages/public/portals/PublicPortalDetailPage.tsx
```

وتعرض:

- اسم البوابة.
- وصف تفصيلي.
- مميزات البوابة.
- مساحة صور/لقطات توضيحية.
- زر طلب هذه البوابة.
- زر ابدأ مجانًا.

---

### 6. إنشاء صفحات عامة لروابط الفوتر

تم إنشاء صفحة عامة متعددة الاستخدام:

```text
src/pages/public/static/PublicInfoPage.tsx
```

وتم ربط المسارات:

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

---

### 7. تحديث أزرار صفحة الهبوط

تم تعديل الأزرار التالية:

#### Hero

زر:

```text
ابدأ مجانًا
```

أصبح يذهب إلى:

```text
/signup?intent=demo
```

#### Pricing

كل خطة تذهب إلى:

```text
/signup?intent=plan&plan=...
```

#### Services

كل خدمة تذهب إلى:

```text
/signup?intent=service&service=...
```

#### Testimonials

زر إضافة التقييم يذهب إلى:

```text
/signup?intent=review
```

#### Portals

زر استكشاف البوابة يذهب إلى:

```text
/portals/:portalId
```

#### Footer

روابط الفوتر أصبحت تفتح صفحات حقيقية بدل `#`.

---

### 8. تحديث الراوتر

تم تعديل:

```text
src/router/AppRouter.tsx
```

وإضافة المسارات العامة الجديدة.

---

## الملفات المعدلة/المضافة

```text
src/pages/public/landing/data.ts
src/pages/public/landing/sections/Hero.tsx
src/pages/public/landing/sections/CTABanner.tsx
src/pages/public/landing/sections/FAQSection.tsx
src/pages/public/landing/sections/Pricing.tsx
src/pages/public/landing/sections/Services.tsx
src/pages/public/landing/sections/Testimonials.tsx
src/pages/public/landing/sections/Portals.tsx
src/pages/public/landing/sections/Footer.tsx
src/pages/public/LandingPage.tsx
src/pages/public/signup/SignupPage.tsx
src/pages/public/account/PublicAccountPage.tsx
src/pages/public/portals/PublicPortalsPage.tsx
src/pages/public/portals/PublicPortalDetailPage.tsx
src/pages/public/static/PublicInfoPage.tsx
src/services/sdk/AuthService.ts
src/router/AppRouter.tsx
```

كما يعتمد هذا العمل على migration السابق:

```text
supabase/migrations/0027_public_signup_requests.sql
```

---

## ملاحظة بخصوص صفحة الزوار في بوابة المطور

لم يتم تنفيذ التحديث العميق لصفحة إدارة الزوار داخل بوابة المطور في هذه المرحلة، لأن المرحلة الحالية ركزت على البنية العامة والمسارات والتدفق الصحيح للزائر. تحديث CMS يحتاج مرحلة ثانية منظمة لإضافة:

- إدارة صفحات الفوتر.
- إدارة البوابات العامة وصورها.
- إدارة طلبات التسجيل من `public_signup_requests`.
- إدارة التقييمات واعتمادها.
- إدارة CTA وروابطها.

وهذه ستكون المرحلة التالية المقترحة حتى لا نخلط تعديل CMS الكبير مع إعادة هيكلة الموقع العام في نفس الخطوة.

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

تفاصيل DB contract:

```text
Canonical migrations: 28
Literal table references: 36
Canonical tables: 101
Canonical views: 2
DB contract check: PASS
```

ملاحظة build غير حرجة:

```text
INEFFECTIVE_DYNAMIC_IMPORT
```

وهي تحذير تحسين bundling وليس خطأ.

---

## المطلوب على Supabase الحقيقي

يجب تطبيق migrations حتى تعمل صفحة التسجيل وحفظ الطلبات:

```powershell
npx supabase db push
```

وتفعيل إعدادات Email OTP/SMTP من Supabase Dashboard.
