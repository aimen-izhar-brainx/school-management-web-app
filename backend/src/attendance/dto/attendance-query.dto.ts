import { IsNotEmpty, IsString, Matches } from 'class-validator';
import { DATE_PATTERN } from './submit-attendance.dto.js';

export class SectionDayQueryDto {
  @IsString()
  @IsNotEmpty()
  sectionId!: string;

  @Matches(DATE_PATTERN, { message: 'date must be in YYYY-MM-DD format.' })
  date!: string;
}

export class MonthQueryDto {
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'month must be in YYYY-MM format.',
  })
  month!: string;
}

export class DateQueryDto {
  @Matches(DATE_PATTERN, { message: 'date must be in YYYY-MM-DD format.' })
  date!: string;
}
