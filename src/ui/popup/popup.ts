import { ChromeMessaging } from '../../chrome/messaging';
import { StorageManager } from '../../core/storage/manager';
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

  if (strategyResult.success && strategyResult.data && statusText && executeBtn) {
    executeBtn.disabled = false;
    statusText.textContent = `Strategy available (used ${strategyResult.data.metadata.successCount} times)`;
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
    return;
  }

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

void init();
