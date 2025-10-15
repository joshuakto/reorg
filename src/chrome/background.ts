import { ChromeMessaging } from './messaging';
import { ClaudeProvider } from '../core/llm/claude';
import { StorageManager } from '../core/storage/manager';
import type { DOMStructure, PageContext } from '../core/types/view';
import { config } from '../config';

const llmProvider = new ClaudeProvider(config.llm.apiKey);
const storageManager = new StorageManager();

ChromeMessaging.onMessage(async (command) => {
  switch (command.type) {
    case 'CAPTURE_PAGE': {
      const tabId = command.tabId;

      const screenshot = await chrome.tabs.captureVisibleTab({ format: 'png' });

      const domResult = await ChromeMessaging.sendToContent<DOMStructure>(tabId, {
        type: 'GET_DOM_STRUCTURE',
      });

      if (!domResult.success) {
        return { success: false, error: (domResult.error as Error).message };
      }

      const tab = await chrome.tabs.get(tabId);
      const url = new URL(tab.url ?? '');

      const context: PageContext = {
        url: tab.url ?? '',
        domain: url.hostname,
        title: tab.title ?? '',
        screenshot: screenshot.split(',')[1] ?? '',
        domStructure: domResult.data,
      };

      return { success: true, data: context };
    }

    case 'GENERATE_STRATEGY': {
      const strategyResult = await llmProvider.generateStrategy(command.context);

      if (!strategyResult.success) {
        return { success: false, error: strategyResult.error.message };
      }

      await storageManager.saveStrategy(command.context.domain, {
        version: 1,
        domain: command.context.domain,
        url: command.context.url,
        strategy: strategyResult.data,
        metadata: {
          created: Date.now(),
          lastUsed: Date.now(),
          successCount: 0,
          failureCount: 0,
        },
      });

      return { success: true, data: strategyResult.data };
    }

    case 'SAVE_STRATEGY': {
      const result = await storageManager.saveStrategy(command.domain, command.strategy);
      return result.success
        ? { success: true }
        : { success: false, error: result.error.message };
    }

    default:
      return { success: false, error: 'Unknown command' satisfies string };
  }
});
