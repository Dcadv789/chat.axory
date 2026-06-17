import { IsString } from 'class-validator';

export class SuspendOrganizationDto {
  @IsString()
  reason!: string;
}
