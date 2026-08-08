/**
 * ════════════════════════════════════════════════════════════════
 *  عقد 0360 — سلامة مستندات الموظفين
 * ════════════════════════════════════════════════════════════════
 *
 * ★★★ ما **لا** يُثبَت هنا: الفحص الثابت لا يرى RLS ولا يشغّل SQL.
 *   · السلوك مُختبَر في `tools/dev/verify-employee-documents-0360.sql`
 *     — **73** تأكيداً بأرقام محسوبة يدوياً
 *   · العزل مُثبَت في `…-0360-rls.sh` بدور `authenticated` حقيقيّ
 *     — **34** فحصاً
 *   · التغطية مُثبتة في `_invert_0360.py` — **32/32** عكساً أسقط
 *     الاختبار (+4 تكافؤات مُثبتة بالاستعلام لا بالتخمين)
 *
 *   هذا الملف يحرس ألّا تعود **الأسباب الجذرية**: عمودٌ أمنيّ ميت لا
 *   تذكره أيّ سياسة · نوعٌ حرّ بلا قيد · `employee_id` بلا FK مركَّب ·
 *   حذفٌ نهائيّ لوثيقة قانونية · bucket غير موجود · رابطٌ عامّ لتقرير
 *   طبّي · تاريخُ انتهاء يُطبَع بلا مقارنة.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

const MIG_PATH = 'supabase/migrations/0360_employee_documents_integrity.sql';
const MIG     = read(MIG_PATH);
const SERVICE = read('src/services/sdk/EmployeeDocumentsService.ts');
const PAGE    = read('src/pages/hr/DocumentsPage.tsx');
const INDEX   = read('src/services/sdk/index.ts');

const codeTs = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const codeSql = (s: string) => s.replace(/^\s*--.*$/gm, '');
const stmtSql = (s: string) => codeSql(s).replace(/'(?:[^']|'')*'/g, " '' ");

// ── ★ المُجرِّدات نفسها مُختبَرة (درس 0355) ──
describe('★★ المُجرِّدات تعمل فعلاً', () => {
  it('codeTs يُسقط التعليق ويُبقي الشيفرة', () => {
    expect(codeTs("/* uploadPublic */ const x=1;")).not.toMatch(/uploadPublic/);
    expect(codeTs("// employee-documents\nconst y=1;")).not.toMatch(/employee-documents/);
    expect(codeTs("const s = d.confidential;")).toMatch(/confidential/);
  });
  it('stmtSql يُسقط السلاسل ويُبقي المعرّفات', () => {
    expect(stmtSql("COMMENT ON X IS 'is_confidential مذكور';")).not.toMatch(/is_confidential/);
    expect(stmtSql("  AND d.is_archived = FALSE")).toMatch(/d\.is_archived/);
    expect(stmtSql("SELECT 'it''s ok' AS x;")).not.toMatch(/ok/);
  });
});

const MIG_CODE  = codeSql(MIG);
const MIG_STMT  = stmtSql(MIG);
const PAGE_CODE = codeTs(PAGE);
const SVC_CODE  = codeTs(SERVICE);

/** ★ درس 0355: على النصّ المُجرَّد من التعليقات */
const fnBody = (name: string): string => {
  const i = MIG_CODE.indexOf(`CREATE FUNCTION public.${name}`);
  expect(i, `الدالة ${name} غير موجودة في ${MIG_PATH}`).toBeGreaterThan(-1);
  const j = MIG_CODE.indexOf('$$;', i);
  expect(j, `نهاية ${name} غير موجودة`).toBeGreaterThan(i);
  return MIG_CODE.slice(i, j);
};

const NEW_FNS = ['employee_documents_board', 'employee_documents_summary',
                 'document_upload', 'document_set_confidential'];

const KINDS = ['contract', 'certificate', 'id_copy', 'cv',
               'medical', 'degree', 'recommendation', 'other'];

// ═══════════════════════════════════════════════════════════════
describe('0360 — بنية المايجريشن', () => {
  it('الملف موجود', () => {
    expect(existsSync(resolve(root, MIG_PATH))).toBe(true);
  });

  it('معاملة واحدة BEGIN/COMMIT', () => {
    expect(MIG_CODE).toMatch(/^\s*BEGIN;/m);
    expect(MIG_CODE).toMatch(/^\s*COMMIT;\s*$/m);
  });

  it.each(NEW_FNS)('%s مُعرَّفة بـDROP صريح قبلها', (fn) => {
    // ★ CREATE OR REPLACE لا يغيّر نوع الإرجاع ⇒ DROP إلزاميّ
    expect(MIG_CODE).toMatch(new RegExp(`DROP FUNCTION IF EXISTS public\\.${fn}\\(`));
    expect(MIG_CODE).toMatch(new RegExp(`CREATE FUNCTION public\\.${fn}\\(`));
  });

  it.each(NEW_FNS)('%s تُثبّت search_path', (fn) => {
    expect(fnBody(fn)).toMatch(/SET search_path = public/);
  });

  it.each(NEW_FNS)('%s: REVOKE عن anon قبل أي GRANT', (fn) => {
    // ★★★ 0268 يمنح authenticated كل شيء على كل دالة جديدة
    //   (pg_default_acl: f | postgres | anon=X authenticated=X service_role=X)
    //   ⇒ REVOKE عن anon هو الحارس الحقيقيّ لا GRANT.
    const rev = MIG_CODE.indexOf(`REVOKE ALL ON FUNCTION public.${fn}(`);
    const anon = MIG_CODE.indexOf(`REVOKE ALL ON FUNCTION public.${fn}(`, rev + 1);
    expect(rev, `REVOKE عن PUBLIC مفقود لـ${fn}`).toBeGreaterThan(-1);
    expect(anon, `REVOKE عن anon مفقود لـ${fn}`).toBeGreaterThan(rev);
    expect(MIG_CODE.slice(anon, anon + 400)).toMatch(/FROM anon;/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★★ العطل ①: is_confidential لم يعد عموداً ميتاً', () => {
  it('سياسة القراءة تذكره صراحةً', () => {
    // كان: (staff OR employee_id = me) بلا أيّ ذكر للسرّية
    const i = MIG_CODE.indexOf('CREATE POLICY kyvzon_employee_documents_select');
    expect(i).toBeGreaterThan(-1);
    const body = MIG_CODE.slice(i, i + 700);
    expect(body).toMatch(/NOT is_confidential/);
    expect(body).toMatch(/current_user_employee_id\(\)/);
  });

  it('السياسة القديمة أُسقطت أولاً', () => {
    const drop = MIG_CODE.indexOf('DROP POLICY IF EXISTS kyvzon_employee_documents_select');
    const create = MIG_CODE.indexOf('CREATE POLICY kyvzon_employee_documents_select');
    expect(drop).toBeGreaterThan(-1);
    expect(create).toBeGreaterThan(drop);
  });

  it('اللوح يحجب السرّي عن صاحبه أيضاً (دفاعٌ مزدوج)', () => {
    expect(fnBody('employee_documents_board')).toMatch(/NOT d\.is_confidential/);
  });

  it('document_set_confidential تُدير العمود', () => {
    const b = fnBody('document_set_confidential');
    expect(b).toMatch(/SET is_confidential = p_value/);
    expect(b).toMatch(/DOCUMENT_NOT_AUTHORIZED/);
  });

  it('★★ الطبّي وخطاب التوصية مقفولان', () => {
    const b = fnBody('document_set_confidential');
    expect(b).toMatch(/DOCUMENT_CONFIDENTIAL_LOCKED/);
    expect(b).toMatch(/'medical','recommendation'/);
  });

  it('★★ والمحفّز يرفعهما سرّيَّين عند الإدراج مهما أُرسل', () => {
    const i = MIG_CODE.indexOf('CREATE OR REPLACE FUNCTION public.tg_employee_document_stamp');
    const b = MIG_CODE.slice(i, MIG_CODE.indexOf('$$;', i));
    expect(b).toMatch(/NEW\.is_confidential := TRUE/);
    expect(b).toMatch(/'medical','recommendation'/);
  });

  it('الصفحة تعرض السرّية وتضبطها', () => {
    expect(PAGE_CODE).toMatch(/setConfidential/);
    expect(PAGE_CODE).toMatch(/isAlwaysConfidential/);
    expect(PAGE_CODE).toContain('confidential');
  });

  it('★ والصفحة تُعطّل الزرّ للمقفول بدل نداءٍ تعرف أنه يرمي', () => {
    expect(PAGE_CODE).toMatch(/doc\.confidential && isAlwaysConfidential\(doc\.kind\)/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★★ العطل ②: document_type بمفردات مغلقة', () => {
  it('قيد CHECK بالمفردات الثماني', () => {
    expect(MIG_CODE).toMatch(/employee_documents_type_chk/);
    for (const k of KINDS) {
      expect(MIG_CODE, `المفردة ${k} غائبة عن القيد`).toContain(`'${k}'`);
    }
  });

  it('document_upload تحرس النوع برمز صريح', () => {
    expect(fnBody('document_upload')).toMatch(/DOCUMENT_TYPE_INVALID/);
  });

  it('★ التصنيف في الخدمة ثماني — لا سبعة', () => {
    expect(SVC_CODE).toMatch(/DOCUMENT_TYPES = \[/);
    for (const k of KINDS) {
      expect(SVC_CODE, `${k} غائب عن DOCUMENT_TYPES`).toContain(`'${k}'`);
    }
    const m = SVC_CODE.match(/DOCUMENT_TYPES = \[([\s\S]*?)\] as const/);
    expect(m).toBeTruthy();
    expect((m as RegExpMatchArray)[1].split(',').filter((x) => x.trim()).length).toBe(8);
  });

  it('★★ وشريط الترشيح يُشتقّ من المصدر لا يُكتَب يدوياً', () => {
    // العطل: الشريط القديم عدّد سبعة و`recommendation` مفقود
    expect(PAGE_CODE).toMatch(/DOCUMENT_TYPES\.map/);
    expect(PAGE_CODE).not.toMatch(/'contract',\s*'certificate',\s*'id_copy'/);
  });

  it('★ ونموذج الإنشاء يُشتقّ منه كذلك', () => {
    const m = PAGE_CODE.match(/DOCUMENT_TYPES\.map/g);
    expect(m?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★★ العطلان ③/④: FK مركَّب يمنع الموظف الأجنبيّ', () => {
  it('FK على (employee_id, tenant_id) لا على employee_id وحده', () => {
    expect(MIG_CODE).toMatch(/employee_documents_employee_tenant_fkey/);
    expect(MIG_CODE).toMatch(/FOREIGN KEY \(employee_id, tenant_id\)/);
    expect(MIG_CODE).toMatch(/REFERENCES public\.employees \(id, tenant_id\)/);
  });

  it('★ وفهرسٌ فريد يجعله ممكناً', () => {
    expect(MIG_CODE).toMatch(/uq_employees_id_tenant/);
    expect(MIG_CODE).toMatch(/ON public\.employees \(id, tenant_id\)/);
  });

  it('★★ ON DELETE RESTRICT لا CASCADE — الوثيقة دليل', () => {
    const i = MIG_CODE.indexOf('employee_documents_employee_tenant_fkey');
    expect(MIG_CODE.slice(i, i + 400)).toMatch(/ON DELETE RESTRICT/);
    expect(MIG_CODE.slice(i, i + 400)).not.toMatch(/ON DELETE CASCADE/);
  });

  it('والدالة تحرس المستأجر برمز صريح', () => {
    const b = fnBody('document_upload');
    expect(b).toMatch(/DOCUMENT_EMPLOYEE_NOT_FOUND/);
    expect(b).toMatch(/e\.tenant_id = v_tenant/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★ العطل ⑤: tenant_id لا يقبل NULL', () => {
  it('القيد مفروض', () => {
    expect(MIG_CODE).toMatch(
      /ALTER TABLE public\.employee_documents ALTER COLUMN tenant_id SET NOT NULL/);
  });

  it('★ والصفوف اليتيمة عولجت قبل فرضه', () => {
    const heal = MIG_CODE.indexOf('SET tenant_id = e.tenant_id');
    const force = MIG_CODE.indexOf('ALTER COLUMN tenant_id SET NOT NULL');
    expect(heal).toBeGreaterThan(-1);
    expect(force, 'القيد فُرض قبل العلاج').toBeGreaterThan(heal);
  });

  it('★★ والمحفّز يملؤه من السياق', () => {
    const i = MIG_CODE.indexOf('CREATE OR REPLACE FUNCTION public.tg_employee_document_stamp');
    expect(MIG_CODE.slice(i, MIG_CODE.indexOf('$$;', i)))
      .toMatch(/NEW\.tenant_id := public\.current_user_tenant_id\(\)/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★★ العطل ⑥: الأرشفة تُخفي فعلاً', () => {
  it('اللوح يفلتر is_archived', () => {
    expect(fnBody('employee_documents_board'))
      .toMatch(/d\.is_archived = COALESCE\(p_archived, FALSE\)/);
  });

  it('★★ والصفحة تفصل تبويبين لا تخلط', () => {
    expect(PAGE_CODE).toMatch(/'active' \| 'archived'/);
    expect(PAGE_CODE).toMatch(/board\(null, tab === 'archived'\)/);
  });

  it('★★★ ولم يعد أيّ نداء findAll بلا فلتر', () => {
    expect(PAGE_CODE, 'findAll عادت').not.toMatch(/employeeDocumentService/);
    expect(PAGE_CODE).not.toMatch(/\.findAll\(/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★★ العطل ⑦: الحذف النهائيّ ممنوع في القاعدة', () => {
  it('محفّز BEFORE DELETE برمز صريح', () => {
    expect(MIG_CODE).toMatch(/tg_block_employee_document_delete/);
    expect(MIG_CODE).toMatch(/DOCUMENT_DELETE_BLOCKED/);
    expect(MIG_CODE).toMatch(/BEFORE DELETE ON public\.employee_documents/);
  });

  it('★ لا حذف في الخدمة ولا في الصفحة', () => {
    expect(SVC_CODE, 'delete عاد للخدمة').not.toMatch(/\.delete\(/);
    expect(PAGE_CODE, 'deleteDocument عاد').not.toMatch(/deleteDocument/);
    expect(PAGE_CODE).toMatch(/archiveEmployeeDocument/);
  });

  it('★★ ولا confirm/alert/prompt (سياسة المنصة)', () => {
    for (const banned of ['confirm(', 'alert(', 'prompt(']) {
      expect(PAGE_CODE, `${banned} عاد`).not.toContain(banned);
    }
    expect(PAGE_CODE).toMatch(/تأكيد الأرشفة/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★ العطل ⑧: uploaded_by يُملأ ولا يُنتحَل', () => {
  it('المحفّز يملؤه من auth.uid()', () => {
    const i = MIG_CODE.indexOf('CREATE OR REPLACE FUNCTION public.tg_employee_document_stamp');
    const b = MIG_CODE.slice(i, MIG_CODE.indexOf('$$;', i));
    expect(b).toMatch(/NEW\.uploaded_by := COALESCE\(auth\.uid\(\)/);
  });

  it('★★ ويُجمّده بعد الإنشاء (لا انتحال بالتحديث)', () => {
    const i = MIG_CODE.indexOf('CREATE OR REPLACE FUNCTION public.tg_employee_document_stamp');
    const b = MIG_CODE.slice(i, MIG_CODE.indexOf('$$;', i));
    expect(b).toMatch(/NEW\.uploaded_by := OLD\.uploaded_by/);
    expect(b).toMatch(/NEW\.employee_id := OLD\.employee_id/);
    expect(b).toMatch(/NEW\.tenant_id\s+:= OLD\.tenant_id/);
  });

  it('★ والخدمة لا ترسل uploaded_by إطلاقاً', () => {
    expect(SVC_CODE).not.toMatch(/p_uploaded_by|uploaded_by:/);
  });

  it('★ واللوح يُظهر اسم الرافع', () => {
    expect(fnBody('employee_documents_board')).toMatch(/p\.full_name/);
    expect(SVC_CODE).toMatch(/uploaderName/);
    expect(PAGE_CODE).toMatch(/uploaderName/);
  });

  it('★★ والملخّص يعدّ أثر العطل القائم', () => {
    expect(fnBody('employee_documents_summary')).toMatch(/d\.uploaded_by IS NULL/);
    expect(PAGE_CODE).toMatch(/noUploader/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★ العطل ⑨: الحجم والنوع لم يعودا مُهمَلَين', () => {
  it('قيد الحجم في القاعدة (25MB)', () => {
    expect(MIG_CODE).toMatch(/employee_documents_size_chk/);
    expect(MIG_CODE).toMatch(/file_size <= 26214400/);
  });

  it('والدالة تحرسه برمز صريح', () => {
    expect(fnBody('document_upload')).toMatch(/DOCUMENT_SIZE_INVALID/);
  });

  it('★ والحدّ نفسه في الخدمة لا رقمٌ سحريّ مكرَّر', () => {
    expect(SVC_CODE).toMatch(/MAX_DOCUMENT_BYTES = 26214400/);
    expect(PAGE_CODE).toMatch(/MAX_DOCUMENT_BYTES/);
    expect(PAGE_CODE, 'رقم سحريّ في الصفحة').not.toMatch(/26214400/);
  });

  it('★★ والصفحة تقرأ size/type من File وتُرسلهما', () => {
    expect(SVC_CODE).toMatch(/size: file\.size/);
    expect(SVC_CODE).toMatch(/mimeType: file\.type/);
    expect(PAGE_CODE).toMatch(/fileSize:\s*form\.fileSize/);
    expect(PAGE_CODE).toMatch(/mimeType:\s*form\.mimeType/);
  });

  it('★ وقيدٌ يمنع العنوان/الرابط الفارغين', () => {
    expect(MIG_CODE).toMatch(/employee_documents_title_chk/);
    expect(fnBody('document_upload')).toMatch(/DOCUMENT_TITLE_REQUIRED/);
    expect(fnBody('document_upload')).toMatch(/DOCUMENT_FILE_REQUIRED/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★ العطل ⑩: الانتهاء يُحسب لا يُطبَع', () => {
  it('اللوح يُعيد حالة الانتهاء وأيامها', () => {
    const b = fnBody('employee_documents_board');
    expect(b).toMatch(/out_expiry_state/);
    expect(b).toMatch(/out_days_left/);
    for (const s of ['none', 'expired', 'expiring', 'valid']) {
      expect(b, `الحالة ${s} غائبة`).toContain(`'${s}'`);
    }
  });

  it('★★★ ويُحسب بتوقيت بغداد لا بمنطقة الخادم', () => {
    for (const fn of ['employee_documents_board', 'employee_documents_summary',
                      'document_upload']) {
      expect(fnBody(fn), `${fn} بلا منطقة بغداد`)
        .toMatch(/now\(\) AT TIME ZONE 'Asia\/Baghdad'/);
    }
  });

  it('★ ولا CURRENT_DATE عارية في الدوال الجديدة', () => {
    for (const fn of NEW_FNS) {
      expect(fnBody(fn), `${fn} تستعمل CURRENT_DATE`).not.toMatch(/\bCURRENT_DATE\b/);
    }
  });

  it('★★ وتاريخ انتهاء في الماضي مرفوض عند الرفع', () => {
    expect(fnBody('document_upload')).toMatch(/DOCUMENT_EXPIRY_IN_PAST/);
  });

  it('★ والصفحة تعرض الحالة لا تاريخاً مجرَّداً كهرمانيّاً', () => {
    expect(PAGE_CODE).toMatch(/expiryStateLabel/);
    expect(PAGE_CODE).toMatch(/expiryStateTone/);
    expect(PAGE_CODE).toMatch(/daysLeft/);
    // العطل: `{doc.expires_at && <p className="text-amber-600">ينتهي…`
    expect(PAGE_CODE, 'كهرمانيّ ثابت عاد').not.toMatch(/text-amber-600">\s*ينتهي/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★★ العطل ⑪: bucket موجود ورابطٌ موقَّت لا عامّ', () => {
  it('لا أثر لـbucket المعدوم', () => {
    // مسحُ المستودع أظهره في هذا الملف وحده — ولا مايجريشن ينشئه
    expect(PAGE_CODE, "'employee-documents' كـbucket عاد")
      .not.toMatch(/uploadPublic\(\s*'employee-documents'/);
    expect(SVC_CODE).not.toMatch(/uploadPublic/);
  });

  it('★★ الـbucket المستعمل هو الموجود فعلاً في 0005', () => {
    expect(SVC_CODE).toMatch(/DOCUMENTS_BUCKET = 'tawathul'/);
    expect(read('supabase/migrations/0005_tawathul_rls_features.sql'))
      .toMatch(/'tawathul'/);
  });

  it('★★★ والرفع خاص والفتح برابطٍ موقَّت', () => {
    expect(SVC_CODE).toMatch(/storageService\.uploadPrivate\(/);
    expect(SVC_CODE).toMatch(/storageService\.signedUrl\(/);
    expect(PAGE_CODE).toMatch(/openUrl\(/);
    // العطل: <a href={doc.file_url} target="_blank"> على رابطٍ عامّ دائم
    expect(PAGE_CODE, 'رابط مباشر عاد').not.toMatch(/href=\{doc\.file_url\}/);
  });

  it('★ والصفحة لا تلمس storageService مباشرة', () => {
    expect(PAGE_CODE).not.toMatch(/storageService/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★ العطل ⑫: استعلامٌ واحد وترتيبٌ حتميّ', () => {
  it('★★★ ORDER BY حتميّ بمفتاحين (درس 0357)', () => {
    // JOIN … LIMIT 1 بلا ORDER BY = ترتيب غير محدَّد يقلبه فهرسٌ جديد
    expect(fnBody('employee_documents_board'))
      .toMatch(/ORDER BY d\.created_at DESC, d\.id DESC/);
  });

  it('★ والاسم لا يكون فارغاً رغم full_name_ar = NULL لكل موظف', () => {
    const b = fnBody('employee_documents_board');
    expect(b).toMatch(/NULLIF\(btrim\(e\.full_name_ar\), ''\)/);
    expect(b).toMatch(/e\.first_name \|\| ' ' \|\| e\.last_name/);
    expect(b).toMatch(/e\.employee_code/);
  });

  it('★★ والصفحة لا تبني Map في المتصفّح', () => {
    expect(PAGE_CODE).not.toMatch(/new Map<string,\s*EmployeeSummary>/);
    expect(PAGE_CODE).not.toMatch(/employees:\s*empMap/);
    expect(PAGE_CODE).not.toMatch(/orderBy:\s*'full_name_ar'/);
    expect(PAGE_CODE).toMatch(/employeeDocumentsSdk\.board\(/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★★ العزل والحرّاس', () => {
  it('hybrid_gate ما زال RESTRICTIVE — لا PERMISSIVE (درس 0355)', () => {
    // PERMISSIVE تُدمج بـOR فتُلغي عزل المستأجر تماماً
    expect(MIG_STMT, 'سياسة PERMISSIVE جديدة على الجدول')
      .not.toMatch(/CREATE POLICY hybrid_gate_employee_documents/);
  });

  it.each(NEW_FNS)('%s تُرشِّح المستأجر', (fn) => {
    expect(fnBody(fn)).toMatch(/current_user_tenant_id\(\)/);
  });

  it.each(['employee_documents_summary', 'document_upload',
           'document_set_confidential'])('%s تحرس الدور', (fn) => {
    expect(fnBody(fn)).toMatch(/current_user_is_staff\(\)/);
  });

  it('★ اللوح لا يحرس الدور — يُضيّق النتيجة بدلاً منه', () => {
    // الموظف يقرأ وثائقه غير السرّية، فحارس الدور خطأ هنا
    const b = fnBody('employee_documents_board');
    expect(b).toMatch(/v_staff\s+BOOLEAN := public\.current_user_is_staff\(\)/);
    expect(b).not.toMatch(/RAISE EXCEPTION 'غير مصرَّح/);
  });

  it('★★ الكتابة تحتاج auth.uid() صريحاً', () => {
    for (const fn of ['document_upload', 'document_set_confidential']) {
      expect(fnBody(fn)).toMatch(/auth\.uid\(\) IS NULL/);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★ نظافة الطبقة والصفحة', () => {
  it('الخدمة مُصدَّرة من index', () => {
    expect(INDEX).toMatch(/employeeDocumentsSdk/);
    expect(INDEX).toMatch(/from '\.\/EmployeeDocumentsService'/);
  });

  it('الصفحة لا تلمس Supabase', () => {
    expect(PAGE_CODE).not.toMatch(/from '.*supabase/);
    expect(PAGE_CODE).not.toMatch(/supabase\./);
  });

  it('★★ ولا any في الطبقة ولا في الصفحة', () => {
    for (const [name, code] of [['الخدمة', SVC_CODE], ['الصفحة', PAGE_CODE]] as const) {
      expect(code, `as any في ${name}`).not.toMatch(/\bas any\b/);
      expect(code, `: any في ${name}`).not.toMatch(/:\s*any\b/);
      expect(code, `as unknown as في ${name}`).not.toMatch(/as unknown as/);
    }
  });

  it('★ numOrNull يحفظ التمييز بين صفر وغير مُقاس (درس 0353)', () => {
    expect(SVC_CODE).toMatch(/const numOrNull/);
    expect(SVC_CODE).toMatch(/daysLeft:\s*numOrNull/);
    expect(SVC_CODE).toMatch(/fileSize:\s*numOrNull/);
  });

  it('★★ والصفحة تُميّز null عن صفر في العرض', () => {
    expect(PAGE_CODE).toMatch(/daysLeft != null/);
    expect(PAGE_CODE).toMatch(/b == null \? '—'/);
  });

  it('★ أزرار العمل مُعطَّلة أثناء التنفيذ (لا نقرٌ مزدوج)', () => {
    expect(PAGE_CODE).toMatch(/disabled=\{busyId === doc\.id/);
    expect(PAGE_CODE).toMatch(/setSaving\(true\)/);
    expect(PAGE_CODE).toMatch(/setUploading\(true\)/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★ أدوات التحقّق موجودة ومربوطة', () => {
  it.each([
    'tools/dev/verify-employee-documents-0360.sql',
    'tools/dev/verify-employee-documents-0360-rls.sh',
    'tools/dev/_invert_0360.py',
  ])('%s موجود', (p) => {
    expect(existsSync(resolve(root, p))).toBe(true);
  });

  it('★ سكربت العكس يشير إلى مايجريشن 0360 نفسه', () => {
    const inv = read('tools/dev/_invert_0360.py');
    expect(inv).toContain('0360_employee_documents_integrity.sql');
    expect(inv).toContain('verify-employee-documents-0360.sql');
    expect(inv).toContain('verify-employee-documents-0360-rls.sh');
  });

  it('★★ والمسبار حُذف قبل الكوميت (لا يبقى في المستودع)', () => {
    expect(existsSync(resolve(root, 'tools/dev/_probe_0360.sql'))).toBe(false);
  });
});
