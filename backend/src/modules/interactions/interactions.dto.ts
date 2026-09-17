import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { InteractionType } from '../../common/enums.js';

export class InteractionContextDto {
  @ApiPropertyOptional({
    enum: ['home', 'explore', 'detail', 'compare', 'favorites'],
  })
  @IsOptional()
  @IsIn(['home', 'explore', 'detail', 'compare', 'favorites'])
  screen?: string;

  @ApiPropertyOptional({
    description: 'Posición en la lista (para evaluar ranking)',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  position?: number;
}

export class CreateInteractionDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  productId!: string;

  @ApiProperty({ enum: InteractionType })
  @IsEnum(InteractionType)
  type!: InteractionType;

  @ApiPropertyOptional({ type: InteractionContextDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => InteractionContextDto)
  context?: InteractionContextDto;
}
