# تقرير تنفيذ المرحلة الثانية — ربط طلبات الزوار ببوابة المطور

تاريخ التنفيذ: 2026-07-16

## الهدف

إكمال ربط صفحة الهبوط الجديدة مع بوابة المطور بحيث لا تبقى طلبات التسجيل والخطط والخدمات والتقييمات محفوظة فقط في قاعدة البيانات، بل تصبح قابلة للإدارة من داخل Developer Portal.

---

## ما تم تنفيذه

### 1. إنشاء خدمة SDK لإدارة طلبات الزوار

تم إنشاء:

```text
src/services/sdk/PublicSignupAdminService.ts
```

وتصديرها من:

```text
src/services/sdk/index.ts
```

الخدمة تدعم:

- جلب طلبات الزوار من جدول:

```text
public_signup_requests
```

- تحديث حالة الطلب:

```text
new
contacted
qualified
converted
rejected
archived
```

---

### 2. إنشاء صفحة طلبات الزوار داخل بوابة المطور

تم إنشاء:

```text
src/pages/devportal/pages/VisitorLeadsPage.tsx
```

وتعرض:

- إجمالي الطلبات.
- الطلبات الجديدة.
- عدد التقييمات.
- الطلبات التي تم تحويلها.
- جدول تفصيلي لكل زائر.
- البحث بالاسم/البريد/الشركة/الخطة/الخدمة.
- عرض الخطة أو الخدمة المطلوبة.
- عرض بيانات الدولة والمحافظة.
- عرض التقييم ونص التقييم.
- تغيير حالة الطلب مباشرة من الصفحة.

---

### 3. ربط الصفحة ببوابة المطور

تم تعديل:

```text
src/pages/devportal/KyvzonDevPortal.tsx
src/pages/devportal/components/Layout.tsx
src/pages/devportal/types/index.ts
```

وأضيف عنصر جديد في القائمة الجانبية:

```text
طلبات الزوار
```

ضمن بوابة المطور.

---

## الملفات المضافة/المعدلة

```text
src/services/sdk/PublicSignupAdminService.ts
src/services/sdk/index.ts
src/pages/devportal/pages/VisitorLeadsPage.tsx
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

## ملاحظات تشغيلية

حتى تعمل صفحة طلبات الزوار على Supabase الحقيقي يجب تطبيق migration السابق:

```text
supabase/migrations/0027_public_signup_requests.sql
```

بالأمر:

```powershell
npx supabase db push
```

ويجب أن يكون مستخدم بوابة المطور دوره:

```text
developer
```

أو:

```text
it_admin
```

حتى تسمح RLS بقراءة وتحديث طلبات الزوار.
