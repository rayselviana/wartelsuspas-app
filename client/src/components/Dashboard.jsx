import { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, updateDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import {
  Button, Select, MenuItem, Typography, Table, TableBody, TableCell, TableContainer, TableRow,
  Paper, Box, CircularProgress, Snackbar, Alert, TableHead, IconButton, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField,
} from '@mui/material';
import { Delete, Stop, Edit } from '@mui/icons-material';
import { db } from '../config/firebase';
import io from 'socket.io-client';

const socket = io('http://localhost:3001'); // Ganti dengan URL Firebase Functions saat deploy

const Dashboard = ({ user, handleLogout }) => {
  const [packageType, setPackageType] = useState('15min');
  const [vouchers, setVouchers] = useState([]);
  const [activeSessions, setActiveSessions] = useState([]);
  const [sessionTimers, setSessionTimers] = useState({});
  const [loading, setLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editVoucher, setEditVoucher] = useState(null);
  const [editDuration, setEditDuration] = useState('');
  const [editPrice, setEditPrice] = useState('');

  const createVoucher = async () => {
    setLoading(true);
    try {
      const response = await fetch('http://localhost:3001/voucher/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageType, userId: user.uid }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Gagal membuat voucher');
      setSnackbar({ open: true, message: `Voucher created: ${data.code}`, severity: 'success' });
    } catch (error) {
      setSnackbar({ open: true, message: 'Gagal membuat voucher: ' + error.message, severity: 'error' });
    }
    setLoading(false);
  };

  const deleteVoucher = async (voucherCode) => {
    setLoading(true);
    try {
      const response = await fetch(`http://localhost:3001/voucher/delete/${voucherCode}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.uid }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Gagal menghapus voucher');
      setSnackbar({ open: true, message: `Voucher ${voucherCode} dihapus`, severity: 'success' });
    } catch (error) {
      setSnackbar({ open: true, message: 'Gagal menghapus voucher: ' + error.message, severity: 'error' });
    }
    setLoading(false);
  };

  const openEditDialog = (voucher) => {
    setEditVoucher(voucher);
    setEditDuration(voucher.duration / 60);
    setEditPrice(voucher.price);
    setEditDialogOpen(true);
  };

  const handleEditVoucher = async () => {
    if (!editVoucher || editDuration <= 0 || editPrice < 0) {
      setSnackbar({ open: true, message: 'Durasi dan harga harus valid', severity: 'error' });
      return;
    }

    setLoading(true);
    try {
      const voucherRef = doc(db, 'vouchers', editVoucher.code);
      const newDuration = editDuration * 60;
      await updateDoc(voucherRef, {
        duration: newDuration,
        remaining_duration: Math.max(newDuration, editVoucher.remaining_duration),
        price: editPrice,
      });
      await fetch('http://localhost:3001/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.uid, action: `Mengedit voucher: ${editVoucher.code}` }),
      });
      setSnackbar({ open: true, message: `Voucher ${editVoucher.code} diperbarui`, severity: 'success' });
      setEditDialogOpen(false);
    } catch (error) {
      setSnackbar({ open: true, message: 'Gagal mengedit voucher: ' + error.message, severity: 'error' });
    }
    setLoading(false);
  };

  const terminateSession = async (sessionId, voucherCode, remainingTime) => {
    setLoading(true);
    try {
      const sessionRef = doc(db, 'sessions', sessionId);
      await updateDoc(sessionRef, {
        end_time: serverTimestamp(),
        active: false,
        remaining_duration: remainingTime,
        terminated_by: 'petugas',
      });

      const voucherRef = doc(db, 'vouchers', voucherCode);
      const voucherDoc = await getDoc(voucherRef);
      if (voucherDoc.exists()) {
        await updateDoc(voucherRef, { remaining_duration: remainingTime });
      }

      await fetch('http://localhost:3001/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.uid, action: `Menghentikan sesi: ${sessionId}` }),
      });

      socket.emit('terminate', sessionId);
      setSnackbar({ open: true, message: `Sesi ${sessionId} dihentikan`, severity: 'success' });
    } catch (error) {
      setSnackbar({ open: true, message: 'Gagal menghentikan sesi: ' + error.message, severity: 'error' });
    }
    setLoading(false);
  };

  useEffect(() => {
    const unsubVouchers = onSnapshot(collection(db, 'vouchers'), (snapshot) => {
      setVouchers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubVouchers();
  }, []);

  useEffect(() => {
    const unsubSessions = onSnapshot(collection(db, 'sessions'), (snapshot) => {
      const sessions = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(session => session.active);
      setActiveSessions(sessions);

      const timers = {};
      sessions.forEach(session => {
        if (session.remaining_duration) {
          timers[session.id] = session.remaining_duration;
        }
      });
      setSessionTimers(timers);
    });
    return () => unsubSessions();
  }, []);

  useEffect(() => {
    if (Object.keys(sessionTimers).length === 0) return;

    const interval = setInterval(() => {
      setSessionTimers(prev => {
        const updatedTimers = { ...prev };
        Object.keys(updatedTimers).forEach(sessionId => {
          if (updatedTimers[sessionId] > 0) {
            updatedTimers[sessionId] -= 1;
          }
        });
        return updatedTimers;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [sessionTimers]);

  const formatStartTime = (startTime) => {
    if (!startTime) return 'N/A';
    if (typeof startTime === 'string') return new Date(startTime).toLocaleString();
    if (startTime.toDate) return startTime.toDate().toLocaleString();
    return 'N/A';
  };

  const formatDuration = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const getVoucherStatus = (voucher) => {
    const isExpired = voucher.expires_at.toDate() < new Date();
    const isUsed = activeSessions.some(session => session.voucher_code === voucher.code);
    const isDepleted = voucher.remaining_duration <= 0;

    if (isDepleted || isExpired) return 'Voucher Sudah Habis';
    if (isUsed) return 'Digunakan';
    return 'Tidak Digunakan';
  };

  return (
    <Paper elevation={3} sx={{ p: 3, bgcolor: '#f5f5f5', borderRadius: 2 }}>
      <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold', color: '#1976d2' }}>Dashboard Petugas</Typography>

      <Box sx={{ mb: 4 }}>
        <Typography variant="subtitle1" gutterBottom>Buat Voucher</Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Select value={packageType} onChange={(e) => setPackageType(e.target.value)} variant="outlined">
            <MenuItem value="5min">5 Menit - Rp2.000</MenuItem>
            <MenuItem value="15min">15 Menit - Rp5.000</MenuItem>
            <MenuItem value="30min">30 Menit - Rp10.000</MenuItem>
            <MenuItem value="60min">60 Menit - Rp18.000</MenuItem>
            <MenuItem value="120min">120 Menit - Rp35.000</MenuItem>
          </Select>
          <Button variant="contained" color="primary" onClick={createVoucher} disabled={loading} sx={{ py: 1.5 }}>
            {loading ? <CircularProgress size={24} /> : 'Generate Voucher'}
          </Button>
        </Box>
      </Box>

      <Box sx={{ mb: 4 }}>
        <Typography variant="subtitle1" gutterBottom>Daftar Voucher</Typography>
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Kode</TableCell>
                <TableCell>Durasi</TableCell>
                <TableCell>Sisa Durasi</TableCell>
                <TableCell>Harga</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Aksi</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {vouchers.map(voucher => (
                <TableRow key={voucher.id}>
                  <TableCell>{voucher.code}</TableCell>
                  <TableCell>{voucher.duration / 60}m</TableCell>
                  <TableCell>{formatDuration(voucher.remaining_duration)}</TableCell>
                  <TableCell>Rp{voucher.price}</TableCell>
                  <TableCell>{getVoucherStatus(voucher)}</TableCell>
                  <TableCell>
                    <IconButton
                      color="primary"
                      onClick={() => openEditDialog(voucher)}
                      disabled={loading}
                    >
                      <Edit />
                    </IconButton>
                    <IconButton
                      color="secondary"
                      onClick={() => deleteVoucher(voucher.code)}
                      disabled={loading}
                    >
                      <Delete />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      <Box>
        <Typography variant="subtitle1" gutterBottom>Sesi Aktif</Typography>
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>ID Sesi</TableCell>
                <TableCell>Kode Voucher</TableCell>
                <TableCell>Mulai</TableCell>
                <TableCell>Sisa Waktu</TableCell>
                <TableCell>Aksi</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {activeSessions.map(session => {
                const remainingTime = sessionTimers[session.id] || 0;
                const minutes = Math.floor(remainingTime / 60);
                const seconds = remainingTime % 60;
                return (
                  <TableRow key={session.id}>
                    <TableCell>{session.id}</TableCell>
                    <TableCell>{session.voucher_code}</TableCell>
                    <TableCell>{formatStartTime(session.start_time)}</TableCell>
                    <TableCell>
                      {remainingTime > 0
                        ? `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`
                        : 'Selesai'}
                    </TableCell>
                    <TableCell>
                      <IconButton
                        color="secondary"
                        onClick={() => terminateSession(session.id, session.voucher_code, remainingTime)}
                        disabled={loading || remainingTime <= 0}
                      >
                        <Stop />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)}>
        <DialogTitle>Edit Voucher: {editVoucher?.code}</DialogTitle>
        <DialogContent>
          <TextField
            label="Durasi (menit)"
            type="number"
            fullWidth
            value={editDuration}
            onChange={(e) => setEditDuration(e.target.value)}
            sx={{ mt: 2 }}
          />
          <TextField
            label="Harga (Rp)"
            type="number"
            fullWidth
            value={editPrice}
            onChange={(e) => setEditPrice(e.target.value)}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)} disabled={loading}>Batal</Button>
          <Button onClick={handleEditVoucher} color="primary" disabled={loading}>
            {loading ? <CircularProgress size={24} /> : 'Simpan'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={6000} onClose={() => setSnackbar({ ...snackbar, open: false })}>
        <Alert severity={snackbar.severity}>{snackbar.message}</Alert>
      </Snackbar>
    </Paper>
  );
};

export default Dashboard;