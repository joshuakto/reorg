import { BaseExtractor } from './base';
import { Err, Ok, type Result } from '../types/common';
import type { TabSwitcherConfig } from '../types/strategy';
import type { View } from '../types/view';

export class TabSwitcherExtractor extends BaseExtractor<TabSwitcherConfig> {
  readonly type = 'tab-switcher';

  validate(config: TabSwitcherConfig): Result<void> {
    if (config.tabs.length === 0) {
      return Err(new Error('No tabs defined'));
    }
    return Ok(undefined);
  }

  async execute(config: TabSwitcherConfig, dom: Document): Promise<Result<View[]>> {
    const views: View[] = [];

    for (const tab of config.tabs) {
      try {
        const trigger = this.findElement(tab.trigger, dom);
        if (!trigger) {
          console.warn(`Trigger not found for ${tab.name}`);
          continue;
        }

        (trigger as HTMLElement).click();
        await this.wait(tab.waitMs);

        const content = this.findElement(tab.captureSelector, dom);
        if (!content) {
          console.warn(`Content not found for ${tab.name}`);
          continue;
        }

        views.push({
          id: `view-${views.length}`,
          name: tab.name,
          content: content.innerHTML,
          metadata: {
            capturedAt: Date.now(),
            selector: tab.captureSelector.value,
          },
        });
      } catch (error) {
        console.error(`Error extracting ${tab.name}:`, error);
      }
    }

    return views.length > 0 ? Ok(views) : Err(new Error('No views extracted'));
  }
}
