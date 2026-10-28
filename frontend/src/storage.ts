import type { Itinerary, TripInput } from "./types";

const KEY = "roamwise-guest-trips";
export interface GuestTrip { id: string; created_at: string; itinerary: Itinerary; trip_input: TripInput }

export function readGuestTrips(): GuestTrip[] {
  try { return JSON.parse(sessionStorage.getItem(KEY) ?? "[]") as GuestTrip[]; } catch { return []; }
}

export function storeGuestTrip(itinerary: Itinerary, tripInput: TripInput): GuestTrip {
  const trip = { id: crypto.randomUUID(), created_at: new Date().toISOString(), itinerary, trip_input: tripInput };
  sessionStorage.setItem(KEY, JSON.stringify([trip, ...readGuestTrips()]));
  return trip;
}
