import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { AppException } from '../../common/app.exception.js';
import { IngestionStatus } from '../../common/enums.js';
import { toPage } from '../../common/pagination.js';
import {
  Category,
  IngestionRun,
  Product,
  ProductSource,
} from '../../database/entities/catalog.entities.js';
import {
  SmartMatchClient,
  SmartMatchInvalidResponseError,
  SmartMatchUnavailableError,
} from '../smartmatch/smartmatch.client.js';
import type { NormalizedProduct } from '../smartmatch/smartmatch.contracts.js';
import type {
  ListIngestionsQueryDto,
  StartIngestionDto,
} from './ingestion.dto.js';
import { ProductsService } from './products.service.js';

export interface PersistCounts {
  inserted: number;
  updated: number;
  unchanged: number;
}

function humanize(slug: string): string {
  const text = slug.replace(/^[a-z]{2}:/, '').replace(/-/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    @InjectRepository(IngestionRun)
    private readonly runs: Repository<IngestionRun>,
    private readonly dataSource: DataSource,
    private readonly products: ProductsService,
    private readonly smartmatch: SmartMatchClient,
  ) {}

  async start(dto: StartIngestionDto, userId: string, requestId?: string) {
    const source = await this.products.sourceByCode('openfoodfacts');
    const run = await this.runs.save(
      this.runs.create({
        sourceId: source.id,
        triggeredBy: userId,
        status: IngestionStatus.RUNNING,
        params: { ...dto },
        requestId: requestId?.slice(0, 64) ?? null,
      }),
    );

    try {
      const result = await this.smartmatch.ingestOpenFoodFacts(
        {
          country: dto.country,
          category: dto.category,
          brand: dto.brand,
          page: dto.page,
          pageSize: dto.pageSize,
        },
        requestId,
      );
      const counts = await this.dataSource.transaction((manager) =>
        this.persist(manager, result.products, source.id, run.id),
      );
      Object.assign(run, {
        status: IngestionStatus.COMPLETED,
        fetchedCount: result.report.received,
        validCount: result.report.valid,
        insertedCount: counts.inserted,
        updatedCount: counts.updated,
        unchangedCount: counts.unchanged,
        duplicateCount: result.report.duplicates,
        rejectedCount: result.report.rejected,
        qualityReport: {
          validRatio: result.report.validRatio,
          duplicateRatio: result.report.duplicateRatio,
          fieldCoverage: result.report.fieldCoverage,
          rejections: result.report.rejections.slice(0, 50),
          totalAvailable: result.totalAvailable,
          sourceApiUrl: result.source.apiUrl,
          processingMs: result.report.tookMs,
        },
        finishedAt: new Date(),
      });
      await this.runs.save(run);
      this.logger.log(
        { runId: run.id, ...counts, requestId },
        'Ingesta completada',
      );
      return this.serialize(run);
    } catch (error) {
      run.status = IngestionStatus.FAILED;
      run.finishedAt = new Date();
      run.errorMessage = this.describe(error);
      await this.runs.save(run);
      this.logger.error(
        { runId: run.id, error: run.errorMessage, requestId },
        'Ingesta fallida',
      );
      throw this.toHttpError(error);
    }
  }

  async list(query: ListIngestionsQueryDto) {
    const [rows, total] = await this.runs.findAndCount({
      order: { startedAt: 'DESC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    return toPage(
      rows.map((run) => this.serialize(run)),
      total,
      query.page,
      query.limit,
    );
  }

  /** Upsert idempotente: los productos sin cambios (mismo hash del dato crudo) no se reescriben. */
  async persist(
    manager: EntityManager,
    items: NormalizedProduct[],
    sourceId: number,
    runId: string,
  ): Promise<PersistCounts> {
    const counts: PersistCounts = { inserted: 0, updated: 0, unchanged: 0 };
    if (items.length === 0) return counts;

    const categoryIds = await this.upsertCategories(manager, items);
    const existing = await manager.find(Product, {
      where: { gtin: In(items.map((i) => i.gtin)) },
      select: { id: true, gtin: true },
    });
    const productIdByGtin = new Map(existing.map((p) => [p.gtin, p.id]));
    const provenance = await manager.find(ProductSource, {
      where: { sourceId, externalId: In(items.map((i) => i.gtin)) },
      select: { externalId: true, rawHash: true },
    });
    const hashByGtin = new Map(
      provenance.map((p) => [p.externalId, p.rawHash]),
    );

    for (const item of items) {
      const currentId = productIdByGtin.get(item.gtin);
      if (currentId && hashByGtin.get(item.gtin) === item.rawHash) {
        counts.unchanged += 1;
        await manager.update(
          ProductSource,
          { sourceId, externalId: item.gtin },
          { fetchedAt: new Date(item.source.fetchedAt), ingestionRunId: runId },
        );
        continue;
      }

      const values = {
        gtin: item.gtin,
        name: item.name,
        brand: item.brand,
        categoryId: item.mainCategory
          ? (categoryIds.get(item.mainCategory) ?? null)
          : null,
        quantityText: item.quantityText,
        netQuantity: item.netQuantity,
        unit: item.unit,
        isBeverage: item.isBeverage,
        imageUrl: item.imageUrl,
        nutriscoreGrade: item.nutriscoreGrade,
        novaGroup: item.novaGroup,
        ecoscoreGrade: item.ecoscoreGrade,
        nutriments: item.nutriments,
        allergens: item.allergens,
        traces: item.traces,
        labels: item.labels,
        diets: item.diets,
        highInSeals: item.highInSeals,
        stores: item.stores,
        completeness: item.completeness,
        dataQualityScore: item.dataQualityScore,
      };

      let productId = currentId;
      if (productId) {
        await manager.update(Product, { id: productId }, values);
        counts.updated += 1;
      } else {
        const inserted = await manager.save(manager.create(Product, values));
        productId = inserted.id;
        counts.inserted += 1;
      }

      await manager
        .createQueryBuilder()
        .insert()
        .into(ProductSource)
        .values({
          productId,
          sourceId,
          externalId: item.gtin,
          sourceUrl: item.source.url,
          rawHash: item.rawHash,
          sourceLastModifiedAt: item.source.lastModifiedAt
            ? new Date(item.source.lastModifiedAt)
            : null,
          fetchedAt: new Date(item.source.fetchedAt),
          ingestionRunId: runId,
        })
        .orUpdate(
          [
            'product_id',
            'source_url',
            'raw_hash',
            'source_last_modified_at',
            'fetched_at',
            'ingestion_run_id',
          ],
          ['source_id', 'external_id'],
        )
        .execute();
    }
    return counts;
  }

  private async upsertCategories(
    manager: EntityManager,
    items: NormalizedProduct[],
  ) {
    const slugs = [
      ...new Set(
        items.map((i) => i.mainCategory).filter((s): s is string => Boolean(s)),
      ),
    ];
    if (slugs.length === 0) return new Map<string, number>();
    await manager
      .createQueryBuilder()
      .insert()
      .into(Category)
      .values(
        slugs.map((slug) => ({ slug, name: humanize(slug).slice(0, 120) })),
      )
      .orIgnore()
      .execute();
    const categories = await manager.find(Category, {
      where: { slug: In(slugs) },
    });
    return new Map(categories.map((c) => [c.slug, c.id]));
  }

  private describe(error: unknown): string {
    if (error instanceof SmartMatchUnavailableError) {
      return error.upstreamCode
        ? `Fuente externa no disponible (${error.upstreamCode})`
        : `Servicio SmartMatch no disponible (${error.reason})`;
    }
    if (error instanceof SmartMatchInvalidResponseError)
      return 'Respuesta inválida del servicio SmartMatch';
    return 'Error inesperado durante la ingesta';
  }

  private toHttpError(error: unknown): unknown {
    if (error instanceof SmartMatchUnavailableError) {
      return error.upstreamCode?.startsWith('UPSTREAM_')
        ? new AppException(
            HttpStatus.BAD_GATEWAY,
            'SOURCE_UNAVAILABLE',
            'Open Food Facts no está disponible en este momento',
          )
        : new AppException(
            HttpStatus.SERVICE_UNAVAILABLE,
            'SMARTMATCH_UNAVAILABLE',
            'El servicio de procesamiento no está disponible',
          );
    }
    if (error instanceof SmartMatchInvalidResponseError) {
      return new AppException(
        HttpStatus.BAD_GATEWAY,
        'SMARTMATCH_INVALID_RESPONSE',
        'El servicio de procesamiento respondió con datos inválidos',
      );
    }
    return error;
  }

  private serialize(run: IngestionRun) {
    return {
      id: run.id,
      status: run.status,
      params: run.params,
      counts: {
        fetched: run.fetchedCount,
        valid: run.validCount,
        inserted: run.insertedCount,
        updated: run.updatedCount,
        unchanged: run.unchangedCount,
        duplicates: run.duplicateCount,
        rejected: run.rejectedCount,
      },
      qualityReport: run.qualityReport,
      errorMessage: run.errorMessage,
      requestId: run.requestId,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      durationMs: run.finishedAt
        ? run.finishedAt.getTime() - run.startedAt.getTime()
        : null,
    };
  }
}
