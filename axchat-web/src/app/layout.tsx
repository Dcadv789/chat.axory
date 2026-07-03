import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/providers';

const inter = Inter({ subsets: ['latin'] });

// Logo/favicon servidos pelo imgproxy da Axory; {s} = tamanho (rs:fit).
const LOGO_BASE =
  'https://img.axory.com.br/insecure/rs:fit:{s}/q:95/plain/https://storage.axory.com.br/imagens-saas-sites/1782507997191-logo_final.svg@png';

export const metadata: Metadata = {
  title: 'AxChat',
  description: 'Plataforma de atendimento omnichannel com IA',
  icons: {
    icon: LOGO_BASE.replace('{s}', '64:64'),
    shortcut: LOGO_BASE.replace('{s}', '64:64'),
    apple: LOGO_BASE.replace('{s}', '180:180'),
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className="bg-[#f8fafc] dark:bg-[#171717]"
    >
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
