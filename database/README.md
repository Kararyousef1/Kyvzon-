# 📁 `database/` — نظرة عامة

هذا المجلد يحتوي على:

- **`seeds/`** — بيانات ديمو للاختبار المحلي (`complete_demo.sql`, `gatekeeper_extra.sql`, `seed_courses_sops_data.sql`).
- **`legacy-DO-NOT-USE/`** — ملفات تاريخية للاطلاع فقط. **لا تُنفَّذ**.

---

## 🎯 لإعداد قاعدة بيانات جديدة، اتبع:

```
supabase/migrations/README.md
```

هذا هو **المسار الوحيد الرسمي** لكل ما يتعلق بـ schema.

---

## طريقة تحميل بيانات الديمو (اختياري)

بعد تنفيذ كل ملفات `supabase/migrations/`:

```bash
# 1. حمّل الجدول الأساسي
psql "$DB_URL" -f database/seeds/complete_demo.sql

# 2. (اختياري) بيانات Gatekeeper
psql "$DB_URL" -f database/seeds/gatekeeper_extra.sql

# 3. (اختياري) بيانات الدورات والـ SOPs
psql "$DB_URL" -f database/seeds/seed_courses_sops_data.sql
```

⚠️ **لا تحمّل seeds على بيئة production.**

---

**آخر تحديث:** 2026-07-15
