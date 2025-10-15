import { ChromeMessaging } from './messaging';
import { ExtractorRegistry } from '../core/extractors/registry';
import { GridRenderer } from '../core/renderer/grid';
import type { Command } from '../core/types/common';
import type { DOMStructure } from '../core/types/view';

function getDOMStructure(): DOMStructure {
  return {
    buttons: Array.from(document.querySelectorAll('button')).map((btn, index) => ({
      text: btn.textContent?.trim() ?? '',
      selector: btn.id
        ? `#${btn.id}`
        : btn.classList.length > 0
          ? `${btn.tagName.toLowerCase()}.${Array.from(btn.classList).join('.')}`
          : `${btn.tagName.toLowerCase()}:nth-of-type(${index + 1})`,
    })),
    tabs: Array.from(document.querySelectorAll('[role="tab"], .tab')).map((tab, index) => ({
      text: tab.textContent?.trim() ?? '',
      selector: tab.id
        ? `#${tab.id}`
        : tab.classList.length > 0
          ? `${tab.tagName.toLowerCase()}.${Array.from(tab.classList).join('.')}`
          : `${tab.tagName.toLowerCase()}:nth-of-type(${index + 1})`,
    })),
    sections: Array.from(document.querySelectorAll('section, [class*="section"]')).map(
      (section, index) => {
        const heading = section.querySelector('h1, h2, h3, h4');
        const selector = section.id
          ? `#${section.id}`
          : section.classList.length > 0
            ? `${section.tagName.toLowerCase()}.${Array.from(section.classList).join('.')}`
            : `${section.tagName.toLowerCase()}:nth-of-type(${index + 1})`;

        return {
          heading: heading?.textContent?.trim() ?? '',
          selector,
        };
      },
    ),
  };
}

ChromeMessaging.onMessage(async (command: Command) => {
  switch (command.type) {
    case 'GET_DOM_STRUCTURE':
      return getDOMStructure();

    case 'EXECUTE_STRATEGY': {
      const extractor = ExtractorRegistry.get(command.strategy.extractorType);
      if (!extractor) {
        return { success: false, error: 'Extractor not found' };
      }

      const result = await extractor.execute(command.strategy, document);

      if (!result.success) {
        return { success: false, error: result.error.message };
      }

      const renderer = new GridRenderer();
      renderer.render(result.data);

      return { success: true, data: result.data };
    }

    default:
      return { success: false, error: 'Unknown command' };
  }
});
