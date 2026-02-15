/**
 * Database row type definitions for Supabase tables
 * Used to type Supabase query results
 */

export interface UserRow {
  id: number;
  telegram_id: number | null;
  name: string | null;
  phone: string | null;
  email: string | null;
  gender: string | null;
  age: number | null;
  weight: number | null;
  height: number | null;
  activity: string | null;
  goal: string | null;
  calories: number | null;
  protein: number | null;
  fat: number | null;
  carbs: number | null;
  water_goal_ml: number | null;
  avatar_url: string | null;
  privacy_accepted: boolean | null;
  privacy_accepted_at: string | null;
  terms_accepted: boolean | null;
  terms_accepted_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}
