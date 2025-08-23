export type Gender = 'male' | 'female' | 'other';
export type Activity = 'sedentary' | 'light' | 'moderate' | 'very' | 'super';
export type Goal = 'maintain' | 'lose' | 'gain';

export interface ProfileInputs {
  height_cm?: number | null;
  weight_kg?: number | null;
  age?: number | null;
  gender?: Gender | null;
  activity_level?: Activity | null;
  goal?: Goal | null;
}

export interface Targets {
  calories: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
}

const activityFactor: Record<Activity, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  very: 1.725,
  super: 1.9,
};

export function computeBMR({ weight_kg, height_cm, age, gender }: ProfileInputs): number | null {
  if (!weight_kg || !height_cm || !age || !gender) return null;
  const w = Number(weight_kg);
  const h = Number(height_cm);
  const a = Number(age);
  if (Number.isNaN(w) || Number.isNaN(h) || Number.isNaN(a)) return null;
  if (gender === 'male') return 10 * w + 6.25 * h - 5 * a + 5;
  if (gender === 'female') return 10 * w + 6.25 * h - 5 * a - 161;
  // 'other' fallback: average of male/female constants
  const male = 10 * w + 6.25 * h - 5 * a + 5;
  const female = 10 * w + 6.25 * h - 5 * a - 161;
  return (male + female) / 2;
}

export function computeTargets(profile: ProfileInputs): Targets | null {
  const bmr = computeBMR(profile);
  if (bmr == null) return null;
  const act = profile.activity_level && activityFactor[profile.activity_level] ? activityFactor[profile.activity_level] : activityFactor.sedentary;
  let tdee = bmr * act;

  // Adjust calories for goals
  const goal = profile.goal || 'maintain';
  if (goal === 'lose') tdee = tdee - 400; // mid of 300-500
  else if (goal === 'gain') tdee = tdee + 400; // mid of 300-500

  // Protein: 1.9 g/kg (mid of 1.6–2.2)
  const weight = profile.weight_kg || 0;
  const protein_g = Math.max(0, Math.round(weight * 1.9));
  const protein_kcal = protein_g * 4;

  // Fats: 25% of calories (mid of 20–30%)
  const fat_kcal = tdee * 0.25;
  const fat_g = Math.round(fat_kcal / 9);

  // Carbs: remaining calories
  const remaining_kcal = Math.max(0, tdee - protein_kcal - fat_kcal);
  const carbs_g = Math.round(remaining_kcal / 4);

  return {
    calories: Math.round(tdee),
    protein_g,
    fat_g,
    carbs_g,
  };
}
