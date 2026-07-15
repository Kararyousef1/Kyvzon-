/**
 * ═════════════════════════════════════════════════════════════════════════
 *  no-legacy-view.test.ts — يمنع regressions
 *
 *  الهدف: ضمان أن لا كود جديد يستخدم useLegacyView / setActiveView / activeView
 *  بعد إكمال الهجرة الكاملة لـ react-router-dom.
 *
 *  إن فشل هذا الاختبار → مطور جديد أعاد استخدام النمط القديم.
 *  الحل: استخدم useNavigate() و useLocation() مباشرة.
 * ═════════════════════════════════════════════════════════════════════════
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC_ROOT = path.resolve(__dirname, '../..');

function walkTsFiles(dir: string): string[] {
  const out: string[] = [];
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop()!;
    if (!fs.existsSync(cur)) continue;
    for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
      const p = path.join(cur, entry.name);
      if (entry.isDirectory()) {
        // نتخطى مجلد الاختبارات نفسه (اختبارات قد تحوي هذه الأنماط لأغراض التحقق)
        if (entry.name === 'test' || entry.name === '__tests__') continue;
        stack.push(p);
      } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\./.test(entry.name)) {
        out.push(p);
      }
    }
  }
  return out;
}

describe('Router migration completeness', () => {
  const files = walkTsFiles(SRC_ROOT);

  it('لا يوجد ملف يستورد useLegacyView (تم حذف الـ shim)', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      if (/from\s+['"][^'"]*useLegacyView['"]/.test(content) || /import\s+.*useLegacyView/.test(content)) {
        offenders.push(path.relative(SRC_ROOT, file));
      }
    }
    expect(offenders, `يجب ألا يستورد أحد useLegacyView: ${offenders.join(', ')}`).toEqual([]);
  });

  it('لا يوجد كود يستدعي setActiveView() (استُبدل بـ useNavigate)', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      // نبحث فقط عن استدعاء حقيقي setActiveView(  (ليس في التعليقات)
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        // تخطي التعليقات
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;
        // نمط استدعاء حقيقي
        if (/\bsetActiveView\s*\(/.test(line)) {
          offenders.push(`${path.relative(SRC_ROOT, file)}:${i + 1}`);
        }
      }
    }
    expect(offenders, `setActiveView() ما زال مستخدماً: ${offenders.join(', ')}`).toEqual([]);
  });

  it('UIStore لم يعد يحوي activeView', () => {
    const uiStorePath = path.join(SRC_ROOT, 'core/stores/index.ts');
    if (!fs.existsSync(uiStorePath)) return; // تخطي إذا لم يوجد
    const content = fs.readFileSync(uiStorePath, 'utf8');
    // يجب ألا يحوي إعلان activeView في state أو interface
    expect(content).not.toMatch(/^\s*activeView:\s*string;?\s*$/m);
    expect(content).not.toMatch(/^\s*setActiveView:\s*\(/m);
  });
});
