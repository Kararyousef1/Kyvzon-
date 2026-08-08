# أرشيف صفحات بوابة الموظف

> **الأرشفة لا الحذف** — قاعدةُ المشروع: لا حذفَ نهائيّ.

## `AttendancePage.tsx` — أُرشف في 0373

**السبب:** ملفٌّ ميّت.

- **غيرُ مُوجَّهٍ في `AppRouter`**: المسار `app/employee/attendance`
  يشير إلى `MyAttendancePage` (السطر 1218)، و`AttendancePage` هذه
  لا يستوردها أحدٌ إطلاقاً — لا `import` عاديّ ولا `lazy(() => import(…))`.
- **ومع ذلك كانت تلمس Supabase في خمسة مواضع** (`attendance_logs`
  · `attendance_summary` · `leave_balance` · `leaves`)، فتُبقي
  «خطّ الأساس» في `portalHygieneContract` مرتفعاً بلا سبب.

**الأثر:** خطُّ الأساس ينخفض من ثلاثة ملفاتٍ إلى اثنين:
`NewProblemPage` · `SOPsPage`.

**كيف اكتُشف:** ماسحُ `tools/dev/scan_portals.py` رصد
`[SUPABASE]`، ثمّ فحصُ المستورِدين أثبت أنّ الملفّ لا يُستدعى.
