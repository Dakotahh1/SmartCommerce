import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RecommendationLog } from '../../database/entities/activity.entities.js';
import { CatalogModule } from '../catalog/catalog.module.js';
import { InteractionsModule } from '../interactions/interactions.module.js';
import { PreferencesModule } from '../preferences/preferences.module.js';
import { RecommendationsController } from './recommendations.controller.js';
import { RecommendationsService } from './recommendations.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([RecommendationLog]),
    CatalogModule,
    InteractionsModule,
    PreferencesModule,
  ],
  controllers: [RecommendationsController],
  providers: [RecommendationsService],
})
export class RecommendationsModule {}
