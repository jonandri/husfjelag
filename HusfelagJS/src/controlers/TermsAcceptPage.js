import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Box, Typography, Button, CircularProgress, Alert } from '@mui/material';
import { UserContext } from './UserContext';
import { apiFetch } from '../api';
import { primaryButtonSx } from '../ui/buttons';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8010';

const POINTS = [
    {
        title: 'Hugbúnaðarþjónusta — ekki bókhaldskerfi',
        body: 'Kerfið er verkfæri til að halda utan um húsfélög, en er ekki löglegt bókhaldskerfi skv. lögum nr. 145/1994. Þú ber ábyrgð á bókhaldsskyldum húsfélagsins.',
    },
    {
        title: 'Þjónustan er veitt „eins og hún er"',
        body: 'Húsfjelagið ber enga ábyrgð á ákvörðunum sem teknar eru á grundvelli gagna í kerfinu eða tjóni sem hlýst af notkun þess.',
    },
    {
        title: 'Persónuvernd',
        body: 'Við vinnum persónuupplýsingar í samræmi við íslensk lög og GDPR. Þú ber ábyrgð á þeim gögnum sem þú skráir um aðra, við erum vinnsluaðili.',
    },
    {
        title: 'Verð og uppsögn',
        body: 'Húsfélagið þitt greiðir mánaðargjald fyrir hverja skráða íbúð. Þú getur sagt upp þjónustunni hvenær sem er. Verðbreytingar tilkynntar 30 dögum fyrirfram.',
    },
];

export default function TermsAcceptPage() {
    const navigate = useNavigate();
    const { user, setUser } = React.useContext(UserContext);
    const [checked, setChecked] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const handleAccept = async () => {
        if (!checked) return;
        setSaving(true);
        setError('');
        try {
            const resp = await apiFetch(`${API_URL}/auth/terms/accept`, { method: 'POST' });
            if (resp.ok) {
                const updated = await resp.json();
                const newUser = { ...user, ...updated, token: user.token };
                localStorage.setItem('user', JSON.stringify(newUser));
                setUser(newUser);
                const missingInfo = !newUser.email || !newUser.phone;
                navigate(missingInfo ? '/profile' : '/dashboard', { replace: true });
            } else {
                const data = await resp.json().catch(() => ({}));
                setError(data.detail || 'Villa kom upp. Reyndu aftur.');
            }
        } catch {
            setError('Tenging við þjón mistókst.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Box sx={{ minHeight: '100vh', background: '#f7f8fc', display: 'flex', flexDirection: 'column' }}>
            {/* Top bar */}
            <Box sx={{ background: '#1D366F', px: 4, py: 1.75, boxShadow: '0 2px 12px rgba(0,0,0,0.2)' }}>
                <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: 15, letterSpacing: '0.06em' }}>
                    HÚSFJELAGIÐ
                </Typography>
            </Box>

            {/* Card */}
            <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 3 }}>
                <Box sx={{
                    background: '#fff', borderRadius: '12px', border: '1px solid #e8e8e8',
                    boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
                    width: '100%', maxWidth: 560, p: { xs: 3, md: 4.5 },
                }}>
                    <Typography sx={{ color: '#08C076', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', mb: 1.25 }}>
                        Skilmálar
                    </Typography>
                    <Typography variant="h5" sx={{ fontWeight: 700, color: '#111', mb: 0.75 }}>
                        Samþykkja notendaskilmála
                    </Typography>
                    <Typography sx={{ fontSize: 13.5, color: '#666', mb: 3, lineHeight: 1.6 }}>
                        Áður en þú hefur notkun þarftu að samþykkja notendaskilmála Húsfjelagsins ehf.
                    </Typography>

                    {/* Summary points */}
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.75, mb: 3 }}>
                        {POINTS.map(p => (
                            <Box key={p.title} sx={{ display: 'flex', gap: 1.5 }}>
                                <Box sx={{
                                    flexShrink: 0, width: 6, borderRadius: 4,
                                    background: '#1D366F', mt: '4px', alignSelf: 'stretch', maxHeight: 48,
                                }} />
                                <Box>
                                    <Typography sx={{ fontSize: 13, fontWeight: 600, color: '#1D366F', mb: 0.25 }}>
                                        {p.title}
                                    </Typography>
                                    <Typography sx={{ fontSize: 12.5, color: '#555', lineHeight: 1.6 }}>
                                        {p.body}
                                    </Typography>
                                </Box>
                            </Box>
                        ))}
                    </Box>

                    {/* Link to full terms */}
                    <Box sx={{ p: '10px 14px', background: '#f7f8fc', borderRadius: 1.5, border: '1px solid #eee', mb: 3 }}>
                        <Typography sx={{ fontSize: 12.5, color: '#555' }}>
                            Þetta er stutta samantektin á skilmálum.
                        </Typography>
                        <Typography sx={{ fontSize: 12.5, color: '#555' }}>
                            Ef þú ert í stuði, eða langar að vita meira, lestu þá endilega {' '}
                            <Link to="/skilmalar" target="_blank" style={{ color: '#1D366F', fontWeight: 600 }}>
                                alla notendaskilmálana.
                            </Link>
                        </Typography>                        
                    </Box>

                    {/* Checkbox */}
                    <Box
                        onClick={() => setChecked(v => !v)}
                        sx={{
                            display: 'flex', alignItems: 'flex-start', gap: 1.5, mb: 2.5,
                            cursor: 'pointer', userSelect: 'none',
                        }}
                    >
                        <Box sx={{
                            flexShrink: 0, width: 20, height: 20, borderRadius: '5px',
                            border: `2px solid ${checked ? '#08C076' : '#ccc'}`,
                            background: checked ? '#08C076' : '#fff',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            mt: '1px', transition: 'all 0.15s',
                        }}>
                            {checked && <span style={{ color: '#fff', fontSize: 13, fontWeight: 700, lineHeight: 1 }}>✓</span>}
                        </Box>
                        <Typography sx={{ fontSize: 13, color: '#333', lineHeight: 1.55 }}>
                            Ég hef lesið og samþykki{' '}
                            <Link to="/skilmalar" target="_blank" style={{ color: '#1D366F' }}>
                                notendaskilmála Húsfjelagsins ehf.
                            </Link>
                        </Typography>
                    </Box>

                    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

                    <Button
                        variant="contained"
                        fullWidth
                        onClick={handleAccept}
                        disabled={!checked || saving}
                        sx={{ ...primaryButtonSx, py: 1.375, fontSize: 14 }}
                    >
                        {saving ? <CircularProgress size={20} color="inherit" /> : 'Samþykki og halda áfram →'}
                    </Button>
                </Box>
            </Box>
        </Box>
    );
}
