import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Typography, Box, CircularProgress } from '@mui/material';
import { UserContext } from './UserContext';
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8010';

/**
 * /auth/callback
 * The backend redirects here after a successful id.husfjelag.is login with:
 *   ?code=<exchange_code>
 *
 * Exchanges the one-time code for a JWT via POST /auth/token,
 * fetches the full user profile, stores it in localStorage and context,
 * then redirects to /profile if email or phone are missing, otherwise /dashboard.
 */
function AuthCallback() {
    const navigate = useNavigate();
    const { setUser } = React.useContext(UserContext);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        const error = params.get('error');

        if (error) {
            navigate(`/login?error=${error}`);
            return;
        }

        if (!code) {
            navigate('/login?error=missing_params');
            return;
        }

        const authenticate = async () => {
            try {
                // Exchange one-time code for JWT
                const tokenResp = await fetch(`${API_URL}/auth/token`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code }),
                });

                if (!tokenResp.ok) {
                    navigate('/login?error=token_exchange_failed');
                    return;
                }

                const { token, id_token } = await tokenResp.json();
                if (!token) {
                    navigate('/login?error=token_exchange_failed');
                    return;
                }

                // Decode JWT payload to get user_id (no library needed — it's base64)
                const payload = JSON.parse(atob(token.split('.')[1]));
                const uid = payload.sub;

                // Fetch full profile using the freshly obtained JWT
                const profileResp = await fetch(`${API_URL}/User/${uid}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });

                if (profileResp.ok) {
                    const profile = await profileResp.json();
                    // id_token is kept for RP-initiated logout (id_token_hint).
                    const user = { ...profile, token, id_token };
                    localStorage.setItem('user', JSON.stringify(user));
                    setUser(user);
                    if (!profile.terms_accepted) {
                        navigate('/terms-accept');
                    } else if (!profile.email || !profile.phone) {
                        navigate('/profile');
                    } else {
                        navigate('/dashboard');
                    }
                } else {
                    navigate(`/login?error=profile_fetch_failed_${profileResp.status}`);
                }
            } catch (e) {
                navigate(`/login?error=auth_error`);
            }
        };

        authenticate();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 2 }}>
            <CircularProgress color="secondary" />
            <Typography>Auðkenni staðfest, hleð inn…</Typography>
        </Box>
    );
}

export default AuthCallback;
