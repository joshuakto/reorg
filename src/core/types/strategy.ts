import { z } from 'zod';

export const SelectorSchema = z.object({
  type: z.enum(['css', 'xpath', 'text']),
  value: z.string(),
  fallbacks: z.array(z.string()).optional(),
});

export type Selector = z.infer<typeof SelectorSchema>;

export const TabSwitcherConfigSchema = z.object({
  extractorType: z.literal('tab-switcher'),
  tabs: z.array(z.object({
    name: z.string(),
    trigger: SelectorSchema,
    captureSelector: SelectorSchema,
    waitMs: z.number().default(500),
  })),
});

export const ExtractionStrategySchema = z.discriminatedUnion('extractorType', [
  TabSwitcherConfigSchema,
]);

export type ExtractionStrategy = z.infer<typeof ExtractionStrategySchema>;
export type TabSwitcherConfig = z.infer<typeof TabSwitcherConfigSchema>;
