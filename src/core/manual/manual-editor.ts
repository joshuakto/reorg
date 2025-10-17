import { Err, Ok, type Command, type Result } from '../types/common';
import type { ManualLayoutSnapshot } from '../storage/schema';

interface ElementSnapshot {
  text: string;
  style: string | null;
  attributes: Record<string, string>;
  computed: Record<string, string>;
}

type PanelDock = 'floating' | 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';

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
];

export class ManualEditor {
  private active = false;
  private hoverElement: HTMLElement | null = null;
  private selectedElement: HTMLElement | null = null;
  private highlightBox: HTMLDivElement | null = null;
  private hud: HTMLDivElement | null = null;
  private editorPanel: HTMLDivElement | null = null;
  private styleElement: HTMLStyleElement | null = null;
  private snapshot: ElementSnapshot | null = null;
  private panelOpacity = 0.95;
  private dockState: PanelDock = 'floating';
  private panelPosition: { x: number; y: number } = { x: window.innerWidth - 460, y: 80 };
  private panelSize: { width: number; height: number } = { width: 360, height: 0 };
  private dragOffset: { x: number; y: number } = { x: 0, y: 0 };
  private toastTimeout: number | null = null;
  private toastElement: HTMLDivElement | null = null;

  private mouseMoveHandler = this.handleMouseMove.bind(this);
  private clickHandler = this.handleClick.bind(this);
  private keyHandler = this.handleKeyDown.bind(this);
  private resizeHandler = this.handleWindowResize.bind(this);

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
    window.addEventListener('resize', this.resizeHandler);

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
    window.removeEventListener('resize', this.resizeHandler);

    this.highlightBox?.remove();
    this.highlightBox = null;

    this.hud?.remove();
    this.hud = null;

    this.editorPanel?.remove();
    this.editorPanel = null;

    this.styleElement?.remove();
    this.styleElement = null;
    this.toastElement = null;

    if (this.toastTimeout) {
      window.clearTimeout(this.toastTimeout);
      this.toastTimeout = null;
    }

    return Ok(undefined);
  }

  private injectStyles(): void {
    if (this.styleElement) {
      return;
    }

    const style = document.createElement('style');
    style.textContent = `
      :root {
        --llm-manual-panel-bg: rgba(15, 23, 42, 0.92);
        --llm-manual-panel-border: rgba(148, 163, 184, 0.3);
        --llm-manual-panel-color: #e2e8f0;
        --llm-manual-input-bg: rgba(15, 23, 42, 0.6);
      }

      #llm-manual-hud {
        position: fixed;
        top: 12px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(15, 23, 42, 0.9);
        color: #f8fafc;
        padding: 10px 16px;
        border-radius: 999px;
        box-shadow: 0 16px 32px rgba(15, 23, 42, 0.28);
        font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
        font-size: 14px;
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

      #llm-manual-editor {
        position: fixed;
        inset: auto 40px 40px auto;
        width: min(420px, 40vw);
        max-height: min(75vh, 660px);
        background: var(--llm-manual-panel-bg);
        color: var(--llm-manual-panel-color);
        border-radius: 16px;
        border: 1px solid var(--llm-manual-panel-border);
        box-shadow: 0 24px 50px rgba(2, 6, 23, 0.5);
        padding: 0;
        z-index: 2147483647;
        font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        backdrop-filter: blur(18px);
      }

      #llm-manual-editor[data-docked="top-left"],
      #llm-manual-editor[data-docked="top-right"],
      #llm-manual-editor[data-docked="bottom-left"],
      #llm-manual-editor[data-docked="bottom-right"] {
        width: min(420px, 40vw);
      }

      #llm-manual-editor .llm-editor-header {
        cursor: grab;
        padding: 16px 20px;
        background: rgba(15, 23, 42, 0.75);
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        border-bottom: 1px solid var(--llm-manual-panel-border);
      }

      #llm-manual-editor .llm-editor-header:active {
        cursor: grabbing;
      }

      #llm-manual-editor .llm-editor-title {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      #llm-manual-editor .llm-editor-title strong {
        font-size: 15px;
        font-weight: 600;
      }

      #llm-manual-editor code {
        font-family: 'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
          'Liberation Mono', 'Courier New', monospace;
        font-size: 12px;
        background: rgba(148, 163, 184, 0.2);
        color: inherit;
        padding: 2px 6px;
        border-radius: 6px;
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }

      #llm-manual-editor .llm-editor-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        justify-content: flex-end;
      }

      #llm-manual-editor button {
        border-radius: 8px;
        border: none;
        cursor: pointer;
        font-weight: 600;
        font-size: 12px;
        padding: 8px 12px;
        transition: background-color 0.2s ease, transform 0.15s ease, color 0.2s ease;
      }

      #llm-manual-editor button.primary {
        background: #3b82f6;
        color: #f8fafc;
      }

      #llm-manual-editor button.secondary {
        background: rgba(148, 163, 184, 0.18);
        color: inherit;
      }

      #llm-manual-editor button.ghost {
        background: transparent;
        color: inherit;
        border: 1px solid rgba(148, 163, 184, 0.35);
      }

      #llm-manual-editor button:hover,
      #llm-manual-editor button:focus-visible {
        outline: none;
        filter: brightness(1.08);
      }

      #llm-manual-editor .llm-editor-body {
        padding: 16px 20px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      #llm-manual-editor label {
        display: flex;
        flex-direction: column;
        gap: 4px;
        font-size: 12px;
        font-weight: 600;
        color: rgba(226, 232, 240, 0.95);
      }

      #llm-manual-editor input[type="text"],
      #llm-manual-editor input[type="number"],
      #llm-manual-editor input[type="range"],
      #llm-manual-editor input[type="color"],
      #llm-manual-editor textarea,
      #llm-manual-editor select {
        width: 100%;
        border-radius: 8px;
        border: 1px solid rgba(148, 163, 184, 0.35);
        background: var(--llm-manual-input-bg);
        color: inherit;
        font-size: 13px;
        font-family: inherit;
        padding: 7px 10px;
        box-shadow: inset 0 1px 2px rgba(15, 23, 42, 0.25);
      }

      #llm-manual-editor input[type="color"] {
        padding: 0;
        height: 32px;
      }

      #llm-manual-editor input[type="range"] {
        padding: 0;
        height: 6px;
      }

      #llm-manual-editor textarea {
        min-height: 80px;
        resize: vertical;
      }

      #llm-manual-editor select {
        appearance: none;
        padding-right: 28px;
        background-image: linear-gradient(45deg, transparent 50%, currentColor 50%),
          linear-gradient(135deg, currentColor 50%, transparent 50%);
        background-position: calc(100% - 18px) calc(1.1em), calc(100% - 13px) calc(1.1em);
        background-size: 5px 5px, 5px 5px;
        background-repeat: no-repeat;
      }

      #llm-manual-editor .llm-section {
        border: 1px solid rgba(148, 163, 184, 0.28);
        border-radius: 12px;
        padding: 14px 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        background: rgba(15, 23, 42, 0.55);
      }

      #llm-manual-editor .llm-section header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 13px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: rgba(226, 232, 240, 0.76);
      }

      #llm-manual-editor .llm-grid {
        display: grid;
        gap: 10px;
      }

      #llm-manual-editor .llm-grid.cols-2 {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      #llm-manual-editor .llm-grid.cols-4 {
        grid-template-columns: repeat(4, minmax(0, 1fr));
      }

      #llm-manual-editor .llm-children {
        display: flex;
        flex-direction: column;
        gap: 6px;
        max-height: 180px;
        overflow-y: auto;
      }

      #llm-manual-editor .llm-child-row {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 10px;
        border-radius: 8px;
        background: rgba(30, 41, 59, 0.45);
        border: 1px solid transparent;
      }

      #llm-manual-editor .llm-child-row[draggable="true"] {
        cursor: grab;
      }

      #llm-manual-editor .llm-child-row.dragging {
        opacity: 0.6;
      }

      #llm-manual-editor .llm-child-row.drop-target {
        border-color: #3b82f6;
        box-shadow: inset 0 0 0 1px rgba(59, 130, 246, 0.45);
      }

      #llm-manual-editor .llm-child-row button {
        flex-shrink: 0;
      }

      #llm-manual-editor .llm-child-row .llm-child-label {
        flex: 1;
        font-size: 12px;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      #llm-manual-editor .llm-footer {
        padding: 14px 20px;
        border-top: 1px solid var(--llm-manual-panel-border);
        display: flex;
        flex-direction: column;
        gap: 10px;
        background: rgba(15, 23, 42, 0.68);
      }

      #llm-manual-editor .llm-footer .llm-footer-row {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      #llm-manual-editor .llm-footer .llm-footer-row input[type="range"] {
        flex: 1;
      }

      #llm-manual-editor .llm-resize-handle {
        position: absolute;
        bottom: 6px;
        right: 6px;
        width: 14px;
        height: 14px;
        border-radius: 4px;
        border: 1px solid rgba(148, 163, 184, 0.45);
        background: rgba(148, 163, 184, 0.2);
        cursor: se-resize;
      }

      #llm-manual-editor .llm-toast {
        position: absolute;
        inset: auto 50% 16px auto;
        transform: translateX(50%);
        background: rgba(30, 41, 59, 0.92);
        color: #f8fafc;
        padding: 10px 14px;
        border-radius: 10px;
        box-shadow: 0 10px 30px rgba(2, 6, 23, 0.65);
        font-size: 12px;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.2s ease;
      }

      #llm-manual-editor .llm-toast.visible {
        opacity: 1;
      }

      #llm-manual-editor[data-theme="light"] {
        --llm-manual-panel-bg: rgba(248, 250, 252, 0.96);
        --llm-manual-panel-border: rgba(148, 163, 184, 0.35);
        --llm-manual-panel-color: #0f172a;
        --llm-manual-input-bg: rgba(255, 255, 255, 0.95);
        box-shadow: 0 24px 50px rgba(15, 23, 42, 0.2);
      }

      #llm-manual-editor[data-theme="light"] .llm-section {
        background: rgba(248, 250, 252, 0.92);
      }

      #llm-manual-editor[data-theme="light"] .llm-child-row {
        background: rgba(226, 232, 240, 0.65);
        color: #0f172a;
      }

      #llm-manual-editor[data-theme="light"] .llm-editor-header {
        background: rgba(255, 255, 255, 0.92);
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
    this.snapshot = this.createSnapshot(element);
    this.updateHighlight(element);
    this.showEditorPanel();
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

  private createSnapshot(element: HTMLElement): ElementSnapshot {
    const computed = window.getComputedStyle(element);
    const computedMap: Record<string, string> = {};
    for (const key of SNAPSHOT_PROPERTIES) {
      computedMap[key] = computed.getPropertyValue(key);
    }

    const attributes: Record<string, string> = {};
    Array.from(element.attributes).forEach((attr) => {
      attributes[attr.name] = attr.value;
    });

    return {
      text: element.textContent ?? '',
      style: element.getAttribute('style'),
      attributes,
      computed: computedMap,
    };
  }

  private showEditorPanel(): void {
    if (!this.selectedElement) {
      return;
    }

    this.editorPanel?.remove();

    const panel = document.createElement('div');
    panel.id = 'llm-manual-editor';
    panel.dataset.theme = this.prefersLightTheme() ? 'light' : 'dark';
    panel.dataset.docked = this.dockState;
    panel.style.opacity = `${this.panelOpacity}`;

    const descriptor = this.describeElement(this.selectedElement);

    const header = document.createElement('div');
    header.className = 'llm-editor-header';
    header.innerHTML = `
      <div class="llm-editor-title">
        <strong>Editing element</strong>
        <code>${descriptor}</code>
      </div>
      <div class="llm-editor-actions">
        <button type="button" class="ghost" data-action="jump-parent">Parent</button>
        <button type="button" class="secondary" data-action="reset">Reset</button>
        <button type="button" class="primary" data-action="save">Save layout</button>
      </div>
    `;

    const body = document.createElement('div');
    body.className = 'llm-editor-body';

    body.append(
      this.buildContentSection(),
      this.buildTypographySection(),
      this.buildColorSection(),
      this.buildSpacingSection(),
      this.buildLayoutSection(),
      this.buildBorderSection(),
      this.buildEffectsSection(),
      this.buildChildrenSection(),
    );

    const footer = document.createElement('div');
    footer.className = 'llm-footer';
    footer.innerHTML = `
      <div class="llm-footer-row">
        <label>Panel transparency
          <input id="llm-panel-opacity" type="range" min="0.4" max="1" step="0.05" value="${this.panelOpacity}" />
        </label>
      </div>
      <div class="llm-footer-row">
        <button type="button" class="secondary" data-action="dock">Dock</button>
        <button type="button" class="secondary" data-action="toggle-theme">Theme</button>
      </div>
      <div class="llm-footer-row">
        <span style="font-size:11px; opacity:0.75;">Drag the header to move, resize from the corner.</span>
      </div>
    `;

    const toast = document.createElement('div');
    toast.className = 'llm-toast';
    toast.textContent = 'Saved layout to extension storage';

    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'llm-resize-handle';

    panel.append(header, body, footer, toast, resizeHandle);

    document.body.appendChild(panel);
    this.editorPanel = panel;
    this.toastElement = toast;

    this.attachPanelInteractivity(panel, header, resizeHandle);
    this.populateInputs(panel);
    this.attachControlHandlers(panel);
  }

  private createSection(title: string, action?: HTMLButtonElement): HTMLDivElement {
    const section = document.createElement('div');
    section.className = 'llm-section';

    const header = document.createElement('header');
    header.textContent = title;

    if (action) {
      const wrapper = document.createElement('div');
      wrapper.style.marginLeft = 'auto';
      wrapper.append(action);
      header.append(wrapper);
    }

    section.append(header);
    return section;
  }

  private buildContentSection(): HTMLDivElement {
    const section = this.createSection('Content');

    const textLabel = document.createElement('label');
    textLabel.textContent = 'Inner text';
    const textarea = document.createElement('textarea');
    textarea.id = 'llm-text';
    textarea.placeholder = 'Edit text content';
    textLabel.append(textarea);
    section.append(textLabel);

    const grid = document.createElement('div');
    grid.className = 'llm-grid cols-2';
    grid.append(
      this.createLabeledInput('ID', 'llm-attr-id'),
      this.createLabeledInput('Class list', 'llm-attr-class'),
      this.createLabeledInput('Title', 'llm-attr-title'),
      this.createLabeledInput('ARIA label', 'llm-attr-aria-label'),
    );

    section.append(grid);
    return section;
  }

  private buildTypographySection(): HTMLDivElement {
    const section = this.createSection('Typography');

    const grid = document.createElement('div');
    grid.className = 'llm-grid cols-2';
    grid.append(
      this.createLabeledInput('Font family', 'llm-font-family'),
      this.createLabeledSelect('Font weight', 'llm-font-weight', [
        ['', 'Default'],
        ['300', 'Light'],
        ['400', 'Normal'],
        ['500', 'Medium'],
        ['600', 'Semibold'],
        ['700', 'Bold'],
        ['800', 'Extra bold'],
      ]),
      this.createNumberInput('Font size (px)', 'llm-font-size', 6, 200, 1),
      this.createNumberInput('Line height', 'llm-line-height', 0, 10, 0.1),
      this.createNumberInput('Letter spacing (px)', 'llm-letter-spacing', -20, 20, 0.5),
      this.createLabeledSelect('Text transform', 'llm-text-transform', [
        ['', 'Default'],
        ['uppercase', 'Uppercase'],
        ['lowercase', 'Lowercase'],
        ['capitalize', 'Capitalize'],
      ]),
      this.createLabeledSelect('Text align', 'llm-text-align', [
        ['', 'Default'],
        ['left', 'Left'],
        ['center', 'Center'],
        ['right', 'Right'],
        ['justify', 'Justify'],
      ]),
    );

    section.append(grid);
    return section;
  }

  private buildColorSection(): HTMLDivElement {
    const section = this.createSection('Color & background');

    const grid = document.createElement('div');
    grid.className = 'llm-grid cols-2';
    grid.append(
      this.createColorInput('Text color', 'llm-text-color'),
      this.createColorInput('Background color', 'llm-bg-color'),
      this.createColorInput('Border color', 'llm-border-color'),
      this.createLabeledInput('Background image', 'llm-bg-image'),
      this.createLabeledInput('Background size', 'llm-bg-size'),
      this.createLabeledInput('Background position', 'llm-bg-position'),
    );

    section.append(grid);

    const opacityLabel = document.createElement('label');
    opacityLabel.textContent = 'Element opacity';
    const opacityRange = document.createElement('input');
    opacityRange.type = 'range';
    opacityRange.id = 'llm-opacity';
    opacityRange.min = '0';
    opacityRange.max = '1';
    opacityRange.step = '0.05';
    opacityLabel.append(opacityRange);
    section.append(opacityLabel);

    return section;
  }

  private buildSpacingSection(): HTMLDivElement {
    const section = this.createSection('Spacing');

    const marginTitle = this.createSubLabel('Margin (px)');
    const marginGrid = document.createElement('div');
    marginGrid.className = 'llm-grid cols-4';
    marginGrid.append(
      this.createNumberInput('Top', 'llm-margin-top', -400, 400, 1),
      this.createNumberInput('Right', 'llm-margin-right', -400, 400, 1),
      this.createNumberInput('Bottom', 'llm-margin-bottom', -400, 400, 1),
      this.createNumberInput('Left', 'llm-margin-left', -400, 400, 1),
    );

    const paddingTitle = this.createSubLabel('Padding (px)');
    const paddingGrid = document.createElement('div');
    paddingGrid.className = 'llm-grid cols-4';
    paddingGrid.append(
      this.createNumberInput('Top', 'llm-padding-top', 0, 400, 1),
      this.createNumberInput('Right', 'llm-padding-right', 0, 400, 1),
      this.createNumberInput('Bottom', 'llm-padding-bottom', 0, 400, 1),
      this.createNumberInput('Left', 'llm-padding-left', 0, 400, 1),
    );

    section.append(marginTitle, marginGrid, paddingTitle, paddingGrid);
    return section;
  }

  private buildLayoutSection(): HTMLDivElement {
    const section = this.createSection('Layout');

    const grid = document.createElement('div');
    grid.className = 'llm-grid cols-2';
    grid.append(
      this.createLabeledSelect('Display', 'llm-display', [
        ['', 'Default'],
        ['block', 'Block'],
        ['inline-block', 'Inline block'],
        ['inline', 'Inline'],
        ['flex', 'Flex'],
        ['inline-flex', 'Inline flex'],
        ['grid', 'Grid'],
      ]),
      this.createNumberInput('Gap (px)', 'llm-gap', 0, 200, 1),
      this.createLabeledSelect('Flex direction', 'llm-flex-direction', [
        ['', 'Default'],
        ['row', 'Row'],
        ['row-reverse', 'Row reverse'],
        ['column', 'Column'],
        ['column-reverse', 'Column reverse'],
      ]),
      this.createLabeledSelect('Justify content', 'llm-justify', [
        ['', 'Default'],
        ['flex-start', 'Start'],
        ['center', 'Center'],
        ['flex-end', 'End'],
        ['space-between', 'Space between'],
        ['space-around', 'Space around'],
        ['space-evenly', 'Space evenly'],
      ]),
      this.createLabeledSelect('Align items', 'llm-align', [
        ['', 'Default'],
        ['stretch', 'Stretch'],
        ['flex-start', 'Start'],
        ['center', 'Center'],
        ['flex-end', 'End'],
        ['baseline', 'Baseline'],
      ]),
      this.createLabeledInput('Width', 'llm-width'),
      this.createLabeledInput('Height', 'llm-height'),
      this.createLabeledInput('Max width', 'llm-max-width'),
      this.createLabeledInput('Max height', 'llm-max-height'),
      this.createLabeledInput('Min width', 'llm-min-width'),
      this.createLabeledInput('Min height', 'llm-min-height'),
    );

    section.append(grid);
    return section;
  }

  private buildBorderSection(): HTMLDivElement {
    const section = this.createSection('Border');

    const grid = document.createElement('div');
    grid.className = 'llm-grid cols-2';
    grid.append(
      this.createNumberInput('Border width (px)', 'llm-border-width', 0, 40, 1),
      this.createLabeledSelect('Border style', 'llm-border-style', [
        ['', 'Default'],
        ['solid', 'Solid'],
        ['dashed', 'Dashed'],
        ['dotted', 'Dotted'],
        ['double', 'Double'],
        ['none', 'None'],
      ]),
      this.createNumberInput('Border radius (px)', 'llm-border-radius', 0, 200, 1),
    );

    section.append(grid);
    return section;
  }

  private buildEffectsSection(): HTMLDivElement {
    const section = this.createSection('Effects');

    const boxShadowLabel = document.createElement('label');
    boxShadowLabel.textContent = 'Box shadow';
    const boxShadowInput = document.createElement('textarea');
    boxShadowInput.id = 'llm-box-shadow';
    boxShadowInput.placeholder = 'e.g. 0 4px 12px rgba(15, 23, 42, 0.12)';
    boxShadowLabel.append(boxShadowInput);

    section.append(boxShadowLabel);
    return section;
  }

  private buildChildrenSection(): HTMLDivElement {
    const refreshBtn = document.createElement('button');
    refreshBtn.type = 'button';
    refreshBtn.className = 'ghost';
    refreshBtn.dataset.action = 'refresh-children';
    refreshBtn.textContent = 'Refresh';

    const section = this.createSection('Structure & children', refreshBtn);
    const description = document.createElement('div');
    description.style.fontSize = '11px';
    description.style.opacity = '0.7';
    description.textContent = 'Drag to reorder children, select to focus.';

    const list = document.createElement('div');
    list.className = 'llm-children';
    list.id = 'llm-children';

    section.append(description, list);
    return section;
  }

  private createLabeledInput(label: string, id: string): HTMLLabelElement {
    const wrapper = document.createElement('label');
    wrapper.textContent = label;
    const input = document.createElement('input');
    input.type = 'text';
    input.id = id;
    wrapper.append(input);
    return wrapper;
  }

  private createLabeledSelect(
    label: string,
    id: string,
    options: Array<[string, string]>,
  ): HTMLLabelElement {
    const wrapper = document.createElement('label');
    wrapper.textContent = label;
    const select = document.createElement('select');
    select.id = id;
    options.forEach(([value, text]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = text;
      select.append(option);
    });
    wrapper.append(select);
    return wrapper;
  }

  private createNumberInput(
    label: string,
    id: string,
    min: number,
    max: number,
    step: number,
  ): HTMLLabelElement {
    const wrapper = document.createElement('label');
    wrapper.textContent = label;
    const input = document.createElement('input');
    input.type = 'number';
    input.id = id;
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    wrapper.append(input);
    return wrapper;
  }

  private createColorInput(label: string, id: string): HTMLLabelElement {
    const wrapper = document.createElement('label');
    wrapper.textContent = label;
    const input = document.createElement('input');
    input.type = 'color';
    input.id = id;
    wrapper.append(input);
    return wrapper;
  }

  private createSubLabel(text: string): HTMLDivElement {
    const div = document.createElement('div');
    div.style.fontSize = '11px';
    div.style.opacity = '0.75';
    div.style.fontWeight = '600';
    div.textContent = text;
    return div;
  }

  private attachPanelInteractivity(
    panel: HTMLDivElement,
    header: HTMLDivElement,
    resizeHandle: HTMLDivElement,
  ): void {
    this.updatePanelFrame(panel);

    const onPointerMove = (event: PointerEvent): void => {
      this.panelPosition = {
        x: event.clientX - this.dragOffset.x,
        y: event.clientY - this.dragOffset.y,
      };
      this.dockState = 'floating';
      panel.dataset.docked = 'floating';
      this.updatePanelFrame(panel);
    };

    const onPointerUp = (event: PointerEvent): void => {
      header.releasePointerCapture(event.pointerId);
      header.removeEventListener('pointermove', onPointerMove);
      header.removeEventListener('pointerup', onPointerUp);
      header.removeEventListener('pointercancel', onPointerUp);
    };

    header.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) {
        return;
      }

      const rect = panel.getBoundingClientRect();
      this.dragOffset = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      header.setPointerCapture(event.pointerId);
      header.addEventListener('pointermove', onPointerMove);
      header.addEventListener('pointerup', onPointerUp);
      header.addEventListener('pointercancel', onPointerUp);
    });

    header.addEventListener('dblclick', () => {
      this.cycleDockState();
      panel.dataset.docked = this.dockState;
      this.updatePanelFrame(panel);
      this.showToast(`Docked to ${this.dockState.replace('-', ' ')}`);
    });

    resizeHandle.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const rect = panel.getBoundingClientRect();
      const startWidth = rect.width;
      const startHeight = rect.height;
      const startX = event.clientX;
      const startY = event.clientY;

      const handleMove = (moveEvent: PointerEvent): void => {
        const width = Math.max(280, startWidth + (moveEvent.clientX - startX));
        const height = Math.max(320, startHeight + (moveEvent.clientY - startY));
        this.panelSize = { width, height };
        panel.style.width = `${width}px`;
        panel.style.height = `${height}px`;
      };

      const handleUp = (upEvent: PointerEvent): void => {
        resizeHandle.releasePointerCapture(upEvent.pointerId);
        resizeHandle.removeEventListener('pointermove', handleMove);
        resizeHandle.removeEventListener('pointerup', handleUp);
        resizeHandle.removeEventListener('pointercancel', handleUp);
      };

      resizeHandle.setPointerCapture(event.pointerId);
      resizeHandle.addEventListener('pointermove', handleMove);
      resizeHandle.addEventListener('pointerup', handleUp);
      resizeHandle.addEventListener('pointercancel', handleUp);
    });
  }

  private cycleDockState(): void {
    const order: PanelDock[] = ['top-right', 'top-left', 'bottom-left', 'bottom-right', 'floating'];
    const currentIndex = order.indexOf(this.dockState);
    const nextIndex = (currentIndex + 1) % order.length;
    this.dockState = order[nextIndex];
  }

  private updatePanelFrame(panel: HTMLDivElement): void {
    panel.style.width = `${Math.max(320, this.panelSize.width)}px`;
    if (this.panelSize.height > 0) {
      panel.style.height = `${Math.max(320, this.panelSize.height)}px`;
    } else {
      panel.style.removeProperty('height');
    }

    if (this.dockState === 'floating') {
      const rect = panel.getBoundingClientRect();
      const maxLeft = Math.max(20, window.innerWidth - rect.width - 20);
      const maxTop = Math.max(60, window.innerHeight - rect.height - 20);
      const left = Math.min(Math.max(20, this.panelPosition.x), maxLeft);
      const top = Math.min(Math.max(60, this.panelPosition.y), maxTop);

      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
      panel.dataset.docked = 'floating';
      this.panelPosition = { x: left, y: top };
    } else {
      this.applyDockPosition(panel);
      panel.dataset.docked = this.dockState;
    }
  }

  private applyDockPosition(panel: HTMLDivElement): void {
    panel.style.left = 'auto';
    panel.style.right = 'auto';
    panel.style.top = 'auto';
    panel.style.bottom = 'auto';

    const offset = 32;
    switch (this.dockState) {
      case 'top-right':
        panel.style.top = `${offset}px`;
        panel.style.right = `${offset}px`;
        break;
      case 'top-left':
        panel.style.top = `${offset}px`;
        panel.style.left = `${offset}px`;
        break;
      case 'bottom-right':
        panel.style.bottom = `${offset}px`;
        panel.style.right = `${offset}px`;
        break;
      case 'bottom-left':
        panel.style.bottom = `${offset}px`;
        panel.style.left = `${offset}px`;
        break;
      default:
        break;
    }
  }

  private populateInputs(panel: HTMLDivElement): void {
    if (!this.selectedElement || !this.snapshot) {
      return;
    }

    const element = this.selectedElement;
    const computed = window.getComputedStyle(element);

    const setValue = <T extends HTMLElement>(selector: string, value: string): void => {
      const control = panel.querySelector<T>(selector);
      if (control) {
        if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) {
          control.value = value;
        } else if (control instanceof HTMLSelectElement) {
          control.value = value;
        }
      }
    };

    setValue<HTMLTextAreaElement>('#llm-text', element.textContent ?? '');
    setValue<HTMLInputElement>('#llm-attr-id', element.id ?? '');
    setValue<HTMLInputElement>('#llm-attr-class', Array.from(element.classList).join(' '));
    setValue<HTMLInputElement>('#llm-attr-title', element.getAttribute('title') ?? '');
    setValue<HTMLInputElement>('#llm-attr-aria-label', element.getAttribute('aria-label') ?? '');

    setValue<HTMLInputElement>('#llm-font-family', this.inlineOrComputed(element.style.fontFamily, computed.fontFamily));
    setValue<HTMLInputElement>('#llm-font-size', this.toNumeric(element.style.fontSize || computed.fontSize));
    setValue<HTMLInputElement>('#llm-line-height', this.toNumeric(element.style.lineHeight || computed.lineHeight));
    setValue<HTMLInputElement>(
      '#llm-letter-spacing',
      this.toNumeric(element.style.letterSpacing || computed.letterSpacing),
    );
    setValue<HTMLSelectElement>('#llm-font-weight', element.style.fontWeight || '');
    setValue<HTMLSelectElement>('#llm-text-transform', element.style.textTransform || '');
    setValue<HTMLSelectElement>('#llm-text-align', element.style.textAlign || '');

    setValue<HTMLInputElement>('#llm-text-color', this.normalizeColor(computed.color));
    setValue<HTMLInputElement>('#llm-bg-color', this.normalizeColor(computed.backgroundColor));
    setValue<HTMLInputElement>('#llm-border-color', this.normalizeColor(computed.borderColor));
    setValue<HTMLInputElement>('#llm-bg-image', this.parseBackgroundImage(computed.backgroundImage));
    setValue<HTMLInputElement>('#llm-bg-size', this.stripNone(computed.backgroundSize));
    setValue<HTMLInputElement>('#llm-bg-position', this.stripNone(computed.backgroundPosition));
    const opacityInput = panel.querySelector<HTMLInputElement>('#llm-opacity');
    if (opacityInput) {
      opacityInput.value = element.style.opacity || computed.opacity || '1';
    }

    setValue<HTMLInputElement>('#llm-margin-top', this.toNumeric(computed.marginTop));
    setValue<HTMLInputElement>('#llm-margin-right', this.toNumeric(computed.marginRight));
    setValue<HTMLInputElement>('#llm-margin-bottom', this.toNumeric(computed.marginBottom));
    setValue<HTMLInputElement>('#llm-margin-left', this.toNumeric(computed.marginLeft));
    setValue<HTMLInputElement>('#llm-padding-top', this.toNumeric(computed.paddingTop));
    setValue<HTMLInputElement>('#llm-padding-right', this.toNumeric(computed.paddingRight));
    setValue<HTMLInputElement>('#llm-padding-bottom', this.toNumeric(computed.paddingBottom));
    setValue<HTMLInputElement>('#llm-padding-left', this.toNumeric(computed.paddingLeft));

    setValue<HTMLSelectElement>('#llm-display', element.style.display || '');
    setValue<HTMLInputElement>('#llm-gap', this.toNumeric(computed.gap));
    setValue<HTMLSelectElement>('#llm-flex-direction', element.style.flexDirection || '');
    setValue<HTMLSelectElement>('#llm-justify', element.style.justifyContent || '');
    setValue<HTMLSelectElement>('#llm-align', element.style.alignItems || '');
    setValue<HTMLInputElement>('#llm-width', element.style.width || '');
    setValue<HTMLInputElement>('#llm-height', element.style.height || '');
    setValue<HTMLInputElement>('#llm-max-width', element.style.maxWidth || '');
    setValue<HTMLInputElement>('#llm-max-height', element.style.maxHeight || '');
    setValue<HTMLInputElement>('#llm-min-width', element.style.minWidth || '');
    setValue<HTMLInputElement>('#llm-min-height', element.style.minHeight || '');

    setValue<HTMLInputElement>('#llm-border-width', this.toNumeric(computed.borderWidth));
    setValue<HTMLSelectElement>('#llm-border-style', element.style.borderStyle || '');
    setValue<HTMLInputElement>('#llm-border-radius', this.toNumeric(computed.borderRadius));

    setValue<HTMLTextAreaElement>('#llm-box-shadow', this.stripNone(computed.boxShadow));

    this.populateChildren(panel);
  }

  private populateChildren(panel: HTMLDivElement): void {
    if (!this.selectedElement) {
      return;
    }

    const container = panel.querySelector<HTMLDivElement>('#llm-children');
    if (!container) {
      return;
    }

    container.innerHTML = '';
    const children = Array.from(this.selectedElement.children).filter(
      (node): node is HTMLElement => node instanceof HTMLElement,
    );

    if (children.length === 0) {
      const empty = document.createElement('div');
      empty.style.fontSize = '11px';
      empty.style.opacity = '0.7';
      empty.textContent = 'No child elements to display.';
      container.append(empty);
      return;
    }

    children.forEach((child, index) => {
      const row = document.createElement('div');
      row.className = 'llm-child-row';
      row.draggable = true;
      row.dataset.index = String(index);

      const label = document.createElement('div');
      label.className = 'llm-child-label';
      label.textContent = this.describeElement(child);

      const selectBtn = document.createElement('button');
      selectBtn.type = 'button';
      selectBtn.className = 'secondary';
      selectBtn.dataset.action = 'select-child';
      selectBtn.dataset.index = String(index);
      selectBtn.textContent = 'Edit';

      row.append(label, selectBtn);
      container.append(row);

      this.attachChildDnD(row);
    });
  }

  private attachChildDnD(row: HTMLDivElement): void {
    row.addEventListener('dragstart', (event) => {
      row.classList.add('dragging');
      event.dataTransfer?.setData('text/plain', row.dataset.index ?? '');
    });

    row.addEventListener('dragover', (event) => {
      event.preventDefault();
      row.classList.add('drop-target');
    });

    const clear = (): void => {
      row.classList.remove('drop-target');
      row.classList.remove('dragging');
    };

    row.addEventListener('dragleave', () => {
      row.classList.remove('drop-target');
    });

    row.addEventListener('drop', (event) => {
      event.preventDefault();
      const sourceIndex = Number(event.dataTransfer?.getData('text/plain'));
      const targetIndex = Number(row.dataset.index ?? '-1');
      if (!Number.isNaN(sourceIndex) && !Number.isNaN(targetIndex)) {
        this.reorderChild(sourceIndex, targetIndex);
      }
      clear();
    });

    row.addEventListener('dragend', () => {
      clear();
    });
  }

  private reorderChild(sourceIndex: number, targetIndex: number): void {
    if (!this.selectedElement || sourceIndex === targetIndex) {
      return;
    }

    const children = Array.from(this.selectedElement.children).filter(
      (node): node is HTMLElement => node instanceof HTMLElement,
    );

    const source = children[sourceIndex];
    const target = children[targetIndex];

    if (!source || !target) {
      return;
    }

    if (sourceIndex < targetIndex) {
      target.after(source);
    } else {
      this.selectedElement.insertBefore(source, target);
    }

    if (this.editorPanel) {
      this.populateChildren(this.editorPanel);
    }

    this.showToast('Reordered elements');
  }

  private attachControlHandlers(panel: HTMLDivElement): void {
    panel.addEventListener('input', (event) => {
      if (!this.selectedElement) {
        return;
      }

      const target = event.target as HTMLElement;
      if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) {
        return;
      }

      const id = target.id;
      switch (id) {
        case 'llm-text':
          this.selectedElement.textContent = target.value;
          break;
        case 'llm-attr-id':
          this.selectedElement.id = target.value;
          break;
        case 'llm-attr-class':
          this.selectedElement.className = target.value;
          break;
        case 'llm-attr-title':
          this.updateAttribute('title', target.value);
          break;
        case 'llm-attr-aria-label':
          this.updateAttribute('aria-label', target.value);
          break;
        case 'llm-font-family':
          this.setStyleProperty('font-family', target.value);
          break;
        case 'llm-font-size':
          this.setStyleProperty('font-size', target.value ? `${target.value}px` : '');
          break;
        case 'llm-line-height':
          this.setStyleProperty('line-height', target.value);
          break;
        case 'llm-letter-spacing':
          this.setStyleProperty('letter-spacing', target.value ? `${target.value}px` : '');
          break;
        case 'llm-font-weight':
          this.setStyleProperty('font-weight', target.value);
          break;
        case 'llm-text-transform':
          this.setStyleProperty('text-transform', target.value);
          break;
        case 'llm-text-align':
          this.setStyleProperty('text-align', target.value);
          break;
        case 'llm-text-color':
          this.setStyleProperty('color', target.value);
          break;
        case 'llm-bg-color':
          this.setStyleProperty('background-color', target.value);
          break;
        case 'llm-border-color':
          this.setStyleProperty('border-color', target.value);
          break;
        case 'llm-bg-image':
          if (!target.value) {
            this.setStyleProperty('background-image', '');
          } else if (/^url\(/i.test(target.value) || target.value.includes('gradient')) {
            this.setStyleProperty('background-image', target.value);
          } else {
            this.setStyleProperty('background-image', `url(${target.value})`);
          }
          break;
        case 'llm-bg-size':
          this.setStyleProperty('background-size', target.value);
          break;
        case 'llm-bg-position':
          this.setStyleProperty('background-position', target.value);
          break;
        case 'llm-opacity':
          this.setStyleProperty('opacity', target.value);
          break;
        case 'llm-margin-top':
          this.setStyleProperty('margin-top', target.value ? `${target.value}px` : '');
          break;
        case 'llm-margin-right':
          this.setStyleProperty('margin-right', target.value ? `${target.value}px` : '');
          break;
        case 'llm-margin-bottom':
          this.setStyleProperty('margin-bottom', target.value ? `${target.value}px` : '');
          break;
        case 'llm-margin-left':
          this.setStyleProperty('margin-left', target.value ? `${target.value}px` : '');
          break;
        case 'llm-padding-top':
          this.setStyleProperty('padding-top', target.value ? `${target.value}px` : '');
          break;
        case 'llm-padding-right':
          this.setStyleProperty('padding-right', target.value ? `${target.value}px` : '');
          break;
        case 'llm-padding-bottom':
          this.setStyleProperty('padding-bottom', target.value ? `${target.value}px` : '');
          break;
        case 'llm-padding-left':
          this.setStyleProperty('padding-left', target.value ? `${target.value}px` : '');
          break;
        case 'llm-display':
          this.setStyleProperty('display', target.value);
          break;
        case 'llm-gap':
          this.setStyleProperty('gap', target.value ? `${target.value}px` : '');
          break;
        case 'llm-flex-direction':
          this.setStyleProperty('flex-direction', target.value);
          break;
        case 'llm-justify':
          this.setStyleProperty('justify-content', target.value);
          break;
        case 'llm-align':
          this.setStyleProperty('align-items', target.value);
          break;
        case 'llm-width':
          this.setStyleProperty('width', target.value);
          break;
        case 'llm-height':
          this.setStyleProperty('height', target.value);
          break;
        case 'llm-max-width':
          this.setStyleProperty('max-width', target.value);
          break;
        case 'llm-max-height':
          this.setStyleProperty('max-height', target.value);
          break;
        case 'llm-min-width':
          this.setStyleProperty('min-width', target.value);
          break;
        case 'llm-min-height':
          this.setStyleProperty('min-height', target.value);
          break;
        case 'llm-border-width':
          this.setStyleProperty('border-width', target.value ? `${target.value}px` : '');
          break;
        case 'llm-border-style':
          this.setStyleProperty('border-style', target.value);
          break;
        case 'llm-border-radius':
          this.setStyleProperty('border-radius', target.value ? `${target.value}px` : '');
          break;
        case 'llm-box-shadow':
          this.setStyleProperty('box-shadow', target.value);
          break;
        default:
          break;
      }
    });

    panel.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      if (!(target instanceof HTMLButtonElement)) {
        return;
      }

      const action = target.dataset.action;
      if (!action) {
        return;
      }

      switch (action) {
        case 'reset':
          this.resetChanges();
          if (this.editorPanel) {
            this.populateInputs(this.editorPanel);
          }
          this.showToast('Restored original styles');
          break;
        case 'save':
          void this.saveManualLayout();
          break;
        case 'jump-parent':
          this.jumpToParent();
          break;
        case 'dock':
          this.cycleDockState();
          if (this.editorPanel) {
            this.updatePanelFrame(this.editorPanel);
            this.showToast(`Docked to ${this.dockState.replace('-', ' ')}`);
          }
          break;
        case 'toggle-theme':
          if (this.editorPanel) {
            const nextTheme = this.editorPanel.dataset.theme === 'light' ? 'dark' : 'light';
            this.editorPanel.dataset.theme = nextTheme;
            this.showToast(`Theme: ${nextTheme}`);
          }
          break;
        case 'refresh-children':
          if (this.editorPanel) {
            this.populateChildren(this.editorPanel);
            this.showToast('Refreshed child list');
          }
          break;
        case 'select-child':
          if (!this.editorPanel || !this.selectedElement) {
            break;
          }
          event.stopPropagation();
          const index = Number(target.dataset.index ?? '-1');
          const children = Array.from(this.selectedElement.children).filter(
            (node): node is HTMLElement => node instanceof HTMLElement,
          );
          const child = children[index];
          if (child) {
            this.selectElement(child);
          }
          break;
        default:
          break;
      }
    });

    const opacitySlider = panel.querySelector<HTMLInputElement>('#llm-panel-opacity');
    opacitySlider?.addEventListener('input', () => {
      if (!opacitySlider.value) {
        return;
      }
      this.panelOpacity = Number(opacitySlider.value);
      if (this.editorPanel) {
        this.editorPanel.style.opacity = opacitySlider.value;
      }
    });
  }

  private inlineOrComputed(inline: string, computed: string): string {
    return inline || computed || '';
  }

  private toNumeric(value: string): string {
    if (!value) {
      return '';
    }
    const numeric = parseFloat(value);
    return Number.isFinite(numeric) ? String(Math.round(numeric * 100) / 100) : '';
  }

  private stripNone(value: string): string {
    if (!value || value === 'none' || value === 'auto' || value === 'normal') {
      return '';
    }
    return value;
  }

  private parseBackgroundImage(value: string): string {
    if (!value || value === 'none') {
      return '';
    }

    const match = value.match(/url\((['"]?)(.*?)\1\)/i);
    if (match) {
      return match[2];
    }

    return value;
  }

  private updateAttribute(name: string, value: string): void {
    if (!this.selectedElement) {
      return;
    }

    if (!value) {
      this.selectedElement.removeAttribute(name);
    } else {
      this.selectedElement.setAttribute(name, value);
    }
  }

  private setStyleProperty(property: string, value: string): void {
    if (!this.selectedElement) {
      return;
    }

    if (!value) {
      this.selectedElement.style.removeProperty(property);
    } else {
      this.selectedElement.style.setProperty(property, value);
    }
  }

  private resetChanges(): void {
    if (!this.selectedElement || !this.snapshot) {
      return;
    }

    this.selectedElement.textContent = this.snapshot.text;

    if (this.snapshot.style === null) {
      this.selectedElement.removeAttribute('style');
    } else {
      this.selectedElement.setAttribute('style', this.snapshot.style);
    }

    const currentAttributes = Array.from(this.selectedElement.attributes).map((attr) => attr.name);
    currentAttributes.forEach((name) => {
      if (name === 'style') {
        return;
      }
      if (!(name in this.snapshot!.attributes)) {
        this.selectedElement!.removeAttribute(name);
      }
    });

    Object.entries(this.snapshot.attributes).forEach(([name, value]) => {
      if (name === 'style') {
        return;
      }
      this.selectedElement!.setAttribute(name, value);
    });
  }

  private async saveManualLayout(): Promise<void> {
    const toastMessage = (message: string): void => {
      this.showToast(message);
    };

    if (!this.selectedElement) {
      toastMessage('No element selected');
      return;
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
      this.snapshot = this.createSnapshot(this.selectedElement);
      toastMessage('Saved manual layout');
    } else {
      const message = result.error instanceof Error ? result.error.message : String(result.error);
      toastMessage(`Save failed: ${message}`);
    }
  }

  private jumpToParent(): void {
    if (!this.selectedElement) {
      return;
    }

    const parent = this.selectedElement.parentElement;
    if (!parent || this.isManualUI(parent)) {
      this.showToast('No editable parent');
      return;
    }

    this.selectElement(parent);
  }

  private showToast(message: string): void {
    if (!this.toastElement) {
      return;
    }

    this.toastElement.textContent = message;
    this.toastElement.classList.add('visible');

    if (this.toastTimeout) {
      window.clearTimeout(this.toastTimeout);
    }

    this.toastTimeout = window.setTimeout(() => {
      this.toastElement?.classList.remove('visible');
    }, 2400);
  }

  private handleWindowResize(): void {
    if (this.editorPanel) {
      this.updatePanelFrame(this.editorPanel);
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

  private normalizeColor(color: string): string {
    if (!color) {
      return '#000000';
    }

    const ctx = document.createElement('canvas').getContext('2d');
    if (!ctx) {
      return color;
    }

    ctx.fillStyle = color;
    const normalized = ctx.fillStyle as string;
    if (normalized.startsWith('#')) {
      return normalized.length === 9 ? normalized.slice(0, 7) : normalized;
    }

    const match = normalized.match(/rgba?\(([^)]+)\)/i);
    if (!match) {
      return normalized;
    }

    const [r, g, b] = match[1]
      .split(',')
      .slice(0, 3)
      .map((value) => Number.parseFloat(value.trim()));

    if ([r, g, b].some((component) => Number.isNaN(component))) {
      return '#000000';
    }

    const toHex = (value: number): string => Math.round(value).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  private isManualUI(node: HTMLElement): boolean {
    if (node.id === 'llm-manual-editor' || node.id === 'llm-manual-hud') {
      return true;
    }

    return Boolean(node.closest('#llm-manual-editor') || node.closest('#llm-manual-hud'));
  }
}
