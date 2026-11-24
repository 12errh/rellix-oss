import type {Metadata, Viewport} from 'next';
import './globals.css'; // Global styles
import PwaRegister from '@/components/PwaRegister';
import InstallPromptLazy from '@/components/InstallPromptLazy';
import TmdbKeyOnboarding from '@/components/TmdbKeyOnboarding';

export const metadata: Metadata = {
  title: 'Rellix - Stream Movies, TV Shows & Anime',
  description: 'Watch Rellix movies, TV series, and anime online or stream right to your screen with instant streaming player integration.',
  openGraph: {
    title: 'Rellix - Stream Movies, TV Shows & Anime',
    description: 'Watch Rellix movies, TV series, and anime online or stream right to your screen with instant streaming player integration.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Rellix - Stream Movies, TV Shows & Anime',
    description: 'Watch Rellix movies, TV series, and anime online or stream right to your screen with instant streaming player integration.',
  },
};

export const viewport: Viewport = {
  themeColor: '#111111',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" className="dark">
      <body suppressHydrationWarning className="bg-[#111111] text-[#e5e5e5] antialiased min-h-screen font-sans selection:bg-[#E50914] selection:text-white overflow-x-hidden">
        {children}
        <PwaRegister />
        <InstallPromptLazy />
        <TmdbKeyOnboarding />
      </body>
    </html>
  );
}
