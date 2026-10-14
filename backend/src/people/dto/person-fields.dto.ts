import { IsArray, IsDateString, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export const GENDERS = ['Male', 'Female', 'Other'] as const;
export const RELATIONSHIPS = ['Father', 'Mother', 'Guardian'] as const;

export const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/**
 * Every optional field accepts `null` (IsOptional skips null and undefined), which clears it on update.
 * Fields that do not apply to the person's role are ignored by PeopleService.
 * name and email live on the Create/Update subclasses because they are required on one and optional on the other.
 */
export class PersonFieldsDto {
  @IsOptional() @Transform(trim) @IsString() @MaxLength(30) phone?: string | null;
  @IsOptional() @IsIn(GENDERS, { message: 'gender must be Male, Female or Other.' }) gender?: string | null;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(300) address?: string | null;

  // Teacher
  @IsOptional() @Transform(trim) @IsString() @MaxLength(50) employeeId?: string | null;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) department?: string | null;
  @IsOptional() @IsDateString({ strict: true }, { message: 'joiningDate must be a valid date.' }) joiningDate?: string | null;

  // Student
  @IsOptional() @IsDateString({ strict: true }, { message: 'dateOfBirth must be a valid date.' }) dateOfBirth?: string | null;
  @IsOptional() @IsDateString({ strict: true }, { message: 'admissionDate must be a valid date.' }) admissionDate?: string | null;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(50) rollNumber?: string | null;
  @IsOptional() @IsString() sectionId?: string | null;
  @IsOptional() @IsString() parentId?: string | null;

  // Parent
  @IsOptional() @IsIn(RELATIONSHIPS, { message: 'relationship must be Father, Mother or Guardian.' }) relationship?: string | null;
  @IsOptional() @IsArray() @IsString({ each: true }) studentIds?: string[];
}
