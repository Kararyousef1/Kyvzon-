#!/bin/bash
echo "=== التحقق الشامل: بناء + أخطاء + اختبارات ==="
echo ""
echo "[1/3] فحص البناء (npm run build)..."
npm run build 2>&1 | tail -n 10
BUILD_OK=$?
echo ""
echo "[2/3] فحص ملفات TypeScript (noEmit)..."
npx tsc --noEmit 2>&1 | head -n 10 || echo "لا أخطاء تركيبية"
echo ""
echo "[3/3] تشغيل الاختبارات (npm run test)..."
npm run test -- --run 2>&1 | tail -n 10 || echo "لا توجد اختبارات أو فشل"
echo ""
echo "=== ملخص: بناء=$BUILD_OK ==="
