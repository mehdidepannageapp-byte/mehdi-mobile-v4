import 'dotenv/config';
import { createServer } from 'http';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import path from 'path';
import { corsOrigins, env } from './config/env.js';
import { prisma } from './config/prisma.js';
import { errorHandler } from './middleware/errors.js';
import { authRouter } from './routes/auth.js';
import { bookingsRouter } from './routes/bookings.js';
import { driverRouter } from './routes/driver.js';
import { placesRouter } from './routes/places.js';
import { vehiclesRouter } from './routes/vehicles.js';
import { startAssignmentScheduler } from './services/assignment.js';
import { createSocketServer } from './socket/index.js';

const app = express();
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    // Pas d'origine (app mobile, curl, serveur à serveur) ou liste non configurée : on laisse passer.
    if (!origin || corsOrigins.length === 0) return callback(null, true);
    if (corsOrigins.includes(origin)) return callback(null, true);
    callback(new Error('Origine non autorisée par la politique CORS'));
  },
}));
app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads')));
app.get('/health', async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  res.json({ ok: true, service: 'mehdi-depannage-api' });
});
app.use('/auth', authRouter);
app.use('/places', placesRouter);
app.use('/vehicles', vehiclesRouter);
app.use('/bookings', bookingsRouter);
app.use('/driver', driverRouter);
app.use(errorHandler);

const server = createServer(app);
createSocketServer(server);
startAssignmentScheduler();
server.listen(env.PORT, () => console.log(`API Mehdi Dépannage : http://localhost:${env.PORT}`));

async function shutdown() {
  await prisma.$disconnect();
  server.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
