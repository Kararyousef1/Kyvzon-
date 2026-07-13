# سجل تنفيذ تحسينات P0 — Kyvzon Platform

**الفرع:** `remediation/p0-security-and-build-health`

**سياق التشغيل:** المستودع للتطوير فقط، وSupabase الحالي فارغ ولم يتم تنفيذ استعلامات بيانات production.

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

## المرحلة التالية المنفذة — العزل والحسابات الإدارية

### 8. حماية tenant من مصدر الخادم

تمت إضافة `database/migrations/103_secure_tenant_isolation.sql`، وتشمل:

- `current_user_tenant_id()` مشتقة من `auth.uid()` و`profiles.tenant_id`.
- `current_user_role()` و`current_user_is_staff()`.
- `current_user_employee_id()` لتقييد سجلات الموظف نفسه.
- تحديث `set_session_context()` ليعيد القيم الموثوقة دون اعتبار localStorage مصدراً للصلاحية.
- سياسات profiles للتصفح داخل tenant والتحديث الذاتي فقط.
- سياسات staff-write للجداول الأساسية.
- سياسات خاصة للحضور والطلبات والإجازات بحيث يرى الموظف سجلاته، ويرى staff نطاق الشركة.
- عدم الاعتماد على `current_setting('app.current_tenant_id')` كمصدر ثقة.

تم تحديث `database/migrations/EXECUTION_GUIDE.md` لإضافة migration 103 بعد اكتمال schema.

> لم يتم تشغيل هذا SQL على قاعدة Supabase حقيقية من هذه البيئة؛ يجب تنفيذه على staging فارغة أولاً ثم إجراء اختبارات JWT cross-tenant قبل الإنتاج.

### 9. تحسين إنشاء المستخدمين إدارياً

تمت إعادة بناء `supabase/functions/admin-create-user/index.ts` بحيث:

- يرفض العمل إذا لم يتم ضبط `APP_ORIGIN` أو secrets المطلوبة.
- يتحقق من هوية وصلاحية المستدعي على الخادم.
- يمنع الأدوار غير المسموحة والتحقق من البريد وكلمة المرور والاسم.
- يربط المستخدم بالشركة المستخرجة من profile المستدعي، لا من payload العميل.
- يستخدم `employee_code` و`first_name` و`last_name` المتوافقة مع schema المعتمد.
- ينفذ rollback لمستخدم Auth عند فشل profile أو employee.
- لا يعيد تفاصيل أخطاء Supabase الداخلية للمتصفح.

### نتائج التحقق بعد المرحلة التالية

- `npm run type-check`: **PASS**.
- `npm run test:run`: **PASS — 163/163**.
- `npm run build`: **PASS**.
- `npm audit --omit=optional`: **0 vulnerabilities**.

## المرحلة الثالثة — إغلاق مشاكل المنصة المتبقية في المستودع

### 10. توحيد Tawathul في مسار التنفيذ

- تم استبدال نسخة `database/migrations/300_tawathul_core.sql` المبسطة بالنسخة الكاملة التي تطابق خدمات Tawathul الحالية.
- تم تحديث `database/migrations/consolidated/007_tawathul_module.sql`.
- تمت إضافة `database/migrations/consolidated/009_tawathul_rls_and_features.sql` لضم RLS والتفاعلات والمرفقات والإشعارات.
- تم حذف مسار RLS المفتوح من `999_fix_all_missing_tables.sql`؛ لم تعد جداول HR تحصل على `USING(true)` تلقائياً.
- تمت إضافة `105_hr_modules_tenant_rls.sql` لإضافة tenant_id وRLS لوحدات HR.
- تمت إضافة `106_harden_system_settings.sql` لفصل landing العامة عن `ai_settings` والإعدادات الداخلية.
- تمت إضافة `107_employee_features_tenant_rls.sql` لعزل جداول بوابة الموظف.

### 11. منع Replay في ZKTeco

- أصبح التوقيع HMAC-SHA256 على:

```text
`${timestamp}.${nonce}.${rawBody}`
```

- الطلبات القديمة أو غير الموقعة تُرفض.
- تم وضع حد لحجم body.
- تمت إضافة `104_device_sync_nonces.sql` لتسجيل nonce ومنع إعادة الاستخدام.
- تم تقييد CORS وعدم استخدام wildcard.

### 12. استكمال وظائف الإدارة

تمت إضافة Edge Functions المفقودة التي كانت الواجهة تستدعيها:

- `admin-delete-user`
- `admin-update-role`
- `admin-reset-password`
- `admin-toggle-status`

مع helper مشترك في:

```text
supabase/functions/_shared/adminAuth.ts
```

### 13. الإعدادات والتبعيات والتغطية

- حذف عميل Supabase المكرر `src/services/supabase/client.ts`.
- حذف التبعيات المباشرة غير المستخدمة من `package.json`.
- جعل `npm run test:coverage` يعمل بنجاح ضمن نطاق core موثق.
- التغطية الحالية للنطاق المختبر: **72.8% statements / 65.8% branches / 72.56% functions / 74.12% lines**.
- إضافة coverage gate إلى GitHub Actions.

## إعادة التأسيس لبيئة التطوير الفارغة

بما أن المستودع تطويري وقاعدة Supabase فارغة، تم إنشاء مسار canonical جديد:

```text
supabase/migrations/0001_core_schema.sql
supabase/migrations/0002_employee_features.sql
supabase/migrations/0003_hr_platform_modules.sql
supabase/migrations/0004_tawathul_core.sql
supabase/migrations/0005_tawathul_rls_features.sql
supabase/migrations/0006_hr_expansion.sql
supabase/migrations/0007_support_and_security.sql
```

تم إجراء فحص parsing لـ PostgreSQL على الملفات السبعة، وكلها صالحة تركيبياً. كما تم فحص جداول `.from()` الحرفية في التطبيق والـ Edge Functions، ولم يبقَ جدول مفقود في المسار canonical.

هذا المسار هو الذي يجب استخدامه مع قاعدة التطوير الجديدة؛ أما `database/migrations/archive` وملفات الإصلاح القديمة فهي مرجع تاريخي.
