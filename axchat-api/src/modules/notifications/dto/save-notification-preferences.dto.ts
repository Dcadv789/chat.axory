import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  Matches,
  ValidateNested,
} from 'class-validator';
import { NotificationType } from '@prisma/client';

/** Horário no formato HH:mm (24h), como o <input type="time"> do front manda. */
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class NotificationPreferenceItemDto {
  @IsEnum(NotificationType)
  type!: NotificationType;

  @IsBoolean()
  inApp!: boolean;

  @IsBoolean()
  browserPush!: boolean;

  @IsBoolean()
  sound!: boolean;
}

export class SaveNotificationPreferencesDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => NotificationPreferenceItemDto)
  preferences!: NotificationPreferenceItemDto[];

  /** Quando false (ou ausente), o "Não perturbe" é gravado como desligado. */
  @IsBoolean()
  @IsOptional()
  dndEnabled?: boolean;

  @Matches(HHMM, { message: 'dndStart deve estar no formato HH:mm' })
  @IsOptional()
  dndStart?: string;

  @Matches(HHMM, { message: 'dndEnd deve estar no formato HH:mm' })
  @IsOptional()
  dndEnd?: string;
}
