import { z } from 'zod';
import { ApiError } from './errors.js';

export const openBodySchema = z.object({
  secret: z.string().min(1, 'Secret is required'),
});

export const uploadFieldsSchema = z.object({
  filename: z.string().optional(),
  mimeType: z.string().optional(),
});

export const fileNameParamSchema = z.object({
  name: z.string().min(1, 'Filename is required'),
});

export const fileHashParamSchema = z.object({
  hash: z.string().min(1, 'Blob hash is required'),
});

/**
 * Parses and validates input using a Zod schema.
 */
export function parseWithSchema<T>(schema: z.ZodSchema<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ApiError(400, 'INVALID_REQUEST', formatZodError(result.error));
  }
  return result.data;
}

function formatZodError(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) {
    return 'Invalid request';
  }
  return issue.message;
}
