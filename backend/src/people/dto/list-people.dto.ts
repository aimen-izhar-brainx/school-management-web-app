import { IsIn } from 'class-validator';
import { MANAGED_ROLES, type ManagedRole } from './create-person.dto.js';

export class ListPeopleDto {
  @IsIn(MANAGED_ROLES, { message: 'role must be teacher, student or parent.' })
  role!: ManagedRole;
}
