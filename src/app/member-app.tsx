"use client";
import { useEffect, useId, useRef, useState } from "react";
import {
  Package,
  CalendarDays,
  ShoppingCart,
  ScanLine,
  Users,
  ShieldCheck,
  ArrowUpRight,
  ArrowLeft,
  Plus,
  Search,
  LayoutGrid,
  List,
  X,
  LogOut,
  Menu,
  Check,
  Clock,
  Printer,
  Pencil,
  Archive,
  RotateCcw,
} from "lucide-react";
import type {
  GearItem,
  GearReservation,
  ReservationItem,
} from "../lib/gear-core";
import {
  localGearTime,
  parseGearTime,
  reservationSchedule,
  GEAR_ZONE,
} from "../lib/gear-core";
import GearScanner from "./gear-scanner";
import GearLabels from "./gear-labels";
type Draft = {
  gearIds: string[];
  reason: string;
  start: string;
  end: string;
  requestKey: string;
};
type AccessMember = {
  id: string;
  name: string;
  email: string;
  role: string;
  access: string;
  is_admin?: number;
};
type Availability = {
  gear_id: string;
  starts_at: number;
  ends_at: number;
  status: string;
};
type MemberData = {
  gear: GearItem[];
  availability: Availability[];
  bookings: GearReservation[];
  members: AccessMember[];
  history: any[];
};
function emptyDraft(): Draft {
  const start = Math.ceil((Date.now() + 60000) / 60000) * 60000;
  return {
    gearIds: [],
    reason: "",
    start: localGearTime(start),
    end: localGearTime(start + 3600000),
    requestKey: crypto.randomUUID(),
  };
}
const when = (value: number) =>
  new Date(value).toLocaleString("en-CA", {
    timeZone: GEAR_ZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
function stateOf(item: ReservationItem) {
  return item.status === "reserved" && item.ends_at <= Date.now()
    ? "expired"
    : item.status === "checked_out" && item.ends_at <= Date.now()
      ? "overdue"
      : item.status;
}
function ScheduleFields({
  value,
  onChange,
}: {
  value: { reason: string; start: string; end: string };
  onChange: (patch: Partial<Draft>) => void;
}) {
  const id = useId();
  return (
    <>
      <label htmlFor={id + "reason"}>
        Reason
        <textarea
          id={id + "reason"}
          required
          maxLength={1000}
          rows={3}
          placeholder="What will you use this gear for?"
          value={value.reason}
          onChange={(e) => onChange({ reason: e.target.value })}
        />
      </label>
      <div className="member-form-two">
        <label htmlFor={id + "start"}>
          Start date & time
          <input
            id={id + "start"}
            type="datetime-local"
            required
            value={value.start}
            onChange={(e) => onChange({ start: e.target.value })}
          />
        </label>
        <label htmlFor={id + "end"}>
          End date & time
          <input
            id={id + "end"}
            type="datetime-local"
            required
            value={value.end}
            onChange={(e) => onChange({ end: e.target.value })}
          />
        </label>
      </div>
      <small>All dates and times use America/Vancouver.</small>
    </>
  );
}
export default function MemberApp({
  userId,
  displayName,
  admin,
  signOut,
  initialCode,
}: {
  userId: string;
  displayName: string;
  admin: boolean;
  signOut: string;
  initialCode?: string;
}) {
  const [data, setData] = useState<MemberData | null>(null),
    [view, setView] = useState("gear"),
    [layout, setLayout] = useState("grid"),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [menu, setMenu] = useState(false),
    [mobile, setMobile] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [modal, setModal] = useState<any>(null),
    [draft, setDraft] = useState<Draft | null>(null),
    [code, setCode] = useState(""),
    [showArchived, setShowArchived] = useState(false),
    [borrower, setBorrower] = useState(userId);
  const dialog = useRef<HTMLElement>(null),
    initialOpened = useRef(false),
    requestNumber = useRef(0),
    storageKey = "gwgtv-gear-cart:" + userId;
  useEffect(() => {
    const query = matchMedia("(max-width: 760px)");
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  async function api(path: string, body?: unknown) {
    const response = await fetch(
      path,
      body
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        : undefined,
    );
    const result = (await response.json()) as any;
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        if (
          result.error?.includes("revoked") ||
          result.error?.includes("invitation") ||
          response.status === 401
        )
          location.reload();
      }
      throw Error(result.error || "Could not complete this request.");
    }
    return result;
  }
  async function load() {
    const request = ++requestNumber.current;
    try {
      const results = await Promise.allSettled([
        api("/api/gear"),
        api("/api/gear/bookings" + (admin ? "?manage=1" : "")),
        api("/api/members/access"),
      ]);
      const failure = results.find((r) => r.status === "rejected");
      if (failure?.status === "rejected") throw failure.reason;
      const [g, b, a] = results.map((r) =>
        r.status === "fulfilled" ? r.value : null,
      );
      if (request === requestNumber.current)
        setData({
          gear: g.gear,
          availability: g.availability,
          bookings: b.bookings,
          members: a.members,
          history: b.history,
        });
    } catch (e) {
      if (request === requestNumber.current) setError((e as Error).message);
    }
  }
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
      setDraft(
        saved &&
          Array.isArray(saved.gearIds) &&
          typeof saved.reason === "string" &&
          typeof saved.start === "string" &&
          typeof saved.end === "string" &&
          typeof saved.requestKey === "string"
          ? saved
          : emptyDraft(),
      );
      setLayout(
        localStorage.getItem("gwgtv-gear-layout") === "list" ? "list" : "grid",
      );
    } catch {
      setDraft(emptyDraft());
    }
    load();
    const timer = setInterval(() => load(), 30000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (draft)
      try {
        localStorage.setItem(storageKey, JSON.stringify(draft));
      } catch {}
  }, [draft, storageKey]);
  useEffect(() => {
    if (data && initialCode && !initialOpened.current) {
      initialOpened.current = true;
      openItem(initialCode);
    }
  }, [data, initialCode]);
  useEffect(() => {
    if (view === "access" && admin)
      api("/api/members/invitation")
        .then((r) => setCode(r.code))
        .catch((e) => setError(e.message));
  }, [view, admin]);
  useEffect(() => {
    if (!modal) return;
    const before = document.activeElement as HTMLElement;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const nodes = () =>
      Array.from(
        dialog.current?.querySelectorAll<HTMLElement>(
          'a[href],button:not(:disabled),input:not(:disabled),textarea,select,[tabindex="0"]',
        ) || [],
      );
    nodes()[0]?.focus();
    function key(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) closeModal();
      if (e.key === "Tab") {
        const all = nodes(),
          first = all[0],
          last = all[all.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = oldOverflow;
      document.removeEventListener("keydown", key);
      before?.focus();
    };
  }, [modal, busy]);
  function updateDraft(patch: Partial<Draft>) {
    setDraft((d) => ({ ...d!, ...patch, requestKey: crypto.randomUUID() }));
  }
  function closeModal() {
    setModal(null);
    setError("");
    if (location.pathname.startsWith("/members/gear/"))
      history.replaceState(null, "", "/members/gear");
  }
  function navigate(next: string) {
    setView(next);
    setSearch("");
    setFilter("all");
    setMenu(false);
    setError("");
    setNotice("");
    closeModal();
  }
  function openItem(asset: string) {
    const item = data?.gear.find((g) => g.code === asset);
    if (!item) {
      setError("Gear not found. It may have been archived.");
      return;
    }
    setError("");
    setModal({
      type: "item",
      item,
      form: { ...(draft?.gearIds.length ? draft : emptyDraft()) },
    });
    history.replaceState(null, "", "/members/gear/" + item.code);
  }
  async function mutate(
    path: string,
    body: unknown,
    message: string,
    keep = false,
  ) {
    setBusy(true);
    setError("");
    try {
      const result = await api(path, body);
      setNotice(
        result.reference
          ? "Reservation confirmed · " + result.reference
          : message,
      );
      if (!keep) closeModal();
      await load();
      return result;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }
  function conflicts(item: GearItem, start = draft?.start, end = draft?.end) {
    if (item.archived) return "Archived";
    if (item.unavailable) return "Unavailable for repair";
    if (!admin && item.training_required) return "Complete the required training first";
    if (item.overdue) return "Overdue — awaiting return";
    if (!start || !end) return "";
    try {
      const a = parseGearTime(start),
        b = parseGearTime(end);
      if (b <= a) return "End must be after start";
      if (
        data?.availability.some(
          (x) => x.gear_id === item.id && x.starts_at < b && x.ends_at > a,
        )
      )
        return "Reserved for these dates";
    } catch {
      return "Choose valid Vancouver dates/times";
    }
    return "";
  }
  function addToCart(item: GearItem, form: Draft) {
    if (draft!.gearIds.length) {
      const issue = conflicts(item);
      if (issue) {
        setError(issue);
        return;
      }
      updateDraft({
        gearIds: Array.from(new Set([...draft!.gearIds, item.id])),
      });
    } else updateDraft({ ...form, gearIds: [item.id] });
    setNotice(item.name + " added to cart.");
    closeModal();
  }
  function prepareDirect(item: GearItem, form: Draft) {
    setError("");
    try {
      reservationSchedule(form.start, form.end);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    setModal({
      type: "confirm",
      form: { ...form, gearIds: [item.id], requestKey: crypto.randomUUID() },
      userId: borrower,
    });
  }
  function actionModal(
    booking: GearReservation,
    action: string,
    items: ReservationItem[],
  ) {
    setError("");
    setModal({ type: "action", booking, action, items });
  }
  async function confirmReservation(form: Draft, userIdOverride: string) {
    const result = await mutate(
      "/api/gear/bookings",
      { action: "reserve", ...form, userId: userIdOverride },
      "Reservation confirmed.",
    );
    if (result) {
      if (modal?.type !== "confirm") setDraft(emptyDraft());
      setView("bookings");
    }
  }
  function bookingCard(booking: GearReservation) {
    const active = booking.items.filter((i) => i.status !== "cancelled"),
      reserved = active.filter((i) => stateOf(i) === "reserved"),
      out = active.filter((i) => i.status === "checked_out"),
      editable = active.some(
        (i) => i.status === "reserved" || i.status === "checked_out",
      );
    return (
      <article className="member-panel reservation-card" key={booking.id}>
        <div className="reservation-heading">
          <div>
            <span className="member-eyebrow">{booking.reference}</span>
            <h3>{booking.reason}</h3>
            {admin && (
              <p className="borrower-label">
                {booking.name || booking.user_id}
                {booking.user_id === userId ? " · You" : ""}
              </p>
            )}
          </div>
          <div className="member-actions">
            {admin && editable && (
              <button
                className="secondary"
                onClick={() =>
                  setModal({
                    type: "editbooking",
                    booking,
                    form: {
                      gearIds: active.map((i) => i.gear_id),
                      reason: booking.reason,
                      start: localGearTime(booking.starts_at),
                      end: localGearTime(booking.ends_at),
                    },
                    userId: booking.user_id,
                  })
                }
              >
                <Pencil size={15} />
                Edit
              </button>
            )}
          </div>
        </div>
        <p className="reservation-dates">
          <CalendarDays size={15} />
          {when(booking.starts_at)} → {when(booking.ends_at)}
        </p>
        <div className="reservation-items">
          {(active.length ? active : booking.items).map((item) => (
            <div className="reservation-item" key={item.id}>
              <img
                src={item.picture}
                alt=""
                onError={(e) => {
                  e.currentTarget.style.visibility = "hidden";
                }}
              />
              <div>
                <strong>{item.name}</strong>
                <code>{item.code}</code>
                {item.collected_at && (
                  <small>Collected {when(item.collected_at)}</small>
                )}
                {item.returned_at && (
                  <small>Returned {when(item.returned_at)}</small>
                )}
                {!!(data?.gear.find((g) => g.id === item.gear_id)?.overdue || data?.gear.find((g) => g.id === item.gear_id)?.unavailable) &&
                  item.status === "reserved" && (
                    <small className="member-warning">
                      Unavailable until repairs are completed or the previous loan is returned.
                    </small>
                  )}
              </div>
              <span className={"gear-status " + stateOf(item)}>
                {stateOf(item).replaceAll("_", " ")}
              </span>
              <div className="item-actions">
                {stateOf(item) === "reserved" &&
                  booking.starts_at <= Date.now() && (
                    <button
                      className="secondary"
                      onClick={() => actionModal(booking, "collect", [item])}
                    >
                      Collect
                    </button>
                  )}
                {item.status === "checked_out" && (
                  <button
                    className="secondary"
                    onClick={() => actionModal(booking, "return", [item])}
                  >
                    Return
                  </button>
                )}
                {item.status === "reserved" && (
                  <button
                    className="text-button"
                    onClick={() => actionModal(booking, "cancel", [item])}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        {(reserved.length > 1 || out.length > 1) && (
          <div className="member-actions reservation-bulk">
            {reserved.length > 1 && booking.starts_at <= Date.now() && (
              <button
                className="secondary"
                onClick={() => actionModal(booking, "collect", reserved)}
              >
                Collect all reserved
              </button>
            )}
            {reserved.length > 1 && (
              <button
                className="secondary"
                onClick={() => actionModal(booking, "cancel", reserved)}
              >
                Cancel all reserved
              </button>
            )}
            {out.length > 1 && (
              <button
                className="secondary"
                onClick={() => actionModal(booking, "return", out)}
              >
                Return all collected
              </button>
            )}
          </div>
        )}
      </article>
    );
  }
  const approved =
    data?.members.filter(
      (m) => m.access === "active" || m.role === "admin" || m.is_admin,
    ) || [];
  function borrowerSelect(value: string, onChange: (id: string) => void) {
    return admin ? (
      <label>
        Book for
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          <option value={userId}>{displayName} (you)</option>
          {value !== userId && !approved.some((m) => m.id === value) && (
            <option value={value}>
              {data?.members.find((m) => m.id === value)?.name ||
                "Current borrower"}{" "}
              (current borrower)
            </option>
          )}
          {approved
            .filter((m) => m.id !== userId)
            .map((m) => (
              <option value={m.id} key={m.id}>
                {m.name} · {m.email}
              </option>
            ))}
        </select>
      </label>
    ) : null;
  }
  const own = data?.bookings.filter((b) => b.user_id === userId) || [],
    allRows = view === "manage" ? data?.bookings || [] : own;
  const shownBookings = allRows.filter(
    (b) =>
      (
        b.reference +
        " " +
        b.reason +
        " " +
        (b.name || "") +
        " " +
        b.items.map((i) => i.name + " " + i.code).join(" ")
      )
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (filter === "all" ||
        b.items.some((i) =>
          filter === "upcoming"
            ? stateOf(i) === "reserved"
            : filter === "out"
              ? i.status === "checked_out"
              : filter === "history"
                ? ["returned", "cancelled", "expired"].includes(stateOf(i))
                : stateOf(i) === filter,
        )),
  );
  const shownGear =
    data?.gear.filter(
      (g) =>
        (showArchived || !g.archived) &&
        (g.name + " " + g.code).toLowerCase().includes(search.toLowerCase()),
    ) || [];
  const cartItems =
    (draft?.gearIds
      .map((id) => data?.gear.find((g) => g.id === id))
      .filter(Boolean) as GearItem[]) || [];
  const nav = [
    ["gear", "Gear", Package],
    ["bookings", "My Bookings", CalendarDays],
    ["cart", "Cart", ShoppingCart],
    ["scan", "Scan", ScanLine],
  ] as const;
  return (
    <div className="member-shell">
      <a className="member-skip" href="#member-main">
        Skip to content
      </a>
      {mobile && menu && (
        <button
          className="member-nav-scrim"
          aria-label="Close menu"
          onClick={() => setMenu(false)}
        />
      )}
      <aside
        id="member-sidebar"
        inert={mobile && !menu}
        className={"member-sidebar " + (menu ? "is-open" : "")}
      >
        <a className="member-brand" href="/members">
          <img src="/gwgtv-logo.png" alt="GWG TV Live" width="48" height="48" />
          <span>
            GWG TV<small>MEMBER SPACE</small>
          </span>
        </a>
        <button
          className="member-mobile-close"
          aria-label="Close navigation"
          onClick={() => setMenu(false)}
        >
          <X />
        </button>
        <span className="member-nav-label">YOUR WORKSPACE</span>
        <nav aria-label="Member navigation">
          <a href="/members"><ArrowLeft size={19}/>Member Space home</a>
          {nav.map(([id, label, Icon]) => (
            <button
              className={view === id ? "active" : ""}
              key={id}
              onClick={() => navigate(id)}
            >
              <Icon size={19} />
              {label}
              {id === "cart" && !!draft?.gearIds.length && (
                <b>{draft.gearIds.length}</b>
              )}
            </button>
          ))}
          <a href="/members/plans"><CalendarDays size={19}/>Shoot & setup plans</a>
          <a href="/members/clips"><Check size={19}/>Clip Progress Tracker</a>
          <a href="/members/training"><List size={19}/>Training Library</a>
          <a href="/members/faults"><Pencil size={19}/>Gear Fault Reports</a>
          
        </nav>
        {admin && (
          <>
            <span className="member-nav-label">ADMINISTRATION</span>
            <nav aria-label="Member administration">
              {[
                ["manage", "All Gear Bookings", CalendarDays],
                
                ["audit", "Activity", Clock],
              ].map(([id, label, Icon]: any) => (
                <button
                  key={id}
                  className={view === id ? "active" : ""}
                  onClick={() => navigate(id)}
                >
                  <Icon size={19} />
                  {label}
                </button>
              ))}
              <a href="/members/people">
                <ShieldCheck size={19} />
                Local people
                <ArrowUpRight size={14} />
              </a>
            </nav>
          </>
        )}
        <div className="member-sidebar-bottom">
          <a href="/members">← Member Space home</a>
          <div className="member-profile">
            <span>{displayName.slice(0, 1).toUpperCase()}</span>
            <div>
              <strong>{displayName}</strong>
              <small>{admin ? "Administrator" : "Crew member"}</small>
            </div>
            <a href={signOut} target="_top" aria-label="Member Space home">
              <LogOut size={18} />
            </a>
          </div>
        </div>
      </aside>
      <div className="member-main-shell">
        <header className="member-topbar">
          <button
            aria-label="Open navigation"
            aria-controls="member-sidebar"
            aria-expanded={menu}
            className="member-mobile-toggle"
            onClick={() => setMenu(true)}
          >
            <Menu />
          </button>
          <span>
            Member Space <span>/</span>{" "}
            {
              (
                {
                  gear: "Gear",
                  bookings: "My Bookings",
                  cart: "Cart",
                  scan: "Scan",
                  manage: "All Gear Bookings",
                  access: "Member Access",
                  audit: "Activity",
                } as any
              )[view]
            }
          </span>
          <span className="member-zone">America/Vancouver</span>
        </header>
        <main id="member-main" className="member-main">
          <div className="member-heading">
            <div>
              <span className="member-eyebrow">
                GWG TV · THE CREW WORKSPACE
              </span>
              <h1>
                {
                  (
                    {
                      gear: "Ready for your next shoot.",
                      bookings: "Your gear. Your plans.",
                      cart: "Bring it all together.",
                      scan: "Scan. Review. Go.",
                      manage: "Every booking, in view.",
                      access: "Welcome your crew.",
                      audit: "A record of every handover.",
                    } as any
                  )[view]
                }
              </h1>
              <p>
                {
                  (
                    {
                      gear: "Find the right gear and reserve it for your production.",
                      bookings:
                        "Collect your reserved gear, then record its return when you’re done.",
                      cart: "One reason and schedule for every item in this booking.",
                      scan: "Open gear details using a QR code, barcode, or asset code.",
                      manage:
                        "Manage reservations and handovers for every member.",
                      access:
                        "Share your invitation code and manage access to this workspace.",
                      audit:
                        "Track reservations, changes, collections, returns, and access updates.",
                    } as any
                  )[view]
                }
              </p>
            </div>
            {view === "gear" && admin && (
              <button
                className="primary"
                onClick={() => setModal({ type: "gearform" })}
              >
                <Plus size={17} />
                Add gear
              </button>
            )}
          </div>
          {notice && (
            <div className="member-notice" role="status">
              <Check size={17} />
              {notice}
              <button
                aria-label="Dismiss notification"
                onClick={() => setNotice("")}
              >
                <X size={17} />
              </button>
            </div>
          )}
          {error && !modal && (
            <div className="member-error" role="alert">
              {error}
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {!data || !draft ? (
            <div className="member-panel member-empty">
              Loading your workspace…
            </div>
          ) : (
            <>
              {view === "gear" && (
                <>
                  <div className="member-toolbar">
                    <label className="member-search">
                      <Search size={18} />
                      <input
                        placeholder="Search gear or asset code"
                        aria-label="Search gear"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </label>
                    <div className="member-actions">
                      {admin && (
                        <>
                          <label className="inline-check">
                            <input
                              type="checkbox"
                              checked={showArchived}
                              onChange={(e) =>
                                setShowArchived(e.target.checked)
                              }
                            />
                            Archived
                          </label>
                          <button
                            className="secondary"
                            disabled={!shownGear.length}
                            onClick={() =>
                              setModal({ type: "labels", items: shownGear })
                            }
                          >
                            <Printer size={16} />
                            Labels
                          </button>
                        </>
                      )}
                      <div className="gear-view-toggle">
                        {[
                          ["grid", LayoutGrid],
                          ["list", List],
                        ].map(([id, Icon]: any) => (
                          <button
                            key={id}
                            aria-label={id + " view"}
                            aria-pressed={layout === id}
                            onClick={() => {
                              setLayout(id);
                              try {
                                localStorage.setItem("gwgtv-gear-layout", id);
                              } catch {}
                            }}
                          >
                            <Icon size={18} />
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  {shownGear.length ? (
                    <div className={"gear-catalog " + layout}>
                      {shownGear.map((item) => (
                        <article
                          key={item.id}
                          className={
                            "gear-card " + (item.archived ? "archived" : "")
                          }
                        >
                          <button
                            className="gear-card-open"
                            onClick={() => openItem(item.code)}
                          >
                            <div className="gear-photo">
                              <img
                                src={item.picture}
                                alt={item.name}
                                loading="lazy"
                                onError={(e) => {
                                  e.currentTarget.style.visibility = "hidden";
                                }}
                              />
                            </div>
                            <div className="gear-card-info">
                              <code>{item.code}</code>
                              <h2>{item.name}</h2>
                              <span
                                className={
                                  "gear-status " +
                                  (item.unavailable ? "overdue" : item.archived
                                    ? "cancelled"
                                    : item.overdue
                                      ? "overdue"
                                      : item.out
                                        ? "checked_out"
                                        : "available")
                                }
                              >
                                {item.unavailable ? "Unavailable for repair" : item.archived
                                  ? "Archived"
                                  : item.overdue
                                    ? "Overdue"
                                    : item.out
                                      ? "Checked out"
                                      : "Available now"}
                              </span>
                              {!!item.notes?.length&&<small>{item.notes.length} open note / fault report{item.training_required?' · Training required':''}</small>}
                              {!!item.training_required&&!item.notes?.length&&<small>Training required</small>}
                              <span className="gear-open-label">
                                View availability <ArrowUpRight size={15} />
                              </span>
                            </div>
                          </button>
                          {admin && (
                            <div className="gear-card-admin">
                              <button
                                onClick={() =>
                                  setModal({ type: "gearform", item })
                                }
                              >
                                <Pencil size={14} />
                                Edit
                              </button>
                              <button
                                onClick={() =>
                                  setModal({ type: "labels", items: [item] })
                                }
                              >
                                <Printer size={14} />
                                Label
                              </button>
                              <button
                                onClick={() =>
                                  setModal({ type: "archive", item })
                                }
                              >
                                {item.archived ? (
                                  <RotateCcw size={14} />
                                ) : (
                                  <Archive size={14} />
                                )}
                                {item.archived ? "Restore" : "Archive"}
                              </button>
                            </div>
                          )}
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="member-panel member-empty">
                      <Package size={36} />
                      <h2>
                        {search
                          ? "No matching gear."
                          : "Your gear room starts here."}
                      </h2>
                      <p>
                        {admin
                          ? "Add a physical item with its name and picture link to get started."
                          : "Your administrator has not added gear yet. Check back soon."}
                      </p>
                    </div>
                  )}
                </>
              )}
              {(view === "bookings" || view === "manage") && (
                <>
                  <div className="member-toolbar">
                    <label className="member-search">
                      <Search size={18} />
                      <input
                        aria-label="Search gear bookings"
                        placeholder="Search gear bookings"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </label>
                    <label className="member-filter">
                      Show
                      <select
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                      >
                        {[
                          ["all", "All bookings"],
                          ["upcoming", "Upcoming"],
                          ["out", "Checked out"],
                          ["overdue", "Overdue"],
                          ["history", "History"],
                        ].map(([v, label]) => (
                          <option value={v} key={v}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {shownBookings.length ? (
                    <div className="reservation-list">
                      {shownBookings.map(bookingCard)}
                    </div>
                  ) : (
                    <div className="member-panel member-empty">
                      <CalendarDays size={36} />
                      <h2>No bookings here yet.</h2>
                      <p>
                        Reserve gear from the catalog and it will appear here.
                      </p>
                      <button
                        className="primary"
                        onClick={() => navigate("gear")}
                      >
                        Browse gear
                      </button>
                    </div>
                  )}
                </>
              )}
              {view === "cart" && (
                <div className="member-cart-layout">
                  <section className="member-panel">
                    <h2>
                      {draft.gearIds.length}{" "}
                      {draft.gearIds.length === 1 ? "item" : "items"} in your
                      cart
                    </h2>
                    {draft.gearIds.length ? (
                      draft.gearIds.map((id) => {
                        const item = data.gear.find((g) => g.id === id);
                        return (
                          <div className="cart-item" key={id}>
                            {item && <img src={item.picture} alt="" />}
                            <div>
                              <strong>
                                {item?.name || "Unavailable item"}
                              </strong>
                              <code>{item?.code || id}</code>
                              {(!item || conflicts(item)) && (
                                <small className="member-warning">
                                  {item
                                    ? conflicts(item)
                                    : "This item is no longer available."}
                                </small>
                              )}
                            </div>
                            <button
                              className="text-button"
                              onClick={() =>
                                updateDraft({
                                  gearIds: draft.gearIds.filter(
                                    (g) => g !== id,
                                  ),
                                })
                              }
                            >
                              Remove
                            </button>
                          </div>
                        );
                      })
                    ) : (
                      <p>Your cart is empty. Add gear from the catalog.</p>
                    )}
                    <button
                      className="secondary"
                      onClick={() => navigate("gear")}
                    >
                      <Plus size={16} />
                      Add more gear
                    </button>
                  </section>
                  <section className="member-panel">
                    <h2>Booking details</h2>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        try {
                          reservationSchedule(draft.start, draft.end);
                          setError("");
                          setModal({
                            type: "cartconfirm",
                            form: { ...draft },
                            userId: borrower,
                          });
                        } catch (e) {
                          setError((e as Error).message);
                        }
                      }}
                    >
                      <ScheduleFields value={draft} onChange={updateDraft} />
                      {borrowerSelect(borrower, setBorrower)}
                      <p className="member-subtle">
                        Cart items are reserved only after confirmation. Every
                        item must be available.
                      </p>
                      <button
                        className="primary"
                        disabled={
                          busy ||
                          !draft.gearIds.length ||
                          cartItems.length !== draft.gearIds.length ||
                          cartItems.some((i) => !!conflicts(i))
                        }
                      >
                        Review reservation
                      </button>
                    </form>
                  </section>
                </div>
              )}
              {view === "scan" && <GearScanner onScan={openItem} />}
              {view === "access" && admin && (
                <>
                  <section className="member-panel invitation-panel">
                    <div>
                      <span className="member-eyebrow">INVITE YOUR CREW</span>
                      <h2>One code. Access that lasts.</h2>
                      <p>
                        Members enter this code once after signing in. Rotating
                        it keeps existing members approved.
                      </p>
                    </div>
                    <div className="invitation-code">
                      <code>{code || "Loading…"}</code>
                      <button
                        className="secondary"
                        disabled={!code}
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(code);
                            setNotice("Invitation code copied.");
                          } catch {
                            setError(
                              "Select and copy the invitation code manually.",
                            );
                          }
                        }}
                      >
                        Copy
                      </button>
                      <button
                        className="secondary"
                        onClick={() => setModal({ type: "rotate" })}
                      >
                        Rotate code
                      </button>
                    </div>
                  </section>
                  <section className="member-panel">
                    <h2>Member access</h2>
                    <p>
                      Revoked accounts require an administrator to restore
                      access. Their booking history remains available to admins.
                    </p>
                    <label className="member-search">
                      <Search size={18} />
                      <input
                        aria-label="Search members"
                        placeholder="Search members"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </label>
                    <div className="member-table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Member</th>
                            <th>Access</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.members
                            .filter((m) =>
                              (m.name + " " + m.email)
                                .toLowerCase()
                                .includes(search.toLowerCase()),
                            )
                            .map((m) => (
                              <tr key={m.id}>
                                <td>
                                  <strong>{m.name}</strong>
                                  <small>{m.email}</small>
                                </td>
                                <td>
                                  {m.role === "admin" || m.is_admin
                                    ? "Administrator"
                                    : m.access}
                                </td>
                                <td>
                                  {m.role !== "admin" && !m.is_admin && (
                                    <button
                                      className="secondary"
                                      onClick={() =>
                                        setModal({
                                          type: "access",
                                          member: m,
                                          action:
                                            m.access === "active"
                                              ? "revoke"
                                              : "restore",
                                        })
                                      }
                                    >
                                      {m.access === "active"
                                        ? "Revoke"
                                        : "Restore / approve"}
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </>
              )}
              {view === "audit" && admin && (
                <section className="member-panel">
                  <h2>Recent activity</h2>
                  <p>
                    Latest 500 events. All events remain saved in the database.
                  </p>
                  {data.history.length ? (
                    <div className="member-table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>When</th>
                            <th>Who</th>
                            <th>Action</th>
                            <th>Record</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.history.map((row) => (
                            <tr key={row.id}>
                              <td>{when(row.created_at)}</td>
                              <td>{row.actor_name || "Crew administrator"}</td>
                              <td>
                                {row.event
                                  .replaceAll(".", " · ")
                                  .replaceAll("_", " ")}
                              </td>
                              <td>
                                {data.bookings.find(
                                  (b) => b.id === row.target_id,
                                )?.reference ||
                                  data.gear.find((g) => g.id === row.target_id)
                                    ?.name ||
                                  data.members.find(
                                    (m) => m.id === row.target_id,
                                  )?.name ||
                                  (row.event.startsWith("plan.") ? "Shoot plan" : "Invitation code")}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p>No activity yet.</p>
                  )}
                </section>
              )}
            </>
          )}
        </main>
      </div>
      {modal && (
        <div
          className={
            "member-modal-backdrop " +
            (modal.type === "labels" ? "labels-backdrop" : "")
          }
          onClick={() => !busy && closeModal()}
        >
          <section
            ref={dialog}
            className={
              "member-modal " + (modal.type === "labels" ? "label-modal" : "")
            }
            role="dialog"
            aria-modal="true"
            aria-labelledby="member-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="member-modal-close"
              aria-label="Close dialog"
              disabled={busy}
              onClick={closeModal}
            >
              <X size={21} />
            </button>
            {modal.type === "item" && (
              <>
                <div className="member-detail-image">
                  <img src={modal.item.picture} alt={modal.item.name} />
                </div>
                <code>{modal.item.code}</code>
                <h2 id="member-modal-title">{modal.item.name}</h2>
                {!!modal.item.unavailable&&<p className="member-error">Unavailable for repair: {modal.item.service_note}</p>}
                {!!modal.item.training_required&&<p className="member-warning">Training required before booking. <a href="/members/training">Open Training Library</a></p>}
                {!!modal.item.notes?.length&&<section><h3>Gear notes & faults</h3>{modal.item.notes.map((n:{id:string;kind:string;message:string})=><p key={n.id}><strong>{n.kind}: </strong>{n.message}</p>)}</section>}
                <p><a href={'/members/faults?gear='+modal.item.code}>Add a note or report a fault ↗</a></p>
                <h3>Reserved times</h3>
                {data?.availability.filter((a) => a.gear_id === modal.item.id)
                  .length ? (
                  <ul className="gear-availability">
                    {data?.availability
                      .filter((a) => a.gear_id === modal.item.id)
                      .sort((a, b) => a.starts_at - b.starts_at)
                      .map((a, i) => (
                        <li key={i}>
                          {when(a.starts_at)} → {when(a.ends_at)}
                          {a.status === "checked_out" && a.ends_at <= Date.now()
                            ? " · Overdue, awaiting return"
                            : ""}
                        </li>
                      ))}
                  </ul>
                ) : (
                  <p>No upcoming reservations.</p>
                )}
                {data?.bookings
                  .filter(
                    (b) =>
                      (admin || b.user_id === userId) &&
                      b.items.some(
                        (i) =>
                          i.gear_id === modal.item.id &&
                          ["reserved", "checked_out"].includes(i.status),
                      ),
                  )
                  .map((b) => (
                    <div className="scan-booking" key={b.id}>
                      <strong>
                        {b.reference}
                        {admin ? " · " + (b.name || "You") : ""}
                      </strong>
                      {b.items
                        .filter(
                          (i) =>
                            i.gear_id === modal.item.id &&
                            ["reserved", "checked_out"].includes(i.status),
                        )
                        .map((i) => (
                          <div key={i.id}>
                            <span>
                              {stateOf(i).replaceAll("_", " ")} ·{" "}
                              {when(i.starts_at)}
                            </span>
                            {i.status === "checked_out" ? (
                              <button
                                className="secondary"
                                onClick={() => actionModal(b, "return", [i])}
                              >
                                Return gear
                              </button>
                            ) : stateOf(i) === "reserved" &&
                              i.starts_at <= Date.now() ? (
                              <button
                                className="secondary"
                                onClick={() => actionModal(b, "collect", [i])}
                              >
                                Collect gear
                              </button>
                            ) : null}
                          </div>
                        ))}
                    </div>
                  ))}
                {!modal.item.archived && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const intent = (
                        e.nativeEvent as SubmitEvent
                      ).submitter?.getAttribute("value");
                      if (intent === "cart") addToCart(modal.item, modal.form);
                      else
                        prepareDirect(
                          modal.item,
                          draft?.gearIds.length ? draft : modal.form,
                        );
                    }}
                  >
                    <ScheduleFields
                      value={draft?.gearIds.length ? draft! : modal.form}
                      onChange={(patch) => {
                        if (draft?.gearIds.length) updateDraft(patch);
                        setModal((m: any) => ({
                          ...m,
                          form: { ...m.form, ...patch },
                        }));
                      }}
                    />
                    {(draft?.gearIds.length || 0) > 0 && (
                      <small>
                        Your cart’s reason and schedule apply when adding this
                        item.
                      </small>
                    )}
                    {borrowerSelect(borrower, setBorrower)}
                    {conflicts(
                      modal.item,
                      draft?.gearIds.length ? draft.start : modal.form.start,
                      draft?.gearIds.length ? draft.end : modal.form.end,
                    ) && (
                      <p className="member-warning">
                        {conflicts(
                          modal.item,
                          draft?.gearIds.length
                            ? draft.start
                            : modal.form.start,
                          draft?.gearIds.length ? draft.end : modal.form.end,
                        )}
                      </p>
                    )}
                    <div className="member-actions">
                      <button
                        className="secondary"
                        value="cart"
                        disabled={busy}
                      >
                        Add to cart
                      </button>
                      <button
                        className="primary"
                        value="direct"
                        disabled={busy}
                      >
                        Checkout directly
                      </button>
                    </div>
                  </form>
                )}
              </>
            )}
            {(modal.type === "confirm" || modal.type === "cartconfirm") && (
              <>
                <span className="member-eyebrow">CONFIRM YOUR RESERVATION</span>
                <h2 id="member-modal-title">Ready for your next production?</h2>
                <p>
                  <strong>{modal.form.reason}</strong>
                </p>
                <p>
                  {when(parseGearTime(modal.form.start))} →{" "}
                  {when(parseGearTime(modal.form.end))}
                  <br />
                  America/Vancouver
                </p>
                {admin && (
                  <p>
                    Booked for:{" "}
                    {modal.userId === userId
                      ? displayName
                      : data?.members.find((m) => m.id === modal.userId)?.name}
                  </p>
                )}
                <ul>
                  {modal.form.gearIds.map((id: string) => (
                    <li key={id}>
                      {data?.gear.find((g) => g.id === id)?.name ||
                        "Unavailable item"}
                    </li>
                  ))}
                </ul>
                <p>
                  Confirmation reserves the gear. Record collection when you
                  physically pick it up.
                </p>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => confirmReservation(modal.form, modal.userId)}
                >
                  {busy ? "Confirming…" : "Confirm reservation"}
                </button>
              </>
            )}
            {modal.type === "action" && (
              <>
                <h2 id="member-modal-title">
                  {modal.action === "collect"
                    ? "Collect"
                    : modal.action === "return"
                      ? "Return"
                      : "Cancel"}{" "}
                  {modal.items.length === 1 ? "this item" : "these items"}?
                </h2>
                <p>
                  {modal.booking.reference}
                  {admin ? " · " + modal.booking.name : ""}
                </p>
                <ul>
                  {modal.items.map((i: ReservationItem) => (
                    <li key={i.id}>{i.name}</li>
                  ))}
                </ul>
                <p>
                  {modal.action === "collect"
                    ? "Confirm that you have physically collected this gear."
                    : modal.action === "return"
                      ? "Confirm that this gear has physically been returned."
                      : "This releases the selected gear for other members."}
                </p>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() =>
                    mutate(
                      "/api/gear/bookings",
                      {
                        action: modal.action,
                        id: modal.booking.id,
                        version: modal.booking.version,
                        itemIds: modal.items.map((i: ReservationItem) => i.id),
                      },
                      "Gear " +
                        (modal.action === "collect"
                          ? "collected"
                          : modal.action === "return"
                            ? "returned"
                            : "reservation cancelled") +
                        ".",
                    )
                  }
                >
                  Confirm {modal.action}
                </button>
              </>
            )}
            {modal.type === "gearform" && (
              <>
                <h2 id="member-modal-title">
                  {modal.item ? "Edit gear" : "Add physical gear"}
                </h2>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    mutate(
                      "/api/gear",
                      {
                        action: modal.item ? "edit" : "create",
                        id: modal.item?.id,
                        version: modal.item?.version,
                        name: f.get("name"),
                        picture: f.get("picture"),
                      },
                      "Gear saved.",
                    );
                  }}
                >
                  <label>
                    Name
                    <input
                      name="name"
                      required
                      maxLength={120}
                      defaultValue={modal.item?.name || ""}
                      placeholder="e.g. Sony camera 01"
                    />
                  </label>
                  <label>
                    Upload equipment photo (optional)
                    <input type="file" accept="image/jpeg,image/png,image/webp" onChange={async e=>{const file=e.target.files?.[0];if(!file)return;try{const r=await fetch('/api/members/photos',{method:'POST',headers:{'Content-Type':file.type},body:file});const value=await r.json();if(!r.ok)throw Error(value.error);const field=e.target.form?.elements.namedItem('picture') as HTMLInputElement;if(field)field.value=value.url}catch(err){setError((err as Error).message)}}}/>
                  </label>
                  <label>
                    Picture link or local photo
                    <input
                      name="picture"
                      type="text"
                      required
                      maxLength={2000}
                      
                      defaultValue={modal.item?.picture || ""}
                      placeholder="https://…"
                    />
                  </label>
                  <p>
                    One entry represents one physical item. Its permanent asset
                    code is generated automatically.
                  </p>
                  <button className="primary" disabled={busy}>
                    Save gear
                  </button>
                </form>
              </>
            )}
            {modal.type === "archive" && (
              <>
                <h2 id="member-modal-title">
                  {modal.item.archived ? "Restore" : "Archive"}{" "}
                  {modal.item.name}?
                </h2>
                <p>
                  {modal.item.archived
                    ? "Restore this item to the member catalog."
                    : "Outstanding loans and future reservations must be resolved first. History and labels remain saved."}
                </p>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() =>
                    mutate(
                      "/api/gear",
                      {
                        action: modal.item.archived ? "unarchive" : "archive",
                        id: modal.item.id,
                        version: modal.item.version,
                      },
                      "Gear updated.",
                    )
                  }
                >
                  Confirm
                </button>
              </>
            )}
            {modal.type === "editbooking" && (
              <>
                <h2 id="member-modal-title">Edit {modal.booking.reference}</h2>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    mutate(
                      "/api/gear/bookings",
                      {
                        action: "edit",
                        id: modal.booking.id,
                        version: modal.booking.version,
                        ...modal.form,
                        userId: modal.userId,
                      },
                      "Booking updated.",
                    );
                  }}
                >
                  <ScheduleFields
                    value={modal.form}
                    onChange={(patch) =>
                      setModal((m: any) => ({
                        ...m,
                        form: { ...m.form, ...patch },
                      }))
                    }
                  />
                  {borrowerSelect(modal.userId, (id) =>
                    setModal((m: any) => ({ ...m, userId: id })),
                  )}
                  <p className="member-subtle">
                    Collected and returned items stay attached to this booking.
                    Schedule changes must preserve the collection time and avoid
                    other reservations.
                  </p>
                  <fieldset className="gear-select-list">
                    <legend>Booking items</legend>
                    {data?.gear
                      .filter(
                        (g) => !g.archived || modal.form.gearIds.includes(g.id),
                      )
                      .map((g) => (
                        <label key={g.id}>
                          <input
                            type="checkbox"
                            checked={modal.form.gearIds.includes(g.id)}
                            disabled={modal.booking.items.some(
                              (i: ReservationItem) =>
                                i.gear_id === g.id &&
                                (i.status === "checked_out" ||
                                  i.status === "returned"),
                            )}
                            onChange={(e) =>
                              setModal((m: any) => ({
                                ...m,
                                form: {
                                  ...m.form,
                                  gearIds: e.target.checked
                                    ? [...m.form.gearIds, g.id]
                                    : m.form.gearIds.filter(
                                        (id: string) => id !== g.id,
                                      ),
                                },
                              }))
                            }
                          />
                          {g.name}
                          <code>{g.code}</code>
                        </label>
                      ))}
                  </fieldset>
                  <button
                    className="primary"
                    disabled={busy || !modal.form.gearIds.length}
                  >
                    Save changes
                  </button>
                </form>
              </>
            )}
            {modal.type === "rotate" && (
              <>
                <h2 id="member-modal-title">Rotate the invitation code?</h2>
                <p>
                  The old code will stop working. Already approved members keep
                  their access.
                </p>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={async () => {
                    const result = await mutate(
                      "/api/members/invitation",
                      { action: "rotate" },
                      "Invitation code rotated.",
                    );
                    if (result) setCode(result.code);
                  }}
                >
                  Rotate code
                </button>
              </>
            )}
            {modal.type === "access" && (
              <>
                <h2 id="member-modal-title">
                  {modal.action === "revoke" ? "Revoke" : "Restore"} member
                  access?
                </h2>
                <p>
                  {modal.member.name} · {modal.member.email}
                </p>
                <p>
                  {modal.action === "revoke"
                    ? "This member will lose access immediately. Their bookings remain available for administrators to manage."
                    : "This member will be able to use the workspace immediately."}
                </p>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() =>
                    mutate(
                      "/api/members/access",
                      { action: modal.action, userId: modal.member.id },
                      "Member access updated.",
                    )
                  }
                >
                  Confirm
                </button>
              </>
            )}
            {modal.type === "labels" && (
              <>
                <h2 id="member-modal-title" className="print-help">
                  Gear labels
                </h2>
                <GearLabels items={modal.items} />
              </>
            )}
            {error && (
              <p className="member-error" role="alert">
                {error}
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
