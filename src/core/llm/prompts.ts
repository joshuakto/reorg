import type { PageContext } from '../types/view';

export const STRATEGY_GENERATION_PROMPT = (context: PageContext): string => `
You are analyzing a webpage to create an extraction strategy for displaying multiple versions/views simultaneously.

Page Information:
- URL: ${context.url}
- Title: ${context.title}
- Available buttons: ${context.domStructure.buttons.map((b) => b.text).join(', ')}
- Available tabs: ${context.domStructure.tabs.map((t) => t.text).join(', ')}

Your task: Generate a JSON extraction strategy that can capture different versions/views of this page.

Output Format (must be valid JSON):
{
  "extractorType": "tab-switcher",
  "tabs": [
    {
      "name": "Version 1",
      "trigger": {
        "type": "css" | "text",
        "value": "selector or text to find",
        "fallbacks": ["alternative selector"]
      },
      "captureSelector": {
        "type": "css",
        "value": "selector for content to capture"
      },
      "waitMs": 500
    }
  ]
}

Guidelines:
1. Use "tab-switcher" for button/tab-based navigation
2. Prefer CSS selectors when possible
3. Use text-based selection as fallback
4. Include multiple fallback selectors for robustness
5. Set appropriate wait times after clicks (default 500ms)

Generate the extraction strategy now:`;
