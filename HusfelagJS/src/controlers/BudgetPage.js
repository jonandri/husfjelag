import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box, Typography, CircularProgress, Paper,
    Table, TableHead, TableRow, TableCell, TableBody, TableFooter,
    Button, TextField, IconButton, Tooltip,
    Dialog, DialogTitle, DialogContent, DialogActions,
    Alert,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import { UserContext } from './UserContext';
import SideBar from './Sidebar';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8010';

const TYPE_LABELS = {
    SHARED: 'Sameiginlegt',
    SHARE2: 'Sameign',
    SHARE3: 'Lóð',
    EQUAL:  'Jafnskipt',
};

function BudgetPage() {
    const navigate = useNavigate();
    const { user } = React.useContext(UserContext);
    const [budget, setBudget] = useState(undefined);  // undefined = loading, null = none
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState('');
    const year = new Date().getFullYear();

    useEffect(() => {
        if (!user) { navigate('/login'); return; }
        loadBudget();
    }, [user]);

    const loadBudget = async () => {
        try {
            const resp = await fetch(`${API_URL}/Budget/${user.id}`);
            if (resp.ok) setBudget(await resp.json());
            else { setError('Villa við að sækja áætlun.'); setBudget(null); }
        } catch {
            setError('Tenging við þjón mistókst.');
            setBudget(null);
        }
    };

    const handleCreate = async () => {
        setError('');
        setCreating(true);
        try {
            const resp = await fetch(`${API_URL}/Budget`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: user.id }),
            });
            if (resp.ok) setBudget(await resp.json());
            else { const data = await resp.json(); setError(data.detail || 'Villa við stofnun áætlunar.'); }
        } catch {
            setError('Tenging við þjón mistókst.');
        } finally {
            setCreating(false);
        }
    };

    if (budget === undefined) {
        return (
            <div className="dashboard">
                <SideBar />
                <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8, flex: 1 }}>
                    <CircularProgress color="secondary" />
                </Box>
            </div>
        );
    }

    const budgetTitle = budget
        ? `Áætlun ${budget.year}${budget.version > 1 ? ` v${budget.version}` : ''}`
        : `Áætlun ${year}`;

    const total = budget
        ? budget.items.reduce((s, i) => s + parseFloat(i.amount || 0), 0)
        : 0;

    return (
        <div className="dashboard">
            <SideBar />
            <Box sx={{ p: 4, flex: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                    <Typography variant="h5">{budgetTitle}</Typography>
                    <Button
                        variant="contained" color="secondary" sx={{ color: '#fff' }}
                        disabled={creating} onClick={handleCreate}
                    >
                        {creating ? <CircularProgress size={20} color="inherit" /> : `+ Búa til nýja áætlun ${year}`}
                    </Button>
                </Box>

                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

                {!budget ? null : budget.items.length === 0 ? (
                    <Typography color="text.secondary" sx={{ mt: 4 }}>
                        Áætlun er til en engir flokkar eru skráðir. Farðu í „Flokkar" og bættu við flokki.
                    </Typography>
                ) : (
                    <Paper variant="outlined" sx={{ mt: 2 }}>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell>Flokkur</TableCell>
                                    <TableCell>Tegund</TableCell>
                                    <TableCell align="right">Upphæð (kr.)</TableCell>
                                    <TableCell sx={{ width: 48 }} />
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {[...budget.items]
                                    .sort((a, b) => a.category_name.localeCompare(b.category_name, 'is'))
                                    .map(item => (
                                        <BudgetItemRow
                                            key={item.id}
                                            item={item}
                                            onSaved={loadBudget}
                                        />
                                    ))}
                            </TableBody>
                            <TableFooter>
                                <TableRow sx={{ '& td': { fontWeight: 600, borderTop: '2px solid rgba(0,0,0,0.12)', color: 'text.primary' } }}>
                                    <TableCell>Samtals</TableCell>
                                    <TableCell />
                                    <TableCell align="right">
                                        {total.toLocaleString('is-IS', { minimumFractionDigits: 0 })} kr.
                                    </TableCell>
                                    <TableCell />
                                </TableRow>
                            </TableFooter>
                        </Table>
                    </Paper>
                )}
            </Box>
        </div>
    );
}

function BudgetItemRow({ item, onSaved }) {
    const [editOpen, setEditOpen] = useState(false);
    return (
        <>
            <TableRow hover>
                <TableCell>{item.category_name}</TableCell>
                <TableCell>{TYPE_LABELS[item.category_type] || item.category_type}</TableCell>
                <TableCell align="right">
                    {parseFloat(item.amount).toLocaleString('is-IS', { minimumFractionDigits: 0 })} kr.
                </TableCell>
                <TableCell align="right">
                    <Tooltip title="Breyta upphæð">
                        <IconButton size="small" onClick={() => setEditOpen(true)}>
                            <EditIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                </TableCell>
            </TableRow>
            <EditAmountDialog
                open={editOpen}
                onClose={() => setEditOpen(false)}
                item={item}
                onSaved={() => { setEditOpen(false); onSaved(); }}
            />
        </>
    );
}

function EditAmountDialog({ open, onClose, item, onSaved }) {
    const [amount, setAmount] = useState(String(item.amount));
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    React.useEffect(() => {
        if (open) { setAmount(String(item.amount)); setError(''); }
    }, [open, item]);

    const isValid = parseFloat(amount) >= 0 && !isNaN(parseFloat(amount));

    const handleSave = async () => {
        setError('');
        setSaving(true);
        try {
            const resp = await fetch(`${API_URL}/BudgetItem/update/${item.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ amount: parseFloat(amount) }),
            });
            if (resp.ok) onSaved();
            else { const data = await resp.json(); setError(data.detail || 'Villa við uppfærslu.'); }
        } catch {
            setError('Tenging við þjón mistókst.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle>Breyta upphæð</DialogTitle>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
                <Box>
                    <Typography variant="body1" fontWeight={500}>{item.category_name}</Typography>
                    <Typography variant="body2" color="text.secondary">
                        {TYPE_LABELS[item.category_type] || item.category_type}
                    </Typography>
                </Box>
                <TextField
                    label="Upphæð (kr.)"
                    value={amount}
                    onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                    size="small"
                    type="number"
                    inputProps={{ min: 0, step: 1 }}
                    fullWidth
                    autoFocus
                />
                {error && <Alert severity="error">{error}</Alert>}
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button onClick={onClose}>Hætta við</Button>
                <Button
                    variant="contained" color="secondary" sx={{ color: '#fff' }}
                    disabled={!isValid || saving} onClick={handleSave}
                >
                    {saving ? <CircularProgress size={18} color="inherit" /> : 'Vista'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

export default BudgetPage;
