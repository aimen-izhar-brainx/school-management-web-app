import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { PersonFieldsDto, trim } from './person-fields.dto.js';

export class UpdatePersonDto extends PersonFieldsDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'name must not be empty.' })
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @Transform(trim)
  @IsEmail({}, { message: 'email must be a valid email address.' })
  @MaxLength(254)
  email?: string;
}
