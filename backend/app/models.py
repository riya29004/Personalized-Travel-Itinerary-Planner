from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, HttpUrl, field_validator


TravelStyle = Literal["solo", "couple", "group"]


class TripRequest(BaseModel):
    destination: str = Field(min_length=2, max_length=120)
    start_date: date
    end_date: date
    travelers: int = Field(ge=1, le=30)
    travel_style: TravelStyle
    budget_inr: int = Field(ge=1000, le=5_000_000)
    interests: list[str] = Field(min_length=1, max_length=8)
    pace: Literal["relaxed", "balanced", "packed"] = "balanced"
    notes: str = Field(default="", max_length=500)

    @field_validator("destination")
    @classmethod
    def normalize_destination(cls, value: str) -> str:
        return " ".join(value.split())

    @field_validator("end_date")
    @classmethod
    def validate_dates(cls, end_date: date, info):
        start_date = info.data.get("start_date")
        if start_date and end_date < start_date:
            raise ValueError("End date must be on or after the start date")
        return end_date


class Activity(BaseModel):
    time: str
    title: str
    description: str
    estimated_cost_inr: int = Field(ge=0)
    place_query: str
    map_url: HttpUrl | None = None


class ItineraryDay(BaseModel):
    day: int = Field(ge=1)
    date: date
    theme: str
    activities: list[Activity] = Field(min_length=1)
    daily_cost_inr: int = Field(ge=0)


class Itinerary(BaseModel):
    title: str
    summary: str
    total_estimated_cost_inr: int = Field(ge=0)
    budget_note: str
    days: list[ItineraryDay] = Field(min_length=1)


class GenerateResponse(BaseModel):
    itinerary: Itinerary


class SaveTripRequest(BaseModel):
    itinerary: Itinerary
    trip_input: TripRequest


class SavedTrip(BaseModel):
    id: str
    created_at: str
    itinerary: Itinerary
    trip_input: TripRequest
