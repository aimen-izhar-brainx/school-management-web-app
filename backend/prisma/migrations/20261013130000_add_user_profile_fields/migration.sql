-- AlterTable
ALTER TABLE "User" ADD COLUMN     "address" TEXT,
ADD COLUMN     "admissionDate" DATE,
ADD COLUMN     "dateOfBirth" DATE,
ADD COLUMN     "department" TEXT,
ADD COLUMN     "employeeId" TEXT,
ADD COLUMN     "gender" TEXT,
ADD COLUMN     "joiningDate" DATE,
ADD COLUMN     "parentId" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "relationship" TEXT,
ADD COLUMN     "rollNumber" TEXT;

-- CreateIndex
CREATE INDEX "User_parentId_idx" ON "User"("parentId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
