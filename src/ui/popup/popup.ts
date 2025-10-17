import { ChromeMessaging } from '../../chrome/messaging';
import { config } from '../../config';
import { StorageManager } from '../../core/storage/manager';
import { Err, Ok, type Result } from '../../core/types/common';
import type { StoredStrategy } from '../../core/storage/schema';
import type { ExtractionStrategy } from '../../core/types/strategy';
import type { PageContext } from '../../core/types/view';

const storageManager = new StorageManager();

async function init(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) {
    return;
  }

  const url = new URL(tab.url);
  const domain = url.hostname;

  const strategyResult = await storageManager.getStrategy(domain);
  const executeBtn = document.getElementById('execute-btn') as HTMLButtonElement | null;
  const statusText = document.getElementById('strategy-status');
  const manualLayoutStatus = document.getElementById('manual-layout-status');

  if (strategyResult.success && strategyResult.data && statusText && executeBtn) {
    executeBtn.disabled = false;
    statusText.textContent = `Strategy available (used ${strategyResult.data.metadata.successCount} times)`;
  }

  const manualLayoutResult = await storageManager.getManualLayout(domain);
  if (manualLayoutStatus) {
    if (manualLayoutResult.success && manualLayoutResult.data) {
      const savedAt = new Date(manualLayoutResult.data.capturedAt).toLocaleString();
      manualLayoutStatus.textContent = `Manual layout saved on ${savedAt}. Launch manual mode to continue refining.`;
    } else {
      manualLayoutStatus.textContent = 'No manual layout saved yet';
    }
  }

  if (!config.llm.apiKey) {
    showManualFallback('No Anthropic API key is configured. Manual mode lets you craft layouts by hand.');
  } else {
    hideManualFallback();
  }
}

document.getElementById('generate-btn')?.addEventListener('click', async () => {
  showLoading(true);
  hideError();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    showError('No active tab available.');
    showLoading(false);
    return;
  }

  const captureResult = await ChromeMessaging.sendToBackground<PageContext>({
    type: 'CAPTURE_PAGE',
    tabId: tab.id,
  });

  if (!captureResult.success) {
    showError('Failed to capture page');
    showManualFallback('Failed to capture page. Enter manual mode to craft a layout yourself.');
    showLoading(false);
    return;
  }

  const generateResult = await ChromeMessaging.sendToBackground<ExtractionStrategy>({
    type: 'GENERATE_STRATEGY',
    context: captureResult.data,
  });

  showLoading(false);

  if (!generateResult.success) {
    showError('Failed to generate strategy');
    showManualFallback('AI strategy generation unavailable. Use manual mode to prototype your view.');
    return;
  }

  hideManualFallback();
  await executeStrategy(generateResult.data);
});

document.getElementById('execute-btn')?.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) {
    showError('Unable to determine current tab URL.');
    return;
  }

  const domain = new URL(tab.url).hostname;
  const strategyResult = await storageManager.getStrategy(domain);

  if (strategyResult.success && strategyResult.data) {
    await executeStrategy(strategyResult.data.strategy);

    await updateUsageMetadata(domain, strategyResult.data);
  }
});

document.getElementById('manual-mode-btn')?.addEventListener('click', async () => {
  console.log('[Popup] Manual mode button clicked');
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    console.error('[Popup] No active tab');
    showError('No active tab available.');
    return;
  }

  console.log('[Popup] Active tab:', tab.id, tab.url);
  const injected = await ensureContentScript(tab.id, tab.url ?? '');
  if (!injected.success) {
    console.error('[Popup] Injection failed:', injected.error);
    showError(injected.error.message ?? 'Manual mode requires access to this page.');
    return;
  }

  console.log('[Popup] Sending START_MANUAL_MODE command...');
  const result = await ChromeMessaging.sendToContent(tab.id, { type: 'START_MANUAL_MODE' });
  console.log('[Popup] Manual mode result:', result);
  
  if (!result.success) {
    console.error('[Popup] Manual mode failed:', result.error);
    showError(result.error.message ?? 'Could not start manual mode.');
  } else {
    console.log('[Popup] Manual mode started successfully');
    hideError();
    window.close();
  }
});

async function executeStrategy(strategy: ExtractionStrategy): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    showError('No active tab available.');
    return;
  }

  const result = await ChromeMessaging.sendToContent(tab.id, {
    type: 'EXECUTE_STRATEGY',
    strategy,
  });

  if (!result.success) {
    showError('Extraction failed. Try regenerating the strategy.');
  } else {
    window.close();
  }
}

async function updateUsageMetadata(domain: string, stored: StoredStrategy): Promise<void> {
  await storageManager.updateMetadata(domain, {
    lastUsed: Date.now(),
    successCount: stored.metadata.successCount + 1,
  });
}

function showLoading(show: boolean): void {
  const loading = document.getElementById('loading');
  if (loading) {
    loading.style.display = show ? 'block' : 'none';
  }
}

function showError(message: string): void {
  const errorDiv = document.getElementById('error');
  if (errorDiv) {
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
  }
}

function hideError(): void {
  const errorDiv = document.getElementById('error');
  if (errorDiv) {
    errorDiv.style.display = 'none';
  }
}

function showManualFallback(message: string): void {
  const container = document.getElementById('manual-fallback');
  const messageEl = document.getElementById('manual-message');

  if (container) {
    container.style.display = 'block';
  }

  if (messageEl) {
    messageEl.textContent = message;
  }
}

function hideManualFallback(): void {
  const container = document.getElementById('manual-fallback');
  if (container) {
    container.style.display = 'none';
  }
}

async function ensureContentScript(tabId: number, url: string): Promise<Result<void>> {
  try {
    console.log('[Popup] Ensuring content script on tab', tabId, url);
    
    const tabUrl = new URL(url);
    if (tabUrl.protocol.startsWith('chrome') || tabUrl.protocol.startsWith('edge')) {
      console.warn('[Popup] Blocked: browser-specific page');
      return Err(new Error('Manual mode is blocked on browser-specific pages.'));
    }

    // Try to ping the content script first
    try {
      console.log('[Popup] Testing if content script is already active...');
      const pingResult = await Promise.race([
        ChromeMessaging.sendToContent(tabId, { type: 'GET_DOM_STRUCTURE' }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 500)),
      ]);
      
      if (pingResult && typeof pingResult === 'object' && 'success' in pingResult) {
        console.log('[Popup] Content script already active');
        return Ok(undefined);
      }
    } catch (pingError) {
      console.log('[Popup] Content script not responding, injecting...', pingError);
    }

    // Inject the content script
    console.log('[Popup] Injecting content script...');
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js'],
    });

    // Wait a bit for registration
    await new Promise((resolve) => setTimeout(resolve, 100));
    console.log('[Popup] Content script injected successfully');

    return Ok(undefined);
  } catch (error) {
    console.error('[Popup] Failed to ensure content script:', error);
    return Err(error as Error);
  }
}

void init();
