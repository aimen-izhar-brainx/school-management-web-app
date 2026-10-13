import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

const DUPLICATE = 'A class with this name already exists.';
const NOT_FOUND = 'This class no longer exists.';

@Injectable()
export class ClassesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.class.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  async create(name: string) {
    await this.assertNameFree(name);
    try {
      return await this.prisma.class.create({ data: { name }, select: { id: true, name: true } });
    } catch (e) {
      throw this.translate(e);
    }
  }

  async rename(id: string, name: string) {
    await this.assertExists(id);
    await this.assertNameFree(name, id);
    try {
      return await this.prisma.class.update({
        where: { id },
        data: { name },
        select: { id: true, name: true },
      });
    } catch (e) {
      throw this.translate(e);
    }
  }

  async remove(id: string) {
    try {
      await this.prisma.class.delete({ where: { id } });
    } catch (e) {
      throw this.translate(e);
    }
  }

  private async assertExists(id: string) {
    const found = await this.prisma.class.findUnique({ where: { id }, select: { id: true } });
    if (!found) throw new NotFoundException(NOT_FOUND);
  }

  private async assertNameFree(name: string, exceptId?: string) {
    const clash = await this.prisma.class.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (clash) throw new BadRequestException(DUPLICATE);
  }

  // P2002 = unique violation (race fallback), P2025 = record not found.
  private translate(e: unknown): unknown {
    const code = (e as { code?: string })?.code;
    if (code === 'P2002') return new BadRequestException(DUPLICATE);
    if (code === 'P2025') return new NotFoundException(NOT_FOUND);
    return e;
  }
}
