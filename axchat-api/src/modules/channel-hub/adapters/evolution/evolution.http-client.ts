import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Channel } from '@prisma/client';
import axios, { AxiosInstance } from 'axios';
import { EvolutionSettingsService } from './evolution-settings.service';

export interface EvolutionInstance {
  instanceName: string;
  /** Token próprio da instância, devolvido na criação. Pode não vir. */
  token: string | null;
  qrBase64: string | null;
  pairingCode: string | null;
}

export type EvolutionState = 'open' | 'connecting' | 'close' | 'unknown';

/**
 * Cliente do servidor Evolution da plataforma.
 *
 * O endereço não é constante como no Zappfy: vem do `PlatformSetting`, porque
 * o dono da plataforma troca de servidor pela tela. Por isso todo método pede a
 * config antes de montar o cliente — não dá pra guardar um axios pronto.
 *
 * Duas credenciais diferentes, e misturar as duas é o erro clássico aqui:
 *   - a chave GLOBAL cria/apaga instância;
 *   - o token DA INSTÂNCIA manda mensagem.
 * `authFor` resolve isso num lugar só.
 */
@Injectable()
export class EvolutionHttpClient {
  private readonly logger = new Logger(EvolutionHttpClient.name);

  constructor(private readonly settings: EvolutionSettingsService) {}

  private async client(apiKey?: string | null): Promise<AxiosInstance> {
    const cfg = await this.settings.getEffective();
    if (!cfg.baseUrl || !cfg.apiKey) {
      // Mensagem pro operador, não pro cliente final: quem resolve isto é o
      // Super Admin, e ele precisa saber exatamente onde.
      throw new ServiceUnavailableException(
        'Servidor Evolution não configurado. Preencha endereço e chave em Super Admin › Integrações › WhatsApp não oficial.',
      );
    }
    return axios.create({
      baseURL: cfg.baseUrl,
      headers: { apikey: apiKey || cfg.apiKey, 'Content-Type': 'application/json' },
      timeout: 30_000,
    });
  }

  /** Token da instância quando existir; senão a chave global. */
  private authFor(channel: Channel): string | null {
    const cfg = (channel.config ?? {}) as Record<string, any>;
    return cfg.instanceToken ?? null;
  }

  private instanceOf(channel: Channel): string {
    const cfg = (channel.config ?? {}) as Record<string, any>;
    const name = cfg.instanceName;
    if (!name) {
      throw new ServiceUnavailableException(
        'Este canal ainda não tem instância criada no servidor Evolution.',
      );
    }
    return String(name);
  }

  private erro(acao: string, err: any): never {
    const detalhe =
      err?.response?.data?.response?.message ??
      err?.response?.data?.message ??
      err?.message;
    this.logger.error(`Evolution ${acao} falhou: ${JSON.stringify(detalhe)}`);
    throw new ServiceUnavailableException(
      `Servidor Evolution recusou "${acao}": ${
        Array.isArray(detalhe) ? detalhe.join('; ') : detalhe
      }`,
    );
  }

  /**
   * Cria a instância e já deixa o webhook apontado pra cá.
   *
   * O webhook é configurado no ato porque uma instância sem webhook conecta,
   * recebe mensagem e não entrega nada — parece que funcionou, e o cliente só
   * descobre quando reclama que a caixa de entrada está vazia.
   */
  async createInstance(
    instanceName: string,
    webhookUrl: string,
    webhookSecret: string,
  ): Promise<EvolutionInstance> {
    const http = await this.client();
    try {
      const { data } = await http.post('/instance/create', {
        instanceName,
        integration: 'WHATSAPP-BAILEYS',
        qrcode: true,
        webhook: {
          url: webhookUrl,
          byEvents: false,
          base64: true,
          // Evolution não assina o corpo. O segredo viaja no header e é o que
          // prova que o webhook veio do nosso servidor, e não de quem
          // adivinhou a URL.
          headers: { 'x-webhook-token': webhookSecret },
          events: [
            'MESSAGES_UPSERT',
            'MESSAGES_UPDATE',
            'SEND_MESSAGE',
            'CONNECTION_UPDATE',
            'QRCODE_UPDATED',
            'CONTACTS_UPSERT',
          ],
        },
      });
      return this.lerInstancia(instanceName, data);
    } catch (err) {
      this.erro('criar instância', err);
    }
  }

  /**
   * QR novo pra uma instância que já existe.
   *
   * O QR do WhatsApp expira em cerca de 20 segundos, então a tela relê isto
   * enquanto ninguém escaneou.
   */
  async connect(channel: Channel): Promise<EvolutionInstance> {
    const http = await this.client();
    const name = this.instanceOf(channel);
    try {
      const { data } = await http.get(`/instance/connect/${name}`);
      return this.lerInstancia(name, data);
    } catch (err) {
      this.erro('gerar QR code', err);
    }
  }

  async connectionState(channel: Channel): Promise<EvolutionState> {
    const http = await this.client();
    const name = this.instanceOf(channel);
    try {
      const { data } = await http.get(`/instance/connectionState/${name}`);
      const estado = data?.instance?.state ?? data?.state;
      return this.lerEstado(estado);
    } catch (err: any) {
      // Instância apagada no servidor vira 404. Isso não é erro de rede: é a
      // resposta honesta de "não está conectada".
      if (err?.response?.status === 404) return 'close';
      this.erro('consultar estado', err);
    }
  }

  /** Desconecta o celular mas mantém a instância — permite reconectar por QR. */
  async logout(channel: Channel): Promise<void> {
    const http = await this.client();
    const name = this.instanceOf(channel);
    try {
      await http.delete(`/instance/logout/${name}`);
    } catch (err: any) {
      if (err?.response?.status === 404) return;
      this.erro('desconectar', err);
    }
  }

  /** Apaga a instância do servidor. Usado quando o canal é removido. */
  async deleteInstance(channel: Channel): Promise<void> {
    const http = await this.client();
    const cfg = (channel.config ?? {}) as Record<string, any>;
    if (!cfg.instanceName) return;
    try {
      await http.delete(`/instance/delete/${cfg.instanceName}`);
    } catch (err: any) {
      // Já não existe lá: o objetivo (não existir) está cumprido.
      if (err?.response?.status === 404) return;
      this.logger.warn(
        `Não consegui apagar a instância ${cfg.instanceName}: ${err?.message}`,
      );
    }
  }

  /** POST autenticado como a instância — é por aqui que a mensagem sai. */
  async post(
    channel: Channel,
    endpoint: string,
    payload: Record<string, any>,
  ): Promise<any> {
    const http = await this.client(this.authFor(channel));
    const name = this.instanceOf(channel);
    try {
      const { data } = await http.post(`${endpoint}/${name}`, payload);
      return data;
    } catch (err) {
      this.erro(`chamar ${endpoint}`, err);
    }
  }

  /** Confere endereço e chave sem criar nada — é o botão "testar" da tela. */
  async testarConexao(): Promise<{ ok: boolean; detalhe: string }> {
    let http: AxiosInstance;
    try {
      http = await this.client();
    } catch (err) {
      return { ok: false, detalhe: (err as Error).message };
    }

    try {
      const { data } = await http.get('/instance/fetchInstances');
      const total = Array.isArray(data) ? data.length : 0;
      return {
        ok: true,
        detalhe: `Servidor respondeu. ${total} instância(s) hoje neste servidor.`,
      };
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 401 || status === 403) {
        return { ok: false, detalhe: 'O servidor respondeu, mas recusou a chave (401/403).' };
      }
      if (status === 404) {
        return {
          ok: false,
          detalhe:
            'Respondeu 404. O endereço provavelmente aponta pra fora da raiz da API (confira se sobrou um caminho no fim da URL).',
        };
      }
      return {
        ok: false,
        detalhe: `Não consegui falar com o servidor: ${err?.message}`,
      };
    }
  }

  /**
   * As versões da Evolution divergem no formato da resposta: `hash` ora é
   * string, ora `{apikey}`; o QR ora vem em `qrcode.base64`, ora solto em
   * `base64`. Ler todas as variantes aqui evita espalhar `??` pelo adaptador
   * inteiro — e evita o modo de falha silencioso em que o QR volta null e a
   * tela mostra um quadrado vazio sem dizer por quê.
   */
  private lerInstancia(instanceName: string, data: any): EvolutionInstance {
    const hash = data?.hash;
    const token =
      (typeof hash === 'string' ? hash : null) ??
      hash?.apikey ??
      data?.instance?.apikey ??
      data?.apikey ??
      null;

    const base64 = data?.qrcode?.base64 ?? data?.base64 ?? null;

    if (!base64 && !data?.instance) {
      this.logger.warn(
        `Resposta inesperada da Evolution ao conectar: ${JSON.stringify(data)?.slice(0, 300)}`,
      );
    }

    return {
      instanceName: data?.instance?.instanceName ?? instanceName,
      token: token ? String(token) : null,
      // O front desenha via <img src>, então normalizo pro data-URI aqui: em
      // algumas versões vem com prefixo, em outras é base64 cru.
      qrBase64: base64
        ? String(base64).startsWith('data:')
          ? String(base64)
          : `data:image/png;base64,${base64}`
        : null,
      pairingCode: data?.qrcode?.pairingCode ?? data?.pairingCode ?? null,
    };
  }

  private lerEstado(bruto: unknown): EvolutionState {
    const s = String(bruto ?? '').toLowerCase();
    if (s === 'open') return 'open';
    if (s === 'connecting') return 'connecting';
    if (s === 'close' || s === 'closed') return 'close';
    return 'unknown';
  }
}
