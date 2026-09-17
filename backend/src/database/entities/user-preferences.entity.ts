import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import type { Allergen, Criterion, Diet } from '../../common/enums.js';

export type CriterionWeights = Record<Criterion, number>;

export const DEFAULT_WEIGHTS: CriterionWeights = {
  nutrition: 30,
  price: 25,
  processing: 20,
  environment: 15,
  availability: 10,
};

@Entity({ name: 'user_preferences' })
export class UserPreferences {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ type: 'jsonb' })
  weights!: CriterionWeights;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  diets!: Diet[];

  @Column({
    name: 'excluded_allergens',
    type: 'text',
    array: true,
    default: () => "'{}'",
  })
  excludedAllergens!: Allergen[];

  @Column({ name: 'avoid_high_in', type: 'boolean', default: false })
  avoidHighIn!: boolean;

  @Column({
    name: 'preferred_stores',
    type: 'text',
    array: true,
    default: () => "'{}'",
  })
  preferredStores!: string[];

  @Column({ name: 'personalization_enabled', type: 'boolean', default: true })
  personalizationEnabled!: boolean;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
