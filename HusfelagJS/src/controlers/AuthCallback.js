import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Typography, Box, CircularProgress } from '@mui/material';
import { UserContext } from './UserContext';

/**
 * /auth/callback
 * The backend redirects here after a successful Kenni login with:
 *   ?token=<jwt>&uid=<user_id>
 *
 * Stores the token + user info in localStorage and context,
 * then redirects to the dashboard.
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

        if (token && uid) {
            const user = { id: parseInt(uid, 10), token };
            localStorage.setItem('user', JSON.stringify(user));
            setUser(user);
            navigate('/dashboard');
        } else {
            navigate('/login?error=missing_params');
        }
    }, []);

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 2 }}>
            <CircularProgress color="secondary" />
            <Typography>Auðkenni staðfest, hleð inn…</Typography>
        </Box>
    );
}

export default AuthCallback;
