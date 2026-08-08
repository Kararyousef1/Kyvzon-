# 0324 — تدقيق بوابتي الموظف والإدارة: حارس تجاوز الاعتماد والأرشفة

**التاريخ:** 2026-08-05 · **الفرع:** `remediation/p0-security-and-build-health`
**الحالة:** مُطبَّق ومُختبَر على Postgres 17.10 محلي · **لم يُدفع للسحابة بعد**

---

## نطاق الجولة

بوابتا الموظف (20 صفحة) والإدارة (18 صفحة) لم تُدقَّقا صفحةً صفحة من قبل.
الفحص الثابت أعاد **صفر محاكاة** في بوابة الموظف — لا `Math.random()` ولا
`mockData` ولا `TODO`. لكن ما وُجد كان أخطر.

---

## ★ العطل ① — تجاوز سلسلة الاعتماد بالكامل

### السبب في الواجهة

`src/pages/employee/LeaveRequestPage.tsx:117` يشتقّ صلاحية الاعتماد من
**مسار URL** لا من دور المستخدم:

```tsx
const viewMode: ViewMode = useMemo(() => {
  const p = location.pathname;
  if (p.startsWith('/app/hr/leave-requests')) return 'hr';
  if (p.startsWith('/app/supervisor/'))       return 'supervisor';
  if (p.startsWith('/app/manager/'))          return 'manager';
  return 'employee';
}, [location.pathname]);

const canApprove = viewMode === 'hr' || viewMode === 'supervisor' || viewMode === 'manager';
```

ثم `handleApprove` يكتب في `leaves` مباشرةً عبر `leaveService.approveLeave`
بلا أي مرور بسلسلة الاعتماد.

### القياس — جلسة RLS حقيقية (`SET ROLE authenticated`)

| الدور | النتيجة قبل 0324 |
|---|---|
| `employee` | `status = 'انتظار'` — صُدّ ✅ |
| `manager` (قسم آخر) | `status = 'انتظار'` — صُدّ ✅ |
| **`hr`** | **`status = 'موافق'` · خطوات السلسلة = 0** ★ اخترق |

السبب في القاعدة: `kyvzon_leaves_update` تسمح لـ`current_user_is_staff()`:

```sql
SELECT COALESCE(public.current_user_role() IN ('admin','hr','developer','it_admin'), false);
```

بلا أي شرط على وجود سلسلة اعتماد نشطة أو انتماء للفريق.

**الأثر:** أي موظف موارد بشرية يعتمد إجازة أي موظف في الشركة، يُسقط مشرفه
ومديره من القرار، ولا يترك أثراً في `hr_approval_steps`.

### الحل

محفّز `BEFORE UPDATE OF status` على `leaves` و`permissions_request`:

```
هل تغيّرت الحالة؟ ── لا ──▶ مرّ
       │ نعم
       ▼
علَم kyvzon.approval_sync مرفوع؟ ── نعم ──▶ مرّ (المحرّك نفسه)
       │ لا
       ▼
خطوات مفتوحة (pending/active)؟ ── 0 ──▶ مرّ (سجل قديم بلا سلسلة)
       │ > 0
       ▼
الدور = admin؟ ── نعم ──▶ مرّ (تصحيح إداري)
       │ لا
       ▼
  APPROVAL_CHAIN_BYPASS
  «استعمل صندوق الموافقات — لا تُغيّر الحالة مباشرةً»
```

**علَم المزامنة** ضروري: بدونه يمنع الحارسُ محرّكَ الموافقات نفسه.
اكتُشف بالتشغيل — أول نسخة أسقطت `verify-0323` كاملاً. العلَم محلّي
للمعاملة (`is_local = TRUE`) فلا يتسرّب.

---

## ★ العطل ② — حذف نهائي لدليل امتثال

`AdminSOPsPage.tsx:263` كان يجمع **ثلاث** مخالفات في دالة واحدة:

```tsx
const handleDelete = async (sop: SOP) => {
  if (!confirm(`هل أنت متأكد من حذف ${sop.code} - ${sop.title}؟`)) return;  // ① محظور
  const { error } = await supabase                                          // ② Supabase مباشرة
    .from('sops').delete()                                                  // ③ حذف نهائي
    .eq('id', sop.id).eq('tenant_id', tenantId);
```

و`sop_readings_sop_id_fkey ON DELETE CASCADE`.

**القياس:**
```
قبل الحذف  : سجلات قراءة الإجراء = 1
بعد الحذف  : سجلات القراءة = 0    ← من قرأ الإجراء أُبيد
بعد الأرشفة: سجلات القراءة = 1    (محفوظة)
```

سجل «من قرأ أي إجراء ومتى» دليل امتثال، وكان يُمحى بنقرة.
و`sops.status` يقبل `'archived'` **أصلاً** — الأرشفة كانت متاحة ولم تُستعمل.

---

## ★ العطل ③ — حذف القسم يَعِد بما لا يفعل

`OrgStructurePage.tsx:168`:

```tsx
if (!window.confirm('حذف هذا القسم؟ سيتم إزالة ارتباطه بالموظفين والأقسام الفرعية.')) return;
await departmentService.delete(id);
```

**القياس:**
```
★ الحذف فشل: update or delete on table "departments" violates foreign key
  constraint "departments_parent_department_id_fkey" on table "departments"
```

الرسالة تَعِد بإزالة ارتباط الأقسام الفرعية، والقيد يمنع الحذف أصلاً ⇒
المستخدم يرى «حدث خطأ أثناء الحذف» بلا سبب. **ولو نجح** لأباد
`approval_rules` و`org_role_assignments` عبر `ON DELETE CASCADE`.

`departments.is_active` موجود ولم يُستعمل للأرشفة.

---

## ★ العطل ④ — كود ميت يحمل مخالفات

`src/pages/admin/AdminEmployeesPageV2.tsx` — **668 سطراً، صفر مرجع**:

| موضع التسجيل | مسجَّل؟ |
|---|---|
| `AppRouter.tsx` · `Sidebar.tsx` · `hybridPagesCatalog.ts` · `AdminEmployeesPage.tsx` · `permissions.ts` | ✗ (الخمسة) |

يحمل `confirm()` وحذف مستخدم نهائياً عبر `admin-delete-user`. إصلاح كود لا
يصل إليه أحد يُنتج وهم تغطية ⇒ **أُرشِف** إلى `src/pages/admin/_archive/`
بامتداد `.bak` (خارج نطاق `tsc` و`vite`) مع `README.md` يشرح السبب
والاسترجاع.

> **قرار الوكيل:** المستخدم تخطّى سؤال الأرشفة مقابل الحذف، فاخترتُ
> الأرشفة — أقل تدميراً وقابلة للعكس.

---

## أعطال أصغر أُصلحت

| الملف | المخالفة |
|---|---|
| `AdminPermissionsTree.tsx:361` | `alert(message)` ⇒ لوحة خطأ داخل الصفحة |
| `AdminLandingPageCMS.tsx:133` | `confirm()` للتراجع ⇒ نافذة تأكيد |

---

## ⚠️ تصحيحان ذاتيان أثناء الجولة

### ① الشيم كان يُخفي RLS خلف قيد صلاحيات

كل مسبار RLS كان يعود بـ`permission denied for table leaves`. ظننتُ أول
الأمر أن الخادم سقط، ثم أن RLS يحمي — **كلاهما خطأ**. السبب أن
`pgtest-supabase-shim.sql` لا يمنح `authenticated` صلاحيات الجداول،
بينما Supabase الحقيقي يمنحها ويعتمد على RLS وحده.

الخطر أن يُقرأ الصدّ على أنه «RLS يحمي» بينما السياسة مفتوحة فعلياً —
وهو بالضبط ما كان يحدث مع ثغرة `hr`.

### ② ثم أفرطتُ في التصحيح

نسختي الأولى من إصلاح الشيم منحت `anon` صلاحية `SELECT` أيضاً، فأسقطت
تأكيد «`anon` لا يقرأ `unified_approvals`» في `verify-0305`. **السقوط كان
صحيحاً والشيم خاطئاً**: المشروع يسحب صلاحيات `anon` صراحةً في مايجريشناته،
ومنحها في الشيم كان يُخفي ذلك السحب. صُحّح إلى `authenticated` وحده.

---

## إثبات العكس

كل إصلاح عُكس **منفرداً** لإثبات أن الاختبار يلتقطه:

| العكس | التأكيد الساقط |
|---|---|
| إزالة الحارس | `1.2 محفّزات الحارس = 1 (متوقَّع 2)` |
| الحارس يسمح لـ`hr` | `2.2 ★ دور hr تجاوز سلسلة الاعتماد` |
| العلَم لا يُخفَض | `3.3 ★ علَم المزامنة بقي مرفوعاً — الحارس مُعطَّل للأبد` |
| `archive_sop` ⇒ حذف | `5.2 الحالة = (فارغة)` |
| `archive_department` بلا فحص | `6.1 أُرشف قسم فيه موظفون` |
| الحارس معطَّل (RLS) | `❌ ★ دور hr تجاوز سلسلة الاعتماد كاملةً` |

> **ملاحظة منهجية:** عكس العلَم لم يُطبَّق في المحاولة الأولى — استعملتُ
> `CREATE FUNCTION` بدل `CREATE OR REPLACE` فرفضته القاعدة، والاختبار نجح
> **نجاحاً زائفاً**. تحقّقتُ من تطبيق العكس فعلياً قبل قراءة النتيجة.

---

## حالة الفحوص

```
253 مايجريشن من الصفر            صفر فشل
31/32 ملف سلوكي · 337 تأكيداً مرقّماً
verify-0324        28/28   (منطق الدوال والمحفّزات)
verify-0324-rls     5/5    (RLS حقيقي · SET ROLE authenticated)
2204/2204 اختبار وحدة في 117 ملفاً   (+29 جديداً)
tsc EXIT=0
lint 0 خطأ · 1327 تحذيراً          (كانت 1392)
build ✅  ·  db:contract-check PASS
sdk:boundary-check: 52 انتهاكاً موروثاً — صفر في الجديد
```

**سياسة المنصة في البوابتين (38 صفحة):**
```
confirm() / alert() / prompt() تنفيذي   صفر
حذف نهائي تنفيذي                        صفر
```

---

## ما لم يُختبر

- **المتصفح** — لم يُختبر في أي جولة.
- **Supabase حقيقي** — `db push` لـ`0317`–`0324` بيد المستخدم.
- **توسيع الحارس** — 49 جدولاً بنمط `current_user_is_staff()` في `UPDATE`،
  منها `expense_requests` و`employee_loans`. **مؤجَّل عمداً**: لا سلسلة
  اعتماد مبنيّة لهما بعد، وحارسٌ بلا سلسلة لا يجد ما يحرسه. تُبنى السلسلة
  أولاً (مثل HR) ثم يُطبَّق الحارس.

---

## الملفات

```
supabase/migrations/0324_request_status_guard_and_soft_delete.sql   جديد
tools/dev/verify-request-guard-0324.sql                             جديد · 28 تأكيداً
tools/dev/verify-request-guard-0324-rls.sh                          جديد · 5 عبر RLS
src/test/requestGuardContract.test.ts                               جديد · 29 اختباراً
src/services/sdk/ArchiveService.ts                                  جديد
tools/dev/pgtest-supabase-shim.sql                                  منح authenticated
src/pages/admin/AdminSOPsPage.tsx                                   أرشفة + Modal
src/pages/admin/OrgStructurePage.tsx                                أرشفة + سبب حقيقي
src/pages/admin/AdminPermissionsTree.tsx                            لوحة خطأ بدل alert()
src/pages/admin/AdminLandingPageCMS.tsx                             Modal بدل confirm()
src/pages/admin/_archive/AdminEmployeesPageV2.tsx.bak               مُؤرشَف
src/pages/admin/_archive/README.md                                  جديد
```
