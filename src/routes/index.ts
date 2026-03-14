console.log('routes/index.ts file is being loaded!');

import { Router } from 'express';
import {
  optimizeRoute,
  getOptimizationResult,
  getOptimizationMap,
} from '../controllers/optimize.controller.js';

const router = Router();

console.log('Attaching POST /optimize');
router.post('/optimize', optimizeRoute);

console.log('Attaching GET /optimize/:request_id');
router.get('/optimize/:request_id', getOptimizationResult);

console.log('Attaching GET /optimize/:request_id/map');
router.get('/optimize/:request_id/map', getOptimizationMap);

console.log('routes/index.ts finished - router has', router.stack.length, 'routes');

export default router;