-- CreateTable
CREATE TABLE "GradeBand" (
    "id" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "minPercent" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "GradeBand_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GradeBand_grade_key" ON "GradeBand"("grade");

-- CreateIndex
CREATE UNIQUE INDEX "GradeBand_minPercent_key" ON "GradeBand"("minPercent");

-- Default scale
INSERT INTO "GradeBand" ("id", "grade", "minPercent") VALUES
    ('gradeband_a', 'A', 80),
    ('gradeband_b', 'B', 70),
    ('gradeband_c', 'C', 60),
    ('gradeband_d', 'D', 50),
    ('gradeband_f', 'F', 0);
