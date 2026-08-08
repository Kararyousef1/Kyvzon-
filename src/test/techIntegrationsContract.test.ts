/**
 * ════════════════════════════════════════════════════════════════
 *  techIntegrationsContract.test.ts
 *
 *  عقد التكاملات والصادرات وتنبيه الأخطاء الحرجة (migration 0331).
 *
 *  ★ فحص ثابت. الإثبات السلوكي في:
 *      tools/dev/verify-tech-integrations-0331.sql   35 تأكيداً
 * ════════════════════════════════════════════════════════════════
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

const M0331 = read('supabase/migrations/0331_tech_integrations_exports_alerts.sql');
const VERIFY = read('tools/dev/verify-tech-integrations-0331.sql');
const SVC = read('src/services/sdk/TechIntegrationsService.ts');
const PAGE = read('src/pages/techportal/pages/IntegrationsPage.tsx');
const ROUTER = read('src/router/AppRouter.tsx');
const SIDEBAR = read('src/shared/components/dashboard/Sidebar.tsx');
const CATALOG = read('src/pages/hybridportal/hybridPagesCatalog.ts');
const PERMS = read('src/core/constants/permissions.ts');
const LEGACY = read('src/router/legacyRedirect.ts');
const SDK_INDEX = read('src/services/sdk/index.ts');

function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/^\s*--.*$/gm, '');
}

describe('0331 — صحّة التكاملات', () => {
  const body = (() => {
    const s = M0331.indexOf('CREATE FUNCTION public.tech_integrations_health');
    const e = M0331.indexOf('COMMENT ON FUNCTION public.tech_integrations_health');
    return M0331.slice(s, e);
  })();

  it('★ SECURITY INVOKER — الجداول المالية محميّة بسياساتها', () => {
    expect(body).toMatch(/SECURITY INVOKER/);
    expect(body).not.toMatch(/SECURITY DEFINER/);
  });

  it('★ الموصّل الموقوف لا يُعدّ معطوباً (لا تنبيه دائم)', () => {
    expect(body).toMatch(/COALESCE\(c\.status,'active'\) <> 'active'/);
  });

  it('يعدّ الفاشلة والمعلَّقة خلال 24 ساعة', () => {
    expect(body).toMatch(/ev\.status = 'failed'/);
    expect(body).toMatch(/ev\.status = 'received'/);
    expect(body).toMatch(/INTERVAL '24 hours'/);
  });

  it('يحترم عزل المستأجر', () => {
    expect(body).toMatch(/c\.tenant_id = v_tenant/);
    expect(body).toMatch(/ev\.tenant_id = v_tenant/);
  });
});

describe('0331 — أحداث التكامل والصادرات', () => {
  it('★ رسالة الخطأ تصل الواجهة (كانت تُكتب ولا تُقرأ)', () => {
    const s = M0331.indexOf('CREATE FUNCTION public.tech_integration_events');
    const e = M0331.indexOf('COMMENT ON FUNCTION public.tech_integration_events');
    expect(M0331.slice(s, e)).toMatch(/ev\.error_message/);
  });

  it('★ الحدّ والإزاحة مقصوصان', () => {
    expect(M0331).toMatch(/GREATEST\(1, LEAST\(COALESCE\(p_limit, 100\), 500\)\)/);
    expect(M0331).toMatch(/GREATEST\(0, COALESCE\(p_offset, 0\)\)/);
  });

  /**
   * ★ تصحيح 0332: `tech_export_log` و`tech_export_summary` أُعيد بناؤهما
   *   في 0332 فوق خمسة مصادر، وتوقيعهما تغيّر. تأكيدات الصادرات انتقلت
   *   إلى techDataExportsContract.test.ts — إبقاؤها هنا كان سيقيس نصّاً
   *   مهجوراً ويمرّ دائماً.
   */
  it('★ الصادرات لم تعد مسؤولية 0331 (أُعيد بناؤها في 0332)', () => {
    expect(existsSync(resolve(root,
      'supabase/migrations/0332_tech_unified_exports_and_webhooks.sql'))).toBe(true);
  });

  it('نافذة الملخّص مقصوصة', () => {
    expect(M0331).toMatch(/GREATEST\(1, LEAST\(COALESCE\(p_days, 30\), 365\)\)/);
  });
});

describe('0331 — تنبيه الأخطاء الحرجة', () => {
  const body = (() => {
    const s = M0331.indexOf('CREATE FUNCTION public.notify_critical_error');
    const e = M0331.indexOf('COMMENT ON FUNCTION public.notify_critical_error');
    return M0331.slice(s, e);
  })();

  it('VOLATILE — يكتب (درس 0320)', () => {
    expect(body).toMatch(/\bVOLATILE\b/);
  });

  it('★ الحرجة وحدها تُشعِر (إشعار كل خطأ يُدرِّب على التجاهل)', () => {
    expect(body).toMatch(/COALESCE\(v_row\.severity, ''\) <> 'critical'/);
  });

  it('★ يمرّ عبر notify_user (يرث حراستها)', () => {
    expect(body).toMatch(/public\.notify_user\(/);
    expect(codeOnly(body)).not.toMatch(/INSERT INTO public\.notifications/);
  });

  it('يستهدف تقنيي الشركة فقط', () => {
    expect(body).toMatch(/'it_admin', 'tech', 'admin'/);
    expect(body).toMatch(/p\.tenant_id = v_row\.tenant_id/);
  });

  it('الرابط يوصل لصفحة الأخطاء', () => {
    expect(body).toMatch(/'\/app\/tech-portal\/error-logs'/);
  });

  it('★ محفّز AFTER INSERT على error_logs', () => {
    expect(M0331).toMatch(
      /CREATE TRIGGER trg_notify_critical_error\s+AFTER INSERT ON public\.error_logs/,
    );
  });
});

describe('0331 — الصلاحيات وقابلية إعادة التشغيل', () => {
  it.each([
    'tech_integrations_health()',
    'tech_integration_events(TEXT,INTEGER,INTEGER)',
    'tech_export_summary(INTEGER)',
    'notify_critical_error(UUID)',
  ])('%s محجوبة عن anon وممنوحة لـauthenticated', (sig) => {
    const esc = sig.replace(/[()]/g, (c) => `\\${c}`);
    expect(M0331).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${esc} FROM anon`));
    expect(M0331).toMatch(
      new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${esc}\\s*\\n?\\s*TO authenticated`),
    );
  });

  it('★ DROP في المقدّمة', () => {
    const dropAt = M0331.indexOf('DROP FUNCTION IF EXISTS public.tech_integrations_health');
    const createAt = M0331.indexOf('CREATE FUNCTION public.tech_integrations_health');
    expect(dropAt).toBeGreaterThan(-1);
    expect(dropAt).toBeLessThan(createAt);
  });
});

describe('0331 — طبقة SDK والصفحة', () => {
  it('يمرّ عبر RPC لا Supabase مباشرة', () => {
    for (const fn of ['tech_integrations_health', 'tech_integration_events',
                      'tech_export_log', 'tech_export_summary']) {
      expect(SVC).toContain(`rpc('${fn}'`);
    }
    expect(codeOnly(SVC)).not.toMatch(/\.from\(/);
  });

  it('الصفحة موجودة وتستعمل الخدمة', () => {
    expect(existsSync(resolve(root, 'src/pages/techportal/pages/IntegrationsPage.tsx'))).toBe(true);
    expect(PAGE).toMatch(/techIntegrationsService\./);
    expect(codeOnly(PAGE)).not.toMatch(/supabase/);
  });

  it('★ بلا confirm/alert/prompt ولا محاكاة ولا as any', () => {
    const code = codeOnly(PAGE);
    expect(code).not.toMatch(/(?<![.\w])(confirm|alert|prompt)\s*\(/);
    expect(code).not.toMatch(/Math\.random/);
    expect(code).not.toMatch(/\bas any\b/);
    expect(code).not.toMatch(/\.delete\(\)/);
  });

  it('★ حالات فارغة مفسَّرة لا شاشة بيضاء', () => {
    expect(PAGE).toMatch(/لا موصّلات تكامل مُعرَّفة/);
    expect(PAGE).toMatch(/لا صادرات مُسجَّلة/);
  });

  it('★ لا إيحاء بنطاق المنصة', () => {
    expect(PAGE).not.toMatch(/للمنصة|كل الشركات|جميع الشركات/);
    expect(PAGE).toMatch(/بشركتك|لشركتك/);
  });

  it('مُسجَّل في فهرس SDK', () => {
    expect(SDK_INDEX).toMatch(/export \{ techIntegrationsService \}/);
  });
});

describe('0331 — التسجيل في المواضع الستة', () => {
  it('tech-integrations مُسجَّل في كل المواضع', () => {
    expect(ROUTER).toMatch(/path="integrations"/);
    expect(SIDEBAR).toContain("id: 'tech-integrations'");
    expect(SIDEBAR).toContain("'tech-integrations': 'tech_portal'");
    expect(CATALOG).toContain("id: 'tech-integrations'");
    expect(PERMS).toContain("'tech-integrations',");
    expect(LEGACY).toContain("'tech-integrations':");
  });

  it('★ في PERMISSION_KEYS (وإلا رفضه tsc)', () => {
    const s = PERMS.indexOf("'tech-portal',");
    expect(PERMS.slice(s, s + 500)).toContain("'tech-integrations'");
  });

  it('أيقونة Plug مستوردة في الملفين', () => {
    for (const src of [SIDEBAR, CATALOG]) {
      const head = src.slice(0, src.indexOf("from 'lucide-react'"));
      expect(head).toMatch(/\bPlug\b/);
    }
  });
});

describe('0331 — الاختبار السلوكي', () => {
  it('يوثّق العدد الحقيقي ولا تأكيدات ميتة', () => {
    expect(VERIFY).toMatch(/verify-0331: %\/35 تأكيداً ناجحاً/);
    expect(VERIFY).not.toMatch(/ASSERT[^;]*\bOR TRUE\b/);
  });

  it('★ يحرس نفسه ضدّ التأكيد الميت في 2.6', () => {
    // 2.6b يتحقّق أن الموصّل الموقوف فيه فشل فعلاً
    expect(VERIFY).toMatch(/2\.6b التأكيد أعلاه ميت/);
  });

  it('★ يفحص أن الخطأ المنخفض لا يُشعِر', () => {
    expect(VERIFY).toMatch(/خطأ منخفض أشعر/);
    expect(VERIFY).toMatch(/ضجيج يُدرَّب على تجاهله/);
  });

  it('★ يفحص عزل الإشعارات', () => {
    expect(VERIFY).toMatch(/تسرّب %s إشعاراً لشركة أخرى/);
  });

  /**
   * ★ تصحيح 0332: تأكيد عزل الصادرات كان هنا ويقيس
   *   `tech_export_log(INTEGER,INTEGER)`. الدالة أُعيد بناؤها فوق خمسة
   *   مصادر وتوقيعها تغيّر، والتأكيد انتقل إلى verify-tech-exports-0332.
   *   ما يبقى هنا: حراسة اختفاء التوقيع القديم فعلاً.
   */
  it('★★ يحرس اختفاء التوقيع القديم لا يقيس نصّاً مهجوراً', () => {
    expect(VERIFY).toMatch(/التوقيع القديم tech_export_log\(int,int\) ما زال موجوداً/);
    expect(VERIFY).toMatch(/التوقيع الموحّد الجديد مفقود/);
    expect(VERIFY).not.toMatch(/tech_export_log\(100,0\)/);
  });

  it('يوثّق القيود المُحقَّقة', () => {
    expect(VERIFY).toMatch(/source_system ∈ procurement/);
    expect(VERIFY).toMatch(/finance_integration_events NOT NULL/);
  });
});
