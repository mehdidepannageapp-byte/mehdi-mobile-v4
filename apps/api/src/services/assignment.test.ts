import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  booking: { findMany: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
  liveLocation: { findFirst: vi.fn() },
  user: { findFirst: vi.fn() },
}));
vi.mock('../config/prisma.js', () => ({ prisma: prismaMock }));

const notificationMock = vi.hoisted(() => ({ sendPush: vi.fn(), sendSms: vi.fn() }));
vi.mock('./notification.js', () => notificationMock);

const { reassignStaleMissions } = await import('./assignment.js');
const { BookingStatus } = await import('@prisma/client');

beforeEach(() => {
  vi.clearAllMocks();
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
