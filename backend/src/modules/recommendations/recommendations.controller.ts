import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth.decorators.js';
import {
  CurrentUser,
  Public,
  RequestId,
} from '../../common/auth.decorators.js';
import {
  CompareProductsDto,
  RecommendationQueryDto,
} from './recommendations.dto.js';
import { RecommendationsService } from './recommendations.service.js';

@ApiTags('smartmatch')
@Controller({ version: '1' })
export class RecommendationsController {
  constructor(private readonly recommendations: RecommendationsService) {}

  @ApiBearerAuth()
  @Get('recommendations')
  @ApiOkResponse({
    description:
      'Recomendaciones con desglose por criterio, razones y advertencias. `degraded: true` si se usó el respaldo.',
  })
  recommend(
    @CurrentUser() user: AuthUser,
    @Query() query: RecommendationQueryDto,
    @RequestId() requestId: string,
  ) {
    return this.recommendations.recommend(user, query, requestId);
  }

  /** Pública: visitantes reciben la comparación base; usuarios con sesión, la personalizada. */
  @Public()
  @Post('comparisons')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    description: 'Ganador, ganadores por criterio y resumen explicativo',
  })
  compare(
    @Body() dto: CompareProductsDto,
    @CurrentUser() user: AuthUser | undefined,
    @RequestId() requestId: string,
  ) {
    return this.recommendations.compare(dto.productIds, user, requestId);
  }
}
