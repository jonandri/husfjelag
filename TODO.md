# TODO

Outstanding tasks to revisit. Remove items when completed.

## Budget

- [ ] **Display older budget versions for users to view**
  When multiple budget versions exist for a year (v2, v3, etc.), allow users to browse and view previous (inactive) versions. Currently only the active (latest) version is shown.
  - The inactive budgets are already stored in the database with `is_active=False`
  - Could be implemented as a dropdown or tab switcher on the Budget page

---

## Email & Notifications

- [ ] **Integrate Resend.com email service**
  Add transactional email capability to the backend — API key config, shared send helper. Foundation for all notification features below.

- [ ] **Senda áminningar — payment reminders**
  Send payment reminder emails to unpaid owners for a given collection month. Triggered from the overview/innheimta page via the "Senda áminningar →" CTA. Depends on Resend integration.

- [ ] **Senda skilaboð — message owners from Owners page**
  Compose and send a free-text email to selected or all owners of an association. Uses the Resend email integration. Depends on Resend integration.

---

## Overview (Yfirlit)

- [ ] **Make "Næstu skref" dynamic**
  Currently hardcoded dates (Apr 15 Ársreikningur, Apr 30 Aðalfundur, next month Innheimta). Derive upcoming events from actual data — collection due dates, association fiscal calendar, aðalfundur deadline from law (before end of April).

---

## Help & Onboarding

- [ ] **Rewrite all help drawer content to be more human and practical**
  The current help text in `HusfelagJS/src/ui/helpContent.js` is technically correct but reads like documentation. Rewrite each entry to explain _how to think about_ the feature in plain language — from the perspective of a building association chair who has never used software like this before.
  - Explain the mental model first (e.g. "think of the budget as an annual plan you vote on at the AGM"), then the practical steps
  - All 9 keys need updating: `husfelag`, `ibudir`, `eigendur`, `aaetlun`, `aaetlun-wizard`, `innheimta`, `innheimta-tengja`, `faerslur`, `yfirlit`
  - Tone: conversational Icelandic, like a knowledgeable colleague explaining over coffee — not a manual

---

## Backend

### Owner / User data
- [ ] **Fetch name and info from Þjóðskrá when creating stub user**
  When an owner is registered by kennitala and no user account exists yet, we create a stub user with the kennitala as a placeholder name. Instead, look up the person's name and details from Þjóðskrá.
  - API info: https://www.skra.is/umsoknir/eydublod-umsoknir-og-vottord/stok-vara/?productid=9a9ee52e-0d42-11ef-ba96-005056acfc03
  - Data gateway: https://um.ja.is/gagnatorg
  - Fields to populate: `name`, possibly address
  - Affected code: `OwnerView.post` in `HusfelagPy/associations/views.py` — the `get_or_create` block that falls back to `defaults={"name": kennitala}`

### Apartment data
- [ ] **Replace HMS scraping with a proper API for apartment data**
  Currently we scrape Fasteignaskrá (HMS) after the user does a manual search and provides the URL back to us. This is fragile and a poor user experience. Evaluate available options:
  - HMS API: https://hms.is/umsoknir-og-eydublod?tags=Vefþjónustuaðgangur — **paid service**, evaluate cost
  - Goal: auto-populate `fnr`, `anr`, size and ideally share ratios (`share`, `share_2`, `share_3`) by entering a kennitala or address
  - Affected code: `associations/scraper.py:scrape_hms_apartments()`

---
