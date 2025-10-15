import type { View } from '../types/view';

export class GridRenderer {
  private container: HTMLElement | null = null;
  private closeButton: HTMLButtonElement | null = null;

  render(views: View[]): void {
    this.cleanup();

    const grid = document.createElement('div');
    grid.id = 'llm-view-extractor-grid';
    grid.style.cssText = `
      position: fixed;
      top: 60px;
      left: 0;
      right: 0;
      bottom: 0;
      background: white;
      display: grid;
      grid-template-columns: repeat(${Math.min(views.length, 2)}, 1fr);
      gap: 10px;
      padding: 10px;
      overflow: auto;
      z-index: 999999;
      box-shadow: 0 0 20px rgba(0, 0, 0, 0.3);
    `;

    views.forEach((view) => {
      const card = document.createElement('div');
      card.style.cssText = `
        border: 2px solid #e0e0e0;
        border-radius: 8px;
        padding: 16px;
        overflow: auto;
        background: #fafafa;
      `;

      const header = document.createElement('h3');
      header.textContent = view.name;
      header.style.cssText = `
        margin: 0 0 12px 0;
        color: #333;
        font-size: 18px;
        font-weight: 600;
      `;

      const content = document.createElement('div');
      content.innerHTML = view.content;
      content.style.cssText = `
        background: white;
        padding: 12px;
        border-radius: 4px;
      `;

      card.appendChild(header);
      card.appendChild(content);
      grid.appendChild(card);
    });

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕ Close';
    closeBtn.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      z-index: 1000000;
      padding: 8px 16px;
      background: #ff4444;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-weight: 600;
    `;
    closeBtn.onclick = () => this.cleanup();

    document.body.appendChild(grid);
    document.body.appendChild(closeBtn);

    this.container = grid;
    this.closeButton = closeBtn;
  }

  private cleanup(): void {
    this.container?.remove();
    this.container = null;

    this.closeButton?.remove();
    this.closeButton = null;
  }
}
