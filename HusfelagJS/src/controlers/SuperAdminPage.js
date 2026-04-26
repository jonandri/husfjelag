import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box, Typography, Paper, TextField, Button, Divider,
    CircularProgress, Alert, Grid,
    Dialog, DialogTitle, DialogContent, DialogActions,
    RadioGroup, FormControlLabel, Radio,
    MenuItem, Select, FormControl,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { UserContext } from './UserContext';
import { apiFetch } from '../api';
import SideBar from './Sidebar';
import { fmtKennitala } from '../format';
import { primaryButtonSx, secondaryButtonSx, ghostButtonSx } from '../ui/buttons';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8010';

function SuperAdminPage() {
    const navigate = useNavigate();
    const { user, setCurrentAssociation } = React.useContext(UserContext);
    const [createOpen, setCreateOpen] = useState(false);
    const [prefillAssocSsn, setPrefillAssocSsn] = useState('');
    const [prefillChairSsn, setPrefillChairSsn] = useState('');
    const [reviewingRequestId, setReviewingRequestId] = useState(null);
    const [pendingRefreshKey, setPendingRefreshKey] = useState(0);

    const handleReview = (req) => {
        setPrefillAssocSsn(req.assoc_ssn);
        setPrefillChairSsn(req.chair_ssn);
        setReviewingRequestId(req.id);
        setCreateOpen(true);
    };

    React.useEffect(() => {
        if (!user) { navigate('/login'); return; }
        if (!user.is_superadmin) { navigate('/husfelag'); }
    }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!user?.is_superadmin) return null;

    return (
        <div className="dashboard">
            <SideBar />
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
                <Box sx={{ px: 3, py: 2, background: '#fff', borderBottom: '1px solid #e8e8e8', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Typography variant="h5">Kerfisstjóri</Typography>
                    <Button
                        variant="contained"
                        sx={primaryButtonSx}
                        startIcon={<AddIcon />}
                        onClick={() => setCreateOpen(true)}
                    >
                        Stofna húsfélag
                    </Button>
                </Box>
                <Box sx={{ flex: 1, overflowY: 'auto', p: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <PendingRequestsPanel user={user} onReview={handleReview} refreshKey={pendingRefreshKey} />
                    <KpiPanel user={user} />
                    <ImpersonatePanel user={user} onSelect={(assoc) => setCurrentAssociation(assoc)} />
                </Box>
            </Box>
            <CreateAssociationDialog
                open={createOpen}
                onClose={() => {
                    setCreateOpen(false);
                    setPrefillAssocSsn('');
                    setPrefillChairSsn('');
                    setReviewingRequestId(null);
                }}
                user={user}
                onCreated={async (assoc) => {
                    if (reviewingRequestId) {
                        try {
                            await apiFetch(`${API_URL}/admin/RegistrationRequest/${reviewingRequestId}`, {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ status: 'REVIEWED' }),
                            });
                            setPendingRefreshKey(k => k + 1);
                        } catch {
                            // best-effort; association already created
                        }
                        setReviewingRequestId(null);
                    }
                    setPrefillAssocSsn('');
                    setPrefillChairSsn('');
                    setCurrentAssociation(assoc);
                    setCreateOpen(false);
                    navigate('/husfelag');
                }}
                initialAssocSsn={prefillAssocSsn}
                initialChairSsn={prefillChairSsn}
            />
        </div>
    );
}

function PendingRequestsPanel({ user, onReview, refreshKey }) {
    const [requests, setRequests] = React.useState([]);
    const [loading, setLoading] = React.useState(true);
    // Map of assoc_ssn → true (already registered) | false (not registered) | null (checking)
    const [existsMap, setExistsMap] = React.useState({});

    const load = React.useCallback(() => {
        setLoading(true);
        apiFetch(`${API_URL}/admin/RegistrationRequest`)
            .then(r => r.ok ? r.json() : [])
            .then(data => {
                setRequests(data);
                // Check each association's existence in parallel
                const checks = {};
                data.forEach(req => { checks[req.assoc_ssn] = null; });
                setExistsMap(checks);
                data.forEach(req => {
                    apiFetch(`${API_URL}/Association/verify?ssn=${req.assoc_ssn}`)
                        .then(r => r.ok ? r.json() : null)
                        .then(info => {
                            if (info) setExistsMap(prev => ({ ...prev, [req.assoc_ssn]: !!info.already_registered }));
                        })
                        .catch(() => {});
                });
            })
            .catch(() => setRequests([]))
            .finally(() => setLoading(false));
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    React.useEffect(() => { load(); }, [load, refreshKey]);

    if (loading) return <CircularProgress size={20} color="secondary" />;
    if (requests.length === 0) return null;

    return (
        <Paper variant="outlined" sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
                Beiðnir um skráningu húsfélags ({requests.length})
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {requests.map(req => {
                    const alreadyExists = existsMap[req.assoc_ssn];
                    return (
                        <Box key={req.id} sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, flexWrap: 'wrap' }}>
                            <Box sx={{ flex: 1, minWidth: 200 }}>
                                <Typography variant="body2" fontWeight={600}>{req.assoc_name}</Typography>
                                <Typography variant="body2" color="text.secondary">
                                    Kennitala: {fmtKennitala(req.assoc_ssn)} · Formaður: {req.chair_name} ({fmtKennitala(req.chair_ssn)})
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    {req.chair_email} · {req.chair_phone}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    Sent af {req.submitted_by} · {new Date(req.created_at).toLocaleDateString('is-IS')}
                                </Typography>
                            </Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                                {alreadyExists === null && <CircularProgress size={16} color="secondary" />}
                                {alreadyExists === true && (
                                    <Typography variant="caption" sx={{ color: 'warning.main', fontWeight: 600 }}>
                                        Þegar skráð
                                    </Typography>
                                )}
                                {alreadyExists === false && (
                                    <Button
                                        size="small"
                                        sx={{ ...secondaryButtonSx, whiteSpace: 'nowrap' }}
                                        onClick={() => onReview(req)}
                                    >
                                        Stofna húsfélag
                                    </Button>
                                )}
                            </Box>
                        </Box>
                    );
                })}
            </Box>
        </Paper>
    );
}

// 'custom' means the user typed a different kennitala manually
const CUSTOM_CHAIR = '__custom__';

function CreateAssociationDialog({ open, onClose, user, onCreated, initialAssocSsn = '', initialChairSsn = '' }) {
    const [assocSsn, setAssocSsn] = useState('');
    const [looking, setLooking] = useState(false);
    const [lookupError, setLookupError] = useState('');
    const [preview, setPreview] = useState(null);       // verify response
    const [chairSelection, setChairSelection] = useState(''); // national_id of selected prokuruhafi, or CUSTOM_CHAIR
    const [customChairSsn, setCustomChairSsn] = useState('');
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState('');

    const reset = () => {
        setAssocSsn(''); setPreview(null); setLookupError('');
        setChairSelection(''); setCustomChairSsn(''); setSaveError('');
    };

    const handleClose = () => { reset(); onClose(); };

    // Prefill SSNs when dialog opens with pre-supplied values
    React.useEffect(() => {
        if (open && initialAssocSsn) {
            setAssocSsn(initialAssocSsn);
            if (initialChairSsn) setCustomChairSsn(initialChairSsn);
        }
    }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

    // Auto-trigger lookup once assocSsn reaches 10 digits from prefill
    React.useEffect(() => {
        const digits = assocSsn.replace(/-/g, '');
        if (digits.length === 10 && !preview && !looking) {
            handleLookup();
        }
    }, [assocSsn]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleLookup = async () => {
        setLookupError(''); setPreview(null); setChairSelection('');
        if (!initialChairSsn) setCustomChairSsn('');
        setLooking(true);
        try {
            const ssn = assocSsn.replace(/-/g, '');
            const resp = await apiFetch(`${API_URL}/Association/verify?ssn=${ssn}`);
            const data = await resp.json();
            if (!resp.ok) {
                setLookupError(data.detail || 'Villa við leit.');
                return;
            }
            setPreview(data);
            // Pre-select the first prokuruhafi if exactly one and not already registered
            if (!data.already_registered) {
                if (initialChairSsn) {
                    setChairSelection(CUSTOM_CHAIR);
                    setCustomChairSsn(initialChairSsn);
                } else if (data.prokuruhafar?.length === 1) {
                    setChairSelection(data.prokuruhafar[0].national_id);
                } else if (!data.prokuruhafar?.length) {
                    setChairSelection(CUSTOM_CHAIR);
                }
            }
        } catch {
            setLookupError('Tenging við þjón mistókst.');
        } finally {
            setLooking(false);
        }
    };

    const effectiveChairSsn = chairSelection === CUSTOM_CHAIR
        ? customChairSsn.replace(/-/g, '')
        : chairSelection;

    const canCreate = !!preview && !preview.already_registered && !!effectiveChairSsn && effectiveChairSsn.length === 10 && !saving;

    const handleCreate = async () => {
        setSaveError(''); setSaving(true);
        try {
            const resp = await apiFetch(`${API_URL}/admin/Association`, {
                method: 'POST',
                body: JSON.stringify({
                    association_ssn: assocSsn.replace(/-/g, ''),
                    chair_ssn: effectiveChairSsn,
                }),
            });
            const data = await resp.json();
            if (resp.ok) {
                reset();
                onCreated(data);
            } else {
                setSaveError(data.detail || 'Villa við stofnun.');
            }
        } catch {
            setSaveError('Tenging við þjón mistókst.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
            <DialogTitle>Stofna húsfélag</DialogTitle>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '20px !important' }}>

                <Typography variant="body2" color="text.secondary">
                    Upplýsingar húsfélags eru sóttar sjálfkrafa úr þjóðskrá fyrirtækja (Skattur Cloud).
                </Typography>


                {/* Step 1 — Association SSN + lookup */}
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                        <TextField
                            label="Kennitala húsfélags"
                            value={assocSsn}
                            onChange={e => { setAssocSsn(e.target.value.replace(/[^0-9-]/g, '')); setLookupError(''); setPreview(null); }}
                            size="small" fullWidth autoFocus
                            placeholder="000000-0000"
                        />
                    </Box>
                    <Button
                        variant="contained"
                        sx={{ ...secondaryButtonSx, whiteSpace: 'nowrap', flexShrink: 0, mt: 0.25 }}
                        disabled={assocSsn.replace(/-/g,'').length !== 10 || looking}
                        onClick={handleLookup}
                    >
                        {looking ? <CircularProgress size={16} color="inherit" /> : 'Fletta upp'}
                    </Button>
                </Box>

                {lookupError && <Alert severity="error">{lookupError}</Alert>}

                {/* Step 2 — Association info + chair selection */}
                {preview && (
                    <>
                        <Divider />

                        {/* Already registered warning */}
                        {preview.already_registered && (
                            <Alert severity="warning">Þetta húsfélag er þegar skráð í kerfið.</Alert>
                        )}

                        {/* Association details */}
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                            <Typography variant="subtitle2" fontWeight={600}>{preview.name}</Typography>
                            <Typography variant="body2" color="text.secondary">
                                {preview.address}, {preview.postal_code} {preview.city}
                            </Typography>
                            {preview.status && (
                                <Typography variant="body2" color="text.secondary">Staða: {preview.status}</Typography>
                            )}
                        </Box>

                        <Divider />

                        {/* Prókúruhafar — always shown */}
                        <Box>
                            <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                                Prókúruhafar
                            </Typography>
                            {preview.prokuruhafar?.length > 0 ? (
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                                    {preview.prokuruhafar.map(p => (
                                        <Typography key={p.national_id} variant="body2">
                                            {p.name} — {fmtKennitala(p.national_id)}
                                        </Typography>
                                    ))}
                                </Box>
                            ) : (
                                <Typography variant="body2" color="text.secondary">Engir prókúruhafar skráðir.</Typography>
                            )}
                        </Box>

                        {/* Chair selection — only when not already registered */}
                        {!preview.already_registered && <>
                            <Divider />
                            <Box>
                                <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                                    Formaður
                                </Typography>
                                <RadioGroup
                                    value={chairSelection}
                                    onChange={e => setChairSelection(e.target.value)}
                                >
                                    {preview.prokuruhafar?.map(p => (
                                        <FormControlLabel
                                            key={p.national_id}
                                            value={p.national_id}
                                            control={<Radio size="small" />}
                                            label={
                                                <Box>
                                                    <Typography variant="body2">{p.name}</Typography>
                                                    <Typography variant="caption" color="text.secondary">
                                                        {fmtKennitala(p.national_id)}
                                                    </Typography>
                                                </Box>
                                            }
                                            sx={{ mb: 0.5 }}
                                        />
                                    ))}
                                    <FormControlLabel
                                        value={CUSTOM_CHAIR}
                                        control={<Radio size="small" />}
                                        label="Skrá kennitölu"
                                    />
                                </RadioGroup>
                                {chairSelection === CUSTOM_CHAIR && (
                                    <TextField
                                        label="Kennitala formanns"
                                        value={customChairSsn}
                                        onChange={e => setCustomChairSsn(e.target.value.replace(/[^0-9-]/g, ''))}
                                        size="small"
                                        placeholder="000000-0000"
                                        sx={{ mt: 1, ml: 4, width: 220 }}
                                        autoFocus
                                    />
                                )}
                            </Box>
                        </>}

                        {saveError && <Alert severity="error">{saveError}</Alert>}
                    </>
                )}
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button sx={ghostButtonSx} onClick={handleClose}>Hætta við</Button>
                {preview && (
                    <Button

                        variant="contained" sx={primaryButtonSx}
                        onClick={handleCreate}
                        disabled={!canCreate}
                    >
                        {saving ? <CircularProgress size={18} color="inherit" /> : 'Stofna'}
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    );
}

const USER_WINDOWS = [
    { value: 30,  label: 'Síðustu 30 dagar' },
    { value: 90,  label: 'Síðustu 90 dagar' },
    { value: 365, label: 'Síðasta ár' },
    { value: 0,   label: 'Allir skráðir' },
];

function KpiPanel({ user }) {
    const [stats, setStats] = React.useState(null);
    const [days, setDays] = React.useState(365);

    React.useEffect(() => {
        setStats(null);
        apiFetch(`${API_URL}/admin/stats?days=${days}`)
            .then(r => r.ok ? r.json() : null)
            .then(setStats)
            .catch(() => {});
    }, [days]);

    const staticItems = [
        { label: 'Virk húsfélög',   value: stats?.active_associations },
        { label: 'Virkar íbúðir',   value: stats?.active_apartments },
        { label: 'Virkir eigendur', value: stats?.active_owners },
    ];

    return (
        <Grid container spacing={2}>
            {staticItems.map(({ label, value }) => (
                <Grid item xs={6} md={3} key={label}>
                    <Paper variant="outlined" sx={{ p: 2.5, textAlign: 'center' }}>
                        <Typography variant="h3" sx={{ fontWeight: 200, color: '#1D366F' }}>
                            {value ?? <CircularProgress size={28} color="secondary" />}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                            {label}
                        </Typography>
                    </Paper>
                </Grid>
            ))}
            <Grid item xs={6} md={3}>
                <Paper variant="outlined" sx={{ p: 2.5, textAlign: 'center' }}>
                    <Typography variant="h3" sx={{ fontWeight: 200, color: '#1D366F' }}>
                        {stats?.active_users ?? <CircularProgress size={28} color="secondary" />}
                    </Typography>
                    <Box sx={{ mt: 0.5, display: 'flex', justifyContent: 'center' }}>
                        <FormControl size="small" variant="standard">
                            <Select
                                value={days}
                                onChange={e => setDays(e.target.value)}
                                disableUnderline
                                sx={{ fontSize: '0.875rem', color: 'text.secondary' }}
                            >
                                {USER_WINDOWS.map(w => (
                                    <MenuItem key={w.value} value={w.value}>{w.label}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Box>
                </Paper>
            </Grid>
        </Grid>
    );
}

function ImpersonatePanel({ user, onSelect }) {
    const navigate = useNavigate();
    const [q, setQ] = useState('');
    const [results, setResults] = useState([]);
    const [searching, setSearching] = useState(false);

    React.useEffect(() => {
        if (q.length < 2) { setResults([]); return; }
        setSearching(true);
        apiFetch(`${API_URL}/admin/Association?user_id=${user.id}&q=${encodeURIComponent(q)}`)
            .then(r => r.ok ? r.json() : [])
            .then(data => { setResults(data); setSearching(false); })
            .catch(() => setSearching(false));
    }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <Paper variant="outlined" sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>Opna húsfélag</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Leita að húsfélagi og opna það sem kerfisstjóri.
            </Typography>
            <TextField
                label="Leita eftir nafni eða kennitölu"
                value={q}
                onChange={e => setQ(e.target.value)}
                size="small" fullWidth
                InputProps={{ endAdornment: searching ? <CircularProgress size={14} /> : null }}
            />
            <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
                {results.map(a => (
                    <Box
                        key={a.id}
                        sx={{
                            p: 1.5, borderRadius: 1, border: '1px solid rgba(0,0,0,0.1)',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        }}
                    >
                        <Box>
                            <Typography variant="body2" fontWeight={500}>{a.name}</Typography>
                            <Typography variant="caption" color="text.secondary">{fmtKennitala(a.ssn)}</Typography>
                        </Box>
                        <Button
                            size="small" variant="outlined" sx={secondaryButtonSx}
                            onClick={() => { onSelect(a); navigate('/husfelag'); }}
                        >
                            Opna
                        </Button>
                    </Box>
                ))}
                {q.length >= 2 && results.length === 0 && !searching && (
                    <Typography variant="body2" color="text.secondary">Ekkert húsfélag fannst.</Typography>
                )}
            </Box>
        </Paper>
    );
}

export default SuperAdminPage;
