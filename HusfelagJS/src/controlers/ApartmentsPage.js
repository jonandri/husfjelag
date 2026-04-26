import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box, Typography, CircularProgress, Paper,
    Table, TableHead, TableRow, TableCell, TableBody, TableFooter,
    Button, TextField, Collapse, Chip, IconButton,
    Dialog, DialogTitle, DialogContent, DialogActions,
    Alert, Divider, Tooltip, DialogContentText,
    FormControlLabel, Checkbox,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { useHelp } from '../ui/HelpContext';
import { UserContext } from './UserContext';
import { apiFetch } from '../api';
import SideBar from './Sidebar';
import { fmtPct, fmtKennitala } from '../format';
import { useSort, HEAD_SX, HEAD_CELL_SX } from './tableUtils';
import { primaryButtonSx, secondaryButtonSx, ghostButtonSx, destructiveButtonSx } from '../ui/buttons';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8010';

function ApartmentsPage() {
    const navigate = useNavigate();
    const { user, assocParam } = React.useContext(UserContext);
    const { openHelp } = useHelp();
    const [apartments, setApartments] = useState(undefined);
    const [error, setError] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [showDisabled, setShowDisabled] = useState(false);
    const { sort, lbl } = useSort('anr');

    useEffect(() => {
        if (!user) { navigate('/login'); return; }
        loadApartments();
    }, [user, assocParam]);

    const loadApartments = async () => {
        try {
            const resp = await apiFetch(`${API_URL}/Apartment/${user.id}${assocParam}`);
            if (resp.ok) {
                setApartments(await resp.json());
            } else {
                setError('Villa við að sækja íbúðir.');
                setApartments([]);
            }
        } catch {
            setError('Tenging við þjón mistókst.');
            setApartments([]);
        }
    };

    if (apartments === undefined) {
        return (
            <div className="dashboard">
                <SideBar />
                <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8, flex: 1 }}>
                    <CircularProgress color="secondary" />
                </Box>
            </div>
        );
    }

    return (
        <div className="dashboard">
            <SideBar />
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
                {/* Zone 1: Header */}
                <Box sx={{ px: 3, py: 2, background: '#fff', borderBottom: '1px solid #e8e8e8', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                    <Typography variant="h5">Íbúðir</Typography>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                        <Button
                            variant="outlined"
                            sx={secondaryButtonSx}
                            onClick={() => navigate('/ibudir/innflutningur')}
                        >
                            ⬇ Innflutningur
                        </Button>
                        <Button
                            variant="contained"
                            sx={primaryButtonSx}
                            onClick={() => setShowForm(true)}
                        >
                            + Bæta við íbúð
                        </Button>
                        <Tooltip title="Hjálp">
                            <IconButton size="small" onClick={() => openHelp('ibudir')}>
                                <HelpOutlineIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
                            </IconButton>
                        </Tooltip>
                    </Box>
                </Box>

                {/* Zone 3: Content */}
                <Box sx={{ flex: 1, overflowY: 'auto', p: 3 }}>
                    <AddApartmentDialog
                        open={showForm}
                        onClose={() => setShowForm(false)}
                        userId={user.id}
                        assocParam={assocParam}
                        apartments={apartments.filter(a => !a.deleted)}
                        onCreated={(updated) => { setShowForm(false); setApartments(updated); }}
                    />

                    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

                    {(() => {
                        const active = apartments.filter(a => !a.deleted);
                        const disabled = apartments.filter(a => a.deleted);
                        return (
                            <>
                                {active.length === 0 ? (
                                    <Paper
                                        variant="outlined"
                                        sx={{ p: 3, borderColor: 'secondary.main', bgcolor: 'rgba(8,192,118,0.05)' }}
                                    >
                                        <Typography variant="subtitle1" color="secondary" sx={{ mb: 0.5 }}>
                                            Setja upp íbúðir sjálfkrafa
                                        </Typography>
                                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                            Enginn búinn að skrá íbúðir. Notaðu HMS fasteignaskrána til að flytja inn lista yfir íbúðir sjálfkrafa.
                                        </Typography>
                                        <Button
                                            variant="contained"
                                            sx={primaryButtonSx}
                                            onClick={() => navigate('/ibudir/innflutningur')}
                                        >
                                            Flytja inn frá HMS →
                                        </Button>
                                    </Paper>
                                ) : (
                                    <Paper variant="outlined">
                                        <Table size="small">
                                            <TableHead sx={HEAD_SX}>
                                                <TableRow>
                                                    <TableCell sx={HEAD_CELL_SX}>{lbl('anr', 'Merking')}</TableCell>
                                                    <TableCell sx={HEAD_CELL_SX}>{lbl('fnr', 'Fastanúmer')}</TableCell>
                                                    <TableCell sx={HEAD_CELL_SX}>{lbl('size', 'Stærð (m²)')}</TableCell>
                                                    <TableCell sx={HEAD_CELL_SX}>{lbl('share', 'Hlutfall (%)')}</TableCell>
                                                    <TableCell sx={HEAD_CELL_SX}>{lbl('share_2', 'Hiti (%)')}</TableCell>
                                                    <TableCell sx={HEAD_CELL_SX}>{lbl('share_3', 'Lóð (%)')}</TableCell>
                                                    <TableCell sx={HEAD_CELL_SX}>Eigendur</TableCell>
                                                    <TableCell />
                                                </TableRow>
                                            </TableHead>
                                            <TableBody>
                                                {sort(active).map((apt) => (
                                                    <ApartmentRow
                                                        key={apt.id}
                                                        apt={apt}
                                                        apartments={active}
                                                        onOwnersChanged={loadApartments}
                                                        onSaved={loadApartments}
                                                    />
                                                ))}
                                            </TableBody>
                                            <TableFooter>
                                                <TableRow sx={{ '& td': { fontWeight: 600, borderTop: '2px solid rgba(0,0,0,0.12)', color: 'text.primary' } }}>
                                                    <TableCell>Samtals</TableCell>
                                                    <TableCell />
                                                    <TableCell>{active.reduce((s, a) => s + parseFloat(a.size || 0), 0).toFixed(2)} m²</TableCell>
                                                    <TableCell>{fmtPct(active.reduce((s, a) => s + parseFloat(a.share || 0), 0))}</TableCell>
                                                    <TableCell>{fmtPct(active.reduce((s, a) => s + parseFloat(a.share_2 || 0), 0))}</TableCell>
                                                    <TableCell>{fmtPct(active.reduce((s, a) => s + parseFloat(a.share_3 || 0), 0))}</TableCell>
                                                    <TableCell />
                                                    <TableCell />
                                                </TableRow>
                                            </TableFooter>
                                        </Table>
                                    </Paper>
                                )}

                                {disabled.length > 0 && (
                                    <Box sx={{ mt: 3 }}>
                                        <Button
                                            size="small"
                                            sx={{ ...ghostButtonSx, p: 0, minWidth: 0 }}
                                            onClick={() => setShowDisabled(v => !v)}
                                        >
                                            {showDisabled ? '▲' : '▼'} Óvirkar íbúðir ({disabled.length})
                                        </Button>
                                        <Collapse in={showDisabled}>
                                            <Paper variant="outlined" sx={{ mt: 1 }}>
                                                <Table size="small">
                                                    <TableHead sx={HEAD_SX}>
                                                        <TableRow>
                                                            <TableCell sx={HEAD_CELL_SX}>Merking</TableCell>
                                                            <TableCell sx={HEAD_CELL_SX}>Fastanúmer</TableCell>
                                                            <TableCell sx={HEAD_CELL_SX}>Stærð (m²)</TableCell>
                                                            <TableCell sx={HEAD_CELL_SX}>Matshlutfall (%)</TableCell>
                                                            <TableCell sx={HEAD_CELL_SX}>Hiti (%)</TableCell>
                                                            <TableCell sx={HEAD_CELL_SX}>Lóð (%)</TableCell>
                                                            <TableCell />
                                                        </TableRow>
                                                    </TableHead>
                                                    <TableBody>
                                                        {sort(disabled).map((apt) => (
                                                            <ApartmentRow
                                                                key={apt.id}
                                                                apt={apt}
                                                                apartments={active}
                                                                onOwnersChanged={loadApartments}
                                                                onSaved={loadApartments}
                                                                isDisabled
                                                            />
                                                        ))}
                                                    </TableBody>
                                                </Table>
                                            </Paper>
                                        </Collapse>
                                    </Box>
                                )}
                            </>
                        );
                    })()}
                </Box>
            </Box>
        </div>
    );
}

function ShareField({ label, value, onChange, helperText, error, disabled }) {
    return (
        <TextField
            label={label}
            value={value}
            onChange={e => onChange(e.target.value.replace(/[^0-9.]/g, ''))}
            size="small"
            type="number"
            inputProps={{ min: 0, max: 100, step: 0.01 }}
            helperText={helperText}
            error={!!error}
            disabled={disabled}
            FormHelperTextProps={{ sx: { whiteSpace: 'normal' } }}
            fullWidth
        />
    );
}

function SameShareCheckbox({ checked, onChange }) {
    return (
        <FormControlLabel
            control={
                <Checkbox
                    checked={checked}
                    onChange={e => onChange(e.target.checked)}
                    size="small"
                    color="secondary"
                    sx={{ py: 0 }}
                />
            }
            label={<Typography variant="caption" color="text.secondary">Nota matshlutfall</Typography>}
            sx={{ mt: -0.5, ml: 0.5 }}
        />
    );
}

function AddApartmentDialog({ open, onClose, userId, assocParam, apartments, onCreated }) {
    const [anr, setAnr] = useState('');
    const [fnr, setFnr] = useState('');
    const [size, setSize] = useState('');
    const [share, setShare] = useState('');
    const [share2, setShare2] = useState('');
    const [share2Same, setShare2Same] = useState(false);
    const [share3, setShare3] = useState('');
    const [share3Same, setShare3Same] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    React.useEffect(() => {
        if (!open) {
            setAnr('');
            setFnr('');
            setSize('');
            setShare('');
            setShare2('');
            setShare2Same(false);
            setShare3('');
            setShare3Same(false);
            setSaving(false);
            setError('');
        }
    }, [open]);

    const eff2 = share2Same ? share : share2;
    const eff3 = share3Same ? share : share3;

    const existingShare = apartments.reduce((s, a) => s + parseFloat(a.share || 0), 0);
    const existingShare2 = apartments.reduce((s, a) => s + parseFloat(a.share_2 || 0), 0);
    const existingShare3 = apartments.reduce((s, a) => s + parseFloat(a.share_3 || 0), 0);
    const round2 = n => Math.round(n * 100) / 100;
    const shareOver = parseFloat(share) > 0 && round2(existingShare + parseFloat(share)) > 100;
    const share2Over = parseFloat(eff2) > 0 && round2(existingShare2 + parseFloat(eff2)) > 100;
    const share3Over = parseFloat(eff3) > 0 && round2(existingShare3 + parseFloat(eff3)) > 100;

    const isValid = anr.trim() && fnr.trim()
        && parseFloat(share) >= 0 && parseFloat(eff2) >= 0 && parseFloat(eff3) >= 0
        && !shareOver && !share2Over && !share3Over;

    const handleSubmit = async () => {
        setError('');
        setSaving(true);
        try {
            const resp = await apiFetch(`${API_URL}/Apartment${assocParam}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: userId,
                    anr,
                    fnr,
                    size: parseFloat(size) || 0,
                    share: parseFloat(share) || 0,
                    share_2: parseFloat(eff2) || 0,
                    share_3: parseFloat(eff3) || 0,
                }),
            });
            if (resp.ok) {
                const updated = await resp.json();
                onCreated(updated);
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
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle sx={{ pb: 0.5 }}>
                Skrá nýja íbúð
                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 400, mt: 0.5 }}>
                    Íbúðin verður bætt við húsfélagið
                </Typography>
            </DialogTitle>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
                <Box sx={{ display: 'flex', gap: 2 }}>
                    <TextField label="Merking" value={anr} onChange={e => setAnr(e.target.value)} size="small" fullWidth />
                    <TextField label="Fastanúmer" value={fnr} onChange={e => setFnr(e.target.value)} size="small" fullWidth />
                </Box>
                <TextField
                    label="Stærð (m²)"
                    value={size}
                    onChange={e => setSize(e.target.value.replace(/[^0-9.]/g, ''))}
                    size="small"
                    type="number"
                    inputProps={{ min: 0, step: 0.01 }}
                    helperText="Flatarmál íbúðar í fermetrum"
                    fullWidth
                />
                <ShareField
                    label="Matshlutfall (%)"
                    value={share}
                    onChange={setShare}
                    helperText="Matshluti hverrar íbúðar skv. eignaskiptasamningi"
                    error={shareOver ? 'Heildarhlutfall fer yfir 100%' : ''}
                />
                {shareOver && <Alert severity="error" sx={{ mt: -1 }}>Heildarhlutfall (share) myndi fara yfir 100%</Alert>}

                <Box>
                    <ShareField
                        label="Matshlutfall hita (%)"
                        value={eff2}
                        onChange={setShare2}
                        helperText="Matshluti hita skv. eignaskiptasamningi"
                        error={share2Over ? 'Heildarhlutfall fer yfir 100%' : ''}
                        disabled={share2Same}
                    />
                    <SameShareCheckbox checked={share2Same} onChange={setShare2Same} />
                </Box>
                {share2Over && <Alert severity="error" sx={{ mt: -1 }}>Heildarhlutfall (share 2) myndi fara yfir 100%</Alert>}

                <Box>
                    <ShareField
                        label="Matshlutfall lóðar (%)"
                        value={eff3}
                        onChange={setShare3}
                        helperText="Matshluti lóðar skv. eignaskiptasamningi"
                        error={share3Over ? 'Heildarhlutfall fer yfir 100%' : ''}
                        disabled={share3Same}
                    />
                    <SameShareCheckbox checked={share3Same} onChange={setShare3Same} />
                </Box>
                {share3Over && <Alert severity="error" sx={{ mt: -1 }}>Heildarhlutfall (share 3) myndi fara yfir 100%</Alert>}

                {error && <Alert severity="error">{error}</Alert>}
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2.5, justifyContent: 'flex-end' }}>
                <Button sx={ghostButtonSx} onClick={onClose}>Hætta við</Button>
                <Button variant="contained" sx={primaryButtonSx} disabled={!isValid || saving} onClick={handleSubmit}>
                    {saving ? <CircularProgress size={18} color="inherit" /> : 'Skrá íbúð'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

function ApartmentRow({ apt, apartments, onOwnersChanged, onSaved, isDisabled }) {
    const [ownerDialogOpen, setOwnerDialogOpen] = useState(false);
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const { user } = React.useContext(UserContext);

    return (
        <>
            <TableRow hover sx={isDisabled ? { opacity: 0.55 } : {}}>
                <TableCell>{apt.anr}</TableCell>
                <TableCell>{apt.fnr}</TableCell>
                <TableCell>{apt.size} m²</TableCell>
                <TableCell>{apt.share}%</TableCell>
                <TableCell>{apt.share_2}%</TableCell>
                <TableCell>{apt.share_3}%</TableCell>
                {!isDisabled && (
                    <TableCell>
                        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
                            {apt.owners.map(o => (
                                <Chip key={o.id} label={o.name} size="small" />
                            ))}
                            <Chip
                                label="+ Eigandi"
                                size="small"
                                variant="outlined"
                                color="secondary"
                                onClick={() => setOwnerDialogOpen(true)}
                                sx={{ cursor: 'pointer' }}
                            />
                        </Box>
                    </TableCell>
                )}
                <TableCell align="right" sx={{ width: 48 }}>
                    <Tooltip title={isDisabled ? 'Virkja / breyta' : 'Breyta'}>
                        <IconButton size="small" onClick={() => setEditDialogOpen(true)}>
                            <EditIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                </TableCell>
            </TableRow>

            {!isDisabled && (
                <OwnerDialog
                    open={ownerDialogOpen}
                    onClose={() => setOwnerDialogOpen(false)}
                    apt={apt}
                    userId={user?.id}
                    onChanged={() => { setOwnerDialogOpen(false); onOwnersChanged(); }}
                />
            )}
            <EditApartmentDialog
                open={editDialogOpen}
                onClose={() => setEditDialogOpen(false)}
                apt={apt}
                apartments={apartments}
                isDisabled={isDisabled}
                onSaved={() => { setEditDialogOpen(false); onSaved(); }}
                onDeleted={() => { setEditDialogOpen(false); onSaved(); }}
            />
        </>
    );
}

function EditApartmentDialog({ open, onClose, apt, apartments, isDisabled, onSaved, onDeleted }) {
    const [anr, setAnr] = useState(apt.anr);
    const [fnr, setFnr] = useState(apt.fnr);
    const [size, setSize] = useState(String(apt.size || ''));
    const [share, setShare] = useState(String(apt.share));
    const [share2, setShare2] = useState(String(apt.share_2));
    const [share2Same, setShare2Same] = useState(false);
    const [share3, setShare3] = useState(String(apt.share_3));
    const [share3Same, setShare3Same] = useState(false);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [error, setError] = useState('');

    React.useEffect(() => {
        if (open) {
            setAnr(apt.anr); setFnr(apt.fnr);
            setSize(String(apt.size || ''));
            setShare(String(apt.share));
            setShare2(String(apt.share_2));
            setShare3(String(apt.share_3));
            setShare2Same(false);
            setShare3Same(false);
            setError('');
        }
    }, [open, apt]);

    const eff2 = share2Same ? share : share2;
    const eff3 = share3Same ? share : share3;

    const others = apartments.filter(a => a.id !== apt.id);
    const otherShare = others.reduce((s, a) => s + parseFloat(a.share || 0), 0);
    const otherShare2 = others.reduce((s, a) => s + parseFloat(a.share_2 || 0), 0);
    const otherShare3 = others.reduce((s, a) => s + parseFloat(a.share_3 || 0), 0);
    const round2 = n => Math.round(n * 100) / 100;
    const shareOver = parseFloat(share) >= 0 && round2(otherShare + parseFloat(share)) > 100;
    const share2Over = parseFloat(eff2) >= 0 && round2(otherShare2 + parseFloat(eff2)) > 100;
    const share3Over = parseFloat(eff3) >= 0 && round2(otherShare3 + parseFloat(eff3)) > 100;

    const isValid = anr.trim() && fnr.trim()
        && parseFloat(share) >= 0 && parseFloat(eff2) >= 0 && parseFloat(eff3) >= 0
        && !shareOver && !share2Over && !share3Over;

    const payload = { anr, fnr, size: parseFloat(size) || 0, share: parseFloat(share) || 0, share_2: parseFloat(eff2) || 0, share_3: parseFloat(eff3) || 0 };

    const handleSave = async () => {
        setError('');
        setSaving(true);
        try {
            const resp = await apiFetch(`${API_URL}/Apartment/update/${apt.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (resp.ok) { onSaved(); }
            else { const data = await resp.json(); setError(data.detail || 'Villa við uppfærslu.'); }
        } catch {
            setError('Tenging við þjón mistókst.');
        } finally {
            setSaving(false);
        }
    };

    const handleDisable = async () => {
        setDeleting(true);
        try {
            const resp = await apiFetch(`${API_URL}/Apartment/delete/${apt.id}`, { method: 'DELETE' });
            if (resp.ok) { setConfirmDelete(false); onDeleted(); }
            else { const data = await resp.json(); setError(data.detail || 'Villa við óvirkjun.'); setConfirmDelete(false); }
        } catch {
            setError('Tenging við þjón mistókst.');
            setConfirmDelete(false);
        } finally {
            setDeleting(false);
        }
    };

    const handleEnable = async () => {
        setError('');
        setSaving(true);
        try {
            const resp = await apiFetch(`${API_URL}/Apartment/enable/${apt.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (resp.ok) { onSaved(); }
            else { const data = await resp.json(); setError(data.detail || 'Villa við virkjun.'); }
        } catch {
            setError('Tenging við þjón mistókst.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle>{isDisabled ? `Óvirk íbúð — ${apt.anr}` : `Breyta íbúð — ${apt.anr}`}</DialogTitle>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
                <Box>
                    <Typography variant="body1" fontWeight={500}>{apt.anr}</Typography>
                    <Typography variant="body2" color="text.secondary">
                        Fastanúmer: {apt.fnr}
                    </Typography>
                </Box>
                <TextField label="Merking" value={anr} onChange={e => setAnr(e.target.value)} size="small" fullWidth />
                <TextField label="Fastanúmer" value={fnr} onChange={e => setFnr(e.target.value)} size="small" fullWidth />
                <TextField
                    label="Stærð (m²)"
                    value={size}
                    onChange={e => setSize(e.target.value.replace(/[^0-9.]/g, ''))}
                    size="small"
                    type="number"
                    inputProps={{ min: 0, step: 0.01 }}
                    helperText="Flatarmál íbúðar í fermetrum"
                    fullWidth
                />
                <ShareField
                    label="Matshlutfall (%)"
                    value={share}
                    onChange={setShare}
                    helperText="Matshluti hverrar íbúðar skv. eignaskiptasamningi"
                    error={shareOver}
                />
                {shareOver && <Alert severity="error" sx={{ mt: -1 }}>Heildarhlutfall (share) myndi fara yfir 100%</Alert>}

                <Box>
                    <ShareField
                        label="Matshlutfall hita (%)"
                        value={eff2}
                        onChange={setShare2}
                        helperText="Matshluti hita skv. eignaskiptasamningi"
                        error={share2Over}
                        disabled={share2Same}
                    />
                    <SameShareCheckbox checked={share2Same} onChange={setShare2Same} />
                </Box>
                {share2Over && <Alert severity="error" sx={{ mt: -1 }}>Heildarhlutfall (share 2) myndi fara yfir 100%</Alert>}

                <Box>
                    <ShareField
                        label="Matshlutfall lóðar (%)"
                        value={eff3}
                        onChange={setShare3}
                        helperText="Matshluti lóðar skv. eignaskiptasamningi"
                        error={share3Over}
                        disabled={share3Same}
                    />
                    <SameShareCheckbox checked={share3Same} onChange={setShare3Same} />
                </Box>
                {share3Over && <Alert severity="error" sx={{ mt: -1 }}>Heildarhlutfall (share 3) myndi fara yfir 100%</Alert>}

                {error && <Alert severity="error">{error}</Alert>}
            </DialogContent>
            <DialogActions sx={{ justifyContent: 'space-between', px: 3, pb: 2 }}>
                <Box>
                    {!isDisabled && (
                        <Button
                            sx={{ ...destructiveButtonSx, fontSize: '0.8rem' }}
                            onClick={() => setConfirmDelete(true)}
                        >
                            Óvirkja íbúð
                        </Button>
                    )}
                </Box>
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button sx={ghostButtonSx} onClick={onClose}>Hætta við</Button>
                    <Button
                        variant="contained"
                        sx={primaryButtonSx}
                        disabled={!isValid || saving}
                        onClick={isDisabled ? handleEnable : handleSave}
                    >
                        {saving
                            ? <CircularProgress size={18} color="inherit" />
                            : isDisabled ? 'Virkja íbúð' : 'Vista'}
                    </Button>
                </Box>
            </DialogActions>
        </Dialog>

        <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)} maxWidth="xs" fullWidth>
            <DialogTitle>Óvirkja íbúð</DialogTitle>
            <DialogContent>
                <DialogContentText>
                    Ertu viss um að þú viljir óvirkja íbúð <strong>{apt.anr}</strong>?
                </DialogContentText>
            </DialogContent>
            <DialogActions>
                <Button sx={ghostButtonSx} onClick={() => setConfirmDelete(false)}>Hætta við</Button>
                <Button variant="contained" sx={destructiveButtonSx} disabled={deleting} onClick={handleDisable}>
                    {deleting ? <CircularProgress size={18} color="inherit" /> : 'Já, óvirkja'}
                </Button>
            </DialogActions>
        </Dialog>
        </>
    );
}

function OwnerDialog({ open, onClose, apt, userId, onChanged }) {
    const { assocParam } = React.useContext(UserContext);
    const [kennitala, setKennitala] = useState('');
    const [share, setShare] = useState('');
    const [isPayer, setIsPayer] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    React.useEffect(() => {
        if (open) { setKennitala(''); setShare(''); setIsPayer(false); setError(''); }
    }, [open]);

    const existingSum = apt.owners.reduce((s, o) => s + parseFloat(o.share || 0), 0);
    const shareOver = parseFloat(share) > 0 && existingSum + parseFloat(share) > 100;
    const isValid = kennitala.length === 10 && parseFloat(share) > 0 && !shareOver;

    const handleAdd = async () => {
        setError('');
        setSaving(true);
        try {
            const resp = await apiFetch(`${API_URL}/Owner${assocParam}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: userId,
                    kennitala,
                    apartment_id: apt.id,
                    share: parseFloat(share),
                    is_payer: isPayer,
                }),
            });
            if (resp.ok) {
                onChanged();
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

    const handleRemove = async (ownerId) => {
        try {
            await apiFetch(`${API_URL}/Owner/delete/${ownerId}`, { method: 'DELETE' });
            onChanged();
        } catch { /* ignore */ }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle>Eigendur — {apt.anr}</DialogTitle>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
                {apt.owners.length === 0 ? (
                    <Typography color="text.secondary" variant="body2">Enginn eigandi skráður.</Typography>
                ) : (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        {apt.owners.map(o => (
                            <Box key={o.id} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Box>
                                    <Typography variant="body2" fontWeight={500}>{o.name}</Typography>
                                    <Typography variant="caption" color="text.secondary">{fmtKennitala(o.kennitala)} · {o.share}%{o.is_payer ? ' · Greiðandi' : ''}</Typography>
                                </Box>
                                <Button size="small" sx={destructiveButtonSx} onClick={() => handleRemove(o.id)}>Fjarlægja</Button>
                            </Box>
                        ))}
                        <Typography variant="caption" color="text.secondary">
                            Núverandi hlutfall: {fmtPct(existingSum)} / 100%
                        </Typography>
                    </Box>
                )}
                <Divider />
                <Typography variant="subtitle2">Bæta við eiganda</Typography>
                <TextField
                    label="Kennitala eiganda"
                    value={kennitala}
                    onChange={e => setKennitala(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    inputProps={{ inputMode: 'numeric', maxLength: 10 }}
                    helperText={`${kennitala.length}/10`}
                    size="small"
                    fullWidth
                />
                <TextField
                    label="Hlutfall (%)"
                    value={share}
                    onChange={e => setShare(e.target.value.replace(/[^0-9.]/g, ''))}
                    size="small"
                    type="number"
                    inputProps={{ min: 0, max: 100, step: 0.01 }}
                    helperText="Hlutdeild þessa eiganda í íbúðinni"
                    error={shareOver}
                    fullWidth
                />
                {shareOver && <Alert severity="error">Heildarhlutfall eigenda myndi fara yfir 100% fyrir þessa íbúð.</Alert>}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Chip
                        label="Greiðandi"
                        size="small"
                        color={isPayer ? 'secondary' : 'default'}
                        variant={isPayer ? 'filled' : 'outlined'}
                        onClick={() => setIsPayer(v => !v)}
                        sx={{ cursor: 'pointer' }}
                    />
                    <Typography variant="caption" color="text.secondary">Merkja sem greiðanda reikninga</Typography>
                </Box>
                {error && <Alert severity="error">{error}</Alert>}
            </DialogContent>
            <DialogActions>
                <Button sx={ghostButtonSx} onClick={onClose}>Loka</Button>
                <Button
                    variant="contained" sx={primaryButtonSx}
                    disabled={!isValid || saving} onClick={handleAdd}
                >
                    {saving ? <CircularProgress size={18} color="inherit" /> : 'Skrá eiganda'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

export default ApartmentsPage;
