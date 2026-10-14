import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsString, ValidateNested } from 'class-validator';
import { AttendanceStatus } from '../../generated/prisma/enums.js';

export class AttendanceEntryDto {
  @IsString({ message: 'Each entry needs a studentId.' })
  studentId!: string;

  @IsEnum(AttendanceStatus, { message: 'status must be one of present, absent, leave.' })
  status!: AttendanceStatus;
}

export class SubmitAttendanceDto {
  // No minimum size here: an empty roster is a legitimate (if unusual) section, and letting an
  // empty array through keeps section-existence/ownership checks (404/403) first in the service.
  @IsArray({ message: 'entries must be an array.' })
  @ValidateNested({ each: true })
  @Type(() => AttendanceEntryDto)
  entries!: AttendanceEntryDto[];
}
