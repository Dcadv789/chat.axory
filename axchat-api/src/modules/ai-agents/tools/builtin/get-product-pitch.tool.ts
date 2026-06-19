import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma.service';
import { AiTool, ToolContext, ToolResult } from '../tool.types';

/**
 * Returns the full pitch + price + checkout link for a product owned by
 * the org. Sales agents use this skill when actually recommending —
 * keeps the prompt small while letting the agent pull authoritative
 * copy on demand instead of inventing.
 *
 * Source: `Product` table (managed via Settings > Produtos no frontend).
 * No longer depends on Trivapp external API.
 */
@Injectable()
export class GetProductPitchTool implements AiTool {
  private readonly logger = new Logger(GetProductPitchTool.name);

  // Nome neutro a propósito — a LLM tem tendência a "ecoar" o nome da
  // tool nas mensagens ao cliente. Nomes como `getProductPitch` faziam
  // ela soltar "vou te mandar o pitch" / "tem no catálogo". Renomeado
  // pra `lookupOffering` (e a description não usa pitch/catálogo/pack)
  // pra ela falar como gente.
  readonly name = 'lookupOffering';
  readonly description =
    'Busca os detalhes oficiais (preço, condições, link de pagamento, principais entregas) do que pode resolver pro cliente. SEMPRE use isto ANTES de citar valor, prazo ou link — nunca invente. Slug vem da lista de soluções no system prompt.';
  readonly parameters = {
    type: 'object',
    additionalProperties: false,
    required: ['slug'],
    properties: {
      slug: {
        type: 'string',
        description:
          'Identificador da solução (ex: "maestria"). Lista disponível na seção "Soluções que oferecemos" do system prompt.',
        minLength: 1,
        maxLength: 80,
      },
    },
  };

  constructor(private readonly prisma: PrismaService) {}

  async execute(
    input: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<ToolResult> {
    const slug = String(input.slug ?? '').trim().toLowerCase();
    if (!slug) {
      return { output: { ok: false, error: 'slug obrigatório' } };
    }

    try {
      const product = await this.prisma.product.findUnique({
        where: {
          organizationId_slug: { organizationId: ctx.organizationId, slug },
        },
      });

      if (!product) {
        return {
          output: {
            ok: false,
            error: `Solução "${slug}" não encontrada. Confira os slugs na seção "Soluções que oferecemos" do system prompt.`,
          },
        };
      }

      this.logger.log(
        `getProductPitch served ${slug} (org=${ctx.organizationId})`,
      );

      return {
        output: {
          ok: true,
          product: {
            name: product.name,
            slug: product.slug,
            category: product.category,
            shortLine: product.shortLine,
            pitch: product.pitch,
            price: product.price,
            paymentLink: product.paymentLink,
            targetAudience: product.targetAudience,
            differentiators: product.differentiators,
          },
        },
      };
    } catch (err: any) {
      this.logger.warn(
        `getProductPitch failed for ${slug}: ${err?.message ?? err}`,
      );
      return {
        output: {
          ok: false,
          error: `Falha ao buscar detalhes da solução: ${err?.message ?? 'erro desconhecido'}`,
        },
      };
    }
  }
}
