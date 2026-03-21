# Húsfélag UI Style Guide

This document captures the design decisions made during development. Always follow these rules to maintain consistency across all pages and components.

---

## Colors

| Role | Value | Usage |
|------|-------|-------|
| Primary | `#FFFFFF` | General background, card surfaces |
| Secondary (green) | `#08C076` | Primary action buttons, active chips, links |
| Background (blue) | `#1D366F` | Sidebar background |
| Sidebar text | `#FFFFFF` | Nav items, icons in sidebar |
| Disabled / subtle | `text.disabled` (MUI) | Destructive links, inactive text |
| Error | MUI `error` | Validation alerts, delete/disable confirm buttons |

---

## Typography

- **Font**: Inter (Google Fonts), loaded in `public/index.html`
- **Feature settings**: `"tnum"` (tabular numbers — important for share/percentage columns)
- **Heading weights**: `h1`–`h6` use `fontWeight: 200` (light)
- **Body / table**: default weight `400`
- **Bold labels inside dialogs**: `fontWeight: 500` (e.g. owner name, association name)

---

## Page Layout

Every protected page uses the same shell:

```jsx
<div className="dashboard">
  <SideBar />
  <Box sx={{ p: 4, flex: 1 }}>
    ...
  </Box>
</div>
```

- Page title: `<Typography variant="h5">` — always `fontWeight: 200` via theme
- Title row: `display: flex`, `alignItems: center`, `justifyContent: space-between`, `mb: 2`
- Primary action button (e.g. "+ Bæta við") sits on the right of the title row

---

## Sidebar

- Background: `#1D366F`
- Logo clickable → navigates to `/dashboard`
- Nav items: `fontFamily: Inter`, `fontWeight: 400`, `color: #FFFFFF`, `lineHeight: 2`
- Bottom icons stacked vertically, left-aligned with `p: 1`, `gap: 0.5`
  - **Account icon** → opens user settings dialog
  - **Logout icon** → navigates to `/logout`, turns red (`#ff6b6b`) on hover
- Icon hover default: `color: secondary.main` (green)

---

## Buttons

### Primary action (create, save)
```jsx
<Button variant="contained" color="secondary" sx={{ color: '#fff' }}>
  Vista
</Button>
```
- Always white text on green background
- Used for: Vista, Skrá, Virkja, Bæta við

### Secondary / cancel
```jsx
<Button onClick={onClose}>Hætta við</Button>
```
- Default MUI text button, no custom color

### Destructive / disable link
```jsx
<Button sx={{ color: 'text.disabled', textTransform: 'none', fontSize: '0.8rem', p: 0, minWidth: 0 }}>
  Óvirkja íbúð
</Button>
```
- Appears on the **left** side of `DialogActions`
- Never use `color="error"` for soft/reversible actions — only for hard destructive confirms

### Confirm delete (irreversible)
```jsx
<Button color="error" variant="contained">Já, óvirkja</Button>
```

---

## Dialogs

### Structure
```jsx
<Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
  <DialogTitle>Titill</DialogTitle>
  <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
    ...
  </DialogContent>
  <DialogActions sx={{ justifyContent: 'space-between', px: 3, pb: 2 }}>
    <Box>{/* destructive link left */}</Box>
    <Box sx={{ display: 'flex', gap: 1 }}>
      <Button onClick={onClose}>Hætta við</Button>
      <Button variant="contained" color="secondary" sx={{ color: '#fff' }}>Vista</Button>
    </Box>
  </DialogActions>
</Dialog>
```

### Rules
- **Always close on successful save** — never show a success message inside the dialog; just call `onClose()`
- `maxWidth="xs"` for edit/create dialogs; `"sm"` only if content requires it
- `pt: 2` on `DialogContent` to give breathing room after the title
- `px: 3, pb: 2` on `DialogActions` to align with content margins

### Dialog header (entity dialogs)
Show the entity name and key identifiers as static labels — **not** read-only TextFields:
```jsx
<Box>
  <Typography variant="body1" fontWeight={500}>{name}</Typography>
  <Typography variant="body2" color="text.secondary">
    Kennitala: {kennitala} · Íbúð: {anr}
  </Typography>
</Box>
```
- Name: `body1`, `fontWeight: 500`
- Metadata line: `body2`, `color: text.secondary`, separated by `·` (middle dot)

### Confirmation dialogs (for destructive actions)
- Triggered by clicking the subtle disable link
- Uses `DialogContentText` for the warning message
- Confirm button: `color="error" variant="contained"`
- Cancel: default text button

---

## Forms (inline, not dialog)

Used for "add new" flows (apartments, owners):
- `<Paper variant="outlined" sx={{ p: 3, mb: 3, display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 560 }}>`
- Subtitle: `<Typography variant="subtitle1">Skrá nýtt X</Typography>`
- Collapsed by default via `<Collapse in={showForm}>`
- Toggle button in title row: changes label between "+ Bæta við X" and "Loka skráningarformi"

---

## Tables

- `<Paper variant="outlined" sx={{ mt: 2 }}>`
- Summary/totals row in `<TableFooter>` with `fontWeight: 600` and `borderTop: '2px solid rgba(0,0,0,0.12)'`
- Sorted alphabetically by primary identifier column using Icelandic locale: `.sort((a, b) => a.anr.localeCompare(b.anr, 'is'))`
- Edit action: `<IconButton size="small">` with `<EditIcon fontSize="small" />` aligned right in last column (`width: 48`)

### Disabled / inactive rows
- Shown in a collapsed section **below** the active table
- Toggle: subtle text button `▼ Óvirkir X (n)` / `▲ Óvirkir X (n)`
- Rows rendered with `sx={{ opacity: 0.55 }}`
- Smaller table: `<Table size="small">`

---

## Chips

- Owner tags in apartment rows: `<Chip size="small" />` (default style)
- "+ Eigandi" add chip: `variant="outlined" color="secondary"`
- Toggle chips (e.g. is_payer): `color={active ? 'secondary' : 'default'}`, `variant={active ? 'filled' : 'outlined'}`
- Always `sx={{ cursor: 'pointer' }}` on clickable chips

---

## Validation

### Email
```js
/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
```
- Only validate when field is non-empty (fields are optional unless context requires)
- Helper text: `'Netfang verður að innihalda @ og lén (t.d. jon@husfelag.is)'`

### Phone
```js
/^(\+\d{1,3}[\s-]?)?\d{3}[\s]?\d{4}$/.test(phone.trim())
```
- Accepts: `555 1234`, `5551234`, `+354 555 1234`, `+1 555 1234`
- Country code: `+` followed by 1–3 digits
- Helper text: `'Símanúmer: 7 tölustafir (t.d. 555 1234 eða +354 555 1234)'`

### Share percentages
- Validate against sum of *active* (non-deleted) records only
- Error shown inline as `<Alert severity="error">` inside the form/dialog
- Primary action button disabled while invalid

---

## Loading states

- Full-page loading: centered `<CircularProgress color="secondary" />`
- Button loading: `<CircularProgress size={20} color="inherit" />` replacing button label
- Dialog loading: `<CircularProgress size={24} color="secondary" />` centered in `DialogContent`

---

## Language

All UI text is in **Icelandic**. Common terms:

| Icelandic | Meaning |
|-----------|---------|
| Vista | Save |
| Hætta við | Cancel |
| Breyta | Edit |
| Óvirkja | Disable |
| Virkja | Enable / Re-activate |
| Skrá | Register / Create |
| Nafn | Name |
| Kennitala | National ID (10 digits) |
| Netfang | Email |
| Símanúmer | Phone number |
| Íbúð | Apartment |
| Eigandi | Owner |
| Hlutfall | Share / percentage |
| Greiðandi | Payer |
| Samtals | Total |

---

## API conventions

- `GET /Entity/{user_id}` — list entities for a user's association
- `POST /Entity` — create
- `PUT /Entity/update/{id}` — update active record
- `PATCH /Entity/enable/{id}` — re-enable a soft-deleted record
- `DELETE /Entity/delete/{id}` — soft-delete (sets `deleted=True`)
- Soft-delete pattern: `deleted = BooleanField(default=False)` — never hard-delete user data
- Share sums validated server-side against active records only
