import { Err, Ok, type Result } from '../types/common';

interface ElementSnapshot {
  text: string;
  background: string;
  color: string;
  fontSize: string;
}

export class ManualEditor {
  private active = false;
  private hoverElement: HTMLElement | null = null;
  private selectedElement: HTMLElement | null = null;
  private highlightBox: HTMLDivElement | null = null;
  private hud: HTMLDivElement | null = null;
  private editorPanel: HTMLDivElement | null = null;
  private styleElement: HTMLStyleElement | null = null;
  private snapshot: ElementSnapshot | null = null;

  private mouseMoveHandler = this.handleMouseMove.bind(this);
  private clickHandler = this.handleClick.bind(this);
  private keyHandler = this.handleKeyDown.bind(this);

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

    this.highlightBox?.remove();
    this.highlightBox = null;

    this.hud?.remove();
    this.hud = null;

    this.editorPanel?.remove();
    this.editorPanel = null;

    this.styleElement?.remove();
    this.styleElement = null;

    return Ok(undefined);
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
        left: 50%;
        transform: translateX(-50%);
        background: #1b2733;
        color: white;
        padding: 10px 16px;
        border-radius: 999px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
        font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
        font-size: 14px;
        z-index: 2147483646;
        display: flex;
        align-items: center;
        gap: 12px;
      }

      #llm-manual-hud button {
        background: #0b84ff;
        color: white;
        border: none;
        border-radius: 999px;
        padding: 6px 12px;
        font-weight: 600;
        cursor: pointer;
      }

      #llm-manual-editor {
        position: fixed;
        top: 60px;
        right: 20px;
        width: 280px;
        background: white;
        border-radius: 12px;
        box-shadow: 0 12px 32px rgba(15, 23, 42, 0.2);
        padding: 16px;
        z-index: 2147483647;
        font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
      }

      #llm-manual-editor h3 {
        margin: 0 0 12px 0;
        font-size: 16px;
      }

      #llm-manual-editor label {
        display: block;
        font-size: 12px;
        font-weight: 600;
        margin-bottom: 4px;
        color: #394867;
      }

      #llm-manual-editor input[type="text"],
      #llm-manual-editor input[type="number"],
      #llm-manual-editor textarea {
        width: 100%;
        margin-bottom: 12px;
        padding: 8px;
        border-radius: 6px;
        border: 1px solid #d0d7e2;
        font-size: 13px;
        font-family: inherit;
      }

      #llm-manual-editor textarea {
        min-height: 80px;
        resize: vertical;
      }

      #llm-manual-editor .button-row {
        display: flex;
        gap: 8px;
        margin-top: 12px;
      }

      #llm-manual-editor button {
        flex: 1;
        padding: 8px;
        border-radius: 6px;
        border: none;
        cursor: pointer;
        font-weight: 600;
      }

      #llm-manual-editor button.primary {
        background: #0b84ff;
        color: white;
      }

      #llm-manual-editor button.secondary {
        background: #eff2f7;
        color: #1b2733;
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
      <span>Hover to highlight, click to edit. Press ESC to exit.</span>
      <button type="button">Exit</button>
    `;

    const exitButton = hud.querySelector('button');
    exitButton?.addEventListener('click', () => this.stop());

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
      this.highlightBox?.style.setProperty('display', 'none');
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
      this.stop();
    }
  }

  private updateHighlight(element: HTMLElement): void {
    const rect = element.getBoundingClientRect();
    const box = this.ensureHighlightBox();

    box.style.display = 'block';
    box.style.top = `${rect.top + window.scrollY}px`;
    box.style.left = `${rect.left + window.scrollX}px`;
    box.style.width = `${rect.width}px`;
    box.style.height = `${rect.height}px`;
  }

  private selectElement(element: HTMLElement): void {
    this.selectedElement = element;
    this.snapshot = {
      text: element.innerText,
      background: element.style.backgroundColor,
      color: element.style.color,
      fontSize: element.style.fontSize,
    };

    this.showEditorPanel();
  }

  private showEditorPanel(): void {
    if (!this.selectedElement) {
      return;
    }

    this.editorPanel?.remove();

    const panel = document.createElement('div');
    panel.id = 'llm-manual-editor';

    const tagName = this.selectedElement.tagName.toLowerCase();
    const classList = Array.from(this.selectedElement.classList).join('.');
    const descriptor = classList ? `${tagName}.${classList}` : tagName;

    const text = this.selectedElement.innerText;
    const background = this.selectedElement.style.backgroundColor || '#ffffff';
    const color = this.selectedElement.style.color || '#000000';
    const fontSize = parseInt(this.selectedElement.style.fontSize, 10) || 16;

    panel.innerHTML = `
      <h3>Editing <code>${descriptor}</code></h3>
      <label for="llm-text">Inner text</label>
      <textarea id="llm-text">${text}</textarea>

      <label for="llm-text-color">Text color</label>
      <input id="llm-text-color" type="color" value="${this.normalizeColor(color)}" />

      <label for="llm-bg-color">Background color</label>
      <input id="llm-bg-color" type="color" value="${this.normalizeColor(background)}" />

      <label for="llm-font-size">Font size (px)</label>
      <input id="llm-font-size" type="number" min="10" max="72" value="${fontSize}" />

      <div class="button-row">
        <button type="button" class="secondary" data-action="reset">Reset</button>
        <button type="button" class="primary" data-action="apply">Apply</button>
      </div>
    `;

    panel.querySelector('[data-action="apply"]')?.addEventListener('click', () => this.applyChanges(panel));
    panel.querySelector('[data-action="reset"]')?.addEventListener('click', () => this.resetChanges(panel));

    document.body.appendChild(panel);
    this.editorPanel = panel;
  }

  private applyChanges(panel: HTMLDivElement): void {
    if (!this.selectedElement) {
      return;
    }

    const textInput = panel.querySelector<HTMLTextAreaElement>('#llm-text');
    const textColorInput = panel.querySelector<HTMLInputElement>('#llm-text-color');
    const bgColorInput = panel.querySelector<HTMLInputElement>('#llm-bg-color');
    const fontSizeInput = panel.querySelector<HTMLInputElement>('#llm-font-size');

    if (textInput) {
      this.selectedElement.innerText = textInput.value;
    }

    if (textColorInput) {
      this.selectedElement.style.color = textColorInput.value;
    }

    if (bgColorInput) {
      this.selectedElement.style.backgroundColor = bgColorInput.value;
    }

    if (fontSizeInput) {
      const size = Number(fontSizeInput.value);
      if (!Number.isNaN(size) && size > 0) {
        this.selectedElement.style.fontSize = `${size}px`;
      }
    }
  }

  private resetChanges(panel: HTMLDivElement): void {
    if (!this.selectedElement || !this.snapshot) {
      return;
    }

    this.selectedElement.innerText = this.snapshot.text;
    this.selectedElement.style.backgroundColor = this.snapshot.background;
    this.selectedElement.style.color = this.snapshot.color;
    this.selectedElement.style.fontSize = this.snapshot.fontSize;

    panel.querySelector<HTMLTextAreaElement>('#llm-text')!.value = this.snapshot.text;
    panel.querySelector<HTMLInputElement>('#llm-text-color')!.value = this.normalizeColor(this.snapshot.color || '#000000');
    panel.querySelector<HTMLInputElement>('#llm-bg-color')!.value = this.normalizeColor(this.snapshot.background || '#ffffff');
    const fontSize = parseInt(this.snapshot.fontSize, 10) || 16;
    panel.querySelector<HTMLInputElement>('#llm-font-size')!.value = String(fontSize);
  }

  private normalizeColor(color: string): string {
    const ctx = document.createElement('canvas').getContext('2d');
    if (!ctx) {
      return '#000000';
    }

    ctx.fillStyle = color || '#000000';
    return ctx.fillStyle as string;
  }

  private isManualUI(node: HTMLElement): boolean {
    if (node.id === 'llm-manual-editor' || node.id === 'llm-manual-hud') {
      return true;
    }

    return Boolean(node.closest('#llm-manual-editor') || node.closest('#llm-manual-hud'));
  }
}
