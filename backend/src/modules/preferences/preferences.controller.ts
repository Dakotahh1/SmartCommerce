import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth.decorators.js';
import { CurrentUser } from '../../common/auth.decorators.js';
import { UpdatePreferencesDto } from './preferences.dto.js';
import { PreferencesService } from './preferences.service.js';

/** Solo se accede a las preferencias propias (el id sale del token, nunca del cliente). */
@ApiTags('preferencias')
@ApiBearerAuth()
@Controller({ path: 'me/preferences', version: '1' })
export class PreferencesController {
  constructor(private readonly preferences: PreferencesService) {}

  @Get()
  @ApiOkResponse({ type: UpdatePreferencesDto })
  async get(@CurrentUser() user: AuthUser) {
    return this.serialize(await this.preferences.getOrCreate(user.id));
  }

  @Put()
  @ApiOkResponse({ type: UpdatePreferencesDto })
  async update(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdatePreferencesDto,
  ) {
    return this.serialize(await this.preferences.update(user.id, dto));
  }

  private serialize(
    prefs: Awaited<ReturnType<PreferencesService['getOrCreate']>>,
  ) {
    return {
      weights: prefs.weights,
      diets: prefs.diets,
      excludedAllergens: prefs.excludedAllergens,
      avoidHighIn: prefs.avoidHighIn,
      preferredStores: prefs.preferredStores,
      personalizationEnabled: prefs.personalizationEnabled,
      updatedAt: prefs.updatedAt,
    };
  }
}
