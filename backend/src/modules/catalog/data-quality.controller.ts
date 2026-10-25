import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { RequestId, Roles } from '../../common/auth.decorators.js';
import { Role } from '../../common/enums.js';
import { DataQualityService } from './data-quality.service.js';

export class DataQualityQueryDto {
  @ApiPropertyOptional({
    default: 30,
    minimum: 1,
    maximum: 365,
    type: 'integer',
    description: 'Ventana (días) de ingestas consideradas',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days = 30;
}

@ApiTags('admin · calidad de datos')
@ApiBearerAuth()
@ApiForbiddenResponse({ description: 'Requiere rol admin u operator' })
@Roles(Role.ADMIN, Role.OPERATOR)
@Controller({ path: 'admin/data-quality', version: '1' })
export class DataQualityController {
  constructor(private readonly quality: DataQualityService) {}

  @Get()
  @ApiOperation({
    summary:
      'Métricas de calidad de la información recuperada: validez, duplicados, cobertura, actualidad, errores y tiempos',
  })
  @ApiOkResponse({ description: 'Reporte de calidad con alertas' })
  report(@Query() query: DataQualityQueryDto, @RequestId() requestId: string) {
    return this.quality.report(query.days, requestId);
  }
}
