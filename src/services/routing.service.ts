// src/services/routing.service.ts
import axios from 'axios';
import { z } from 'zod';

function getOrsApiKey(): string {
  const key = process.env.ORS_API_KEY;
  if (!key) {
    throw new Error('ORS_API_KEY is not set in environment variables');
  }
  return key;
}

const ORS_MATRIX_URL = 'https://api.openrouteservice.org/v2/matrix/driving-car';
const ORS_DIRECTIONS_GEOJSON_URL = 'https://api.openrouteservice.org/v2/directions/driving-car/geojson';

// Zod schemas
const CoordinateSchema = z.object({
  lng: z.number().min(-180).max(180),
  lat: z.number().min(-90).max(90),
});

const GetMatrixInput = z.object({
  start: CoordinateSchema,
  stops: z.array(CoordinateSchema).min(2).max(15),
});

const GetDirectionsInput = z.array(CoordinateSchema); // ordered: [start, stop1, stop2, ...]

type Coordinate = z.infer<typeof CoordinateSchema>;
type MatrixInput = z.infer<typeof GetMatrixInput>;
type DirectionsInput = z.infer<typeof GetDirectionsInput>;

/**
 * Calls ORS Matrix API → returns rounded integer duration matrix in seconds
 * Index 0 = start, 1..N = stops
 */
export async function getDurationMatrix(input: MatrixInput): Promise<number[][]> {
  const validated = GetMatrixInput.parse(input);

  const locations: [number, number][] = [
    [validated.start.lng, validated.start.lat],
    ...validated.stops.map(s => [s.lng, s.lat] as [number, number]),
  ];

  try {
    const response = await axios.post(
      ORS_MATRIX_URL,
      {
        locations,
        metrics: ['duration', 'distance'], // Added 'distance' for legs/totals
      },
      {
        headers: {
          Authorization: getOrsApiKey(), // ← Plain key (no Bearer)
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      },
    );

    const durations = response.data.durations as number[][];
    if (!durations || durations.length !== locations.length) {
      throw new Error('Invalid matrix response from ORS');
    }

    // Round to integers (OR-Tools works best with whole seconds)
    return durations.map(row => row.map(Math.round));
  } catch (error: any) {
    console.error('ORS Matrix error:', error.message, error.response?.data);
    if (error.response?.status >= 500) {
      throw Object.assign(new Error('Routing service unavailable'), { status: 502 });
    }
    throw error;
  }
}

/**
 * Calls ORS Directions GeoJSON API with ordered coordinates
 * Returns geometry (for Leaflet), legs (for response), totals
 */
export async function getRouteGeometry(orderedCoords: DirectionsInput) {
  const validated = GetDirectionsInput.parse(orderedCoords);

  // Convert to [lng, lat] tuples for ORS
  const coordinates = validated.map(c => [c.lng, c.lat] as [number, number]);

  try {
    const response = await axios.post(
      ORS_DIRECTIONS_GEOJSON_URL,
      { coordinates },
      {
        headers: {
          Authorization: getOrsApiKey(), // ← Plain key
          'Content-Type': 'application/json',
        },
        timeout: 15000, // Directions can take longer with many points
      },
    );

    const feature = response.data.features?.[0];
    if (!feature) {
      throw new Error('No route feature in ORS GeoJSON response');
    }

    const props = feature.properties;
    const summary = props.summary || {};

    // Legs ≈ segments (each segment is one leg between consecutive points)
    const legs = (props.segments || []).map((seg: any) => ({
      distance_m: Math.round(seg.distance || 0),
      duration_s: Math.round(seg.duration || 0),
      // You can add more like steps if needed later
    }));

    return {
      route_geometry: feature.geometry, // { type: "LineString", coordinates: [[lng,lat], ...] }
      legs,
      total_distance_m: Math.round(summary.distance || 0),
      total_duration_s: Math.round(summary.duration || 0),
    };
  } catch (error: any) {
    console.error('ORS Directions error:', error.message, error.response?.data);
    if (error.response?.status >= 500) {
      throw Object.assign(new Error('Routing service unavailable'), { status: 502 });
    }
    throw error;
  }
}