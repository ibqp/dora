/** Request validation for the chat session API. Shared by route handlers and (later) the UI. */
import { z } from "zod";

import { AssistantRole } from "@/generated/prisma/enums";
import { MAX_SESSION_TITLE_LENGTH, normalizeWhitespace } from "@/lib/sessions/title";

export const MAX_MESSAGE_LENGTH = 4000;

export const assistantRoleSchema = z.enum(AssistantRole);

export const sessionIdSchema = z.cuid({ message: "Invalid session id" });

export const brdIdSchema = z.cuid({ message: "Invalid BRD id" });

/** POST /api/chats/[id]/brd — generating with missing fields requires explicit consent. */
export const generateBrdRequestSchema = z
  .object({
    /** Set after the user has seen the missing-field warning and chose to create a draft. */
    allowIncomplete: z.boolean().default(false),
  })
  .strict();

export const messageContentSchema = z
  .string()
  .trim()
  .min(1, "Message must not be empty")
  .max(MAX_MESSAGE_LENGTH, `Message must be at most ${MAX_MESSAGE_LENGTH} characters`);

/** Client-generated UUID identifying one submission; retries reuse the same value. */
export const clientRequestIdSchema = z.uuid({ message: "clientRequestId must be a UUID" });

/** POST /api/chats — creates a session from the first user message. */
export const createChatRequestSchema = z
  .object({
    content: messageContentSchema,
    clientRequestId: clientRequestIdSchema,
    /** Role selected before the first message; defaults to the configured default role. */
    assistantRole: assistantRoleSchema.optional(),
  })
  .strict();

export type CreateChatRequest = z.infer<typeof createChatRequestSchema>;

/** POST /api/chats/[id]/messages — a subsequent user message. */
export const sendMessageRequestSchema = z
  .object({
    content: messageContentSchema,
    clientRequestId: clientRequestIdSchema,
  })
  .strict();

export type SendMessageRequest = z.infer<typeof sendMessageRequestSchema>;

const sessionTitleSchema = z
  .string()
  .transform(normalizeWhitespace)
  .pipe(
    z
      .string()
      .min(1, "Title must not be empty")
      .max(MAX_SESSION_TITLE_LENGTH, `Title must be at most ${MAX_SESSION_TITLE_LENGTH} characters`),
  );

/** PATCH /api/chats/[id] — renames a session and/or changes its assistant role. */
export const updateChatRequestSchema = z
  .object({
    title: sessionTitleSchema.optional(),
    assistantRole: assistantRoleSchema.optional(),
  })
  .strict()
  .refine((body) => body.title !== undefined || body.assistantRole !== undefined, {
    message: "Provide a title or an assistantRole",
  });

export type UpdateChatRequest = z.infer<typeof updateChatRequestSchema>;
