import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppException } from '../../common/app.exception.js';
import type { AuthUser } from '../../common/auth.decorators.js';
import { RecommendationLog } from '../../database/entities/activity.entities.js';
import { ProductsService } from '../catalog/products.service.js';
import { InteractionsService } from '../interactions/interactions.service.js';
import { PreferencesService } from '../preferences/preferences.service.js';
import {
  toCandidate,
  toEngineProfile,
} from '../smartmatch/candidate.mapper.js';
import {
  SmartMatchClient,
  SmartMatchInvalidResponseError,
  SmartMatchRequestError,
  SmartMatchUnavailableError,
} from '../smartmatch/smartmatch.client.js';
import { BASELINE_WEIGHTS, rankBaseline } from './baseline-ranker.js';

const MAX_CANDIDATES = 200;
export const DEGRADED_NOTICE =
  'El motor SmartMatch no está disponible; mostramos un orden básico por calidad nutricional.';

/** Cualquier falla del motor degrada la respuesta: el usuario nunca recibe un 500 por SmartMatch. */
function isEngineFailure(error: unknown): boolean {
  return (
    error instanceof SmartMatchUnavailableError ||
    error instanceof SmartMatchInvalidResponseError ||
    error instanceof SmartMatchRequestError
  );
}

@Injectable()
export class RecommendationsService {
  private readonly logger = new Logger(RecommendationsService.name);

  constructor(
    private readonly products: ProductsService,
    private readonly preferences: PreferencesService,
    private readonly interactions: InteractionsService,
    private readonly smartmatch: SmartMatchClient,
    @InjectRepository(RecommendationLog)
    private readonly logs: Repository<RecommendationLog>,
  ) {}

  async recommend(
    user: AuthUser,
    options: { limit: number; category?: string },
    requestId?: string,
  ) {
    const started = performance.now();
    const prefs = await this.preferences.getOrCreate(user.id);
    const personalized = prefs.personalizationEnabled;
    const context = await this.products.candidates({
      limit: MAX_CANDIDATES,
      category: options.category,
    });
    const candidates = context.map(toCandidate);
    const byId = new Map(context.map((item) => [item.product.id, item]));

    let response;
    if (candidates.length === 0) {
      response = {
        strategy: personalized ? 'personalized' : 'baseline',
        degraded: false,
        notice: 'Aún no hay productos en el catálogo.',
        engineVersion: null,
        weightsUsed: personalized ? prefs.weights : BASELINE_WEIGHTS,
        learnedAdjustments: {},
        excludedCount: 0,
        items: [],
      };
    } else {
      try {
        const history = personalized
          ? await this.interactions.historyForEngine(user.id)
          : [];
        const result = await this.smartmatch.rank(
          {
            strategy: personalized ? 'personalized' : 'baseline',
            profile: personalized ? toEngineProfile(prefs) : null,
            history,
            candidates,
            limit: options.limit,
            diversify: true,
          },
          requestId,
        );
        response = {
          strategy: result.strategy,
          degraded: false,
          notice: null,
          engineVersion: result.engineVersion,
          weightsUsed: result.weightsUsed,
          learnedAdjustments: result.learnedAdjustments,
          excludedCount: result.excluded.length,
          items: result.items.flatMap((item) => {
            const ctx = item.productId ? byId.get(item.productId) : undefined;
            return ctx
              ? [{ ...item, product: this.products.toSummary(ctx) }]
              : [];
          }),
        };
      } catch (error) {
        if (!isEngineFailure(error)) throw error;
        const log =
          error instanceof SmartMatchRequestError
            ? this.logger.error.bind(this.logger)
            : this.logger.warn.bind(this.logger);
        log(
          { userId: user.id, requestId, error: (error as Error).message },
          'Recomendaciones en modo degradado',
        );
        response = {
          strategy: 'baseline',
          degraded: true,
          notice: DEGRADED_NOTICE,
          engineVersion: null,
          weightsUsed: BASELINE_WEIGHTS,
          learnedAdjustments: {},
          excludedCount: 0,
          items: rankBaseline(candidates, options.limit).map((item) => {
            const ctx = byId.get(item.productId);
            return {
              ...item,
              product: ctx ? this.products.toSummary(ctx) : null,
            };
          }),
        };
      }
    }

    const latencyMs = Math.round(performance.now() - started);
    await this.logs.save(
      this.logs.create({
        userId: user.id,
        strategy: response.strategy,
        engineVersion: response.engineVersion ?? 'fallback',
        degraded: response.degraded,
        itemCount: response.items.length,
        items: response.items.map((i) => ({
          productId: i.productId ?? '',
          score: i.score,
          rank: i.rank,
        })),
        latencyMs,
        requestId: requestId?.slice(0, 64) ?? null,
      }),
    );
    return { ...response, generatedAt: new Date().toISOString(), latencyMs };
  }

  async compare(
    productIds: string[],
    user: AuthUser | undefined,
    requestId?: string,
  ) {
    const context = await this.products.candidates({
      limit: productIds.length,
      ids: productIds,
    });
    if (context.length !== productIds.length) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'PRODUCT_NOT_FOUND',
        'Uno o más productos no existen',
      );
    }
    const candidates = context.map(toCandidate);
    const byGtin = new Map(context.map((item) => [item.product.gtin, item]));
    const prefs = user ? await this.preferences.getOrCreate(user.id) : null;
    const personalized = Boolean(prefs?.personalizationEnabled);

    try {
      const result = await this.smartmatch.compare(
        {
          strategy: personalized ? 'personalized' : 'baseline',
          profile: personalized && prefs ? toEngineProfile(prefs) : null,
          history:
            personalized && user
              ? await this.interactions.historyForEngine(user.id)
              : [],
          products: candidates,
        },
        requestId,
      );
      return {
        ...result,
        degraded: false,
        notice: null,
        items: result.items.map((item) => {
          const ctx = byGtin.get(item.gtin);
          return {
            ...item,
            product: ctx ? this.products.toSummary(ctx) : null,
          };
        }),
      };
    } catch (error) {
      if (!isEngineFailure(error)) throw error;
      const ranked = rankBaseline(candidates, candidates.length);
      const winner = ranked[0];
      return {
        engineVersion: null,
        strategy: 'baseline' as const,
        weightsUsed: BASELINE_WEIGHTS,
        degraded: true,
        notice: DEGRADED_NOTICE,
        winnerGtin: winner?.gtin ?? null,
        criteriaWinners: {},
        summary: winner
          ? `${byGtin.get(winner.gtin)?.product.name ?? winner.gtin} tiene el mejor puntaje general (${Math.round(winner.score)}/100).`
          : '',
        items: ranked.map((item) => {
          const ctx = byGtin.get(item.gtin);
          return {
            ...item,
            name: ctx?.product.name ?? item.gtin,
            eligible: true,
            exclusionReasons: [],
            product: ctx ? this.products.toSummary(ctx) : null,
          };
        }),
      };
    }
  }
}
