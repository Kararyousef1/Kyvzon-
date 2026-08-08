#!/usr/bin/env python3
# ============================================================================
# scan_portals.py — ماسحٌ آليٌّ لبوابتي الموظف والموارد البشرية
#
# ★ بُني بعد بلاغ المستخدم (2026-08-08) الذي كشف ثلاثة أعطالٍ لم يمسكها
#   أيُّ اختبار. الفحصُ اليدويّ لا يقيس، والماسحُ يقيس.
#
# ★★★ ما يفحصه — كلُّه أنماطٌ **وقعت فعلاً** في هذا المشروع:
#   ① صفحةٌ تلمس Supabase مباشرةً (خرقُ طبقة SDK)
#   ② نوع `any` بأشكاله الثلاثة
#   ③ زرٌّ بلا onClick (عطل 0371 ②)
#   ④ صفحةٌ تُعامل صفحةً `{rows,total}` كمصفوفة (عطل بلاغ المستخدم ③)
#   ⑤ `?? ''` في العرض يُخفي غياب البيانات (عطل 0371 ①)
#   ⑥ `catch` يبتلع الخطأ صامتاً
#   ⑦ confirm/prompt/alert
#   ⑧ حذفٌ نهائيّ (.delete()) بدل الأرشفة
#   ⑨ تواريخُ مسمَّرة
#   ⑩ `console.error` بدل addToast
#   ⑪ استدعاءٌ بلا حدٍّ (findAll بلا limit)
#   ⑫ `.then(` بلا `.catch(` — وعدٌ مهجور
#
#   python3 tools/dev/scan_portals.py [--json]
# ============================================================================
import json
import os
import re
import sys

ROOT = "/home/user/Kyvzon"
PORTALS = {
    "الموظف": "src/pages/employee",
    "الموارد البشرية": "src/pages/hr",
}

# ── الخدمات التي تُعيد صفحةً `{rows,total}` لا مصفوفة ───────────────────
PAGED_SERVICES: set[str] = set()


def strip_comments(src: str) -> str:
    """يُزيل التعليقات كي لا يُحسَب النمطُ المذكور في شرحٍ عطلاً."""
    src = re.sub(r"/\*[\s\S]*?\*/", "", src)
    src = re.sub(r"^\s*//.*$", "", src, flags=re.M)
    return src


def discover_paged_services() -> set[str]:
    """يكتشف الدوال التي تُعيد نوعاً ينتهي بـPage/Paged."""
    found: set[str] = set()
    sdk = os.path.join(ROOT, "src/services/sdk")
    for fn in sorted(os.listdir(sdk)):
        if not fn.endswith(".ts"):
            continue
        src = open(os.path.join(sdk, fn), encoding="utf-8").read()
        for m in re.finditer(
            r"async\s+(\w+)\s*\([^)]*\)\s*:\s*Promise<\s*(\w*(?:Page|Paged)\w*)\s*>", src
        ):
            found.add(m.group(1))
        # النمطُ الآخر: إرجاعُ كائنٍ فيه rows وtotal
        for m in re.finditer(
            r"async\s+(\w+)\s*\([\s\S]{0,400}?return\s*\{\s*\n?\s*rows:", src
        ):
            found.add(m.group(1))
    return found


CHECKS: list[dict] = []


def check(code: str, title: str, severity: str):
    def deco(fn):
        CHECKS.append({"code": code, "title": title, "severity": severity, "fn": fn})
        return fn
    return deco


# ══════════════════════════════════════════════════════════════════════
@check("SUPABASE", "تلمس Supabase مباشرةً (خرقُ طبقة SDK)", "★★★★")
def c_supabase(body: str, raw: str, path: str):
    out = []
    for i, line in enumerate(body.split("\n"), 1):
        if re.search(r"\bsupabase\s*\.", line) or "from '../../services/supabase" in line:
            out.append((i, line.strip()[:110]))
    return out


@check("ANY", "نوع any", "★★★")
def c_any(body: str, raw: str, path: str):
    out = []
    for i, line in enumerate(body.split("\n"), 1):
        if re.search(r"\bas any\b|:\s*any\b|any\[\]", line):
            out.append((i, line.strip()[:110]))
    return out


def _tag_end(body: str, start: int) -> int:
    """نهايةُ وسم JSX الحقيقية — تتخطّى `/>` داخل `{...}`."""
    depth = 0
    i = start
    n = len(body)
    while i < n:
        ch = body[i]
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
        elif ch == ">" and depth == 0:
            return i + 1
        i += 1
    return min(start + 400, n)


@check("BTN", "زرٌّ بلا onClick (عطل 0371 ②)", "★★★★")
def c_button(body: str, raw: str, path: str):
    out = []
    for m in re.finditer(r"<(button|Button)\b", body):
        end = _tag_end(body, m.start())
        tag = body[m.start():end]
        if "onClick" in tag or 'type="submit"' in tag:
            continue
        # ★ زرٌّ داخل <label> أو يحمل `disabled` وحده قد يكون زخرفياً؛
        #   نُبقيه في التقرير لكن نُظهر الوسم كاملاً كي يُحكَم عليه.
        out.append((body[: m.start()].count("\n") + 1,
                    " ".join(tag.split())[:130]))
    return out


@check("PAGED", "يُعامل صفحةً {rows,total} كمصفوفة (بلاغ المستخدم ③)", "★★★★")
def c_paged(body: str, raw: str, path: str):
    out = []
    for fn in PAGED_SERVICES:
        # (await svc.fn(...)).map / .forEach / .filter
        for m in re.finditer(
            rf"\.{fn}\s*\([^;]{{0,200}}?\)\s*\)\s*\.\s*(map|forEach|filter|slice|length)\b",
            body,
        ):
            out.append((body[: m.start()].count("\n") + 1,
                        f"{fn} → .{m.group(1)}"))
        # svc.fn(...) داخل Promise.all بلا .rows
        for m in re.finditer(rf"(\w+)\.{fn}\s*\(", body):
            seg = body[m.start(): m.start() + 220]
            if ".rows" in seg or ".then(" in seg:
                continue
            line_no = body[: m.start()].count("\n") + 1
            # نتحقّق أنّ الناتج يُسند ثمّ يُقرأ .rows لاحقاً
            after = body[m.start(): m.start() + 1500]
            if re.search(r"\.rows\b", after):
                continue
            out.append((line_no, f"{m.group(1)}.{fn}( بلا استخراج rows"))
    return out


@check("EMPTY_FALLBACK", "`?? ''` في العرض يُخفي غياب البيانات (عطل 0371 ①)", "★★★")
def c_empty(body: str, raw: str, path: str):
    out = []
    for m in re.finditer(r"\{[^{}]*\?\?\s*(''|\"\")\s*\}", body):
        out.append((body[: m.start()].count("\n") + 1, m.group(0)[:110]))
    return out


@check("SILENT_CATCH", "catch يبتلع الخطأ صامتاً", "★★★")
def c_catch(body: str, raw: str, path: str):
    out = []
    # catch { } فارغ، أو catch بلا addToast/throw/setState
    for m in re.finditer(r"catch\s*(?:\([^)]*\))?\s*\{([^{}]*)\}", body):
        inner = m.group(1).strip()
        if not inner:
            out.append((body[: m.start()].count("\n") + 1, "catch فارغ تماماً"))
            continue
        if not re.search(r"addToast|throw|set[A-Z]\w*|logger\.", inner):
            out.append((body[: m.start()].count("\n") + 1,
                        f"catch بلا إبلاغ: {inner[:70]}"))
    return out


@check("DIALOG", "confirm/prompt/alert", "★★★★")
def c_dialog(body: str, raw: str, path: str):
    out = []
    for i, line in enumerate(body.split("\n"), 1):
        if re.search(r"(?<![\w.])(confirm|prompt|alert)\s*\(", line):
            out.append((i, line.strip()[:110]))
    return out


@check("HARD_DELETE", "حذفٌ نهائيّ بدل الأرشفة", "★★★")
def c_delete(body: str, raw: str, path: str):
    out = []
    for i, line in enumerate(body.split("\n"), 1):
        if re.search(r"\.delete\s*\(\s*\)|\.remove\s*\(", line):
            out.append((i, line.strip()[:110]))
    return out


@check("HARDCODED_DATE", "تاريخٌ مسمَّرٌ في الشيفرة", "★★")
def c_date(body: str, raw: str, path: str):
    out = []
    for i, line in enumerate(body.split("\n"), 1):
        if re.search(r"'20(1\d|2[0-4])-\d{2}-\d{2}'|\b20(1\d|2[0-4])\b\s*[،,'\"]", line):
            out.append((i, line.strip()[:110]))
    return out


@check("CONSOLE", "console.error/log بدل addToast", "★★")
def c_console(body: str, raw: str, path: str):
    out = []
    for i, line in enumerate(body.split("\n"), 1):
        if re.search(r"console\.(error|log|warn)\s*\(", line):
            out.append((i, line.strip()[:110]))
    return out


@check("NO_LIMIT", "استدعاءٌ بلا حدٍّ (جلبٌ كامل)", "★★")
def c_nolimit(body: str, raw: str, path: str):
    out = []
    for m in re.finditer(r"\.findAll\s*\(\s*\)", body):
        out.append((body[: m.start()].count("\n") + 1, ".findAll() بلا حدّ"))
    for m in re.finditer(r"\.findAll\s*\(\s*\{([^}]*)\}\s*\)", body):
        if "limit" not in m.group(1):
            out.append((body[: m.start()].count("\n") + 1,
                        f".findAll({{{m.group(1)[:50]}}}) بلا limit"))
    return out


@check("FLOATING", ".then( بلا .catch( — وعدٌ مهجور", "★★")
def c_floating(body: str, raw: str, path: str):
    out = []
    for m in re.finditer(r"\.then\s*\(", body):
        seg = body[m.start(): m.start() + 320]
        if ".catch(" in seg:
            continue
        # داخل try/await آمن
        line_start = body.rfind("\n", 0, m.start())
        line = body[line_start: m.start() + 90]
        if "await" in line:
            continue
        out.append((body[: m.start()].count("\n") + 1, line.strip()[:100]))
    return out


# ══════════════════════════════════════════════════════════════════════
def main() -> int:
    global PAGED_SERVICES
    PAGED_SERVICES = discover_paged_services()

    as_json = "--json" in sys.argv
    results: dict = {}
    totals: dict[str, int] = {}

    for portal, rel in PORTALS.items():
        d = os.path.join(ROOT, rel)
        for fn in sorted(os.listdir(d)):
            if not fn.endswith(".tsx"):
                continue
            path = os.path.join(rel, fn)
            raw = open(os.path.join(ROOT, fn if fn.startswith("/") else path),
                       encoding="utf-8").read()
            body = strip_comments(raw)
            for chk in CHECKS:
                hits = chk["fn"](body, raw, path)
                if not hits:
                    continue
                results.setdefault(portal, {}).setdefault(path, []).append(
                    {"code": chk["code"], "title": chk["title"],
                     "severity": chk["severity"], "hits": hits})
                totals[chk["code"]] = totals.get(chk["code"], 0) + len(hits)

    if as_json:
        print(json.dumps({"results": results, "totals": totals,
                          "paged_services": sorted(PAGED_SERVICES)},
                         ensure_ascii=False, indent=2))
        return 0

    print("═" * 74)
    print(" مسحُ بوابتي الموظف والموارد البشرية")
    print(f" خدماتٌ تُعيد صفحةً: {', '.join(sorted(PAGED_SERVICES)) or '—'}")
    print("═" * 74)

    for portal in PORTALS:
        files = results.get(portal, {})
        n_files = len(os.listdir(os.path.join(ROOT, PORTALS[portal])))
        print(f"\n████ بوابة {portal} — {len(files)} ملفاً به ملاحظات "
              f"(من {n_files})\n")
        for path, findings in sorted(files.items()):
            print(f"  ▸ {path.split('/')[-1]}")
            for f in findings:
                print(f"      {f['severity']} [{f['code']}] {f['title']} "
                      f"— {len(f['hits'])}")
                for ln, txt in f["hits"][:3]:
                    print(f"          سطر {ln}: {txt}")
                if len(f["hits"]) > 3:
                    print(f"          … و{len(f['hits']) - 3} أخرى")

    print("\n" + "═" * 74)
    print(" الإجمالي حسب النوع")
    print("═" * 74)
    order = {c["code"]: c for c in CHECKS}
    for code, n in sorted(totals.items(), key=lambda x: -x[1]):
        c = order[code]
        print(f"  {c['severity']:5} [{code:15}] {n:4} — {c['title']}")
    if not totals:
        print("  ✅ لا ملاحظات")
    return 0


if __name__ == "__main__":
    sys.exit(main())
