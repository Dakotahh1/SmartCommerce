import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  ALLERGENS,
  GRADES,
  type Allergen,
  type Grade,
} from '../../common/enums.js';
import { PaginationQueryDto } from '../../common/pagination.js';

const csv = ({ value }: { value: unknown }) =>
  typeof value === 'string'
    ? value
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
    : value;

export class ProductQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Texto a buscar en nombre y marca',
    example: 'avena',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({
    description: 'Slug de categoría',
    example: 'breakfast-cereals',
  })
  @IsOptional()
  @Matches(/^[a-z0-9:-]{2,120}$/)
  category?: string;

  @ApiPropertyOptional({
    description: 'Nutri-Score permitidos (csv)',
    example: 'a,b',
  })
  @IsOptional()
  @Transform(csv)
  @ArrayMaxSize(5)
  @IsIn(GRADES, { each: true })
  nutriscore?: Grade[];

  @ApiPropertyOptional({
    description: 'Grupo NOVA máximo',
    minimum: 1,
    maximum: 4,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(4)
  maxNova?: number;

  @ApiPropertyOptional({
    description: 'Alérgenos a excluir (csv)',
    example: 'gluten,milk',
  })
  @IsOptional()
  @Transform(csv)
  @ArrayMaxSize(ALLERGENS.length)
  @IsIn(ALLERGENS, { each: true })
  excludeAllergens?: Allergen[];

  @ApiPropertyOptional({
    enum: ['quality', 'name', 'recent'],
    default: 'quality',
  })
  @IsOptional()
  @IsIn(['quality', 'name', 'recent'])
  sort: 'quality' | 'name' | 'recent' = 'quality';
}
