import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box, Typography, CircularProgress,
    Button, TextField, Chip, IconButton,
    Dialog, DialogTitle, DialogContent, DialogActions,
    Alert, DialogContentText,
    MenuItem, Select, FormControl, InputLabel, FormHelperText,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import SearchIcon from '@mui/icons-material/Search';
import { UserContext } from './UserContext';
import { apiFetch } from '../api';
import SideBar from './Sidebar';
import { fmtPct, fmtKennitala, fmtPhone } from '../format';
import { primaryButtonSx, ghostButtonSx, destructiveButtonSx } from '../ui/buttons';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8010';

const NAVY = '#1D366F';
const GREEN = '#08C076';
const GREEN_TINT = '#e8f5e9';
const NAVY_TINT = '#eef1f8';
const BORDER = '#e8e8e8';
const BORDER_ROW = '#f2f2f2';
const BG_TOOLBAR = '#fafafa';
const TEXT_SECONDARY = '#555555';
const TEXT_DISABLED = '#888888';
const WARNING = '#e65100';
const POSITIVE = '#2e7d32';

const COLS = '30px 1.4fr 130px 1.4fr 110px 70px 90px 40px';

function getInitials(name) {
    if (!name) return '?';
    return name.trim().split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

function ContactCell({ value, type }) {
    if (!value) {
        return (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: WARNING, fontStyle: 'italic' }}>
                <span>+</span>vantar
            </span>
        );
    }
    const href = type === 'email' ? `mailto:${value}` : `tel:${value.replace(/\s/g, '')}`;
    return (
        <a href={href} style={{ color: NAVY, textDecoration: 'none', fontSize: 13 }}>
            {type === 'phone' ? fmtPhone(value) : value}
        </a>
    );
}

function ColHeaders() {
    return (
        <div style={{
            display: 'grid', gridTemplateColumns: COLS,
            padding: '8px 18px', fontSize: 10.5, fontWeight: 600,
            color: TEXT_DISABLED, letterSpacing: '0.06em', textTransform: 'uppercase',
            borderBottom: `1px solid ${BORDER_ROW}`, alignItems: 'center',
        }}>
            <div /><div>Nafn</div><div>Kennitala</div>
            <div>Netfang</div><div>Sími</div>
            <div style={{ textAlign: 'right' }}>Hlutur</div>
            <div style={{ textAlign: 'center' }}>Greiðandi</div>
            <div />
        </div>
    );
}

function OwnerGridRow({ ownership, ownerships, isLast, isDisabled, onSaved }) {
    const [editOpen, setEditOpen] = useState(false);
    const isPayer = ownership.is_payer;

    return (
        <>
            <div style={{
                display: 'grid', gridTemplateColumns: COLS,
                padding: '12px 18px',
                borderBottom: isLast ? 'none' : `1px solid ${BORDER_ROW}`,
                alignItems: 'center', fontSize: 13,
                opacity: isDisabled ? 0.55 : 1,
            }}>
                <div style={{
                    width: 26, height: 26, borderRadius: '50%',
                    background: isPayer ? GREEN_TINT : NAVY_TINT,
                    color: isPayer ? POSITIVE : NAVY,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 600, fontSize: 10.5,
                }}>
                    {getInitials(ownership.name)}
                </div>
                <div style={{ fontWeight: 500 }}>{ownership.name}</div>
                <div style={{ fontSize: 12, color: TEXT_SECONDARY }}>{fmtKennitala(ownership.kennitala)}</div>
                <ContactCell value={ownership.email} type="email" />
                <ContactCell value={ownership.phone} type="phone" />
                <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{ownership.share}%</div>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 18, height: 18, borderRadius: '50%', border: '2px solid',
                        borderColor: isPayer ? GREEN : BORDER,
                        background: isPayer ? GREEN : '#fff',
                    }}>
                        {isPayer && <span style={{ color: '#fff', fontSize: 11, fontWeight: 700, lineHeight: 1 }}>✓</span>}
                    </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <IconButton size="small" onClick={() => setEditOpen(true)}>
                        <EditIcon sx={{ fontSize: 17, color: TEXT_SECONDARY }} />
                    </IconButton>
                </div>
            </div>
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

function AptGroup({ anr, apt, owners, allOwnerships, onAddOwner, onSaved }) {
    return (
        <div style={{ border: `1px solid ${BORDER}`, borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 18px', background: BG_TOOLBAR, borderBottom: `1px solid ${BORDER}` }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>Íbúð {anr}</div>
                {apt && (
                    <div style={{ fontSize: 12, color: TEXT_SECONDARY }}>
                        {apt.size ? `${parseFloat(apt.size).toFixed(2)} m²` : ''}
                        {apt.size && apt.share ? ' · ' : ''}
                        {apt.share ? `${parseFloat(apt.share).toFixed(2)}% hlutfall` : ''}
                    </div>
                )}
                <div style={{ flex: 1 }} />
                <div style={{ fontSize: 12, color: TEXT_SECONDARY }}>
                    {owners.length} {owners.length === 1 ? 'eigandi' : 'eigendur'}
                </div>
                <button
                    onClick={onAddOwner}
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '4px 10px', fontSize: 12, fontWeight: 500,
                        background: 'transparent', border: `1px solid ${BORDER}`,
                        borderRadius: 4, cursor: 'pointer', color: TEXT_SECONDARY, minHeight: 0,
                    }}
                >
                    + Skipta um eiganda
                </button>
            </div>
            <ColHeaders />
            {owners.map((o, j) => (
                <OwnerGridRow
                    key={o.id}
                    ownership={o}
                    ownerships={allOwnerships}
                    isLast={j === owners.length - 1}
                    onSaved={onSaved}
                />
            ))}
        </div>
    );
}

function OwnersPage() {
    const navigate = useNavigate();
    const { user, assocParam } = React.useContext(UserContext);
    const [ownerships, setOwnerships] = useState(undefined);
    const [apartments, setApartments] = useState([]);
    const [error, setError] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [defaultAptId, setDefaultAptId] = useState('');
    const [showDisabled, setShowDisabled] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilter, setActiveFilter] = useState('all');

    useEffect(() => {
        if (!user) { navigate('/login'); return; }
        loadAll();
    }, [user, assocParam]); // eslint-disable-line react-hooks/exhaustive-deps

    const loadAll = async () => {
        try {
            const [ownRes, aptRes] = await Promise.all([
                apiFetch(`${API_URL}/Owner/${user.id}${assocParam}`),
                apiFetch(`${API_URL}/Apartment/${user.id}${assocParam}`),
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
    const missingEmail = active.filter(o => !o.email).length;
    const missingPhone = active.filter(o => !o.phone).length;

    const filteredActive = active.filter(o => {
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            if (
                !o.name?.toLowerCase().includes(q) &&
                !o.kennitala?.includes(q) &&
                !o.anr?.toLowerCase().includes(q)
            ) return false;
        }
        if (activeFilter === 'payers') return o.is_payer;
        if (activeFilter === 'no_phone') return !o.phone;
        if (activeFilter === 'no_email') return !o.email;
        return true;
    });

    const grouped = {};
    filteredActive.forEach(o => {
        const key = o.anr || '?';
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(o);
    });
    const aptKeys = Object.keys(grouped).sort((a, b) => a.localeCompare(b, 'is'));

    const filterPills = [
        { key: 'all', label: `Allir · ${active.length}` },
        { key: 'payers', label: `Greiðendur · ${active.filter(o => o.is_payer).length}` },
        ...(missingPhone > 0 ? [{ key: 'no_phone', label: `Vantar síma · ${missingPhone}`, warn: true }] : []),
        ...(missingEmail > 0 ? [{ key: 'no_email', label: `Vantar netfang · ${missingEmail}` }] : []),
    ];

    return (
        <div className="dashboard">
            <SideBar />
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
                {/* Zone 1: Header */}
                <Box sx={{
                    px: 3, py: 2, background: '#fff',
                    borderBottom: `1px solid ${BORDER}`,
                    display: 'flex', justifyContent: 'space-between',
                    alignItems: 'flex-start', flexShrink: 0,
                }}>
                    <Box>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>Húsfélag</Typography>
                        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                            <Typography variant="h5" sx={{ fontWeight: 600 }}>Eigendur</Typography>
                            <Typography variant="h5" sx={{ fontWeight: 300, color: 'text.disabled' }}>
                                {active.length}
                            </Typography>
                        </Box>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button
                            variant="outlined"
                            sx={{ ...ghostButtonSx, borderColor: BORDER, color: TEXT_SECONDARY }}
                        >
                            Sendu skilaboð
                        </Button>
                        <Button
                            variant="contained"
                            sx={primaryButtonSx}
                            startIcon={<PersonAddIcon sx={{ fontSize: 17 }} />}
                            onClick={() => { setDefaultAptId(''); setShowForm(true); }}
                        >
                            Bæta við eiganda
                        </Button>
                    </Box>
                </Box>

                {/* Zone 2+3: Content */}
                <Box sx={{ flex: 1, overflowY: 'auto', p: '16px 32px 24px' }}>
                    {/* Toolbar */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1.75, flexWrap: 'wrap' }}>
                        <Box sx={{
                            display: 'flex', alignItems: 'center', gap: 1,
                            px: 1.5, py: 0.875,
                            border: `1px solid ${BORDER}`, borderRadius: '6px',
                            flex: '0 1 280px',
                        }}>
                            <SearchIcon sx={{ fontSize: 18, color: TEXT_DISABLED }} />
                            <input
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder="Leita að nafni, kennitölu, íbúð…"
                                style={{
                                    border: 'none', outline: 'none', flex: 1,
                                    fontSize: 13, fontFamily: 'inherit', background: 'transparent',
                                }}
                            />
                        </Box>
                        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                            {filterPills.map(f => (
                                <span
                                    key={f.key}
                                    onClick={() => setActiveFilter(f.key)}
                                    style={{
                                        padding: '6px 10px',
                                        border: `1px solid ${activeFilter === f.key ? NAVY : BORDER}`,
                                        color: f.warn ? WARNING : activeFilter === f.key ? NAVY : TEXT_SECONDARY,
                                        borderRadius: 999,
                                        background: activeFilter === f.key ? NAVY_TINT : 'transparent',
                                        fontWeight: activeFilter === f.key ? 500 : 400,
                                        cursor: 'pointer',
                                        fontSize: 12.5,
                                        display: 'inline-flex', alignItems: 'center', gap: 4,
                                        whiteSpace: 'nowrap',
                                    }}
                                >
                                    {f.label}
                                </span>
                            ))}
                        </Box>
                        <Box sx={{ flex: 1 }} />
                        <Box sx={{ fontSize: 12, color: TEXT_SECONDARY }}>
                            Flokka eftir: <strong style={{ color: '#111' }}>Íbúð ▾</strong>
                        </Box>
                    </Box>

                    <AddOwnerDialog
                        open={showForm}
                        onClose={() => setShowForm(false)}
                        userId={user.id}
                        assocParam={assocParam}
                        apartments={apartments}
                        ownerships={active}
                        defaultApartmentId={defaultAptId}
                        onCreated={() => { setShowForm(false); loadAll(); }}
                    />

                    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

                    {active.length === 0 ? (
                        <Typography color="text.secondary" sx={{ mt: 4 }}>
                            Enginn eigandi skráður. Smelltu á „+ Bæta við eiganda" til að hefja skráningu.
                        </Typography>
                    ) : aptKeys.length === 0 ? (
                        <Typography color="text.secondary" sx={{ mt: 4 }}>
                            Enginn eigandi fannst fyrir þessa leit.
                        </Typography>
                    ) : (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.75 }}>
                            {aptKeys.map(anr => (
                                <AptGroup
                                    key={anr}
                                    anr={anr}
                                    apt={apartments.find(a => a.anr === anr)}
                                    owners={grouped[anr]}
                                    allOwnerships={active}
                                    onAddOwner={() => {
                                        const apt = apartments.find(a => a.anr === anr);
                                        setDefaultAptId(apt?.id || '');
                                        setShowForm(true);
                                    }}
                                    onSaved={loadAll}
                                />
                            ))}
                        </Box>
                    )}

                    {/* Disabled owners */}
                    {disabled.length > 0 && (
                        <Box sx={{ mt: 3 }}>
                            <button
                                onClick={() => setShowDisabled(v => !v)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: TEXT_SECONDARY, padding: 0 }}
                            >
                                {showDisabled ? '▲' : '▼'} Óvirkir eigendur ({disabled.length})
                            </button>
                            {showDisabled && (
                                <Box sx={{ mt: 1, border: `1px solid ${BORDER}`, borderRadius: '8px', overflow: 'hidden' }}>
                                    <ColHeaders />
                                    {disabled.map((o, j) => (
                                        <OwnerGridRow
                                            key={o.id}
                                            ownership={o}
                                            ownerships={active}
                                            isDisabled
                                            isLast={j === disabled.length - 1}
                                            onSaved={loadAll}
                                        />
                                    ))}
                                </Box>
                            )}
                        </Box>
                    )}

                    <Box sx={{ mt: 2, fontSize: 12, color: TEXT_SECONDARY, display: 'flex', alignItems: 'center', gap: 1 }}>
                        <span style={{ fontSize: 15, color: TEXT_DISABLED }}>ℹ</span>
                        Greiðandi á sér eitt val per íbúð — sá sem fær reikninga húsfélagsins.
                    </Box>
                </Box>
            </Box>
        </div>
    );
}

function AddOwnerDialog({ open, onClose, userId, assocParam, apartments, ownerships, onCreated, defaultApartmentId = '' }) {
    const [kennitala, setKennitala] = useState('');
    const [apartmentId, setApartmentId] = useState('');
    const [share, setShare] = useState('');
    const [isPayer, setIsPayer] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    React.useEffect(() => {
        if (!open) {
            setKennitala(''); setApartmentId(''); setShare(''); setIsPayer(false); setError('');
        } else {
            setApartmentId(defaultApartmentId || '');
        }
    }, [open, defaultApartmentId]);

    const aptActive = ownerships.filter(o => String(o.apartment_id) === String(apartmentId));
    const existingSum = aptActive.reduce((s, o) => s + parseFloat(o.share || 0), 0);
    const round2 = n => Math.round(n * 100) / 100;
    const shareOver = parseFloat(share) > 0 && round2(existingSum + parseFloat(share)) > 100;
    const isValid = kennitala.length === 10 && apartmentId && parseFloat(share) > 0 && !shareOver;

    const handleSubmit = async () => {
        setError('');
        setSaving(true);
        try {
            const resp = await apiFetch(`${API_URL}/Owner${assocParam}`, {
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
                apiFetch(url, {
                    method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ share: parseFloat(share), is_payer: isPayer }),
                }),
                apiFetch(`${API_URL}/User/${ownership.user_id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: name.trim(), email: email.trim(), phone: fmtPhone(phone) }),
                }),
            ]);
            if (ownerResp.ok && userResp.ok) {
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
            const resp = await apiFetch(`${API_URL}/Owner/delete/${ownership.id}`, { method: 'DELETE' });
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
