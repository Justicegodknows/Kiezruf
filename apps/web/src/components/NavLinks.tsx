'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon, type IconName } from './Icon';

export function NavLinks({ label, items }: { label: string; items: { href: string; text: string; icon: IconName }[] }) {
  const pathname = usePathname() ?? '';
  return (
    <nav aria-label={label} className="nav-links">
      {items.map((item) => {
        // The home link (/de) is active on report pages too; other links match by prefix.
        const isHome = item.href.split('/').length === 2;
        const active = isHome
          ? !items.some((i) => i !== item && pathname.startsWith(i.href))
          : pathname.startsWith(item.href);
        return (
          <Link key={item.href} href={item.href} className="nav-link" aria-current={active ? 'page' : undefined}>
            <Icon name={item.icon} size={18} />
            <span>{item.text}</span>
          </Link>
        );
      })}
    </nav>
  );
}
