import { createHmac, randomBytes } from 'node:crypto';
import { config } from '../config.js';

export const SESSION_COOKIE = 'nexus_session';
export const tokenHash = (token) => createHmac('sha256', config.appSecret || 'nexus-development-only-change-me').update(token).digest('hex');
export const createToken = () => randomBytes(32).toString('base64url');
export const sessionExpiry = () => new Date(Date.now() + config.sessionDays * 24 * 60 * 60 * 1000);

export function cookieOptions() {
  return {
    httpOnly: true,
    secure: config.secureCookies,
    sameSite: 'strict',
    path: '/',
    maxAge: config.sessionDays * 24 * 60 * 60 * 1000
  };
}
