import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, MoreThan, Repository } from 'typeorm';
import { AppException } from '../../common/app.exception.js';
import { InteractionType } from '../../common/enums.js';
import {
  Favorite,
  UserInteraction,
} from '../../database/entities/activity.entities.js';
import { Product } from '../../database/entities/catalog.entities.js';
import { ProductsService } from '../catalog/products.service.js';
import { toCandidate } from '../smartmatch/candidate.mapper.js';
import type { HistoryEvent } from '../smartmatch/smartmatch.contracts.js';
import type { CreateInteractionDto } from './interactions.dto.js';

const HISTORY_DAYS = 90;
const HISTORY_LIMIT = 200;

@Injectable()
export class InteractionsService {
  constructor(
    @InjectRepository(UserInteraction)
    private readonly interactions: Repository<UserInteraction>,
    @InjectRepository(Favorite)
    private readonly favorites: Repository<Favorite>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    private readonly catalog: ProductsService,
    private readonly dataSource: DataSource,
  ) {}

  async record(userId: string, dto: CreateInteractionDto) {
    const exists = await this.products.exists({ where: { id: dto.productId } });
    if (!exists) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'PRODUCT_NOT_FOUND',
        'Producto no encontrado',
      );
    }
    return this.dataSource.transaction(async (manager) => {
      const saved = await manager.save(
        manager.create(UserInteraction, {
          userId,
          productId: dto.productId,
          type: dto.type,
          context: { ...dto.context },
        }),
      );
      if (dto.type === InteractionType.FAVORITE) {
        await manager
          .createQueryBuilder()
          .insert()
          .into(Favorite)
          .values({ userId, productId: dto.productId })
          .orIgnore()
          .execute();
      } else if (dto.type === InteractionType.UNFAVORITE) {
        await manager.delete(Favorite, { userId, productId: dto.productId });
      }
      return {
        id: saved.id,
        type: saved.type,
        productId: saved.productId,
        createdAt: saved.createdAt,
      };
    });
  }

  async listHistory(userId: string, limit = 50) {
    const rows = await this.interactions.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: Math.min(limit, HISTORY_LIMIT),
    });
    return rows.map((row) => ({
      id: row.id,
      productId: row.productId,
      type: row.type,
      context: row.context,
      createdAt: row.createdAt,
    }));
  }

  async listFavorites(userId: string) {
    const favorites = await this.favorites.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 100,
    });
    if (favorites.length === 0) return [];
    const products = await this.products.find({
      where: { id: In(favorites.map((f) => f.productId)) },
    });
    const context = await this.catalog.loadContext(products);
    const byId = new Map(context.map((c) => [c.product.id, c]));
    return favorites
      .map((f) => byId.get(f.productId))
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .map((item) => this.catalog.toSummary(item));
  }

  /** "Restablecer aprendizaje": borra el historial usado para adaptar recomendaciones. */
  async clearHistory(userId: string): Promise<void> {
    await this.interactions.delete({ userId });
  }

  /** Historial reciente en el formato del motor (con antigüedad en días). */
  async historyForEngine(userId: string): Promise<HistoryEvent[]> {
    const since = new Date(Date.now() - HISTORY_DAYS * 86_400_000);
    const rows = await this.interactions.find({
      where: { userId, createdAt: MoreThan(since) },
      order: { createdAt: 'DESC' },
      take: HISTORY_LIMIT,
    });
    if (rows.length === 0) return [];
    const products = await this.products.find({
      where: { id: In([...new Set(rows.map((r) => r.productId))]) },
    });
    const context = new Map(
      (await this.catalog.loadContext(products)).map((c) => [c.product.id, c]),
    );
    const now = Date.now();
    return rows.flatMap((row) => {
      const item = context.get(row.productId);
      if (!item) return [];
      const ageDays = Math.max(0, (now - row.createdAt.getTime()) / 86_400_000);
      return [
        {
          type: row.type,
          ageDays: Math.round(ageDays * 1000) / 1000,
          product: toCandidate(item),
        },
      ];
    });
  }
}
