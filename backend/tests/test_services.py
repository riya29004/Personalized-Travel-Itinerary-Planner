import pytest

from app.models import TripRequest
from app.services import parse_json_response, split_trip_into_chunks


def test_parse_json_response_accepts_a_json_code_block() -> None:
    assert parse_json_response("```json\n{\"title\": \"Goa\"}\n```") == {"title": "Goa"}


def test_parse_json_response_rejects_non_json_content() -> None:
    with pytest.raises(ValueError, match="did not return JSON"):
        parse_json_response("No itinerary available")


def test_split_trip_into_four_day_chunks_preserves_dates_and_budget() -> None:
    trip = TripRequest.model_validate({
        "destination": "Goa",
        "start_date": "2026-12-01",
        "end_date": "2026-12-09",
        "travelers": 2,
        "travel_style": "couple",
        "budget_inr": 90000,
        "interests": ["Food"],
    })

    chunks = split_trip_into_chunks(trip)

    assert [(chunk.start_date.isoformat(), chunk.end_date.isoformat()) for chunk in chunks] == [
        ("2026-12-01", "2026-12-04"),
        ("2026-12-05", "2026-12-08"),
        ("2026-12-09", "2026-12-09"),
    ]
    assert sum(chunk.budget_inr for chunk in chunks) == trip.budget_inr
