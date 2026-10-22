import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateClassDto {
  @IsOptional()
  @IsString()
  @MinLength(4)
  name?: string;
}
