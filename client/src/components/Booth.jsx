import { useState, useEffect, useRef } from 'react';
import { Typography, TextField, Button, Paper, Box, FormControl, InputLabel, Select, MenuItem, CircularProgress } from '@mui/material';
import io from 'socket.io-client';
import { db } from '../config/firebase';
import { collection, addDoc, doc, getDoc, updateDoc, serverTimestamp, onSnapshot, query, where, getDocs } from 'firebase/firestore';

const socket = io('http://localhost:3001'); // Ganti dengan URL Firebase Functions saat deploy

const Booth = ({ loading, user, setLoading }) => {
  const [voucherCode, setVoucherCode] = useState('');
  const [receiverPhone, setReceiverPhone] = useState('');
  const [callOption, setCallOption] = useState('');
  const [sessionActive, setSessionActive] = useState(false);
  const [remainingTime, setRemainingTime] = useState(0);
  const [sessionId, setSessionId] = useState(null);
  const [callType, setCallType] = useState(null);
  const [error, setError] = useState('');
  const [callStatus, setCallStatus] = useState('');
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);

  const initializePeerConnection = () => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('ice-candidate', { sessionId, candidate: event.candidate });
      }
    };

    pc.ontrack = (event) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
        setCallStatus('Terhubung ke penerima');
      }
    };

    return pc;
  };

  const startSession = async () => {
    setError('');
    setCallStatus('');
    setLoading(true);
    console.log('Memulai sesi dengan:', { voucherCode, receiverPhone, callOption });

    try {
      const voucherRef = doc(db, 'vouchers', voucherCode);
      const voucherDoc = await getDoc(voucherRef);

      if (!voucherDoc.exists()) {
        setError('Kode voucher tidak valid');
        setLoading(false);
        return;
      }

      const voucher = voucherDoc.data();
      if (voucher.used && voucher.remaining_duration <= 0) {
        setError('Voucher telah habis');
        setLoading(false);
        return;
      }
      if (voucher.expires_at.toDate() < new Date()) {
        setError('Voucher telah kadaluarsa');
        setLoading(false);
        return;
      }

      const activeSessionQuery = query(
        collection(db, 'sessions'),
        where('voucher_code', '==', voucherCode),
        where('active', '==', true)
      );
      const activeSessionSnapshot = await getDocs(activeSessionQuery);
      if (!activeSessionSnapshot.empty) {
        setError('Voucher sedang digunakan di sesi lain');
        setLoading(false);
        return;
      }

      const receiverRef = doc(db, 'receivers', receiverPhone);
      const receiverDoc = await getDoc(receiverRef);
      const isRegistered = receiverDoc.exists();

      const session = {
        voucher_code: voucherCode,
        receiver_phone: receiverPhone,
        start_time: serverTimestamp(),
        active: true,
        remaining_duration: voucher.remaining_duration,
        user_id: user.uid,
        call_type: callOption === 'gsm' ? 'gsm' : (isRegistered ? 'whatsapp' : 'custom'),
      };

      const sessionRef = await addDoc(collection(db, 'sessions'), session);
      setSessionId(sessionRef.id);
      setRemainingTime(voucher.remaining_duration);
      setCallType(session.call_type);
      setSessionActive(true);
      console.log('Sesi berhasil dibuat:', sessionRef.id);

      if (callOption === 'whatsapp-video' || callOption === 'whatsapp-voice') {
        if (isRegistered) {
          const intentUrl = callOption === 'whatsapp-video'
            ? `https://wa.me/${receiverPhone}?video=true`
            : `https://wa.me/${receiverPhone}`;
          window.open(intentUrl, '_blank');
          setCallStatus('Menghubungkan ke WhatsApp...');
        } else {
          setError('Nomor tidak terdaftar untuk WhatsApp.');
          setSessionActive(false);
          setLoading(false);
          return;
        }
      } else if (callOption === 'gsm') {
        window.location.href = `tel:${receiverPhone}`;
        setCallStatus('Menghubungkan panggilan GSM...');
      } else if (callOption === 'custom-video') {
        if (isRegistered) {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            if (localVideoRef.current) localVideoRef.current.srcObject = stream;

            peerConnectionRef.current = initializePeerConnection();
            stream.getTracks().forEach(track => peerConnectionRef.current.addTrack(track, stream));

            socket.emit('join', sessionRef.id);
            console.log('Bergabung ke sesi WebRTC:', sessionRef.id);
            setCallStatus('Menunggu penerima bergabung...');

            const offer = await peerConnectionRef.current.createOffer();
            await peerConnectionRef.current.setLocalDescription(offer);
            socket.emit('offer', { sessionId: sessionRef.id, offer });
            console.log('Offer WebRTC dikirim');
          } catch (err) {
            setError('Gagal memulai video call: ' + err.message);
            console.error('Error WebRTC:', err);
            setSessionActive(false);
            setLoading(false);
            return;
          }
        } else {
          setError('Nomor tidak terdaftar untuk video call custom. Gunakan GSM.');
          setSessionActive(false);
          setLoading(false);
          return;
        }
      }

      if (!voucher.used) {
        await updateDoc(voucherRef, { used: true });
        console.log('Voucher ditandai sebagai digunakan');
      }
    } catch (err) {
      setError('Gagal memulai sesi: ' + err.message);
      console.error('Error di startSession:', err);
    } finally {
      setLoading(false);
    }
  };

  const endSession = async (terminatedBy = 'user') => {
    setLoading(true);
    try {
      const sessionRef = doc(db, 'sessions', sessionId);
      await updateDoc(sessionRef, {
        end_time: serverTimestamp(),
        active: false,
        remaining_duration: remainingTime,
        terminated_by: terminatedBy,
      });
      const voucherRef = doc(db, 'vouchers', voucherCode);
      await updateDoc(voucherRef, {
        remaining_duration: remainingTime,
      });

      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
      if (localVideoRef.current && localVideoRef.current.srcObject) {
        localVideoRef.current.srcObject.getTracks().forEach(track => track.stop());
      }

      setSessionActive(false);
      setRemainingTime(0);
      setSessionId(null);
      setCallType(null);
      setCallStatus('');
      setError(terminatedBy === 'petugas' ? 'Sesi dihentikan oleh petugas.' : 'Sesi dihentikan.');
      console.log('Sesi diakhiri oleh:', terminatedBy);
    } catch (err) {
      setError('Gagal mengakhiri sesi: ' + err.message);
      console.error('Error di endSession:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (sessionActive && remainingTime > 0) {
      const interval = setInterval(() => {
        setRemainingTime(prev => prev - 1);
      }, 1000);
      return () => clearInterval(interval);
    } else if (sessionActive && remainingTime <= 0) {
      endSession();
    }
  }, [sessionActive, remainingTime]);

  useEffect(() => {
    if (!sessionId) return;

    const unsub = onSnapshot(doc(db, 'sessions', sessionId), (snapshot) => {
      const sessionData = snapshot.data();
      if (sessionData && !sessionData.active && sessionActive) {
        endSession(sessionData.terminated_by);
      }
    });

    socket.on('answer', async (answer) => {
      if (peerConnectionRef.current) {
        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
        console.log('Answer WebRTC diterima');
      }
    });

    socket.on('ice-candidate', async (candidate) => {
      if (peerConnectionRef.current) {
        try {
          await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
          console.log('ICE candidate ditambahkan');
        } catch (e) {
          console.error('Error adding ICE candidate:', e);
        }
      }
    });

    socket.on('terminate', () => {
      endSession('petugas');
      console.log('Sesi WebRTC diterminasi');
    });

    return () => {
      unsub();
      socket.off('answer');
      socket.off('ice-candidate');
      socket.off('terminate');
    };
  }, [sessionId, sessionActive]);

  return (
    <Paper elevation={3} sx={{ p: 3, bgcolor: '#f5f5f5', borderRadius: 2 }}>
      <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold', color: '#1976d2' }}>Bilik Wartelsuspas</Typography>
      {!sessionActive ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField
            label="Kode Voucher"
            variant="outlined"
            fullWidth
            value={voucherCode}
            onChange={(e) => setVoucherCode(e.target.value)}
            error={!!error}
            helperText={error}
          />
          <TextField
            label="Nomor Telepon Penerima"
            variant="outlined"
            fullWidth
            value={receiverPhone}
            onChange={(e) => setReceiverPhone(e.target.value)}
          />
          <FormControl fullWidth>
            <InputLabel>Pilih Tipe Panggilan</InputLabel>
            <Select
              value={callOption}
              onChange={(e) => setCallOption(e.target.value)}
              label="Pilih Tipe Panggilan"
            >
              <MenuItem value="whatsapp-video">WhatsApp Video Call</MenuItem>
              <MenuItem value="whatsapp-voice">WhatsApp Voice Call</MenuItem>
              <MenuItem value="gsm">GSM Call</MenuItem>
              <MenuItem value="custom-video">Custom Video Call</MenuItem>
            </Select>
          </FormControl>
          <Button
            variant="contained"
            color="primary"
            fullWidth
            onClick={startSession}
            disabled={loading || !callOption}
            sx={{ py: 1.5 }}
          >
            {loading ? <CircularProgress size={24} /> : 'Mulai Panggilan'}
          </Button>
        </Box>
      ) : (
        <Box sx={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="h6" sx={{ color: '#1976d2' }}>
            Sisa Waktu: {Math.floor(remainingTime / 3600)}:{Math.floor((remainingTime % 3600) / 60)}:{remainingTime % 60 < 10 ? '0' : ''}{remainingTime % 60}
          </Typography>
          <Typography variant="body1" sx={{ fontStyle: 'italic' }}>
            Panggilan dari Bilik Wartelsuspas - ID: {sessionId}
          </Typography>
          <Typography variant="body2" sx={{ color: '#666' }}>
            Status: {callStatus || 'Memulai panggilan...'}
          </Typography>
          {callType === 'video' ? (
            <Box sx={{ display: 'flex', justifyContent: 'space-around', flexWrap: 'wrap', gap: 2 }}>
              <video ref={localVideoRef} autoPlay muted style={{ width: '100%', maxWidth: '200px', borderRadius: 8 }} />
              <video ref={remoteVideoRef} autoPlay style={{ width: '100%', maxWidth: '200px', borderRadius: 8 }} />
            </Box>
          ) : callType === 'whatsapp' ? (
            <Typography>Panggilan WhatsApp ke {receiverPhone} sedang berlangsung...</Typography>
          ) : (
            <Typography>Panggilan GSM ke {receiverPhone} sedang berlangsung...</Typography>
          )}
          <Button
            variant="contained"
            color="secondary"
            fullWidth
            onClick={() => endSession('user')}
            disabled={loading}
            sx={{ py: 1.5 }}
          >
            Akhiri Panggilan
          </Button>
        </Box>
      )}
    </Paper>
  );
};

export default Booth;