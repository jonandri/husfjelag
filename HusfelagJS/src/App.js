import React from 'react';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Box, CircularProgress, Typography } from '@mui/material';
import Login from './controlers/Login';
import Logout from './controlers/Logout';
import AuthCallback from './controlers/AuthCallback';
import HouseAssociation from './controlers/HouseAssociation';
import AssociationPage from './controlers/AssociationPage';
import ApartmentsPage from './controlers/ApartmentsPage';
import ApartmentImportPage from './controlers/ApartmentImportPage';
import OwnersPage from './controlers/OwnersPage';
import ProfilePage from './controlers/ProfilePage';
import BudgetPage from './controlers/BudgetPage';
import BudgetWizardPage from './controlers/BudgetWizardPage';
import CategoriesPage from './controlers/CategoriesPage';
import CollectionPage from './controlers/CollectionPage';
import SuperAdminPage from './controlers/SuperAdminPage';
import TransactionsPage from './controlers/TransactionsPage';
import YfirlitPage from './controlers/YfirlitPage';
import { UserContext } from './controlers/UserContext';
import { HelpProvider } from './ui/HelpContext';
import HomePage from './controlers/HomePage';
import BankSettingsPage from './controlers/BankSettingsPage';
import BankHealthPage from './controlers/BankHealthPage';
import AdminCategoriesPage from './controlers/AdminCategoriesPage';
import AdminAccountingKeysPage from './controlers/AdminAccountingKeysPage';
import { apiFetch } from './api';

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
    h5: { fontWeight: 600 },
    h6: { fontWeight: 400 },
  },
  components: {
    MuiTextField: {
      defaultProps: { variant: 'outlined' },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: '#1D366F',
            borderWidth: 2,
          },
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          '&.Mui-focused': {
            color: '#1D366F',
          },
        },
      },
    },
  },
});

// Shown to logged-in users who have no association membership yet.
function NoAssociationView() {
  return (
    <Box sx={{ minHeight: '100vh', background: '#1D366F', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Box sx={{ background: '#fff', borderRadius: 2, p: '40px 36px', maxWidth: 420, textAlign: 'center', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
        <img src={require('./assets/images/logo/logo-color.png')} alt="Húsfélag" style={{ width: 140, marginBottom: 24 }} />
        <Typography variant="h5" sx={{ fontWeight: 600, color: '#1D366F', mb: 1 }}>
          Ekki skráð/ur í húsfélag
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Þú ert ekki skráð/ur í neitt húsfélag. Hafðu samband við formann húsfélags þíns til að fá aðgang.
        </Typography>
      </Box>
    </Box>
  );
}

// Renders children only after user + associations are resolved; shows spinner in place meanwhile.
// Redirects superadmins with no association to /superadmin, regular users to a waiting view.
function ProtectedRoute({ children }) {
  const { user, initializing, associations } = React.useContext(UserContext);
  const location = useLocation();

  if (initializing) return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <CircularProgress color="secondary" />
    </Box>
  );
  if (!user) return <Navigate to="/login" replace />;

  // Routes that are valid even without an association
  const isAdminRoute = location.pathname.startsWith('/superadmin') ||
                       location.pathname.startsWith('/admin') ||
                       location.pathname.startsWith('/profile');

  // Always prompt for email/phone if either is missing
  if (location.pathname !== '/profile' && (!user.email || !user.phone)) {
    return <Navigate to="/profile" replace />;
  }

  if (!isAdminRoute && associations.length === 0) {
    if (user.is_superadmin) return <Navigate to="/superadmin" replace />;
    return <NoAssociationView />;
  }

  return <HelpProvider>{children}</HelpProvider>;
}

// App component and navigation
function App() {
  const [user, setUser] = React.useState(null);
  const [associations, setAssociations] = React.useState([]);
  const [currentAssociation, setCurrentAssociationState] = React.useState(null);
  const [impersonating, setImpersonating] = React.useState(false);
  const [initializing, setInitializing] = React.useState(true);

  // Load saved user from localStorage synchronously on mount
  React.useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    } else {
      setInitializing(false); // No user — nothing to wait for
    }
  }, []);

  React.useEffect(() => {
    if (!user) {
      setAssociations([]);
      setCurrentAssociationState(null);
      setImpersonating(false);
      return;
    }
    apiFetch(`${API_URL}/Association/list/${user.id}`)
      .then(r => r.ok ? r.json() : [])
      .then(list => {
        setAssociations(list);
        const storageKey = `currentAssociation_${user.id}`;
        const savedRaw = localStorage.getItem(storageKey);
        const savedAssoc = savedRaw ? JSON.parse(savedRaw) : null;
        const match = savedAssoc ? list.find(a => a.id === savedAssoc.id) : null;
        // Only fall back to savedAssoc (outside own list) for superadmins (impersonation reload)
        const resolved = match || (user?.is_superadmin ? savedAssoc : null) || list[0] || null;
        const isOwn = resolved ? list.some(a => a.id === resolved.id) : false;
        setCurrentAssociationState(resolved);
        setImpersonating(!!resolved && !isOwn);
        if (resolved) localStorage.setItem(storageKey, JSON.stringify(resolved));
      })
      .catch(() => {})
      .finally(() => setInitializing(false)); // Associations resolved (or failed) — ready to render
  }, [user]);

  const setCurrentAssociation = (assoc) => {
    setCurrentAssociationState(assoc);
    const isOwn = associations.some(a => a.id === assoc?.id);
    setImpersonating(!!assoc && !isOwn);
    const storageKey = `currentAssociation_${user?.id}`;
    if (assoc) localStorage.setItem(storageKey, JSON.stringify(assoc));
    else localStorage.removeItem(storageKey);
  };

  const stopImpersonating = () => {
    const first = associations[0] || null;
    setCurrentAssociationState(first);
    setImpersonating(false);
    const storageKey = `currentAssociation_${user?.id}`;
    if (first) localStorage.setItem(storageKey, JSON.stringify(first));
    else localStorage.removeItem(storageKey);
  };

  const assocParam = currentAssociation ? `?as=${currentAssociation.id}` : '';

  return (
    <UserContext.Provider value={{ user, setUser, associations, currentAssociation, setCurrentAssociation, stopImpersonating, impersonating, assocParam, initializing }}>
      <ThemeProvider theme={theme}>
        <Router>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/login" element={<Login />} />
            <Route path="/logout" element={<Logout />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/dashboard" element={<Navigate to="/yfirlit" replace />} />
            <Route path="/houseassociation" element={<ProtectedRoute><HouseAssociation /></ProtectedRoute>} />
            <Route path="/husfelag" element={<ProtectedRoute><AssociationPage /></ProtectedRoute>} />
            <Route path="/ibudir" element={<ProtectedRoute><ApartmentsPage /></ProtectedRoute>} />
            <Route path="/ibudir/innflutningur" element={<ProtectedRoute><ApartmentImportPage /></ProtectedRoute>} />
            <Route path="/eigendur" element={<ProtectedRoute><OwnersPage /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
            <Route path="/aaetlun" element={<ProtectedRoute><BudgetPage /></ProtectedRoute>} />
            <Route path="/aaetlun/nyr" element={<ProtectedRoute><BudgetWizardPage /></ProtectedRoute>} />
            <Route path="/flokkar" element={<ProtectedRoute><CategoriesPage /></ProtectedRoute>} />
            <Route path="/faerslur" element={<ProtectedRoute><TransactionsPage /></ProtectedRoute>} />
            <Route path="/yfirlit" element={<ProtectedRoute><YfirlitPage /></ProtectedRoute>} />
            <Route path="/innheimta" element={<ProtectedRoute><CollectionPage /></ProtectedRoute>} />
            <Route path="/superadmin" element={<ProtectedRoute><SuperAdminPage /></ProtectedRoute>} />
            <Route path="/bank-settings" element={<ProtectedRoute><BankSettingsPage /></ProtectedRoute>} />
            <Route path="/admin/bank-health" element={<ProtectedRoute><BankHealthPage /></ProtectedRoute>} />
            <Route path="/admin/categories" element={<ProtectedRoute><AdminCategoriesPage /></ProtectedRoute>} />
            <Route path="/admin/accounting-keys" element={<ProtectedRoute><AdminAccountingKeysPage /></ProtectedRoute>} />
          </Routes>
        </Router> 
      </ThemeProvider>
    </UserContext.Provider>
  );
}

export default App;