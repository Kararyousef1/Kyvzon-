# 🎨 قواعد الواجهة والتنقل — إلزامية

## 1) مبادئ UX التي لا يُتنازل عنها

نصّاً من المستخدم:
> «لا أريدك أن تجعل الموضوع فوضوياً ومعقداً. هذه الصفحات يجب أن تكون
> داخل الوحدات بشكل مرتب ومتناسق، كل وحدة تعرض فقط ما يخصها من الصفحات.»

| القاعدة | التفصيل |
|---|---|
| **لا نسخ/لصق UUID** | استخدم Lookups / بحث / قوائم منسدلة |
| **باني سطور** | line builders بدل JSON textareas |
| **توليد تلقائي** | الأكواد والباركود تُولَّد عند الحفظ — لا أزرار توليد يدوية |
| **سبب نصي إلزامي** | كل تعديل/تغيير حالة/إقفال يتطلب سبباً يظهر في التدقيق |
| **لا حذف نهائي** | للسجلات الحرجة: archive/close/cancel/deactivate/retire/void |
| **ممنوع منعاً باتاً** | `confirm()` · `prompt()` · `as any` |

### بدائل `confirm`/`prompt`
استخدم نموذجاً (modal) داخل الصفحة بحقل سبب ونصّي وأزرار تأكيد/إلغاء.

**مثال واقعي عولج:** قرار تجديد العقد كان 6 قيم تُكتب يدوياً عبر
`prompt()` → صار قائمة منسدلة. وتقييم MECCA كان حلقة `prompt` لكل
معيار → صار نموذجاً واحداً.

---

## 2) ★ بنية التنقل: الشريط الجانبي يعرض الوحدات فقط

```
الشريط الجانبي  →  الوحدات الرئيسية فقط
      └── داخل الوحدة  →  بطاقات أفقية لصفحاتها (UnitNav)
```

المكوّنات المعتمدة:
- `FinanceUnitNav` (16 وحدة)
- `ProcurementUnitNav` (9 وحدات)
- نفس النمط في المخزون و MRP

آلية العمل في `src/shared/components/dashboard/Sidebar.tsx` →
دالة `splitInventorySection` تفلتر بقائمة `mainIds`:

| المفتاح | العدد |
|---|---|
| `inventory-main` | 10 عناصر |
| `mrp-main` | 13 |
| `finance-main` | 16 |
| `procurement-main` | 9 (+ `procurement-integration`) |

---

## 3) ★★ فخ حرج: `allowed_pages` يتجاوز الأدوار

في `Sidebar.tsx` (~السطر 1038):

```ts
const allowedPages = user.custom_permissions?.allowed_pages;
if (Array.isArray(allowedPages)) {
  return allowedPages.includes(item.id) || fallback.some(id => allowedPages.includes(id));
}
```

> عند وجود `custom_permissions.allowed_pages` **يُتجاهل الدور كلياً**.
> أي وحدة جديدة لا تُسجَّل هناك **لن تظهر** لمستخدمي الاشتراك الهجين.

### ⇒ أي وحدة/صفحة جديدة تحتاج تسجيلاً في **4 مواضع** — كلها معاً

```
1. src/shared/components/dashboard/Sidebar.tsx
   (+ FINANCE_UNIT_FALLBACK / PROCUREMENT_UNIT_FALLBACK)
2. src/pages/hybridportal/hybridPagesCatalog.ts
3. src/pages/admin/AdminEmployeesPage.tsx
4. src/router/AppRouter.tsx + src/router/legacyRedirect.ts
```

> نسيان أحدها = صفحة لا يمكن الوصول إليها أو لا تظهر لبعض المستخدمين.
> سابقة: 29 صفحة مالية كانت مسجَّلة **صفر** مرات في `hybridPagesCatalog`.

---

## 4) قالب صفحة نموذجي

```tsx
export default function MyPage() {
  const { addToast } = useUIStore();
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await myService.findAll();
      setRows(data);
    } catch (e) {
      addToast(`تعذر التحميل: ${getErrorMessage(e)}`, 'error');
    } finally { setLoading(false); }
  }, [addToast]);

  return (
    <div className="space-y-5 max-w-[1600px] mx-auto" dir="rtl">
      <ProcurementUnitNav unit="foundation" />
      {/* ... */}
    </div>
  );
}
```

عناصر ثابتة: `dir="rtl"` · `max-w-[1600px] mx-auto` · `useUIStore().addToast`
· `getErrorMessage(e)` من `src/services/errors` · حالة `loading`.

---

## 5) التصدير الآمن — `src/utils/dataExport.ts`

استخدم هذه الأداة، **لا** تكتب تصديراً يدوياً.

```ts
import { exportToCsv, type ExportColumn } from '../../../../utils/dataExport';

const columns: ExportColumn<Row>[] = [
  { header: 'رقم الفاتورة', value: r => r.invoice_number },
  { header: 'الإجمالي',     value: r => r.total_amount ?? 0 },
];
exportToCsv('أرشيف_الفواتير', columns, rows);
```

### لماذا؟ عيبان حقيقيان في التصديرات اليدوية

**أ) العربية مشوّهة:** بلا BOM (`\uFEFF`) يفترض Excel على ويندوز
ترميز windows-1256 → كل النص العربي رموز.

**ب) ثغرة CSV Injection:** خلية تبدأ بـ `=` `+` `-` `@` TAB CR
يفسّرها Excel كصيغة. مثل `=cmd|'/c calc'!A1`.
**وبيانات الموردين تصل من البوابة الخارجية — غير موثوقة بالتعريف.**

الأداة تعالج الأمرين + اقتباس RFC 4180 + اسم ملف آمن.

> **PDF غير مدعوم** (يتطلب مكتبة). `exportToExcelHtml` يُنتج جدول HTML
> يفتحه Excel وليس XLSX ثنائياً — صرّح بذلك للمستخدم إن سأل.

---

## 6) بوابة المورد الخارجية — موجودة وكاملة

> ⚠️ تقارير سابقة ادّعت أنها «غائبة كلياً». **الادعاء خاطئ.**

| المسار | الصفحة | الوظيفة |
|---|---|---|
| `/supplier-portal/:token` | `SupplierPortalPage.tsx` | تسجيل ذاتي + وثائق + جهات اتصال |
| `/supplier-rfx/:token` | `SupplierRfxPortalPage.tsx` | تقديم عروض RFx |
| `/supplier-invoice/:token` | `SupplierInvoicePortalPage.tsx` | رفع فواتير |
| `/supplier-dock/:token` | `SupplierDockPortalPage.tsx` | حجز موعد رصيف |

في `src/pages/public/supplier/`. المصادقة: capability-token (SHA-256)
+ `APP_ORIGIN` allowlist + انتهاء صلاحية. الدوال الحدّية المقابلة:
`procurement-supplier-portal` · `-rfx` · `-invoice` · `-invite` ·
`procurement-send-rfq` · `inventory-supplier-dock-portal`.
