import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box, Typography, CircularProgress, Paper,
    Table, TableHead, TableRow, TableCell, TableBody,
    Button, TextField, Collapse, IconButton, Tooltip,
    Dialog, DialogTitle, DialogContent, DialogActions,
    Alert, MenuItem, Select, FormControl, InputLabel,
    DialogContentText,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import { UserContext } from './UserContext';
import SideBar from './Sidebar';
import { useSort, HEAD_SX, HEAD_CELL_SX } from './tableUtils';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8010';

const CATEGORY_TYPES = [
    { value: 'SHARED', label: 'Sameiginlegt' },
    { value: 'SHARE2', label: 'Hiti' },
    { value: 'SHARE3', label: 'Lóð' },
    { value: 'EQUAL',  label: 'Jafnskipt' },
    { value: 'INCOME', label: 'Tekjur' },
];

const typeLabel = (type) => CATEGORY_TYPES.find(t => t.value === type)?.label || type;

function CategoriesPage() {
    const navigate = useNavigate();
    const { user, assocParam } = React.useContext(UserContext);
    const [categories, setCategories] = useState(undefined);
    const [error, setError] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [showDisabled, setShowDisabled] = useState(false);
    const { sort, lbl } = useSort('name');

    useEffect(() => {
        if (!user) { navigate('/login'); return; }
        loadCategories();
    }, [user, assocParam]);

    const loadCategories = async () => {
        try {
            const resp = await fetch(`${API_URL}/Category/${user.id}${assocParam}`);
            if (resp.ok) setCategories(await resp.json());
            else { setError('Villa við að sækja flokka.'); setCategories([]); }
        } catch {
            setError('Tenging við þjón mistókst.');
            setCategories([]);
        }
    };

    if (categories === undefined) {
        return (
            <div className="dashboard">
                <SideBar />
                <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8, flex: 1 }}>
                    <CircularProgress color="secondary" />
                </Box>
            </div>
        );
    }

    const active = categories.filter(c => !c.deleted);
    const disabled = categories.filter(c => c.deleted);

    return (
        <div className="dashboard">
            <SideBar />
            <Box sx={{ p: 4, flex: 1, overflowY: 'auto', minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                    <Typography variant="h5">Flokkar</Typography>
                    <Button
                        variant="contained" color="secondary" sx={{ color: '#fff' }}
                        onClick={() => setShowForm(v => !v)}
                    >
                        {showForm ? 'Loka skráningarformi' : '+ Bæta við flokk'}
                    </Button>
                </Box>

                <Collapse in={showForm}>
                    <AddCategoryForm
                        userId={user.id}
                        assocParam={assocParam}
                        onCreated={() => { setShowForm(false); loadCategories(); }}
                    />
                </Collapse>

                {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

                {active.length === 0 ? (
                    <Typography color="text.secondary" sx={{ mt: 4 }}>
                        Enginn flokkur skráður. Smelltu á „+ Bæta við flokk" til að hefja skráningu.
                    </Typography>
                ) : (
                    <Paper variant="outlined" sx={{ mt: 2 }}>
                        <Table size="small">
                            <TableHead sx={HEAD_SX}>
                                <TableRow>
                                    <TableCell sx={HEAD_CELL_SX}>{lbl('name', 'Nafn')}</TableCell>
                                    <TableCell sx={HEAD_CELL_SX}>{lbl('type', 'Tegund')}</TableCell>
                                    <TableCell />
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {sort(active).map(c => (
                                    <CategoryRow key={c.id} category={c} onSaved={loadCategories} />
                                ))}
                            </TableBody>
                        </Table>
                    </Paper>
                )}

                {disabled.length > 0 && (
                    <Box sx={{ mt: 3 }}>
                        <Button
                            size="small" variant="text" color="inherit"
                            sx={{ color: 'text.secondary', textTransform: 'none', p: 0, minWidth: 0 }}
                            onClick={() => setShowDisabled(v => !v)}
                        >
                            {showDisabled ? '▲' : '▼'} Óvirkir flokkar ({disabled.length})
                        </Button>
                        <Collapse in={showDisabled}>
                            <Paper variant="outlined" sx={{ mt: 1 }}>
                                <Table size="small">
                                    <TableHead sx={HEAD_SX}>
                                        <TableRow>
                                            <TableCell sx={HEAD_CELL_SX}>Nafn</TableCell>
                                            <TableCell sx={HEAD_CELL_SX}>Tegund</TableCell>
                                            <TableCell />
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {sort(disabled).map(c => (
                                            <CategoryRow key={c.id} category={c} onSaved={loadCategories} isDisabled />
                                        ))}
                                    </TableBody>
                                </Table>
                            </Paper>
                        </Collapse>
                    </Box>
                )}
            </Box>
        </div>
    );
}

function AddCategoryForm({ userId, assocParam, onCreated }) {
    const [name, setName] = useState('');
    const [type, setType] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const isValid = name.trim() && type;

    const handleSubmit = async () => {
        setError('');
        setSaving(true);
        try {
            const resp = await fetch(`${API_URL}/Category${assocParam}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId, name: name.trim(), type }),
            });
            if (resp.ok) {
                setName(''); setType('');
                onCreated();
            } else {
                const data = await resp.json();
                setError(data.detail || 'Villa við skráningu.');
            }
        } catch {
            setError('Tenging við þjón mistókst.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Paper variant="outlined" sx={{ p: 3, mb: 3, display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 480 }}>
            <Typography variant="subtitle1">Skrá nýjan flokk</Typography>
            <TextField
                label="Nafn flokks"
                value={name}
                onChange={e => setName(e.target.value)}
                size="small"
                fullWidth
            />
            <FormControl size="small" fullWidth>
                <InputLabel>Tegund</InputLabel>
                <Select value={type} label="Tegund" onChange={e => setType(e.target.value)}>
                    {CATEGORY_TYPES.map(t => (
                        <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
                    ))}
                </Select>
            </FormControl>
            {error && <Alert severity="error">{error}</Alert>}
            <Button
                variant="contained" color="secondary" sx={{ color: '#fff', alignSelf: 'flex-start' }}
                disabled={!isValid || saving} onClick={handleSubmit}
            >
                {saving ? <CircularProgress size={20} color="inherit" /> : 'Vista flokk'}
            </Button>
        </Paper>
    );
}

function CategoryRow({ category, onSaved, isDisabled }) {
    const [editOpen, setEditOpen] = useState(false);
    return (
        <>
            <TableRow hover sx={isDisabled ? { opacity: 0.55 } : {}}>
                <TableCell>{category.name}</TableCell>
                <TableCell>{typeLabel(category.type)}</TableCell>
                <TableCell align="right" sx={{ width: 48 }}>
                    <Tooltip title={isDisabled ? 'Virkja / breyta' : 'Breyta'}>
                        <IconButton size="small" onClick={() => setEditOpen(true)}>
                            <EditIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                </TableCell>
            </TableRow>
            <EditCategoryDialog
                open={editOpen}
                onClose={() => setEditOpen(false)}
                category={category}
                isDisabled={isDisabled}
                onSaved={() => { setEditOpen(false); onSaved(); }}
            />
        </>
    );
}

function EditCategoryDialog({ open, onClose, category, isDisabled, onSaved }) {
    const { user } = React.useContext(UserContext);
    const [name, setName] = useState(category.name);
    const [type, setType] = useState(category.type);
    const [saving, setSaving] = useState(false);
    const [disabling, setDisabling] = useState(false);
    const [confirmDisable, setConfirmDisable] = useState(false);
    const [error, setError] = useState('');
    const [accountingKeys, setAccountingKeys] = React.useState([]);
    const [expenseAccountId, setExpenseAccountId] = React.useState(category.expense_account_id || '');
    const [incomeAccountId, setIncomeAccountId] = React.useState(category.income_account_id || '');

    React.useEffect(() => {
        if (open) {
            setName(category.name);
            setType(category.type);
            setError('');
            setExpenseAccountId(category.expense_account_id || '');
            setIncomeAccountId(category.income_account_id || '');
            fetch(`${API_URL}/AccountingKey/list`)
                .then(r => r.ok ? r.json() : [])
                .then(data => setAccountingKeys(data))
                .catch(() => {});
        }
    }, [open, category]);

    const isValid = name.trim() && type;

    const handleSave = async () => {
        setError('');
        setSaving(true);
        const url = `${API_URL}/Category/update/${category.id}`;
        try {
            const resp = await fetch(url, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: user?.id, name: name.trim(), type, expense_account_id: expenseAccountId || null, income_account_id: incomeAccountId || null }),
            });
            if (resp.ok) {
                if (isDisabled) {
                    // Re-enable by removing deleted flag — reuse update endpoint and then enable
                    await fetch(`${API_URL}/Category/enable/${category.id}`, { method: 'PATCH' });
                }
                onSaved();
            } else {
                const data = await resp.json();
                setError(data.detail || 'Villa við uppfærslu.');
            }
        } catch {
            setError('Tenging við þjón mistókst.');
        } finally {
            setSaving(false);
        }
    };

    const handleDisable = async () => {
        setDisabling(true);
        try {
            const resp = await fetch(`${API_URL}/Category/delete/${category.id}`, { method: 'DELETE' });
            if (resp.ok) { setConfirmDisable(false); onSaved(); }
            else { const data = await resp.json(); setError(data.detail || 'Villa við óvirkjun.'); setConfirmDisable(false); }
        } catch {
            setError('Tenging við þjón mistókst.'); setConfirmDisable(false);
        } finally {
            setDisabling(false);
        }
    };

    const handleEnable = async () => {
        setSaving(true);
        try {
            const [nameResp] = await Promise.all([
                fetch(`${API_URL}/Category/update/${category.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user_id: user?.id, name: name.trim(), type }),
                }),
            ]);
            await fetch(`${API_URL}/Category/enable/${category.id}`, { method: 'PATCH' });
            if (nameResp.ok) onSaved();
            else { const data = await nameResp.json(); setError(data.detail || 'Villa.'); }
        } catch {
            setError('Tenging við þjón mistókst.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
                <DialogTitle>{isDisabled ? 'Óvirkur flokkur' : 'Breyta flokk'}</DialogTitle>
                <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
                    <Box>
                        <Typography variant="body1" fontWeight={500}>{category.name}</Typography>
                        <Typography variant="body2" color="text.secondary">{typeLabel(category.type)}</Typography>
                    </Box>
                    <TextField
                        label="Nafn flokks"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        size="small"
                        fullWidth
                    />
                    <FormControl size="small" fullWidth>
                        <InputLabel>Tegund</InputLabel>
                        <Select value={type} label="Tegund" onChange={e => setType(e.target.value)}>
                            {CATEGORY_TYPES.map(t => (
                                <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    {user?.is_superadmin && (
                        <>
                            <FormControl size="small" fullWidth>
                                <InputLabel>Gjaldareikningur (valfrjálst)</InputLabel>
                                <Select
                                    value={expenseAccountId}
                                    label="Gjaldareikningur (valfrjálst)"
                                    onChange={e => setExpenseAccountId(e.target.value)}
                                >
                                    <MenuItem value=""><em>Enginn</em></MenuItem>
                                    {accountingKeys.filter(k => k.type === 'EXPENSE').map(k => (
                                        <MenuItem key={k.id} value={k.id}>{k.number} · {k.name}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                            <FormControl size="small" fullWidth>
                                <InputLabel>Tekjureikningur (valfrjálst)</InputLabel>
                                <Select
                                    value={incomeAccountId}
                                    label="Tekjureikningur (valfrjálst)"
                                    onChange={e => setIncomeAccountId(e.target.value)}
                                >
                                    <MenuItem value=""><em>Enginn</em></MenuItem>
                                    {accountingKeys.filter(k => k.type === 'INCOME').map(k => (
                                        <MenuItem key={k.id} value={k.id}>{k.number} · {k.name}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </>
                    )}
                    {error && <Alert severity="error">{error}</Alert>}
                </DialogContent>
                <DialogActions sx={{ justifyContent: 'space-between', px: 3, pb: 2 }}>
                    <Box>
                        {!isDisabled && (
                            <Button
                                onClick={() => setConfirmDisable(true)}
                                sx={{ color: 'text.disabled', textTransform: 'none', fontSize: '0.8rem', p: 0, minWidth: 0 }}
                            >
                                Óvirkja flokk
                            </Button>
                        )}
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button onClick={onClose}>Hætta við</Button>
                        <Button
                            variant="contained" color="secondary" sx={{ color: '#fff' }}
                            disabled={!isValid || saving}
                            onClick={isDisabled ? handleEnable : handleSave}
                        >
                            {saving
                                ? <CircularProgress size={18} color="inherit" />
                                : isDisabled ? 'Virkja flokk' : 'Vista'}
                        </Button>
                    </Box>
                </DialogActions>
            </Dialog>

            <Dialog open={confirmDisable} onClose={() => setConfirmDisable(false)} maxWidth="xs" fullWidth>
                <DialogTitle>Óvirkja flokk</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Ertu viss um að þú viljir óvirkja flokkinn <strong>{category.name}</strong>?
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmDisable(false)}>Hætta við</Button>
                    <Button color="error" variant="contained" disabled={disabling} onClick={handleDisable}>
                        {disabling ? <CircularProgress size={18} color="inherit" /> : 'Já, óvirkja'}
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
}

export default CategoriesPage;
