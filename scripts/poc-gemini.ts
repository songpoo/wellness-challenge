import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { loadGroundTruth, loadSystemPrompt, loadFixtureImage } from './lib/fixtures.ts';
import { getNotionOutputValidator, tryExtractJson } from './lib/validate.ts';
import { saveResult, formatProgress } from './lib/output.ts';
import type { PocResult, Fixture } from './lib/types.ts';

const MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-pro';
const MAX_TOKENS = 2048;

// Gemini 2.5 Pro pricing (2026 reference; update from console).
// Input: $1.25 / 1M tokens (≤200k context), Output: $10.00 / 1M tokens
const PRICE_INPUT_PER_1M = 1.25;
const PRICE_OUTPUT_PER_1M = 10.0;

async function analyzeFixture(
  client: GoogleGenerativeAI,
  fixture: Fixture,
  systemPrompt: string,
  validate: Awaited<ReturnType<typeof getNotionOutputValidator>>,
): Promise<PocResult> {
  const start = Date.now();
  let ttft: number | null = null;

  try {
    const { base64, mimeType } = await loadFixtureImage(fixture);
    const model = client.getGenerativeModel({
      model: MODEL,
      systemInstruction: systemPrompt,
      generationConfig: { maxOutputTokens: MAX_TOKENS },
    });

    const result = await model.generateContentStream([
      { inlineData: { mimeType, data: base64 } },
      { text: `<user_input>\n${fixture.user_text}\n</user_input>` },
    ]);

    let raw = '';
    for await (const chunk of result.stream) {
      if (ttft === null) ttft = Date.now() - start;
      raw += chunk.text();
    }
    const total = Date.now() - start;

    const aggregated = await result.response;
    const usage = aggregated.usageMetadata;
    const inputTok = usage?.promptTokenCount ?? 0;
    const outputTok = usage?.candidatesTokenCount ?? 0;
    const cost = (inputTok * PRICE_INPUT_PER_1M + outputTok * PRICE_OUTPUT_PER_1M) / 1_000_000;

    const parsed = tryExtractJson(raw);
    const valid = parsed !== null && validate(parsed);
    const errors = validate.errors?.map((e) => `${e.instancePath} ${e.message}`) ?? [];

    return {
      fixture_id: fixture.id,
      model: 'gemini',
      model_id: MODEL,
      raw_response: raw,
      parsed_json: parsed,
      schema_valid: !!valid,
      schema_errors: errors,
      ttft_ms: ttft,
      total_ms: total,
      input_tokens: inputTok,
      output_tokens: outputTok,
      estimated_cost_usd: cost,
      error: null,
    };
  } catch (err) {
    return {
      fixture_id: fixture.id,
      model: 'gemini',
      model_id: MODEL,
      raw_response: '',
      parsed_json: null,
      schema_valid: false,
      schema_errors: [],
      ttft_ms: ttft,
      total_ms: Date.now() - start,
      input_tokens: 0,
      output_tokens: 0,
      estimated_cost_usd: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function main(): Promise<void> {
  if (!process.env.GOOGLE_AI_API_KEY) {
    console.error('GOOGLE_AI_API_KEY missing. Copy .env.example to .env and fill it.');
    process.exit(1);
  }

  const client = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
  const [{ fixtures }, systemPrompt, validate] = await Promise.all([
    loadGroundTruth(),
    loadSystemPrompt(),
    getNotionOutputValidator(),
  ]);

  console.log(`Running Gemini PoC: model=${MODEL}, fixtures=${fixtures.length}\n`);

  let passed = 0;
  for (let i = 0; i < fixtures.length; i++) {
    const fixture = fixtures[i]!;
    const result = await analyzeFixture(client, fixture, systemPrompt, validate);
    await saveResult(result);
    if (result.schema_valid) passed++;
    console.log(formatProgress(i + 1, fixtures.length, fixture.id, result.total_ms, result.schema_valid));
    if (result.error) console.log(`    ERROR: ${result.error}`);
  }

  console.log(`\nDone. Schema-valid: ${passed}/${fixtures.length}`);
  console.log(`Results: tests/fixtures/results/gemini/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
