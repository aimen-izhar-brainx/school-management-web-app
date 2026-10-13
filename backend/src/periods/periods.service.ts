import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class PeriodsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.period.findMany({
      orderBy: { order: 'asc' },
      select: { id: true, order: true, label: true, startTime: true, endTime: true, isBreak: true },
    });
  }
}
