# Help System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a contextual in-app help system with a slide-over drawer triggered by a "?" icon in every page header and dialog title bar, with Icelandic content explaining the full financial workflow.

**Architecture:** A `HelpContext` provides `openHelp(section)` / `closeHelp()` globally. A single `HelpDrawer` mounted in `Sidebar.js` renders the relevant section from a static `helpContent.js` map. Pages and dialogs each call `openHelp` with their section key.

**Tech Stack:** React 17, MUI v5 (`Drawer`, `IconButton`, `Tooltip`), `HelpOutlineIcon` from `@mui/icons-material`.

---

## File Map

**New files:**
- `HusfelagJS/src/ui/HelpContext.js` — context + `useHelp()` hook + `HelpProvider`
- `HusfelagJS/src/ui/HelpDrawer.js` — the 380px right-side drawer component
- `HusfelagJS/src/ui/helpContent.js` — static Icelandic content map (all 9 sections)
- `HusfelagJS/src/ui/HelpDialogTitle.js` — reusable dialog title with "?" + "✕" buttons
- `HusfelagJS/src/assets/help/.gitkeep` — directory placeholder for future screenshots

**Modified files:**
- `HusfelagJS/src/App.js` — wrap `ProtectedRoute` with `HelpProvider`
- `HusfelagJS/src/controlers/Sidebar.js` — mount `<HelpDrawer />` at bottom of render
- `HusfelagJS/src/controlers/AssociationPage.js` — add "?" to Zone ① header
- `HusfelagJS/src/controlers/ApartmentsPage.js` — add "?" to Zone ① header
- `HusfelagJS/src/controlers/OwnersPage.js` — add "?" to Zone ① header
- `HusfelagJS/src/controlers/BudgetPage.js` — add "?" to Zone ① header
- `HusfelagJS/src/controlers/BudgetWizardPage.js` — add "?" to Zone ① header
- `HusfelagJS/src/controlers/CollectionPage.js` — add "?" to Zone ① header + use `HelpDialogTitle` in `ManualMatchDialog`
- `HusfelagJS/src/controlers/TransactionsPage.js` — add "?" to Zone ① header
- `HusfelagJS/src/controlers/ReportPage.js` — add "?" to Zone ① header

---

## Task 1: HelpContext

**Files:**
- Create: `HusfelagJS/src/ui/HelpContext.js`

- [ ] **Step 1: Write the file**

```js
// HusfelagJS/src/ui/HelpContext.js
import React, { createContext, useContext, useState } from 'react';

const HelpContext = createContext(null);

export function HelpProvider({ children }) {
    const [open, setOpen] = useState(false);
    const [section, setSection] = useState(null);

    const openHelp = (key) => { setSection(key); setOpen(true); };
    const closeHelp = () => setOpen(false);

    return (
        <HelpContext.Provider value={{ open, section, openHelp, closeHelp }}>
            {children}
        </HelpContext.Provider>
    );
}

export function useHelp() {
    return useContext(HelpContext);
}
```

- [ ] **Step 2: Verify the app still starts**

```bash
cd HusfelagJS && npm start
```
Expected: dev server starts with no errors (nothing visible has changed yet).

- [ ] **Step 3: Commit**

```bash
cd HusfelagJS
git add src/ui/HelpContext.js
git commit -m "feat: add HelpContext for in-app help system"
```

---

## Task 2: Help content

**Files:**
- Create: `HusfelagJS/src/ui/helpContent.js`
- Create: `HusfelagJS/src/assets/help/.gitkeep`

- [ ] **Step 1: Create the assets directory placeholder**

```bash
mkdir -p HusfelagJS/src/assets/help
touch HusfelagJS/src/assets/help/.gitkeep
```

- [ ] **Step 2: Write the content file**

```js
// HusfelagJS/src/ui/helpContent.js

export const HELP = {
    husfelag: {
        title: 'Húsfélag',
        intro: 'Húsfélag er lögaðili sem annast rekstur fjöleignarhúss. Hér eru skráðar grunnupplýsingar um félagið.',
        items: [
            {
                heading: 'Hvað er húsfélag?',
                body: 'Húsfélag er samtök allra eigenda í fjölbýlishúsi. Það sér um sameiginlegan kostnað eins og hita, rafmagn, tryggingar og viðhald.',
            },
            {
                heading: 'Kennitala húsfélags',
                body: 'Kennitala er 10 stafa auðkenni sem gefin er út af Þjóðskrá. Hún þarf að vera rétt skráð þar sem hún er notuð á reikninga og í samskiptum við stofnanir.',
            },
            {
                heading: 'Stillingar',
                body: 'Á þessari síðu er hægt að uppfæra nafn, heimilisfang og netfang húsfélags. Breytingar taka strax gildi.',
            },
        ],
    },

    ibudir: {
        title: 'Íbúðir',
        intro: 'Hér eru skráðar allar íbúðir í húsfélaginu ásamt hlutfalli eignarhluta hverrar íbúðar.',
        items: [
            {
                heading: 'Eignarhlutfall',
                body: 'Eignarhlutfall ákvarðar hversu stóran hluta af sameiginlegum kostnaði íbúðareigandi greiðir. Til dæmis: ef íbúð á 10% hlut greiðir hún 10% af mánaðarlegum húsgjöldum.',
            },
            {
                heading: 'Bæta við íbúð',
                body: 'Smelltu á "Bæta við íbúð" til að skrá nýja íbúð. Þú þarft að gefa upp íbúðarnúmer og eignarhlutfall. Samtals eignarhlutfall allra íbúða þarf að vera 100%.',
            },
            {
                heading: 'HMS innflutningur',
                body: 'Ef þú ert með skrá frá HMS (Húseigendamiðstöðinni) með íbúðalista geturðu flutt hann inn í einu lagi með því að nota "HMS innflutningur" hnappinn.',
            },
        ],
    },

    eigendur: {
        title: 'Eigendur',
        intro: 'Hér eru skráðir eigendur hverrar íbúðar. Nákvæmlega einn eigandi á hverri íbúð verður að vera skráður sem greiðandi.',
        items: [
            {
                heading: 'Eigandi vs. greiðandi',
                body: 'Íbúð getur átt fleiri en einn eiganda en nákvæmlega einn þeirra er greiðandinn — sá sem fær innheimtukröfuna á hverjum mánuði og er skráður á bankayfirlit.',
            },
            {
                heading: 'Skipta um greiðanda',
                body: 'Til að skipta um greiðanda: smelltu á íbúðina, veldu þann eiganda sem á að taka við greiðslum og merktu hann sem greiðanda. Gamli greiðandinn heldur eignarhlut sínum.',
            },
            {
                heading: 'Skrá nýjan eiganda',
                body: 'Smelltu á "Bæta við eiganda" á viðkomandi íbúð. Þú þarft kennitölu einstaklingsins. Ef hann er þegar skráður í kerfið tengist hann sjálfkrafa.',
            },
        ],
    },

    aaetlun: {
        title: 'Áætlun',
        intro: 'Árleg fjárhagsáætlun húsfélags. Áætlunin skiptist í flokka og ákvarðar mánaðarlegar húsgjaldakröfur.',
        items: [
            {
                heading: 'Hvernig virkar áætlunin?',
                body: 'Þú býrð til eina áætlun á ári. Heildarupphæðin skiptist jafnt á 12 mánuði og síðan á hverja íbúð miðað við eignarhlutfall. Þannig fær til dæmis 10% íbúð 1/10 af mánaðarlegri heildarupphæð.',
            },
            {
                heading: 'Flokkar',
                body: 'Áætlunin er sundurliðuð í útgjaldaflokka eins og Hitaveita, Rafmagn, Húseigendatrygging og Framkvæmdasjóður. Þetta gerir kleift að bera saman áætlaðan og raunverulegan kostnað á hvern flokk í yfirlitinu.',
            },
            {
                heading: 'Búa til nýja áætlun',
                body: 'Smelltu á "Ný áætlun" og fylgdu leiðsagnarferlinu. Þú munt vera beðinn um að slá inn upphæð fyrir hvern útgjaldaflokk. Þegar áætlun er virkjuð eru innheimtukröfur búnar til sjálfkrafa.',
            },
        ],
    },

    'aaetlun-wizard': {
        title: 'Búa til áætlun — leiðsögn',
        intro: 'Leiðsagnarferlið hjálpar þér að búa til nýja árslega fjárhagsáætlun í nokkrum skrefum.',
        items: [
            {
                heading: 'Skref 1 — Grunnupplýsingar',
                body: 'Veldu árið sem áætlunin gildir fyrir og gefðu henni nafn ef þú vilt. Venjulega er nóg að nota árið (t.d. 2025).',
            },
            {
                heading: 'Skref 2 — Útgjaldaflokkar',
                body: 'Bættu við útgjaldaflokkum og tilgreindu áætlaða upphæð fyrir hvern flokk. Þú getur skoðað fyrri ár til að fá viðmið. Heildarupphæðin ráðstafar mánaðarlegum húsgjöldum.',
            },
            {
                heading: 'Skref 3 — Staðfesting',
                body: 'Yfirfarðu sundurliðunina áður en þú staðfestir. Þegar þú staðfestir er áætlunin virkjuð og hægt er að búa til innheimtukröfur.',
            },
        ],
    },

    innheimta: {
        title: 'Innheimta',
        intro: 'Innheimta sýnir mánaðarlegar húsgjaldakröfur sem búnar eru til úr árlegri áætlun. Hér sérðu hvað hvert heimilisfang skuldar og hvort greiðsla hafi borist.',
        items: [
            {
                heading: 'Staða greiðslu',
                body: 'Hver innheimtufærsla er í einni af þremur stöðum: PENDING (á bið — greiðsla ekki borist), PAID (greidd — greiðsla fundið), eða OVERDUE (í vanskilum).',
            },
            {
                heading: 'Sjálfvirk samræming',
                body: 'Þegar þú flytur inn bankafærslur reynir kerfið sjálfkrafa að para greiðslur við opnar innheimtukröfur, miðað við kennitölu greiðanda og upphæð.',
            },
            {
                heading: 'Handvirk tenging',
                body: 'Ef kerfið getur ekki fundið samræmi sjálfkrafa geturðu tengt greiðslu handvirkt. Smelltu á tengihnappinn (🔗) við hliðina á PENDING kröfu og veldu viðeigandi bankafærslu úr listanum.',
            },
            {
                heading: 'Búa til innheimtu',
                body: 'Ef engar innheimtufærslur eru til staðar fyrir valinn mánuð skaltu smella á "Búa til" hnappinn. Kerfið les þá áætlun ársins og reiknar út upphæð hverrar íbúðar.',
            },
        ],
    },

    'innheimta-tengja': {
        title: 'Tengja greiðslu handvirkt',
        intro: 'Þegar kerfið getur ekki fundið samræmi sjálfkrafa getur þú valið bankafærslu handvirkt til að para við þessa innheimtukröfu.',
        items: [
            {
                heading: 'Hvernig á að velja greiðslu',
                body: 'Listinn sýnir óparaðar bankafærslur frá þessum greiðanda. Smelltu á línuna sem á við og staðfestu svo með "Tengja" hnappinum. Staðan breytist þá í PAID.',
            },
            {
                heading: 'Ef rétt greiðsla er ekki á listanum',
                body: 'Kerfið sýnir einungis færslur sem eru ekki þegar tengdar við aðra innheimtukröfu. Ef greiðslan er ekki sjáanleg gæti hún verið tengd annarri kröfu — farðu á Færslur síðuna til að skoða.',
            },
        ],
    },

    faerslur: {
        title: 'Færslur',
        intro: 'Hér eru allar bankafærslur á bankareikningum húsfélags. Færslur eru flokkaðar í útgjaldaflokka og greiðslur frá eigendum eru paraðar við innheimtukröfur.',
        items: [
            {
                heading: 'Innflutningur',
                body: 'Settu bankayfirlitið í CSV eða Excel sniði inn með því að smella á "Innflutningur". Kerfið les færslurnar og reynir að flokka þær sjálfkrafa.',
            },
            {
                heading: 'Flokkun',
                body: 'Þú getur flokkað hverja færslu handvirkt með því að velja flokk úr fellivalmynd. Rétt flokkun skiptir máli því hún birtist í sundurliðun yfirlitsins.',
            },
            {
                heading: 'Sjálfvirk flokkunarreglur',
                body: 'Undir "Flokkunarreglur" geturðu sett upp reglur sem flokka færslur sjálfkrafa eftir lýsingu. Til dæmis: allar færslur sem innihalda "Hitaveita" fá flokkinn Hitaveita.',
            },
        ],
    },

    yfirlit: {
        title: 'Yfirlit',
        intro: 'Fjárhagsyfirlit húsfélags. Sýnir tekjur, gjöld, samanburð við áætlun og stöðu ógreiddra húsgjalda.',
        items: [
            {
                heading: 'KPI spjöldin',
                body: 'Efst á síðunni eru þrjár tölur: heildar tekjur, heildar gjöld og ógreidd húsgjöld (PENDING innheimtufærslur). Þær gefa skjótta mynd af stöðu félagsins.',
            },
            {
                heading: 'Áætlun vs. raunveruleg gjöld',
                body: 'Töfluna sýnir hvern útgjaldaflokk með áætlaðri og raunverulegri upphæð. Rauður litur þýðir að raunveruleg gjöld fara yfir áætlun, grænn þýðir undir áætlun.',
            },
            {
                heading: 'Mánaðarlegt yfirlit',
                body: 'Súluritin sýna mánaðarlegar tekjur og gjöld yfir árið. Þetta hjálpar til við að greina óvenjulegar sveiflur eða stóra einstaka greiðslu.',
            },
        ],
    },
};
```

- [ ] **Step 3: Commit**

```bash
cd HusfelagJS
git add src/ui/helpContent.js src/assets/help/.gitkeep
git commit -m "feat: add Icelandic help content for all 9 sections"
```

---

## Task 3: HelpDrawer component

**Files:**
- Create: `HusfelagJS/src/ui/HelpDrawer.js`

- [ ] **Step 1: Write the component**

```js
// HusfelagJS/src/ui/HelpDrawer.js
import React from 'react';
import { Drawer, Box, Typography, IconButton, Divider } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useHelp } from './HelpContext';
import { HELP } from './helpContent';

export default function HelpDrawer() {
    const { open, section, closeHelp } = useHelp();
    const content = section ? HELP[section] : null;

    return (
        <Drawer
            anchor="right"
            open={open}
            onClose={closeHelp}
            variant="temporary"
            ModalProps={{ keepMounted: false }}
            PaperProps={{ sx: { width: 380, zIndex: 1400 } }}
        >
            <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                {/* Header */}
                <Box sx={{
                    display: 'flex', alignItems: 'center',
                    justifyContent: 'space-between',
                    px: 3, py: 2,
                    borderBottom: '1px solid #e8e8e8',
                    flexShrink: 0,
                }}>
                    <Typography variant="h6">
                        {content?.title ?? 'Hjálp'}
                    </Typography>
                    <IconButton size="small" onClick={closeHelp}>
                        <CloseIcon sx={{ fontSize: 20 }} />
                    </IconButton>
                </Box>

                {/* Body */}
                <Box sx={{ flex: 1, overflowY: 'auto', px: 3, py: 3 }}>
                    {!content && (
                        <Typography variant="body2" color="text.secondary">
                            Engar hjálparupplýsingar fundust.
                        </Typography>
                    )}
                    {content && (
                        <>
                            <Typography variant="body2" sx={{ mb: 2 }}>
                                {content.intro}
                            </Typography>
                            {content.items.map((item, i) => (
                                <Box key={i} sx={{ mb: 2.5 }}>
                                    <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                                        {item.heading}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary" sx={{ mb: item.image ? 1.5 : 0 }}>
                                        {item.body}
                                    </Typography>
                                    {item.image && (
                                        <Box
                                            component="img"
                                            src={`/help/${item.image}`}
                                            alt={item.heading}
                                            sx={{
                                                width: '100%',
                                                borderRadius: '8px',
                                                border: '1px solid #e8e8e8',
                                                display: 'block',
                                            }}
                                        />
                                    )}
                                </Box>
                            ))}
                        </>
                    )}
                </Box>
            </Box>
        </Drawer>
    );
}
```

- [ ] **Step 2: Commit**

```bash
cd HusfelagJS
git add src/ui/HelpDrawer.js
git commit -m "feat: add HelpDrawer slide-over panel component"
```

---

## Task 4: HelpDialogTitle component

**Files:**
- Create: `HusfelagJS/src/ui/HelpDialogTitle.js`

- [ ] **Step 1: Write the component**

```js
// HusfelagJS/src/ui/HelpDialogTitle.js
import React from 'react';
import { Box, Typography, IconButton, Tooltip } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { useHelp } from './HelpContext';

/**
 * Drop-in replacement for MUI DialogTitle that adds a "?" help icon
 * and a "✕" close icon to the right of the title text.
 *
 * Usage:
 *   <HelpDialogTitle helpSection="innheimta-tengja" onClose={onClose}>
 *     Tengja greiðslu
 *   </HelpDialogTitle>
 */
export default function HelpDialogTitle({ children, helpSection, onClose }) {
    const { openHelp } = useHelp();

    return (
        <Box sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 3,
            py: 2,
            borderBottom: '1px solid #e8e8e8',
        }}>
            <Typography variant="h6" component="div">
                {children}
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                {helpSection && (
                    <Tooltip title="Hjálp">
                        <IconButton size="small" onClick={() => openHelp(helpSection)}>
                            <HelpOutlineIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
                        </IconButton>
                    </Tooltip>
                )}
                {onClose && (
                    <IconButton size="small" onClick={onClose}>
                        <CloseIcon sx={{ fontSize: 20 }} />
                    </IconButton>
                )}
            </Box>
        </Box>
    );
}
```

- [ ] **Step 2: Commit**

```bash
cd HusfelagJS
git add src/ui/HelpDialogTitle.js
git commit -m "feat: add HelpDialogTitle component with help + close icons"
```

---

## Task 5: Wire HelpProvider and HelpDrawer into the app shell

**Files:**
- Modify: `HusfelagJS/src/App.js`
- Modify: `HusfelagJS/src/controlers/Sidebar.js`

- [ ] **Step 1: Update App.js — add HelpProvider import and wrap ProtectedRoute**

In `HusfelagJS/src/App.js`, add the import near the top:

```js
import { HelpProvider } from './ui/HelpContext';
```

Then wrap the `ProtectedRoute` component's return value so that all authenticated pages share the same context. Change the `ProtectedRoute` function from:

```js
function ProtectedRoute({ children }) {
  const { user, initializing } = React.useContext(UserContext);
  if (initializing) return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <CircularProgress color="secondary" />
    </Box>
  );
  if (!user) return <Navigate to="/login" replace />;
  return children;
}
```

to:

```js
function ProtectedRoute({ children }) {
  const { user, initializing } = React.useContext(UserContext);
  if (initializing) return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <CircularProgress color="secondary" />
    </Box>
  );
  if (!user) return <Navigate to="/login" replace />;
  return <HelpProvider>{children}</HelpProvider>;
}
```

- [ ] **Step 2: Update Sidebar.js — mount HelpDrawer**

Add imports at the top of `HusfelagJS/src/controlers/Sidebar.js`:

```js
import HelpDrawer from '../ui/HelpDrawer';
```

At the very end of the `SideBar` function's return statement, add `<HelpDrawer />` just before the closing `</Box>` of the root container. The root `Box` currently ends with:

```jsx
            <UserSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} user={user} setUser={setUser} />

            <Dialog open={switcherOpen} ...>
                ...
            </Dialog>
        </Box>
    );
```

Add `<HelpDrawer />` after the `Dialog`:

```jsx
            <UserSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} user={user} setUser={setUser} />

            <Dialog open={switcherOpen} ...>
                ...
            </Dialog>

            <HelpDrawer />
        </Box>
    );
```

- [ ] **Step 3: Verify the drawer opens**

Start the dev server: `cd HusfelagJS && npm start`  
In the browser console run: `window.__help_test = true` (just to confirm no errors).  
The app should load normally. No visible change yet — the "?" buttons come in later tasks.

- [ ] **Step 4: Commit**

```bash
cd HusfelagJS
git add src/App.js src/controlers/Sidebar.js
git commit -m "feat: wire HelpProvider and HelpDrawer into app shell"
```

---

## Task 6: Add "?" button to page headers

**Files:**
- Modify: `HusfelagJS/src/controlers/AssociationPage.js`
- Modify: `HusfelagJS/src/controlers/ApartmentsPage.js`
- Modify: `HusfelagJS/src/controlers/OwnersPage.js`
- Modify: `HusfelagJS/src/controlers/BudgetPage.js`
- Modify: `HusfelagJS/src/controlers/BudgetWizardPage.js`
- Modify: `HusfelagJS/src/controlers/CollectionPage.js`
- Modify: `HusfelagJS/src/controlers/TransactionsPage.js`
- Modify: `HusfelagJS/src/controlers/ReportPage.js`

The pattern is identical for every page. For each file:

1. Add these imports (if not already present):
```js
import { Tooltip, IconButton } from '@mui/material'; // may already be imported — add only missing ones
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { useHelp } from '../ui/HelpContext';
```

2. Inside the page component function, add:
```js
const { openHelp } = useHelp();
```

3. In Zone ① (the header `Box`), find the right-side `Box` that holds action buttons and append:
```jsx
<Tooltip title="Hjálp">
    <IconButton size="small" onClick={() => openHelp('<SECTION_KEY>')}>
        <HelpOutlineIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
    </IconButton>
</Tooltip>
```

Replace `<SECTION_KEY>` with the correct key per page:

| File | Section key |
|------|------------|
| `AssociationPage.js` | `husfelag` |
| `ApartmentsPage.js` | `ibudir` |
| `OwnersPage.js` | `eigendur` |
| `BudgetPage.js` | `aaetlun` |
| `BudgetWizardPage.js` | `aaetlun-wizard` |
| `CollectionPage.js` | `innheimta` |
| `TransactionsPage.js` | `faerslur` |
| `ReportPage.js` | `yfirlit` |

**Example — ApartmentsPage.js Zone ①** (lines 64–83), change from:

```jsx
<Box sx={{ px: 3, py: 2, background: '#fff', borderBottom: '1px solid #e8e8e8', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
    <Typography variant="h5">Íbúðir</Typography>
    <Box sx={{ display: 'flex', gap: 1 }}>
        <Button variant="outlined" sx={secondaryButtonSx} onClick={() => navigate('/ibudir/innflutningur')}>
            ⬇ HMS innflutningur
        </Button>
        <Button variant="contained" sx={primaryButtonSx} onClick={() => setShowForm(true)}>
            + Bæta við íbúð
        </Button>
    </Box>
</Box>
```

to:

```jsx
<Box sx={{ px: 3, py: 2, background: '#fff', borderBottom: '1px solid #e8e8e8', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
    <Typography variant="h5">Íbúðir</Typography>
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
        <Button variant="outlined" sx={secondaryButtonSx} onClick={() => navigate('/ibudir/innflutningur')}>
            ⬇ HMS innflutningur
        </Button>
        <Button variant="contained" sx={primaryButtonSx} onClick={() => setShowForm(true)}>
            + Bæta við íbúð
        </Button>
        <Tooltip title="Hjálp">
            <IconButton size="small" onClick={() => openHelp('ibudir')}>
                <HelpOutlineIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
            </IconButton>
        </Tooltip>
    </Box>
</Box>
```

Apply the same pattern to all 8 page files, using the correct section key from the table above.

- [ ] **Step 1: Apply to AssociationPage.js**
- [ ] **Step 2: Apply to ApartmentsPage.js**
- [ ] **Step 3: Apply to OwnersPage.js**
- [ ] **Step 4: Apply to BudgetPage.js**
- [ ] **Step 5: Apply to BudgetWizardPage.js**
- [ ] **Step 6: Apply to CollectionPage.js header only** (the dialog is handled in Task 7)
- [ ] **Step 7: Apply to TransactionsPage.js**
- [ ] **Step 8: Apply to ReportPage.js**

- [ ] **Step 9: Manual smoke test**

Start the dev server. Visit each page and click the "?" — the drawer should slide in from the right with the correct section title and content. Close it with the ✕ or by clicking the backdrop.

- [ ] **Step 10: Commit**

```bash
cd HusfelagJS
git add src/controlers/AssociationPage.js \
         src/controlers/ApartmentsPage.js \
         src/controlers/OwnersPage.js \
         src/controlers/BudgetPage.js \
         src/controlers/BudgetWizardPage.js \
         src/controlers/CollectionPage.js \
         src/controlers/TransactionsPage.js \
         src/controlers/ReportPage.js
git commit -m "feat: add help button to all page headers"
```

---

## Task 7: Add HelpDialogTitle to ManualMatchDialog

**Files:**
- Modify: `HusfelagJS/src/controlers/CollectionPage.js`

- [ ] **Step 1: Add the import**

In `CollectionPage.js`, add near the top with other UI imports:

```js
import HelpDialogTitle from '../ui/HelpDialogTitle';
```

- [ ] **Step 2: Replace DialogTitle in ManualMatchDialog**

In the `ManualMatchDialog` return (around line 330), change:

```jsx
<Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
    <DialogTitle>Tengja greiðslu við {row.payer_name ?? 'greiðanda'}</DialogTitle>
```

to:

```jsx
<Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
    <HelpDialogTitle helpSection="innheimta-tengja" onClose={onClose}>
        Tengja greiðslu við {row.payer_name ?? 'greiðanda'}
    </HelpDialogTitle>
```

Note: `HelpDialogTitle` renders its own container — do not wrap it in another `DialogTitle`. Also remove the `DialogActions` close button if it duplicates the ✕ in the title — check the existing `DialogActions` for a plain "Loka" / cancel button and keep it (it's different from the title-bar close).

- [ ] **Step 3: Manual smoke test**

Open the Innheimta page, open the manual match dialog (click the 🔗 icon on a PENDING row). Verify:
- Dialog title shows the title text on the left
- "?" and "✕" appear on the right
- Clicking "?" opens the help drawer with section `innheimta-tengja`
- The drawer appears in front of the dialog (z-index 1400 > dialog 1300)
- Clicking "✕" in the title closes the dialog

- [ ] **Step 4: Commit**

```bash
cd HusfelagJS
git add src/controlers/CollectionPage.js src/ui/HelpDialogTitle.js
git commit -m "feat: add help trigger to ManualMatchDialog"
```

---

## Self-Review

**Spec coverage check:**
- ✅ HelpContext with `openHelp` / `closeHelp` — Task 1
- ✅ Icelandic content for all 9 sections — Task 2
- ✅ HelpDrawer (380px, right, temporary, zIndex 1400) — Task 3
- ✅ HelpDialogTitle component — Task 4
- ✅ HelpProvider in App.js + HelpDrawer in Sidebar.js — Task 5
- ✅ "?" icon in all 8 page headers — Task 6
- ✅ HelpDialogTitle in ManualMatchDialog — Task 7
- ✅ No backend changes — confirmed, pure frontend
- ✅ Icelandic only — all content in Icelandic
- ✅ Static screenshot directory created — Task 2

**BudgetWizardPage note:** The spec lists it as a page with "?" in header. The BudgetWizardPage has no `DialogTitle` of its own (it's a full page, not a dialog), so only the header "?" is needed — already covered in Task 6.
