-- CreateIndex
CREATE UNIQUE INDEX "TimetableEntry_teacherId_periodId_dayOfWeek_key" ON "TimetableEntry"("teacherId", "periodId", "dayOfWeek");

