import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateNoticeDto {
  @Transform(trim)
  @IsString({ message: 'Please enter a title.' })
  @IsNotEmpty({ message: 'Please enter a title.' })
  @MaxLength(150, { message: 'Title must be 150 characters or fewer.' })
  title!: string;

  @Transform(trim)
  @IsString({ message: 'Please enter a description.' })
  @IsNotEmpty({ message: 'Please enter a description.' })
  @MaxLength(5000, { message: 'Description must be 5000 characters or fewer.' })
  description!: string;

  /** Target class; omit or send null for a school-wide notice. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString({ message: 'Please choose a valid class.' })
  classId?: string | null;
}
