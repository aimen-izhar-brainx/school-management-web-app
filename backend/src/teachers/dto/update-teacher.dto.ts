import { OmitType, PartialType } from '@nestjs/mapped-types';   // or @nestjs/swagger if installed
import { CreateTeacherDto } from './create-teacher.dto.js';

export class UpdateTeacherDto extends PartialType(OmitType(CreateTeacherDto, ['password'] as const)) {}
