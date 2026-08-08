#!/usr/bin/env node
/**
 * ═════════════════════════════════════════════════════════════════════════
 *  check-sdk-boundary.mjs — V2 (يصلح كشف النمط متعدد الأسطر)
 *
 *  يمنع أي كود خارج طبقة SDK من الاستدعاء المباشر لـ:
 *    - supabase.from(...)
 *    - supabase.storage.*
 *    - supabase.rpc(...)
 *    - supabase.auth.*  (خارج AuthService)
 *
 *  يعالج:
 *    await supabase
 *      .from('xxx')
 *  عبر فحص المحتوى الكامل وليس سطر واحد ( \s يشمل \n )
 *
 *  المسموح خارج SDK:
 *    - supabase.channel(...)     ← Realtime API
 *    - supabase.removeChannel(...)
 *    - supabase.functions.invoke ← Edge Functions
 * ═════════════════════════════════════════════════════════════════════════
 */
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const searchRoots = [path.join(repoRoot, 'src')];

const SDK_PATHS = [
  'src/services/sdk/',
  'src/services/supabase/',
];
const SDK_ADJACENT_PATHS = [
  'src/modules/tawathul/services/',
];

// ★ 0343: وأُزيل مدخل SOPsPage — صارت عبر sopService.
// ★ 0342: أُزيل مدخلا البلاغات — NewProblemPage صارت عبر
//   `incidentService.submit()`، و ProblemsList انقسمت في 0341 إلى
//   MyProblemsPage و HrProblemsInboxPage وكلتاهما بلا لمس مباشر.
const ALLOWLIST = [
  { file: 'src/services/notifications/notificationService.ts', reason: 'create_notification_safe + cleanup_expired_notifications RPCs — pending SDK migration' },
  { file: 'src/pages/app/finance/CashForecastPage.tsx', reason: 'cash_forecast_scenarios direct query — pending CashForecastService migration' },
  { file: 'src/pages/app/finance/ApprovalsPage.tsx', reason: 'financial_approval_requests direct query — pending FinancialApprovalService migration' },
  { file: 'src/pages/app/finance/AdvancedVariancePage.tsx', reason: 'budget_variance_reports direct query — pending BudgetVarianceService migration' },
  { file: 'src/pages/app/finance/ProjectAccountingPage.tsx', reason: 'finance_projects direct query — pending ProjectAccountingService migration' },
  { file: 'src/pages/admin/AdminEmployeesPage.tsx', reason: 'entity_memberships + cost_centers + finance_projects direct — pending FinanceMembershipService + CostCenterService migration to SDK' },
  { file: 'src/pages/admin/AdminEmployeesPageV2.tsx', reason: 'entity_memberships + cost_centers + finance_projects direct — pending SDK migration (duplicate file for V2)' },
  { file: 'src/pages/devportal/components/CompanyDetailDrawer.tsx', reason: 'profiles + legal_entities + platform_audit_log direct — pending CompanyDetailService SDK migration — needed for professional drawer with IDs' },
  // تم السماح مؤقتاً لحين النقل الكامل لـ SDK (P1) — هذه الملفات كانت تكسر سابقاً وتمر بسبب ثغرة الفحص:
  { file: 'src/services/notifications/attendanceNotificationService.ts', reason: 'attendance direct queries — pending Notification migration to SDK (P1)' },
  { file: 'src/shared/components/dashboard/DeveloperDashboard.tsx', reason: 'developer dashboard direct queries — internal dev portal, pending SDK migration (P1)' },
  { file: 'src/shared/components/dashboard/developer/BiometricSettings.tsx', reason: 'biometric_settings direct — pending SDK migration (P1)' },
  { file: 'src/pages/admin/AdminGatekeeperPermissions.tsx', reason: 'gatekeeper permissions direct — pending GatekeeperService migration (P1)' },
  { file: 'src/pages/admin/AdminPermissionsTree.tsx', reason: 'permissions tree direct — pending PermissionService migration (P1)' },
  { file: 'src/pages/admin/AdminSOPsPage.tsx', reason: 'SOPs direct queries — pending SOPService migration (P1)' },
  { file: 'src/pages/admin/AdminSOPsReport.tsx', reason: 'SOPs report direct queries — pending SOPService migration (P1)' },
  { file: 'src/pages/employee/AttendancePage.tsx', reason: 'attendance page direct queries — pending AttendanceService migration (P1)' },
  { file: 'src/core/tenant/TenantContext.tsx', reason: 'tenant context direct — needed for initial tenant detection before SDK, pending refactor (P1)' },
  { file: 'src/shared/hooks/useTenantModules.ts', reason: 'tenant modules direct — pending TenantModuleService full migration (P1)' },
];

// الأنماط المرفوضة — \s يشمل \n لذا تكشف النمط متعدد الأسطر
const FORBIDDEN_PATTERNS = [
  { name: 'supabase.from()', regex: /\bsupabase\s*\.\s*from\s*\(/g },
  { name: 'supabase.storage', regex: /\bsupabase\s*\.\s*storage\b/g },
  { name: 'supabase.rpc()', regex: /\bsupabase\s*\.\s*rpc\s*\(/g },
  { name: 'supabase.auth.', regex: /\bsupabase\s*\.\s*auth\s*\./g },
];

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
  if (/\.(test|spec)\.(ts|tsx)$/.test(file)) return false;
  if (file.includes(path.sep + 'test' + path.sep)) return false;
  if (file.includes(path.sep + '__tests__' + path.sep)) return false;
  return true;
}
function relativePath(file) {
  return path.relative(repoRoot, file).replace(/\\/g, '/');
}
function isInSdkLayer(relPath) {
  return SDK_PATHS.some((p) => relPath.startsWith(p)) || SDK_ADJACENT_PATHS.some((p) => relPath.startsWith(p));
}
function isAllowed(relPath) {
  return ALLOWLIST.some((entry) => entry.file === relPath);
}
function getLineNumber(text, index) {
  return text.slice(0, index).split('\n').length;
}
function getSnippet(text, index) {
  const start = text.lastIndexOf('\n', index) + 1;
  const end = text.indexOf('\n', index);
  const line = text.slice(start, end === -1 ? index + 120 : end).trim();
  return line.slice(0, 160);
}
function isCommentLine(snippet) {
  const t = snippet.trim();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('*/');
}

const violations = [];
const seenAllowlistUsage = new Set();

for (const root of searchRoots) {
  for (const file of walk(root)) {
    if (!isSourceFile(file)) continue;
    const relPath = relativePath(file);
    if (isInSdkLayer(relPath)) continue;

    const text = fs.readFileSync(file, 'utf8');
    const fileViolations = [];

    for (const pattern of FORBIDDEN_PATTERNS) {
      pattern.regex.lastIndex = 0;
      let match;
      while ((match = pattern.regex.exec(text)) !== null) {
        const lineNum = getLineNumber(text, match.index);
        const snippet = getSnippet(text, match.index);
        if (isCommentLine(snippet)) continue;
        // تجاهل channel و functions.invoke و removeChannel التي قد تمر عبر .from? لا، هي آمنة
        // لكن supabase.auth. يحتوي channel؟ لا
        // نستثني إذا كان السطر يحتوي supabase.channel أو removeChannel أو functions.invoke
        if (snippet.includes('supabase.channel') || snippet.includes('removeChannel') || snippet.includes('functions.invoke')) continue;
        fileViolations.push({
          line: lineNum,
          pattern: pattern.name,
          snippet,
        });
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

const staleAllowlist = ALLOWLIST.map((e) => e.file).filter((f) => !seenAllowlistUsage.has(f) && fs.existsSync(path.join(repoRoot, f)));

console.log(`SDK Boundary Check (V2 — multiline aware)`);
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
  console.error(`❌ ${violations.length} ملف يخالف حدود SDK (مجموع الانتهاكات: ${violations.reduce((s, v) => s + v.count, 0)})`);
  console.error('');
  for (const v of violations) {
    console.error(`  ${v.file}  (${v.count} انتهاك)`);
    for (const d of v.details.slice(0, 5)) {
      console.error(`    :${d.line}  [${d.pattern}]  ${d.snippet}`);
    }
    if (v.details.length > 5) console.error(`    ... و ${v.details.length - 5} انتهاك آخر`);
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
