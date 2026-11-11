import type { FeatureModule } from '../../domain/types.ts';
import { memosAdjuster } from './logic.ts';
import { routes } from './routes.ts';

export const feature: FeatureModule = { id: 'memos', routes, adjusters: [memosAdjuster] };
