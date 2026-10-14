import {
  BadRequestException, ConflictException, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import bcrypt from 'bcrypt';
import { generateRawToken, hashToken } from '../auth/security.util.js';
import { MailService } from '../mail/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { prismaErrorCode, violatedConstraintFields } from '../common/prisma-errors.js';
import type { Prisma, Role } from '../generated/prisma/client.js';
import type { CreatePersonDto, ManagedRole } from './dto/create-person.dto.js';
import type { PersonFieldsDto } from './dto/person-fields.dto.js';
import type { UpdatePersonDto } from './dto/update-person.dto.js';

const INVITE_TTL_DAYS = 7;
const MAX_LIST_ROWS = 500;
const PERSON_GONE = 'This person no longer exists.';
const EMAIL_TAKEN = 'An account with this email already exists.';
const EMPLOYEE_ID_TAKEN = 'This employee ID is already assigned to someone else.';
const ROLL_NUMBER_TAKEN = 'This roll number is already assigned in this section.';
const SECTION_GONE = 'This section no longer exists.';
const NOT_A_PARENT = 'Please choose a valid parent.';
const NOT_A_STUDENT = 'Please choose a valid student.';
const TEACHER_IN_USE =
  'This teacher is still scheduled on the timetable. Remove their timetable entries first.';

type ProfileField = Exclude<keyof PersonFieldsDto, 'sectionId' | 'parentId' | 'studentIds'>;
type ProfileData = Partial<Prisma.UserUncheckedCreateInput>;

const DATE_FIELDS: readonly ProfileField[] = ['joiningDate', 'dateOfBirth', 'admissionDate'];
// Profile fields that make sense per role; anything else in the payload is dropped.
const ROLE_FIELDS: Record<ManagedRole, readonly ProfileField[]> = {
  teacher: ['phone', 'gender', 'address', 'employeeId', 'department', 'joiningDate'],
  student: ['phone', 'gender', 'address', 'rollNumber', 'dateOfBirth', 'admissionDate'],
  parent: ['phone', 'gender', 'address', 'relationship'],
};

const PERSON_SELECT = {
  id: true, name: true, email: true, role: true,
  phone: true, gender: true, address: true,
  employeeId: true, department: true, joiningDate: true,
  dateOfBirth: true, admissionDate: true, rollNumber: true,
  relationship: true, sectionId: true,
  section: { select: { id: true, name: true, class: { select: { name: true } } } },
  parent: { select: { id: true, name: true } },
  children: { select: { id: true, name: true }, orderBy: { name: 'asc' } },
} satisfies Prisma.UserSelect;

type PersonRow = Prisma.UserGetPayload<{ select: typeof PERSON_SELECT }>;

const toDay = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

function present(row: PersonRow) {
  const { section, joiningDate, dateOfBirth, admissionDate, ...rest } = row;
  return {
    ...rest,
    joiningDate: toDay(joiningDate),
    dateOfBirth: toDay(dateOfBirth),
    admissionDate: toDay(admissionDate),
    section: section ? { id: section.id, name: section.name, className: section.class.name } : null,
  };
}

@Injectable()
export class PeopleService {
  private readonly logger = new Logger(PeopleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  async list(role: ManagedRole) {
    const rows = await this.prisma.user.findMany({
      where: { role },
      select: PERSON_SELECT,
      orderBy: { name: 'asc' },
      take: MAX_LIST_ROWS,
    });
    return rows.map(present);
  }

  async create(dto: CreatePersonDto) {
    const role = dto.role;
    const data = this.profileData(role, dto);
    await this.assertLinks(role, dto);

    // Unusable password: hash of a random secret that is never disclosed, so the invite link is the only way in.
    const passwordHash = await bcrypt.hash(generateRawToken(), 12);
    const inviteToken = generateRawToken();

    let id: string;
    try {
      id = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            ...data,
            name: dto.name,
            email: dto.email.toLowerCase(),
            role,
            passwordHash,
            ...(role === 'student' ? this.studentLinks(dto) : {}),
          },
          select: { id: true },
        });
        if (role === 'parent' && dto.studentIds?.length) {
          await tx.user.updateMany({
            where: { id: { in: dto.studentIds }, role: 'student' },
            data: { parentId: created.id },
          });
        }
        await tx.passwordResetToken.create({
          data: {
            tokenHash: hashToken(inviteToken),
            userId: created.id,
            expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000),
          },
        });
        return created.id;
      });
    } catch (e) {
      throw this.translate(e);
    }

    this.sendInvite(dto.email.toLowerCase(), dto.name, inviteToken);
    return this.get(id);
  }

  async update(id: string, dto: UpdatePersonDto) {
    const existing = await this.findManaged(id);
    const role = existing.role as ManagedRole;
    const data: ProfileData = this.profileData(role, dto);

    if (dto.name !== undefined) data.name = dto.name;
    if (dto.email !== undefined) data.email = dto.email.toLowerCase();
    if (role === 'student') Object.assign(data, this.studentLinks(dto));
    await this.assertLinks(role, dto);

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id }, data });
        if (role === 'parent' && dto.studentIds) {
          await tx.user.updateMany({
            where: { parentId: id, id: { notIn: dto.studentIds } },
            data: { parentId: null },
          });
          await tx.user.updateMany({
            where: { id: { in: dto.studentIds }, role: 'student' },
            data: { parentId: id },
          });
        }
      });
    } catch (e) {
      throw this.translate(e);
    }
    return this.get(id);
  }

  async remove(id: string): Promise<void> {
    await this.findManaged(id);
    try {
      await this.prisma.user.delete({ where: { id } });
    } catch (e) {
      throw this.translate(e);
    }
  }

  async resendInvite(id: string): Promise<void> {
    const user = await this.findManaged(id);
    const inviteToken = generateRawToken();
    await this.prisma.$transaction([
      this.prisma.passwordResetToken.updateMany({
        where: { userId: id, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.passwordResetToken.create({
        data: {
          tokenHash: hashToken(inviteToken),
          userId: id,
          expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000),
        },
      }),
    ]);
    this.sendInvite(user.email, user.name, inviteToken);
  }

  private async get(id: string) {
    const row = await this.prisma.user.findUnique({ where: { id }, select: PERSON_SELECT });
    if (!row) throw new NotFoundException(PERSON_GONE);
    return present(row);
  }

  // Admins are not managed here, so they are reported as missing rather than leaking their existence.
  private async findManaged(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, role: true },
    });
    if (!user || user.role === 'admin') throw new NotFoundException(PERSON_GONE);
    return user as typeof user & { role: Exclude<Role, 'admin'> };
  }

  /** Only the fields relevant to the role; empty strings are stored as null. */
  private profileData(role: ManagedRole, dto: PersonFieldsDto): ProfileData {
    const data: Record<string, unknown> = {};
    for (const field of ROLE_FIELDS[role]) {
      const value = dto[field];
      if (value === undefined) continue;
      const empty = value === null || value === '';
      data[field] = empty
        ? null
        : DATE_FIELDS.includes(field)
          ? new Date(value as string)
          : value;
    }
    return data as ProfileData;
  }

  private studentLinks(dto: PersonFieldsDto): ProfileData {
    const links: ProfileData = {};
    if (dto.sectionId !== undefined) links.sectionId = dto.sectionId || null;
    if (dto.parentId !== undefined) links.parentId = dto.parentId || null;
    return links;
  }

  private async assertLinks(role: ManagedRole, dto: PersonFieldsDto) {
    if (role === 'student') {
      if (dto.sectionId) {
        const section = await this.prisma.section.findUnique({
          where: { id: dto.sectionId }, select: { id: true },
        });
        if (!section) throw new NotFoundException(SECTION_GONE);
      }
      if (dto.parentId) {
        const parent = await this.prisma.user.findUnique({
          where: { id: dto.parentId }, select: { role: true },
        });
        if (parent?.role !== 'parent') throw new BadRequestException(NOT_A_PARENT);
      }
    }
    if (role === 'parent' && dto.studentIds?.length) {
      const ids = [...new Set(dto.studentIds)];
      const count = await this.prisma.user.count({ where: { id: { in: ids }, role: 'student' } });
      if (count !== ids.length) throw new BadRequestException(NOT_A_STUDENT);
    }
  }

  private sendInvite(email: string, name: string, token: string) {
    // Don't hold the response open for SMTP; the admin can resend from the list.
    void this.mail.sendInviteEmail(email, name, token).catch((error: unknown) => {
      this.logger.error(`Failed to send invite email to ${email}`, error);
    });
  }

  private translate(e: unknown): unknown {
    const code = prismaErrorCode(e);
    if (code === 'P2002') {
      const fields = violatedConstraintFields(e);
      if (fields?.includes('email')) return new ConflictException(EMAIL_TAKEN);
      if (fields?.includes('employeeId')) return new ConflictException(EMPLOYEE_ID_TAKEN);
      if (fields?.includes('rollNumber')) return new ConflictException(ROLL_NUMBER_TAKEN);
    }
    if (code === 'P2025') return new NotFoundException(PERSON_GONE);
    if (code === 'P2003') return new ConflictException(TEACHER_IN_USE);
    return e;
  }
}
