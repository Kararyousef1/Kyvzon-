/**
 * mrpPlantScopeContract.test.ts — عقد 0315 ونطاق المصنع في الواجهة
 *
 * ═════════════════════════════════════════════════════════════════════════
 * العطل الذي يعالجه 0315 (مُثبَت تشغيلياً على Postgres محلي):
 *
 *   can_manage_mrp_roles() تمنح الامتياز لحامل وحدة 'mrp' ولو كان
 *   profiles.role = 'employee'. لكن RLS على manufacturing_plants (0218)
 *   تشترط الدور ∈ (manufacturing, manager, admin, developer, it_admin).
 *
 *   النتيجة: الشاشة تُفتح وقائمة المصانع فارغة بلا تفسير — أسوأ من
 *   المنع الصريح. مصدران للحقيقة لا يعرف أحدهما الآخر، وهو نفس المرض
 *   المعالَج منذ 0302.
 * ═════════════════════════════════════════════════════════════════════════
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..', '..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf-8');

const MIG = read('supabase/migrations/0315_mrp_plant_scope_for_roles.sql');
const VERIFY = read('tools/dev/verify-mrp-plant-scope-0315.sql');
const SVC = read('src/services/sdk/MrpRoleService.ts');
const PAGE = read('src/pages/admin/MrpRolesAdminPage.tsx');

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
describe('0315 — دالة المصانع', () => {
  const scope = fnScope(CODE, 'mrp_plants_for_role_scope');

  it('معرَّفة ومُسقَطة صراحةً قبل الإنشاء', () => {
    expect(CODE).toContain('DROP FUNCTION IF EXISTS public.mrp_plants_for_role_scope()');
    expect(CODE).toContain('CREATE FUNCTION public.mrp_plants_for_role_scope()');
  });

  it('★ تحمل الامتياز نفسه — can_manage_mrp_roles لا شرط منسوخ', () => {
    expect(scope).toContain('public.can_manage_mrp_roles()');
    // لو نُسخ شرط الأدوار هنا لعاد الانحراف
    expect(scope).not.toMatch(/current_user_role\(\)\s+=\s+ANY/);
  });

  it('الحارس داخل الاستعلام — صفر صفوف لا خطأ يكشف الوجود', () => {
    expect(scope).toMatch(/AND public\.can_manage_mrp_roles\(\)/);
  });

  it('تفلتر بالمستأجر', () => {
    expect(scope).toContain('mp.tenant_id = public.current_user_tenant_id()');
  });

  it('تستبعد المصانع غير النشطة', () => {
    expect(scope).toContain("mp.status = 'active'");
  });

  it('★ تعيد ثلاثة أعمدة فقط — لا تسريب بيانات إدارية', () => {
    expect(scope).toContain('out_plant_id');
    expect(scope).toContain('out_plant_code');
    expect(scope).toContain('out_name_ar');
    for (const leak of ['created_by', 'address', 'timezone']) {
      expect(scope, `تسريب ${leak}`).not.toContain(`mp.${leak}`);
    }
  });

  it('SECURITY DEFINER مع search_path مثبّت', () => {
    expect(scope).toContain('SECURITY DEFINER');
    expect(scope).toContain('SET search_path = public');
  });

  it('anon محروم صراحةً', () => {
    expect(CODE).toContain('REVOKE ALL ON FUNCTION public.mrp_plants_for_role_scope() FROM anon');
  });

  it('★ لا يوسّع RLS على manufacturing_plants (أقل امتياز)', () => {
    // توسيع السياسة يفتح الإنشاء والتعديل لمن نريد له القراءة فقط
    expect(CODE).not.toContain('DROP POLICY');
    expect(CODE).not.toMatch(/CREATE POLICY[\s\S]*manufacturing_plants/);
    expect(CODE).not.toContain('ALTER TABLE public.manufacturing_plants');
  });
});

describe('0315 — الكتالوج الموسَّع', () => {
  const scope = fnScope(CODE, 'mrp_role_catalog');

  it('يُسقَط صراحةً — نوع الإرجاع تغيّر بعمود ثالث', () => {
    expect(CODE).toContain('DROP FUNCTION IF EXISTS public.mrp_role_catalog()');
  });

  it('يُضيف out_plant_scoped', () => {
    expect(scope).toContain('out_plant_scoped  BOOLEAN');
  });

  it('★ ما زال مُشتقّاً من قيد CHECK لا قائمة منسوخة', () => {
    expect(scope).toContain('pg_get_constraintdef');
    expect(scope).not.toMatch(/unnest\(ARRAY\s*\[\s*'mrp_planner'/);
  });

  it('الأدوار الميدانية الستة مُنطَّقة', () => {
    for (const r of [
      'production_manager',
      'production_supervisor',
      'shop_floor_operator',
      'quality_inspector',
      'maintenance_technician',
      'maintenance_manager',
    ]) {
      expect(scope, r).toContain(`'${r}'`);
    }
  });

  it('★ إرشاد لا قيد — لا CHECK يفرض التنطيق', () => {
    expect(MIG).toContain('إرشاد');
    expect(CODE).not.toMatch(/ADD CONSTRAINT.*plant_scoped/);
  });
});

describe('0315 — حرّاس المايجريشن', () => {
  it('لا حِمل زائد على الدالتين', () => {
    expect(CODE).toMatch(/ASSERT v_cnt = 1, format\('0315 failed: %s overloads/);
  });

  it('يختبر العطل سلوكياً بمستخدم دوره employee', () => {
    // جوهر العطل: من كانت RLS تحجبه رغم امتلاكه الامتياز
    expect(CODE).toContain("'employee'");
    expect(CODE).toContain('0315 failed: plants visible');
  });

  it('يختبر منع التسريب لغير المخوَّل', () => {
    expect(CODE).toContain('0315 failed: leaked');
  });

  it('يتحقق من عدد الأدوار المُنطَّقة', () => {
    expect(CODE).toContain('0315 failed: plant-scoped roles');
  });

  it('ينظّف مسبار الحارس', () => {
    expect(CODE).toContain('DELETE FROM public.manufacturing_plants    WHERE id      IN (v_p1,v_p2)');
  });
});

describe('0315 — الاختبار السلوكي', () => {
  it('يغطي اتساق الامتياز مع رؤية المصانع', () => {
    expect(VERIFY).toContain('عدم اتساق مع can_manage');
  });

  it('★ يغطي استقلال الصفوف بين المصانع', () => {
    expect(VERIFY).toContain('المصنعان لم يُنشئا صفّين');
    expect(VERIFY).toContain('النطاق العام لم يستقل');
  });

  it('★ يغطي أن سحب مصنع لا يمسّ الآخر', () => {
    expect(VERIFY).toContain('سحب مصنع أتلف مصنعاً آخر');
    expect(VERIFY).toContain('سحب مصنع أتلف النطاق العام');
  });

  it('يغطي العزل بين المستأجرين', () => {
    expect(VERIFY).toContain('تسرّب مصنع من مستأجر آخر');
  });

  it('يغطي استبعاد المصنع المغلق', () => {
    expect(VERIFY).toContain('المصنع المغلق يظهر في قائمة الإسناد');
  });

  it('يستعمل قيمة status صحيحة (closed لا archived)', () => {
    // القيد يقبل active·inactive·closed — أُثبت بالتشغيل
    expect(VERIFY).toContain("'closed'");
    expect(VERIFY).not.toContain("'archived')");
  });

  it('يوثّق سبب عدم فحص RLS المباشرة بدل ترك تأكيد ميت', () => {
    expect(VERIFY).toContain('BYPASSRLS');
    expect(VERIFY).toContain('لا نُوثّق ما لم نُثبته هنا');
  });
});

// ═══════════════════════════════════════════════════════════════════════
describe('MrpRoleService — نطاق المصنع', () => {
  it('يُعرّض findPlants عبر RPC المخصّصة', () => {
    expect(SVC).toContain("supabase.rpc('mrp_plants_for_role_scope')");
  });

  it('★ لا يقرأ manufacturing_plants مباشرةً', () => {
    expect(SVC).not.toContain("from('manufacturing_plants')");
  });

  it('يوثّق سبب استعمال RPC بدل الجدول', () => {
    expect(SVC).toContain('عدم اتساق');
  });

  it('MrpPlantOption يحمل الحقول الثلاثة', () => {
    expect(SVC).toContain('plantId: string');
    expect(SVC).toContain('plantCode: string');
    expect(SVC).toContain('nameAr: string');
  });

  it('الكتالوج يمرّر plantScoped', () => {
    expect(SVC).toContain('plantScoped: r.out_plant_scoped === true');
  });
});

describe('MrpRolesAdminPage — اختيار المصنع', () => {
  it('تقرأ المصانع عبر الخدمة', () => {
    expect(PAGE).toContain('mrpRoleService.findPlants()');
  });

  it('★ فشل قائمة المصانع لا يُسقط الشاشة', () => {
    expect(PAGE).toMatch(/findPlants\(\)\.catch\(\(\) => \[\]\)/);
  });

  it('تعرض قائمة اختيار بخيار «كل المصانع»', () => {
    expect(PAGE).toContain('كل المصانع (نطاق الشركة)');
    expect(PAGE).toContain('formPlant');
  });

  it('تتعامل مع غياب المصانع بنص مفهوم لا قائمة فارغة', () => {
    expect(PAGE).toContain('لا مصانع مسجَّلة');
    expect(PAGE).toContain('plants.length === 0');
  });

  it("'' تعني NULL لا نصاً فارغاً يُرسَل للقاعدة", () => {
    expect(PAGE).toContain('const plantId = formPlant || null;');
  });

  it('تُرشد للتنطيق حسب plantScoped', () => {
    expect(PAGE).toContain('selectedRoleEntry?.plantScoped');
    expect(PAGE).toContain('يُنصح بتحديد مصنع لهذا الدور');
  });

  it('★ تصفّر النموذج عند الفتح — لا تتسرّب قيم سابقة', () => {
    expect(PAGE).toMatch(/setFormPlant\(''\);\s*\n\s*setFormOpen\(true\)/);
  });

  it('رسالة النجاح تذكر النطاق', () => {
    expect(PAGE).toContain("? plants.find((p) => p.plantId === plantId)?.nameAr");
  });

  it('توضّح أن نفس الدور في مصنعين إسنادان مستقلان', () => {
    expect(PAGE).toContain('نفس الدور في مصنعين إسنادان مستقلان');
  });

  it('★ ما زالت لا تلمس Supabase ولا confirm()', () => {
    expect(PAGE).not.toContain('supabase.rpc(');
    expect(PAGE).not.toContain('supabase.from(');
    const code = PAGE
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/(?<![\w.])confirm\s*\(/);
    expect(code).not.toMatch(/\bas any\b/);
  });
});
