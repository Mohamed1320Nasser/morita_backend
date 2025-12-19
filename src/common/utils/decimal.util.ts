/**
 * Decimal Utility
 *
 * Handles Prisma Decimal type conversions safely across the application.
 * Prisma uses the Decimal.js library for precise decimal calculations.
 *
 * Why this is needed:
 * - Prisma returns Decimal objects for DECIMAL columns
 * - Discord embeds and formatting require plain numbers
 * - Need consistent handling across all services
 */

import { Decimal } from '@prisma/client/runtime/library';

/**
 * Safely convert any value to a number
 *
 * Handles:
 * - Prisma Decimal objects
 * - Strings (from JSON parsing)
 * - Numbers (pass-through)
 * - null/undefined (returns 0)
 * - Invalid values (returns 0)
 *
 * @param value - The value to convert
 * @returns A plain number (JavaScript number type)
 *
 * @example
 * ```typescript
 * // From Prisma query
 * const method = await prisma.pricingMethod.findFirst();
 * const price = toNumber(method.basePrice); // Safe conversion
 *
 * // From API response
 * const price = toNumber(apiData.price); // Handles string or Decimal
 * ```
 */
export function toNumber(value: any): number {
  // Handle null/undefined
  if (value === null || value === undefined) {
    return 0;
  }

  // Handle Decimal instances (from Prisma)
  if (value instanceof Decimal) {
    return value.toNumber();
  }

  // Handle plain numbers (pass-through)
  if (typeof value === 'number') {
    // Check for NaN, Infinity
    if (isNaN(value) || !isFinite(value)) {
      return 0;
    }
    return value;
  }

  // Handle strings (from JSON parsing or manual input)
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? 0 : parsed;
  }

  // Handle Decimal duck-typing (for objects that look like Decimal)
  // This handles cases where Decimal is serialized/deserialized
  if (typeof value === 'object' && value !== null && 'toNumber' in value) {
    try {
      return value.toNumber();
    } catch {
      return 0;
    }
  }

  // Fallback for unknown types
  return 0;
}

/**
 * Safely convert value to number with fallback
 *
 * Unlike toNumber(), this allows specifying a custom fallback value
 * instead of always defaulting to 0.
 *
 * @param value - The value to convert
 * @param fallback - Value to return if conversion fails (default: 0)
 * @returns A plain number
 *
 * @example
 * ```typescript
 * const price = toNumberOrDefault(apiData.price, 9.99);
 * ```
 */
export function toNumberOrDefault(value: any, fallback: number = 0): number {
  const result = toNumber(value);
  return result === 0 && value !== 0 && value !== '0' ? fallback : result;
}

/**
 * Format a Decimal/number as currency
 *
 * @param value - The value to format
 * @param currency - Currency code (default: 'USD')
 * @param minimumFractionDigits - Minimum decimal places (default: 2)
 * @param maximumFractionDigits - Maximum decimal places (default: 2)
 * @returns Formatted currency string
 *
 * @example
 * ```typescript
 * formatCurrency(19.99) // "$19.99"
 * formatCurrency(0.0025, 'USD', 4, 4) // "$0.0025"
 * ```
 */
export function formatCurrency(
  value: any,
  currency: string = 'USD',
  minimumFractionDigits: number = 2,
  maximumFractionDigits: number = 2
): string {
  const numValue = toNumber(value);

  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits,
    maximumFractionDigits,
  });

  return formatter.format(numValue);
}

/**
 * Format a number with K/M/B suffixes for large numbers
 *
 * @param value - The value to format
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted string
 *
 * @example
 * ```typescript
 * formatLargeNumber(1500) // "1.50K"
 * formatLargeNumber(2500000) // "2.50M"
 * formatLargeNumber(1000000000) // "1.00B"
 * ```
 */
export function formatLargeNumber(value: any, decimals: number = 2): string {
  const num = toNumber(value);

  if (num >= 1_000_000_000) {
    return `${(num / 1_000_000_000).toFixed(decimals)}B`;
  } else if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(decimals)}M`;
  } else if (num >= 1_000) {
    return `${(num / 1_000).toFixed(decimals)}K`;
  } else {
    return num.toFixed(decimals);
  }
}

/**
 * Format a price number (handles very small prices like XP rates)
 *
 * @param value - The price to format
 * @returns Formatted price string
 *
 * @example
 * ```typescript
 * formatPrice(0.00025) // "0.00025"
 * formatPrice(19.99) // "19.99"
 * formatPrice(1500) // "1.50K"
 * ```
 */
export function formatPrice(value: any): string {
  const num = toNumber(value);

  // For very small prices (like XP rates), show up to 8 decimals but remove trailing zeros
  if (num < 1 && num > 0) {
    let str = num.toFixed(8);
    // Remove trailing zeros but keep at least one decimal place
    str = str.replace(/(\.\d*?[1-9])0+$/, '$1');
    str = str.replace(/\.0+$/, '');
    return str || '0';
  }

  // For large numbers, use K/M/B notation
  if (num >= 1_000_000) {
    return formatLargeNumber(num);
  } else if (num >= 1_000) {
    return formatLargeNumber(num);
  }

  // For normal prices, use 2 decimal places
  return num.toFixed(2);
}

/**
 * Check if a value is a valid Decimal or number
 *
 * @param value - The value to check
 * @returns true if valid number or Decimal
 */
export function isValidDecimal(value: any): boolean {
  if (value === null || value === undefined) {
    return false;
  }

  if (value instanceof Decimal) {
    return true;
  }

  if (typeof value === 'number') {
    return !isNaN(value) && isFinite(value);
  }

  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return !isNaN(parsed) && isFinite(parsed);
  }

  return false;
}

/**
 * Convert value to Decimal (for database operations)
 *
 * @param value - The value to convert
 * @returns Decimal instance
 */
export function toDecimal(value: any): Decimal {
  if (value instanceof Decimal) {
    return value;
  }

  const num = toNumber(value);
  return new Decimal(num);
}
