import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Typography, Button } from '@mui/material';

export default function HomePage() {
    const navigate = useNavigate();
    const [mini, setMini] = useState(false);

    useEffect(() => {
        const handler = () => setMini(window.scrollY > 60);
        window.addEventListener('scroll', handler, { passive: true });
        return () => window.removeEventListener('scroll', handler);
    }, []);

    return (
        <Box sx={{ minHeight: '200vh', background: '#fff' }}>
            {/* Sticky CTA bar */}
            <Box sx={{
                position: 'sticky', top: 0, zIndex: 100,
                background: '#1D366F',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                px: 4,
                py: mini ? 1 : 1.75,
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
                <Button
                    onClick={() => navigate('/login')}
                    sx={{
                        background: '#08C076', color: '#fff', borderRadius: '20px',
                        px: mini ? 2 : 2.5, py: mini ? 0.75 : 1,
                        fontSize: mini ? 12 : 13, fontWeight: 600,
                        textTransform: 'none', whiteSpace: 'nowrap',
                        '&:hover': { background: '#06a866' },
                        transition: 'all 0.2s ease',
                    }}
                >
                    Skrá sig →
                </Button>
            </Box>

            {/* placeholder content to enable scroll testing */}
            <Box sx={{ p: 4 }}>
                <Typography>Scroll to test mini bar</Typography>
            </Box>
        </Box>
    );
}
