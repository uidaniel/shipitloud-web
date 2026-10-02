// AI art direction for posters (PRD section 7, step 3): pick templates and write copy that fits each slot.
// The model never designs; it only fills named text slots within their character limits.
import { z } from 'zod';

export const POSTERS_VERSION = 'posters@1';

export const PostersSchema = z.object({
  posters: z.array(z.object({
    template_id: z.string(),
    title: z.string().describe('Short internal name, e.g. "Launch day announcement"'),
    slots: z.array(z.object({ key: z.string(), value: z.string() })),
  })),
});
export type PostersOut = z.infer<typeof PostersSchema>;

export const POSTERS_SYSTEM = `You write the words for launch posters. Designers made the layouts; you only fill the text slots.

Rules:
- Use each template exactly once, in the order given. Fill every required slot. Respect each slot's character limit strictly (count characters).
- Write in the brand's voice, using the customer's own words for problems. Short and concrete beats clever.
- Never invent numbers, customers, results or quotes. For a "highlight" slot, copy 1-3 words exactly as they appear in the headline.
- Use only facts from the brand brain. If you don't know something (like a launch date), write around it.
- For multi-line slots, separate lines with \\n.`;

interface TemplateSpec { id: string; name: string; use: string; slots: Record<string, { label: string; max: number; required?: boolean }> }

export function postersPrompt(brand: {
  name: string; one_liner: string | null; target_customer: string | null; pain_points: string[]; tone: string | null; url: string | null;
  days_to_launch: number | null;
}, templates: TemplateSpec[]) {
  const t = templates.map((tp) => `- ${tp.id} (${tp.name}: ${tp.use})\n${Object.entries(tp.slots).map(([k, s]) => `    ${k}: ${s.label}, max ${s.max} chars${s.required ? ', required' : ''}`).join('\n')}`).join('\n');
  return `Brand: ${brand.name}
What it does: ${brand.one_liner ?? 'unknown'}
Who it's for: ${brand.target_customer ?? 'unknown'}
Problems it solves: ${brand.pain_points.join('; ') || 'unknown'}
Voice: ${brand.tone ?? 'clear and friendly'}
Website: ${brand.url ?? 'none'}
Days until launch: ${brand.days_to_launch ?? 'not set (for a countdown, use 7)'}

Templates to fill:
${t}`;
}

export function mockPosters(name: string, templates: TemplateSpec[]): PostersOut {
  const fill = (k: string, max: number) => (k === 'number' ? '7' : k === 'highlight' ? name : `${name} ${k}`).slice(0, max);
  return {
    posters: templates.map((tp) => ({
      template_id: tp.id,
      title: `${tp.name} (sample)`,
      slots: Object.entries(tp.slots).map(([k, s]) => ({ key: k, value: k === 'headline' ? `Meet ${name}`.slice(0, s.max) : fill(k, s.max) })),
    })),
  };
}
