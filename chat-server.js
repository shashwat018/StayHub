/**
 * StayHub Chat Server — Socket.io
 * Run: node chat-server.js (port 3001, separate from main API on 3000)
 *
 * Features:
 *  - Hobby-based group chat rooms
 *  - Direct messages between users
 *  - Emoji reactions on messages
 *  - Online presence (who's in a room)
 *  - Message history (in-memory, last 100 per room)
 *  - Plan/event posts (special message type)
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

const PORT = process.env.CHAT_PORT || 3001;

// ── In-memory stores ───────────────────────────────────────
// Room message history: { roomId: [messages] }
const roomMessages = {};

// DM history: { dmKey: [messages] }  (dmKey = sorted userId pair)
const dmMessages = {};

// Connected users: { socketId: { userId, displayName, hobbies, currentRoom } }
const connectedUsers = {};

// Room membership: { roomId: Set<socketId> }
const roomMembers = {};

// ── Hobby rooms config ─────────────────────────────────────
const HOBBY_ROOMS = [
  { id: 'football',   name: 'Football',    emoji: '⚽', desc: 'Turf plans, pickup games, Premier League banter' },
  { id: 'cricket',    name: 'Cricket',     emoji: '🏏', desc: 'Match plans, fantasy teams, live score discussions' },
  { id: 'badminton',  name: 'Badminton',   emoji: '🏸', desc: 'Court bookings, doubles partners, tournaments' },
  { id: 'basketball', name: 'Basketball',  emoji: '🏀', desc: 'Pickup games, court availability, team practice' },
  { id: 'chess',      name: 'Chess',       emoji: '♟️', desc: 'Casual games, study openings, tournaments' },
  { id: 'movies',     name: 'Movies',      emoji: '🎬', desc: 'Movie nights, reviews, what to watch next' },
  { id: 'theatre',    name: 'Theatre',     emoji: '🎭', desc: 'Shows, auditions, drama club plans' },
  { id: 'reading',    name: 'Reading',     emoji: '📚', desc: 'Book recs, reading sessions, swap books' },
  { id: 'music',      name: 'Music',       emoji: '🎵', desc: 'Jam sessions, gig plans, band formation' },
  { id: 'gaming',     name: 'Gaming',      emoji: '🎮', desc: 'LAN parties, online squads, game nights' },
  { id: 'trekking',   name: 'Trekking',    emoji: '🥾', desc: 'Trek plans, trail info, gear advice' },
  { id: 'travelling', name: 'Travelling',  emoji: '✈️', desc: 'Weekend trips, travel buddies, itineraries' },
  { id: 'cooking',    name: 'Cooking',     emoji: '🍳', desc: 'Recipe sharing, mess food alternatives, cook-offs' },
  { id: 'yoga',       name: 'Yoga & Gym',  emoji: '🧘', desc: 'Morning sessions, gym partners, workout plans' },
  { id: 'general',    name: 'General',     emoji: '💬', desc: 'Everything else — college life, events, notices' },
];

// Initialise message stores
HOBBY_ROOMS.forEach(r => {
  roomMessages[r.id] = [];
  roomMembers[r.id] = new Set();
});

// ── Helpers ────────────────────────────────────────────────
function dmKey(a, b) {
  return [a, b].sort().join('::');
}

function addMessage(store, key, msg, limit = 100) {
  if (!store[key]) store[key] = [];
  store[key].push(msg);
  if (store[key].length > limit) store[key].shift();
  return msg;
}

function getRoomOnlineList(roomId) {
  const members = roomMembers[roomId] || new Set();
  return [...members].map(sid => {
    const u = connectedUsers[sid];
    return u ? { userId: u.userId, displayName: u.displayName } : null;
  }).filter(Boolean);
}

function buildMessage({ type = 'text', userId, displayName, content, roomId, toUserId, toDisplayName, isPlan = false }) {
  return {
    id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type,            // 'text' | 'plan' | 'system'
    userId,
    displayName,
    content,
    roomId: roomId || null,
    toUserId: toUserId || null,
    toDisplayName: toDisplayName || null,
    isPlan,
    reactions: {},   // { emoji: [userId, ...] }
    timestamp: Date.now(),
    timeString: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
  };
}

// ── Socket.io ──────────────────────────────────────────────
io.on('connection', (socket) => {

  // ── JOIN / REGISTER ──────────────────────────────────────
  socket.on('user:register', ({ userId, displayName, hobbies = [] }) => {
    connectedUsers[socket.id] = { userId, displayName, hobbies, currentRoom: null };
    socket.emit('user:registered', { userId, displayName, rooms: HOBBY_ROOMS });
    console.log(`[JOIN] ${displayName} (${userId}) connected`);
  });

  // ── JOIN ROOM ────────────────────────────────────────────
  socket.on('room:join', ({ roomId }) => {
    const user = connectedUsers[socket.id];
    if (!user) return;

    // Leave old room
    if (user.currentRoom && user.currentRoom !== roomId) {
      socket.leave(user.currentRoom);
      if (roomMembers[user.currentRoom]) roomMembers[user.currentRoom].delete(socket.id);
      io.to(user.currentRoom).emit('room:presence', {
        roomId: user.currentRoom,
        online: getRoomOnlineList(user.currentRoom),
      });
      // System message
      const leaveMsg = buildMessage({
        type: 'system', userId: 'system', displayName: 'System',
        content: `${user.displayName} left the room`, roomId: user.currentRoom,
      });
      addMessage(roomMessages, user.currentRoom, leaveMsg);
      io.to(user.currentRoom).emit('room:message', leaveMsg);
    }

    socket.join(roomId);
    user.currentRoom = roomId;
    if (!roomMembers[roomId]) roomMembers[roomId] = new Set();
    roomMembers[roomId].add(socket.id);

    // Send history
    socket.emit('room:history', {
      roomId,
      messages: (roomMessages[roomId] || []).slice(-50),
      online: getRoomOnlineList(roomId),
    });

    // Broadcast presence
    io.to(roomId).emit('room:presence', {
      roomId,
      online: getRoomOnlineList(roomId),
    });

    // System join message
    const joinMsg = buildMessage({
      type: 'system', userId: 'system', displayName: 'System',
      content: `${user.displayName} joined the room`, roomId,
    });
    addMessage(roomMessages, roomId, joinMsg);
    socket.to(roomId).emit('room:message', joinMsg);

    console.log(`[ROOM] ${user.displayName} → ${roomId}`);
  });

  // ── SEND ROOM MESSAGE ────────────────────────────────────
  socket.on('room:send', ({ roomId, content, isPlan = false }) => {
    const user = connectedUsers[socket.id];
    if (!user || !content?.trim()) return;

    const msg = buildMessage({
      type: isPlan ? 'plan' : 'text',
      userId: user.userId,
      displayName: user.displayName,
      content: content.trim(),
      roomId,
      isPlan,
    });

    addMessage(roomMessages, roomId, msg);
    io.to(roomId).emit('room:message', msg);
  });

  // ── DIRECT MESSAGE ───────────────────────────────────────
  socket.on('dm:send', ({ toUserId, toDisplayName, content }) => {
    const user = connectedUsers[socket.id];
    if (!user || !content?.trim()) return;

    const key = dmKey(user.userId, toUserId);
    const msg = buildMessage({
      type: 'text',
      userId: user.userId,
      displayName: user.displayName,
      content: content.trim(),
      toUserId,
      toDisplayName,
    });

    addMessage(dmMessages, key, msg);

    // Find recipient socket
    const recipientSocket = Object.entries(connectedUsers)
      .find(([, u]) => u.userId === toUserId)?.[0];

    // Send to both sender and recipient
    socket.emit('dm:message', { key, msg });
    if (recipientSocket) {
      io.to(recipientSocket).emit('dm:message', { key, msg });
      io.to(recipientSocket).emit('dm:notification', {
        fromUserId: user.userId,
        fromDisplayName: user.displayName,
        preview: content.trim().slice(0, 60),
      });
    }
  });

  // ── DM HISTORY ───────────────────────────────────────────
  socket.on('dm:history', ({ withUserId }) => {
    const user = connectedUsers[socket.id];
    if (!user) return;
    const key = dmKey(user.userId, withUserId);
    socket.emit('dm:history', { key, messages: (dmMessages[key] || []).slice(-50) });
  });

  // ── EMOJI REACTION ───────────────────────────────────────
  socket.on('message:react', ({ messageId, roomId, dmKey: dmk, emoji }) => {
    const user = connectedUsers[socket.id];
    if (!user || !emoji) return;

    // Find message in room or DM
    const store = roomId ? roomMessages[roomId] : dmMessages[dmk];
    if (!store) return;

    const msg = store.find(m => m.id === messageId);
    if (!msg) return;

    if (!msg.reactions[emoji]) msg.reactions[emoji] = [];
    const idx = msg.reactions[emoji].indexOf(user.userId);
    if (idx === -1) {
      msg.reactions[emoji].push(user.userId); // add
    } else {
      msg.reactions[emoji].splice(idx, 1); // toggle off
      if (msg.reactions[emoji].length === 0) delete msg.reactions[emoji];
    }

    const payload = { messageId, reactions: msg.reactions };
    if (roomId) {
      io.to(roomId).emit('message:reactions', payload);
    } else if (dmk) {
      // Send to both users in DM
      const [uA, uB] = dmk.split('::');
      [uA, uB].forEach(uid => {
        const sid = Object.entries(connectedUsers).find(([, u]) => u.userId === uid)?.[0];
        if (sid) io.to(sid).emit('message:reactions', payload);
      });
    }
  });

  // ── TYPING INDICATOR ─────────────────────────────────────
  socket.on('room:typing', ({ roomId, isTyping }) => {
    const user = connectedUsers[socket.id];
    if (!user) return;
    socket.to(roomId).emit('room:typing', {
      userId: user.userId,
      displayName: user.displayName,
      isTyping,
    });
  });

  // ── GET ONLINE USERS (for DM user list) ─────────────────
  socket.on('users:online', () => {
    const user = connectedUsers[socket.id];
    const list = Object.values(connectedUsers)
      .filter(u => u.userId !== user?.userId)
      .map(u => ({ userId: u.userId, displayName: u.displayName, currentRoom: u.currentRoom }));
    socket.emit('users:online', list);
  });

  // ── DISCONNECT ───────────────────────────────────────────
  socket.on('disconnect', () => {
    const user = connectedUsers[socket.id];
    if (user) {
      if (user.currentRoom) {
        if (roomMembers[user.currentRoom]) roomMembers[user.currentRoom].delete(socket.id);
        io.to(user.currentRoom).emit('room:presence', {
          roomId: user.currentRoom,
          online: getRoomOnlineList(user.currentRoom),
        });
        const leaveMsg = buildMessage({
          type: 'system', userId: 'system', displayName: 'System',
          content: `${user.displayName} left the room`, roomId: user.currentRoom,
        });
        addMessage(roomMessages, user.currentRoom, leaveMsg);
        io.to(user.currentRoom).emit('room:message', leaveMsg);
      }
      delete connectedUsers[socket.id];
      console.log(`[LEAVE] ${user.displayName} disconnected`);
    }
  });
});

// ── REST: Room list & stats ────────────────────────────────
app.get('/api/chat/rooms', (req, res) => {
  const rooms = HOBBY_ROOMS.map(r => ({
    ...r,
    online: roomMembers[r.id] ? roomMembers[r.id].size : 0,
    messageCount: roomMessages[r.id] ? roomMessages[r.id].length : 0,
  }));
  res.json({ success: true, data: rooms });
});

app.get('/api/chat/health', (req, res) => {
  res.json({
    status: 'healthy',
    connectedUsers: Object.keys(connectedUsers).length,
    rooms: HOBBY_ROOMS.length,
    timestamp: new Date().toISOString(),
  });
});

server.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║      StayHub Chat Server v1.0.0          ║');
  console.log('║   Socket.io — Hobby Rooms + DMs          ║');
  console.log(`║   Running at http://localhost:${PORT}        ║`);
  console.log('╚══════════════════════════════════════════╝');
  console.log(`✅ ${HOBBY_ROOMS.length} hobby rooms ready`);
  console.log('✅ Direct messaging enabled');
  console.log('✅ Emoji reactions enabled');
});

module.exports = { app, server, io };
