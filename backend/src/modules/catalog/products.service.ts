import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, SelectQueryBuilder } from 'typeorm';
import { AppException } from '../../common/app.exception.js';
import { toPrefixTsQuery } from '../../common/text-normalization.js';
import { toPage, type Page } from '../../common/pagination.js';
import {
  Category,
  DataSourceEntity,
  Product,
  ProductPrice,
  ProductSource,
} from '../../database/entities/catalog.entities.js';
import {
  unitPriceOf,
  type ProductWithContext,
} from '../smartmatch/candidate.mapper.js';
import type { ProductQueryDto, ProductSort } from './products.dto.js';

export interface ProductSummary {
  id: string;
  gtin: string;
  name: string;
  brand: string | null;
  category: string | null;
  quantityText: string | null;
  imageUrl: string | null;
  nutriscoreGrade: string | null;
  novaGroup: number | null;
  ecoscoreGrade: string | null;
  highInSeals: string[];
  allergens: string[];
  dataQualityScore: number;
  /** Puntaje `ts_rank_cd` cuando la lista se ordena por relevancia. */
  relevance?: number;
  price: {
    amount: number;
    currency: string;
    unitPrice: number | null;
    priceUnit: 'kg' | 'l' | null;
  } | null;
}

// Normalización 1 = divide por 1 + log(largo del documento): a igual coincidencia, gana el
// producto cuyo texto se centra en el término buscado (ver docs/10, comparación de variantes).
const SEARCH_RANK = `ts_rank_cd(product.search_vector, to_tsquery('simple', :tsq), 1)`;

const SORTS: Record<
  Exclude<ProductSort, 'relevance'>,
  [string, 'ASC' | 'DESC']
> = {
  quality: ['product.dataQualityScore', 'DESC'],
  name: ['product.name', 'ASC'],
  recent: ['product.updatedAt', 'DESC'],
};

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(Category)
    private readonly categories: Repository<Category>,
    @InjectRepository(ProductSource)
    private readonly sources: Repository<ProductSource>,
    @InjectRepository(ProductPrice)
    private readonly prices: Repository<ProductPrice>,
    @InjectRepository(DataSourceEntity)
    private readonly dataSources: Repository<DataSourceEntity>,
  ) {}

  /**
   * Búsqueda en el catálogo. Con texto, la consulta se normaliza igual que el índice
   * (tokens, sin tildes, plurales) y se ordena por `ts_rank_cd` sobre `search_vector`
   * (nombre/marca con peso A, categorías y sellos con peso B); empates por calidad del dato.
   */
  async search(query: ProductQueryDto): Promise<Page<ProductSummary>> {
    const qb = this.products.createQueryBuilder('product');
    this.applyFilters(qb, query);
    const tsq = query.q ? toPrefixTsQuery(query.q) : null;
    const sort: ProductSort = query.sort ?? (tsq ? 'relevance' : 'quality');

    if (sort === 'relevance' && tsq) {
      qb.addSelect(SEARCH_RANK, 'relevance')
        .orderBy('relevance', 'DESC')
        .addOrderBy('product.dataQualityScore', 'DESC');
    } else {
      const [field, direction] = SORTS[sort === 'relevance' ? 'quality' : sort];
      qb.orderBy(field, direction);
    }
    qb.addOrderBy('product.gtin', 'ASC')
      .offset((query.page - 1) * query.limit)
      .limit(query.limit);

    const [{ entities, raw }, total] = await Promise.all([
      qb.getRawAndEntities<{ product_id: string; relevance?: number }>(),
      qb.getCount(),
    ]);
    const rankById = new Map(
      raw.map((row) => [row.product_id, Number(row.relevance ?? 0)]),
    );
    const context = await this.loadContext(entities);
    return toPage(
      context.map((item) => {
        const summary = this.toSummary(item);
        return sort === 'relevance' && tsq
          ? {
              ...summary,
              relevance: Number(
                (rankById.get(item.product.id) ?? 0).toFixed(4),
              ),
            }
          : summary;
      }),
      total,
      query.page,
      query.limit,
    );
  }

  async findOne(id: string) {
    const product = await this.products.findOne({ where: { id } });
    if (!product) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'PRODUCT_NOT_FOUND',
        'Producto no encontrado',
      );
    }
    const [[context], provenance, prices] = await Promise.all([
      this.loadContext([product]),
      this.sources
        .createQueryBuilder('ps')
        .innerJoin(DataSourceEntity, 'ds', 'ds.id = ps.sourceId')
        .select([
          'ds.code AS "code"',
          'ds.name AS "name"',
          'ds.license AS "license"',
          'ps.sourceUrl AS "url"',
          'ps.fetchedAt AS "fetchedAt"',
          'ps.sourceLastModifiedAt AS "sourceLastModifiedAt"',
        ])
        .where('ps.productId = :id', { id })
        .getRawMany<Record<string, unknown>>(),
      this.prices.find({
        where: { productId: id },
        order: { observedAt: 'DESC' },
        take: 10,
      }),
    ]);

    return {
      ...this.toSummary(context),
      categories: context.categorySlug ? [context.categorySlug] : [],
      netQuantity: product.netQuantity,
      unit: product.unit,
      isBeverage: product.isBeverage,
      nutriments: product.nutriments,
      traces: product.traces,
      labels: product.labels,
      diets: product.diets,
      stores: product.stores,
      completeness: product.completeness,
      provenance,
      priceHistory: prices.map((p) => ({
        amount: p.amount,
        currency: p.currency,
        storeName: p.storeName,
        observedAt: p.observedAt,
      })),
      updatedAt: product.updatedAt,
    };
  }

  async listCategories() {
    return this.categories
      .createQueryBuilder('category')
      .leftJoin(Product, 'product', 'product.categoryId = category.id')
      .select(['category.slug AS "slug"', 'category.name AS "name"'])
      .addSelect('COUNT(product.id)::int', 'productCount')
      .groupBy('category.id')
      .orderBy('"productCount"', 'DESC')
      .limit(100)
      .getRawMany();
  }

  /** Candidatos para el motor: los de mejor calidad de datos, con categoría y último precio. */
  async candidates(options: {
    limit: number;
    category?: string;
    ids?: string[];
  }): Promise<ProductWithContext[]> {
    const qb = this.products.createQueryBuilder('product');
    if (options.ids) qb.where({ id: In(options.ids) });
    if (options.category)
      this.applyFilters(qb, { category: options.category } as ProductQueryDto);
    const rows = await qb
      .orderBy('product.dataQualityScore', 'DESC')
      .addOrderBy('product.gtin', 'ASC')
      .take(options.limit)
      .getMany();
    return this.loadContext(rows);
  }

  async loadContext(rows: Product[]): Promise<ProductWithContext[]> {
    if (rows.length === 0) return [];
    const categoryIds = [
      ...new Set(
        rows.map((p) => p.categoryId).filter((id): id is number => id !== null),
      ),
    ];
    const [categories, prices] = await Promise.all([
      categoryIds.length
        ? this.categories.find({ where: { id: In(categoryIds) } })
        : [],
      this.prices
        .createQueryBuilder('price')
        .distinctOn(['price.productId'])
        .where('price.productId IN (:...ids)', { ids: rows.map((p) => p.id) })
        .orderBy('price.productId')
        .addOrderBy('price.observedAt', 'DESC')
        .getMany(),
    ]);
    const slugById = new Map(categories.map((c) => [c.id, c.slug]));
    const priceByProduct = new Map(prices.map((p) => [p.productId, p]));
    return rows.map((product) => {
      const price = priceByProduct.get(product.id);
      return {
        product,
        categorySlug: product.categoryId
          ? (slugById.get(product.categoryId) ?? null)
          : null,
        latestPrice: price
          ? { amount: price.amount, currency: price.currency }
          : null,
      };
    });
  }

  toSummary({
    product,
    categorySlug,
    latestPrice,
  }: ProductWithContext): ProductSummary {
    return {
      id: product.id,
      gtin: product.gtin,
      name: product.name,
      brand: product.brand,
      category: categorySlug,
      quantityText: product.quantityText,
      imageUrl: product.imageUrl,
      nutriscoreGrade: product.nutriscoreGrade,
      novaGroup: product.novaGroup,
      ecoscoreGrade: product.ecoscoreGrade,
      highInSeals: product.highInSeals,
      allergens: product.allergens,
      dataQualityScore: product.dataQualityScore,
      price: latestPrice
        ? { ...latestPrice, ...unitPriceOf(product, latestPrice) }
        : null,
    };
  }

  private applyFilters(
    qb: SelectQueryBuilder<Product>,
    query: Partial<ProductQueryDto>,
  ): void {
    if (query.q) {
      const tsq = toPrefixTsQuery(query.q);
      const like = `%${query.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      // Índice GIN sobre search_vector; ILIKE solo como respaldo para subcadenas.
      qb.andWhere(
        tsq
          ? `(product.search_vector @@ to_tsquery('simple', :tsq)
              OR product.name ILIKE :like OR product.brand ILIKE :like)`
          : '(product.name ILIKE :like OR product.brand ILIKE :like)',
        { tsq, like },
      );
    }
    if (query.category) {
      qb.andWhere(
        `product.categoryId IN (SELECT c.id FROM categories c WHERE c.slug = :category)`,
        { category: query.category },
      );
    }
    if (query.nutriscore?.length) {
      qb.andWhere('product.nutriscoreGrade IN (:...grades)', {
        grades: query.nutriscore,
      });
    }
    if (query.maxNova) {
      qb.andWhere('product.novaGroup <= :maxNova', { maxNova: query.maxNova });
    }
    if (query.excludeAllergens?.length) {
      qb.andWhere('NOT (product.allergens && CAST(:allergens AS text[]))', {
        allergens: query.excludeAllergens,
      });
    }
  }

  async sourceByCode(code: string): Promise<DataSourceEntity> {
    const source = await this.dataSources.findOne({ where: { code } });
    if (!source) {
      throw new AppException(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'SOURCE_NOT_CONFIGURED',
        'Fuente de datos no configurada',
      );
    }
    return source;
  }
}
