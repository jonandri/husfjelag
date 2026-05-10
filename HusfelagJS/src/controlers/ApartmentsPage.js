import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    Box, Typography, CircularProgress, Paper,
    Button, TextField, Collapse, IconButton,
    Dialog, DialogActions,
    Alert, Tooltip, DialogContentText,
    InputAdornment,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import CloseIcon from '@mui/icons-material/Close';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import AddIcon from '@mui/icons-material/Add';
import { useHelp } from '../ui/HelpContext';
import { UserContext } from './UserContext';
import { apiFetch } from '../api';
import SideBar from './Sidebar';
import { fmtPct } from '../format';
import { primaryButtonSx, secondaryButtonSx, ghostButtonSx, destructiveButtonSx } from '../ui/buttons';
import useKennitalaLookup from '../ui/useKennitalaLookup';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8010';

/* ── Page-level tokens ──────────────────────────────────────────── */
const NAVY = '#1D366F';
const GREEN = '#08C076';
const BORDER = '#e8e8e8';
const BORDER_ROW = '#f2f2f2';
const COLS = '110px 140px 90px 80px 80px 80px minmax(200px, 1fr) 44px';

/* ── Dialog tokens ──────────────────────────────────────────────── */
const DLGBORDER   = '#e8e8e8';
const DLGNAVY     = '#1D366F';
const DLGNAVYTINT = '#eef1f8';
const DLGGREEN    = '#08C076';
const DLGGREENTINT = '#e8f5e9';
const DLGTEXT2    = '#555';
const DLGDIS      = '#888';
const DLGWARN     = '#e65100';
const DLGPOS      = '#2e7d32';
const DLGBGTB     = '#fafafa';

/* ── Helpers ────────────────────────────────────────────────────── */
function getInitials(name) {
    const words = (name || '').trim().split(/\s+/);
    return words.slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('');
}

/* ── Page components ────────────────────────────────────────────── */
function OwnerPill({ o }) {
    const isGreen = o.is_payer;
    const bg = isGreen ? 'rgba(8,192,118,0.12)' : 'rgba(29,54,111,0.10)';
    const fg = isGreen ? GREEN : NAVY;
    return (
        <Box sx={{
            display: 'inline-flex', alignItems: 'center', gap: '7px',
            background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 999,
            py: '2px', pl: '2px', pr: '10px', fontSize: 12.5, whiteSpace: 'nowrap',
        }}>
            <Box sx={{
                width: 22, height: 22, borderRadius: '50%',
                background: bg, color: fg, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 600, fontSize: 10.5,
            }}>
                {getInitials(o.name)}
            </Box>
            <span>{o.name}</span>
            {o.is_payer && (
                <Box sx={{
                    width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
                    background: GREEN, color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 9, fontWeight: 700, ml: '-4px',
                }}>kr</Box>
            )}
        </Box>
    );
}

function TableHeader({ cols, showOwners = true }) {
    return (
        <Box sx={{
            display: 'grid', gridTemplateColumns: cols,
            px: 2.25, py: 1.25,
            background: '#f5f5f5', borderBottom: `1px solid ${BORDER}`,
            fontSize: '0.7rem', fontWeight: 600, color: '#888',
            letterSpacing: '0.06em', textTransform: 'uppercase', alignItems: 'center',
        }}>
            <Box>Merking</Box>
            <Box>Fastanúmer</Box>
            <Box sx={{ textAlign: 'right' }}>Stærð</Box>
            <Box sx={{ textAlign: 'right', color: NAVY }}>Hlutfall</Box>
            <Box sx={{ textAlign: 'right', color: NAVY }}>Hiti</Box>
            <Box sx={{ textAlign: 'right', color: NAVY }}>Lóð</Box>
            <Box sx={{ pl: '18px', borderLeft: `1px dashed ${BORDER}` }}>
                {showOwners ? 'Eigendur' : ''}
            </Box>
            <Box />
        </Box>
    );
}

function ApartmentsPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const { user, assocParam } = React.useContext(UserContext);
    const { openHelp } = useHelp();
    const [apartments, setApartments] = useState(undefined);
    const [error, setError] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [showDisabled, setShowDisabled] = useState(false);

    useEffect(() => {
        if (!user) { navigate('/login'); return; }
        if (location.state?.openAdd) {
            setShowForm(true);
            navigate(location.pathname, { replace: true, state: {} });
        }
        loadApartments();
    }, [user, assocParam]); // eslint-disable-line react-hooks/exhaustive-deps

    const loadApartments = async () => {
        try {
            const resp = await apiFetch(`${API_URL}/Apartment/${user.id}${assocParam}`);
            if (resp.ok) setApartments(await resp.json());
            else { setError('Villa við að sækja íbúðir.'); setApartments([]); }
        } catch {
            setError('Tenging við þjón mistókst.'); setApartments([]);
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

    const active = [...apartments.filter(a => !a.deleted)]
        .sort((a, b) => a.anr.localeCompare(b.anr, 'is'));
    const disabled = [...apartments.filter(a => a.deleted)]
        .sort((a, b) => a.anr.localeCompare(b.anr, 'is'));

    const totalSize   = active.reduce((s, a) => s + parseFloat(a.size   || 0), 0);
    const totalShare  = active.reduce((s, a) => s + parseFloat(a.share  || 0), 0);
    const totalShare2 = active.reduce((s, a) => s + parseFloat(a.share_2 || 0), 0);
    const totalShare3 = active.reduce((s, a) => s + parseFloat(a.share_3 || 0), 0);
    const totalOwners = active.reduce((s, a) => s + (a.owners?.length || 0), 0);
    const ratiosOk = active.length > 0 &&
        [totalShare, totalShare2, totalShare3].every(v => Math.abs(v - 100) < 0.01);

    const KPIS = [
        { label: 'HLUTFALL', val: totalShare,  hint: 'Almennur rekstur',  desc: 'Öllum almennum rekstri er skipt eftir eignarhluta í eignaskiptasamning (þinglýst skjal).' },
        { label: 'HITI',     val: totalShare2, hint: 'Hitakostnaður',     desc: 'Kostnaði af sameiginlegur hitamælir er skipt eftir m² (eða mæli) og er að finna í eignaskiptasamningi.' },
        { label: 'LÓÐ',      val: totalShare3, hint: 'Lóðarframlag',      desc: 'Kostnaði við garðurumhirðu og bílaplan er skipt eftir lóðarmældum hluta sem er að finna í eignaskiptasamningi.' },
    ];

    return (
        <div className="dashboard">
            <SideBar />
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>

                {/* Zone ①: Header */}
                <Box sx={{ px: 3, py: 2, background: '#fff', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                    <Box>
                        <Typography variant="h5">
                            Íbúðir
                            {active.length > 0 && (
                                <Box component="span" sx={{ fontWeight: 300, color: 'text.disabled', ml: 1 }}>
                                    {active.length}
                                </Box>
                            )}
                        </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                        {user.is_superadmin && (
                            <Button variant="outlined" sx={secondaryButtonSx} onClick={() => navigate('/ibudir/innflutningur')}>
                                ⬇ Innflutningur
                            </Button>
                        )}
                        <Button variant="contained" sx={primaryButtonSx} onClick={() => setShowForm(true)}>
                            + Bæta við íbúð
                        </Button>
                        <Tooltip title="Hjálp">
                            <IconButton size="small" onClick={() => openHelp('ibudir')}>
                                <HelpOutlineIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
                            </IconButton>
                        </Tooltip>
                    </Box>
                </Box>

                {/* Zone ③: Content */}
                <Box sx={{ flex: 1, overflowY: 'auto', p: 3 }}>
                    <AddApartmentDialog
                        open={showForm}
                        onClose={() => setShowForm(false)}
                        userId={user.id}
                        assocParam={assocParam}
                        apartments={active}
                        onCreated={(updated) => { setShowForm(false); setApartments(updated); }}
                    />

                    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

                    {active.length === 0 ? (
                        <Paper variant="outlined" sx={{ p: 3, borderColor: 'secondary.main', bgcolor: 'rgba(8,192,118,0.05)' }}>
                            <Typography variant="subtitle1" color="secondary" sx={{ mb: 0.5 }}>
                                Skrá íbúðir
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                Enginn búinn að skrá íbúðir. Bættu við íbúðum handvirkt til að byrja.
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                                <Button variant="contained" sx={primaryButtonSx} onClick={() => setShowForm(true)}>
                                    + Bæta við íbúð
                                </Button>
                                {user.is_superadmin && (
                                    <Button variant="outlined" sx={secondaryButtonSx} onClick={() => navigate('/ibudir/innflutningur')}>
                                        ⬇ Flytja inn frá HMS
                                    </Button>
                                )}
                            </Box>
                        </Paper>
                    ) : (
                        <>
                            {/* KPI strip */}
                            <Box sx={{
                                display: 'grid', gridTemplateColumns: '0.95fr 1fr 1fr 1fr',
                                border: `1px solid ${BORDER}`, borderRadius: 2,
                                overflow: 'hidden', mb: 2,
                            }}>
                                <Box sx={{
                                    px: 2.25, py: 1.75, background: '#fafafa',
                                    borderRight: `1px solid ${BORDER}`, display: 'flex', flexDirection: 'column',
                                }}>
                                    <Typography sx={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', color: NAVY, textTransform: 'uppercase', mb: 0.75 }}>
                                        EIGNARHLUTFÖLL
                                    </Typography>
                                    <Typography sx={{ fontSize: 12.5, color: 'text.secondary', lineHeight: 1.45, flex: 1 }}>
                                        Þrjú kostnaðarhlutföll skipta sameiginlegum kostnaði. Skráð á íbúðir við stofnun og breytast sjaldan.
                                    </Typography>
                                    <Typography sx={{ fontSize: 12.5, color: 'text.secondary', lineHeight: 1.45, flex: 1 }}>
                                        Einnig er jafnskiptur kostnaður sem deilist jafnt.
                                    </Typography>

                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 1.25 }}>
                                        {ratiosOk
                                            ? <CheckCircleOutlineIcon sx={{ fontSize: 15, color: '#2e7d32' }} />
                                            : <ErrorOutlineIcon sx={{ fontSize: 15, color: '#c62828' }} />
                                        }
                                        <Typography sx={{ fontSize: 12, color: ratiosOk ? '#2e7d32' : '#c62828' }}>
                                            {ratiosOk ? 'Allir lyklar = 100,00%' : 'Súlur stemma ekki'}
                                        </Typography>
                                    </Box>
                                </Box>
                                {KPIS.map((c, i) => (
                                    <Box key={i} sx={{
                                        px: 2.25, py: 1.75,
                                        borderRight: i < 2 ? `1px solid ${BORDER}` : 'none',
                                        display: 'flex', flexDirection: 'column',
                                    }}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 0.25 }}>
                                            <Typography sx={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', color: '#888', textTransform: 'uppercase' }}>
                                                {c.label}
                                            </Typography>
                                            <Typography sx={{ fontSize: 10.5, color: 'text.disabled' }}>{c.hint}</Typography>
                                        </Box>
                                        <Typography sx={{ fontSize: 22, fontWeight: 300, mt: 0.25, letterSpacing: '-0.01em', color: NAVY }}>
                                            {fmtPct(c.val)}
                                        </Typography>
                                        <Typography sx={{ fontSize: 11.5, color: 'text.secondary', mt: 0.75, lineHeight: 1.4 }}>
                                            {c.desc}
                                        </Typography>
                                    </Box>
                                ))}
                            </Box>

                            {/* Main table */}
                            <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
                                <TableHeader cols={COLS} />
                                {active.map((apt, i) => (
                                    <ApartmentRowV1
                                        key={apt.id}
                                        apt={apt}
                                        apartments={active}
                                        isLast={i === active.length - 1}
                                        onOwnersChanged={loadApartments}
                                        onSaved={loadApartments}
                                    />
                                ))}
                                <Box sx={{
                                    display: 'grid', gridTemplateColumns: COLS,
                                    px: 2.25, py: 1.5,
                                    borderTop: '2px solid rgba(0,0,0,0.12)',
                                    background: '#fafafa',
                                    fontWeight: 600, fontSize: 13, alignItems: 'center',
                                }}>
                                    <Box>Samtals</Box>
                                    <Box />
                                    <Box sx={{ textAlign: 'right', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                                        {totalSize.toFixed(2)} m²
                                    </Box>
                                    <Box sx={{ textAlign: 'right', fontFamily: 'monospace', color: ratiosOk ? '#2e7d32' : '#c62828' }}>
                                        {fmtPct(totalShare)}
                                    </Box>
                                    <Box sx={{ textAlign: 'right', fontFamily: 'monospace', color: ratiosOk ? '#2e7d32' : '#c62828' }}>
                                        {fmtPct(totalShare2)}
                                    </Box>
                                    <Box sx={{ textAlign: 'right', fontFamily: 'monospace', color: ratiosOk ? '#2e7d32' : '#c62828' }}>
                                        {fmtPct(totalShare3)}
                                    </Box>
                                    <Box sx={{ pl: '18px', borderLeft: `1px dashed ${BORDER}`, fontWeight: 400, fontSize: 12.5, color: 'text.secondary' }}>
                                        {totalOwners} eigendur
                                    </Box>
                                    <Box />
                                </Box>
                            </Paper>

                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                    <Box sx={{
                                        width: 14, height: 14, borderRadius: '50%',
                                        background: GREEN, color: '#fff',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: 9, fontWeight: 700,
                                    }}>kr</Box>
                                    <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Greiðandi reiknings</Typography>
                                </Box>
                                {disabled.length > 0 && (
                                    <Button size="small" sx={{ ...ghostButtonSx, p: 0, minWidth: 0 }} onClick={() => setShowDisabled(v => !v)}>
                                        {showDisabled ? '▲' : '▼'} Óvirkar íbúðir ({disabled.length})
                                    </Button>
                                )}
                            </Box>

                            {disabled.length > 0 && (
                                <Collapse in={showDisabled}>
                                    <Paper variant="outlined" sx={{ mt: 1, overflow: 'hidden' }}>
                                        <TableHeader cols={COLS} showOwners={false} />
                                        {disabled.map((apt, i) => (
                                            <ApartmentRowV1
                                                key={apt.id}
                                                apt={apt}
                                                apartments={active}
                                                isLast={i === disabled.length - 1}
                                                onOwnersChanged={loadApartments}
                                                onSaved={loadApartments}
                                                isDisabled
                                            />
                                        ))}
                                    </Paper>
                                </Collapse>
                            )}
                        </>
                    )}
                </Box>
            </Box>
        </div>
    );
}

function ApartmentRowV1({ apt, apartments, isLast, onOwnersChanged, onSaved, isDisabled }) {
    const [ownerDialogOpen, setOwnerDialogOpen] = useState(false);
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const { user } = React.useContext(UserContext);

    return (
        <>
            <Box sx={{
                display: 'grid', gridTemplateColumns: COLS,
                px: 2.25, py: 1.75,
                borderBottom: isLast ? 'none' : `1px solid ${BORDER_ROW}`,
                alignItems: 'center', fontSize: 13.5,
                opacity: isDisabled ? 0.55 : 1,
                transition: 'background 0.1s',
                '&:hover': { background: '#fafafa' },
            }}>
                <Box sx={{ fontWeight: 500 }}>{apt.anr}</Box>
                <Box sx={{ fontFamily: 'monospace', fontSize: 12, color: 'text.secondary' }}>{apt.fnr}</Box>
                <Box sx={{ textAlign: 'right', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                    {parseFloat(apt.size || 0).toFixed(2)}
                    <Box component="span" sx={{ fontSize: 11, color: 'text.disabled', ml: '3px' }}>m²</Box>
                </Box>
                <Box sx={{ textAlign: 'right', fontFamily: 'monospace', color: NAVY, fontWeight: 500 }}>
                    {fmtPct(apt.share)}
                </Box>
                <Box sx={{ textAlign: 'right', fontFamily: 'monospace', color: NAVY, fontWeight: 500 }}>
                    {fmtPct(apt.share_2)}
                </Box>
                <Box sx={{ textAlign: 'right', fontFamily: 'monospace', color: NAVY, fontWeight: 500 }}>
                    {fmtPct(apt.share_3)}
                </Box>
                <Box sx={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center', pl: '18px', borderLeft: `1px dashed ${BORDER}` }}>
                    {!isDisabled && apt.owners?.map(o => <OwnerPill key={o.id} o={o} />)}
                    {!isDisabled && (
                        <Box
                            component="button"
                            onClick={() => setOwnerDialogOpen(true)}
                            sx={{
                                display: 'inline-flex', alignItems: 'center', gap: '4px',
                                background: 'transparent', border: `1px dashed ${BORDER}`,
                                borderRadius: 999, px: 1.25, py: '3px',
                                fontSize: 12, color: 'text.secondary', cursor: 'pointer',
                                '&:hover': { borderColor: NAVY, color: NAVY },
                            }}
                        >
                            <AddIcon sx={{ fontSize: 13 }} />Eigandi
                        </Box>
                    )}
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Tooltip title={isDisabled ? 'Virkja / breyta' : 'Breyta'}>
                        <IconButton size="small" onClick={() => setEditDialogOpen(true)}>
                            <EditIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                </Box>
            </Box>

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

/* ── Dialog primitives ──────────────────────────────────────────── */

function DlgSection({ children, hint }) {
    return (
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mt: 2.5, mb: 1.25 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: DLGDIS }}>
                {children}
            </span>
            {hint && <span style={{ fontSize: 12, color: DLGTEXT2 }}>{hint}</span>}
        </Box>
    );
}

function CtxChip({ children, color = 'navy' }) {
    const bg = color === 'green' ? DLGGREENTINT : DLGNAVYTINT;
    const fg = color === 'green' ? DLGPOS : DLGNAVY;
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '3px 9px', borderRadius: 999, background: bg, color: fg,
            fontSize: 11.5, fontWeight: 600,
        }}>
            {children}
        </span>
    );
}

function ToggleRow({ on, onToggle, onLabel, offLabel, hint, children }) {
    return (
        <div style={{ border: `1px solid ${DLGBORDER}`, borderRadius: 8, padding: '12px 14px', background: on ? '#fff' : DLGBGTB }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button
                    type="button"
                    onClick={onToggle}
                    style={{
                        width: 32, height: 18, borderRadius: 999, border: 'none',
                        background: on ? DLGNAVY : '#cfd2d8',
                        position: 'relative', cursor: 'pointer', padding: 0, flexShrink: 0,
                        transition: 'background 150ms',
                    }}
                >
                    <span style={{
                        position: 'absolute', top: 2, left: on ? 16 : 2,
                        width: 14, height: 14, borderRadius: '50%', background: '#fff',
                        transition: 'left 150ms', display: 'block',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                    }} />
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 500 }}>{on ? onLabel : offLabel}</div>
                    {hint && <div style={{ fontSize: 12, color: DLGTEXT2, marginTop: 2 }}>{hint}</div>}
                </div>
            </div>
            {on && children && <div style={{ marginTop: 12 }}>{children}</div>}
        </div>
    );
}

function SharePctField({ label, value, onChange, error, helperText }) {
    return (
        <TextField
            label={label}
            value={value}
            onChange={e => onChange(e.target.value.replace(/[^0-9.]/g, ''))}
            size="small"
            type="number"
            inputProps={{ min: 0, max: 100, step: 0.01 }}
            InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }}
            helperText={helperText}
            error={!!error}
            fullWidth
        />
    );
}

/* ── AddApartmentDialog ─────────────────────────────────────────── */
function AddApartmentDialog({ open, onClose, userId, assocParam, apartments, onCreated }) {
    const [anr, setAnr] = useState('');
    const [fnr, setFnr] = useState('');
    const [size, setSize] = useState('');
    const [share, setShare] = useState('');
    const [share2, setShare2] = useState('');
    const [share2Custom, setShare2Custom] = useState(false);
    const [share3, setShare3] = useState('');
    const [share3Custom, setShare3Custom] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    React.useEffect(() => {
        if (!open) {
            setAnr(''); setFnr(''); setSize(''); setShare('');
            setShare2(''); setShare2Custom(false);
            setShare3(''); setShare3Custom(false);
            setSaving(false); setError('');
        }
    }, [open]);

    const eff2 = share2Custom ? share2 : share;
    const eff3 = share3Custom ? share3 : share;

    const existingShare  = apartments.reduce((s, a) => s + parseFloat(a.share   || 0), 0);
    const existingShare2 = apartments.reduce((s, a) => s + parseFloat(a.share_2 || 0), 0);
    const existingShare3 = apartments.reduce((s, a) => s + parseFloat(a.share_3 || 0), 0);
    const round2 = n => Math.round(n * 100) / 100;
    const shareOver  = parseFloat(share)  > 0 && round2(existingShare  + parseFloat(share))  > 100;
    const share2Over = parseFloat(eff2)   > 0 && round2(existingShare2 + parseFloat(eff2))   > 100;
    const share3Over = parseFloat(eff3)   > 0 && round2(existingShare3 + parseFloat(eff3))   > 100;

    const totalShare  = round2(existingShare  + parseFloat(share  || 0));
    const totalShare2 = round2(existingShare2 + parseFloat(eff2   || 0));
    const totalShare3 = round2(existingShare3 + parseFloat(eff3   || 0));
    const allOk = totalShare === 100 && totalShare2 === 100 && totalShare3 === 100;

    const isValid = anr.trim() && fnr.trim()
        && parseFloat(share) >= 0 && parseFloat(eff2) >= 0 && parseFloat(eff3) >= 0
        && !shareOver && !share2Over && !share3Over;

    const handleSubmit = async () => {
        setError(''); setSaving(true);
        try {
            const resp = await apiFetch(`${API_URL}/Apartment${assocParam}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: userId, anr, fnr,
                    size: parseFloat(size) || 0,
                    share: parseFloat(share) || 0,
                    share_2: parseFloat(eff2) || 0,
                    share_3: parseFloat(eff3) || 0,
                }),
            });
            if (resp.ok) { onCreated(await resp.json()); }
            else { const data = await resp.json(); setError(data.detail || 'Villa við skráningu.'); }
        } catch {
            setError('Tenging við þjón mistókst.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth={false}
            PaperProps={{ sx: { width: 680, maxWidth: '95vw', borderRadius: '12px', overflow: 'hidden' } }}
        >
            <Box sx={{ p: '20px 24px 16px', borderBottom: `1px solid ${DLGBORDER}`, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <Box>
                    <Typography sx={{ fontSize: 20, fontWeight: 600, lineHeight: 1.25 }}>Skrá nýja íbúð</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        Íbúðin verður bætt við húsfélagið — hlutföll verður að setja upp handvirkt.
                    </Typography>
                </Box>
                <IconButton size="small" onClick={onClose} sx={{ mt: -0.5 }}>
                    <CloseIcon sx={{ fontSize: 20 }} />
                </IconButton>
            </Box>

            <Box sx={{ p: '20px 24px', overflowY: 'auto' }}>
                <DlgSection hint="Eins og þau birtast í Þjóðskrá / FMR">Auðkenni</DlgSection>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                    <TextField label="Merking" value={anr} onChange={e => setAnr(e.target.value)} size="small" fullWidth />
                    <TextField label="Fastanúmer" value={fnr} onChange={e => setFnr(e.target.value)} size="small" fullWidth
                        inputProps={{ style: { fontFamily: 'monospace' } }} />
                </Box>

                <DlgSection hint="Grunnur sem hin hlutföllin nota sjálfgefið">Stærð og grunnhlutfall</DlgSection>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                    <TextField
                        label="Stærð" value={size}
                        onChange={e => setSize(e.target.value.replace(/[^0-9.]/g, ''))}
                        size="small" type="number" inputProps={{ min: 0, step: 0.01 }}
                        InputProps={{ endAdornment: <InputAdornment position="end">m²</InputAdornment> }}
                        fullWidth
                    />
                    <SharePctField
                        label="Matshlutfall" value={share} onChange={setShare}
                        helperText="Skv. eignaskiptasamningi" error={shareOver}
                    />
                </Box>
                {shareOver && <Alert severity="error" sx={{ mt: 1 }}>Heildarhlutfall (matshlutfall) myndi fara yfir 100%</Alert>}

                <DlgSection hint="Aðeins nauðsynlegt ef hiti eða lóð er reiknuð öðruvísi en grunnhlutfall">Sérstök hlutföll</DlgSection>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                    <ToggleRow on={share2Custom} onToggle={() => setShare2Custom(v => !v)}
                        onLabel="Hiti — sérstakt hlutfall"
                        offLabel={`Hiti — fylgir grunnhlutfalli (${share || 0}%)`}
                        hint={share2Custom ? 'Reiknað eftir mæli, ekki eignahlut.' : 'Smelltu til að setja annað gildi.'}
                    >
                        <SharePctField label="Matshlutfall hita" value={share2} onChange={setShare2} error={share2Over} />
                    </ToggleRow>
                    <ToggleRow on={share3Custom} onToggle={() => setShare3Custom(v => !v)}
                        onLabel="Lóð — sérstakt hlutfall"
                        offLabel={`Lóð — fylgir grunnhlutfalli (${share || 0}%)`}
                        hint="Smelltu til að setja annað gildi."
                    >
                        <SharePctField label="Matshlutfall lóðar" value={share3} onChange={setShare3} error={share3Over} />
                    </ToggleRow>
                </Box>
                {(share2Over || share3Over) && (
                    <Alert severity="error" sx={{ mt: 1 }}>
                        {share2Over && 'Heildarhlutfall hita fer yfir 100%. '}
                        {share3Over && 'Heildarhlutfall lóðar fer yfir 100%.'}
                    </Alert>
                )}

                {(share || eff2 || eff3) && (
                    <Box sx={{ mt: 2.25, p: '10px 14px', borderRadius: 1, background: DLGNAVYTINT, display: 'flex', alignItems: 'center', gap: 1.5, fontSize: '12.5px' }}>
                        <Box sx={{ flex: 1 }}>
                            Eftir vistun:{' '}
                            <strong style={{ fontFamily: 'monospace' }}>Hlutfall {totalShare.toFixed(2)}%</strong>
                            {' · '}
                            <strong style={{ fontFamily: 'monospace' }}>Hiti {totalShare2.toFixed(2)}%</strong>
                            {' · '}
                            <strong style={{ fontFamily: 'monospace' }}>Lóð {totalShare3.toFixed(2)}%</strong>
                        </Box>
                        {allOk
                            ? <span style={{ color: DLGPOS, fontWeight: 600, whiteSpace: 'nowrap' }}>✓ Allir lyklar = 100%</span>
                            : <span style={{ color: DLGWARN, fontWeight: 500, fontSize: 12, whiteSpace: 'nowrap' }}>Ekki allir lyklar = 100%</span>
                        }
                    </Box>
                )}
                {error && <Alert severity="error" sx={{ mt: 1.5 }}>{error}</Alert>}
            </Box>

            <Box sx={{ p: '14px 20px', borderTop: `1px solid ${DLGBORDER}`, display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                <Button sx={ghostButtonSx} onClick={onClose}>Hætta við</Button>
                <Button variant="contained" sx={primaryButtonSx} disabled={!isValid || saving} onClick={handleSubmit}>
                    {saving ? <CircularProgress size={18} color="inherit" /> : 'Skrá íbúð'}
                </Button>
            </Box>
        </Dialog>
    );
}

/* ── EditApartmentDialog ────────────────────────────────────────── */
function EditApartmentDialog({ open, onClose, apt, apartments, isDisabled, onSaved, onDeleted }) {
    const [anr, setAnr] = useState(apt.anr);
    const [fnr, setFnr] = useState(apt.fnr);
    const [size, setSize] = useState(String(apt.size || ''));
    const [share, setShare] = useState(String(apt.share));
    const [share2, setShare2] = useState(String(apt.share_2));
    const [share2Custom, setShare2Custom] = useState(false);
    const [share3, setShare3] = useState(String(apt.share_3));
    const [share3Custom, setShare3Custom] = useState(false);
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
            setShare2Custom(Math.abs(parseFloat(apt.share_2 || 0) - parseFloat(apt.share || 0)) > 0.005);
            setShare3Custom(Math.abs(parseFloat(apt.share_3 || 0) - parseFloat(apt.share || 0)) > 0.005);
            setError('');
        }
    }, [open, apt]);

    const eff2 = share2Custom ? share2 : share;
    const eff3 = share3Custom ? share3 : share;

    const others = apartments.filter(a => a.id !== apt.id);
    const otherShare  = others.reduce((s, a) => s + parseFloat(a.share   || 0), 0);
    const otherShare2 = others.reduce((s, a) => s + parseFloat(a.share_2 || 0), 0);
    const otherShare3 = others.reduce((s, a) => s + parseFloat(a.share_3 || 0), 0);
    const round2 = n => Math.round(n * 100) / 100;
    const shareOver  = round2(otherShare  + parseFloat(share  || 0)) > 100;
    const share2Over = round2(otherShare2 + parseFloat(eff2   || 0)) > 100;
    const share3Over = round2(otherShare3 + parseFloat(eff3   || 0)) > 100;

    const totalShare  = round2(otherShare  + parseFloat(share  || 0));
    const totalShare2 = round2(otherShare2 + parseFloat(eff2   || 0));
    const totalShare3 = round2(otherShare3 + parseFloat(eff3   || 0));
    const allOk = totalShare === 100 && totalShare2 === 100 && totalShare3 === 100;

    const isValid = anr.trim() && fnr.trim()
        && parseFloat(share) >= 0 && parseFloat(eff2) >= 0 && parseFloat(eff3) >= 0
        && !shareOver && !share2Over && !share3Over;

    const payload = { anr, fnr, size: parseFloat(size) || 0, share: parseFloat(share) || 0, share_2: parseFloat(eff2) || 0, share_3: parseFloat(eff3) || 0 };

    const handleSave = async () => {
        setError(''); setSaving(true);
        try {
            const resp = await apiFetch(`${API_URL}/Apartment/update/${apt.id}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
            });
            if (resp.ok) { onSaved(); }
            else { const data = await resp.json(); setError(data.detail || 'Villa við uppfærslu.'); }
        } catch { setError('Tenging við þjón mistókst.'); } finally { setSaving(false); }
    };

    const handleDisable = async () => {
        setDeleting(true);
        try {
            const resp = await apiFetch(`${API_URL}/Apartment/delete/${apt.id}`, { method: 'DELETE' });
            if (resp.ok) { setConfirmDelete(false); onDeleted(); }
            else { const data = await resp.json(); setError(data.detail || 'Villa við óvirkjun.'); setConfirmDelete(false); }
        } catch { setError('Tenging við þjón mistókst.'); setConfirmDelete(false); } finally { setDeleting(false); }
    };

    const handleEnable = async () => {
        setError(''); setSaving(true);
        try {
            const resp = await apiFetch(`${API_URL}/Apartment/enable/${apt.id}`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
            });
            if (resp.ok) { onSaved(); }
            else { const data = await resp.json(); setError(data.detail || 'Villa við virkjun.'); }
        } catch { setError('Tenging við þjón mistókst.'); } finally { setSaving(false); }
    };

    return (
        <>
        <Dialog open={open} onClose={onClose} maxWidth={false}
            PaperProps={{ sx: { width: 680, maxWidth: '95vw', borderRadius: '12px', overflow: 'hidden' } }}
        >
            <Box sx={{ p: '20px 24px 16px', borderBottom: `1px solid ${DLGBORDER}`, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <Box>
                    <Box sx={{ display: 'flex', gap: 1, mb: 0.75, alignItems: 'center' }}>
                        <CtxChip>Íbúð</CtxChip>
                    </Box>
                    <Typography sx={{ fontSize: 20, fontWeight: 600, lineHeight: 1.25 }}>
                        {isDisabled ? `Óvirk íbúð — ${apt.anr}` : `Breyta íbúð ${apt.anr}`}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        Skipulagslegir reitir — breytast sjaldan og hafa áhrif á reikningagerð fyrir alla eigendur.
                    </Typography>
                </Box>
                <IconButton size="small" onClick={onClose} sx={{ mt: -0.5 }}>
                    <CloseIcon sx={{ fontSize: 20 }} />
                </IconButton>
            </Box>

            <Box sx={{ p: '20px 24px', overflowY: 'auto' }}>
                <DlgSection hint="Eins og þau birtast í Þjóðskrá / FMR">Auðkenni</DlgSection>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                    <TextField label="Merking" value={anr} onChange={e => setAnr(e.target.value)} size="small" fullWidth />
                    <TextField label="Fastanúmer" value={fnr} onChange={e => setFnr(e.target.value)} size="small" fullWidth
                        inputProps={{ style: { fontFamily: 'monospace' } }}
                        helperText="Sótt sjálfkrafa úr Fasteignaskrá" />
                </Box>

                <DlgSection hint="Grunnur sem hin hlutföllin nota sjálfgefið">Stærð og grunnhlutfall</DlgSection>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                    <TextField
                        label="Stærð" value={size}
                        onChange={e => setSize(e.target.value.replace(/[^0-9.]/g, ''))}
                        size="small" type="number" inputProps={{ min: 0, step: 0.01 }}
                        InputProps={{ endAdornment: <InputAdornment position="end">m²</InputAdornment> }}
                        fullWidth
                    />
                    <SharePctField
                        label="Matshlutfall" value={share} onChange={setShare}
                        helperText="Skv. eignaskiptasamningi" error={shareOver}
                    />
                </Box>
                {shareOver && <Alert severity="error" sx={{ mt: 1 }}>Heildarhlutfall (matshlutfall) myndi fara yfir 100%</Alert>}

                <DlgSection hint="Aðeins nauðsynlegt ef hiti eða lóð er reiknuð öðruvísi en grunnhlutfall">Sérstök hlutföll</DlgSection>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                    <ToggleRow on={share2Custom} onToggle={() => setShare2Custom(v => !v)}
                        onLabel="Hiti — sérstakt hlutfall"
                        offLabel={`Hiti — fylgir grunnhlutfalli (${share || 0}%)`}
                        hint={share2Custom ? 'Reiknað eftir mæli, ekki eignahlut.' : 'Smelltu til að setja annað gildi.'}
                    >
                        <SharePctField label="Matshlutfall hita" value={share2} onChange={setShare2} error={share2Over} />
                    </ToggleRow>
                    <ToggleRow on={share3Custom} onToggle={() => setShare3Custom(v => !v)}
                        onLabel="Lóð — sérstakt hlutfall"
                        offLabel={`Lóð — fylgir grunnhlutfalli (${share || 0}%)`}
                        hint="Smelltu til að setja annað gildi."
                    >
                        <SharePctField label="Matshlutfall lóðar" value={share3} onChange={setShare3} error={share3Over} />
                    </ToggleRow>
                </Box>
                {(share2Over || share3Over) && (
                    <Alert severity="error" sx={{ mt: 1 }}>
                        {share2Over && 'Heildarhlutfall hita fer yfir 100%. '}
                        {share3Over && 'Heildarhlutfall lóðar fer yfir 100%.'}
                    </Alert>
                )}

                <Box sx={{ mt: 2.25, p: '10px 14px', borderRadius: 1, background: DLGNAVYTINT, display: 'flex', alignItems: 'center', gap: 1.5, fontSize: '12.5px' }}>
                    <Box sx={{ flex: 1 }}>
                        Eftir vistun:{' '}
                        <strong style={{ fontFamily: 'monospace' }}>Hlutfall {totalShare.toFixed(2)}%</strong>
                        {' · '}
                        <strong style={{ fontFamily: 'monospace' }}>Hiti {totalShare2.toFixed(2)}%</strong>
                        {' · '}
                        <strong style={{ fontFamily: 'monospace' }}>Lóð {totalShare3.toFixed(2)}%</strong>
                    </Box>
                    {allOk
                        ? <span style={{ color: DLGPOS, fontWeight: 600, whiteSpace: 'nowrap' }}>✓ Allir lyklar = 100%</span>
                        : <span style={{ color: DLGWARN, fontWeight: 500, fontSize: 12, whiteSpace: 'nowrap' }}>Ekki allir lyklar = 100%</span>
                    }
                </Box>
                {error && <Alert severity="error" sx={{ mt: 1.5 }}>{error}</Alert>}
            </Box>

            {!isDisabled && (
                <Box sx={{ borderTop: `1px solid ${DLGBORDER}`, p: '12px 24px', background: DLGBGTB, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5 }}>
                    <Box>
                        <Typography sx={{ fontSize: 13, fontWeight: 500 }}>Óvirkja íbúð</Typography>
                        <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
                            Hættir að birtast í reikningum og yfirliti — gögnum er haldið.
                        </Typography>
                    </Box>
                    <button
                        onClick={() => setConfirmDelete(true)}
                        style={{ background: 'transparent', border: `1px solid ${DLGBORDER}`, color: '#c62828', padding: '6px 12px', borderRadius: 4, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}
                    >
                        Óvirkja
                    </button>
                </Box>
            )}

            <Box sx={{ p: '14px 20px', borderTop: `1px solid ${DLGBORDER}`, display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                <Button sx={ghostButtonSx} onClick={onClose}>Hætta við</Button>
                <Button variant="contained" sx={primaryButtonSx} disabled={!isValid || saving} onClick={isDisabled ? handleEnable : handleSave}>
                    {saving ? <CircularProgress size={18} color="inherit" /> : isDisabled ? 'Virkja íbúð' : 'Vista breytingar'}
                </Button>
            </Box>
        </Dialog>

        <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)} maxWidth="xs" fullWidth>
            <Box sx={{ p: 3 }}>
                <Typography variant="h6" sx={{ mb: 1 }}>Óvirkja íbúð</Typography>
                <DialogContentText>
                    Ertu viss um að þú viljir óvirkja íbúð <strong>{apt.anr}</strong>?
                </DialogContentText>
            </Box>
            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button sx={ghostButtonSx} onClick={() => setConfirmDelete(false)}>Hætta við</Button>
                <Button variant="contained" sx={destructiveButtonSx} disabled={deleting} onClick={handleDisable}>
                    {deleting ? <CircularProgress size={18} color="inherit" /> : 'Já, óvirkja'}
                </Button>
            </DialogActions>
        </Dialog>
        </>
    );
}

/* ── Kennitala name feedback row ─────────────────────────────── */
function KennitalaNameFeedback({ status, name }) {
    if (status === 'idle') return null;
    if (status === 'loading') return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1, mb: 0.5 }}>
            <CircularProgress size={13} sx={{ color: '#1D366F' }} />
            <Typography sx={{ fontSize: 12.5, color: '#666' }}>Fletti upp í Þjóðskrá…</Typography>
        </Box>
    );
    if (status === 'found') return (
        <Box sx={{ mt: 1, mb: 0.5, px: 1.5, py: 0.875, background: '#f0f7f0', borderRadius: 1.5, border: '1px solid #c8e6c9', display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 600, color: '#2e7d32' }}>{name}</Typography>
        </Box>
    );
    if (status === 'not_found') return (
        <Box sx={{ mt: 1, mb: 0.5, px: 1.5, py: 0.875, background: '#fff8e1', borderRadius: 1.5, border: '1px solid #ffe082' }}>
            <Typography sx={{ fontSize: 12.5, color: '#b26a00' }}>Kennitala fannst ekki í Þjóðskrá.</Typography>
        </Box>
    );
    return (
        <Box sx={{ mt: 1, mb: 0.5, px: 1.5, py: 0.875, background: '#fff3f3', borderRadius: 1.5, border: '1px solid #ffcdd2' }}>
            <Typography sx={{ fontSize: 12.5, color: '#c62828' }}>Villa við Þjóðskrárflettingu.</Typography>
        </Box>
    );
}

/* ── OwnerDialog (three-step add) ───────────────────────────────── */
function OwnerDialog({ open, onClose, apt, userId, onChanged }) {
    const { assocParam } = React.useContext(UserContext);
    const [kennitala, setKennitala] = useState('');
    const [share, setShare] = useState('');
    const [isPayer, setIsPayer] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const { name: lookedUpName, lookupStatus } = useKennitalaLookup(kennitala);

    React.useEffect(() => {
        if (open) { setKennitala(''); setShare(''); setIsPayer(false); setError(''); }
    }, [open]);

    const existingSum = apt.owners.reduce((s, o) => s + parseFloat(o.share || 0), 0);
    const round2 = n => Math.round(n * 100) / 100;
    const shareOver = parseFloat(share) > 0 && round2(existingSum + parseFloat(share)) > 100;
    const isValid = kennitala.length === 10 && parseFloat(share) > 0 && !shareOver;
    const newSharePct = parseFloat(share) || 0;
    const remaining = round2(100 - existingSum);
    const currentPayer = apt.owners.find(o => o.is_payer);

    const handleAdd = async () => {
        setError(''); setSaving(true);
        try {
            const resp = await apiFetch(`${API_URL}/Owner${assocParam}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: userId, kennitala,
                    apartment_id: apt.id,
                    share: parseFloat(share), is_payer: isPayer,
                }),
            });
            if (resp.ok) { onChanged(); }
            else { const data = await resp.json(); setError(data.detail || 'Villa við skráningu.'); }
        } catch {
            setError('Tenging við þjón mistókst.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth={false}
            PaperProps={{ sx: { width: 620, maxWidth: '95vw', borderRadius: '12px', overflow: 'hidden' } }}
        >
            <Box sx={{ p: '20px 24px 16px', borderBottom: `1px solid ${DLGBORDER}`, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', gap: 1, mb: 0.75, alignItems: 'center', flexWrap: 'wrap' }}>
                        <CtxChip color="green">Nýr eigandi</CtxChip>
                        <CtxChip>Íbúð {apt.anr}</CtxChip>
                    </Box>
                    <Typography sx={{ fontSize: 20, fontWeight: 600, lineHeight: 1.25 }}>Skrá nýjan eiganda</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        Sláðu inn kennitölu — nafn er sótt sjálfkrafa úr Þjóðskrá.
                    </Typography>
                </Box>
                <IconButton size="small" onClick={onClose} sx={{ mt: -0.5 }}>
                    <CloseIcon sx={{ fontSize: 20 }} />
                </IconButton>
            </Box>

            <Box sx={{ p: '20px 24px', overflowY: 'auto' }}>
                <DlgSection>① Þjóðskrárfletting</DlgSection>
                <TextField
                    label="Kennitala"
                    value={kennitala}
                    onChange={e => setKennitala(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    inputProps={{ inputMode: 'numeric', maxLength: 10, style: { fontFamily: 'monospace' } }}
                    InputProps={{ endAdornment: <InputAdornment position="end">{kennitala.length}/10</InputAdornment> }}
                    size="small" fullWidth
                    helperText="10 tölustafir — bandstrik er valfrjálst"
                />
                <KennitalaNameFeedback status={lookupStatus} name={lookedUpName} />

                <DlgSection hint="Forvalið út frá síðu sem þú varst á">② Tenging við íbúð</DlgSection>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 1.5 }}>
                    <TextField
                        label="Íbúð"
                        value={`${apt.anr}${apt.size ? ` — ${apt.size} m²` : ''}`}
                        size="small" fullWidth disabled
                    />
                    <TextField
                        label="Hlutfall"
                        value={share}
                        onChange={e => setShare(e.target.value.replace(/[^0-9.]/g, ''))}
                        size="small" type="number"
                        inputProps={{ min: 0, max: 100, step: 0.01 }}
                        InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }}
                        helperText={`Eftir: ${round2(remaining - newSharePct).toFixed(2)}%`}
                        error={shareOver} fullWidth
                    />
                </Box>

                {(existingSum > 0 || newSharePct > 0) && (
                    <Box sx={{ mt: 1.5, p: '10px 14px', border: `1px solid ${DLGBORDER}`, borderRadius: 2 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75, fontSize: '11.5px', color: DLGTEXT2, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
                            <span>Skipting í íbúð {apt.anr} eftir vistun</span>
                            <span style={{ color: round2(existingSum + newSharePct) === 100 ? DLGPOS : DLGWARN }}>
                                {round2(existingSum + newSharePct).toFixed(2)}%
                            </span>
                        </Box>
                        <Box sx={{ height: 10, borderRadius: 999, overflow: 'hidden', background: '#f3f4f6', display: 'flex' }}>
                            {apt.owners.map((o, i) => (
                                <div key={o.id} style={{ width: `${parseFloat(o.share)}%`, background: i % 2 === 0 ? DLGNAVY : '#3d5a9f' }} />
                            ))}
                            {newSharePct > 0 && <div style={{ width: `${newSharePct}%`, background: DLGGREEN }} />}
                        </Box>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '3px 10px', mt: 0.75, fontSize: '11.5px' }}>
                            {apt.owners.map((o, i) => (
                                <span key={o.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: DLGTEXT2 }}>
                                    <span style={{ width: 8, height: 8, borderRadius: 2, background: i % 2 === 0 ? DLGNAVY : '#3d5a9f', display: 'inline-block' }} />
                                    {o.name} · {parseFloat(o.share).toFixed(2)}%
                                </span>
                            ))}
                            {newSharePct > 0 && (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                    <span style={{ width: 8, height: 8, borderRadius: 2, background: DLGGREEN, display: 'inline-block' }} />
                                    Nýr eigandi · {newSharePct.toFixed(2)}%
                                </span>
                            )}
                        </Box>
                    </Box>
                )}

                <DlgSection>③ Greiðandi reikninga</DlgSection>
                <Box sx={{ display: 'flex', gap: 1 }}>
                    {[
                        {
                            val: false,
                            label: 'Ekki greiðandi',
                            sub: currentPayer ? `${currentPayer.name} er enn greiðandi` : 'Enginn greiðandi skráður',
                        },
                        {
                            val: true,
                            label: 'Já — gera greiðanda',
                            sub: currentPayer ? `Tekur við af ${currentPayer.name}` : 'Þessi eigandi verður greiðandi',
                        },
                    ].map(opt => (
                        <Box
                            key={String(opt.val)}
                            onClick={() => setIsPayer(opt.val)}
                            sx={{
                                flex: 1, p: '12px 14px', cursor: 'pointer', borderRadius: 2,
                                border: `${isPayer === opt.val ? '1.5px' : '1px'} solid ${isPayer === opt.val ? DLGNAVY : DLGBORDER}`,
                                background: isPayer === opt.val ? DLGNAVYTINT : '#fff',
                                display: 'flex', alignItems: 'center', gap: 1.25,
                            }}
                        >
                            <span style={{
                                width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                                border: `2px solid ${isPayer === opt.val ? DLGNAVY : DLGBORDER}`,
                                background: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                {isPayer === opt.val && <span style={{ width: 8, height: 8, borderRadius: '50%', background: DLGNAVY }} />}
                            </span>
                            <div>
                                <div style={{ fontSize: 13.5, fontWeight: 500 }}>{opt.label}</div>
                                <div style={{ fontSize: 11.5, color: DLGTEXT2 }}>{opt.sub}</div>
                            </div>
                        </Box>
                    ))}
                </Box>

                {shareOver && <Alert severity="error" sx={{ mt: 1.5 }}>Heildarhlutfall eigenda myndi fara yfir 100% fyrir þessa íbúð.</Alert>}
                {error && <Alert severity="error" sx={{ mt: 1.5 }}>{error}</Alert>}
            </Box>

            <Box sx={{ p: '14px 20px', borderTop: `1px solid ${DLGBORDER}`, display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                <Button sx={ghostButtonSx} onClick={onClose}>Hætta við</Button>
                <Button variant="contained" sx={primaryButtonSx} disabled={!isValid || saving} onClick={handleAdd}>
                    {saving ? <CircularProgress size={18} color="inherit" /> : 'Skrá eiganda'}
                </Button>
            </Box>
        </Dialog>
    );
}

export default ApartmentsPage;
