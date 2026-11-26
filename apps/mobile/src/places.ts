import { LOCATIONS, type ClinicLocation, type LocationId } from '@pure-clinics/shared';

/** City names stay left-to-right inside Arabic text, so "'s-Hertogenbosch" keeps its apostrophe in front. */
export function cityName(location: ClinicLocation): string {
  return `‎${location.city}`;
}

export function cityOf(id: string | undefined | null): string {
  const location = LOCATIONS.find((l) => l.id === id);
  return location ? cityName(location) : (id ?? '');
}

export function locationOf(id: string | undefined | null): ClinicLocation | undefined {
  return LOCATIONS.find((l) => l.id === (id as LocationId));
}

/** A route to the clinic in the phone's maps, or Google Maps in a browser. */
export function routeUrl(location: ClinicLocation): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`Pure Clinics, ${location.address} ${location.city}`)}`;
}
