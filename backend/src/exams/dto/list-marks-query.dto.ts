import { IsNotEmpty, IsString } from 'class-validator';

export class ListMarksQueryDto {
  @IsString()
  @IsNotEmpty()
  sectionId!: string;
}
