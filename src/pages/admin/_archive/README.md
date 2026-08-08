# أرشيف صفحات الإدارة

ملفات أُخرجت من نطاق البناء (`tsconfig.json` يشمل `src` لكن امتداد
`.bak` يمنع مُصرّف TypeScript و Vite من التقاطها). تبقى هنا للاطلاع
التاريخي فقط.

---

## `AdminEmployeesPageV2.tsx.bak`

**أُرشِف في:** 2026-08-05 (الجولة `0324`)
**الحجم:** 668 سطراً

### سبب الأرشفة

**كود ميت تماماً.** الفحص أعاد صفر مرجع:

```bash
grep -rn "AdminEmployeesPageV2" src/ | grep -v "^src/pages/admin/AdminEmployeesPageV2.tsx"
# (لا نتائج)
```

غير مسجَّل في أيٍّ من مواضع التسجيل الخمسة المعتمدة:

| الموضع | مسجَّل؟ |
|---|---|
| `src/router/AppRouter.tsx` | ✗ |
| `src/shared/components/dashboard/Sidebar.tsx` | ✗ |
| `src/pages/hybridportal/hybridPagesCatalog.ts` | ✗ |
| `src/pages/admin/AdminEmployeesPage.tsx` | ✗ |
| `src/core/constants/permissions.ts` | ✗ |

النسخة الحيّة هي `src/pages/admin/AdminEmployeesPage.tsx` (1811 سطراً)
وهي المسجَّلة في المواضع الخمسة.

### مخالفتان كان يحملهما

كان يُبقي مخالفتين لسياسة المنصة داخل شجرة المصدر، تظهران في كل بحث
نصّي وتُوهمان بأنهما كود عامل:

```tsx
// السطر 413
onClick={async () => {
  if(!confirm(`حذف ${emp.full_name}؟`)) return;          // ① confirm() محظور
  await adminUserService.deleteUser({                     // ② حذف نهائي للمستخدم
    target_user_id: emp.id,
    deleted_by: currentUser?.id||''
  });
  await fetchAll();
}}
```

- **`confirm()`** — محظور بسياسة المنصة (يوقف الصفحة ولا يُنسَّق مع
  بقية الواجهة). البديل المعتمد: `Modal` مخصّص كما في
  `MrpRolesAdminPage.tsx`.
- **الحذف النهائي للمستخدم** — سياسة المشروع تفرض
  `archive`/`cancel`/`void` لا `DELETE`.

إصلاح كود لا يصل إليه أحد كان سيُنتج وهم تغطية. الأرشفة تُخرجه من نطاق
الفحص والبناء وتُبقيه مرجعاً.

### الاسترجاع

الملف في تاريخ git كاملاً. لإعادته للخدمة يلزم:

1. إعادة تسميته إلى `.tsx` ونقله إلى `src/pages/admin/`
2. إزالة `confirm()` واستبداله بـ`Modal` تأكيد
3. استبدال الحذف النهائي بأرشفة
4. تسجيله في **المواضع الخمسة** أعلاه
