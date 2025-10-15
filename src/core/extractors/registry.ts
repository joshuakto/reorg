import type { Extractor } from './base';
import { TabSwitcherExtractor } from './tab-switcher';

export class ExtractorRegistry {
  private static readonly extractors = new Map<string, Extractor>();

  static register(extractor: Extractor): void {
    this.extractors.set(extractor.type, extractor);
  }

  static get(type: string): Extractor | undefined {
    return this.extractors.get(type);
  }

  static getAll(): Extractor[] {
    return Array.from(this.extractors.values());
  }
}

ExtractorRegistry.register(new TabSwitcherExtractor());
