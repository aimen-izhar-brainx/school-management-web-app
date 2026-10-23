import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';
import { AttendanceStatus } from '../../generated/prisma/enums.js';

export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class AttendanceEntryDto {
  @IsString()
  @IsNotEmpty()
  studentId!: string;

  @IsEnum(AttendanceStatus)
  status!: AttendanceStatus;
}

export class SubmitAttendanceDto {
  @IsString()
  @IsNotEmpty()
  sectionId!: string;

  @Matches(DATE_PATTERN, { message: 'date must be in YYYY-MM-DD format.' })
  date!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AttendanceEntryDto)
  records!: AttendanceEntryDto[];
}

export class UpdateRecordDto {
  @IsEnum(AttendanceStatus)
  status!: AttendanceStatus;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
