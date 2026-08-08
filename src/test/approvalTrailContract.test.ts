/**
 * approvalTrailContract.test.ts — عقد 0316 ومكوّن مسار الاعتماد
 *
 * ═════════════════════════════════════════════════════════════════════════
 * الثغرة المُثبَتة تشغيلياً (2026-08-05):
 *
 *   approval_steps_for() من 0309 كانت SECURITY DEFINER بحارس المستأجر
 *   وحده. مسبار بموظف عادي على طلب ليس له:
 *       يقرأ 1 خطوة ⇒ «المدير المالي» | «راتب المدير مرتفع — وافقت مؤقتاً»
 *
 *   لم تُستدعَ من الواجهة قط فبقيت كامنة؛ ولو بُنيت الشاشة عليها كما هي
 *   لصارت مكشوفة لكل مستخدم.
 * ═════════════════════════════════════════════════════════════════════════
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..', '..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf-8');

const MIG = read('supabase/migrations/0316_approval_trail_visibility.sql');
const M0309 = read('supabase/migrations/0309_multilevel_approval_engine.sql');
const VERIFY = read('tools/dev/verify-approval-trail-0316.sql');
const SVC = read('src/services/sdk/UnifiedApprovalService.ts');
const CMP = read('src/shared/components/approvals/ApprovalTrail.tsx');
const UNIT_PAGE = read('src/pages/manager/units/UnitApprovalsPage.tsx');
const MGR_PAGE = read('src/pages/manager/ManagerApprovalsPage.tsx');

function stripSqlComments(sql: string): string {
  return sql
    .split('\n')
    .map((l) => {
      const i = l.indexOf('--');
      return i === -1 ? l : l.slice(0, i);
    })
    .join('\n');
}

function fnScope(sql: string, name: string): string {
  const start = sql.indexOf(`FUNCTION public.${name}`);
  if (start === -1) throw new Error(`${name} غير موجودة`);
  const c = sql.indexOf(`COMMENT ON FUNCTION public.${name}`, start);
  return sql.slice(start, c === -1 ? sql.length : c);
}

const CODE = stripSqlComments(MIG);

// ═══════════════════════════════════════════════════════════════════════
describe('0316 — حارس الرؤية', () => {
  const scope = fnScope(CODE, 'can_view_approval_trail');

  it('الدالة معرَّفة ومُسقَطة صراحةً', () => {
    expect(CODE).toContain('DROP FUNCTION IF EXISTS public.can_view_approval_trail(TEXT, UUID)');
  });

  it('★ حارس المستأجر يسبق كل فرع امتياز', () => {
    // تصحيح: النسخة الأولى طابقت سلسلة تحوي تعليق '④' — وهو مُجرَّد
    // من scope فصار الفهرس -1. نقيس البنية لا التنسيق:
    // أول ذكر لفلترة المستأجر يجب أن يسبق فرع أدوار المنصة.
    const tenantCheck = scope.indexOf('tenant_id     = v_tenant');
    const platformBranch = scope.indexOf(
      "current_user_role() IN ('admin', 'developer', 'it_admin')",
    );
    expect(tenantCheck, 'فلترة المستأجر غائبة').toBeGreaterThan(-1);
    expect(platformBranch, 'فرع أدوار المنصة غائب').toBeGreaterThan(-1);
    expect(
      tenantCheck,
      'فرع المنصة يسبق حارس المستأجر ⇒ admin يرى طلباً خارج شركته',
    ).toBeLessThan(platformBranch);
  });

  it('★ يوجد فرع RETURN FALSE عند غياب الطلب من المستأجر', () => {
    // بدونه تعيد الدالة TRUE عن طلب لا وجود له في شركة المستخدم
    const before = scope.slice(
      0,
      scope.indexOf("current_user_role() IN ('admin', 'developer', 'it_admin')"),
    );
    expect(before).toContain('NOT EXISTS');
    expect(before).toContain('RETURN FALSE;');
  });

  it('يغطي المسارات الأربعة المشروعة', () => {
    expect(scope).toContain('s.approver_id = v_me OR s.decided_by = v_me'); // معتمِد
    expect(scope).toContain('a.requester_id  = v_me');                       // مُقدّم
    expect(scope).toContain("public.has_portal_unit('manager', v_unit)");     // مدير وحدة
    expect(scope).toContain("'admin', 'developer', 'it_admin'");              // منصة
  });

  it('★ مدير الوحدة يُطابَق بالوحدة المعنية لا بأي وحدة', () => {
    expect(scope).toContain('SELECT a.unit_key INTO v_unit');
    expect(scope).toContain("has_portal_unit('manager', v_unit)");
    // منح الوصول لأي مدير بلا مطابقة = ثغرة
    expect(scope).not.toMatch(/has_portal_unit\('manager',\s*'[a-z_]+'\)/);
  });

  it('NULL آمن — يعيد FALSE', () => {
    expect(scope).toContain('p_source_id IS NULL');
  });

  it('SECURITY DEFINER مع search_path مثبّت', () => {
    expect(scope).toContain('SECURITY DEFINER');
    expect(scope).toContain('SET search_path = public');
  });
});

describe('0316 — approval_steps_for المحروسة', () => {
  const scope = fnScope(CODE, 'approval_steps_for');

  it('تُسقَط صراحةً — نوع الإرجاع تغيّر بعمودين', () => {
    expect(CODE).toContain('DROP FUNCTION IF EXISTS public.approval_steps_for(TEXT, UUID)');
  });

  it('★ الحارس داخل الاستعلام — صفر صفوف لا خطأ', () => {
    expect(scope).toContain('AND ctx.allowed');
    expect(scope).toContain('public.can_view_approval_trail(p_source_module, p_source_id)');
  });

  it('تفلتر بالمستأجر', () => {
    expect(scope).toContain('s.tenant_id     = ctx.tenant');
  });

  it('★ تحجب نصّ التعليق لا الخطوة نفسها', () => {
    // CASE على s.comments لا WHERE يستبعد الصف
    expect(scope).toMatch(/CASE[\s\S]*?ELSE NULL\s*\n\s*END,/);
    expect(scope).not.toMatch(/WHERE[\s\S]*s\.comments IS NOT NULL/);
  });

  it('التعليق يُكشف لأربع فئات فقط', () => {
    expect(scope).toContain('ctx.is_platform OR mgr.is_unit_mgr');
    expect(scope).toContain('s.approver_id = ctx.me OR s.decided_by = ctx.me');
    expect(scope).toContain('a.requester_id = ctx.me');
  });

  it('out_is_current = أول خطوة معلّقة', () => {
    expect(scope).toContain("MIN(s.step_order)");
    expect(scope).toContain("s.status = 'pending'");
    expect(scope).toContain('(s.step_order = cur.step_order)');
  });

  it('out_is_mine يقارن بالمستخدم الحالي', () => {
    expect(scope).toContain('(s.approver_id = ctx.me)');
  });

  it('مرتّبة بترتيب الخطوة', () => {
    expect(scope).toContain('ORDER BY s.step_order');
  });

  it('anon محروم من الدالتين', () => {
    for (const fn of ['approval_steps_for', 'can_view_approval_trail']) {
      expect(CODE, fn).toContain(`REVOKE ALL ON FUNCTION public.${fn}(TEXT, UUID) FROM anon`);
    }
  });
});

describe('0309 — أُصلح ليبقى آمناً للتكرار', () => {
  it('★ يُسقط approval_steps_for صراحةً قبل إعادة إنشائها', () => {
    // بدونه: إعادة تشغيل 0309 بعد 0316 تفشل بـ
    // ERROR: cannot change return type of existing function
    expect(M0309).toContain('DROP FUNCTION IF EXISTS public.approval_steps_for(TEXT, UUID)');
  });

  it('يوثّق سبب الإسقاط', () => {
    expect(M0309).toContain('cannot change return type');
    expect(M0309).toContain('اكتُشف بتشغيل 0309 بعد 0316');
  });
});

describe('0316 — حرّاس المايجريشن', () => {
  it('لا حِمل زائد', () => {
    expect(CODE).toMatch(/ASSERT v_cnt = 1, format\('0316 failed: %s overloads/);
  });

  it('يختبر الثغرة سلوكياً بموظف فضولي', () => {
    expect(CODE).toContain('0316 failed: leaked');
    expect(CODE).toContain('outsider granted trail access');
  });

  it('يتحقق أن المعتمِد يرى تعليق نفسه', () => {
    expect(CODE).toContain('approver cannot read own comment');
  });

  it('ينظّف مسبار الحارس', () => {
    expect(CODE).toContain('DELETE FROM public.unified_approval_steps WHERE source_id = v_src');
  });
});

describe('0316 — الاختبار السلوكي', () => {
  it('يغطي إغلاق التسريب', () => {
    expect(VERIFY).toContain('الثغرة قبل 0316');
  });

  it('يغطي حجب التعليق مع إبقاء الخطوة', () => {
    expect(VERIFY).toContain('تعليق المعتمِد الأول مكشوف للثاني');
    expect(VERIFY).toContain('حجب التعليق أخفى الخطوة كلها');
  });

  it('★ يغطي مدير وحدة أخرى', () => {
    expect(VERIFY).toContain('مدير وحدة hr يرى مسار طلب مالي');
  });

  it('★ يغطي عزل المستأجر حتى لأدوار المنصة', () => {
    expect(VERIFY).toContain('مستخدم مستأجر آخر (admin) يرى المسار');
  });

  it('يغطي out_is_mine و out_is_current', () => {
    expect(VERIFY).toContain('out_is_mine لا يُعلّم خطوة المعتمِد');
    expect(VERIFY).toContain('out_is_current يُشير لخطوة مُنجَزة');
  });

  it('يوثّق التصحيح التشخيصي (الجدول المصدر الخاطئ)', () => {
    expect(VERIFY).toContain('تصحيح تشخيصي');
    expect(VERIFY).toContain('financial_approval_requests');
  });
});

// ═══════════════════════════════════════════════════════════════════════
describe('UnifiedApprovalService — الحقول الجديدة', () => {
  it('ApprovalStep يحمل isMine و isCurrent', () => {
    expect(SVC).toContain('isMine: boolean');
    expect(SVC).toContain('isCurrent: boolean');
  });

  it('التحويل يقرأ الأعمدة الجديدة', () => {
    expect(SVC).toContain('isMine: r.out_is_mine === true');
    expect(SVC).toContain('isCurrent: r.out_is_current === true');
  });

  it('يوثّق أن comments=null قد يعني الحجب لا الغياب', () => {
    expect(SVC).toContain('محجوباً');
  });
});

describe('ApprovalTrail — المكوّن', () => {
  it('★ لا يلمس Supabase مباشرة', () => {
    expect(CMP).not.toContain('supabase.rpc(');
    expect(CMP).not.toContain('supabase.from(');
    expect(CMP).toContain('unifiedApprovalService.findSteps');
  });

  it('★ تحميل كسول — لا طلب قبل الفتح', () => {
    expect(CMP).toContain('if (open && !loaded && !loading) void load()');
    expect(CMP).toContain('defaultOpen = false');
  });

  it('يُبرز خطوة المستخدم والخطوة النشطة', () => {
    expect(CMP).toContain('s.isCurrent');
    expect(CMP).toContain('s.isMine');
    expect(CMP).toContain('أنت');
    expect(CMP).toContain('الآن');
  });

  it('★ يُظهر «تعليق محجوب» بدل الصمت المضلِّل', () => {
    expect(CMP).toContain('تعليق المعتمِد غير متاح لك');
    expect(CMP).toMatch(/!s\.comments && s\.status !== 'pending'/);
  });

  it('يشرح الحالة الفارغة بدل تركها بيضاء', () => {
    expect(CMP).toContain('لا مسار متعدد المستويات لهذا الطلب');
    expect(CMP).toContain('قواعد الاعتماد');
  });

  it('يعالج الخطأ ويعرضه', () => {
    expect(CMP).toContain('getErrorMessage');
    expect(CMP).toContain('setError');
  });

  it('يترجم أدوار السلسلة للعربية', () => {
    expect(CMP).toContain('direct_manager');
    expect(CMP).toContain('المدير المباشر');
  });

  it('لا confirm() ولا as any', () => {
    const code = CMP.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/(?<![\w.])confirm\s*\(/);
    expect(code).not.toMatch(/\bas any\b/);
  });
});

describe('التركيب في الصفحات', () => {
  it('UnitApprovalsPage تعرض المسار', () => {
    expect(UNIT_PAGE).toContain('ApprovalTrail');
    expect(UNIT_PAGE).toContain('sourceModule={it.sourceModule}');
  });

  it('ManagerApprovalsPage تعرض المسار', () => {
    expect(MGR_PAGE).toContain('ApprovalTrail');
  });

  it('★ يظهر فقط عند تعدّد المستويات — لا ضجيج لطلب بمستوى واحد', () => {
    for (const [name, page] of [['unit', UNIT_PAGE], ['manager', MGR_PAGE]] as const) {
      expect(page, name).toMatch(/\{it\.totalSteps > 1 && \(\s*\n\s*<ApprovalTrail/);
    }
  });
});
