import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://everyrealestatecalculator.com',
  output: 'static',
  outDir: './dist',
  trailingSlash: 'always',
  build: {
    format: 'directory',
    inlineStylesheets: 'never',
  },
  devToolbar: {
    enabled: false,
  },
});
