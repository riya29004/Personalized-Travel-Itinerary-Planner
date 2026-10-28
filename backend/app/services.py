import json
from datetime import timedelta
from urllib.parse import quote_plus

from groq import Groq

from .config import Settings
from .models import Itinerary, ItineraryDay, TripRequest


MAX_DAYS_PER_MODEL_REQUEST = 4


class ConfigurationError(RuntimeError):
    pass


def parse_json_response(content: str) -> dict:
    cleaned = content.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else ""
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3].strip()
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end == -1 or end < start:
        raise ValueError("The itinerary generator did not return JSON.")
    return json.loads(cleaned[start : end + 1])


def _prompt(trip: TripRequest) -> str:
    day_count = (trip.end_date - trip.start_date).days + 1
    return f"""Create a realistic {day_count}-day travel itinerary for {trip.destination}.
Trip dates: {trip.start_date} to {trip.end_date}. Travelers: {trip.travelers}. Travel style: {trip.travel_style}.
Total budget: INR {trip.budget_inr}. Interests: {', '.join(trip.interests)}. Pace: {trip.pace}. Notes: {trip.notes or 'None'}.
Return ONLY valid JSON with this exact schema. Do not wrap it in Markdown, do not include an explanation, and do not add fields:
{{"title":"string","summary":"string","total_estimated_cost_inr":0,"budget_note":"string","days":[{{"day":1,"date":"YYYY-MM-DD","theme":"string","activities":[{{"time":"HH:MM","title":"string","description":"string","estimated_cost_inr":0,"place_query":"specific place name, {trip.destination}"}}],"daily_cost_inr":0}}]}}
Include 3 to 5 activities per day. Keep every description to one short sentence. Use whole INR values, include transport and meal estimates where appropriate, do not invent opening hours, and keep total spend close to the budget."""


def split_trip_into_chunks(trip: TripRequest) -> list[TripRequest]:
    total_days = (trip.end_date - trip.start_date).days + 1
    chunks: list[TripRequest] = []
    allocated_budget = 0
    for offset in range(0, total_days, MAX_DAYS_PER_MODEL_REQUEST):
        chunk_days = min(MAX_DAYS_PER_MODEL_REQUEST, total_days - offset)
        is_last_chunk = offset + chunk_days == total_days
        chunk_budget = (
            trip.budget_inr - allocated_budget
            if is_last_chunk
            else round(trip.budget_inr * chunk_days / total_days)
        )
        allocated_budget += chunk_budget
        chunks.append(trip.model_copy(update={
            "start_date": trip.start_date + timedelta(days=offset),
            "end_date": trip.start_date + timedelta(days=offset + chunk_days - 1),
            "budget_inr": chunk_budget,
        }))
    return chunks


async def generate_chunk(trip: TripRequest, settings: Settings, client: Groq) -> Itinerary:
    completion = client.chat.completions.create(
        model=settings.groq_model,
        messages=[
            {"role": "system", "content": "You are a careful India travel planner. Return JSON only."},
            {"role": "user", "content": _prompt(trip)},
        ],
        temperature=0.4,
        max_tokens=8192,
    )
    content = completion.choices[0].message.content
    if not content:
        raise RuntimeError("Groq returned an empty itinerary.")
    payload = parse_json_response(content)
    itinerary = Itinerary.model_validate(payload)
    expected_dates = [trip.start_date + timedelta(days=index) for index in range(len(itinerary.days))]
    if len(itinerary.days) != len(expected_dates):
        raise RuntimeError("The generated itinerary did not contain every trip day.")
    for day, expected_date in zip(itinerary.days, expected_dates, strict=True):
        day.date = expected_date
        for activity in day.activities:
            activity.map_url = f"https://www.google.com/maps/search/?api=1&query={quote_plus(activity.place_query)}"
    return itinerary


async def generate_itinerary(trip: TripRequest, settings: Settings) -> Itinerary:
    if not settings.groq_api_key:
        raise ConfigurationError("GROQ_API_KEY is not configured on the server.")

    client = Groq(api_key=settings.groq_api_key)
    chunks = split_trip_into_chunks(trip)
    if len(chunks) == 1:
        return await generate_chunk(chunks[0], settings, client)

    merged_days: list[ItineraryDay] = []
    for chunk in chunks:
        generated_chunk = await generate_chunk(chunk, settings, client)
        for day in generated_chunk.days:
            day.day = len(merged_days) + 1
            merged_days.append(day)

    total_cost = sum(day.daily_cost_inr for day in merged_days)
    total_days = len(merged_days)
    return Itinerary(
        title=f"{total_days}-Day {trip.destination} Journey",
        summary=f"A {trip.pace} {trip.travel_style} itinerary tailored to {', '.join(trip.interests)}.",
        total_estimated_cost_inr=total_cost,
        budget_note=(
            f"Estimated total: INR {total_cost:,}. "
            f"Your stated budget: INR {trip.budget_inr:,}."
        ),
        days=merged_days,
    )


