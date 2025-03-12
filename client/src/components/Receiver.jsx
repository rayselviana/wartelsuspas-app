import { useState, useEffect, useRef } from 'react';
import { Typography, TextField, Button, Paper, Box } from '@mui/material';
import io from 'socket.io-client';
import { db } from '../config/firebase';
import { doc, setDoc } from 'firebase/firestore';

const socket = io('http://localhost:3001');

const Receiver = () => {
  const [phone, setPhone] = useState('');
  const [registered, setRegistered] = useState(false);
  const [sessionId, setSessionId] = useState('');
  const [callActive, setCallActive] = useState(false);
  const [incomingCall, setIncomingCall] = useState(null);
  const [error, setError] = useState('');
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);

  const initializePeerConnection = () => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('ice-candidate', { sessionId: incomingCall, candidate: event.candidate });
      }
    };

    pc.ontrack = (event) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    return pc;
  };

  const registerReceiver = async () => {
    setError('');
    try {
      await setDoc(doc(db, 'receivers', phone), {
        phone,
      });
      setRegistered(true);
      console.log('Penerima terdaftar:', { phone });
    } catch (err) {
      setError('Gagal mendaftar: ' + err.message);
    }
  };

  const acceptCall = async () => {
    setSessionId(incomingCall);
    setIncomingCall(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      peerConnectionRef.current = initializePeerConnection();
      stream.getTracks().forEach(track => peerConnectionRef.current.addTrack(track, stream));

      socket.emit('join', sessionId);
      console.log('Penerima bergabung ke sesi:', sessionId);

      socket.on('offer', async (offer) => {
        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnectionRef.current.createAnswer();
        await peerConnectionRef.current.setLocalDescription(answer);
        socket.emit('answer', { sessionId, answer });
        console.log('Answer dikirim ke penelepon');
      });

      socket.on('ice-candidate', async (candidate) => {
        try {
          await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
          console.log('ICE candidate diterima');
        } catch (e) {
          console.error('Error adding ICE candidate:', e);
        }
      });

      socket.on('terminate', () => {
        endCall();
      });

      setCallActive(true);
    } catch (err) {
      console.error('Gagal menerima panggilan:', err);
      setError('Gagal menerima panggilan: ' + err.message);
    }
  };

  const endCall = () => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (localVideoRef.current && localVideoRef.current.srcObject) {
      localVideoRef.current.srcObject.getTracks().forEach(track => track.stop());
    }
    setCallActive(false);
    setSessionId('');
    console.log('Panggilan diakhiri');
  };

  return (
    <Paper elevation={3} sx={{ p: 3 }}>
      <Typography variant="h6" gutterBottom>Penerima Panggilan</Typography>
      {!registered ? (
        <>
          <TextField
            label="Nomor Telepon"
            variant="outlined"
            fullWidth
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            sx={{ mb: 2 }}
            error={!!error}
            helperText={error}
          />
          <Button variant="contained" color="primary" fullWidth onClick={registerReceiver}>
            Daftar sebagai Penerima
          </Button>
        </>
      ) : !callActive ? (
        <>
          <Typography variant="body1" gutterBottom>Terdaftar: {phone}</Typography>
          {incomingCall && (
            <Box>
              <Typography variant="h6" color="secondary">Panggilan Masuk dari Bilik Wartelsuspas - ID: {incomingCall}</Typography>
              <Button variant="contained" color="primary" onClick={acceptCall} sx={{ mr: 2 }}>
                Terima
              </Button>
              <Button variant="contained" color="secondary" onClick={() => setIncomingCall(null)}>
                Tolak
              </Button>
            </Box>
          )}
        </>
      ) : (
        <Box sx={{ textAlign: 'center' }}>
          <Typography variant="body1" sx={{ mb: 2 }}>
            Panggilan dari Bilik Wartelsuspas - ID: {sessionId}
          </Typography>
          <Box sx={{ display: 'flex', justifyContent: 'space-around' }}>
            <video ref={localVideoRef} autoPlay muted style={{ width: '45%', borderRadius: 8 }} />
            <video ref={remoteVideoRef} autoPlay style={{ width: '45%', borderRadius: 8 }} />
          </Box>
          <Button variant="contained" color="secondary" fullWidth onClick={endCall} sx={{ mt: 2 }}>
            Akhiri Panggilan
          </Button>
        </Box>
      )}
    </Paper>
  );
};

export default Receiver;