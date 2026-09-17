import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Category,
  DataSourceEntity,
  IngestionRun,
  Product,
  ProductPrice,
  ProductSource,
} from '../../database/entities/catalog.entities.js';
import { IngestionController } from './ingestion.controller.js';
import { IngestionService } from './ingestion.service.js';
import { ProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Product,
      Category,
      ProductSource,
      ProductPrice,
      DataSourceEntity,
      IngestionRun,
    ]),
  ],
  controllers: [ProductsController, IngestionController],
  providers: [ProductsService, IngestionService],
  exports: [ProductsService],
})
export class CatalogModule {}
