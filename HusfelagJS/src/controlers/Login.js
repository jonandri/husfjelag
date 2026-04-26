import React from 'react';
import { Box, Button, Typography, Alert } from '@mui/material';
import { useNavigate, useLocation } from 'react-router-dom';
import { UserContext } from './UserContext';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8003';

function LoginForm() {
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = React.useContext(UserContext);
    const error = new URLSearchParams(location.search).get('error');

    React.useEffect(() => {
        if (user) navigate('/dashboard');
    }, [user, navigate]);

    const handleLogin = () => {
        window.location.href = `${API_URL}/auth/login`;
    };

    return (
        <Box sx={{
            minHeight: '100vh',
            background: '#1D366F',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
        }}>
            <Box sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
                width: '100%',
                maxWidth: 400,
                px: 3,
            }}>
                {/* Logo */}
                <img
                    src={require('../assets/images/logo/logo-no-background.png')}
                    alt="Húsfélag"
                    style={{ width: 200 }}
                />

                {/* Card */}
                <Box sx={{
                    width: '100%',
                    background: '#fff',
                    borderRadius: 2,
                    p: '40px 36px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 2.5,
                    boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
                }}>
                    <Box sx={{ textAlign: 'center' }}>
                        <Typography variant="h5" sx={{ fontWeight: 600, color: '#1D366F', mb: 0.75 }}>
                            Innskráning
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            Skráðu þig inn með rafrænum skilríkjum, Auðkennisappinu eða aðgangslykil fyrir einfaldar og fljótlega innskráningu.
                        </Typography>
                    </Box>

                    {error && (
                        <Alert severity="error" sx={{ width: '100%' }}>
                            Innskráning mistókst ({error}). Reyndu aftur.
                        </Alert>
                    )}

                    <Button
                        variant="contained"
                        size="large"
                        fullWidth
                        onClick={handleLogin}
                        sx={{
                            mt: 1,
                            backgroundColor: '#08C076',
                            color: '#fff',
                            fontWeight: 600,
                            fontSize: '0.95rem',
                            py: 1.5,
                            borderRadius: 1.5,
                            textTransform: 'none',
                            boxShadow: 'none',
                            '&:hover': {
                                backgroundColor: '#06a866',
                                boxShadow: 'none',
                            },
                        }}
                    >
                        Innskráning
                    </Button>
                </Box>

                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', mt: 1 }}>
                    © {new Date().getFullYear()} Húsfjelag. Öll réttindi áskilin.
                </Typography>
            </Box>
        </Box>
    );
}

export default LoginForm;
