# إصلاح إسناد أدوار بوابة الحركة — 2026-08-04

## ١. سبب الخطأ الذي واجهته

```
ERROR:  22P02: invalid input syntax for type uuid: "[TENANT_UUID]"
LINE 8: VALUES ('[TENANT_UUID]', '[USER_UUID]', 'movement_manager', true);
```

الأمر الذي أعطيتُك إياه في الجولة السابقة كان **قالباً** فيه خانتان
`[TENANT_UUID]` و`[USER_UUID]` يُفترض استبدالهما بقيم حقيقية. نُفِّذ حرفياً،
فحاول Postgres تحويل النص `[TENANT_UUID]` إلى نوع `uuid` ورفضه.

**الخطأ خطأي**: كان يجب أن أعطيك أمراً يجلب القيم بنفسه لا قالباً يدوياً.
البديل الآن: `tools/dev/assign-movement-portal-role.sql` — تُبدّل فيه البريد
الإلكتروني فقط، ويستخرج `user_id` و`tenant_id` من `public.profiles` بنفسه.

## ٢. السكربت الجديد

**الملف:** `tools/dev/assign-movement-portal-role.sql`

بدّل هذا السطر وحده:

```sql
v_email TEXT := 'ضع-بريدك-هنا@example.com';
```

ثم شغّله من محرر SQL في Supabase.

### خصائصه

| الخاصية | التفصيل |
|---|---|
| مصدر المعرّفات | `SELECT ... FROM public.profiles WHERE lower(email) = lower(v_email)` |
| مطابقة البريد | غير حساسة لحالة الأحرف (`lower()` على الطرفين) |
| الأدوار الممنوحة | الثلاثة معاً: `movement_manager` · `logistics` · `employee_movement` |
| آمن للتكرار | `ON CONFLICT (tenant_id, user_id, portal_role) DO UPDATE SET is_active = TRUE` |
| بريد خاطئ | يرفع استثناءً عربياً واضحاً مع أمر تشخيصي — لا يفشل صامتاً |
| `tenant_id` فارغ | يرفع استثناءً منفصلاً |
| حذف | لا يحذف شيئاً إطلاقاً |

## ٣. التحقق الفعلي (Postgres 17.10 محلي)

أُعيد بناء مختبر Postgres من الصفر (ضاع بين الجلسات كالعادة)، وبُنيت قاعدة
كاملة بـ**228 مايجريشن — صفر فشل**، ثم نُفِّذت الاختبارات التالية فعلياً:

| # | الاختبار | النتيجة |
|---|---|---|
| ١ | قيد `profiles_role_check` يغطي 18 دوراً | ✅ مؤكَّد من `\d public.profiles` |
| ٢ | السكربت بالبريد الافتراضي غير المُبدَّل | ✅ `ERROR: لم يُعثر على مستخدم بالبريد ضع-بريدك-هنا@example.com` |
| ٣ | السكربت ببريد صحيح | ✅ `NOTICE: ✅ تم إسناد 3 دور فعّال` |
| ٤ | تشغيله ثلاث مرات متتالية | ✅ العدد بقي 6 صفوف (لا تكرار) |
| ٥ | `created_at` للصف الموجود لم يتغيّر | ✅ 15:23:40 بقي بينما الجديدان 15:24:14 |
| ٦ | `movement_has_role` للأدوار الثلاثة | ✅ `t / t / t` |
| ٧ | `movement_require_role` لموظف **بلا** إسناد | ✅ `ERROR: NOT_AUTHORIZED_FOR_MOVEMENT_ROLE (logistics)` |
| ٨ | `movement_require_role` بعد إسناد `logistics` فقط | ✅ مرّ بلا خطأ |
| ٩ | نفس الموظف يطلب `employee_movement` | ✅ رُفض — عزل الدورين يعمل |
| ١٠ | بعد السكربت الكامل: الدوران معاً | ✅ كلاهما مرّ |

### ملاحظة على `auth.uid()` في psql

عند استدعاء `movement_has_role` مباشرة من psql تحصل على `false` دائماً —
ليس عيباً: `auth.uid()` تقرأ `current_setting('request.jwt.claim.sub')`
وهي فارغة خارج جلسة PostgREST، فتصير `current_user_tenant_id()` = NULL.
حُوكيت الجلسة بـ`SET request.jwt.claim.sub = '<uuid>'` فصارت النتيجة `t`.

## ٤. فجوات الأدوار — الحصيلة النهائية

كنتُ أبلغتُك عن فجوة في موضعين. **الفحص كشف خمسة**، ثلاثة منها لم تكن موثّقة:

| # | الملف | الفجوة | الأثر الحقيقي |
|---|---|---|---|
| ١ | `supabase/functions/_shared/adminAuth.ts` | `TARGET_ROLES` = 13 دوراً | رفض إنشاء/ترقية موظف للأدوار الثلاثة |
| ٢ | `supabase/functions/admin-create-user/index.ts` | نسخة **مكررة** من `TARGET_ROLES` و`CALLER_ROLES` | نفس الأثر + السبب الجذري للانحراف |
| ٣ 🆕 | `src/utils/userUtils.ts:214` | `validRoles` = 15 دوراً | **الأخطر**: `normalizeRole` تُطبّع الأدوار الثلاثة صامتاً إلى `'employee'` — المستخدم يفقد بوابته بلا أي رسالة خطأ |
| ٤ 🆕 | `src/pages/admin/AdminEmployeesPage.tsx` — `ROLES` | تنتهي عند `manufacturing` | الأدوار الثلاثة **لا تظهر في قائمة اختيار الدور** أصلاً |
| ٥ 🆕 | `src/pages/admin/AdminEmployeesPage.tsx` — `ROLE_MODULE_MAP` | لا ربط بوحدة | لا يُفعَّل مفتاح الوحدة `movement` للمستأجر عند الإسناد |

الفجوة رقم ٣ هي الأخطر لأنها **فشل صامت**: كان بإمكانك إسناد الدور من القاعدة
بنجاح، ثم تراه يتحوّل إلى `employee` عند تحميل الملف الشخصي دون أي مؤشر.

### الإصلاحات

**`_shared/adminAuth.ts`** — أُضيفت الأدوار الثلاثة إلى `TARGET_ROLES`.

**`admin-create-user/index.ts`** — حُذفت النسخة المكررة كلياً واستُبدلت باستيراد
من المصدر الواحد:

```ts
import { audit, CALLER_ROLES, isUuid, PLATFORM_ROLES, TARGET_ROLES } from '../_shared/adminAuth.ts';
```

هذا يمنع تكرار الانحراف بنيوياً، لا بالانضباط.

**`src/utils/userUtils.ts`** — `validRoles` صارت 18 دوراً + تعليق يشرح خطر النقص.

**`src/pages/admin/AdminEmployeesPage.tsx`** — 3 مدخلات في `ROLES` بألوان مميزة
(sky / lime / purple) + 3 مدخلات في `ROLE_MODULE_MAP` كلها تشير إلى `movement`.

## ٥. لماذا لم يكتشف أي اختبار هذا؟

`src/test/edgeFunctions/adminAuth.test.ts` كان يحمل **نسخة رابعة** من الأدوار،
منسوخة يدوياً مع تعليق:

```ts
// نسخة inline من isUuid + الأدوار (طابق مع _shared/adminAuth.ts)
const TARGET_ROLES = new Set(['employee', 'supervisor', 'manager', 'hr', 'gatekeeper', 'admin', 'finance', 'tech', 'marketing']);
```

**تسعة أدوار.** المصدر كان قد وصل إلى 13. الاختبار كان يختبر نسخته الخاصة
ويمر بنجاح دائماً مهما انحرف الكود الحقيقي — اختبار بلا قيمة تشخيصية.

### إعادة كتابة الاختبار

صار يقرأ الملفات الحقيقية نصّاً ويحلّلها:

- `parseRoleSet()` — يستخرج أعضاء `new Set([...])` من `adminAuth.ts`
- `parseCheckConstraintRoles()` — يستخرج الأدوار من قيد `profiles_role_check` في `0288`

ثم يؤكد:

| التأكيد | الغرض |
|---|---|
| كل دور حركة موجود في `TARGET_ROLES` | 3 حالات |
| كل دور حركة موجود في قيد القاعدة | 3 حالات |
| كل دور في `TARGET_ROLES` مقبول في القاعدة | لا دور يُرفض عند الحفظ |
| كل دور في `CALLER_ROLES` مقبول في القاعدة | — |
| قيد القاعدة = `TARGET_ROLES ∪ PLATFORM_ROLES` بالضبط | لا دور يتيم في أي اتجاه |
| `admin-create-user` يستورد ولا يُعيد التعريف | منع عودة التكرار |

**9 اختبارات → 21 اختباراً.**

### إثبات أن الاختبار يكشف فعلاً

لم أكتفِ بمروره. عكستُ الإصلاح مؤقتاً (حذفتُ الأدوار الثلاثة من `adminAuth.ts`)
وأعدتُ التشغيل:

```
✓ TARGET_ROLES لا يحوي أدوار منصة
✓ TARGET_ROLES يشمل دور التسويق (بوابة التسويق)
× TARGET_ROLES يشمل دور بوابة الحركة «employee_movement»
× TARGET_ROLES يشمل دور بوابة الحركة «logistics»
× TARGET_ROLES يشمل دور بوابة الحركة «movement_manager»
× قيد القاعدة = TARGET_ROLES ∪ PLATFORM_ROLES بالضبط (لا دور يتيم)
```

أربع حالات فشلت كما يجب. ثم أُعيد الإصلاح ورجعت 21/21.

## ٦. اختبار كسرتُه وأصلحتُه

حذف النسخة المكررة كسر اختباراً قائماً:

```
src/test/inventory/inventoryFoundationContract.test.ts:21
expect(read('supabase/functions/admin-create-user/index.ts')).toContain("'inventory'");
```

كان يتحقق من نيّة صحيحة (الدور مُسجَّل في مسار إنشاء المستخدم) لكن **بوسيلة
خاطئة**: يفترض وجود التكرار الذي هو نفسه سبب العطل. أُصلح ليتحقق من الاستيراد:

```ts
expect(read('supabase/functions/admin-create-user/index.ts'))
  .toMatch(/import\s*\{[^}]*\bTARGET_ROLES\b[^}]*\}\s*from\s*'\.\.\/_shared\/adminAuth\.ts'/);
```

## ٧. فحص تكامل المواضع التسعة

فحص برمجي يحلّل كل موضع ويؤكد وجود الأدوار الثلاثة:

```
الموضع                                 الحالة
----------------------------------------------
adminAuth.TARGET_ROLES                 OK
types.UserRole                         OK
userUtils.validRoles                   OK
userUtils.roleBadges                   OK
AdminEmployeesPage.ROLES               OK
AdminEmployeesPage.ROLE_MODULE_MAP     OK
DB profiles_role_check                 OK
Sidebar.tsx                            OK
hybridPagesCatalog.ts                  OK
----------------------------------------------
مواضع ناقصة: 0/9
```

## ٨. بوابات الجودة

| البوابة | النتيجة |
|---|---|
| `npx tsc --noEmit` | ✅ صفر خطأ |
| `npm run test:run` | ✅ **1383/1383** في 97 ملفاً (كانت 1376 — صافي +7) |
| `npm run build` | ✅ نجح في 6.25 ثانية |
| `npm run lint` | ✅ 0 خطأ · 1393 تحذيراً (كلها سابقة) |
| `npm run db:contract-check` | ✅ PASS — 622 جدولاً · 309 عرضاً |
| `npm run sdk:boundary-check` | ❌ 52 انتهاكاً في 15 ملفاً — **صفر منها في `movement`** (finance/inventory/mrp، سابقة) |
| 228 مايجريشن من الصفر | ✅ صفر فشل |

## ٩. ما يلزمك تنفيذه

### أ. نشر دالتين (لا خمساً)

التعديل مسّ `_shared/adminAuth.ts` (مشترك) و`admin-create-user`. الدوال
`admin-update-role` و`admin-delete-user` و`admin-reset-password`
و`admin-toggle-status` تستورد من `_shared` ولا تحمل نسخاً محلية — لكن Supabase
يحزم `_shared` مع **كل** دالة تستوردها، فلا بد من نشر كل من يستورد `TARGET_ROLES`:

```bash
npx supabase functions deploy admin-create-user
npx supabase functions deploy admin-update-role
```

`admin-delete-user` · `admin-reset-password` · `admin-toggle-status` لا تستورد
`TARGET_ROLES` — نشرها اختياري.

### ب. إسناد الدور

بدّل البريد في `tools/dev/assign-movement-portal-role.sql` وشغّله.

### ج. التحقق من الترحيل (`0292` رحّل صفراً)

```sql
SELECT 'movements_log' AS t, count(*) FROM public.movements_log
UNION ALL SELECT 'movement_permits', count(*) FROM public.movement_permits
UNION ALL SELECT 'employee_movements_log', count(*) FROM public.employee_movements_log
UNION ALL SELECT 'employee_movement_permits', count(*) FROM public.employee_movement_permits;
```

إن كانت الأربعة أصفاراً فالنظام القديم كان فارغاً و`0292` صحيح.

### د. المتصفح — الأهم

**32 صفحة لم تُرَ تعمل قط.** ابدأ بـ`L08 التتبع الحي` (أول اختبار للخريطة)
ثم `L13 امتثال السلامة`.

### هـ. الإشعارات

```bash
npx supabase secrets set CRON_SECRET="$(openssl rand -hex 32)"
npx supabase functions deploy movement-daily-notifications
```

## ١٠. ما زال غير محلول

| البند | الحالة |
|---|---|
| ❌ متصفح حقيقي | لم يُفتح قط — 32 صفحة غير مرئية |
| ⬜ نشر Edge Functions | لم يُنفَّذ (يحتاجك) |
| ⬜ `CRON_SECRET` | لم يُنفَّذ |
| ⬜ تحقق نتيجة الترحيل | يحتاج استعلاماً على الإنتاج |
| مواد خطرة/مبرَّدة | لا فحص توافق مركبة↔بضاعة |
| تسليم → خصم المخزون | البوابتان منفصلتان |
| حوادث المركبات | لا جدول ولا منطق |
| واجهات المحطات/التسعيرة/المرفقات | الدوال والـSDK جاهزة · بلا واجهة |
| صور ePOD | تحتاج Storage bucket |
| تحذير خوادم OSM العامة | المخطط طلبه ولم يُنفَّذ |
| `sdk:boundary-check` | 52 انتهاكاً (سابقة، خارج `movement`) |

## ١١. الملفات المعدَّلة في هذه الجولة

```
tools/dev/assign-movement-portal-role.sql          (جديد — 78 سطراً)
docs/movement/ROLE_ASSIGNMENT_FIX_2026-08-04.md    (جديد — هذا الملف)
supabase/functions/_shared/adminAuth.ts            (+6 أسطر)
supabase/functions/admin-create-user/index.ts      (-19 / +6 أسطر)
src/utils/userUtils.ts                             (+3 أسطر)
src/pages/admin/AdminEmployeesPage.tsx             (+5 أسطر)
src/test/edgeFunctions/adminAuth.test.ts           (أُعيدت كتابته — 9 → 21 اختباراً)
src/test/inventory/inventoryFoundationContract.test.ts (+6 / -1)
```

**لم يُنفَّذ `git push`** — لم تطلبه.
