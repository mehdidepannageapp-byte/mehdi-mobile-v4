-- CreateEnum
CREATE TYPE "UnavailabilityType" AS ENUM ('ONE_TIME', 'RECURRING');

-- CreateTable
CREATE TABLE "Unavailability" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "type" "UnavailabilityType" NOT NULL,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "weekday" INTEGER,
    "startTime" TEXT,
    "endTime" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Unavailability_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Unavailability_driverId_idx" ON "Unavailability"("driverId");

-- AddForeignKey
ALTER TABLE "Unavailability" ADD CONSTRAINT "Unavailability_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
