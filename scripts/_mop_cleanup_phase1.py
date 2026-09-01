# -*- coding: utf-8 -*-
"""Phase 1: remove dead phone order outcome chrome superseded by mop-lab."""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / "src" / "index.css"
text = path.read_text(encoding="utf-8")
removals: list[tuple[str, int, int]] = []


def cut_between(s: str, start_marker: str, end_marker: str, label: str) -> str:
    i = s.find(start_marker)
    if i < 0:
        raise SystemExit(f"MISSING start: {label}\n{start_marker[:120]!r}")
    j = s.find(end_marker, i + len(start_marker))
    if j < 0:
        raise SystemExit(f"MISSING end: {label}\n{end_marker[:120]!r}")
    removed = s[i:j]
    removals.append((label, removed.count("\n"), len(removed)))
    tomb = f"/* mop-lab: removed dead phone order chrome ({label}) — see src/styles/mobile-order-panel.css */\n"
    return s[:i] + tomb + s[j:]


def cut_range(s: str, start: str, end_inclusive_suffix: str, label: str) -> str:
    i = s.find(start)
    if i < 0:
        raise SystemExit(f"MISSING start: {label}")
    j = s.find(end_inclusive_suffix, i)
    if j < 0:
        raise SystemExit(f"MISSING end: {label}")
    j = j + len(end_inclusive_suffix)
    removed = s[i:j]
    removals.append((label, removed.count("\n"), len(removed)))
    tomb = f"/* mop-lab: removed dead phone order chrome ({label}) — see src/styles/mobile-order-panel.css */\n"
    return s[:i] + tomb + s[j:]


# 1) Main order-complete chrome
text = cut_between(
    text,
    "/* Мобильная: ровно в заказ — тёмный центр + градиентная неоновая обводка (сдающий С/З/В — стекло через ::before выше) */\n",
    "\n/* Компактные кружки взяток (≤1024px):",
    "order-complete panel",
)

# 2) order-over + under-strict panels
text = cut_between(
    text,
    "/* Мобильная: перебор — болотно-жёлтый (как ПК) */\n",
    "\n/* Закрытые кружки взяток при переборе — болотно-оливковый (только с классом на div) */",
    "order-over + under-strict panel",
)

# 3) short-VH south complete border tweak
text = cut_between(
    text,
    (
        "  .game-table-root.viewport-mobile.viewport-mobile-standard-from-short-vh:not(.viewport-mobile-short)\n"
        "    .user-player-panel\n"
        "    .player-mobile-south-tricks-column\n"
        "    .trick-slots-order-complete.trick-slots-normal,\n"
    ),
    (
        "  .game-table-root.viewport-mobile.viewport-mobile-standard-from-short-vh:not(.viewport-mobile-short)\n"
        "    .user-player-panel\n"
        "    .player-mobile-south-tricks-column\n"
        "    .trick-bid-taken-figures-neon--player {"
    ),
    "short-vh south order-complete",
)

# 4) Mid WE over/under border-color
text = cut_between(
    text,
    "  /* Mid · З/В: только over / under (exact = общий градиент ~29369, без indigo) */\n",
    "\n  /* Mid · З/В: абсолютное «ушко» только у гориз. high-bid (не у вертикальной полоски) */",
    "mid WE over/under border-color",
)

# 5) Landscape WE ear outcome chrome
text = cut_range(
    text,
    (
        ".game-table-root.viewport-mobile.viewport-mobile-landscape\n"
        "  .opponent-slot--mobile-landscape-we\n"
        "  .opponent-slot-stats-mobile-nw--landscape-we\n"
        "  .trick-slots-mobile-nw-high-bid-ear.trick-slots-order-complete\n"
        "  .trick-slots-mobile-nw-figures-ear {"
    ),
    "    inset 0 0 14px rgba(239, 68, 68, 0.14) !important;\n}\n",
    "landscape WE ear outcomes",
)

# 6) N/W ear outcome chrome — from comment through under-strict dealer/non-dealer blocks.
# Find end: next rule after under-strict ear that doesn't include order-over/complete/under on figures-ear.
nw_start = (
    "/* Ушко: рамка совпадает с панелью (.trick-slots-order-complete / over / under-strict — как в блоках панели) */\n"
)
i = text.find(nw_start)
if i < 0:
    raise SystemExit("MISSING nw ear outcomes start")
# Walk forward: remove consecutive rules that mention figures-ear AND (order-complete|order-over|under-strict)
# Simpler: find last under-strict figures-ear block after start
marker = ".trick-slots-mobile-nw-high-bid-ear.trick-slots-mobile-under-strict .trick-slots-mobile-nw-figures-ear"
# There may be several; take the last one before a non-outcome section.
pos = i
last_end = None
while True:
    k = text.find(marker, pos)
    if k < 0 or k > i + 8000:
        break
    end = text.find("}\n", k)
    if end < 0:
        break
    last_end = end + 2
    pos = end + 2
if last_end is None:
    raise SystemExit("MISSING nw ear under-strict end")
removed = text[i:last_end]
if "trick-slots-order-complete" not in removed or "trick-slots-order-over" not in removed:
    raise SystemExit("nw ear chunk unexpected content")
removals.append(("nw ear outcomes", removed.count("\n"), len(removed)))
text = (
    text[:i]
    + "/* mop-lab: removed dead phone order chrome (nw ear outcomes) — see src/styles/mobile-order-panel.css */\n"
    + text[last_end:]
)

# 7) Landscape WE gold "in progress" chrome — keep layout, drop border/box-shadow that fight mop.
# Scope chrome-bearing declarations out by rewriting the rule body.
gold_sel = (
    "  /*\n"
    "   * З/В landscape: золотая рамка только «в процессе» (догоняем / торги).\n"
    "   * order-complete / over / under-strict — общая толстая градиентная обводка (~29369).\n"
    "   * Не трогать .trick-slots-mid-we-vertical.\n"
    "   */\n"
)
gi = text.find(gold_sel)
if gi < 0:
    raise SystemExit("MISSING WE gold comment")
# Replace comment + keep selectors but strip chrome props via full block rewrite
old_gold_body_start = text.find(
    "  .game-table-root.viewport-mobile.viewport-mobile-landscape\n"
    "    .opponent-slot--mobile-landscape-we\n"
    "    .opponent-slot-stats-mobile-nw--landscape-we\n"
    "    > button.trick-slots-normal:not(.trick-slots-mid-we-vertical):not(.trick-slots-order-complete):not(.trick-slots-order-over):not(.trick-slots-mobile-under-strict),",
    gi,
)
if old_gold_body_start < 0:
    raise SystemExit("MISSING WE gold selectors")
old_gold_end = text.find("    padding-bottom: max(4px, var(--landscape-opponent-order-pad-v, 2px)) !important;\n  }", old_gold_body_start)
if old_gold_end < 0:
    raise SystemExit("MISSING WE gold end")
old_gold_end = old_gold_end + len("    padding-bottom: max(4px, var(--landscape-opponent-order-pad-v, 2px)) !important;\n  }")
new_gold = """  /*
   * З/В landscape · layout для полоски заказа (рамка/заливка — mop-lab).
   * Старая золотая chrome-рамка снята: на телефоне всегда .mop-panel--lab-chrome.
   */
  .game-table-root.viewport-mobile.viewport-mobile-landscape
    .opponent-slot--mobile-landscape-we
    .opponent-slot-stats-mobile-nw--landscape-we
    > button.trick-slots-normal:not(.trick-slots-mid-we-vertical).mop-panel--lab-chrome,
  .game-table-root.viewport-mobile.viewport-mobile-landscape
    .opponent-slot--mobile-landscape-we
    .opponent-slot-stats-mobile-nw--landscape-we
    > button.trick-slots-collecting:not(.trick-slots-mid-we-vertical).mop-panel--lab-chrome,
  .game-table-root.viewport-mobile.viewport-mobile-landscape
    .opponent-slot--mobile-landscape-we
    .opponent-slot-stats-mobile-nw--landscape-we
    > div.trick-slots-normal:not(.trick-slots-mid-we-vertical).mop-panel--lab-chrome,
  .game-table-root.viewport-mobile.viewport-mobile-landscape
    .opponent-slot--mobile-landscape-we
    .opponent-slot-stats-mobile-nw--landscape-we
    > div.trick-slots-collecting:not(.trick-slots-mid-we-vertical).mop-panel--lab-chrome {
    overflow: visible !important;
    border-radius: 8px !important;
    border-top-left-radius: 8px !important;
    border-top-right-radius: 8px !important;
    border-bottom-left-radius: 8px !important;
    border-bottom-right-radius: 8px !important;
    padding-bottom: max(4px, var(--landscape-opponent-order-pad-v, 2px)) !important;
  }
"""
removals.append(("WE landscape gold→layout-only", text[gi:old_gold_end].count("\n"), old_gold_end - gi))
text = text[:gi] + new_gold + text[old_gold_end:]

# 8) Mobile rare-bid PANEL chrome only (keep keyframes + PC :not(.viewport-mobile))
rare_start = "/* Мобильная · нейтральная полоска (без exact/over/under) */\n"
# Actually the rare panel starts with .viewport-mobile .trick-slots-rare-bid-8
# Find after keyframes - the comment above rare-bid-8 panel
rare_panel = ".game-table-root.viewport-mobile .trick-slots-rare-bid-8.trick-slots-normal:not(.trick-slots-order-complete):not(.trick-slots-order-over):not(.trick-slots-mobile-under-strict),"
ri = text.find(rare_panel)
if ri < 0:
    raise SystemExit("MISSING rare-bid-8 mobile panel")
# Include preceding comment if present
prev_nl = text.rfind("\n", 0, ri)
# look back for comment line
look = text[max(0, ri - 200) : ri]
if "/* Мобильная · нейтральная полоска" in look:
    ri = text.rfind("/* Мобильная · нейтральная полоска", 0, ri)
# End before PC rare-bid section
pc_rare = ".game-table-root:not(.viewport-mobile) .trick-slots-rare-bid"
# There may be more mobile rare rules (south landscape etc). Find PC marker.
# From explore: ~64159+ is :not(.viewport-mobile)
# Also mobile south landscape rare around 64097 - include those until PC block.
pc_markers = [
    ".game-table-root:not(.viewport-mobile) .trick-slots-rare-bid-8",
    ".game-table-root:not(.viewport-mobile) button.trick-slots-rare-bid-8",
    "/* ПК",
]
rj = None
for m in (
    ".game-table-root:not(.viewport-mobile) .trick-slots-rare-bid-8",
    ".game-table-root:not(.viewport-mobile) .trick-slots-rare-bid-9",
):
    k = text.find(m, ri)
    if k >= 0 and (rj is None or k < rj):
        rj = k
if rj is None:
    raise SystemExit("MISSING PC rare-bid marker after mobile rare panel")
# Prefer cutting only pure viewport-mobile rare PANEL rules; south landscape rare is also dead.
# Walk back to include a clean comment boundary
removed = text[ri:rj]
if "trick-slots-rare-bid-8" not in removed or "trick-slots-rare-bid-9" not in removed:
    raise SystemExit("rare panel chunk unexpected")
# Don't cut if we accidentally include :not(.viewport-mobile)
if ":not(.viewport-mobile)" in removed:
    raise SystemExit("rare panel chunk includes PC rules")
removals.append(("mobile rare-bid panel chrome", removed.count("\n"), len(removed)))
text = (
    text[:ri]
    + "/* mop-lab: removed dead phone rare-bid PANEL chrome — PC rare-bid kept; figures accents kept */\n"
    + text[rj:]
)

path.write_text(text, encoding="utf-8", newline="\n")
print(f"Wrote {path}")
print(f"Size {orig_len if (orig_len := path.stat().st_size) else 0} bytes on disk after write")
for label, lines, chars in removals:
    print(f"  - {label}: ~{lines} lines, {chars} chars")
print(f"Total removals: {len(removals)}")
