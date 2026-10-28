import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { generateItinerary, getSavedTrips, saveTrip } from "./api";
import { resendVerification, signIn, signUp, subscribeToAuth, supabase } from "./auth";
import { readGuestTrips, storeGuestTrip, type GuestTrip } from "./storage";
import type { Activity, Itinerary, SavedTrip, TripInput, TravelStyle } from "./types";

const emptyTrip: TripInput = {
  destination: "", start_date: "", end_date: "", travelers: 1, travel_style: "solo",
  budget_inr: 25000, interests: ["Food", "Culture"], pace: "balanced", notes: "",
};
const interestOptions = ["Food", "Culture", "Nature", "Adventure", "Shopping", "Nightlife", "Wellness"];
const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

function recalculate(itinerary: Itinerary): Itinerary {
  const days = itinerary.days.map((day) => ({
    ...day,
    daily_cost_inr: day.activities.reduce((sum, activity) => sum + Number(activity.estimated_cost_inr || 0), 0),
  }));
  return { ...itinerary, days, total_estimated_cost_inr: days.reduce((sum, day) => sum + day.daily_cost_inr, 0) };
}

export default function App() {
  const [trip, setTrip] = useState<TripInput>(emptyTrip);
  const [itinerary, setItinerary] = useState<Itinerary | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [guestTrips, setGuestTrips] = useState<GuestTrip[]>(readGuestTrips);
  const [savedTrips, setSavedTrips] = useState<SavedTrip[]>([]);
  const [screen, setScreen] = useState<"planner" | "dashboard">("planner");
  const [busy, setBusy] = useState<"generate" | "save" | number | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [authOpen, setAuthOpen] = useState(false);

  useEffect(() => subscribeToAuth(setSession), []);
  useEffect(() => {
    if (!session) { setSavedTrips([]); return; }
    getSavedTrips(session.access_token).then(setSavedTrips).catch((requestError: Error) => setError(requestError.message));
  }, [session]);

  const datesValid = useMemo(() => !trip.start_date || !trip.end_date || trip.end_date >= trip.start_date, [trip]);
  function updateTrip<K extends keyof TripInput>(key: K, value: TripInput[K]) { setTrip((current) => ({ ...current, [key]: value })); }
  function clearMessages() { setError(""); setNotice(""); }

  async function generate(event?: FormEvent, replaceDay?: number) {
    event?.preventDefault();
    clearMessages();
    if (!trip.destination.trim() || !trip.start_date || !trip.end_date || !trip.interests.length || !datesValid) {
      setError("Add a destination, valid dates, and at least one interest before generating."); return;
    }
    setBusy(replaceDay ?? "generate");
    try {
      const result = await generateItinerary(trip);
      if (replaceDay && itinerary) {
        const freshDay = result.itinerary.days.find((day) => day.day === replaceDay);
        if (!freshDay) throw new Error("The generated plan did not include that day.");
        setItinerary(recalculate({ ...itinerary, days: itinerary.days.map((day) => day.day === replaceDay ? freshDay : day) }));
        setNotice(`Day ${replaceDay} regenerated.`);
      } else {
        setItinerary(result.itinerary);
        setNotice("Your personalized itinerary is ready. Edit any activity before saving.");
      }
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Could not generate the itinerary."); }
    finally { setBusy(null); }
  }

  function updateActivity(dayIndex: number, activityIndex: number, key: keyof Activity, value: string | number) {
    if (!itinerary) return;
    const days = itinerary.days.map((day, currentDayIndex) => currentDayIndex !== dayIndex ? day : {
      ...day,
      activities: day.activities.map((activity, currentActivityIndex) => currentActivityIndex !== activityIndex ? activity : { ...activity, [key]: value }),
    });
    setItinerary(recalculate({ ...itinerary, days }));
  }

  async function persist() {
    if (!itinerary) return;
    clearMessages(); setBusy("save");
    try {
      if (session) {
        const saved = await saveTrip(session.access_token, itinerary, trip);
        setSavedTrips((items) => [saved, ...items]); setNotice("Trip saved to your account.");
      } else {
        const saved = storeGuestTrip(itinerary, trip);
        setGuestTrips((items) => [saved, ...items]); setNotice("Guest trip saved in this browser session. Sign in to save permanently.");
      }
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Could not save this trip."); }
    finally { setBusy(null); }
  }

  function openTrip(selected: { itinerary: Itinerary; trip_input: TripInput }) {
    setItinerary(selected.itinerary); setTrip(selected.trip_input); setScreen("planner"); clearMessages();
  }

  return <main>
    <header className="topbar">
      <button className="brand" onClick={() => setScreen("planner")}>Personalized Travel Itinerary Planner <span>· INR travel planning</span></button>
      <nav>
        <button className={screen === "planner" ? "active" : ""} onClick={() => setScreen("planner")}>Plan trip</button>
        <button className={screen === "dashboard" ? "active" : ""} onClick={() => setScreen("dashboard")}>My trips</button>
        {session ? <button onClick={() => supabase?.auth.signOut()}>Sign out</button> : <button className="primary small" onClick={() => setAuthOpen(true)}>Sign in</button>}
      </nav>
    </header>

    {error && <div className="message error" role="alert">{error}<button onClick={() => setError("")}>×</button></div>}
    {notice && <div className="message notice">{notice}<button onClick={() => setNotice("")}>×</button></div>}

    {screen === "dashboard" ? <Dashboard userTrips={savedTrips} guestTrips={guestTrips} signedIn={Boolean(session)} onOpen={openTrip} /> : <>
      <section className="hero"><p className="eyebrow">Personalized, editable, practical</p><h1>Make the journey feel like yours.</h1><p>Build a day-by-day plan with costs in INR, map links, and room to change your mind.</p></section>
      <div className="workspace">
        <TripForm trip={trip} updateTrip={updateTrip} datesValid={datesValid} busy={busy === "generate"} onSubmit={generate} />
        <section className="plan-panel" aria-live="polite">
          {itinerary ? <ItineraryView itinerary={itinerary} busy={busy} onChange={updateActivity} onRegenerate={(day) => generate(undefined, day)} onSave={persist} signedIn={Boolean(session)} /> : <EmptyPlan />}
        </section>
      </div>
    </>}
    {authOpen && <AuthDialog onClose={() => setAuthOpen(false)} onError={setError} onNotice={setNotice} />}
  </main>;
}

function TripForm({ trip, updateTrip, datesValid, busy, onSubmit }: { trip: TripInput; updateTrip: <K extends keyof TripInput>(key: K, value: TripInput[K]) => void; datesValid: boolean; busy: boolean; onSubmit: (event: FormEvent) => void }) {
  function toggleInterest(interest: string) { updateTrip("interests", trip.interests.includes(interest) ? trip.interests.filter((item) => item !== interest) : [...trip.interests, interest]); }
  return <form className="planner-form" onSubmit={onSubmit}>
    <div><p className="eyebrow">Trip details</p><h2>Start with the essentials</h2></div>
    <label>Destination<input required value={trip.destination} onChange={(event) => updateTrip("destination", event.target.value)} placeholder="e.g. Jaipur, Rajasthan" /></label>
    <div className="two-col"><label>Start date<input required type="date" value={trip.start_date} onChange={(event) => updateTrip("start_date", event.target.value)} /></label><label>End date<input required type="date" min={trip.start_date} value={trip.end_date} onChange={(event) => updateTrip("end_date", event.target.value)} /></label></div>
    {!datesValid && <p className="field-error">End date cannot be before the start date.</p>}
    <label>Who’s travelling?<span className="style-options">{(["solo", "couple", "group"] as TravelStyle[]).map((style) => <button type="button" key={style} className={trip.travel_style === style ? "selected" : ""} onClick={() => updateTrip("travel_style", style)}>{style}</button>)}</span></label>
    <label>Number of travellers<input type="number" min="1" max="30" value={trip.travelers} onChange={(event) => updateTrip("travelers", Math.max(1, Number(event.target.value)))} /></label>
    <label>Total budget (INR)<input type="number" min="1000" step="500" value={trip.budget_inr} onChange={(event) => updateTrip("budget_inr", Number(event.target.value))} /></label>
    <label>Travel pace<select value={trip.pace} onChange={(event) => updateTrip("pace", event.target.value as TripInput["pace"])}><option value="relaxed">Relaxed</option><option value="balanced">Balanced</option><option value="packed">Packed</option></select></label>
    <fieldset><legend>What do you enjoy?</legend><div className="chips">{interestOptions.map((interest) => <button type="button" key={interest} className={trip.interests.includes(interest) ? "selected" : ""} onClick={() => toggleInterest(interest)}>{interest}</button>)}</div></fieldset>
    <label>Anything else?<textarea value={trip.notes} onChange={(event) => updateTrip("notes", event.target.value)} placeholder="Food preferences, mobility needs, must-see places…" maxLength={500} /></label>
    <button className="primary full" disabled={busy}>{busy ? "Creating your plan…" : "Generate itinerary"}</button>
  </form>;
}

function EmptyPlan() { return <div className="empty-plan"><div className="compass">✦</div><h2>Your trip takes shape here.</h2><p>Tell us where, when, and how you like to travel. We’ll turn it into an editable daily plan.</p><ul><li>Day-by-day activities</li><li>Estimated INR costs</li><li>Links to each place on Google Maps</li></ul></div>; }

function ItineraryView({ itinerary, busy, onChange, onRegenerate, onSave, signedIn }: { itinerary: Itinerary; busy: string | number | null; onChange: (day: number, activity: number, key: keyof Activity, value: string | number) => void; onRegenerate: (day: number) => void; onSave: () => void; signedIn: boolean }) {
  return <div className="itinerary"><div className="itinerary-summary"><div><p className="eyebrow">Your itinerary</p><h2>{itinerary.title}</h2><p>{itinerary.summary}</p></div><div className="cost"><strong>{money.format(itinerary.total_estimated_cost_inr)}</strong><span>estimated total</span></div></div><p className="budget-note">{itinerary.budget_note}</p>
    {itinerary.days.map((day, dayIndex) => <article className="day-card" key={`${day.day}-${day.date}`}><header><div><span>DAY {day.day} · {new Date(`${day.date}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span><h3>{day.theme}</h3></div><div><strong>{money.format(day.daily_cost_inr)}</strong><button className="text-button" disabled={busy === day.day} onClick={() => onRegenerate(day.day)}>{busy === day.day ? "Refreshing…" : "Regenerate day"}</button></div></header><div className="activities">{day.activities.map((activity, activityIndex) => <ActivityEditor key={`${activity.time}-${activityIndex}`} activity={activity} onChange={(key, value) => onChange(dayIndex, activityIndex, key, value)} />)}</div></article>)}
    <div className="save-row"><button className="primary" disabled={busy === "save"} onClick={onSave}>{busy === "save" ? "Saving…" : signedIn ? "Save to my trips" : "Save guest trip"}</button><span>{signedIn ? "Saved securely to your account." : "Guest trips are kept only for this browser session."}</span></div>
  </div>;
}

function ActivityEditor({ activity, onChange }: { activity: Activity; onChange: (key: keyof Activity, value: string | number) => void }) {
  return <div className="activity"><input className="time" aria-label="Activity time" value={activity.time} onChange={(event) => onChange("time", event.target.value)} /><div className="activity-main"><input aria-label="Activity title" value={activity.title} onChange={(event) => onChange("title", event.target.value)} /><textarea aria-label="Activity description" value={activity.description} onChange={(event) => onChange("description", event.target.value)} /></div><label className="activity-cost">INR<input aria-label="Estimated cost" type="number" min="0" value={activity.estimated_cost_inr} onChange={(event) => onChange("estimated_cost_inr", Number(event.target.value))} /></label>{activity.map_url && <a href={activity.map_url} target="_blank" rel="noreferrer" aria-label={`View ${activity.title} on Google Maps`}>Map ↗</a>}</div>;
}

function Dashboard({ userTrips, guestTrips, signedIn, onOpen }: { userTrips: SavedTrip[]; guestTrips: GuestTrip[]; signedIn: boolean; onOpen: (trip: { itinerary: Itinerary; trip_input: TripInput }) => void }) {
  const trips = signedIn ? userTrips : guestTrips;
  return <section className="dashboard"><p className="eyebrow">Dashboard</p><h1>{signedIn ? "Your saved journeys" : "Your guest trips"}</h1><p>{signedIn ? "Trips in your account, ready whenever you are." : "These stay in this browser session. Sign in and save a trip to keep it."}</p><div className="trip-grid">{trips.map((trip) => <button className="trip-card" key={trip.id} onClick={() => onOpen(trip)}><span>{new Date(trip.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span><h2>{trip.itinerary.title}</h2><p>{trip.trip_input.destination} · {trip.itinerary.days.length} days</p><strong>{money.format(trip.itinerary.total_estimated_cost_inr)}</strong></button>)}{!trips.length && <div className="empty-dashboard"><h2>No saved trips yet.</h2><p>Generate a trip and save it to find it here.</p></div>}</div></section>;
}

function AuthDialog({ onClose, onError, onNotice }: { onClose: () => void; onError: (message: string) => void; onNotice: (message: string) => void }) {
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [mode, setMode] = useState<"signin" | "signup">("signin"); const [busy, setBusy] = useState(false); const [confirmationPending, setConfirmationPending] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); onError(""); try { if (mode === "signin") { await signIn(email, password); onClose(); } else { const result = await signUp(email, password); if (result === "confirmation-required") { setConfirmationPending(true); onNotice("Account created. Check your email and open the verification link before signing in."); } else { onClose(); } } } catch (authError) { const message = authError instanceof Error ? authError.message : "Could not authenticate."; if (message.toLowerCase().includes("not confirmed")) setConfirmationPending(true); onError(message); } finally { setBusy(false); } }
  async function resend() { setBusy(true); onError(""); try { await resendVerification(email); onNotice("A new verification email has been sent."); } catch (authError) { onError(authError instanceof Error ? authError.message : "Could not send a verification email."); } finally { setBusy(false); } }
  function changeMode() { setConfirmationPending(false); setMode(mode === "signin" ? "signup" : "signin"); }
  return <div className="modal-backdrop" role="presentation"><form className="auth-dialog" onSubmit={submit}><button type="button" className="close" onClick={onClose}>×</button><p className="eyebrow">{mode === "signin" ? "Welcome back" : "Create account"}</p><h2>{mode === "signin" ? "Save trips for later." : "Keep every journey."}</h2><label>Email<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label><label>Password<input type="password" minLength={6} required value={password} onChange={(event) => setPassword(event.target.value)} /></label><button className="primary full" disabled={busy}>{busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}</button>{confirmationPending && <button type="button" className="text-button" disabled={busy} onClick={resend}>Resend verification email</button>}<button type="button" className="text-button" onClick={changeMode}>{mode === "signin" ? "Need an account? Sign up" : "Already have an account? Sign in"}</button></form></div>;
}
