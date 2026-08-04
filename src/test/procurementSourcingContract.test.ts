/**
 * عقد الوحدة 03 لبوابة المشتريات — التوريد الاستراتيجي (RFx والمزادات العكسية)
 *
 * تحقق ثابت من: بنية RFx، تقييم MECCA، محرك المزادات،
 * ونظافة الواجهة من prompt/confirm/as any.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const SOURCING = read('supabase/migrations/0184_procurement_sourcing_rfx_auction.sql');
const COMPLETION = read('supabase/migrations/0194_procurement_sourcing_completion.sql');
const ADVANCED = read('supabase/migrations/0195_procurement_sourcing_advanced_completion.sql');
const NAV = read('src/pages/app/procurement/shared/ProcurementUnitNav.tsx');
const DETAIL = read('src/pages/app/procurement/sourcing/RfxDetailPage.tsx');
const EVENTS = read('src/pages/app/procurement/sourcing/SourcingEventsPage.tsx');
const AUCTION = read('src/pages/app/procurement/sourcing/AuctionLivePage.tsx');
const LAYOUT = read('src/pages/app/procurement/sourcing/SourcingLayout.tsx');

describe('المشتريات 03 — بنية RFx', () => {
  it('جداول التوريد موجودة', () => {
    const all = SOURCING + COMPLETION + ADVANCED;
    for (const t of [
      'sourcing_events', 'rfx_line_items', 'rfx_supplier_invitations',
      'supplier_bids', 'procurement_auctions', 'auction_bids',
      'rfx_evaluation_criteria', 'rfx_bid_scorecards', 'rfx_templates', 'rfx_questions',
    ]) {
      expect(all, `${t} مفقود`).toContain(`CREATE TABLE IF NOT EXISTS public.${t}`);
    }
  });

  it('أنواع الأحداث الأربعة مدعومة', () => {
    expect(SOURCING).toContain("type IN ('RFI','RFQ','RFP','auction')");
  });

  it('طرق التقييم تشمل MECCA و TCO', () => {
    // العمود يُضاف في 0194 عبر ALTER TABLE
    expect(COMPLETION).toContain("evaluation_method IN ('price_only','tco','mecca','auction')");
  });

  it('السعر الفعلي محسوب تلقائياً من الخصم', () => {
    expect(SOURCING).toContain('effective_price NUMERIC(16,2) GENERATED ALWAYS AS');
    expect(SOURCING).toContain('total_price * (1 - COALESCE(discount_percent,0)/100)');
  });
});

describe('المشتريات 03 — تقييم MECCA', () => {
  it('score_bid_mecca موجودة وتحسب بالأوزان', () => {
    expect(ADVANCED).toContain('CREATE OR REPLACE FUNCTION public.score_bid_mecca');
    expect(ADVANCED).toContain('v_criterion.weight_percent');
    expect(ADVANCED).toContain('v_total / v_weight_sum * 100');
  });

  it('ترفض الدرجات خارج النطاق وغياب المعايير', () => {
    expect(ADVANCED).toContain('INVALID_SCORE_FOR_');
    expect(ADVANCED).toContain('NO_EVALUATION_CRITERIA');
  });

  it('تُسجَّل في سجل تدقيق الحدث', () => {
    expect(ADVANCED).toContain('log_rfx_audit');
  });
});

describe('المشتريات 03 — محرك المزادات', () => {
  it('دوال المزاد موجودة', () => {
    const all = SOURCING + COMPLETION + ADVANCED;
    for (const fn of ['start_procurement_auction', 'place_auction_bid', 'close_procurement_auction']) {
      expect(all).toContain(fn);
    }
  });

  it('المزاد العكسي يرفض عرضاً أعلى من الحالي', () => {
    const all = SOURCING + COMPLETION + ADVANCED;
    expect(all).toContain('BID_MUST_BE_LOWER_THAN_CURRENT');
  });
});

describe('المشتريات 03 — الواجهات', () => {
  it('كل صفحات التوريد خالية من الأنماط الممنوعة', () => {
    for (const [name, src] of [
      ['detail', DETAIL], ['events', EVENTS], ['auction', AUCTION],
    ] as const) {
      expect(src, `${name} يحوي prompt`).not.toMatch(/\bprompt\(/);
      expect(src, `${name} يحوي confirm`).not.toMatch(/\bconfirm\(/);
      expect(src, `${name} يحوي as any`).not.toMatch(/as any/);
    }
  });

  it('الترسية عبر نافذة بسبب إلزامي', () => {
    expect(DETAIL).toContain('awardBidId');
    expect(DETAIL).toContain('سبب الترسية مطلوب');
  });

  it('تقييم MECCA عبر نموذج لا سلسلة prompt', () => {
    expect(DETAIL).toContain('openScoreDialog');
    expect(DETAIL).toContain('submitScores');
    expect(DETAIL).toContain('scoreValues');
  });

  it('الواجهة تتحقق من نطاق الدرجة قبل الإرسال', () => {
    expect(DETAIL).toContain('c.max_score');
    expect(DETAIL).toContain('يجب أن تكون بين 0');
  });

  it('التخطيط يحوي شريط الوحدة', () => {
    expect(LAYOUT).toContain('ProcurementUnitNav');
    expect(LAYOUT).toContain('unit="sourcing"');
  });

  it('وحدة التوريد معرّفة في شريط التنقل', () => {
    expect(NAV).toContain('sourcing: { title:');
    expect(NAV).toContain('/app/procurement/sourcing');
  });
});
