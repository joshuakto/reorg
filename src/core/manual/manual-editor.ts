import { Err, Ok, type Command, type Result } from '../types/common';
import type { ManualLayoutSnapshot } from '../storage/schema';
import type { ElementSnapshot, ManualChildDescriptor, ManualEditorState } from './types';

const SNAPSHOT_PROPERTIES = [
  'background-color',
  'color',
  'font-size',
  'font-family',
  'font-weight',
  'line-height',
  'letter-spacing',
  'text-transform',
  'text-align',
  'display',
  'flex-direction',
  'justify-content',
  'align-items',
  'gap',
  'width',
  'height',
  'max-width',
  'max-height',
  'min-width',
  'min-height',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'border-width',
  'border-style',
  'border-color',
  'border-radius',
  'box-shadow',
  'background-image',
  'background-size',
  'background-repeat',
  'background-position',
  'opacity',
];

export class ManualEditor {
  private active = false;
  private hoverElement: HTMLElement | null = null;
  private selectedElement: HTMLElement | null = null;
  private highlightBox: HTMLDivElement | null = null;
  private hud: HTMLDivElement | null = null;
  private styleElement: HTMLStyleElement | null = null;
  private snapshot: ElementSnapshot | null = null;

  private mouseMoveHandler = this.handleMouseMove.bind(this);
  private clickHandler = this.handleClick.bind(this);
  private keyHandler = this.handleKeyDown.bind(this);
  private resizeHandler = this.handleWindowResize.bind(this);
  private scrollHandler = this.handleScroll.bind(this);

  start(): Result<void> {
    if (this.active) {
      return Ok(undefined);
    }

    this.active = true;
    this.injectStyles();
    this.createHud();

    document.addEventListener('mousemove', this.mouseMoveHandler, true);
    document.addEventListener('click', this.clickHandler, true);
    document.addEventListener('keydown', this.keyHandler, true);
    document.addEventListener('scroll', this.scrollHandler, true);
    window.addEventListener('resize', this.resizeHandler);

    this.selectedElement = null;
    this.snapshot = null;
    this.highlightBox?.style.setProperty('display', 'none');
    this.broadcastState();

    return Ok(undefined);
  }

  stop(): Result<void> {
    if (!this.active) {
      return Err(new Error('Manual mode is not active'));
    }

    this.active = false;
    this.hoverElement = null;
    this.selectedElement = null;
    this.snapshot = null;

    document.removeEventListener('mousemove', this.mouseMoveHandler, true);
    document.removeEventListener('click', this.clickHandler, true);
    document.removeEventListener('keydown', this.keyHandler, true);
    document.removeEventListener('scroll', this.scrollHandler, true);
    window.removeEventListener('resize', this.resizeHandler);

    this.highlightBox?.remove();
    this.highlightBox = null;

    this.hud?.remove();
    this.hud = null;

    this.styleElement?.remove();
    this.styleElement = null;

    this.broadcastState();

    return Ok(undefined);
  }

  getState(): Result<ManualEditorState> {
    return Ok(this.buildState());
  }

  setText(value: string): Result<void> {
    if (!this.selectedElement) {
      return Err(new Error('No element selected'));
    }

    if (this.selectedElement instanceof HTMLInputElement || this.selectedElement instanceof HTMLTextAreaElement) {
      this.selectedElement.value = value;
      if (this.selectedElement instanceof HTMLInputElement) {
        if (value) {
          this.selectedElement.setAttribute('value', value);
        } else {
          this.selectedElement.removeAttribute('value');
        }
      }
    } else {
      this.selectedElement.textContent = value;
    }

    if (this.selectedElement) {
      this.updateHighlight(this.selectedElement);
    }

    this.broadcastState();
    return Ok(undefined);
  }

  setAttribute(name: string, value: string): Result<void> {
    if (!this.selectedElement) {
      return Err(new Error('No element selected'));
    }

    if (!value) {
      this.selectedElement.removeAttribute(name);
    } else {
      this.selectedElement.setAttribute(name, value);
    }

    if (this.selectedElement) {
      this.updateHighlight(this.selectedElement);
    }

    this.broadcastState();
    return Ok(undefined);
  }

  setStyle(property: string, value: string): Result<void> {
    if (!this.selectedElement) {
      return Err(new Error('No element selected'));
    }

    if (value) {
      this.selectedElement.style.setProperty(property, value);
    } else {
      this.selectedElement.style.removeProperty(property);
    }

    if (this.selectedElement) {
      this.updateHighlight(this.selectedElement);
    }

    this.broadcastState();
    return Ok(undefined);
  }

  selectParent(): Result<void> {
    if (!this.selectedElement) {
      return Err(new Error('No element selected'));
    }

    const parent = this.selectedElement.parentElement;
    if (!parent) {
      return Err(new Error('No parent element available'));
    }

    this.selectElement(parent);
    return Ok(undefined);
  }

  selectChild(index: number): Result<void> {
    if (!this.selectedElement) {
      return Err(new Error('No element selected'));
    }

    const children = Array.from(this.selectedElement.children).filter(
      (node): node is HTMLElement => node instanceof HTMLElement,
    );

    const child = children[index];
    if (!child) {
      return Err(new Error('Child index out of range'));
    }

    this.selectElement(child);
    return Ok(undefined);
  }

  reset(): Result<void> {
    if (!this.selectedElement || !this.snapshot) {
      return Err(new Error('Nothing to reset'));
    }

    const target = this.selectedElement;

    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      const value = this.snapshot.value ?? '';
      target.value = value;
      if (target instanceof HTMLInputElement) {
        if (value) {
          target.setAttribute('value', value);
        } else {
          target.removeAttribute('value');
        }
      }
    } else {
      target.textContent = this.snapshot.text;
    }

    if (this.snapshot.styleAttribute === null) {
      target.removeAttribute('style');
    } else {
      target.setAttribute('style', this.snapshot.styleAttribute);
    }

    const currentAttributes = Array.from(target.attributes).map((attr) => attr.name);
    currentAttributes.forEach((name) => {
      if (name === 'style') {
        return;
      }
      if (!(name in this.snapshot!.attributes)) {
        target.removeAttribute(name);
      }
    });

    Object.entries(this.snapshot.attributes).forEach(([name, value]) => {
      if (name === 'style') {
        return;
      }
      target.setAttribute(name, value);
    });

    this.updateHighlight(target);
    this.broadcastState();
    return Ok(undefined);
  }

  async saveLayout(): Promise<Result<void>> {
    if (!this.selectedElement) {
      return Err(new Error('No element selected'));
    }

    const layout: ManualLayoutSnapshot = {
      version: 1,
      domain: window.location.hostname,
      url: window.location.href,
      title: document.title,
      html: document.documentElement.outerHTML,
      capturedAt: Date.now(),
      viewport: { width: window.innerWidth, height: window.innerHeight },
    };

    const result = await this.sendCommand<void>({
      type: 'SAVE_MANUAL_LAYOUT',
      layout,
    });

    if (result.success) {
      this.snapshot = this.selectedElement ? this.createSnapshot(this.selectedElement) : null;
      this.broadcastState();
    }

    return result;
  }

  private injectStyles(): void {
    if (this.styleElement) {
      return;
    }

    const style = document.createElement('style');
    style.textContent = `
      #llm-manual-hud {
        position: fixed;
        top: 12px;
        right: 12px;
        background: rgba(15, 23, 42, 0.9);
        color: #f8fafc;
        padding: 10px 16px;
        border-radius: 999px;
        box-shadow: 0 16px 32px rgba(15, 23, 42, 0.28);
        font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
        font-size: 13px;
        z-index: 2147483646;
        display: flex;
        align-items: center;
        gap: 12px;
        backdrop-filter: blur(12px);
      }

      #llm-manual-hud strong {
        font-weight: 700;
      }

      #llm-manual-hud button {
        background: #0b84ff;
        color: #f8fafc;
        border: none;
        border-radius: 999px;
        padding: 6px 12px;
        font-weight: 600;
        cursor: pointer;
        transition: background-color 0.2s ease, transform 0.15s ease;
      }

      #llm-manual-hud button:hover,
      #llm-manual-hud button:focus-visible {
        background: #096dd9;
        outline: none;
      }

      @media (prefers-color-scheme: light) {
        #llm-manual-hud {
          background: rgba(15, 23, 42, 0.12);
          color: #0f172a;
          border: 1px solid rgba(15, 23, 42, 0.08);
        }

        #llm-manual-hud button {
          background: #2563eb;
          color: #ffffff;
        }
      }
    `;
    document.head.appendChild(style);
    this.styleElement = style;
  }

  private createHud(): void {
    const hud = document.createElement('div');
    hud.id = 'llm-manual-hud';
    hud.innerHTML = `
      <strong>Manual editor active</strong>
      <span>Hover to highlight, click to select. Press ESC to exit.</span>
      <button type="button">Exit</button>
    `;

    const exitButton = hud.querySelector('button');
    exitButton?.addEventListener('click', () => {
      void this.stop();
    });

    document.body.appendChild(hud);
    this.hud = hud;
  }

  private ensureHighlightBox(): HTMLDivElement {
    if (this.highlightBox) {
      return this.highlightBox;
    }

    const box = document.createElement('div');
    box.style.position = 'fixed';
    box.style.pointerEvents = 'none';
    box.style.border = '2px solid #0b84ff';
    box.style.boxShadow = '0 0 0 4px rgba(11, 132, 255, 0.25)';
    box.style.borderRadius = '4px';
    box.style.zIndex = '2147483645';
    box.style.transition = 'all 0.08s ease';

    document.body.appendChild(box);
    this.highlightBox = box;
    return box;
  }

  private handleMouseMove(event: MouseEvent): void {
    if (!this.active) {
      return;
    }

    const target = event.target as HTMLElement | null;
    if (!target || this.isManualUI(target)) {
      this.hoverElement = null;
      if (this.selectedElement) {
        this.updateHighlight(this.selectedElement);
      } else {
        this.highlightBox?.style.setProperty('display', 'none');
      }
      return;
    }

    this.hoverElement = target;
    this.updateHighlight(target);
  }

  private handleClick(event: MouseEvent): void {
    if (!this.active) {
      return;
    }

    const target = event.target as HTMLElement | null;
    if (!target || this.isManualUI(target)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    this.selectElement(target);
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (!this.active) {
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      void this.stop();
    }
  }

  private handleWindowResize(): void {
    const target = this.hoverElement ?? this.selectedElement;
    if (target) {
      this.updateHighlight(target);
    }
  }

  private handleScroll(): void {
    if (!this.active) {
      return;
    }

    const target = this.hoverElement ?? this.selectedElement;
    if (target) {
      this.updateHighlight(target);
    }
  }

  private selectElement(element: HTMLElement): void {
    this.selectedElement = element;
    this.snapshot = this.createSnapshot(element);
    this.updateHighlight(element);
    this.broadcastState();
  }

  private updateHighlight(element: HTMLElement): void {
    const rect = element.getBoundingClientRect();
    const box = this.ensureHighlightBox();

    if (rect.width === 0 && rect.height === 0) {
      box.style.setProperty('display', 'none');
      return;
    }

    box.style.display = 'block';
    box.style.top = `${rect.top}px`;
    box.style.left = `${rect.left}px`;
    box.style.width = `${rect.width}px`;
    box.style.height = `${rect.height}px`;
  }

  private createSnapshot(element: HTMLElement): ElementSnapshot {
    const computed = window.getComputedStyle(element);
    const computedMap: Record<string, string> = {};
    const inlineStyles: Record<string, string> = {};

    for (const key of SNAPSHOT_PROPERTIES) {
      computedMap[key] = computed.getPropertyValue(key);
      inlineStyles[key] = element.style.getPropertyValue(key) ?? '';
    }

    const attributes: Record<string, string> = {};
    Array.from(element.attributes).forEach((attr) => {
      attributes[attr.name] = attr.value;
    });

    const value =
      element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
        ? element.value
        : null;

    return {
      text: element.textContent ?? '',
      value,
      styleAttribute: element.getAttribute('style'),
      attributes,
      inlineStyles,
      computed: computedMap,
    };
  }

  private buildState(): ManualEditorState {
    const descriptor = this.selectedElement ? this.describeElement(this.selectedElement) : null;
    return {
      active: this.active,
      descriptor,
      snapshot: this.selectedElement ? this.createSnapshot(this.selectedElement) : null,
      children: this.selectedElement ? this.describeChildren(this.selectedElement) : [],
      theme: this.prefersLightTheme() ? 'light' : 'dark',
    };
  }

  private describeChildren(element: HTMLElement): ManualChildDescriptor[] {
    const children = Array.from(element.children).filter(
      (node): node is HTMLElement => node instanceof HTMLElement,
    );

    return children.map((child, index) => ({
      index,
      descriptor: this.describeElement(child),
    }));
  }

  private prefersLightTheme(): boolean {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
  }

  private describeElement(element: HTMLElement): string {
    const tag = element.tagName.toLowerCase();
    const id = element.id ? `#${element.id}` : '';
    const classes = element.classList.length ? `.${Array.from(element.classList).join('.')}` : '';
    return `${tag}${id}${classes}`;
  }

  private isManualUI(node: HTMLElement): boolean {
    if (node.id === 'llm-manual-hud') {
      return true;
    }

    return Boolean(node.closest('#llm-manual-hud'));
  }

  private broadcastState(): void {
    const payload = this.buildState();
    if (!chrome?.runtime?.sendMessage) {
      return;
    }

    try {
      chrome.runtime.sendMessage({ type: 'MANUAL_STATE_UPDATED', payload });
    } catch (error) {
      console.error('[ManualEditor] Failed to broadcast state', error);
    }
  }

  private sendCommand<T>(command: Command): Promise<Result<T>> {
    return new Promise((resolve) => {
      if (!chrome?.runtime?.sendMessage) {
        resolve(Err(new Error('Manual layout saving is unavailable in this context.')));
        return;
      }

      chrome.runtime.sendMessage(command, (response) => {
        if (chrome.runtime.lastError) {
          resolve(Err(new Error(chrome.runtime.lastError.message)));
        } else {
          resolve(response as Result<T>);
        }
      });
    });
  }
}
