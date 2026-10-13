import { IsString, ValidateIf } from 'class-validator';

export class ClassTeacherDto {
  @ValidateIf((_, value) => value !== null)
  @IsString({ message: 'Please choose a teacher or send null to clear.' })
  teacherId!: string | null;
}
