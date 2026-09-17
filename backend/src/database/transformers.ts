import type { ValueTransformer } from 'typeorm';

/** PostgreSQL devuelve `numeric` como string: lo convertimos a number (o null). */
export const numericTransformer: ValueTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | null) =>
    value === null || value === undefined ? null : Number(value),
};
