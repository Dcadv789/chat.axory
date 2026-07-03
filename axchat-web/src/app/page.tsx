import type { Metadata } from 'next';
import { LandingPage } from '@/features/landing/landing-page';

export const metadata: Metadata = {
  title: 'AxChat — Atendimento e marketing com uma equipe de IA',
  description:
    'Unifique WhatsApp, Instagram e Telegram numa inbox só, com agentes de IA que atendem, qualificam, agendam e rodam suas campanhas. Você aprova, eles executam.',
  openGraph: {
    title: 'AxChat — Atendimento e marketing com uma equipe de IA',
    description:
      'Inbox omnichannel + crew de agentes de IA + marketing no automático. Você no controle, a IA executando.',
    type: 'website',
  },
};

export default function Home() {
  return <LandingPage />;
}
