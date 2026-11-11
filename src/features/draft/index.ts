import type { FeatureModule } from '../../domain/types.ts';
import { draftRoute } from './routes.ts';

export const feature: FeatureModule = { id: 'draft', routes: [draftRoute], adjusters: [] };
