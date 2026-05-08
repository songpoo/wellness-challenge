import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { loadGroundTruth, loadSystemPrompt, loadFixtureImage } from './lib/fixtures.ts';
import { getNotionOutputValidator, tryExtractJson } from './lib/validate.ts';
import { saveResult, formatProgress } from './lib/output.ts';
import type { PocResult, Fixture } from './lib/types.ts';

const MODEL = process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-6';
const MAX_TOKENS = 2048;

// Sonnet 4.6 pricing (2026 reference; update from console).
// Input: $3.00 / 1M tokens, Output: $15.00 / 1M tokens
const PRICE_INPUT_PER_1M = 3.0;
const PRICE_OUTPUT_PER_1M = 15.0;

async function analyzeFixture(
  client: Anthropic,
  fixture: Fixture,
  systemPrompt: string,
  validate: Awaited<ReturnType<typeof getNotionOutputValidator>>,
): Promise<PocResult> {
  const start = Date.now();
  let ttft: number | null = null;

  try {
    const { base64, mimeType } = await loadFixtureImage(fixture);

    const stream = await client.messages.stream({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: [
        // Prompt caching — system prompt ~3K tokens, hit ratio reduces cost ~75%
        { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } },
      ],
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/webp', data: base64 },
            },
            { type: 'text', text: `<user_input>\n${fixture.user_text}\n</user_input>` },
          ],
        },
      ],
    });

    let raw = '';
    for await (const event of stream) {
      if (ttft === null && event.type === 'content_block_delta') {
        ttft = Date.now() - start;
      }
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        raw += event.delta.text;
      }
    }

    const final = await stream.finalMessage();
    const total = Date.now() - start;

    const parsed = tryExtractJson(raw);
    const valid = parsed !== null && validate(parsed);
    const errors = validate.errors?.map((e) => `${e.instancePath} ${e.message}`) ?? [];

    const inputTok = final.usage.input_tokens;
    const outputTok = final.usage.output_tokens;
    const cachedTok = (final.usage as { cache_read_input_tokens?: number }).cache_read_input_tokens ?? 0;
    const billedInput = inputTok - cachedTok + cachedTok * 0.1; // cache reads = 10% price
    const cost = (billedInput * PRICE_INPUT_PER_1M + outputTok * PRICE_OUTPUT_PER_1M) / 1_000_000;

    return {
      fixture_id: fixture.id,
      model: 'claude',
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
      model: 'claude',
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
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY missing. Copy .env.example to .env and fill it.');
    process.exit(1);
  }

  const client = new Anthropic();
  const [{ fixtures }, systemPrompt, validate] = await Promise.all([
    loadGroundTruth(),
    loadSystemPrompt(),
    getNotionOutputValidator(),
  ]);

  console.log(`Running Claude PoC: model=${MODEL}, fixtures=${fixtures.length}\n`);

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
  console.log(`Results: tests/fixtures/results/claude/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
