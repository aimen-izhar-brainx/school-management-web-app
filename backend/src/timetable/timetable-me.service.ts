import { ForbiddenException, Injectable } from '@nestjs/common';
import type { Role } from '../generated/prisma/client.js';
import { PeriodsService } from '../periods/periods.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ENTRY_BASE_SELECT, ENTRY_ORDER_BY } from './entry-select.js';
import { TimetableService } from './timetable.service.js';

@Injectable()
export class TimetableMeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly periods: PeriodsService,
    private readonly timetable: TimetableService,
  ) {}

  async getMine(userId: string, role: Role) {
    if (role === 'teacher') return this.forTeacher(userId);
    if (role === 'student') return this.forStudent(userId);
    throw new ForbiddenException();
  }

  private async forTeacher(teacherId: string) {
    const [periods, rows] = await Promise.all([
      this.periods.list(),
      this.prisma.timetableEntry.findMany({
        where: { teacherId },
        select: {
          ...ENTRY_BASE_SELECT,
          section: {
            select: {
              id: true,
              name: true,
              class: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: [...ENTRY_ORDER_BY],
      }),
    ]);
    const entries = rows.map(({ section, ...entry }) => ({
      ...entry,
      section: { id: section.id, name: section.name },
      class: section.class,
    }));
    return { kind: 'teacher' as const, periods, entries };
  }

  private async forStudent(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        section: {
          select: { id: true, name: true, class: { select: { name: true } } },
        },
      },
    });
    if (!user?.section) {
      return {
        kind: 'student' as const,
        section: null,
        periods: await this.periods.list(),
        entries: [],
      };
    }
    const { id, name, class: klass } = user.section;
    const { periods, entries } = await this.timetable.gridFor(id);
    return {
      kind: 'student' as const,
      section: { id, name, className: klass.name },
      periods,
      entries,
    };
  }
}
