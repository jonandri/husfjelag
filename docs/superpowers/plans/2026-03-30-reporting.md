# Reporting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Skýrslur page showing an annual income/expense report with budget comparison, a monthly bar chart, and a month drill-down modal.

**Architecture:** A single new `ReportView` in `views.py` handles both the full-year and single-month requests (distinguished by a `?month=` param). The frontend `ReportPage.js` uses Recharts for the bar chart and MUI for the tables, following the same layout pattern as `CollectionPage.js`.

**Tech Stack:** Django 4.1, DRF, Django ORM aggregation (`Sum`), React 17, MUI v5, Recharts

---

## File Map

| File | Action | What changes |
|---|---|---|
| `HusfelagPy/associations/views.py` | Modify | Add `ReportView` class |
| `HusfelagPy/associations/urls.py` | Modify | Add `Report/<int:user_id>` URL |
| `HusfelagPy/associations/tests.py` | Modify | Add `ReportViewTest` class |
| `HusfelagJS/src/controlers/ReportPage.js` | Create | Full report page component |
| `HusfelagJS/src/controlers/Sidebar.js` | Modify | Add Skýrslur nav entry |
| `HusfelagJS/src/App.js` | Modify | Add import + `/skyrslur` route |

---

## Task 1: Backend — ReportView

**Files:**
- Modify: `HusfelagPy/associations/views.py`
- Modify: `HusfelagPy/associations/urls.py`
- Modify: `HusfelagPy/associations/tests.py`

- [ ] **Step 1: Write the failing tests**

Open `HusfelagPy/associations/tests.py` and append this class at the end of the file:

```python
import datetime as _datetime_module


class ReportViewTest(TestCase):
    def setUp(self):
        self.client = Client()
        self.user = User.objects.create(kennitala="7777777779", name="Skýrslumaður")
        self.association = Association.objects.create(
            ssn="7070707070", name="Skýrslufélag",
            address="Skýrslugata 1", postal_code="107", city="Reykjavík"
        )
        AssociationAccess.objects.create(user=self.user, association=self.association, active=True)
        self.cat_heat = Category.objects.create(name="Hitaveita", type="SHARED")
        self.cat_elec = Category.objects.create(name="Rafmagn", type="SHARED")
        self.bank = BankAccount.objects.create(
            association=self.association,
            name="Aðalreikningur",
            account_number="0101-26-123456",
        )

    def _tx(self, amount, cat=None, date=None):
        from decimal import Decimal
        return Transaction.objects.create(
            bank_account=self.bank,
            date=date or _datetime_module.date(2026, 3, 15),
            amount=Decimal(str(amount)),
            description="Test",
            reference='',
            category=cat,
            status=TransactionStatus.CATEGORISED if cat else TransactionStatus.IMPORTED,
        )

    def test_income_and_expense_totals(self):
        from decimal import Decimal
        self._tx(400000)                         # income uncategorised
        self._tx(-95000, cat=self.cat_heat)      # expense categorised
        resp = self.client.get(f"/Report/{self.user.id}?year=2026&as={self.association.id}")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(Decimal(data["income_uncategorised"]), Decimal("400000"))
        self.assertEqual(len(data["expenses"]), 1)
        self.assertEqual(Decimal(data["expenses"][0]["actual"]), Decimal("95000"))

    def test_budget_comparison(self):
        from decimal import Decimal
        from .models import Budget, BudgetItem
        budget = Budget.objects.create(
            association=self.association, year=2026, version=1, is_active=True
        )
        BudgetItem.objects.create(budget=budget, category=self.cat_heat, amount=Decimal("1200000"))
        self._tx(-950000, cat=self.cat_heat)
        resp = self.client.get(f"/Report/{self.user.id}?year=2026&as={self.association.id}")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        expense = data["expenses"][0]
        self.assertEqual(Decimal(expense["budgeted"]), Decimal("1200000"))
        self.assertEqual(Decimal(expense["actual"]), Decimal("950000"))

    def test_budget_item_with_no_transactions_returns_zero_actual(self):
        from decimal import Decimal
        from .models import Budget, BudgetItem
        budget = Budget.objects.create(
            association=self.association, year=2026, version=1, is_active=True
        )
        BudgetItem.objects.create(budget=budget, category=self.cat_elec, amount=Decimal("600000"))
        resp = self.client.get(f"/Report/{self.user.id}?year=2026&as={self.association.id}")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        expense = next(e for e in data["expenses"] if e["category_id"] == self.cat_elec.id)
        self.assertEqual(Decimal(expense["actual"]), Decimal("0"))

    def test_expense_with_no_budget_returns_zero_budgeted(self):
        from decimal import Decimal
        self._tx(-85000, cat=self.cat_heat)
        resp = self.client.get(f"/Report/{self.user.id}?year=2026&as={self.association.id}")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(Decimal(data["expenses"][0]["budgeted"]), Decimal("0"))

    def test_uncategorised_income_and_expense(self):
        from decimal import Decimal
        self._tx(100000)
        self._tx(-50000)
        resp = self.client.get(f"/Report/{self.user.id}?year=2026&as={self.association.id}")
        data = resp.json()
        self.assertEqual(Decimal(data["income_uncategorised"]), Decimal("100000"))
        self.assertEqual(Decimal(data["expenses_uncategorised"]), Decimal("50000"))

    def test_year_param(self):
        self._tx(-100000, cat=self.cat_heat, date=_datetime_module.date(2025, 6, 1))
        resp = self.client.get(f"/Report/{self.user.id}?year=2025&as={self.association.id}")
        data = resp.json()
        self.assertEqual(data["year"], 2025)
        self.assertEqual(len(data["expenses"]), 1)

    def test_month_param_filters_to_single_month(self):
        from decimal import Decimal
        self._tx(-100000, cat=self.cat_heat, date=_datetime_module.date(2026, 3, 15))
        self._tx(-200000, cat=self.cat_heat, date=_datetime_module.date(2026, 4, 10))
        resp = self.client.get(
            f"/Report/{self.user.id}?year=2026&month=3&as={self.association.id}"
        )
        data = resp.json()
        self.assertEqual(Decimal(data["expenses"][0]["actual"]), Decimal("100000"))
        self.assertEqual(data["monthly"], [])

    def test_no_transactions_returns_zeros(self):
        from decimal import Decimal
        resp = self.client.get(f"/Report/{self.user.id}?year=2026&as={self.association.id}")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["income"], [])
        self.assertEqual(Decimal(data["income_uncategorised"]), Decimal("0"))
        self.assertEqual(data["expenses"], [])
        self.assertEqual(Decimal(data["expenses_uncategorised"]), Decimal("0"))
        self.assertEqual(len(data["monthly"]), 12)

    def test_monthly_breakdown(self):
        from decimal import Decimal
        self._tx(400000, date=_datetime_module.date(2026, 1, 10))
        self._tx(-95000, cat=self.cat_heat, date=_datetime_module.date(2026, 1, 15))
        resp = self.client.get(f"/Report/{self.user.id}?year=2026&as={self.association.id}")
        data = resp.json()
        jan = data["monthly"][0]
        self.assertEqual(jan["month"], 1)
        self.assertEqual(Decimal(jan["income"]), Decimal("400000"))
        self.assertEqual(Decimal(jan["expenses"]), Decimal("95000"))

    def test_superadmin_as_param(self):
        superadmin = User.objects.create(
            kennitala="9999999998", name="Admin2", is_superadmin=True
        )
        resp = self.client.get(
            f"/Report/{superadmin.id}?year=2026&as={self.association.id}"
        )
        self.assertEqual(resp.status_code, 200)
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd HusfelagPy
poetry run python manage.py test associations.tests.ReportViewTest -v 2
```

Expected: All tests FAIL with errors like `Not Found: /Report/...` or `AttributeError`.

- [ ] **Step 3: Implement ReportView**

Open `HusfelagPy/associations/views.py`. At the very end of the file, append:

```python
class ReportView(APIView):
    def get(self, request, user_id):
        """
        GET /Report/<user_id>?year=YYYY
        GET /Report/<user_id>?year=YYYY&month=M
        Full-year or single-month financial report for the association.
        Positive amounts = income; negative amounts = expenses (shown as absolute values).
        """
        association = _resolve_assoc(user_id, request)
        if not association:
            return Response({"detail": "Association not found."}, status=status.HTTP_404_NOT_FOUND)

        year_param = request.query_params.get("year")
        year = int(year_param) if year_param and year_param.isdigit() else datetime.date.today().year

        month_param = request.query_params.get("month")
        month = int(month_param) if month_param and month_param.isdigit() else None

        # Base transaction queryset for this association and year
        txn_qs = Transaction.objects.filter(
            bank_account__association=association,
            date__year=year,
        )
        if month:
            txn_qs = txn_qs.filter(date__month=month)

        # --- Income ---
        income_rows = (
            txn_qs.filter(amount__gt=0, category__isnull=False)
            .values("category_id", "category__name")
            .annotate(actual=django_models.Sum("amount"))
            .order_by("category__name")
        )
        income = [
            {
                "category_id": r["category_id"],
                "category_name": r["category__name"],
                "actual": str(r["actual"]),
            }
            for r in income_rows
        ]

        income_uncategorised = (
            txn_qs.filter(amount__gt=0, category__isnull=True)
            .aggregate(total=django_models.Sum("amount"))["total"]
            or Decimal("0")
        )

        # --- Expenses ---
        expense_rows = (
            txn_qs.filter(amount__lt=0, category__isnull=False)
            .values("category_id", "category__name")
            .annotate(actual_neg=django_models.Sum("amount"))
            .order_by("category__name")
        )
        actual_by_cat = {r["category_id"]: abs(r["actual_neg"]) for r in expense_rows}
        cat_names = {r["category_id"]: r["category__name"] for r in expense_rows}

        # Budget items for the active budget of this year
        budget = Budget.objects.filter(
            association=association, year=year, is_active=True
        ).first()
        budgeted_by_cat = {}
        if budget:
            for item in BudgetItem.objects.filter(budget=budget).select_related("category"):
                budgeted_by_cat[item.category_id] = item.amount
                cat_names.setdefault(item.category_id, item.category.name)

        all_expense_cat_ids = set(actual_by_cat.keys()) | set(budgeted_by_cat.keys())
        expenses = sorted(
            [
                {
                    "category_id": cid,
                    "category_name": cat_names[cid],
                    "budgeted": str(budgeted_by_cat.get(cid, Decimal("0"))),
                    "actual": str(actual_by_cat.get(cid, Decimal("0"))),
                }
                for cid in all_expense_cat_ids
            ],
            key=lambda x: x["category_name"],
        )

        expenses_uncategorised = (
            txn_qs.filter(amount__lt=0, category__isnull=True)
            .aggregate(total=django_models.Sum("amount"))["total"]
            or Decimal("0")
        )

        # --- Monthly breakdown (full-year mode only) ---
        monthly = []
        if not month:
            for m in range(1, 13):
                mqs = txn_qs.filter(date__month=m)
                inc = mqs.filter(amount__gt=0).aggregate(
                    t=django_models.Sum("amount")
                )["t"] or Decimal("0")
                exp = mqs.filter(amount__lt=0).aggregate(
                    t=django_models.Sum("amount")
                )["t"] or Decimal("0")
                monthly.append({"month": m, "income": str(inc), "expenses": str(abs(exp))})

        return Response({
            "year": year,
            "income": income,
            "income_uncategorised": str(income_uncategorised),
            "expenses": expenses,
            "expenses_uncategorised": str(abs(expenses_uncategorised)),
            "monthly": monthly,
        })
```

- [ ] **Step 4: Add URL pattern**

Open `HusfelagPy/associations/urls.py`.

Add `ReportView` to the import line (at the top of the file):
```python
from .views import (
    AssociationView, AssociationLookupView, AssociationRoleView, AssociationListView,
    AdminAssociationView, ApartmentView, ApartmentOwnerView, OwnerView,
    CategoryView, CategoryListView,
    AccountingKeyListView, AccountingKeyView,
    BankAccountView, TransactionView,
    ImportPreviewView, ImportConfirmView,
    CategoryRuleView,
    BudgetView, BudgetItemView, BudgetWizardView, CollectionView,
    ApartmentImportSourcesView, ApartmentImportPreviewView, ApartmentImportConfirmView,
    ReportView,
)
```

Add the URL pattern at the end of `urlpatterns`:
```python
    path("Report/<int:user_id>", ReportView.as_view(), name="report"),
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd HusfelagPy
poetry run python manage.py test associations.tests.ReportViewTest -v 2
```

Expected: All 10 tests PASS.

- [ ] **Step 6: Run full test suite to confirm no regressions**

```bash
cd HusfelagPy
poetry run python manage.py test associations -v 1
```

Expected: All tests pass (previously 110; now 120).

- [ ] **Step 7: Commit**

```bash
git add HusfelagPy/associations/views.py HusfelagPy/associations/urls.py HusfelagPy/associations/tests.py
git -c gpg.format=openpgp -c commit.gpgsign=false commit -m "feat: add ReportView backend endpoint"
```

---

## Task 2: Frontend — ReportPage

**Files:**
- Create: `HusfelagJS/src/controlers/ReportPage.js`

- [ ] **Step 1: Install recharts**

```bash
cd HusfelagJS
npm install recharts
```

Expected: `recharts` added to `package.json` dependencies. No errors.

- [ ] **Step 2: Create ReportPage.js**

Create `HusfelagJS/src/controlers/ReportPage.js` with this content:

```javascript
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box, Typography, CircularProgress, Paper, Select, MenuItem,
    Table, TableHead, TableRow, TableCell, TableBody, TableFooter,
    Alert, Dialog, DialogTitle, DialogContent, DialogActions, Button,
} from '@mui/material';
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { UserContext } from './UserContext';
import SideBar from './Sidebar';
import { fmtAmount } from '../format';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8010';

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'Maí', 'Jún', 'Júl', 'Ágú', 'Sep', 'Okt', 'Nóv', 'Des'];

const HEAD_SX = { backgroundColor: '#f5f5f5' };
const HEAD_CELL_SX = { fontWeight: 600, fontSize: '0.78rem', color: '#555', whiteSpace: 'nowrap' };

const VARIANCE_COLOR = (budgeted, actual) => {
    const diff = parseFloat(budgeted) - parseFloat(actual);
    if (diff > 0) return '#2e7d32';   // under budget — green
    if (diff < 0) return '#c62828';   // over budget — red
    return '#888';                     // exact
};

function SectionHeading({ label, color }) {
    return (
        <Typography sx={{
            fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.5px',
            color, mb: 1, mt: 3,
        }}>
            {label}
        </Typography>
    );
}

function TotalsRow({ cells }) {
    return (
        <TableFooter>
            <TableRow sx={{ '& td': { fontWeight: 600, borderTop: '2px solid rgba(0,0,0,0.12)', color: 'text.primary' } }}>
                {cells}
            </TableRow>
        </TableFooter>
    );
}

function ReportPage() {
    const navigate = useNavigate();
    const { user, assocParam } = React.useContext(UserContext);
    const currentYear = new Date().getFullYear();
    const [year, setYear] = useState(currentYear);
    const [data, setData] = useState(undefined);
    const [error, setError] = useState('');
    const [drillMonth, setDrillMonth] = useState(null);
    const [drillData, setDrillData] = useState(null);
    const [drillLoading, setDrillLoading] = useState(false);

    useEffect(() => {
        if (!user) { navigate('/login'); return; }
        setData(undefined);
        setError('');
        const qs = assocParam ? `${assocParam}&year=${year}` : `?year=${year}`;
        fetch(`${API_URL}/Report/${user.id}${qs}`)
            .then(r => r.ok ? r.json() : Promise.reject())
            .then(setData)
            .catch(() => {
                setError('Villa við að sækja skýrslugögn.');
                setData(null);
            });
    }, [user, assocParam, year]);

    const openDrill = (month) => {
        setDrillMonth(month);
        setDrillData(null);
        setDrillLoading(true);
        const qs = assocParam
            ? `${assocParam}&year=${year}&month=${month}`
            : `?year=${year}&month=${month}`;
        fetch(`${API_URL}/Report/${user.id}${qs}`)
            .then(r => r.ok ? r.json() : Promise.reject())
            .then(d => { setDrillData(d); setDrillLoading(false); })
            .catch(() => setDrillLoading(false));
    };

    const closeDrill = () => { setDrillMonth(null); setDrillData(null); };

    if (data === undefined) {
        return (
            <div className="dashboard">
                <SideBar />
                <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8, flex: 1 }}>
                    <CircularProgress color="secondary" />
                </Box>
            </div>
        );
    }

    const income = data?.income ?? [];
    const incomeUncat = parseFloat(data?.income_uncategorised ?? 0);
    const expenses = data?.expenses ?? [];
    const expenseUncat = parseFloat(data?.expenses_uncategorised ?? 0);
    const monthly = data?.monthly ?? [];

    const totalIncome = income.reduce((s, r) => s + parseFloat(r.actual), 0) + incomeUncat;
    const totalExpenseBudgeted = expenses.reduce((s, r) => s + parseFloat(r.budgeted), 0);
    const totalExpenseActual = expenses.reduce((s, r) => s + parseFloat(r.actual), 0) + expenseUncat;
    const net = totalIncome - totalExpenseActual;

    const chartData = monthly.map((m, i) => ({
        month: MONTH_LABELS[i],
        income: parseFloat(m.income),
        expenses: parseFloat(m.expenses),
        isFuture: parseFloat(m.income) === 0 && parseFloat(m.expenses) === 0,
    }));

    const yearOptions = [];
    for (let y = currentYear; y >= currentYear - 4; y--) yearOptions.push(y);

    return (
        <div className="dashboard">
            <SideBar />
            <Box sx={{ p: 4, flex: 1, overflowY: 'auto', minWidth: 0 }}>

                {/* Header */}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                    <Typography variant="h5">Skýrslur</Typography>
                    <Select
                        size="small"
                        value={year}
                        onChange={e => setYear(e.target.value)}
                        sx={{ minWidth: 90 }}
                    >
                        {yearOptions.map(y => (
                            <MenuItem key={y} value={y}>{y}</MenuItem>
                        ))}
                    </Select>
                </Box>

                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

                {/* Monthly bar chart */}
                <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
                    <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.5px', color: '#888', mb: 1.5 }}>
                        MÁNAÐARLEG HREYFING
                    </Typography>
                    <ResponsiveContainer width="100%" height={160}>
                        <BarChart
                            data={chartData}
                            barGap={2}
                            barCategoryGap="30%"
                            onClick={(payload) => {
                                if (payload && payload.activeLabel) {
                                    const idx = MONTH_LABELS.indexOf(payload.activeLabel);
                                    if (idx !== -1) openDrill(idx + 1);
                                }
                            }}
                            style={{ cursor: 'pointer' }}
                        >
                            <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                            <YAxis hide />
                            <Tooltip
                                formatter={(value, name) => [fmtAmount(value), name === 'income' ? 'Tekjur' : 'Gjöld']}
                                labelFormatter={label => label}
                            />
                            <Bar dataKey="income" name="Tekjur" radius={[2, 2, 0, 0]}>
                                {chartData.map((entry, index) => (
                                    <Cell key={index} fill={entry.isFuture ? '#e0e0e0' : '#08C076'} />
                                ))}
                            </Bar>
                            <Bar dataKey="expenses" name="Gjöld" radius={[2, 2, 0, 0]}>
                                {chartData.map((entry, index) => (
                                    <Cell key={index} fill={entry.isFuture ? '#e0e0e0' : '#e57373'} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                    <Typography variant="caption" color="text.disabled" sx={{ mt: 0.5, display: 'block' }}>
                        Smelltu á mánuð til að sjá sundurliðun
                    </Typography>
                </Paper>

                {/* Income section */}
                <SectionHeading label="TEKJUR" color="#08C076" />
                <Paper variant="outlined" sx={{ mb: 3 }}>
                    <Table size="small">
                        <TableHead sx={HEAD_SX}>
                            <TableRow>
                                <TableCell sx={HEAD_CELL_SX}>Flokkur</TableCell>
                                <TableCell sx={{ ...HEAD_CELL_SX, textAlign: 'right' }}>Raun</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {income.map(row => (
                                <TableRow key={row.category_id} hover>
                                    <TableCell>{row.category_name}</TableCell>
                                    <TableCell align="right" sx={{ color: '#2e7d32' }}>
                                        {fmtAmount(row.actual)}
                                    </TableCell>
                                </TableRow>
                            ))}
                            {incomeUncat > 0 && (
                                <TableRow hover>
                                    <TableCell sx={{ color: '#aaa', fontStyle: 'italic' }}>Óflokkað</TableCell>
                                    <TableCell align="right" sx={{ color: '#aaa' }}>
                                        {fmtAmount(incomeUncat)}
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                        <TotalsRow cells={[
                            <TableCell key="lbl">Samtals tekjur</TableCell>,
                            <TableCell key="val" align="right" sx={{ color: '#2e7d32' }}>
                                {fmtAmount(totalIncome)}
                            </TableCell>,
                        ]} />
                    </Table>
                </Paper>

                {/* Expense section */}
                <SectionHeading label="GJÖLD" color="#c62828" />
                <Paper variant="outlined" sx={{ mb: 3 }}>
                    <Table size="small">
                        <TableHead sx={HEAD_SX}>
                            <TableRow>
                                <TableCell sx={HEAD_CELL_SX}>Flokkur</TableCell>
                                <TableCell sx={{ ...HEAD_CELL_SX, textAlign: 'right' }}>Áætlun</TableCell>
                                <TableCell sx={{ ...HEAD_CELL_SX, textAlign: 'right' }}>Raun</TableCell>
                                <TableCell sx={{ ...HEAD_CELL_SX, textAlign: 'right' }}>Frávik</TableCell>
                                <TableCell sx={{ ...HEAD_CELL_SX, textAlign: 'right' }}>%</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {expenses.map(row => {
                                const budgeted = parseFloat(row.budgeted);
                                const actual = parseFloat(row.actual);
                                const variance = budgeted - actual;
                                const pct = budgeted > 0 ? (actual / budgeted) * 100 : null;
                                const color = VARIANCE_COLOR(budgeted, actual);
                                return (
                                    <TableRow key={row.category_id} hover>
                                        <TableCell>{row.category_name}</TableCell>
                                        <TableCell align="right" sx={{ color: '#888' }}>
                                            {budgeted > 0 ? fmtAmount(budgeted) : <span style={{ color: '#ccc' }}>—</span>}
                                        </TableCell>
                                        <TableCell align="right">{fmtAmount(actual)}</TableCell>
                                        <TableCell align="right" sx={{ color }}>
                                            {budgeted > 0
                                                ? (variance >= 0 ? '+' : '') + fmtAmount(variance)
                                                : <span style={{ color: '#ccc' }}>—</span>
                                            }
                                        </TableCell>
                                        <TableCell align="right" sx={{ color }}>
                                            {pct !== null ? `${Math.round(pct)}%` : <span style={{ color: '#ccc' }}>—</span>}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                            {expenseUncat > 0 && (
                                <TableRow hover>
                                    <TableCell sx={{ color: '#aaa', fontStyle: 'italic' }}>Óflokkað</TableCell>
                                    <TableCell align="right"><span style={{ color: '#ccc' }}>—</span></TableCell>
                                    <TableCell align="right" sx={{ color: '#aaa' }}>{fmtAmount(expenseUncat)}</TableCell>
                                    <TableCell align="right"><span style={{ color: '#ccc' }}>—</span></TableCell>
                                    <TableCell align="right"><span style={{ color: '#ccc' }}>—</span></TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                        <TotalsRow cells={[
                            <TableCell key="lbl">Samtals gjöld</TableCell>,
                            <TableCell key="bud" align="right" sx={{ color: '#888' }}>
                                {fmtAmount(totalExpenseBudgeted)}
                            </TableCell>,
                            <TableCell key="act" align="right">{fmtAmount(totalExpenseActual)}</TableCell>,
                            <TableCell key="var" align="right"
                                sx={{ color: VARIANCE_COLOR(totalExpenseBudgeted, totalExpenseActual) }}
                            >
                                {(() => {
                                    const v = totalExpenseBudgeted - totalExpenseActual;
                                    return (v >= 0 ? '+' : '') + fmtAmount(v);
                                })()}
                            </TableCell>,
                            <TableCell key="pct" align="right"
                                sx={{ color: VARIANCE_COLOR(totalExpenseBudgeted, totalExpenseActual) }}
                            >
                                {totalExpenseBudgeted > 0
                                    ? `${Math.round((totalExpenseActual / totalExpenseBudgeted) * 100)}%`
                                    : '—'
                                }
                            </TableCell>,
                        ]} />
                    </Table>
                </Paper>

                {/* Net result */}
                <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
                    <Table size="small">
                        <TableBody>
                            <TableRow sx={{ backgroundColor: '#1D366F' }}>
                                <TableCell sx={{ color: '#fff', fontWeight: 600, fontSize: '0.9rem' }}>
                                    Niðurstaða (Tekjur − Gjöld)
                                </TableCell>
                                <TableCell align="right"
                                    sx={{ color: net >= 0 ? '#80cbc4' : '#ef9a9a', fontWeight: 600, fontSize: '0.9rem' }}
                                >
                                    {(net >= 0 ? '+' : '') + fmtAmount(net)}
                                </TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                </Paper>

                {/* Month drill-down dialog */}
                <Dialog open={drillMonth !== null} onClose={closeDrill} maxWidth="sm" fullWidth>
                    <DialogTitle sx={{ color: '#1D366F', fontWeight: 600 }}>
                        {drillMonth !== null ? `${MONTH_LABELS[drillMonth - 1]} ${year}` : ''}
                    </DialogTitle>
                    <DialogContent>
                        {drillLoading && (
                            <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                                <CircularProgress color="secondary" />
                            </Box>
                        )}
                        {drillData && !drillLoading && (() => {
                            const dIncome = drillData.income ?? [];
                            const dIncUncat = parseFloat(drillData.income_uncategorised ?? 0);
                            const dExpenses = drillData.expenses ?? [];
                            const dExpUncat = parseFloat(drillData.expenses_uncategorised ?? 0);
                            const dTotalInc = dIncome.reduce((s, r) => s + parseFloat(r.actual), 0) + dIncUncat;
                            const dTotalExp = dExpenses.reduce((s, r) => s + parseFloat(r.actual), 0) + dExpUncat;
                            const dNet = dTotalInc - dTotalExp;
                            return (
                                <>
                                    <SectionHeading label="TEKJUR" color="#08C076" />
                                    <Table size="small" sx={{ mb: 2 }}>
                                        <TableBody>
                                            {dIncome.map(r => (
                                                <TableRow key={r.category_id}>
                                                    <TableCell>{r.category_name}</TableCell>
                                                    <TableCell align="right" sx={{ color: '#2e7d32' }}>
                                                        {fmtAmount(r.actual)}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                            {dIncUncat > 0 && (
                                                <TableRow>
                                                    <TableCell sx={{ color: '#aaa', fontStyle: 'italic' }}>Óflokkað</TableCell>
                                                    <TableCell align="right" sx={{ color: '#aaa' }}>
                                                        {fmtAmount(dIncUncat)}
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                            <TableRow sx={{ '& td': { fontWeight: 600, borderTop: '1px solid rgba(0,0,0,0.12)' } }}>
                                                <TableCell>Samtals</TableCell>
                                                <TableCell align="right" sx={{ color: '#2e7d32' }}>
                                                    {fmtAmount(dTotalInc)}
                                                </TableCell>
                                            </TableRow>
                                        </TableBody>
                                    </Table>

                                    <SectionHeading label="GJÖLD" color="#c62828" />
                                    <Table size="small" sx={{ mb: 2 }}>
                                        <TableBody>
                                            {dExpenses.map(r => (
                                                <TableRow key={r.category_id}>
                                                    <TableCell>{r.category_name}</TableCell>
                                                    <TableCell align="right">{fmtAmount(r.actual)}</TableCell>
                                                </TableRow>
                                            ))}
                                            {dExpUncat > 0 && (
                                                <TableRow>
                                                    <TableCell sx={{ color: '#aaa', fontStyle: 'italic' }}>Óflokkað</TableCell>
                                                    <TableCell align="right" sx={{ color: '#aaa' }}>
                                                        {fmtAmount(dExpUncat)}
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                            <TableRow sx={{ '& td': { fontWeight: 600, borderTop: '1px solid rgba(0,0,0,0.12)' } }}>
                                                <TableCell>Samtals</TableCell>
                                                <TableCell align="right">{fmtAmount(dTotalExp)}</TableCell>
                                            </TableRow>
                                        </TableBody>
                                    </Table>

                                    <Box sx={{
                                        backgroundColor: '#1D366F', borderRadius: 1, px: 2, py: 1,
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    }}>
                                        <Typography sx={{ color: '#fff', fontWeight: 600, fontSize: '0.85rem' }}>
                                            Niðurstaða {MONTH_LABELS[drillMonth - 1]}
                                        </Typography>
                                        <Typography sx={{
                                            color: dNet >= 0 ? '#80cbc4' : '#ef9a9a',
                                            fontWeight: 600, fontSize: '0.85rem',
                                        }}>
                                            {(dNet >= 0 ? '+' : '') + fmtAmount(dNet)}
                                        </Typography>
                                    </Box>
                                </>
                            );
                        })()}
                    </DialogContent>
                    <DialogActions sx={{ px: 2 }}>
                        <Button onClick={closeDrill}>Loka</Button>
                    </DialogActions>
                </Dialog>

            </Box>
        </div>
    );
}

export default ReportPage;
```

- [ ] **Step 3: Verify the app builds without errors**

```bash
cd HusfelagJS
npm run build 2>&1 | tail -20
```

Expected: Build succeeds with `Compiled successfully` or similar. No import errors.

- [ ] **Step 4: Commit**

```bash
git add HusfelagJS/src/controlers/ReportPage.js HusfelagJS/package.json HusfelagJS/package-lock.json
git -c gpg.format=openpgp -c commit.gpgsign=false commit -m "feat: add ReportPage with bar chart and month drill-down"
```

---

## Task 3: Wiring — Sidebar and App.js

**Files:**
- Modify: `HusfelagJS/src/controlers/Sidebar.js`
- Modify: `HusfelagJS/src/App.js`

- [ ] **Step 1: Add Skýrslur to Sidebar.js**

Open `HusfelagJS/src/controlers/Sidebar.js`.

Add the import at the top with the other MUI icon imports (around line 20):
```javascript
import BarChartOutlinedIcon from '@mui/icons-material/BarChartOutlined';
```

Add the nav entry to the `NAV` array. Insert after `/flokkunarreglur` and before `/innheimta`:
```javascript
const NAV = [
    { path: '/husfelag',  label: 'Húsfélag',  icon: <BusinessOutlinedIcon              sx={{ fontSize: 20 }} /> },
    { path: '/ibudir',    label: 'Íbúðir',    icon: <HomeOutlinedIcon                  sx={{ fontSize: 20 }} /> },
    { path: '/eigendur',  label: 'Eigendur',  icon: <GroupOutlinedIcon                 sx={{ fontSize: 20 }} /> },
    { path: '/aaetlun',   label: 'Áætlun',    icon: <AssessmentOutlinedIcon            sx={{ fontSize: 20 }} /> },
    { path: '/faerslur',         label: 'Færslur',          icon: <ReceiptLongOutlinedIcon           sx={{ fontSize: 20 }} /> },
    { path: '/flokkunarreglur',  label: 'Flokkunarreglur',  icon: <LabelOutlinedIcon                 sx={{ fontSize: 20 }} /> },
    { path: '/skyrslur',         label: 'Skýrslur',         icon: <BarChartOutlinedIcon              sx={{ fontSize: 20 }} /> },
    { path: '/innheimta',        label: 'Innheimta',        icon: <AccountBalanceWalletOutlinedIcon  sx={{ fontSize: 20 }} /> },
];
```

- [ ] **Step 2: Add route to App.js**

Open `HusfelagJS/src/App.js`.

Add the import after the existing `CategorisationRulesPage` import:
```javascript
import ReportPage from './controlers/ReportPage';
```

Add the route after the `/flokkunarreglur` route:
```jsx
<Route path="/skyrslur" element={<ReportPage />} />
```

- [ ] **Step 3: Verify the app builds**

```bash
cd HusfelagJS
npm run build 2>&1 | tail -20
```

Expected: Build succeeds. No errors.

- [ ] **Step 4: Commit**

```bash
git add HusfelagJS/src/controlers/Sidebar.js HusfelagJS/src/App.js
git -c gpg.format=openpgp -c commit.gpgsign=false commit -m "feat: add Skýrslur to sidebar and routing"
```
