/**
 * noSimulationContract.test.ts — حارس دائم ضد البيانات المُختلَقة
 *
 * ═════════════════════════════════════════════════════════════════════════
 * ثلاث محاكاة أُزيلت في جولة 2026-08-05 بعد مسح استقصائي:
 *
 *   ① hr/AnalyticsPage — 40 نقطة عشوائية تُعرض تحتها «معامل بيرسون +0.85»
 *      و«حجم العينة 240 سجل» كأنها نتائج تحليل حقيقي.
 *   ② techportal/AttendanceAnalytics — رسم أسبوعي بـ Math.random()
 *      و«متأخرون» مشتقّون بضرب 0.1 و«غائبون» بـ 0.05.
 *   ③ techportal/SystemHealthPage — latency عشوائي و uptime ثابت (99.9)
 *      كأنها قياسات فعلية.
 *
 * ★ لماذا حارس دائم لا إصلاح فقط؟
 *   المحاكاة تعود بسهولة: مطوّر يريد «شيئاً يظهر في الشاشة» فيكتب
 *   Math.random() مؤقتاً وينساه. والأخطر أن الرقم المُختلَق **يُطمئن**
 *   حين يجب أن يُنذر — مؤشر صحة كاذب أسوأ من غيابه.
 *
 * النطاق: صفحات التحليلات والمؤشرات حيث الرقم يُتخذ به قرار.
 * لا يشمل: توليد المعرّفات وكلمات المرور والرموز (استعمال مشروع).
 * ═════════════════════════════════════════════════════════════════════════
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..', '..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf-8');

/** يجرّد تعليقات JS/TS — ذكر «أزلنا Math.random» ليس استعمالاً */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

/** الصفحات التي يُتخذ برقمها قرار — لا يجوز فيها اختلاق */
const ANALYTICS_PAGES = [
  'src/pages/hr/AnalyticsPage.tsx',
  'src/pages/techportal/pages/AttendanceAnalytics.tsx',
  'src/pages/techportal/pages/SystemHealthPage.tsx',
];

describe('★ حارس المحاكاة — صفحات التحليلات', () => {
  it.each(ANALYTICS_PAGES)('%s بلا Math.random', (page) => {
    const code = stripComments(read(page));
    expect(
      code,
      'رقم عشوائي في صفحة تحليلات = تضليل لمتخذ القرار',
    ).not.toMatch(/Math\.random/);
  });

  it('حارس التجريد: يكشف Math.random حقيقياً خارج التعليقات', () => {
    // يمنع أن يصير التجريد فضفاضاً فيمرّ استعمال فعلي
    const injected = read(ANALYTICS_PAGES[0]) + '\nconst x = Math.random();';
    expect(stripComments(injected)).toMatch(/Math\.random/);
  });
});

describe('① hr/AnalyticsPage — لا أرقام إحصائية مُختلَقة', () => {
  const src = read('src/pages/hr/AnalyticsPage.tsx');

  it('★ لا معامل بيرسون مُختلَق', () => {
    expect(src).not.toContain("'+0.85'");
  });

  it('★ لا حجم عينة وهمي', () => {
    expect(src).not.toContain("'240 سجل'");
  });

  it('يوضّح سبب عدم التوفّر بدل الصمت', () => {
    expect(src).toContain('النتيجة الخاطئة أسوأ من غيابها');
    // بطاقة «مقاييس غير معروضة — ولماذا» تشرح كل ما أُسقط
    expect(src).toContain('مقاييس غير معروضة');
  });

  /**
   * ★★ تحديث 0349 — تصحيح معلن:
   *   كان هذا التأكيد يفحص عبارتَي «إزالة محاكاة» و«تضليل صريح»
   *   وهما تعليقان كُتبا في جولة 2026-08-05 داخل **فرع الارتباط**
   *   من تبويب «التحليل المتقدم». وقد أُزيل ذلك التبويب **بالكامل**
   *   في 0349: لم يعد فيه `setTimeout(2500)` ولا ثوابت «دقة النموذج
   *   91%» و«p-value < 0.05» و«Random Forest».
   *
   *   فالعبارتان اختفتا لأن ما كانتا تصفانه اختفى — وهذا تقوية لا
   *   تراجع. لذلك يُستبدل التأكيد بما هو **أقوى**: منع عودة المحاكاة
   *   نفسها بأي صورة، لا مجرّد وجود تعليق يعتذر عنها.
   */
  it('★★★ تبويب التحليل المُصنَّع لم يعد — لا تأخير ولا ثوابت إحصائية', () => {
    const code = stripComments(src);
    expect(code, 'تأخير مُفتعَل يُوهم بمعالجة').not.toMatch(/setTimeout/);
    expect(code, 'ادّعاء دلالة إحصائية بلا نموذج').not.toMatch(/p-value/);
    expect(code, 'ادّعاء خوارزمية بلا تدريب').not.toMatch(/Random Forest/);
    expect(code, 'ادّعاء دقة نموذج').not.toMatch(/دقة النموذج/);
    expect(code, 'وسم AI على ثوابت مكتوبة').not.toMatch(/AI Powered/);
    expect(code, 'حالة التحليل المُصنَّع').not.toMatch(/advancedResults/);
  });

  it('★★★ لا ثوابت رضا مُختلَقة ولا معادلة مشاعر', () => {
    const code = stripComments(src);
    expect(code, 'معدل الرضا كان ثابتاً عند 85').not.toMatch(/satisfactionRate/);
    expect(code, 'رضا القسم كان ثابتاً عند 85').not.toMatch(/satisfactionScore/);
    expect(code, 'متوسط الحل كان ثابتاً عند 2.4').not.toMatch(/avgResolutionTime/);
    expect(code, 'معادلة مشاعر مُختلَقة').not.toMatch(/40 \+ dept\.employeeCount/);
    expect(code, 'أسماء أشهر مُلصَقة على أقسام').not.toMatch(/monthNames\s*\[/);
  });
});

describe('② AttendanceAnalytics — عدّ حقيقي لا توزيع عشوائي', () => {
  const src = read('src/pages/techportal/pages/AttendanceAnalytics.tsx');

  /**
   * ★ تحديث 0333: كان يفحص `for (const l of logs)` — أي العدّ من
   *   مصفوفة صفوف في المتصفح. تلك المصفوفة جاءت من
   *   `findLogsByEmployee('')` الذي كان **يسقط دائماً** بـ
   *   «invalid input syntax for type uuid» فبقي الرسم أصفاراً.
   *   العدّ انتقل إلى القاعدة عبر `attendance_last_7_days()`.
   *   القاعدة المحروسة لم تتغيّر: عدّ حقيقي لا توزيع عشوائي.
   */
  it('★ يعدّ عدّاً حقيقياً — من القاعدة لا بتوزيع عشوائي', () => {
    expect(src).toContain('const byDay = new Map<string, number>()');
    expect(src).toContain('attendanceService.last7Days()');
    expect(stripComments(src)).not.toMatch(/Math\.random/);
  });

  it('★★ لا يمرّر معرّف موظف فارغ (كان يُسقط الصفحة بـ400)', () => {
    expect(stripComments(src)).not.toMatch(/findLogsByEmployee\(\s*''/);
  });

  it('★ لا يشتقّ المتأخرين والغائبين بنسب مُختلَقة', () => {
    const code = stripComments(src);
    expect(code).not.toMatch(/d\.present \* 0\.1/);
    expect(code).not.toMatch(/d\.present \* 0\.05/);
  });

  it('يوثّق سبب ترك late/absent أصفاراً', () => {
    expect(src).toContain('يحتاجان');
    expect(src).toContain('جدول الورديات');
  });
});

describe('③ SystemHealthPage — لا مؤشرات صحة كاذبة', () => {
  const src = read('src/pages/techportal/pages/SystemHealthPage.tsx');
  const types = read('src/pages/techportal/types.ts');

  it('★ لا uptime ثابت مُختلَق', () => {
    const code = stripComments(src);
    expect(code).not.toContain('99.9');
    expect(code).not.toContain('97.5');
  });

  it('النوع يسمح بـ null صراحةً', () => {
    expect(types).toContain('latency: number | null');
    expect(types).toContain('uptime: number | null');
  });

  it('★ العرض يُظهر «—» لا صفراً مضلِّلاً', () => {
    expect(src).toContain('svc.latency === null ? "—"');
    expect(src).toContain('svc.uptime === null ? "—"');
  });

  it('يوثّق أن المؤشر الكاذب أخطر من غيابه', () => {
    expect(src).toContain('يُطمئن حين يجب أن يُنذر');
  });
});

// ═══════════════════════════════════════════════════════════════════════
describe('★ مسح شامل: لا محاكاة جديدة في بوابات لم تُدقَّق بعد', () => {
  /**
   * لا نفرض على كل الصفحات (بعضها يستعمل random لتوليد معرّفات مشروعة)،
   * لكن نُثبّت خطاً أحمر: أي ملف اسمه Analytics أو Dashboard أو Report
   * لا يجوز فيه Math.random خارج التعليقات.
   */
  const RISKY = [
    'src/pages/hr/AnalyticsPage.tsx',
    'src/pages/techportal/pages/AttendanceAnalytics.tsx',
    'src/pages/techportal/pages/SystemHealthPage.tsx',
    'src/pages/manager/ManagerTeamPerformancePage.tsx',
    'src/pages/manager/ManagerWorkloadPage.tsx',
  ].filter((p) => existsSync(resolve(root, p)));

  it('استُخرجت صفحات كافية للفحص', () => {
    expect(RISKY.length).toBeGreaterThanOrEqual(3);
  });

  it.each(RISKY)('%s — لا رقم عشوائي', (page) => {
    expect(stripComments(read(page))).not.toMatch(/Math\.random/);
  });
});
