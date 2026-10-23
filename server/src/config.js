import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const number = (value, fallback, min, max) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

export const config = Object.freeze({
  root,
  nodeEnv: process.env.NODE_ENV || 'development',
  host: process.env.HOST || '127.0.0.1',
  port: number(process.env.PORT, 3000, 1, 65535),
  publicOrigin: process.env.PUBLIC_ORIGIN || `http://${process.env.HOST || '127.0.0.1'}:${number(process.env.PORT, 3000, 1, 65535)}`,
  sessionDays: number(process.env.SESSION_DAYS, 14, 1, 60),
  maxFileBytes: number(process.env.MAX_FILE_SIZE_MB, 15, 1, 50) * 1024 * 1024,
  uploadDir: path.resolve(root, process.env.UPLOAD_DIR || './server/data/uploads'),
  appSecret: process.env.APP_SECRET || '',
  stunUrl: process.env.STUN_URL || 'stun:stun.l.google.com:19302',
  turnUrl: process.env.TURN_URL || '',
  turnUsername: process.env.TURN_USERNAME || '',
  turnCredential: process.env.TURN_CREDENTIAL || '',
  secureCookies: process.env.NODE_ENV === 'production'
});
