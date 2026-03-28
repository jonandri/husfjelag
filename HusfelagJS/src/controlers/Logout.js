import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserContext } from './UserContext';

/**
 * /logout
 * Clears local auth state and redirects to login.
 */
function Logout() {
    const navigate = useNavigate();
    const { setUser } = React.useContext(UserContext);

    useEffect(() => {
        localStorage.removeItem('user');
        localStorage.removeItem('currentAssociation');
        setUser(null);
        navigate('/login');
    }, []);

    return null;
}

export default Logout;
