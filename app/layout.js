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
  // For the Homzentic vertical the UI defaults to the dark theme (NeuroBank
  // style); "light" is opt-in via data-theme. This pre-paint script restores
  // the user's saved choice before first paint to avoid a flash.
  const themeInit = `
try {
  var el = document.documentElement;
  if (el.getAttribute('data-brand') === 'homzentic') {
    var t = localStorage.getItem('homzentic-theme');
    if (t === 'light') { el.setAttribute('data-theme','light'); }
    else { el.removeAttribute('data-theme'); }
  }
} catch (e) {}
`;
  return (
    <html lang="en" data-brand={brand.brandAttribute ?? undefined} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
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
