# Manual Collection Match Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow a PENDING collection item to be manually linked to any positive unreconciled transaction from the same payer, regardless of month.

**Architecture:** New backend endpoint `GET /Collection/candidates/<collection_id>` returns candidate transactions for a payer. Frontend adds a link icon on PENDING rows that opens a dialog — `ManualMatchDialog` — which fetches candidates and lets the user select and confirm one. The existing `/Collection/match` POST endpoint does the actual linking unchanged.

**Tech Stack:** Django REST Framework (backend), React 17 + MUI v5 (frontend), existing `_resolve_assoc` auth pattern, existing `handleMatch` frontend function.

---

## File Structure

| File | Change |
|------|--------|
| `HusfelagPy/associations/views.py` | Add `CollectionCandidatesView` class after `CollectionUnmatchView` (line ~1816) |
| `HusfelagPy/associations/urls.py` | Import and register `CollectionCandidatesView` |
| `HusfelagPy/associations/tests.py` | Add `CollectionCandidatesViewTest` class |
| `HusfelagJS/src/controlers/CollectionPage.js` | Add `matchTarget` state, link icon on PENDING rows, `ManualMatchDialog` component |

---

### Task 1: Backend — `CollectionCandidatesView`

**Files:**
- Modify: `HusfelagPy/associations/views.py` after line 1815 (end of `CollectionUnmatchView`)
- Modify: `HusfelagPy/associations/urls.py` lines 9-11 (imports) and line 71 (urlpatterns)
- Test: `HusfelagPy/associations/tests.py` (append new test class)

- [ ] **Step 1: Write the failing test**

Append this class to the end of `HusfelagPy/associations/tests.py`:

```python
class CollectionCandidatesViewTest(TestCase):
    def setUp(self):
        import datetime as dt
        from decimal import Decimal
        self.client = Client()
        self.user = User.objects.create(kennitala="8888888881", name="Admin")
        self.payer = User.objects.create(kennitala="9999999991", name="Greiðandi")
        self.association = Association.objects.create(
            ssn="6060606060", name="Frambjóðendasfélag",
            address="Framgata 1", postal_code="101", city="Reykjavík"
        )
        AssociationAccess.objects.create(user=self.user, association=self.association, active=True)
        self.bank = BankAccount.objects.create(
            association=self.association, name="Reikningur", account_number="0101-26-000099"
        )
        self.budget = Budget.objects.create(
            association=self.association, year=2026, version=1, is_active=True
        )
        apt = Apartment.objects.create(
            association=self.association, anr="0101", fnr="F000099",
            share=Decimal("0"), share_2=Decimal("0"),
            share_3=Decimal("0"), share_eq=Decimal("100"),
        )
        ApartmentOwnership.objects.create(
            apartment=apt, user=self.payer, share=Decimal("100"), is_payer=True, deleted=False
        )
        self.collection = Collection.objects.create(
            budget=self.budget, apartment=apt, payer=self.payer,
            month=1, amount_shared=Decimal("0"), amount_equal=Decimal("17000"),
            amount_total=Decimal("17000"), status=CollectionStatus.PENDING,
        )
        # Transaction from December (different month than collection)
        self.tx_dec = Transaction.objects.create(
            bank_account=self.bank,
            date=dt.date(2025, 12, 28),
            amount=Decimal("17000"),
            description="Húsgjöld des",
            reference="",
            payer_kennitala="9999999991",
            status=TransactionStatus.IMPORTED,
        )
        # Reconciled transaction — should NOT appear in candidates
        self.tx_reconciled = Transaction.objects.create(
            bank_account=self.bank,
            date=dt.date(2025, 11, 5),
            amount=Decimal("17000"),
            description="Húsgjöld nóv",
            reference="",
            payer_kennitala="9999999991",
            status=TransactionStatus.RECONCILED,
        )

    def _get(self, collection_id=None):
        cid = collection_id or self.collection.id
        return self.client.get(
            f"/Collection/candidates/{cid}?user_id={self.user.id}"
        )

    def test_returns_unreconciled_transactions_for_payer(self):
        resp = self._get()
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["transaction_id"], self.tx_dec.id)
        self.assertEqual(data[0]["date"], "2025-12-28")
        self.assertIn("description", data[0])
        self.assertIn("amount", data[0])
        self.assertIn("bank_account_name", data[0])

    def test_excludes_reconciled_transactions(self):
        resp = self._get()
        ids = [r["transaction_id"] for r in resp.json()]
        self.assertNotIn(self.tx_reconciled.id, ids)

    def test_excludes_transactions_already_linked_to_another_collection(self):
        import datetime as dt
        from decimal import Decimal
        apt2 = Apartment.objects.create(
            association=self.association, anr="0202", fnr="F000098",
            share=Decimal("0"), share_2=Decimal("0"),
            share_3=Decimal("0"), share_eq=Decimal("100"),
        )
        other_col = Collection.objects.create(
            budget=self.budget, apartment=apt2, payer=self.payer,
            month=2, amount_shared=Decimal("0"), amount_equal=Decimal("17000"),
            amount_total=Decimal("17000"), status=CollectionStatus.PAID,
            paid_transaction=self.tx_dec,
        )
        resp = self._get()
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.json()), 0)

    def test_returns_404_for_unknown_collection(self):
        resp = self._get(collection_id=999999)
        self.assertEqual(resp.status_code, 404)

    def test_returns_400_if_collection_has_no_payer(self):
        import datetime as dt
        from decimal import Decimal
        apt3 = Apartment.objects.create(
            association=self.association, anr="0303", fnr="F000097",
            share=Decimal("0"), share_2=Decimal("0"),
            share_3=Decimal("0"), share_eq=Decimal("100"),
        )
        no_payer_col = Collection.objects.create(
            budget=self.budget, apartment=apt3, payer=None,
            month=3, amount_shared=Decimal("0"), amount_equal=Decimal("17000"),
            amount_total=Decimal("17000"), status=CollectionStatus.PENDING,
        )
        resp = self._get(collection_id=no_payer_col.id)
        self.assertEqual(resp.status_code, 400)
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd HusfelagPy
poetry run python3 manage.py test associations.tests.CollectionCandidatesViewTest -v 2
```

Expected: 5 failures — `404 Not Found` on `/Collection/candidates/...` (URL not registered yet)

- [ ] **Step 3: Implement `CollectionCandidatesView`**

In `HusfelagPy/associations/views.py`, insert after the closing line of `CollectionUnmatchView` (after `return Response({"collection_id": col.id, "status": col.status})` at line ~1815):

```python
class CollectionCandidatesView(APIView):
    def get(self, request, collection_id):
        """GET /Collection/candidates/<collection_id>
        Returns positive unreconciled transactions for the payer of this collection item,
        across all months/years. Excludes transactions already linked to another collection.
        Query params: user_id (required), ?as= (superadmin impersonation).
        """
        user_id = request.query_params.get("user_id")
        if not user_id:
            return Response({"detail": "user_id er nauðsynlegt."}, status=status.HTTP_400_BAD_REQUEST)

        association = _resolve_assoc(user_id, request)
        if not association:
            return Response({"detail": "Association not found."}, status=status.HTTP_404_NOT_FOUND)

        try:
            col = Collection.objects.select_related("payer").get(
                id=collection_id, budget__association=association
            )
        except Collection.DoesNotExist:
            return Response({"detail": "Innheimtufærsla ekki fundin."}, status=status.HTTP_404_NOT_FOUND)

        if not col.payer:
            return Response({"detail": "Innheimtufærslan hefur engan greiðanda."}, status=status.HTTP_400_BAD_REQUEST)

        txs = (
            Transaction.objects
            .filter(
                bank_account__association=association,
                payer_kennitala=col.payer.kennitala,
                amount__gt=0,
            )
            .exclude(status=TransactionStatus.RECONCILED)
            .exclude(collection_set__isnull=False)
            .select_related("bank_account")
            .order_by("-date")
        )

        return Response([
            {
                "transaction_id": tx.id,
                "date": str(tx.date),
                "description": tx.description,
                "amount": str(tx.amount),
                "bank_account_name": tx.bank_account.name,
            }
            for tx in txs
        ])
```

- [ ] **Step 4: Register the URL**

In `HusfelagPy/associations/urls.py`:

Change line 11 from:
```python
    CollectionGenerateView, CollectionMatchView, CollectionUnmatchView,
```
to:
```python
    CollectionGenerateView, CollectionMatchView, CollectionUnmatchView,
    CollectionCandidatesView,
```

Add to `urlpatterns` after line 70 (`path("Collection/unmatch", ...)`):
```python
    path("Collection/candidates/<int:collection_id>", CollectionCandidatesView.as_view(), name="collection-candidates"),
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd HusfelagPy
poetry run python3 manage.py test associations.tests.CollectionCandidatesViewTest -v 2
```

Expected: 5 tests pass

- [ ] **Step 6: Commit**

```bash
git add HusfelagPy/associations/views.py HusfelagPy/associations/urls.py HusfelagPy/associations/tests.py
git commit -m "feat: add CollectionCandidatesView for cross-month manual match"
```

---

### Task 2: Frontend — link icon + `ManualMatchDialog`

**Files:**
- Modify: `HusfelagJS/src/controlers/CollectionPage.js`

**Context on existing code:**
- `handleMatch(collectionId, transactionId)` already exists at line 82 — calls `POST /Collection/match` and reloads
- `handleUnmatch(collectionId)` exists at line 69
- The action column (last `TableCell` in each row, line 182) currently shows the unlink icon only for PAID rows
- Imports already include: `LinkOffIcon`, `IconButton`, `Tooltip`, `Alert`
- `API_URL`, `user`, `assocParam` are all available in component scope

- [ ] **Step 1: Add imports**

In `HusfelagJS/src/controlers/CollectionPage.js`, change:

```js
import LinkOffIcon from '@mui/icons-material/LinkOff';
```
to:
```js
import LinkOffIcon from '@mui/icons-material/LinkOff';
import AddLinkIcon from '@mui/icons-material/AddLink';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button, CircularProgress,
} from '@mui/material';
import { ghostButtonSx, primaryButtonSx } from '../ui/buttons';
import { AmountCell } from './tableUtils';
```

Note: check what is already imported — `primaryButtonSx` is already imported; only add what is missing. The exact additions needed are: `AddLinkIcon`, `Dialog`, `DialogTitle`, `DialogContent`, `DialogActions`, `CircularProgress`, `ghostButtonSx`, `AmountCell`. Remove duplicates from the import list if already present.

- [ ] **Step 2: Add `matchTarget` state**

In `CollectionPage`, after the existing `const [matchError, setMatchError] = useState('');` line, add:

```js
const [matchTarget, setMatchTarget] = useState(null); // collection row being manually matched
```

- [ ] **Step 3: Add link icon to PENDING rows**

Find the action `TableCell` in the rows map (currently around line 182):

```jsx
<TableCell align="right" sx={{ width: 40, pr: 1 }}>
    {row.status === 'PAID' && (
        <Tooltip title="Aftengja greiðslu">
            <IconButton size="small" onClick={() => handleUnmatch(row.collection_id)}>
                <LinkOffIcon fontSize="small" sx={{ color: '#bbb' }} />
            </IconButton>
        </Tooltip>
    )}
</TableCell>
```

Replace with:

```jsx
<TableCell align="right" sx={{ width: 40, pr: 1 }}>
    {row.status === 'PAID' && (
        <Tooltip title="Aftengja greiðslu">
            <IconButton size="small" onClick={() => handleUnmatch(row.collection_id)}>
                <LinkOffIcon fontSize="small" sx={{ color: '#bbb' }} />
            </IconButton>
        </Tooltip>
    )}
    {row.status === 'PENDING' && (
        <Tooltip title="Tengja greiðslu">
            <IconButton size="small" onClick={() => setMatchTarget(row)}>
                <AddLinkIcon fontSize="small" sx={{ color: '#bbb' }} />
            </IconButton>
        </Tooltip>
    )}
</TableCell>
```

- [ ] **Step 4: Mount `ManualMatchDialog` in the JSX**

Inside Zone 3 (`<Box sx={{ flex: 1, overflowY: 'auto', p: 3 }}>`) at the top, before the `{error && ...}` line, add:

```jsx
<ManualMatchDialog
    open={!!matchTarget}
    row={matchTarget}
    userId={user?.id}
    assocParam={assocParam}
    onClose={() => setMatchTarget(null)}
    onMatched={(collectionId, transactionId) => {
        setMatchTarget(null);
        handleMatch(collectionId, transactionId);
    }}
/>
```

- [ ] **Step 5: Add `ManualMatchDialog` component**

After the closing brace of `CollectionPage` (before `export default CollectionPage;`), add:

```jsx
function ManualMatchDialog({ open, row, userId, assocParam, onClose, onMatched }) {
    const [candidates, setCandidates] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [selected, setSelected] = useState(null);

    React.useEffect(() => {
        if (!open || !row) return;
        setSelected(null);
        setError('');
        setCandidates([]);
        setLoading(true);
        const qs = assocParam
            ? `${assocParam}&user_id=${userId}`
            : `?user_id=${userId}`;
        fetch(`${API_URL}/Collection/candidates/${row.collection_id}${qs}`)
            .then(r => r.ok ? r.json() : Promise.reject())
            .then(data => { setCandidates(data); setLoading(false); })
            .catch(() => { setError('Villa við að sækja greiðslur.'); setLoading(false); });
    }, [open, row]);

    if (!row) return null;

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>Tengja greiðslu við {row.payer_name}</DialogTitle>
            <DialogContent sx={{ pt: 1 }}>
                {loading && (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                        <CircularProgress size={24} color="secondary" />
                    </Box>
                )}
                {error && <Alert severity="error">{error}</Alert>}
                {!loading && !error && candidates.length === 0 && (
                    <Typography color="text.secondary" sx={{ py: 2 }}>
                        Engar ósamræmdar greiðslur fundust fyrir þennan greiðanda.
                    </Typography>
                )}
                {!loading && candidates.length > 0 && (
                    <Table size="small">
                        <TableHead sx={HEAD_SX}>
                            <TableRow>
                                <TableCell sx={HEAD_CELL_SX}>Dags.</TableCell>
                                <TableCell sx={HEAD_CELL_SX}>Lýsing</TableCell>
                                <TableCell sx={HEAD_CELL_SX}>Reikningur</TableCell>
                                <TableCell align="right" sx={HEAD_CELL_SX}>Upphæð</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {candidates.map(tx => (
                                <TableRow
                                    key={tx.transaction_id}
                                    hover
                                    selected={selected === tx.transaction_id}
                                    onClick={() => setSelected(tx.transaction_id)}
                                    sx={{ cursor: 'pointer', bgcolor: selected === tx.transaction_id ? 'rgba(29,54,111,0.06)' : undefined }}
                                >
                                    <TableCell sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>{tx.date}</TableCell>
                                    <TableCell>{tx.description}</TableCell>
                                    <TableCell sx={{ color: 'text.secondary', fontSize: 12 }}>{tx.bank_account_name}</TableCell>
                                    <AmountCell value={tx.amount} />
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button sx={ghostButtonSx} onClick={onClose}>Hætta við</Button>
                <Button
                    variant="contained" sx={primaryButtonSx}
                    disabled={!selected}
                    onClick={() => onMatched(row.collection_id, selected)}
                >
                    Tengja
                </Button>
            </DialogActions>
        </Dialog>
    );
}
```

- [ ] **Step 6: Verify in browser**

1. Start backend: `cd HusfelagPy && poetry run python3 manage.py runserver 8010`
2. Start frontend: `cd HusfelagJS && npm start`
3. Navigate to Innheimta, select a month with a PENDING item
4. Click the link icon on a PENDING row
5. Confirm the dialog opens and shows transactions from any month for that payer
6. Select a transaction and click "Tengja" — row should become PAID

- [ ] **Step 7: Commit**

```bash
git add HusfelagJS/src/controlers/CollectionPage.js
git commit -m "feat: add ManualMatchDialog for cross-month collection matching"
```
