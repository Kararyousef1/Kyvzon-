/**
 * ════════════════════════════════════════════════════════════════
 *  portalScanContract.test.ts — عقد المسح الثاني (0373)
 *
 *  بطلب المستخدم: «اريد ان تقوم بعمليه مسح اخرى لبوابتين وتتحقق اكثر»
 *
 *  ★★★★ **الماسحُ نفسُه جزءٌ من العقد.** الفحصُ اليدويّ لا يقيس، فبُني
 *      `tools/dev/scan_portals.py` ويُشغَّل هنا آلياً في كلّ اختبار.
 *      أيُّ صفحةٍ جديدةٍ تُدخل نمطاً معطوباً تُمسَك فوراً.
 *
 *  السلوك يُثبته `verify-portal-gaps-0373.sql` (22 تأكيداً)
 *  و`-rls.sh` (20 فحصاً بدور `authenticated`)
 *  و`_invert_0373.py` (16/16 عكساً · صفر ناجٍ).
 * ════════════════════════════════════════════════════════════════
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

const MIG = read('supabase/migrations/0373_portal_scan_gaps.sql');
const migBody = MIG.replace(/^\s*--.*$/gm, '');

/** ★ النهاية `$$;` لا `\n$$;` (درس 0365) */
function fnBody(name: string): string {
  const re = new RegExp(
    `CREATE (?:OR REPLACE )?FUNCTION public\\.${name}\\b[\\s\\S]*?\\$\\$;`, 'm');
  const m = migBody.match(re);
  expect(m, `الدالة ${name} غير موجودة`).toBeTruthy();
  return (m as RegExpMatchArray)[0];
}

interface ScanResult {
  totals: Record<string, number>;
  results: Record<string, Record<string, Array<{ code: string; hits: unknown[] }>>>;
  paged_services: string[];
}

let scan: ScanResult | null = null;
function runScan(): ScanResult {
  if (scan) return scan;
  const python = process.env.PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3');
  const out = execFileSync(python,
    [resolve(root, 'tools/dev/scan_portals.py'), '--json'],
    { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  scan = JSON.parse(out) as ScanResult;
  return scan;
}

// ════════════════════════════════════════════════════════════════
describe('0373 — ★★★★ ثغرةُ الاشتراك', () => {
  it('★★★★ بوّابةٌ هجينة RESTRICTIVE على الجداول الستّة', () => {
    for (const t of ['permissions_request', 'wellness_entries',
                     'permissions', 'leave_balance']) {
      const re = new RegExp(
        `CREATE POLICY hybrid_gate_${t} ON public\\.${t}[\\s\\S]{0,200}?AS RESTRICTIVE`);
      expect(migBody, `بوّابة ${t} مفقودةٌ أو PERMISSIVE`).toMatch(re);
    }
    // ★ الجدولان الأخيران يُنشآن بحلقةٍ ديناميكية
    expect(migBody).toContain("'hr_approval_requests','hr_approval_steps'");
    expect(migBody).toContain('AS RESTRICTIVE FOR ALL ');
  });

  it('★★★★ وكلُّها على وحدة hr', () => {
    const gates = migBody.match(/hybrid_allows_module\('(\w+)'\)/g) ?? [];
    expect(gates.length).toBeGreaterThanOrEqual(8);
    for (const g of gates) {
      expect(g, `بوّابةٌ على وحدةٍ خاطئة: ${g}`).toContain("'hr'");
    }
  });
});

// ════════════════════════════════════════════════════════════════
describe('0373 — ★★★ حرمانُ anon', () => {
  it('★★★★ الحرمانُ من PUBLIC لا من anon وحده', () => {
    // ★ ACL كان `=X/postgres` أي PUBLIC يملك التنفيذ و`anon` عضوٌ فيه؛
    //   الحرمانُ من anon يُزيل منحاً صريحاً لا يملكه أصلاً.
    expect(migBody).toContain('REVOKE ALL ON FUNCTION %s FROM PUBLIC');
    expect(migBody).toContain('REVOKE ALL ON FUNCTION %s FROM anon');
  });

  it('★★★ وauthenticated يُمنح صراحةً بعد الحرمان', () => {
    expect(migBody).toContain('GRANT EXECUTE ON FUNCTION %s TO authenticated');
  });

  it('★★★ والحلقةُ تغطّي أسرة أسماء الوحدة', () => {
    const body = migBody.slice(migBody.indexOf('DO $revoke$'));
    for (const pat of ["'hr\\_%'", "'leave\\_%'", "'capa\\_%'",
                       "'sop\\_%'", "'wellness\\_%'"]) {
      expect(body, `النمط ${pat} غائب`).toContain(pat);
    }
  });
});

// ════════════════════════════════════════════════════════════════
describe('0373 — ★★★★ دالّةُ التدقيق الدائمة', () => {
  it('★★★★ hr_module_gate_audit موجودةٌ وتفحص أربعة أنواع', () => {
    const body = fnBody('hr_module_gate_audit');
    expect(body).toContain('بلا RLS');
    expect(body).toContain('بلا بوّابة هجينة RESTRICTIVE');
    expect(body).toContain('anon يملك SELECT');
    expect(body).toContain('anon يملك EXECUTE');
  });

  it('★★★ وقائمةُ الجداول مصدرٌ واحدٌ للحقيقة', () => {
    const body = fnBody('hr_module_tables');
    for (const t of ['leaves', 'permissions_request', 'wellness_entries',
                     'hr_approval_requests', 'hr_report_runs']) {
      expect(body, `${t} غائبٌ عن القائمة`).toContain(`'${t}'`);
    }
  });

  it('★★★ والترتيب حتميّ', () => {
    expect(fnBody('hr_module_gate_audit')).toContain('ORDER BY 1, 2, 3');
  });

  it('★★★ وanon محرومٌ من الدالّتين', () => {
    for (const fn of ['hr_module_gate_audit', 'hr_module_tables']) {
      expect(migBody,
        `${fn} بلا REVOKE من anon`,
      ).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\(\\) FROM anon;`));
    }
  });
});

// ════════════════════════════════════════════════════════════════
describe('0373 — ★★★★ الماسحُ الآليّ جزءٌ من العقد', () => {
  it('★★★★ صفرُ صفحةٍ تلمس Supabase مباشرة', () => {
    const s = runScan();
    expect(s.totals.SUPABASE ?? 0,
      'صفحةٌ تلمس Supabase — راجع تقرير الماسح').toBe(0);
  });

  it('★★★★ صفرُ زرٍّ بلا onClick', () => {
    const s = runScan();
    const n = s.totals.BTN ?? 0;
    if (n > 0) {
      const offenders: string[] = [];
      for (const files of Object.values(s.results)) {
        for (const [path, findings] of Object.entries(files)) {
          for (const f of findings) {
            if (f.code === 'BTN') offenders.push(`${path} (${f.hits.length})`);
          }
        }
      }
      expect.fail(`أزرارٌ صامتة:\n  ${offenders.join('\n  ')}`);
    }
    expect(n).toBe(0);
  });

  it('★★★★ صفرُ صفحةٍ تُعامل صفحةً {rows,total} كمصفوفة', () => {
    const s = runScan();
    expect(s.totals.PAGED ?? 0,
      'نمطُ incList.forEach عاد — راجع تقرير الماسح').toBe(0);
  });

  it('★★★ صفرُ confirm/prompt/alert', () => {
    const s = runScan();
    expect(s.totals.DIALOG ?? 0).toBe(0);
  });

  it('★★★ وصفرُ حذفٍ نهائيّ', () => {
    const s = runScan();
    expect(s.totals.HARD_DELETE ?? 0).toBe(0);
  });

  it('★★ والماسحُ يكتشف الخدمات ذوات الصفحات آلياً', () => {
    const s = runScan();
    // ★ لو أُضيفت خدمةٌ جديدةٌ تُعيد صفحةً، يلتقطها الماسحُ تلقائياً
    expect(s.paged_services.length).toBeGreaterThanOrEqual(3);
    for (const fn of ['hrInbox', 'myIncidents', 'myCatalog']) {
      expect(s.paged_services, `${fn} لم يُكتشف`).toContain(fn);
    }
  });

  /**
   * ★★ سقفٌ للديون المعروفة: `any` و`console` و`catch` الصامت.
   *   لا نشترط الصفر اليوم — نمنع **الزيادة**. كلُّ جولةٍ تخفضه.
   */
  it('★★ سقفُ الديون المعروفة لا يرتفع', () => {
    const s = runScan();
    const CAPS: Record<string, number> = {
      ANY: 0,
      CONSOLE: 35,
      SILENT_CATCH: 13,
      EMPTY_FALLBACK: 5,
      NO_LIMIT: 4,
      HARDCODED_DATE: 3,
    };
    const over: string[] = [];
    for (const [code, cap] of Object.entries(CAPS)) {
      const n = s.totals[code] ?? 0;
      if (n > cap) over.push(`${code}: ${n} > ${cap}`);
    }
    expect(over, `ديونٌ ارتفعت:\n  ${over.join('\n  ')}`).toEqual([]);
  });
});

// ════════════════════════════════════════════════════════════════
describe('0373 — إصلاحاتُ الواجهة', () => {
  it('★★★★ زرُّ SOPs الصامت صار رابطاً حقيقياً', () => {
    const code = read('src/pages/employee/SOPsPage.tsx')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    expect(code).toContain('selectedRow.fileUrl');
    expect(code).toContain('href={selectedRow.fileUrl}');
    expect(code).not.toContain('هنا سيتم عرض ملف PDF الفعلي');
  });

  it('★★★ وحالةُ «لا ملفَّ مرفقاً» معروضةٌ صراحةً', () => {
    const code = read('src/pages/employee/SOPsPage.tsx');
    expect(code).toContain('لا ملفَّ مرفقاً بهذا الإجراء');
  });

  it('★★★★ والملفُّ الميّت أُرشف لا حُذف', () => {
    expect(existsSync(resolve(root, 'src/pages/employee/AttendancePage.tsx')))
      .toBe(false);
    expect(existsSync(resolve(root, 'src/pages/employee/_archive/AttendancePage.tsx')))
      .toBe(true);
  });

  it('★★★ وسببُ الأرشفة موثَّق', () => {
    const readme = read('src/pages/employee/_archive/README.md');
    expect(readme).toMatch(/ملفٌّ ميّت/);
    expect(readme).toMatch(/MyAttendancePage/);
  });
});
