import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { Grade, HighInSeal } from '../../common/enums.js';
import { IngestionStatus } from '../../common/enums.js';
import { numericTransformer } from '../transformers.js';

export interface Nutriments {
  energyKcal?: number | null;
  sugars?: number | null;
  saturatedFat?: number | null;
  sodiumMg?: number | null;
  salt?: number | null;
  proteins?: number | null;
  fiber?: number | null;
}

export interface DietFlags {
  vegan?: boolean | null;
  vegetarian?: boolean | null;
  glutenFree?: boolean | null;
  lactoseFree?: boolean | null;
}

/** Fuente web registrada con su licencia y términos (Open Food Facts, Open Prices). */
@Entity({ name: 'data_sources' })
export class DataSourceEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 50, unique: true })
  code!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ name: 'base_url', type: 'varchar', length: 255 })
  baseUrl!: string;

  @Column({ type: 'varchar', length: 60 })
  license!: string;

  @Column({ name: 'terms_url', type: 'varchar', length: 255 })
  termsUrl!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}

@Entity({ name: 'categories' })
export class Category {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 120, unique: true })
  slug!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}

@Entity({ name: 'products' })
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 14, unique: true })
  gtin!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  brand!: string | null;

  @Index()
  @Column({ name: 'category_id', type: 'int', nullable: true })
  categoryId!: number | null;

  @Column({
    name: 'quantity_text',
    type: 'varchar',
    length: 80,
    nullable: true,
  })
  quantityText!: string | null;

  @Column({
    name: 'net_quantity',
    type: 'numeric',
    precision: 12,
    scale: 3,
    nullable: true,
    transformer: numericTransformer,
  })
  netQuantity!: number | null;

  @Column({ type: 'varchar', length: 4, nullable: true })
  unit!: 'g' | 'ml' | null;

  @Column({ name: 'is_beverage', type: 'boolean', default: false })
  isBeverage!: boolean;

  @Column({ name: 'image_url', type: 'text', nullable: true })
  imageUrl!: string | null;

  @Column({ name: 'nutriscore_grade', type: 'char', length: 1, nullable: true })
  nutriscoreGrade!: Grade | null;

  @Column({ name: 'nova_group', type: 'smallint', nullable: true })
  novaGroup!: number | null;

  @Column({ name: 'ecoscore_grade', type: 'char', length: 1, nullable: true })
  ecoscoreGrade!: Grade | null;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  nutriments!: Nutriments;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  allergens!: string[];

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  traces!: string[];

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  labels!: string[];

  @Column({ type: 'jsonb', default: () => "'{}'" })
  diets!: DietFlags;

  @Column({
    name: 'high_in_seals',
    type: 'text',
    array: true,
    default: () => "'{}'",
  })
  highInSeals!: HighInSeal[];

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  stores!: string[];

  @Column({
    type: 'numeric',
    precision: 4,
    scale: 3,
    default: 0,
    transformer: numericTransformer,
  })
  completeness!: number;

  @Column({
    name: 'data_quality_score',
    type: 'numeric',
    precision: 4,
    scale: 3,
    default: 0,
    transformer: numericTransformer,
  })
  dataQualityScore!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

/** Procedencia: qué fuente aportó el producto, cuándo y con qué contenido (hash). */
@Entity({ name: 'product_sources' })
export class ProductSource {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'product_id', type: 'uuid' })
  productId!: string;

  @Column({ name: 'source_id', type: 'int' })
  sourceId!: number;

  @Column({ name: 'external_id', type: 'varchar', length: 64 })
  externalId!: string;

  @Column({ name: 'source_url', type: 'text' })
  sourceUrl!: string;

  @Column({ name: 'raw_hash', type: 'char', length: 64 })
  rawHash!: string;

  @Column({
    name: 'source_last_modified_at',
    type: 'timestamptz',
    nullable: true,
  })
  sourceLastModifiedAt!: Date | null;

  @Column({ name: 'fetched_at', type: 'timestamptz' })
  fetchedAt!: Date;

  @Column({ name: 'ingestion_run_id', type: 'uuid', nullable: true })
  ingestionRunId!: string | null;
}

@Entity({ name: 'product_prices' })
export class ProductPrice {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'product_id', type: 'uuid' })
  productId!: string;

  @Column({ name: 'source_id', type: 'int' })
  sourceId!: number;

  @Column({ name: 'external_id', type: 'varchar', length: 64, nullable: true })
  externalId!: string | null;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  amount!: number;

  @Column({ type: 'char', length: 3 })
  currency!: string;

  @Column({ name: 'store_name', type: 'varchar', length: 120, nullable: true })
  storeName!: string | null;

  @Column({ name: 'country_code', type: 'char', length: 2, nullable: true })
  countryCode!: string | null;

  @Column({ name: 'observed_at', type: 'timestamptz' })
  observedAt!: Date;

  @Column({ name: 'fetched_at', type: 'timestamptz' })
  fetchedAt!: Date;
}

/** Traza de cada ejecución de obtención de datos web y sus métricas de calidad. */
@Entity({ name: 'ingestion_runs' })
export class IngestionRun {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'source_id', type: 'int' })
  sourceId!: number;

  @Column({ name: 'triggered_by', type: 'uuid', nullable: true })
  triggeredBy!: string | null;

  @Column({
    type: 'enum',
    enum: IngestionStatus,
    enumName: 'ingestion_status',
    default: IngestionStatus.RUNNING,
  })
  status!: IngestionStatus;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  params!: Record<string, unknown>;

  @Column({ name: 'fetched_count', type: 'int', default: 0 })
  fetchedCount!: number;

  @Column({ name: 'valid_count', type: 'int', default: 0 })
  validCount!: number;

  @Column({ name: 'inserted_count', type: 'int', default: 0 })
  insertedCount!: number;

  @Column({ name: 'updated_count', type: 'int', default: 0 })
  updatedCount!: number;

  @Column({ name: 'unchanged_count', type: 'int', default: 0 })
  unchangedCount!: number;

  @Column({ name: 'duplicate_count', type: 'int', default: 0 })
  duplicateCount!: number;

  @Column({ name: 'rejected_count', type: 'int', default: 0 })
  rejectedCount!: number;

  @Column({ name: 'quality_report', type: 'jsonb', nullable: true })
  qualityReport!: Record<string, unknown> | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  @Column({ name: 'request_id', type: 'varchar', length: 64, nullable: true })
  requestId!: string | null;

  @Column({ name: 'started_at', type: 'timestamptz', default: () => 'now()' })
  startedAt!: Date;

  @Column({ name: 'finished_at', type: 'timestamptz', nullable: true })
  finishedAt!: Date | null;
}
