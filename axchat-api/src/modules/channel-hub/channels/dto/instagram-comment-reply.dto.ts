import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class InstagramCommentReplyDto {
  @ApiProperty({
    description:
      'ID do comentário a responder. Vem do webhook e fica em Message.metadata.comment.commentId',
  })
  @IsString()
  commentId: string;

  /** A Meta corta comentários em 2200 caracteres. */
  @ApiProperty({ description: 'Texto da resposta pública' })
  @IsString()
  @MinLength(1)
  @MaxLength(2200)
  message: string;
}
