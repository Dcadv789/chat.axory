import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateOrganizationAdminDto {
  @IsString()
  organizationName!: string;

  @IsString()
  @IsOptional()
  slug?: string;

  @IsString()
  @IsOptional()
  plan?: string;

  @IsString()
  ownerName!: string;

  @IsEmail()
  ownerEmail!: string;

  @IsString()
  @MinLength(8)
  ownerPassword!: string;
}
