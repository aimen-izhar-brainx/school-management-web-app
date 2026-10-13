-- CreateEnum
CREATE TYPE "DayOfWeek" AS ENUM ('mon', 'tue', 'wed', 'thu', 'fri');

-- CreateTable
CREATE TABLE "Period" (
    "id" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "isBreak" BOOLEAN NOT NULL DEFAULT false,
    "label" TEXT,

    CONSTRAINT "Period_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Period_order_key" ON "Period"("order");

-- Fixed school-day schedule. Source of truth: backend/prisma/periods.ts (keep in sync).
INSERT INTO "Period" ("id", "order", "label", "startTime", "endTime", "isBreak") VALUES
  ('period-1', 1, 'Period 1', '08:00', '08:45', false),
  ('period-2', 2, 'Period 2', '08:45', '09:30', false),
  ('period-3', 3, 'Period 3', '09:30', '10:15', false),
  ('recess', 4, 'Recess', '10:15', '10:45', true),
  ('period-4', 5, 'Period 4', '10:45', '11:30', false),
  ('period-5', 6, 'Period 5', '11:30', '12:15', false),
  ('period-6', 7, 'Period 6', '12:15', '13:00', false)
ON CONFLICT ("order") DO NOTHING;
