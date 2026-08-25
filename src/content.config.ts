import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const caseStudies = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/case-studies' }),
  schema: z.object({
    title: z.string(),
    subtitle: z.string(),
    blurb: z.string(),
    thumb: z.string(),
    og: z.string().optional(),
    date: z.coerce.date(),
    press: z
      .array(z.object({ name: z.string(), url: z.string().url(), icon: z.enum(['techcrunch', 'verge']) }))
      .default([]),
    toc: z.array(z.object({ id: z.string(), label: z.string() })).default([]),
  }),
});

export const collections = { caseStudies };
