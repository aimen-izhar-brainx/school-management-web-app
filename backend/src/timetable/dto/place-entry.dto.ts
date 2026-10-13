import { Transform } from 'class-transformer';
import { Matches } from 'class-validator';

export class PlaceEntryDto {
  // One validator only, so a missing value yields a single message. Non-strings and blanks fail too.
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @Matches(/\S/, { message: 'subjectId is required.' })
  subjectId!: string;
}
