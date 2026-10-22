import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { StudentsService } from './students.service.js';

const baseDto = {
  name: 'Sam Student',
  email: 'sam@example.com',
  password: 'Str0ng!Passw0rd',
  rollNumber: 'R-1',
  guardianName: 'Pat Parent',
  guardianPhone: '555-0100',
};

describe('StudentsService sections', () => {
  const prisma = {
    user: { findUnique: vi.fn() },
    student: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    section: { findUnique: vi.fn() },
  };
  let service: StudentsService;

  beforeEach(() => {
    vi.resetAllMocks();
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.student.findUnique.mockResolvedValue(null);
    prisma.student.create.mockResolvedValue({ id: 's1' });
    service = new StudentsService(prisma as unknown as PrismaService);
  });

  it('connects the section', async () => {
    prisma.section.findUnique.mockResolvedValue({
      id: 'sec-1',
      schoolClass: { name: 'Grade 5' },
    });
    await service.create({ ...baseDto, sectionId: 'sec-1' });
    const { data } = prisma.student.create.mock.calls[0][0];
    expect(data.section).toEqual({ connect: { id: 'sec-1' } });
  });

  it('rejects an unknown sectionId', async () => {
    prisma.section.findUnique.mockResolvedValue(null);
    await expect(
      service.create({ ...baseDto, sectionId: 'missing' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.student.create).not.toHaveBeenCalled();
  });

  it('updates the section', async () => {
    prisma.student.findUnique.mockResolvedValueOnce({
      id: 's1',
      rollNumber: 'R-1',
      user: { email: 'sam@example.com' },
    });
    prisma.section.findUnique.mockResolvedValue({
      id: 'sec-2',
      schoolClass: { name: 'Grade 6' },
    });
    prisma.student.update.mockResolvedValue({ id: 's1' });
    await service.update('s1', { sectionId: 'sec-2' });
    const { data } = prisma.student.update.mock.calls[0][0];
    expect(data.section).toEqual({ connect: { id: 'sec-2' } });
  });
});
