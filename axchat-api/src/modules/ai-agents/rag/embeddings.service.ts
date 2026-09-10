import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import type { EmbeddingResult } from './types';
import { AiEngineSettingsService } from '../llm/ai-engine-settings.service';

/**
 * Gera embeddings pelo slot `embedding` do motor (Super Admin > Motor de IA).
 *
 * Base, chave e modelo são configuráveis porque o provedor MUDA: Anthropic e
 * DeepSeek não têm endpoint de embeddings, então quem roda Claude no texto
 * precisa apontar isto pra OpenAI ou pro Google. Como a API da OpenAI virou
 * padrão de fato — o Google expõe uma camada compatível —, trocar de provedor
 * é trocar três campos, sem tocar em código.
 *
 * Antes isto pegava emprestada a chave do slot de ÁUDIO e tinha o modelo
 * cravado: trocar o provedor de transcrição derrubava a busca semântica, e
 * ninguém ligava uma coisa à outra.
 *
 * The service is stateless: each call is one HTTP request. Batching is
 * supported via `embedBatch` to amortize round-trip latency when indexing
 * many messages at once.
 */
@Injectable()
export class EmbeddingsService {
  private readonly logger = new Logger(EmbeddingsService.name);
  /** Usado só quando o slot não define modelo. */
  private readonly MODELO_PADRAO = 'text-embedding-3-small';
  /** USD por 1M tokens do `text-embedding-3-small`. Provedor diferente cobra
   *  diferente — o número serve de ordem de grandeza no log, não de fatura. */
  private readonly COST_PER_1M_TOKENS = 0.02;
  constructor(private readonly engineSettings: AiEngineSettingsService) {}

  /**
   * Credencial OpenAI do bloco "Áudio/OpenAI" da config global (Super Admin >
   * Motor de IA), com fallback pra env.
   *
   * Antes lia só a env, uma vez no construtor: trocar a chave pela tela não
   * tinha efeito até reiniciar a API, e num deploy só por UI o RAG ficava sem
   * chave mesmo com tudo configurado.
   */
  private async resolveCredentials(): Promise<{
    apiKey: string;
    baseUrl: string;
    model: string;
  }> {
    const slot = (await this.engineSettings.getEffective()).embedding;
    const apiKey = slot.apiKey ?? '';
    if (!apiKey) {
      this.logger.warn(
        'Sem chave no slot Embedding (Super Admin > Motor de IA) — a busca semântica não vai indexar nem buscar',
      );
    }
    return {
      apiKey,
      baseUrl: (slot.baseUrl ?? 'https://api.openai.com/v1').replace(/\/+$/, ''),
      model: slot.modelId ?? this.MODELO_PADRAO,
    };
  }

  /**
   * Embeds a single string. Returns the vector + cost metadata so the
   * caller can log it against the agent run's budget.
   */
  async embed(text: string): Promise<EmbeddingResult> {
    const t0 = Date.now();
    const { apiKey, baseUrl, model } = await this.resolveCredentials();
    const response = await fetch(`${baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model, input: text }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      this.logger.error(
        `Embeddings API ${response.status}: ${body.slice(0, 300)}`,
      );
      throw new InternalServerErrorException(
        `Embeddings API error (${response.status}): ${response.statusText}`,
      );
    }

    const data = (await response.json()) as {
      data: { embedding: number[]; index: number }[];
      usage: { total_tokens: number };
    };

    const tokensUsed = data.usage?.total_tokens ?? 0;
    const costUsd = (tokensUsed / 1_000_000) * this.COST_PER_1M_TOKENS;

    this.logger.log(
      `embedding_generated tokens=${tokensUsed} costUsd=${costUsd.toFixed(6)} durationMs=${Date.now() - t0}`,
    );

    return {
      vector: data.data[0].embedding,
      model,
      tokensUsed,
      costUsd,
    };
  }

  /**
   * Embeds N strings in a single API call. Order is preserved — the
   * returned array is parallel to `texts`.
   *
   * Each `EmbeddingResult` reports the per-call totals divided evenly
   * across inputs so the caller can attribute cost back to each item
   * (the API itself only returns one aggregate token count).
   */
  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    if (texts.length === 0) return [];

    const t0 = Date.now();
    const { apiKey, baseUrl, model } = await this.resolveCredentials();
    const response = await fetch(`${baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model, input: texts }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      this.logger.error(
        `Embeddings batch API ${response.status}: ${body.slice(0, 300)}`,
      );
      throw new InternalServerErrorException(
        `Embeddings batch API error (${response.status}): ${response.statusText}`,
      );
    }

    const data = (await response.json()) as {
      data: { embedding: number[]; index: number }[];
      usage: { total_tokens: number };
    };

    const totalTokens = data.usage?.total_tokens ?? 0;
    const totalCost = (totalTokens / 1_000_000) * this.COST_PER_1M_TOKENS;
    // Even split — caller can do better attribution if it has per-text token counts.
    const perCallTokens = Math.round(totalTokens / texts.length);
    const perCallCost = totalCost / texts.length;

    this.logger.log(
      `embedding_batch_generated count=${texts.length} totalTokens=${totalTokens} totalCostUsd=${totalCost.toFixed(6)} durationMs=${Date.now() - t0}`,
    );

    // Sort by `index` to be safe — the API documents stable order, but
    // explicit is cheaper than a future bug.
    const sorted = [...data.data].sort((a, b) => a.index - b.index);
    return sorted.map((item) => ({
      vector: item.embedding,
      model,
      tokensUsed: perCallTokens,
      costUsd: perCallCost,
    }));
  }
}
