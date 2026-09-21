import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  booking: { findMany: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
  liveLocation: { findFirst: vi.fn() },
  user: { findFirst: vi.fn() },
  unavailability: { count: vi.fn() },
}));
vi.mock('../config/prisma.js', () => ({ prisma: prismaMock }));

const notificationMock = vi.hoisted(() => ({ sendPush: vi.fn(), sendSms: vi.fn() }));
vi.mock('./notification.js', () => notificationMock);

const { assignSingleDriver, reassignStaleMissions } = await import('./assignment.js');
const { BookingStatus } = await import('@prisma/client');

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.unavailability.count.mockResolvedValue(0);
});

describe('assignSingleDriver', () => {
  it('assigne le dépanneur quand il est disponible et sans indisponibilité', async () => {
    prismaMock.booking.findUnique.mockResolvedValue({ id: 'booking-1', status: BookingStatus.SEARCHING, scheduledFor: null, client: {} });
    prismaMock.user.findFirst.mockResolvedValue({ id: 'driver-1', pushToken: null, phone: '+33600000000' });
    prismaMock.unavailability.count.mockResolvedValue(0);
    prismaMock.booking.update.mockResolvedValue({ id: 'booking-1', status: BookingStatus.ASSIGNED });

    const result = await assignSingleDriver('booking-1');

    expect(result).toEqual({ id: 'booking-1', status: BookingStatus.ASSIGNED });
    expect(prismaMock.booking.update).toHaveBeenCalledWith({ where: { id: 'booking-1' }, data: { driverId: 'driver-1', status: BookingStatus.ASSIGNED, retryAfter: null } });
  });

  it('ne pas assigner et relancer plus tard si le dépanneur a une indisponibilité sur ce créneau', async () => {
    prismaMock.booking.findUnique.mockResolvedValue({ id: 'booking-1', status: BookingStatus.SEARCHING, scheduledFor: null, client: {} });
    prismaMock.user.findFirst.mockResolvedValue({ id: 'driver-1', pushToken: null, phone: '+33600000000' });
    prismaMock.unavailability.count.mockResolvedValueOnce(1); // conflit ponctuel
    prismaMock.booking.update.mockResolvedValue({});

    const result = await assignSingleDriver('booking-1');

    expect(result).toBeNull();
    expect(prismaMock.booking.update).toHaveBeenCalledWith({
      where: { id: 'booking-1' },
      data: { status: BookingStatus.SEARCHING, retryAfter: expect.any(Date) },
    });
  });

  it('vérifie l’indisponibilité à l’heure du rendez-vous programmé (scheduledFor), pas à l’heure actuelle', async () => {
    const scheduledFor = new Date('2026-10-06T08:00:00.000Z'); // un mardi
    prismaMock.booking.findUnique.mockResolvedValue({ id: 'booking-1', status: BookingStatus.SCHEDULED, scheduledFor, client: {} });
    prismaMock.user.findFirst.mockResolvedValue({ id: 'driver-1', pushToken: null, phone: '+33600000000' });
    prismaMock.unavailability.count.mockResolvedValue(0);
    prismaMock.booking.update.mockResolvedValue({ id: 'booking-1', status: BookingStatus.ASSIGNED });

    await assignSingleDriver('booking-1');

    expect(prismaMock.unavailability.count).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ type: 'ONE_TIME', startAt: { lte: scheduledFor }, endAt: { gte: scheduledFor } }),
    }));
  });
});

describe('reassignStaleMissions', () => {
  it('repasse en SEARCHING une mission sans mise à jour récente et relance une assignation', async () => {
    prismaMock.booking.findMany.mockResolvedValue([
      { id: 'booking-1', driverId: 'driver-1', status: BookingStatus.DRIVER_EN_ROUTE, client: { pushToken: 'push-1' } },
    ]);
    prismaMock.liveLocation.findFirst.mockResolvedValue(null);
    prismaMock.booking.update.mockResolvedValue({});
    prismaMock.booking.findUnique.mockResolvedValue(null);

    await reassignStaleMissions();

    expect(prismaMock.booking.update).toHaveBeenCalledWith({
      where: { id: 'booking-1' },
      data: { driverId: null, status: BookingStatus.SEARCHING, retryAfter: expect.any(Date) },
    });
    expect(notificationMock.sendPush).toHaveBeenCalledWith('push-1', expect.any(String), expect.any(String), { bookingId: 'booking-1' });
  });

  it('laisse la mission intacte si le chauffeur a envoyé une position récente', async () => {
    prismaMock.booking.findMany.mockResolvedValue([
      { id: 'booking-2', driverId: 'driver-1', status: BookingStatus.PICKED_UP, client: { pushToken: null } },
    ]);
    prismaMock.liveLocation.findFirst.mockResolvedValue({ id: 'loc-1' });

    await reassignStaleMissions();

    expect(prismaMock.booking.update).not.toHaveBeenCalled();
    expect(notificationMock.sendPush).not.toHaveBeenCalled();
  });
});
