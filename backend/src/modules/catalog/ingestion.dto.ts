import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Matches, Max, Min } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination.js';

export class StartIngestionDto {
  @ApiPropertyOptional({
    default: 'chile',
    description: 'Etiqueta de país en Open Food Facts',
  })
  @IsOptional()
  @Matches(/^[a-z][a-z-]{1,39}$/)
  country = 'chile';

  @ApiPropertyOptional({ example: 'breakfast-cereals' })
  @IsOptional()
  @Matches(/^[a-z0-9][a-z0-9:-]{1,79}$/)
  category?: string;

  @ApiPropertyOptional({ example: 'quaker' })
  @IsOptional()
  @Matches(/^[a-z0-9][a-z0-9:-]{1,79}$/)
  brand?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1, maximum: 1000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  page = 1;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 50;
}

export class ListIngestionsQueryDto extends PaginationQueryDto {}
