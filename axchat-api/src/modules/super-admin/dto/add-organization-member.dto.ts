import { OrgRole } from '@prisma/client';
import { IsEmail, IsEnum } from 'class-validator';

export class AddOrganizationMemberDto {
  @IsEmail()
  email!: string;

  @IsEnum(OrgRole)
  role!: OrgRole;
}
