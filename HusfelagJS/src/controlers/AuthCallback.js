import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Typography, Box, CircularProgress } from '@mui/material';
import { UserContext } from './UserContext';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8010';

/**
 * /auth/callback
 * The backend redirects here after a successful Kenni login with:
 *   ?token=<jwt>&uid=<user_id>
 *
 * Fetches the full user profile, stores it in localStorage and context,
 * then redirects to /profile if email or phone are missing, otherwise /dashboard.
 */
function AuthCallback() {
    const navigate = useNavigate();
    const { setUser } = React.useContext(UserContext);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const token = params.get('token');
        const uid = params.get('uid');
        const error = params.get('error');

        if (error) {
            navigate(`/login?error=${error}`);
            return;
        }

        if (!token || !uid) {
            navigate('/login?error=missing_params');
            return;
        }

        const fetchProfile = async () => {
            try {
                const resp = await fetch(`${API_URL}/User/${uid}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (resp.ok) {
                    const profile = await resp.json();
                    const user = { ...profile, token };
                    localStorage.setItem('user', JSON.stringify(user));
                    setUser(user);
                    const missingInfo = !profile.email || !profile.phone;
                    navigate(missingInfo ? '/profile' : '/dashboard');
                } else {
                    // Fallback: store minimal user and go to dashboard
                    const user = { id: parseInt(uid, 10), token };
                    localStorage.setItem('user', JSON.stringify(user));
                    setUser(user);
                    navigate('/dashboard');
                }
            } catch {
                const user = { id: parseInt(uid, 10), token };
                localStorage.setItem('user', JSON.stringify(user));
                setUser(user);
                navigate('/dashboard');
            }
        };

        fetchProfile();
    }, []);

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 2 }}>
            <CircularProgress color="secondary" />
            <Typography>Auðkenni staðfest, hleð inn…</Typography>
        </Box>
    );
}

export default AuthCallback;
