import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserContext } from './UserContext';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8010';

/**
 * /logout
 * Clears local auth state, then hands off to the backend's RP-initiated logout
 * (/auth/logout) so id.husfjelag.is ends its SSO session too. Without that
 * hand-off the IdP keeps its cookie and silently re-authenticates on the next
 * login. The IdP redirects back to the frontend when done.
 */
function Logout() {
    const navigate = useNavigate();
    const { setUser } = React.useContext(UserContext);

    useEffect(() => {
        const raw = localStorage.getItem('user');
        let idToken = null;
        try {
            idToken = raw ? JSON.parse(raw)?.id_token : null;
        } catch (e) {
            idToken = null;
        }

        localStorage.removeItem('user');
        setUser(null);

        if (idToken) {
            window.location.href = `${API_URL}/auth/logout?id_token_hint=${encodeURIComponent(idToken)}`;
        } else {
            navigate('/');
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    return null;
}

export default Logout;
