// Food log types
export interface FoodLog {
  id: string;
  user_id: string | null;
  items: Array<{ name: string; quantity?: number; unit?: string }>;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack' | null;
  eaten_at: string; // ISO date string
  created_at: string; // ISO date string
  updated_at?: string; // ISO date string (optional)
  device_info: {
    user_agent?: string;
    timezone?: string;
  } | null;
  note?: string | null;
}

// User types
export interface AppUser {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserPreferences {
  id: string;
  user_id: string;
  timezone: string;
  daily_calorie_goal: number | null;
  daily_protein_goal: number | null;
  daily_carbs_goal: number | null;
  daily_fat_goal: number | null;
  dietary_restrictions: string[];
  created_at: string;
  updated_at: string;
}

// API response types
export interface ApiResponse<T> {
  data?: T;
  error?: string;
  success: boolean;
}

// AI response types
export interface AiSuggestionResponse {
  greeting: string;
  suggestion: string;
  nextMealSuggestion: string;
}

// Form types
export interface FoodLogFormData {
  text: string;
  mealType?: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  eatenAt?: string; // ISO date string
}

// Nutrition summary for a time period
export interface NutritionSummary {
  date: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  meal_count: number;
}
