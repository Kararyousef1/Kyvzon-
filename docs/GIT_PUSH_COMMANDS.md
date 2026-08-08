# أوامر Git للرفع — بعد جولة التحقق

> **حالة الفحوص وقت كتابة هذا الملف:**
> `tsc EXIT=0` · `2613/2613` اختباراً في 126 ملفاً · `build ✅` ·
> `db:contract-check PASS` · lint 0 خطأ · تحذيرات **1311** (نزلت من 1322)

---

## ★★ أولاً: حلّ تشعّب الفرع — قبل أي شيء

```
Your branch and 'origin/…' have diverged,
and have 2 and 1 different commits each, respectively.
```

**لا ترفع قبل حلّ هذا.** افحص ما على الخادم أولاً:

```powershell
git fetch origin
git log --oneline HEAD..origin/remediation/p0-security-and-build-health
```

### إن ظهر التزام واحد تريد الاحتفاظ به

```powershell
git stash push -u -m "wip-before-rebase"
git pull --rebase origin remediation/p0-security-and-build-health
git stash pop
```

### إن كان التزام الخادم قديماً لا قيمة له

**أخبرني قبل أي `--force`** — لا تنفّذه من تلقائك.

---

## ثانياً: قرار الملف المحذوف

```
deleted: docs/e-procurement/GAP_COMPLETION_ROUND2_2026-08-04.md
```

وفي untracked يوجد `...GAP_COMPLETION_ROUND2_2026-08-03.md`.
يبدو أنها **إعادة تسمية** بتاريخ سابق. تحقّق:

```powershell
git show HEAD:docs/e-procurement/GAP_COMPLETION_ROUND2_2026-08-04.md | Select-Object -First 20
Get-Content docs/e-procurement/GAP_COMPLETION_ROUND2_2026-08-03.md -TotalCount 20
```

- متطابقان ⇒ إعادة تسمية مقصودة، أدرج الحذف والإضافة معاً
- مختلفان ⇒ **استرجع المحذوف**: `git restore docs/e-procurement/GAP_COMPLETION_ROUND2_2026-08-04.md`

---

## ثالثاً: راجع `package.json` قبل إدراجه

```powershell
git diff package.json
```

إن كان تغييراً مقصوداً فأدرجه، وإن كان أثراً جانبياً لـ`npm install` فأرجعه:

```powershell
git restore package.json package-lock.json
```

---

## رابعاً: التحقق المحلي — لا ترفع بلا هذا

```powershell
npx tsc --noEmit
npm run test:run
npm run build
npm run lint
npm run db:contract-check
```

**المتوقَّع:** `tsc` صامت · `2613 passed` · `built in ~6s` · `0 errors` · `PASS`

---

## خامساً: الإدراج بمجموعات — لا تستعمل `git add .`

عدد الملفات كبير جداً؛ الإدراج الأعمى يخلط أشياء لم تُراجَع.

### ① المايجريشنات

```powershell
git add supabase/migrations/
git add supabase/functions/
```

### ② أدوات التحقق والفحص

```powershell
git add tools/dev/
```

### ③ الكود

```powershell
git add src/
```

### ④ التوثيق

```powershell
git add docs/
```

### راجع ما أدرجتَه قبل التثبيت

```powershell
git diff --cached --stat | Select-Object -Last 20
git status --short | Measure-Object -Line
```

---

## سادساً: التثبيت

الأفضل التزامان منفصلان — واحد للقاعدة وواحد للواجهة:

### الالتزام الأول — قاعدة البيانات وأدواتها

```powershell
git add supabase/ tools/dev/
git commit -m "db(0317-0332): محرك الاعتماد الموحد وعزل بوابة التقنية والصادرات

- 0317-0322: عضوية القسم · عزل المطور · بوابة الاشتراك · عزل الهيكل
- 0323: دورة حياة الاعتماد — 9 أعطال. أخطرها: leaves.status يبقى
  'انتظار' بعد اكتمال السلسلة (لا دالة في القاعدة تحدثه)
- 0324: حارس تجاوز السلسلة — دور hr كان يعتمد أي إجازة
- 0325: الطلبات المالية — الاعتماد والرفض معطوبان
  (invalid input syntax for type uuid)
- 0326: توحيد سطح الإشعارات — التواصل يصل الجرس
- 0327: إزالة Math.random من الرسم الساعي
- 0328: عزل بوابة التقنية — it_admin كان يرى كل العملاء
- 0329: قياس البوابة القديمة قبل الحذف
- 0330: السجل الموحد فوق 15 جدول تدقيق
- 0331: التكاملات وتنبيه الأخطاء الحرجة
- 0332: الصادرات الموحدة — tech_export_log أعادت 0 صف بينما 5
  صادرات حقيقية موجودة (قرأت export_logs وحده من خمسة مصادر)

الإثبات: 261 مايجريشن من الصفر بصفر فشل · 39 ملفا سلوكيا · 664 تأكيدا
مرقما · 6 سكربتات RLS حقيقي. كل اصلاح عكس مؤقتا واثبت اسقاطه للاختبار."
```

### الالتزام الثاني — الواجهة والاختبارات

```powershell
git add src/ docs/
git commit -m "feat(tech-portal): احدى عشرة صفحة مربوطة + سد فجوة ادارة المستخدمين

- صفحة DataExportsPage: الصادرات الموحدة والمتعثرة وأحداث الناقلين
- طبقة SDK: exportLog · exportSummary · exportFailures ·
  carrierWebhooks · webhookSummary

★★ عطل مقاس ومصلح — ادارة المستخدمين (الخطوة الثالثة):
  tech_portal:  7 من 11 صفحة  ← نقص tech-audit-trail · tech-error-logs
                                  · tech-integrations · tech-data-exports
  admin:       12 من 14        ← نقص admin-permissions · admin-mrp-roles
  hr:          26 من 27        ← نقص hr-leave-requests
  الأثر: Sidebar يرجع allowedPages.includes(item.id) فتختفي الصفحات
  تماما لكل مستخدم له custom_permissions.allowed_pages.

★ ازالة 11 موضع as any من ست صفحات في بوابة التقنية باستبدالها
  بأنواع بنيوية صريحة. tsc كشف اثناء ذلك هشاشة حقيقية في
  SystemHealthPage: (l.sync_time || l.created_at) قد يكون undefined
  والمقارنة undefined >= date تعطي false صامتا فيبدو ألا فشل حديثا.

- حارس جديد adminUserPagesContract.test.ts (97 اختبارا) يمنع تكرار
  الفجوة: أي صفحة في الكتالوج وغائبة عن ادارة المستخدمين تسقط البناء.

tsc EXIT=0 · 2613/2613 اختبارا في 126 ملفا · build نظيف
تحذيرات lint: 1322 -> 1311"
```

---

## سابعاً: الرفع

```powershell
git push origin remediation/p0-security-and-build-health
```

**إن رُفض** بسبب التشعّب، ارجع إلى القسم الأول — لا تستعمل `--force`
قبل مراجعتي.

---

## ثامناً: بعد الرفع — `0332` ينتظر الدفع

الملفات الجديدة على جهازك الآن:

```
supabase/migrations/0332_tech_unified_exports_and_webhooks.sql
tools/dev/verify-tech-exports-0332.sql          (78 تأكيدا)
tools/dev/verify-tech-exports-0332-rls.sh       (16/16 عبر RLS)
tools/dev/post-push-healthcheck-0317-0331.sql   (أداة فحص للسحابة)
src/pages/techportal/pages/DataExportsPage.tsx
src/test/techDataExportsContract.test.ts        (71 اختبارا)
src/test/adminUserPagesContract.test.ts         (97 اختبارا)
docs/TECH_PORTAL_EXPORTS_0332.md
docs/VERIFY_AFTER_PUSH_0317_0331.md
```

`0332` **لم يُدفَع بعد**. وهو يعدّل دالة دفعتَها للتو: يُسقط
`tech_export_log(INTEGER, INTEGER)` ويُنشئها بتوقيع
`(TEXT, TEXT, INTEGER, INTEGER)`.

```powershell
npx supabase db push
```

ثم أعد تشغيل `post-push-healthcheck-0317-0331.sql` في SQL Editor.

---

## الترتيب المختصر

| # | الخطوة |
|---|---|
| 1 | `git fetch origin` ثم قرار التشعّب |
| 2 | قرار الملف المحذوف و`package.json` |
| 3 | `npx tsc --noEmit` · `npm run test:run` · `npm run build` |
| 4 | الإدراج بمجموعات + `git diff --cached --stat` |
| 5 | الالتزامان |
| 6 | `git push` |
| 7 | `npx supabase db push` لـ`0332` |
| 8 | إعادة الفحص الآلي |
