# حالة بوابة المالية — خلاصة تنفيذية

> **الغرض:** استعادة السياق كاملاً من هذا الملف وحده، دون الرجوع لأي محادثة سابقة.
> **التاريخ:** 2026-08-03 · **الكوميت:** `e22839c5` · **الفرع:** `remediation/p0-security-and-build-health`

---

## 1) الحالة الحالية

بوابة المالية **مكتملة ومرفوعة**: الوحدات 00–14، وإعادة هيكلة التنقل.

| المؤشر | القيمة |
|---|---|
| المايجريشنات | 184 (المالية: 0240–0255) |
| صفحات المالية | 32 |
| اختبارات عقود المالية | 15 ملفاً / 59 اختباراً |
| توثيق المالية | 37 ملفاً |
| اختبارات المشروع كاملاً | 74 ملفاً / 547 اختباراً ✅ |

**الفحوصات الأخيرة:** `type-check` ✅ · `build` ✅ · `lint` ✅ 0 أخطاء (1443 تحذير قديم) · `db:contract-check` ✅ · `db:procurement-sql-check` ✅

---

## 2) بنية التنقل (النمط المعتمد)

**القاعدة:** الشريط الجانبي يعرض **الوحدات فقط**. صفحات كل وحدة تظهر داخلها كبطاقات أفقية عبر `FinanceUnitNav`. هذا نفس نمط المخزون (10 وحدات) والتصنيع (13 وحدة).

**الآلية:** دالة `splitInventorySection` في `Sidebar.tsx` تفلتر بقائمة `mainIds`. للمالية 16 وحدة:

```
finance-dashboard · finance-foundation · finance-coa · finance-journal
finance-periods · finance-payable · finance-receivable · finance-cash
finance-tax · finance-budget · finance-fixed-assets · finance-revenue
finance-intercompany · finance-project-accounting · finance-reports
finance-integrations
```

الـ13 صفحة الفرعية مسجّلة للتوجيه لكنها مخفية من القائمة.

### ملفات التنقل الأربعة (أي تعديل يجب أن يشملها معاً)

| الملف | الدور |
|---|---|
| `src/shared/components/dashboard/Sidebar.tsx` | الوحدات + `FINANCE_UNIT_FALLBACK` |
| `src/pages/app/finance/shared/FinanceUnitNav.tsx` | بطاقات كل وحدة |
| `src/pages/hybridportal/hybridPagesCatalog.ts` | 29 صفحة مالية (كانت غائبة كلياً) |
| `src/pages/admin/AdminEmployeesPage.tsx` | 29 صفحة في شاشة الصلاحيات |

> `src/index.css` يحوي `.finance-nav-scroll` — يخفي شريط التمرير. حذفه يُظهر شريطاً رمادياً في كل صفحات المالية.

---

## 3) دروس مستفادة (مهمة جداً)

### أ) `allowed_pages` يتجاوز الأدوار كلياً
```ts
if (Array.isArray(allowedPages)) return allowedPages.includes(item.id);
```
عند وجود `custom_permissions.allowed_pages`، **لا يُفحص الدور إطلاقاً**. أي معرّف جديد لا يظهر ما لم يُضف صراحة. لذلك أُنشئ `FINANCE_UNIT_FALLBACK`: من يملك صفحة فرعية قديمة يرى وحدتها الجديدة تلقائياً.

**أي وحدة جديدة مستقبلاً تحتاج تسجيلاً في 3 مواضع:** `Sidebar` + `hybridPagesCatalog` + `AdminEmployeesPage`.

### ب) خطأ `RETURNS TABLE` لا تكشفه الفحوصات الثابتة
`get_ap_aging` كانت تعيد **HTTP 400** دائماً لأن `accounts_payable.vendor_name` نوعه `varchar` بينما الدالة تعلنه `TEXT`:

```
structure of query does not match function result type
DETAIL: Returned type character varying does not match expected type text
```

الدالة تُنشأ بنجاح (فلا تُخطئ المايجريشنات) لكنها تفشل عند أول استدعاء — **حتى بلا بيانات**. أُصلح في `0255` بتحويل `::TEXT` و`::NUMERIC` صريح.

**القاعدة:** في أي `RETURNS TABLE` استخدم تحويلاً صريحاً لكل عمود.

### ج) التحقق الحقيقي يتطلب تشغيل SQL فعلياً
`type-check` و`db:contract-check` فحوصات **نصية**. لاكتشاف أخطاء التنفيذ، ثبِّت Postgres محلياً بلا صلاحيات root:

```bash
mkdir -p ~/.pgtest/debs && cd ~/.pgtest/debs
apt-get download postgresql-17 postgresql-client-17 postgresql-common \
  postgresql-client-common libpq5 libllvm19 libicu76 libxslt1.1 ssl-cert libjson-perl
mkdir -p ../root && for f in *.deb; do dpkg-deb -x "$f" ../root; done
export PATH=~/.pgtest/root/usr/lib/postgresql/17/bin:$PATH
export LD_LIBRARY_PATH=~/.pgtest/root/usr/lib/x86_64-linux-gnu:~/.pgtest/root/usr/lib
initdb -D ~/.pgtest/data -U postgres --auth=trust
pg_ctl -D ~/.pgtest/data -o "-p 55432 -k ~/.pgtest/sock" -l ~/.pgtest/server.log start
```

ثم أنشئ shim لمخطط `auth` (دوال `auth.uid()`/`auth.role()`/`auth.jwt()` وأدوار `anon`/`authenticated`/`service_role`) وطبّق المايجريشنات بالترتيب. بهذه الطريقة اكتُشف خطأ `get_ap_aging` وثبت أن 184 مايجريشن تعمل.

---

## 4) قواعد الأعمال الحرجة

**الصلاحية المالية** من `entity_memberships.finance_role`:
- `viewer` / `approver` → قراءة فقط
- `accountant` / `finance_manager` / `entity_admin` → إنشاء وتعديل

خطأ `NOT_AUTHORIZED_FOR_ENTITY` سببه الدور غالباً، لا عطل. ومن ينشئ الكيان يصبح `entity_admin` تلقائياً.

**دورة القيد:** `مسودة → إرسال → اعتماد → ترحيل` — كل خطوة تتطلب **سبباً نصياً** إلزامياً.

**رفض تلقائي عند:**

| الحالة | الخطأ |
|---|---|
| مدين ≠ دائن أو أقل من سطرين | `JOURNAL_ENTRY_NOT_BALANCED` |
| حساب تجميعي أو بُعد إلزامي ناقص | `..._HAS_INVALID_LINES_OR_DIMENSIONS` |
| فترة مقفلة أو تاريخ خارجها | `ACCOUNTING_PERIOD_NOT_OPEN_FOR_ENTRY_DATE` |
| مجموع السطور ≠ رأس الفاتورة | `AP_INVOICE_LINES_MUST_MATCH_AMOUNT` |
| تخصيصات ≠ مبلغ الدفعة | `PAYMENT_ALLOCATIONS_MUST_EQUAL_AMOUNT` |

**أعمار الذمم** تعرض `approved` / `partially_paid` / `overdue` فقط — المسودّات مستبعدة عمداً.

---

## 5) بيئة العمل

- **مسار المستودع:** `/home/user/Kyvzon`
- **الريموت:** `https://github.com/Kararyousef1/Kyvzon-.git`

> ⚠️ `.git/config` **لا يُحفظ** في لقطات مساحة العمل. عند ظهور
> `origin does not appear to be a git repository`:
> ```bash
> git remote add origin https://github.com/Kararyousef1/Kyvzon-.git
> ```
> كذلك `node_modules` يُحذف — شغّل `npm ci` عند البدء.

---

## 6) ما لم يُنجز بعد

| البند | الحالة |
|---|---|
| اختبار التدفقات في متصفح حقيقي | ❌ لم يُجرَّب |
| `npx supabase db push` لـ 0240–0255 | ⚠️ يؤكده المستخدم |
| ترتيب البطاقات من منظور محاسب | ❌ يحتاج مراجعة بشرية |
| تحذيرات lint الـ1443 (قديمة، خارج المالية) | ⚠️ مؤجلة |

**دليلا الاختبار:** `FINANCE_MANUAL_TEST_SCENARIOS_AR.md` و`FINANCE_EMPLOYEE_WORKFLOW_AR.md`.

---

## 7) منهجية العمل المتفق عليها

1. اقرأ التوثيق أولاً، ثم أنشئ Checklist تقنية.
2. لا تغادر وحدة قبل اكتمالها: DB + RPC + RLS + Views + SDK + UI + Routes + Sidebar + Tests.
3. ميّز دائماً بين: فحص ثابت محلي / Supabase Runtime / متصفح حقيقي.
4. **لا** `git push` ولا `supabase db push` إلا بطلب صريح.
5. **مبادئ UX:** لا نسخ UUID (استخدم Lookups) · باني سطور لا JSON · لا حذف نهائي (أرشفة/إلغاء) · كل تغيير حساس بسبب مسجّل · لا `confirm()`/`prompt()`.
6. كن صريحاً: «مكتمل محلياً» ≠ «جاهز للإنتاج».
