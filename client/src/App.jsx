import { useState, useEffect } from 'react';
import { signOut, onAuthStateChanged } from 'firebase/auth';
import { ThemeProvider } from '@mui/material';
import { AppBar, Toolbar, Typography, IconButton, Container } from '@mui/material';
import { Logout } from '@mui/icons-material';
import { BrowserRouter as Router, Route, Routes, Link, Navigate } from 'react-router-dom';
import { auth, db } from './config/firebase';
import { doc, getDoc } from 'firebase/firestore';
import theme from './config/theme';
import LoginRegister from './components/LoginRegister';
import Dashboard from './components/Dashboard';
import Booth from './components/Booth';
import RegisterReceiver from './components/RegisterReceiver';
import RegisteredNumbersList from './components/RegisteredNumbersList';
import RegisteredNumbers from './components/RegisteredNumbers';

const App = () => {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        setRole(userDoc.exists() ? userDoc.data().role : 'petugas');
      } else {
        setRole(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
    setUser(null);
    setRole(null);
  };

  if (loading) return <Typography>Loading...</Typography>;

  return (
    <Router>
      <ThemeProvider theme={theme}>
        {user ? (
          <>
            <AppBar position="static">
              <Toolbar>
                <Typography variant="h6" sx={{ flexGrow: 1 }}>Wartelsuspas</Typography>
                <Link to="/dashboard" style={{ color: 'white', marginRight: '20px' }}>Dashboard</Link>
                <Link to="/booth" style={{ color: 'white', marginRight: '20px' }}>Bilik</Link>
                <Link to="/registered-numbers" style={{ color: 'white', marginRight: '20px' }}>Nomor Terdaftar</Link>
                {role === 'admin' && (
                  <Link to="/registered-numbers/list" style={{ color: 'white', marginRight: '20px' }}>Daftar Nomor</Link>
                )}
                <IconButton color="inherit" onClick={handleLogout}>
                  <Logout />
                </IconButton>
              </Toolbar>
            </AppBar>
            <Container maxWidth="sm" sx={{ py: 4 }}>
              <Routes>
                <Route path="/dashboard" element={<Dashboard user={user} handleLogout={handleLogout} />} />
                <Route path="/booth" element={<Booth loading={loading} user={user} setLoading={setLoading} />} />
                <Route path="/registered-numbers" element={<RegisteredNumbers />}>
                  <Route index element={<RegisterReceiver />} />
                  <Route path="list" element={
                    role === 'admin' ? <RegisteredNumbersList /> : <Navigate to="/dashboard" />
                  } />
                </Route>
                <Route path="*" element={<Navigate to="/dashboard" />} />
              </Routes>
            </Container>
          </>
        ) : (
          <LoginRegister setUser={setUser} />
        )}
      </ThemeProvider>
    </Router>
  );
};

export default App;