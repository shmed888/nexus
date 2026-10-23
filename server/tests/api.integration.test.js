import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const enabled = process.env.RUN_INTEGRATION_TESTS === '1';
const baseUrl = process.env.NEXUS_TEST_URL || 'http://127.0.0.1:3000';
const origin = baseUrl;

async function request(path, { method = 'GET', body, cookie, headers = {} } = {}) {
  const requestHeaders = { Origin: origin, ...headers };
  if (cookie) requestHeaders.Cookie = cookie;
  if (body !== undefined && !(body instanceof FormData)) requestHeaders['Content-Type'] = 'application/json';
  const response = await fetch(new URL(path, baseUrl), {
    method, headers: requestHeaders,
    ...(body !== undefined ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {})
  });
  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  const cookieHeader = response.headers.getSetCookie?.()[0] || response.headers.get('set-cookie') || '';
  return { response, payload, cookie: cookieHeader.split(';')[0] };
}

test('integration: auth, private chat, socket delivery and block enforcement', { skip: !enabled }, async (t) => {
  const { io } = await import('socket.io-client');
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  const password = `Test-${randomUUID()}-Pass`;
  const recoverySecret = `Recovery-${randomUUID()}`;
  const a = await request('/api/auth/register', { method: 'POST', body: { username: `nx_test_a_${suffix}`, displayName: 'Nexus Test A', password, recoverySecret } });
  assert.equal(a.response.status, 201, JSON.stringify(a.payload));
  assert.equal('passwordHash' in a.payload.user, false);
  assert.equal('recoveryHash' in a.payload.user, false);
  t.after(async () => { if (a.cookie) await request('/api/auth/delete-account', { method: 'POST', body: { confirmUsername: a.payload.user.username }, cookie: a.cookie }).catch(() => {}); });

  const duplicate = await request('/api/auth/register', { method: 'POST', body: { username: a.payload.user.username.toUpperCase(), displayName: 'Duplicate', password, recoverySecret } });
  assert.equal(duplicate.response.status, 409);

  const b = await request('/api/auth/register', { method: 'POST', body: { username: `nx_test_b_${suffix}`, displayName: 'Nexus Test B', password, recoverySecret } });
  assert.equal(b.response.status, 201, JSON.stringify(b.payload));
  t.after(async () => { if (b.cookie) await request('/api/auth/delete-account', { method: 'POST', body: { confirmUsername: b.payload.user.username }, cookie: b.cookie }).catch(() => {}); });

  const me = await request('/api/auth/me', { cookie: a.cookie });
  assert.equal(me.response.status, 200);
  const sessions = await request('/api/auth/sessions', { cookie: a.cookie });
  assert.equal(sessions.response.status, 200);
  assert.ok(sessions.payload.sessions.length >= 1);

  const profile = await request('/api/users/profile', { method: 'PATCH', body: { displayName: 'Nexus Test Renamed', bio: 'integration profile' }, cookie: a.cookie });
  assert.equal(profile.response.status, 200);
  assert.equal(profile.payload.user.displayName, 'Nexus Test Renamed');

  const direct = await request('/api/chats/direct', { method: 'POST', body: { userId: b.payload.user.id }, cookie: a.cookie });
  assert.equal(direct.response.status, 201, JSON.stringify(direct.payload));
  const chatId = direct.payload.chat.id;

  const socketA = io(baseUrl, { extraHeaders: { Cookie: a.cookie }, transports: ['websocket'], timeout: 8000 });
  const socketB = io(baseUrl, { extraHeaders: { Cookie: b.cookie }, transports: ['websocket'], timeout: 8000 });
  t.after(() => { socketA.close(); socketB.close(); });
  await Promise.all([new Promise((resolve, reject) => { socketA.once('connect', resolve); socketA.once('connect_error', reject); }), new Promise((resolve, reject) => { socketB.once('connect', resolve); socketB.once('connect_error', reject); })]);
  const join = (socket) => new Promise((resolve, reject) => socket.emit('chat:join', { chatId }, (result) => result?.ok ? resolve() : reject(new Error(result?.error || 'socket join failed'))));
  await Promise.all([join(socketA), join(socketB)]);

  const content = `socket integration ${suffix}`;
  const receive = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('message:new was not received in time')), 8000);
    socketB.once('message:new', (message) => { clearTimeout(timer); resolve(message); });
  });
  const send = new Promise((resolve, reject) => socketA.emit('message:send', { chatId, content, clientId: `client-${suffix}` }, (result) => result?.ok ? resolve(result.message) : reject(new Error(result?.error || 'socket send failed'))));
  const [sent, received] = await Promise.all([send, receive]);
  assert.equal(sent.id, received.id);
  assert.equal(received.content, content);

  const history = await request(`/api/chats/${encodeURIComponent(chatId)}/messages`, { cookie: b.cookie });
  assert.equal(history.response.status, 200);
  assert.ok(history.payload.messages.some((message) => message.content === content));

  const blocked = await request(`/api/users/blocks/${encodeURIComponent(a.payload.user.id)}`, { method: 'POST', body: {}, cookie: b.cookie });
  assert.equal(blocked.response.status, 204);
  const rejected = await new Promise((resolve) => socketA.emit('message:send', { chatId, content: 'blocked message', clientId: `blocked-${suffix}` }, resolve));
  assert.equal(rejected.ok, false);
});
