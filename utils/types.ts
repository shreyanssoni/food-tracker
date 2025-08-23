export type FoodItem = {
  name: string;
  quantity?: string;
  calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
};

export type FoodLog = {
  id?: string;
  user_id?: string | null;
  items: FoodItem[];
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  eaten_at: string; // ISO
  note?: string | null;
  created_at?: string;
};
