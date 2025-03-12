const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { v4: uuidv4 } = require('uuid');
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

admin.initializeApp();
const db = admin.firestore();

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

const voucherPackages = {
  '5min': { duration: 300, price: 2000 },
  '15min': { duration: 900, price: 5000 },
  '30min': { duration: 1800, price: 10000 },
  '60min': { duration: 3600, price: 18000 },
  '120min': { duration: 7200, price: 35000 },
};

// API: Buat voucher
app.post('/voucher/create', async (req, res) => {
  const { packageType, userId } = req.body;
  if (!voucherPackages[packageType]) {
    return res.status(400).json({ error: 'Paket tidak valid' });
  }

  const { duration, price } = voucherPackages[packageType];
  const voucherCode = uuidv4().slice(0, 7).toUpperCase();
  const voucher = {
    code: voucherCode,
    duration,
    remaining_duration: duration,
    price,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    used: false,
    expires_at: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)),
  };

  try {
    await db.collection('vouchers').doc(voucherCode).set(voucher);
    await db.collection('logs').add({
      user_id: userId || 'unknown',
      action: `Membuat voucher: ${voucherCode}`,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
    res.json({ code: voucherCode });
  } catch (error) {
    res.status(500).json({ error: 'Gagal membuat voucher', details: error.message });
  }
});

// API: Hapus voucher
app.delete('/voucher/delete/:voucherCode', async (req, res) => {
  const { voucherCode } = req.params;
  const { userId } = req.body;

  try {
    await db.collection('vouchers').doc(voucherCode).delete();
    await db.collection('logs').add({
      user_id: userId || 'unknown',
      action: `Menghapus voucher: ${voucherCode}`,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
    res.json({ message: 'Voucher berhasil dihapus' });
  } catch (error) {
    res.status(500).json({ error: 'Gagal menghapus voucher', details: error.message });
  }
});

// API: Log aktivitas
app.post('/log', async (req, res) => {
  const { userId, action } = req.body;
  try {
    await db.collection('logs').add({
      user_id: userId || 'unknown',
      action,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
    res.json({ message: 'Log berhasil disimpan' });
  } catch (error) {
    res.status(500).json({ error: 'Gagal menyimpan log', details: error.message });
  }
});

// Socket.IO Signaling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join', (sessionId) => {
    socket.join(sessionId);
    console.log(`${socket.id} joined session: ${sessionId}`);
  });

  socket.on('offer', ({ sessionId, offer }) => {
    socket.to(sessionId).emit('offer', offer);
    console.log(`Offer dikirim ke session: ${sessionId}`);
  });

  socket.on('answer', ({ sessionId, answer }) => {
    socket.to(sessionId).emit('answer', answer);
    console.log(`Answer dikirim ke session: ${sessionId}`);
  });

  socket.on('ice-candidate', ({ sessionId, candidate }) => {
    socket.to(sessionId).emit('ice-candidate', candidate);
    console.log(`ICE candidate dikirim ke session: ${sessionId}`);
  });

  socket.on('terminate', (sessionId) => {
    socket.to(sessionId).emit('terminate');
    console.log(`Sesi ${sessionId} diterminasi`);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

exports.api = functions.https.onRequest(app);
exports.socket = functions.https.onRequest((req, res) => {
  server.emit('request', req, res);
});