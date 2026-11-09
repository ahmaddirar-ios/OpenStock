'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { RefreshCw } from 'lucide-react';
import { tx, type Lang } from '@/lib/i18n';

/** Re-run the server reads behind the current page. The probed upstreams are live, so this is how
 * an operator checks again without reloading the browser tab. */
const RefreshButton = ({ lang }: { lang: Lang }) => {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    return (
        <button
            type="button"
            className="btn btn-ghost h-8 px-3 text-[12px]"
            disabled={pending}
            onClick={() => startTransition(() => router.refresh())}
        >
            <RefreshCw className={pending ? 'animate-spin' : undefined} />
            {tx(lang, 'ops.refresh')}
        </button>
    );
};

export default RefreshButton;
