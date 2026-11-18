import { redirect } from "next/navigation";

/**
 * Settings → Maintenance moved in 48d (canvas B): its index rebuilds are
 * Sync & upkeep's first upkeep row (`/git#upkeep`), and its Sign out
 * everywhere is on Account & devices. The old address still lands.
 */
export default function MaintenancePage(): never {
  redirect("/git#upkeep");
}
