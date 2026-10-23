import 'dotenv/config';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { app } from './app.js';
import { config } from './config.js';
import { prisma } from './db.js';
import { attachSockets } from './sockets/index.js';

if (config.nodeEnv === 'production' && config.appSecret.length < 32) {
  throw new Error('APP_SECRET должен содержать не менее 32 символов в production.');
}

const httpServer = createServer(app);
const io = new Server(httpServer, {
  serveClient: true,
  cors: { origin: config.publicOrigin, credentials: true },
  maxHttpBufferSize: 1e6,
  connectionStateRecovery: { maxDisconnectionDuration: 120_000, skipMiddlewares: false }
});
app.set('io', io);
attachSockets(io);

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[nexus] ${signal}: завершение работы`);
  io.close();
  httpServer.close(async () => {
    await prisma.$disconnect().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 8_000).unref();
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await prisma.$connect();
httpServer.listen(config.port, config.host, () => {
  console.log(`[nexus] запущен: http://${config.host}:${config.port}`);
});

// Periodic cleanup only deletes accounts whose explicitly scheduled 30-day window has elapsed.
const cleanupTimer = setInterval(async () => {
  try {
    await prisma.user.deleteMany({ where: { deletionScheduledAt: { lte: new Date() } } });
  } catch (error) { console.error('[nexus:cleanup]', error.message); }
}, 60 * 60 * 1000);
cleanupTimer.unref();
