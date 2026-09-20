import jwt from 'jsonwebtoken';
import type { Server } from 'http';
import { Server as SocketServer } from 'socket.io';
import { env } from '../config/env.js';
import { prisma } from '../config/prisma.js';

type TokenPayload = { userId: string; role: 'CLIENT' | 'DRIVER' };

export function createSocketServer(server: Server) {
  const io = new SocketServer(server, { cors: { origin: '*' } });
  io.use((socket, next) => {
    try {
      socket.data.auth = jwt.verify(String(socket.handshake.auth.token), env.JWT_SECRET) as TokenPayload;
      next();
    } catch { next(new Error('unauthorized')); }
  });

  io.on('connection', (socket) => {
    const auth = socket.data.auth as TokenPayload;
    socket.join(`user:${auth.userId}`);
    socket.on('booking:join', async (bookingId: string) => {
      const allowed = await prisma.booking.count({ where: { id: bookingId, OR: [{ clientId: auth.userId }, { driverId: auth.userId }] } });
      if (allowed) socket.join(`booking:${bookingId}`);
    });
    socket.on('location:update', async (payload: { bookingId: string; latitude: number; longitude: number; heading?: number }) => {
      const allowed = await prisma.booking.count({ where: { id: payload.bookingId, driverId: auth.userId } });
      if (!allowed) return;
      const location = await prisma.liveLocation.create({ data: { ...payload, userId: auth.userId } });
      io.to(`booking:${payload.bookingId}`).emit('location:updated', location);
    });
    socket.on('message:send', async (payload: { bookingId: string; body: string }) => {
      const allowed = await prisma.booking.count({ where: { id: payload.bookingId, OR: [{ clientId: auth.userId }, { driverId: auth.userId }] } });
      if (!allowed || !payload.body.trim()) return;
      const message = await prisma.message.create({ data: { bookingId: payload.bookingId, senderId: auth.userId, body: payload.body.trim() }, include: { sender: true } });
      io.to(`booking:${payload.bookingId}`).emit('message:new', message);
    });
  });
  return io;
}
