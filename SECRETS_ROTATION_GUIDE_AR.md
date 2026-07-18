# دليل تدوير الأسرار وتطهير Git — Kyvzon P0

**التاريخ:** 18 يوليو 2026
**السبب:** كانت ملفات .env متتبعة في Git + مفاتيح AI في حزمة المتصفح + مفتاح service_role في كود أمامي سابق

## 1) ما تم إصلاحه في working tree (تم)
- [x] حذف .env و .env.local من Git tracking (git rm --cached)
- [x] إعادة بناء .env.example بدون أسرار، فقط VITE_SUPABASE_URL و ANON_KEY
- [x] إضافة .env و .env.* إلى .gitignore باستثناء .env.example
- [x] نقل AI keys إلى Edge Function secrets (ai-chat)
- [x] إخفاء قيمة مفتاح AI التي كانت في SECRETS_ROTATION_REPORT.md
- [x] إضافة coverage/ إلى .gitignore

## 2) ما لم يُغلق بعد — يحتاج تنفيذ تشغيلي

### 2.1 تطهير تاريخ Git
الأسرار ما زالت في commits سابقة. حذفها من working tree لا يكفي.

**الخطوات:**
```bash
pip install git-filter-repo
./scripts/clean-git-history.sh
# ثم
git push origin --force --all
```

**تحذير:** Force push يعيد كتابة التاريخ — نسق مع الفريق، عطل branch protection مؤقتًا، واطلب من الجميع `git clone` جديد أو `git fetch origin && git reset --hard origin/main`.

### 2.2 تدوير المفاتيح

**Supabase:**
1. Supabase Dashboard → Project → Settings → API → Reset `service_role` key
2. أنشئ anon key جديد إذا لزم
3. حدث Edge Secrets:
```bash
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=xxx OPENROUTER_API_KEY=yyy GROQ_API_KEY=zzz APP_ORIGIN=https://staging.kyvzon.com
supabase functions deploy ai-chat admin-create-user admin-delete-user admin-update-role admin-reset-password admin-toggle-status
```

**AI Providers:**
- OpenRouter Dashboard → Regenerate API key
- Groq Dashboard → Regenerate

**ZKTeco:**
- ADMS_SECRET جديد + توزيعه على الأجهزة

### 2.3 التحقق

```bash
# لا يجب أن يعيد شيئًا
git log --all -p | grep -E "SUPABASE_SERVICE|sk-[a-zA-Z0-9]{20}|OPENROUTER"

# فحص CI يمنع تتبع .env
git ls-files | grep "^\.env$"
# يجب أن يعيد فقط .env.example
```

## 3) تعليمات للمطورين

- لا تضع أبداً service_role أو API keys في VITE_* variables
- استخدم .env.local (غير متتبع) محلياً
- أسرار الخادم فقط في Supabase Edge Function secrets
- قبل commit، شغل: `npm run db:contract-check` للتأكد من عدم تسريب VITE secret references

## 4) حالة التنفيذ

| البند | الحالة | التاريخ |
|---|---|---|
| حذف .env من working tree | ✅ DONE | 13 يوليو 2026 |
| .env.example نظيف | ✅ DONE | 13 يوليو |
| تطهير تاريخ Git | ⏳ TODO — يحتاج force push | — |
| تدوير Supabase keys | ⏳ TODO — يدوي في Dashboard | — |
| تدوير AI keys | ⏳ TODO — يدوي | — |
| تحديث Edge secrets | ⏳ TODO — بعد التدوير | — |

**مالك المهمة:** Security Lead + DevOps
**الأولوية:** P0 — قبل أي نشر production
