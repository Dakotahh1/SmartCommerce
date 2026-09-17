import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth.decorators.js';
import { CurrentUser } from '../../common/auth.decorators.js';
import { CreateInteractionDto } from './interactions.dto.js';
import { InteractionsService } from './interactions.service.js';

@ApiTags('interacciones')
@ApiBearerAuth()
@Controller({ version: '1' })
export class InteractionsController {
  constructor(private readonly interactions: InteractionsService) {}

  @Post('interactions')
  @ApiCreatedResponse({
    description: 'Evento registrado (señal para la adaptación)',
  })
  @ApiNotFoundResponse({ description: 'PRODUCT_NOT_FOUND' })
  record(@CurrentUser() user: AuthUser, @Body() dto: CreateInteractionDto) {
    return this.interactions.record(user.id, dto);
  }

  @Get('me/interactions')
  history(@CurrentUser() user: AuthUser) {
    return this.interactions.listHistory(user.id);
  }

  @Delete('me/interactions')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({
    description: 'Restablece el aprendizaje borrando el historial',
  })
  clear(@CurrentUser() user: AuthUser) {
    return this.interactions.clearHistory(user.id);
  }

  @Get('me/favorites')
  favorites(@CurrentUser() user: AuthUser) {
    return this.interactions.listFavorites(user.id);
  }
}
