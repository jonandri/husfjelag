import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box, Typography, Paper, TextField, Button,
    CircularProgress, Alert,
    Dialog, DialogTitle, DialogContent, DialogActions, DialogContentText,
    Table, TableHead, TableRow, TableCell, TableBody,
    Collapse, IconButton, Tooltip,
    MenuItem, Select, FormControl, InputLabel,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import { UserContext } from './UserContext';
import { apiFetch } from '../api';
import SideBar from './Sidebar';
import { primaryButtonSx, ghostButtonSx, destructiveButtonSx } from '../ui/buttons';
import { HEAD_SX, HEAD_CELL_SX } from './tableUtils';
import { LabelChip } from '../ui/chips';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8010';

const ACCOUNTING_KEY_TYPES = [
    { value: 'ASSET',     label: 'Eign' },
    { value: 'LIABILITY', label: 'Skuld' },
    { value: 'EQUITY',    label: 'Eigið fé' },
    { value: 'INCOME',    label: 'Tekjur' },
    { value: 'EXPENSE',   label: 'Gjöld' },
];
const keyTypeLabel = (type) => ACCOUNTING_KEY_TYPES.find(t => t.value === type)?.label || type;

export default function AdminAccountingKeysPage() {
    const navigate = useNavigate();
    const { user } = React.useContext(UserContext);

    React.useEffect(() => {
        if (!user) { navigate('/login'); return; }
        if (!user.is_superadmin) { navigate('/dashboard'); }
    }, [user]);

    if (!user?.is_superadmin) return null;

    return (
        <div className="dashboard">
            <SideBar />
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
                {/* Zone 1: Header */}
                <Box sx={{ px: 3, py: 2, background: '#fff', borderBottom: '1px solid #e8e8e8', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                    <Typography variant="h5">Bókhaldslyklar</Typography>
                </Box>
                {/* Zone 2: Content */}
                <Box sx={{ flex: 1, overflowY: 'auto', p: 3 }}>
                    <GlobalAccountingKeysPanel user={user} />
                </Box>
            </Box>
        </div>
    );
}

function GlobalAccountingKeysPanel({ user }) {
    const [keys, setKeys] = React.useState(undefined);
    const [error, setError] = React.useState('');
    const [showForm, setShowForm] = React.useState(false);
    const [showDisabled, setShowDisabled] = React.useState(false);

    React.useEffect(() => { loadKeys(); }, []);

    const loadKeys = async () => {
        try {
            const resp = await apiFetch(`${API_URL}/AccountingKey/${user.id}`);
            if (resp.ok) setKeys(await resp.json());
            else { setError('Villa við að sækja bókhaldslykla.'); setKeys([]); }
        } catch {
            setError('Tenging við þjón mistókst.');
            setKeys([]);
        }
    };

    if (keys === undefined) {
        return (
            <Paper variant="outlined" sx={{ p: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                    <CircularProgress color="secondary" />
                </Box>
            </Paper>
        );
    }

    const active = keys.filter(k => !k.deleted);
    const disabled = keys.filter(k => k.deleted);

    return (
        <Paper variant="outlined" sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Box>
                    <Typography variant="h6">Bókhaldslyklar</Typography>
                    <Typography variant="body2" color="text.secondary">
                        Staðlað íslenskt bókhaldslykilkerfi — gilt fyrir öll húsfélög
                    </Typography>
                </Box>
                <Button variant="contained" sx={primaryButtonSx} startIcon={<AddIcon />}
                    onClick={() => setShowForm(v => !v)}
                >
                    {showForm ? 'Loka' : 'Bæta við lykli'}
                </Button>
            </Box>

            <Collapse in={showForm}>
                <GlobalAddAccountingKeyForm
                    userId={user.id}
                    onCreated={() => { setShowForm(false); loadKeys(); }}
                />
            </Collapse>

            {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

            {active.length === 0 ? (
                <Typography color="text.secondary" sx={{ mt: 2 }}>Enginn bókhaldslykill skráður.</Typography>
            ) : (
                <Paper variant="outlined" sx={{ mt: 2 }}>
                    <Table size="small">
                        <TableHead sx={HEAD_SX}>
                            <TableRow>
                                <TableCell sx={{ ...HEAD_CELL_SX, width: 80 }}>Númer</TableCell>
                                <TableCell sx={HEAD_CELL_SX}>Heiti</TableCell>
                                <TableCell sx={HEAD_CELL_SX}>Tegund</TableCell>
                                <TableCell />
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {active.map(k => (
                                <GlobalAccountingKeyRow key={k.id} accountingKey={k} userId={user.id} onSaved={loadKeys} />
                            ))}
                        </TableBody>
                    </Table>
                </Paper>
            )}

            {disabled.length > 0 && (
                <Box sx={{ mt: 3 }}>
                    <Button size="small" variant="text" sx={{ ...ghostButtonSx, p: 0, minWidth: 0 }}
                        onClick={() => setShowDisabled(v => !v)}
                    >
                        {showDisabled ? '▲' : '▼'} Óvirkir lyklar ({disabled.length})
                    </Button>
                    <Collapse in={showDisabled}>
                        <Paper variant="outlined" sx={{ mt: 1 }}>
                            <Table size="small">
                                <TableHead sx={HEAD_SX}>
                                    <TableRow>
                                        <TableCell sx={{ ...HEAD_CELL_SX, width: 80 }}>Númer</TableCell>
                                        <TableCell sx={HEAD_CELL_SX}>Heiti</TableCell>
                                        <TableCell sx={HEAD_CELL_SX}>Tegund</TableCell>
                                        <TableCell />
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {disabled.map(k => (
                                        <GlobalAccountingKeyRow key={k.id} accountingKey={k} userId={user.id} onSaved={loadKeys} isDisabled />
                                    ))}
                                </TableBody>
                            </Table>
                        </Paper>
                    </Collapse>
                </Box>
            )}
        </Paper>
    );
}

function GlobalAddAccountingKeyForm({ userId, onCreated }) {
    const [number, setNumber] = React.useState('');
    const [name, setName] = React.useState('');
    const [type, setType] = React.useState('');
    const [saving, setSaving] = React.useState(false);
    const [error, setError] = React.useState('');

    const isValid = number && name.trim() && type;

    const handleSubmit = async () => {
        setError('');
        setSaving(true);
        try {
            const resp = await apiFetch(`${API_URL}/AccountingKey`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId, number: parseInt(number, 10), name: name.trim(), type }),
            });
            if (resp.ok) {
                setNumber(''); setName(''); setType('');
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
        <Paper variant="outlined" sx={{ p: 2, mb: 2, display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 480 }}>
            <Box sx={{ display: 'flex', gap: 2 }}>
                <TextField
                    label="Númer" value={number}
                    onChange={e => setNumber(e.target.value.replace(/\D/g, ''))}
                    size="small" sx={{ width: 120 }}
                    inputProps={{ inputMode: 'numeric' }}
                />
                <TextField
                    label="Heiti lykils" value={name}
                    onChange={e => setName(e.target.value)}
                    size="small" sx={{ flex: 1 }}
                />
            </Box>
            <FormControl size="small" fullWidth>
                <InputLabel>Tegund</InputLabel>
                <Select value={type} label="Tegund" onChange={e => setType(e.target.value)}>
                    {ACCOUNTING_KEY_TYPES.map(t => (
                        <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
                    ))}
                </Select>
            </FormControl>
            {error && <Alert severity="error">{error}</Alert>}
            <Button
                variant="contained" sx={{ ...primaryButtonSx, alignSelf: 'flex-start' }}
                disabled={!isValid || saving} onClick={handleSubmit}
            >
                {saving ? <CircularProgress size={20} color="inherit" /> : 'Vista lykil'}
            </Button>
        </Paper>
    );
}

function GlobalAccountingKeyRow({ accountingKey, userId, onSaved, isDisabled }) {
    const [editOpen, setEditOpen] = React.useState(false);
    return (
        <>
            <TableRow hover sx={isDisabled ? { opacity: 0.55 } : {}}>
                <TableCell sx={{ color: 'text.secondary', fontFamily: 'monospace' }}>{accountingKey.number}</TableCell>
                <TableCell>{accountingKey.name}</TableCell>
                <TableCell><LabelChip label={keyTypeLabel(accountingKey.type)} /></TableCell>
                <TableCell align="right" sx={{ width: 48 }}>
                    <Tooltip title={isDisabled ? 'Virkja / breyta' : 'Breyta'}>
                        <IconButton size="small" onClick={() => setEditOpen(true)}>
                            <EditIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                </TableCell>
            </TableRow>
            <GlobalEditAccountingKeyDialog
                open={editOpen}
                onClose={() => setEditOpen(false)}
                accountingKey={accountingKey}
                userId={userId}
                isDisabled={isDisabled}
                onSaved={() => { setEditOpen(false); onSaved(); }}
            />
        </>
    );
}

function GlobalEditAccountingKeyDialog({ open, onClose, accountingKey, userId, isDisabled, onSaved }) {
    const [name, setName] = React.useState(accountingKey.name);
    const [type, setType] = React.useState(accountingKey.type);
    const [saving, setSaving] = React.useState(false);
    const [disabling, setDisabling] = React.useState(false);
    const [confirmDisable, setConfirmDisable] = React.useState(false);
    const [error, setError] = React.useState('');

    React.useEffect(() => {
        if (open) { setName(accountingKey.name); setType(accountingKey.type); setError(''); }
    }, [open, accountingKey]);

    const isValid = name.trim() && type;

    const handleSave = async () => {
        setError('');
        setSaving(true);
        try {
            const resp = await apiFetch(`${API_URL}/AccountingKey/update/${accountingKey.id}?user_id=${userId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name.trim(), type }),
            });
            if (resp.ok) {
                if (isDisabled) {
                    await apiFetch(`${API_URL}/AccountingKey/enable/${accountingKey.id}?user_id=${userId}`, { method: 'PATCH' });
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
            const resp = await apiFetch(`${API_URL}/AccountingKey/delete/${accountingKey.id}?user_id=${userId}`, { method: 'DELETE' });
            if (resp.ok) { setConfirmDisable(false); onSaved(); }
            else { const data = await resp.json(); setError(data.detail || 'Villa.'); setConfirmDisable(false); }
        } catch {
            setError('Tenging við þjón mistókst.'); setConfirmDisable(false);
        } finally {
            setDisabling(false);
        }
    };

    return (
        <>
            <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
                <DialogTitle>{isDisabled ? 'Óvirkur lykill' : 'Breyta lykli'}</DialogTitle>
                <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
                    <TextField label="Heiti lykils" value={name} onChange={e => setName(e.target.value)} size="small" fullWidth />
                    <FormControl size="small" fullWidth>
                        <InputLabel>Tegund</InputLabel>
                        <Select value={type} label="Tegund" onChange={e => setType(e.target.value)}>
                            {ACCOUNTING_KEY_TYPES.map(t => (
                                <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    {error && <Alert severity="error">{error}</Alert>}
                </DialogContent>
                <DialogActions sx={{ justifyContent: 'space-between', px: 3, pb: 2 }}>
                    <Box>
                        {!isDisabled && (
                            <Button onClick={() => setConfirmDisable(true)}
                                sx={{ ...destructiveButtonSx, fontSize: '0.8rem' }}>
                                Óvirkja lykil
                            </Button>
                        )}
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button sx={ghostButtonSx} onClick={onClose}>Hætta við</Button>
                        <Button variant="contained" sx={primaryButtonSx} disabled={!isValid || saving} onClick={handleSave}>
                            {saving
                                ? <CircularProgress size={18} color="inherit" />
                                : isDisabled ? 'Virkja lykil' : 'Vista'}
                        </Button>
                    </Box>
                </DialogActions>
            </Dialog>

            <Dialog open={confirmDisable} onClose={() => setConfirmDisable(false)} maxWidth="xs">
                <DialogTitle>Óvirkja lykil?</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Lykillinn verður falinn í flokkunarformi. Núverandi færslur haldast óbreyttar.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button sx={ghostButtonSx} onClick={() => setConfirmDisable(false)}>Hætta við</Button>
                    <Button sx={destructiveButtonSx} onClick={handleDisable} disabled={disabling}>
                        {disabling ? <CircularProgress size={18} color="inherit" /> : 'Óvirkja'}
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
}
