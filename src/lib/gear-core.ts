import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
export const GEAR_ZONE = "America/Vancouver";
export type GearItem = {
  id: string;
  code: string;
  name: string;
  picture: string;
  archived: number;
  version: number;
  unavailable?: number;
  service_note?: string;
  notes?: {id:string;message:string;kind:string}[];
  training_required?: number;
  overdue?: boolean;
  out?: boolean;
};
export type ReservationItem = {
  id: string;
  gear_id: string;
  name: string;
  code: string;
  picture: string;
  status: "reserved" | "checked_out" | "returned" | "cancelled";
  starts_at: number;
  ends_at: number;
  collected_at: number | null;
  returned_at: number | null;
  collected_by?: string | null;
  returned_by?: string | null;
};
export type GearReservation = {
  id: string;
  reference: string;
  user_id: string;
  name?: string;
  email?: string;
  reason: string;
  starts_at: number;
  ends_at: number;
  version: number;
  items: ReservationItem[];
};
export function localGearTime(ms: number) {
  return formatInTimeZone(ms, GEAR_ZONE, "yyyy-MM-dd'T'HH:mm");
}
export function parseGearTime(value: unknown) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)
  )
    throw Error("Choose valid dates and times.");
  const ms = fromZonedTime(value, GEAR_ZONE).getTime();
  if (!Number.isFinite(ms) || localGearTime(ms) !== value)
    throw Error("That Vancouver time does not exist. Choose another time.");
  // A repeated wall time has two possible instants: require a different time rather than silently choosing one.
  if (
    localGearTime(ms - 3600000) === value ||
    localGearTime(ms + 3600000) === value
  )
    throw Error(
      "That Vancouver time repeats during daylight saving. Choose a time outside the repeated hour.",
    );
  return ms;
}
export function reservationSchedule(
  start: unknown,
  end: unknown,
  now = Date.now(),
  editing = false,
) {
  const startsAt = parseGearTime(start),
    endsAt = parseGearTime(end);
  if (endsAt <= startsAt) throw Error("End must be after start.");
  if (endsAt <= now || (!editing && startsAt < now - 60000))
    throw Error("Choose a current or future reservation window.");
  return { startsAt, endsAt };
}
export function pictureUrl(value: unknown) {
  if(typeof value==='string'&&/^\/(equipment\/|api\/members\/photos\?)/.test(value))return value;
  if (typeof value !== "string" || value.length > 2000)
    throw Error("Enter an HTTPS picture link.");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw Error("Enter an HTTPS picture link.");
  }
  if (url.protocol !== "https:" || url.username || url.password)
    throw Error("Enter an HTTPS picture link.");
  return url.href;
}
export function scanAsset(value: string, origin: string) {
  const trimmed = value.trim();
  if (/^GWG-[A-F0-9]{12}$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    if (url.origin !== origin) return null;
    return (
      url.pathname.match(/^\/members\/gear\/(GWG-[A-F0-9]{12})\/?$/)?.[1] ||
      null
    );
  } catch {
    return null;
  }
}
