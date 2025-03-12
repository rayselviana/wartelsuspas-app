import { useState } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import {
  Button, TextField, Typography, Paper, Container, CssBaseline, CircularProgress, Snackbar, Alert,
} from '@mui/material';
import { auth, db } from '../config/firebase';

const LoginRegister = ({ setUser }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });
  const [isRegistering, setIsRegistering] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      setUser(userCredential.user);
      setSnackbar({ open: true, message: 'Login berhasil!', severity: 'success' });
    } catch (error) {
      setSnackbar({ open: true, message: 'Login gagal: ' + error.message, severity: 'error' });
    }
    setLoading(false);
  };

  const handleRegister = async () => {
    setLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      await setDoc(doc(db, 'users', user.uid), {
        email: user.email,
        role: 'petugas', // Default petugas, ubah manual ke admin di Firestore
        created_at: new Date().toISOString(),
      });

      setSnackbar({ open: true, message: 'Registrasi berhasil! Silakan login.', severity: 'success' });
      setIsRegistering(false);
    } catch (error) {
      setSnackbar({ open: true, message: 'Registrasi gagal: ' + error.message, severity: 'error' });
    }
    setLoading(false);
  };

  return (
    <>
      <CssBaseline />
      <Container maxWidth="xs" sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Paper elevation={3} sx={{ p: 4, width: '100%', bgcolor: '#f5f5f5', borderRadius: 2 }}>
          <Typography variant="h5" gutterBottom sx={{ fontWeight: 'bold', color: '#1976d2' }}>
            {isRegistering ? 'Registrasi Petugas' : 'Login Petugas'}
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Email"
              variant="outlined"
              fullWidth
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <TextField
              label="Password"
              type="password"
              variant="outlined"
              fullWidth
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button
              variant="contained"
              color="primary"
              fullWidth
              onClick={isRegistering ? handleRegister : handleLogin}
              disabled={loading}
              sx={{ py: 1.5 }}
            >
              {loading ? <CircularProgress size={24} /> : isRegistering ? 'Daftar' : 'Login'}
            </Button>
            <Button
              variant="text"
              color="primary"
              fullWidth
              onClick={() => setIsRegistering(!isRegistering)}
            >
              {isRegistering ? 'Sudah punya akun? Login' : 'Belum punya akun? Daftar'}
            </Button>
          </Box>
          <Snackbar open={snackbar.open} autoHideDuration={6000} onClose={() => setSnackbar({ ...snackbar, open: false })}>
            <Alert severity={snackbar.severity}>{snackbar.message}</Alert>
          </Snackbar>
        </Paper>
      </Container>
    </>
  );
};

export default LoginRegister;