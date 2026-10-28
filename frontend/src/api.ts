import type { Itinerary, SavedTrip, TripInput } from "./types";

const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.detail ?? "Something went wrong. Please try again.");
  return body as T;
}

export function generateItinerary(trip: TripInput): Promise<{ itinerary: Itinerary }> {
  return request("/api/itineraries/generate", { method: "POST", body: JSON.stringify(trip) });
}

export function getSavedTrips(token: string): Promise<SavedTrip[]> {
  return request("/api/trips", { headers: { Authorization: `Bearer ${token}` } });
}

export function saveTrip(token: string, itinerary: Itinerary, tripInput: TripInput): Promise<SavedTrip> {
  return request("/api/trips", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ itinerary, trip_input: tripInput }),
  });
}
