import type { PageContext } from '../types/view';
import type { ExtractionStrategy } from '../types/strategy';
import type { Result } from '../types/common';

export interface LLMProvider {
  generateStrategy(context: PageContext): Promise<Result<ExtractionStrategy>>;
}
