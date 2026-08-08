/**
 * ════════════════════════════════════════════════════════════════
 *  hrCommunicationContract.test.ts — عقد صندوق بريد HR (0371)
 *
 *  ★★★ فحصٌ **ثابت** على النصّ: لا Postgres ولا متصفّح.
 *      السلوك يُثبته `verify-hr-communication-0371.sql` (69 تأكيداً)
 *      و`-rls.sh` (26 فحصاً بدور `authenticated` حقيقيّ)
 *      و`_invert_0371.py` (25/25 عكساً · صفر ناجٍ).
 * ════════════════════════════════════════════════════════════════
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

const MIG   = read('supabase/migrations/0371_hr_communication_integrity.sql');
const SDK   = read('src/services/sdk/HrInboxService.ts');
const PAGE  = read('src/pages/hr/HRCommunicationPage.tsx');
const INDEX = read('src/services/sdk/index.ts');

const migBody = MIG.replace(/^\s*--.*$/gm, '');
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const pageBody = strip(PAGE);
const sdkBody  = strip(SDK);

/** ★ النهاية `$$;` لا `\n$$;` (درس 0365 — أسقط 14 تأكيداً) */
function fnBody(name: string): string {
  const re = new RegExp(
    `CREATE (?:OR REPLACE )?FUNCTION public\\.${name}\\b[\\s\\S]*?\\$\\$;`, 'm',
  );
  const m = migBody.match(re);
  expect(m, `الدالة ${name} غير موجودة`).toBeTruthy();
  const body = (m as RegExpMatchArray)[0];
  expect(body.length, `جسم ${name} قصيرٌ مريب`).toBeGreaterThan(150);
  return body;
}

// ════════════════════════════════════════════════════════════════
describe('0371 — ★★★★ العطل ①: الاسم الفارغ', () => {
  it('★★★★ FK إلى profiles صار موجوداً (كان صفراً)', () => {
    expect(migBody).toContain('fk_hr_message_sender_tenant');
    expect(migBody).toContain('REFERENCES public.profiles (id, tenant_id)');
  });

  it('★★★★ واللوح يبني الاسم من profiles بتسلسلٍ لا يُنتج فراغاً', () => {
    const body = fnBody('hr_message_board');
    expect(body).toContain('sp.full_name');
    expect(body).toContain('e.employee_code');
    expect(body).toContain('غير محدَّد');
  });

  it('★★★ والصفحة لا تقرأ profiles(...) عبر PostgREST', () => {
    expect(pageBody).not.toContain('profiles(');
    expect(pageBody).not.toContain('findAllWithProfiles');
    expect(sdkBody).not.toContain('findAllWithProfiles');
  });

  it('★★★★ ولا `?? ""` يُخفي غيابَ الاسم في العرض', () => {
    // ★ تصحيحُ تأكيدٍ كتبتُه أوسع من قصده: كان يمسك
    //   `setReplyText(selected.reply ?? '')` وهي تهيئةُ مربّع نصٍّ
    //   مشروعة. محلُّ الخطر ما يُعرض داخل JSX.
    const jsx = pageBody.match(/\{[^{}]*\?\?\s*(''|"")\s*\}/g) ?? [];
    expect(jsx, `عرضٌ يسقط إلى فراغ: ${jsx.join(' · ')}`).toHaveLength(0);
    // ★ والاسمُ يأتي من اللوح مباشرةً — لا احتياطَ فارغاً
    expect(pageBody).toContain('msg.senderName');
    expect(pageBody).not.toMatch(/senderName\s*\?\?/);
    expect(pageBody).not.toMatch(/senderDept\s*\?\?/);
  });

  it('★ والمحفّز يملأ sender_id تلقائياً', () => {
    const body = fnBody('tg_hr_message_guard');
    expect(body).toContain('NEW.sender_id');
    expect(body).toContain('e.user_id');
  });
});

// ════════════════════════════════════════════════════════════════
describe('0371 — ★★★★ العطل ②: الأزرار الصامتة', () => {
  it('★★★★ كلُّ زرٍّ في الصفحة له onClick', () => {
    const buttons = pageBody.match(/<button[\s\S]*?>/g) ?? [];
    expect(buttons.length, 'لا أزرار').toBeGreaterThan(3);
    for (const b of buttons) {
      expect(b, `زرٌّ بلا onClick: ${b.slice(0, 70)}`).toContain('onClick');
    }
  });

  it('★★★ والإجراءات الثلاثة موصولةٌ بالقاعدة', () => {
    expect(pageBody).toContain('hrInboxSdk.reply(');
    expect(pageBody).toContain('hrInboxSdk.close(');
    expect(pageBody).toContain('hrInboxSdk.archive(');
  });
});

// ════════════════════════════════════════════════════════════════
describe('0371 — ★★★ العطل ③: اتّساق الردّ', () => {
  it('★★★★ قيدٌ يمنع «مردودٌ عليها» بلا نصٍّ ورادٍّ ولحظة', () => {
    const chk = migBody.match(/chk_hr_message_reply_complete[\s\S]*?END \$\$;/);
    expect(chk).toBeTruthy();
    const body = (chk as RegExpMatchArray)[0];
    expect(body).toContain("status = 'replied'");
    expect(body).toContain('replied_by IS NOT NULL');
    expect(body).toContain('replied_at IS NOT NULL');
    // ★ والعكس: نصُّ ردٍّ بحالةٍ أخرى ممنوع
    expect(body).toContain('reply IS NULL');
  });

  it('★★★ والمحفّز يُفرغ الحقول في UPDATE وحده — لا في INSERT', () => {
    const body = fnBody('tg_hr_message_guard');
    // ★ درس 0369: الإفراغ في INSERT يبتلع التناقض بدل أن يرفضه
    const upd = body.slice(body.lastIndexOf("IF TG_OP = 'UPDATE' THEN"));
    expect(upd).toContain("NEW.status <> 'replied'");
    expect(upd).toContain('NEW.reply       := NULL;');
  });
});

// ════════════════════════════════════════════════════════════════
describe('0371 — ★★★ العطل ④: الرادُّ في profiles', () => {
  it('★★★★ FK الرادّ صار إلى profiles مركَّباً', () => {
    expect(migBody).toContain('fk_hr_message_replier_tenant');
    expect(migBody).toContain('FOREIGN KEY (replied_by, tenant_id)');
  });

  it('★★★ ولا FK قديمٌ إلى employees باقٍ', () => {
    expect(migBody).toContain(
      'DROP CONSTRAINT IF EXISTS hr_messages_replied_by_fkey');
  });
});

// ════════════════════════════════════════════════════════════════
describe('0371 — ★★★ العطل ⑤: الأرشفة بديلُ الحذف', () => {
  it('★★★ محفّزٌ يمنع الحذف النهائيّ', () => {
    expect(migBody).toContain('trg_block_hr_message_delete');
    expect(migBody).toContain('HR_MESSAGE_DELETE_BLOCKED');
  });

  it('★★★ ولا سياسة DELETE', () => {
    expect(migBody).toContain(
      'DROP POLICY IF EXISTS kyvzon_hr_messages_delete ON public.hr_messages');
    expect(migBody).not.toMatch(/CREATE POLICY \w*hr_messages\w*\s+FOR DELETE/);
  });

  it('★★ ولا صلاحية DELETE لـauthenticated', () => {
    expect(migBody).toContain('REVOKE DELETE ON public.hr_messages FROM authenticated');
  });

  it('★★★ والأرشفة تشترط سبباً', () => {
    expect(fnBody('hr_message_archive')).toContain('HR_MESSAGE_NO_REASON');
    const chk = migBody.match(/chk_hr_message_archive_complete[\s\S]*?END \$\$;/);
    expect(chk).toBeTruthy();
    expect((chk as RegExpMatchArray)[0]).toContain('archive_reason');
  });

  it('★ والصفحة تعرض الأرشيف ولا تحذف', () => {
    expect(pageBody).toContain('showArchive');
    expect(pageBody).not.toMatch(/\.delete\(/);
    expect(pageBody).not.toContain('حذف نهائي');
  });
});

// ════════════════════════════════════════════════════════════════
describe('0371 — العطلان ⑥/⑦: النصوص والعبور', () => {
  it('★★ قيدٌ يمنع النصوص من مسافات', () => {
    const chk = migBody.match(/chk_hr_message_text_present[\s\S]*?END \$\$;/);
    expect(chk).toBeTruthy();
    const body = (chk as RegExpMatchArray)[0];
    expect(body).toContain('btrim(subject)');
    expect(body).toContain('btrim(message)');
  });

  it('★★★ وكلُّ FK مركَّبٌ بالمستأجر', () => {
    for (const c of ['employee', 'sender', 'replier', 'case', 'archiver', 'closer']) {
      expect(migBody, `fk_hr_message_${c}_tenant غائب`)
        .toContain(`fk_hr_message_${c}_tenant`);
    }
    expect(migBody).toContain('FOREIGN KEY (employee_id, tenant_id)');
    expect(migBody).toContain('FOREIGN KEY (case_id, tenant_id)');
  });
});

// ════════════════════════════════════════════════════════════════
describe('0371 — ★★ العطل ⑨: tenant_id NOT NULL', () => {
  it('★★★ العمود صار NOT NULL', () => {
    expect(migBody).toContain(
      'ALTER TABLE public.hr_messages ALTER COLUMN tenant_id SET NOT NULL');
  });

  it('★ والمايجريشن يملؤه من الموظف قبل الفرض', () => {
    expect(migBody).toMatch(/UPDATE public\.hr_messages m[\s\S]*?SET tenant_id = e\.tenant_id/);
  });
});

// ════════════════════════════════════════════════════════════════
describe('0371 — ★★★★ العطل ⑩: الاشتراك اللحظيّ', () => {
  it('★★★★ الصفحة لا تلمس supabase البتّة', () => {
    expect(pageBody).not.toContain('supabase');
    expect(pageBody).not.toContain('removeChannel');
    expect(pageBody).not.toContain('postgres_changes');
  });

  it('★★★ ولا `channel(` ولا `subscribe(`', () => {
    expect(pageBody).not.toContain('.channel(');
    expect(pageBody).not.toContain('.subscribe(');
  });
});

// ════════════════════════════════════════════════════════════════
describe('0371 — ★★★★ العطل ⑪: الردُّ يصل الموظف', () => {
  it('★★★★ عمود case_id يربط الرسالة بحالتها', () => {
    expect(migBody).toContain('ADD COLUMN IF NOT EXISTS case_id');
    expect(migBody).toContain('REFERENCES public.hr_cases (id, tenant_id)');
  });

  it('★★★★ ودالّة الردّ تُحدّث hr_cases', () => {
    const body = fnBody('hr_message_reply');
    expect(body).toContain('UPDATE public.hr_cases');
    expect(body).toContain('first_response_at');
  });

  it('★★★ والمفردة in_review لا in_progress (hr_cases_status_check)', () => {
    const body = fnBody('hr_message_reply');
    expect(body).toContain("'in_review'");
    expect(body).not.toContain("'in_progress'");
  });

  it('★★★ والملخّص يعدّ الرسائل غير المرتبطة', () => {
    const body = fnBody('hr_message_summary');
    expect(body).toContain('m.case_id IS NULL');
  });

  it('★★★★ والصفحة تُحذّر حين لا حالةَ مرتبطة', () => {
    expect(pageBody).toContain('unlinked');
    expect(pageBody).toContain('بلا حالة');
    expect(pageBody).toContain('caseId');
  });
});

// ════════════════════════════════════════════════════════════════
describe('0371 — الجدار', () => {
  it('★★★ البوّابة الهجينة RESTRICTIVE على وحدة hr', () => {
    const pol = migBody.match(
      /CREATE POLICY hybrid_gate_hr_messages[\s\S]*?WITH CHECK[^;]*;/);
    expect(pol).toBeTruthy();
    const body = (pol as RegExpMatchArray)[0];
    expect(body).toContain('AS RESTRICTIVE');
    expect(body).toContain("hybrid_allows_module('hr')");
  });

  it('★★★ REVOKE … FROM anon على الدوال الستّ', () => {
    for (const fn of ['hr_message_board', 'hr_message_summary', 'hr_message_reply',
                      'hr_message_close', 'hr_message_archive', 'hr_message_mark_read']) {
      expect(migBody, `${fn} بلا REVOKE من anon`)
        .toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\b[^;]*FROM anon;`));
    }
  });

  it('★★★ وعلى الجدول', () => {
    expect(migBody).toContain('REVOKE ALL ON public.hr_messages FROM anon');
  });

  it('★★★★ الدوال الستّ SECURITY INVOKER — لولاها لتجاوزت RLS', () => {
    for (const fn of ['hr_message_board', 'hr_message_summary', 'hr_message_reply',
                      'hr_message_close', 'hr_message_archive', 'hr_message_mark_read']) {
      expect(fnBody(fn), `${fn} ليست INVOKER`).toContain('SECURITY INVOKER');
      expect(fnBody(fn), `${fn} صارت DEFINER`).not.toContain('SECURITY DEFINER');
    }
  });

  it('★★★ وحارسُ الدور في كلِّ دالةٍ تكتب أو تعرض الوارد', () => {
    for (const fn of ['hr_message_board', 'hr_message_summary', 'hr_message_reply',
                      'hr_message_close', 'hr_message_archive', 'hr_message_mark_read']) {
      expect(fnBody(fn), `${fn} بلا حارس دور`).toContain('HR_MESSAGE_FORBIDDEN');
    }
  });

  it('★★★ الترتيب مذيَّلٌ بمُميِّزٍ فريد', () => {
    expect(fnBody('hr_message_board')).toContain('ORDER BY m.created_at DESC, m.id');
  });

  it('★★★ وحدُّ الصفوف محصور', () => {
    expect(fnBody('hr_message_board'))
      .toContain('LEAST(GREATEST(COALESCE(p_limit, 200), 1), 500)');
  });
});

// ════════════════════════════════════════════════════════════════
describe('0371 — طبقة SDK والصفحة', () => {
  it('★★★ لا نوعَ any', () => {
    for (const [name, body] of [['الصفحة', pageBody], ['الخدمة', sdkBody]] as const) {
      expect(body, `as any في ${name}`).not.toMatch(/\bas any\b/);
      expect(body, `: any في ${name}`).not.toMatch(/:\s*any\b/);
      expect(body, `any[] في ${name}`).not.toMatch(/any\[\]/);
    }
  });

  it('★★★ ولا confirm/prompt/alert', () => {
    for (const f of ['confirm(', 'prompt(', 'alert(']) {
      expect(pageBody, `${f} ممنوع`).not.toContain(f);
    }
  });

  it('★★ الخدمة مُصدَّرةٌ من index', () => {
    expect(INDEX).toContain('hrInboxSdk');
    expect(INDEX).toContain("from './HrInboxService'");
  });

  it('★★ والصفحة تستوردها من الحزمة لا من الملفّ', () => {
    expect(pageBody).toContain("from '../../services/sdk'");
    expect(pageBody).not.toContain('HrInboxService');
  });

  it('★★★ ولا تستعمل messageService القديم', () => {
    expect(pageBody).not.toContain('messageService');
    expect(pageBody).not.toContain('HrMessageRecord');
  });

  it('★★ المفردات مطابِقةٌ لقيود القاعدة', () => {
    for (const s of ['new', 'read', 'replied', 'closed']) {
      expect(sdkBody, `الحالة ${s} غائبة`).toContain(`'${s}'`);
    }
    for (const p of ['low', 'normal', 'urgent']) {
      expect(sdkBody, `الأولوية ${p} غائبة`).toContain(`'${p}'`);
    }
  });

  it('★★★ والخطأ لا يُبتلع صامتاً', () => {
    // ★ الخدمة القديمة: catch { console.error(…); return []; }
    expect(sdkBody).not.toMatch(/catch[\s\S]{0,80}return \[\];/);
    expect(sdkBody).toContain('SdkError.fromSupabaseError');
  });

  it('★ ولا console.error في الصفحة', () => {
    expect(pageBody).not.toContain('console.error');
  });
});
