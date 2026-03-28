import React from 'react';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './controlers/Login';
import Logout from './controlers/Logout';
import AuthCallback from './controlers/AuthCallback';
import Dashboard from './controlers/Dashboard';
import HouseAssociation from './controlers/HouseAssociation';
import AssociationPage from './controlers/AssociationPage';
import ApartmentsPage from './controlers/ApartmentsPage';
import OwnersPage from './controlers/OwnersPage';
import ProfilePage from './controlers/ProfilePage';
import BudgetPage from './controlers/BudgetPage';
import CategoriesPage from './controlers/CategoriesPage';
import CollectionPage from './controlers/CollectionPage';
import SuperAdminPage from './controlers/SuperAdminPage';
import { UserContext } from './controlers/UserContext';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8010';

// Create a custom theme
const theme = createTheme({
  palette: {
    primary: {
      main: '#FFFFFF', // White
    },
    secondary: {
      main: '#08C076', // Green
    },
    accent: {
      main: '#08C076', // Green
    },
    background: {
      main: '#1D366F', // Blue
      text: '#FFFFFF', // White
    },
  },
  typography: {
    fontFamily: '"Inter", sans-serif',
    fontSize: 16,
    fontFeatureSettings: '"tnum"',
    h1: { fontWeight: 200 },
    h2: { fontWeight: 200 },
    h3: { fontWeight: 200 },
    h4: { fontWeight: 200 },
    h5: { fontWeight: 200 },
    h6: { fontWeight: 200 },
  },
});

// App component and navigation
function App() {
  const [user, setUser] = React.useState(null);
  const [associations, setAssociations] = React.useState([]);
  const [currentAssociation, setCurrentAssociationState] = React.useState(null);
  const [impersonating, setImpersonating] = React.useState(false);

  //Load any saved user from local storage
  React.useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
  }, []);

  React.useEffect(() => {
    if (!user) {
      setAssociations([]);
      setCurrentAssociationState(null);
      setImpersonating(false);
      localStorage.removeItem('currentAssociation');
      return;
    }
    fetch(`${API_URL}/Association/list/${user.id}`)
      .then(r => r.ok ? r.json() : [])
      .then(list => {
        setAssociations(list);
        const savedRaw = localStorage.getItem('currentAssociation');
        const savedAssoc = savedRaw ? JSON.parse(savedRaw) : null;
        const match = savedAssoc ? list.find(a => a.id === savedAssoc.id) : null;
        // Only fall back to savedAssoc (outside own list) for superadmins (impersonation reload)
        const resolved = match || (user?.is_superadmin ? savedAssoc : null) || list[0] || null;
        const isOwn = resolved ? list.some(a => a.id === resolved.id) : false;
        setCurrentAssociationState(resolved);
        setImpersonating(!!resolved && !isOwn);
        if (resolved) localStorage.setItem('currentAssociation', JSON.stringify(resolved));
      })
      .catch(() => {});
  }, [user]);

  const setCurrentAssociation = (assoc) => {
    setCurrentAssociationState(assoc);
    const isOwn = associations.some(a => a.id === assoc?.id);
    setImpersonating(!!assoc && !isOwn);
    if (assoc) localStorage.setItem('currentAssociation', JSON.stringify(assoc));
    else localStorage.removeItem('currentAssociation');
  };

  const stopImpersonating = () => {
    const first = associations[0] || null;
    setCurrentAssociationState(first);
    setImpersonating(false);
    if (first) localStorage.setItem('currentAssociation', JSON.stringify(first));
    else localStorage.removeItem('currentAssociation');
  };

  const assocParam = currentAssociation ? `?as=${currentAssociation.id}` : '';

  return (
    <UserContext.Provider value={{ user, setUser, associations, currentAssociation, setCurrentAssociation, stopImpersonating, impersonating, assocParam }}>
      <ThemeProvider theme={theme}>
        <Router>
          <Routes>
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/login" element={<Login />} />
            <Route path="/logout" element={<Logout />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/dashboard" element={<Navigate to="/husfelag" replace />} />
            <Route path="/houseassociation" element={<HouseAssociation />} />
            <Route path="/husfelag" element={<AssociationPage />} />
            <Route path="/ibudir" element={<ApartmentsPage />} />
            <Route path="/eigendur" element={<OwnersPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/aaetlun" element={<BudgetPage />} />
            <Route path="/flokkar" element={<CategoriesPage />} />
            <Route path="/innheimta" element={<CollectionPage />} />
            <Route path="/superadmin" element={<SuperAdminPage />} />
          </Routes>
        </Router> 
      </ThemeProvider>
    </UserContext.Provider>
  );
}

export default App;