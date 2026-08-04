/**
 * اختبارات أمان وصحة التصدير.
 *
 * تغطي نقصين حقيقيين كانا في التصدير القائم بالمشتريات:
 *   1) غياب BOM → العربية مشوّهة في Excel على ويندوز.
 *   2) غياب تحييد الصيغ → CSV/Formula injection من بيانات يدخلها
 *      الموردون عبر البوابة الخارجية (مُدخلات غير موثوقة).
 */
import { describe, it, expect } from 'vitest';
import { buildCsv, sanitizeCell, type ExportColumn } from '../utils/dataExport';

type Row = { name: string; amount: number | null };

const columns: ExportColumn<Row>[] = [
  { header: 'المورد', value: r => r.name },
  { header: 'المبلغ', value: r => r.amount },
];

describe('sanitizeCell — الحماية من حقن الصيغ', () => {
  it('يحيّد الخلايا التي تبدأ بـ = (صيغة)', () => {
    expect(sanitizeCell('=1+1')).toBe("'=1+1");
  });

  it('يحيّد هجوم HYPERLINK الشائع', () => {
    const attack = '=HYPERLINK("http://evil.test","اضغط")';
    expect(sanitizeCell(attack).startsWith("'=")).toBe(true);
  });

  it('يحيّد هجوم تنفيذ الأوامر cmd', () => {
    expect(sanitizeCell("=cmd|'/c calc'!A1").startsWith("'")).toBe(true);
  });

  it('يحيّد + و - و @ و TAB و CR', () => {
    for (const trigger of ['+', '-', '@', '\t', '\r']) {
      expect(sanitizeCell(`${trigger}payload`).startsWith("'")).toBe(true);
    }
  });

  it('لا يمس النصوص العادية — لا تشويه للبيانات السليمة', () => {
    expect(sanitizeCell('شركة الفجر للتوريدات')).toBe('شركة الفجر للتوريدات');
    expect(sanitizeCell('PO-2026-001')).toBe('PO-2026-001');
  });

  it('الأرقام الموجبة تمر كما هي، والسالبة تُحيَّد', () => {
    // 1500 آمن؛ أما -1500 فيبدأ بـ '-' وهو محفّز صيغة
    expect(sanitizeCell(1500)).toBe('1500');
    expect(sanitizeCell(-1500)).toBe("'-1500");
  });

  it('يعالج null و undefined كنص فارغ لا كـ "null"', () => {
    expect(sanitizeCell(null)).toBe('');
    expect(sanitizeCell(undefined)).toBe('');
  });
});

describe('buildCsv — الترميز والبنية', () => {
  it('يبدأ بـ BOM حتى تظهر العربية صحيحة في Excel', () => {
    const csv = buildCsv(columns, [{ name: 'مورد', amount: 10 }]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it('يكتب صف العناوين بالعربية', () => {
    const csv = buildCsv(columns, []);
    expect(csv).toContain('"المورد"');
    expect(csv).toContain('"المبلغ"');
  });

  it('يضاعف علامات الاقتباس داخل القيم (RFC 4180)', () => {
    const csv = buildCsv(columns, [{ name: 'شركة "الأمل"', amount: 1 }]);
    expect(csv).toContain('"شركة ""الأمل"""');
  });

  it('الفاصلة داخل القيمة لا تكسر الأعمدة', () => {
    const csv = buildCsv(columns, [{ name: 'بغداد، العراق', amount: 5 }]);
    const dataLine = csv.split('\r\n')[1];
    // القيمة مقتبسة كاملة → عمودان فقط رغم وجود فاصلة داخلية
    expect(dataLine).toBe('"بغداد، العراق","5"');
  });

  it('يستخدم CRLF فاصلاً للأسطر', () => {
    const csv = buildCsv(columns, [
      { name: 'أ', amount: 1 },
      { name: 'ب', amount: 2 },
    ]);
    expect(csv.split('\r\n')).toHaveLength(3); // عناوين + صفان
  });

  it('يحيّد الصيغ داخل مخرجات CSV النهائية لا في sanitizeCell فقط', () => {
    const csv = buildCsv(columns, [{ name: '=SUM(A1:A9)', amount: 0 }]);
    expect(csv).toContain('"\'=SUM(A1:A9)"');
    expect(csv).not.toContain('"=SUM(A1:A9)"');
  });

  it('قائمة فارغة تُنتج عناوين فقط بلا انهيار', () => {
    const csv = buildCsv(columns, []);
    expect(csv.split('\r\n')).toHaveLength(1);
  });

  it('القيم الفارغة تُصدَّر كحقل فارغ', () => {
    const csv = buildCsv(columns, [{ name: 'مورد', amount: null }]);
    expect(csv.split('\r\n')[1]).toBe('"مورد",""');
  });
});
