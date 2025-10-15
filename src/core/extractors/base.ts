import type { Result } from '../types/common';
import type { View } from '../types/view';
import type { Selector } from '../types/strategy';

export interface Extractor<TConfig = unknown> {
  readonly type: string;
  validate(config: TConfig): Result<void>;
  execute(config: TConfig, dom: Document): Promise<Result<View[]>>;
}

export abstract class BaseExtractor<TConfig> implements Extractor<TConfig> {
  abstract readonly type: string;

  abstract validate(config: TConfig): Result<void>;
  abstract execute(config: TConfig, dom: Document): Promise<Result<View[]>>;

  protected findElement(selector: Selector, dom: Document): Element | null {
    switch (selector.type) {
      case 'css':
        return dom.querySelector(selector.value);
      case 'text':
        return (
          Array.from(dom.querySelectorAll('*')).find((el) =>
            el.textContent?.includes(selector.value),
          ) ?? null
        );
      case 'xpath': {
        const result = dom.evaluate(
          selector.value,
          dom,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
        );
        return (result.singleNodeValue as Element | null) ?? null;
      }
      default:
        return null;
    }
  }

  protected async wait(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
