-- CreateIndex
CREATE UNIQUE INDEX "User_employeeId_key" ON "User"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "User_sectionId_rollNumber_key" ON "User"("sectionId", "rollNumber");
