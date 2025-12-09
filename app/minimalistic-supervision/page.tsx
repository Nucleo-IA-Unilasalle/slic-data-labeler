'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function MinimalisticSupervisionPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/minimalistic-supervision-v2');
  }, [router]);

  return null;
}