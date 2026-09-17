import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  DEFAULT_WEIGHTS,
  UserPreferences,
} from '../../database/entities/user-preferences.entity.js';
import type { UpdatePreferencesDto } from './preferences.dto.js';

@Injectable()
export class PreferencesService {
  constructor(
    @InjectRepository(UserPreferences)
    private readonly preferences: Repository<UserPreferences>,
  ) {}

  async getOrCreate(userId: string): Promise<UserPreferences> {
    const existing = await this.preferences.findOne({ where: { userId } });
    if (existing) return existing;
    await this.preferences
      .createQueryBuilder()
      .insert()
      .values({ userId, weights: { ...DEFAULT_WEIGHTS } })
      .orIgnore()
      .execute();
    return this.preferences.findOneOrFail({ where: { userId } });
  }

  async update(
    userId: string,
    dto: UpdatePreferencesDto,
  ): Promise<UserPreferences> {
    await this.getOrCreate(userId);
    await this.preferences.update(
      { userId },
      {
        weights: { ...dto.weights },
        diets: dto.diets,
        excludedAllergens: dto.excludedAllergens,
        avoidHighIn: dto.avoidHighIn,
        preferredStores: dto.preferredStores,
        personalizationEnabled: dto.personalizationEnabled,
      },
    );
    return this.preferences.findOneOrFail({ where: { userId } });
  }
}
