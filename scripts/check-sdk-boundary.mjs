#!/usr/bin/env node
/**
 * ═════════════════════════════════════════════════════════════════════════
 *  check-sdk-boundary.mjs
 *
 *  يمنع أي كود خارج طبقة SDK من الاستدعاء المباشر لـ:
 *    - supabase.from(...)
 *    - supabase.storage.*
 *    - supabase.rpc(...)
 *    - supabase.auth.*  (خارج AuthService)
 *
 *  المسموح خارج SDK:
 *    - supabase.channel(...)     ← Realtime API (تصميم مقصود)
 *    - supabase.functions.invoke ← Edge Functions
 *
 *  الاستثناءات الموثقة (Allowlist): مذكورة أدناه صراحةً مع سبب لكل ملف.
 * ═════════════════════════════════════════════════════════════════════════
 */
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const searchRoots = [path.join(repoRoot, 'src')];

// SDK layer paths — استدعاءات مباشرة مسموحة هنا لأنها موقع التغليف نفسه
const SDK_PATHS = [
  'src/services/sdk/',
  'src/services/supabase/',
];

// Modules/services تُعتبر SDK-adjacent (تحقن tenant_id يدوياً + معالجة أخطاء)
// راجع docs/adr/0002-sdk-layer-architecture.md
const SDK_ADJACENT_PATHS = [
  'src/modules/tawathul/services/',
];

// استثناءات موثقة (Allowlist) — كل عنصر يجب أن يذكر السبب
// هذه للاستدعاءات التي **يجب** أن تبقى خارج SDK مؤقتاً.
const ALLOWLIST = [
  // supabase.rpc(...) + supabase.channel(...) للإشعارات — سيُنقَل RPC للـ SDK في phase لاحقة
  { file: 'src/services/notifications/notificationService.ts',    reason: 'create_notification_safe + cleanup_expired_notifications RPCs — pending SDK migration' },
  // RPC للحسابات المخصصة — سيُنقَل إلى AttendanceService لاحقاً
  { file: 'src/services/integrations/leaveAttendanceLink.ts',    reason: 'supabase.rpc(refresh_attendance_summary) — pending AttendanceService migration' },
  // Finance beta pages — تم تحويلها من PlannedFeature إلى Real لكن تستخدم supabase.from مباشرة مؤقتاً — ستنتقل لـ SDK في Sprint التالي
  { file: 'src/pages/app/finance/CashForecastPage.tsx', reason: 'cash_forecast_scenarios direct query — pending CashForecastService migration' },
  { file: 'src/pages/app/finance/ApprovalsPage.tsx', reason: 'financial_approval_requests direct query — pending FinancialApprovalService migration' },
  { file: 'src/pages/app/finance/AdvancedVariancePage.tsx', reason: 'budget_variance_reports direct query — pending BudgetVarianceService migration' },
  { file: 'src/pages/app/finance/ProjectAccountingPage.tsx', reason: 'finance_projects direct query — pending ProjectAccountingService migration' },
  { file: 'src/pages/admin/AdminEmployeesPage.tsx', reason: 'entity_memberships + cost_centers + finance_projects direct — pending FinanceMembershipService + CostCenterService migration to SDK' },
  { file: 'src/pages/admin/AdminEmployeesPageV2.tsx', reason: 'entity_memberships + cost_centers + finance_projects direct — pending SDK migration (duplicate file for V2)' },
  { file: 'src/pages/devportal/components/CompanyDetailDrawer.tsx', reason: 'profiles + legal_entities + platform_audit_log direct — pending CompanyDetailService SDK migration — needed for professional drawer with IDs' },
  { file: 'src/pages/hr/TrainingManagementPage.tsx', reason: 'quizzes upsert direct — pending TrainingService Quiz migration — removed localStorage fallback' },
];

// الأنماط المرفوضة (Realtime + Edge Functions مسموحة صراحةً)
const FORBIDDEN_PATTERNS = [
  { name: 'supabase.from()',      regex: /\bsupabase\s*\.\s*from\s*\(/g },
  { name: 'supabase.storage',     regex: /\bsupabase\s*\.\s*storage\b/g },
  { name: 'supabase.rpc()',       regex: /\bsupabase\s*\.\s*rpc\s*\(/g },
  { name: 'supabase.auth.',       regex: /\bsupabase\s*\.\s*auth\s*\./g },
];

// الأنماط المسموحة صراحةً (لا تُعتبر مخالفات حتى خارج SDK):
//  - supabase.channel(...)        Realtime subscriptions
//  - supabase.removeChannel(...)  cleanup للـ subscriptions
//  - supabase.functions.invoke    استدعاء Edge Functions
// هذه لا تحتاج تغليف في SDK لأن API الخاص بها معقّد ومباشر بطبيعته.

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}

function isSourceFile(file) {
  if (!/\.(ts|tsx)$/.test(file)) return false;
  // استثناء ملفات الاختبار — mocking للـ supabase مسموح فيها
  if (/\.(test|spec)\.(ts|tsx)$/.test(file)) return false;
  // استثناء مجلد الاختبارات كاملاً
  if (file.includes(path.sep + 'test' + path.sep)) return false;
  if (file.includes(path.sep + '__tests__' + path.sep)) return false;
  return true;
}

function relativePath(file) {
  return path.relative(repoRoot, file).replace(/\\/g, '/');
}

function isInSdkLayer(relPath) {
  return SDK_PATHS.some((p) => relPath.startsWith(p))
      || SDK_ADJACENT_PATHS.some((p) => relPath.startsWith(p));
}

function isAllowed(relPath) {
  return ALLOWLIST.some((entry) => entry.file === relPath);
}

// اجمع كل الانتهاكات
const violations = [];
const seenAllowlistUsage = new Set();

for (const root of searchRoots) {
  for (const file of walk(root)) {
    if (!isSourceFile(file)) continue;

    const relPath = relativePath(file);
    if (isInSdkLayer(relPath)) continue;

    const text = fs.readFileSync(file, 'utf8');

    // نبحث سطراً سطراً لتمرير التعليقات
    const lines = text.split('\n');
    const fileViolations = [];

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];
      // تخطي السطور التي هي تعليقات صرفة
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
        continue;
      }

      for (const pattern of FORBIDDEN_PATTERNS) {
        pattern.regex.lastIndex = 0;
        if (pattern.regex.test(line)) {
          fileViolations.push({
            line: lineNum + 1,
            pattern: pattern.name,
            snippet: trimmed.slice(0, 120),
          });
        }
      }
    }

    if (fileViolations.length === 0) continue;

    if (isAllowed(relPath)) {
      seenAllowlistUsage.add(relPath);
      continue;
    }

    violations.push({ file: relPath, count: fileViolations.length, details: fileViolations });
  }
}

// اكتشف عناصر Allowlist لم تُستخدم — علامة على تنظيف يجب إجراؤه
const staleAllowlist = ALLOWLIST
  .map((e) => e.file)
  .filter((f) => !seenAllowlistUsage.has(f) && fs.existsSync(path.join(repoRoot, f)));

// طباعة النتيجة
console.log(`SDK Boundary Check`);
console.log(`──────────────────`);
console.log(`Scanned roots:       ${searchRoots.map(relativePath).join(', ')}`);
console.log(`SDK layer paths:     ${SDK_PATHS.length + SDK_ADJACENT_PATHS.length}`);
console.log(`Allowlist entries:   ${ALLOWLIST.length}`);
console.log(`Allowlist used:      ${seenAllowlistUsage.size}`);
console.log('');

if (violations.length === 0 && staleAllowlist.length === 0) {
  console.log('✅ SDK Boundary Check: PASS');
  process.exit(0);
}

if (violations.length > 0) {
  console.error(`❌ ${violations.length} ملف يخالف حدود SDK (مجموع الانتهاكات: ${
    violations.reduce((s, v) => s + v.count, 0)
  })`);
  console.error('');
  for (const v of violations) {
    console.error(`  ${v.file}  (${v.count} انتهاك)`);
    for (const d of v.details.slice(0, 5)) {
      console.error(`    :${d.line}  [${d.pattern}]  ${d.snippet}`);
    }
    if (v.details.length > 5) {
      console.error(`    ... و ${v.details.length - 5} انتهاك آخر`);
    }
  }
  console.error('');
  console.error('الحل: استخدم خدمات من src/services/sdk/ بدلاً من supabase مباشرة.');
  console.error('راجع: docs/adr/0002-sdk-layer-architecture.md');
}

if (staleAllowlist.length > 0) {
  console.error('');
  console.error(`⚠️  ${staleAllowlist.length} عنصر allowlist قديم (لم يعد فيه انتهاك — يجب إزالته):`);
  for (const f of staleAllowlist) console.error(`    - ${f}`);
}

process.exit(violations.length > 0 ? 1 : 0);
