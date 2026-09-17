import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  ALLERGENS,
  DIETS,
  type Allergen,
  type Diet,
} from '../../common/enums.js';

export class WeightsDto {
  @ApiProperty({ minimum: 0, maximum: 100, example: 30 })
  @IsInt()
  @Min(0)
  @Max(100)
  nutrition!: number;

  @ApiProperty({ minimum: 0, maximum: 100, example: 25 })
  @IsInt()
  @Min(0)
  @Max(100)
  price!: number;

  @ApiProperty({ minimum: 0, maximum: 100, example: 20 })
  @IsInt()
  @Min(0)
  @Max(100)
  processing!: number;

  @ApiProperty({ minimum: 0, maximum: 100, example: 15 })
  @IsInt()
  @Min(0)
  @Max(100)
  environment!: number;

  @ApiProperty({ minimum: 0, maximum: 100, example: 10 })
  @IsInt()
  @Min(0)
  @Max(100)
  availability!: number;
}

export class UpdatePreferencesDto {
  @ApiProperty({ type: WeightsDto })
  @ValidateNested()
  @Type(() => WeightsDto)
  weights!: WeightsDto;

  @ApiProperty({ enum: DIETS, isArray: true, example: ['gluten_free'] })
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(DIETS.length)
  @IsIn(DIETS, { each: true })
  diets!: Diet[];

  @ApiProperty({ enum: ALLERGENS, isArray: true, example: ['peanuts'] })
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(ALLERGENS.length)
  @IsIn(ALLERGENS, { each: true })
  excludedAllergens!: Allergen[];

  @ApiProperty({
    description: 'Excluir productos con sellos ALTO EN (Ley 20.606)',
  })
  @IsBoolean()
  avoidHighIn!: boolean;

  @ApiProperty({ type: [String], example: ['lider', 'jumbo'] })
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @Matches(/^[a-z0-9-]{2,60}$/, {
    each: true,
    message: 'Tienda con formato inválido',
  })
  preferredStores!: string[];

  @ApiProperty({
    description: 'Si es false se usa la versión base no adaptativa',
  })
  @IsBoolean()
  personalizationEnabled!: boolean;
}
