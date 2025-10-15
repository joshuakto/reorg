import type { ExtractionStrategy } from '../types/strategy';

export interface StoredStrategy {
  version: number;
  domain: string;
  url: string;
  strategy: ExtractionStrategy;
  metadata: {
    created: number;
    lastUsed: number;
    successCount: number;
    failureCount: number;
  };
}
