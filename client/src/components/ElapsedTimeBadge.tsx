'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';

// A small live timer shown in mutation loading toasts (counts up from startedAt).
export function ElapsedTimeBadge({
  startedAt,
  className,
}: {
  startedAt: number;
  className?: string;
}) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const update = () => setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  const hours = Math.floor(elapsed / 3600);
  const minutes = Math.floor((elapsed % 3600) / 60);
  const seconds = elapsed % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  const timeString =
    hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;

  return (
    <span
      className={cn(
        'inline-block rounded px-1.5 py-0.5 font-mono text-ps-accent text-xs tabular-nums',
        className,
      )}
    >
      {timeString}
    </span>
  );
}
