import { t, language, setLanguage } from './i18n.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const state = {
  user: null, sessionId: null, socket: null, chats: [], contacts: [], blocks: [], activeChatId: null,
  activeChat: null, messages: [], currentView: 'chats', chatFilter: 'all', searchQuery: '', searchUsers: [],
  replyTo: null, typingTimer: null, remoteTyping: new Set(), onlineUsers: new Set(), mediaRecorder: null,
  recordingStream: null, uploadXhr: null, call: null, incomingCall: null, rtcConfig: null, historyLoading: false
};

const iconPaths = {
  reply: '<path d="M9 8 4 12l5 4"/><path d="M4 12h9a6 6 0 0 1 6 6"/>',
  pin: '<path d="m16 3 5 5-4 1-4 4-1 5-2-2-5 5"/><path d="m8 8-4-4"/>',
  edit: '<path d="m4 16-.8 4.8L8 20l11-11-4-4Z"/><path d="m13.5 6.5 4 4"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  file: '<path d="M7 3h7l5 5v13H7zM14 3v6h5M10 14h6m-6 4h6"/>',
  search: '<circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  block: '<circle cx="12" cy="12" r="9"/><path d="m6 6 12 12"/>',
  contact: '<path d="M4 12.5a8 8 0 1 1 16 0v2a3 3 0 0 1-3 3h-1M5 17.5h7"/><circle cx="12" cy="10" r="2.5"/>',
  archive: '<path d="M4 7h16v13H4zM3 3h18v4H3zM9 11h6"/>',
  unarchive: '<path d="M4 7h16v13H4zM3 3h18v4H3zM12 17v-5m-3 3 3-3 3 3"/>',
  mic: '<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M8.5 21h7"/>',
  send: '<path d="m4 5 16 7-16 7 3-7-3-7Z"/><path d="M7 12h13"/>',
  video: '<rect x="3" y="6" width="12" height="12" rx="2"/><path d="m15 10 6-3v10l-6-3"/>',
  phone: '<path d="M7 3.5 10 7l-2 2.5a13 13 0 0 0 6.5 6.5l2.5-2 3.5 3c.2.2.2.6 0 .9l-1.8 2c-.5.6-1.3.9-2.1.7C9.5 19 5 14.5 3.4 7.4c-.2-.8.1-1.6.7-2.1l2-1.8c.3-.2.7-.2.9 0Z"/>',
  camera: '<rect x="3" y="7" width="14" height="11" rx="2"/><path d="m17 11 4-2v7l-4-2M8 4h4"/>',
  micOff: '<path d="M9 9V6a3 3 0 0 1 5.8-1M15 10v2a3 3 0 0 1-5.5 1.7M5.5 11.5a6.5 6.5 0 0 0 10 5.5M18.5 11.5a6.5 6.5 0 0 1-1.1 3.6M12 18v3M8.5 21h7M4 4l16 16"/>',
  cameraOff: '<path d="m3 7 14 11M17 11l4-2v7l-3-1.5M8 7h6a2 2 0 0 1 2 2v.5M3 7v9a2 2 0 0 0 2 2h6"/><path d="M8 4h4"/>'
};
const icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${iconPaths[name] || iconPaths.file}</svg>`;
const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const initials = (value = '') => String(value).trim().split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((part) => [...part][0]?.toUpperCase() || '').join('') || 'N';
const normalizeUsername = (value = '') => String(value).trim().replace(/^@/, '').toLowerCase();
const formatTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return date.toLocaleTimeString(language() === 'ru' ? 'ru-RU' : 'en-US', { hour: '2-digit', minute: '2-digit' });
  return date.toLocaleDateString(language() === 'ru' ? 'ru-RU' : 'en-US', { day: 'numeric', month: 'short' });
};
const formatDate = (value) => value ? new Date(value).toLocaleDateString(language() === 'ru' ? 'ru-RU' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : t('common.none');
const formatSize = (size) => size < 1024 ? `${size} B` : size < 1024 * 1024 ? `${(size / 1024).toFixed(0)} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`;
const safeLinkify = (text) => escapeHtml(text).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer nofollow">$1</a>');

async function api(url, options = {}) {
  const headers = new Headers(options.headers || {});
  let body = options.body;
  if (body && !(body instanceof FormData) && typeof body !== 'string') {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(body);
  }
  try {
    const response = await fetch(url, { ...options, body, headers, credentials: 'same-origin' });
    if (response.status === 204) return null;
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload?.error?.message || (response.status === 401 ? t('error.auth') : t('error.generic')));
      error.status = response.status;
      error.code = payload?.error?.code;
      error.details = payload?.error?.details;
      if (response.status === 401 && !url.includes('/auth/login') && !url.includes('/auth/register') && !url.includes('/auth/recover')) {
        if (state.user) showAuth('login');
      }
      throw error;
    }
    return payload;
  } catch (error) {
    if (error instanceof TypeError) throw new Error(t('error.network'));
    throw error;
  }
}

function toast(message, kind = '') {
  const element = document.createElement('div');
  element.className = `toast${kind ? ` is-${kind}` : ''}`;
  element.textContent = message;
  $('#toast-region').append(element);
  setTimeout(() => element.remove(), 3600);
}
function setBusy(button, busy, label) {
  if (!button) return;
  if (busy) { button.dataset.originalText = button.textContent; button.disabled = true; if (label) button.textContent = label; }
  else { button.disabled = false; if (button.dataset.originalText) button.textContent = button.dataset.originalText; }
}
function setAuthMessage(message, good = false) {
  const el = $('#auth-error'); el.textContent = message || ''; el.style.color = good ? 'var(--good)' : '';
}
function showAuth(mode = 'login') {
  state.user = null; state.activeChatId = null; state.activeChat = null;
  $('#app-shell').hidden = true;
  $('#auth-screen').hidden = false;
  authTab(mode);
  setAuthMessage('');
  if (state.socket) { state.socket.disconnect(); state.socket = null; }
}
function authTab(mode) {
  const login = mode === 'login';
  $$('.auth-tab').forEach((button) => button.classList.toggle('is-active', button.dataset.authTab === mode));
  $('#login-form').hidden = !login;
  $('#register-form').hidden = mode !== 'register';
  $('#recovery-form').hidden = mode !== 'recovery';
  setAuthMessage('');
}
function avatar(user, size = '') {
  const cls = `avatar ${size}`.trim();
  const online = user?.online || state.onlineUsers.has(user?.id);
  const img = user?.avatarUrl ? `<img src="${escapeHtml(user.avatarUrl)}" alt="" loading="lazy">` : escapeHtml(initials(user?.displayName || user?.username || 'N'));
  return `<span class="${cls}${online ? ' presence-online' : ''}" aria-hidden="true">${img}</span>`;
}
function displayPeer(chat) {
  return chat.type === 'DIRECT' ? chat.peer : null;
}
function chatTitle(chat) {
  return chat.title || (chat.peer ? chat.peer.displayName : (chat.type === 'SAVED' ? t('view.savedTitle') : t('common.unknown')));
}
function chatSubtitle(chat) {
  if (!chat.lastMessage) return chat.peer?.username ? `@${chat.peer.username}` : (chat.description || '');
  const msg = chat.lastMessage;
  const preview = msg.deletedAt ? t('message.deleted') : msg.type === 'IMAGE' ? 'Фото' : msg.type === 'VIDEO' ? 'Видео' : msg.type === 'AUDIO' || msg.type === 'VOICE' ? 'Аудио' : msg.type === 'FILE' ? msg.attachment?.name || 'Файл' : msg.content;
  return `${msg.mine ? `${t('message.you')}: ` : ''}${preview}`;
}
function filteredChats() {
  let chats = [...state.chats];
  if (state.currentView === 'groups') chats = chats.filter((chat) => chat.type === 'GROUP');
  else if (state.currentView === 'channels') chats = chats.filter((chat) => chat.type === 'CHANNEL');
  else if (state.currentView === 'archive') chats = chats.filter((chat) => chat.archived);
  else if (state.currentView === 'saved') chats = chats.filter((chat) => chat.type === 'SAVED');
  else chats = chats.filter((chat) => !chat.archived && chat.type !== 'SAVED');
  if (state.chatFilter === 'unread' && state.currentView === 'chats') chats = chats.filter((chat) => chat.unreadCount > 0);
  if (state.chatFilter === 'pinned' && state.currentView === 'chats') chats = chats.filter((chat) => chat.pinned);
  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    chats = chats.filter((chat) => `${chatTitle(chat)} ${chat.peer?.username || ''} ${chatSubtitle(chat)}`.toLowerCase().includes(q));
  }
  return chats.sort((a, b) => Number(b.pinned) - Number(a.pinned) || new Date(b.updatedAt) - new Date(a.updatedAt));
}
function chatRow(chat) {
  const peer = displayPeer(chat);
  const face = peer || { id: chat.id, displayName: chat.title || (chat.type === 'SAVED' ? 'Saved' : 'N'), username: chat.title || chat.type };
  const active = chat.id === state.activeChatId;
  const lastAt = chat.lastMessage?.createdAt || chat.updatedAt;
  const unread = chat.unreadCount > 0 ? `<span class="unread-badge">${chat.unreadCount > 99 ? '99+' : chat.unreadCount}</span>` : '';
  return `<button class="chat-row${active ? ' is-active' : ''}" data-chat-id="${escapeHtml(chat.id)}" type="button" aria-label="${escapeHtml(chatTitle(chat))}">
    ${avatar(face, '')}<span class="chat-row-copy"><span class="chat-row-top"><strong class="chat-row-name">${escapeHtml(chatTitle(chat))}</strong><time class="chat-row-time">${escapeHtml(formatTime(lastAt))}</time></span>
    <span class="chat-row-bottom"><span class="chat-row-preview">${escapeHtml(chatSubtitle(chat) || t('message.noMessages'))}</span>${unread}</span></span></button>`;
}
function renderSideList() {
  const list = $('#side-list');
  if (['settings', 'profile'].includes(state.currentView)) {
    $('#list-label').textContent = state.currentView === 'settings' ? t('settings.account').toUpperCase() : t('profile.actions').toUpperCase();
    $('#list-count').textContent = '';
    list.innerHTML = `<div class="list-empty"><strong>${escapeHtml(state.user?.displayName || 'Nexus')}</strong><p>@${escapeHtml(state.user?.username || '')}</p></div>`;
    return;
  }
  if (state.searchQuery.length >= 2) {
    const resultChats = filteredChats();
    const usersHtml = state.searchUsers.length ? `<div class="list-heading"><span>${t('search.users')}</span><span>${state.searchUsers.length}</span></div>${state.searchUsers.map((user) => `<button class="chat-row" data-user-id="${escapeHtml(user.id)}" type="button">${avatar(user)}<span class="chat-row-copy"><span class="chat-row-top"><strong class="chat-row-name">${escapeHtml(user.displayName)}</strong></span><span class="chat-row-bottom"><span class="chat-row-preview">@${escapeHtml(user.username)}</span></span></span></button>`).join('')}` : '';
    const chatsHtml = resultChats.length ? `<div class="list-heading"><span>${t('search.chats')}</span><span>${resultChats.length}</span></div>${resultChats.map(chatRow).join('')}` : '';
    list.innerHTML = usersHtml + chatsHtml || `<div class="list-empty"><strong>${t('search.empty')}</strong><p>${t('search.byUsername')}</p></div>`;
    $('#list-label').textContent = t('view.searchTitle').toUpperCase();
    $('#list-count').textContent = String(state.searchUsers.length + resultChats.length);
    return;
  }
  const chats = filteredChats();
  const labels = { chats: t('list.recent'), groups: t('view.groupsTitle').toUpperCase(), channels: t('view.channelsTitle').toUpperCase(), archive: t('view.archiveTitle').toUpperCase(), saved: t('view.savedTitle').toUpperCase() };
  $('#list-label').textContent = labels[state.currentView] || t('list.recent');
  $('#list-count').textContent = String(chats.length);
  if (!chats.length) {
    const copy = state.currentView === 'groups' ? t('group.empty') : state.currentView === 'channels' ? t('channel.empty') : state.currentView === 'archive' ? t('archive.empty') : state.currentView === 'saved' ? t('saved.empty') : t('search.empty');
    list.innerHTML = `<div class="list-empty"><strong>${escapeHtml(copy)}</strong><p>${state.currentView === 'chats' ? t('empty.description') : ''}</p>${state.currentView === 'chats' || state.currentView === 'groups' || state.currentView === 'channels' ? `<button class="button button-secondary" id="list-create-button">${t('empty.action')}</button>` : ''}</div>`;
  } else list.innerHTML = chats.map(chatRow).join('');
}
function updateSidebarView() {
  const keys = { chats: 'nav.chats', contacts: 'nav.contacts', groups: 'nav.groups', channels: 'nav.channels', saved: 'nav.saved', archive: 'nav.archive', settings: 'nav.settings', profile: 'nav.settings' };
  $('#sidebar-title').textContent = t(keys[state.currentView] || 'nav.chats');
  $$('.rail-button[data-view]').forEach((button) => button.classList.toggle('is-active', button.dataset.view === state.currentView || (state.currentView === 'profile' && button.dataset.view === 'settings')));
  $('#chat-filters').hidden = !['chats'].includes(state.currentView) || state.searchQuery.length > 0;
  renderSideList();
}
async function refreshChats({ keepActive = true } = {}) {
  const payload = await api('/api/chats');
  state.chats = payload.chats || [];
  const archived = await api('/api/chats/archive').catch(() => ({ chats: [] }));
  const archivedIds = new Set((archived.chats || []).map((c) => c.id));
  state.chats.forEach((chat) => { chat.archived = archivedIds.has(chat.id); });
  if (keepActive && state.activeChatId) state.activeChat = state.chats.find((chat) => chat.id === state.activeChatId) || state.activeChat;
  renderSideList();
  if (state.activeChatId) updateChatHeader();
}
async function loadSavedChat() {
  return api('/api/chats/saved');
}
async function bootApp(user, sessionId) {
  state.user = user; state.sessionId = sessionId || null;
  $('#auth-screen').hidden = true; $('#app-shell').hidden = false;
  $('#me-avatar').innerHTML = user.avatarUrl ? `<img src="${escapeHtml(user.avatarUrl)}" alt="">` : `<span>${escapeHtml(initials(user.displayName))}</span>`;
  $('#me-avatar').title = `${user.displayName} (@${user.username})`;
  state.currentView = 'chats'; state.searchQuery = ''; state.chatFilter = 'all';
  updateSidebarView();
  if (user.deletionScheduledAt) {
    renderDetail(t('view.settingsTitle'), t('settings.deleteDescription'), `<section class="settings-section"><div class="settings-body"><p>${escapeHtml(t('settings.deleteDescription'))} ${escapeHtml(formatDate(user.deletionScheduledAt))}</p><button class="button button-primary" id="restore-account-button">${t('settings.restore')}</button></div></section>`);
    $('#restore-account-button')?.addEventListener('click', () => void restoreAccount());
    return;
  }
  try { await refreshChats({ keepActive: false }); } catch (error) { if (error.code !== 'ACCOUNT_PENDING_DELETION') toast(error.message, 'error'); }
  connectSocket();
  await api('/api/users/contacts').then((payload) => { state.contacts = payload.contacts || []; }).catch(() => {});
  const savedChat = await loadSavedChat().catch(() => null);
  if (savedChat?.chat && !state.chats.some((chat) => chat.id === savedChat.chat.id)) state.chats.push(savedChat.chat);
  updateSidebarView();
  showEmpty();
}
function showEmpty() {
  state.activeChat = null; state.activeChatId = null; state.messages = []; state.replyTo = null;
  $('#chat-view').hidden = true; $('#detail-view').hidden = true; $('#empty-state').hidden = false;
  $$('.chat-row').forEach((el) => el.classList.remove('is-active'));
  $('#app-shell').classList.remove('mobile-chat-open', 'mobile-detail-open');
}
function connectSocket() {
  if (typeof window.io !== 'function') { setConnection('offline'); return; }
  if (state.socket) state.socket.disconnect();
  state.socket = window.io({ transports: ['websocket', 'polling'], reconnection: true, reconnectionAttempts: Infinity, timeout: 10000 });
  const socket = state.socket;
  socket.on('connect', () => { setConnection('online'); if (state.activeChatId) void joinActiveChat(); });
  socket.on('disconnect', () => setConnection('offline'));
  socket.on('connect_error', () => setConnection('offline'));
  socket.on('presence:snapshot', (payload) => { state.onlineUsers = new Set(payload.userIds || []); renderSideList(); updateChatHeader(); });
  socket.on('presence:hide', ({ userId } = {}) => { state.onlineUsers.delete(userId); renderSideList(); updateChatHeader(); });
  socket.on('call:blocked', ({ userId } = {}) => { if (state.call?.peer?.id === userId || state.incomingCall?.fromUserId === userId) clearCall(); });
  socket.on('presence:update', (payload) => {
    if (payload.online) state.onlineUsers.add(payload.userId); else state.onlineUsers.delete(payload.userId);
    const chat = state.chats.find((item) => item.peer?.id === payload.userId);
    if (chat?.peer) { chat.peer.online = Boolean(payload.online); if (payload.lastSeenAt) chat.peer.lastSeenAt = payload.lastSeenAt; }
    renderSideList(); updateChatHeader();
  });
  socket.on('chat:updated', async ({ chatId } = {}) => {
    void refreshChats();
    if (chatId && chatId === state.activeChatId && document.visibilityState === 'visible') void markActiveRead();
  });
  socket.on('message:new', (message) => {
    if (message.chatId === state.activeChatId) {
      if (!state.messages.some((item) => item.id === message.id || (item.clientId && message.clientId && item.clientId === message.clientId))) {
        state.messages.push(message); renderMessages(true);
      }
      if (message.sender?.id !== state.user.id && document.visibilityState === 'visible') void markActiveRead();
    }
    void refreshChats();
  });
  socket.on('chat:delivery', (payload) => {
    const message = state.messages.find((item) => item.id === payload.messageId);
    if (message) { message.delivery = message.delivery === 'read' ? 'read' : 'delivered'; renderMessages(false); }
  });
  socket.on('chat:read', ({ chatId, userId } = {}) => {
    if (chatId !== state.activeChatId || userId === state.user.id) return;
    state.messages.forEach((message) => { if (message.mine) message.delivery = 'read'; }); renderMessages(false);
  });
  socket.on('message:updated', (message) => {
    const index = state.messages.findIndex((item) => item.id === message.id);
    if (index >= 0) { state.messages[index] = message; renderMessages(false); }
  });
  socket.on('message:deleted', (payload) => {
    if (payload.chatId !== state.activeChatId) return;
    if (payload.everyone) {
      const msg = state.messages.find((item) => item.id === payload.id);
      if (msg) { msg.deletedAt = new Date().toISOString(); msg.content = t('message.deleted'); msg.attachment = null; }
    } else state.messages = state.messages.filter((item) => item.id !== payload.id);
    renderMessages(false);
  });
  socket.on('message:reaction', (payload) => {
    const message = state.messages.find((item) => item.id === payload.id);
    if (!message) return;
    message.reactions ||= [];
    message.reactions = message.reactions.filter((item) => !(item.userId === payload.userId && item.emoji === payload.emoji));
    if (payload.active) message.reactions.push({ userId: payload.userId, emoji: payload.emoji });
    renderMessages(false);
  });
  socket.on('message:pinned', (payload) => {
    const message = state.messages.find((item) => item.id === payload.id);
    if (message) { message.pinnedAt = payload.pinnedAt; renderMessages(false); }
  });
  socket.on('chat:typing', ({ chatId, userId, active }) => {
    if (chatId !== state.activeChatId || userId === state.user.id) return;
    if (active) state.remoteTyping.add(userId); else state.remoteTyping.delete(userId);
    $('#typing-label').hidden = state.remoteTyping.size === 0;
    $('#typing-label').textContent = state.remoteTyping.size ? `${state.activeChat?.peer?.displayName || '…'} ${t('message.typing')}` : '';
    if (active) {
      clearTimeout(state.remoteTypingTimer);
      state.remoteTypingTimer = setTimeout(() => { state.remoteTyping.clear(); $('#typing-label').hidden = true; }, 3500);
    }
  });
  socket.on('call:signal', onCallSignal);
  socket.on('presence:refresh-result', (payload) => { state.onlineUsers = new Set(payload.userIds || []); renderSideList(); updateChatHeader(); });
  socket.io.on('reconnect', () => { setConnection('online'); if (state.activeChatId) void joinActiveChat(); });
}
function setConnection(kind) {
  const dot = $('#connection-dot');
  dot.classList.toggle('is-online', kind === 'online'); dot.classList.toggle('is-offline', kind === 'offline');
  $('#connection-label').textContent = t(kind === 'online' ? 'connection.online' : kind === 'offline' ? 'connection.offline' : 'connection.connecting');
}
async function joinActiveChat() {
  if (!state.activeChatId || !state.socket?.connected) return;
  state.socket.emit('chat:join', { chatId: state.activeChatId }, (result) => { if (!result?.ok) toast(result?.error || t('error.generic'), 'error'); });
}
async function openChat(chatOrId) {
  let chat = typeof chatOrId === 'string' ? state.chats.find((item) => item.id === chatOrId) : chatOrId;
  if (!chat) return;
  if (state.activeChatId && state.activeChatId !== chat.id) state.socket?.emit('chat:leave', { chatId: state.activeChatId });
  state.currentView = state.currentView === 'saved' ? 'saved' : state.currentView;
  state.activeChatId = chat.id; state.activeChat = chat; state.messages = []; state.replyTo = null;
  $('#reply-strip').hidden = true; $('#typing-label').hidden = true;
  $('#empty-state').hidden = true; $('#detail-view').hidden = true; $('#chat-view').hidden = false;
  $('#app-shell').classList.add('mobile-chat-open'); $('#app-shell').classList.remove('mobile-detail-open');
  updateSidebarView(); updateChatHeader();
  $('#message-list').innerHTML = `<div class="list-loading"><span class="spinner"></span><span>${escapeHtml(t('common.loadingHistory'))}</span></div>`;
  await joinActiveChat();
  try {
    const payload = await api(`/api/chats/${encodeURIComponent(chat.id)}/messages`);
    if (chat.id !== state.activeChatId) return;
    state.messages = payload.messages || [];
    renderMessages(false);
    await markActiveRead();
  } catch (error) { toast(error.message, 'error'); $('#message-list').innerHTML = `<div class="list-empty">${escapeHtml(error.message)}</div>`; }
  $('#message-input').focus({ preventScroll: true });
}
function updateChatHeader() {
  const chat = state.activeChat;
  if (!chat) return;
  const peer = displayPeer(chat);
  const face = peer || { id: chat.id, displayName: chat.title || 'N', online: false };
  $('#chat-avatar').className = `avatar avatar-medium${peer && state.onlineUsers.has(peer.id) ? ' presence-online' : ''}`;
  $('#chat-avatar').innerHTML = face.avatarUrl ? `<img src="${escapeHtml(face.avatarUrl)}" alt="">` : escapeHtml(initials(face.displayName));
  $('#chat-name').textContent = chatTitle(chat);
  const online = peer && state.onlineUsers.has(peer.id);
  $('#chat-status').textContent = peer ? (online ? t('message.online') : `${t('message.lastSeen')}: ${formatTime(peer.lastSeenAt)}`) : (chat.type === 'CHANNEL' ? t('nav.channels') : `${chat.members?.length || 0} ${language() === 'ru' ? 'участника' : 'members'}`);
  $('#start-audio-call').disabled = !peer;
  $('#start-video-call').disabled = !peer;
}
async function markActiveRead() {
  if (!state.activeChatId) return;
  if (state.socket?.connected) state.socket.emit('chat:read', { chatId: state.activeChatId }, () => {});
  else api(`/api/chats/${encodeURIComponent(state.activeChatId)}/read`, { method: 'POST', body: {} }).catch(() => {});
  const chat = state.chats.find((item) => item.id === state.activeChatId);
  if (chat) chat.unreadCount = 0;
  renderSideList();
}
function renderMessages(scroll = false) {
  const container = $('#message-list');
  const q = $('#chat-search-input').value?.trim().toLowerCase();
  const messages = state.messages.filter((message) => !q || `${message.content} ${message.sender?.displayName || ''}`.toLowerCase().includes(q));
  const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
  if (!messages.length) {
    container.innerHTML = `<div class="list-empty"><strong>${escapeHtml(q ? t('message.searchNoResults') : t('message.noMessages'))}</strong></div>`;
    return;
  }
  let lastDate = '';
  container.innerHTML = messages.map((message) => {
    const dateKey = new Date(message.createdAt).toLocaleDateString(language() === 'ru' ? 'ru-RU' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    let divider = '';
    if (dateKey !== lastDate) { divider = `<div class="day-divider">${escapeHtml(dateKey)}</div>`; lastDate = dateKey; }
    if (message.type === 'SYSTEM') return `${divider}<div class="system-message">${safeLinkify(message.content)}</div>`;
    const mine = message.sender?.id === state.user.id;
    const messageContent = message.deletedAt ? `<span class="message-deleted">${escapeHtml(t('message.deleted'))}</span>` : safeLinkify(message.content);
    const reply = message.replyTo ? `<div class="message-reply"><strong>${escapeHtml(message.replyTo.senderId === state.user.id ? t('message.you') : (message.sender?.displayName || ''))}</strong><span>${escapeHtml(message.replyTo.content || '')}</span></div>` : '';
    let attachment = '';
    if (message.attachment && !message.deletedAt) {
      const a = message.attachment;
      const isImage = a.mimeType.startsWith('image/');
      attachment = isImage
        ? `<a href="${escapeHtml(a.downloadUrl)}" target="_blank" rel="noopener noreferrer"><img class="message-image" src="${escapeHtml(a.downloadUrl)}?inline=1" alt="${escapeHtml(a.name)}" loading="lazy"></a>`
        : ['AUDIO', 'VOICE'].includes(message.type) && a.mimeType.startsWith('audio/') ? `<audio controls preload="none" src="${escapeHtml(a.downloadUrl)}?inline=1" style="max-width:240px" aria-label="${escapeHtml(a.name)}"></audio>`
        : `<a class="message-attachment" href="${escapeHtml(a.downloadUrl)}" download><span>${icon('file')}</span><span class="message-attachment-info"><strong>${escapeHtml(a.name)}</strong><small>${escapeHtml(formatSize(a.sizeBytes))} · ${escapeHtml(a.mimeType)}</small></span><span class="attachment-download">↓</span></a>`;
    }
    const reactions = (message.reactions || []).reduce((result, r) => { result[r.emoji] ||= []; result[r.emoji].push(r.userId); return result; }, {});
    const reactionHtml = Object.entries(reactions).map(([emoji, userIds]) => `<button class="reaction-pill${userIds.includes(state.user.id) ? ' is-active' : ''}" data-reaction-message="${escapeHtml(message.id)}" data-emoji="${escapeHtml(emoji)}" type="button">${escapeHtml(emoji)} ${userIds.length}</button>`).join('');
    return `${divider}<article class="message-row${mine ? ' mine' : ''}" data-message-id="${escapeHtml(message.id)}" data-mine="${mine}">${mine ? '' : avatar(message.sender, 'message-avatar')}<div class="message-bubble" tabindex="0" aria-label="${escapeHtml(message.sender?.displayName || '')}: ${escapeHtml(message.content)}">${!mine && state.activeChat?.type !== 'DIRECT' ? `<div class="message-sender">${escapeHtml(message.sender?.displayName || t('common.unknown'))}</div>` : ''}${reply}<div class="message-content">${messageContent}</div>${attachment}<div class="message-meta">${message.editedAt ? `<span class="message-edited">${t('message.edited')}</span>` : ''}${message.pinnedAt ? `<span title="${t('message.pin')}">◆</span>` : ''}<time>${escapeHtml(formatTime(message.createdAt))}</time>${mine ? `<span class="message-status" title="${escapeHtml(message.delivery || 'sent')}">${message.delivery === 'read' || message.delivery === 'delivered' ? '✓✓' : '✓'}</span>` : ''}</div>${reactionHtml ? `<div class="message-reactions">${reactionHtml}</div>` : ''}</div></article>`;
  }).join('');
  if (scroll || nearBottom) container.scrollTop = container.scrollHeight;
}

function renderDetail(title, description, body) {
  $('#empty-state').hidden = true; $('#chat-view').hidden = true; $('#detail-view').hidden = false;
  $('#app-shell').classList.add('mobile-detail-open'); $('#app-shell').classList.remove('mobile-chat-open');
  $('#detail-view').innerHTML = `<header class="detail-head"><div><span class="eyebrow">NEXUS / ${escapeHtml(title.toUpperCase())}</span><h2>${escapeHtml(title)}</h2><p>${escapeHtml(description)}</p></div><button id="detail-close" class="icon-button" aria-label="Close">×</button></header><div class="detail-content">${body}</div>`;
  $('#detail-close').addEventListener('click', () => showEmpty());
}
async function setView(view) {
  state.currentView = view; state.searchQuery = ''; state.searchUsers = []; $('#global-search').value = '';
  if (['settings', 'profile'].includes(view)) {
    updateSidebarView();
    if (view === 'settings') await renderSettings(); else renderOwnProfile();
  } else if (view === 'contacts') {
    updateSidebarView(); await renderContacts();
  } else {
    updateSidebarView();
    if (view === 'saved') {
      const saved = await loadSavedChat().catch(() => null);
      if (saved?.chat) {
        if (!state.chats.some((c) => c.id === saved.chat.id)) state.chats.push({ ...saved.chat, type: 'SAVED', title: t('view.savedTitle'), updatedAt: saved.chat.updatedAt || new Date() });
        const c = state.chats.find((item) => item.id === saved.chat.id);
        if (c) await openChat(c);
      } else showEmpty();
    } else showEmptyIfViewListEmpty();
  }
}
function showEmptyIfViewListEmpty() {
  const chats = filteredChats();
  if (chats.length) {
    if (state.activeChatId && chats.some((c) => c.id === state.activeChatId)) return;
    showEmpty();
  } else showEmpty();
}

async function renderContacts() {
  renderDetail(t('view.contactsTitle'), t('view.contactsDescription'), `<div class="list-loading"><span class="spinner"></span>${t('common.loading')}</div>`);
  try {
    const payload = await api('/api/users/contacts'); state.contacts = payload.contacts || [];
    const body = state.contacts.length ? state.contacts.map((user) => `<div class="contact-result">${avatar(user)}<div class="contact-result-copy"><strong>${escapeHtml(user.displayName)}</strong><small>@${escapeHtml(user.username)}</small></div><button class="button button-secondary" data-contact-message="${escapeHtml(user.id)}">${t('contact.message')}</button><button class="icon-button" data-contact-remove="${escapeHtml(user.id)}" title="${t('contact.remove')}">${icon('more')}</button></div>`).join('') : `<div class="list-empty"><strong>${t('contact.empty')}</strong><p>${t('view.searchDescription')}</p><button class="button button-secondary" data-start-search>${t('create.newChat')}</button></div>`;
    $('.detail-content').innerHTML = body;
  } catch (error) { $('.detail-content').innerHTML = `<p>${escapeHtml(error.message)}</p>`; }
}
function renderOwnProfile() {
  const user = state.user;
  const body = `<section class="settings-section"><div class="settings-body"><div class="settings-row">${avatar(user, 'avatar-medium')}<div style="flex:1"><strong>${escapeHtml(user.displayName)}</strong><small>@${escapeHtml(user.username)}</small></div><button class="button button-secondary" id="profile-edit-settings">${t('nav.settings')}</button></div><p class="muted">${escapeHtml(user.bio || '—')}</p><div class="settings-row"><div><strong>${t('settings.internalId')}</strong><small>${t('settings.internalIdHint')}</small></div><button class="button button-secondary" id="copy-user-id">${t('message.copy')}</button></div><div class="settings-row"><div><strong>${t('profile.memberSince')}</strong><small>${escapeHtml(formatDate(user.createdAt))}</small></div></div></div></section>`;
  renderDetail(t('settings.profile'), `${t('profile.memberSince')}: ${formatDate(user.createdAt)}`, body);
  $('#profile-edit-settings')?.addEventListener('click', () => void setView('settings'));
  $('#copy-user-id')?.addEventListener('click', () => copyText(user.id));
}
async function renderSettings() {
  const user = state.user;
  const body = `<section class="settings-section"><div class="settings-title">${t('settings.profile')}</div><div class="settings-body"><form id="profile-form" class="settings-form"><label class="field"><span>${t('settings.displayName')}</span><input name="displayName" value="${escapeHtml(user.displayName)}" maxlength="60" required></label><label class="field"><span>${t('settings.username')}</span><input name="username" value="${escapeHtml(user.username)}" maxlength="32" required><small>${escapeHtml(t('settings.username'))}: a-z, 0-9, . _</small></label><label class="field"><span>${t('settings.bio')}</span><textarea name="bio" maxlength="160">${escapeHtml(user.bio || '')}</textarea></label><div class="form-actions"><button class="button button-primary" type="submit">${t('settings.save')}</button></div><div id="profile-form-message" class="muted"></div></form></div></section>
  <section class="settings-section"><div class="settings-title">${t('settings.language')}</div><div class="settings-body"><div class="form-actions"><button class="button ${language() === 'ru' ? 'button-primary' : 'button-secondary'}" data-language="ru">Русский</button><button class="button ${language() === 'en' ? 'button-primary' : 'button-secondary'}" data-language="en">English</button></div></div></section>
  <section class="settings-section"><div class="settings-title">${t('settings.account')}</div><div class="settings-body"><div class="settings-row"><div><strong>${t('settings.internalId')}</strong><small>${t('settings.internalIdHint')}</small></div><button class="button button-secondary" id="copy-user-id">${t('message.copy')}</button></div><div class="settings-row"><div><strong>${t('settings.recoveryWarning')}</strong></div></div><div class="form-actions"><button id="logout-button" class="button button-secondary">${t('settings.logout')}</button><button id="delete-account-button" class="button button-danger">${t('settings.deleteAccount')}</button></div><div id="deletion-state" class="muted">${user.deletionScheduledAt ? `${t('settings.deleteDescription')} ${formatDate(user.deletionScheduledAt)} <button class="button button-secondary" id="restore-account-button">${t('settings.restore')}</button>` : t('settings.deleteDescription')}</div></div></section>
  <section class="settings-section"><div class="settings-title">${t('settings.sessions')}</div><div class="settings-body" id="sessions-list"><div class="list-loading"><span class="spinner"></span>${t('common.loading')}</div><button id="revoke-other-sessions" class="button button-secondary">${t('settings.revokeOthers')}</button></div></section>
  <section class="settings-section"><div class="settings-title">${t('settings.blocked')}</div><div class="settings-body" id="blocked-list"><div class="list-loading"><span class="spinner"></span>${t('common.loading')}</div></div></section>`;
  renderDetail(t('view.settingsTitle'), t('view.settingsDescription'), body);
  $('#profile-form').addEventListener('submit', saveProfile);
  $$('[data-language]').forEach((button) => button.addEventListener('click', () => { setLanguage(button.dataset.language); void renderSettings(); updateSidebarView(); }));
  $('#copy-user-id')?.addEventListener('click', () => copyText(user.id));
  $('#logout-button')?.addEventListener('click', logout);
  $('#delete-account-button')?.addEventListener('click', scheduleDeleteAccount);
  $('#restore-account-button')?.addEventListener('click', restoreAccount);
  $('#revoke-other-sessions')?.addEventListener('click', revokeOtherSessions);
  void loadSessions(); void loadBlocked();
}
async function saveProfile(event) {
  event.preventDefault(); const form = event.currentTarget; const data = Object.fromEntries(new FormData(form));
  try {
    const payload = await api('/api/users/profile', { method: 'PATCH', body: data }); state.user = payload.user;
    $('#me-avatar').innerHTML = `<span>${escapeHtml(initials(state.user.displayName))}</span>`;
    $('#profile-form-message').textContent = t('toast.profileSaved'); toast(t('toast.profileSaved'), 'good');
    await refreshChats();
  } catch (error) { $('#profile-form-message').textContent = error.message; $('#profile-form-message').style.color = 'var(--danger)'; }
}
async function loadSessions() {
  try {
    const { sessions } = await api('/api/auth/sessions');
    $('#sessions-list').innerHTML = `${sessions.map((s) => `<div class="settings-row"><div><strong>${s.current ? t('settings.current') : escapeHtml(s.userAgent || t('common.unknown'))}</strong><small>${escapeHtml(s.ipAddress || '')} · ${t('settings.sessionCreated')}: ${escapeHtml(formatDate(s.createdAt))}<br>${escapeHtml(formatTime(s.lastSeenAt))}</small></div>${s.current ? '' : `<button class="button button-secondary" data-revoke-session="${escapeHtml(s.id)}">${t('settings.sessionRevoke')}</button>`}</div>`).join('') || `<span class="muted">${t('common.none')}</span>`}<button id="revoke-other-sessions" class="button button-secondary">${t('settings.revokeOthers')}</button>`;
    $$('[data-revoke-session]').forEach((button) => button.addEventListener('click', async () => { try { await api(`/api/auth/sessions/${encodeURIComponent(button.dataset.revokeSession)}`, { method: 'DELETE' }); toast(t('toast.sessionsRevoked'), 'good'); await loadSessions(); } catch (e) { toast(e.message, 'error'); } }));
    $('#revoke-other-sessions')?.addEventListener('click', revokeOtherSessions);
  } catch (error) { $('#sessions-list').textContent = error.message; }
}
async function loadBlocked() {
  try {
    const { users } = await api('/api/users/blocked');
    $('#blocked-list').innerHTML = users.length ? users.map((user) => `<div class="settings-row">${avatar(user, 'avatar-small')}<div style="flex:1"><strong>${escapeHtml(user.displayName)}</strong><small>@${escapeHtml(user.username)}</small></div><button class="button button-secondary" data-unblock="${escapeHtml(user.id)}">${t('settings.unblock')}</button></div>`).join('') : `<span class="muted">${t('common.none')}</span>`;
    $$('[data-unblock]').forEach((button) => button.addEventListener('click', async () => { try { await api(`/api/users/blocks/${encodeURIComponent(button.dataset.unblock)}`, { method: 'DELETE' }); toast(t('toast.userUnblocked'), 'good'); await loadBlocked(); } catch (e) { toast(e.message, 'error'); } }));
  } catch (error) { $('#blocked-list').textContent = error.message; }
}
async function revokeOtherSessions() {
  try { await api('/api/auth/sessions/revoke-others', { method: 'POST', body: {} }); toast(t('toast.sessionsRevoked'), 'good'); await loadSessions(); }
  catch (error) { toast(error.message, 'error'); }
}
async function scheduleDeleteAccount() {
  const entered = await showModal({ title: t('settings.deleteAccount'), description: t('settings.deleteDescription'), fields: [{ name: 'confirmUsername', label: t('field.username'), placeholder: `@${state.user.username}`, required: true }], confirmLabel: t('settings.deleteAccount'), danger: true });
  if (!entered) return;
  try { const payload = await api('/api/auth/delete-account', { method: 'POST', body: entered }); state.user.deletionScheduledAt = payload.deletionScheduledAt; toast(t('toast.accountScheduled'), 'good'); await renderSettings(); }
  catch (error) { toast(error.message, 'error'); }
}
async function restoreAccount() {
  try { await api('/api/auth/restore-account', { method: 'POST', body: {} }); state.user.deletionScheduledAt = null; toast(t('toast.accountRestored'), 'good'); await renderSettings(); }
  catch (error) { toast(error.message, 'error'); }
}
async function logout() {
  try { await api('/api/auth/logout', { method: 'POST', body: {} }); } catch (e) { /* Clear local UI even if server is unavailable. */ }
  if (state.socket) state.socket.disconnect(); state.socket = null; showAuth('login');
}

async function openUser(userId) {
  try {
    const user = state.searchUsers.find((item) => item.id === userId) || state.contacts.find((item) => item.id === userId);
    if (!user) return;
    renderUserProfile(user);
  } catch (error) { toast(error.message, 'error'); }
}
function renderUserProfile(user) {
  const blocked = state.blocks.some((item) => item.id === user.id);
  const isContact = state.contacts.some((item) => item.id === user.id);
  const lastSeen = state.onlineUsers.has(user.id) ? t('message.online') : `${t('profile.lastSeen')}: ${formatTime(user.lastSeenAt)}`;
  const body = `<section class="settings-section"><div class="settings-body"><div class="settings-row">${avatar({ ...user, online: state.onlineUsers.has(user.id) }, 'avatar-medium')}<div style="flex:1"><strong>${escapeHtml(user.displayName)}</strong><small>@${escapeHtml(user.username)}</small></div></div><div><strong>${t('profile.about')}</strong><p class="muted">${escapeHtml(user.bio || '—')}</p></div><div class="settings-row"><div><strong>${t('profile.lastSeen')}</strong><small>${escapeHtml(lastSeen)}</small></div></div><div class="form-actions"><button class="button button-primary" id="profile-message">${t('contact.message')}</button><button class="button button-secondary" id="profile-contact">${isContact ? t('contact.remove') : t('contact.add')}</button><button class="button ${blocked ? 'button-primary' : 'button-secondary'}" id="profile-block">${blocked ? t('contact.unblock') : t('contact.block')}</button></div></div></section>`;
  renderDetail(user.displayName, `@${user.username}`, body);
  $('#profile-message').addEventListener('click', async () => {
    try { const payload = await api('/api/chats/direct', { method: 'POST', body: { userId: user.id } }); await refreshChats(); const chat = state.chats.find((item) => item.id === payload.chat.id) || { ...payload.chat, peer: user, type: 'DIRECT' }; if (!state.chats.some((c) => c.id === chat.id)) state.chats.unshift(chat); await openChat(chat); }
    catch (error) { toast(error.message, 'error'); }
  });
  $('#profile-contact').addEventListener('click', async () => {
    try {
      await api(`/api/users/contacts/${encodeURIComponent(user.id)}`, { method: isContact ? 'DELETE' : 'POST', body: isContact ? undefined : {} });
      toast(t(isContact ? 'toast.contactRemoved' : 'toast.contactAdded'), 'good');
      if (state.currentView === 'contacts') await renderContacts(); else renderUserProfile(user);
      const payload = await api('/api/users/contacts'); state.contacts = payload.contacts || [];
    } catch (error) { toast(error.message, 'error'); }
  });
  $('#profile-block').addEventListener('click', async () => {
    try {
      await api(`/api/users/blocks/${encodeURIComponent(user.id)}`, { method: blocked ? 'DELETE' : 'POST', body: blocked ? undefined : {} });
      if (blocked) state.blocks = state.blocks.filter((item) => item.id !== user.id); else state.blocks.push(user);
      toast(t(blocked ? 'toast.userUnblocked' : 'toast.userBlocked'), 'good'); renderUserProfile(user);
    } catch (error) { toast(error.message, 'error'); }
  });
}
async function loadBlocksState() {
  try { const payload = await api('/api/users/blocked'); state.blocks = payload.users || []; } catch {}
}

function showModal({ title, description = '', fields = [], confirmLabel = t('common.confirm'), danger = false, bodyHtml = '' }) {
  return new Promise((resolve) => {
    const root = $('#modal-root');
    const fieldsHtml = fields.map((field) => `<label class="field"><span>${escapeHtml(field.label)}</span><input name="${escapeHtml(field.name)}" type="${escapeHtml(field.type || 'text')}" ${field.required ? 'required' : ''} maxlength="${field.maxlength || 300}" placeholder="${escapeHtml(field.placeholder || '')}" value="${escapeHtml(field.value || '')}"></label>`).join('');
    root.innerHTML = `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}"><header class="modal-head"><div><span class="eyebrow">NEXUS / ACTION</span><h2>${escapeHtml(title)}</h2><p>${escapeHtml(description)}</p></div><button class="icon-button" id="modal-close" aria-label="Close">×</button></header><form id="modal-form"><div class="modal-body">${bodyHtml}${fieldsHtml}</div><div class="modal-actions"><button type="button" id="modal-cancel" class="button button-secondary">${t('common.cancel')}</button><button type="submit" class="button ${danger ? 'button-danger' : 'button-primary'}">${escapeHtml(confirmLabel)}</button></div></form></section></div>`;
    let settled = false;
    const finish = (value) => { if (settled) return; settled = true; root.innerHTML = ''; resolve(value); };
    $('#modal-close', root).addEventListener('click', () => finish(null));
    $('#modal-cancel', root).addEventListener('click', () => finish(null));
    $('.modal-backdrop', root).addEventListener('click', (event) => { if (event.target === event.currentTarget) finish(null); });
    $('#modal-form', root).addEventListener('submit', (event) => { event.preventDefault(); finish(Object.fromEntries(new FormData(event.currentTarget))); });
    $('input', root)?.focus();
  });
}
async function createDialog(type = 'DIRECT') {
  if (type === 'DIRECT') {
    const values = await showModal({ title: t('create.chatTitle'), description: t('create.chatDescription'), fields: [{ name: 'username', label: t('field.username'), placeholder: 'username', required: true }], confirmLabel: t('create.search') });
    if (!values) return;
    const username = normalizeUsername(values.username);
    if (username.length < 3 || !/^[a-z0-9._]{3,32}$/.test(username)) { toast(t('auth.usernameHint'), 'error'); return; }
    try {
      const payload = await api(`/api/users/search?username=${encodeURIComponent(username)}`);
      const user = (payload.users || []).find((item) => item.username === username);
      if (!user) { toast(t('search.empty'), 'error'); return; }
      const direct = await api('/api/chats/direct', { method: 'POST', body: { userId: user.id } });
      await refreshChats();
      let chat = state.chats.find((item) => item.id === direct.chat.id);
      if (!chat) { chat = { ...direct.chat, peer: user, type: 'DIRECT', updatedAt: new Date(), unreadCount: 0 }; state.chats.unshift(chat); }
      chat.peer = chat.peer || user; await openChat(chat);
    } catch (error) { toast(error.message, 'error'); }
    return;
  }
  const isChannel = type === 'CHANNEL';
  const values = await showModal({ title: t(isChannel ? 'create.channel' : 'create.group'), description: t(isChannel ? 'view.channelsDescription' : 'view.groupsDescription'), fields: [
    { name: 'title', label: t('create.title'), required: true, maxlength: 80 },
    { name: 'description', label: t('create.description'), maxlength: 300 },
    ...(!isChannel ? [{ name: 'members', label: t('create.members'), placeholder: 'user1, user2', maxlength: 500 }] : [])
  ], confirmLabel: t('create.submit') });
  if (!values) return;
  try {
    const memberIds = [];
    if (values.members?.trim()) {
      const names = [...new Set(values.members.split(',').map(normalizeUsername).filter(Boolean))];
      for (const name of names) {
        const result = await api(`/api/users/search?username=${encodeURIComponent(name)}`);
        const target = (result.users || []).find((item) => item.username === name);
        if (!target) throw new Error(`@${name}: ${t('search.empty')}`);
        memberIds.push(target.id);
      }
    }
    const payload = await api('/api/chats/groups', { method: 'POST', body: { title: values.title, description: values.description, memberIds, type: isChannel ? 'CHANNEL' : 'GROUP' } });
    await refreshChats();
    const created = state.chats.find((chat) => chat.id === payload.chat.id) || { ...payload.chat, peer: null, members: [], unreadCount: 0, updatedAt: new Date() };
    state.chats.unshift(created); await openChat(created); toast(t('common.success'), 'good');
  } catch (error) { toast(error.message, 'error'); }
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(String(text)); toast(t('toast.copied'), 'good'); }
  catch { const area = document.createElement('textarea'); area.value = text; document.body.append(area); area.select(); document.execCommand('copy'); area.remove(); toast(t('toast.copied'), 'good'); }
}

async function sendComposerMessage() {
  const input = $('#message-input'); const content = input.value;
  if (!content.trim() || !state.activeChatId) { if (!content.trim()) return; }
  const clientId = crypto.randomUUID();
  const payload = { chatId: state.activeChatId, content: content.trim(), clientId, replyToId: state.replyTo?.id || null };
  input.value = ''; resizeComposer(input); $('#send-button').disabled = true;
  if (state.socket?.connected) {
    state.socket.emit('message:send', payload, (result) => {
      if (!result?.ok) { if (!input.value) input.value = content; resizeComposer(input); $('#send-button').disabled = !input.value.trim(); toast(result?.error || t('error.generic'), 'error'); }
      else { clearReply(); void refreshChats(); }
    });
  } else {
    try { const result = await api(`/api/chats/${encodeURIComponent(state.activeChatId)}/messages`, { method: 'POST', body: payload }); if (result?.message && !state.messages.some((m) => m.id === result.message.id)) { state.messages.push(result.message); renderMessages(true); } clearReply(); void refreshChats(); }
    catch (error) { input.value = content; resizeComposer(input); $('#send-button').disabled = false; toast(error.message, 'error'); }
  }
}
function resizeComposer(input = $('#message-input')) {
  input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 140)}px`;
  $('#send-button').disabled = !input.value.trim();
}
function setReply(message) {
  state.replyTo = message;
  $('#reply-preview').textContent = `${message.sender?.displayName || t('message.you')}: ${message.content}`;
  $('#reply-strip').hidden = false; $('#message-input').focus();
}
function clearReply() { state.replyTo = null; $('#reply-strip').hidden = true; $('#reply-preview').textContent = ''; }

function showMessageContext(message, x, y) {
  if (!message || message.deletedAt) return;
  const menu = $('#context-menu');
  const canEdit = message.sender?.id === state.user.id;
  const items = [
    ['reply', 'message.reply', () => setReply(message)],
    ['copy', 'message.copy', () => copyText(message.content)],
    ['contact', 'message.react', () => showReactionPicker(message, x, y)],
    ['pin', message.pinnedAt ? 'message.unpin' : 'message.pin', () => togglePin(message)],
    ...(canEdit ? [['edit', 'message.edit', () => editMessage(message)]] : []),
    ['trash', 'message.deleteMe', () => deleteMessage(message, false)],
    ...(canEdit ? [['trash', 'message.deleteAll', () => deleteMessage(message, true)]] : [])
  ];
  menu.innerHTML = items.map(([key, label], i) => `<button type="button" data-menu-item="${i}" class="${String(label).includes('delete') ? 'danger' : ''}">${icon(key)}<span>${t(label)}</span></button>`).join('');
  menu.hidden = false;
  const width = 190; const height = items.length * 38 + 10;
  menu.style.left = `${Math.max(8, Math.min(window.innerWidth - width - 8, x))}px`;
  menu.style.top = `${Math.max(8, Math.min(window.innerHeight - height - 8, y))}px`;
  $$('[data-menu-item]', menu).forEach((button, index) => button.addEventListener('click', () => { menu.hidden = true; items[index][2](); }));
}
function showReactionPicker(message, x, y) {
  const emojis = ['👍', '❤️', '😂', '😮', '🙏', '✨'];
  const menu = $('#context-menu');
  menu.innerHTML = emojis.map((emoji) => `<button type="button" data-emoji-choice="${emoji}" style="display:inline-flex;width:auto;padding:10px;font-size:18px">${emoji}</button>`).join('');
  menu.hidden = false; menu.style.left = `${Math.min(window.innerWidth - 240, x)}px`; menu.style.top = `${Math.min(window.innerHeight - 70, y)}px`;
  $$('[data-emoji-choice]', menu).forEach((button) => button.addEventListener('click', async () => {
    menu.hidden = true;
    try { await api(`/api/messages/${encodeURIComponent(message.id)}/reactions`, { method: 'POST', body: { emoji: button.dataset.emojiChoice } }); }
    catch (error) { toast(error.message, 'error'); }
  }));
}
async function togglePin(message) {
  try { const payload = await api(`/api/messages/${encodeURIComponent(message.id)}/pin`, { method: 'POST', body: {} }); message.pinnedAt = payload.pinnedAt; renderMessages(false); }
  catch (error) { toast(error.message, 'error'); }
}
async function editMessage(message) {
  const values = await showModal({ title: t('message.edit'), fields: [{ name: 'content', label: t('composer.placeholder'), value: message.content, required: true, maxlength: 4000 }] });
  if (!values) return;
  try { const payload = await api(`/api/messages/${encodeURIComponent(message.id)}`, { method: 'PATCH', body: values }); const index = state.messages.findIndex((m) => m.id === message.id); if (index >= 0) state.messages[index] = payload.message; renderMessages(false); }
  catch (error) { toast(error.message, 'error'); }
}
async function deleteMessage(message, everyone) {
  const ok = await showModal({ title: t(everyone ? 'message.deleteAll' : 'message.deleteMe'), description: everyone ? (language() === 'ru' ? 'Сообщение будет удалено у всех участников чата.' : 'This message will be deleted for everyone in this chat.') : (language() === 'ru' ? 'Сообщение исчезнет только из вашей истории.' : 'The message will disappear only from your history.'), confirmLabel: t('common.confirm'), danger: true });
  if (!ok) return;
  try { await api(`/api/messages/${encodeURIComponent(message.id)}${everyone ? '?everyone=true' : ''}`, { method: 'DELETE' });
    if (!everyone) state.messages = state.messages.filter((m) => m.id !== message.id);
    else { message.deletedAt = new Date().toISOString(); message.content = t('message.deleted'); message.attachment = null; }
    renderMessages(false);
  } catch (error) { toast(error.message, 'error'); }
}

function sendTyping(active) {
  if (!state.socket?.connected || !state.activeChatId) return;
  state.socket.emit('chat:typing', { chatId: state.activeChatId, active });
}
async function handleAttachment(file, voice = false) {
  if (!file || !state.activeChatId) return;
  $('#upload-strip').hidden = false; $('#upload-name').textContent = file.name || (voice ? 'voice-message.webm' : 'attachment'); $('#upload-progress-fill').style.width = '0%';
  const formData = new FormData(); formData.append('voice', voice ? 'true' : 'false'); formData.append('file', file, file.name || 'voice-message.webm');
  const xhr = new XMLHttpRequest(); state.uploadXhr = xhr; const path = `/api/chats/${encodeURIComponent(state.activeChatId)}/attachments`;
  xhr.open('POST', path); xhr.withCredentials = true;
  xhr.upload.onprogress = (event) => { if (event.lengthComputable) $('#upload-progress-fill').style.width = `${Math.round(event.loaded / event.total * 100)}%`; };
  xhr.onload = () => {
    state.uploadXhr = null; $('#upload-strip').hidden = true;
    let payload = {}; try { payload = JSON.parse(xhr.responseText); } catch {}
    if (xhr.status >= 200 && xhr.status < 300) { if (!state.messages.some((m) => m.id === payload.message?.id)) { state.messages.push(payload.message); renderMessages(true); } void refreshChats(); }
    else toast(payload?.error?.message || t('toast.fileError'), 'error');
  };
  xhr.onerror = () => { state.uploadXhr = null; $('#upload-strip').hidden = true; toast(t('toast.fileError'), 'error'); };
  xhr.onabort = () => { state.uploadXhr = null; $('#upload-strip').hidden = true; };
  xhr.send(formData);
}
async function recordVoice() {
  if (state.mediaRecorder?.state === 'recording') {
    state.mediaRecorder.stop(); $('#record-voice').classList.remove('active'); return;
  }
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { toast(t('call.micDenied'), 'error'); return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); state.recordingStream = stream;
    const recorder = new MediaRecorder(stream); state.mediaRecorder = recorder; const chunks = [];
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop()); state.recordingStream = null; state.mediaRecorder = null;
      if (chunks.length) void handleAttachment(new File(chunks, `voice-${Date.now()}.webm`, { type: recorder.mimeType || 'audio/webm' }), true);
    };
    recorder.start(); $('#record-voice').classList.add('active'); toast(language() === 'ru' ? 'Запись идёт. Нажмите микрофон ещё раз, чтобы отправить.' : 'Recording. Tap the microphone again to send.');
  } catch { toast(t('call.micDenied'), 'error'); }
}

/* One-to-one WebRTC calls. Public deployments need HTTPS and a suitable TURN server for some networks. */
async function startCall(callType) {
  if (!state.activeChat || state.activeChat.type !== 'DIRECT') { toast(t('call.noDevice'), 'error'); return; }
  if (!state.socket?.connected) { toast(t('toast.callUnavailable'), 'error'); return; }
  if (state.call) return;
  try {
    const config = await api('/api/calls/config');
    const media = await navigator.mediaDevices.getUserMedia({ audio: true, video: callType === 'video' });
    state.call = { chatId: state.activeChatId, peer: state.activeChat.peer, callType, localStream: media, pc: new RTCPeerConnection({ iceServers: config.iceServers }), initiated: true, muted: false, cameraOn: callType === 'video' };
    setupPeerConnection(state.call);
    media.getTracks().forEach((track) => state.call.pc.addTrack(track, media));
    showCallOverlay(t('call.outgoing'), false);
    const offer = await state.call.pc.createOffer(); await state.call.pc.setLocalDescription(offer);
    sendCallSignal({ chatId: state.call.chatId, kind: 'offer', description: state.call.pc.localDescription, callType });
  } catch (error) {
    clearCall(); toast(error.name === 'NotAllowedError' ? t('call.micDenied') : t('call.noDevice'), 'error');
  }
}
function setupPeerConnection(call) {
  call.pc.onicecandidate = (event) => { if (event.candidate) sendCallSignal({ chatId: call.chatId, kind: 'ice', candidate: event.candidate, callType: call.callType }); };
  call.pc.ontrack = (event) => {
    if (!state.call || state.call.pc !== call.pc) return;
    state.call.remoteStream ||= new MediaStream();
    state.call.remoteStream.addTrack(event.track);
    const remoteVideo = $('.remote-video', $('#call-overlay'));
    if (remoteVideo) remoteVideo.srcObject = state.call.remoteStream;
  };
  call.pc.onconnectionstatechange = () => {
    if (!state.call || state.call.pc !== call.pc) return;
    if (call.pc.connectionState === 'connected') setCallStatus(t('call.connected'));
    if (['failed', 'disconnected'].includes(call.pc.connectionState)) setCallStatus(t('call.network'));
    if (call.pc.connectionState === 'closed') clearCall(false);
  };
}
function sendCallSignal(payload) {
  state.socket?.emit('call:signal', payload, (result) => { if (!result?.ok) { toast(result?.error || t('toast.callUnavailable'), 'error'); if (state.call) clearCall(); } });
}
function onCallSignal(payload) {
  if (['reject', 'hangup', 'busy'].includes(payload.kind)) {
    if (state.call?.peer?.id === payload.fromUserId || state.incomingCall?.fromUserId === payload.fromUserId) { clearCall(); toast(t('call.ended')); }
    return;
  }
  if (payload.kind === 'offer') {
    if (state.call) { sendCallSignal({ chatId: payload.chatId, kind: 'busy' }); return; }
    const chat = state.chats.find((item) => item.id === payload.chatId);
    if (!chat) return;
    state.incomingCall = { ...payload, pendingCandidates: [] };
    showIncomingCall(chat, state.incomingCall);
    return;
  }
  if (!state.call || state.call.chatId !== payload.chatId) {
    if (payload.kind === 'ice' && state.incomingCall?.chatId === payload.chatId && payload.candidate) state.incomingCall.pendingCandidates.push(payload.candidate);
    return;
  }
  if (payload.kind === 'answer' && payload.description) {
    state.call.pc.setRemoteDescription(payload.description).then(async () => {
      for (const candidate of state.call?.pendingCandidates || []) await state.call.pc.addIceCandidate(candidate).catch(() => {});
      if (state.call) state.call.pendingCandidates = [];
    }).catch(() => clearCall());
  }
  if (payload.kind === 'ice' && payload.candidate) {
    if (state.call.pc.remoteDescription) state.call.pc.addIceCandidate(payload.candidate).catch(() => {});
    else (state.call.pendingCandidates ||= []).push(payload.candidate);
  }
}
function showIncomingCall(chat, payload) {
  const root = $('#call-overlay'); root.hidden = false;
  root.innerHTML = `<div class="call-card">${avatar(chat.peer || { displayName: chatTitle(chat) }, 'avatar-medium')}<div class="call-peer-name">${escapeHtml(chatTitle(chat))}</div><div class="call-status">${t('call.incoming')} · ${t(payload.callType === 'video' ? 'call.video' : 'call.audio')}</div></div><div class="call-actions"><button id="call-decline" class="call-action danger" aria-label="${t('call.decline')}">${icon('phone')}</button><button id="call-accept" class="call-action primary" aria-label="${t('call.accept')}">${icon('phone')}</button></div>`;
  $('#call-decline').addEventListener('click', () => { sendCallSignal({ chatId: payload.chatId, kind: 'reject' }); state.incomingCall = null; root.hidden = true; });
  $('#call-accept').addEventListener('click', () => void acceptCall(chat, payload));
}
async function acceptCall(chat, payload) {
  try {
    const config = await api('/api/calls/config');
    const media = await navigator.mediaDevices.getUserMedia({ audio: true, video: payload.callType === 'video' });
    const call = { chatId: payload.chatId, peer: chat.peer, callType: payload.callType, localStream: media, pc: new RTCPeerConnection({ iceServers: config.iceServers }), initiated: false, muted: false, cameraOn: payload.callType === 'video', pendingCandidates: payload.pendingCandidates || [] };
    state.call = call; state.incomingCall = null; setupPeerConnection(call);
    media.getTracks().forEach((track) => call.pc.addTrack(track, media));
    await call.pc.setRemoteDescription(payload.description);
    for (const candidate of call.pendingCandidates) await call.pc.addIceCandidate(candidate).catch(() => {});
    call.pendingCandidates = [];
    const answer = await call.pc.createAnswer(); await call.pc.setLocalDescription(answer);
    showCallOverlay(t('call.connecting'), false);
    sendCallSignal({ chatId: call.chatId, kind: 'answer', description: call.pc.localDescription, callType: call.callType });
  } catch (error) { toast(error.name === 'NotAllowedError' ? t('call.micDenied') : t('call.noDevice'), 'error'); clearCall(); }
}
function showCallOverlay(status, incoming) {
  const call = state.call; if (!call) return;
  const root = $('#call-overlay'); root.hidden = false;
  root.innerHTML = `<div class="call-card"><video class="remote-video" autoplay playsinline ${call.callType === 'video' ? '' : 'hidden'}></video>${call.callType === 'video' ? '<video class="local-video" autoplay playsinline muted></video>' : ''}<div class="call-peer-name">${escapeHtml(call.peer?.displayName || t('common.unknown'))}</div><div class="call-status" id="call-status">${escapeHtml(status)}</div></div><div class="call-actions"><button id="call-mic" class="call-action" title="${t('call.mic')}">${icon('mic')}</button>${call.callType === 'video' ? `<button id="call-camera" class="call-action" title="${t('call.camera')}">${icon('camera')}</button>` : ''}<button id="call-hangup" class="call-action danger" title="${t('call.hangup')}">${icon('phone')}</button></div>`;
  const localVideo = $('.local-video', root); if (localVideo) localVideo.srcObject = call.localStream;
  $('#call-mic').addEventListener('click', () => {
    call.muted = !call.muted; call.localStream.getAudioTracks().forEach((track) => { track.enabled = !call.muted; });
    $('#call-mic').innerHTML = icon(call.muted ? 'micOff' : 'mic');
  });
  $('#call-camera')?.addEventListener('click', () => {
    call.cameraOn = !call.cameraOn; call.localStream.getVideoTracks().forEach((track) => { track.enabled = call.cameraOn; });
    $('#call-camera').innerHTML = icon(call.cameraOn ? 'camera' : 'cameraOff');
  });
  $('#call-hangup').addEventListener('click', () => { sendCallSignal({ chatId: call.chatId, kind: 'hangup', callType: call.callType }); clearCall(); });
}
function setCallStatus(status) { const el = $('#call-status'); if (el) el.textContent = status; }
function clearCall(disconnect = true) {
  const call = state.call;
  if (call) {
    call.localStream?.getTracks().forEach((track) => track.stop());
    try { call.pc?.close(); } catch {}
  }
  state.call = null; state.incomingCall = null; $('#call-overlay').hidden = true; $('#call-overlay').innerHTML = '';
  if (disconnect && state.activeChatId) void joinActiveChat();
}

/* UI events */
$$('[data-auth-tab]').forEach((button) => button.addEventListener('click', () => authTab(button.dataset.authTab)));
$('#auth-language').addEventListener('click', () => { setLanguage(language() === 'ru' ? 'en' : 'ru'); });
$('#show-recovery').addEventListener('click', () => authTab('recovery'));
$('#back-to-login').addEventListener('click', () => authTab('login'));
$('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault(); const button = $('button[type="submit"]', event.currentTarget); setBusy(button, true, '…'); setAuthMessage('');
  const body = Object.fromEntries(new FormData(event.currentTarget));
  try { const payload = await api('/api/auth/login', { method: 'POST', body }); await bootApp(payload.user, payload.sessionId); }
  catch (error) { setAuthMessage(error.message); }
  finally { setBusy(button, false); }
});
$('#register-form').addEventListener('submit', async (event) => {
  event.preventDefault(); const button = $('button[type="submit"]', event.currentTarget); setBusy(button, true, '…'); setAuthMessage('');
  const body = Object.fromEntries(new FormData(event.currentTarget));
  try { const payload = await api('/api/auth/register', { method: 'POST', body }); await bootApp(payload.user); }
  catch (error) { setAuthMessage(error.message); }
  finally { setBusy(button, false); }
});
$('#recovery-form').addEventListener('submit', async (event) => {
  event.preventDefault(); const button = $('button[type="submit"]', event.currentTarget); setBusy(button, true, '…');
  try { await api('/api/auth/recover', { method: 'POST', body: Object.fromEntries(new FormData(event.currentTarget)) }); setAuthMessage(language() === 'ru' ? 'Пароль изменён. Теперь войдите.' : 'Password updated. Please sign in.', true); authTab('login'); }
  catch (error) { setAuthMessage(error.message); }
  finally { setBusy(button, false); }
});
$$('.rail-button[data-view]').forEach((button) => button.addEventListener('click', () => void setView(button.dataset.view)));
$('#me-avatar').addEventListener('click', () => void setView('profile'));
$('#create-menu').addEventListener('click', () => showCreateMenu());
$('#empty-new-chat').addEventListener('click', () => void createDialog('DIRECT'));
$('#list-create-button')?.addEventListener('click', () => void createDialog('DIRECT'));
function showCreateMenu() {
  const x = $('#create-menu').getBoundingClientRect(); const y = x.bottom + 6;
  const menu = $('#context-menu');
  menu.innerHTML = `<button data-create="DIRECT">${icon('contact')}<span>${t('create.newChat')}</span></button><button data-create="GROUP">${icon('contact')}<span>${t('create.group')}</span></button><button data-create="CHANNEL">${icon('file')}<span>${t('create.channel')}</span></button>`;
  menu.hidden = false; menu.style.left = `${Math.max(8, Math.min(innerWidth - 210, x.right - 190))}px`; menu.style.top = `${Math.min(innerHeight - 150, y)}px`;
  $$('[data-create]', menu).forEach((button) => button.addEventListener('click', () => { menu.hidden = true; void createDialog(button.dataset.create); }));
}
$('#side-list').addEventListener('click', async (event) => {
  const chatRowEl = event.target.closest('[data-chat-id]');
  const userRowEl = event.target.closest('[data-user-id]');
  const createButton = event.target.closest('#list-create-button');
  if (chatRowEl) {
    const chat = state.chats.find((item) => item.id === chatRowEl.dataset.chatId);
    if (chat) void openChat(chat);
  } else if (userRowEl) { await openUser(userRowEl.dataset.userId); }
  else if (createButton) void createDialog('DIRECT');
});
$('#chat-filters').addEventListener('click', (event) => {
  const button = event.target.closest('[data-filter]'); if (!button) return;
  state.chatFilter = button.dataset.filter; $$('.filter-chip').forEach((el) => el.classList.toggle('is-active', el === button)); renderSideList();
});
let searchTimer;
$('#global-search').addEventListener('input', (event) => {
  state.searchQuery = event.target.value.trim(); state.searchUsers = [];
  clearTimeout(searchTimer);
  if (state.searchQuery.length >= 2 && /^[\s@a-zA-Z0-9._-]+$/.test(state.searchQuery)) {
    searchTimer = setTimeout(async () => {
      try { const payload = await api(`/api/users/search?username=${encodeURIComponent(normalizeUsername(state.searchQuery))}`); state.searchUsers = payload.users || []; }
      catch { state.searchUsers = []; }
      renderSideList();
    }, 220);
  }
  renderSideList();
});
$('#global-search').addEventListener('keydown', (event) => { if (event.key === 'Escape') { event.currentTarget.value = ''; state.searchQuery = ''; state.searchUsers = []; renderSideList(); } });
document.addEventListener('keydown', (event) => {
  if (event.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName) && !event.ctrlKey && !event.metaKey) { event.preventDefault(); $('#global-search').focus(); }
  if (event.key === 'Escape') { $('#context-menu').hidden = true; if (state.call) clearCall(); }
});
$('#mobile-back').addEventListener('click', () => { $('#app-shell').classList.remove('mobile-chat-open'); if (state.activeChatId) state.socket?.emit('chat:leave', { chatId: state.activeChatId }); });
$('#chat-person').addEventListener('click', async () => {
  if (state.activeChat?.peer) {
    try { const payload = await api(`/api/users/profile/${encodeURIComponent(state.activeChat.peer.username)}`); renderUserProfile(payload.user); }
    catch (error) { toast(error.message, 'error'); }
  } else if (state.activeChat) showGroupInfo();
});
function showGroupInfo() {
  const chat = state.activeChat; if (!chat) return;
  const members = (chat.members || []).map((m) => `<div class="settings-row">${avatar(m, 'avatar-small')}<div style="flex:1"><strong>${escapeHtml(m.displayName)}</strong><small>@${escapeHtml(m.username)} · ${escapeHtml(m.role)}</small></div></div>`).join('');
  const body = `<section class="settings-section"><div class="settings-title">${t('view.groupsTitle')}</div><div class="settings-body">${members || '<span class="muted">—</span>'}</div></section><section class="settings-section"><div class="settings-body"><div class="form-actions"><button class="button button-secondary" id="rename-chat">${t('settings.save')}</button><button class="button button-secondary" id="leave-chat">${t('common.close')}</button></div></div></section>`;
  renderDetail(chatTitle(chat), chat.description || '', body);
  $('#rename-chat')?.addEventListener('click', async () => {
    const result = await showModal({ title: t('create.title'), fields: [{ name: 'title', label: t('create.title'), value: chat.title || '', required: true, maxlength: 80 }] });
    if (!result) return;
    try { await api(`/api/chats/${encodeURIComponent(chat.id)}/title`, { method: 'PATCH', body: result }); chat.title = result.title; await refreshChats(); updateChatHeader(); showEmpty(); }
    catch (error) { toast(error.message, 'error'); }
  });
  $('#leave-chat')?.addEventListener('click', async () => {
    try { await api(`/api/chats/${encodeURIComponent(chat.id)}/members/${encodeURIComponent(state.user.id)}`, { method: 'DELETE' }); state.chats = state.chats.filter((c) => c.id !== chat.id); showEmpty(); await refreshChats(); }
    catch (error) { toast(error.message, 'error'); }
  });
}
$('#chat-more').addEventListener('click', () => {
  if (!state.activeChat) return;
  const r = $('#chat-more').getBoundingClientRect(); const menu = $('#context-menu');
  const archived = Boolean(state.activeChat.archived);
  menu.innerHTML = `<button data-chat-action="pin">${icon('pin')}<span>${state.activeChat.pinned ? t('message.unpin') : t('message.pin')}</span></button><button data-chat-action="archive">${icon(archived ? 'unarchive' : 'archive')}<span>${archived ? t('toast.chatRestored') : t('toast.chatArchived')}</span></button>`;
  menu.hidden = false; menu.style.left = `${Math.max(8, r.right - 190)}px`; menu.style.top = `${Math.min(innerHeight - 110, r.bottom + 6)}px`;
  $$('[data-chat-action]', menu).forEach((button) => button.addEventListener('click', async () => {
    menu.hidden = true;
    try {
      if (button.dataset.chatAction === 'pin') await api(`/api/chats/${encodeURIComponent(state.activeChatId)}/pin`, { method: 'PATCH', body: { pinned: !state.activeChat.pinned } });
      else await api(`/api/chats/${encodeURIComponent(state.activeChatId)}/archive`, { method: 'PATCH', body: { archived: !archived } });
      toast(t(button.dataset.chatAction === 'pin' ? 'common.success' : archived ? 'toast.chatRestored' : 'toast.chatArchived'), 'good');
      if (button.dataset.chatAction === 'archive' && !archived) showEmpty(); await refreshChats();
    } catch (error) { toast(error.message, 'error'); }
  }));
});
$('#composer-form').addEventListener('submit', (event) => { event.preventDefault(); void sendComposerMessage(); });
$('#message-input').addEventListener('input', () => { resizeComposer(); sendTyping(true); clearTimeout(state.typingTimer); state.typingTimer = setTimeout(() => sendTyping(false), 1000); });
$('#message-input').addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); void sendComposerMessage(); } });
$('#attach-button').addEventListener('click', () => $('#attachment-input').click());
$('#attachment-input').addEventListener('change', (event) => { const file = event.target.files?.[0]; if (file) void handleAttachment(file); event.target.value = ''; });
$('#record-voice').addEventListener('click', () => void recordVoice());
$('#upload-cancel').addEventListener('click', () => state.uploadXhr?.abort());
$('#reply-cancel').addEventListener('click', clearReply);
$('#message-list').addEventListener('contextmenu', (event) => {
  const row = event.target.closest('[data-message-id]'); if (!row) return;
  event.preventDefault(); const message = state.messages.find((item) => item.id === row.dataset.messageId); showMessageContext(message, event.clientX, event.clientY);
});
let longPressTimer;
$('#message-list').addEventListener('touchstart', (event) => {
  const row = event.target.closest('[data-message-id]'); if (!row) return;
  const touch = event.touches[0]; longPressTimer = setTimeout(() => { const message = state.messages.find((item) => item.id === row.dataset.messageId); showMessageContext(message, touch.clientX, touch.clientY); }, 520);
}, { passive: true });
['touchend', 'touchmove', 'touchcancel'].forEach((type) => $('#message-list').addEventListener(type, () => clearTimeout(longPressTimer), { passive: true }));
$('#message-list').addEventListener('click', (event) => {
  const reactionButton = event.target.closest('[data-reaction-message]');
  if (reactionButton) { const message = state.messages.find((item) => item.id === reactionButton.dataset.reactionMessage); if (message) void api(`/api/messages/${encodeURIComponent(message.id)}/reactions`, { method: 'POST', body: { emoji: reactionButton.dataset.emoji } }).catch((error) => toast(error.message, 'error')); }
});
$('#message-list').addEventListener('keydown', (event) => { if ((event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) && event.target.closest('[data-message-id]')) { event.preventDefault(); const row = event.target.closest('[data-message-id]'); const rect = row.getBoundingClientRect(); showMessageContext(state.messages.find((item) => item.id === row.dataset.messageId), rect.right, rect.bottom); } });
$('#search-in-chat').addEventListener('click', () => { $('#chat-search-row').hidden = false; $('#chat-search-input').focus(); });
$('#chat-search-close').addEventListener('click', () => { $('#chat-search-row').hidden = true; $('#chat-search-input').value = ''; renderMessages(false); });
$('#chat-search-input').addEventListener('input', () => renderMessages(false));
$('#start-audio-call').addEventListener('click', () => void startCall('audio'));
$('#start-video-call').addEventListener('click', () => void startCall('video'));
$('#modal-root').addEventListener('keydown', (event) => { if (event.key === 'Escape') $('#modal-root').innerHTML = ''; });
$('#detail-view').addEventListener('click', (event) => {
  const messageButton = event.target.closest('[data-contact-message]');
  if (messageButton) {
    const user = state.contacts.find((c) => c.id === messageButton.dataset.contactMessage);
    if (user) void api('/api/chats/direct', { method: 'POST', body: { userId: user.id } }).then(async (payload) => { await refreshChats(); const chat = state.chats.find((c) => c.id === payload.chat.id) || { ...payload.chat, peer: user, type: 'DIRECT' }; await openChat(chat); }).catch((error) => toast(error.message, 'error'));
  }
  const removeButton = event.target.closest('[data-contact-remove]');
  if (removeButton) void api(`/api/users/contacts/${encodeURIComponent(removeButton.dataset.contactRemove)}`, { method: 'DELETE' }).then(async () => { toast(t('toast.contactRemoved'), 'good'); await renderContacts(); }).catch((error) => toast(error.message, 'error'));
  if (event.target.closest('[data-start-search]')) void createDialog('DIRECT');
});
document.addEventListener('click', (event) => {
  if (!event.target.closest('#context-menu') && !event.target.closest('#create-menu') && !event.target.closest('#chat-more')) $('#context-menu').hidden = true;
});
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && state.activeChatId) void markActiveRead(); });
document.addEventListener('paste', (event) => {
  if (!state.activeChatId || ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
  const item = [...(event.clipboardData?.items || [])].find((entry) => entry.type.startsWith('image/'));
  const file = item?.getAsFile(); if (file) { event.preventDefault(); void handleAttachment(new File([file], `pasted-image-${Date.now()}.${file.type.split('/')[1] || 'png'}`, { type: file.type })); }
});
$('#chat-view').addEventListener('dragover', (event) => { if (event.dataTransfer?.types?.includes('Files')) { event.preventDefault(); $('#chat-view').classList.add('file-dragging'); } });
$('#chat-view').addEventListener('dragleave', (event) => { if (!$('#chat-view').contains(event.relatedTarget)) $('#chat-view').classList.remove('file-dragging'); });
$('#chat-view').addEventListener('drop', (event) => { event.preventDefault(); $('#chat-view').classList.remove('file-dragging'); const file = event.dataTransfer?.files?.[0]; if (file) void handleAttachment(file); });

async function init() {
  const authParam = new URLSearchParams(location.search).get('auth');
  try {
    const payload = await api('/api/auth/me');
    await bootApp(payload.user, payload.sessionId);
  } catch {
    showAuth(authParam === 'register' ? 'register' : 'login');
  }
  await loadBlocksState();
}
void init();
