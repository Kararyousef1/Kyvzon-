# 🧱 خطة تنظيف طبقة SDK — Kyvzon Platform

**التاريخ:** 15 يوليو 2026
**الفرع:** `remediation/p0-security-and-build-health`
**المهندس:** Platform Architect
**الهدف:** جعل `services/sdk/` هو **المسار الوحيد** بين التطبيق و Supabase.

---

## 🎯 الملخص التنفيذي

- **45 استدعاء Supabase مباشر** خارج طبقة SDK حالياً.
- **موزعون على 18 ملف** في الكود.
- من بين هذه المخالفات: **4 عمليات أمنية حقيقية** تكتب في `audit_logs / security_events / error_logs / biometric_devices` بدون حقن `tenant_id` — قد تفشل صامتاً بعد تفعيل RLS.
- بعد التنظيف: كل استعلام سيمر عبر SDK، مع فوائد فورية:
  - ✅ حقن `tenant_id` تلقائي = عزل مضمون.
  - ✅ Type safety كامل.
  - ✅ Error handling موحد عبر `SdkError`.
  - ✅ Logging مركزي عبر `logger`.
  - ✅ سهولة اختبار الوحدة (mock واحد لـ SDK).

---

## 📊 تصنيف المخالفات (45 مخالفة)

| الفئة | العدد | الأثر الأمني | الأولوية |
|---|:---:|:---:|:---:|
| **A. كتابات أمنية بدون tenant_id** | 4 | 🔴 حرج | P0 |
| **B. Tawathul services (تجاوز SDK) ** | 20 | 🟠 عالي | P1 |
| **C. Storage uploads متكررة** | 9 | 🟡 متوسط | P1 |
| **D. TechPortal biometric_devices** | 4 | 🟠 عالي | P1 |
| **E. UI Stores (Zustand)** | 4 | 🟡 متوسط | P2 |
| **F. RPC calls متفرقة** | 3 | 🟢 منخفض | P2 |
| **G. Realtime channels** | 2 | 🟢 منخفض (استثناء مبرَّر) | P3 |
| **H. supabase.auth مباشر** | 3 | 🟢 منخفض | P3 |
| **I. edgeAiService.functions.invoke** | 1 | 🟢 (سليم) | لا يُعدَّل |

---

## 🔴 الفئة A: كتابات أمنية بدون tenant_id (P0)

### المشكلة
هذه الاستدعاءات تُكتب في جداول عليها RLS يفرض `tenant_id = current_user_tenant_id()`، لكن الكود يمرِّر البيانات **بدون** `tenant_id`. النتائج المحتملة:
- إذا كان الجدول يقبل `NULL` في `tenant_id` → تُكتب سجلات يتيمة (orphan).
- إذا كان `tenant_id NOT NULL` → الكتابة تفشل صامتاً داخل `try/catch`.

### المواقع الأربعة:

| # | الملف | السطر | الجدول | المشكلة |
|:---:|---|:---:|---|---|
| 1 | `services/security/devPinService.ts` | 248 | `audit_logs` | لا `tenant_id` |
| 2 | `services/security/securityService.ts` | 141 | `security_events` | لا `tenant_id` |
| 3 | `shared/components/dashboard/developer/ErrorBoundary.tsx` | 73 | `error_logs` | لا `tenant_id` |
| 4 | `services/integrations/leaveAttendanceLink.ts` | 189 | RPC `refresh_attendance_summary` | لا سياق |

### الحل
- استخدام `auditLogService` و `errorLogService` من SDK (موجودان بالفعل!).
- إضافة `securityEventService` إلى SDK إذا لم يكن موجوداً.
- كلها ترث `BaseService<T>` → حقن `tenant_id` تلقائياً.

---

## 🟠 الفئة B: Tawathul services (P1)

### المشكلة
`TawathulConversationService.ts` و `TawathulMessageService.ts` يستخدمون Supabase مباشرة (~20 استدعاء) بدلاً من الاعتماد على `BaseService<T>`. رغم أنهم يفعلون ذلك بحرص وأنماط متسقة، فإنهم:
- يتجاوزون معالجة الأخطاء الموحدة.
- يُصعِّبون اختبار الوحدة.
- يخلقون تناقضاً مع بقية SDK.

### الحل المتدرج
هذه الملفات **معقدة** (JOINs، storage، auth) — لا يمكن استبدالها بالكامل بـ `BaseService`. الاستراتيجية:

1. **إبقاؤها كخدمات مستقلة** لكن نجعلها ترث من `BaseService<T>` وتستخدم `this.queryBuilder` بدل `supabase.from()` المباشر.
2. استبدال `supabase.auth.getUser()` بـ `authService.getCurrentUser()`.
3. استبدال Storage بـ `storageService` جديد نُضيفه لـ SDK.
4. توثيق العمليات المعقدة (multi-insert) كـ **RPC functions** في migrations وتحويلها لـ `supabase.rpc()` عبر SDK.

---

## 🟡 الفئة C: Storage uploads متكررة (P1)

### المشكلة
9 مواقع مختلفة تستدعي `supabase.storage.from('public-assets').upload(...)` بنمط متكرر:

```ts
const fileExt = file.name.split('.').pop();
const fileName = `${path}/${Date.now()}.${fileExt}`;
const { error } = await supabase.storage.from('public-assets').upload(fileName, file, { upsert: true });
if (error) throw error;
const { data } = supabase.storage.from('public-assets').getPublicUrl(fileName);
return data.publicUrl;
```

### الحل
إضافة **`StorageService` جديد** إلى SDK:
```ts
export class StorageService {
  async uploadPublic(bucket: string, path: string, file: File): Promise<string>;
  async uploadPrivate(bucket: string, path: string, file: File): Promise<string>;
  async delete(bucket: string, path: string): Promise<void>;
  async getPublicUrl(bucket: string, path: string): string;
}
```

استبدال 9 مواقع بـ `storageService.uploadPublic('public-assets', 'profiles', file)`.

---

## 🟠 الفئة D: TechPortal biometric_devices (P1)

### المشكلة
`TechPortal.tsx` يستدعي `supabase.from('biometric_devices')` مباشرة في 4 مواقع (CRUD كامل).

### الحل
إنشاء `BiometricDeviceService extends BaseService<BiometricDeviceRecord>` — عمل بسيط جداً لأنه CRUD قياسي.

---

## 🟡 الفئة E: UI Stores (Zustand) — P2

### المشكلة
`core/stores/index.ts` (سطور 639, 641) و `core/stores/uiStore.ts` (100, 106) يستدعون `supabase.storage` مباشرة داخل Zustand actions.

### الحل
- استخدام `storageService` الجديد (الفئة C).
- الاستدعاءات في التعليقات (159, 181, 342, 353, 598) هي **تعليقات فقط** (عبارة "تم استبداله بـ") — لا يوجد كود مباشر.

---

## 🟢 الفئة F: RPC calls (P2)

### المواقع

| # | الملف | RPC |
|:---:|---|---|
| 1 | `services/integrations/leaveAttendanceLink.ts:189` | `refresh_attendance_summary` |
| 2 | `services/notifications/notificationService.ts:339` | `create_notification_safe` |
| 3 | `services/notifications/notificationService.ts:553` | `cleanup_expired_notifications` |

### الحل
هذه RPCs معتمدة بشكل صحيح. الحل: نقلها إلى SDK كـ methods واضحة:
```ts
// SDK
attendanceService.refreshSummary(employeeId, from, to)
notificationService.createSafe(payload)
notificationService.cleanupExpired()
```

---

## 🟢 الفئة G: Realtime channels — **استثناء مبرَّر** (P3)

### المواقع

| # | الملف | القناة |
|:---:|---|---|
| 1 | `core/stores/index.ts:85` | `profile-updates-{userId}` |
| 2 | `pages/hr/HRCommunicationPage.tsx:35` | `hr-messages-listener` |
| 3 | `services/notifications/notificationService.ts:83` | notification channels |

### القرار
**نُبقيها كما هي** لأن:
- Realtime API خاص جداً بـ Supabase (channels + subscribe).
- تغليفه في SDK يخفي القوة الحقيقية للـ subscriptions.
- نُضيفها إلى **allowlist صريحة** في CI check لتوثيقها كاستثناءات مقصودة.

---

## 🟢 الفئة H: supabase.auth مباشر (P3)

### المواقع

| # | الملف | الاستخدام |
|:---:|---|---|
| 1 | `modules/tawathul/services/TawathulConversationService.ts:24` | `getUser()` |
| 2 | `modules/tawathul/services/TawathulMessageService.ts:91` | `getUser()` |
| 3 | `modules/tawathul/utils/errors.ts:23` | `getUser()` |

### الحل
استبدال جميعها بـ `authService.getCurrentUser()` (موجود في SDK).

---

## 🎯 خطة التنفيذ — 4 مراحل

### 📅 المرحلة 1: الأمنية العاجلة (P0) — ~30 دقيقة
1. ✅ إضافة `SecurityEventService` إلى SDK.
2. ✅ إصلاح 4 استخدامات في الفئة A لاستخدام SDK services.
3. ✅ اختبار: كتابة في `audit_logs`/`security_events`/`error_logs` تنجح مع tenant_id تلقائياً.

### 📅 المرحلة 2: البنية التحتية (P1) — ~90 دقيقة
1. ✅ إنشاء **`StorageService`** موحّد في SDK.
2. ✅ إنشاء **`BiometricDeviceService`** لـ TechPortal.
3. ✅ استبدال 9 مواقع Storage.
4. ✅ استبدال 4 مواقع TechPortal.

### 📅 المرحلة 3: RPC + Auth (P2) — ~30 دقيقة
1. ✅ نقل 3 RPC calls إلى SDK methods.
2. ✅ استبدال 3 استدعاءات `supabase.auth.getUser()` بـ `authService.getCurrentUser()`.

### 📅 المرحلة 4: Tawathul + توثيق (P2) — ~60 دقيقة
1. ✅ تحويل `TawathulConversationService` و `TawathulMessageService` لاستخدام `this.queryBuilder` من `BaseService`.
2. ✅ إضافة **CI guard جديد** يمنع استدعاءات مباشرة خارج SDK (مع allowlist للـ Realtime).
3. ✅ تحديث `docs/adr/0002-sdk-layer-architecture.md` باستثناءات موثقة.

---

## ⚙️ CI Guard الجديد

سنُضيف check ضمن `check-db-contract.mjs`:

```js
// كل ملف خارج services/sdk/ و services/supabase/ يجب ألا يستدعي:
//   supabase.from(...)
//   supabase.storage.*
//   supabase.rpc(...)
// الاستثناءات المقبولة (allowlist):
//   supabase.channel(...)     ← Realtime (تصميم)
//   supabase.functions.invoke  ← Edge Functions
const ALLOWLIST = [
  'core/stores/index.ts',                 // channel للـ profile updates
  'pages/hr/HRCommunicationPage.tsx',     // channel للـ hr-messages
  'services/notifications/notificationService.ts', // channel للـ notifications
  'services/ai/edgeAiService.ts',         // functions.invoke
];
```

---

## 📈 الأثر المتوقع

### قبل:
- 45 استدعاء مباشر خارج SDK.
- 4 عمليات أمنية بدون tenant_id.
- تناقض في معالجة الأخطاء.
- Tests صعبة (يجب mock كل استدعاء).

### بعد:
- ✅ **0 استدعاءات** خارج SDK (باستثناء 4 مبرَّرة موثقة).
- ✅ **100% حقن tenant_id** تلقائياً في كل الكتابات.
- ✅ **معالجة أخطاء موحدة** عبر `SdkError`.
- ✅ **CI guard** يمنع regressions.
- ✅ اختبار وحدة أسهل بكثير.

---

## معايير القبول (Definition of Done)

```
[ ] 4 استدعاءات P0 (audit/security/error) تعمل عبر SDK ومع tenant_id
[ ] StorageService جديد + 9 مواقع تستخدمه
[ ] BiometricDeviceService + 4 مواقع تستخدمه
[ ] 3 RPCs عبر SDK methods
[ ] 3 supabase.auth عبر authService
[ ] Tawathul services ترث BaseService بشكل أنظف
[ ] CI guard جديد نشط ويمنع regressions
[ ] كل الفحوصات ما زالت خضراء:
    - type-check PASS
    - test:run 163/163
    - build PASS
    - db contract PASS
    - clean db + RLS tests PASS
```

---

**التوقيع:** Platform Architect
**الحالة:** جاهزة للتنفيذ — أبدأ بالمرحلة 1 (P0 الأمنية) فوراً.
