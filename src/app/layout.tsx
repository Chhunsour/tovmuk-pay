import type { Metadata } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const plexSans = IBM_Plex_Sans({ variable: "--font-plex-sans", subsets: ["latin"], weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  title: { default: "Tovmuk Pay", template: "%s | Tovmuk Pay" },
  description: "Send KHR and authorize the payment on ABA PayWay.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${plexSans.variable} h-full`}>
      <body className="flex min-h-full flex-col bg-bg font-sans text-fg antialiased">
        <header className="border-b border-line bg-surface">
          <div className="mx-auto flex h-16 max-w-5xl items-center gap-8 px-4 sm:px-6">
            <Link href="/" className="flex items-center gap-2 text-[15px] font-semibold">
              <span className="grid size-6 place-items-center rounded-md bg-brand text-xs font-semibold text-on-brand">T</span>
              Tovmuk Pay
            </Link>
            <nav className="flex gap-6 text-sm text-muted">
              <Link href="/" className="hover:text-fg">
                Send
              </Link>
              <Link href="/track" className="hover:text-fg">
                Track
              </Link>
            </nav>
            <span className="ml-auto hidden text-xs text-muted sm:block">Payments by ABA PayWay</span>
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-12">{children}</main>
        <footer className="border-t border-line">
          <p className="mx-auto max-w-5xl px-4 py-5 text-xs text-faint sm:px-6">
            © 2026 Tovmuk Solution. Card and bank details are entered only on ABA PayWay&apos;s checkout.
          </p>
        </footer>
      </body>
    </html>
  );
}
