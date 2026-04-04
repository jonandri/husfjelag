# Homepage Design Spec

**Date:** 2026-04-04
**Status:** Approved

---

## Goal

Add a public-facing homepage at `/` that markets the Húsfélag SaaS to prospective users. The page is shown before login and replaces the current redirect-to-login behaviour at the root route. Language: Icelandic only.

---

## Architecture

A single new React component `HomePage` at `src/controlers/HomePage.js`. It is a pure presentational page — no auth, no API calls, no `ProtectedRoute`. The root route in `App.js` changes from `<Navigate to="/login">` to `<HomePage />`. The sticky CTA bar's "Skrá sig" button links to `/login`.

No shared components are introduced; all sections are self-contained within `HomePage.js`.

---

## Visual Style

- **Colour palette:** Dark navy `#1D366F` for hero + CTA bar + footer; green `#08C076` for accents and CTA buttons; white `#fff` for content sections; light grey `#fafafa` for the feature grid section.
- **Typography:** Existing Inter font from the MUI theme. Thin/light weights (`fontWeight: 200`) for large display text; semibold (`600`) for section titles and labels.
- **Green accent shapes:** Two decorative blobs (absolutely positioned circles with `rgba(8,192,118, 0.10)` and `0.07`) in the hero for depth.
- **Buttons:** Primary = green pill (`background: #08C076`, `border-radius: 24px`); Ghost = transparent with `rgba(255,255,255,0.3)` border.

---

## Page Sections (top to bottom)

### 1. Sticky CTA Bar

- **Always visible**, `position: sticky; top: 0; z-index: 100`.
- **Expanded state** (at page top): logo left, tagline "— Hugbúnaður fyrir húsfélög" beside it, "Skrá sig →" button right. Padding `14px 32px`.
- **Mini state** (on scroll, `scrollY > 60`): tagline hidden, reduced padding `8px 32px`, smaller button. Transition via CSS `transition: padding 0.2s ease`.
- Background: `#1D366F`. Box-shadow to lift above content.
- "Skrá sig →" navigates to `/login` (React Router `<Link>` or `navigate('/login')`).

### 2. Hero — Full Width

- Background: `linear-gradient(135deg, #1D366F, #0d2154)` spanning the full viewport width.
- Two decorative blobs (positioned circles) for visual depth.
- Inner content: `max-width: 1100px`, centred, `padding: 64px 48px`.
- **Two-column layout** (flex row):
  - **Left — text (flex: 1):**
    - Green uppercase kicker: "Hugbúnaður fyrir íslensk húsfélög"
    - H1 title (white, `fontWeight: 200`): "Stjórnaðu húsfélaginu þínu með **fullnægjandi yfirsýn**" (bold on last two words)
    - Subtitle (60% white opacity): "Innheimta, áætlun og fjárhagsleg yfirlit — allt á einum stað. Einfalt. Öruggt. Íslenskt."
    - Two buttons: "Byrja frítt →" (primary green pill) + "Sjá meira" (ghost, scrolls to `#stories` anchor via `href="#stories"`)
  - **Right — app UI mockup (flex: 1):**
    - A faux browser/app frame showing:
      - Three dot header bar
      - Three KPI chips: Áætlun 2025 / Mánaðarleg innheimta / Ógreitt
      - A horizontal bar chart (4 months of collection data)
    - Built in plain HTML/CSS (no charting library). Colour: `rgba(255,255,255,0.07)` background, green bars.
- **Mobile (`≤ 768px`):** columns stack vertically, text first, mockup below. Padding reduced to `40px 24px`.

### 3. Feature Stories — Fixed Width, Centred  {#stories}

Three alternating text + image sections. Each story:

- **Container:** `max-width: 1060px`, centred (`margin: 0 auto`), `padding: 64px 40px`.
- **Layout:** flex row — `flex: 0 0 500px` text column + `60px gap` + `flex: 0 0 500px` image column.
- Odd stories (1st, 3rd): text left, image right.
- Even stories (2nd): text right, image left (`flex-direction: row-reverse`).
- Divider: `border-top: 1px solid #f0f0f0` between stories.
- **Text:** green uppercase label, bold title (~22px), body text (~14px, `color: #555`, `line-height: 1.75`).
- **Image placeholder:** `background: #f5f7fc`, `border-radius: 10px`, `border: 1px solid #e8edf5`. Replaced with real app screenshots post-launch.
- **Mobile (`≤ 768px`):** columns stack, both full width, text always on top.

**Three stories:**
1. **Innheimta** — "Sjálfvirk mánaðarleg innheimta á húsgjöldum" — collection status table screenshot
2. **Áætlun** — "Búðu til árlegri fjárhagsáætlun á nokkrum mínútum" — budget wizard screenshot
3. **Yfirlit** — "Fjárhagsleg yfirsýn yfir allt árið" — report page screenshot

### 4. Feature Grid

- Background: `#fafafa`, with `border-top` and `border-bottom: 1px solid #eee`.
- Inner: `max-width: 1060px`, centred, `padding: 64px 40px`.
- Section title: "Allt sem húsfélag þarfnast" + subtitle "9 einingar — ein lausn".
- **3×3 grid** (`display: grid; grid-template-columns: repeat(3, 1fr)`). Grid lines via `gap: 1px; background: #e8e8e8` on the container.
- Each cell: white background, emoji icon, bold title (~13px), description (~12px, `color: #777`).
- **9 cells:** Húsfélag · Íbúðir · Eigendur · Innheimta · Áætlun · Færslur · Yfirlit · Bankareikningar · Flokkunarreglur.
- **Mobile (`≤ 768px`):** 2-col grid. **Mobile (`≤ 480px`):** 1-col grid.

### 5. Footer

- Background: `#1D366F`, `padding: 48px 40px 0`.
- Inner: `max-width: 1060px`, centred.
- **Top row (flex, space-between):** brand name + tagline left; nav links right (Innskráning · Eiginleikar · Hafa samband).
- **Bottom row:** thin `border-top: 1px solid rgba(255,255,255,0.1)`, copyright text `© 2025 Húsfélag. Öll réttindi áskilin.`
- **Mobile:** stacks vertically.

---

## Routing Change

In `App.js`, change:
```jsx
<Route path="/" element={<Navigate to="/login" replace />} />
```
to:
```jsx
<Route path="/" element={<HomePage />} />
```

Add the import for `HomePage`. The `/login` route stays unchanged.

---

## File Changes

| File | Change |
|------|--------|
| `src/controlers/HomePage.js` | **Create** — full homepage component |
| `src/App.js` | **Modify** — replace root redirect with `<HomePage />` |

No other files change. No new dependencies.

---

## Out of Scope

- No contact form (links to email)
- No pricing page
- No blog or documentation links (placeholders only)
- No animations beyond the CTA bar shrink transition
- Real app screenshots replace placeholders post-launch (not part of this task)
