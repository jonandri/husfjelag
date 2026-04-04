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

function StoryRow({ label, title, body, reverse, imgLabel, imgIcon }) {
    return (
        <Box sx={{
            maxWidth: 1060, mx: 'auto', px: { xs: 3, md: 5 }, py: { xs: 5, md: 8 },
            display: 'flex', alignItems: 'center', gap: { xs: 3.5, md: '60px' },
            flexDirection: { xs: 'column', md: reverse ? 'row-reverse' : 'row' },
        }}>
            {/* text */}
            <Box sx={{ flex: { xs: '1 1 auto', md: '0 0 500px' }, maxWidth: { md: 500 } }}>
                <Typography sx={{ color: '#08C076', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', mb: 1.25 }}>
                    {label}
                </Typography>
                <Typography variant="h5" sx={{ color: '#111', fontWeight: 600, lineHeight: 1.3, mb: 1.5 }}>
                    {title}
                </Typography>
                <Typography sx={{ color: '#555', fontSize: 14, lineHeight: 1.75 }}>
                    {body}
                </Typography>
            </Box>
            {/* image placeholder */}
            <Box sx={{ flex: { xs: '1 1 auto', md: '0 0 500px' }, maxWidth: { md: 500 }, width: '100%' }}>
                <Box sx={{
                    background: '#f5f7fc', borderRadius: 2.5, minHeight: 200,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: '1px solid #e8edf5',
                }}>
                    <Box sx={{ textAlign: 'center', color: '#b0b8cc', p: 3 }}>
                        <Typography sx={{ fontSize: 40, mb: 1 }}>{imgIcon}</Typography>
                        <Typography sx={{ fontSize: 11 }}>{imgLabel}</Typography>
                    </Box>
                </Box>
            </Box>
        </Box>
    );
}

function Stories() {
    const stories = [
        {
            label: 'Innheimta',
            title: 'Sjálfvirk mánaðarleg innheimta á húsgjöldum',
            body: 'Stilltu mánaðarlegar greiðslur fyrir hverja íbúð einu sinni — kerfið sér um rest. Sjáðu hverjir hafa greitt og hverjir eru í vanskilum í rauntíma.',
            imgIcon: '📋',
            imgLabel: 'Innheimtutafla með stöðu hverrar íbúðar',
            reverse: false,
        },
        {
            label: 'Áætlun',
            title: 'Búðu til árlegri fjárhagsáætlun á nokkrum mínútum',
            body: 'Leiðsagnarforrit hjálpar þér að setja upp áætlun eftir flokkum. Samanburður við raunverulegar tekjur og gjöld sýnir þér hvar þú stendur.',
            imgIcon: '📊',
            imgLabel: 'Áætlunarleiðsögn og flokkayfirsýn',
            reverse: true,
        },
        {
            label: 'Yfirlit',
            title: 'Fjárhagsleg yfirsýn yfir allt árið',
            body: 'Sjálfvirkar skýrslur sýna tekjur og gjöld eftir mánuðum og flokkum. Alltaf uppfært. Alltaf aðgengilegt.',
            imgIcon: '📈',
            imgLabel: 'Mánaðarlegar og árlegar fjárhagsskýrslur',
            reverse: false,
        },
    ];

    return (
        <Box id="stories" sx={{ background: '#fff' }}>
            {stories.map((s, i) => (
                <Box key={s.label} sx={{ borderTop: i === 0 ? 'none' : '1px solid #f0f0f0' }}>
                    <StoryRow {...s} />
                </Box>
            ))}
        </Box>
    );
}

function FeatureGrid() {
    const features = [
        { icon: '🏢', title: 'Húsfélag',         desc: 'Skrá og stjórna upplýsingum um húsfélagið, formann og gjaldkera.' },
        { icon: '🏠', title: 'Íbúðir',           desc: 'Skrá íbúðir, eignarhlutfall og greiðsluskyldu hverrar einingar.' },
        { icon: '👤', title: 'Eigendur',          desc: 'Tengja eigendur og greiðendur við íbúðir, með aðgangsstýringu.' },
        { icon: '📋', title: 'Innheimta',         desc: 'Mánaðarleg innheimta á húsgjöldum með yfirlit yfir stöðu hvers íbúðar.' },
        { icon: '📊', title: 'Áætlun',            desc: 'Árleg fjárhagsáætlun eftir flokkum með samanburði við raunverulegar tölur.' },
        { icon: '💳', title: 'Færslur',           desc: 'Flytja inn bankafærslur og flokka þær sjálfvirkt með lykilorðareglum.' },
        { icon: '📈', title: 'Yfirlit',           desc: 'Mánaðarlegar og árlegar fjárhagsskýrslur — alltaf uppfærðar.' },
        { icon: '🏦', title: 'Bankareikningar',   desc: 'Tengja bankareikninga við húsfélagið og bókhaldslykla.' },
        { icon: '🔖', title: 'Flokkunarreglur',  desc: 'Sjálfvirk flokkun færslna með lykilorðareglum — sparar tíma.' },
    ];

    return (
        <Box sx={{ background: '#fafafa', borderTop: '1px solid #eee', borderBottom: '1px solid #eee' }}>
            <Box sx={{ maxWidth: 1060, mx: 'auto', px: { xs: 3, md: 5 }, py: { xs: 5, md: 8 } }}>
                <Typography variant="h5" sx={{ fontWeight: 600, color: '#111', mb: 0.75 }}>
                    Allt sem húsfélag þarfnast
                </Typography>
                <Typography sx={{ fontSize: 14, color: '#888', mb: 4.5 }}>
                    9 einingar — ein lausn
                </Typography>
                <Box sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
                    gap: '1px',
                    background: '#e8e8e8',
                    border: '1px solid #e8e8e8',
                    borderRadius: 2.5,
                    overflow: 'hidden',
                }}>
                    {features.map(f => (
                        <Box key={f.title} sx={{ background: '#fff', p: { xs: 2.5, md: 3 } }}>
                            <Typography sx={{ fontSize: 22, mb: 1.25 }}>{f.icon}</Typography>
                            <Typography sx={{ fontSize: 13, fontWeight: 600, color: '#111', mb: 0.625 }}>{f.title}</Typography>
                            <Typography sx={{ fontSize: 12, color: '#777', lineHeight: 1.55 }}>{f.desc}</Typography>
                        </Box>
                    ))}
                </Box>
            </Box>
        </Box>
    );
}

function Footer({ onSignup }) {
    return (
        <Box sx={{ background: '#1D366F', pt: 6, pb: 0 }}>
            <Box sx={{
                maxWidth: 1060, mx: 'auto', px: { xs: 3, md: 5 },
                display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                gap: 4, pb: 4,
                flexDirection: { xs: 'column', sm: 'row' },
            }}>
                <Box>
                    <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: 16, letterSpacing: '0.06em', mb: 0.75 }}>
                        HÚSFÉLAG
                    </Typography>
                    <Typography sx={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>
                        Hugbúnaður fyrir íslensk húsfélög
                    </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'center' }}>
                    <Typography
                        component="a" href="/login"
                        sx={{ color: 'rgba(255,255,255,0.55)', fontSize: 12, textDecoration: 'none', '&:hover': { color: '#fff' } }}
                    >
                        Innskráning
                    </Typography>
                    <Typography
                        component="a" href="#stories"
                        sx={{ color: 'rgba(255,255,255,0.55)', fontSize: 12, textDecoration: 'none', '&:hover': { color: '#fff' } }}
                    >
                        Eiginleikar
                    </Typography>
                    <Button onClick={onSignup} sx={{
                        background: '#08C076', color: '#fff', borderRadius: '20px',
                        px: 2, py: 0.75, fontSize: 12, fontWeight: 600, textTransform: 'none',
                        '&:hover': { background: '#06a866' },
                    }}>
                        Skrá sig →
                    </Button>
                </Box>
            </Box>
            <Box sx={{
                maxWidth: 1060, mx: 'auto', px: { xs: 3, md: 5 },
                borderTop: '1px solid rgba(255,255,255,0.1)', py: 2,
            }}>
                <Typography sx={{ color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>
                    © 2025 Húsfélag. Öll réttindi áskilin.
                </Typography>
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
            <Stories />
            <FeatureGrid />
            <Footer onSignup={onSignup} />
        </Box>
    );
}
