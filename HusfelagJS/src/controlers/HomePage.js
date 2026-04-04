import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Typography, Button } from '@mui/material';

function CtaBar({ mini, onSignup }) {
    return (
        <Box sx={{
            position: 'sticky', top: 0, zIndex: 100,
            background: '#1D366F',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            px: 4, py: mini ? 1 : 1.75,
            transition: 'padding 0.2s ease',
            boxShadow: '0 2px 12px rgba(0,0,0,0.2)',
        }}>
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5 }}>
                <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: 15, letterSpacing: '0.06em' }}>
                    HÚSFÉLAG
                </Typography>
                {!mini && (
                    <Typography sx={{ color: 'rgba(255,255,255,0.55)', fontSize: 13 }}>
                        — Hugbúnaður fyrir húsfélög
                    </Typography>
                )}
            </Box>
            <Button onClick={onSignup} sx={{
                background: '#08C076', color: '#fff', borderRadius: '20px',
                px: mini ? 2 : 2.5, py: mini ? 0.75 : 1,
                fontSize: mini ? 12 : 13, fontWeight: 600,
                textTransform: 'none', whiteSpace: 'nowrap',
                '&:hover': { background: '#06a866' }, transition: 'all 0.2s ease',
            }}>
                Skrá sig →
            </Button>
        </Box>
    );
}

function AppMockup() {
    const kpi = (val, lbl, muted) => (
        <Box sx={{
            flex: 1, background: 'rgba(255,255,255,0.06)', borderRadius: 1.5,
            p: 1.25, textAlign: 'center', border: '1px solid rgba(255,255,255,0.08)',
        }}>
            <Typography sx={{ color: muted ? 'rgba(255,255,255,0.45)' : '#08C076', fontSize: 13, fontWeight: 600 }}>
                {val}
            </Typography>
            <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 9, mt: 0.4 }}>{lbl}</Typography>
        </Box>
    );
    const bar = (lbl, pct, faded) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.75 }}>
            <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: 9, width: 28 }}>{lbl}</Typography>
            <Box sx={{
                height: 6, borderRadius: 1,
                width: `${pct}%`,
                background: faded ? 'rgba(8,192,118,0.35)' : '#08C076',
                opacity: faded ? 1 : 0.8,
            }} />
        </Box>
    );
    return (
        <Box sx={{
            background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)',
            borderRadius: 2, overflow: 'hidden',
        }}>
            {/* topbar */}
            <Box sx={{
                background: 'rgba(255,255,255,0.08)', px: 1.75, py: 1,
                display: 'flex', gap: 1, alignItems: 'center',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
            }}>
                {[0,1,2].map(i => <Box key={i} sx={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(255,255,255,0.2)' }} />)}
                <Typography sx={{ color: 'rgba(255,255,255,0.3)', fontSize: 9, ml: 1 }}>Yfirlit · Húsfélag</Typography>
            </Box>
            {/* body */}
            <Box sx={{ p: 1.75 }}>
                <Box sx={{ display: 'flex', gap: 1, mb: 1.25 }}>
                    {kpi('2.400.000 kr', 'Áætlun 2025', false)}
                    {kpi('200.000 kr', 'Mánaðarleg innheimta', false)}
                    {kpi('0 kr', 'Ógreitt', true)}
                </Box>
                <Box sx={{ background: 'rgba(255,255,255,0.05)', borderRadius: 1.5, p: 1.25 }}>
                    <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 9, letterSpacing: '0.06em', mb: 1 }}>
                        MÁNAÐARLEG INNHEIMTA
                    </Typography>
                    {bar('Jan', 80, false)}
                    {bar('Feb', 75, false)}
                    {bar('Mar', 90, false)}
                    {bar('Apr', 60, true)}
                </Box>
            </Box>
        </Box>
    );
}

function Hero({ onSignup }) {
    return (
        <Box sx={{ background: 'linear-gradient(135deg, #1D366F 0%, #0d2154 100%)', position: 'relative', overflow: 'hidden' }}>
            {/* decorative blobs */}
            <Box sx={{ position: 'absolute', width: 380, height: 380, borderRadius: '50%', background: 'rgba(8,192,118,0.10)', top: -100, right: -80 }} />
            <Box sx={{ position: 'absolute', width: 180, height: 180, borderRadius: '50%', background: 'rgba(8,192,118,0.07)', bottom: 20, left: -50 }} />
            <Box sx={{
                maxWidth: 1100, mx: 'auto', px: { xs: 3, md: 6 }, py: { xs: 5, md: 8 },
                display: 'flex', alignItems: 'center', gap: { xs: 4, md: 7 },
                flexDirection: { xs: 'column', md: 'row' },
                position: 'relative',
            }}>
                {/* text */}
                <Box sx={{ flex: 1 }}>
                    <Typography sx={{ color: '#08C076', fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', mb: 1.75 }}>
                        Hugbúnaður fyrir íslensk húsfélög
                    </Typography>
                    <Typography variant="h3" sx={{ color: '#fff', fontWeight: 200, lineHeight: 1.25, mb: 2, fontSize: { xs: 28, md: 36 } }}>
                        Stjórnaðu húsfélaginu þínu með{' '}
                        <Box component="span" sx={{ fontWeight: 600 }}>fullnægjandi yfirsýn</Box>
                    </Typography>
                    <Typography sx={{ color: 'rgba(255,255,255,0.6)', fontSize: 15, lineHeight: 1.65, mb: 3.5 }}>
                        Innheimta, áætlun og fjárhagsleg yfirlit — allt á einum stað. Einfalt. Öruggt. Íslenskt.
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                        <Button onClick={onSignup} sx={{
                            background: '#08C076', color: '#fff', borderRadius: '24px',
                            px: 3.25, py: 1.375, fontSize: 14, fontWeight: 600, textTransform: 'none',
                            '&:hover': { background: '#06a866' },
                        }}>
                            Byrja frítt →
                        </Button>
                        <Button component="a" href="#stories" sx={{
                            background: 'transparent', color: 'rgba(255,255,255,0.75)',
                            border: '1px solid rgba(255,255,255,0.3)', borderRadius: '24px',
                            px: 2.75, py: 1.25, fontSize: 14, fontWeight: 400, textTransform: 'none',
                            '&:hover': { background: 'rgba(255,255,255,0.06)' },
                        }}>
                            Sjá meira
                        </Button>
                    </Box>
                </Box>
                {/* app mockup */}
                <Box sx={{ flex: 1, width: '100%' }}>
                    <AppMockup />
                </Box>
            </Box>
        </Box>
    );
}

export default function HomePage() {
    const navigate = useNavigate();
    const [mini, setMini] = useState(false);
    const onSignup = () => navigate('/login');

    useEffect(() => {
        const handler = () => setMini(window.scrollY > 60);
        window.addEventListener('scroll', handler, { passive: true });
        return () => window.removeEventListener('scroll', handler);
    }, []);

    return (
        <Box sx={{ minHeight: '100vh', background: '#fff' }}>
            <CtaBar mini={mini} onSignup={onSignup} />
            <Hero onSignup={onSignup} />
        </Box>
    );
}
