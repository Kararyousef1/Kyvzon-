# تقرير إضافة تسجيل العملاء بالـ OTP من صفحة الهبوط — KYVZON

تاريخ التنفيذ: 2026-07-16

## المطلوب

عند ضغط المستخدم على:

- خطة من صفحة الأسعار.
- خدمة من صفحة الخدمات.
- إضافة تقييم للشركة.

يتم طلب إنشاء حساب عبر البريد الإلكتروني، ثم إرسال OTP، وبعد التحقق يتم طلب:

- الاسم الكامل.
- كلمة المرور.
- رقم الهاتف.
- الدولة.
- المحافظة.
- اسم الشركة اختياريًا.
- التقييم ونص التقييم إذا كان الطلب من زر إضافة تقييم.

## ما تم تنفيذه

### 1. إضافة جدول طلبات تسجيل عامة

تم إنشاء migration:

```text
supabase/migrations/0027_public_signup_requests.sql
```

ويضيف جدول:

```text
public_signup_requests
```

الحقول الأساسية:

```text
user_id
email
full_name
phone
country
governorate
intent_type
selected_plan
selected_service
rating
review_text
company_name
status
source
metadata
created_at
updated_at
```

مع RLS:

- المستخدم المصادق يمكنه إدخال طلبه فقط.
- المستخدم يمكنه قراءة طلباته فقط.
- مالك المنصة يمكنه قراءة/تحديث الطلبات.

---

### 2. إضافة دوال OTP في AuthService

تم تعديل:

```text
src/services/sdk/AuthService.ts
```

وإضافة:

```ts
sendEmailOtp(email)
verifyEmailOtp(email, token)
completePublicAccount(...)
```

المسار يستخدم Supabase Auth:

- إرسال OTP للبريد.
- التحقق من الرمز.
- تعيين كلمة المرور و metadata للمستخدم.

---

### 3. إضافة خدمة حفظ طلب العميل

تم إنشاء:

```text
src/services/sdk/PublicSignupService.ts
```

وتصديرها من:

```text
src/services/sdk/index.ts
```

وهي تحفظ الطلب بعد تحقق OTP في جدول:

```text
public_signup_requests
```

---

### 4. إضافة Modal التسجيل في صفحة الهبوط

تم إنشاء:

```text
src/pages/public/landing/SignupIntentModal.tsx
```

الـ Modal يعمل على 4 خطوات:

1. إدخال البريد الإلكتروني.
2. إدخال OTP.
3. إدخال تفاصيل الحساب.
4. رسالة نجاح.

---

### 5. ربط الخطط والخدمات والتقييم

تم تعديل:

```text
src/pages/public/LandingPage.tsx
src/pages/public/landing/sections/Pricing.tsx
src/pages/public/landing/sections/Services.tsx
src/pages/public/landing/sections/Testimonials.tsx
src/pages/public/landing/types.ts
src/pages/public/landing/styles.css
```

الآن:

- الضغط على خطة يفتح التسجيل بنية `plan`.
- الضغط على خدمة يفتح التسجيل بنية `service`.
- الضغط على "أضف تقييمك" يفتح التسجيل بنية `review` مع حقول التقييم.

---

## ملاحظات مهمة للتشغيل الحقيقي

يجب تطبيق migration الجديد على Supabase:

```powershell
npx supabase db push
```

كما يجب أن تكون إعدادات OTP/Auth مفعلة في Supabase Dashboard:

```text
Authentication → Providers → Email
```

ويجب التأكد من إعداد SMTP أو خدمة إرسال البريد حتى يصل OTP فعليًا.

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

## الملفات المضافة/المعدلة

```text
supabase/migrations/0027_public_signup_requests.sql
src/services/sdk/AuthService.ts
src/services/sdk/PublicSignupService.ts
src/services/sdk/index.ts
src/pages/public/LandingPage.tsx
src/pages/public/landing/SignupIntentModal.tsx
src/pages/public/landing/sections/Pricing.tsx
src/pages/public/landing/sections/Services.tsx
src/pages/public/landing/sections/Testimonials.tsx
src/pages/public/landing/types.ts
src/pages/public/landing/styles.css
```
