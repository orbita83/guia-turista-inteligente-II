import { defineConfig } from 'vite-plus';

export default defineConfig({
  defaultPackage: './app/frontend',
  fmt: {
    ignorePatterns: [
      'app/backend/**',
      'docs/**',
      'static/**',
      '*.md',
    ],
    singleQuote: true,
    semi: true,
  },
  lint: {
    ignorePatterns: [
      'app/backend/**',
      'static/**',
      'docs/**',
      '*.md',
    ],
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
});
