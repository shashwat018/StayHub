/**
 * StayHub Community Chat — Client JS
 * Handles: onboarding, Socket.io connection, hobby rooms,
 *          DMs, emoji reactions, plan posts, typing indicators
 */

// ── Constants ────────────────────────────────────────────────
const CHAT_SERVER_URL = (() => {
  const h = window.location.hostname;
  if (h === 'localhost' || h === '127.0.0.1') return 'http://localhost:3001';
  return window.STAYHUB_CHAT_URL || 'http://localhost:3001';
})();

const STORAGE_KEY = 'stayhub_user';
const REACTION_EMOJIS = ['👍','❤️','😂','🔥','🎉','👏','😮','💯','⚽','🏏','🎬','♟️','🤝','💪','😎','🙌'];
const EMOJI_LIST = ['😀','😂','🥰','😎','🤔','😮','😢','😡','🎉','🔥','💯','👍','❤️','🙌','👏','💪','⚽','🏏','🏸','🏀','♟️','🎬','📚','🎵','🎮','🥾','✈️','🍳','🤝','⚡'];

const HOBBY_ROOMS = [
  { id: 'football',   name: 'Football',    emoji: '⚽', desc: 'Turf plans, pickup games' },
  { id: 'cricket',    name: 'Cricket',     emoji: '🏏', desc: 'Match plans, fantasy teams' },
  { id: 'badminton',  name: 'Badminton',   emoji: '🏸', desc: 'Court bookings, partners' },
  { id: 'basketball', name: 'Basketball',  emoji: '🏀', desc: 'Pickup games, teams' },
  { id: 'chess',      name: 'Chess',       emoji: '♟️', desc: 'Games, tournaments' },
  { id: 'movies',     name: 'Movies',      emoji: '🎬', desc: 'Movie nights, reviews' },
  { id: 'theatre',    name: 'Theatre',     emoji: '🎭', desc: 'Shows, auditions' },
  { id: 'reading',    name: 'Reading',     emoji: '📚', desc: 'Book recs, sessions' },
  { id: 'music',      name: 'Music',       emoji: '🎵', desc: 'Jam sessions, gigs' },
  { id: 'gaming',     name: 'Gaming',      emoji: '🎮', desc: 'LAN parties, squads' },
  { id: 'trekking',   name: 'Trekking',    emoji: '🥾', desc: 'Trek plans, trails' },
  { id: 'travelling', name: 'Travelling',  emoji: '✈️', desc: 'Weekend trips, buddies' },
  { id: 'cooking',    name: 'Cooking',     emoji: '🍳', desc: 'Recipes, cook-offs' },
  { id: 'yoga',       name: 'Yoga & Gym',  emoji: '🧘', desc: 'Sessions, gym partners' },
  { id: 'general',    name: 'General',     emoji: '💬', desc: 'Everything else' },
];

// ── State ─────────────────────────────────────────────────────
let socket = null;
let currentUser = null;
let currentRoom = null;
let currentDMUser = null;
let unreadCounts = {};
let dmUnreadCount = 0;
let typingTimer = null;
let reactionTargetMsg = null;
let onlineUsers = [];

// ── DOM helpers ───────────────────────────────────────────────
const $ = id => document.getElementById(id);
const show = id => $( id)?.classList.remove('hidden');
const hide = id => $(id)?.classList.add('hidden');

// ── Load / save user ──────────────────────────────────────────
function loadUser() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { return null; }
}
function saveUser(u) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
}
function genUserId() {
  return 'u_' + Math.random().toString(36).slice(2, 10) + '_' + Date.now().toString(36);
}
function avatarLetter(name) {
  return (name || '?').charAt(0).toUpperCase();
}

// ── Onboarding ─────────────────────────────────────────────────
function initOnboarding() {
  // Build hobby grid
  const grid = $('hobbyGrid');
  grid.innerHTML = HOBBY_ROOMS.map(r => `
    <button class="hobby-chip" data-id="${r.id}" type="button">
      <span class="hobby-chip-emoji">${r.emoji}</span>
      <span class="hobby-chip-name">${r.name}</span>
    </button>
  `).join('');

  grid.querySelectorAll('.hobby-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      chip.classList.toggle('selected');
      $('hobbyCount').textContent = grid.querySelectorAll('.hobby-chip.selected').length;
    });
  });

  // Name step next
  $('nameNextBtn').addEventListener('click', () => {
    const name = $('nameInput').value.trim();
    if (!name || name.length < 2) {
      $('nameInput').style.borderColor = 'var(--red-500)';
      $('nameInput').placeholder = 'Please enter at least 2 characters';
      return;
    }
    $('obStep1').classList.remove('active');
    $('obStep2').classList.add('active');
  });

  $('nameInput').addEventListener('keydown', e => { if (e.key === 'Enter') $('nameNextBtn').click(); });

  $('obBack').addEventListener('click', () => {
    $('obStep2').classList.remove('active');
    $('obStep1').classList.add('active');
  });

  // Done
  $('hobbyDoneBtn').addEventListener('click', () => {
    const name = $('nameInput').value.trim();
    const hobbies = [...$('hobbyGrid').querySelectorAll('.hobby-chip.selected')].map(c => c.dataset.id);
    currentUser = { userId: genUserId(), displayName: name, hobbies };
    saveUser(currentUser);
    launchApp();
  });
}

// ── Launch app ─────────────────────────────────────────────────
function launchApp() {
  $('onboardingOverlay').style.display = 'none';
  $('chatApp').style.display = 'flex';
  updateUserUI();
  buildRoomList();
  connectSocket();
}

function updateUserUI() {
  const letter = avatarLetter(currentUser.displayName);
  $('userAvatar').textContent = letter;
  $('userPillName').textContent = currentUser.displayName;
  $('footerAvatar').textContent = letter;
  $('footerName').textContent = currentUser.displayName;
}

// ── Build room list ────────────────────────────────────────────
function buildRoomList() {
  const list = $('roomsList');
  list.innerHTML = HOBBY_ROOMS.map(r => {
    const isMatch = currentUser.hobbies?.includes(r.id);
    return `
      <div class="room-item${isMatch ? ' hobby-match' : ''}" data-room="${r.id}" title="${r.desc}">
        <span class="room-emoji">${r.emoji}</span>
        <div class="room-info">
          <div class="room-name">${r.name}</div>
          <div class="room-online-count" id="roomCount_${r.id}">0 online</div>
        </div>
        <div class="room-unread hidden" id="roomUnread_${r.id}"></div>
      </div>
    `;
  }).join('');

  list.querySelectorAll('.room-item').forEach(item => {
    item.addEventListener('click', () => joinRoom(item.dataset.room));
  });
}

// ── Socket.io connection ───────────────────────────────────────
function connectSocket() {
  socket = io(CHAT_SERVER_URL, {
    transports: ['websocket', 'polling'],
    reconnectionAttempts: 5,
    reconnectionDelay: 1500,
  });

  socket.on('connect', () => {
    socket.emit('user:register', {
      userId: currentUser.userId,
      displayName: currentUser.displayName,
      hobbies: currentUser.hobbies || [],
    });
  });

  socket.on('user:registered', ({ rooms }) => {
    // Join first hobby room or general
    const firstRoom = currentUser.hobbies?.[0] || 'general';
    joinRoom(firstRoom);
    // Fetch online users for DM
    socket.emit('users:online');
  });

  socket.on('room:history', ({ roomId, messages, online }) => {
    if (roomId !== currentRoom) return;
    $('messagesList').innerHTML = '';
    messages.forEach(appendMessage);
    scrollToBottom();
    updateOnlineList(online);
  });

  socket.on('room:message', msg => {
    if (msg.roomId === currentRoom) {
      appendMessage(msg);
      scrollToBottom();
    } else if (msg.type !== 'system') {
      // unread badge
      unreadCounts[msg.roomId] = (unreadCounts[msg.roomId] || 0) + 1;
      const badge = $(`roomUnread_${msg.roomId}`);
      if (badge) {
        badge.textContent = unreadCounts[msg.roomId];
        badge.classList.remove('hidden');
      }
    }
  });

  socket.on('room:presence', ({ roomId, online }) => {
    const countEl = $(`roomCount_${roomId}`);
    if (countEl) countEl.textContent = `${online.length} online`;
    if (roomId === currentRoom) {
      updateOnlineList(online);
      $('onlineCount').textContent = online.length;
    }
  });

  socket.on('room:typing', ({ userId, displayName, isTyping }) => {
    if (userId === currentUser.userId) return;
    const ti = $('typingIndicator');
    const tt = $('typingText');
    if (isTyping) {
      ti.classList.remove('hidden');
      tt.textContent = `${displayName} is typing...`;
    } else {
      ti.classList.add('hidden');
    }
  });

  socket.on('message:reactions', ({ messageId, reactions }) => {
    const msgEl = document.querySelector(`[data-msg-id="${messageId}"]`);
    if (msgEl) {
      const reactRow = msgEl.querySelector('.msg-reactions');
      if (reactRow) reactRow.innerHTML = buildReactionsHTML(messageId, reactions, false);
    }
    // Also check DM messages
    const dmMsgEl = document.querySelector(`[data-dm-id="${messageId}"]`);
    if (dmMsgEl) {
      const rr = dmMsgEl.querySelector('.msg-reactions');
      if (rr) rr.innerHTML = buildReactionsHTML(messageId, reactions, true);
    }
  });

  socket.on('dm:message', ({ key, msg }) => {
    if (currentDMUser && msg.userId !== currentUser.userId &&
        (msg.userId === currentDMUser.userId || msg.toUserId === currentDMUser.userId)) {
      appendDMMessage(msg);
      scrollDMToBottom();
    } else if (msg.userId !== currentUser.userId) {
      dmUnreadCount++;
      $('dmBadge').textContent = dmUnreadCount;
      $('dmBadge').classList.remove('hidden');
    }
  });

  socket.on('dm:notification', ({ fromUserId, fromDisplayName, preview }) => {
    showToast(`💬 ${fromDisplayName}: ${preview}`, 'info', 4000);
    dmUnreadCount++;
    $('dmBadge').textContent = dmUnreadCount;
    $('dmBadge').classList.remove('hidden');
  });

  socket.on('dm:history', ({ key, messages }) => {
    $('dmMessages').innerHTML = '';
    messages.forEach(appendDMMessage);
    scrollDMToBottom();
  });

  socket.on('users:online', list => {
    onlineUsers = list;
    renderDMUserList(list);
  });

  socket.on('disconnect', () => {
    showToast('Connection lost. Reconnecting...', 'error');
  });

  socket.on('connect_error', () => {
    showToast('Chat server unreachable. Make sure chat-server.js is running on port 3001.', 'error', 6000);
  });
}

// ── Join room ─────────────────────────────────────────────────
function joinRoom(roomId) {
  currentRoom = roomId;

  // UI: mark active
  document.querySelectorAll('.room-item').forEach(el => {
    el.classList.toggle('active', el.dataset.room === roomId);
  });

  // Clear unread
  unreadCounts[roomId] = 0;
  const badge = $(`roomUnread_${roomId}`);
  if (badge) badge.classList.add('hidden');

  // Update topbar
  const room = HOBBY_ROOMS.find(r => r.id === roomId);
  if (room) {
    $('topbarEmoji').textContent = room.emoji;
    $('topbarRoomName').textContent = room.name;
    $('topbarRoomDesc').textContent = room.desc;
  }

  // Show chat UI
  hide('chatEmpty');
  show('messagesArea');
  show('chatInputBar');

  // Clear messages
  $('messagesList').innerHTML = '';
  hide('typingIndicator');

  // Socket
  if (socket?.connected) {
    socket.emit('room:join', { roomId });
  }

  // Close mobile sidebar
  $('roomsSidebar').classList.remove('open');
}

// ── Build message HTML ────────────────────────────────────────
function appendMessage(msg) {
  const list = $('messagesList');
  const isOwn = msg.userId === currentUser.userId;

  if (msg.type === 'system') {
    const div = document.createElement('div');
    div.className = 'msg-row system';
    div.innerHTML = `<div class="msg-system">${escHtml(msg.content)}</div>`;
    list.appendChild(div);
    return;
  }

  const row = document.createElement('div');
  row.className = `msg-row${isOwn ? ' own' : ''}`;
  row.dataset.msgId = msg.id;

  const letter = avatarLetter(msg.displayName);
  const reactionsHTML = buildReactionsHTML(msg.id, msg.reactions || {}, false);

  const bubbleContent = msg.isPlan
    ? `<div class="plan-card-header">
        <span class="plan-card-badge">📅 PLAN</span>
       </div>
       <div class="plan-card-title">${escHtml(msg.content.split('\n')[0])}</div>
       ${msg.content.split('\n').slice(1).join('\n')
         ? `<div class="plan-card-body">${escHtml(msg.content.split('\n').slice(1).join('\n'))}</div>` : ''}`
    : escHtml(msg.content);

  row.innerHTML = `
    ${!isOwn ? `<div class="msg-avatar" title="${escHtml(msg.displayName)}" onclick="openDMFromAvatar('${msg.userId}','${escHtml(msg.displayName)}')">${letter}</div>` : ''}
    <div class="msg-bubble-wrap">
      ${!isOwn ? `<div class="msg-meta">
        <span class="msg-sender" onclick="openDMFromAvatar('${msg.userId}','${escHtml(msg.displayName)}')">${escHtml(msg.displayName)}</span>
        <span class="msg-time">${msg.timeString}</span>
      </div>` : `<div class="msg-meta"><span class="msg-time">${msg.timeString}</span></div>`}
      <div class="msg-bubble${msg.isPlan ? ' plan-card' : ''}" 
           oncontextmenu="showReactionPicker(event,'${msg.id}',false)"
           ondblclick="showReactionPicker(event,'${msg.id}',false)">
        ${bubbleContent}
      </div>
      <div class="msg-reactions" data-msg-id="${msg.id}">${reactionsHTML}</div>
    </div>
    ${isOwn ? `<div class="msg-avatar" title="${escHtml(msg.displayName)}">${letter}</div>` : ''}
  `;

  list.appendChild(row);
}

function buildReactionsHTML(msgId, reactions, isDM) {
  const dmAttr = isDM ? `data-dm="true"` : '';
  let html = '';
  Object.entries(reactions || {}).forEach(([emoji, users]) => {
    if (!users.length) return;
    const isOwn = users.includes(currentUser.userId);
    html += `<button class="reaction-chip${isOwn ? ' own-reaction' : ''}"
      onclick="toggleReaction('${msgId}','${emoji}',${isDM})"
      title="${users.length} reaction${users.length !== 1 ? 's' : ''}">
      ${emoji} <span class="reaction-count">${users.length}</span>
    </button>`;
  });
  html += `<button class="add-reaction-btn" onclick="showReactionPicker(event,'${msgId}',${isDM})" title="Add reaction">＋</button>`;
  return html;
}

// ── Send message ──────────────────────────────────────────────
function sendMessage() {
  const input = $('chatInput');
  const text = input.value.trim();
  if (!text || !currentRoom || !socket?.connected) return;
  socket.emit('room:send', { roomId: currentRoom, content: text });
  input.value = '';
  stopTyping();
}

$('sendBtn').addEventListener('click', sendMessage);
$('chatInput').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});

// ── Typing indicator ──────────────────────────────────────────
$('chatInput').addEventListener('input', () => {
  if (!currentRoom || !socket?.connected) return;
  socket.emit('room:typing', { roomId: currentRoom, isTyping: true });
  clearTimeout(typingTimer);
  typingTimer = setTimeout(stopTyping, 2000);
});

function stopTyping() {
  if (currentRoom && socket?.connected) {
    socket.emit('room:typing', { roomId: currentRoom, isTyping: false });
  }
}

// ── Scroll helpers ────────────────────────────────────────────
function scrollToBottom() {
  const el = $('messagesList');
  if (el) el.scrollTop = el.scrollHeight;
}
function scrollDMToBottom() {
  const el = $('dmMessages');
  if (el) el.scrollTop = el.scrollHeight;
}

// ── Online list ───────────────────────────────────────────────
function updateOnlineList(online) {
  const list = $('onlineList');
  if (!online?.length) {
    list.innerHTML = '<div class="online-empty">No one else here</div>';
    $('onlineCount').textContent = 1;
    return;
  }
  $('onlineCount').textContent = online.length;
  list.innerHTML = online.map(u => `
    <div class="online-user-item" onclick="openDMFromAvatar('${u.userId}','${escHtml(u.displayName)}')" title="Send DM">
      <div class="online-user-avatar">${avatarLetter(u.displayName)}</div>
      <span class="online-user-name">${escHtml(u.displayName)}</span>
    </div>
  `).join('');
}

// ── DM Panel ──────────────────────────────────────────────────
$('dmToggleBtn').addEventListener('click', () => {
  const panel = $('dmPanel');
  const isHidden = panel.classList.contains('hidden');
  if (isHidden) {
    panel.classList.remove('hidden');
    dmUnreadCount = 0;
    $('dmBadge').textContent = '0';
    $('dmBadge').classList.add('hidden');
    socket?.emit('users:online');
  } else {
    panel.classList.add('hidden');
  }
});
$('dmCloseBtn').addEventListener('click', () => $('dmPanel').classList.add('hidden'));

function renderDMUserList(users) {
  const container = $('dmUsers');
  const filtered = users.filter(u => u.userId !== currentUser.userId);
  if (!filtered.length) {
    container.innerHTML = '<div class="online-empty">No other students online</div>';
    return;
  }
  container.innerHTML = filtered.map(u => `
    <div class="dm-user-item" onclick="openDM('${u.userId}','${escHtml(u.displayName)}')">
      <div class="online-user-avatar">${avatarLetter(u.displayName)}</div>
      <div>
        <div class="dm-user-name">${escHtml(u.displayName)}</div>
        <div class="dm-user-room">${u.currentRoom ? `in ${u.currentRoom}` : 'online'}</div>
      </div>
    </div>
  `).join('');
}

// DM search
$('dmSearch').addEventListener('input', () => {
  const q = $('dmSearch').value.toLowerCase();
  const filtered = onlineUsers.filter(u =>
    u.userId !== currentUser.userId &&
    u.displayName.toLowerCase().includes(q)
  );
  renderDMUserList(filtered);
});

function openDM(userId, displayName) {
  currentDMUser = { userId, displayName };
  $('dmConvoAvatar').textContent = avatarLetter(displayName);
  $('dmConvoName').textContent = displayName;
  $('dmMessages').innerHTML = '';
  $('dmUserList').classList.add('hidden');
  $('dmConvo').classList.remove('hidden');
  socket?.emit('dm:history', { withUserId: userId });
}

function openDMFromAvatar(userId, displayName) {
  $('dmPanel').classList.remove('hidden');
  dmUnreadCount = 0;
  $('dmBadge').classList.add('hidden');
  openDM(userId, displayName);
}
window.openDMFromAvatar = openDMFromAvatar;

$('dmBackBtn').addEventListener('click', () => {
  currentDMUser = null;
  $('dmConvo').classList.add('hidden');
  $('dmUserList').classList.remove('hidden');
  socket?.emit('users:online');
});

function sendDM() {
  const input = $('dmInput');
  const text = input.value.trim();
  if (!text || !currentDMUser || !socket?.connected) return;
  socket.emit('dm:send', {
    toUserId: currentDMUser.userId,
    toDisplayName: currentDMUser.displayName,
    content: text,
  });
  input.value = '';
}

$('dmSendBtn').addEventListener('click', sendDM);
$('dmInput').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); sendDM(); } });

function appendDMMessage(msg) {
  const isOwn = msg.userId === currentUser.userId;
  const div = document.createElement('div');
  div.className = `dm-msg${isOwn ? ' own' : ''}`;
  div.dataset.dmId = msg.id;
  const reactionsHTML = buildReactionsHTML(msg.id, msg.reactions || {}, true);
  div.innerHTML = `
    <div class="dm-msg-bubble">${escHtml(msg.content)}</div>
    <div class="msg-reactions" style="justify-content:${isOwn?'flex-end':'flex-start'}">${reactionsHTML}</div>
    <div class="dm-msg-time">${msg.timeString}</div>
  `;
  $('dmMessages').appendChild(div);
}

// ── Emoji picker ──────────────────────────────────────────────
const epGrid = $('epGrid');
epGrid.innerHTML = EMOJI_LIST.map(e => `<div class="ep-emoji" data-emoji="${e}">${e}</div>`).join('');
epGrid.addEventListener('click', e => {
  const emoji = e.target.dataset.emoji;
  if (!emoji) return;
  const input = $('chatInput');
  input.value += emoji;
  input.focus();
  hide('emojiPickerPopup');
});

$('emojiPickerBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  const popup = $('emojiPickerPopup');
  const rect = $('emojiPickerBtn').getBoundingClientRect();
  popup.style.bottom = (window.innerHeight - rect.top + 8) + 'px';
  popup.style.right = (window.innerWidth - rect.right) + 'px';
  popup.classList.toggle('hidden');
});

document.addEventListener('click', () => {
  hide('emojiPickerPopup');
  hide('reactionPicker');
});

// ── Reaction picker ───────────────────────────────────────────
const rpEmojis = $('rpEmojis');
rpEmojis.innerHTML = REACTION_EMOJIS.map(e => `<span class="rp-emoji" data-emoji="${e}">${e}</span>`).join('');

function showReactionPicker(e, msgId, isDM) {
  e.preventDefault();
  e.stopPropagation();
  reactionTargetMsg = { msgId, isDM };
  const picker = $('reactionPicker');
  picker.style.left = Math.min(e.clientX, window.innerWidth - 220) + 'px';
  picker.style.top = (e.clientY - 60) + 'px';
  picker.classList.remove('hidden');
}
window.showReactionPicker = showReactionPicker;

rpEmojis.addEventListener('click', e => {
  const emoji = e.target.dataset.emoji;
  if (!emoji || !reactionTargetMsg) return;
  toggleReaction(reactionTargetMsg.msgId, emoji, reactionTargetMsg.isDM);
  hide('reactionPicker');
});

function toggleReaction(messageId, emoji, isDM) {
  if (!socket?.connected) return;
  const payload = { messageId, emoji };
  if (isDM) {
    const key = [currentUser.userId, currentDMUser?.userId].sort().join('::');
    payload.dmKey = key;
  } else {
    payload.roomId = currentRoom;
  }
  socket.emit('message:react', payload);
}
window.toggleReaction = toggleReaction;

// ── Plan modal ────────────────────────────────────────────────
$('planBtn').addEventListener('click', () => {
  show('planModalOverlay');
  $('planTitle').value = '';
  $('planDetails').value = '';
  setTimeout(() => $('planTitle').focus(), 100);
});
$('planModalClose').addEventListener('click', () => hide('planModalOverlay'));
$('planCancelBtn').addEventListener('click', () => hide('planModalOverlay'));

$('planPostBtn').addEventListener('click', () => {
  const title = $('planTitle').value.trim();
  const details = $('planDetails').value.trim();
  if (!title) { $('planTitle').style.borderColor = 'var(--red-500)'; return; }
  const content = details ? `${title}\n${details}` : title;
  if (socket?.connected && currentRoom) {
    socket.emit('room:send', { roomId: currentRoom, content, isPlan: true });
  }
  hide('planModalOverlay');
});

$('planModalOverlay').addEventListener('click', e => {
  if (e.target === $('planModalOverlay')) hide('planModalOverlay');
});

// ── Mobile sidebar ─────────────────────────────────────────────
$('mobileRoomsBtn').addEventListener('click', () => {
  $('roomsSidebar').classList.toggle('open');
});
$('sidebarToggle').addEventListener('click', () => {
  $('roomsSidebar').classList.remove('open');
});

// ── XSS-safe HTML escape ──────────────────────────────────────
function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Init ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  currentUser = loadUser();
  if (currentUser && currentUser.displayName) {
    launchApp();
  } else {
    initOnboarding();
  }
});
