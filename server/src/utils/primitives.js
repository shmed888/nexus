export function normalizeUsername(value) {
  return String(value ?? '').trim().replace(/^@/, '').toLowerCase();
}

export function isValidUsername(value) {
  const username = normalizeUsername(value);
  return username.length >= 3 && username.length <= 32 && /^[a-z0-9][a-z0-9._]*$/.test(username);
}

export function isValidClientId(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9._:-]{8,80}$/.test(value);
}

export function safeOriginalFilename(value) {
  const name = String(value ?? 'file').split(/[\\/]/).pop().replace(/[\r\n\0]/g, '').trim().slice(0, 255);
  return name || 'file';
}
