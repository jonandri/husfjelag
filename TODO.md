# TODO

Outstanding tasks to revisit. Remove items when completed.

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
- [ ] **Fetch apartment information from Fasteignaskrá**
  When registering apartments, auto-populate share ratios, address, and property details from the official property registry.
  - API info: https://hms.is/umsoknir-og-eydublod?tags=Vefþjónustuaðgangur
  - **Note: this is a paid service** — evaluate cost before implementing
  - Fields to potentially populate: `fnr`, `anr`, share ratios (`share`, `share_2`, `share_3`)
  - Could be triggered by entering `fnr` in the add apartment form to auto-fill the rest

---
