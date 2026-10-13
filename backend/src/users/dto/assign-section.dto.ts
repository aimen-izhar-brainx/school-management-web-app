import { IsString, ValidateIf } from 'class-validator';

export class AssignSectionDto {
  // Explicit null clears the section; a missing key or non-string is rejected.
  @ValidateIf((_, value) => value !== null)
  @IsString({ message: 'sectionId must be a section id or null.' })
  sectionId!: string | null;
}
