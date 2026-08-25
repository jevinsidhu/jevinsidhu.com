// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://jevinsidhu.com',
  output: 'static',
  trailingSlash: 'never',
  integrations: [mdx(), sitemap()],
  // Prefetch every internal link as it enters the viewport so the
  // view-transition morph has the next page ready the instant it's clicked.
  prefetch: { prefetchAll: true, defaultStrategy: 'viewport' },
  build: { format: 'file' },
});
