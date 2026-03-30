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
