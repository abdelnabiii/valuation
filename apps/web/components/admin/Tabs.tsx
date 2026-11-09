"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Tabs({ base, tabs }: { base: string; tabs: { href: string; label: string }[] }) {
  const p = usePathname();
  return (
    <nav className="tabs" aria-label="Engagement sections">
      {tabs.map((t) => {
        const href = `${base}${t.href}`;
        const active = t.href === "" ? p === base : p.startsWith(href);
        return (
          <Link key={t.href} href={href} aria-current={active ? "page" : undefined}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
