import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';

export const metadata = { title: 'Sayfa bulunamadı' };

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl py-20 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-info/10">
        <Icon name="search" size={22} className="text-info" />
      </div>
      <h1 className="text-lg font-semibold text-ink">Aradığınız sayfa bulunamadı</h1>
      <p className="mt-2 text-[13.5px] text-ink-muted">
        Bağlantı taşınmış veya içerik silinmiş olabilir. Aşağıdaki bağlantılardan devam edebilirsiniz.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Link className="btn-primary btn-md" href="/app/dashboard">
          <Icon name="home" size={15} /> Ana Sayfa
        </Link>
        <Link className="btn-secondary btn-md" href="/app/icerik/taslaklar">
          Taslaklar
        </Link>
        <Link className="btn-ghost btn-md" href="/app/medya">
          Medya Kütüphanesi
        </Link>
      </div>
    </div>
  );
}
