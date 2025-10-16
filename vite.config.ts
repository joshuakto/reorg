import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
} from 'node:fs';

const rootDir = dirname(fileURLToPath(import.meta.url));

function copyRecursive(src: string, dest: string) {
  const stats = statSync(src);

  if (stats.isDirectory()) {
    mkdirSync(dest, { recursive: true });
    for (const entry of readdirSync(src)) {
      copyRecursive(resolvePath(src, entry), resolvePath(dest, entry));
    }
    return;
  }

  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
}

function copyStaticAssets() {
  return {
    name: 'copy-static-assets',
    apply: 'build' as const,
    closeBundle() {
      const manifestPath = resolvePath(rootDir, 'manifest.json');
      if (existsSync(manifestPath)) {
        copyRecursive(manifestPath, resolvePath(rootDir, 'dist/manifest.json'));
      }

      const iconsPath = resolvePath(rootDir, 'icons');
      if (existsSync(iconsPath)) {
        copyRecursive(iconsPath, resolvePath(rootDir, 'dist/icons'));
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const isContentBuild = mode === 'content';
  const isBackgroundBuild = mode === 'background';

  if (isContentBuild) {
    return {
      base: '',
      build: {
        outDir: 'dist',
        emptyOutDir: false,
        lib: {
          entry: resolvePath(rootDir, 'src/chrome/content.ts'),
          name: 'ContentScript',
          formats: ['iife'],
          fileName: () => 'content.js',
        },
        rollupOptions: {
          output: {
            extend: true,
          },
        },
      },
    };
  }

  if (isBackgroundBuild) {
    return {
      base: '',
      build: {
        outDir: 'dist',
        emptyOutDir: false,
        lib: {
          entry: resolvePath(rootDir, 'src/chrome/background.ts'),
          name: 'BackgroundScript',
          formats: ['iife'],
          fileName: () => 'background.js',
        },
        rollupOptions: {
          output: {
            extend: true,
          },
        },
      },
    };
  }

  // Default: build popup and copy assets
  return {
    base: '',
    plugins: [copyStaticAssets()],
    build: {
      rollupOptions: {
        input: {
          'popup/popup': resolvePath(rootDir, 'src/ui/popup/popup.html'),
        },
        output: {
          entryFileNames: '[name].js',
          chunkFileNames: '[name].js',
          format: 'es',
        },
      },
    },
  };
});
