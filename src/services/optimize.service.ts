// src/services/optimize.service.ts
import { prisma } from '../db/prisma.js';
import { getDurationMatrix, getRouteGeometry } from './routing.service.js';
import { solveVRP } from '../solver/vrp.solver.js';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

const TimeString = z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time format (HH:MM)');

const StopSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  time_window_start: TimeString,
  time_window_end: TimeString,
  service_time_s: z.number().int().min(60).max(1800),
});

const OptimizeInput = z.object({
  driver: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    start_lat: z.number().min(-90).max(90),
    start_lng: z.number().min(-180).max(180),
  }),
  stops: z.array(StopSchema).min(2).max(15),
  time_limit_ms: z.number().int().min(1000).max(30000).default(5000),
});

function timeToSeconds(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 3600 + m * 60;
}

interface OptimizedStop {
  id: string;
  label: string;
  lat: number;
  lng: number;
}

interface Leg {
  from: string;
  to: string;
  distance_m: number;
  duration_s: number;
}

interface RouteData {
  route_geometry: { type: string; coordinates: [number, number][] };
  legs: { distance_m: number; duration_s: number }[];
  total_distance_m: number;
  total_duration_s: number;
}

export async function optimizeService(input: unknown) {
  // 1. Validate input with zod
  const validated = OptimizeInput.parse(input);
  const { driver, stops, time_limit_ms } = validated;

  // 2. Defensive check for stops
  if (!Array.isArray(stops) || stops.length === 0) {
    throw new Error('No stops provided');
  }

  // 3. Prepare matrix input for durations
  const stopsForMatrix = stops.map((s, idx) => {
    if (s == null || s.lat == null || s.lng == null) {
      throw new Error(`Stop at index ${idx} is missing lat/lng`);
    }
    return { lng: s.lng, lat: s.lat };
  });

  const matrixInput = {
    start: { lng: driver.start_lng, lat: driver.start_lat },
    stops: stopsForMatrix,
  };

  // 4. Get duration matrix
  const durations: number[][] = await getDurationMatrix(matrixInput);

  // 5. Prepare time windows & service times
  const timeWindows: [number, number][] = [[0, 86400]]; // full day for start
  const serviceTimes: number[] = [0];

  stops.forEach((stop, idx) => {
    const startSec = timeToSeconds(stop.time_window_start);
    const endSec = timeToSeconds(stop.time_window_end);

    if (startSec >= endSec) {
      throw new Error(`Stop ${stop.id}: time_window_end must be after time_window_start`);
    }

    timeWindows.push([startSec, endSec]);
    serviceTimes.push(stop.service_time_s);
  });

// 6. Solve VRP
const solverResult = await solveVRP(durations, timeWindows, serviceTimes, time_limit_ms);

if (!solverResult || !Array.isArray(solverResult.sequence)) {
  throw new Error('Invalid solver result: ' + JSON.stringify(solverResult));
}

const sequenceIndices: number[] = solverResult.sequence;

// 7. Map solver node indices → stop array indices (subtract 1)
const optimizedStops: OptimizedStop[] = sequenceIndices.map((nodeIdx: number) => {
  const stopIndex = nodeIdx - 1;
  if (stopIndex < 0 || stopIndex >= stops.length || !stops[stopIndex]) {
    throw new Error(
      `Solver returned invalid node index ${nodeIdx} ` +
      `(mapped to stop index ${stopIndex}, but stops length = ${stops.length})`
    );
  }
  return stops[stopIndex];
});

  // 8. Ordered coordinates for ORS Directions: start + optimized stops
  const orderedCoords = [
    { lng: driver.start_lng, lat: driver.start_lat },
    ...optimizedStops.map(s => ({ lng: s.lng, lat: s.lat })),
  ];

  // 9. Get real road route
  const routeData: RouteData = await getRouteGeometry(orderedCoords);

  // 10. Build optimized_sequence
  const optimized_sequence = optimizedStops.map((stop: OptimizedStop, i: number) => ({
    position: i + 1,
    stop_id: stop.id,
    label: stop.label,
    lat: stop.lat,
    lng: stop.lng,
  }));

  // 11. Build legs array
  const legs: Leg[] = routeData.legs.map((leg: { distance_m: number; duration_s: number }, i: number) => {
    const from = i === 0 ? 'start' : optimizedStops[i - 1].id;
    const to = optimizedStops[i].id;
    return {
      from,
      to,
      distance_m: leg.distance_m,
      duration_s: leg.duration_s,
    };
  });

  // 12. Save to DB
  const request_id = uuidv4();
  const saved = await prisma.optimizationRequest.create({
    data: {
      id: request_id,
      driver_id: driver.id,
      driver_name: driver.name,
      driver_start_lat: driver.start_lat,
      driver_start_lng: driver.start_lng,
      stops_input: stops as any,
      optimized_sequence: optimized_sequence as any,
      legs: legs as any,
      route_geometry: routeData.route_geometry as any,
      total_distance_m: routeData.total_distance_m,
      total_duration_s: routeData.total_duration_s,
      solver_time_ms: solverResult.solver_time_ms,
      time_limit_ms,
      created_at: new Date(),
    },
  });

  // 13. Return response
  return {
    request_id: saved.id,
    driver_id: driver.id,
    optimized_sequence,
    legs,
    total_distance_m: routeData.total_distance_m,
    total_duration_s: routeData.total_duration_s,
    route_geometry: routeData.route_geometry,
    solver_time_ms: solverResult.solver_time_ms,
    map_url: `/api/v1/optimize/${saved.id}/map`,
    created_at: saved.created_at.toISOString(),
  };
}