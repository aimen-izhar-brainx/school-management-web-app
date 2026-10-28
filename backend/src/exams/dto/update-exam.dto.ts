import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Class and subject are fixed once an exam exists: marks belong to that class's roster. */
export class UpdateExamDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Exam name is required.' })
  @MaxLength(100)
  name!: string;

  @Matches(DATE_PATTERN, { message: 'date must be in YYYY-MM-DD format.' })
  date!: string;

  @IsInt({ message: 'totalMarks must be a whole number.' })
  @Min(1, { message: 'totalMarks must be above 0.' })
  @Max(1000)
  totalMarks!: number;
}
