import { Type } from 'class-transformer';
import {
  IsArray,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CreateClassDto {
  @IsString()
  @MinLength(4)
  name!: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSectionInput)
  sections?: CreateSectionInput[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSubjectAssignmentInput)
  subjects?: CreateSubjectAssignmentInput[];
}

export class CreateSectionInput {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  classTeacherId?: string;
}

export class CreateSubjectAssignmentInput {
  @IsString()
  @MinLength(1)
  subject!: string;

  @IsOptional()
  @IsString()
  teacherId?: string;
}

export class UpdateSectionDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  classTeacherId?: string | null;
}
