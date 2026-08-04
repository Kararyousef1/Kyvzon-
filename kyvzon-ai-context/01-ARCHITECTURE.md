# 🏗️ بنية مشروع Kyvzon

## 1) الأرقام (مُحقَّقة بالعدّ الفعلي 2026-08-04)

| المقياس | العدد |
|---|---|
| مايجريشنات SQL | **198** |
| جداول في `public` | **586** |
| Views | **294** |
| دوال `RETURNS TABLE` | **71** |
| سياسات RLS (`CREATE POLICY`) | **351** |
| Edge Functions | **34** |
| ملفات `.ts`/`.tsx` في `src` | **938** |
| ملفات اختبار | **85** (764 اختباراً) |
| ملفات توثيق `.md` | **162** |
| أسطر الكود الكلية | ~117,700 |

---

## 2) شجرة المشروع

```
Kyvzon/
├── src/
│   ├── router/
│   │   ├── AppRouter.tsx          ★ 1299 سطراً — كل المسارات
│   │   ├── moduleMap.ts           ربط المسار ← مفتاح الوحدة
│   │   ├── legacyRedirect.ts      تحويل المسارات القديمة
│   │   └── guards/
│   │       ├── RequireAuth.tsx
│   │       ├── RequireRole.tsx    فحص الدور
│   │       └── RequireModule.tsx  ★ فحص تفعيل الوحدة + الاشتراك
│   ├── services/
│   │   ├── sdk/                   ★ الطبقة الوحيدة المسموح لها بلمس Supabase
│   │   │   ├── BaseService.ts     الأساس العام <T> + SdkError
│   │   │   ├── TenantModuleCatalog.ts
│   │   │   ├── Procurement/       9 خدمات
│   │   │   └── ... (~100 خدمة)
│   │   └── supabase/supabase.ts   عميل Supabase
│   ├── pages/
│   │   ├── app/                   بوابات التطبيق
│   │   │   ├── finance/     (33 صفحة)
│   │   │   ├── inventory/   (130)
│   │   │   ├── mrp/         (146)
│   │   │   └── procurement/ (38)
│   │   ├── public/supplier/       ★ بوابة المورد الخارجية (4 صفحات)
│   │   ├── admin/ · hr/ · devportal/ · hybridportal/
│   ├── shared/components/dashboard/
│   │   └── Sidebar.tsx            ★ 1264 سطراً — التنقل الرئيسي
│   ├── utils/dataExport.ts        تصدير آمن (CSV/Excel)
│   └── test/                      85 ملف اختبار
├── supabase/
│   ├── migrations/                198 ملفاً بترقيم متسلسل
│   └── functions/                 34 Edge Function
├── scripts/
│   ├── check-db-contract.mjs
│   ├── check-procurement-sql.mjs
│   └── check-sdk-boundary.mjs     ★ يمنع تجاوز طبقة SDK
└── docs/                          162 ملفاً
```

---

## 3) ★ قاعدة معمارية صارمة: حدود طبقة SDK

`scripts/check-sdk-boundary.mjs` يمنع أي كود **خارج** `src/services/sdk/`
من الاستدعاء المباشر لـ:

```
❌ supabase.from(...)
❌ supabase.rpc(...)
❌ supabase.storage.*
❌ supabase.auth.*        (خارج AuthService)
```

المسموح خارج SDK:
```
✅ supabase.channel(...) / removeChannel(...)   ← Realtime
✅ supabase.functions.invoke(...)               ← Edge Functions
```

> الصفحات **لا** تستعلم من قاعدة البيانات مباشرة. كل استعلام يمرّ عبر خدمة SDK.
> هناك allowlist صغيرة موثَّقة داخل السكربت لحالات قديمة قيد الترحيل.

---

## 4) نمط `BaseService<T>`

```ts
class XService extends BaseService<XRecord> {
  constructor() { super('table_name'); }
  async findSomething(): Promise<XRecord[]> { ... }
}
export const xService = new XService();
```

يوفّر: `findAll` · `findById` · `create` · `update` · فلترة tenant تلقائية
· أخطاء موحَّدة عبر `SdkError` + `SdkErrorCode`.

> **مهم:** `BaseService.delete()` موجود لكن **ممنوع** استخدامه على
> السجلات الحرجة. استخدم archive/close/cancel/void. راجع `03-UI-UX-RULES.md`.

---

## 5) نظام الوحدات (Modules)

20 مفتاح وحدة في `src/services/sdk/TenantModuleCatalog.ts`:

```
employee · hr · admin · manager · supervisor · gatekeeper · movement
tawathul · tech_portal · ai · reports · health_safety · succession
contracts · marketing · crm · procurement · inventory · mrp · finance
```

لكل وحدة: `key` · `label` · `minPlan` · `status` (production/beta/planned) · `wave`.

**آلية الحماية:** `RequireModule` يقرأ `tenant_modules.is_enabled` للمستأجر.
إن لم يُمرَّر `moduleKey` صراحةً يشتقّه من `ROUTE_MODULE_MAP` في `moduleMap.ts`.

> ✅ **تحقّق مُثبت 2026-08-04:** `<Route element={<RequireModule />}>` عند
> السطر 648 في `AppRouter.tsx` يغلّف **كل** `/app` (يُغلق عند 1275).
> لذلك مسارات CRM/marketing/hr محمية أيضاً رغم عدم تمرير `moduleKey`.
> **لا توجد ثغرة `RequireModule` في CRM** — ادعاء سابق بذلك كان خاطئاً.

---

## 6) أوامر التشغيل

```bash
npm ci                          # ← ابدأ بهذا دائماً
npm run dev
npm run type-check              # tsc --noEmit
npm run lint
npm run test:run                # 764 اختباراً
npm run build
npm run db:contract-check
npm run db:procurement-sql-check
npm run sdk:boundary-check
npm run check:all               # كل ما سبق بالتسلسل
```
