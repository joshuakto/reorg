export const config = {
  llm: {
    provider: 'claude',
    apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY || '',
  },
  dev: import.meta.env.DEV,
  version: '1.0.0',
};
