# دليل تفعيل المزوّدين الشامل — منصة Kyvzon
### من "محاكاة" إلى "حقيقي" — قناة بقناة، بلغة مبسّطة

> **الفكرة الموحّدة:** كل قناة بُنيت بنمط ذكي — تعمل بالمحاكاة الآن، وتتحوّل حقيقية **تلقائياً**
> بمجرد وضع مفتاحها على Supabase. **لا حاجة لأي تعديل كود.**
>
> **رقم المشروع (project-ref):** `ukqxxalosnmzsgothpps`
>
> **صيغة وضع أي مفتاح** (من PowerShell في مجلد المشروع):
> ```powershell
> supabase secrets set اسم_المفتاح="القيمة" --project-ref ukqxxalosnmzsgothpps
> ```
>
> **لعرض المفاتيح المضبوطة حالياً:**
> ```powershell
> supabase secrets list --project-ref ukqxxalosnmzsgothpps
> ```

---

## جدول الحالة السريع

| القناة | المزوّد | الحالة | يحتاج حساباً؟ |
|--------|---------|--------|----------------|
| 📧 البريد | Resend | ✅ **مُفعّل** | — |
| 📱 SMS/واتساب | Twilio | ⏳ جاهز | نعم (مدفوع) |
| 💳 الدفع | Stripe | ⏳ جاهز | نعم (مجاني للتجربة) |
| ✨ إثراء البيانات | Clearbit | ⏳ جاهز | نعم |
| 🔴 البث | Zoom | ✅ يدوي يعمل / تلقائي جاهز | للتلقائي فقط |
| ✍️ التوقيع الإلكتروني | DocuSign | ✅ داخلي يعمل / عن بُعد جاهز | لعن بُعد فقط |
| 📢 التواصل الاجتماعي | Meta/LinkedIn | ⏳ جاهز | نعم (مراجعة تطبيق) |
| 📥 مزامنة البريد (Auto-log) | Gmail | ⏳ جاهز | نعم (Google Cloud) |
| 💰 الربط المالي | داخلي | ✅ **يعمل فوراً** | لا |

---

## 📧 1) البريد الإلكتروني (Resend) — ✅ مُفعّل

**الحالة:** يعمل فعلياً (جُرّب بنجاح).

**المفاتيح:**
```powershell
supabase secrets set RESEND_API_KEY="re_..." --project-ref ukqxxalosnmzsgothpps
supabase secrets set RESEND_FROM="onboarding@resend.dev" --project-ref ukqxxalosnmzsgothpps
```
**عند الإطلاق:** بعد ربط نطاق `kyvzon.com` في Resend → غيّر `RESEND_FROM="noreply@kyvzon.com"`.

**التأكد:** بوابة التسويق → البريد → حملة → إرسال → يصل البريد + الحالة `delivered`.

---

## 📱 2) SMS / واتساب (Twilio)

**كيف تنشئ الحساب:**
1. اذهب إلى **twilio.com** → Sign Up (يتطلب بطاقة ائتمان — مدفوع بالاستخدام).
2. من لوحة التحكم (Console) خذ: **Account SID** و**Auth Token**.
3. اشترِ رقم مرسِل: **Phone Numbers → Buy a number** (اختر رقماً يدعم SMS).
4. لواتساب: فعّل **WhatsApp Sender** (يتطلب موافقة Meta عبر Twilio).

**المفاتيح:**
```powershell
supabase secrets set TWILIO_ACCOUNT_SID="AC..." --project-ref ukqxxalosnmzsgothpps
supabase secrets set TWILIO_AUTH_TOKEN="..." --project-ref ukqxxalosnmzsgothpps
supabase secrets set TWILIO_SMS_FROM="+1234567890" --project-ref ukqxxalosnmzsgothpps
supabase secrets set TWILIO_WHATSAPP_FROM="whatsapp:+1234567890" --project-ref ukqxxalosnmzsgothpps
```

**التأكد:** بوابة التسويق → الرسائل → حملة SMS → إرسال → تصل الرسالة + الحالة `sent`.

---

## 💳 3) الدفع — تذاكر الفعاليات (Stripe)

**كيف تنشئ الحساب:**
1. اذهب إلى **stripe.com** → Sign Up (مجاني، وضع اختبار Test Mode بلا بطاقة).
2. من **Developers → API keys** خذ **Secret key** (يبدأ بـ `sk_test_...` للتجربة).
3. من **Developers → Webhooks → Add endpoint**:
   - URL: `https://ukqxxalosnmzsgothpps.supabase.co/functions/v1/event-payment-webhook`
   - الحدث: `checkout.session.completed`
   - خذ **Signing secret** (يبدأ بـ `whsec_...`).

**المفاتيح:**
```powershell
supabase secrets set STRIPE_SECRET_KEY="sk_test_..." --project-ref ukqxxalosnmzsgothpps
supabase secrets set STRIPE_WEBHOOK_SECRET="whsec_..." --project-ref ukqxxalosnmzsgothpps
```

**التأكد:** فعالية بتذكرة مدفوعة → تسجيل → زر "دفع" → تُفتح صفحة Stripe → ادفع (بطاقة اختبار `4242 4242 4242 4242`) → التسجيل يصبح `paid` تلقائياً.

---

## ✨ 4) إثراء بيانات الحسابات (Clearbit)

**كيف تنشئ الحساب:**
1. اذهب إلى **clearbit.com** (أصبح ضمن HubSpot) → أنشئ حساباً.
2. خذ **API Key** من إعدادات الحساب.

**المفتاح:**
```powershell
supabase secrets set CLEARBIT_API_KEY="sk_..." --project-ref ukqxxalosnmzsgothpps
```

**التأكد:** بوابة CRM → الحسابات → افتح حساباً له موقع إلكتروني → زر "إثراء" → تُملأ الحقول الفارغة (قطاع/موظفون/إيراد) تلقائياً — دون طمس ما أدخلته يدوياً.

> **ملاحظة:** الإثراء يعتمد على **نطاق موقع** الحساب (website). أضف الموقع أولاً.

---

## 🔴 5) البث المباشر (Zoom) — للفعاليات الافتراضية

**المسار اليدوي (يعمل الآن بلا مفتاح):** في صفحة الفعالية الافتراضية → بطاقة "البث" → الصق رابط اجتماع Zoom/Teams يدوياً → احفظ. **هذا كافٍ لمعظم الحالات.**

**المسار التلقائي (اختياري — يتطلب مفاتيح):**
1. اذهب إلى **marketplace.zoom.us** → Develop → Build App → **Server-to-Server OAuth**.
2. خذ: **Account ID**، **Client ID**، **Client Secret**.
3. فعّل صلاحية `meeting:write`.

**المفاتيح:**
```powershell
supabase secrets set ZOOM_ACCOUNT_ID="..." --project-ref ukqxxalosnmzsgothpps
supabase secrets set ZOOM_CLIENT_ID="..." --project-ref ukqxxalosnmzsgothpps
supabase secrets set ZOOM_CLIENT_SECRET="..." --project-ref ukqxxalosnmzsgothpps
```

**التأكد:** فعالية افتراضية → بطاقة البث → زر "إنشاء تلقائي (Zoom)" → يُنشأ اجتماع ويُحفظ رابطه.

---

## ✍️ 6) التوقيع الإلكتروني (DocuSign)

**المسار الداخلي (يعمل الآن بلا مفتاح):** موظف يوقّع نيابة بسجل قانوني (اسم/بريد/IP/وقت). كافٍ للتوقيع الداخلي.

**المسار عن بُعد (اختياري — العميل يوقّع بنفسه):**
1. اذهب إلى **developers.docusign.com** → أنشئ حساب تطوير مجاني.
2. أنشئ تطبيقاً واحصل على: **Integration Key**، **User ID**، **Account ID**.
3. أنشئ **RSA Keypair** واحفظ المفتاح الخاص (Private Key).
4. امنح موافقة (consent) للتطبيق مرة واحدة.
5. أعدّ **Connect webhook** يشير إلى:
   `https://ukqxxalosnmzsgothpps.supabase.co/functions/v1/crm-signature-webhook?secret=<سرّك>`

**المفاتيح:**
```powershell
supabase secrets set DOCUSIGN_INTEGRATION_KEY="..." --project-ref ukqxxalosnmzsgothpps
supabase secrets set DOCUSIGN_USER_ID="..." --project-ref ukqxxalosnmzsgothpps
supabase secrets set DOCUSIGN_ACCOUNT_ID="..." --project-ref ukqxxalosnmzsgothpps
supabase secrets set DOCUSIGN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----..." --project-ref ukqxxalosnmzsgothpps
supabase secrets set DOCUSIGN_BASE_URI="https://demo.docusign.net" --project-ref ukqxxalosnmzsgothpps
supabase secrets set DOCUSIGN_OAUTH_BASE="account-d.docusign.com" --project-ref ukqxxalosnmzsgothpps
supabase secrets set DOCUSIGN_WEBHOOK_SECRET="سرّ_قوي_تختاره" --project-ref ukqxxalosnmzsgothpps
```
> للإنتاج: `DOCUSIGN_BASE_URI="https://www.docusign.net"` و`DOCUSIGN_OAUTH_BASE="account.docusign.com"`.

**التأكد:** عرض CRM → إرسال للتوقيع → يصل العميل بريد DocuSign → يوقّع → العرض يصبح `signed` + عقد تلقائي.

---

## 📢 7) التواصل الاجتماعي (Meta / LinkedIn) — OAuth

**⚠️ الأعقد:** يتطلب تسجيل تطبيق ومراجعة من المنصة (قد تأخذ أياماً/أسابيع).

**كيف (مثال Meta/Facebook):**
1. اذهب إلى **developers.facebook.com** → أنشئ تطبيقاً (نوع: Business).
2. أضف منتج **Facebook Login** + صلاحيات `pages_manage_posts`.
3. خذ **App ID** و**App Secret**.
4. أضف **Valid OAuth Redirect URI**:
   `https://ukqxxalosnmzsgothpps.supabase.co/functions/v1/social-oauth-callback`
5. اطلب مراجعة التطبيق (App Review) لتفعيل الصلاحيات للعامة.

**المفاتيح:**
```powershell
supabase secrets set META_APP_ID="..." --project-ref ukqxxalosnmzsgothpps
supabase secrets set META_APP_SECRET="..." --project-ref ukqxxalosnmzsgothpps
supabase secrets set LINKEDIN_CLIENT_ID="..." --project-ref ukqxxalosnmzsgothpps
supabase secrets set LINKEDIN_CLIENT_SECRET="..." --project-ref ukqxxalosnmzsgothpps
supabase secrets set OAUTH_REDIRECT_BASE="https://ukqxxalosnmzsgothpps.supabase.co/functions/v1/social-oauth-callback" --project-ref ukqxxalosnmzsgothpps
supabase secrets set OAUTH_STATE_SECRET="سرّ_عشوائي_طويل" --project-ref ukqxxalosnmzsgothpps
```

**التأكد:** بوابة التسويق → التواصل الاجتماعي → ربط حساب → يُعاد توجيهك لموافقة Meta → يعود متصلاً.

> **أمان:** رموز OAuth تُحفظ في خزنة سرّية (RLS بلا سياسة قراءة) — لا تصل المتصفح إطلاقاً.

---

## 📥 8) مزامنة البريد التلقائي (Gmail Auto-Logging)

**⚠️ متقدّم:** يتطلب مشروع Google Cloud + مراجعة OAuth.

**كيف:**
1. اذهب إلى **console.cloud.google.com** → أنشئ مشروعاً → فعّل **Gmail API**.
2. أنشئ **OAuth 2.0 Client** (نوع: Web) → خذ Client ID/Secret.
3. أضف redirect URI للـ callback المخصص.
4. اطلب مراجعة النطاقات الحساسة (Gmail read).

> البنية جاهزة (جداول رموز آمنة + حالة مزامنة). التوصيل الكامل لمزامنة Gmail يُبنى عند تجهيز مشروع Google Cloud.

---

## 💰 9) الربط المالي (CRM → المحاسبة) — ✅ يعمل فوراً

**لا يحتاج أي مفتاح.** عند فوز صفقة في CRM → يُنشأ "عميل مالي" مرتبط تلقائياً (يستخدم الكيان القانوني الافتراضي).

**التأكد:** بوابة CRM → صفقة → إغلاق (فوز) → يُنشأ عميل مالي + يظهر "مربوطة بالنظام المالي ✓".

---

## قواعد عامة مهمة

1. **بعد ضبط أي مفتاح، لا حاجة لإعادة نشر الوسيط** — الوسيط يقرأ المفتاح لحظياً. (لكن إن غيّرت كود الوسيط، أعد نشره.)
2. **الأمان:** كل المفاتيح تُحفظ في Supabase Secrets (لا في الكود، لا في المتصفح). الوسطاء وحدهم يقرؤونها.
3. **الرجوع الآمن:** بلا مفتاح، كل قناة تعمل بالمحاكاة — لا شيء يتعطّل.
4. **الاختبار أولاً:** جرّب كل قناة في وضع المزوّد التجريبي (test) قبل الإنتاج.

---

## أوامر نشر الوسطاء (مرجع — إن احتجت إعادة النشر)
```powershell
supabase functions deploy marketing-send-email --project-ref ukqxxalosnmzsgothpps
supabase functions deploy marketing-send-sms --project-ref ukqxxalosnmzsgothpps
supabase functions deploy event-create-payment --project-ref ukqxxalosnmzsgothpps
supabase functions deploy event-payment-webhook --no-verify-jwt --project-ref ukqxxalosnmzsgothpps
supabase functions deploy crm-enrich-account --project-ref ukqxxalosnmzsgothpps
supabase functions deploy event-create-stream --project-ref ukqxxalosnmzsgothpps
supabase functions deploy crm-send-signature --project-ref ukqxxalosnmzsgothpps
supabase functions deploy crm-signature-webhook --no-verify-jwt --project-ref ukqxxalosnmzsgothpps
supabase functions deploy social-oauth-start --project-ref ukqxxalosnmzsgothpps
supabase functions deploy social-oauth-callback --no-verify-jwt --project-ref ukqxxalosnmzsgothpps
```
> الـ webhooks وcallback الـ OAuth تُنشر بـ `--no-verify-jwt` (مصادرها خارجية بلا توكن مستخدم؛ أمانها عبر التوقيع/السرّ/الـ state).

---
*دليل تفعيل المزوّدين · منصة Kyvzon · محدّث حسب الكود الفعلي*
