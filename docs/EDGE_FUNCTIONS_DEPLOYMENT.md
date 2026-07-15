# 🚀 دليل نشر Edge Functions — Kyvzon Platform

**آخر تحديث:** 15 يوليو 2026
**المتطلبات:** Supabase CLI ≥ 1.x

---

## 📋 قائمة Functions

| Function | الوصف | Rate Limit | verify_jwt |
|---|---|:---:|:---:|
| `admin-create-user` | إنشاء مستخدم كامل (auth + profile + employee) | 5/min | false |
| `admin-delete-user` | حذف مستخدم | 3/min | false |
| `admin-update-role` | تغيير دور مستخدم | 10/min | false |
| `admin-reset-password` | إعادة تعيين كلمة المرور | 3/min | false |
| `admin-toggle-status` | تفعيل/تعطيل مستخدم | 10/min | false |
| `ai-chat` | استدعاء AI عبر OpenRouter/Groq | 20/min | false |
| `zkteco-sync` | استقبال بصمات ZKTeco (HMAC) | يعتمد على القفل | false |

`verify_jwt = false` لأن كل function تتحقق من الـ JWT بنفسها + تفحص الدور.

---

## 🔑 المتغيرات المطلوبة (Deno Secrets)

قبل النشر، اضبط في **Supabase Dashboard → Edge Functions → Secrets**:

### إلزامية لكل الـ functions
```bash
APP_ORIGIN=https://your-production-domain.com
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # ⚠️ لا تشاركه أبداً
```

### إلزامية لـ ai-chat
```bash
OPENROUTER_API_KEY=sk-or-v1-...
GROQ_API_KEY=gsk_...
```

### إلزامية لـ zkteco-sync
```bash
ADMS_SECRET=<random-32-byte-hex>
# مثال: openssl rand -hex 32
```

### للتحقق
```bash
supabase secrets list
```

---

## 🚢 خطوات النشر

### 1. ربط المشروع (لأول مرة)
```bash
supabase login
supabase link --project-ref <your-project-ref>
```

### 2. نشر كل الـ functions
```bash
supabase functions deploy
```

### 3. نشر function واحدة (بعد تعديل)
```bash
supabase functions deploy admin-create-user
supabase functions deploy ai-chat
```

### 4. عرض logs مباشر
```bash
supabase functions serve --debug          # محلي
supabase functions logs admin-create-user # production
```

---

## ✅ Smoke Tests بعد النشر

اختبر كل function بأمر curl واحد:

### admin-create-user
```bash
curl -X POST 'https://<project>.supabase.co/functions/v1/admin-create-user' \
  -H "Origin: $APP_ORIGIN" \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "smoketest@example.com",
    "password": "SmokeTest#2026",
    "full_name": "اختبار سريع",
    "role": "employee"
  }'
```

**المتوقع:** `201 { success: true, user_id: "..." }`

### التحقق من Rate Limiting
```bash
# نفذ 6 مرات متتالية
for i in {1..6}; do
  curl -X POST 'https://<project>.supabase.co/functions/v1/admin-create-user' \
    -H "Origin: $APP_ORIGIN" \
    -H "Authorization: Bearer $ADMIN_JWT" \
    -d "{\"email\":\"rl-$i@example.com\",\"password\":\"...\",\"full_name\":\"...\",\"role\":\"employee\"}"
done
```

**المتوقع:**
- 5 نجاحات (201)
- 1 فشل (429) مع headers:
  ```
  Retry-After: 60
  X-RateLimit-Limit: 5
  X-RateLimit-Remaining: 0
  ```

### الحصول على ADMIN_JWT للاختبار
```bash
curl -X POST "https://<project>.supabase.co/auth/v1/token?grant_type=password" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"..."}' \
  | jq -r '.access_token'
```

---

## 🛡️ التحقق من الأمان بعد النشر

### 1. تأكد أن APP_ORIGIN محدد
```bash
supabase secrets list | grep APP_ORIGIN
# ⚠️ إن كان فارغاً → كل الطلبات ستُرفض (503 "Function is not configured")
```

### 2. اختبر Origin منع
```bash
curl -X POST 'https://<project>.supabase.co/functions/v1/admin-create-user' \
  -H "Origin: https://evil.com" \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -d '{...}'
# المتوقع: 403 { "error": "Origin not allowed" }
```

### 3. اختبر بدون Bearer token
```bash
curl -X POST 'https://<project>.supabase.co/functions/v1/admin-create-user' \
  -H "Origin: $APP_ORIGIN" \
  -d '{...}'
# المتوقع: 503 (missing auth) أو 401 (invalid session)
```

### 4. اختبر user عادي (ليس admin)
```bash
curl -X POST 'https://<project>.supabase.co/functions/v1/admin-create-user' \
  -H "Origin: $APP_ORIGIN" \
  -H "Authorization: Bearer $EMPLOYEE_JWT" \
  -d '{...}'
# المتوقع: 403 { "error": "غير مخوّل. يتطلب صلاحية إدارية." }
```

### 5. اختبر Privilege Escalation prevention
```bash
# admin يحاول ترقية شخص إلى developer
curl -X POST 'https://<project>.supabase.co/functions/v1/admin-update-role' \
  -H "Origin: $APP_ORIGIN" \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -d '{"target_user_id":"...","new_role":"developer"}'
# المتوقع: 403 { "error": "لا يمكن ترقية مستخدم إلى دور منصة عبر هذه الواجهة" }
```

---

## 🐛 استكشاف الأخطاء

### 503: "Function is not configured"
- `APP_ORIGIN` غير مضبوط. راجع `supabase secrets list`.

### 401: "جلسة غير صالحة"
- JWT منتهي أو غير صالح. أعد login.

### 403: "Origin not allowed"
- Origin request لا يطابق `APP_ORIGIN` المُعرَّف.

### 429: "تجاوزت الحد المسموح"
- Rate limit ضُرب. انتظر Retry-After ثواني.

### 500: "خطأ داخلي في الخادم"
- خطأ غير متوقع. راجع:
  ```bash
  supabase functions logs <function-name> --level error
  ```

---

## 📊 مراقبة الإنتاج (اختياري لكن موصى به)

### 1. تنبيهات Rate Limit hits
```sql
-- استعلام دوري (كل 5 دقائق) في Supabase
SELECT type, COUNT(*)
FROM security_events
WHERE created_at > NOW() - INTERVAL '5 minutes'
  AND type LIKE 'rate_limit%'
GROUP BY type;
```

### 2. تنبيهات فشل audit
```bash
supabase functions logs --level warn | grep "audit() insert failed"
```

### 3. Alerts على 500 errors
```bash
supabase functions logs --level error --format json | \
  jq 'select(.status == 500)'
```

---

## 🔄 CI/CD Integration (مقترح)

في `.github/workflows/deploy-edge-functions.yml` (لم يُنشأ بعد):

```yaml
name: Deploy Edge Functions

on:
  push:
    branches: [main]
    paths: ['supabase/functions/**']

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
      - run: supabase functions deploy --project-ref ${{ secrets.SUPABASE_PROJECT_REF }}
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
```

---

## 📚 مراجع
- [Supabase Edge Functions Docs](https://supabase.com/docs/guides/functions)
- [Deno Runtime](https://deno.land/manual)
- `docs/adr/0004-observability-strategy.md`
- `docs/adr/0006-error-handling-logging-strategy.md`

---

**التوقيع:** Platform Architect
