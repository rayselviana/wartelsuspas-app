import { useState } from 'react';
import { Typography, TextField, Button, Paper, Box, Alert } from '@mui/material';
import { db } from '../config/firebase';
import { doc, setDoc } from 'firebase/firestore';

const RegisterReceiver = () => {
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const registerReceiver = async () => {
    setError('');
    setSuccess(false);
    try {
      await setDoc(doc(db, 'receivers', phone), {
        phone,
      });
      setSuccess(true);
      setPhone('');
    } catch (err) {
      setError('Gagal mendaftar: ' + err.message);
    }
  };

  return (
    <Paper elevation={3} sx={{ p: 3, bgcolor: '#f5f5f5', borderRadius: 2 }}>
      <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold', color: '#1976d2' }}>
        Pendaftaran Nomor Penerima
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <TextField
          label="Nomor Telepon"
          variant="outlined"
          fullWidth
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          error={!!error}
          helperText={error}
        />
        <Button variant="contained" color="primary" fullWidth onClick={registerReceiver} sx={{ py: 1.5 }}>
          Daftar
        </Button>
        {success && (
          <Alert severity="success">Nomor berhasil didaftarkan!</Alert>
        )}
      </Box>
    </Paper>
  );
};

export default RegisterReceiver;