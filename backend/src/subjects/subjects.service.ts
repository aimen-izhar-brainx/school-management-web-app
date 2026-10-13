import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

const DUPLICATE = 'This subject already exists.';
const IN_USE = "This subject is in use and can't be deleted.";
const NOT_FOUND = 'This subject no longer exists.';
const SELECT = { id: true, name: true } as const;

@Injectable()
export class SubjectsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.subject.findMany({
      select: SELECT,
      orderBy: { name: 'asc' },
    });
  }

  async create(name: string) {
    await this.assertNameFree(name);
    try {
      return await this.prisma.subject.create({
        data: { name },
        select: SELECT,
      });
    } catch (e) {
      throw this.translate(e);
    }
  }

  async rename(id: string, name: string) {
    await this.assertExists(id);
    await this.assertNameFree(name, id);
    try {
      return await this.prisma.subject.update({
        where: { id },
        data: { name },
        select: SELECT,
      });
    } catch (e) {
      throw this.translate(e);
    }
  }

  async remove(id: string) {
    await this.assertExists(id);
    const used = await this.prisma.classSubject.count({
      where: { subjectId: id },
    });
    if (used > 0) throw new BadRequestException(IN_USE);
    try {
      await this.prisma.subject.delete({ where: { id } });
    } catch (e) {
      throw this.translate(e);
    }
  }

  // The name column is citext, so this lookup is case-insensitive.
  private async assertNameFree(name: string, exceptId?: string) {
    const clash = await this.prisma.subject.findUnique({
      where: { name },
      select: { id: true },
    });
    if (clash && clash.id !== exceptId) throw new BadRequestException(DUPLICATE);
  }

  private async assertExists(id: string) {
    const found = await this.prisma.subject.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!found) throw new NotFoundException(NOT_FOUND);
  }

  // P2002 = unique violation, P2003 = FK violation (subject in use), P2025 = not found.
  private translate(e: unknown): unknown {
    const code = (e as { code?: string })?.code;
    if (code === 'P2002') return new BadRequestException(DUPLICATE);
    if (code === 'P2003') return new BadRequestException(IN_USE);
    if (code === 'P2025') return new NotFoundException(NOT_FOUND);
    return e;
  }
}
