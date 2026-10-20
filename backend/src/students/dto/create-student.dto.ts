import { IsDateString, IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateStudentDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  @MinLength(1)
  rollNumber!: string;

  @IsString()
  @MinLength(1)
  grade!: string;

  @IsOptional()
  @IsString()
  section?: string;

  @IsOptional()
  @IsString()
  gender?: string;

  @IsString()
  @MinLength(1)
  guardianName!: string;

  @IsString()
  @MinLength(1)
  guardianPhone!: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  address?: string;
}
