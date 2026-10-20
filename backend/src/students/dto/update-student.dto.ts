import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreateStudentDto } from './create-student.dto.js';

export class UpdateStudentDto extends PartialType(OmitType(CreateStudentDto, ['password'] as const)) {}
