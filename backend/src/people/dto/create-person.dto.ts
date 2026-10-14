import { IsEmail, IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { PersonFieldsDto, trim } from './person-fields.dto.js';

export const MANAGED_ROLES = ['teacher', 'student', 'parent'] as const;
export type ManagedRole = (typeof MANAGED_ROLES)[number];

export class CreatePersonDto extends PersonFieldsDto {
  @IsIn(MANAGED_ROLES, { message: 'role must be teacher, student or parent.' })
  role!: ManagedRole;

  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'name must not be empty.' })
  @MaxLength(100)
  name!: string;

  @Transform(trim)
  @IsEmail({}, { message: 'email must be a valid email address.' })
  @MaxLength(254)
  email!: string;
}
