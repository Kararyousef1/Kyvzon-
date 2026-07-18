#!/bin/bash
# clean-git-history.sh — تنظيف تاريخ Git من الأسرار (P0)
# تحذير: يعيد كتابة التاريخ — يجب تنفيذه بتنسيق مع الفريق وتعطيل branch protection مؤقتاً

set -e

echo "=== Kyvzon — تنظيف تاريخ Git من الأسرار ==="
echo "هذا السكربت يزيل .env و .env.local وأي مفاتيح مكتشفة من كل تاريخ Git"
echo ""

# التحقق من تثبيت git filter-repo أو BFG
if ! command -v git-filter-repo &> /dev/null; then
  echo "git-filter-repo غير مثبت. تثبيت:"
  echo "  pip install git-filter-repo  أو  brew install git-filter-repo"
  exit 1
fi

# 1) إنشاء نسخة احتياطية
echo "1) إنشاء نسخة احتياطية في /tmp/kyvzon-backup-$(date +%s)"
git clone --mirror . /tmp/kyvzon-backup-$(date +%s).git

# 2) إزالة الملفات الحساسة
echo "2) إزالة .env و .env.local من كل commit"
git filter-repo --invert-paths --path .env --path .env.local --force

# 3) إزالة أسرار مكتوبة في ملفات (مثال: SECRETS_ROTATION_REPORT كان يحوي مفتاح)
echo "3) البحث عن أسرار في REPORT (يدوي) — راجع SECRETS_ROTATION_REPORT.md"

# 4) إعادة كتابة الرسائل التي تحتوي على مفاتيح
echo "4) إعادة كتابة commit messages التي تحتوي sk- أو SUPABASE_SERVICE"
# يمكن استخدام git filter-repo --replace-message

# 5) دفع التاريخ الجديد
echo "5) دفع القوة إلى origin/main و origin/remediation/p0-security-and-build-health"
echo "git push origin --force --all"
echo "git push origin --force --tags"

echo ""
echo "=== بعد التنظيف — تدوير الأسرار ==="
echo "- اذهب إلى Supabase Dashboard → Project Settings → API → Reset service_role key"
echo "- أنشئ مفاتيح جديدة لـ OPENROUTER_API_KEY, GROQ_API_KEY"
echo "- حدث Edge Function secrets: supabase secrets set ..."
echo "- حدث .env.local المحلي فقط، لا تلتزم به"
echo "- أخطر الفريق بـ git pull --rebase بعد force push"

echo "تم."
