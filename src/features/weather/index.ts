import type { FeatureModule } from '../../domain/types.ts';
import { weatherAdjuster } from './logic.ts';
import { routes } from './routes.ts';

export const feature: FeatureModule = { id: 'weather', routes, adjusters: [weatherAdjuster] };
