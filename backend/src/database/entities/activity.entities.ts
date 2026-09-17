import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { InteractionType } from '../../common/enums.js';

@Entity({ name: 'user_interactions' })
export class UserInteraction {
  /** `bigint` identity: el driver pg lo devuelve como string para no perder precisión. */
  @PrimaryGeneratedColumn('identity', {
    type: 'bigint',
    generatedIdentity: 'ALWAYS',
  })
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'product_id', type: 'uuid' })
  productId!: string;

  @Column({ type: 'enum', enum: InteractionType, enumName: 'interaction_type' })
  type!: InteractionType;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  context!: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}

@Entity({ name: 'favorites' })
export class Favorite {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @PrimaryColumn({ name: 'product_id', type: 'uuid' })
  productId!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}

/** Auditoría de recomendaciones entregadas (base para evaluar la versión adaptativa vs la base). */
@Entity({ name: 'recommendation_logs' })
export class RecommendationLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId!: string | null;

  @Column({ type: 'varchar', length: 20 })
  strategy!: string;

  @Column({ name: 'engine_version', type: 'varchar', length: 20 })
  engineVersion!: string;

  @Column({ type: 'boolean', default: false })
  degraded!: boolean;

  @Column({ name: 'item_count', type: 'int' })
  itemCount!: number;

  @Column({ type: 'jsonb' })
  items!: Array<{ productId: string; score: number; rank: number }>;

  @Column({ name: 'latency_ms', type: 'int' })
  latencyMs!: number;

  @Column({ name: 'request_id', type: 'varchar', length: 64, nullable: true })
  requestId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
