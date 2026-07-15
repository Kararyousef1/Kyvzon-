#!/usr/bin/env bash
# ============================================================================
#  Clean DB Test — تشغيل كل migrations على قاعدة فارغة + التحقق
#
#  الهدف: إثبات أن supabase/migrations/ ينفَّذ من الصفر بنجاح كامل.
#
#  المتطلبات:
#    - Postgres 15+ متاح على PGPORT (افتراضي 54322)
#    - كل ملفات supabase/migrations/*.sql موجودة
#
#  ما يفعل:
#    1. يُنشئ قاعدة اختبار فارغة (kyvzon_clean_test)
#    2. يُشغِّل Supabase shim (auth schema + roles)
#    3. يُشغِّل كل migrations بالترتيب مع رصد نتائج كل ملف
#    4. يُشغِّل استعلامات التحقق النهائية
# ============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MIGRATIONS_DIR="$REPO_ROOT/supabase/migrations"
SHIM_FILE="$REPO_ROOT/scripts/tests/00_supabase_shim.sql"
CHECK_FILE="$REPO_ROOT/scripts/tests/99_post_migration_checks.sql"
RLS_TEST_FILE="$REPO_ROOT/scripts/tests/rls_isolation_test.sql"

# اختياري: تخطي اختبار العزل بـ SKIP_RLS_TEST=1
SKIP_RLS_TEST="${SKIP_RLS_TEST:-0}"

PGHOST="${PGHOST:-/tmp}"
PGPORT="${PGPORT:-54322}"
PGUSER="${PGUSER:-postgres}"
DB_NAME="${DB_NAME:-kyvzon_clean_test}"

# ألوان بسيطة
G='\033[0;32m'; R='\033[0;31m'; Y='\033[1;33m'; B='\033[0;34m'; N='\033[0m'

banner() {
  echo ""
  echo -e "${B}════════════════════════════════════════════════════════════${N}"
  echo -e "${B} $1${N}"
  echo -e "${B}════════════════════════════════════════════════════════════${N}"
}

psql_cmd() {
  psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -v ON_ERROR_STOP=1 "$@"
}

# ─── 1. إسقاط قاعدة الاختبار وإنشاؤها من جديد ─────────────────────────────
banner "1. إعادة إنشاء قاعدة اختبار نظيفة: $DB_NAME"
psql_cmd -d postgres -c "DROP DATABASE IF EXISTS $DB_NAME;" >/dev/null
psql_cmd -d postgres -c "CREATE DATABASE $DB_NAME;" >/dev/null
echo -e "${G}✓${N} قاعدة $DB_NAME أُنشئت"

# ─── 2. تشغيل Supabase shim ───────────────────────────────────────────────
banner "2. تشغيل Supabase shim (auth schema + roles)"
if ! psql_cmd -d "$DB_NAME" -f "$SHIM_FILE" >/tmp/shim.log 2>&1; then
  echo -e "${R}✗ فشل shim:${N}"
  cat /tmp/shim.log
  exit 1
fi
echo -e "${G}✓${N} shim تم"

# ─── 3. تشغيل migrations بالترتيب ─────────────────────────────────────────
banner "3. تنفيذ Migrations من الصفر"
FAILED=0
TOTAL=0
for f in "$MIGRATIONS_DIR"/*.sql; do
  fname=$(basename "$f")
  TOTAL=$((TOTAL+1))
  printf "  %-45s " "$fname"
  START=$(date +%s%N)
  if psql_cmd -d "$DB_NAME" -f "$f" >/tmp/mig.log 2>&1; then
    END=$(date +%s%N)
    MS=$(( (END - START) / 1000000 ))
    echo -e "${G}✓${N} ${MS}ms"
  else
    echo -e "${R}✗ FAILED${N}"
    echo -e "${R}─── آخر 25 سطر من الخطأ:${N}"
    tail -25 /tmp/mig.log
    FAILED=$((FAILED+1))
    break
  fi
done

if [ $FAILED -gt 0 ]; then
  echo ""
  echo -e "${R}❌ فشل $FAILED من $TOTAL ملف migration${N}"
  exit 1
fi

echo ""
echo -e "${G}✅ كل $TOTAL migration نُفِّذوا بنجاح${N}"

# ─── 4. فحوصات ما بعد التنفيذ ────────────────────────────────────────────
banner "4. فحوصات ما بعد التنفيذ"
if psql_cmd -d "$DB_NAME" -f "$CHECK_FILE"; then
  echo ""
  echo -e "${G}✅ جميع الفحوصات النهائية نجحت${N}"
else
  echo -e "${R}✗ فشلت الفحوصات النهائية${N}"
  exit 1
fi

# ─── 5. اختبار عزل RLS بين الشركات ───────────────────────────────────────
if [ "$SKIP_RLS_TEST" != "1" ] && [ -f "$RLS_TEST_FILE" ]; then
  banner "5. اختبار عزل RLS بين الشركات (Cross-Tenant)"
  if psql_cmd -d "$DB_NAME" -f "$RLS_TEST_FILE" >/tmp/rls.log 2>&1; then
    # عرض ملخص فقط
    grep -E "PASS|FAIL|SETUP|TESTS PASSED" /tmp/rls.log | head -30
    echo ""
    echo -e "${G}✅ اختبار عزل RLS نجح — العزل بين الشركات مُثبَت${N}"
  else
    echo -e "${R}✗ فشل اختبار العزل${N}"
    tail -30 /tmp/rls.log
    exit 1
  fi
fi

banner "🎉 اكتمل اختبار قاعدة البيانات النظيفة بنجاح"
echo -e "${G}قاعدة الاختبار متاحة على:${N}"
echo -e "  psql -h $PGHOST -p $PGPORT -U $PGUSER -d $DB_NAME"
