-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('ON_SITE_REPAIR', 'TRANSPORT');

-- CreateEnum
CREATE TYPE "AppointmentChangeStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SurchargeCategory" AS ENUM ('DESTINATION_CHANGE', 'EXTRA_DISTANCE', 'NIGHT', 'SUNDAY', 'HOLIDAY');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateEnum
CREATE TYPE "ContactMethod" AS ENUM ('CALL', 'MESSAGE');

-- CreateEnum
CREATE TYPE "CancellationRule" AS ENUM ('FREE_ADVANCE', 'SAME_DAY_CARD_FEE', 'SAME_DAY_CASH_FREE');

-- CreateEnum
CREATE TYPE "PostPickupRequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "FinancialStatus" AS ENUM ('PENDING', 'CAPTURED', 'REFUNDED', 'NOT_APPLICABLE');

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "serviceType" "ServiceType" NOT NULL DEFAULT 'TRANSPORT',
ALTER COLUMN "destinationAddress" DROP NOT NULL,
ALTER COLUMN "destinationLatitude" DROP NOT NULL,
ALTER COLUMN "destinationLongitude" DROP NOT NULL,
ALTER COLUMN "distanceKm" DROP NOT NULL;

-- CreateTable
CREATE TABLE "Garage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "phone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Garage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppointmentChangeRequest" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "previousScheduledFor" TIMESTAMP(3),
    "proposedFor" TIMESTAMP(3) NOT NULL,
    "status" "AppointmentChangeStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT NOT NULL,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppointmentChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Surcharge" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "category" "SurchargeCategory" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "gridVersion" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "previousTotalCents" INTEGER NOT NULL,
    "newTotalCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Surcharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "status" "IncidentStatus" NOT NULL DEFAULT 'OPEN',
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactAttempt" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "method" "ContactMethod" NOT NULL,
    "authorId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientAbsence" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "declaredById" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "feeCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientAbsence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CancellationRecord" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "initiatedById" TEXT NOT NULL,
    "initiatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rule" "CancellationRule" NOT NULL,
    "basisAmountCents" INTEGER NOT NULL,
    "feeCents" INTEGER NOT NULL,
    "financialStatus" "FinancialStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,

    CONSTRAINT "CancellationRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostPickupCancellationRequest" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "reason" TEXT,
    "status" "PostPickupRequestStatus" NOT NULL DEFAULT 'PENDING',
    "newDestinationAddress" TEXT,
    "newDestinationLatitude" DOUBLE PRECISION,
    "newDestinationLongitude" DOUBLE PRECISION,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostPickupCancellationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pushEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MissionEvent" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB,
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MissionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AppointmentChangeRequest_bookingId_idx" ON "AppointmentChangeRequest"("bookingId");

-- CreateIndex
CREATE INDEX "Surcharge_bookingId_idx" ON "Surcharge"("bookingId");

-- CreateIndex
CREATE INDEX "Incident_bookingId_idx" ON "Incident"("bookingId");

-- CreateIndex
CREATE INDEX "ContactAttempt_bookingId_idx" ON "ContactAttempt"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientAbsence_bookingId_key" ON "ClientAbsence"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "CancellationRecord_bookingId_key" ON "CancellationRecord"("bookingId");

-- CreateIndex
CREATE INDEX "PostPickupCancellationRequest_bookingId_idx" ON "PostPickupCancellationRequest"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_key" ON "NotificationPreference"("userId");

-- CreateIndex
CREATE INDEX "MissionEvent_bookingId_createdAt_idx" ON "MissionEvent"("bookingId", "createdAt");

-- AddForeignKey
ALTER TABLE "AppointmentChangeRequest" ADD CONSTRAINT "AppointmentChangeRequest_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Surcharge" ADD CONSTRAINT "Surcharge_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactAttempt" ADD CONSTRAINT "ContactAttempt_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientAbsence" ADD CONSTRAINT "ClientAbsence_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CancellationRecord" ADD CONSTRAINT "CancellationRecord_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostPickupCancellationRequest" ADD CONSTRAINT "PostPickupCancellationRequest_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MissionEvent" ADD CONSTRAINT "MissionEvent_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
