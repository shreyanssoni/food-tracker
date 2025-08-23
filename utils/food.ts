import { formatDate, startOfDay, endOfDay } from './date';
import type { FoodLog, NutritionSummary } from '@/types';

/**
 * Calculates the total nutrition values from an array of food logs
 * @param logs - Array of food logs
 * @returns Object with total nutrition values
 */
export function calculateNutritionTotals(logs: FoodLog[]): {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  mealCount: number;
} {
  return logs.reduce(
    (totals, log) => ({
      calories: totals.calories + (log.calories || 0),
      protein_g: totals.protein_g + (log.protein_g || 0),
      carbs_g: totals.carbs_g + (log.carbs_g || 0),
      fat_g: totals.fat_g + (log.fat_g || 0),
      mealCount: totals.mealCount + 1,
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, mealCount: 0 }
  );
}

/**
 * Groups food logs by day
 * @param logs - Array of food logs
 * @returns Object with dates as keys and arrays of food logs as values
 */
export function groupLogsByDay(logs: FoodLog[]): Record<string, FoodLog[]> {
  return logs.reduce<Record<string, FoodLog[]>>((groups, log) => {
    const date = formatDate(log.eaten_at, { year: 'numeric', month: 'short', day: 'numeric' });
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(log);
    return groups;
  }, {});
}

/**
 * Gets the meal type based on the time of day
 * @param date - Date object or ISO string
 * @returns Meal type ('breakfast', 'lunch', 'dinner', or 'snack')
 */
export function getMealType(date: Date | string = new Date()): 'breakfast' | 'lunch' | 'dinner' | 'snack' {
  const dateObj = typeof date === 'string' ? new Date(date) : new Date(date);
  const hours = dateObj.getHours();
  
  if (hours >= 4 && hours < 10) return 'breakfast';
  if (hours >= 10 && hours < 15) return 'lunch';
  if (hours >= 15 && hours < 21) return 'dinner';
  return 'snack';
}

/**
 * Calculates daily nutrition summaries for a date range
 * @param logs - Array of food logs
 * @param startDate - Start date of the range
 * @param endDate - End date of the range
 * @returns Array of daily nutrition summaries
 */
export function getDailyNutrition(
  logs: FoodLog[],
  startDate: Date | string,
  endDate: Date | string
): NutritionSummary[] {
  const start = startOfDay(startDate);
  const end = endOfDay(endDate);
  const days: Record<string, FoodLog[]> = {};
  
  // Initialize days object with all dates in range
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = formatDate(d, { year: 'numeric', month: 'short', day: 'numeric' });
    days[dateStr] = [];
  }
  
  // Group logs by day
  logs.forEach(log => {
    const logDate = new Date(log.eaten_at);
    if (logDate >= start && logDate <= end) {
      const dateStr = formatDate(logDate, { year: 'numeric', month: 'short', day: 'numeric' });
      if (days[dateStr]) {
        days[dateStr].push(log);
      }
    }
  });
  
  // Calculate nutrition for each day
  return Object.entries(days).map(([date, dayLogs]) => {
    const { calories, protein_g, carbs_g, fat_g, mealCount } = calculateNutritionTotals(dayLogs);
    return {
      date,
      calories,
      protein_g,
      carbs_g,
      fat_g,
      meal_count: mealCount,
    };
  });
}

/**
 * Calculates the remaining nutrition based on daily goals
 * @param consumed - Consumed nutrition values
 * @param goals - Daily nutrition goals
 * @returns Object with remaining nutrition values
 */
export function calculateRemainingNutrition(
  consumed: { calories: number; protein_g: number; carbs_g: number; fat_g: number },
  goals: { calories: number; protein_g: number; carbs_g: number; fat_g: number }
) {
  return {
    calories: Math.max(0, goals.calories - consumed.calories),
    protein_g: Math.max(0, goals.protein_g - consumed.protein_g),
    carbs_g: Math.max(0, goals.carbs_g - consumed.carbs_g),
    fat_g: Math.max(0, goals.fat_g - consumed.fat_g),
  };
}

/**
 * Formats nutrition values for display
 * @param value - Nutrition value
 * @param unit - Unit of measurement (g, kcal, etc.)
 * @returns Formatted string with value and unit
 */
export function formatNutritionValue(value: number | null | undefined, unit: string = 'g'): string {
  if (value === null || value === undefined) return `- ${unit}`;
  return `${Math.round(value * 10) / 10} ${unit}`;
}

/**
 * Calculates the progress percentage for a nutrition value
 * @param current - Current value
 * @param total - Total/Goal value
 * @returns Percentage (0-100)
 */
export function calculateProgressPercentage(current: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((current / total) * 100));
}
