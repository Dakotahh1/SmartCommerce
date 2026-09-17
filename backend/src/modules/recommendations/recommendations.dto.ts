import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsOptional,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class RecommendationQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 30, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  limit = 10;

  @ApiPropertyOptional({ example: 'breakfast-cereals' })
  @IsOptional()
  @Matches(/^[a-z0-9:-]{2,120}$/)
  category?: string;
}

export class CompareProductsDto {
  @ApiProperty({ type: [String], format: 'uuid', minItems: 2, maxItems: 4 })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(4)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  productIds!: string[];
}
