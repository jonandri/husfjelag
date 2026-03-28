import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box, Typography, Button, TextField, CircularProgress,
    Alert, IconButton, Paper, Link,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import SideBar from './Sidebar';
import { UserContext } from './UserContext';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8010';
const HMS_URL_PATTERN = /^https:\/\/hms\.is\/fasteignaskra\/\d+\/\d+$/;

function ApartmentImportPage() {
    const navigate = useNavigate();
    const { user, assocParam } = React.useContext(UserContext);
    const [step, setStep] = useState(1);
    const [urls, setUrls] = useState(['']);
    const [preview, setPreview] = useState(null);
    const [deactivateIds, setDeactivateIds] = useState(new Set());
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!user) { navigate('/login'); return; }
        // Pre-fill URLs from saved sources
        const asParam = assocParam ? `&${assocParam.replace('?', '')}` : '';
        fetch(`${API_URL}/Apartment/import/sources?user_id=${user.id}${asParam}`)
            .then(r => r.ok ? r.json() : [])
            .then(sources => {
                if (sources.length > 0) setUrls(sources.map(s => s.url));
            })
            .catch(() => {});
    }, [user]);

    const urlsValid = urls.every(u => HMS_URL_PATTERN.test(u.trim())) && urls.some(u => u.trim());

    const handleFetchPreview = async () => {
        setError('');
        setLoading(true);
        try {
            const resp = await fetch(`${API_URL}/Apartment/import/preview${assocParam}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: user.id, urls: urls.filter(u => u.trim()) }),
            });
            const data = await resp.json();
            if (!resp.ok) {
                setError(data.detail || 'Villa við að sækja gögn.');
                return;
            }
            const allDeactivate = new Set(data.missing.map(m => m.id));
            setDeactivateIds(allDeactivate);
            setPreview(data);
            setStep(3);
        } catch {
            setError('Ekki tókst að ná sambandi við þjón.');
        } finally {
            setLoading(false);
        }
    };

    const handleConfirm = async () => {
        setError('');
        setLoading(true);
        try {
            const resp = await fetch(`${API_URL}/Apartment/import/confirm${assocParam}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: user.id,
                    urls: urls.filter(u => u.trim()),
                    deactivate_ids: Array.from(deactivateIds),
                }),
            });
            if (resp.ok) {
                navigate('/ibudir');
            } else {
                const data = await resp.json();
                setError(data.detail || 'Villa við innflutning. Reyndu aftur.');
            }
        } catch {
            setError('Ekki tókst að ná sambandi við þjón.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="dashboard">
            <SideBar />
            <Box sx={{ p: 4, flex: 1, overflowY: 'auto', minWidth: 0, maxWidth: 700 }}>
                <Box sx={{ mb: 2 }}>
                    <Link
                        component="button"
                        variant="body2"
                        color="text.secondary"
                        onClick={() => navigate('/ibudir')}
                        sx={{ textDecoration: 'none' }}
                    >
                        ← Íbúðir
                    </Link>
                </Box>
                <Typography variant="h5" sx={{ mb: 3 }}>
                    Flytja inn íbúðir frá HMS
                </Typography>

                {/* Step indicator */}
                <Box sx={{ display: 'flex', gap: 1, mb: 4 }}>
                    {[1, 2, 3].map(n => (
                        <Box key={n} sx={{
                            height: 4, flex: 1, borderRadius: 2,
                            bgcolor: step >= n ? 'secondary.main' : 'rgba(255,255,255,0.15)'
                        }} />
                    ))}
                </Box>

                {step === 1 && <Step1 onNext={() => setStep(2)} />}
                {step === 2 && (
                    <Step2
                        urls={urls}
                        setUrls={setUrls}
                        urlsValid={urlsValid}
                        loading={loading}
                        error={error}
                        onBack={() => setStep(1)}
                        onFetch={handleFetchPreview}
                    />
                )}
                {step === 3 && preview && (
                    <Step3
                        preview={preview}
                        deactivateIds={deactivateIds}
                        setDeactivateIds={setDeactivateIds}
                        loading={loading}
                        error={error}
                        onBack={() => setStep(2)}
                        onConfirm={handleConfirm}
                    />
                )}
            </Box>
        </div>
    );
}

function Step1({ onNext }) {
    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography variant="body1" color="text.secondary">
                Þú ert að fara að flytja inn íbúðir úr fasteignaskrá HMS. Ferlið tekur um 2 mínútur.
            </Typography>

            <Paper variant="outlined" sx={{ p: 2, borderColor: 'secondary.main', bgcolor: 'rgba(8,192,118,0.05)' }}>
                <Typography variant="subtitle2" color="secondary" sx={{ mb: 0.5 }}>
                    1. Opnaðu fasteignaskrána
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    Leitaðu að heimilisfangi húsfélagsins og staðfestu að allar íbúðir séu sýnilegar.
                </Typography>
                <Button
                    variant="outlined"
                    color="secondary"
                    size="small"
                    href="https://hms.is/fasteignaskra"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    Opna hms.is/fasteignaskra →
                </Button>
            </Paper>

            <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 0.5 }}>2. Afritaðu hlekk</Typography>
                <Typography variant="body2" color="text.secondary">
                    Þegar þú hefur fundið húsið þitt, afritaðu slóðina úr vafranum, t.d.:
                </Typography>
                <Typography variant="body2" color="secondary" sx={{ mt: 0.5, fontFamily: 'monospace', fontSize: '0.8rem' }}>
                    https://hms.is/fasteignaskra/228369/1203373
                </Typography>
            </Paper>

            <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 0.5 }}>3. Ef húsfélagið hefur fleiri en eitt heimilisfang</Typography>
                <Typography variant="body2" color="text.secondary">
                    T.d. nr. 38 og 40 — þú getur bætt við fleiri hlekkjum á næsta skrefi.
                </Typography>
            </Paper>

            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
                <Button variant="contained" color="secondary" sx={{ color: '#fff' }} onClick={onNext}>
                    Áfram →
                </Button>
            </Box>
        </Box>
    );
}

function Step2({ urls, setUrls, urlsValid, loading, error, onBack, onFetch }) {
    const addUrl = () => setUrls(u => [...u, '']);
    const removeUrl = (i) => setUrls(u => u.filter((_, idx) => idx !== i));
    const setUrl = (i, val) => setUrls(u => u.map((v, idx) => idx === i ? val : v));

    const invalid = urls.map(u => u.trim() && !/^https:\/\/hms\.is\/fasteignaskra\/\d+\/\d+$/.test(u.trim()));

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography variant="body2" color="text.secondary">
                Límdu hlekk(a) fyrir hvert heimilisfang húsfélagsins:
            </Typography>

            {urls.map((url, i) => (
                <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                    <TextField
                        label={`Heimilisfang ${i + 1}`}
                        value={url}
                        onChange={e => setUrl(i, e.target.value)}
                        size="small"
                        fullWidth
                        error={!!invalid[i]}
                        helperText={invalid[i] ? 'Slóðin er ekki í réttu sniði. Dæmi: https://hms.is/fasteignaskra/228369/1203373' : ''}
                        placeholder="https://hms.is/fasteignaskra/228369/1203373"
                    />
                    {urls.length > 1 && (
                        <IconButton size="small" onClick={() => removeUrl(i)} sx={{ mt: 0.5 }}>
                            <DeleteIcon fontSize="small" />
                        </IconButton>
                    )}
                </Box>
            ))}

            <Button
                variant="text"
                color="secondary"
                size="small"
                sx={{ alignSelf: 'flex-start', textTransform: 'none' }}
                onClick={addUrl}
            >
                + Bæta við heimilisfangi
            </Button>

            {error && <Alert severity="error">{error}</Alert>}

            <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
                <Button onClick={onBack} color="inherit">← Til baka</Button>
                <Button
                    variant="contained"
                    color="secondary"
                    sx={{ color: '#fff' }}
                    disabled={!urlsValid || loading}
                    onClick={onFetch}
                >
                    {loading ? <CircularProgress size={20} color="inherit" /> : 'Sækja gögn →'}
                </Button>
            </Box>
        </Box>
    );
}

function Step3({ preview, deactivateIds, setDeactivateIds, loading, error, onBack, onConfirm }) {
    const toggleDeactivate = (id) => {
        setDeactivateIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const STATUS_COLORS = {
        create: '#08C076',
        update: '#ffcc00',
        missing: '#ff5050',
    };

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* Summary chips */}
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {preview.create.length > 0 && (
                    <Box sx={{ border: `1px solid ${STATUS_COLORS.create}`, borderRadius: 1, px: 1.5, py: 0.5 }}>
                        <Typography variant="caption" sx={{ color: STATUS_COLORS.create }}>
                            ✓ {preview.create.length} íbúðir til að búa til
                        </Typography>
                    </Box>
                )}
                {preview.update.length > 0 && (
                    <Box sx={{ border: `1px solid ${STATUS_COLORS.update}`, borderRadius: 1, px: 1.5, py: 0.5 }}>
                        <Typography variant="caption" sx={{ color: STATUS_COLORS.update }}>
                            ↻ {preview.update.length} íbúðir til að uppfæra
                        </Typography>
                    </Box>
                )}
                {preview.missing.length > 0 && (
                    <Box sx={{ border: `1px solid ${STATUS_COLORS.missing}`, borderRadius: 1, px: 1.5, py: 0.5 }}>
                        <Typography variant="caption" sx={{ color: STATUS_COLORS.missing }}>
                            ⚠ {preview.missing.length} íbúð ekki á HMS
                        </Typography>
                    </Box>
                )}
            </Box>

            <Paper variant="outlined">
                <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <Box component="thead">
                        <Box component="tr" sx={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                            {['Merking', 'Fasteignanúmer', 'Stærð', 'Staða', 'Óvirkja'].map(h => (
                                <Box component="th" key={h} sx={{ p: 1, textAlign: 'left', color: 'text.secondary', fontWeight: 500 }}>
                                    {h}
                                </Box>
                            ))}
                        </Box>
                    </Box>
                    <Box component="tbody">
                        {preview.create.map((apt, i) => (
                            <Box component="tr" key={`c${i}`} sx={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                <Box component="td" sx={{ p: 1 }}>{apt.anr}</Box>
                                <Box component="td" sx={{ p: 1, color: 'text.secondary' }}>{apt.fnr}</Box>
                                <Box component="td" sx={{ p: 1, color: 'text.secondary' }}>{apt.size} m²</Box>
                                <Box component="td" sx={{ p: 1 }}><Typography variant="caption" sx={{ color: STATUS_COLORS.create }}>Ný</Typography></Box>
                                <Box component="td" sx={{ p: 1 }}>—</Box>
                            </Box>
                        ))}
                        {preview.update.map((apt) => (
                            <Box component="tr" key={`u${apt.id}`} sx={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                <Box component="td" sx={{ p: 1 }}>{apt.anr}</Box>
                                <Box component="td" sx={{ p: 1, color: 'text.secondary' }}>{apt.fnr}</Box>
                                <Box component="td" sx={{ p: 1, color: 'text.secondary' }}>{apt.size} m²</Box>
                                <Box component="td" sx={{ p: 1 }}><Typography variant="caption" sx={{ color: STATUS_COLORS.update }}>Uppfærsla</Typography></Box>
                                <Box component="td" sx={{ p: 1 }}>—</Box>
                            </Box>
                        ))}
                        {preview.missing.map((apt) => (
                            <Box component="tr" key={`m${apt.id}`} sx={{ borderBottom: '1px solid rgba(255,255,255,0.06)', opacity: 0.75 }}>
                                <Box component="td" sx={{ p: 1 }}>{apt.anr}</Box>
                                <Box component="td" sx={{ p: 1, color: 'text.secondary' }}>{apt.fnr}</Box>
                                <Box component="td" sx={{ p: 1, color: 'text.secondary' }}>—</Box>
                                <Box component="td" sx={{ p: 1 }}><Typography variant="caption" sx={{ color: STATUS_COLORS.missing }}>Ekki á HMS</Typography></Box>
                                <Box component="td" sx={{ p: 1, textAlign: 'center' }}>
                                    <input
                                        type="checkbox"
                                        checked={deactivateIds.has(apt.id)}
                                        onChange={() => toggleDeactivate(apt.id)}
                                        style={{ accentColor: STATUS_COLORS.missing }}
                                    />
                                </Box>
                            </Box>
                        ))}
                    </Box>
                </Box>
            </Paper>

            {error && <Alert severity="error">{error}</Alert>}

            <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
                <Button onClick={onBack} color="inherit">← Til baka</Button>
                <Button
                    variant="contained"
                    color="secondary"
                    sx={{ color: '#fff' }}
                    disabled={loading}
                    onClick={onConfirm}
                >
                    {loading ? <CircularProgress size={20} color="inherit" /> : '✓ Staðfesta innflutning'}
                </Button>
            </Box>
        </Box>
    );
}

export default ApartmentImportPage;
