import 'dotenv/config';
import { createServer } from 'http';
import cors from 'cors';
import express from 'express';
import path from 'path';
import { env } from './config/env.js';
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
app.use(cors());
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
