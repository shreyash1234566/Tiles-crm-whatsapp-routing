import { Roboto_Mono } from 'next/font/google';
import './globals.css';
import AuthProvider from '@/components/AuthProvider';
import AlertToastProvider from '@/components/AlertToastProvider';
import { getBrand } from '@/lib/brand';

const robotoMono = Roboto_Mono({ subsets: ['latin'], variable: '--font-roboto-mono', weight: ['300', '400', '500', '600', '700'] });

export function generateMetadata() {
  const brand = getBrand();
  return {
    title: brand.title,
    description: brand.description,
    icons: { icon: brand.favicon },
  };
}

export default function RootLayout({ children }) {
  const brand = getBrand();
  return (
    <html lang="en" data-brand={brand.brandAttribute ?? undefined} suppressHydrationWarning>
      <body suppressHydrationWarning className={`${robotoMono.variable} font-sans antialiased`}>
        <AuthProvider>
          <AlertToastProvider>
            {children}
          </AlertToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
