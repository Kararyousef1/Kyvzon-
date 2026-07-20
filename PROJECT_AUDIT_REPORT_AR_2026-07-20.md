# تقرير هندسي شامل — منصة Kyvzon (Multi-tenant HR/Finance SaaS)

**الفرع المفحوص:** `remediation/p0-security-and-build-health`
**تاريخ الفحص:** 2026-07-20
**المُراجِع:** مهندس برمجيات / مراجعة معمارية وأمنية لأنظمة SaaS
**آخر Commit:** `63dc5cda — chore: commit all pending changes and new files`

---

## 0) الملخّص التنفيذي (TL;DR)

منصة **Kyvzon** هي نظام SaaS متعدد المستأجرين (Multi-tenant) للموارد البشرية + وحدة مالية (محاسبة)، مبنية على **React 18 + TypeScript + Vite 8 + Supabase (Postgres + Edge Functions)**. المشروع **ناضج هندسياً بدرجة عالية**: بوابة جودة CI كاملة، اختبارات، فحوصات حدود مخصّصة، وبنية أمنية مدروسة على مستوى Edge Functions وRLS.

**نتيجة البناء والفحوصات: كلها تمر (PASS) ✅**

| الفحص | النتيجة |
|---|---|
| تثبيت التبعيات (`npm ci`) | ✅ 296 حزمة، **0 ثغرات** |
| فحص الأنواع (`tsc --noEmit`) | ✅ **0 أخطاء** |
| الاختبارات (`vitest run`) | ✅ **256/256 اختبار** ناجح (18 ملف) |
| تغطية النواة (Coverage gate) | ✅ 72.8% (فوق العتبات) |
| البناء الإنتاجي (`vite build`) | ✅ نجح في ~3.6 ثانية |
| فحص حدود SDK | ✅ PASS |
| فحص عقد قاعدة البيانات | ✅ PASS |
| `npm audit` | ✅ 0 ثغرات |

**لكن الفحص العميق كشف مشكلتين حرجتين لا تظهران في البناء:**

1. 🔴 **P0 أمني — 19 جدولاً مالياً بدون RLS** (bank_accounts, budgets, tax, revenue, fixed_assets, subsidiaries…). في SaaS متعدد المستأجرين هذا يعني تسرّب بيانات مالية بين الشركات عبر مفتاح anon.
2. 🟠 **تسريب معلومات بنية تحتية** — مجلد `supabase/.temp/` مُتَتبَّع في Git ويكشف مُعرّف مشروع Supabase الحقيقي، بريد المالك، مُعرّف المؤسسة، وسلسلة اتصال pooler.

> **الحكم:** البناء صحّي والكود عالي الجودة، لكن **لا يُنصح بالنشر الإنتاجي قبل إغلاق فجوة RLS المالية**، لأنها ثغرة عزل مستأجرين (Tenant Isolation) خطيرة رغم نجاح كل الفحوصات الآلية.

---

## 1) نظرة عامة على المشروع

| البند | القيمة |
|---|---|
| النوع | Multi-tenant HR + Finance SaaS |
| الواجهة | React 18.3 + TypeScript 5.9 + Vite 8 + TailwindCSS 3.4 |
| إدارة الحالة | Zustand 4.5 |
| التوجيه | react-router-dom 7 |
| الرسوم | Recharts 2 |
| الخلفية | Supabase (Postgres + Auth + Storage + Edge Functions/Deno) |
| حجم الكود المصدري | **~80,000 سطر** عبر **386 ملف** (212 `.tsx`, 174 `.ts`) |
| Migrations | **77 ملف SQL** |
| Edge Functions | 9 دوال (admin CRUD، ai-chat، billing-webhook، zkteco-sync، biometric) |
| الاختبارات | 256 اختبار وحدة/تكامل + 2 اختبار E2E (Playwright) |
| CI/CD | GitHub Actions — بوابة جودة + اختبار migrations على Postgres نظيف |

### هيكل المجلدات (`src/`)
```
core/        الحالة، المستأجرون (tenant)، الثوابت
modules/     tawathul (وحدة مجالية)
pages/       admin, app, auth, developer, devportal, employee,
             gatekeeper, hr, manager, supervisor, techportal, public
portals/     بوابات المستخدمين
router/       guards + layouts (حماية المسارات حسب الدور)
services/    ai, integrations, notifications, sdk, security, supabase, utils
shared/      components/ui, hooks, types
test/        اختبارات (sdk, router, edgeFunctions)
utils/       حسابات الورديات، الإكسبورت، التقارير
```
البنية **modular ومنظّمة حسب المجال (domain-driven)** مع فصل واضح لطبقة الـ SDK.

---

## 2) نتائج البناء والاختبارات (بالتفصيل)

### 2.1 التبعيات
- `npm ci` نجح، **0 ثغرات أمنية** في شجرة التبعيات.
- lockfile موجود ومُقفَل (`package-lock.json`, 121KB) — بناء قابل للتكرار (reproducible).

### 2.2 فحص الأنواع
```
tsc --noEmit → 0 errors
```
`tsconfig` بإعداد `strict: true` + `strictNullChecks` — لكن مع تخفيفات واعية:
- `noImplicitAny: false` ⚠️ (موثّق أنه سيُفعَّل بعد مراجعة شاملة)
- `noUnusedLocals/Parameters: false`
- `strictPropertyInitialization: false`

### 2.3 الاختبارات (256/256 ✅)
تغطي المناطق الحرجة فعلياً:
- **الصلاحيات** (permissions.test — 26 اختبار)
- **حراس المسارات** (RouteGuards — 9 اختبارات)
- **أمان Edge Functions** (adminAuth 13، rateLimit 11 اختبار)
- **طبقة SDK** (BaseService 18، StorageService 12، SecurityEventService 7، Approval، GeneralLedger)
- **مدير الإشعارات، حسابات الورديات، عزل المستأجرين للوحدات**

### 2.4 التغطية (Coverage)
النسبة الكلية على النطاق المُحدَّد: **72.8% statements / 65.8% branches**، وكلها فوق العتبات (70/60/70/70). 
⚠️ **ملاحظة مهمة:** نطاق التغطية مُقيَّد عمداً بـ **7 ملفات نواة فقط** من أصل 386. هذا شفّاف وموثّق في `vitest.config.ts`، لكنه يعني أن **الغالبية العظمى من صفحات الواجهة وطبقة SDK غير مغطاة باختبارات**.

### 2.5 البناء الإنتاجي
نجح في ~3.6 ثانية، حجم `dist` = 3.5MB. أكبر الحزم:
| الحزمة | الحجم |
|---|---|
| `index.js` | 487 KB |
| `charts.js` (Recharts) | **447 KB** ⚠️ |
| `supabase.js` | 201 KB |
| `vendor.js` (React) | 133 KB |

⚠️ حزمة الرسوم البيانية ضخمة (447KB). ينبغي تحميلها كسولاً (lazy) فقط في الصفحات التحليلية.

---

## 3) 🔴 الملاحظات الحرجة (P0)

### 3.1 [P0-أمني] 19 جدولاً مالياً بدون Row-Level Security

**الوصف:** في Supabase، أي جدول في مخطط `public` **بدون RLS مُفعَّل** يكون قابلاً للقراءة/الكتابة عبر PostgREST بمفتاح `anon`/`authenticated` بغض النظر عن المستأجر. فحص كل الـ migrations أظهر أن جداول HR الأساسية (employees, payroll, leaves, attendance) **محمية بشكل صحيح** عبر حلقات DO في `0007`، لكن **19 جدولاً مالياً لا يملك RLS ولا أي سياسة**:

```
❌ bank_accounts            ❌ bank_reconciliations
❌ bank_statement_imports   ❌ bank_statement_lines
❌ budgets                  ❌ budget_lines
❌ budget_variance_reports  ❌ cash_forecast_scenarios
❌ consolidation_entries    ❌ depreciation_schedules
❌ financial_report_templates ❌ fixed_assets
❌ intercompany_transactions ❌ projects
❌ revenue_contracts        ❌ revenue_recognition_schedules
❌ subsidiaries             ❌ tax_codes
❌ tax_filing_status
```
ملف `0105_rls_policies.sql` يغطّي `chart_of_accounts`, `journal_entries`, `journal_entry_lines` فقط — وباقي الوحدة المالية (011x–014x) أُضيف لاحقاً بدون RLS مقابل.

**الأثر:** مستخدم مصادَق عليه في الشركة (أ) يمكنه — نظرياً عبر استعلام PostgREST مباشر — قراءة/تعديل الحسابات البنكية والموازنات والضرائب لشركة (ب). **خرق عزل مستأجرين على أخطر بيانات النظام.**

**التوصية (P0 — قبل أي نشر):** إضافة migration جديد يُفعّل RLS + سياسات مقيّدة بـ `tenant_id = public.current_user_tenant_id()` على الـ 19 جدولاً، بنفس نمط `0007`. مثال:
```sql
DO $$
DECLARE v_t TEXT;
  v_tables TEXT[] := ARRAY['bank_accounts','bank_reconciliations',
    'budgets','budget_lines','tax_codes','fixed_assets','revenue_contracts',
    'subsidiaries','intercompany_transactions', /* ...بقية الجداول... */];
BEGIN
  FOREACH v_t IN ARRAY v_tables LOOP
    IF to_regclass('public.'||v_t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated
      USING (tenant_id = public.current_user_tenant_id())
      WITH CHECK (tenant_id = public.current_user_tenant_id())',
      'kyvzon_'||v_t||'_tenant', v_t);
  END LOOP;
END $$;
```
> ملاحظة: يجب التأكد أولاً أن كل جدول يملك عمود `tenant_id` (وإلا يُضاف). وإضافة اختبار عزل RLS لهذه الجداول في `scripts/tests/rls_isolation_test.sql`.

**لماذا لم يلتقطها CI؟** بوابة الجودة تفحص migrations على DB نظيف وتختبر عزل RLS، لكن اختبار العزل يغطّي جداول مختارة فقط، لا الوحدة المالية كاملة.

---

### 3.2 [P0-أمني] تسريب بيانات بنية Supabase في Git

**الوصف:** مجلد `supabase/.temp/` مُتَتبَّع في المستودع (ليس في `.gitignore`) ويكشف:
```
project-ref:        ukqxxalosnmzsgothpps
linked-project:     {"ref":"ukqxxalosnmzsgothpps",
                     "name":"kararalharbauy2003gg@gmail.com's Project",
                     "organization_id":"izbkhycotndsusklawnu"}
pooler-url:         postgresql://postgres.ukqxxalosnmzsgothpps@
                    aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres
```
**الأثر:** يكشف مُعرّف المشروع الفعلي (يُبنى منه عنوان API العام)، البريد الإلكتروني للمالك (هدف تصيّد)، مُعرّف المؤسسة، ومضيف/مستخدم قاعدة البيانات. لا توجد كلمة مرور، لكنها معلومات استطلاع (recon) قيّمة لمهاجم.

**التوصية:**
1. إضافة `supabase/.temp/` إلى `.gitignore` وإزالته من التتبّع:
   `git rm -r --cached supabase/.temp && echo "supabase/.temp/" >> .gitignore`
2. لأن هذه البيانات دخلت تاريخ Git، يُفضّل تدوير (rotate) ما يمكن ومراجعة سجلات الوصول للمشروع.

---

## 4) 🟠 ملاحظات متوسطة الأهمية (P1)

### 4.1 قراءة داخل المستأجر بدون تقييد الدور (Least Privilege)
سياسات SELECT على جداول HR الأساسية في `0007` هي:
```sql
FOR SELECT TO authenticated USING (tenant_id = current_user_tenant_id())
```
أي **أي موظف** داخل الشركة يمكنه قراءة **كل** صفوف `employees` و`payroll` و`leaves` لزملائه. سياسات الكتابة مقيّدة بـ `current_user_is_staff()` (جيد)، لكن القراءة غير مقيّدة بالدور. لبيانات الرواتب تحديداً، يجب أن تكون القراءة محصورة بـ HR/manager أو "صفّي فقط" (`employee_id = current_user_employee_id()`).

### 4.2 غياب ESLint نهائياً
لا يوجد أي إعداد ESLint (`.eslintrc*` / `eslint.config.*`) في المشروع. لمشروع بـ 80 ألف سطر و15 مطوّر محتمل، هذا فجوة جودة كبيرة — لا يوجد فحص ثابت للأخطاء الشائعة (hooks deps، unused، no-floating-promises). **يُنصح بإضافة ESLint + `typescript-eslint` وربطه في CI.**

### 4.3 استخدام مفرط لـ `as any`
**226 استخدام** لـ `as any` في الكود المصدري. هذا يُبطل أمان الأنواع في نقاط حرجة (خصوصاً عند التعامل مع بيانات Supabase). مع `noImplicitAny: false` أيضاً، الأمان النوعي الفعلي أقل بكثير مما يوحي به `strict: true`. توليد أنواع Supabase (`supabase gen types`) واستخدامها سيقلّص معظمها.

### 4.4 CORS يعود إلى `*` افتراضياً
في `_shared/adminAuth.ts`، إذا لم يُضبط `APP_ORIGIN` فإن `Access-Control-Allow-Origin` يصبح `*`. يجب جعل `APP_ORIGIN` **إلزامياً** في الإنتاج (فشل صريح إن غاب) بدل التراجع إلى wildcard.

---

## 5) 🟢 نقاط القوة (ما تم عمله بشكل صحيح)

- ✅ **إزالة `supabaseAdmin` من الواجهة تماماً** — `supabaseAdmin = null`، وكل العمليات الإدارية تمرّ عبر Edge Functions (المفتاح service_role يبقى في Deno فقط). ممارسة أمنية مثالية.
- ✅ **مصادقة مركزية للـ Edge Functions**: `requireAdmin()` يفحص JWT + الدور + المستأجر، و`targetInCallerTenant()` يمنع التلاعب عبر المستأجرين، مع **Rate Limiting** واختبارات له.
- ✅ **33 دالة SECURITY DEFINER كلها بـ `SET search_path = public`** — حماية من هجمات اختطاف search_path.
- ✅ **RLS متين على وحدة HR** — عزل مستأجرين حقيقي مع سياسات تفصيلية للموظف (self-access على الحضور).
- ✅ **CI/CD ناضج جداً**: typecheck + tests + coverage gate + audit + build + **اختبار migrations على Postgres 17 نظيف + اختبار عزل RLS**.
- ✅ **فحوصات حدود مخصّصة**: `check-sdk-boundary` (يمنع تجاوز طبقة SDK) و`check-db-contract` (يطابق مراجع الجداول مع المخطط النهائي).
- ✅ **0 ثغرات تبعيات، lockfile مُقفَل، حماية ضد رفع ملفات `.env`** في CI.
- ✅ **لا `@ts-ignore` / `@ts-nocheck`** إطلاقاً، ولا secrets مكتوبة في الكود.
- ✅ **`.env.example` تعليمي ممتاز** يشرح أن service-role لا يوضع أبداً في `VITE_*`.

---

## 6) 🔵 ملاحظات منخفضة الأهمية (P2 / تنظيف)

| # | الملاحظة |
|---|---|
| 1 | ملف يتيم `src/services/supabase/client.ts` ينشئ عميل Supabase ثانياً لكن **لا يُستورد من أي مكان** — dead code، يُحذف. |
| 2 | **210 `console.*`** في كود الإنتاج (خارج الاختبارات) — يُفضّل logger موحّد يُعطَّل في الإنتاج. |
| 3 | حزمة `charts` (447KB) — تفعيل lazy-loading للصفحات التحليلية فقط. |
| 4 | **~40 ملف تقرير Markdown** في الجذر (فوضى وثائقية) — ينبغي نقلها إلى `docs/`. |
| 5 | تبعيات متأخرة: `@supabase/supabase-js` (2.106→2.109)، React 18 (متاح 19)، Vite 8.1.4→8.1.5. لا خطر أمني، لكن تحديث دوري مطلوب. |
| 6 | 8 عناصر `TODO/FIXME` في الكود — دين تقني بسيط موثّق. |
| 7 | README يذكر "migrations-16" و"tests-246" بينما الواقع 77 migration و256 اختبار — تحديث الشارات (badges). |

---

## 7) خطة معالجة مُقترَحة (حسب الأولوية)

**قبل الإنتاج (إلزامي):**
1. 🔴 migration جديد: تفعيل RLS + سياسات `tenant_id` على الـ 19 جدولاً المالي + اختبار عزل لها.
2. 🔴 إزالة `supabase/.temp/` من Git + `.gitignore` + تدوير ما أمكن.
3. 🟠 جعل `APP_ORIGIN` إلزامياً في Edge Functions (منع wildcard CORS).

**قصير المدى (1–2 أسبوع):**
4. 🟠 تقييد قراءة `payroll`/الرواتب بالدور (least privilege).
5. 🟠 إضافة ESLint + typescript-eslint في CI.
6. 🔵 حذف `client.ts` اليتيم، توليد أنواع Supabase لتقليص `as any`.

**متوسط المدى:**
7. توسيع نطاق التغطية تدريجياً ليشمل طبقة SDK والصفحات الحرجة.
8. Lazy-load للرسوم، logger موحّد، تنظيم الوثائق، تحديث التبعيات.

---

## 8) الخلاصة

**Kyvzon مشروع SaaS مبني بحرفية عالية** — بنية modular، بوابة جودة CI متقدّمة، وأساس أمني قوي على مستوى Edge Functions وRLS في وحدة HR. **كل الفحوصات الآلية (البناء، الأنواع، 256 اختبار، audit) تمر بنجاح.**

لكن **نجاح البناء لا يعني جاهزية الإنتاج**: الفحص العميق كشف **فجوة عزل مستأجرين حرجة في الوحدة المالية (19 جدولاً بلا RLS)** وتسريب بيانات بنية تحتية في Git. هاتان النقطتان **P0 يجب إغلاقهما قبل النشر**. بعد معالجتهما، المشروع سيكون في وضع صحّي جداً للإنتاج.

> **التقييم العام:** جودة كود وهندسة **8.5/10** · جاهزية أمنية إنتاجية **5.5/10** (بسبب فجوة RLS المالية) — قابلة للارتفاع إلى ~9/10 بإغلاق بنود P0.

---
*تم إنشاء هذا التقرير بعد استنساخ المشروع فعلياً وتشغيل كامل سلسلة البناء والاختبارات والفحوصات الأمنية داخل مساحة العمل.*
