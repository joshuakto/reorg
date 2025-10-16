import { ChromeMessaging } from './messaging';
import { ExtractorRegistry } from '../core/extractors/registry';
import { ManualEditor } from '../core/manual/manual-editor';
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

console.log('[Content] Script loaded and message listener registered');

ChromeMessaging.onMessage(async (command: Command) => {
  console.log('[Content] Received command:', command.type);
  
  switch (command.type) {
    case 'GET_DOM_STRUCTURE':
      console.log('[Content] Returning DOM structure');
      return { success: true, data: getDOMStructure() };

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

    case 'START_MANUAL_MODE': {
      console.log('[Content] Starting manual mode...');
      const manual = getManualEditor();
      const result = manual.start();
      console.log('[Content] Manual mode start result:', result);
      return result;
    }

    case 'STOP_MANUAL_MODE': {
      console.log('[Content] Stopping manual mode...');
      const manual = getManualEditor();
      const result = manual.stop();
      console.log('[Content] Manual mode stop result:', result);
      return result;
    }

    default:
      console.warn('[Content] Unknown command:', command);
      return { success: false, error: 'Unknown command' };
  }
});

function getManualEditor(): ManualEditor {
  if (!(window as typeof window & { __llmManualEditor?: ManualEditor }).__llmManualEditor) {
    (window as typeof window & { __llmManualEditor: ManualEditor }).__llmManualEditor =
      new ManualEditor();
  }

  return (window as typeof window & { __llmManualEditor: ManualEditor }).__llmManualEditor;
}
