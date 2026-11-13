import React from 'react';
import { cn } from './Primitives.tsx';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
}

export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-slate-200/80', className)}
      {...props}
    />
  );
}

export interface CardSkeletonProps {
  className?: string;
  count?: number;
  hasHeader?: boolean;
  rows?: number;
}

export function CardSkeleton({
  className,
  count = 1,
  hasHeader = true,
  rows = 3,
}: CardSkeletonProps) {
  const cards = Array.from({ length: count });

  return (
    <>
      {cards.map((_, idx) => (
        <section
          key={idx}
          className={cn(
            'studio-card rounded-2xl p-5 border border-slate-200/80 bg-white/95 shadow-2xs space-y-4',
            className,
          )}
        >
          {hasHeader && (
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-32 rounded" />
                <Skeleton className="h-3 w-48 rounded" />
              </div>
              <Skeleton className="h-7 w-20 rounded-lg" />
            </div>
          )}

          <div className="space-y-2.5">
            {Array.from({ length: rows }).map((_, rIdx) => (
              <div key={rIdx} className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Skeleton className="h-4 w-4 rounded" />
                  <Skeleton className={cn('h-3.5 rounded', rIdx % 2 === 0 ? 'w-28' : 'w-36')} />
                </div>
                <Skeleton className="h-3.5 w-16 rounded" />
              </div>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

export interface RowSkeletonProps {
  count?: number;
  className?: string;
}

export function RowSkeleton({ count = 3, className }: RowSkeletonProps) {
  const rows = Array.from({ length: count });

  return (
    <div className={cn('divide-y divide-slate-100', className)}>
      {rows.map((_, idx) => (
        <div key={idx} className="flex items-center justify-between py-3 px-1">
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-xl shrink-0" />
            <div className="space-y-1.5">
              <Skeleton className={cn('h-3.5 rounded', idx % 2 === 0 ? 'w-32' : 'w-40')} />
              <Skeleton className="h-2.5 w-20 rounded" />
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <Skeleton className="h-4 w-20 rounded" />
            <Skeleton className="h-2.5 w-12 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

export interface MetricsSkeletonProps {
  className?: string;
  count?: number;
}

export function MetricsSkeleton({ className, count = 4 }: MetricsSkeletonProps) {
  const cards = Array.from({ length: count });

  return (
    <div
      className={cn(
        'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5',
        className,
      )}
    >
      {cards.map((_, idx) => (
        <section
          key={idx}
          className="studio-card rounded-2xl p-4 border border-slate-200/80 bg-white/95 shadow-2xs relative overflow-hidden"
        >
          <div
            className={cn(
              'absolute top-0 left-0 right-0 h-1 bg-slate-300 animate-pulse',
              idx === 0 && 'bg-blue-400',
              idx === 1 && 'bg-emerald-400',
              idx === 2 && 'bg-indigo-400',
              idx === 3 && 'bg-amber-400',
            )}
          />
          <div className="flex items-center justify-between">
            <Skeleton className="h-3 w-24 rounded" />
            <Skeleton className="h-4 w-4 rounded-full" />
          </div>
          <div className="mt-2.5">
            <Skeleton className="h-7 w-32 rounded" />
          </div>
          <div className="mt-3">
            <Skeleton className="h-6 w-full rounded" />
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between">
            <Skeleton className="h-2.5 w-16 rounded" />
            <Skeleton className="h-2.5 w-20 rounded" />
          </div>
        </section>
      ))}
    </div>
  );
}
