# دليل تفعيل المزوّدين الشامل — منصة Kyvzon
### من "محاكاة" إلى "حقيقي" — قناة بقناة، بلغة مبسّطة

> **الفكرة الموحّدة:** كل قناة بُنيت بنمط ذكي — تعمل بالمحاكاة الآن، وتتحوّل حقيقية **تلقائياً**
> بمجرد وضع مفتاحها. **لا حاجة لأي تعديل كود.**
>
> **رقم المشروع (project-ref):** `ukqxxalosnmzsgothpps`

---

## 🔑 مهم جداً: نظام المفتاحين (BYOK) — اقرأ هذا أولاً

منذ تحديث **BYOK** (Bring Your Own Key = "كل شركة بمفتاحها الخاص")، صار لكل قناة **مساران للمفاتيح**. افهم الفرق جيداً لأنه يغيّر طريقة عملك:

**تشبيه:** تخيّل مبنى مكاتب مؤجّراً لشركات. هناك مصدران للكهرباء:
- **الكهرباء العامة للمبنى** = مفتاح المنصة (أنت تضبطه، احتياطي للجميع).
- **عدّاد كهرباء خاص لكل مكتب** = مفتاح الشركة (كل شركة تُدخله بنفسها، وتدفع فاتورتها).

| | 🏢 مفتاح المنصة (احتياطي) | 🏪 مفتاح الشركة (الأساسي — BYOK) |
|---|---|---|
| **من يضبطه؟** | أنت (صاحب المنصة) | كل شركة عميلة بنفسها |
| **أين يُضبط؟** | عبر `supabase secrets set` (سطر أوامر) | من الواجهة: `/app/marketing/integrations` |
| **باسم من يُرسَل؟** | باسم المنصة/عام | **باسم الشركة نفسها وعلى فاتورتها** |
| **متى يُستخدم؟** | إن لم تُدخل الشركة مفتاحها | دائماً حين يكون موجوداً (له الأولوية) |

**ترتيب الأولوية عند كل إرسال** (النظام يجرّب بالترتيب):
1. **مفتاح الشركة** (إن أدخلته الشركة) → يُرسَل باسمها. ✅ الأفضل
2. **مفتاح المنصة** (احتياطي) → إن لم يوجد مفتاح شركة.
3. **محاكاة** (`simulated`) → إن لم يوجد أي مفتاح — لا شيء يتعطّل، فقط يُسجَّل كتجربة.

> **الأمان:** مفتاح الشركة يُحفظ في خزنة سرّية داخل قاعدة البيانات (RLS بلا سياسة قراءة). **بعد الحفظ يختفي** ولا يُعرَض إلا كـ "مربوط ✓ …آخر 4 أحرف". لا المتصفح ولا حتى الشركة نفسها تراه ثانيةً — يقرؤه الوسيط فقط لحظة الإرسال.

---

## 🏪 المسار (أ) — كيف تربط **شركة** مفتاحها من الواجهة (BYOK)

هذا ما تفعله **كل شركة عميلة** بنفسها — بلا أي سطر أوامر:

1. تسجّل الدخول لحسابها في Kyvzon (بدور تسويق/مدير).
2. تفتح: **بوابة التسويق ← "ربط المزوّدين"** (الرابط: `/app/marketing/integrations`).
3. تختار المزوّد (مثلاً: البريد Resend) وتضغط "ربط".
4. تُدخل **المفتاح السرّي** + أي إعدادات إضافية (مثل بريد المُرسِل).
5. تحفظ → تظهر الحالة **"مربوط ✓ …last4"**. من الآن كل إرسالها يتم بمفتاحها.

**ماذا يُدخل في كل مزوّد؟** (السرّ + الإعدادات):

| القناة | المزوّد | 🔒 الحقل السرّي | ⚙️ الإعدادات الإضافية (config) |
|--------|---------|------------------|-------------------------------|
| البريد | Resend | مفتاح Resend API (`re_...`) | بريد المُرسِل (from_email) |
| SMS/واتساب | Twilio | Auth Token | Account SID · رقم SMS · رقم واتساب |
| الدفع | Stripe | Secret Key (`sk_...`) | Webhook Signing Secret (`whsec_...`) |
| إثراء البيانات | Clearbit | Clearbit API Key | — |
| البث | Zoom | Client Secret | Account ID · Client ID |
| التوقيع | DocuSign | Private Key (PEM كامل) | Integration Key · User ID · Account ID · Base URI · OAuth Base |
| تواصل (Meta) | Meta | App Secret | App ID |
| تواصل (LinkedIn) | LinkedIn | Client Secret | Client ID (app_id) |

> **قاعدة ذهبية:** ما يُدخل في "الحقل السرّي" هو الشيء الذي **يجب ألا يُكشف أبداً** (كلمة السر الحقيقية). أما "الإعدادات" فهي معرّفات عامة (أرقام/معرّفات) ليست سرّية بذاتها لكنها لازمة للاتصال.

---

## 🏢 المسار (ب) — كيف تضبط **أنت** مفتاح المنصة الاحتياطي (Secrets)

هذا اختياري — تفعله فقط إن أردت مفتاحاً احتياطياً يعمل للشركات التي لم تُدخل مفتاحها بعد.

> **صيغة وضع أي مفتاح** (من PowerShell في مجلد المشروع):
> ```powershell
> supabase secrets set اسم_المفتاح="القيمة" --project-ref ukqxxalosnmzsgothpps
> ```
>
> **لعرض المفاتيح المضبوطة حالياً:**
> ```powershell
> supabase secrets list --project-ref ukqxxalosnmzsgothpps
> ```

الأقسام التالية (لكل قناة) تشرح **المسار (ب)** — مفاتيح المنصة. لكن تذكّر: أي شركة تقدر تتجاوز هذا بمفتاحها الخاص من الواجهة.

---

## جدول الحالة السريع

> ✅ **كل القنوات تدعم BYOK الآن** (مطبّق ومنشور — migration 0178 + الوسطاء الثمانية). أي شركة تربط مفتاحها من `/app/marketing/integrations`.

| القناة | المزوّد | الحالة | BYOK؟ | يحتاج حساباً؟ |
|--------|---------|--------|:-----:|----------------|
| 📧 البريد | Resend | ✅ **مُفعّل** | ✅ | — |
| 📱 SMS/واتساب | Twilio | ⏳ جاهز | ✅ | نعم (مدفوع) |
| 💳 الدفع | Stripe | ⏳ جاهز | ✅ | نعم (مجاني للتجربة) |
| ✨ إثراء البيانات | Clearbit | ⏳ جاهز | ✅ | نعم |
| 🔴 البث | Zoom | ✅ يدوي يعمل / تلقائي جاهز | ✅ | للتلقائي فقط |
| ✍️ التوقيع الإلكتروني | DocuSign | ✅ داخلي يعمل / عن بُعد جاهز | ✅ | لعن بُعد فقط |
| 📢 التواصل الاجتماعي | Meta/LinkedIn | ⏳ جاهز | ✅ | نعم (مراجعة تطبيق) |
| 📥 مزامنة البريد (Auto-log) | Gmail | ⏳ جاهز | — | نعم (Google Cloud) |
| 💰 الربط المالي | داخلي | ✅ **يعمل فوراً** | — | لا |

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

# 🧪 دليل الاختبار اليدوي — جرّب النظام كأنك شركة عميلة

> **الهدف:** تجلس أمام الشاشة وتتصرّف تماماً كأنك شركة اشتركت للتو. تُدخل مفتاحك، تُرسل بمفتاحك، وتتأكد بعينك أن كل شيء يعمل. هذا يكشف ما لا تكشفه الاختبارات الآلية.
>
> **الوقت المتوقع:** ~20 دقيقة للاختبار الأساسي (البريد). المفتاح الوحيد الجاهز فعلياً عندك الآن هو **Resend** — لذا سنركّز عليه، وبقية القنوات تُختبر بنفس النمط عند توفّر مفاتيحها.

## 🎬 قبل أن تبدأ — جهّز بيئة الاختبار

**1) شغّل الواجهة محلياً** (من PowerShell في مجلد المشروع):
```powershell
npm run dev
```
> ثم افتح المتصفح على `http://localhost:5173`.

**2) تأكد أن `APP_ORIGIN` يسمح لبيئتك المحلية** (مرّة واحدة — يمنع خطأ CORS):
```powershell
supabase secrets set APP_ORIGIN="http://localhost:5173" --project-ref ukqxxalosnmzsgothpps
```
> **لماذا؟** الوسطاء ترفض أي طلب من مصدر غير مصرّح به (حماية). هذا السطر يقول لها "اسمح لجهازي المحلي".

**3) جهّز مفتاح Resend للتجربة:** أنشئ حساباً مجانياً على **resend.com** وخذ مفتاح API (يبدأ بـ `re_`).
> Resend يسمح بالإرسال المجاني إلى بريدك المسجّل حتى قبل توثيق نطاق.

---

## ✅ الاختبار (1): البريد بمفتاح الشركة (BYOK) — الأهم

هذا هو الاختبار الجوهري: يثبت أن شركة تستطيع الإرسال **بمفتاحها هي**.

| # | الخطوة | ما يجب أن تراه |
|---|--------|----------------|
| 1 | سجّل الدخول لحساب فيه دور **تسويق/مدير/مطوّر** | تصل للوحة التحكم |
| 2 | من القائمة: **بوابة التسويق ← ربط المزوّدين** (`/app/marketing/integrations`) | صفحة فيها بطاقات المزوّدين (البريد، SMS، الدفع…) |
| 3 | في بطاقة **البريد (Resend)** اضغط "ربط" | يظهر حقل إدخال المفتاح + حقل "بريد المُرسِل" |
| 4 | الصق مفتاح Resend في الحقل السرّي، واكتب بريد المُرسِل (مثلاً `onboarding@resend.dev`)، ثم احفظ | تتغيّر البطاقة إلى **"مربوط ✓ …" + آخر 4 أحرف** فقط |
| 5 | **حدّث الصفحة (F5)** ثم افتح بطاقة البريد ثانيةً | المفتاح **لا يظهر** — فقط "مربوط ✓ …last4". هذا دليل الأمان ✅ |
| 6 | اذهب: **بوابة التسويق ← البريد ← إنشاء حملة** | نموذج حملة (عنوان، موضوع، محتوى) |
| 7 | أنشئ حملة بسيطة، وأضف مشتركاً بريده **بريدك الشخصي** (لتستقبل الاختبار) | يُحفظ المشترك |
| 8 | اضغط **إرسال** | رسالة نجاح تشير إلى الوضع الفعلي (`live`) وليس محاكاة |
| 9 | افتح بريدك الشخصي | **يصل البريد فعلياً** — من عنوان المُرسِل الذي أدخلته ✅ |
| 10 | ارجع لتفاصيل الحملة | حالة الإرسال تظهر (sent/delivered) + معرّف الرسالة |

**🎯 معيار النجاح:** وصل بريد حقيقي إلى صندوقك، مُرسَل بمفتاحك أنت (لا بمفتاح المنصة).

### 🔍 كيف تتأكد 100% أنه استُخدم مفتاح الشركة لا المنصة؟
- **الطريقة الأوضح:** استخدم في الشركة مفتاح Resend مختلف عن `RESEND_API_KEY` المضبوط على المنصة (أو احذف مفتاح المنصة مؤقتاً بـ `supabase secrets unset RESEND_API_KEY`). إن وصل البريد رغم غياب مفتاح المنصة → فهو بالتأكيد استخدم مفتاح الشركة. ✅
- **من لوحة Resend:** ادخل حساب Resend الخاص بالشركة → **Logs** → سترى الرسالة المُرسَلة مسجّلة في حساب الشركة.

### ❌ اختبار "الرجوع الآمن" (مهم — يثبت أن لا شيء يتعطّل)
1. من "ربط المزوّدين" احذف مفتاح البريد (فكّ الربط).
2. تأكد أن مفتاح المنصة `RESEND_API_KEY` غير مضبوط أيضاً.
3. أرسل حملة ثانية.
4. **المتوقع:** لا يتعطّل شيء — رسالة تقول "تم التسجيل كمحاكاة" (`simulated`). النظام يبقى مستقراً بلا أي مفتاح. ✅

---

## ✅ الاختبار (2): بقية القنوات (عند توفّر مفاتيحها)

كل قناة تُختبر بنفس النمط الثلاثي. جهّز مفتاح المزوّد أولاً (راجع قسمه أعلاه)، ثم:

| القناة | أين تُدخل المفتاح | كيف تختبر | معيار النجاح |
|--------|-------------------|-----------|---------------|
| 📱 SMS (Twilio) | ربط المزوّدين ← Twilio | التسويق ← الرسائل ← حملة SMS ← إرسال لرقمك | تصل رسالة SMS لهاتفك |
| 💳 الدفع (Stripe) | ربط المزوّدين ← Stripe | فعالية بتذكرة مدفوعة ← تسجيل ← دفع (بطاقة `4242 4242 4242 4242`) | التسجيل يصبح `paid` |
| ✨ الإثراء (Clearbit) | ربط المزوّدين ← Clearbit | CRM ← حساب له موقع ← زر "إثراء" | تُملأ الحقول الفارغة تلقائياً |
| 🔴 البث (Zoom) | ربط المزوّدين ← Zoom | فعالية افتراضية ← "إنشاء تلقائي (Zoom)" | يُنشأ رابط اجتماع |
| ✍️ التوقيع (DocuSign) | ربط المزوّدين ← DocuSign | عرض CRM ← "إرسال للتوقيع" | يصل العميل بريد توقيع |
| 📢 تواصل (Meta/LinkedIn) | ربط المزوّدين ← Meta/LinkedIn | التسويق ← التواصل ← "ربط حساب" | يُعاد التوجيه للموافقة ثم يعود متصلاً |

> **ملاحظة:** التواصل الاجتماعي (Meta/LinkedIn) يتطلب مراجعة تطبيق من المنصة قد تأخذ أياماً — لذا اختبره أخيراً.

---

## 🩺 حلّ المشكلات الشائعة أثناء الاختبار

| المشكلة | السبب المرجّح | الحل |
|---------|----------------|------|
| رسالة "Origin not allowed" أو فشل صامت | `APP_ORIGIN` لا يشمل `localhost:5173` | نفّذ أمر `APP_ORIGIN` أعلاه |
| الإرسال يرجع `simulated` رغم إدخال المفتاح | المفتاح خاطئ أو لم يُحفظ | افتح ربط المزوّدين وتأكد من "مربوط ✓"، وأعد إدخال المفتاح |
| "غير مخوّل — يتطلب صلاحية تسويق" | دور المستخدم لا يسمح | سجّل بدور تسويق/مدير/مطوّر |
| البريد يرجع خطأ من Resend (502) | بريد المُرسِل غير موثّق في Resend | استخدم `onboarding@resend.dev` للتجربة، أو وثّق نطاقك |
| لا تظهر بطاقات المزوّدين في الصفحة | لم تُحدّث الواجهة بعد النشر | أعد تشغيل `npm run dev` وحدّث المتصفح |

---

## قواعد عامة مهمة

1. **مفتاحان لكل قناة (BYOK):** مفتاح الشركة (من الواجهة) له الأولوية، ثم مفتاح المنصة (Secrets) احتياطياً.
2. **بعد ضبط أي مفتاح، لا حاجة لإعادة نشر الوسيط** — الوسيط يقرأ المفتاح لحظياً. (لكن إن غيّرت كود الوسيط، أعد نشره.)
3. **الأمان:** مفاتيح المنصة في Supabase Secrets، ومفاتيح الشركات في خزنة سرّية بقاعدة البيانات (RLS بلا سياسة قراءة). لا الكود ولا المتصفح يقرؤها — الوسطاء وحدهم عبر `get_tenant_provider_secret` (service role فقط).
4. **الرجوع الآمن:** بلا أي مفتاح (لا شركة ولا منصة)، كل قناة تعمل بالمحاكاة — لا شيء يتعطّل.
5. **الاختبار أولاً:** جرّب كل قناة في وضع المزوّد التجريبي (test) قبل الإنتاج.

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

**أمر مختصر لإعادة نشر كل الوسطاء دفعة واحدة** (العادية + الخاصة):
```powershell
# العادية (سطر واحد)
supabase functions deploy marketing-send-email marketing-send-sms event-create-payment crm-enrich-account event-create-stream crm-send-signature social-oauth-start --project-ref ukqxxalosnmzsgothpps
# الـ webhooks و callback (كل واحد على حدة بسبب --no-verify-jwt)
supabase functions deploy event-payment-webhook --no-verify-jwt --project-ref ukqxxalosnmzsgothpps
supabase functions deploy crm-signature-webhook --no-verify-jwt --project-ref ukqxxalosnmzsgothpps
supabase functions deploy social-oauth-callback --no-verify-jwt --project-ref ukqxxalosnmzsgothpps
```

---
*دليل تفعيل المزوّدين · منصة Kyvzon · محدّث بعد تفعيل BYOK (migration 0178 + الوسطاء الثمانية) — يشمل دليل الاختبار اليدوي*
