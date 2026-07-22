# دليل توصيل البريد الحقيقي (Resend) — بوابة التسويق Kyvzon
### من "محاكاة" إلى "إرسال فعلي" — خطوة بخطوة، بلغة مبسّطة

---

## الفكرة في سطر واحد
تطبيقك لا يرسل البريد بنفسه — يعطيه لشركة متخصصة (**Resend**) توصّله فعلياً. المفتاح السرّي لهذه الشركة يُحفظ بأمان على Supabase، ووسيط آمن (**Edge Function**) هو من يستدعيها.

```
تطبيقك  →  Edge Function (marketing-send-email)  →  Resend  →  صندوق بريد العميل
```

---

## ما الذي بُني بالفعل (جاهز — لا تفعل شيئاً)
| المكوّن | الملف | الحالة |
|---------|------|--------|
| الوسيط الآمن (Edge Function) | `supabase/functions/marketing-send-email/index.ts` | ✅ جاهز |
| دعم مزوّد resend في قاعدة البيانات | `supabase/migrations/0171_email_provider_resend.sql` | ✅ جاهز |
| دالة الإرسال في الواجهة | `emailDeliveryService.sendEmailLive()` | ✅ جاهزة |

**النتيجة:** كل البنية جاهزة. ينقص فقط **مفتاح Resend** (تضعه أنت) — وبمجرد وضعه يتحول الإرسال من محاكاة إلى حقيقي تلقائياً.

---

## ما الذي عليك أنت فعله (3 خطوات)

### الخطوة 1 — أنشئ حساب Resend وخذ المفتاح
1. اذهب إلى **resend.com** → اضغط **Sign Up** (مجاناً، بلا بطاقة ائتمان، 3000 بريد/شهر).
2. سجّل ببريدك أو حساب Google.
3. من القائمة الجانبية → **API Keys** → **Create API Key**.
4. انسخ المفتاح (يبدأ بـ `re_...`) — **احفظه بأمان، لن يُعرَض مرة أخرى.**

> **للتجربة الآن:** لا تحتاج نطاقاً (kyvzon.com). Resend يوفّر مرسِلاً تجريبياً `onboarding@resend.dev` يعمل فوراً — لكنه يرسل فقط إلى بريدك المسجّل في Resend.

### الخطوة 2 — ضع المفتاح على Supabase (أمر واحد)
من PowerShell في مجلد مشروعك:
```powershell
supabase secrets set RESEND_API_KEY="re_ضع_مفتاحك_هنا" --project-ref ukqxxalosnmzsgothpps
```
(اختياري) لتحديد اسم المرسِل الافتراضي:
```powershell
supabase secrets set RESEND_FROM="onboarding@resend.dev" --project-ref ukqxxalosnmzsgothpps
```

### الخطوة 3 — انشر الوسيط + طبّق migration
```powershell
supabase functions deploy marketing-send-email --project-ref ukqxxalosnmzsgothpps
supabase db push --project-ref ukqxxalosnmzsgothpps
```

**انتهى.** الآن الإرسال حقيقي.

---

## كيف تتأكد أنه يعمل؟ (3 مستويات — الأهم)

### ① اختبار المفتاح مباشرة (أسرع تأكيد — 10 ثوانٍ)
من PowerShell (استبدل بريدك ومفتاحك):
```powershell
curl -X POST https://api.resend.com/emails `
  -H "Authorization: Bearer re_مفتاحك" `
  -H "Content-Type: application/json" `
  -d '{\"from\":\"onboarding@resend.dev\",\"to\":\"بريدك@gmail.com\",\"subject\":\"اختبار Kyvzon\",\"html\":\"<b>وصل البريد!</b>\"}'
```
✅ **دليل النجاح:** يصلك البريد على صندوقك خلال ثوانٍ + يرجع الرد `{"id":"..."}`.

### ② اختبار الوسيط (Edge Function)
من داخل التطبيق (Console المتصفح بعد تسجيل الدخول كمستخدم تسويق)، أو عبر أي أداة تستدعي:
```
POST https://ukqxxalosnmzsgothpps.supabase.co/functions/v1/marketing-send-email
```
✅ **دليل النجاح:** الرد `{ "mode": "live", "ok": true, "id": "..." }`.
- إن رجع `{ "mode": "simulated" }` → المفتاح لم يُضبط بعد (راجع الخطوة 2).

### ③ اختبار من داخل بوابة التسويق (End-to-End)
1. سجّل دخول بحساب دوره `marketing`.
2. أنشئ حملة بريد + أضف مشتركاً (بريدك أنت).
3. اضغط إرسال.
✅ **دليل النجاح القاطع:** يصلك البريد فعلياً + حالة الرسالة في لوحة التحكم تتحوّل من `simulated` إلى `sent`/`delivered`.

---

## لاحقاً عند الإطلاق: التحويل إلى @kyvzon.com
عندما تشتري نطاق `kyvzon.com` وتنشر الموقع:
1. في Resend → **Domains** → **Add Domain** → اكتب `kyvzon.com`.
2. انسخ السجلات (SPF/DKIM/DMARC) التي يعطيك إياها.
3. أضفها في إعدادات DNS لنطاقك (حيث اشتريته).
4. انتظر التحقق (Verified ✓).
5. حدّث المرسِل:
```powershell
supabase secrets set RESEND_FROM="noreply@kyvzon.com" --project-ref ukqxxalosnmzsgothpps
```
**لا حاجة لأي تعديل كود** — تغيير سطر secret واحد فقط.

---

## أسئلة شائعة

**هل الأمان مضمون؟** نعم. المفتاح يُحفظ في Supabase Secrets (لا يُكشف للمتصفح أبداً). الوسيط يتحقق من تسجيل الدخول (JWT) ودور المستخدم (marketing) قبل الإرسال.

**ماذا لو لم أضع المفتاح؟** لا شيء يتعطّل — النظام يعمل بوضع المحاكاة كما كان (`mode: simulated`).

**ما تكلفة Resend؟** مجاني حتى 3000 بريد/شهر. بعدها خطط رخيصة.

**هل نفس النمط يصلح للرسائل النصية/واتساب؟** نعم تماماً — نفس البنية (Edge Function + Secret) لكن مع Twilio بدل Resend. نبنيها بنفس الطريقة عند الحاجة.

---

## تقسيم الأدوار (تذكير)
| المهمة | المسؤول |
|--------|---------|
| إنشاء حساب Resend + أخذ المفتاح | **أنت** |
| وضع المفتاح على Supabase (خطوة 2) | **أنت** |
| نشر الوسيط + migration (خطوة 3) | **أنت** |
| بناء الوسيط + دالة الواجهة + migration | ✅ **تم (الوكيل)** |
| التأكد أن البريد يصل | **معاً** |

---
*دليل بوابة التسويق — توصيل البريد الحقيقي · Kyvzon Platform*
