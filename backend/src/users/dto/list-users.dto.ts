import { IsIn } from 'class-validator';

export const LISTABLE_ROLES = ['teacher', 'student'] as const;

export class ListUsersDto {
  @IsIn(LISTABLE_ROLES, { message: 'role must be teacher or student.' })
  role!: (typeof LISTABLE_ROLES)[number];
}
