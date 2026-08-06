import { AutomationTrigger } from '@prisma/client';

// ─── Event payloads ──────────────────────────────────────────────────
//
// Every domain event written to the outbox carries a strongly-typed
// payload. Workers/conditions/actions consume these — adding a field here
// without updating the conditions registry will produce a "field not
// recognized" error at save time, never silent corruption.
//
// Convention: every payload includes the entities the action layer can
// possibly mutate (contactId, conversationId, channelId). Even when the
// trigger doesn't need them, populating them keeps action handlers simple.

export interface BaseEventPayload {
  organizationId: string;
  // contactId is the lock key — every event MUST resolve to a contact for
  // the per-lead serialization to work. The outbox service refuses to
  // enqueue events without one.
  contactId: string;
  conversationId?: string;
  channelId?: string;
  actorId?: string;
}

export interface TagAddedPayload extends BaseEventPayload {
  tagId: string;
  // Where the tag landed — `conversation` (ConversationTag) or `contact`
  // (ContactTag). Conditions can filter on this so an automation only fires
  // for one or the other.
  target: 'conversation' | 'contact';
}

export interface TagRemovedPayload extends BaseEventPayload {
  tagId: string;
  target: 'conversation' | 'contact';
}

export interface MessageReceivedPayload extends BaseEventPayload {
  conversationId: string;
  channelId: string;
  messageId: string;
  // body is denormalized here because conditions match on it directly —
  // worker shouldn't have to round-trip to the DB just to check
  // "contains foo".
  body: string | null;
  type: string; // MessageContentType — kept loose to avoid Prisma circular dep
  hasAttachment: boolean;
  isFromCustomer: true; // INBOUND only — outbound never enters this trigger
}

/**
 * Comentário recebido num post/reel do Instagram.
 *
 * Carrega os ids acionáveis: `commentId` pra responder no próprio post e
 * `authorIgsid` pra mandar DM. Conversa e contato vêm preenchidos — o autor do
 * comentário vira contato como qualquer outro.
 */
export interface InstagramCommentPayload extends BaseEventPayload {
  conversationId: string;
  channelId: string;
  messageId: string;
  commentId: string;
  mediaId: string | null;
  /** @username do autor, quando a Meta manda. */
  authorUsername: string | null;
  authorIgsid: string;
  /** Texto do comentário, cru — sem a linha de contexto que a UI acrescenta. */
  body: string | null;
  /** true quando é resposta a outro comentário, não um comentário de 1º nível. */
  isReply: boolean;
}

export interface ConversationStatusChangedPayload extends BaseEventPayload {
  conversationId: string;
  channelId: string;
  fromStatus: string;
  toStatus: string;
}

export interface ConversationAssignedPayload extends BaseEventPayload {
  conversationId: string;
  channelId: string;
  fromAssigneeId: string | null;
  toAssigneeId: string;
}

export type AutomationEventPayload =
  | TagAddedPayload
  | TagRemovedPayload
  | MessageReceivedPayload
  | InstagramCommentPayload
  | ConversationStatusChangedPayload
  | ConversationAssignedPayload;

// Discriminated union by trigger — used by the listener factory and by
// tests to construct events with the correct payload shape.
export type TriggerToPayload = {
  [AutomationTrigger.TAG_ADDED]: TagAddedPayload;
  [AutomationTrigger.TAG_REMOVED]: TagRemovedPayload;
  [AutomationTrigger.MESSAGE_RECEIVED]: MessageReceivedPayload;
  [AutomationTrigger.INSTAGRAM_COMMENT]: InstagramCommentPayload;
  [AutomationTrigger.CONVERSATION_STATUS_CHANGED]: ConversationStatusChangedPayload;
  [AutomationTrigger.CONVERSATION_ASSIGNED]: ConversationAssignedPayload;
  [AutomationTrigger.MANUAL_TRIGGER]: ManualTriggerPayload;
};

export interface ManualTriggerPayload extends BaseEventPayload {
  conversationId: string;
  additionalData?: Record<string, unknown>;
}

// ─── BullMQ job shape ────────────────────────────────────────────────

export interface AutomationJobData {
  outboxEventId: string;
  organizationId: string;
  trigger: AutomationTrigger;
  payload: AutomationEventPayload;
  traceId: string;
  cascadeDepth: number;
  // visitedAutomations carries the loop-detection set across cascade
  // hops. Each action that re-emits an event MUST forward this list with
  // its own automationId appended. Encoded as array (not Set) so it
  // serializes through Redis cleanly.
  visitedAutomations: string[];
}
