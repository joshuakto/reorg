# LLM View Extractor

An AI-assisted Chrome extension that analyzes a page, generates a multi-view extraction strategy, and renders the captured views side-by-side for comparison.

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```
2. Provide your Anthropic API key by copying the example env file:
   ```bash
   cp .env.example .env
   # edit .env to add your key
   ```
3. Build the extension:
   ```bash
   npm run build
   ```
4. Load the generated `dist/` folder as an unpacked extension in `chrome://extensions`.

## Scripts

- `npm run dev` – builds the extension in watch mode for rapid iteration.
- `npm run build` – produces a production build in `dist/`.
- `npm run type-check` – runs the TypeScript compiler without emitting files.

## Project Structure

```
src/
├── chrome/          # Background worker, content script, messaging helpers
├── core/            # Framework-agnostic business logic
├── ui/              # Popup UI
└── config.ts        # Runtime configuration
```

Generated assets are written to the `dist/` directory by Vite.
