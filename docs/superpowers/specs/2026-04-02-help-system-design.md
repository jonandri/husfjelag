# Help System Design

**Date:** 2026-04-02  
**Status:** Approved

---

## Overview

An in-app contextual help system for Húsfélag. Users can access help from any page or dialog via a "?" icon. Help slides in as a drawer panel on the right, explaining how the system works in Icelandic, with screenshots where relevant.

---

## Goals

- Explain the Húsfélag financial workflow to users (associations → apartments → owners/payer → budget → collections → transactions → overview)
- Make help easily accessible on every page and every dialog
- Automatically open the relevant help section based on which page or dialog the user is on
- Use screenshots to improve understanding

---

## Architecture

Three new files, no backend changes.

### `src/ui/HelpContext.js`
React context that provides:
```js
const { openHelp, closeHelp } = useHelp();
openHelp("innheimta");   // opens drawer at that section
closeHelp();
```
State: `{ open: bool, section: string | null }`.  
The `HelpProvider` wraps the authenticated routes in `App.js` (inside `ProtectedRoute`). The `HelpDrawer` is mounted once inside `SideBar.js` — which is the shared layout component rendered by every authenticated page.

### `src/ui/HelpDrawer.js`
MUI `Drawer` with `anchor="right"`, `variant="temporary"`, width `380px`.  
Reads `section` from `HelpContext`, looks up content in `helpContent.js`, renders it.

Structure:
- Drawer header: section title + close `IconButton`
- Intro paragraph
- Repeated items: `heading` (bold), `body` (body text), optional `image` (`<img>` full-width, `border-radius: 8px`, `border: 1px solid #e8e8e8`)

### `src/ui/helpContent.js`
Plain JS object. All content in Icelandic.

```js
export const HELP = {
  husfelag: {
    title: "Húsfélag",
    intro: "...",
    items: [{ heading: "...", body: "...", image: "husfelag-overview.png" }]
  },
  // ...
};
```

Screenshots are static `.png` files in `src/assets/help/`. Each section may have 0–3 images. Placeholder slots are included in the spec; real screenshots are added after the UI is built.

---

## Section Keys and Content

| Key | Shown on | Content summary |
|-----|----------|----------------|
| `husfelag` | Húsfélag page | What an association is; kennitala; association settings |
| `ibudir` | Íbúðir page | Apartment list; percentage ownership; bulk import |
| `eigendur` | Eigendur page | Owners vs payer; how to assign and change the payer |
| `aaetlun` | Áætlun page | Yearly budget; categories; how budget drives monthly collections |
| `innheimta` | Innheimta page | What collections are; PAID/PENDING/OVERDUE statuses; payment matching |
| `faerslur` | Færslur page | Bank transactions; categorisation; automatic categorisation rules |
| `yfirlit` | Yfirlit page | Financial overview; budget vs actual spending; KPI cards |
| `innheimta-tengja` | Manual match dialog | How to manually link a bank transaction to a pending collection |
| `aaetlun-wizard` | Budget wizard | Step-by-step guide to creating a new yearly budget |

---

## UI — Help Trigger in Pages

- Zone ① (page header), right side, after the primary action button
- Component: MUI `IconButton` with `HelpOutlineIcon` (fontSize 20)
- Tooltip: `"Hjálp"`
- On click: calls `openHelp("<section-key>")`

```jsx
// Example in InnheimtaPage header
<IconButton onClick={() => openHelp('innheimta')} size="small">
  <HelpOutlineIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
</IconButton>
```

---

## UI — Help Trigger in Dialogs

Dialogs use a shared `HelpDialogTitle` component instead of the plain MUI `DialogTitle`.

```jsx
<HelpDialogTitle helpSection="innheimta-tengja" onClose={onClose}>
  Tengja greiðslu handvirkt
</HelpDialogTitle>
```

This renders the title on the left and `[? icon] [✕ close]` on the right. The "?" calls `openHelp(helpSection)`. The drawer appears in front of the dialog backdrop.

---

## UI — The Drawer

- MUI `Drawer`, `anchor="right"`, `variant="temporary"`, `PaperProps={{ sx: { width: 380 } }}`
- `ModalProps={{ keepMounted: false }}` — unmounts when closed
- Backdrop: default MUI backdrop (dim overlay behind drawer)
- If a dialog is open when help opens, the drawer renders above the dialog (`zIndex` higher than MUI dialog default of 1300 — use 1400)
- Header: `Typography variant="h6"` (title) + `IconButton` (close)
- Body: scrollable, `padding: 24px`
  - Intro: `Typography variant="body2"` with `mb: 2`
  - Items: heading as `Typography variant="subtitle2"` with `mb: 0.5`, body as `Typography variant="body2" color="text.secondary"` with `mb: 1.5`, image as `<img>` with `width: 100%`, `borderRadius: 8`, `border: "1px solid #e8e8e8"`, `mb: 2`

---

## Help Content — Icelandic Workflow Explanation

The help content must explain the full financial lifecycle of an association:

1. **Húsfélag** — An association owns a building with multiple apartments. Each apartment has a registered owner; one owner per apartment is designated as the **greiðandi** (payer).
2. **Íbúðir** — Apartments are listed with ownership percentage, which determines how shared costs are divided.
3. **Eigendur** — Each apartment can have multiple owners, but exactly one must be the payer — the person responsible for monthly fee payments.
4. **Áætlun** — Each year the association creates a budget with expense categories (e.g. Hitaveita, Rafmagn, Húseigendatrygging). The total budget is divided into monthly amounts per apartment (weighted by ownership percentage).
5. **Innheimta** — Monthly collection records are generated from the budget. Each collection entry shows what each payer owes for that month. Status is PENDING until a matching bank payment is found.
6. **Færslur** — The association imports bank account transactions. Each transaction is categorised (expense or income). Payments from owners are matched to pending collection entries.
7. **Yfirlit** — The financial overview shows total income vs expenses, budget vs actual spend per category, and outstanding (unpaid) collections.

---

## Out of Scope

- No backend changes
- No search across help sections
- No user feedback / thumbs up/down
- No English version
- Screenshots are static PNGs — not live screen captures
- No help for the Login or HouseAssociation registration pages (pre-auth)

---

## Files to Create / Modify

**New:**
- `src/ui/HelpContext.js`
- `src/ui/HelpDrawer.js`
- `src/ui/helpContent.js`
- `src/ui/HelpDialogTitle.js`
- `src/assets/help/` (directory for screenshot PNGs — initially empty or with placeholders)

**Modified:**
- `src/App.js` — wrap `ProtectedRoute` children with `HelpProvider`
- `src/controlers/Sidebar.js` — mount `HelpDrawer` at bottom of render (shared across all pages)
- `src/controlers/CollectionPage.js` — add "?" to header + `HelpDialogTitle` to manual match dialog
- `src/controlers/TransactionsPage.js` — add "?" to header
- `src/controlers/ReportPage.js` — add "?" to header
- `src/controlers/ApartmentsPage.js` — add "?" to header
- `src/controlers/OwnersPage.js` — add "?" to header
- `src/controlers/BudgetPage.js` — add "?" to header
- `src/controlers/BudgetWizardPage.js` — add "?" to header + `HelpDialogTitle` where applicable
- `src/controlers/AssociationPage.js` — add "?" to header
