import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box, Typography, CircularProgress, Paper, Select, MenuItem,
    Table, TableHead, TableRow, TableCell, TableBody, TableFooter,
    Alert, Dialog, DialogTitle, DialogContent, DialogActions, Button,
    IconButton, Tooltip as MuiTooltip, Grid,
} from '@mui/material';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { useHelp } from '../ui/HelpContext';
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { UserContext } from './UserContext';
import SideBar from './Sidebar';
import { fmtAmount } from '../format';
import { ghostButtonSx } from '../ui/buttons';
import { HEAD_SX, HEAD_CELL_SX, AmountCell } from './tableUtils';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8010';

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'Maí', 'Jún', 'Júl', 'Ágú', 'Sep', 'Okt', 'Nóv', 'Des'];
const MONTH_NAMES_FULL = ['Janúar', 'Febrúar', 'Mars', 'Apríl', 'Maí', 'Júní', 'Júlí', 'Ágúst', 'September', 'Október', 'Nóvember', 'Desember'];

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
    const { openHelp } = useHelp();
    const currentYear = new Date().getFullYear();
    const [year, setYear] = useState(currentYear);
    const [data, setData] = useState(undefined);
    const [budgetTotal, setBudgetTotal] = useState(null);
    const [budgetName, setBudgetName] = useState(null);
    const [monthlyTotal, setMonthlyTotal] = useState(null);
    const [unpaidTotal, setUnpaidTotal] = useState(null);
    const [error, setError] = useState('');
    const [drillMonth, setDrillMonth] = useState(null);
    const [drillData, setDrillData] = useState(null);
    const [drillLoading, setDrillLoading] = useState(false);
    const [drillError, setDrillError] = useState('');
    const [catDrill, setCatDrill] = useState(null); // { category_id, category_name }
    const [catTxs, setCatTxs] = useState([]);
    const [catLoading, setCatLoading] = useState(false);
    const [catError, setCatError] = useState('');

    useEffect(() => {
        if (!user) return;
        Promise.all([
            fetch(`${API_URL}/Budget/${user.id}${assocParam}`),
            fetch(`${API_URL}/Collection/${user.id}${assocParam}`),
        ]).then(async ([budgetResp, collResp]) => {
            if (budgetResp.ok) {
                const budget = await budgetResp.json();
                if (budget?.items) {
                    setBudgetTotal(budget.items.reduce((s, i) => s + parseFloat(i.amount || 0), 0));
                    if (budget.name) setBudgetName(budget.name);
                }
            }
            if (collResp.ok) {
                const col = await collResp.json();
                if (col?.rows) setMonthlyTotal(col.rows.reduce((s, r) => s + parseFloat(r.monthly || 0), 0));
                if (col?.pending_total !== undefined) setUnpaidTotal(parseFloat(col.pending_total));
            }
        }).catch(() => {});
    }, [user, assocParam]);

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
        if (!user) return;
        setDrillMonth(month);
        setDrillData(null);
        setDrillLoading(true);
        setDrillError('');
        const qs = assocParam
            ? `${assocParam}&year=${year}&month=${month}`
            : `?year=${year}&month=${month}`;
        fetch(`${API_URL}/Report/${user.id}${qs}`)
            .then(r => r.ok ? r.json() : Promise.reject())
            .then(d => { setDrillData(d); setDrillLoading(false); })
            .catch(() => { setDrillLoading(false); setDrillError('Villa við að sækja mánaðargögn.'); });
    };

    const closeDrill = () => { setDrillMonth(null); setDrillData(null); setDrillError(''); };

    const openCatDrill = (categoryId, categoryName) => {
        setCatDrill({ category_id: categoryId, category_name: categoryName });
        setCatTxs([]);
        setCatLoading(true);
        setCatError('');
        const params = new URLSearchParams({ year });
        const qs = assocParam ? `${assocParam}&${params}` : `?${params}`;
        fetch(`${API_URL}/Transaction/${user.id}${qs}`)
            .then(r => r.ok ? r.json() : Promise.reject())
            .then(txs => {
                setCatTxs(txs.filter(tx => tx.category?.id === categoryId));
                setCatLoading(false);
            })
            .catch(() => { setCatLoading(false); setCatError('Villa við að sækja færslur.'); });
    };
    const closeCatDrill = () => { setCatDrill(null); setCatTxs([]); setCatError(''); };

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

    const chartData = monthly.map((m) => ({
        month: MONTH_LABELS[m.month - 1],
        income: parseFloat(m.income),
        expenses: parseFloat(m.expenses),
        isFuture: parseFloat(m.income) === 0 && parseFloat(m.expenses) === 0,
    }));

    const yearOptions = [];
    for (let y = currentYear; y >= currentYear - 4; y--) yearOptions.push(y);

    return (
        <div className="dashboard">
            <SideBar />
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
                {/* Zone 1: Header */}
                <Box sx={{ px: 3, py: 2, background: '#fff', borderBottom: '1px solid #e8e8e8', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                    <Typography variant="h5">Yfirlit</Typography>
                    <MuiTooltip title="Hjálp">
                        <IconButton size="small" onClick={() => openHelp('yfirlit')}>
                            <HelpOutlineIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
                        </IconButton>
                    </MuiTooltip>
                </Box>
                {/* Zone 2: Toolbar — year selector */}
                <Box sx={{ px: 3, py: 1, background: '#fafafa', borderBottom: '1px solid #e8e8e8', display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
                    <Select size="small" value={year} onChange={e => setYear(e.target.value)} sx={{ minWidth: 90, fontSize: 13 }}>
                        {yearOptions.map(y => <MenuItem key={y} value={y}>{y}</MenuItem>)}
                    </Select>
                </Box>
                {/* Zone 3: Content */}
                <Box sx={{ flex: 1, overflowY: 'auto', p: 3 }}>

                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

                {/* Financial KPIs */}
                <Grid container spacing={2} sx={{ mb: 3 }}>
                    {[
                        { label: budgetName || `Áætlun ${year}`, value: budgetTotal !== null ? fmtAmount(budgetTotal) : '—', alert: false },
                        { label: 'Mánaðarleg innheimta', value: monthlyTotal !== null ? fmtAmount(monthlyTotal) : '—', alert: false },
                        { label: 'Ógreidd innheimta', value: unpaidTotal !== null ? fmtAmount(unpaidTotal) : '—', alert: unpaidTotal > 0 },
                    ].map(({ label, value, alert }) => (
                        <Grid item xs={12} sm={4} key={label} sx={{ display: 'flex' }}>
                            <Paper variant="outlined" sx={{ p: 3, textAlign: 'center', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 100 }}>
                                <Typography variant="h6" sx={{ fontWeight: 400, lineHeight: 1.2, color: alert ? '#c62828' : 'secondary.main' }}>
                                    {value}
                                </Typography>
                                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                                    {label}
                                </Typography>
                            </Paper>
                        </Grid>
                    ))}
                </Grid>

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
                                <TableRow key={row.category_id} hover sx={{ cursor: 'pointer' }}
                                    onClick={() => openCatDrill(row.category_id, row.category_name)}>
                                    <TableCell>{row.category_name}</TableCell>
                                    <AmountCell value={row.actual} />
                                </TableRow>
                            ))}
                            {incomeUncat > 0 && (
                                <TableRow hover>
                                    <TableCell sx={{ color: '#aaa', fontStyle: 'italic' }}>Óflokkað</TableCell>
                                    <AmountCell value={incomeUncat} />
                                </TableRow>
                            )}
                        </TableBody>
                        <TotalsRow cells={[
                            <TableCell key="lbl">Samtals tekjur</TableCell>,
                            <AmountCell key="val" value={totalIncome} />,
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
                                    <TableRow key={row.category_id} hover sx={{ cursor: 'pointer' }}
                                        onClick={() => openCatDrill(row.category_id, row.category_name)}>
                                        <TableCell>{row.category_name}</TableCell>
                                        <TableCell align="right" sx={{ fontFamily: 'monospace', whiteSpace: 'nowrap', color: '#888' }}>
                                            {budgeted > 0 ? fmtAmount(-budgeted) : <span style={{ color: '#ccc' }}>—</span>}
                                        </TableCell>
                                        <AmountCell value={actual > 0 ? -actual : actual} />
                                        {budgeted > 0
                                            ? <AmountCell value={variance} />
                                            : <TableCell align="right"><span style={{ color: '#ccc' }}>—</span></TableCell>
                                        }
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
                                    <AmountCell value={-expenseUncat} />
                                    <TableCell align="right"><span style={{ color: '#ccc' }}>—</span></TableCell>
                                    <TableCell align="right"><span style={{ color: '#ccc' }}>—</span></TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                        <TotalsRow cells={[
                            <TableCell key="lbl">Samtals gjöld</TableCell>,
                            <TableCell key="bud" align="right" sx={{ fontFamily: 'monospace', whiteSpace: 'nowrap', color: '#888' }}>
                                {fmtAmount(-totalExpenseBudgeted)}
                            </TableCell>,
                            <AmountCell key="act" value={-totalExpenseActual} />,
                            <AmountCell key="var" value={totalExpenseBudgeted - totalExpenseActual} />,
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
                                <TableCell align="right" sx={{ fontFamily: 'monospace', color: net >= 0 ? '#a5d6a7' : '#ef9a9a', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                    {fmtAmount(net)}
                                </TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                </Paper>

                {/* Category transactions dialog */}
                <Dialog open={catDrill !== null} onClose={closeCatDrill} maxWidth="sm" fullWidth>
                    <DialogTitle sx={{ color: '#1D366F', fontWeight: 600 }}>
                        {catDrill?.category_name}
                    </DialogTitle>
                    <DialogContent>
                        {catLoading && (
                            <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                                <CircularProgress color="secondary" />
                            </Box>
                        )}
                        {catError && <Alert severity="error">{catError}</Alert>}
                        {!catLoading && !catError && catTxs.length === 0 && (
                            <Typography color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                                Engar færslur fundust.
                            </Typography>
                        )}
                        {!catLoading && catTxs.length > 0 && (() => {
                            const total = catTxs.reduce((s, tx) => s + parseFloat(tx.amount), 0);
                            return (
                                <Table size="small">
                                    <TableHead sx={HEAD_SX}>
                                        <TableRow>
                                            <TableCell sx={HEAD_CELL_SX}>Dagsetning</TableCell>
                                            <TableCell sx={HEAD_CELL_SX}>Lýsing</TableCell>
                                            <TableCell sx={{ ...HEAD_CELL_SX, textAlign: 'right' }}>Upphæð</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {catTxs.map(tx => {
                                            const amt = parseFloat(tx.amount);
                                            const dateStr = new Date(tx.date).toLocaleDateString('is-IS', { day: 'numeric', month: 'long' });
                                            return (
                                                <TableRow key={tx.id}>
                                                    <TableCell sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>{dateStr}</TableCell>
                                                    <TableCell>{tx.description}</TableCell>
                                                    <AmountCell value={amt} />
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                    <TotalsRow cells={[
                                        <TableCell key="lbl" colSpan={2}>Samtals</TableCell>,
                                        <TableCell key="val" align="right" sx={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                                            {fmtAmount(total)}
                                        </TableCell>,
                                    ]} />
                                </Table>
                            );
                        })()}
                    </DialogContent>
                    <DialogActions sx={{ px: 2 }}>
                        <Button sx={ghostButtonSx} onClick={closeCatDrill}>Loka</Button>
                    </DialogActions>
                </Dialog>

                {/* Month drill-down dialog */}
                <Dialog open={drillMonth !== null} onClose={closeDrill} maxWidth="sm" fullWidth>
                    <DialogTitle sx={{ color: '#1D366F', fontWeight: 600 }}>
                        {drillMonth !== null ? `${MONTH_NAMES_FULL[drillMonth - 1]} ${year}` : ''}
                    </DialogTitle>
                    <DialogContent>
                        {drillLoading && (
                            <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                                <CircularProgress color="secondary" />
                            </Box>
                        )}
                        {drillError && !drillLoading && (
                            <Alert severity="error" sx={{ mt: 1 }}>{drillError}</Alert>
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
                                                    <AmountCell value={r.actual} />
                                                </TableRow>
                                            ))}
                                            {dIncUncat > 0 && (
                                                <TableRow>
                                                    <TableCell sx={{ color: '#aaa', fontStyle: 'italic' }}>Óflokkað</TableCell>
                                                    <AmountCell value={dIncUncat} />
                                                </TableRow>
                                            )}
                                            <TableRow sx={{ '& td': { fontWeight: 600, borderTop: '1px solid rgba(0,0,0,0.12)' } }}>
                                                <TableCell>Samtals</TableCell>
                                                <AmountCell value={dTotalInc} />
                                            </TableRow>
                                        </TableBody>
                                    </Table>

                                    <SectionHeading label="GJÖLD" color="#c62828" />
                                    <Table size="small" sx={{ mb: 2 }}>
                                        <TableBody>
                                            {dExpenses.map(r => (
                                                <TableRow key={r.category_id}>
                                                    <TableCell>{r.category_name}</TableCell>
                                                    <AmountCell value={r.actual} />
                                                </TableRow>
                                            ))}
                                            {dExpUncat > 0 && (
                                                <TableRow>
                                                    <TableCell sx={{ color: '#aaa', fontStyle: 'italic' }}>Óflokkað</TableCell>
                                                    <AmountCell value={dExpUncat} />
                                                </TableRow>
                                            )}
                                            <TableRow sx={{ '& td': { fontWeight: 600, borderTop: '1px solid rgba(0,0,0,0.12)' } }}>
                                                <TableCell>Samtals</TableCell>
                                                <AmountCell value={dTotalExp} />
                                            </TableRow>
                                        </TableBody>
                                    </Table>

                                    <Box sx={{
                                        backgroundColor: '#1D366F', borderRadius: 1, px: 2, py: 1,
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    }}>
                                        <Typography sx={{ color: '#fff', fontWeight: 600, fontSize: '0.85rem' }}>
                                            Niðurstaða {MONTH_NAMES_FULL[drillMonth - 1]}
                                        </Typography>
                                        <Typography sx={{
                                            color: dNet >= 0 ? '#80cbc4' : '#ef9a9a',
                                            fontWeight: 600, fontSize: '0.85rem',
                                        }}>
                                            {fmtAmount(dNet)}
                                        </Typography>
                                    </Box>
                                </>
                            );
                        })()}
                    </DialogContent>
                    <DialogActions sx={{ px: 2 }}>
                        <Button sx={ghostButtonSx} onClick={closeDrill}>Loka</Button>
                    </DialogActions>
                </Dialog>

                </Box>{/* Zone 3 end */}
            </Box>{/* flex column end */}
        </div>
    );
}

export default ReportPage;
