import { ChromeMessaging } from '../../chrome/messaging';
import { Err, type Command, type Result } from '../../core/types/common';
import type { ElementSnapshot, ManualEditorState } from '../../core/manual/types';

let activeTabId: number | null = null;
let manualApp: HTMLElement | null = null;
let statusEl: HTMLElement | null = null;

async function init(): Promise<void> {
  manualApp = document.getElementById('manual-app');
  statusEl = document.getElementById('llm-status');

  await resolveActiveTab();
  setupEventHandlers();
  setupMessageListener();
  await refreshState();
}

async function resolveActiveTab(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  activeTabId = tab?.id ?? null;
}

function setupMessageListener(): void {
  chrome.runtime.onMessage.addListener((message: Command, sender) => {
    if (message.type !== 'MANUAL_STATE_UPDATED') {
      return;
    }

    if (activeTabId === null && sender.tab?.id) {
      activeTabId = sender.tab.id;
    }

    if (sender.tab?.id !== activeTabId) {
      return;
    }

    renderState(message.payload);
  });
}

function setupEventHandlers(): void {
  document.getElementById('llm-select-parent')?.addEventListener('click', async () => {
    await sendManualCommand({ type: 'MANUAL_SELECT_PARENT' });
  });

  document.getElementById('llm-reset')?.addEventListener('click', async () => {
    const result = await sendManualCommand({ type: 'MANUAL_RESET' });
    if (!result.success) {
      setStatus(result.error.message ?? 'Failed to reset element', 'error');
    }
  });

  document.getElementById('llm-save')?.addEventListener('click', async () => {
    const result = await sendManualCommand({ type: 'MANUAL_SAVE_LAYOUT' });
    if (result.success) {
      setStatus('Saved manual layout', 'success');
    } else {
      setStatus(result.error.message ?? 'Failed to save layout', 'error');
    }
  });

  document.getElementById('llm-toggle-theme')?.addEventListener('click', () => {
    if (!manualApp) {
      return;
    }

    const nextTheme = manualApp.dataset.theme === 'light' ? 'dark' : 'light';
    manualApp.dataset.theme = nextTheme;
  });

  attachInputHandler('llm-text', (value) => sendManualCommand({ type: 'MANUAL_SET_TEXT', value }));

  attachAttributeHandler('llm-attr-id', 'id');
  attachAttributeHandler('llm-attr-class', 'class');
  attachAttributeHandler('llm-attr-title', 'title');
  attachAttributeHandler('llm-attr-aria-label', 'aria-label');

  attachStyleHandler('llm-font-family', 'font-family');
  attachStyleHandler('llm-font-weight', 'font-weight');
  attachNumericStyleHandler('llm-font-size', 'font-size', 'px');
  attachNumericStyleHandler('llm-line-height', 'line-height');
  attachNumericStyleHandler('llm-letter-spacing', 'letter-spacing', 'px');
  attachStyleHandler('llm-text-transform', 'text-transform');
  attachStyleHandler('llm-text-align', 'text-align');

  attachColorHandler('llm-text-color', 'color');
  attachColorHandler('llm-bg-color', 'background-color');
  attachColorHandler('llm-border-color', 'border-color');
  attachStyleHandler('llm-bg-image', 'background-image');
  attachStyleHandler('llm-bg-size', 'background-size');
  attachStyleHandler('llm-bg-position', 'background-position');
  attachRangeHandler('llm-opacity', 'opacity');

  attachNumericStyleHandler('llm-margin-top', 'margin-top', 'px');
  attachNumericStyleHandler('llm-margin-right', 'margin-right', 'px');
  attachNumericStyleHandler('llm-margin-bottom', 'margin-bottom', 'px');
  attachNumericStyleHandler('llm-margin-left', 'margin-left', 'px');

  attachNumericStyleHandler('llm-padding-top', 'padding-top', 'px');
  attachNumericStyleHandler('llm-padding-right', 'padding-right', 'px');
  attachNumericStyleHandler('llm-padding-bottom', 'padding-bottom', 'px');
  attachNumericStyleHandler('llm-padding-left', 'padding-left', 'px');

  attachStyleHandler('llm-display', 'display');
  attachNumericStyleHandler('llm-gap', 'gap', 'px');
  attachStyleHandler('llm-flex-direction', 'flex-direction');
  attachStyleHandler('llm-justify', 'justify-content');
  attachStyleHandler('llm-align', 'align-items');

  attachStyleHandler('llm-width', 'width');
  attachStyleHandler('llm-height', 'height');
  attachStyleHandler('llm-max-width', 'max-width');
  attachStyleHandler('llm-max-height', 'max-height');
  attachStyleHandler('llm-min-width', 'min-width');
  attachStyleHandler('llm-min-height', 'min-height');

  attachNumericStyleHandler('llm-border-width', 'border-width', 'px');
  attachStyleHandler('llm-border-style', 'border-style');
  attachNumericStyleHandler('llm-border-radius', 'border-radius', 'px');

  attachInputHandler('llm-box-shadow', (value) => sendManualCommand({ type: 'MANUAL_SET_STYLE', property: 'box-shadow', value }));
}

function attachInputHandler(id: string, handler: (value: string) => Promise<Result<unknown>>): void {
  const element = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null;
  if (!element) {
    return;
  }

  element.addEventListener('input', async (event) => {
    const target = event.currentTarget as HTMLInputElement | HTMLTextAreaElement;
    const value = target.value;
    const result = await handler(value);
    if (!result.success) {
      setStatus(result.error.message ?? 'Unable to update element', 'error');
    }
  });
}

function attachAttributeHandler(id: string, name: string): void {
  attachInputHandler(id, (value) => sendManualCommand({ type: 'MANUAL_SET_ATTRIBUTE', name, value }));
}

function attachStyleHandler(id: string, property: string): void {
  attachInputHandler(id, (value) => sendManualCommand({ type: 'MANUAL_SET_STYLE', property, value }));
}

function attachNumericStyleHandler(id: string, property: string, unit = ''): void {
  attachInputHandler(id, (value) => {
    if (!value) {
      return sendManualCommand({ type: 'MANUAL_SET_STYLE', property, value: '' });
    }

    const numeric = Number.parseFloat(value);
    if (Number.isNaN(numeric)) {
      return Promise.resolve(Err(new Error('Invalid numeric value')));
    }

    const suffix = unit ? `${numeric}${unit}` : `${numeric}`;
    return sendManualCommand({ type: 'MANUAL_SET_STYLE', property, value: suffix });
  });
}

function attachColorHandler(id: string, property: string): void {
  const element = document.getElementById(id) as HTMLInputElement | null;
  if (!element) {
    return;
  }

  element.addEventListener('input', async (event) => {
    const target = event.currentTarget as HTMLInputElement;
    const value = target.value;
    const result = await sendManualCommand({ type: 'MANUAL_SET_STYLE', property, value });
    if (!result.success) {
      setStatus(result.error.message ?? 'Failed to update color', 'error');
    }
  });
}

function attachRangeHandler(id: string, property: string): void {
  const element = document.getElementById(id) as HTMLInputElement | null;
  if (!element) {
    return;
  }

  element.addEventListener('input', async (event) => {
    const target = event.currentTarget as HTMLInputElement;
    const result = await sendManualCommand({ type: 'MANUAL_SET_STYLE', property, value: target.value });
    if (!result.success) {
      setStatus(result.error.message ?? 'Failed to update range', 'error');
    }
  });
}

async function refreshState(): Promise<void> {
  const result = await sendManualCommand<ManualEditorState>({ type: 'MANUAL_GET_STATE' });
  if (result.success) {
    renderState(result.data);
  } else {
    setStatus(result.error.message ?? 'Manual mode unavailable', 'error');
  }
}

function renderState(state: ManualEditorState): void {
  if (!manualApp) {
    manualApp = document.getElementById('manual-app');
  }

  if (manualApp) {
    manualApp.dataset.theme = state.theme ?? 'dark';
  }

  const descriptorEl = document.getElementById('llm-selected-descriptor');
  if (descriptorEl) {
    descriptorEl.textContent = state.descriptor ?? 'No element selected';
  }

  const controls = Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
    'input, textarea, select, button.primary, button.secondary, button.ghost',
  ));
  controls.forEach((control) => {
    if (control.id === 'llm-toggle-theme') {
      return;
    }
    control.disabled = !state.active;
  });

  if (!state.active) {
    clearChildren();
    populateInputs(null);
    setStatus('Manual mode inactive. Launch manual editing from the popup.', 'warning');
    return;
  }

  populateInputs(state.snapshot);
  populateChildren(state.children);
  setStatus('Manual mode ready', 'info');
}

function populateInputs(snapshot: ElementSnapshot | null): void {
  setValue('llm-text', snapshot ? snapshot.value ?? snapshot.text : '');
  setValue('llm-attr-id', snapshot?.attributes.id ?? '');
  setValue('llm-attr-class', snapshot?.attributes.class ?? '');
  setValue('llm-attr-title', snapshot?.attributes.title ?? '');
  setValue('llm-attr-aria-label', snapshot?.attributes['aria-label'] ?? '');

  setValue('llm-font-family', readStyle(snapshot, 'font-family'));
  setValue('llm-font-weight', readStyle(snapshot, 'font-weight'));
  setValue('llm-font-size', readNumeric(snapshot, 'font-size'));
  setValue('llm-line-height', readNumeric(snapshot, 'line-height'));
  setValue('llm-letter-spacing', readNumeric(snapshot, 'letter-spacing'));
  setValue('llm-text-transform', readStyle(snapshot, 'text-transform'));
  setValue('llm-text-align', readStyle(snapshot, 'text-align'));

  setValue('llm-text-color', normalizeColor(readStyle(snapshot, 'color')));
  setValue('llm-bg-color', normalizeColor(readStyle(snapshot, 'background-color')));
  setValue('llm-border-color', normalizeColor(readStyle(snapshot, 'border-color')));
  setValue('llm-bg-image', readStyle(snapshot, 'background-image'));
  setValue('llm-bg-size', readStyle(snapshot, 'background-size'));
  setValue('llm-bg-position', readStyle(snapshot, 'background-position'));
  setRangeValue('llm-opacity', readStyle(snapshot, 'opacity') || '1');

  setValue('llm-margin-top', readNumeric(snapshot, 'margin-top'));
  setValue('llm-margin-right', readNumeric(snapshot, 'margin-right'));
  setValue('llm-margin-bottom', readNumeric(snapshot, 'margin-bottom'));
  setValue('llm-margin-left', readNumeric(snapshot, 'margin-left'));

  setValue('llm-padding-top', readNumeric(snapshot, 'padding-top'));
  setValue('llm-padding-right', readNumeric(snapshot, 'padding-right'));
  setValue('llm-padding-bottom', readNumeric(snapshot, 'padding-bottom'));
  setValue('llm-padding-left', readNumeric(snapshot, 'padding-left'));

  setValue('llm-display', readStyle(snapshot, 'display'));
  setValue('llm-gap', readNumeric(snapshot, 'gap'));
  setValue('llm-flex-direction', readStyle(snapshot, 'flex-direction'));
  setValue('llm-justify', readStyle(snapshot, 'justify-content'));
  setValue('llm-align', readStyle(snapshot, 'align-items'));

  setValue('llm-width', readStyle(snapshot, 'width'));
  setValue('llm-height', readStyle(snapshot, 'height'));
  setValue('llm-max-width', readStyle(snapshot, 'max-width'));
  setValue('llm-max-height', readStyle(snapshot, 'max-height'));
  setValue('llm-min-width', readStyle(snapshot, 'min-width'));
  setValue('llm-min-height', readStyle(snapshot, 'min-height'));

  setValue('llm-border-width', readNumeric(snapshot, 'border-width'));
  setValue('llm-border-style', readStyle(snapshot, 'border-style'));
  setValue('llm-border-radius', readNumeric(snapshot, 'border-radius'));

  const boxShadow = readStyle(snapshot, 'box-shadow');
  setValue('llm-box-shadow', boxShadow === 'none' ? '' : boxShadow);
}

function populateChildren(children: ManualEditorState['children']): void {
  const container = document.getElementById('llm-children');
  if (!container) {
    return;
  }

  container.innerHTML = '';

  if (children.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No child elements to display.';
    container.append(empty);
    return;
  }

  children.forEach((child) => {
    const row = document.createElement('div');
    row.className = 'llm-child-row';

    const label = document.createElement('div');
    label.className = 'llm-child-label';
    label.textContent = child.descriptor;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'secondary';
    button.textContent = 'Edit';
    button.addEventListener('click', async () => {
      await sendManualCommand({ type: 'MANUAL_SELECT_CHILD', index: child.index });
    });

    row.append(label, button);
    container.append(row);
  });
}

function clearChildren(): void {
  const container = document.getElementById('llm-children');
  if (container) {
    container.innerHTML = '';
  }
}

function setValue(id: string, value: string): void {
  const element = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
  if (!element) {
    return;
  }

  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    element.value = value ?? '';
  } else if (element instanceof HTMLSelectElement) {
    element.value = value ?? '';
  }
}

function setRangeValue(id: string, value: string): void {
  const element = document.getElementById(id) as HTMLInputElement | null;
  if (element) {
    element.value = value ?? '1';
  }
}

function readStyle(snapshot: ElementSnapshot | null, property: string): string {
  if (!snapshot) {
    return '';
  }

  const inline = snapshot.inlineStyles[property];
  if (inline) {
    return inline;
  }

  return snapshot.computed[property] ?? '';
}

function readNumeric(snapshot: ElementSnapshot | null, property: string): string {
  const value = readStyle(snapshot, property);
  if (!value) {
    return '';
  }

  const numeric = Number.parseFloat(value);
  if (Number.isNaN(numeric)) {
    return '';
  }

  return String(numeric);
}

function normalizeColor(value: string): string {
  if (!value) {
    return '#000000';
  }

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return value;
  }

  ctx.fillStyle = value;
  const normalized = ctx.fillStyle as string;
  if (normalized.startsWith('#') && normalized.length === 9) {
    return normalized.slice(0, 7);
  }

  return normalized;
}

async function sendManualCommand<T>(command: Command): Promise<Result<T>> {
  if (activeTabId === null) {
    return Err(new Error('No active tab for manual mode'));
  }

  return ChromeMessaging.sendToContent<T>(activeTabId, command);
}

function setStatus(message: string, tone: 'info' | 'success' | 'warning' | 'error'): void {
  if (!statusEl) {
    statusEl = document.getElementById('llm-status');
  }

  if (!statusEl) {
    return;
  }

  statusEl.textContent = message;

  statusEl.dataset.tone = tone;
}

void init();
