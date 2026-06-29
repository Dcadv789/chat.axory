import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class TransferDepartmentDto {
  @ApiProperty({
    description:
      'ID do setor (Department) de destino. A conversa volta à fila desse setor (sem dono, status PENDING).',
  })
  @IsString()
  departmentId!: string;
}
