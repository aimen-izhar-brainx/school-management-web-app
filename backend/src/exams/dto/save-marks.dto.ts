import { IsObject, Validate } from 'class-validator';
import type {
  ValidationArguments,
  ValidatorConstraintInterface,
} from 'class-validator';
import { ValidatorConstraint } from 'class-validator';

export const MAX_MARK_ENTRIES = 500;

@ValidatorConstraint({ name: 'markEntries', async: false })
class MarkEntriesConstraint implements ValidatorConstraintInterface {
  validate(value: unknown) {
    if (typeof value !== 'object' || value === null) return false;
    const values = Object.values(value);
    return (
      values.length <= MAX_MARK_ENTRIES &&
      values.every((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0)
    );
  }

  defaultMessage(args: ValidationArguments) {
    return `${args.property} must have at most ${MAX_MARK_ENTRIES} entries, each a non-negative number`;
  }
}

export class SaveMarksDto {
  @IsObject()
  @Validate(MarkEntriesConstraint)
  entries!: Record<string, number>;
}
