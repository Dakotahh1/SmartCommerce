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

export const PRODUCT_SORTS = [
  'relevance',
  'quality',
  'name',
  'recent',
] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

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
  // Sin caracteres de control ni U+FFFD (texto mal codificado): se rechaza con 400.
  @Matches(/^[^\p{Cc}\uFFFD]*$/u, {
    message: 'q contiene caracteres no válidos',
  })
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
    enum: PRODUCT_SORTS,
    description:
      'Orden de resultados. Por defecto `relevance` si hay texto (`q`) y `quality` si no.',
  })
  @IsOptional()
  @IsIn(PRODUCT_SORTS)
  sort?: ProductSort;
}
