'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Loader2, X, Copy, Check, HelpCircle, ChevronDown, MessageSquareText, AtSign } from 'lucide-react';
import { channelsService, type ChannelType } from '../services/channels.service';
import { aiAgentsService } from '@/features/ai-agents/services/ai-agents.service';
import { ZappfyIcon, MetaIcon, InstagramIcon, TelegramIcon } from '@/components/ui/icons';
import { CoexistenceConnect } from './coexistence-connect';
import { InstagramConnect } from './instagram-connect';
import { ThreadsConnect } from './threads-connect';

const channelTypes: { value: ChannelType; label: string; icon: React.ElementType; color: string; description: string }[] = [
  {
    value: 'WHATSAPP_ZAPPFY',
    label: 'WhatsApp (Zappfy)',
    icon: ZappfyIcon,
    color: 'bg-zinc-50 dark:bg-black',
    description: 'Conecte via Zappfy/Uazapi — sem restrição de 24h',
  },
  {
    value: 'WHATSAPP_OFFICIAL',
    label: 'WhatsApp Official',
    icon: MetaIcon,
    color: 'bg-zinc-50 dark:bg-black',
    description: 'Meta Cloud API — templates HSM, alta escala',
  },
  {
    value: 'INSTAGRAM',
    label: 'Instagram',
    icon: InstagramIcon,
    color: 'bg-zinc-50 dark:bg-black',
    description: 'Instagram API com login empresarial — DMs e stories',
  },
  {
    value: 'TELEGRAM',
    label: 'Telegram',
    icon: TelegramIcon,
    color: 'bg-sky-50 dark:bg-sky-950/40',
    description: 'Telegram Bot API para conversas privadas, grupos e midia',
  },
  {
    value: 'THREADS',
    label: 'Threads',
    icon: AtSign,
    color: 'bg-zinc-50 dark:bg-black',
    description: 'Publicar posts, gerenciar respostas e ver métricas — via login Meta',
  },
  {
    value: 'INTERNAL',
    label: 'Canal Interno',
    icon: MessageSquareText,
    color: 'bg-violet-50 dark:bg-violet-950/40',
    description: 'Converse direto com o orquestrador de marketing dentro do app',
  },
];

const zappfySchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  token: z.string().min(1, 'Token é obrigatório'),
  webhookSecret: z.string().optional(),
});

const waOfficialSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  phoneNumberId: z.string().min(1, 'Phone Number ID é obrigatório'),
  accessToken: z.string().min(1, 'Access Token é obrigatório'),
  appSecret: z.string().min(1, 'App Secret é obrigatório (valida assinatura dos webhooks)'),
  businessAccountId: z.string().optional(),
  webhookSecret: z.string().optional(),
});

const instagramSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  accessToken: z.string().min(1, 'Access Token é obrigatório'),
  appSecret: z.string().min(1, 'App Secret é obrigatório'),
  igBusinessId: z.string().min(1, 'Instagram Business ID é obrigatório (é o mesmo IG_USER_ID das Variáveis)'),
  igAppId: z.string().optional(),
  webhookSecret: z.string().optional(),
});

const telegramSchema = z.object({
  name: z.string().min(1, 'Nome e obrigatorio'),
  botToken: z.string().min(1, 'Bot token e obrigatorio'),
  botUsername: z.string().optional(),
  secretToken: z.string().min(16, 'Secret token precisa ter pelo menos 16 caracteres'),
});

const internalSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  orchestratorId: z.string().min(1, 'Escolha o orquestrador que vai responder'),
});

type ZappfyFormData = z.infer<typeof zappfySchema>;
type WaOfficialFormData = z.infer<typeof waOfficialSchema>;
type InstagramFormData = z.infer<typeof instagramSchema>;
type TelegramFormData = z.infer<typeof telegramSchema>;
type InternalFormData = z.infer<typeof internalSchema>;

const inputCls = 'flex h-10 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm ring-offset-background placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:border-white/10 dark:bg-black dark:text-zinc-100';
const labelCls = 'text-sm font-medium text-zinc-700 dark:text-zinc-300';
const errorCls = 'text-xs text-red-500';

interface CreateChannelDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function CreateChannelDialog({ open, onClose, onCreated }: CreateChannelDialogProps) {
  const [step, setStep] = useState<'type' | 'config'>('type');
  const [selectedType, setSelectedType] = useState<ChannelType | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  // Default ORG = qualquer membro com permissão padrão enxerga.
  // PRIVATE = apenas quem tiver grant explícito (pra canais sensíveis).
  const [visibility, setVisibility] = useState<'ORG' | 'PRIVATE'>('ORG');
  const [showTelegramHelp, setShowTelegramHelp] = useState(false);
  const [showInstagramHelp, setShowInstagramHelp] = useState(false);
  // WhatsApp Official: 'api' = formulário manual; 'coexistence' = QR Embedded
  // Signup; 'embedded' = Embedded Signup padrão (login Facebook, puxa credenciais).
  const [waMode, setWaMode] = useState<'api' | 'coexistence' | 'embedded'>('api');
  // Instagram: 'facebook' = Facebook Login for Business (puxa tudo); 'api' =
  // formulário manual (token de System User).
  const [igMode, setIgMode] = useState<'facebook' | 'api'>('facebook');
  // Threads: nome do canal (OAuth via redirect, sem formulário de credenciais).
  const [threadsName, setThreadsName] = useState('');

  const zappfyForm = useForm<ZappfyFormData>({
    resolver: zodResolver(zappfySchema),
    defaultValues: { name: '', token: '', webhookSecret: '' },
  });

  const waForm = useForm<WaOfficialFormData>({
    resolver: zodResolver(waOfficialSchema),
    defaultValues: { name: '', phoneNumberId: '', accessToken: '', appSecret: '', businessAccountId: '', webhookSecret: '' },
  });

  const igForm = useForm<InstagramFormData>({
    resolver: zodResolver(instagramSchema),
    defaultValues: { name: '', accessToken: '', appSecret: '', igBusinessId: '', igAppId: '', webhookSecret: '' },
  });

  const telegramForm = useForm<TelegramFormData>({
    resolver: zodResolver(telegramSchema),
    defaultValues: { name: '', botToken: '', botUsername: '', secretToken: makeSecretToken() },
  });

  const internalForm = useForm<InternalFormData>({
    resolver: zodResolver(internalSchema),
    defaultValues: { name: '', orchestratorId: '' },
  });

  // Orquestradores de marketing — só esses podem responder no canal interno.
  const { data: orchestrators = [] } = useQuery({
    queryKey: ['ai-agents', 'MARKETING'],
    queryFn: () => aiAgentsService.list('MARKETING'),
    enabled: open && selectedType === 'INTERNAL',
  });
  const marketingOrchestrators = orchestrators.filter(
    (a) => a.kind === 'ORCHESTRATOR',
  );

  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

  const handleTypeSelect = (type: ChannelType) => {
    setSelectedType(type);
    setStep('config');
  };

  const handleCopyWebhook = (channelType: string) => {
    navigator.clipboard.writeText(`${apiBaseUrl}/webhooks/${channelType}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const submitChannel = async (type: ChannelType, name: string, config: Record<string, any>, webhookSecret?: string) => {
    setIsLoading(true);
    try {
      await channelsService.create({ type, name, config, webhookSecret, visibility });
      toast.success('Canal criado com sucesso!');
      handleClose();
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao criar canal');
    } finally {
      setIsLoading(false);
    }
  };

  const onSubmitZappfy = (data: ZappfyFormData) =>
    submitChannel('WHATSAPP_ZAPPFY', data.name, { token: data.token }, data.webhookSecret);

  const onSubmitWaOfficial = (data: WaOfficialFormData) =>
    submitChannel(
      'WHATSAPP_OFFICIAL',
      data.name,
      {
        phoneNumberId: data.phoneNumberId,
        accessToken: data.accessToken,
        appSecret: data.appSecret,
        businessAccountId: data.businessAccountId || undefined,
      },
      data.webhookSecret,
    );

  const onConnectCoexistence = async (payload: {
    code: string;
    phoneNumberId: string;
    businessAccountId: string;
  }) => {
    setIsLoading(true);
    try {
      await channelsService.createCoexistence({
        name: waForm.getValues('name') || 'WhatsApp Coexistência',
        ...payload,
        visibility,
      });
      toast.success('Canal conectado por coexistência!');
      handleClose();
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao conectar canal');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const onConnectEmbedded = async (payload: {
    code: string;
    phoneNumberId: string;
    businessAccountId: string;
  }) => {
    setIsLoading(true);
    try {
      await channelsService.createEmbeddedSignup({
        name: waForm.getValues('name') || 'WhatsApp Business',
        ...payload,
        visibility,
      });
      toast.success('Canal conectado! Credenciais puxadas do Facebook.');
      handleClose();
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao conectar canal');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const onConnectInstagram = async (payload: { code: string }) => {
    setIsLoading(true);
    try {
      await channelsService.createInstagramFacebookLogin({
        name: igForm.getValues('name') || 'Instagram',
        code: payload.code,
        visibility,
      });
      toast.success('Instagram conectado! Página e conta puxadas do Facebook.');
      handleClose();
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao conectar Instagram');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const onSubmitInstagram = (data: InstagramFormData) =>
    submitChannel(
      'INSTAGRAM',
      data.name,
      {
        accessToken: data.accessToken,
        appSecret: data.appSecret,
        igBusinessId: data.igBusinessId || undefined,
        igAppId: data.igAppId || undefined,
        apiVersion: 'v25.0',
      },
      data.webhookSecret,
    );

  const onSubmitTelegram = (data: TelegramFormData) =>
    submitChannel(
      'TELEGRAM',
      data.name,
      {
        botToken: data.botToken,
        botUsername: data.botUsername || undefined,
        secretToken: data.secretToken,
      },
      data.secretToken,
    );

  const onSubmitInternal = (data: InternalFormData) =>
    submitChannel('INTERNAL', data.name, {
      orchestratorId: data.orchestratorId,
    });

  const handleClose = () => {
    setStep('type');
    setSelectedType(null);
    setWaMode('api');
    setIgMode('facebook');
    setThreadsName('');
    zappfyForm.reset();
    waForm.reset();
    igForm.reset();
    telegramForm.reset({ name: '', botToken: '', botUsername: '', secretToken: makeSecretToken() });
    internalForm.reset();
    onClose();
  };

  if (!open) return null;

  const titleMap: Record<string, string> = {
    WHATSAPP_ZAPPFY: 'Configurar Zappfy',
    WHATSAPP_OFFICIAL: 'Configurar WhatsApp Official',
    INSTAGRAM: 'Configurar Instagram',
    TELEGRAM: 'Configurar Telegram',
    THREADS: 'Configurar Threads',
    INTERNAL: 'Configurar Canal Interno',
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />
      <div className="relative z-50 flex h-full w-full max-w-lg flex-col bg-white shadow-2xl dark:bg-black">
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-white/10">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            {step === 'type' ? 'Novo Canal' : titleMap[selectedType || '']}
          </h2>
          <button onClick={handleClose} className="rounded-md p-1 text-zinc-400 hover:text-zinc-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 pb-6">

        {step === 'type' ? (
          <div className="mt-6 grid gap-3">
            {channelTypes.map((ct) => (
              <button
                key={ct.value}
                onClick={() => handleTypeSelect(ct.value)}
                className="flex items-center gap-4 rounded-xl border border-zinc-200 p-4 text-left transition-all hover:border-primary hover:shadow-sm dark:border-white/10 dark:hover:border-primary"
              >
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-200/60 dark:border-white/10 ${ct.color}`}>
                  <ct.icon className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{ct.label}</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">{ct.description}</p>
                </div>
              </button>
            ))}
          </div>
        ) : selectedType === 'WHATSAPP_ZAPPFY' ? (
          <form onSubmit={zappfyForm.handleSubmit(onSubmitZappfy)} className="mt-6 space-y-4">
            <Field label="Nome do canal" placeholder="Ex: WhatsApp Principal" error={zappfyForm.formState.errors.name?.message} {...zappfyForm.register('name')} />
            <Field label="Token" placeholder="Token da instância Zappfy" error={zappfyForm.formState.errors.token?.message} {...zappfyForm.register('token')} />
            <Field label="Webhook Secret" placeholder="Opcional" optional {...zappfyForm.register('webhookSecret')} />
            <WebhookUrl url={`${apiBaseUrl}/webhooks/WHATSAPP_ZAPPFY`} copied={copied} onCopy={() => handleCopyWebhook('WHATSAPP_ZAPPFY')} />
            <FormFooter isLoading={isLoading} onBack={() => setStep('type')} />
          </form>
        ) : selectedType === 'WHATSAPP_OFFICIAL' ? (
          <div className="mt-6 space-y-4">
            <div className="flex gap-2 rounded-lg border border-zinc-200 p-1 dark:border-white/10">
              <button
                type="button"
                onClick={() => setWaMode('embedded')}
                className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  waMode === 'embedded'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-white/5'
                }`}
              >
                Login Facebook
              </button>
              <button
                type="button"
                onClick={() => setWaMode('coexistence')}
                className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  waMode === 'coexistence'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-white/5'
                }`}
              >
                Coexistência
              </button>
              <button
                type="button"
                onClick={() => setWaMode('api')}
                className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  waMode === 'api'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-white/5'
                }`}
              >
                Manual
              </button>
            </div>

            {waMode === 'api' ? (
              <form onSubmit={waForm.handleSubmit(onSubmitWaOfficial)} className="space-y-4">
                <Field label="Nome do canal" placeholder="Ex: WhatsApp Business" error={waForm.formState.errors.name?.message} {...waForm.register('name')} />
                <Field label="Phone Number ID" placeholder="Encontrado no Meta Business Suite" error={waForm.formState.errors.phoneNumberId?.message} {...waForm.register('phoneNumberId')} />
                <Field label="Access Token" type="text" placeholder="System User Token ou Temporary Token" error={waForm.formState.errors.accessToken?.message} {...waForm.register('accessToken')} />
                <Field label="App Secret" type="text" placeholder="Chave secreta do app (Settings → Basic na Meta)" error={waForm.formState.errors.appSecret?.message} {...waForm.register('appSecret')} />
                <Field label="Business Account ID (WABA)" placeholder="Opcional — habilita auto-subscribe do webhook" optional {...waForm.register('businessAccountId')} />
                <Field label="Webhook Verify Token" placeholder="Token que você definiu no Meta" optional {...waForm.register('webhookSecret')} />
                <WebhookUrl url={`${apiBaseUrl}/webhooks/WHATSAPP_OFFICIAL`} copied={copied} onCopy={() => handleCopyWebhook('WHATSAPP_OFFICIAL')} />
                <FormFooter isLoading={isLoading} onBack={() => setStep('type')} />
              </form>
            ) : (
              <>
                <Field label="Nome do canal" placeholder="Ex: WhatsApp Business" error={waForm.formState.errors.name?.message} {...waForm.register('name')} />
                <CoexistenceConnect
                  name={waForm.watch('name') || ''}
                  variant={waMode === 'embedded' ? 'embedded' : 'coexistence'}
                  onConnect={waMode === 'embedded' ? onConnectEmbedded : onConnectCoexistence}
                  isSubmitting={isLoading}
                />
                <div className="flex items-center justify-start pt-2">
                  <button
                    type="button"
                    onClick={() => setStep('type')}
                    className="rounded-md px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-white/10"
                  >
                    Voltar
                  </button>
                </div>
              </>
            )}
          </div>
        ) : selectedType === 'INSTAGRAM' ? (
          <div className="mt-6 space-y-4">
            <div className="flex gap-2 rounded-lg border border-zinc-200 p-1 dark:border-white/10">
              <button
                type="button"
                onClick={() => setIgMode('facebook')}
                className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  igMode === 'facebook'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-white/5'
                }`}
              >
                Login Facebook
              </button>
              <button
                type="button"
                onClick={() => setIgMode('api')}
                className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  igMode === 'api'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-white/5'
                }`}
              >
                Manual
              </button>
            </div>

            {igMode === 'facebook' ? (
              <>
                <Field label="Nome do canal" placeholder="Ex: Instagram Loja" error={igForm.formState.errors.name?.message} {...igForm.register('name')} />
                <InstagramConnect
                  name={igForm.watch('name') || ''}
                  onConnect={onConnectInstagram}
                  isSubmitting={isLoading}
                />
                <div className="flex items-center justify-start pt-2">
                  <button
                    type="button"
                    onClick={() => setStep('type')}
                    className="rounded-md px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-white/10"
                  >
                    Voltar
                  </button>
                </div>
              </>
            ) : (
              <form onSubmit={igForm.handleSubmit(onSubmitInstagram)} className="space-y-4">
                <InstagramHelp open={showInstagramHelp} onToggle={() => setShowInstagramHelp((v) => !v)} />
                <Field label="Nome do canal" placeholder="Ex: Instagram Loja" error={igForm.formState.errors.name?.message} {...igForm.register('name')} />
                <Field label="Access Token" type="text" placeholder="O mesmo token de System User dos agentes (IG_ACCESS_TOKEN nas Variáveis)" error={igForm.formState.errors.accessToken?.message} {...igForm.register('accessToken')} />
                <Field label="App Secret" type="text" placeholder="developers.facebook.com → seu app → Básico → Chave Secreta" error={igForm.formState.errors.appSecret?.message} {...igForm.register('appSecret')} />
                <Field label="Instagram Business ID" placeholder="Cole o mesmo IG_USER_ID das Variáveis (obrigatório)" error={igForm.formState.errors.igBusinessId?.message} {...igForm.register('igBusinessId')} />
                <Field label="Instagram App ID" placeholder="Opcional — número do app no topo do painel da Meta" optional {...igForm.register('igAppId')} />
                <Field label="Webhook Verify Token" placeholder="Uma senha que VOCÊ inventa — vai usar igual no painel da Meta" optional {...igForm.register('webhookSecret')} />
                <WebhookUrl url={`${apiBaseUrl}/webhooks/INSTAGRAM`} copied={copied} onCopy={() => handleCopyWebhook('INSTAGRAM')} />
                <FormFooter isLoading={isLoading} onBack={() => setStep('type')} />
              </form>
            )}
          </div>
        ) : selectedType === 'TELEGRAM' ? (
          <form onSubmit={telegramForm.handleSubmit(onSubmitTelegram)} className="mt-6 space-y-4">
            <TelegramHelp open={showTelegramHelp} onToggle={() => setShowTelegramHelp((v) => !v)} />
            <Field label="Nome do canal" placeholder="Ex: Telegram Suporte" error={telegramForm.formState.errors.name?.message} {...telegramForm.register('name')} />
            <Field label="Bot Token" type="text" placeholder="Token do BotFather" error={telegramForm.formState.errors.botToken?.message} {...telegramForm.register('botToken')} />
            <Field label="Bot Username" placeholder="Opcional - ex: axory_suporte_bot" optional {...telegramForm.register('botUsername')} />
            <Field label="Secret Token" type="text" placeholder="Gerado automaticamente" error={telegramForm.formState.errors.secretToken?.message} {...telegramForm.register('secretToken')} />
            <WebhookUrl url={`${apiBaseUrl}/webhooks/TELEGRAM`} copied={copied} onCopy={() => handleCopyWebhook('TELEGRAM')} />
            <FormFooter isLoading={isLoading} onBack={() => setStep('type')} />
          </form>
        ) : selectedType === 'THREADS' ? (
          <div className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <label className={labelCls}>Nome do canal</label>
              <input
                className={inputCls}
                placeholder="Ex: Threads da Marca"
                value={threadsName}
                onChange={(e) => setThreadsName(e.target.value)}
              />
            </div>
            <ThreadsConnect name={threadsName} visibility={visibility} />
            <div className="flex items-center justify-start pt-2">
              <button
                type="button"
                onClick={() => setStep('type')}
                className="rounded-md px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-white/10"
              >
                Voltar
              </button>
            </div>
          </div>
        ) : selectedType === 'INTERNAL' ? (
          <form onSubmit={internalForm.handleSubmit(onSubmitInternal)} className="mt-6 space-y-4">
            <div className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-3 text-xs leading-relaxed text-violet-900 dark:border-violet-900/50 dark:bg-violet-950/30 dark:text-violet-100">
              <p className="font-medium">Canal Interno de Marketing</p>
              <p className="mt-1">
                Um espaço privado pra você conversar direto com o orquestrador de
                marketing — dar comandos, pedir ideias, acompanhar campanhas. Nada
                aqui é enviado pra clientes; é só entre você e o agente.
              </p>
            </div>
            <Field label="Nome do canal" placeholder="Ex: Comando de Marketing" error={internalForm.formState.errors.name?.message} {...internalForm.register('name')} />
            <div className="space-y-1.5">
              <label className={labelCls}>Orquestrador que vai responder</label>
              <select
                className={inputCls}
                {...internalForm.register('orchestratorId')}
              >
                <option value="">Selecione um orquestrador…</option>
                {marketingOrchestrators.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
              {marketingOrchestrators.length === 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Nenhum orquestrador de marketing encontrado. Crie um agente do tipo
                  Orquestrador no setor Marketing primeiro.
                </p>
              )}
              {internalForm.formState.errors.orchestratorId && (
                <p className={errorCls}>{internalForm.formState.errors.orchestratorId.message}</p>
              )}
            </div>
            <FormFooter isLoading={isLoading} onBack={() => setStep('type')} />
          </form>
        ) : null}
        </div>
      </div>
    </div>
  );
}

function makeSecretToken() {
  const bytes = new Uint8Array(24);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

import { forwardRef } from 'react';

interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  optional?: boolean;
}

const Field = forwardRef<HTMLInputElement, FieldProps>(
  ({ label, error, optional, ...props }, ref) => (
    <div className="space-y-1.5">
      <label className={labelCls}>
        {label} {optional && <span className="text-zinc-400">(opcional)</span>}
      </label>
      <input ref={ref} className={inputCls} {...props} />
      {error && <p className={errorCls}>{error}</p>}
    </div>
  ),
);
Field.displayName = 'Field';

function WebhookUrl({ url, copied, onCopy }: { url: string; copied: boolean; onCopy: () => void }) {
  return (
    <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-3 dark:border-white/10 dark:bg-black">
      <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
        URL do Webhook (cole no painel do provedor):
      </p>
      <div className="mt-1.5 flex items-center gap-2">
        <code className="flex-1 truncate rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-700 dark:bg-black dark:text-zinc-300">
          {url}
        </code>
        <button
          type="button"
          onClick={onCopy}
          className="shrink-0 rounded-md p-1.5 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 dark:hover:bg-white/10"
        >
          {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

function FormFooter({ isLoading, onBack }: { isLoading: boolean; onBack: () => void }) {
  return (
    <div className="flex items-center justify-end gap-3 pt-2">
      <button
        type="button"
        onClick={onBack}
        className="rounded-md px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-white/10"
      >
        Voltar
      </button>
      <button
        type="submit"
        disabled={isLoading}
        className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Criar Canal
      </button>
    </div>
  );
}

function InstagramHelp({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <div className="rounded-lg border border-pink-200 bg-pink-50 dark:border-pink-900/50 dark:bg-pink-950/30">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-pink-800 dark:text-pink-200">
          <HelpCircle className="h-4 w-4 shrink-0" />
          Onde pegar cada campo (passo a passo)
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-pink-600 transition-transform dark:text-pink-400 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="border-t border-pink-200 px-3 py-3 dark:border-pink-900/50">
          <ol className="space-y-2.5 text-xs leading-relaxed text-pink-900 dark:text-pink-100">
            <li className="flex gap-2">
              <span className="font-semibold">1.</span>
              <span>
                <strong>Access Token</strong> — é o MESMO token permanente de
                System User que você usa nos agentes. Se já salvou como{' '}
                <code className="rounded bg-pink-100 px-1 py-0.5 font-mono dark:bg-pink-900/50">IG_ACCESS_TOKEN</code>{' '}
                em <strong>Configurações → Variáveis</strong>, clique no olhinho
                lá e copie. Pra gerar um novo:{' '}
                <strong>business.facebook.com → Configurações do negócio →
                Usuários → Usuários do sistema → Gerar token</strong>, marcando
                os escopos <em>instagram_basic, instagram_manage_messages,
                instagram_manage_comments, pages_manage_metadata</em>.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="font-semibold">2.</span>
              <span>
                <strong>App Secret</strong> —{' '}
                <strong>developers.facebook.com → seu app → Configurações do
                aplicativo → Básico</strong> → campo{' '}
                <em>&quot;Chave Secreta do Aplicativo&quot;</em> → clique em{' '}
                <em>Mostrar</em>. Serve pra validarmos que os webhooks vieram
                mesmo da Meta.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="font-semibold">3.</span>
              <span>
                <strong>Instagram Business ID</strong> (obrigatório) — o ID
                numérico da conta profissional; é exatamente o mesmo{' '}
                <code className="rounded bg-pink-100 px-1 py-0.5 font-mono dark:bg-pink-900/50">IG_USER_ID</code>{' '}
                que você salvou nas Variáveis. Abra{' '}
                <strong>Configurações → Variáveis</strong>, copie o valor e cole
                aqui.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="font-semibold">4.</span>
              <span>
                <strong>Instagram App ID</strong> — o número do app que aparece
                no topo do painel do developers.facebook.com. Opcional.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="font-semibold">5.</span>
              <span>
                <strong>Webhook Verify Token</strong> — uma senha que{' '}
                <strong>você inventa agora</strong> (ex.:{' '}
                <code className="rounded bg-pink-100 px-1 py-0.5 font-mono dark:bg-pink-900/50">minha-empresa-ig-2026</code>).
                Cole aqui e guarde: vai colar a MESMA no painel da Meta no
                próximo passo.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="font-semibold">6.</span>
              <span>
                <strong>Depois de criar o canal</strong>:{' '}
                <strong>developers.facebook.com → seu app → Webhooks → tópico
                Instagram</strong> → em <em>Callback URL</em> cole a URL de
                webhook mostrada abaixo do formulário; em <em>Verify Token</em>{' '}
                cole a senha do passo 5; e <strong>assine os campos{' '}
                <code className="rounded bg-pink-100 px-1 py-0.5 font-mono dark:bg-pink-900/50">messages</code> e{' '}
                <code className="rounded bg-pink-100 px-1 py-0.5 font-mono dark:bg-pink-900/50">comments</code></strong>{' '}
                (messages = DMs; comments = comentários pros agentes responderem).
              </span>
            </li>
          </ol>
        </div>
      )}
    </div>
  );
}

function TelegramHelp({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50 dark:border-sky-900/50 dark:bg-sky-950/30">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-sky-800 dark:text-sky-200">
          <HelpCircle className="h-4 w-4 shrink-0" />
          Como criar o bot no Telegram (passo a passo)
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-sky-600 transition-transform dark:text-sky-400 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="border-t border-sky-200 px-3 py-3 dark:border-sky-900/50">
          <ol className="space-y-2.5 text-xs leading-relaxed text-sky-900 dark:text-sky-100">
            <li className="flex gap-2">
              <span className="font-semibold">1.</span>
              <span>
                Abra o Telegram (no celular ou no computador) e, na busca,
                digite <strong>@BotFather</strong>. Abra o contato com o selo
                azul de verificado.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="font-semibold">2.</span>
              <span>
                Toque em <strong>Iniciar</strong> (ou envie <code className="rounded bg-sky-100 px-1 py-0.5 font-mono dark:bg-sky-900/50">/start</code>).
                Ele vai responder com a lista de comandos.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="font-semibold">3.</span>
              <span>
                Envie <code className="rounded bg-sky-100 px-1 py-0.5 font-mono dark:bg-sky-900/50">/newbot</code>{' '}
                para criar um novo bot.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="font-semibold">4.</span>
              <span>
                Ele vai pedir um <strong>nome</strong> para o bot (pode ser
                qualquer um, ex: <em>Axory Suporte</em>). Digite e envie.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="font-semibold">5.</span>
              <span>
                Depois ele pede um <strong>username</strong>, que precisa
                terminar em <strong>bot</strong> (ex:{' '}
                <em>axory_suporte_bot</em>). Se já estiver em uso, ele avisa e
                você tenta outro.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="font-semibold">6.</span>
              <span>
                Pronto! O BotFather vai responder com uma mensagem contendo o{' '}
                <strong>token de acesso</strong> — algo parecido com{' '}
                <code className="rounded bg-sky-100 px-1 py-0.5 font-mono text-[10px] dark:bg-sky-900/50">
                  123456789:AAE...xYz
                </code>
                .
              </span>
            </li>
            <li className="flex gap-2">
              <span className="font-semibold">7.</span>
              <span>
                <strong>Copie esse token inteiro</strong> e cole no campo{' '}
                <strong>Bot Token</strong> aqui embaixo. É só isso — o resto
                (webhook, secret token) é configurado automaticamente quando
                você salvar.
              </span>
            </li>
          </ol>
          <p className="mt-3 rounded-md bg-sky-100/70 px-2.5 py-2 text-[11px] text-sky-800 dark:bg-sky-900/40 dark:text-sky-200">
            Dica: guarde o token em local seguro. Se ele vazar, é possível
            gerar um novo no próprio BotFather com{' '}
            <code className="font-mono">/revoke</code>.
          </p>
        </div>
      )}
    </div>
  );
}
