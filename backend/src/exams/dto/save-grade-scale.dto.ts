import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class GradeBandDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Grade name is required.' })
  @MaxLength(10)
  grade!: string;

  @IsNumber({}, { message: 'minPercent must be a number.' })
  @Min(0)
  @Max(100)
  minPercent!: number;
}

export class SaveGradeScaleDto {
  @IsArray()
  @ArrayMinSize(2, { message: 'A grade scale needs at least two grades.' })
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => GradeBandDto)
  scale!: GradeBandDto[];
}
