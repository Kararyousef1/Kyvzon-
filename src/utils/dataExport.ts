/**
 * dataExport — تصدير بيانات آمن (CSV / Excel) بدعم كامل للعربية.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * لماذا هذا الملف؟ مشكلتان حقيقيتان في التصديرات القائمة:
 *
 * 1) العربية مشوّهة في Excel:
 *    التصدير في SpendAnalyticsPage كان ينشئ Blob بلا BOM:
 *      new Blob([csv], { type: 'text/csv;charset=utf-8' })
 *    Excel على ويندوز يفترض الترميز المحلي (windows-1256) ما لم يجد
 *    BOM (\uFEFF) → كل النصوص العربية تظهر رموزاً.
 *
 * 2) ثغرة CSV / Formula Injection:
 *    خلية تبدأ بـ = أو + أو - أو @ أو TAB أو CR يفسّرها Excel/Sheets
 *    كصيغة. اسم مورد مثل =HYPERLINK("http://evil","انقر") أو
 *    =cmd|'/c calc'!A1 يتحول لهجوم على جهاز من يفتح الملف.
 *    البيانات هنا يدخلها الموردون عبر البوابة الخارجية — أي أنها
 *    مُدخلات غير موثوقة بالتعريف.
 *    الحل المعياري (OWASP): تسبيق الخلية بفاصلة عليا.
 *
 * ملاحظة صريحة عن Excel:
 *   exportToExcelHtml يُنتج جدول HTML يفتحه Excel — وهو ليس ملف XLSX
 *   حقيقياً. Excel قد يعرض تحذير "تنسيق مختلف". لتوليد XLSX ثنائي
 *   حقيقي تلزم مكتبة (SheetJS/ExcelJS) وهي غير مثبَّتة في المشروع.
 *   لذلك CSV هو المسار الموصى به وهو الافتراضي.
 */

/** أحرف تُفسَّر كبداية صيغة في Excel / Google Sheets / LibreOffice */
const FORMULA_TRIGGERS = ['=', '+', '-', '@', '\t', '\r'];

/**
 * تحييد قيمة خلية ضد حقن الصيغ.
 * تُصدَّر للاختبار المباشر.
 */
export function sanitizeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (text.length > 0 && FORMULA_TRIGGERS.includes(text[0])) {
    return `'${text}`;
  }
  return text;
}

/** اقتباس قيمة CSV وفق RFC 4180 بعد تحييدها */
function toCsvField(value: unknown): string {
  return `"${sanitizeCell(value).replace(/"/g, '""')}"`;
}

/** تهريب HTML لمنع حقن الوسوم في مخرجات Excel HTML */
function escapeHtml(value: unknown): string {
  return sanitizeCell(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** اسم ملف آمن — يمنع محارف المسار ويحدّ الطول */
function safeFilename(name: string, extension: string): string {
  const base = (name || 'export')
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, '_')
    .slice(0, 120);
  const stamp = new Date().toISOString().slice(0, 10);
  return `${base}_${stamp}.${extension}`;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // إمهال المتصفح لبدء التنزيل قبل إبطال العنوان
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type ExportColumn<T> = {
  /** عنوان العمود كما يظهر للمستخدم */
  header: string;
  /** استخراج القيمة من الصف */
  value: (row: T) => unknown;
};

/** بناء نص CSV كاملاً (مع BOM) — مفصول عن التنزيل ليسهل اختباره */
export function buildCsv<T>(columns: ExportColumn<T>[], rows: T[]): string {
  const headerLine = columns.map(c => toCsvField(c.header)).join(',');
  const bodyLines = rows.map(row => columns.map(c => toCsvField(c.value(row))).join(','));
  // \uFEFF = BOM: بدونه تظهر العربية مشوّهة في Excel على ويندوز
  return '\uFEFF' + [headerLine, ...bodyLines].join('\r\n');
}

/**
 * تصدير CSV — المسار الموصى به.
 * يعالج: ترميز العربية + حقن الصيغ + اقتباس RFC 4180.
 */
export function exportToCsv<T>(
  filename: string,
  columns: ExportColumn<T>[],
  rows: T[],
): void {
  const csv = buildCsv(columns, rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, safeFilename(filename, 'csv'));
}

/**
 * تصدير جدول HTML يفتحه Excel مع اتجاه RTL وتنسيق.
 * ليس XLSX ثنائياً حقيقياً — انظر الملاحظة أعلى الملف.
 */
export function exportToExcelHtml<T>(
  filename: string,
  columns: ExportColumn<T>[],
  rows: T[],
  title?: string,
): void {
  const head = columns.map(c => `<th>${escapeHtml(c.header)}</th>`).join('');
  const body = rows
    .map((row, index) => {
      const cells = columns.map(c => `<td>${escapeHtml(c.value(row))}</td>`).join('');
      return `<tr class="${index % 2 !== 0 ? 'alt' : ''}">${cells}</tr>`;
    })
    .join('');

  const html = `<html xmlns:x="urn:schemas-microsoft-com:office:excel">
<head><meta charset="UTF-8">
<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>
<x:Name>Report</x:Name><x:WorksheetOptions><x:DisplayRightToLeft/></x:WorksheetOptions>
</x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
<style>
table{border-collapse:collapse;direction:rtl;font-family:Segoe UI,Arial,sans-serif}
th{background:#4f46e5;color:#fff;padding:10px;border:1px solid #c7d2fe;text-align:center}
td{padding:8px;border:1px solid #e2e8f0;text-align:center}
.alt{background:#f8fafc}
.title{font-size:16pt;font-weight:bold;padding:12px;background:#f1f5f9}
</style></head><body><table>
${title ? `<tr><td class="title" colspan="${columns.length}">${escapeHtml(title)}</td></tr>` : ''}
<tr>${head}</tr>${body}</table></body></html>`;

  const blob = new Blob(['\uFEFF' + html], {
    type: 'application/vnd.ms-excel;charset=utf-8;',
  });
  triggerDownload(blob, safeFilename(filename, 'xls'));
}
