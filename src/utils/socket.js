import { io } from 'socket.io-client';

// Socket.IO connects to the server root, not the /api-prefixed REST base
// — its default handshake path (/socket.io/) sits alongside Express's
// routes, not under them.
const SOCKET_BASE_URL = import.meta.env.PROD
  ? 'https://rhrmpsb-system.onrender.com'
  : 'http://localhost:5001';

// A plain module-level singleton, deliberately not created inside a React
// component/hook: several components (the chat panel, potentially an
// unread-badge indicator elsewhere) all want the SAME connection, not one
// each — opening a new socket per mounted component would multiply
// server-side connections for no benefit and complicate "am I connected"
// state across them. connectSocket()/disconnectSocket() are idempotent,
// so any number of callers can invoke them without worrying about who
// else already has.
let socket = null;

export function connectSocket() {
  if (socket?.connected) return socket;
  const token = localStorage.getItem('authToken');
  if (!token) return null;

  socket = io(SOCKET_BASE_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000
  });
  return socket;
}

export function getSocket() {
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}