import type { GeoAnchor } from '@sonic-gameworld/world-schema';

const METERS_PER_DEG_LAT = 111_320;

/** Equirectangular local-meters -> lat/lon approximation, accurate enough for a district-scale world. */
export function localPointToGeo(origin: GeoAnchor, point: { x: number; y: number; z: number }): GeoAnchor {
  const metersPerDegLon = METERS_PER_DEG_LAT * Math.cos((origin.lat * Math.PI) / 180) || METERS_PER_DEG_LAT;
  return {
    lat: origin.lat + point.z / METERS_PER_DEG_LAT,
    lon: origin.lon + point.x / metersPerDegLon,
    altM: origin.altM + point.y,
  };
}
