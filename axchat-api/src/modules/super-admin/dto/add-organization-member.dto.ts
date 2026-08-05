import { OrgRole } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class AddOrganizationMemberDto {
  @IsEmail()
  email!: string;

  @IsEnum(OrgRole)
  role!: OrgRole;

  /**
   * Nome de quem ainda NÃO tem conta. Quando o email não existe, o usuário é
   * criado com este nome e uma senha temporária. Se o email já existe o nome é
   * ignorado — não sobrescrevemos o nome de quem já usa o sistema.
   */
  @IsString()
  @MinLength(2)
  @IsOptional()
  name?: string;
}
