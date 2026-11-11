import { registerAdjuster } from '../core/pipeline.ts';
import type { FeatureModule, Route } from '../domain/types.ts';
import { feature as briefing } from './briefing/index.ts';
import { feature as draft } from './draft/index.ts';
import { feature as hint } from './hint/index.ts';
import { feature as memos } from './memos/index.ts';
import { feature as profile } from './profile/index.ts';
import { feature as returns } from './returns/index.ts';
import { feature as reviews } from './reviews/index.ts';
import { feature as weather } from './weather/index.ts';

export const features: FeatureModule[] = [profile, hint, draft, memos, briefing, returns, reviews, weather];
export const featureRoutes: Route[] = features.flatMap((f) => f.routes);

let registered = false;

// 보정 순서: weather → memos. 다른 기능은 adjusters 가 비어 있다.
export function registerAllAdjusters(): void {
  if (registered) return;
  registered = true;
  for (const f of [weather, memos]) {
    for (const a of f.adjusters) registerAdjuster(a);
  }
}
