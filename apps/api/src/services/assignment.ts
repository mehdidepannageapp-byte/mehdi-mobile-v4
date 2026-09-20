import { BookingStatus, UserRole } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { pricing } from '../config/pricing.js';
import { sendPush, sendSms } from './notification.js';

export async function assignSingleDriver(bookingId: string) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId }, include: { client: true } });
  if (!booking || (booking.status !== BookingStatus.SEARCHING && booking.status !== BookingStatus.SCHEDULED)) return null;
  const driver = await prisma.user.findFirst({
    where: {
      role: UserRole.DRIVER,
      isAvailable: true,
      driverJobs: { none: { status: { notIn: [BookingStatus.COMPLETED, BookingStatus.CANCELLED] } } },
    },
  });
  if (!driver) {
    await prisma.booking.update({
      where: { id: booking.id },
      data: { status: BookingStatus.SEARCHING, retryAfter: new Date(Date.now() + pricing.retryMinutes * 60_000) },
    });
    return null;
  }
  const updated = await prisma.booking.update({ where: { id: booking.id }, data: { driverId: driver.id, status: BookingStatus.ASSIGNED, retryAfter: null } });
  await Promise.all([
    sendPush(driver.pushToken, 'Nouvelle mission', `${booking.issueType} à ${booking.pickupAddress}`, { bookingId }),
    sendSms(driver.phone, `Nouvelle mission Mehdi Dépannage : ${booking.pickupAddress}`),
  ]);
  return updated;
}

export function startAssignmentScheduler() {
  const timer = setInterval(async () => {
    const now = new Date();
    const bookings = await prisma.booking.findMany({
      where: {
        OR: [
          { status: BookingStatus.SEARCHING, retryAfter: { lte: now } },
          { status: BookingStatus.SCHEDULED, scheduledFor: { lte: new Date(now.getTime() + 15 * 60_000) } },
        ],
      },
      take: 20,
    });
    for (const booking of bookings) await assignSingleDriver(booking.id);
  }, 30_000);
  timer.unref();
}
