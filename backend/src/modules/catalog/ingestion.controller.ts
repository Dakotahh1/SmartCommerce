import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  ApiBadGatewayResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth.decorators.js';
import { CurrentUser, RequestId, Roles } from '../../common/auth.decorators.js';
import { Role } from '../../common/enums.js';
import { ListIngestionsQueryDto, StartIngestionDto } from './ingestion.dto.js';
import { IngestionService } from './ingestion.service.js';

@ApiTags('admin · ingesta')
@ApiBearerAuth()
@ApiForbiddenResponse({ description: 'Requiere rol admin u operator' })
@Roles(Role.ADMIN, Role.OPERATOR)
@Controller({ path: 'admin/ingestions', version: '1' })
export class IngestionController {
  constructor(private readonly ingestion: IngestionService) {}

  @Post()
  @ApiCreatedResponse({
    description: 'Ejecución completada con métricas de calidad',
  })
  @ApiBadGatewayResponse({ description: 'SOURCE_UNAVAILABLE' })
  @ApiServiceUnavailableResponse({ description: 'SMARTMATCH_UNAVAILABLE' })
  start(
    @Body() dto: StartIngestionDto,
    @CurrentUser() user: AuthUser,
    @RequestId() requestId: string,
  ) {
    return this.ingestion.start(dto, user.id, requestId);
  }

  @Get()
  list(@Query() query: ListIngestionsQueryDto) {
    return this.ingestion.list(query);
  }
}
