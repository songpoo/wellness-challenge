export interface FixtureExpectation {
  labels?: string[];
  kcal_min?: number;
  kcal_max?: number;
  protein_g_min?: number;
  protein_g_max?: number;
  workout_type_keywords?: string[];
  duration_min?: number;
  weight_kg?: number;
  notes?: string;
}

export interface Fixture {
  id: string;
  file: string;
  category: 'meal' | 'workout' | 'scale';
  user_text: string;
  expected: FixtureExpectation;
}

export interface GroundTruth {
  fixtures: Fixture[];
}

export interface PocResult {
  fixture_id: string;
  model: 'claude' | 'gemini';
  model_id: string;
  raw_response: string;
  parsed_json: unknown;
  schema_valid: boolean;
  schema_errors: string[];
  ttft_ms: number | null;
  total_ms: number;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number;
  error: string | null;
}
