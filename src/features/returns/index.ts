import type { FeatureModule } from '../../domain/types.ts';
import { routes } from './routes.ts';

export const feature: FeatureModule = { id: 'returns', routes, adjusters: [] };
