# 🚶 الدور «أ» — حركة الموظفين · 7 وحدات · 28 صفحة

المسار الجذر: `/app/movement/employee/*`
الحارس: `<RequireMovementRole role="employee_movement" />`

---

## E00 — الأساس والسياسات (4 صفحات)

| الصفحة | المسار | المحتوى |
|---|---|---|
| لوحة الحركة | `/foundation` | KPI: خارج الآن · متأخرون · تصاريح اليوم · مخالفات |
| المواقع والوجهات | `/foundation/locations` | CRUD على `movement_locations` + منتقي خريطة |
| السياسات | `/foundation/policies` | حد المدة · حاجة الموافقة · احتساب من الدوام |
| سجل التدقيق | `/foundation/audit` | `movement_audit_events` بفلاتر |

### تفاصيل «المواقع والوجهات» — أهم صفحة في الوحدة
```
تخطيط: جدول يمين + خريطة يسار (Leaflet)
النموذج: الكود (تلقائي) · الاسم عربي/إنجليزي · النوع (12 قيمة)
        الإحداثيات ← نقر على الخريطة (لا كتابة يدوية)
        نصف قطر السور (افتراضي 150م) — يُرسم دائرة حية
        ساعات العمل (7 أيام × فتح/إغلاق)
        الربط: فرع / مستودع / مورد
إجراءات: أرشفة (لا حذف) بسبب نصي إلزامي
```

### السياسات القابلة للضبط
```
max_permit_duration_minutes          افتراضي 240
require_approval_above_minutes       افتراضي 60
allow_same_day_permit                افتراضي true
auto_expire_unused_permit_hours      افتراضي 24
overdue_grace_minutes                افتراضي 15
require_gps_on_field_visit           افتراضي true
max_open_permits_per_employee        افتراضي 1
```

---

## E01 — تصاريح الخروج (5 صفحات)

| الصفحة | المسار | المحتوى |
|---|---|---|
| قائمة التصاريح | `/permits` | فلاتر: الحالة · النوع · القسم · التاريخ |
| تصريح جديد | `/permits/new` | نموذج متعدد الخطوات |
| تفاصيل التصريح | `/permits/:id` | الخط الزمني · QR · الموافقات · المرفقات |
| صندوق الموافقات | `/permits/approvals` | المعلَّقة على المستخدم — اعتماد/رفض/تفويض |
| قوالب التصاريح | `/permits/templates` | قوالب متكررة (زيارة بنك أسبوعية) |

### نموذج التصريح — الحقول الدقيقة
```
الموظف         ← بحث (لا UUID) — الافتراضي: المستخدم نفسه
النوع          ← 8 قيم من CHECK
الوجهة         ← منتقي من movement_locations (نص حر باستثناء موثَّق)
الغرض          ← نص إلزامي (≥ 10 أحرف)
الخروج المخطط  ← datetime
العودة المخططة ← datetime (يُحسب من max_duration تلقائياً)
مدفوع الأجر؟   ← switch (يؤثر على الحضور)
خصم من الإجازة؟← switch
المرفقات       ← رفع اختياري
```
تحقق فوري: `planned_return_at > planned_exit_at` · المدة ≤ حد السياسة ·
لا تصريح مفتوح آخر · تعارض مع اجتماع؟

### QR ودورة الحياة
```
draft → pending_approval → approved → active → completed
                        ↘ rejected      ↘ expired
                                        ↘ cancelled (سبب إلزامي)
```
> QR يُولَّد **عند الاعتماد** كـ `SHA-256` مخزَّن؛ النص الخام يُعرض مرة
> واحدة فقط. صلاحيته تنتهي بانتهاء التصريح.

---

## E02 — تنفيذ الحركة والبوابة (4 صفحات)

| الصفحة | المسار | المحتوى |
|---|---|---|
| شاشة البوابة | `/execution` | واجهة الحارس — مسح QR / بحث |
| من بالخارج الآن | `/execution/currently-out` | تحديث حي + عدّاد تنازلي |
| تسجيل يدوي | `/execution/manual` | حالات الطوارئ بسبب إلزامي |
| سجل الحركات | `/execution/log` | `employee_movement_log` بفلاتر + تصدير |

### شاشة البوابة — تصميم تشغيلي
```
┌────────────────────────────────────────┐
│  [ماسح QR كبير]     │  آخر 10 حركات    │
│                     │  ─────────────    │
│  أو ابحث بالاسم     │  ✅ أحمد · خروج  │
│  [___________]      │  ⬅️ سارة · عودة  │
└────────────────────────────────────────┘
عند المسح:
  ✅ صالح   → صورة + اسم + وجهة + وقت العودة → [تأكيد الخروج]
  ⚠️ متأخر  → تحذير أصفر + المدة
  ❌ باطل   → أحمر + السبب (منتهٍ/مستخدم/ملغى)
```
> لا `confirm()` — بطاقة تأكيد داخل الصفحة.
> الشاشة تعمل بلا فأرة (لمس + ماسح باركود).

### «من بالخارج الآن»
```
بطاقة لكل موظف:
  الاسم · القسم · الوجهة · خرج منذ · متبقٍ ⏱
  🟢 ضمن الوقت   🟡 اقترب الانتهاء   🔴 متأخر
إجراءات: اتصال · تمديد (بسبب) · تسجيل عودة · تصعيد
```

---

## E03 — الزيارات الميدانية (4 صفحات)

| الصفحة | المسار | المحتوى |
|---|---|---|
| جدول الزيارات | `/field-visits` | تقويم + قائمة |
| تخطيط زيارة | `/field-visits/plan` | عميل · أجندة · موارد |
| تسجيل الوصول | `/field-visits/checkins` | تحقق GPS من السور |
| تقارير الزيارات | `/field-visits/reports` | النتائج والمتابعات |

```
دورة الزيارة:
  مخططة → في الطريق → وصل (GPS+سور) → جارية → مكتملة → تقرير مُسلَّم
تسجيل الوصول يلتقط: الإحداثيات · دقة القياس · صورة اختيارية
                    التحقق من السور (خارجه؟ يُعلَّم للمراجعة)
```

---

## E04 — المهام والانتدابات (4 صفحات)
`/assignments` · `/assignments/new` · `/assignments/:id` · `/assignments/calendar`

انتداب متعدد الأيام: مدينة أخرى · بدل سفر · سكن · ربط بالمالية.

---

## E05 — الامتثال والمخالفات (4 صفحات)

| الصفحة | المحتوى |
|---|---|
| `/compliance` | لوحة: معدل الالتزام · المخالفات المفتوحة |
| `/compliance/violations` | تسجيل ومعالجة |
| `/compliance/rules` | قواعد الكشف الآلي |
| `/compliance/escalations` | التصعيد للمدير |

### أنواع المخالفات
```
late_return        عودة بعد المدة + مهلة السماح
no_permit          خروج بلا تصريح (من البوابة)
no_return          لم يعد نهائياً في نفس اليوم
geofence_breach    خارج نطاق الوجهة المعتمدة
excessive_frequency تكرار مفرط شهرياً
```
كل مخالفة: `detected_at` · `severity` · `status`
(`open`/`under_review`/`justified`/`penalized`/`dismissed`) + **سبب إلزامي عند الإغلاق**.

---

## E06 — التحليلات والتقارير (3 صفحات)
`/analytics` · `/analytics/patterns` · `/analytics/exports`

### المؤشرات
```
إجمالي الحركات · متوسط المدة · معدل الالتزام %
أكثر الوجهات · التوزيع حسب القسم/النوع
اتجاه شهري · ساعات الذروة (heatmap)
ساعات ضائعة · مقارنة الأقسام
```
> التصدير عبر `src/utils/dataExport.ts` حصراً (BOM + حماية الحقن).

---

## خريطة استبدال القائم

| القديم | الجديد | الإجراء |
|---|---|---|
| `MovementControlPage.tsx` (264) | E02 (4 صفحات) | يُستبدل |
| `HRMovementAnalyticsPage.tsx` (683) | E06 (3 صفحات) | يُقسَّم |
| `MovementAnalysisPage.tsx` (48) | E06 | يُدمج |
| `movements_log` | `employee_movement_log` | ترحيل بيانات |
| `movement_permits` | `employee_movement_permits` | ترحيل بيانات |

### سكربت الترحيل
```sql
-- الوجهات النصية → مواقع منظَّمة
INSERT INTO public.movement_locations (tenant_id, location_code, name_ar, location_type, status)
SELECT DISTINCT tenant_id,
       'LEG-' || LEFT(MD5(destination), 8),
       destination, 'other', 'active'
FROM public.movements_log
WHERE destination IS NOT NULL AND TRIM(destination) <> ''
ON CONFLICT DO NOTHING;

-- الحركات مع تطبيع النوع
INSERT INTO public.employee_movement_log
  (tenant_id, movement_number, employee_id, movement_type,
   destination_id, departure_at, returned_at, notes, status, created_at)
SELECT m.tenant_id,
       'MIG-' || LPAD(ROW_NUMBER() OVER (ORDER BY m.created_at)::TEXT, 6, '0'),
       m.employee_id,
       CASE WHEN m.movement_type IN ('exit','return','field_visit','training')
            THEN m.movement_type ELSE 'exit' END,
       l.id, m.departure_at, m.returned_at,
       COALESCE(m.notes,'') || ' [مُرحَّل من movements_log]',
       CASE WHEN m.returned_at IS NOT NULL THEN 'returned' ELSE 'no_return' END,
       m.created_at
FROM public.movements_log m
LEFT JOIN public.movement_locations l
       ON l.tenant_id = m.tenant_id
      AND l.location_code = 'LEG-' || LEFT(MD5(m.destination), 8);
```

> ⚠️ **لا تحذف الجدولين القديمين في نفس المايجريشن.** أعِد تسميتهما
> `_deprecated` واحذفهما بعد التحقق في مايجريشن لاحق.
