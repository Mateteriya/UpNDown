# -*- coding: utf-8 -*-
"""Phase 2: neutralize old dealer order-strip chrome when mop-lab is active."""
from __future__ import annotations

from pathlib import Path

path = Path(__file__).resolve().parents[1] / "src" / "index.css"
text = path.read_text(encoding="utf-8")
n = 0


def repl(old: str, new: str, label: str) -> None:
    global text, n
    c = text.count(old)
    if c == 0:
        raise SystemExit(f"MISSING ({label}): {old[:100]!r}")
    text = text.replace(old, new)
    n += c
    print(f"OK {label}: {c}")


# --- East dealer order strip host + ::before base ---
repl(
    ".game-table-root.viewport-mobile .opponent-slot-east.dealer-opponent-panel button.trick-slots-east-mobile, .game-table-root.viewport-mobile .opponent-slot-dealer-stars-east-layout.dealer-opponent-panel button.trick-slots-east-mobile {",
    ".game-table-root.viewport-mobile .opponent-slot-east.dealer-opponent-panel button.trick-slots-east-mobile:not(.mop-panel--lab-chrome), .game-table-root.viewport-mobile .opponent-slot-dealer-stars-east-layout.dealer-opponent-panel button.trick-slots-east-mobile:not(.mop-panel--lab-chrome) {",
    "east host",
)
repl(
    ".game-table-root.viewport-mobile .opponent-slot-east.dealer-opponent-panel button.trick-slots-east-mobile::before, .game-table-root.viewport-mobile .opponent-slot-dealer-stars-east-layout.dealer-opponent-panel button.trick-slots-east-mobile::before {",
    ".game-table-root.viewport-mobile .opponent-slot-east.dealer-opponent-panel button.trick-slots-east-mobile:not(.mop-panel--lab-chrome)::before, .game-table-root.viewport-mobile .opponent-slot-dealer-stars-east-layout.dealer-opponent-panel button.trick-slots-east-mobile:not(.mop-panel--lab-chrome)::before {",
    "east ::before base",
)

# East bidding/playing ::before long selectors — insert :not(.mop-panel--lab-chrome) before ::before
# Pattern: button.trick-slots-east-mobile.trick-slots-normal:not(...)::before
# → button.trick-slots-east-mobile.trick-slots-normal:not(...):not(.mop-panel--lab-chrome)::before
for kind in ("normal", "collecting"):
    for outcome_tail in (
        ":not(.trick-slots-order-complete):not(.trick-slots-order-over):not(.trick-slots-mobile-under-strict)::before",
    ):
        old = f"button.trick-slots-east-mobile.trick-slots-{kind}{outcome_tail}"
        new = f"button.trick-slots-east-mobile.trick-slots-{kind}:not(.mop-panel--lab-chrome){outcome_tail}"
        # only replace if not already neutralized
        if ":not(.mop-panel--lab-chrome):not(.trick-slots-order-complete)" in text:
            pass
        c = text.count(old)
        if c == 0:
            # maybe already patched
            if text.count(new) > 0:
                print(f"SKIP already {kind}")
                continue
            raise SystemExit(f"MISSING east {kind} outcome ::before")
        text = text.replace(old, new)
        n += c
        print(f"OK east {kind} outcome ::before: {c}")

# --- N/W dealer order strip host (transparent) ---
for tag in ("button", "div"):
    for kind in ("normal", "collecting"):
        old = f"> {tag}.trick-slots-{kind}:not(.trick-slots-east-mobile),"
        # Too broad — only within dealer NW section. Use unique multiline anchors instead.

nw_host_old = """/* Север/Запад сдающий: полоска заказа — «окно» (прозрачный центр, непрозрачная рамка) */
.game-table-root.viewport-mobile
  .game-mobile-top-row
  .opponent-slot.dealer-opponent-panel
  .opponent-slot-stats-mobile-nw
  > button.trick-slots-normal:not(.trick-slots-east-mobile),
.game-table-root.viewport-mobile
  .game-mobile-top-row
  .opponent-slot.dealer-opponent-panel
  .opponent-slot-stats-mobile-nw
  > button.trick-slots-collecting:not(.trick-slots-east-mobile),
.game-table-root.viewport-mobile
  .game-mobile-top-row
  .opponent-slot.dealer-opponent-panel
  .opponent-slot-stats-mobile-nw
  > div.trick-slots-normal:not(.trick-slots-east-mobile),
.game-table-root.viewport-mobile
  .game-mobile-top-row
  .opponent-slot.dealer-opponent-panel
  .opponent-slot-stats-mobile-nw
  > div.trick-slots-collecting:not(.trick-slots-east-mobile) {
  position: relative !important;
  background: transparent !important;
  border-color: transparent !important;
  box-shadow: none !important;
}"""

nw_host_new = """/* Север/Запад сдающий: полоска заказа — legacy chrome; mop-lab отключает через :not(.mop-panel--lab-chrome) */
.game-table-root.viewport-mobile
  .game-mobile-top-row
  .opponent-slot.dealer-opponent-panel
  .opponent-slot-stats-mobile-nw
  > button.trick-slots-normal:not(.trick-slots-east-mobile):not(.mop-panel--lab-chrome),
.game-table-root.viewport-mobile
  .game-mobile-top-row
  .opponent-slot.dealer-opponent-panel
  .opponent-slot-stats-mobile-nw
  > button.trick-slots-collecting:not(.trick-slots-east-mobile):not(.mop-panel--lab-chrome),
.game-table-root.viewport-mobile
  .game-mobile-top-row
  .opponent-slot.dealer-opponent-panel
  .opponent-slot-stats-mobile-nw
  > div.trick-slots-normal:not(.trick-slots-east-mobile):not(.mop-panel--lab-chrome),
.game-table-root.viewport-mobile
  .game-mobile-top-row
  .opponent-slot.dealer-opponent-panel
  .opponent-slot-stats-mobile-nw
  > div.trick-slots-collecting:not(.trick-slots-east-mobile):not(.mop-panel--lab-chrome) {
  position: relative !important;
  background: transparent !important;
  border-color: transparent !important;
  box-shadow: none !important;
}"""

if nw_host_old not in text:
    if ":not(.mop-panel--lab-chrome)" in nw_host_new and text.count(
        "> button.trick-slots-normal:not(.trick-slots-east-mobile):not(.mop-panel--lab-chrome),"
    ):
        print("SKIP nw host already")
    else:
        raise SystemExit("MISSING nw host block")
else:
    text = text.replace(nw_host_old, nw_host_new, 1)
    n += 1
    print("OK nw host")

# N/W ::before base — four selectors ending with ::before {
nw_before_old = """> button.trick-slots-normal:not(.trick-slots-east-mobile)::before,
.game-table-root.viewport-mobile
  .game-mobile-top-row
  .opponent-slot.dealer-opponent-panel
  .opponent-slot-stats-mobile-nw
  > button.trick-slots-collecting:not(.trick-slots-east-mobile)::before,
.game-table-root.viewport-mobile
  .game-mobile-top-row
  .opponent-slot.dealer-opponent-panel
  .opponent-slot-stats-mobile-nw
  > div.trick-slots-normal:not(.trick-slots-east-mobile)::before,
.game-table-root.viewport-mobile
  .game-mobile-top-row
  .opponent-slot.dealer-opponent-panel
  .opponent-slot-stats-mobile-nw
  > div.trick-slots-collecting:not(.trick-slots-east-mobile)::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 2px;
  box-sizing: border-box;
  pointer-events: none;
  z-index: 3;
  background: linear-gradient(
    180deg,
    rgba(251, 191, 36, 0.92) 0%,
    rgba(245, 158, 11, 0.88) 48%,
    rgba(251, 146, 60, 0.9) 100%
  );"""

nw_before_new = nw_before_old.replace(
    ":not(.trick-slots-east-mobile)::before",
    ":not(.trick-slots-east-mobile):not(.mop-panel--lab-chrome)::before",
)
if nw_before_old not in text:
    if nw_before_new in text or text.count(
        ":not(.trick-slots-east-mobile):not(.mop-panel--lab-chrome)::before"
    ):
        print("SKIP nw ::before base already")
    else:
        raise SystemExit("MISSING nw ::before base")
else:
    text = text.replace(nw_before_old, nw_before_new, 1)
    n += 1
    print("OK nw ::before base")

# Landscape WE dealer transparent host
we_host_old = """> button.trick-slots-normal:not(.trick-slots-east-mobile):not(.trick-slots-mobile-nw-high-bid-ear),
.game-table-root.viewport-mobile.viewport-mobile-landscape
  .opponent-slot--mobile-landscape-we.dealer-opponent-panel
  .opponent-slot-stats-mobile-nw--landscape-we
  > button.trick-slots-collecting:not(.trick-slots-east-mobile):not(.trick-slots-mobile-nw-high-bid-ear),
.game-table-root.viewport-mobile.viewport-mobile-landscape
  .opponent-slot--mobile-landscape-we.dealer-opponent-panel
  .opponent-slot-stats-mobile-nw--landscape-we
  > div.trick-slots-normal:not(.trick-slots-east-mobile):not(.trick-slots-mobile-nw-high-bid-ear),
.game-table-root.viewport-mobile.viewport-mobile-landscape
  .opponent-slot--mobile-landscape-we.dealer-opponent-panel
  .opponent-slot-stats-mobile-nw--landscape-we
  > div.trick-slots-collecting:not(.trick-slots-east-mobile):not(.trick-slots-mobile-nw-high-bid-ear) {
  position: relative !important;
  background: transparent !important;
  border-color: transparent !important;
  box-shadow: none !important;
}"""

# Need unique prefix - include dealer landscape comment context by searching first occurrence after landscape we dealer
idx = text.find(
    ".opponent-slot--mobile-landscape-we.dealer-opponent-panel\n"
    "  .opponent-slot-stats-mobile-nw--landscape-we\n"
    "  > button.trick-slots-normal:not(.trick-slots-east-mobile):not(.trick-slots-mobile-nw-high-bid-ear),"
)
if idx < 0:
    if text.find(
        "> button.trick-slots-normal:not(.trick-slots-east-mobile):not(.trick-slots-mobile-nw-high-bid-ear):not(.mop-panel--lab-chrome),"
    ) >= 0:
        print("SKIP we host already")
    else:
        raise SystemExit("MISSING we dealer host")
else:
    # replace only the four selector tails in this block - find block end
    end = text.find("box-shadow: none !important;\n}", idx)
    if end < 0:
        raise SystemExit("MISSING we host end")
    end = end + len("box-shadow: none !important;\n}")
    block = text[idx:end]
    block2 = block.replace(
        ":not(.trick-slots-east-mobile):not(.trick-slots-mobile-nw-high-bid-ear)",
        ":not(.trick-slots-east-mobile):not(.trick-slots-mobile-nw-high-bid-ear):not(.mop-panel--lab-chrome)",
    )
    # also ::before variants in following rules - handled separately
    if block == block2:
        raise SystemExit("we host replace noop")
    text = text[:idx] + block2 + text[end:]
    n += 1
    print("OK we dealer host")

# WE dealer ::before — neutralize chrome selectors that paint gold/playing frames
# Pattern in that zone: :not(.trick-slots-mobile-nw-high-bid-ear):not(.trick-slots-order-complete)...::before
old_we_before = (
    ":not(.trick-slots-east-mobile):not(.trick-slots-mobile-nw-high-bid-ear)"
    ":not(.trick-slots-order-complete):not(.trick-slots-order-over):not(.trick-slots-mobile-under-strict)::before"
)
new_we_before = (
    ":not(.trick-slots-east-mobile):not(.trick-slots-mobile-nw-high-bid-ear):not(.mop-panel--lab-chrome)"
    ":not(.trick-slots-order-complete):not(.trick-slots-order-over):not(.trick-slots-mobile-under-strict)::before"
)
c = text.count(old_we_before)
if c == 0:
    if text.count(new_we_before) > 0:
        print("SKIP we ::before already")
    else:
        raise SystemExit("MISSING we ::before pattern")
else:
    text = text.replace(old_we_before, new_we_before)
    n += c
    print(f"OK we ::before pattern: {c}")

# N/W playing/bidding ::before long patterns
old_nw_play = (
    ":not(.trick-slots-east-mobile):not(.trick-slots-order-complete)"
    ":not(.trick-slots-order-over):not(.trick-slots-mobile-under-strict)::before"
)
new_nw_play = (
    ":not(.trick-slots-east-mobile):not(.mop-panel--lab-chrome):not(.trick-slots-order-complete)"
    ":not(.trick-slots-order-over):not(.trick-slots-mobile-under-strict)::before"
)
# Careful: this also matches WE if we already patched WE differently.
# WE pattern includes high-bid-ear so won't match old_nw_play.
c = text.count(old_nw_play)
if c == 0:
    if text.count(new_nw_play) > 0:
        print("SKIP nw playing ::before already")
    else:
        raise SystemExit("MISSING nw playing ::before")
else:
    text = text.replace(old_nw_play, new_nw_play)
    n += c
    print(f"OK nw playing/bidding ::before: {c}")

path.write_text(text, encoding="utf-8", newline="\n")
print(f"Done, replacements~={n}")
