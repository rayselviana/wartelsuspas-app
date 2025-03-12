import { useState, useEffect } from 'react';
import { Typography, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';
import { db } from '../config/firebase';
import { collection, onSnapshot } from 'firebase/firestore';

const RegisteredNumbersList = () => {
  const [registeredNumbers, setRegisteredNumbers] = useState([]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'receivers'), (snapshot) => {
      setRegisteredNumbers(snapshot.docs.map(doc => doc.data()));
    });
    return () => unsub();
  }, []);

  return (
    <Paper elevation={3} sx={{ p: 3, bgcolor: '#f5f5f5', borderRadius: 2 }}>
      <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold', color: '#1976d2' }}>
        Daftar Nomor Terdaftar (Admin)
      </Typography>
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Nomor Telepon</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {registeredNumbers.map((receiver) => (
              <TableRow key={receiver.phone}>
                <TableCell>{receiver.phone}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
};

export default RegisteredNumbersList;