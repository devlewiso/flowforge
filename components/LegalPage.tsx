import Link from "next/link";
import type { ReactNode } from "react";
import { SITE } from "@/lib/site";

export function LegalPage({ title, intro, children }: { title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-line-soft">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-5 py-3.5">
          <Link href="/" className="text-[15px] font-semibold tracking-tight hover:text-accent-soft">
            ← {SITE.name}
          </Link>
          <nav className="ml-auto flex gap-4 text-[12px] text-muted" aria-label="Legal">
            <Link href="/privacy" className="hover:text-text">Privacy</Link>
            <Link href="/terms" className="hover:text-text">Terms</Link>
            <Link href="/security" className="hover:text-text">Security</Link>
            <Link href="/licenses" className="hover:text-text">Licenses</Link>
          </nav>
        </div>
      </header>
      <main className="legal mx-auto max-w-3xl px-5 pb-24 pt-10">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-[12px] text-muted">Effective {SITE.effectiveDate} · Operated by {SITE.operator}</p>
        {intro && <div className="mt-6 rounded-xl border border-line-soft bg-panel-2 p-4 text-[13.5px] leading-relaxed">{intro}</div>}
        <div className="mt-8">{children}</div>
      </main>
    </div>
  );
}

export function Contact() {
  return SITE.contactEmail ? (
    <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>
  ) : (
    <span className="text-[#fca5a5]">[contact email not configured — set NEXT_PUBLIC_CONTACT_EMAIL]</span>
  );
}
