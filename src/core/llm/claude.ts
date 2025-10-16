import { STRATEGY_GENERATION_PROMPT } from './prompts';
import type { LLMProvider } from './provider';
import { Err, Ok, type Result } from '../types/common';
import type { ExtractionStrategy } from '../types/strategy';
import type { PageContext } from '../types/view';
import { ExtractionStrategySchema } from '../types/strategy';

interface AnthropicMessageResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  model: string;
  content: Array<{
    type: 'text';
    text: string;
  }>;
  stop_reason: string | null;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export class ClaudeProvider implements LLMProvider {
  constructor(private readonly apiKey: string) {}

  async generateStrategy(context: PageContext): Promise<Result<ExtractionStrategy>> {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2000,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'input_image',
                  source: {
                    type: 'base64',
                    media_type: 'image/png',
                    data: context.screenshot,
                  },
                },
                {
                  type: 'text',
                  text: STRATEGY_GENERATION_PROMPT(context),
                },
              ],
            },
          ],
        }),
      });

      if (!response.ok) {
        return Err(new Error(`API error: ${response.status}`));
      }

      const data = (await response.json()) as AnthropicMessageResponse;
      const strategyJson = this.extractJSON(data.content[0]?.text ?? '');

      const parsed = ExtractionStrategySchema.safeParse(strategyJson);
      if (!parsed.success) {
        return Err(new Error(`Invalid strategy: ${parsed.error.message}`));
      }

      return Ok(parsed.data);
    } catch (error) {
      return Err(error as Error);
    }
  }

  private extractJSON(text: string): unknown {
    const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]);
    }
    return JSON.parse(text);
  }
}
