-- CreateTable
CREATE TABLE "AttendanceEdit" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "fromStatus" "AttendanceStatus" NOT NULL,
    "toStatus" "AttendanceStatus" NOT NULL,
    "editedById" TEXT NOT NULL,
    "editedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceEdit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AttendanceEdit_sessionId_idx" ON "AttendanceEdit"("sessionId");

-- CreateIndex
CREATE INDEX "AttendanceEdit_studentId_idx" ON "AttendanceEdit"("studentId");

-- CreateIndex
CREATE INDEX "AttendanceEdit_editedById_idx" ON "AttendanceEdit"("editedById");

-- AddForeignKey
ALTER TABLE "AttendanceEdit" ADD CONSTRAINT "AttendanceEdit_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AttendanceSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceEdit" ADD CONSTRAINT "AttendanceEdit_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceEdit" ADD CONSTRAINT "AttendanceEdit_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
