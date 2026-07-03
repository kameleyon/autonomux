/**
 * Autonomux landing.
 *
 * For now the landing page IS the login page — visiting the root redirects
 * straight to /sign-in. (The marketing home returns in a later phase.)
 */
import { redirect } from "next/navigation";

export default function HomePage(): never {
  redirect("/sign-in");
}
