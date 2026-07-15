# ⚙️ دليل العمليات الشامل — Kyvzon Platform

**الجمهور المستهدف:** مهندس Ops / مدير المشروع
**آخر تحديث:** 15 يوليو 2026
**الفرع:** `remediation/p0-security-and-build-health`

---

## 🎯 نظرة عامة

هذا الدليل يأخذك **خطوة بخطوة** من الحالة الحالية (كود جاهز، لكن غير منشور) إلى **أول إطلاق إنتاجي آمن**.

### افتراضات
- عندك حق admin على Supabase project (production أو staging جديد).
- عندك حق force-push على GitHub repo.
- عندك مفاتيح OpenRouter/Groq (أو ستنشئها).
- عندك Netlify/Vercel لنشر الواجهة.
- الوقت المتوقع: **~3-4 ساعات عمل مركّز**.

### الترتيب الحرج
> **⚠️ نفّذ المراحل بالترتيب — لا تقفز.** كل مرحلة تبني على السابقة.

```
المرحلة 1  →  تدوير الأسرار (Ops-side فقط)              — 30 دقيقة
المرحلة 2  →  تنظيف git history                          — 30 دقيقة
المرحلة 3  →  إعداد Supabase (staging + production)      — 45 دقيقة
المرحلة 4  →  نشر Migrations                             — 30 دقيقة
المرحلة 5  →  نشر Edge Functions                         — 30 دقيقة
المرحلة 6  →  نشر الواجهة (Netlify/Vercel)               — 30 دقيقة
المرحلة 7  →  Smoke Tests شاملة                          — 30 دقيقة
المرحلة 8  →  فتح للمستخدمين + مراقبة أولية              — مستمر
```

---

## 📋 المرحلة 1: تدوير الأسرار (30 دقيقة)

**السبب:** إذا كان أي فرع سابق يحوي `.env` مع مفاتيح حقيقية، فهي مكشوفة في git history. حتى بعد `git filter-repo`، افتراض أن المفاتيح **مُخترَقة** = آمن.

### 1.1 مفاتيح Supabase

**Dashboard → Settings → API:**

| المفتاح | الإجراء |
|---|---|
| `anon` key | **دوّره** (Rotate) — النقرة اليمنى → Regenerate |
| `service_role` key | **دوّره فوراً** — هذا الأخطر |
| Database password | **دوّره** — Settings → Database → Reset |

**تسجيل ما دوَّرته في مكان آمن (Vault/1Password/Bitwarden):**
```
KYVZON_STAGING_ANON_KEY=eyJ...
KYVZON_STAGING_SERVICE_ROLE_KEY=eyJ...   ← لا تشاركها أبداً
KYVZON_STAGING_DB_PASSWORD=...

KYVZON_PROD_ANON_KEY=eyJ...
KYVZON_PROD_SERVICE_ROLE_KEY=eyJ...
KYVZON_PROD_DB_PASSWORD=...
```

### 1.2 مفاتيح OpenRouter/Groq

**OpenRouter.ai → Keys → Delete old + Create new:**
```
OPENROUTER_API_KEY=sk-or-v1-<new>
```

**console.groq.com → API Keys → Revoke old + Create new:**
```
GROQ_API_KEY=gsk_<new>
```

### 1.3 ADMS_SECRET (لـ ZKTeco)

إنشاء سر جديد قوي:
```bash
openssl rand -hex 32
# مثال: 8f3a2c5b9e7d4f1a6b0c8e2d5f7a9b1c3e6d8f0a2c4b6e8d0f2a4c6e8d0f2a4c
```

**⚠️ حدّث هذا السر في:**
1. Supabase Edge Functions secrets (`ADMS_SECRET`)
2. جهاز ZKTeco نفسه (يجب أن يوقّع بنفس السر)

### 1.4 Dev PIN (إذا مستخدم)

إن كنت تستخدم `VITE_ENABLE_LOCAL_AUTH` في development، **لا تُفعّله في production**. تأكد من `.env.production`:
```bash
VITE_ENABLE_LOCAL_AUTH=false
# VITE_DEV_PIN غير موجود (لا نحتاجه في production)
```

### ✅ قائمة تحقق المرحلة 1
```
[ ] Supabase anon key مُدوَّر (staging + production)
[ ] Supabase service_role key مُدوَّر (staging + production)
[ ] Supabase DB password مُدوَّر
[ ] OpenRouter key مُدوَّر
[ ] Groq key مُدوَّر
[ ] ADMS_SECRET جديد (32 بايت hex)
[ ] كل الأسرار الجديدة في Vault آمن
[ ] لا يوجد مفتاح قديم مُستخدَم بأي مكان
```

---

## 📋 المرحلة 2: تنظيف Git History (30 دقيقة)

**⚠️ خطر:** هذه العملية تعيد كتابة تاريخ Git. **اطلب من كل مطور push آخر تغييراته أولاً**.

### 2.1 فحص أولي — هل يوجد `.env` في التاريخ؟

```bash
cd /path/to/Kyvzon-
git log --all --full-history --oneline -- .env .env.local .env.production 2>&1 | head -20
```

- إذا **لا نتائج** → أنت محظوظ، تخطى إلى المرحلة 3.
- إذا **يوجد commits** → استمر.

### 2.2 التحقق من git-filter-repo

```bash
which git-filter-repo || pip install git-filter-repo
git filter-repo --version
```

### 2.3 نسخة احتياطية (إلزامي!)

```bash
cd ..
cp -r Kyvzon- Kyvzon--BACKUP-$(date +%Y%m%d)
```

### 2.4 تنظيف الملفات من كل التاريخ

```bash
cd Kyvzon-

# احذف .env و .env.local من كل الـ commits التاريخية
git filter-repo --path .env --path .env.local --path .env.production --invert-paths --force

# احذف أي مفاتيح ظاهرة في commits قديمة
# استبدل <OLD_KEY> بكل مفتاح مكشوف — كل واحد على حدة
echo "sk-or-v1-<OLD_OPENROUTER_KEY>==>REDACTED" > /tmp/redact.txt
echo "gsk_<OLD_GROQ_KEY>==>REDACTED" >> /tmp/redact.txt
echo "eyJ<OLD_SERVICE_ROLE_JWT>==>REDACTED" >> /tmp/redact.txt

git filter-repo --replace-text /tmp/redact.txt --force
```

### 2.5 التحقق من التنظيف

```bash
# يجب أن يعيد "لا نتائج"
git log --all --oneline -S "sk-or-v1-" 2>&1 | head -5
git log --all --oneline -S "SUPABASE_SERVICE_ROLE_KEY" 2>&1 | head -5
```

### 2.6 Force push

```bash
# إعادة إضافة remote (filter-repo يزيله كإجراء أمني)
git remote add origin git@github.com:Kararyousef1/Kyvzon-.git

# دفع كل الفروع + tags بالقوة
git push origin --all --force-with-lease
git push origin --tags --force-with-lease
```

### 2.7 إبلاغ الفريق

**رسالة موحّدة:**
> 🚨 **تنبيه هام:** تم إعادة كتابة تاريخ Git لإزالة أسرار قديمة.
> **كل مطور يجب أن:**
> 1. `git push` تغييراته الحالية أولاً
> 2. حذف الـ local clone وإعادة `git clone`
> 3. الأسرار القديمة **مُدوَّرة**، احصل على الأسرار الجديدة من مدير المشروع

### ✅ قائمة تحقق المرحلة 2
```
[ ] Backup موجود ومحفوظ خارج المستودع
[ ] git filter-repo نفّذ بنجاح
[ ] grep على الأسرار القديمة = لا نتائج
[ ] Force push نجح
[ ] الفريق أُبلِغ ودخل clone جديد
```

---

## 📋 المرحلة 3: إعداد Supabase (45 دقيقة)

### 3.1 إنشاء projects (إذا لم تكن موجودة)

**staging:**
- Dashboard → New Project
- Name: `kyvzon-staging`
- Region: قريبة من المستخدمين (Frankfurt أو Bahrain لمنطقة الشرق الأوسط)
- Plan: Free أو Pro

**production:**
- Name: `kyvzon-production`
- Region: نفس الـ staging
- Plan: Pro (على الأقل — للـ SLA و backups)

### 3.2 تفعيل الإعدادات الحرجة

لكل project:

**Settings → Auth:**
- ✅ Email confirmations: **ON** في production
- ✅ Site URL: `https://your-domain.com`
- ✅ Redirect URLs: أضف كل الـ subdomains الشرعية
- ❌ Sign-ups: **OFF** (المستخدمون يُنشَؤون فقط عبر admin-create-user)

**Settings → Database:**
- ✅ Point-in-time Recovery: **ON** (production only)
- ✅ Daily backups: **ON**

**Settings → API:**
- ✅ سجّل الـ Project ref (staging + production) في Vault

### 3.3 إعداد Supabase CLI محلياً

```bash
npm install -g supabase
supabase login
```

### 3.4 ربط المشروع

**staging:**
```bash
cd Kyvzon-
supabase link --project-ref <staging-ref>
```

### ✅ قائمة تحقق المرحلة 3
```
[ ] staging project موجود
[ ] production project موجود
[ ] Sign-ups معطَّلة في production
[ ] PITR + daily backups مفعّلة في production
[ ] Supabase CLI مُثبَّت + مربوط بـ staging
[ ] Project refs في Vault
```

---

## 📋 المرحلة 4: نشر Migrations (30 دقيقة)

### 4.1 التحقق من صحة Migrations محلياً

```bash
# فحص عقد جداول DB (يجب أن يمر)
node scripts/check-db-contract.mjs

# إذا كان لديك Postgres محلي:
bash scripts/tests/run_clean_db_test.sh
```

### 4.2 دفع Migrations إلى staging

```bash
supabase db push
```

**متوقع:**
```
Applying migration 0000_extensions.sql...
Applying migration 0001_core_schema.sql...
...
Applying migration 0015_relaxed_insert_for_audit_error_security.sql...
Finished supabase db push.
```

### 4.3 التحقق البصري في staging

**Supabase Dashboard → Database → Tables:**
- عدد الجداول: **~78**
- كل جدول عليه لوحة تعرض RLS **مفعّل** (أخضر)

**Dashboard → Database → Functions:**
- يجب أن ترى: `current_user_tenant_id`, `current_user_role`, `set_session_context`, ...

**Dashboard → SQL Editor** — نفّذ:
```sql
SELECT COUNT(*) AS tables FROM pg_tables WHERE schemaname='public';
SELECT tablename FROM pg_tables WHERE schemaname='public' AND NOT rowsecurity;
-- المتوقع: 78, ولا جدول بلا RLS
```

### 4.4 نفس الشيء لـ production (بعد التحقق من staging)

```bash
supabase link --project-ref <production-ref>
supabase db push
```

### ✅ قائمة تحقق المرحلة 4
```
[ ] Migrations نُفِّذت على staging (16 ملف)
[ ] ~78 جدول موجود
[ ] كل الجداول عليها RLS مفعّل
[ ] الدوال المساعدة موجودة (7 دوال)
[ ] Migrations نُفِّذت على production
[ ] تحقق بصري + SQL query مطابق
```

---

## 📋 المرحلة 5: نشر Edge Functions (30 دقيقة)

### 5.1 ضبط Secrets في staging

```bash
supabase link --project-ref <staging-ref>

supabase secrets set \
  APP_ORIGIN=https://kyvzon-staging.netlify.app \
  OPENROUTER_API_KEY=<new-key> \
  GROQ_API_KEY=<new-key> \
  ADMS_SECRET=<hex-32-bytes>

# التحقق
supabase secrets list
```

**ملاحظة:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` **تُضبط تلقائياً** بواسطة Supabase.

### 5.2 نشر كل الـ functions

```bash
supabase functions deploy
```

**متوقع:**
```
Deploying admin-create-user...
Deploying admin-delete-user...
Deploying admin-reset-password...
Deploying admin-toggle-status...
Deploying admin-update-role...
Deploying ai-chat...
Deploying zkteco-sync...
✓ Deployed 7 functions.
```

### 5.3 Smoke Test لكل function

راجع `docs/EDGE_FUNCTIONS_DEPLOYMENT.md` — القسم "Smoke Tests بعد النشر".

**السريع (admin-create-user):**
```bash
# احصل على JWT من admin موجود في staging
JWT=$(curl -sX POST "https://<staging-ref>.supabase.co/auth/v1/token?grant_type=password" \
  -H "apikey: $STAGING_ANON_KEY" -H "Content-Type: application/json" \
  -d '{"email":"admin@test.com","password":"..."}' | jq -r .access_token)

# اختبر
curl -X POST "https://<staging-ref>.supabase.co/functions/v1/admin-create-user" \
  -H "Origin: https://kyvzon-staging.netlify.app" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"email":"smoke@example.com","password":"Smoke#2026Test","full_name":"اختبار","role":"employee"}'
# المتوقع: 201 { success: true, user_id: "..." }
```

### 5.4 اختبار Rate Limiting

```bash
# 6 محاولات متتالية
for i in {1..6}; do
  echo "Attempt $i:"
  curl -X POST "https://<staging-ref>.supabase.co/functions/v1/admin-create-user" \
    -H "Origin: https://kyvzon-staging.netlify.app" \
    -H "Authorization: Bearer $JWT" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"rl$i@test.com\",\"password\":\"RLTest#2026\",\"full_name\":\"RL $i\",\"role\":\"employee\"}" \
    -w "\nHTTP %{http_code}\n\n"
done
```

**متوقع:** أول 5 نجحوا (201)، السادس فشل (429) مع header `Retry-After: 60`.

### 5.5 كرر لـ production

```bash
supabase link --project-ref <production-ref>
supabase secrets set APP_ORIGIN=https://your-real-domain.com ...
supabase functions deploy
# smoke tests مع production JWT
```

### ✅ قائمة تحقق المرحلة 5
```
[ ] كل الـ 7 secrets مضبوطة في staging
[ ] 7 Edge Functions منشورة في staging
[ ] admin-create-user يعمل (smoke test)
[ ] Rate limiting يعمل (429 بعد 5 طلبات)
[ ] Escalation prevention يعمل (403 عند role=developer)
[ ] نفس الشيء لـ production
```

---

## 📋 المرحلة 6: نشر الواجهة (30 دقيقة)

### 6.1 إعداد Netlify

**Netlify → Sites → New site from Git:**
- Repository: `Kararyousef1/Kyvzon-`
- Branch: `remediation/p0-security-and-build-health` (أو `main` بعد merge)
- Build command: `npm run build`
- Publish directory: `dist`

### 6.2 ضبط Environment Variables في Netlify

**Site settings → Environment variables → Add:**

```
VITE_SUPABASE_URL=https://<staging-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<new-staging-anon-key>
VITE_APP_NAME=Kyvzon Platform
VITE_APP_VERSION=1.0.0
VITE_APP_ENV=staging
```

**⚠️ لا تضع:**
- `SUPABASE_SERVICE_ROLE_KEY` (خطر — يذهب لـ bundle!)
- `OPENROUTER_API_KEY` (خطر مالي)
- `VITE_ENABLE_LOCAL_AUTH` (يجب أن يكون false في production)

### 6.3 نشر أولي

```bash
# اضغط "Trigger Deploy" في Netlify
# راقب البناء — يجب أن يكتمل في ~3 ثوان (build) + وقت الشحن
```

### 6.4 التحقق البصري

- افتح https://kyvzon-staging.netlify.app
- يجب أن ترى Landing page
- افتح DevTools → Network → افحص أن:
  - **لا يوجد** أي طلب لـ `sk-or-v1-*` أو JWT كامل مكشوف
  - Supabase requests تذهب لـ URL الصحيح

### 6.5 التحقق الأمني من Bundle

```bash
# ابحث في الـ bundle عن أي مفتاح
curl -s https://kyvzon-staging.netlify.app/assets/index-*.js | \
  grep -oE "sk-or-v1-\w+|SUPABASE_SERVICE_ROLE_KEY|gsk_\w+" | head -5

# يجب: لا نتائج
```

### 6.6 كرر لـ production

**Netlify → New Site (أو Domain alias):**
- استخدم أسرار **production** (ليس staging)
- Domain: `kyvzon.your-company.com`

### ✅ قائمة تحقق المرحلة 6
```
[ ] Netlify site مُنشأ للـ staging
[ ] Environment vars مضبوطة (بدون service role!)
[ ] Build ينجح
[ ] Site يفتح ويعرض LandingPage
[ ] لا يوجد مفتاح حساس في bundle
[ ] Production site + domain جاهزَان
```

---

## 📋 المرحلة 7: Smoke Tests شاملة (30 دقيقة)

### 7.1 اختبار Login الكامل

1. افتح https://your-domain.com/login
2. سجّل دخول بحساب admin
3. تحقق أنه ينتقل لـ `/app/admin`
4. **افتح tab جديد بنفس URL** — يجب أن تبقى مسجَّل دخول

### 7.2 اختبار Route Guards

```
/app/admin        → 200 (ok كـ admin)
/app/hr           → يوجّه لـ /app/admin (admin يمكنه HR)
/app/employee     → 200
/dev              → 403 وإعادة توجيه (admin ليس developer)

# سجّل خروج + جرّب:
/app/admin        → redirect إلى /login?redirect=%2Fapp%2Fadmin
```

### 7.3 اختبار Deep Linking

- انسخ `https://your-domain.com/app/hr/attendance`
- افتحه في tab جديد
- بعد login، يجب أن تصل مباشرة لـ `/app/hr/attendance` (لا `/app/hr`)

### 7.4 اختبار Multi-tenant isolation

**كـ admin شركة A:**
1. أنشئ موظف: `employee-a@test.com` في شركة A
2. Logout

**كـ admin شركة B:**
1. Login
2. اذهب لـ `/app/admin/employees`
3. **يجب ألا ترى `employee-a@test.com`**

### 7.5 اختبار Rate Limit UX

- سجل دخول admin
- افتح Console → Network
- اذهب لصفحة أنشاء موظف
- أنشئ 6 موظفين بسرعة
- السادس يجب أن يفشل بـ HTTP 429 + رسالة عربية واضحة

### 7.6 اختبار ai-chat (إن كان مفعّلاً)

- افتح `/app/employee/ai-chat`
- أرسل رسالة "مرحباً"
- يجب أن ترى ردّاً من AI
- افتح Network → لا يجب أن ترى `OPENROUTER_API_KEY` في أي طلب

### 7.7 اختبار PWA (اختياري)

- Chrome DevTools → Application → Service Workers
- يجب أن ترى `sw.js` مُسجَّل
- افصل الإنترنت → أعد تحميل → يجب أن ترى `/offline.html`

### ✅ قائمة تحقق المرحلة 7
```
[ ] Login يعمل + redirect بعد login
[ ] Route Guards تعمل صحيحاً
[ ] Deep linking يعمل
[ ] Multi-tenant isolation مُثبتة
[ ] Rate limit UX واضح للمستخدم
[ ] ai-chat يعمل (إن كان مفعّلاً)
[ ] PWA offline يعمل
```

---

## 📋 المرحلة 8: فتح للمستخدمين + مراقبة (مستمر)

### 8.1 قرار الإطلاق

**الخيار A: Soft Launch**
- أعطِ الرابط لـ 5-10 مستخدمين موثوقين
- راقب لمدة **48 ساعة**
- ثم افتح للجميع

**الخيار B: Full Launch**
- إذا كنت واثقاً من كل ما سبق
- أعلن للجميع

### 8.2 مراقبة يومية (أول أسبوعين)

**Dashboard → Supabase Analytics:**
- Requests per hour (طبيعي؟)
- Slow queries (> 500ms؟)
- Auth errors (> 1%؟)

**SQL query يومي:**
```sql
-- عدد الأحداث الأمنية اليوم
SELECT type, threat_level, COUNT(*) AS cnt
FROM security_events
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY type, threat_level
ORDER BY cnt DESC;

-- Rate limit hits
SELECT COUNT(*) FROM security_events
WHERE type = 'rate_limit_exceeded'
AND created_at > NOW() - INTERVAL '24 hours';

-- Errors في التطبيق
SELECT severity, COUNT(*) FROM error_logs
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY severity;
```

**Supabase Functions logs:**
```bash
supabase functions logs --level error | head -50
```

### 8.3 استجابة للحوادث (Incident Response)

**سيناريو: 500 errors كثيرة على `admin-create-user`**
```bash
# 1. تحقق من الـ logs
supabase functions logs admin-create-user --level error --limit 20

# 2. إذا كان خطأ محدد → hotfix + deploy
supabase functions deploy admin-create-user

# 3. إذا كان اختراق → عطّل function مؤقتاً:
supabase functions delete admin-create-user
# ثم حقّق قبل إعادة النشر
```

**سيناريو: مستخدم مسرَّبة كلمة مروره**
```bash
# استخدم admin-reset-password من الواجهة، أو مباشرة:
curl -X POST "https://<ref>.supabase.co/functions/v1/admin-reset-password" \
  -H "Origin: $APP_ORIGIN" \
  -H "Authorization: Bearer $YOUR_ADMIN_JWT" \
  -d '{"target_user_id":"...","new_password":"NewSecure#2026"}'
```

### 8.4 Metrics أسبوعية للتقييم

```
عدد المستخدمين النشطين
عدد الشركات (tenants)
متوسط عدد الاستعلامات/ثانية
حجم قاعدة البيانات
عدد الأخطاء الحرجة
```

### ✅ قائمة تحقق المرحلة 8
```
[ ] Soft launch أو full launch
[ ] مراقبة يومية للـ 14 يوم الأولى
[ ] SQL query يومي محفوظ ومُشغّل
[ ] فريق on-call مُحدَّد
[ ] Playbook للحوادث الشائعة موثّق
```

---

## 🚨 خطة الاستعادة (Rollback Plan)

### إذا حدث خطأ كارثي في migrations
```sql
-- في Supabase SQL Editor:
-- خيار 1: استعادة من backup (PITR)
-- Dashboard → Database → Point-in-time Recovery → اختر وقت قبل المشكلة

-- خيار 2: rollback يدوي لـ migration معين
-- كل migration له DROP يجب كتابته يدوياً — راجع الملف نفسه
```

### إذا حدث خطأ في Edge Function
```bash
# احذفها فوراً
supabase functions delete <function-name>

# راجع الـ logs
supabase functions logs <function-name> --level error

# نشر النسخة السابقة من Git
git checkout <previous-commit> -- supabase/functions/<name>/
supabase functions deploy <function-name>
```

### إذا حدث خطأ في Frontend
```bash
# Netlify → Deploys → اختر آخر deploy ناجح → "Publish deploy"
# (rollback فوري بلا إعادة بناء)
```

---

## 📞 جهات الاتصال في الأزمات

**قبل الإطلاق، املأ:**
```
Supabase support:      support@supabase.io  (خطة Pro)
OpenRouter support:    ...
Groq support:          ...
Netlify support:       ...
DNS provider:          ...
Domain registrar:      ...
مالك المنتج:            ...
مهندس on-call:         ...
```

---

## 📚 مراجع

- `docs/EDGE_FUNCTIONS_DEPLOYMENT.md` — تفاصيل Edge Functions
- `docs/DATABASE_ARCHITECTURE.md` — schema شامل
- `docs/RLS_ISOLATION_TEST_REPORT_AR.md` — اختبارات العزل
- `docs/ROUTER_FINAL_COMPLETION_REPORT_AR.md` — تفاصيل Router
- `docs/EDGE_FUNCTIONS_HARDENING_COMPLETION_REPORT_AR.md` — تصلّب Edge Functions
- `supabase/migrations/README.md` — دليل Migrations

---

## ✅ قائمة تحقق نهائية قبل "GO LIVE"

```
[ ] 1. كل الأسرار مُدوَّرة (Supabase + AI + ADMS)
[ ] 2. Git history نظيف من الأسرار القديمة
[ ] 3. Staging + Production Supabase projects موجودة
[ ] 4. Sign-ups معطَّلة في production
[ ] 5. PITR + backups مفعّلة
[ ] 6. Migrations نُفِّذت على production بنجاح (78 جدول + RLS)
[ ] 7. Edge Functions منشورة (7 functions)
[ ] 8. Rate limiting يعمل (تم اختباره)
[ ] 9. Escalation prevention يعمل (تم اختباره)
[ ] 10. Frontend منشور على domain حقيقي (HTTPS)
[ ] 11. لا مفاتيح حساسة في bundle
[ ] 12. Multi-tenant isolation مُثبتة يدوياً (شركتين مختلفتين)
[ ] 13. PWA يعمل offline
[ ] 14. مراقبة يومية محضَّرة (SQL queries + Functions logs)
[ ] 15. Rollback plan موثَّق ومفهوم
[ ] 16. جهات الاتصال في الأزمات مسجَّلة
[ ] 17. أول 5-10 مستخدمين تجريبيين متاحون
```

**🎉 عند اكتمال كل الصناديق: أنت جاهز للإنتاج فعلاً.**

---

**التوقيع:** Platform Architect
**الحالة:** ✅ **RUNBOOK جاهز — كل خطوة موثّقة، لا مكان للتخمين**
