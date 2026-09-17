export enum Role {
  ADMIN = 'admin',
  OPERATOR = 'operator',
  USER = 'user',
}

export enum InteractionType {
  VIEW = 'view',
  FAVORITE = 'favorite',
  UNFAVORITE = 'unfavorite',
  COMPARE = 'compare',
  DISMISS = 'dismiss',
  RECOMMENDATION_CLICK = 'recommendation_click',
  RECOMMENDATION_ACCEPT = 'recommendation_accept',
  RECOMMENDATION_REJECT = 'recommendation_reject',
}

export enum IngestionStatus {
  RUNNING = 'running',
  COMPLETED = 'completed',
  PARTIAL = 'partial',
  FAILED = 'failed',
}

export const CRITERIA = [
  'nutrition',
  'price',
  'processing',
  'environment',
  'availability',
] as const;
export type Criterion = (typeof CRITERIA)[number];

export const DIETS = [
  'vegan',
  'vegetarian',
  'gluten_free',
  'lactose_free',
] as const;
export type Diet = (typeof DIETS)[number];

export const ALLERGENS = [
  'gluten',
  'milk',
  'eggs',
  'tree_nuts',
  'peanuts',
  'soy',
  'fish',
  'crustaceans',
  'celery',
  'mustard',
  'sesame',
  'sulphites',
  'lupin',
  'molluscs',
] as const;
export type Allergen = (typeof ALLERGENS)[number];

export const HIGH_IN_SEALS = [
  'calories',
  'sugars',
  'sodium',
  'saturated_fat',
] as const;
export type HighInSeal = (typeof HIGH_IN_SEALS)[number];

export const GRADES = ['a', 'b', 'c', 'd', 'e'] as const;
export type Grade = (typeof GRADES)[number];
