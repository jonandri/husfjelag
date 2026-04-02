import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box, Typography, CircularProgress, Paper,
    Table, TableHead, TableRow, TableCell, TableBody,
    Button, TextField, Chip, IconButton,
    Dialog, DialogTitle, DialogContent, DialogActions,
    Alert, Collapse, Tooltip, DialogContentText,
    MenuItem, Select, FormControl, InputLabel, FormHelperText,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import { UserContext } from './UserContext';
import SideBar from './Sidebar';
import { fmtPct, fmtKennitala, fmtPhone } from '../format';
import { useSort, HEAD_SX, HEAD_CELL_SX } from './tableUtils';
import { primaryButtonSx, ghostButtonSx, destructiveButtonSx } from '../ui/buttons';
import { LabelChip } from '../ui/chips';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8010';

function OwnersPage() {
    const navigate = useNavigate();
    const { user, assocParam } = React.useContext(UserContext);
    const [ownerships, setOwnerships] = useState(undefined);
    const [apartments, setApartments] = useState([]);
    const [error, setError] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [showDisabled, setShowDisabled] = useState(false);
    const { sort, lbl } = useSort('name');

    useEffect(() => {
        if (!user) { navigate('/login'); return; }
        loadAll();
    }, [user, assocParam]);

    const loadAll = async () => {
        try {
            const [ownRes, aptRes] = await Promise.all([
                fetch(`${API_URL}/Owner/${user.id}${assocParam}`),
                fetch(`${API_URL}/Apartment/${user.id}${assocParam}`),
            ]);
            if (ownRes.ok) setOwnerships(await ownRes.json());
            else { setError('Villa við að sækja eigendur.'); setOwnerships([]); }
            if (aptRes.ok) {
                const apts = await aptRes.json();
                setApartments(apts.filter(a => !a.deleted));
            }
        } catch {
            setError('Tenging við þjón mistókst.');
            setOwnerships([]);
        }
    };

    if (ownerships === undefined) {
        return (
            <div className="dashboard">
                <SideBar />
                <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8, flex: 1 }}>
                    <CircularProgress color="secondary" />
                </Box>
            </div>
        );
    }

    const active = ownerships.filter(o => !o.deleted);
    const disabled = ownerships.filter(o => o.deleted);

    return (
        <div className="dashboard">
            <SideBar />
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
                {/* Zone 1: Header */}
                <Box sx={{ px: 3, py: 2, background: '#fff', borderBottom: '1px solid #e8e8e8', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                    <Box>
                        <Typography variant="h5">Eigendur</Typography>
                    </Box>
                    <Button variant="contained" sx={primaryButtonSx} onClick={() => setShowForm(true)}>
                        + Bæta við eiganda
                    </Button>
                </Box>
                {/* Zone 3: Content (no toolbar needed — no filters) */}
                <Box sx={{ flex: 1, overflowY: 'auto', p: 3 }}>
                    <AddOwnerDialog
                        open={showForm}
                        onClose={() => setShowForm(false)}
                        userId={user.id}
                        assocParam={assocParam}
                        apartments={apartments}
                        ownerships={active}
                        onCreated={() => { setShowForm(false); loadAll(); }}
                    />

                    {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

                    {active.length === 0 ? (
                        <Typography color="text.secondary" sx={{ mt: 4 }}>
                            Enginn eigandi skráður. Smelltu á „+ Bæta við eiganda" til að hefja skráningu.
                        </Typography>
                    ) : (
                        <Paper variant="outlined" sx={{ mt: 2 }}>
                            <Table size="small">
                                <TableHead sx={HEAD_SX}>
                                    <TableRow>
                                        <TableCell sx={HEAD_CELL_SX}>{lbl('name', 'Nafn')}</TableCell>
                                        <TableCell sx={HEAD_CELL_SX}>{lbl('kennitala', 'Kennitala')}</TableCell>
                                        <TableCell sx={HEAD_CELL_SX}>{lbl('email', 'Netfang')}</TableCell>
                                        <TableCell sx={HEAD_CELL_SX}>{lbl('phone', 'Símanúmer')}</TableCell>
                                        <TableCell sx={HEAD_CELL_SX}>{lbl('anr', 'Íbúð')}</TableCell>
                                        <TableCell sx={HEAD_CELL_SX}>{lbl('share', 'Hlutfall (%)')}</TableCell>
                                        <TableCell sx={HEAD_CELL_SX}>{lbl('is_payer', 'Greiðandi')}</TableCell>
                                        <TableCell />
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {sort(active).map(o => (
                                        <OwnerRow
                                            key={o.id}
                                            ownership={o}
                                            ownerships={active}
                                            onSaved={loadAll}
                                        />
                                    ))}
                                </TableBody>
                            </Table>
                        </Paper>
                    )}

                    {disabled.length > 0 && (
                        <Box sx={{ mt: 3 }}>
                            <Button
                                size="small" sx={{ ...ghostButtonSx, p: 0, minWidth: 0 }}
                                onClick={() => setShowDisabled(v => !v)}
                            >
                                {showDisabled ? '▲' : '▼'} Óvirkir eigendur ({disabled.length})
                            </Button>
                            <Collapse in={showDisabled}>
                                <Paper variant="outlined" sx={{ mt: 1 }}>
                                    <Table size="small">
                                        <TableHead sx={HEAD_SX}>
                                            <TableRow>
                                                <TableCell sx={HEAD_CELL_SX}>Nafn</TableCell>
                                                <TableCell sx={HEAD_CELL_SX}>Kennitala</TableCell>
                                                <TableCell sx={HEAD_CELL_SX}>Netfang</TableCell>
                                                <TableCell sx={HEAD_CELL_SX}>Símanúmer</TableCell>
                                                <TableCell sx={HEAD_CELL_SX}>Íbúð</TableCell>
                                                <TableCell sx={HEAD_CELL_SX}>Hlutfall (%)</TableCell>
                                                <TableCell />
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {sort(disabled).map(o => (
                                                <OwnerRow
                                                    key={o.id}
                                                    ownership={o}
                                                    ownerships={active}
                                                    onSaved={loadAll}
                                                    isDisabled
                                                />
                                            ))}
                                        </TableBody>
                                    </Table>
                                </Paper>
                            </Collapse>
                        </Box>
                    )}
                </Box>
            </Box>
        </div>
    );
}

function AddOwnerDialog({ open, onClose, userId, assocParam, apartments, ownerships, onCreated }) {
    const [kennitala, setKennitala] = useState('');
    const [apartmentId, setApartmentId] = useState('');
    const [share, setShare] = useState('');
    const [isPayer, setIsPayer] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    React.useEffect(() => {
        if (!open) { setKennitala(''); setApartmentId(''); setShare(''); setIsPayer(false); setError(''); }
    }, [open]);

    const aptActive = ownerships.filter(o => String(o.apartment_id) === String(apartmentId));
    const existingSum = aptActive.reduce((s, o) => s + parseFloat(o.share || 0), 0);
    const round2 = n => Math.round(n * 100) / 100;
    const shareOver = parseFloat(share) > 0 && round2(existingSum + parseFloat(share)) > 100;
    const isValid = kennitala.length === 10 && apartmentId && parseFloat(share) > 0 && !shareOver;

    const handleSubmit = async () => {
        setError('');
        setSaving(true);
        try {
            const resp = await fetch(`${API_URL}/Owner${assocParam}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: userId,
                    kennitala,
                    apartment_id: apartmentId,
                    share: parseFloat(share),
                    is_payer: isPayer,
                }),
            });
            if (resp.ok) {
                setKennitala(''); setApartmentId(''); setShare(''); setIsPayer(false);
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
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle sx={{ pb: 0.5 }}>
                Skrá nýjan eiganda
                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 400, mt: 0.5 }}>
                    Eigandinn verður tengdur við valda íbúð
                </Typography>
            </DialogTitle>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
                <TextField
                    label="Kennitala eiganda"
                    value={kennitala}
                    onChange={e => setKennitala(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    inputProps={{ inputMode: 'numeric', maxLength: 10 }}
                    helperText={`${kennitala.length}/10`}
                    size="small"
                    fullWidth
                />
                <FormControl size="small" fullWidth>
                    <InputLabel>Íbúð</InputLabel>
                    <Select value={apartmentId} label="Íbúð" onChange={e => setApartmentId(e.target.value)}>
                        {apartments.map(a => (
                            <MenuItem key={a.id} value={a.id}>{a.anr} — {a.fnr}</MenuItem>
                        ))}
                    </Select>
                    {apartmentId && (
                        <FormHelperText>
                            Núverandi hlutfall: {fmtPct(existingSum)} / 100%
                        </FormHelperText>
                    )}
                </FormControl>
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
                    <Typography variant="caption" color="text.secondary">Merkja sem greiðanda reikninga fyrir þessa íbúð</Typography>
                </Box>
                {error && <Alert severity="error">{error}</Alert>}
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2.5, justifyContent: 'flex-end' }}>
                <Button sx={ghostButtonSx} onClick={onClose}>Hætta við</Button>
                <Button variant="contained" sx={primaryButtonSx} disabled={!isValid || saving} onClick={handleSubmit}>
                    {saving ? <CircularProgress size={18} color="inherit" /> : 'Skrá eiganda'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

function OwnerRow({ ownership, ownerships, onSaved, isDisabled }) {
    const [editOpen, setEditOpen] = useState(false);

    return (
        <>
            <TableRow hover sx={isDisabled ? { opacity: 0.55 } : {}}>
                <TableCell>{ownership.name}</TableCell>
                <TableCell>{fmtKennitala(ownership.kennitala)}</TableCell>
                <TableCell>{ownership.email || <span style={{ color: '#bbb' }}>—</span>}</TableCell>
                <TableCell>{ownership.phone ? fmtPhone(ownership.phone) : <span style={{ color: '#bbb' }}>—</span>}</TableCell>
                <TableCell>{ownership.anr}</TableCell>
                <TableCell>{ownership.share}%</TableCell>
                {!isDisabled && (
                    <TableCell>
                        {ownership.is_payer && <LabelChip label="Greiðandi" />}
                    </TableCell>
                )}
                <TableCell align="right" sx={{ width: 48 }}>
                    <Tooltip title={isDisabled ? 'Virkja / breyta' : 'Breyta'}>
                        <IconButton size="small" onClick={() => setEditOpen(true)}>
                            <EditIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                </TableCell>
            </TableRow>

            <EditOwnerDialog
                open={editOpen}
                onClose={() => setEditOpen(false)}
                ownership={ownership}
                ownerships={ownerships}
                isDisabled={isDisabled}
                onSaved={() => { setEditOpen(false); onSaved(); }}
                onDisabled={() => { setEditOpen(false); onSaved(); }}
            />
        </>
    );
}

function EditOwnerDialog({ open, onClose, ownership, ownerships, isDisabled, onSaved, onDisabled }) {
    const { user, setUser } = React.useContext(UserContext);
    const [name, setName] = useState(ownership.name || '');
    const [share, setShare] = useState(String(ownership.share));
    const [isPayer, setIsPayer] = useState(ownership.is_payer);
    const [email, setEmail] = useState(ownership.email || '');
    const [phone, setPhone] = useState(ownership.phone || '');
    const [saving, setSaving] = useState(false);
    const [disabling, setDisabling] = useState(false);
    const [confirmDisable, setConfirmDisable] = useState(false);
    const [error, setError] = useState('');

    React.useEffect(() => {
        if (open) {
            setName(ownership.name || '');
            setShare(String(ownership.share));
            setIsPayer(ownership.is_payer);
            setEmail(ownership.email || '');
            setPhone(ownership.phone || '');
            setError('');
        }
    }, [open, ownership]);

    const others = ownerships.filter(o => o.id !== ownership.id && o.apartment_id === ownership.apartment_id);
    const otherSum = others.reduce((s, o) => s + parseFloat(o.share || 0), 0);
    const round2 = n => Math.round(n * 100) / 100;
    const shareOver = parseFloat(share) > 0 && round2(otherSum + parseFloat(share)) > 100;

    const emailValid = !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    // Accepts: 7 digits as "XXX XXXX" or "XXXXXXX", or +CC then 7+ digits (spaces allowed)
    const phoneValid = !phone || /^(\+\d{1,3}[\s-]?)?\d{3}[\s]?\d{4}$/.test(phone.trim());
    const isValid = name.trim().length > 0 && parseFloat(share) > 0 && !shareOver && emailValid && phoneValid;

    const handleSave = async () => {
        setError('');
        setSaving(true);
        const url = isDisabled
            ? `${API_URL}/Owner/enable/${ownership.id}`
            : `${API_URL}/Owner/update/${ownership.id}`;
        const method = isDisabled ? 'PATCH' : 'PUT';
        try {
            const [ownerResp, userResp] = await Promise.all([
                fetch(url, {
                    method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ share: parseFloat(share), is_payer: isPayer }),
                }),
                fetch(`${API_URL}/User/${ownership.user_id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: name.trim(), email: email.trim(), phone: fmtPhone(phone) }),
                }),
            ]);
            if (ownerResp.ok && userResp.ok) {
                // If editing the logged-in user's own contact info, sync context
                if (user && ownership.user_id === user.id) {
                    const updatedUser = { ...user, name: name.trim(), email: email.trim() || null, phone: fmtPhone(phone) || null };
                    localStorage.setItem('user', JSON.stringify(updatedUser));
                    setUser(updatedUser);
                }
                onSaved();
            } else {
                const data = ownerResp.ok ? await userResp.json() : await ownerResp.json();
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
            const resp = await fetch(`${API_URL}/Owner/delete/${ownership.id}`, { method: 'DELETE' });
            if (resp.ok) {
                setConfirmDisable(false);
                onDisabled();
            } else {
                const data = await resp.json();
                setError(data.detail || 'Villa við óvirkjun.');
                setConfirmDisable(false);
            }
        } catch {
            setError('Tenging við þjón mistókst.');
            setConfirmDisable(false);
        } finally {
            setDisabling(false);
        }
    };

    return (
        <>
            <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
                <DialogTitle>
                    {isDisabled ? 'Óvirkur eigandi' : 'Breyta eiganda'}
                </DialogTitle>
                <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
                    <Typography variant="body2" color="text.secondary">
                        Kennitala: {fmtKennitala(ownership.kennitala)} &nbsp;·&nbsp; Íbúð: {ownership.anr}
                    </Typography>
                    <TextField
                        label="Nafn"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        size="small"
                        fullWidth
                        error={name.trim().length === 0}
                        helperText={name.trim().length === 0 ? 'Nafn má ekki vera tómt' : ''}
                    />
                    <TextField
                        label="Netfang"
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        size="small"
                        fullWidth
                        error={!!email && !emailValid}
                        helperText={!!email && !emailValid ? 'Netfang verður að innihalda @ og lén (t.d. jon@husfelag.is)' : ''}
                    />
                    <TextField
                        label="Símanúmer"
                        value={phone}
                        onChange={e => setPhone(e.target.value.replace(/[^0-9+\s-]/g, ''))}
                        size="small"
                        fullWidth
                        inputProps={{ inputMode: 'tel' }}
                        error={!!phone && !phoneValid}
                        helperText={!!phone && !phoneValid ? 'Símanúmer: 7 tölustafir (t.d. 555 1234 eða +354 555 1234)' : ''}
                    />
                    <TextField
                        label="Hlutfall (%)"
                        value={share}
                        onChange={e => setShare(e.target.value.replace(/[^0-9.]/g, ''))}
                        size="small"
                        type="number"
                        inputProps={{ min: 0, max: 100, step: 0.01 }}
                        helperText={`Aðrir eigendur: ${fmtPct(otherSum)} / 100%`}
                        error={shareOver}
                        fullWidth
                    />
                    {shareOver && <Alert severity="error">Heildarhlutfall myndi fara yfir 100% fyrir þessa íbúð.</Alert>}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Chip
                            label="Greiðandi"
                            size="small"
                            color={isPayer ? 'secondary' : 'default'}
                            variant={isPayer ? 'filled' : 'outlined'}
                            onClick={() => setIsPayer(v => !v)}
                            sx={{ cursor: 'pointer' }}
                        />
                        <Typography variant="caption" color="text.secondary">Greiðandi reikninga fyrir þessa íbúð</Typography>
                    </Box>
                    {error && <Alert severity="error">{error}</Alert>}
                </DialogContent>
                <DialogActions sx={{ justifyContent: 'space-between', px: 3, pb: 2 }}>
                    <Box>
                        {!isDisabled && (
                            <Button sx={{ ...destructiveButtonSx, fontSize: '0.8rem' }} onClick={() => setConfirmDisable(true)}>
                                Óvirkja eiganda
                            </Button>
                        )}
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button sx={ghostButtonSx} onClick={onClose}>Hætta við</Button>
                        <Button
                            variant="contained" sx={primaryButtonSx}
                            disabled={!isValid || saving} onClick={handleSave}
                        >
                            {saving
                                ? <CircularProgress size={18} color="inherit" />
                                : isDisabled ? 'Virkja eiganda' : 'Vista'}
                        </Button>
                    </Box>
                </DialogActions>
            </Dialog>

            <Dialog open={confirmDisable} onClose={() => setConfirmDisable(false)} maxWidth="xs" fullWidth>
                <DialogTitle>Óvirkja eiganda</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Ertu viss um að þú viljir óvirkja eigandann <strong>{ownership.name}</strong> á íbúð <strong>{ownership.anr}</strong>?
                    </DialogContentText>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button sx={ghostButtonSx} onClick={() => setConfirmDisable(false)}>Hætta við</Button>
                    <Button sx={destructiveButtonSx} disabled={disabling} onClick={handleDisable}>
                        {disabling ? <CircularProgress size={18} color="inherit" /> : 'Já, óvirkja'}
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
}

export default OwnersPage;
