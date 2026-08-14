# المراجعة الهندسية والأمنية الشاملة لمنصة Kyvzon

**تاريخ المراجعة:** 2026-08-14
**الفرع:** `remediation/p0-security-and-build-health`
**الالتزام المراجع:** `2bb0df58068e0389b834c245a299e94b19d3cf2e`
**نوع القرار:** مراجعة أمنية، معمارية، تشغيلية، جودة، اختبارات، أداء، وقابلية إنتاج

---

## 1. الخلاصة التنفيذية

### القرار النهائي: **NO-GO — يمنع الدمج والنشر الإنتاجي حالياً**

المشروع كبير وطموح، وفيه عمل واضح على RLS، العزل بين الشركات، التوثيق، والتقسيم الوظيفي. لكن الحالة الحالية تحتوي على ثغرات تحكم وصول حرجة، أعطال إنتاج مؤكدة، وفشل فعلي في بوابة الجودة. أهم نتيجة هي أن **العزل بين الشركات لا يساوي تفويضاً صحيحاً داخل الشركة**؛ المشروع يختبر Cross-Tenant Isolation في بعض المواضع، لكنه يترك مستخدماً عادياً داخل الشركة قادراً على تغيير أدوار أو جداول تحكم حساسة.

أخطر النتائج:

1. **P0 — تصعيد صلاحيات من `employee` إلى `developer/admin`:** سياسة تحديث الملف الشخصي تسمح للمستخدم بتحديث صفه كاملاً، بما فيه `role`. دالة الصلاحيات تقرأ الدور من الصف نفسه. وبعد الترقية إلى `developer` تقبل `admin-create-user` المستخدم كدور منصة وتسمح له بتحديد `target_tenant_id` دون التحقق من انتمائه إلى مستأجر المنصة.
2. **P0 — جداول الصلاحيات والتحكم قابلة للكتابة من أي مستخدم داخل الشركة:** مثل `movement_role_assignments` و`portal_unit_assignments` و`org_role_assignments` و`approval_rules`، بسبب سياسات `FOR ALL` التي تتحقق من `tenant_id` فقط.
3. **P0 — تكامل ZKTeco غير مربوط بمستأجر أو جهاز موثوق:** يستخدم سراً عالمياً واحداً وService Role، ثم يبحث عن الموظف بـ`employee_code` بلا `tenant_id`، ما يسمح بكتابة حضور عبر الشركات عند اختراق جهاز/سر أو سوء استخدام عميل شرعي.
4. **P0/P1 — مرفقات Tawathul الداخلية عامة:** الـbucket يُنشأ بـ`public = true`، والخدمة تحفظ روابط عامة، بل ترجع إلى `public-assets` عند الفشل.
5. **P0 تشغيلي — إعداد CSP يمنع سكربت إزالة شاشة البداية:** `script-src 'self'` يمنع السكربت الداخلي في `index.html`، فيبقى Splash فوق التطبيق على Netlify.
6. **P0 تشغيلي — `Permissions-Policy` يعطل GPS:** الإعداد `geolocation=()` يتعارض مباشرة مع `navigator.geolocation.watchPosition()` في تطبيق السائق.
7. **بوابة CI حمراء فعلياً:** أحدث تشغيل GitHub Actions فشل في وظيفتي الجودة وقاعدة البيانات، وآخر 10 تشغيلات ظاهرة للفرع كلها فاشلة.
8. **الاختبارات المحلية:** 15 اختباراً فاشلاً من 5010، مع فشل 4 ملفات اختبار.
9. **فحص SDK:** 58 مخالفة في 17 ملفاً.
10. **الاعتماديات:** `npm audit --omit=optional` يعرض 5 High و1 Moderate؛ وبين اعتماديات الإنتاج ثغرتان High في React Router.
11. **التوثيق يعلن حالة غير حقيقية:** README يقول CI ناجح، 16 migration، 7 Edge Functions، 83 route، و«جاهز للإنتاج»، بينما الواقع الحالي 302 migration و34 Edge Function و596 عنصر Route، وCI فاشل.

### التقييم العام

| المحور | التقييم | الملاحظة |
|---|---:|---|
| الأمان | 2/10 | ثغرات P0 في الدور، جداول التحكم، ZKTeco، والمرفقات |
| البناء وCI | 3/10 | البناء ينجح، لكن Quality Gate وDB job يفشلان |
| الاختبارات | 3/10 | عدد كبير، لكن معظمها Contracts نصية، و15 اختباراً فاشلاً |
| المعمارية | 5/10 | اتجاهات جيدة، مع Monolith وازدواج مصادر الحقيقة وحدود SDK مكسورة |
| الأداء | 5/10 | Lazy loading واسع، لكن الحزمة الرئيسية 1.17MB بعد التصغير |
| التشغيل والمراقبة | 2/10 | شاشة مراقبة ونتائج مزامنة وهمية، وإعدادات نشر تكسر وظائف أساسية |
| التوثيق والحوكمة | 3/10 | توثيق وفير لكنه متقادم ومتناقض مع الواقع |
| **الجاهزية الإنتاجية** | **2/10** | **غير جاهز للإنتاج** |

---

## 2. نطاق المراجعة والمنهجية

تم تنفيذ الآتي:

- استنساخ الفرع المحدد بـ`--single-branch --depth 1`.
- فحص 2188 ملفاً تقريباً، منها:
  - 1179 ملفاً تحت `src`.
  - 342 ملفاً تحت `supabase`.
  - 302 migration SQL.
  - 34 Edge Function تحتوي `index.ts`.
- تشغيل تثبيت نظيف: `npm ci`.
- تشغيل البناء، lint، اختبارات الوحدة/العقود، coverage، فحوص SDK وDB والعقود.
- تشغيل `npm audit` للإنتاج ولجميع الاعتماديات غير الاختيارية.
- مراجعة سياسات RLS، دوال `SECURITY DEFINER`، Edge Functions، CORS، CSP، PWA، التخزين، تدفقات المصادقة والأدوار.
- فحص GitHub Actions للالتزام المراجع.
- فحص أنماط أسرار شائعة في الملفات الحالية.

### حدود المراجعة

- لم تتوفر مفاتيح Supabase أو بيئة staging، لذلك لم أنفذ اختبار اختراق حي ضد قاعدة منشورة.
- لا يوجد Postgres/psql في بيئة المراجعة المحلية؛ لذا لم أعد تشغيل سلسلة migrations محلياً. لكن GitHub Actions للالتزام نفسه يؤكد فشل وظيفة `Database migrations & RLS isolation`.
- فحص الأسرار غطى الحالة الحالية للفرع، وليس كامل تاريخ Git بسبب الاستنساخ السطحي.
- تعذر إثبات نجاح TypeScript: العملية استهلكت حد الذاكرة المحلي عند قرابة 944MB، وفي CI تم تخطيها لأن فحص SDK فشل قبلها.

---

## 3. نتائج التشغيل الفعلية

| الفحص | النتيجة | التفاصيل |
|---|---|---|
| `npm ci` | ✅ نجاح | 420 package |
| `npm run build` | ✅ نجاح | 13.67 ثانية، `dist` نحو 7.9MB |
| الحزمة الرئيسية | ⚠️ | `index-*.js` = 1,170.91KB بعد التصغير |
| `npm run type-check` | غير مثبت | OOM في البيئة المحلية؛ وفي CI تم تخطيه |
| `npm run lint` | ⚠️ نجاح شكلي | 0 errors و1226 warnings |
| `npm run sdk:boundary-check` | ❌ فشل | 58 مخالفة في 17 ملفاً |
| `npm run db:contract-check` | ✅ نجاح | يفحص أسماء العقود أساساً، ولا يكشف عيوب التفويض الحالية |
| `npm run db:procurement-sql-check` | ✅ نجاح | فحص اتساق SQL للمشتريات |
| `npm run test:run` | ❌ فشل | 15 فاشلاً، 4995 ناجحاً، 4 ملفات فاشلة من 167 |
| `npm run test:coverage` | ❌ فشل | بسبب نفس الاختبارات الفاشلة |
| `npm audit --omit=optional` | ❌ فشل | 5 High + 1 Moderate |
| `npm audit --omit=dev` | ❌ فشل | ثغرتان High في React Router للإنتاج |
| Playwright | ❌ غير قابل للتشغيل من المشروع | `@playwright/test` غير مثبت ولا يوجد script ولا خطوة CI |
| GitHub Quality job | ❌ فشل | توقف عند SDK boundary |
| GitHub Database job | ❌ فشل | clean DB migrations/RLS job فشل |

أحدث تشغيل راجعته:
`https://github.com/Kararyousef1/Kyvzon-/actions/runs/31273087763`

---

# 4. نتائج P0 الحرجة

## P0-SEC-01 — المستخدم يستطيع تغيير دوره بنفسه وتصعيد صلاحياته

**الخطورة:** Critical
**التصنيف:** Broken Access Control / Privilege Escalation
**الحالة:** مؤكدة من الكود والسياسات وصلاحيات الاختبار المطابقة لـSupabase

### الدليل

1. صلاحيات Supabase الافتراضية ممثلة صراحة في:
   - `scripts/tests/00_supabase_shim.sql:85-103`
   - يمنح `authenticated` صلاحيات `SELECT, INSERT, UPDATE, DELETE` على الجداول، ويعتمد على RLS للتقييد.
2. سياسة الملف الشخصي:
   - `supabase/migrations/0007_support_and_security.sql:208-211`
   - تسمح للمستخدم بتحديث صفه كاملاً ما دام `id = auth.uid()` و`tenant_id` لم يتغير.
3. لا توجد حماية على أعمدة `role`, `permissions`, `custom_permissions`, `status` أو غيرها، ولا Trigger يمنع تغيير الدور.
4. مصدر الدور الموثوق مزعوماً يقرأ من نفس الصف:
   - `current_user_role()` في `0007_support_and_security.sql:106-117`.
5. `admin-create-user` يثق بدور `developer`/`it_admin` من `profiles`:
   - `supabase/functions/admin-create-user/index.ts:106-116`.
6. عند وجود `target_tenant_id`، يكفي أن يكون الدور ضمن `PLATFORM_ROLES`:
   - `admin-create-user/index.ts:162-168`.
   - لا يوجد تحقق من `current_user_is_platform_owner()` أو أن المستخدم تابع لمستأجر المنصة.

### الأثر

- مستخدم عادي يستطيع ترقية نفسه إلى `admin`, `developer` أو `it_admin` داخل شركته.
- يستطيع تجاوز حراس الواجهة، قراءة/تعديل بيانات إدارية عبر سياسات تعتمد `current_user_role()`، واستدعاء Edge Functions إدارية.
- بعد تغيير نفسه إلى `developer`، يستطيع مسار `admin-create-user` إنشاء حساب داخل مستأجر آخر إذا حصل على UUID الخاص به.
- Trigger المزامنة في `0300_movement_role_assignment_sync.sql:86-137` يزيد الأثر: تغيير `profiles.role` يولد إسنادات حركة تلقائياً.

### العلاج الفوري

1. **اسحب UPDATE على الجدول من authenticated فوراً** ثم اسمح بأعمدة شخصية محددة فقط، أو اجعل كل تحديث الملف الشخصي عبر RPC ضيقة:

```sql
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (full_name, phone, profile_image, cv_data)
ON public.profiles TO authenticated;
```

يجب مراجعة قائمة الأعمدة الآمنة قبل التنفيذ؛ المثال ليس بديلاً عن تحليل المنتج.

2. لا تسمح للعميل بتعديل `role`, `tenant_id`, `permissions`, `custom_permissions`, `status`, `salary`, أو حقول الحوكمة.
3. اجعل تغيير الدور عبر Edge Function/SECURITY DEFINER واحدة، مع تدقيق وإثبات أن المستدعي مدير مخول فعلياً.
4. في `admin-create-user` لا يكفي `role === developer`؛ تحقق من هوية منصية غير قابلة للتلاعب، مثل membership في مستأجر منصة معروف أو claim موقعة ومدارة خادمياً.
5. أضف اختبارات سلبية فعلية تحت `SET ROLE authenticated` تثبت أن الموظف وHR لا يستطيعان تعديل حقول الدور والصلاحيات.

> ملاحظة: RLS تتحكم بالصفوف، لا بالأعمدة. لا يمكن إصلاح هذه الثغرة بإضافة شرط صف جديد فقط؛ يلزم Column Grants أو Trigger حماية أو RPC ضيقة.

---

## P0-SEC-02 — جداول التفويض والتحكم تسمح بالكتابة لأي مستخدم داخل المستأجر

**الخطورة:** Critical
**التصنيف:** Intra-Tenant Privilege Escalation / Authorization Bypass

المشروع يخلط بين شرطين مختلفين:

- **العزل:** المستخدم لا يصل إلى شركة أخرى.
- **التفويض:** المستخدم داخل شركته لا يملك كل شيء.

العديد من السياسات تحقق الأول فقط وتفشل في الثاني.

### أمثلة مؤكدة

1. `movement_role_assignments`:
   - الجدول: `0270_movement_core_schema.sql:7-18`.
   - السياسة: `0270...:88-91` — `FOR ALL` وشرط `tenant_id` فقط.
   - بينما `movement_require_role()` في `0282...:94-128` يثق بهذا الجدول لتقرير السماح.
   - النتيجة: مستخدم داخل المستأجر يستطيع إدراج إسناد لنفسه أو تعديل إسناد قائم، ثم يمر من الحارس.
2. `portal_unit_assignments`:
   - سياسة `FOR ALL` حسب المستأجر فقط في migration `0302`.
3. `org_role_assignments`:
   - `0304_org_role_assignments.sql:93-100`.
   - أي مستخدم يستطيع نظرياً إنشاء إسناد `manager` أو `unit_manager` داخل شركته.
4. `approval_rules`:
   - `0305_unified_approvals_engine.sql:371-376`.
   - أي مستخدم داخل المستأجر يستطيع تعديل قواعد الموافقات.
5. `unified_approval_steps`:
   - `0309_multilevel_approval_engine.sql:77-82`.
6. `employee_movement_permits` و`employee_movements_log`:
   - `0273...:124-139` يمنحان كل مستخدم داخل المستأجر `FOR ALL`.
   - لا توجد حماية للموظف صاحب التصريح أو دور الموافق أو الحارس.
7. عدة جداول حركة ولوجستيات وCRM وتسويق ومالية تستخدم النمط نفسه.

### الأثر

- إسناد أدوار أو وحدات ذاتياً.
- تعديل تسلسل وقواعد الموافقات.
- اعتماد أو رفض طلبات لا يملكها المستخدم.
- تغيير حالة تصريح أو QR أو حركة موظف آخر داخل الشركة.
- تعديل بيانات تشغيلية حساسة دون المرور بالـRPCs التي تحتوي حراس دور.

وجود حارس `movement_require_role()` داخل بعض RPCs لا يفيد إذا كان العميل يستطيع:

1. تعديل جدول الإسناد الذي يثق به الحارس.
2. أو الكتابة مباشرة إلى الجدول الأساسي دون استعمال RPC.

### العلاج

- احذف سياسات `FOR ALL` الواسعة من جداول التحكم.
- القراءة تكون حسب الحاجة: المستخدم يرى إسناده، والمدير المخول يرى نطاقه.
- الإدراج/التعديل/التعطيل يمر فقط عبر RPCs محمية، ولا يمنح مباشرة لـ`authenticated`.
- احذر من إضافة سياسة جديدة فقط: سياسات PostgreSQL الافتراضية **Permissive وتُجمع بـOR**. يجب إسقاط السياسة الواسعة أو استعمال `AS RESTRICTIVE` بتصميم مقصود.
- أضف مجموعة اختبارات Intra-Tenant، لا Cross-Tenant فقط:
  - employee لا يسند دوراً لنفسه.
  - supervisor لا يمنح نفسه manager.
  - requester لا يعتمد طلبه.
  - employee لا يعدل تصريح موظف آخر.
  - المستخدم لا يغير قواعد الموافقات.

---

## P0-SEC-03 — ZKTeco يعمل بـService Role بلا ربط الجهاز بالمستأجر

**الخطورة:** Critical
**التصنيف:** Cross-Tenant Write / Shared Secret Blast Radius

### نقاط جيدة موجودة

- HMAC-SHA256.
- Timestamp window.
- Nonce persistence ومنع replay.
- حد لحجم body.

لكنها توثق الطلب فقط باعتباره قادماً ممن يعرف **سراً عالمياً واحداً**؛ لا تحدد الشركة أو الجهاز.

### الدليل

- سر عالمي: `ADMS_SECRET` في `supabase/functions/zkteco-sync/index.ts:104-137`.
- Service Role: `zkteco-sync/index.ts:139-151`.
- البحث عن الموظف:
  - `zkteco-sync/index.ts:220-224`.
  - `.eq('employee_code', employee_code)` بلا `.eq('tenant_id', resolvedTenantId)`.
- مسار Bulk يكرر الخطأ عند `347-351`.
- الإدراج الاحتياطي في `attendance_logs` لا يرسل `tenant_id` صراحة عند `248-259`.
- `device_id` قادم من body ولا تتم مطابقته مع سجل جهاز موثوق أو مستأجر.

### الأثر

- تسرب سر جهاز/وكيل واحد يوسع الاختراق إلى كل الشركات.
- عميل شرعي يعرف السر يستطيع إرسال كود موظف من شركة أخرى.
- تكرار `employee_code` بين الشركات قد يسبب فشل `.single()` أو تسجيل غير صحيح.
- Service Role يتجاوز RLS، لذلك لا توجد طبقة حماية لاحقة.

### العلاج

1. عطّل Function مؤقتاً في الإنتاج إلى حين الإصلاح.
2. استخدم مفتاحاً/سراً مختلفاً لكل جهاز أو منشأة.
3. استخرج `tenant_id` خادمياً من سجل جهاز موثوق؛ لا تقبله من body.
4. اربط التوقيع بـ`device_id` الموثوق، وخزن secret مشفراً أو hash مناسباً.
5. كل استعلام موظف يجب أن يحتوي `tenant_id` المستخرج خادمياً.
6. اجعل الحفظ كله داخل RPC ذرية واحدة تأخذ device identity وتتحقق من tenant والموظف والتكرار.
7. اجعل القيد الفريد للموظف `(tenant_id, employee_code)` إن لم يكن كذلك.
8. اختبر جهاز Tenant A ضد employee code في Tenant B وتوقع رفضاً صريحاً.

---

## P0-SEC-04 — مرفقات Tawathul الداخلية عامة

**الخطورة:** Critical/High بحسب حساسية المحادثات
**التصنيف:** Sensitive Data Exposure

### الدليل

- `supabase/migrations/0005_tawathul_rls_features.sql:428-445` ينشئ bucket `tawathul` بـ`public = true`، رغم أن التعليق السابق يقول إن `public: false` موصى به.
- `TawathulMessageService.ts:245-280`:
  - يرفع إلى bucket.
  - يستخرج `getPublicUrl()`.
  - عند فشل bucket يرجع إلى `public-assets` ويحفظ رابطاً عاماً أيضاً.
- RLS على جدول metadata لا تحمي object متاحاً عبر URL عام.

### الأثر

- من يحصل على الرابط يستطيع تحميل المرفق دون عضوية المحادثة.
- لا يمكن سحب الوصول من عضو غادر المحادثة ما دام يحتفظ بالرابط.
- تسريب رابط واحد عبر logs أو forwarding يكشف الملف خارج النظام.

### العلاج

- اجعل bucket خاصاً: `public = false`.
- أزل fallback إلى `public-assets` نهائياً للمرفقات الداخلية.
- لا تخزن `file_url` عاماً؛ خزن `bucket + path` فقط.
- أنشئ Signed URL قصيرة العمر بعد التحقق من عضوية المستخدم في `conversation_id`.
- أضف سياسات `storage.objects` مرتبطة بمسار tenant/conversation وعضوية Tawathul.
- افحص وهاجر المرفقات القديمة، وافترض أن الروابط العامة السابقة ربما كُشفت.

---

## P0-RUN-05 — CSP تمنع سكربت Splash وتترك التطبيق محجوباً

**الخطورة:** Critical تشغيلياً
**التصنيف:** Production Availability

### الدليل

- `netlify.toml:16` يحدد `script-src 'self'` بلا nonce أو hash أو `'unsafe-inline'`.
- `index.html:364-533` يحتوي سكربتاً داخلياً كبيراً.
- هذا السكربت وحده يضيف `hidden` ويحذف `#kyvzon-splash`.
- ملف `dist/index.html` المبني ما زال يحتوي السكربت داخلياً، أي أن Vite لم ينقله إلى ملف خارجي.

### الأثر

على Netlify، المتصفح يمنع السكربت الداخلي وفق CSP، فيبقى Splash ذو `z-index: 99999` فوق التطبيق.

### العلاج

- انقل منطق Splash إلى ملف JS خارجي من نفس الأصل أو إلى boot module داخل Vite.
- أبقِ `script-src 'self'` ولا تعالج المشكلة بإضافة `'unsafe-inline'`.
- بديل: استخدم nonce/hash تولده بيئة الاستضافة، لكن الملف الخارجي أبسط هنا.
- أضف اختبار smoke إنتاجي يفتح `dist` مع نفس headers ويتحقق من اختفاء Splash.

---

## P0-RUN-06 — سياسة الأذونات تعطل GPS الخاص بالسائق

**الخطورة:** Critical/High وظيفياً

- `netlify.toml` يرسل: `Permissions-Policy = "camera=(), microphone=(), geolocation=()"`.
- `DriverTripsPage.tsx:149-210` يعتمد `navigator.geolocation.watchPosition()` للتتبع الحي.

`geolocation=()` يمنع الأصل نفسه من استخدام GPS، وليس فقط iframes خارجية.

### العلاج

استخدم سياسة متوافقة مع المنتج، مثلاً `geolocation=(self)`، واختبرها على HTTPS في بيئة staging. أبقِ camera/microphone مغلقتين إن لم توجد ميزة تحتاجهما.

---

# 5. نتائج P1 العالية

## P1-01 — Quality Gate الحقيقي فاشل باستمرار

- أحدث تشغيل فشل في وظيفتي:
  - `Typecheck, tests, build, audit` عند SDK boundary.
  - `Database migrations & RLS isolation` أثناء clean DB test.
- آخر 10 تشغيلات ظاهرة للفرع كانت `failure`.
- رغم ذلك يعرض README شارة ثابتة `CI-passing` بلا رابط ديناميكي.

**التوصية:** منع الدمج بBranch Protection وRequired Checks حقيقية، وإزالة الشارات اليدوية.

---

## P1-02 — 15 اختباراً فاشلاً والحالة المعلنة غير صحيحة

النتيجة المحلية:

- 4 test files فاشلة من 167.
- 15 test فاشلاً، 4995 ناجحاً من 5010.

أهم الأسباب:

1. `tools/dev/scan_portals.py` يفترض مساراً ثابتاً خاطئاً `/home/user/Kyvzon/src/services/sdk` بدلاً من حساب جذر المستودع ديناميكياً.
2. ملفات يفترض الاختبار أنها أُرشفت ما زالت في المسار النشط:
   - `src/pages/employee/AttendancePage.tsx`
   - `src/pages/employee/ProblemsList.tsx`
   - `src/pages/admin/AdminEmployeesPageV2.tsx`
3. استعمال `confirm/alert/prompt` ما زال موجوداً في ملفات يفترض العقد إزالتها.

**التوصية:** أصلح الكود أو العقد وفق قرار معماري واضح، ولا تعدّل الاختبارات فقط لجعلها خضراء.

---

## P1-03 — حدود SDK مكسورة

`npm run sdk:boundary-check` فشل بـ:

- 17 ملفاً مخالفاً.
- 58 استدعاءً مباشراً (`supabase.from()`/`rpc()`).
- 3 عناصر allowlist قديمة.

المخالفات تشمل Finance، Inventory، MRP وProblemsList. هذا يناقض README الذي يقول إن كل استعلام يمر عبر SDK.

**الأثر:** منطق tenant، الأخطاء، القياس، وإجراءات الحماية لا يطبق بصورة موحدة.

---

## P1-04 — ثغرات اعتماديات مع Fix متاح

نتيجة `npm audit --omit=optional`:

- 5 High.
- 1 Moderate.

أهمها:

- `react-router-dom 7.18.1` / `react-router` — High؛ الإصلاح إلى `7.18.2` متاح.
- `brace-expansion` — High.
- `js-yaml` — High.
- `nanoid` — High.
- `postcss` — Moderate.

في اعتماديات الإنتاج وحدها توجد ثغرتان High بسبب React Router. خطوة audit في CI ستفشل حتى لو مرت الخطوات السابقة.

**العلاج:** حدّث lockfile، شغّل كامل الفحوص، ولا تستخدم `npm audit fix --force` عشوائياً.

---

## P1-05 — اختبار RLS العام لا يفشل عند وجود جدول بلا RLS

في `scripts/tests/99_post_migration_checks.sql:16-21` يوجد استعلام بعنوان «يجب أن يكون العدد = 0»، لكنه يطبع الجداول فقط ولا ينفذ `RAISE EXCEPTION`.

أي جدول بلا RLS سيظهر في log لكن الـjob يمكن أن يواصل التنفيذ.

كذلك مجموعة `rls_isolation_test.sql` تحتوي 14 اختباراً تركز عملياً على عدد قليل من الجداول: announcements، leaves، profiles، tenants، bank_accounts، budgets. هذا لا يغطي مئات الجداول ولا تصعيد الصلاحيات داخل المستأجر.

**العلاج:** حوّل فحص كل جدول بلا RLS إلى assertion قاتلة، وأضف سجل استثناءات معللاً إن وجدت جداول عامة مقصودة.

---

## P1-06 — واجهة تصاريح الحركة لا تطابق مخطط قاعدة البيانات

### الواجهة ترسل

`EmployeeMovementNewPermitPage.tsx:82-105` يرسل حقولاً مثل:

- `permit_number`
- `permit_type`
- `employee_name`
- `is_paid_time`
- `deduct_from_leave`
- `status = 'pending_approval'`

### الجدول الفعلي

`0273_movement_employee_permits_execution_schema.sql:70-89` لا يحتوي معظم هذه الأعمدة، وقيد `status` يسمح:

`pending | approved | used | expired | cancelled | rejected`

ولا يسمح `pending_approval`, `active`, `completed` المستخدمة في TypeScript والصفحات.

مشكلات إضافية:

- الواجهة ترسل `user.id` كـ`employee_id`، لا `current_user_employee_id()`.
- RLS تمنح أي مستخدم داخل الشركة تعديل كل التصاريح.
- QR يولد في العميل بـ`Math.random()` عند `EmployeeMovementNewPermitPage.tsx:86`، مع أن قاعدة البيانات تملك default آخر.
- مولد DB نفسه `md5(random())` ويقر صراحة بأنه غير تشفيري في `0273:31-49`.

**الأثر:** إنشاء التصريح قد يفشل، أو تنحرف الحالات، أو يُربط التصريح بمعرف profile بدلاً من employee، مع قابلية اعتماد ذاتي.

**العلاج:** اجعل الإنشاء والانتقالات عبر RPC واحدة، استخرج المستخدم والموظف من `auth.uid()`، وولد token خادمياً بعشوائية تشفيرية، وطبّق state machine وقواعد approver.

---

## P1-07 — «التموين الذري» للشركة ليس ذرياً

`TenantService.ts:680-712` ينفذ:

1. RPC تنشئ tenant/subscription/legal entity.
2. ثم Edge Function تنشئ مستخدم admin.

عند فشل الخطوة الثانية، الكود يعيد warning ويترك الشركة موجودة بلا admin. التعليق نفسه يقر بذلك عند `705-712`، رغم أن الميزة تسمى Atomic Provisioning.

مشكلات إضافية:

- `p_admin_password` يُرسل إلى RPC في `TenantService.ts:655-663` لكنه غير مستخدم في SQL؛ هذا يزيد سطح تعرض كلمة المرور بلا فائدة.
- UI يعرض success toast بإنشاء الشركة والحساب حتى لو رجعت warning.
- TypeScript يقبل `professional` بينما SQL `0142` يقبل `pro` لا `professional`.

**العلاج:** نفذ Saga/Compensation في Edge Function خادمة: أنشئ الهوية ثم transaction DB، واحذف الهوية عند فشل DB؛ أو احذف tenant عند فشل admin بصورة مؤكدة. لا ترسل password إلى PostgreSQL.

---

## P1-08 — مراقبة النظام ومزامنة الأجهزة تعرض بيانات وهمية كأنها حقيقية

- `SystemMonitor.tsx:48-66` يعرّف خدمات وحالات وuptime ثابتة.
- `SystemMonitor.tsx:210-238` يولد CPU، memory، network، requests والأحداث بـ`Math.random()` كل 3 ثوانٍ.
- الواجهة تسمي ذلك «مراقبة حية».
- `BiometricSettings.tsx:363-403` يقرر نجاح المزامنة والاتصال عشوائياً، ويعرض Toast نجاح أو فشل للمستخدم.

**الأثر:** تضليل تشغيلي؛ قد يعتقد المسؤول أن النظام أو الأجهزة سليمة أو معطلة بناءً على أرقام مختلقة.

**العلاج:** إما ربط حقيقي بمصادر قياس، أو إزالة هذه الأدوات من الإنتاج ووضع شارة واضحة ودائمة `Simulation/Demo` لا يمكن الخلط بينها وبين الواقع.

---

## P1-09 — Edge Functions غير مغطاة بفحص TypeScript/Lint حقيقي

- ESLint يتجاهل `supabase/functions/**` بالكامل.
- لا توجد خطوة `deno check` في CI.
- Deno غير جزء من toolchain المثبتة.
- بعض «اختبارات Edge» تقرأ النص أو تنسخ المنطق inline بدلاً من استيراد الكود الحقيقي؛ مثال rate limiter.
- يوجد تفاوت إصدارات: Supabase JS `2.45.0` غالباً و`2.39.0` في ZKTeco، وDeno std `0.224.0` و`0.168.0`.
- لا يوجد `deno.lock` بسلامة dependencies.

**العلاج:** أضف Deno pinned إلى CI، ثم `deno fmt --check`, `deno lint`, `deno check` لكل Function، واختبارات integration محلية.

---

## P1-10 — إعداد نشر Edge Functions غير كامل ويعتمد على أوامر يدوية

- 34 Function فعلية.
- `supabase/config.toml` يضبط 9 فقط.
- 25 Function غير مذكورة في config.
- Webhooks/OAuth callbacks تعتمد على نشر يدوي بـ`--no-verify-jwt` موثق في ملف منفصل.

النتيجة أن `supabase functions deploy` العام قد ينتج سلوكاً مختلفاً عن الأوامر الفردية، خصوصاً للـwebhooks الخارجية والcron.

**العلاج:** اجعل كل Function معرفة صراحة في `config.toml`، وحدد `verify_jwt` المقصود، وأتمت النشر من CI ببيئات dev/staging/prod.

---

## P1-11 — Rate Limiting داخل الذاكرة وغير موزع

`_shared/rateLimit.ts` يستخدم `Map` داخل instance. في Edge runtime:

- كل instance لها عداد مستقل.
- Cold start يعيد العداد للصفر.
- التوسع الأفقي يسمح بتجاوز الحد.

لذلك ادعاء README بحدود إنتاجية قطعية غير دقيق، خصوصاً لـAI المدفوع.

**العلاج:** limiter ذري موزع عبر Postgres RPC/Redis/KV أو بوابة مزود، مع idempotency وحماية إنفاق للذكاء الاصطناعي.

---

## P1-12 — بوابات المورد العامة تحتاج فصل Capability Tokens

`procurement-supplier-invoice` يستعمل `supplier_portal_invites` token نفسه ولا يقرأ `used_at` ولا يحد الاستعمال. رابط onboarding قد يبقى قادراً على رفع فواتير متعددة حتى انتهاء الصلاحية.

وفي `procurement-supplier-rfx` تستخدم استعلامات `select('*')` ثم تعيد invitation/event/bids، ما يزيد احتمال كشف حقول داخلية عند إضافة أعمدة مستقبلاً.

**العلاج:** Tokens منفصلة ومقيدة بـscope/action/supplier/tenant/expiry، مع revocation وrate limit، وقوائم أعمدة صريحة فقط.

---

# 6. جودة الاختبارات والتغطية

## 6.1 العدد الكبير لا يعني تغطية سلوكية عالية

من أصل 167 ملف اختبار:

- 128 ملفاً أسماؤها Contract.
- 131 ملفاً تستخدم `readFileSync`.
- 49 تستخدم `existsSync`.
- ملفان فقط يحتويان `render(`.
- لا يوجد استعمال `userEvent` في الاختبارات الحالية.

هذه الاختبارات مفيدة كحراس بنيوية، لكنها لا تثبت سلوك المستخدم أو التفويض الفعلي. بعض الاختبارات تتحقق فقط من وجود نص سياسة أو Function، لا من عدم قابليتها للاستغلال.

## 6.2 تغطية Coverage مضللة إذا عُرضت كتغطية للمشروع

`vitest.config.ts` يقيس 7 ملفات فقط، مجموعها نحو 1493 سطراً، بينما كود TypeScript/TSX الإنتاجي المقدر نحو 152,408 أسطر في 985 ملفاً.

أي نسبة 70% في هذا الإعداد هي نسبة لهذه العينة الصغيرة، وليست للمشروع كله. شارة README `Coverage 73%` بلا هذا السياق مضللة.

## 6.3 E2E شبه غير موجود

- `@playwright/test` غير مثبت.
- لا يوجد script في `package.json`.
- CI لا يشغل E2E.
- عدد كبير من حالات `e2e/*.spec.ts` مجرد تعليقات بلا assertions.
- اختبار tenant lifecycle الأساسي skipped أو template.

**الحد الأدنى المطلوب:** Login حقيقي في staging، RBAC، same-tenant escalation، cross-tenant isolation، subscription enforcement، admin functions، supplier tokens، GPS permission، CSP/splash، ورفع/تحميل ملفات خاصة.

---

# 7. المعمارية وقابلية الصيانة

## نقاط إيجابية

- استخدام React lazy واسع: نحو 523 lazy import.
- ADRs ووثائق هندسية عديدة.
- طبقة SDK مبدئياً اتجاه صحيح.
- فصل Admin Edge Functions عن Service Role في المتصفح.
- helpers تعتمد `auth.uid()` بدلاً من tenant يرسله العميل في عدد من المواضع.
- وجود فحوص DB contract وmigration scripts أساس جيد.

## ديون رئيسية

### 7.1 ملفات Monolith كبيرة

- `AppRouter.tsx`: نحو 1473 سطراً / 110KB، و596 `<Route>`.
- `AdminEmployeesPage.tsx`: نحو 1829 سطراً / 103KB.
- `Sidebar.tsx`: نحو 1541 سطراً / 90KB.
- `DeveloperDashboard.tsx`: نحو 1787 سطراً / 85KB.
- `services/sdk/index.ts`: نحو 47KB.

ينبغي تقسيم router والsidebar حسب domain manifests، وتقسيم الصفحات إلى container/hooks/components/schema.

### 7.2 TypeScript ليس strict فعلياً

رغم `strict: true`:

- `noImplicitAny: false`.
- `strictPropertyInitialization: false`.
- `noUncheckedIndexedAccess: false`.
- BaseService ما زال `<T = any>` ويستخدم builders من نوع `any`.

Lint سجل:

- 736 `no-explicit-any`.
- 384 unused vars.
- 56 exhaustive-deps.
- 28 console.
- 15 alert/confirm.
- الإجمالي 1226 warning، مع `--max-warnings=9999`.

هذه ليست بوابة جودة قوية.

### 7.3 تراكم migrations وإعادة تعريفات كثيرة

302 migration مع مئات الجداول والدوال وإعادة تعريف سياسات ودوال مراراً يجعل فهم final state صعباً جداً. بعد تثبيت الإصلاحات واختبارات clean DB، أنشئ baseline موثقاً للإعدادات الجديدة، مع إبقاء سجل ترقية مدروس للبيئات القائمة.

### 7.4 مصدر الحقيقة غير موحد

- الدور في `profiles.role`.
- أدوار حركة في `movement_role_assignments`.
- وحدات في `portal_unit_assignments`.
- أدوار تنظيمية في `org_role_assignments`.
- صلاحيات مخصصة وRole Guards في الواجهة.

Triggers تحاول مزامنة هذه المصادر، لكن السياسات الواسعة تجعلها قابلة للتلاعب. يلزم نموذج Authorization واحد واضح ومنفذ خادمياً.

---

# 8. الأداء وتجربة المستخدم

## النتائج

- Build output نحو 7.9MB.
- main JS نحو 1.17MB بعد التصغير.
- charts chunk نحو 423KB.
- Supabase chunk نحو 200KB.
- CSS نحو 188KB.
- Vite حذر من chunk أكبر من 700KB.

رغم Lazy loading الواسع، مجموعة الصفحات العامة والـlayouts والكتالوجات المشتركة تسحب كمية كبيرة في البداية.

## توصيات

- حلل bundle بـvisualizer في CI واحفظ budgets.
- حوّل الصفحات العامة الثقيلة غير الأساسية إلى lazy.
- قسم route catalogs/manifests حسب portal.
- راقب LCP/INP/CLS على أجهزة متوسطة وشبكات عراقية فعلية.
- أضف حد CI، مثلاً initial JS gzip/brotli وليس الحجم الخام فقط.
- أضف virtualization وserver-side pagination للقوائم الكبيرة؛ هناك استعلامات `select('*')` كثيرة بلا limit واضح.

---

# 9. PWA والتخزين المحلي

## نقاط جيدة

- Service Worker يتجاوز Supabase/Auth حسب hostname/path.
- لا يخزن WebSocket.
- يوجد offline fallback.

## مخاطر

- `networkFirst()` يخزن أي GET غير مستثنى من نفس الأصل، حتى لو أضيفت مستقبلاً APIs خاصة على نفس الأصل.
- طوابير offline وبيانات أخرى مخزنة plaintext في localStorage.
- `notificationclick` يفتح URL قادماً من push payload دون حصر صريح للأصل.
- `offline.html` يستعمل inline `onclick`، وهو أيضاً ممنوع وفق CSP الحالية.

**التوصية:** cache allowlist بدلاً من catch-all، عدم تخزين responses خاصة، التحقق من same-origin للروابط، ووضع سياسة واضحة لمسح البيانات عند logout وتبديل المستخدم.

---

# 10. الأسرار وسلسلة التوريد

## إيجابي

- لم أجد مفاتيح فعلية أو JWT أو GitHub/AWS/OpenAI tokens في الحالة الحالية وفق الأنماط التي فُحصت.
- `.env` و`.env.*` مستثناة مع إبقاء `.env.example`.
- لا يوجد Service Role في frontend.

## ملاحظات

- وثائق عامة تحتوي Supabase project ref الحقيقي `ukqxxalosnmzsgothpps` وعدة endpoints. Project ref ليس سراً، لكنه يسهل الاستطلاع، ويجب التأكد أن نشر هذه التفاصيل مقصود.
- Edge imports تعتمد remote URLs بلا lock integrity.
- لا يوجد Dependabot/Renovate config.
- لا يوجد `SECURITY.md` قياسي للإبلاغ، ولا CODEOWNERS، ولا metadata مثل `engines` و`packageManager`.

---

# 11. تناقضات التوثيق

README الحالي يقول:

- CI passing — بينما CI فاشل.
- 16 migrations — الموجود 302.
- 7 Edge Functions — الموجود 34.
- 83 route — هناك 596 عنصر Route.
- 246 اختباراً — Vitest يجمع 5010.
- 0 أخطاء TypeScript — لم تثبت في الالتزام الحالي لأن CI توقف قبل typecheck والفحص المحلي نفدت ذاكرته.
- «جاهز للإنتاج» — غير صحيح بسبب نتائج P0 وCI.

يجب أن تكون الشارات مولدة من CI وأن يميز التوثيق بين:

- Implemented.
- Tested.
- Deployed.
- Production validated.
- Simulated/Planned.

---

# 12. خطة العلاج المقترحة

## المرحلة 0 — خلال 0 إلى 24 ساعة

1. **إيقاف أي نشر إنتاجي ووقف دمج الفرع.**
2. إذا كانت هذه السياسات منشورة:
   - اسحب UPDATE العام على `profiles` فوراً.
   - اسحب الكتابة المباشرة على جداول الأدوار والوحدات وقواعد الموافقات.
   - راجع سجلات تغييرات `profiles.role` وrole assignments بحثاً عن تعديل غير مشروع.
3. عطّل `zkteco-sync` مؤقتاً أو قيده على مصدر موثوق حتى إضافة tenant/device binding.
4. حوّل Tawathul bucket إلى private وأوقف fallback العام.
5. أصلح CSP/Splash و`geolocation=(self)` قبل أي إصدار واجهة.
6. حدّث React Router إلى 7.18.2 وأعد lockfile.
7. اجعل branch protection يتطلب الوظيفتين الخضراوين فعلياً.

## المرحلة 1 — خلال 24 إلى 72 ساعة

1. Migration أمنية واحدة واضحة، مثلاً `0374_p0_authorization_lockdown.sql`:
   - حماية أعمدة profiles.
   - إسقاط السياسات الواسعة.
   - سياسات role/scope/ownership دقيقة.
   - منع المباشر والاعتماد على RPCs للعمليات الحساسة.
2. اختبارات اختراق SQL سلبية داخل نفس المستأجر.
3. إصلاح 15 اختباراً وفحص SDK كاملاً.
4. إصلاح سبب فشل clean DB job وإظهار log/artifact واضح.
5. تحويل فحص «كل جدول عليه RLS» إلى assertion قاتلة.

## المرحلة 2 — خلال أسبوع

1. إعادة بناء تدفق تصريح الحركة كمحرك حالات خادمي.
2. إعادة بناء ZKTeco بهوية جهاز لكل مستأجر وRPC ذرية.
3. إعادة بناء tenant provisioning كـSaga مع compensation.
4. فصل tokens العامة حسب scope وإضافة rate limit موزع.
5. إضافة Deno checks وEdge integration tests.
6. تعريف كل Edge Function صراحة في `config.toml` وأتمتة deploy.
7. إزالة/وسم كل simulation في واجهات التشغيل.

## المرحلة 3 — خلال 2 إلى 4 أسابيع

1. E2E حقيقية في staging بمستخدمين وشركتين وأدوار متعددة.
2. توسيع coverage إلى الخدمات الأمنية والتجارية، لا 7 ملفات فقط.
3. تقسيم AppRouter/Sidebar/الصفحات الكبرى حسب domain.
4. Bundle budgets ومراقبة Web Vitals.
5. Baseline DB جديد موثق بعد إثبات كل upgrade paths.
6. تحديث README والشارات والـrunbooks تلقائياً.
7. إضافة CODEOWNERS وSECURITY.md وDependabot/Renovate وسياسة إصدار.

---

# 13. شروط السماح بالإنتاج

لا أوصي بتغيير القرار إلى GO إلا بعد تحقق كل الآتي:

- [ ] الموظف لا يستطيع تعديل `role` أو صلاحياته أو حالته.
- [ ] لا يستطيع أي مستخدم إسناد دور/وحدة لنفسه مباشرة.
- [ ] كل قرار موافقة محمي خادمياً من self-approval والتعديل المباشر.
- [ ] ZKTeco مربوط بجهاز ومستأجر، واختبار Tenant A → Tenant B مرفوض.
- [ ] مرفقات Tawathul خاصة وروابطها قصيرة العمر.
- [ ] CSP لا يمنع الإقلاع، وGPS يعمل فقط للأصل المطلوب.
- [ ] Quality job أخضر بالكامل، بما فيه audit وtypecheck وcoverage وbuild.
- [ ] Database clean migration job أخضر.
- [ ] 0 اختبار فاشل.
- [ ] 0 SDK boundary violation غير مبررة.
- [ ] E2E فعلية للأمن ودورة الحياة.
- [ ] لا High/Critical vulnerability بلا قبول خطر رسمي ومؤقت.
- [ ] README يعكس الأرقام والحالة الحقيقية.
- [ ] Staging soak test ومراجعة logs/audit قبل الإنتاج.

---

# 14. ما هو جيد ويستحق البناء عليه

هذه المراجعة لا تعني أن المشروع بلا أساس جيد. توجد عناصر مهمة:

- محاولة جدية لبناء tenant helpers مشتقة من `auth.uid()`.
- HMAC وnonce في التكامل البيومتري، رغم نقص tenant binding.
- تحقق توقيع Stripe في webhooks.
- عدم وضع Service Role في الواجهة.
- CSP/HSTS وسياسات headers موجودة كمبدأ، رغم وجود تعارضات وظيفية.
- فحوص عقود كثيرة يمكن تطويرها إلى اختبارات سلوكية قوية.
- ADRs وrunbooks ومجموعة توثيق واسعة.
- Lazy loading واسع وبناء إنتاجي ناجح تقنياً.

لكن يجب نقل التركيز من **عدد الملفات والاختبارات والتقارير** إلى **إثبات الأمن والسلوك في final runtime state**.

---

## الحكم الهندسي النهائي

**المنصة ليست جاهزة للإنتاج في الالتزام المراجع.**
المطلوب أولاً إغلاق سلسلة تصعيد الدور، إعادة تصميم تفويض الجداول الحساسة، عزل ZKTeco والمرفقات، وإعادة بوابة CI إلى الحالة الخضراء. بعد ذلك يمكن الانتقال إلى تحسينات الأداء والمعمارية والـUX.
