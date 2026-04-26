# Handoff: Husfjelag Redesign — Yfirlit & Húsfélag

## Overview

This handoff covers two screens in the Husfjelag housing-association management app:

1. **Yfirlit (mælaborð)** — overview / dashboard for all users to see how the association is performing financially.
2. **Húsfélag (aðalsíða)** — the association's main page, in two life-stages:
   - **① Uppsetning** — onboarding flow used immediately after a new association is created (chair / CFO completes a 6-step setup).
   - **② Daglegur rekstur** — the post-setup operational view with notifications (Athugasemdir) and primary management actions.

The redesign goals were:

- Yfirlit: lead with the cash position + variance vs. budget, and surface upcoming actions, so any role gets a useful overview at a glance.
- Húsfélag (setup): make first-run obvious with a 6-step progress hero and ghosted previews of what gets unlocked.
- Húsfélag (post-setup): collapse the setup hero, surface attention items in an **Athugasemdir** rail, and elevate the four most-used actions (change board, register new owner, update budget, run claims).

---

## About the Design Files

The HTML / JSX files in `source/` are **design references**, not production code. They're a React + Babel inline-JSX prototype rendered via a CDN — useful for screenshots, click-throughs, and pixel reference, **not** as a starting commit.

Your job is to **recreate these designs in the target codebase's existing environment** using its established patterns, component library, and conventions. If the project has no codebase yet, pick the framework that best fits the team and rebuild there. Don't ship the prototype HTML; treat it as a high-fidelity spec.

## Fidelity

**High-fidelity.** Colors, typography, spacing, border radii, and component structure are all final. Match them pixel-perfectly using the codebase's primitives. Copy is final Icelandic and should not be re-translated.

---

## Screens

### 1. Yfirlit — V1 ("Editorial focus")

**Purpose:** at-a-glance financial overview for all roles. Answers: *How much money do we have? Who hasn't paid? Are we on budget? What's coming up?*

**File:** `source/yfirlit-v1.jsx`

**Page header (`.ph`):**
- Left: H1 "Yfirlit" (22px / 600), subtitle "Maríugata 34 - 36, húsfélag · 2026" (13px / secondary).
- Right: ghost button `📅 2026 ▾` + secondary button `⬇ Sækja ársskýrslu`.

**Hero KPI band** (single bordered row, 4 columns, `1.5fr 1fr 1fr 1fr`):

| Cell | Treatment |
|---|---|
| Staða í bönkum | Navy gradient `linear-gradient(135deg,#1D366F 0%,#0d2154 100%)`, white text, 30px mono number, green sparkline below (`#08C076`, 36px tall). Trend pill: `▲ +58.400 kr.` |
| Ógreidd innheimta | White cell, 24px mono in `--negative` (#C62828), caption "2 íbúðir í vanskilum". |
| Raun vs áætlun | White cell, 24px mono percent, caption "nýtt af áætlun ársins". |
| Næsta innheimta | White cell, mono date + amount expected. |

Cells separated by 1px `--border` divider, container has `border-radius: 6px` and `overflow: hidden`.

**Two-column row below hero** (`grid-template-columns: 1fr 1fr; gap: 24px`):
- **Næstu skref** card: list of 3–4 upcoming items (innheimta, ársreikningur, stjórnarfundur). Each row: small navy circle icon (32px), title (13.5/medium), date caption (12/secondary), right-aligned chevron.
- **Áætlun 2026** card: 5–6 horizontal variance bars per category. Each bar: label (left, 13px), `bar` (flex:1, 6px tall, `--bg-soft` track, `--brand-navy` fill, `--negative` fill if over budget), right-aligned `actual / budget` pair (mono, 12px).

**Variance table** (full width, below the two-column row):
- Standard `.t` table.
- Columns: Flokkur · Áætlun · Raun · Frávik · % nýtt · (utilization meter, 80px) · ▾.
- Rows are categories; over-budget rows show `--negative` on the frávik cell.
- Footer: bold totals row with `2px` top border.

**Spacing:** outer container padding `28px 32px`. Section gap `24px`.

---

### 2. Húsfélag — Uppsetning (V3 onboarding)

**Purpose:** first-run state for a brand-new association. Walks the chair / CFO through six steps before unlocking daily ops.

**File:** `source/husfelag-v3.jsx`

**Page header:** H1 with the association name (e.g. "Maríugata 34 - 36, húsfélag"), subtitle "Kennitala 600525-0690 · stofnað 12. apríl 2026", ghost `Leiðbeiningar` button on right.

**Setup hero** (large bordered block, `border-radius: 8px`, padding `28px 32px`):
- Left: green eyebrow "UPPSETNING · 2 AF 6 LOKIÐ", H2 "Settu upp húsfélagið — **4 skref eftir**" (24px / 300 with bold accent), subtitle "Eftir uppsetningu sér kerfið um innheimtu, afstemmingu og ársskýrslu."
- Right: 28px navy mono "33%" + small label "lokið".
- Beneath: 6-cell step grid (`grid-template-columns: repeat(6, 1fr); gap: 12px`). Each cell:
  - Number badge (top-left, 22×22 circle).
  - Title (13px / medium).
  - One-line description (11.5px / secondary).
  - Status pill bottom-right: ✓ Lokið (green), Í gangi (navy), or — (faint).
- Below the grid: primary CTA `Halda áfram með uppsetningu →`.

**Ghosted previews** (3 cards in a row): "Bankareikningar", "Innheimta", "Ársreikningur" — each rendered with reduced opacity, dashed border, "Læstur þar til uppsetningu lýkur" caption. Visual promise of what comes next.

---

### 3. Húsfélag — Daglegur rekstur (post-setup)

**Purpose:** the everyday view after setup. Chair / CFO see what needs attention and reach for the four primary actions.

**File:** `source/husfelag-final.jsx`

**Layout:** `grid-template-columns: 1fr 320px; gap: 28px;` (main content + sticky right rail).

#### Left column

**Identity strip** (`grid-template-columns: 1.4fr 1fr; gap: 16px`):
- **Stjórn card:** eyebrow "STJÓRN", inline ghost button `↔ Breyta stjórn`. Two avatar rows side-by-side (formaður + gjaldkeri). Avatar = 42px circle, initials, role caption.
- **Eignarhald card:** eyebrow "EIGNARHALD". Three stats horizontally: Íbúðir · Eigendur · m². Each stat = 24px / 300 number + 11.5px / secondary label.

**Aðgerðir** (4-card grid, `grid-template-columns: repeat(4, 1fr); gap: 12px`):
1. `↔ Breyta stjórn` — "Skipta um formann eða gjaldkera"
2. `👤+ Skrá nýjan eiganda` — "Tekur yfir fyrir fyrri eiganda íbúðar"
3. `📊 Uppfæra áætlun` — "Tekjur og gjöld 2026"
4. `🔁 Búa til innheimtu` — "Mánaðargreiðslur eigenda"

Each card: `border 1px solid --border`, `radius 6px`, padding `14px 16px`, hover swaps border to `--brand-navy`. Top-left 36×36 navy-tint icon tile, title (13.5 / medium), sub (11.5 / secondary).

**Bankareikningar** (table-like list):
- Section title + actions on right (`Tengja banka`, `+ Bæta við`).
- Bordered container, each row: `1fr 130px 220px 140px 40px`.
  - Account name + status caption (`● Tengt · afstemmt í gær`, 11.5 / disabled, green dot).
  - Account number (mono, 12 / secondary).
  - Type chip (`chip--label`).
  - Balance (mono, 14.5 / medium, right-aligned).
  - Edit icon button.

**Flokkunarreglur** (table):
- Standard `.t` table. Columns: Skýring inniheldur · Flokkur · Notkun · ✏︎🗑.
- Keyword shown as mono "..." string; flokkur as label chip; notkun as "N færslur" right-aligned.

#### Right column (sticky)

**Athugasemdir panel:**
- Bordered card, `radius 8px`, padding `18px 20px`, `position: sticky; top: 0`.
- Eyebrow "ATHUGASEMDIR" (navy variant).
- 4 stacked notification rows, separated by 1px `--border-row`:
  1. ⚠ (warning #E65100) — "2 íbúðir í vanskilum (apríl)" / link "Senda áminningar →"
  2. 🐖 savings (positive #2E7D32) — "Hússjóður með 32% umfram áætlun" / "Skoða →"
  3. 🔗 link_off (tertiary) — "1 óflokkuð bankafærsla" / "Flokka færslu →"
  4. ✓ check_circle (positive) — "Bankareikningar afstemmdir" / "Síðast: í gær"
- Each row: 22px Material outlined icon left, body (13.5 / 1.4), navy CTA link (12.5 / medium, navy color).

**Behavior:** the Athugasemdir panel is only visible in the post-setup state — hide it in the onboarding view. Notifications come from server-side rules; tapping the CTA navigates to the relevant detail screen.

---

## Interactions & Behavior

| Surface | Behavior |
|---|---|
| Setup steps (V3) | Each step opens a step modal/page; on completion the step pill flips to `✓ Lokið` and progress recalculates. After all 6 are done, the page transitions to the post-setup state and Athugasemdir appears. |
| Aðgerðir cards | Click navigates to the corresponding flow (board change wizard, owner registration form, budget editor, claims composer). |
| Bank account row | Click opens an edit drawer (account name, type, IBAN). Edit icon = same. |
| Athugasemdir CTA | Each navigates to the relevant deep link (vanskil list, hússjóður detail, flokkun queue, afstemming log). |
| Hover (cards/rows) | Border swaps to `--brand-navy`, transition `150ms ease`. |
| Buttons | `--brand-navy` primary, hover → `--brand-navy-hover`. Icons inside buttons use 17px Material outlined. |
| Sparkline (Yfirlit hero) | Static SVG in the prototype; in production wire to the last-30-days bank balance time series. |
| Variance bars / utilization meters | Green if ≤100% used, red if over. Animate width on mount (200ms). |

## State Management

For the Húsfélag page you'll need a single `setupCompletion` state derived from server data (counts of completed setup steps, 0–6). When `< 6`, render the **uppsetning** view; when `== 6`, render the **daglegur rekstur** view. Athugasemdir items are a separate fetched list, only requested in the post-setup state.

For Yfirlit you'll need: bank balances (current + 30-day series), unpaid receivables, current-year budget, current-year actuals, and upcoming events — all server data, no client-side mutation in this screen.

---

## Design Tokens

The full token set is in **`tokens.json`** (also mirrored as CSS variables in `source/ds/colors_and_type.css`). Drop these into your codebase's token system (Tailwind config / theme.ts / CSS vars).

**Critical primitives:**

- Brand navy `#1D366F` (sidebar, primary buttons, active states, hero gradient start)
- Brand green `#08C076` (positive actions, sparklines, success chips)
- Negative `#C62828`, Warning `#E65100`, Positive `#2E7D32`, Info `#1565C0`
- Neutrals: text `#111 / #333 / #555 / #777 / #888 / #AAA`; borders `#E8E8E8` / `#F2F2F2`
- Hero gradient: `linear-gradient(135deg, #1D366F 0%, #0D2154 100%)`

**Typography:** Switzer (sans, variable 100–900) and JetBrains Mono (amounts and account numbers). Mono uses `font-feature-settings: "tnum"` for tabular numerals — non-negotiable for tables.

**Spacing:** 8px grid (4, 8, 12, 16, 20, 24, 32, 40, 48).

**Radii:** 4 (fields/rows), 6 (KPI band, cards), 8 (large surfaces/Athugasemdir), pill (20/24).

---

## Assets

- **Material Symbols Outlined** icons via Google Fonts. The prototype uses string names (e.g. `swap_horiz`, `person_add`, `assessment`, `event_repeat`, `link_off`, `check_circle`, `savings`, `warning`). Use any equivalent icon library in your codebase (lucide, mui-icons, custom SVG) — do not hot-link Google Fonts in production.
- **Switzer** + **JetBrains Mono** font files exist in the source repo at `ds/fonts/` (not bundled here — already in production CSS).

No bitmap images in these screens.

---

## Files in this handoff

```
design_handoff_husfjelag_redesign/
├─ README.md                      ← this file
├─ tokens.json                    ← machine-readable design tokens
└─ source/
   ├─ Husfjelag Redesign.html     ← entry point — open in a browser to view all artboards
   ├─ styles.css                  ← shared app-shell + table styles
   ├─ ds/colors_and_type.css      ← CSS-variable token set (matches tokens.json)
   ├─ shell.jsx                   ← sidebar + shared data
   ├─ design-canvas.jsx           ← canvas component (presentation only — not part of the app)
   ├─ yfirlit-current.jsx         ← current Yfirlit (reference / before)
   ├─ yfirlit-v1.jsx              ← Yfirlit "Editorial focus" — chosen direction
   ├─ husfelag-current.jsx        ← current Húsfélag page (reference / before)
   ├─ husfelag-v3.jsx             ← Húsfélag onboarding (uppsetning)
   └─ husfelag-final.jsx          ← Húsfélag post-setup (daglegur rekstur, with Athugasemdir)
```

**To view the designs:** open `source/Husfjelag Redesign.html` in any modern browser (it loads React + Babel from a CDN). The canvas lets you click any artboard's expand button to focus it fullscreen.
