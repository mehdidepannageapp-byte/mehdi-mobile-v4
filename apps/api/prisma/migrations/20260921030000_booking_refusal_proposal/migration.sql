-- AlterEnum
ALTER TYPE "BookingStatus" ADD VALUE 'PROPOSED' BEFORE 'DRIVER_EN_ROUTE';

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN "proposedFor" TIMESTAMP(3);
