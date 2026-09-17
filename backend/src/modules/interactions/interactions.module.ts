import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Favorite,
  UserInteraction,
} from '../../database/entities/activity.entities.js';
import { Product } from '../../database/entities/catalog.entities.js';
import { CatalogModule } from '../catalog/catalog.module.js';
import { InteractionsController } from './interactions.controller.js';
import { InteractionsService } from './interactions.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserInteraction, Favorite, Product]),
    CatalogModule,
  ],
  controllers: [InteractionsController],
  providers: [InteractionsService],
  exports: [InteractionsService],
})
export class InteractionsModule {}
