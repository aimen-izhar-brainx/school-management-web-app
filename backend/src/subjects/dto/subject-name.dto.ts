import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

const EMPTY_MESSAGE = 'Please enter a subject name.';

export class SubjectNameDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: EMPTY_MESSAGE })
  @IsNotEmpty({ message: EMPTY_MESSAGE })
  @MaxLength(100, { message: 'Subject name must be 100 characters or fewer.' })
  name!: string;
}
