# سجل تنفيذ تحسينات P0 — Kyvzon Platform

**الفرع:** `remediation/p0-security-and-build-health`

**التاريخ:** 13 يوليو 2026

## ما تم تنفيذه

### 1. إزالة الأسرار من working tree

- حذف `.env` و`.env.local` المتتبعين من المستودع.
- إعادة بناء `.env.example` ليحتوي على إعدادات frontend العامة فقط.
- إزالة `VITE_SUPABASE_SERVICE_KEY` من تعريفات frontend.
- إخفاء قيمة مفتاح AI التي كانت مكتوبة داخل `SECRETS_ROTATION_REPORT.md`.
- إضافة `coverage/` إلى `.gitignore`.

> ما زال تنظيف **تاريخ Git** وتدوير مفاتيح Supabase/AI مسؤولية تشغيلية يجب تنفيذها على GitHub وSupabase Dashboard. حذف الملفات من working tree لا يلغي الأسرار الموجودة في commits السابقة.

### 2. منع تسريب مفاتيح AI إلى المتصفح

- إضافة `src/services/ai/edgeAiService.ts` لاستدعاء Edge Function مصادق عليها.
- إضافة `supabase/functions/ai-chat/index.ts`.
- نقل اختيار مزود الذكاء الاصطناعي ومفاتيحه إلى Deno secrets:
  - `OPENROUTER_API_KEY`
  - `GROQ_API_KEY`
- تحويل المحادثة، تحليل المشكلة، وتوليد/تحليل الاختبارات إلى مسار Edge Function.
- إضافة تحقق من المستخدم، حد الرسائل، حد طول المحتوى، والنماذج المسموحة.
- عدم إرجاع أخطاء مزود AI التفصيلية للمتصفح.

**مطلوب قبل التشغيل:** ضبط أسرار Edge Function ونشر `ai-chat`، ثم اختبارها في staging.

### 3. إيقاف اعتماد الإنتاج على PIN داخل المتصفح

- PIN في `devPinService` أصبح للتطوير المحلي فقط.
- `isDevSessionActive()` و`checkDevPin()` يرفضان جلسات PIN في الإنتاج.
- إزالة عرض حالة `VITE_DEV_PIN` من واجهات الإعدادات.
- تحديث التعليقات لتوضيح أن `localStorage` ليس authorization.

**المتبقي:** تنفيذ تحقق developer خادمي يعتمد على Supabase role/RLS أو Edge Function.

### 4. إصلاح صحة TypeScript

- إصلاح استيراد `useState` في لوحة HR.
- جعل `KPICard` يستخدم `LucideIcon` الصحيح.
- إصلاح `MovementAnalysisPage` ليتوافق مع exports الفعلية لـ `Card`.

النتيجة الحالية: `npm run type-check` **PASS**.

### 5. إصلاح منطق الحضور والاختبارات

- اعتماد `Asia/Baghdad` كمنطقة حساب حضور ثابتة بدلاً من timezone الجهاز/CI.
- إصلاح تصنيف الجمعة والعطلة حتى مع وجود بصمة.
- عدم اختلاق `check_out` عند وجود بصمة دخول واحدة فقط.
- إصلاح حساب الورديات العابرة لمنتصف الليل.
- تصحيح اختبارات fixtures التي كانت تستخدم أوقاتاً غير صالحة أو يوم الجمعة بصورة خاطئة.
- إصلاح Supabase mock في `manager-flow.test.ts`.

النتيجة الحالية: **163/163 اختباراً ناجحاً**.

### 6. تحديث أدوات البناء والأمان

تم تحديث الأدوات إلى إصدارات متوافقة مع Node 20:

- Vite 8.1.4.
- Vitest 4.1.10.
- `@vitest/ui` 4.1.10.
- `@vitest/coverage-v8` 4.1.10.
- `@vitejs/plugin-react` 6.0.3.

كما تم تحويل `manualChunks` إلى دالة متوافقة مع Rolldown/Vite 8.

النتائج:

- `npm run build`: **PASS**.
- `npm audit --omit=optional`: **0 vulnerabilities**.
- تحسن build إلى نحو 4.87–6.61 ثانية في التحقق الأخير.
- أكبر chunk للرسوميات انخفض من نحو 566 KB إلى نحو 447 KB.

### 7. إصلاح PWA offline assets

تمت إضافة:

- `public/offline.html`.
- `public/icon.svg`.

وهما مطلوبان فعلياً في `public/sw.js` ضمن قائمة precache.

## نتائج التحقق الأخيرة

| الأمر | النتيجة |
|---|---|
| `npm ci --no-audit --no-fund` | PASS |
| `npm run type-check` | PASS |
| `npm run test:run` | PASS — 163/163 |
| `npm run build` | PASS |
| `npm audit --omit=optional` | PASS — 0 vulnerabilities |
| `npm run test:coverage` | يعمل ويقيس، لكنه يفشل threshold الحالي: Lines 59.15% مقابل 70% |

فشل coverage الحالي **متوقع ومتعمد عدم إخفائه**؛ تم إصلاح أداة التغطية نفسها، لكن تغطية المشروع لا تزال أقل من العتبة المحددة.

## البنود التي لم تُغلق بعد

1. تدوير أسرار Supabase/AI وتطهير Git history.
2. نشر واختبار Edge Function `ai-chat` في staging.
3. إصلاح `zkteco-sync` بالكامل: CORS مقيد، HMAC/timestamp، rate limiting، وidempotency.
4. توحيد migrations ومطابقة schema Tawathul مع الكود.
5. إصلاح tenant context وRLS على قاعدة staging فعلية.
6. مواءمة `admin-create-user` و`TenantService` مع schema معتمد.
7. رفع coverage تدريجياً إلى 70% دون استثناءات مضللة.
8. إضافة CI/CD إلزامي يمنع دمج كود يفشل type-check/tests/audit.
