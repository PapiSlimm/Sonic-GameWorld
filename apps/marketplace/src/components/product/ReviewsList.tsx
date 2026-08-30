import { ShieldCheck, Star } from 'lucide-react';
import { EmptyState, Panel } from '@sonic-gameworld/ui';
import type { Review } from '@sonic-gameworld/gameworld-sdk';
import { formatDate } from '../../lib/format.js';

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5 text-warn">
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} className={`h-3.5 w-3.5 ${i < rating ? 'fill-current' : 'text-border'}`} />
      ))}
    </div>
  );
}

export function ReviewsList({ reviews, rating, ratingCount }: { reviews: Review[]; rating: number; ratingCount: number }) {
  return (
    <Panel
      title="Reviews"
      actions={
        ratingCount > 0 ? (
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <Stars rating={Math.round(rating)} />
            <span>
              {rating.toFixed(1)} ({ratingCount})
            </span>
          </div>
        ) : undefined
      }
    >
      {reviews.length === 0 ? (
        <EmptyState title="No reviews yet" description="Be the first to review this listing after purchasing it." />
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {reviews.map((review) => (
            <li key={review.id} className="py-4 first:pt-0 last:pb-0">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-text">{review.author.displayName}</span>
                  {review.verifiedPurchase && (
                    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-success">
                      <ShieldCheck className="h-3 w-3" /> Verified
                    </span>
                  )}
                </div>
                <span className="text-xs text-muted">{formatDate(review.createdAt)}</span>
              </div>
              <div className="mt-1">
                <Stars rating={review.rating} />
              </div>
              {review.title && <div className="mt-1.5 text-sm font-semibold text-text">{review.title}</div>}
              <p className="mt-1 text-sm text-text/80">{review.body}</p>
              {review.creatorReply && (
                <div className="mt-2 rounded-control border border-border bg-bg p-2.5 text-xs">
                  <span className="font-hud uppercase tracking-wider text-accent">Creator reply</span>
                  <p className="mt-1 text-text/70">{review.creatorReply.body}</p>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
