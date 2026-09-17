import type { Product } from '../../database/entities/catalog.entities.js';
import type { UserPreferences } from '../../database/entities/user-preferences.entity.js';
import type {
  EngineProfile,
  ProductCandidate,
} from './smartmatch.contracts.js';

export interface ProductWithContext {
  product: Product;
  categorySlug: string | null;
  latestPrice: { amount: number; currency: string } | null;
}

/** Precio por kg o litro a partir del último precio observado y la cantidad neta. */
export function unitPriceOf(
  product: Pick<Product, 'netQuantity' | 'unit'>,
  price: { amount: number } | null,
): { unitPrice: number | null; priceUnit: 'kg' | 'l' | null } {
  if (!price || !product.netQuantity || !product.unit)
    return { unitPrice: null, priceUnit: null };
  return {
    unitPrice:
      Math.round((price.amount / product.netQuantity) * 1000 * 100) / 100,
    priceUnit: product.unit === 'ml' ? 'l' : 'kg',
  };
}

export function toCandidate({
  product,
  categorySlug,
  latestPrice,
}: ProductWithContext): ProductCandidate {
  const { unitPrice, priceUnit } = unitPriceOf(product, latestPrice);
  return {
    id: product.id,
    gtin: product.gtin,
    name: product.name,
    brand: product.brand,
    mainCategory: categorySlug,
    nutriscoreGrade: product.nutriscoreGrade,
    novaGroup: product.novaGroup,
    ecoscoreGrade: product.ecoscoreGrade,
    nutriments: Object.keys(product.nutriments ?? {}).length
      ? (product.nutriments as Record<string, number | null>)
      : null,
    highInSeals: product.highInSeals,
    allergens: product.allergens,
    labels: product.labels,
    diets: product.diets ?? {},
    stores: product.stores,
    unitPrice,
    priceUnit,
    dataQualityScore: product.dataQualityScore,
  };
}

export function toEngineProfile(preferences: UserPreferences): EngineProfile {
  return {
    weights: preferences.weights,
    diets: preferences.diets,
    excludedAllergens: preferences.excludedAllergens,
    avoidHighIn: preferences.avoidHighIn,
    preferredStores: preferences.preferredStores,
  };
}
