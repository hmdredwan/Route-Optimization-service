import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { optimizeService } from '../services/optimize.service';
import { prisma } from '../db/prisma';
import { renderMapPage } from '../views/mapPage';

// Validation schemas
const driverSchema = z.object({
  id: z.string(),
  name: z.string(),
  start_lat: z.number().min(-90).max(90),
  start_lng: z.number().min(-180).max(180),
});

const stopSchema = z.object({
  id: z.string(),
  label: z.string(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  time_window_start: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
  time_window_end: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
  service_time_s: z.number().int().min(60).max(1800),
});

const optimizeRequestSchema = z.object({
  driver: driverSchema,
  stops: z.array(stopSchema).min(2).max(15).refine(
    (stops) => new Set(stops.map(s => s.id)).size === stops.length,
    { message: 'Stop IDs must be unique' }
  ),
  time_limit_ms: z.number().int().min(1000).max(30000).default(5000),
});

export const optimizeRoute = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = optimizeRequestSchema.parse(req.body);
    const result = await optimizeService(validated);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const getOptimizationResult = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { request_id } = req.params;
    const result = await prisma.optimizationRequest.findUnique({
      where: { id: request_id },
    });
    if (!result) {
      return res.status(404).json({ error: 'Optimization result not found' });
    }
    // Transform DB result to match response schema
    const response = {
      request_id: result.id,
      driver_id: result.driver_id,
      optimized_sequence: result.optimized_sequence,
      legs: result.legs,
      total_distance_m: result.total_distance_m,
      total_duration_s: result.total_duration_s,
      route_geometry: result.route_geometry,
      solver_time_ms: result.solver_time_ms,
      map_url: `/api/v1/optimize/${result.id}/map`,
      created_at: result.created_at.toISOString(),
    };
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};

export const getOptimizationMap = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { request_id } = req.params;
    const result = await prisma.optimizationRequest.findUnique({
      where: { id: request_id },
    });
    if (!result) {
      return res.status(404).json({ error: 'Optimization result not found' });
    }
    const html = renderMapPage(result);
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    next(error);
  }
};