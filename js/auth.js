import { db } from "./supabase.js";
import { ADMIN_EMAILS } from "./config.js";

export const isAdmin = (user) =>
  !!user && ADMIN_EMAILS.includes((user.email || "").toLowerCase());

export async function login(email, password) {
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) throw error;
  if (!isAdmin(data.user)) {
    await db.auth.signOut();
    throw new Error("This account is not an admin.");
  }
  return data.user;
}

export const logout = () => db.auth.signOut();

export async function getSessionUser() {
  const { data } = await db.auth.getSession();
  const user = data.session?.user ?? null;
  return isAdmin(user) ? user : null;
}

export const onAuthChange = (cb) =>
  db.auth.onAuthStateChange((_e, session) => {
    const u = session?.user ?? null;
    cb(isAdmin(u) ? u : null);
  });
