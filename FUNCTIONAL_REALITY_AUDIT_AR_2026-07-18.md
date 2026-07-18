# تقرير تدقيق «الوظائف الظاهرية» — Kyvzon

**التاريخ:** 18 يوليو 2026  
**الفرع المدقَّق:** `remediation/p0-security-and-build-health`  
**نسخة العمل:** `/home/user/Kyvzon`  
**نوع المراجعة:** تدقيق ساكن للكود + مراجعة تدفقات الواجهة/SDK/RLS + تشغيل بوابة الجودة.  

> **تعريف «وظيفة ظاهرية»:** شاشة أو زر أو مؤشر يعلن تنفيذ عملية أو عرض بيانات، ولكن الكود لا يستدعي خدمة حقيقية، أو يعرض قيماً ثابتة/محاكاة، أو لا يكتب إلى المصدر التشغيلي الذي يعتمد عليه التطبيق.

---

## 1. الحكم التنفيذي

**النتيجة: توجد وظائف حقيقية كثيرة في نظام HR الأساسي، لكن لا يجوز وصف المشروع كاملاً بأنه جاهز إنتاجياً أو أن كل البوابات «متكاملة».**

تم العثور على مجموعة مؤكدة من الشاشات الوظيفية شكلياً، أهمها **بوابة المالية**، إضافة إلى مؤشرات صحة/إعدادات المطور، وإدارة SOPs، وبعض مسارات الأجهزة والصور. كما كشف التدقيق السابق عن خلل فعلي في إنشاء مستخدم الشركة، وخلل RLS/مزامنة في Control Plane؛ تم إصلاحهما محلياً، لكن لا يصبح الإصلاح فعالاً في الإنتاج قبل تطبيق migrations ونشر الواجهة/Edge Functions.

### التصنيف الإجمالي

| المستوى | العدد المؤكد | الحكم |
|---|---:|---|
| P0 — معلنة كوظائف مالية/تشغيلية لكنها لا تتصل ببيانات حقيقية | 17+ صفحة مالية | لا تُعرض للعملاء كمنتج مالي جاهز |
| P1 — عمليات تكتب محلياً أو تعلن نجاحاً غير مثبت | 6 تدفقات/صفحات | يجب إصلاحها قبل الاعتماد التشغيلي |
| P2 — مؤشرات/إعدادات أو بيانات تجريبية مضللة | 5+ مواضع | يجب تسميتها/ربطها بمصدر حقيقي |
| تحذيرات معمارية تحتاج تحققاً حياً | 4 مسارات | لا يمكن إثباتها دون Supabase/PostgreSQL/Edge Functions |

---

## 2. منهجية التحقق

تم تنفيذ ما يأتي:

1. فحص يدوي لمسارات الواجهة، SDK، migrations، RLS وEdge Functions.
2. مسح `src` لأنماط: `setTimeout`, `mock`, `localStorage`, `TODO`, رسائل “سيتم عرضها من SDK”، والبيانات الصلبة.
3. تتبع العمليات من الزر إلى الخدمة ثم جدول قاعدة البيانات/وظيفة Edge.
4. تشغيل بوابة الجودة:

```text
TypeScript:          PASS
Vitest:              256 / 256 PASS
DB contract check:   PASS (54 migrations، 131 جدولاً حسب الفحص الساكن)
SDK boundary check:  PASS
Production build:    PASS
npm audit production: 0 vulnerabilities (في الفحص السابق)
```

### حدود المراجعة

لا توجد في هذه البيئة صلاحية لمشروع Supabase الحي ولا `psql`/Docker. لذلك لا أدّعي إثبات تنفيذ قاعدة البيانات الفعلي أو RLS أو Edge Functions في الإنتاج. ما ورد أدناه إما **مؤكد من الكود** أو **يتطلب Smoke Test حي** وموسوم بوضوح.

---

## 3. نتائج مؤكدة — P0

## 3.1 بوابة المالية: واجهات معلنة كمتكاملة لكنها غير موصولة

### صفحات ذات تحميل وهمي صريح

الصفحات التالية لا تستورد SDK أو خدمة بيانات. كل واحدة تنفذ `setTimeout(... setData([]) ...)` لمدة 800ms ثم تعرض “لا توجد بيانات” مع ادعاء التحميل من SDK:

1. `src/pages/app/finance/AccountsPayablePage.tsx`
2. `src/pages/app/finance/AccountsReceivablePage.tsx`
3. `src/pages/app/finance/BudgetPage.tsx`
4. `src/pages/app/finance/CashManagementPage.tsx`
5. `src/pages/app/finance/ChartOfAccountsPage.tsx`
6. `src/pages/app/finance/FinancialReportsPage.tsx`
7. `src/pages/app/finance/TaxManagementPage.tsx`

**الأثر:** البحث وزر “إضافة جديد” لا يؤديان إلى CRUD فعلي؛ المستخدم يرى حالة فارغة مصطنعة، لا حالة بيانات حقيقية.

### صفحات عرض فقط تدّعي اتصالاً غير موجود

هذه الصفحات لا تحتوي `useEffect` ولا SDK ولا CRUD، رغم نصوص مثل “مكتملة معمارياً” و“متصلة بـ SDK Service عبر useEffect”:

1. `AdvancedVariancePage.tsx`
2. `BankStatementImportPage.tsx`
3. `CashForecastPage.tsx`
4. `FixedAssetsPage.tsx`
5. `IntercompanyPage.tsx`
6. `MultiEntityPage.tsx`
7. `ProjectAccountingPage.tsx`

### صفحات مالية إضافية غير مكتملة

- `JournalEntriesPage.tsx`: يعرض الصف الثابت `JE-001` ولا يستدعي `generalLedgerService`; زر “إضافة قيد جديد” لا يحمل `onClick`.
- `ApprovalsPage.tsx`: يغير فلتر محلياً فقط ويطبع بوضوح أن البيانات “سيتم عرضها من SDK عند التشغيل”.
- `SystemNotesPage.tsx`: حالة عرض ثابتة، بلا خدمة أو تحميل للبيانات.
- `FinancialReportService.ts`:
  - يعيد `revenue=0`, `expenses=0`, `net=0` دائماً.
  - يمرر range filter ككائن إلى `BaseService.findAll` الذي يطبق `eq` فقط؛ لا ينفذ نطاق التاريخ المقصود.

**قرار:** لا يجب إتاحة أو تسويق بوابة المالية كـ ERP/SAP/Oracle/NetSuite أو تشغيلها لإدخال قيود مالية قبل بناء العقد الفعلي، SDK، validations، audit trail، approvals، واختبارات التكامل.

---

## 4. نتائج مؤكدة — P1

### 4.1 إدارة SOPs تعتمد localStorage وبيانات Mock

**الملف:** `src/pages/admin/AdminSOPsPage.tsx`

- عند غياب البيانات يزرع `mockSops`.
- CRUD يحفظ في `localStorage` تحت `sops_data`.
- التعليق في الكود نفسه يقول إنه fallback “for now”.

**الخطر:** ليست بيانات مشتركة بين المستخدمين أو الأجهزة، لا يوجد RLS أو سجل تدقيق أو ضمان durability، وتبدو كإدارة إجراءات مؤسسية.

**المطلوب:** ربط CRUD بجدول SOP حقيقي عبر SDK، إضافة migrations/RLS، نقل البيانات المحلية مرة واحدة إن وجدت، وإزالة seed التلقائي في الإنتاج.

### 4.2 رفع صورة الملف الشخصي محلي/مؤقت في مسار demo

**الملف:** `src/pages/employee/ProfilePage.tsx`

لمستخدم محلي (`isLocalUser`) ينشئ `URL.createObjectURL(file)` ثم يحفظه كـ `profile_image`. هذا الرابط صالح داخل جلسة المتصفح فقط ولا يصلح بعد refresh أو على جهاز آخر.

**الخطر:** نجاح ظاهري لرفع الصورة دون persistence.

**المطلوب:** في بيئة production، منع مسار demo تماماً أو تمييزه بصراحة؛ استخدم `StorageService` وURL دائم/موقّع.

### 4.3 إعدادات بوابة المطور لا تُحفظ

**الملف:** `src/pages/devportal/pages/SettingsPage.tsx`

`handleSave` ينتظر 800ms ثم يرسل toast “تم حفظ الإعدادات بنجاح” دون قراءة/كتابة لأي API أو SDK.

كما أن:
- حالة قاعدة البيانات “متصل” ثابتة.
- نسخة Postgres `v15.x` ثابتة.
- حالات RLS/Audit معروضة “مفعلة” دون فحص حي.

**المطلوب:** إما إزالة زر الحفظ وإعلانها صفحة معلومات read-only، أو إنشاء `platform_settings` محمي platform-only وربطه بـSDK/Edge Function؛ واستبدال حالة الاتصال بفحص health حقيقي.

### 4.4 Health Dashboard للمطور يخلط بين البيانات الحية والثوابت

**الملف:** `src/pages/devportal/pages/PlatformHealthPage.tsx`

توجد بيانات حية للشركات والسجل، لكن يعرض أيضاً:

```text
99 canonical tables
24 canonical migrations
SDK Boundary PASS
DB Contract PASS
246 tests
```

هذه أرقام ثابتة/قديمة ومختلفة عن الفحص الحالي (**131 جدولاً، 54 migration، 256 اختباراً**). لا يمكن أن يكون متصفح المستخدم مصدراً لفحص CI أو DB migration الحقيقي.

**المطلوب:**
- إزالة وصفها “صحة حية” لهذه البنود أو اعتماد بيانات build metadata منشورة من CI موقعة/محددة الإصدار.
- ربط health backend بـEdge Function آمن يجلب معلومات مسموحة فقط.

### 4.5 اختبار اتصال جهاز البصمة ينجح محلياً عند فشل الاتصال الحقيقي

**الملف:** `src/services/sdk/BiometricDeviceService.ts`

`testConnection()` يستدعي Edge Function أولاً. عند فشلها، يقوم fallback بتحديث `last_sync_at` ويرجع `ok: true` ورسالة “تم تسجيل اختبار اتصال محلي”.

**الخطر:** قد تُقرأ النتيجة الخضراء كاتصال فعلي بجهاز ZKTeco، وهي ليست كذلك.

**المطلوب:** لا تُرجع `ok: true` إلا بعد استجابة موثقة من Agent/Edge Function؛ اجعل fallback “طلب اختبار مسجل — غير مثبت” بحالة warning منفصلة.

### 4.6 إنشاء الشركة سابقاً كان partial workflow

**الملفات:** `TenantService.ts` + سياسات RLS.

تم اكتشاف وإصلاح هذا محلياً خلال هذه الجلسة:

- كان إنشاء `tenants` ثم `tenant_subscriptions` معرضاً للفشل بسبب RLS cross-tenant للمطور.
- كان اختيار بوابات الشركة يكتب في `enabled_modules` ولا يضمن تهيئة `tenant_modules`، وهو المصدر الذي يعتمد عليه guard.

**الإصلاح المحلي الحالي:**
- migration: `0125_platform_control_plane_rls.sql`.
- تهيئة ومزامنة `tenant_modules` عند إنشاء/تعديل الشركة.

**الحالة:** الإصلاح لم يصبح حياً قبل تطبيق migration والنشر. كما أن التدفق متعدد الخطوات من العميل ليس transaction ذرياً؛ يوصى لاحقاً بنقله إلى Edge Function/RPC ذرية لتفادي شركة ناقصة إن فشل جزء لاحق.

---

## 5. نتائج مؤكدة — P2 / تضليل المنتج

### 5.1 AI config اختبار محاكى

**الملف:** `src/pages/admin/AIConfigPage.tsx`

يتضمن تأخير `setTimeout` لمدة ثانيتين في مسار الاختبار. يجب مراجعة هل زر الاختبار يستدعي `ai-chat` فعلياً؛ لا يكفي تأخير ورسالة نجاح كمؤشر provider health.

### 5.2 Tenant Context يحمل تعليق TODO وسلوك URL حساس

**الملف:** `src/core/tenant/TenantContext.tsx`

- التعليقات ما زالت تصف resolver بأنه مؤقت وTODO.
- يستنتج slug من أول path segment أو subdomain ثم يكتب `tenant_id` إلى localStorage.

هناك query حقيقي لـSupabase حالياً، لذلك ليس mock بحد ذاته، لكن يجب عدم اعتبار localStorage مصدراً موثوقاً للأمان. RLS هي الحد الفعلي. يلزم اختبار domains/subdomains ومسارات التطبيق كي لا يُفسر `/app` كـtenant slug في حالات معينة.

### 5.3 بيانات demo للمستخدم المحلي

- `src/data/dev/mockData.ts`
- `ProfilePage`, `SurveyPage` ومسارات `isLocalUser`

هذه مقبولة للتطوير إذا كانت محصورة تماماً في DEV. يجب منعها من الظهور في production أو تمييز حسابات demo بصرياً وبشكل غير قابل للخلط ببيانات العمل.

### 5.4 Engineering Console ليس منفذ فحوصات

**الملف:** `src/pages/devportal/pages/EngineeringConsolePage.tsx`

يعرض أوامر، قائمة migrations، ومصفوفة بوابات ثابتة. هو Runbook/واجهة توثيق وليس console ينفذ CI أو يفحص DB. تسميته “وحدة تحكم هندسية” قد توحي بقدرة لا يملكها.

### 5.5 النصوص التسويقية غير المطابقة للتنفيذ المالي

عدة صفحات مالية تصرح بمطابقة SAP/Oracle/NetSuite أو اتصال SDK مع عدم وجود imports/logic. هذه مشكلة ثقة ومنتج، وليس فقط مشكلة تقنية.

---

## 6. ما يبدو حقيقياً لكن يحتاج اختباراً حياً

هذه المسارات تملك ربطاً برمجياً، لكن لا يمكن اعتمادها من القراءة فقط:

| المسار | الربط المرصود | ما يجب إثباته حياً |
|---|---|---|
| إضافة مستخدم شركة | `admin-create-user` Edge Function | deploy secrets، role/tenant، إدراج profile + employee، rollback |
| إنشاء/تعديل شركة | `TenantService` + `tenant_modules` | تطبيق migration 0125، RLS للمطور، اختبار create/update/plan sync |
| تفعيل بوابات tenant | `tenantModuleService.setModuleEnabled` | إيقاف صفحة ثم منع URL المباشر وعودة الإتاحة عند التشغيل |
| AI chat | Edge Function `ai-chat` | secrets provider، timeout، rate limit، no secret leakage |
| أجهزة البصمة والمزامنة | Edge Functions/Agent | اتصال جهاز فعلي، HMAC/nonce، حالة failure صحيحة |
| Tawathul | services خاصة ووظائف realtime | RLS للمحادثات، attachments، cross-tenant isolation |

---

## 7. ثغرات في الاختبارات الحالية

رغم نجاح 256 اختباراً، لا توجد تغطية كافية للمناطق الأكثر عرضة للوظائف الشكلية:

1. لا يوجد اختبار browser/E2E ينشئ شركة ثم يتحقق من subscription و`tenant_modules` والحارس.
2. لا يوجد اختبار Edge integration لـ `admin-create-user` ضد Supabase/Postgres حقيقي.
3. لا يوجد اختبار وظائف مالي حقيقي؛ والعديد من الصفحات لا يمكن اختبارها وظيفياً لأنها لا تحتوي منطقاً أصلاً.
4. coverage موجه إلى قائمة ملفات محددة؛ لا يمثل تغطية التطبيق كاملاً.
5. لا يوجد اختبار اتصال/فشل حقيقي لـZKTeco Agent.
6. لا يوجد contract test يحظر `setTimeout` المحاكي أو `localStorage` في صفحات production الحساسة.

---

## 8. خطة علاج مرتبة

### مرحلة A — حجب التضليل فوراً

1. اخفِ بوابة المالية غير المكتملة خلف feature flag `finance_beta` أو أزل روابطها من واجهة العميل.
2. استبدل عبارات “متصلة بـSDK” و“مكتملة” في الصفحات غير الموصولة بعبارة صريحة “قيد التطوير”.
3. اجعل `BiometricDeviceService.testConnection` يعيد `warning/false` عند عدم وجود اختبار فعلي.
4. اجعل Settings وEngineering Console صفحات read-only صريحة لحين بناء backend لها.

### مرحلة B — إصلاح الأعمال الحرجة

1. نفّذ صفحات المالية واحدة واحدة من data contract إلى UI:
   - Chart of Accounts
   - Journal entries + balanced lines + post/reversal
   - AP/AR
   - Cash/Bank
   - Budget/Tax
   - financial approvals/reports
2. نقل SOPs بالكامل من localStorage إلى Supabase + RLS + audit.
3. نقل إنشاء الشركة متعدد الخطوات إلى Edge Function أو RPC ذرية.
4. تطبيق `0124` و`0125` على staging ثم production بعد مراجعة DB.

### مرحلة C — منع الرجوع للمشكلة

1. أضف علامة صريحة لكل feature: `implemented | beta | planned | demo` في catalog مركزي.
2. أضف CI check يفشل عند وجود `setTimeout(...setData([]))` أو نص “متصلة بـSDK” داخل صفحات لا تستورد خدمة معتمدة.
3. أضف Playwright E2E للسيناريوهات الأساسية لكل بوابة.
4. اجعل developer health مبنياً على artifact من CI وbackend health endpoint، لا ثوابت في React.

---

## 9. قائمة Smoke Tests إلزامية قبل الإنتاج

### بوابة المطور

```text
[ ] developer ينشئ شركة جديدة
[ ] يوجد tenant + subscription + tenant_modules
[ ] تغيير الخطة يحدّث modules
[ ] إيقاف finance يمنع /app/finance لمستخدم tenant
[ ] إعادة التفعيل تعيد الوصول
[ ] admin شركة عادي لا يستطيع قراءة/تعديل شركات أخرى
```

### بوابة الإدارة

```text
[ ] admin الشركة ينشئ مستخدماً بقسم من شركته
[ ] كلمة المرور 8+ أحرف
[ ] لا يمكن تمرير department UUID لشركة أخرى
[ ] المستخدم الجديد يظهر في profiles وemployees
```

### الأمان والتشغيل

```text
[ ] bash scripts/tests/run_clean_db_test.sh
[ ] RLS tenant A لا يرى tenant B
[ ] Edge Functions deployed مع secrets الصحيحة
[ ] npm run check:all
[ ] npm run test:coverage
```

---

## القرار النهائي

**بوابة HR الأساسية تمتلك الكثير من ربط SDK حقيقي، لكن المشروع يحتوي على عدد مهم من واجهات العرض/المحاكاة، لا سيما المالية والمطور والإعدادات.**

لا يجب إطلاق/تسويق هذه الأجزاء كوظائف إنتاجية قبل تنفيذ خطة العلاج. يوصى بالبدء بمرحلة A فوراً لتفادي وعد المستخدم بوظيفة لا تعمل، ثم معالجة workflows الحرجة وE2E/RLS في مرحلة B وC.
