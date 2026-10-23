-- CreateEnum
CREATE TYPE "NoticeAudience" AS ENUM ('all', 'admin', 'teacher', 'student', 'parent');

-- CreateTable
CREATE TABLE "Notice" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "audience" "NoticeAudience" NOT NULL DEFAULT 'all',
    "postedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notice_audience_createdAt_idx" ON "Notice"("audience", "createdAt");

-- CreateIndex
CREATE INDEX "Notice_postedById_idx" ON "Notice"("postedById");

-- AddForeignKey
ALTER TABLE "Notice" ADD CONSTRAINT "Notice_postedById_fkey" FOREIGN KEY ("postedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
