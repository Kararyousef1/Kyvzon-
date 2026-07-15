# ============================================================================
#  verify-changes.ps1 — التحقق من تغييرات جلسة 2026-07-15
#
#  الاستخدام (في PowerShell):
#    cd E:\-Al-Rafidain
#    powershell -ExecutionPolicy Bypass -File verify-changes.ps1
#
#  أو ببساطة:
#    .\verify-changes.ps1
#
#  إذا ظهر خطأ execution policy، شغّل:
#    Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
#    ثم .\verify-changes.ps1
# ============================================================================

# ─── إعدادات الألوان ─────────────────────────────────────────────
$host.UI.RawUI.WindowTitle = "Kyvzon Changes Verification"

# عدّادات
$script:PASS = 0
$script:FAIL = 0
$script:WARN = 0

# ─── دوال مساعدة ─────────────────────────────────────────────────
function Write-Banner {
    param([string]$Title)
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Blue
    Write-Host " $Title" -ForegroundColor Blue
    Write-Host "============================================================" -ForegroundColor Blue
}

function Test-FileExists {
    param([string]$Path, [string]$Description)
    if (Test-Path $Path -PathType Leaf) {
        Write-Host "  [OK] $Description" -ForegroundColor Green
        Write-Host "       $Path" -ForegroundColor DarkCyan
        $script:PASS++
        return $true
    } else {
        Write-Host "  [MISSING] $Description" -ForegroundColor Red
        Write-Host "            $Path" -ForegroundColor DarkRed
        $script:FAIL++
        return $false
    }
}

function Test-DirExists {
    param([string]$Path, [string]$Description)
    if (Test-Path $Path -PathType Container) {
        $count = (Get-ChildItem $Path -Force -ErrorAction SilentlyContinue | Measure-Object).Count
        Write-Host "  [OK] $Description ($count elements)" -ForegroundColor Green
        Write-Host "       $Path" -ForegroundColor DarkCyan
        $script:PASS++
        return $true
    } else {
        Write-Host "  [MISSING FOLDER] $Description" -ForegroundColor Red
        Write-Host "                   $Path" -ForegroundColor DarkRed
        $script:FAIL++
        return $false
    }
}

function Test-FileDeleted {
    param([string]$Path, [string]$Description)
    if (-not (Test-Path $Path)) {
        Write-Host "  [DELETED OK] $Description" -ForegroundColor Green
        $script:PASS++
        return $true
    } else {
        Write-Host "  [SHOULD BE DELETED] $Description" -ForegroundColor Red
        Write-Host "                      $Path" -ForegroundColor DarkRed
        $script:FAIL++
        return $false
    }
}

function Test-FileContains {
    param([string]$Path, [string]$Pattern, [string]$Description)
    if (-not (Test-Path $Path)) {
        Write-Host "  [X] $Description (file not found)" -ForegroundColor Red
        $script:FAIL++
        return
    }
    if (Select-String -Path $Path -Pattern $Pattern -Quiet) {
        Write-Host "  [OK] $Description" -ForegroundColor Green
        $script:PASS++
    } else {
        Write-Host "  [X] $Description" -ForegroundColor Red
        $script:FAIL++
    }
}

function Test-FileNotContains {
    param([string]$Path, [string]$Pattern, [string]$Description)
    if (-not (Test-Path $Path)) {
        Write-Host "  [SKIP] $Description (file not found)" -ForegroundColor Yellow
        $script:WARN++
        return
    }
    if (Select-String -Path $Path -Pattern $Pattern -Quiet) {
        Write-Host "  [X] $Description (still contains old pattern)" -ForegroundColor Red
        $script:FAIL++
    } else {
        Write-Host "  [OK] $Description" -ForegroundColor Green
        $script:PASS++
    }
}

# ─── START ──────────────────────────────────────────────────────
Clear-Host
Write-Host "==============================================================" -ForegroundColor Blue
Write-Host " Kyvzon Platform - Changes Verification Script" -ForegroundColor Blue
Write-Host " Session 2026-07-15" -ForegroundColor Blue
Write-Host "==============================================================" -ForegroundColor Blue

# ─── 0. البيئة ─────────────────────────────────────────────────
Write-Banner "0. Environment"
Write-Host "  Current directory: $(Get-Location)" -ForegroundColor Cyan

try {
    $nodeVersion = node --version 2>$null
    Write-Host "  Node version:      $nodeVersion" -ForegroundColor Cyan
} catch { Write-Host "  Node: not installed" -ForegroundColor Red }

try {
    $npmVersion = npm --version 2>$null
    Write-Host "  npm version:       $npmVersion" -ForegroundColor Cyan
} catch { Write-Host "  npm: not installed" -ForegroundColor Red }

if (Test-Path ".git") {
    $branch = git branch --show-current 2>$null
    $lastCommit = git log --oneline -1 2>$null
    $changeCount = (git status --short 2>$null | Measure-Object).Count
    Write-Host "  Git branch:        $branch" -ForegroundColor Cyan
    Write-Host "  Last commit:       $lastCommit" -ForegroundColor Cyan
    Write-Host "  Uncommitted:       $changeCount files" -ForegroundColor Cyan
} else {
    Write-Host "  WARNING: Not in a git repository!" -ForegroundColor Red
}

# ─── 1. Router ──────────────────────────────────────────────────
Write-Banner "1. Router Migration (Phase 4+5)"
Test-DirExists "src/router" "Router root directory"
Test-FileExists "src/router/AppRouter.tsx" "AppRouter main (83 routes)"
Test-FileExists "src/router/constants.ts" "constants (ROLE_DEFAULT_PATH)"
Test-FileExists "src/router/legacyRedirect.ts" "legacyRedirect (95 mappings)"
Test-DirExists "src/router/guards" "Guards folder"
Test-FileExists "src/router/guards/RequireAuth.tsx" "RequireAuth"
Test-FileExists "src/router/guards/RequireRole.tsx" "RequireRole"
Test-FileExists "src/router/guards/RequirePermission.tsx" "RequirePermission"
Test-FileExists "src/router/guards/RoleRedirect.tsx" "RoleRedirect"
Test-DirExists "src/router/layouts" "Layouts folder"
Test-FileExists "src/router/layouts/AppLayout.tsx" "AppLayout"
Test-FileExists "src/router/layouts/DevLayout.tsx" "DevLayout"
Test-FileDeleted "src/router/useLegacyView.ts" "useLegacyView shim (should be removed)"

# ─── 2. SDK ─────────────────────────────────────────────────────
Write-Banner "2. SDK Layer Cleanup (Phase 3)"
Test-FileExists "src/services/sdk/StorageService.ts" "StorageService"
Test-FileExists "src/services/sdk/SecurityEventService.ts" "SecurityEventService"
Test-FileExists "src/services/sdk/BiometricDeviceService.ts" "BiometricDeviceService"
Test-FileExists "scripts/check-sdk-boundary.mjs" "SDK Boundary CI check"

# ─── 3. Migrations ──────────────────────────────────────────────
Write-Banner "3. SQL Migrations (Phase 1)"
Test-FileExists "supabase/migrations/0000_extensions.sql" "0000: extensions"
Test-FileExists "supabase/migrations/0011_announcements.sql" "0011: announcements"
Test-FileExists "supabase/migrations/0012_gatekeeper_and_missing.sql" "0012: gatekeeper"
Test-FileExists "supabase/migrations/0013_drop_dead_tables.sql" "0013: drop dead"
Test-FileExists "supabase/migrations/0014_structure_reference_rls.sql" "0014: structure RLS"
Test-FileExists "supabase/migrations/0015_relaxed_insert_for_audit_error_security.sql" "0015: relaxed audit"
Test-FileExists "supabase/migrations/README.md" "Migrations README"

# عدد ملفات migration
$migrationCount = (Get-ChildItem "supabase/migrations/*.sql" -ErrorAction SilentlyContinue | Measure-Object).Count
if ($migrationCount -eq 16) {
    Write-Host "  [OK] Total migrations: 16" -ForegroundColor Green
    $script:PASS++
} elseif ($migrationCount -gt 0) {
    Write-Host "  [WARN] Total migrations: $migrationCount (expected 16)" -ForegroundColor Yellow
    $script:WARN++
} else {
    Write-Host "  [X] No migrations found!" -ForegroundColor Red
    $script:FAIL++
}

Test-DirExists "database/legacy-DO-NOT-USE" "Legacy archive folder"
Test-FileExists "database/legacy-DO-NOT-USE/schema.sql" "schema.sql (archived)"
Test-FileExists "database/legacy-DO-NOT-USE/README.md" "Legacy warning README"
Test-FileDeleted "supabase/migrations/README_AR.md" "Old README_AR.md (should be removed)"

# ─── 4. Testing Infrastructure ─────────────────────────────────
Write-Banner "4. Testing Infrastructure (Phase 2)"
Test-DirExists "scripts/tests" "DB tests folder"
Test-FileExists "scripts/tests/00_supabase_shim.sql" "Supabase shim"
Test-FileExists "scripts/tests/99_post_migration_checks.sql" "Post-migration checks"
Test-FileExists "scripts/tests/rls_isolation_test.sql" "10 RLS tests"
Test-FileExists "scripts/tests/run_clean_db_test.sh" "Main test runner"

# ─── 5. Unit Tests ─────────────────────────────────────────────
Write-Banner "5. New Unit Tests"
Test-DirExists "src/test/router" "Router tests"
Test-FileExists "src/test/router/constants.test.ts" "constants test"
Test-FileExists "src/test/router/legacyRedirect.test.ts" "legacyRedirect test"
Test-FileExists "src/test/router/RouteGuards.test.tsx" "RouteGuards test"
Test-FileExists "src/test/router/no-legacy-view.test.ts" "no-legacy-view regression"

Test-DirExists "src/test/sdk" "SDK tests"
Test-FileExists "src/test/sdk/BaseService.test.ts" "BaseService test"
Test-FileExists "src/test/sdk/SecurityEventService.test.ts" "SecurityEventService test"
Test-FileExists "src/test/sdk/StorageService.test.ts" "StorageService test"

Test-DirExists "src/test/edgeFunctions" "Edge Functions tests"
Test-FileExists "src/test/edgeFunctions/rateLimit.test.ts" "rateLimit test"
Test-FileExists "src/test/edgeFunctions/adminAuth.test.ts" "adminAuth test"

# ─── 6. Edge Functions ─────────────────────────────────────────
Write-Banner "6. Edge Functions Hardening (Phase 6)"
Test-FileExists "supabase/functions/_shared/rateLimit.ts" "Rate Limiter"
Test-FileExists "supabase/functions/_shared/adminAuth.ts" "adminAuth (updated)"

# ─── 7. Dead Code ──────────────────────────────────────────────
Write-Banner "7. Dead Code (should be removed)"
Test-FileDeleted "src/pages/public/LandingPage.old.tsx" "LandingPage.old.tsx (1480 lines)"
Test-FileDeleted "src/shared/components/dashboard/DashboardContent.tsx" "DashboardContent.tsx (150 lines)"

# ─── 8. Documentation ─────────────────────────────────────────
Write-Banner "8. New Documentation"
Test-FileExists "README.md" "Main README (new)"
Test-FileExists "docs/OPERATIONS_RUNBOOK_AR.md" "Operations Runbook (800 lines)"
Test-FileExists "docs/DATABASE_ARCHITECTURE.md" "Database Architecture"
Test-FileExists "docs/EDGE_FUNCTIONS_DEPLOYMENT.md" "Edge Functions Deployment"
Test-FileExists "docs/RLS_ISOLATION_TEST_REPORT_AR.md" "RLS test report"
Test-FileExists "docs/SDK_CLEANUP_COMPLETION_REPORT_AR.md" "SDK cleanup report"
Test-FileExists "docs/ROUTER_FINAL_COMPLETION_REPORT_AR.md" "Router final report"
Test-FileExists "docs/EDGE_FUNCTIONS_HARDENING_COMPLETION_REPORT_AR.md" "Edge Functions report"

# ─── 9. Modified Files ────────────────────────────────────────
Write-Banner "9. Critical Modified Files"

if (Test-Path "src/App.tsx") {
    $lines = (Get-Content "src/App.tsx" | Measure-Object -Line).Lines
    if ($lines -lt 100) {
        Write-Host "  [OK] App.tsx reduced: $lines lines (was 467)" -ForegroundColor Green
        $script:PASS++
    } else {
        Write-Host "  [WARN] App.tsx: $lines lines (expected ~79)" -ForegroundColor Yellow
        $script:WARN++
    }
}

Test-FileNotContains "src/core/stores/index.ts" "activeView:\s*string" "UIStore clean of activeView"
Test-FileContains "package.json" '"react-router-dom"' "react-router-dom in package.json"
Test-FileContains "package.json" '"check:all"' "npm run check:all"
Test-FileContains "package.json" '"sdk:boundary-check"' "npm run sdk:boundary-check"

# ─── 10. No Legacy Usage ──────────────────────────────────────
Write-Banner "10. No Legacy Pattern Usage"

# useLegacyView
$legacyFiles = Get-ChildItem -Path "src" -Recurse -Include *.ts,*.tsx -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -notlike "*.test.*" } |
    Select-String -Pattern "useLegacyView" -List |
    Select-Object -ExpandProperty Path

if ($legacyFiles.Count -eq 0) {
    Write-Host "  [OK] No file uses useLegacyView" -ForegroundColor Green
    $script:PASS++
} else {
    Write-Host "  [X] $($legacyFiles.Count) files still use useLegacyView:" -ForegroundColor Red
    $legacyFiles | ForEach-Object { Write-Host "       $_" -ForegroundColor DarkRed }
    $script:FAIL++
}

# setActiveView (excluding comments and tests)
$setActiveFiles = Get-ChildItem -Path "src" -Recurse -Include *.ts,*.tsx -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -notlike "*.test.*" } |
    Select-String -Pattern "setActiveView\(" -List |
    Where-Object { $_.Line -notmatch "^\s*(//|\*|/\*)" } |
    Select-Object -ExpandProperty Path

if ($setActiveFiles.Count -eq 0) {
    Write-Host "  [OK] No setActiveView() calls in code" -ForegroundColor Green
    $script:PASS++
} else {
    Write-Host "  [X] $($setActiveFiles.Count) files still call setActiveView():" -ForegroundColor Red
    $setActiveFiles | Select-Object -First 5 | ForEach-Object { Write-Host "       $_" -ForegroundColor DarkRed }
    $script:FAIL++
}

# ─── 11. Git Status Summary ───────────────────────────────────
Write-Banner "11. Git Status Summary"
if (Test-Path ".git") {
    $status = git status --short 2>$null
    $total = ($status | Measure-Object).Count
    $added = ($status | Where-Object { $_ -match "^\?\?" } | Measure-Object).Count
    $modified = ($status | Where-Object { $_ -match "^\s?M" } | Measure-Object).Count
    $renamed = ($status | Where-Object { $_ -match "^R" } | Measure-Object).Count
    $deleted = ($status | Where-Object { $_ -match "^\s?D" } | Measure-Object).Count

    Write-Host "  Total changes:    $total" -ForegroundColor Cyan
    Write-Host "  Added (new):      $added" -ForegroundColor Cyan
    Write-Host "  Modified:         $modified" -ForegroundColor Cyan
    Write-Host "  Renamed:          $renamed" -ForegroundColor Cyan
    Write-Host "  Deleted:          $deleted" -ForegroundColor Cyan

    if ($total -gt 50) {
        Write-Host "  [OK] Change count looks right ($total)" -ForegroundColor Green
        $script:PASS++
    } else {
        Write-Host "  [WARN] Change count lower than expected ($total < 50)" -ForegroundColor Yellow
        $script:WARN++
    }
}

# ─── FINAL SUMMARY ────────────────────────────────────────────
Write-Banner "FINAL SUMMARY"

$total = $script:PASS + $script:FAIL + $script:WARN
Write-Host ""
Write-Host "  [OK] Passed:    $($script:PASS) / $total" -ForegroundColor Green
Write-Host "  [WARN]         $($script:WARN) / $total" -ForegroundColor Yellow
Write-Host "  [X] Failed:    $($script:FAIL) / $total" -ForegroundColor Red
Write-Host ""

if ($script:FAIL -eq 0) {
    Write-Host "==============================================================" -ForegroundColor Green
    Write-Host " ALL CHECKS PASSED! Everything is in place." -ForegroundColor Green
    Write-Host " Next step: run 'npm run check:all'" -ForegroundColor Green
    Write-Host "==============================================================" -ForegroundColor Green

    Write-Banner "Suggested Next Steps"
    Write-Host "  1. Install new dependencies:" -ForegroundColor Cyan
    Write-Host "     npm ci" -ForegroundColor Green
    Write-Host ""
    Write-Host "  2. Run full checks:" -ForegroundColor Cyan
    Write-Host "     npm run check:all" -ForegroundColor Green
    Write-Host ""
    Write-Host "  3. If all pass, commit and push:" -ForegroundColor Cyan
    Write-Host "     git add ." -ForegroundColor Green
    Write-Host "     git commit -m 'feat: platform hardening'" -ForegroundColor Green
    Write-Host "     git push origin remediation/p0-security-and-build-health" -ForegroundColor Green
} elseif ($script:FAIL -lt 5) {
    Write-Host "==============================================================" -ForegroundColor Yellow
    Write-Host " Some files are missing ($($script:FAIL)). Review details above." -ForegroundColor Yellow
    Write-Host "==============================================================" -ForegroundColor Yellow
} else {
    Write-Host "==============================================================" -ForegroundColor Red
    Write-Host " Many files missing ($($script:FAIL)). Copy may be incomplete." -ForegroundColor Red
    Write-Host " Copy this output and share it back in the session." -ForegroundColor Red
    Write-Host "==============================================================" -ForegroundColor Red
}

Write-Host ""
Write-Host "To save this output to a file, run:" -ForegroundColor DarkCyan
Write-Host "  powershell -ExecutionPolicy Bypass -File verify-changes.ps1 > verification-report.txt" -ForegroundColor DarkCyan

exit $script:FAIL
