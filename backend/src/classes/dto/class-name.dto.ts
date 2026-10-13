import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

const EMPTY_MESSAGE = 'Please enter a class name.';

export class ClassNameDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: EMPTY_MESSAGE })
  @IsNotEmpty({ message: EMPTY_MESSAGE })
  @MaxLength(100, { message: 'Class name must be 100 characters or fewer.' })
  name!: string;
}
