import type { MetadataRoute } from 'next';
import { site } from '@/lib/site';

export default function sitemap(): MetadataRoute.Sitemap {
  return ['', '/pricing', '/terms', '/privacy', '/refund'].map((path) => ({
    url: `${site.url}${path}`,
    changeFrequency: path ? 'monthly' : 'weekly',
    priority: path ? 0.5 : 1,
  }));
}
