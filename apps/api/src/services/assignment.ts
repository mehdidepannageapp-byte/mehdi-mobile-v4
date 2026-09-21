import { BookingStatus, UserRole } from '@prisma/client';
import { logger } from '../config/logger.js';
import { prisma } from '../config/prisma.js';
import { pricing } from '../config/pricing.js';
import { sendPush, sendSms } from './notification.js';

const ACTIVE_MISSION_STATUSES: BookingStatus[] = [
  BookingStatus.ASSIGNED,
  BookingStatus.DRIVER_EN_ROUTE,
  BookingStatus.DRIVER_ARRIVED,
  BookingStatus.PICKED_UP,
  BookingStatus.IN_TRANSIT,
];
const STALE_MISSION_MINUTES = 5;

/** Le dépanneur a-t-il déclaré une indisponibilité (mission hors app) au moment visé ? */
async function hasUnavailabilityConflict(driverId: string, at: Date): Promise<boolean> {
  const oneTime = await prisma.unavailability.count({
    where: { driverId, type: 'ONE_TIME', startAt: { lte: at }, endAt: { gte: at } },
  });
  if (oneTime > 0) return true;
  const hhmm = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
  const recurring = await prisma.unavailability.count({
    where: { driverId, type: 'RECURRING', weekday: at.getDay(), startTime: { lte: hhmm }, endTime: { gte: hhmm } },
  });
  return recurring > 0;
}

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
  const targetTime = booking.scheduledFor ?? new Date();
  if (!driver || (await hasUnavailabilityConflict(driver.id, targetTime))) {
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

/**
 * Une mission en cours (entre ASSIGNED et DELIVERED) dont ni le statut ni la position du chauffeur
 * n'ont bougé depuis quelques minutes signale une app fermée ou une perte de connexion : on relance
 * la recherche d'un autre dépanneur plutôt que de laisser le client sans nouvelles.
 */
export async function reassignStaleMissions() {
  const cutoff = new Date(Date.now() - STALE_MISSION_MINUTES * 60_000);
  const staleCandidates = await prisma.booking.findMany({
    where: { status: { in: ACTIVE_MISSION_STATUSES }, driverId: { not: null }, updatedAt: { lte: cutoff } },
    include: { client: true },
    take: 20,
  });
  for (const booking of staleCandidates) {
    const recentLocation = await prisma.liveLocation.findFirst({
      where: { bookingId: booking.id, userId: booking.driverId!, createdAt: { gt: cutoff } },
    });
    if (recentLocation) continue;
    logger.warn({ bookingId: booking.id, driverId: booking.driverId }, 'Chauffeur injoignable, réassignation de la mission');
    await prisma.booking.update({ where: { id: booking.id }, data: { driverId: null, status: BookingStatus.SEARCHING, retryAfter: new Date() } });
    await sendPush(booking.client.pushToken, 'Recherche d’un autre dépanneur', 'Votre dépanneur ne répond plus, nous relançons la recherche.', { bookingId: booking.id });
    void assignSingleDriver(booking.id);
  }
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
    await reassignStaleMissions();
  }, 30_000);
  timer.unref();
}
