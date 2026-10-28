import { createClient, type Session } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = url && key ? createClient(url, key) : null;

export async function signIn(email: string, password: string) {
  if (!supabase) throw new Error("Supabase browser credentials are not configured.");
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signUp(email: string, password: string) {
  if (!supabase) throw new Error("Supabase browser credentials are not configured.");
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: window.location.origin },
  });
  if (error) throw error;
  return data.session ? "signed-in" : "confirmation-required";
}

export async function resendVerification(email: string) {
  if (!supabase) throw new Error("Supabase browser credentials are not configured.");
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: window.location.origin },
  });
  if (error) throw error;
}

export function subscribeToAuth(callback: (session: Session | null) => void) {
  if (!supabase) return () => undefined;
  supabase.auth.getSession().then(({ data }) => callback(data.session));
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return () => data.subscription.unsubscribe();
}
