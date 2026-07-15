# 🔐 خطة تصلّب Edge Functions — Kyvzon Platform

**التاريخ:** 15 يوليو 2026
**الفرع:** `remediation/p0-security-and-build-health`
**المهندس:** Platform Architect

---

## 🎯 الملخص التنفيذي

Edge Functions هي **آخر ثغرة أمنية معروفة** في المشروع بعد إغلاق SDK layer + RLS + Router. الفحص الحالي كشف **7 دوال** بحالات متباينة:

| Function | حالة الأمان | حالة الجودة |
|---|:---:|:---:|
| `_shared/adminAuth.ts` | 🟢 جيد | 🟡 تحتاج تحسين |
| `admin-create-user` | 🟢 rollback موجود | 🟡 3 مشاكل دقيقة |
| `admin-delete-user` | 🟢 جيد | 🟢 مقبول |
| `admin-reset-password` | 🟢 جيد | 🟡 لا rate limit |
| `admin-toggle-status` | 🟢 جيد | 🟢 مقبول |
| `admin-update-role` | 🟠 escalation risk | 🟡 لا rate limit |
| `ai-chat` | 🟠 لا rate limit | 🟢 auth جيدة |
| `zkteco-sync` | 🟢 HMAC صحيح | 🟢 مقبول |

---

## 🚨 المشكلات المكتشفة

### 🔴 P0: عقد قاعدة البيانات مكسور
`_shared/adminAuth.audit()` يكتب في `security_events` بحقول **قديمة**:
```ts
event_type, actor_id, target_id, description
```
لكن Schema الجديد (بعد Migrations 0007/0010) يستخدم:
```ts
type, user_id, user_name, threat_level, details
```
- ❌ الحقول القديمة **ما زالت موجودة** في الجدول (توافق عكسي)
- ❌ لكن `SecurityEventService` من SDK يستخدم الأعمدة الجديدة
- ❌ النتيجة: **قراءتان مختلفتان لنفس الحدث** — تحليلات مبعثرة

### 🔴 P0: لا Rate Limiting
- أي admin مخترق يستطيع إنشاء 10,000 مستخدم في دقيقة
- أي مستخدم يستطيع استهلاك OpenRouter API بلا حدود
- **خطر مالي حقيقي** على fixture الـ AI

### 🟠 P1: `admin-update-role` — Privilege Escalation Risk
```ts
if (['developer', 'it_admin'].includes(target.profile.role) && context.callerProfile.role !== 'developer') {
  return json(req, { error: 'لا يمكن تعديل مستخدم منصة' }, 403);
}
```
لكن **لا فحص** إذا كان `newRole` هو `developer` أو `it_admin`! أي **admin يستطيع رفع نفسه لـ developer** إذا تلاعب بـ target_id.

### 🟠 P1: `admin-create-user` — فقدان audit عند فشل جزئي
`security_events.insert()` بلا try/catch:
- إذا فشل → exception → 500 → لكن المستخدم أُنشئ بالفعل
- الحل: يجب أن يكون audit fire-and-forget

### 🟡 P2: لا Integration Tests
- تعديل أي function = مخاطرة عمياء
- لا نعرف إذا كان `admin-create-user` يعمل من الصفر
- Deno test infrastructure مطلوب

### 🟡 P2: `ai-chat` بلا حماية موارد
- لا حد للتوكنز الشهرية لكل مستخدم
- لا caching للـ prompts المتكررة
- **الحل الأدنى:** rate limit (10 req/دقيقة/مستخدم)

---

## 🎯 الخطة — 4 مراحل

### 📅 المرحلة 1: إصلاحات أمنية حرجة (P0) — ~60 دقيقة
1. ✅ إصلاح `adminAuth.audit()` ليستخدم schema الجديد
2. ✅ إضافة try/catch لكل audit calls
3. ✅ إصلاح privilege escalation في `admin-update-role`
4. ✅ إصلاح `admin-create-user` schema mismatch

### 📅 المرحلة 2: Rate Limiting (P1) — ~90 دقيقة
1. ✅ إنشاء `_shared/rateLimit.ts` — in-memory rate limiter لكل Edge Function
2. ✅ تطبيقه على:
   - `admin-create-user` (5/دقيقة/admin)
   - `admin-update-role` (10/دقيقة/admin)
   - `admin-reset-password` (3/دقيقة/admin)
   - `admin-delete-user` (3/دقيقة/admin)
   - `admin-toggle-status` (10/دقيقة/admin)
   - `ai-chat` (10/دقيقة/user)
3. ✅ إضافة headers توضيحية: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After`

### 📅 المرحلة 3: Integration Tests (P2) — ~90 دقيقة
1. ✅ إنشاء `supabase/functions/_tests/` directory
2. ✅ اختبار لكل admin function:
   - يفشل بلا Bearer token
   - يفشل بـ non-admin
   - يفشل بـ target خارج tenant
   - ينجح في الحالة السعيدة
   - Rate limit يعمل
3. ✅ تشغيلها بـ `deno test`
4. ✅ إضافة GitHub Action job جديد `edge-functions`

### 📅 المرحلة 4: Observability + Tooling (P2) — ~30 دقيقة
1. ✅ Structured logging helper في `_shared/log.ts`
2. ✅ إضافة `request_id` لكل request (يظهر في headers + logs)
3. ✅ توثيق نشر الـ functions (`docs/EDGE_FUNCTIONS_DEPLOYMENT.md`)
4. ✅ CI check: schema drift بين functions و migrations

---

## 📐 تصميم Rate Limiter

### النموذج: Fixed Window Counter (في الذاكرة)
- بسيط، سريع، بدون Redis
- كل instance من Edge Function له عداده الخاص (Deno instance)
- بعد `windowMs`، يُصفَّر تلقائياً
- في production الجاد → يُستبدل بـ Upstash Redis أو مكافئ

### API المقترح:
```ts
import { checkRateLimit } from '../_shared/rateLimit.ts';

const limit = await checkRateLimit(userId, 'admin-create-user', {
  max: 5,
  windowMs: 60_000,
});
if (!limit.allowed) {
  return json(req, { error: 'Too many requests', retryAfter: limit.retryAfterMs }, 429);
}
```

---

## 📊 معايير القبول (Definition of Done)

```
[ ] adminAuth.audit() يستخدم schema الحالي (type/threat_level/details)
[ ] كل audit call محمي بـ try/catch — لا يُرجع 500
[ ] admin-update-role يمنع escalation إلى developer/it_admin
[ ] admin-create-user يستدعي security event بشكل صحيح
[ ] rate limiter مطبق على 6 functions
[ ] response headers تعرض RateLimit info
[ ] 6+ integration tests تعمل عبر deno test
[ ] GitHub Action job جديد للـ edge-functions
[ ] docs/EDGE_FUNCTIONS_DEPLOYMENT.md موجود
[ ] كل الفحوصات الأخرى ما زالت خضراء (222 test + build + etc)
```

---

**التوقيع:** Platform Architect
**الحالة:** جاهزة للتنفيذ — أبدأ فوراً بالمرحلة 1
