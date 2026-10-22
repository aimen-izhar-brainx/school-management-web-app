import {
  IsDateString,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateTeacherDto {
  @IsString() @IsNotEmpty() name: string;
  @IsEmail() email: string;
  @IsString() @MinLength(8) password: string;
  @IsString() @IsNotEmpty() employeeId: string;
  @IsString() @IsNotEmpty() subject: string;
  @IsOptional() @IsString() gender?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() qualification?: string;
  @IsOptional() @IsDateString() dateOfBirth?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsDateString() joinedAt?: string;
}
