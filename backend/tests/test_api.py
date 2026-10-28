from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_health_check() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_generate_rejects_invalid_date_order() -> None:
    response = client.post("/api/itineraries/generate", json={
        "destination": "Goa",
        "start_date": "2026-12-10",
        "end_date": "2026-12-08",
        "travelers": 2,
        "travel_style": "couple",
        "budget_inr": 40000,
        "interests": ["beaches"],
    })
    assert response.status_code == 422
