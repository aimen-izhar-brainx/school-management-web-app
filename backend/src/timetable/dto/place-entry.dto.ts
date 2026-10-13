import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString } from 'class-validator';

const MESSAGE = 'Please choose a subject.';

export class PlaceEntryDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: MESSAGE })
  @IsNotEmpty({ message: MESSAGE })
  subjectId!: string;
}
