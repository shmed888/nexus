import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUsername, isValidUsername, isValidClientId, safeOriginalFilename } from '../server/src/utils/primitives.js';
import { tokenHash } from '../server/src/utils/session.js';

test('username normalization strips an optional @ and uses a canonical lowercase form', () => {
  assert.equal(normalizeUsername('  @ShMedik_01  '), 'shmedik_01');
  assert.equal(normalizeUsername('ALICE.Example'), 'alice.example');
});

test('username validation accepts only the documented ASCII character set', () => {
  assert.equal(isValidUsername('@alice_01'), true);
  assert.equal(isValidUsername('a.b'), true);
  assert.equal(isValidUsername('ab'), false);
  assert.equal(isValidUsername('аlice'), false);
  assert.equal(isValidUsername('alice name'), false);
  assert.equal(isValidUsername('lea ding'), false);
  assert.equal(isValidUsername('a'.repeat(33)), false);
});

test('idempotency keys enforce a bounded safe syntax', () => {
  assert.equal(isValidClientId('client:msg-12345'), true);
  assert.equal(isValidClientId('short'), false);
  assert.equal(isValidClientId('x'.repeat(81)), false);
  assert.equal(isValidClientId('bad key id'), false);
});

test('uploaded original names cannot escape a path or inject line breaks', () => {
  assert.equal(safeOriginalFilename('../../hello.txt'), 'hello.txt');
  assert.equal(safeOriginalFilename('bad\r\nname.pdf'), 'badname.pdf');
  assert.equal(safeOriginalFilename(''), 'file');
  assert.equal(safeOriginalFilename('x'.repeat(300)).length, 255);
});

test('session tokens are stored as one-way keyed digests, not raw values', () => {
  const token = 'random-session-token-that-is-not-stored-directly';
  const hash = tokenHash(token);
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.notEqual(hash, token);
  assert.equal(tokenHash(token), hash);
  assert.notEqual(tokenHash(`${token}x`), hash);
});
