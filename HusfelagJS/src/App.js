import React from 'react';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Login from './controlers/Login';
import Dashboard from './controlers/Dashboard';
import HouseAssociation from './controlers/HouseAssociation';
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
    //fontFamily: 'Core Sans Light, sans-serif',
    fontSize: 16, // Your custom font size
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
            <Route path="/" element={<Login />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/houseassociation" element={<HouseAssociation />} />
            {/* other routes... */}
          </Routes>
        </Router> 
      </ThemeProvider>
    </UserContext.Provider>
  );
}

export default App;