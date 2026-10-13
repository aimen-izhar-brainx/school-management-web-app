import 'dotenv/config';
import bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { FIXED_PERIODS } from './periods.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const TEST_USERS = [
  { name: 'Test Admin', email: 'admin@brainxschool.com', password: 'Admin123!', role: 'admin' as const },
  { name: 'Test Admin', email: 'admin@mailinator.com', password: '1234Five!', role: 'admin' as const },
  { name: 'Test Teacher', email: 'teacher@brainxschool.com', password: 'Teacher123!', role: 'teacher' as const },
  { name: 'Test Student', email: 'student@brainxschool.com', password: 'Student123!', role: 'student' as const },
  { name: 'Test Parent', email: 'parent@brainxschool.com', password: 'Parent123!', role: 'parent' as const },
];

async function main() {
  for (const user of TEST_USERS) {
    const passwordHash = await bcrypt.hash(user.password, 12);
    await prisma.user.upsert({
      where: { email: user.email },
      update: { passwordHash, name: user.name, role: user.role },
      create: { name: user.name, email: user.email, passwordHash, role: user.role },
    });
    console.log(`Seeded ${user.role} account: ${user.email} / ${user.password}`);
  }

  for (const { id, ...period } of FIXED_PERIODS) {
    await prisma.period.upsert({
      where: { order: period.order },
      update: period,
      create: { id, ...period },
    });
  }
  console.log(`Seeded ${FIXED_PERIODS.length} fixed periods`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
