import type { Criterion, Diet, HighInSeal } from '../core/models';

export const CRITERION_LABELS: Record<Criterion, string> = {
  nutrition: 'Nutrición (Nutri-Score)',
  price: 'Precio por kg / litro',
  processing: 'Procesamiento (NOVA)',
  environment: 'Impacto ambiental',
  availability: 'Disponibilidad en tiendas',
};

export const CRITERION_ICONS: Record<Criterion, string> = {
  nutrition: 'heart-outline',
  price: 'pricetag-outline',
  processing: 'pulse-outline',
  environment: 'leaf-outline',
  availability: 'storefront-outline',
};

export const CRITERION_COLORS: Record<Criterion, string> = {
  nutrition: 'var(--sc-mint)',
  price: 'var(--sc-amber)',
  processing: 'var(--sc-violet)',
  environment: 'var(--sc-grade-b)',
  availability: 'var(--sc-coral)',
};

export const DIET_LABELS: Record<Diet, string> = {
  gluten_free: 'Sin gluten',
  lactose_free: 'Sin lactosa',
  vegan: 'Vegano',
  vegetarian: 'Vegetariano',
};

export const ALLERGEN_LABELS: Record<string, string> = {
  gluten: 'Gluten',
  milk: 'Leche',
  eggs: 'Huevo',
  tree_nuts: 'Frutos secos',
  peanuts: 'Maní',
  soy: 'Soya',
  fish: 'Pescado',
  crustaceans: 'Crustáceos',
  celery: 'Apio',
  mustard: 'Mostaza',
  sesame: 'Sésamo',
  sulphites: 'Sulfitos',
  lupin: 'Lupino',
  molluscs: 'Moluscos',
};

export const SEAL_LABELS: Record<HighInSeal, string> = {
  calories: 'Calorías',
  sugars: 'Azúcares',
  sodium: 'Sodio',
  saturated_fat: 'Grasas saturadas',
};

export const NOVA_LABELS: Record<number, string> = {
  1: 'Sin procesar',
  2: 'Ingrediente culinario',
  3: 'Procesado',
  4: 'Ultraprocesado',
};

export function weightLevel(value: number): string {
  if (value >= 75) return 'Muy alta';
  if (value >= 55) return 'Alta';
  if (value >= 35) return 'Media';
  if (value > 0) return 'Baja';
  return 'Sin peso';
}

export function formatPrice(amount: number, currency = 'CLP'): string {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}
