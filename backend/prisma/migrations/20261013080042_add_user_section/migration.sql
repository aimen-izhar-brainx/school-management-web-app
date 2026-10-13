-- AlterTable
ALTER TABLE "User" ADD COLUMN     "sectionId" TEXT;

-- CreateIndex
CREATE INDEX "User_sectionId_idx" ON "User"("sectionId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE SET NULL ON UPDATE CASCADE;
