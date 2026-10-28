export type TravelStyle = "solo" | "couple" | "group";
export type Pace = "relaxed" | "balanced" | "packed";

export interface TripInput {
  destination: string;
  start_date: string;
  end_date: string;
  travelers: number;
  travel_style: TravelStyle;
  budget_inr: number;
  interests: string[];
  pace: Pace;
  notes: string;
}

export interface Activity {
  time: string;
  title: string;
  description: string;
  estimated_cost_inr: number;
  place_query: string;
  map_url?: string;
}

export interface ItineraryDay {
  day: number;
  date: string;
  theme: string;
  activities: Activity[];
  daily_cost_inr: number;
}

export interface Itinerary {
  title: string;
  summary: string;
  total_estimated_cost_inr: number;
  budget_note: string;
  days: ItineraryDay[];
}

export interface SavedTrip {
  id: string;
  created_at: string;
  itinerary: Itinerary;
  trip_input: TripInput;
}
