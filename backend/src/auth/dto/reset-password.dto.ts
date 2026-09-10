import { IsString, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  token!: string;

  // bcrypt silently truncates input past 72 bytes, so anything longer wouldn't be fully verified.
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;
}
