from fastapi import Depends, FastAPI, Header, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from supabase import Client, create_client

from .config import Settings, get_settings
from .models import GenerateResponse, SaveTripRequest, SavedTrip, TripRequest
from .services import ConfigurationError, generate_itinerary


def get_supabase(settings: Settings = Depends(get_settings)) -> Client:
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise HTTPException(status_code=503, detail="Supabase is not configured on the server.")
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


def current_user(authorization: str | None = Header(default=None), supabase: Client = Depends(get_supabase)) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Please sign in to save trips.")
    try:
        user = supabase.auth.get_user(authorization.removeprefix("Bearer ")).user
    except Exception as error:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Your session is invalid.") from error
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Your session is invalid.")
    return user.id


app = FastAPI(title="Travel Itinerary Planner API", version="1.0.0")
settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/itineraries/generate", response_model=GenerateResponse)
async def generate(trip: TripRequest, app_settings: Settings = Depends(get_settings)) -> GenerateResponse:
    try:
        return GenerateResponse(itinerary=await generate_itinerary(trip, app_settings))
    except ConfigurationError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except (ValueError, RuntimeError) as error:
        raise HTTPException(status_code=502, detail="Itinerary generation failed. Please try again.") from error


@app.get("/api/trips", response_model=list[SavedTrip])
async def list_trips(user_id: str = Depends(current_user), supabase: Client = Depends(get_supabase)) -> list[SavedTrip]:
    response = supabase.table("trips").select("*").eq("user_id", user_id).order("created_at", desc=True).execute()
    return [SavedTrip.model_validate(row) for row in response.data]


@app.post("/api/trips", response_model=SavedTrip, status_code=status.HTTP_201_CREATED)
async def save_trip(payload: SaveTripRequest, user_id: str = Depends(current_user), supabase: Client = Depends(get_supabase)) -> SavedTrip:
    response = supabase.table("trips").insert({
        "user_id": user_id,
        "itinerary": payload.itinerary.model_dump(mode="json"),
        "trip_input": payload.trip_input.model_dump(mode="json"),
    }).execute()
    return SavedTrip.model_validate(response.data[0])
