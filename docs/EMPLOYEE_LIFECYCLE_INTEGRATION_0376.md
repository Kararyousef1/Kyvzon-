# تكامل دورة حياة الموظف — 0376

**التاريخ:** 2026-08-14
**النطاق:** `Hire → Auth invitation → Draft contract → Onboarding` و`Offboarding → Contract termination → Auth disable`.

## القرار المعماري

لا يمكن جعل PostgreSQL وSupabase Auth معاملة ACID واحدة. لذلك لم تُخفَ فجوة الاتساق باستدعاءين من الصفحة، ولم تُنشأ كلمة مرور مؤقتة. اعتمدت 0376 نمط **Transactional Outbox**:

1. قاعدة البيانات تُكمل حقائق HR القانونية والـoutbox في معاملة واحدة.
2. Edge Function فقط تملك service role وتنفذ دعوة/تعطيل Auth.
3. الفشل يبقى بسجل `failed` قابل للرؤية وإعادة المحاولة، ولا يضيع حدث التوظيف أو الإنهاء.
4. الواجهة لا تدّعي فشل التوظيف بعد نجاح DB إذا تعذر البريد؛ تعرض أن الدعوة معلقة وتوفر retry.

## مسار التوظيف

عند نجاح `application_hire` القائمة، يشغّل `trg_recruitment_hire_lifecycle` داخل المعاملة نفسها:

- إنشاء عقد `draft` واحد مرتبط بـ`employee_contracts.job_application_id`.
- إنشاء مهمة `provision/pending` في `employee_identity_jobs`.
- إنشاء مهام التعريف المفعلة في `employee_onboarding` مع `ON CONFLICT DO NOTHING`.
- إبقاء الموظف والإعلان وربط `hired_employee_id` من منطق 0362.

بعد commit تستدعي `EmployeeIdentityService` وظيفة `employee-lifecycle-identity`:

- ترسل `inviteUserByEmail`؛ لا كلمة مرور مؤقتة ولا service key في المتصفح.
- تنشئ/تزامن `profiles`.
- تربط `employees.user_id` بمستخدم Auth.
- تعوض فشل profile أو ربط الموظف بحذف Auth user المنشأ.
- تحدّث outbox إلى `completed` أو `failed` مع الخطأ وعدد المحاولات.

`RecruitmentPage` تعرض الآن:

- «مسودة عقد جاهزة».
- «دعوة الحساب أُرسلت» عند النجاح.
- زر «إعادة إرسال دعوة الحساب» عند `pending/failed/processing`، مع استرداد claim عالق بعد عشر دقائق.

## مسار إنهاء الخدمة

عند إدراج `offboarding_records` من `offboarding_execute`:

- حارس `BEFORE INSERT` يرفض آخر يوم عمل يسبق بداية عقد draft/active.
- `AFTER INSERT` ينهي العقود `draft/active` ويملأ:
  - `status = terminated`
  - `termination_reason`
  - `terminated_at`
  - `end_date`
  - `offboarding_id`
- يلغي مهمة provision لم تنفذ، حتى لا يُنشأ حساب لموظف انتهت خدمته.
- ينشئ مهمة `disable/pending` في outbox.
- Edge Function تحظر Auth مدة طويلة، تحوّل `profiles.status` إلى `inactive`، وتغلق `offboarding_records.access_revoked`.
- إذا كان Auth user يتيماً/مفقوداً، تُعطّل profile إن وجدت وتُسجل الحالة بدل إخفائها.

`OnboardingPage` تعرض عدد العقود المغلقة وحالة Auth، وتوفر زر «إعادة محاولة تعطيل الحساب» عند الفشل.

## الروابط والقيود

أصبحت الأعمدة التي أضافتها 0364 روابط فعلية لا حقولاً معزولة:

- `(employee_contracts.job_application_id, tenant_id)` → `(job_applications.id, tenant_id)` مع `ON DELETE RESTRICT`.
- `(employee_contracts.offboarding_id, tenant_id)` → `(offboarding_records.id, tenant_id)` مع `ON DELETE RESTRICT`.
- فهرس جزئي فريد يضمن عقداً أولياً واحداً لكل طلب توظيف.
- لا حذف لعقد قانوني أثناء مصالحة القيم التاريخية؛ المرجع غير الصحيح يُفصل إلى `NULL`.

## أمان outbox وEdge Function

- `authenticated` لها `SELECT` فقط على `employee_identity_jobs`، بشرط المستأجر و`current_user_is_staff()`.
- لا INSERT/UPDATE/DELETE مباشر من المتصفح.
- Edge Function تتحقق من JWT والمستأجر والدور؛ تسمح لـHR في هذه الوظيفة فقط دون توسيع `CALLER_ROLES` العام لبقية Admin Functions.
- claim ذري ينتقل من `pending/failed` إلى `processing` ويمنع عاملين من التنفيذ معاً.
- `processing` العالقة أكثر من عشر دقائق تُسترد بدلاً من بقائها إلى الأبد.
- كل provision/disable ناجح يسجل security audit.

## المصالحة

0376 تنفذ backfill محافظاً:

- التوظيفات السابقة: عقد draft إذا لم يوجد، ومهمة provision تكون `completed` إذا كان `employees.user_id` موجوداً وإلا `pending`.
- إنهاءات الخدمة السابقة: إغلاق العقود التي لا يتناقض تاريخها، ومهمة disable تكون `completed` إذا لم يوجد حساب وإلا `pending`.
- الموظف غير النشط مع provision معلقة: تتحول المهمة إلى `cancelled`.
- لا تحذف migration موظفين أو طلبات توظيف أو عقوداً.

## الملفات الرئيسية

- `supabase/migrations/0376_employee_lifecycle_hire_auth_contract.sql`
- `supabase/functions/employee-lifecycle-identity/index.ts`
- `src/services/sdk/EmployeeIdentityService.ts`
- `src/services/sdk/RecruitmentPipelineService.ts`
- `src/services/sdk/OnboardingLifecycleService.ts`
- `src/pages/hr/RecruitmentPage.tsx`
- `src/pages/hr/OnboardingPage.tsx`
- `src/test/employeeLifecycleIntegrationContract.test.ts`

## التحقق المحلي

- عقود 0376 والمجالات المتأثرة: **5/5 ملفات و323/323 اختباراً**.
- الحزمة الكاملة بعد 0376: **170/170 ملفاً و5056/5056 اختباراً**.
- TypeScript الموجه للخدمات والصفحتين: ناجح.
- `vite build`: ناجح.
- `eslint src`: ناجح بلا أخطاء؛ تحذيرات المشروع انخفضت من 1127 إلى 1126.
- `sdk:boundary-check`: ناجح، allowlist = 0.
- `db:contract-check` و`db:procurement-sql-check`: ناجحان.
- مسح البوابتين ثابت: `ANY = 0` ودين المرحلة 6 = 58.

## المطلوب Runtime

هذه البيئة لا تحتوي `psql`/`postgres`/`docker`، ولم تُنشر Edge Function. لذلك يلزم بعد تطبيق 0376:

1. توظيف متقدم ببريد حقيقي والتحقق من invitation و`employees.user_id` وprofile.
2. محاكاة فشل البريد والتحقق من `failed` ثم زر retry.
3. تفعيل العقد draft ثم إنهاء الخدمة والتحقق من الربط والإغلاق وتعطيل Auth.
4. اختبار دور HR ودور admin ومستأجر ثانٍ لعزل RLS.
5. اختبار claim متزامن واسترداد `processing` عالق.

لا يدّعي هذا التقرير أن 0376 مطبقة أو أن Edge Function منشورة في البيئة الفعلية.
