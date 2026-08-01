import type { ProfessionalSlide } from '@ai-workflow-studio/google-sheets';
import type { JsonValue } from '@ai-workflow-studio/workflow-schema';
import { z } from 'zod';

const GoogleResourceIdSchema = z
  .string()
  .min(8)
  .max(300)
  .regex(/^[A-Za-z0-9_-]+$/);

export function buildProfessionalSlides(
  text: string,
  input: {
    readonly includeImages: boolean;
    readonly includeReferences: boolean;
    readonly maxSlides: number;
    readonly title: string;
  },
  retrievedAt = new Date().toISOString().slice(0, 10),
): readonly ProfessionalSlide[] {
  const lines = text
    .replace(/^#+\s*/gm, '')
    .split('\n')
    .map((line) => line.replace(/^[-*•]\s*/, '').trim())
    .filter((line) => line.length >= 8)
    .slice(0, input.maxSlides * 8);
  const urls = [...new Set(text.match(/https:\/\/[^\s)\]]+/g) ?? [])].slice(0, 8);
  const imageUrl = urls.find((url) => /\.(?:jpe?g|png|webp)(?:\?|$)/i.test(url));
  const chunkSize = Math.max(1, Math.ceil(lines.length / input.maxSlides));
  return Array.from({ length: input.maxSlides }, (_, index) => {
    const body = lines.slice(index * chunkSize, index * chunkSize + chunkSize).slice(0, 8);
    return {
      body: body.length > 0 ? body : ['內容待補充與核准。'],
      ...(input.includeImages && index > 0 && imageUrl !== undefined ? { imageUrl } : {}),
      ...(input.includeReferences && urls.length > 0
        ? {
            references: urls.slice(0, 3).map((url, referenceIndex) => ({
              label: `Reference ${referenceIndex + 1}`,
              retrievedAt,
              url,
            })),
          }
        : {}),
      title: index === 0 ? input.title : `重點 ${index}`,
    };
  });
}

export function appsScriptParentId(input: JsonValue): string | undefined {
  const parsed = z
    .object({
      kind: z.literal('google_slides_presentation'),
      presentationId: GoogleResourceIdSchema,
    })
    .passthrough()
    .safeParse(input);
  return parsed.success ? parsed.data.presentationId : undefined;
}
