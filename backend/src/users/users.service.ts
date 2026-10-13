import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Role, User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

const USER_NOT_FOUND = 'This user no longer exists.';
const NOT_A_STUDENT = 'Please choose a valid student.';
const SECTION_GONE = 'This section no longer exists.';
const USER_LIST_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  sectionId: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  create(data: { name: string; email: string; passwordHash: string; role: Role }): Promise<User> {
    return this.prisma.user.create({ data: { ...data, email: data.email.trim().toLowerCase() } });
  }

  // Explicit select: never expose passwordHash or other secrets.
  listByRole(role: Role) {
    return this.prisma.user.findMany({
      where: { role },
      select: USER_LIST_SELECT,
      orderBy: { name: 'asc' },
    });
  }

  async isTeacher(id: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { id }, select: { role: true } });
    return user?.role === 'teacher';
  }

  async setSection(id: string, sectionId: string | null) {
    await this.assertStudent(id);
    if (sectionId !== null) await this.assertSectionExists(sectionId);
    try {
      return await this.prisma.user.update({
        where: { id },
        data: { sectionId },
        select: USER_LIST_SELECT,
      });
    } catch (e) {
      throw this.translateAssignError(e);
    }
  }

  private async assertStudent(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { role: true },
    });
    if (!user) throw new NotFoundException(USER_NOT_FOUND);
    if (user.role !== 'student') throw new BadRequestException(NOT_A_STUDENT);
  }

  private async assertSectionExists(id: string) {
    const found = await this.prisma.section.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!found) throw new NotFoundException(SECTION_GONE);
  }

  // P2003 = FK violation (section deleted mid-request), P2025 = user deleted mid-request.
  private translateAssignError(e: unknown): unknown {
    const code = (e as { code?: string })?.code;
    if (code === 'P2003') return new NotFoundException(SECTION_GONE);
    if (code === 'P2025') return new NotFoundException(USER_NOT_FOUND);
    return e;
  }
}
