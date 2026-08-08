/**
 * ════════════════════════════════════════════════════════════════
 *  portalHygieneContract.test.ts
 *
 *  حارس النظافة التقنية — بوابتا الموظف والموارد البشرية.
 *  (المرحلة 1 من خطة البوابتين)
 *
 *  ═══ ما يحرسه ═══════════════════════════════════════════════════
 *
 *  القياس قبل المرحلة 1:
 *      as any               57 موضعاً في 20 ملفاً
 *      لمس Supabase مباشر   5 ملفات
 *      Math.random          موضعان (أحدهما ثغرة أمنية)
 *      ملف ميت              MovementAnalysisPage.tsx
 *
 *  بعدها:
 *      as any               0
 *      Math.random          0
 *      الملف الميت          مؤرشف
 *      لمس مباشر            4 ملفات (موروثة — خطّ أساس لا يزيد)
 *
 *  ★ هذا الحارس **ذاتي الصيانة** في بند واحد فقط: خطّ أساس اللمس
 *    المباشر. البنود الأخرى مطلقة — صفر يعني صفر.
 * ════════════════════════════════════════════════════════════════
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, basename } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

/** يزيل التعليقات — نحرس الكود لا الشرح */
function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

function pagesOf(dir: string): string[] {
  const full = resolve(root, dir);
  if (!existsSync(full)) return [];
  return readdirSync(full)
    .filter((f) => f.endsWith('.tsx'))
    .map((f) => `${dir}/${f}`);
}

const EMPLOYEE_PAGES = pagesOf('src/pages/employee');
const HR_PAGES = pagesOf('src/pages/hr');
const ALL_PAGES = [...EMPLOYEE_PAGES, ...HR_PAGES];

describe('نظافة البوابتين — الاستخراج نفسه يعمل', () => {
  it('★ الصفحات موجودة (وإلا مرّ الحارس فارغاً)', () => {
    expect(EMPLOYEE_PAGES.length).toBeGreaterThanOrEqual(19);
    expect(HR_PAGES.length).toBeGreaterThanOrEqual(24);
  });

  it('★ codeOnly يُزيل التعليقات فعلاً', () => {
    expect(codeOnly('/* as any */ const x = 1;')).not.toMatch(/as any/);
    expect(codeOnly('// as any\nconst y = 2;')).not.toMatch(/as any/);
    // ولا يُزيل الكود الحقيقي
    expect(codeOnly('const z = a as any;')).toMatch(/as any/);
  });
});

describe('★★ صفر as any — كانت 57', () => {
  it.each(ALL_PAGES)('%s', (page) => {
    const code = codeOnly(read(page));
    const hits = [...code.matchAll(/\bas any\b/g)].map((m) => {
      const line = code.slice(0, m.index).split('\n').length;
      return `سطر ${line}: ${code.split('\n')[line - 1].trim().slice(0, 80)}`;
    });
    expect(hits, `${basename(page)}:\n  ${hits.join('\n  ')}`).toEqual([]);
  });
});

describe('★★ صفر Math.random — كان موضعين', () => {
  /**
   * ★ الأخطر كان في HRMovementAnalyticsPage:
   *     Math.floor(100 + Math.random() * 900)
   *   رمز تسليم مناوبة من ثلاث خانات (900 احتمال) بمولّد غير تشفيري.
   *   الرمز يفتح بوابة الشركة لحارس بديل.
   */
  it.each(ALL_PAGES)('%s', (page) => {
    expect(codeOnly(read(page))).not.toMatch(/Math\.random/);
  });

  it('★★ مولّد الرمز تشفيري وستّ خانات', () => {
    const src = read('src/pages/hr/HRMovementAnalyticsPage.tsx');
    expect(src).toMatch(/crypto\.getRandomValues/);
    expect(src).toMatch(/const MIN = 100000/);
    expect(src).toMatch(/const RANGE = 900000/);
    // الطرح المعياري يمنع انحياز %
    expect(src).toMatch(/while \(v >= LIMIT\)/);
  });
});

describe('★ صفر confirm/alert/prompt', () => {
  it.each(ALL_PAGES)('%s', (page) => {
    expect(codeOnly(read(page))).not.toMatch(/(?<![.\w])(confirm|alert|prompt)\s*\(/);
  });
});

describe('لمس Supabase المباشر — خطّ أساس لا يزيد', () => {
  /**
   * ★★★★ **الخطُّ بلغ صفراً في 0373.**
   *
   *   الرحلة: أربعةُ ملفاتٍ موروثة ⇒ ثلاثة (0338: ProblemsList) ⇒
   *   **صفر** (0373). الحارسُ لم يعد يمنع الزيادة فحسب — يشترط الصفر.
   *
   *   ما خرج في 0373:
   *     · `employee/AttendancePage` — **ملفٌّ ميّت**: غيرُ مُوجَّهٍ في
   *       AppRouter (المسار يشير إلى `MyAttendancePage`) ولا يستورده
   *       أحد، ومع ذلك يلمس Supabase في خمسة مواضع فيُبقي الخطّ
   *       مرتفعاً. أُرشف إلى `_archive/` بتعليل.
   *     · `NewProblemPage` و`SOPsPage` كانتا قد نُظِّفتا في جولاتٍ
   *       سابقةٍ دون تحديث هذه القائمة — كشفه ماسحُ 0373.
   */
  const BASELINE = new Set<string>([]);

  it('★★ لا ملف جديد يلمس Supabase مباشرة', () => {
    const offenders = ALL_PAGES.filter((p) =>
      /\.from\('[a-z0-9_]+'\)/.test(codeOnly(read(p))),
    );
    const added = offenders.filter((p) => !BASELINE.has(p));
    expect(
      added,
      `ملفات جديدة تلمس Supabase مباشرة:\n  ${added.join('\n  ')}`,
    ).toEqual([]);
  });

  it('★★★★ وخطّ الأساس صفرٌ الآن — لا رجوع', () => {
    const offenders = ALL_PAGES.filter((p) =>
      /\.from\('[a-z0-9_]+'\)/.test(codeOnly(read(p))),
    );
    expect(
      offenders,
      `صفحاتٌ تلمس Supabase مباشرة:\n  ${offenders.join('\n  ')}`,
    ).toEqual([]);
    expect(offenders.length).toBeLessThanOrEqual(BASELINE.size);
  });

  it('★★★ والملفُّ الميّت أُرشف لا حُذف', () => {
    expect(existsSync(resolve(root, 'src/pages/employee/AttendancePage.tsx')))
      .toBe(false);
    expect(existsSync(resolve(root, 'src/pages/employee/_archive/AttendancePage.tsx')))
      .toBe(true);
    const readme = read('src/pages/employee/_archive/README.md');
    expect(readme).toMatch(/ملفٌّ ميّت/);
  });

  it('★★ TrainingManagementPage خرجت فعلاً (لا تستورد supabase)', () => {
    const code = codeOnly(read('src/pages/hr/TrainingManagementPage.tsx'));
    expect(code).not.toMatch(/from\('quizzes'\)/);
    expect(code).not.toMatch(/import\(['"].*services\/supabase/);
  });

  it('★★★ شاشتا البلاغات (0338 · مقسومة في 0341) — لا لمس مباشر', () => {
    for (const f of ['src/pages/employee/MyProblemsPage.tsx',
                     'src/pages/hr/HrProblemsInboxPage.tsx']) {
      const code = codeOnly(read(f));
      expect(code, `${f}: يستعلم عن incidents مباشرةً`)
        .not.toMatch(/\.from\('incidents'\)/);
      expect(code, `${f}: يستورد supabase`)
        .not.toMatch(/services\/supabase\/supabase/);
    }
  });

  /**
   * ★ 0341: الملف القديم انتقل إلى `_archived` ولم يُحذف (القاعدة
   *   الذهبية: لا حذف نهائي). نتحقّق أنه لم يعد مُسجَّلاً في المُوجّه —
   *   ملف مؤرشف يبقى للمراجعة لكنه لا يُخدَم لأحد.
   */
  it('★★ ProblemsList القديمة أُرشفت وخرجت من المُوجّه', () => {
    const router = read('src/router/AppRouter.tsx');
    expect(router).not.toMatch(/import\('\.\.\/pages\/employee\/ProblemsList'\)/);
    expect(router).not.toMatch(/<ProblemsList\s/);
    expect(existsSync(resolve(root, 'src/pages/employee/ProblemsList.tsx'))).toBe(false);
  });
});

describe('★ QuizService — البديل الذي أخرج TrainingManagement', () => {
  const SVC = read('src/services/sdk/QuizService.ts');

  it('موجودة ومُصدَّرة من الفهرس', () => {
    expect(existsSync(resolve(root, 'src/services/sdk/QuizService.ts'))).toBe(true);
    expect(read('src/services/sdk/index.ts')).toMatch(/export \{ quizService \}/);
  });

  it('★★ لا تُرسل tenant_id من العميل', () => {
    // كان: localStorage.getItem('tenant_id') ثم إرساله في الحمولة
    expect(codeOnly(SVC)).not.toMatch(/localStorage/);
    // ★ تصحيح ذاتي: `not.toMatch(/tenant_id:/)` كان فضفاضاً — يطابق
    //   تعريف الحقل في الواجهة (`tenant_id: string`) وهو مشروع.
    //   المقصود: ألّا يُبنى في **حمولة** الكتابة.
    const payload = SVC.slice(
      SVC.indexOf('const payload: Partial<QuizRecord>'),
      SVC.indexOf('if (input.id)'),
    );
    expect(payload.length).toBeGreaterThan(50);
    expect(payload).not.toMatch(/tenant_id/);
  });

  it('★ تقصّ passing_score إلى 0–100 (قيد CHECK في 0143)', () => {
    expect(SVC).toMatch(/Math\.min\(100, Math\.max\(0,/);
  });

  it('★ تعطيل لا حذف', () => {
    expect(SVC).toMatch(/async deactivate/);
    expect(codeOnly(SVC)).not.toMatch(/\.delete\(/);
  });

  it('★ بلا as any', () => {
    expect(codeOnly(SVC)).not.toMatch(/\bas any\b/);
  });

  it('★★ الصفحة لا تبتلع خطأ الحفظ برسالة نجاح كاذبة', () => {
    const page = read('src/pages/hr/TrainingManagementPage.tsx');
    // كان: catch { addToast('تم حفظ الاختبار محلياً', 'info'); }
    expect(page).not.toMatch(/تم حفظ الاختبار محلياً/);
    expect(page).toMatch(/تعذّر حفظ الاختبار/);
  });
});

describe('★ أنواع الإثراء المشتركة', () => {
  const SDK = read('src/shared/types/sdk.ts');

  it('WithEmployee وأخواتها مُعرَّفة', () => {
    expect(SDK).toMatch(/export interface EmployeeSummary/);
    expect(SDK).toMatch(/export type WithEmployee<T>/);
    expect(SDK).toMatch(/export type WithEmployeeAndCycle<T>/);
  });

  /**
   * ★★★ **صفر صفحة** بقيت على `WithEmployee` بعد 0365.
   *
   *   كانت ستّ صفحاتٍ تُثري سجلاتها بحقل `employees` يدوياً ثم
   *   تقرؤه بـ`(x as any).employees` — 13 موضعاً من أصل 57.
   *   آخرها `DisciplinaryPage` انتقلت في 0365 إلى `disciplinarySdk.board(`.
   *
   *   ★ النوع نفسه يبقى مُصدَّراً (يحرسه الاختبار أعلاه) لأن صفحاتٍ
   *     خارج بوابة الموارد البشرية قد تحتاجه لاحقاً — لكن **لا صفحة
   *     في `src/pages/hr` تستعمله**، وهذا ما يحرسه هذا التأكيد.
   */
  it('★ صفر صفحة في بوابة الموارد البشرية تستعمل WithEmployee', () => {
    const dir = resolve(root, 'src/pages/hr');
    const offenders = readdirSync(dir)
      .filter((f) => f.endsWith('.tsx'))
      .filter((f) => {
        const code = readFileSync(resolve(dir, f), 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/^\s*\/\/.*$/gm, '');
        return /WithEmployee/.test(code);
      });
    expect(offenders, 'صفحاتٌ ما زالت على الإثراء اليدويّ').toEqual([]);
  });

  /**
   * ★★★ الصفحات التي **استغنت** عن الإثراء اليدويّ أصلاً.
   *
   *   `WithEmployee<T>` كان **علاجاً** لا حلاًّ: الصفحة تجلب سجلاتها
   *   **وكل الموظفين** وتربطهما بـ`Map` في المتصفّح، فاحتاجت نوعاً
   *   يصف السجلّ المُثرى يدوياً بدل `as any`.
   *
   *   أزالت الجولات 0355–0364 الربط نفسه: دوال القاعدة تُعيد الاسم
   *   والرمز والقسم في استعلام واحد بحدّ أعلى. فلم يبقَ إثراءٌ يدويّ
   *   يحتاج وصفاً — والغاية الأصلية (لا `as any` ولا حقل غير موصوف)
   *   محروسة هنا مباشرةً.
   *
   *   ★ الحارس يمسح كل صفحة بأدلّتها الخاصة، فلا يُقبل أن تستغني
   *     صفحةٌ عن `WithEmployee` دون أن تستعمل دالة القاعدة فعلاً.
   */
  it.each([
    ['src/pages/hr/LoansPage.tsx',       'loanService.board(',            'employeeName'],
    ['src/pages/hr/PerformancePage.tsx', 'performanceReviewSdk.reviews(', 'reviewerName'],
    ['src/pages/hr/BonusesPage.tsx',     'bonusSdk.board(',               'approverName'],
    ['src/pages/hr/DocumentsPage.tsx',   'employeeDocumentsSdk.board(',   'uploaderName'],
    ['src/pages/hr/SuccessionPlanningPage.tsx',
                                         'successionPlanningSdk.board(',  'incumbentName'],
    ['src/pages/hr/RecruitmentPage.tsx',  'recruitmentSdk.board(',        'appsTotal'],
    ['src/pages/hr/ExpensesPage.tsx',     'expenseSdk.board(',            'isStalled'],
    ['src/pages/hr/EmployeeContractsPage.tsx',
                                          'contractSdk.board(',           'renewalCount'],
    ['src/pages/hr/DisciplinaryPage.tsx', 'disciplinarySdk.board(',       'canAppeal'],
    ['src/pages/hr/HRServiceCenterPage.tsx',
                                          'serviceCenterSdk.cases(',      'isOverdue'],
    ['src/pages/hr/ShiftSchedulingPage.tsx',
                                          'shiftScheduleSdk.board(',      'shiftNameAr'],
    ['src/pages/hr/HealthSafetyPage.tsx',
                                          'occupationalSafetySdk.incidents(', 'needsCapa'],
    ['src/pages/hr/ReportsPage.tsx',      'hrReportSdk.catalog(',         'wasTruncated'],
    ['src/pages/hr/HRCommunicationPage.tsx',
                                          'hrInboxSdk.board(',            'senderName'],
  ])('★ %s استغنت عن الإثراء اليدويّ', (page, dbCall, dbField) => {
    const code = read(page).replace(/\/\*[\s\S]*?\*\//g, '')
                           .replace(/^\s*\/\/.*$/gm, '');
    expect(code, 'as any عاد').not.toMatch(/\bas any\b/);
    expect(code, ': any عاد').not.toMatch(/:\s*any\b/);
    expect(code, 'إثراء يدويّ بحقل employees').not.toMatch(/employees:\s*empMap/);
    expect(code, 'ربط في المتصفّح')
      .not.toMatch(/new Map<string,\s*(EmployeeSummary|PerformanceCycleSummary)>/);
    expect(code, 'نوع الإثراء لم يعد لازماً').not.toMatch(/WithEmployee/);
    expect(code, dbCall + ' لم تُستعمل').toContain(dbCall);
    expect(code, dbField + ' غائب').toContain(dbField);
  });
});

describe('★ الملف الميت مؤرشف', () => {
  it('MovementAnalysisPage خرج من مجلد الصفحات', () => {
    expect(existsSync(resolve(root, 'src/pages/hr/MovementAnalysisPage.tsx'))).toBe(false);
  });

  it('★ وأُرشف مع تعليل لا حُذف', () => {
    expect(existsSync(resolve(root, 'src/pages/hr/_archive/MovementAnalysisPage.tsx'))).toBe(true);
    const readme = read('src/pages/hr/_archive/README.md');
    expect(readme).toMatch(/Placeholder/);
    expect(readme).toMatch(/غير مربوط بأي مسار/);
  });

  it('★★ ولا مرجع له في الكود', () => {
    const refs = ALL_PAGES
      .concat(['src/router/AppRouter.tsx'])
      .filter((p) => /MovementAnalysisPage/.test(read(p)));
    expect(refs).toEqual([]);
  });
});

describe('★ HRDashboard — أكبر تجمّع كان', () => {
  const src = read('src/pages/hr/HRDashboard.tsx');

  /** ثمانية `[] as any[]` استُبدلت بأنواع مُستخرَجة من الكود الباني */
  it.each([
    'MonthlyTrendPoint', 'CategorySlice', 'SeveritySlice',
    'DepartmentStat', 'WellnessPoint', 'RecentIncident', 'RecentReview',
  ])('النوع %s مُعرَّف', (t) => {
    expect(src).toMatch(new RegExp(`interface ${t}`));
  });

  it('★ لا مصفوفة معلَنة any', () => {
    expect(codeOnly(src)).not.toMatch(/\[\] as any\[\]/);
  });
});
