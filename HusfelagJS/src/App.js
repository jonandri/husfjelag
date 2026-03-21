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
import { UserContext } from './controlers/UserContext';

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

  //Load any saved user from local storage
  React.useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
  }, []);

  return (
    <UserContext.Provider value={{ user, setUser }}>
      <ThemeProvider theme={theme}>
        <Router>
          <Routes>
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/login" element={<Login />} />
            <Route path="/logout" element={<Logout />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/houseassociation" element={<HouseAssociation />} />
            <Route path="/husfelag" element={<AssociationPage />} />
            <Route path="/ibudir" element={<ApartmentsPage />} />
            <Route path="/eigendur" element={<OwnersPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/budget" element={<BudgetPage />} />
            <Route path="/flokkar" element={<CategoriesPage />} />
          </Routes>
        </Router> 
      </ThemeProvider>
    </UserContext.Provider>
  );
}

export default App;