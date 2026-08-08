/**
 * ════════════════════════════════════════════════════════════════
 *  cvProfileContract.test.ts
 *
 *  عقد الملف الشخصي: بحث المهارات · أرشفة السيرة (migration 0336).
 *  المرحلة 2 — الجولة الثانية.
 *
 *  ★ فحص ثابت. الإثبات السلوكي في:
 *      tools/dev/verify-cv-profile-0336.sql   49 تأكيداً
 * ════════════════════════════════════════════════════════════════
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

const M = read('supabase/migrations/0336_cv_skill_search_and_soft_delete.sql');
const VERIFY = read('tools/dev/verify-cv-profile-0336.sql');
const SVC = read('src/services/sdk/UserService.ts');
const PAGE = read('src/pages/employee/ProfilePage.tsx');

function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/^\s*--.*$/gm, '');
}

function fnBody(name: string): string {
  const s = M.indexOf(`CREATE FUNCTION public.${name}(`);
  const e = M.indexOf(`COMMENT ON FUNCTION public.${name}(`);
  expect(s, `${name}: لا تعريف`).toBeGreaterThan(-1);
  expect(e, `${name}: لا COMMENT`).toBeGreaterThan(s);
  return M.slice(s, e);
}

describe('0336 — استخراج أسماء المهارات', () => {
  const body = fnBody('cv_skill_names');

  /**
   * ★★★ جوهر العطل: `jsonb_array_elements_text` على مصفوفة كائنات
   *   تُخرج الكائن **كاملاً كنصّ**:
   *     '{"name": "React", "level": "متقدم"}'
   *   فالبحث عن «متقدم» أو «level» أو «name» يُطابق.
   */
  it('★★★ يستعمل jsonb_array_elements لا _text', () => {
    expect(body).toMatch(/jsonb_array_elements\(/);
    expect(body).not.toMatch(/jsonb_array_elements_text\(/);
  });

  it('★★ يقبل الشكلين: نصّ مجرّد وكائن {name,level}', () => {
    expect(body).toMatch(/WHEN jsonb_typeof\(el\) = 'string' THEN el #>> '\{\}'/);
    expect(body).toMatch(/WHEN jsonb_typeof\(el\) = 'object' THEN el ->> 'name'/);
  });

  it('★ يحرس من skills غير المصفوفة (بيانات تالفة)', () => {
    expect(body).toMatch(/jsonb_typeof\(p_cv -> 'skills'\) = 'array'/);
  });

  it('★ يُقصي الفارغ والمسافات', () => {
    expect(body).toMatch(/FILTER \(WHERE name IS NOT NULL AND btrim\(name\) <> ''\)/);
  });

  it('★ يُرجع مصفوفة فارغة لا NULL', () => {
    expect(body).toMatch(/COALESCE\(/);
    expect(body).toMatch(/ARRAY\[\]::TEXT\[\]/);
  });

  it('★ IMMUTABLE — يسمح بالفهرسة التعبيرية', () => {
    expect(body).toMatch(/\bIMMUTABLE\b/);
    expect(body).toMatch(/PARALLEL SAFE/);
  });
});

describe('0336 — البحث في سجل المؤهلات', () => {
  const body = fnBody('hr_talent_profiles');

  it('★★★ يبحث عبر cv_skill_names لا في الـJSON الخام', () => {
    expect(body).toMatch(/unnest\(public\.cv_skill_names\(p\.cv_data\)\)/);
    expect(body).not.toMatch(/jsonb_array_elements_text/);
  });

  /**
   * ★★ التوقيع محفوظ حرفياً: `UserService.talentProfiles` تقرأ عشرة
   *   أعمدة، وحذف أيّها يكسر سجل المؤهلات **صامتاً**.
   */
  it.each([
    'out_id', 'out_full_name', 'out_email', 'out_phone', 'out_department',
    'out_position', 'out_profile_image', 'out_cv_data', 'out_has_cv',
    'out_skill_count',
  ])('★★ العمود %s محفوظ', (col) => {
    expect(body).toContain(col);
  });

  it('★★ الأرشيف لا يُعاد للواجهة', () => {
    expect(body).toMatch(/- '__archived'/);
  });

  it('★★ ولا يُحتسب في has_cv', () => {
    expect(body).toMatch(/\(COALESCE\(p\.cv_data, '\{\}'::jsonb\) - '__archived'\) <> '\{\}'::jsonb/);
  });

  it('★★ مقيّد بالمستأجر', () => {
    expect(body).toMatch(/WHERE p\.tenant_id = v_tenant/);
    expect(body).toMatch(/IF v_tenant IS NULL THEN RETURN; END IF;/);
  });

  it('★ SECURITY INVOKER — يحترم RLS جدول profiles', () => {
    expect(body).toMatch(/SECURITY INVOKER/);
    expect(body).not.toMatch(/SECURITY DEFINER/);
  });

  it('★ الحدّ مقصوص', () => {
    expect(body).toMatch(/GREATEST\(1, LEAST\(COALESCE\(p_limit, 200\), 500\)\)/);
  });
});

describe('0336 — أرشفة السيرة الذاتية', () => {
  const body = fnBody('archive_my_cv');

  it('★★★ تحفظ النسخة لا تحذفها', () => {
    expect(body).toMatch(/jsonb_build_object\(\s*\n\s*'__archived'/);
    expect(body).toMatch(/'cv',\s+v_current - '__archived'/);
  });

  it('★ تسجّل وقت الأرشفة', () => {
    expect(body).toMatch(/'archived_at', to_jsonb\(NOW\(\)\)/);
  });

  /**
   * ★★ أرشفة ثانية لسيرة فارغة كانت ستكتب `__archived: { cv: {} }`
   *   فتُتلف الأرشيف الأول — أي تصير الأرشفة حذفاً بخطوتين.
   */
  it('★★ لا تُتلف أرشيفاً قائماً', () => {
    expect(body).toMatch(/IF \(v_current - '__archived'\) = '\{\}'::jsonb THEN\s*\n\s*RETURN FALSE;/);
  });

  it('★ VOLATILE — تكتب (درس 0320)', () => {
    expect(body).toMatch(/\bVOLATILE\b/);
    expect(body).not.toMatch(/\bSTABLE\b/);
  });

  it('★★ SECURITY INVOKER — سياسة profiles_update_self هي الحارس', () => {
    expect(body).toMatch(/SECURITY INVOKER/);
    expect(body).not.toMatch(/SECURITY DEFINER/);
  });

  it('★ تعمل على ملف المستخدم وحده', () => {
    expect(body).toMatch(/WHERE id = v_uid/);
  });
});

describe('0336 — الاسترجاع', () => {
  const body = fnBody('restore_my_cv');

  it('يُعيد السيرة من الأرشيف', () => {
    expect(body).toMatch(/cv_data -> '__archived' -> 'cv'/);
    expect(body).toMatch(/SET cv_data = v_arch/);
  });

  it('★ يُعيد FALSE بلا أرشيف — لا خطأ', () => {
    expect(body).toMatch(/IF v_arch IS NULL OR v_arch = '\{\}'::jsonb THEN\s*\n\s*RETURN FALSE;/);
  });

  it('★ VOLATILE', () => {
    expect(body).toMatch(/\bVOLATILE\b/);
  });
});

describe('0336 — الصلاحيات', () => {
  it.each([
    'cv_skill_names(JSONB)',
    'hr_talent_profiles(TEXT,INTEGER,INTEGER)',
    'archive_my_cv()',
    'restore_my_cv()',
    'my_cv_archive_info()',
  ])('%s محجوبة عن anon وممنوحة لـauthenticated', (sig) => {
    const esc = sig.replace(/[()]/g, (c) => `\\${c}`);
    expect(M).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${esc} FROM PUBLIC`));
    expect(M).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${esc} FROM anon`));
    expect(M).toMatch(
      new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${esc}\\s*\\n?\\s*TO authenticated`),
    );
  });

  it('★ DROP قبل CREATE (درس 0320)', () => {
    for (const fn of ['cv_skill_names', 'hr_talent_profiles', 'archive_my_cv',
                      'restore_my_cv', 'my_cv_archive_info']) {
      const d = M.indexOf(`DROP FUNCTION IF EXISTS public.${fn}`);
      const c = M.indexOf(`CREATE FUNCTION public.${fn}`);
      expect(d, `${fn}: لا DROP`).toBeGreaterThan(-1);
      expect(d, `${fn}: DROP بعد CREATE`).toBeLessThan(c);
    }
  });

  it('★ cv_skill_names مُعرَّفة قبل مستدعياتها', () => {
    const def = M.indexOf('CREATE FUNCTION public.cv_skill_names');
    expect(def).toBeLessThan(M.indexOf('CREATE FUNCTION public.hr_talent_profiles'));
    expect(def).toBeLessThan(M.indexOf('CREATE FUNCTION public.my_cv_archive_info'));
  });
});

describe('0336 — طبقة SDK', () => {
  it.each(['archive_my_cv', 'restore_my_cv', 'my_cv_archive_info'])(
    'تستدعي %s عبر RPC',
    (fn) => {
      expect(SVC).toContain(`rpc('${fn}'`);
    },
  );

  it('★ النوع CvArchiveInfo مُصدَّر', () => {
    expect(SVC).toMatch(/export interface CvArchiveInfo/);
    expect(read('src/services/sdk/index.ts')).toContain('CvArchiveInfo');
  });

  it('★ بلا as any', () => {
    expect(codeOnly(SVC)).not.toMatch(/\bas any\b/);
  });
});

describe('★★ الصفحة — الحذف الصامت أُزيل', () => {
  it('★★★ لا حذف مباشر لـcv_data', () => {
    const code = codeOnly(PAGE);
    expect(code).not.toMatch(/cv_data:\s*\{\}/);
    expect(code).not.toMatch(/handleDeleteCv/);
  });

  it('★★ تأكيد داخل الصفحة — لا confirm()', () => {
    const code = codeOnly(PAGE);
    expect(code).not.toMatch(/(?<![.\w])(confirm|alert|prompt)\s*\(/);
    expect(PAGE).toMatch(/confirmArchive/);
    expect(PAGE).toMatch(/أرشفة السيرة الذاتية؟/);
  });

  it('★★ التأكيد يشرح أن الأرشفة ليست حذفاً', () => {
    expect(PAGE).toMatch(/لن تُحذف/);
    expect(PAGE).toMatch(/يمكنك استرجاعها/);
  });

  it('★ زرّ الاسترجاع يظهر عند وجود أرشيف', () => {
    expect(PAGE).toMatch(/cvArchive\.hasArchive &&/);
    expect(PAGE).toMatch(/handleRestoreCv/);
  });

  it('★ الأيقونة صارت أرشفة لا سلّة مهملات', () => {
    const btn = PAGE.slice(PAGE.indexOf('setConfirmArchive(true)'));
    expect(btn.slice(0, 400)).toMatch(/<Archive size=\{16\} \/>/);
  });

  it('★ تحمّل حالة الأرشيف مع الملف', () => {
    expect(PAGE).toMatch(/userService\.myCvArchiveInfo\(\)/);
  });

  it('★ بلا as any', () => {
    expect(codeOnly(PAGE)).not.toMatch(/\bas any\b/);
  });
});

describe('0336 — الاختبار السلوكي', () => {
  it('الملف موجود', () => {
    expect(existsSync(resolve(root, 'tools/dev/verify-cv-profile-0336.sql'))).toBe(true);
  });

  it('★★★ يفحص أن مستوى المهارة لا يُطابَق كمهارة', () => {
    expect(VERIFY).toMatch(/البحث عن «متقدم»/);
    expect(VERIFY).toMatch(/المستوى يُعامَل كمهارة/);
  });

  it('★★ ويفحص مفاتيح JSON نفسها', () => {
    expect(VERIFY).toMatch(/البحث عن مفتاح «level»/);
    expect(VERIFY).toMatch(/البحث عن مفتاح «name»/);
  });

  it('★★ يفحص أن الأرشفة تحفظ فعلاً', () => {
    expect(VERIFY).toMatch(/الأرشيف مفقود — الأرشفة صارت حذفاً/);
  });

  it('★★ وأن أرشفة ثانية لا تُتلف الأولى', () => {
    expect(VERIFY).toMatch(/الأرشيف أُتلف بأرشفة ثانية/);
  });

  it('★ يفحص الشكلين والخليط', () => {
    expect(VERIFY).toMatch(/استخراج من كائن/);
    expect(VERIFY).toMatch(/استخراج من نصوص/);
    expect(VERIFY).toMatch(/الخليط لا يُعالَج/);
  });

  it('★ ويفحص البيانات التالفة', () => {
    expect(VERIFY).toMatch(/skills غير مصفوفة أسقطت الدالة/);
  });
});
