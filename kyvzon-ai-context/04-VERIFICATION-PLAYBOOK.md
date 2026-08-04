# ✅ دليل التحقق — أهم ملف تقني

> **القاعدة الذهبية: لا تُوثّق بأي SQL لم يُنفَّذ فعلياً.**

## 1) مستويات التحقق الأربعة — لا تخلط بينها

| المستوى | يكشف | لا يكشف |
|---|---|---|
| **1. فحص ثابت** (`grep`, type-check) | أخطاء الصياغة والأنواع في TS | أي خطأ SQL وقت تنفيذ |
| **2. Postgres محلي** | تعارض الأنواع · SQL ديناميكي · الصلاحيات · المنطق | سلوك PostgREST الحقيقي |
| **3. `supabase db push`** | تعارضات المنصة الفعلية | سلوك المتصفح |
| **4. متصفح حقيقي** | كل شيء | — |

عند التقرير للمستخدم **صرّح بالمستوى الذي بلغتَه**.

---

## 2) ★ بناء مختبر Postgres 17 محلي (بلا صلاحيات root)

هذه الطريقة كشفت **10+ أخطاء وقت تنفيذ** لم يكشفها أي فحص ثابت.

### الخطوة أ — تنزيل الحزم واستخراجها

```bash
mkdir -p /home/user/.pgtest/debs && cd /home/user/.pgtest/debs
apt-get download postgresql-17 postgresql-client-17 postgresql-common \
  postgresql-client-common libpq5 libllvm19 libicu76 libxslt1.1 ssl-cert libjson-perl
mkdir -p ../root && for f in *.deb; do dpkg-deb -x "$f" ../root; done
```

### الخطوة ب — تشغيل الخادم

```bash
export PGR=/home/user/.pgtest/root
export PATH=$PGR/usr/lib/postgresql/17/bin:$PATH
export LD_LIBRARY_PATH=$PGR/usr/lib/x86_64-linux-gnu:$PGR/usr/lib
rm -rf /home/user/.pgtest/data /home/user/.pgtest/sock
mkdir -p /home/user/.pgtest/sock
initdb -D /home/user/.pgtest/data -U postgres --auth=trust
pg_ctl -D /home/user/.pgtest/data \
  -o "-p 55432 -k /home/user/.pgtest/sock -c listen_addresses=''" \
  -l /home/user/.pgtest/server.log start
```

### الخطوة ج — ★ shim محاكاة Supabase

> **جاهز في المستودع:** `tools/dev/pgtest-supabase-shim.sql`

```bash
psql -h /home/user/.pgtest/sock -p 55432 -U postgres -q \
  -f tools/dev/pgtest-supabase-shim.sql
```

محتواه: مخطط `auth` + `auth.uid()/role()/jwt()` + أدوار
`anon/authenticated/service_role/authenticator/...` **و السطر الحاسم**:

```sql
-- بدونه لن تكتشف أخطاء الصلاحيات إطلاقاً
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
```

> ⚠️ غياب هذا السطر هو سبب عدم كشف فشل `0268` محلياً قبل `db push`.

### الخطوة د — تطبيق كل المايجريشنات

```bash
cd supabase/migrations
FAIL=0
for f in $(ls *.sql | sort); do
  out=$(psql -h /home/user/.pgtest/sock -p 55432 -U postgres \
        -v ON_ERROR_STOP=1 -q -f "$f" 2>&1)
  if [ $? -ne 0 ]; then
    echo "### FAIL: $f"; echo "$out" | grep ERROR | head -2; FAIL=$((FAIL+1))
  fi
done
echo "فشل: $FAIL"
```

**النتيجة المرجعية (2026-08-04): 198 مايجريشن → 0 فشل.**

---

## 3) مسوحات الكشف الآلي — شغّلها بعد أي عمل على SQL

### أ) دوال `RETURNS TABLE` (تعارض الأنواع والغموض)

```sql
DO $o$ DECLARE r RECORD; a TEXT; c INT; bad INT:=0; tot INT:=0;
BEGIN
 FOR r IN SELECT p.oid,p.proname,pg_get_function_identity_arguments(p.oid) x
          FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='public' AND p.proretset AND p.prokind='f'
            AND p.proname NOT LIKE 'pgp_%' LOOP
  SELECT COALESCE(string_agg('NULL::'||t,','),'') INTO a
  FROM unnest(string_to_array(r.x,', ')) AS z(item),
  LATERAL (SELECT regexp_replace(item,'^(IN |OUT |INOUT |VARIADIC )?([a-z_0-9]+ )?','') t) y
  WHERE item<>'' AND item NOT LIKE 'OUT %';
  tot:=tot+1;
  BEGIN EXECUTE format('SELECT count(*) FROM public.%I(%s)',r.proname,a) INTO c;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%does not match function result type%'
       OR SQLERRM LIKE '%ambiguous%'
    THEN bad:=bad+1; RAISE WARNING 'ISSUE %: %',r.proname,SQLERRM; END IF; END;
 END LOOP;
 RAISE NOTICE 'دوال: % | مشاكل: %',tot,bad;
END $o$;
```
**المرجع: 71 دالة → 0 مشكلة.**

### ب) كل الـ Views

```sql
DO $o$ DECLARE r RECORD; c INT; bad INT:=0; tot INT:=0;
BEGIN
 FOR r IN SELECT viewname FROM pg_views WHERE schemaname='public' LOOP
  tot:=tot+1;
  BEGIN EXECUTE format('SELECT count(*) FROM public.%I',r.viewname) INTO c;
  EXCEPTION WHEN OTHERS THEN bad:=bad+1; RAISE WARNING 'VIEW %: %',r.viewname,SQLERRM; END;
 END LOOP;
 RAISE NOTICE 'views: % | معطوبة: %',tot,bad;
END $o$;
```
**المرجع: 294 view → 0 معطوب.**

### ج) دوال `STABLE`/`IMMUTABLE` تكتب

```sql
SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.provolatile IN ('s','i')
  AND p.prosrc ~* '(^|[^a-z_])(insert into|update |delete from)';
```
**المرجع: لا يوجد.** (حارس دائم في `0259` يفشل المايجريشن إن ظهرت واحدة.)

### د) الصلاحيات الخطرة

```sql
SELECT p.proname,
       has_function_privilege('anon',p.oid,'EXECUTE') anon_can,
       has_function_privilege('authenticated',p.oid,'EXECUTE') auth_can
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.prosecdef
  AND has_function_privilege('anon',p.oid,'EXECUTE');
```
راجع كل نتيجة: هل الدالة تفحص `auth.uid()` داخلياً؟ إن لا → اسحب `anon`.

---

## 4) تحييد الأمان لاختبار المنطق فقط

```sql
CREATE OR REPLACE FUNCTION public.procurement_require_roles(allowed_roles TEXT[])
RETURNS VOID LANGUAGE plpgsql STABLE AS $$ BEGIN RETURN; END $$;

CREATE OR REPLACE FUNCTION public.current_user_tenant_id() RETURNS UUID
LANGUAGE SQL STABLE AS $$
  SELECT tenant_id FROM public.profiles WHERE email='<test-email>' LIMIT 1 $$;

CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID LANGUAGE SQL STABLE AS $$
  SELECT id FROM public.profiles WHERE email='<test-email>' LIMIT 1 $$;
```

> ⚠️ **بعد التحييد لا تدّعِ أنك تحققت من الأمان.** اختبر الصلاحيات
> في قاعدة نظيفة بلا تحييد عبر `SET ROLE anon;`.

---

## 5) فصائل الأخطاء المكتشَفة (دروس مدفوعة الثمن)

| # | الفصيلة | المثال الحقيقي |
|---|---|---|
| 1 | `RETURNS TABLE` type mismatch | `varchar` مقابل `TEXT` → خطأ 400 عند أول استدعاء. الحل: `::TEXT` صريح |
| 2 | SQL ديناميكي داخل `EXECUTE` | `b.name` وعمود غير موجود — لا يُفحص عند الإنشاء |
| 3 | `STABLE` مع كتابة | `UPDATE is not allowed in a non-volatile function` |
| 4 | تعارض اسم عمود إخراج | `column reference "status" is ambiguous` |
| 5 | عمود غير موجود | `updated_at` في `goods_receipts` |
| 6 | غياب محفّز مزامنة | إجمالي PO لا يتحدث من سطوره → كل التحليلات أصفار |
| 7 | **قيمة CHECK خاطئة** | `status='closed'` والمسموح `ended` |
| 8 | **صلاحية `anon` التلقائية** | راجع `02-DATABASE-AND-SECURITY.md` §2 |

---

## 6) قائمة التحقق قبل إعلان الانتهاء

```bash
npm ci
npm run type-check                 # 0 أخطاء
npm run lint                       # 0 errors
npm run test:run                   # 764 اختباراً
npm run build
npm run db:contract-check
npm run db:procurement-sql-check
npm run sdk:boundary-check
# + Postgres محلي: 198 مايجريشن · 71 دالة · 294 view
```

ثم صرّح بوضوح:
- ✅ ما تحقّقتَ منه ومستوى التحقق.
- ❌ ما لم تتحقق منه (`db push`؟ متصفح؟).
