import { ForbiddenException } from '@nestjs/common';
import type { PeriodsService } from '../periods/periods.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { TimetableMeService } from './timetable-me.service.js';
import type { TimetableService } from './timetable.service.js';

describe('TimetableMeService.getMine', () => {
  it('rejects roles other than teacher and student', async () => {
    const service = new TimetableMeService(
      {} as PrismaService,
      {} as PeriodsService,
      {} as TimetableService,
    );
    await expect(service.getMine('u1', 'admin' as never)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
