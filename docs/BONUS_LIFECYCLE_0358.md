# 0358 — سلامة دورة حياة المكافآت

**المرحلة 4 · بوابة الموارد البشرية · صفحة `src/pages/hr/BonusesPage.tsx`**
التاريخ: 2026-08-08 · الجولة: `0358`

---

## خلاصة الجولة

| البند | الرقم |
|---|---|
| أعطال مُثبتة تشغيلياً | **11** |
| تأكيدات SQL سلوكية | **101** |
| فحوص RLS بدور `authenticated` | **32** |
| جولة العكس | **43/43** (+3 تكافؤات مُثبتة) |
| اختبار عقد | **67** |
| دوال جديدة | 5 + محفّز حذف + إصلاح محفّز المبلغ |

---

## الأعطال — كلٌّ منها مقيس قبل كتابة سطر واحد

المسبار: `tools/dev/_probe_0358.sql`

### ① ★★★ زرّ «موافقة» يرمي دائماً

```js
bonusService.approveBonus(bonus.id, "system")
// → update(id, { status: 'موافق', approved_by: "system" })
```

**المقيس** (PROBE_9):
```
ERROR: invalid input syntax for type uuid: "system"
```

⇒ الاعتماد **مستحيل** من الواجهة. مكافأةٌ أُنشئت تبقى `pending` إلى الأبد.

### ② ★★★ مفردتان عربيّتان تكسران كل شيء

حتى لو نجح الاعتماد:

| الخدمة تكتب | الصفحة تقرأ |
|---|---|
| `'موافق'` | `=== 'approved'` |
| `'ملغي'` | `BONUS_STATUS_LABELS['cancelled']` |

**المقيس** (PROBE_1): الصفّ يحمل `موافق` ⇒ لا يُطابق `'approved'` أبداً،
و`BONUS_STATUS_LABELS['موافق']` = `undefined`.

⇒ بطاقة «معتمدة» **صفر أبداً** · الشارة تعرض النصّ الخام.

PROBE_1B: والعمود **بلا CHECK** — «حالة مخترعة تماماً» قُبِلت.

### ③ ★★★ حقلان للمبلغ يتضاربان

الجدول يحمل `amount NUMERIC NOT NULL` و`bonus_amount NUMERIC`، ومحفّز
`sync_bonus_amount_fields` يملأ **الفارغ منهما فقط**.

**المقيس** (PROBE_2C):
```
INSERT (amount=100000, bonus_amount=999999)
⇒ amount=100000.00 · bonus_amount=999999.00 · diverged = t
```

⇒ صفٌّ واحد بمبلغين. الرواتب تقرأ أحدهما والشاشة الآخر. والصفحة تُرسل
`bonus_amount` وتقرأ `bonus.amount` — تعمل صدفةً بفضل المحفّز.

### ④–⑪ البقية

| # | العطل | المقيس |
|---|---|---|
| ④ | لا حارس على المبلغ | PROBE_3: `-50000` قُبِلت |
| ⑤ | `bonus_type` بلا CHECK | PROBE_4: «نوع مخترع» قُبِل |
| ⑥ | لا FK على `employee_id` | PROBE_6: موظف غير موجود |
| ⑦ | حذف نهائيّ بلا محفّز | PROBE_7B: `0` محفّزات حذف |
| ⑧ | الفترة تُجمَع وتُهمَل | PROBE_8 |
| ⑨ | `referral` مفقود من الفلترة | ستّة أنواع · خمسة أزرار |
| ⑩ | جدولان كاملان + `Map` | — |
| ⑪ | `PAYROLL_STATUS_LABELS` في التفاصيل | ⇒ `undefined` |

---

## ما بُني

### (أ) `bonus_amount` مرآة لا حقل مستقلّ

```sql
NEW.bonus_amount := NEW.amount;   -- ★ إسناد غير مشروط
```

الاتجاه العكسيّ يبقى مشروطاً (للإدراج بـ`bonus_amount` وحده).

### (ب) خمسة قيود + FK

`bonuses_status_chk` (أربع مفردات) · `bonuses_type_chk` (ستّ) ·
`bonuses_amount_pos` · `bonuses_period_chk` · `bonuses_employee_id_fkey`.

كل كتلة تُطبِّع البيانات القائمة أولاً — **بما فيها المفردات العربية**
التي كتبتها `approveBonus`:

```sql
UPDATE bonuses SET status='approved'  WHERE status IN ('موافق','معتمد','معتمدة');
UPDATE bonuses SET status='cancelled' WHERE status IN ('ملغي','ملغى',…);
```

### (جـ) خمس دوال + محفّز منع الحذف

`bonus_summary` · `bonus_board` · `bonus_create` · `bonus_decide` ·
`bonus_archive`.

★ `approved_by` يأخذ `auth.uid()` **في القاعدة** — لا يُمرَّر من المتصفّح
إطلاقاً، فيستحيل تكرار العطل ①.

★ `bonus_date` يتبع `period_start` حين تُحدَّد: مكافأةُ يوليو تُحسَب في
يوليو لا في شهر إدخالها.

---

## جولة العكس — 43/43

**ثغرة تغطية واحدة سُدَّت**: `INV04` (العملة الافتراضية) نجا لأن
التأكيد كان يمرّ بفضل `DEFAULT 'IQD'` على العمود — فحارس المحفّز غير
مُختبَر. والعمود `NOT NULL` **لا يمنع السلسلة الفارغة**، فأضفتُ:

```sql
INSERT … currency = ''   ⇒  يجب أن تصير 'IQD'   (التأكيد 3.7)
INSERT … currency = 'USD' ⇒  يجب أن تُحترَم      (التأكيد 3.8)
```

### التكافؤات المُثبتة

- **`EQ01`** حارس دور البتّ مُكافئ لحارس دور الإنشاء في التأكيد 11.4.
- **`EQ02`** `ORDER BY created_at DESC` أثره على العرض لا الصحّة.
- **`EQ03`** تطبيع البيانات القائمة — لا صفوف تخالفه على قاعدة نظيفة.

---

## خطئي في هذه الجولة — مُصحَّح علناً

**التأكيد 5.4**: توقّعتُ `bonus_date = 2026-07-01` (من `period_start`)
فسقط بـ`got=«2026-08-08»`. السبب أن العمود له `DEFAULT CURRENT_DATE`
فلا يصل المحفّز فارغاً أبداً، والشرط `IF NEW.bonus_date IS NULL` لا
يتحقّق.

**لكنّ النيّة كانت أصحّ من التنفيذ**: مكافأةُ يوليو يجب أن تُحسَب في
يوليو. فأصلحتُ **المحفّز** لا التوقّع:

```sql
IF NEW.period_start IS NOT NULL THEN
  NEW.bonus_date := NEW.period_start;
ELSIF NEW.bonus_date IS NULL THEN …
```

وإلا سقطت المكافأة من `out_amt_month` في شهرها الصحيح وظهرت في الخطأ.

---

## الملفات

```
supabase/migrations/0358_bonus_lifecycle_integrity.sql
tools/dev/verify-bonus-lifecycle-0358.sql        101 تأكيداً
tools/dev/verify-bonus-lifecycle-0358-rls.sh      32 فحصاً
tools/dev/_invert_0358.py                         43/43 + 3 EQ
src/services/sdk/BonusService.ts                  جديد
src/services/sdk/index.ts                         تصدير
src/pages/hr/BonusesPage.tsx                      أُعيدت كتابتها
src/test/bonusLifecycleContract.test.ts           67 تأكيداً
```

---

## ما لم يُحلّ بعد

| البند | الملاحظة |
|---|---|
| `FinanceService.BonusService` | `approveBonus`/`cancelBonus` بمفرداتهما العربية باقيتان — لم تعد الصفحة تستعملهما. تُحذفان بعد مسح المستورِدين. |
| `bonus_amount` | عمودٌ مكرَّر يبقى للتوافق. إسقاطه يحتاج مسح كل القارئين. |
| ربط المكافآت بالرواتب | `payroll_run` لا يقرأ `bonuses` — `bonus_amount` في `payroll_records` يُملأ يدوياً. |
| المتصفّح | لم يُختبَر. |
