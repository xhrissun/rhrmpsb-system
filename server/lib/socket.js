import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { User } from '../models.js';

// Kept as a module-level singleton (rather than passed around as a
// parameter everywhere) so routes.js can broadcast a new chat message
// after saving it via the normal REST endpoint, without server.js and
// routes.js needing to import each other directly. server.js calls
// initSocket() once at startup; routes.js calls getIO() when it needs to
// emit.
let ioInstance = null;

// Anyone who can see the "who's online" list can use chat — same
// audience, same reasoning: this is Secretariat + Admin coordination,
// not a rater-facing feature.
const CHAT_ROOM = 'secretariat-chat';
function canUseChat(userType) {
  return userType === 'admin' || userType === 'secretariat';
}

export function initSocket(httpServer, corsOptions) {
  ioInstance = new Server(httpServer, {
    cors: corsOptions,
    // Keeps the transport list explicit rather than letting long-polling
    // silently kick in as a fallback — Render's web services support
    // real WebSocket connections, so there's no platform reason to fall
    // back, and polling would defeat the entire point of using sockets
    // for chat in the first place.
    transports: ['websocket', 'polling']
  });

  // Socket connections authenticate the same way REST requests do — same
  // JWT, same secret, same "purpose-scoped tokens are never valid session
  // tokens" rule as authMiddleware in routes.js. The token travels in the
  // handshake's auth payload (socket.io's standard mechanism for this),
  // not as a URL query param, so it never ends up in server access logs.
  ioInstance.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('No token provided'));
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (decoded.purpose) return next(new Error('Invalid token'));
      const user = await User.findById(decoded.id).select('-password');
      if (!user) return next(new Error('Invalid token'));
      if (!canUseChat(user.userType)) return next(new Error('Access denied'));
      socket.user = { id: user._id.toString(), name: user.name, userType: user.userType };
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  ioInstance.on('connection', (socket) => {
    socket.join(CHAT_ROOM);
    // A personal room, independent of the shared team-chat room — this is
    // how a DM reaches exactly its two participants (and nobody else),
    // and how a mention ping can be delivered to one specific person
    // regardless of which conversation (team channel or another DM) it
    // happened in.
    socket.join(`user:${socket.user.id}`);
    // No further per-socket event handlers are needed on the receive side
    // — sending happens over the normal authenticated REST endpoint
    // (POST /chat/messages in routes.js), which persists the message and
    // then calls broadcastChatMessage below. Keeping the write path on
    // REST (rather than accepting writes over the socket too) means chat
    // sending gets the same auth middleware, validation, and error
    // handling as everything else in this app for free, instead of a
    // second, parallel implementation of all three living only in the
    // socket layer.
  });

  return ioInstance;
}

export function getIO() {
  return ioInstance;
}

// message.recipientId set → DM: delivered only to the two personal rooms
// involved (so it never reaches anyone else's socket, not just "isn't
// shown" client-side — actual server-side delivery scoping). Unset →
// team channel: delivered to everyone in the shared room.
export function broadcastChatMessage(message) {
  if (!ioInstance) return;
  if (message.recipientId) {
    ioInstance.to(`user:${message.recipientId}`).to(`user:${message.senderId}`).emit('chat:new-message', message);
  } else {
    ioInstance.to(CHAT_ROOM).emit('chat:new-message', message);
  }
}

// Separate from the message delivery above: a lightweight ping so a
// mentioned user's client can surface a distinct notification (sound,
// highlight) even for a team-channel message they'd already receive via
// the room broadcast — this fires in ADDITION to that, not instead of it.
export function notifyMention(userId, message) {
  ioInstance?.to(`user:${userId}`).emit('chat:mentioned', message);
}