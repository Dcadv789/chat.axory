import { Logger } from '@nestjs/common';
import OpenAI from 'openai';

import {
  LlmCompletionRequest,
  LlmCompletionResponse,
  LlmMessage,
  LlmToolCall,
  LlmUsage,
} from './llm.types';

/**
 * Provider para APIs compativeis com OpenAI (Chat Completions).
 *
 * Usado pelo DeepSeek (baseURL `https://api.deepseek.com`) — que e
 * drop-in compatible com o SDK `openai`, incluindo function calling —
 * e por modelos GPT da OpenAI. Converte os nossos tipos normalizados
 * (`LlmMessage`, `LlmToolDefinition`) pro shape do Chat Completions e
 * de volta, espelhando o contrato publico de `LlmService.complete()`.
 *
 * Visao (imagens) so e suportada por modelos que aceitam `image_url`.
 * O DeepSeek nao tem visao — o roteamento de imagens pro Claude e feito
 * no `LlmService` ANTES de chamar este provider.
 */
export class OpenAiCompatProvider {
  private readonly client: OpenAI;

  constructor(
    private readonly opts: { apiKey: string; baseURL?: string; label: string },
    private readonly logger: Logger,
  ) {
    this.client = new OpenAI({
      apiKey: opts.apiKey,
      ...(opts.baseURL ? { baseURL: opts.baseURL } : {}),
    });
  }

  async complete(
    req: LlmCompletionRequest,
    modelId: string,
  ): Promise<LlmCompletionResponse> {
    const messages = this.toOpenAiMessages(req.messages);
    const tools = req.tools && req.tools.length > 0
      ? req.tools.map((t) => ({
          type: 'function' as const,
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters as Record<string, unknown>,
          },
        }))
      : undefined;

    let resp: OpenAI.Chat.Completions.ChatCompletion;
    try {
      resp = await this.client.chat.completions.create({
        model: modelId,
        messages,
        temperature: req.temperature ?? 0.7,
        max_tokens: req.maxTokens ?? 2048,
        ...(tools ? { tools } : {}),
      });
    } catch (err: unknown) {
      this.logger.error(
        `LLM call failed [${this.opts.label}:${modelId}]: ${this.errorMessage(err)}`,
      );
      throw err;
    }

    const choice = resp.choices?.[0];
    const message = this.fromOpenAiMessage(choice?.message);
    const stopReason = this.normalizeFinishReason(choice?.finish_reason);
    const usage = this.extractUsage(resp.usage, modelId);

    return {
      message,
      stopReason,
      usage,
      rawModelId: resp.model ?? modelId,
    };
  }

  // ─── conversao: nossos tipos → OpenAI Chat Completions ───────────

  private toOpenAiMessages(
    input: LlmMessage[],
  ): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    const out: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

    for (const m of input) {
      if (m.role === 'system') {
        const text = this.textOf(m.content);
        if (text) out.push({ role: 'system', content: text });
        continue;
      }

      if (m.role === 'tool') {
        if (!m.toolCallId) continue;
        out.push({
          role: 'tool',
          tool_call_id: m.toolCallId,
          content: this.textOf(m.content) || '(empty)',
        });
        continue;
      }

      if (m.role === 'user') {
        out.push({ role: 'user', content: this.toUserContent(m.content) });
        continue;
      }

      if (m.role === 'assistant') {
        const text = this.textOf(m.content);
        const toolCalls = (m.toolCalls ?? []).map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.arguments ?? {}),
          },
        }));
        if (toolCalls.length > 0) {
          out.push({
            role: 'assistant',
            content: text || null,
            tool_calls: toolCalls,
          });
        } else if (text) {
          out.push({ role: 'assistant', content: text });
        }
      }
    }

    return out;
  }

  /**
   * User content vira string simples quando e texto puro, ou array de
   * parts (text + image_url) quando ha imagem — para modelos com visao.
   */
  private toUserContent(
    content: LlmMessage['content'],
  ):
    | string
    | OpenAI.Chat.Completions.ChatCompletionContentPart[] {
    if (typeof content === 'string') return content;

    const hasImage = content.some((p) => p.type === 'image');
    if (!hasImage) {
      return content
        .filter((p) => p.type === 'text')
        .map((p) => (p as { text: string }).text)
        .join('');
    }

    const parts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];
    for (const p of content) {
      if (p.type === 'text') {
        if (p.text) parts.push({ type: 'text', text: p.text });
      } else if (p.type === 'image') {
        if (p.url) {
          parts.push({ type: 'image_url', image_url: { url: p.url } });
        } else if (p.base64) {
          parts.push({
            type: 'image_url',
            image_url: {
              url: `data:${p.base64.mediaType};base64,${p.base64.data}`,
            },
          });
        }
      }
    }
    return parts;
  }

  private textOf(content: LlmMessage['content']): string {
    if (typeof content === 'string') return content;
    return content
      .filter((p) => p.type === 'text')
      .map((p) => (p as { text: string }).text)
      .join('');
  }

  // ─── conversao: OpenAI Chat Completions → nossos tipos ───────────

  private fromOpenAiMessage(
    message: OpenAI.Chat.Completions.ChatCompletionMessage | undefined,
  ): LlmMessage {
    const toolCalls: LlmToolCall[] = [];
    for (const tc of message?.tool_calls ?? []) {
      if (tc.type !== 'function') continue;
      toolCalls.push({
        id: tc.id,
        name: tc.function.name,
        arguments: this.safeParseArgs(tc.function.arguments),
      });
    }
    return {
      role: 'assistant',
      content: message?.content ?? '',
      ...(toolCalls.length > 0 ? { toolCalls } : {}),
    };
  }

  private normalizeFinishReason(
    reason: string | null | undefined,
  ): LlmCompletionResponse['stopReason'] {
    switch (reason) {
      case 'stop':
        return 'stop';
      case 'tool_calls':
      case 'function_call':
        return 'tool_calls';
      case 'length':
        return 'length';
      case 'content_filter':
        return 'content_filter';
      default:
        return 'other';
    }
  }

  private extractUsage(
    usage: OpenAI.Completions.CompletionUsage | undefined,
    modelId: string,
  ): LlmUsage {
    const input = usage?.prompt_tokens ?? 0;
    const output = usage?.completion_tokens ?? 0;
    // DeepSeek expoe cache hit/miss em campos extras (nao tipados no SDK).
    const extra = usage as unknown as {
      prompt_cache_hit_tokens?: number;
      prompt_cache_miss_tokens?: number;
    };
    const cacheRead = extra?.prompt_cache_hit_tokens ?? 0;
    const cacheMiss =
      extra?.prompt_cache_miss_tokens ?? Math.max(0, input - cacheRead);

    return {
      inputTokens: input,
      outputTokens: output,
      cacheReadTokens: cacheRead,
      cacheWriteTokens: 0,
      costUsd: this.calculateCost(modelId, {
        inputMiss: cacheMiss,
        cacheRead,
        output,
      }),
    };
  }

  private calculateCost(
    modelId: string,
    tokens: { inputMiss: number; cacheRead: number; output: number },
  ): number {
    const p =
      OPENAI_COMPAT_PRICING_USD_PER_MTOK[modelId] ??
      OPENAI_COMPAT_PRICING_USD_PER_MTOK.default;
    return (
      (tokens.inputMiss * p.input +
        tokens.cacheRead * p.cacheRead +
        tokens.output * p.output) /
      1_000_000
    );
  }

  private safeParseArgs(raw: string | undefined): Record<string, unknown> {
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      return typeof parsed === 'object' && parsed !== null ? parsed : {};
    } catch {
      return {};
    }
  }

  private errorMessage(err: unknown): string {
    if (err instanceof OpenAI.APIError) {
      return `${err.name}(${err.status}): ${err.message}`;
    }
    if (err instanceof Error) return err.message;
    return String(err);
  }
}

/**
 * Precos (USD por 1M tokens). DeepSeek cobra cache hit bem mais barato.
 * Fonte: api-docs.deepseek.com/quick_start/pricing.
 */
const OPENAI_COMPAT_PRICING_USD_PER_MTOK: Record<
  string,
  { input: number; cacheRead: number; output: number }
> = {
  'deepseek-chat': { input: 0.27, cacheRead: 0.07, output: 1.1 },
  'deepseek-reasoner': { input: 0.55, cacheRead: 0.14, output: 2.19 },
  'gpt-4o': { input: 2.5, cacheRead: 1.25, output: 10 },
  'gpt-4o-mini': { input: 0.15, cacheRead: 0.075, output: 0.6 },
  default: { input: 0.27, cacheRead: 0.07, output: 1.1 },
};
