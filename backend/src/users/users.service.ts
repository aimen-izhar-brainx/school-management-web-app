import { Injectable } from '@nestjs/common';
import type { Role, User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

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
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: 'asc' },
    });
  }
}
