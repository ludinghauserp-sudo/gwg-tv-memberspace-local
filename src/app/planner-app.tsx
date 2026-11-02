"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  ConnectionLineType,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  SelectionMode,
  useReactFlow,
  type NodeChange,
  type EdgeChange,
  type Connection,
  type Node as FlowNode,
  type Edge as FlowEdge,
} from "@xyflow/react";
import {
  Plus,
  ArrowLeft,
  Share2,
  Undo2,
  Redo2,
  Package,
  Settings2,
  Download,
  Search,
  X,
  MousePointer2,
  Copy,
  Archive,
  Check,
  Clapperboard,
  ZoomIn,
  ZoomOut,
  Maximize,
  Lock,
  Trash2,
  ChevronDown,
} from "lucide-react";
import {
  emptyPlan,
  makeNode,
  changes,
  applyOperations,
  canonical,
  packRows,
  cableColors,
  cableTypes,
  type PlanDocument,
  type PlanNode,
  type PlanEdge,
} from "../lib/planner-core";
import {
  PlannerNode,
  CableEdge,
  PlannerActions,
  drawings,
} from "./planner-elements";
import {gearPresets,presetPorts} from "../lib/planner-presets";
import type { InventoryPortProfile } from "../lib/inventory-port-profiles";
import { isCamera, videoPort, visiblePorts } from "../lib/planner-view";
import type { GearItem } from "../lib/gear-core";
import "@xyflow/react/dist/style.css";
import "./planner.css";
type PlanInfo = {
  id: string;
  title: string;
  ownerId: string;
  ownerName: string;
  archived: boolean;
  canEdit: boolean;
  canManage: boolean;
  revision: number;
  document: PlanDocument;
};
type Person = { id: string; name: string };
const nodeTypes = { planner: PlannerNode },
  edgeTypes = { cable: CableEdge };
async function request(path: string, body?: unknown) {
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
    const error = new Error(
      result.error || "Could not complete this request.",
    ) as Error & { status: number };
    error.status = response.status;
    throw error;
  }
  return result;
}
const post = (body: unknown) => request("/api/plans", body);
function Dialog({
  title,
  children,
  close,
  wide = false,
}: {
  title: string;
  children: React.ReactNode;
  close: () => void;
  wide?: boolean;
}) {
  const element = useRef<HTMLElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement,
      previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const nodes = () =>
      Array.from(
        element.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input:not(:disabled),textarea,select,a[href]",
        ) || [],
      );
    nodes()[0]?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
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
    };
    document.addEventListener("keydown", handler, true);
    return () => {
      document.removeEventListener("keydown", handler, true);
      document.body.style.overflow = previous;
      before?.focus();
    };
  }, []);
  return (
    <div className="planner-dialog-backdrop" onClick={close}>
      <section
        ref={element}
        className={"planner-dialog " + (wide ? "wide" : "")}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <h2>{title}</h2>
          <button aria-label="Close dialog" onClick={close}>
            <X size={20} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
const basicPresets = [
  {
    name: "Camera",
    inputs: [["Mic", "XLR"]],
    outputs: [
      ["HDMI", "HDMI"],
      ["SDI", "SDI"],
    ],
  },
  {
    name: "Video switcher",
    inputs: [
      ["HDMI 1", "HDMI"],
      ["HDMI 2", "HDMI"],
      ["HDMI 3", "HDMI"],
      ["HDMI 4", "HDMI"],
      ["Mic", "XLR"],
    ],
    outputs: [
      ["Program", "HDMI"],
      ["Stream", "USB"],
    ],
  },
  {
    name: "Monitor",
    inputs: [
      ["HDMI", "HDMI"],
      ["SDI", "SDI"],
    ],
    outputs: [],
  },
  { name: "Microphone", inputs: [], outputs: [["Audio", "XLR"]] },
  {
    name: "Laptop",
    inputs: [["USB", "USB"]],
    outputs: [
      ["HDMI", "HDMI"],
      ["Network", "Ethernet"],
    ],
  },
  {
    name: "Audio mixer",
    inputs: [
      ["Mic 1", "XLR"],
      ["Mic 2", "XLR"],
      ["Mic 3", "XLR"],
      ["Mic 4", "XLR"],
    ],
    outputs: [
      ["Left", "XLR"],
      ["Right", "XLR"],
    ],
  },
  {
    name: "Network switch",
    inputs: [["Uplink", "Ethernet"]],
    outputs: [
      ["Port 1", "Ethernet"],
      ["Port 2", "Ethernet"],
      ["Port 3", "Ethernet"],
    ],
  },
  {
    name: "Power distribution",
    inputs: [["Mains", "Power"]],
    outputs: [
      ["Outlet 1", "Power"],
      ["Outlet 2", "Power"],
      ["Outlet 3", "Power"],
    ],
  },
];
const presets=[...basicPresets,...gearPresets];
function presetData(p: (typeof presets)[number]): Partial<PlanNode["data"]> {
  return {
    name: p.name,
    inputs: p.inputs.map(([name, type], i) => ({
      id: "in-" + i,
      name,
      type: type as any,
    })),
    outputs: p.outputs.map(([name, type], i) => ({
      id: "out-" + i,
      name,
      type: type as any,
    })),
  };
}
function PortEditor({
  ports,
  onChange,
  label,
}: {
  ports: PlanNode["data"]["inputs"];
  onChange: (ports: PlanNode["data"]["inputs"]) => void;
  label: string;
}) {
  return (
    <fieldset className="planner-ports-editor">
      <legend>{label}</legend>
      {ports.map((port, i) => (
        <div className="planner-port-edit" key={port.id}>
          <input
            aria-label={label + " name " + (i + 1)}
            value={port.name}
            maxLength={80}
            onChange={(e) =>
              onChange(
                ports.map((p, j) =>
                  j === i ? { ...p, name: e.target.value } : p,
                ),
              )
            }
          />
          <select
            aria-label={label + " type " + (i + 1)}
            value={port.type}
            onChange={(e) =>
              onChange(
                ports.map((p, j) =>
                  j === i ? { ...p, type: e.target.value as any } : p,
                ),
              )
            }
          >
            {cableTypes.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <button
            type="button"
            aria-label={"Remove " + label + " " + (i + 1)}
            onClick={() => onChange(ports.filter((_, j) => j !== i))}
          >
            <X size={13} />
          </button>
        </div>
      ))}
      <button
        className="planner-small-button"
        type="button"
        disabled={ports.length >= 32}
        onClick={() =>
          onChange([
            ...ports,
            {
              id: crypto.randomUUID(),
              name: label + " " + (ports.length + 1),
              type: "Other",
            },
          ])
        }
      >
        + Add {label.toLowerCase()}
      </button>
    </fieldset>
  );
}
function GearBuilder({
  initial,
  onSave,
  onSaveDefault,
}: {
  onSaveDefault?: (data:PlanNode["data"])=>void;
  initial?: PlanNode;
  onSave: (data: PlanNode["data"]) => void;
}) {
  const [data, setData] = useState(initial?.data || makeNode("gear").data);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(data);
      }}
    >
      <label>Load ready-made ports<select defaultValue="" onChange={e=>{const p=presets.find(p=>p.name===e.target.value);if(p)setData({...data,...presetPorts(p)})}}><option value="">Choose equipment type…</option>{presets.map(p=><option key={p.name}>{p.name}</option>)}</select></label><small>Generic configurations: check connectors against your actual model.</small>
      <label>
        Name
        <input
          required
          value={data.name}
          maxLength={140}
          onChange={(e) => setData({ ...data, name: e.target.value })}
        />
      </label>
      <div className="planner-form-two">
        <label>
          Manufacturer
          <input
            value={data.manufacturer}
            maxLength={140}
            onChange={(e) => setData({ ...data, manufacturer: e.target.value })}
          />
        </label>
        <label>
          Color
          <input
            type="color"
            value={data.color}
            onChange={(e) => setData({ ...data, color: e.target.value })}
          />
        </label>
      </div>
      <label>
        Label
        <input
          value={data.label}
          maxLength={2000}
          onChange={(e) => setData({ ...data, label: e.target.value })}
        />
      </label>
      <label>
        Picture link (optional)
        <input
          type="url"
          placeholder="https://…"
          value={data.picture}
          onChange={(e) => setData({ ...data, picture: e.target.value })}
        />
      </label>
      <PortEditor
        ports={data.inputs}
        label="Input"
        onChange={(inputs) => setData({ ...data, inputs })}
      />
      <PortEditor
        ports={data.outputs}
        label="Output"
        onChange={(outputs) => setData({ ...data, outputs })}
      />
      {onSaveDefault&&initial?.data.gearId&&<button type="button" className="planner-small-button" onClick={()=>onSaveDefault(data)}>Save these ports as inventory default</button>}
      <button className="planner-primary">
        {initial ? "Save gear changes" : "Add gear to plan"}
      </button>
    </form>
  );
}
function download(value: string | Blob, name: string) {
  const url = typeof value === "string" ? value : URL.createObjectURL(value);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  if (typeof value !== "string")
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function csv(rows: unknown[][]) {
  return rows
    .map((row) =>
      row
        .map(
          (value) =>
            '"' +
            String(value ?? "")
              .replace(/^[=+@\-\t\r]/, "'$&")
              .replaceAll('"', '""') +
            '"',
        )
        .join(","),
    )
    .join("\r\n");
}
export default function PlannerApp(props: {
  userId: string;
  displayName: string;
  admin: boolean;
  initialPlanId?: string;
}) {
  return (
    <ReactFlowProvider>
      <PlannerWorkspace {...props} />
    </ReactFlowProvider>
  );
}
function PlannerWorkspace({
  userId,
  displayName,
  admin,
  initialPlanId,
}: {
  userId: string;
  displayName: string;
  admin: boolean;
  initialPlanId?: string;
}) {
  const flow = useReactFlow();
  const [planId, setPlanId] = useState(initialPlanId || ""),
    [plan, setPlan] = useState<PlanInfo | null>(null),
    [plans, setPlans] = useState<any[]>([]),
    [doc, setDoc] = useState<PlanDocument>(emptyPlan),
    [gear, setGear] = useState<GearItem[]>([]),
    [profiles,setProfiles]=useState<Record<string,Partial<PlanNode["data"]> & Partial<InventoryPortProfile>>>({}),
    [people, setPeople] = useState<Person[]>([]),
    [shares, setShares] = useState<any[]>([]),
    [presence, setPresence] = useState<any[]>([]),
    [title, setTitle] = useState(""),
    [selected, setSelected] = useState<string[]>([]),
    [selectedEdges, setSelectedEdges] = useState<string[]>([]),
    [modal, setModal] = useState(""),
    [search, setSearch] = useState(""),
    [tab, setTab] = useState("active"),
    [allAdmin, setAllAdmin] = useState(false),
    [status, setStatus] = useState("Saved"),
    [error, setError] = useState(""),
    [conflict, setConflict] = useState(false),
    [menu, setMenu] = useState(""),
    [wireless, setWireless] = useState(false),
    [connectionHint, setConnectionHint] = useState(""),
    [drawingTools, setDrawingTools] = useState(false),
    [marquee, setMarquee] = useState(false),
    [zoom, setZoom] = useState(1),
    [pulse, setPulse] = useState(0),
    [context, setContext] = useState<{
      x: number;
      y: number;
      nodeId?: string;
      edgeId?: string;
    } | null>(null),
    [busy, setBusy] = useState(false);
  const documentRef = useRef(doc),
    base = useRef(doc),
    idRef = useRef(planId),
    planRef = useRef(plan),
    saving = useRef(false),
    dragging = useRef(false),
    dragBefore = useRef<PlanDocument | null>(null),
    undo = useRef<{ before: PlanDocument; after: PlanDocument }[]>([]),
    redo = useRef<{ before: PlanDocument; after: PlanDocument }[]>([]),
    clipboard = useRef<{ nodes: PlanNode[]; edges: PlanEdge[] } | null>(null),
    blocked = useRef(false),
    titleFocused = useRef(false),
    wrapper = useRef<HTMLDivElement>(null),
    connectStart = useRef<any>(null),
    connectedAt = useRef(0),
    clickPort = useRef<{ nodeId: string; handleId: string; input: boolean } | null>(null),
    selectedRef = useRef(selected),
    edgeSelectionRef = useRef(selectedEdges),
    saveRef = useRef<(force?: boolean) => Promise<void>>(async () => {});
  idRef.current = planId;
  planRef.current = plan;
  selectedRef.current = selected;
  edgeSelectionRef.current = selectedEdges;
  useEffect(() => {
    if (modal === "gear" || modal === "share") setSearch("");
  }, [modal]);
  function showError(e: unknown) {
    setError((e as Error).message || String(e));
  }
  function install(document: PlanDocument) {
    documentRef.current = document;
    setDoc(document);
  }
  function edit(mutator: (d: PlanDocument) => void, record = true) {
    if (!planRef.current?.canEdit) return;
    const before = documentRef.current,
      next = structuredClone(before);
    mutator(next);
    if (canonical(next) === canonical(before)) return;
    if (record) {
      undo.current = [...undo.current.slice(-39), { before, after: next }];
      redo.current = [];
    }
    install(next);
    setStatus("Unsaved changes");
  }
  function begin() {
    if (!dragging.current) {
      dragBefore.current = documentRef.current;
      dragging.current = true;
    }
  }
  function end() {
    if (
      dragBefore.current &&
      canonical(dragBefore.current) !== canonical(documentRef.current)
    ) {
      undo.current = [
        ...undo.current.slice(-39),
        { before: dragBefore.current, after: documentRef.current },
      ];
      redo.current = [];
    }
    dragBefore.current = null;
    dragging.current = false;
    setPulse((v) => v + 1);
  }
  async function syncInventoryProfiles() {
    setBusy(true);
    try {
      await saveRef.current();
      if (saving.current || changes(base.current, documentRef.current).length)
        throw new Error("Finish saving your plan before applying inventory ports.");
      const result = await post({action:"syncInventoryProfiles"});
      const fresh = await request("/api/plans?profiles=1");
      setProfiles(fresh.profiles);
      if (idRef.current) await open(idRef.current);
      setStatus(`Saved ports for ${result.saved} inventory items; updated ${result.updatedNodes} existing gear boxes.`);
    } catch(e) { showError(e); } finally { setBusy(false); }
  }
  async function list() {
    try {
      const result = await request("/api/plans");
      setPlans(result.plans);
    } catch (e) {
      showError(e);
    }
  }
  async function open(id: string) {
    if (saving.current || changes(base.current, documentRef.current).length) {
      await saveRef.current();
      if (
        blocked.current ||
        changes(base.current, documentRef.current).length
      ) {
        setError(
          "Save or resolve your current changes before opening another plan.",
        );
        return;
      }
    }
    idRef.current = id;
    setPlanId(id);
    setContext(null);
    setPlan(null);
    setError("");
    setModal("");
    undo.current = [];
    redo.current = [];
    setSelected([]);
    setSelectedEdges([]);
    history.pushState(null, "", id ? "/members/plans/" + id : "/members/plans");
    if (!id) {
      await list();
      return;
    }
    try {
      const result = await request("/api/plans?id=" + encodeURIComponent(id));
      if (idRef.current !== id) return;
      setPlan(result.plan);
      planRef.current = result.plan;
      setTitle(result.plan.title);
      base.current = result.plan.document;
      install(result.plan.document);
      setShares(result.collaborators);
      setPresence(result.presence);
      blocked.current = false;
      setConflict(false);
      setStatus("Saved");
      setTimeout(
        () => flow.fitView({ padding: 0.2, duration: 200, maxZoom: 1 }),
        120,
      );
    } catch (e) {
      showError(e);
    }
  }
  async function save(force = false) {
    if (
      saving.current ||
      !planRef.current?.canEdit ||
      dragging.current ||
      (!force && blocked.current)
    )
      return;
    let succeeded = false;
    const snapshot = documentRef.current,
      operations = changes(base.current, snapshot),
      id = idRef.current;
    if (!operations.length) {
      setStatus("Saved");
      return;
    }
    saving.current = true;
    setStatus("Saving…");
    try {
      const result = await post({ action: "save", id, operations, force });
      if (id !== idRef.current) return;
      succeeded = true;
      const late = changes(snapshot, documentRef.current);
      base.current = result.document;
      install(
        late.length
          ? applyOperations(result.document, late, true)
          : result.document,
      );
      setStatus(late.length ? "Unsaved changes" : "Saved");
      blocked.current = false;
      setConflict(false);
      setError("");
      setPlan((p) => (p ? { ...p, revision: result.revision } : p));
    } catch (e) {
      setStatus("Not saved");
      showError(e);
      if ((e as any).status === 409) {
        blocked.current = true;
        setConflict(true);
      }
      if ([401, 403, 404].includes((e as any).status)) {
        blocked.current = true;
        setPlan((p) => (p ? { ...p, canEdit: false } : p));
      }
    } finally {
      saving.current = false;
      if (succeeded) setPulse((v) => v + 1);
    }
  }
  saveRef.current = save;
  useEffect(() => {
    request("/api/plans?profiles=1").then(r=>setProfiles(r.profiles)).catch(showError);
    request("/api/gear")
      .then((r) => setGear(r.gear.filter((g: GearItem) => !g.archived)))
      .catch(showError);
    request("/api/plans?directory=1")
      .then((r) => setPeople(r.members))
      .catch(showError);
    if (initialPlanId) open(initialPlanId);
    else list();
    const before = (e: BeforeUnloadEvent) => {
      if (changes(base.current, documentRef.current).length) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    const pop = () => {
      const match = location.pathname.match(/^\/members\/plans\/([^/]+)$/);
      if (changes(base.current, documentRef.current).length) {
        history.pushState(
          null,
          "",
          idRef.current ? "/members/plans/" + idRef.current : "/members/plans",
        );
        setError("Save your changes before leaving this plan.");
        return;
      }
      open(match?.[1] || "");
    };
    window.addEventListener("popstate", pop);
    return () => {
      window.removeEventListener("beforeunload", before);
      window.removeEventListener("popstate", pop);
    };
  }, []);
  useEffect(() => {
    if (!planId) return;
    const interval = setInterval(async () => {
      if (document.hidden || dragging.current || saving.current) return;
      try {
        const result = await request(
          "/api/plans?id=" + encodeURIComponent(planId),
        );
        if (idRef.current !== planId) return;
        setShares(result.collaborators);
        setPresence(result.presence);
        setPlan(result.plan);
        planRef.current = result.plan;
        if (!titleFocused.current) setTitle(result.plan.title);
        if (
          !changes(base.current, documentRef.current).length &&
          !blocked.current
        ) {
          base.current = result.plan.document;
          install(result.plan.document);
          setStatus("Saved");
        }
      } catch (e) {
        showError(e);
        if ([401, 403, 404].includes((e as any).status)) {
          blocked.current = true;
          setPlan((p) => (p ? { ...p, canEdit: false } : p));
        }
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [planId]);
  useEffect(() => {
    if (!plan || !changes(base.current, doc).length || blocked.current) return;
    const timer = setTimeout(() => saveRef.current(), 900);
    return () => clearTimeout(timer);
  }, [doc, pulse, plan?.id]);
  function point() {
    const rect = wrapper.current?.getBoundingClientRect();
    return flow.screenToFlowPosition({
      x: (rect?.left || 0) + (rect?.width || 800) * 0.5,
      y: (rect?.top || 0) + (rect?.height || 600) * 0.5,
    });
  }
  function add(
    kind: PlanNode["data"]["kind"],
    patch: Partial<PlanNode["data"]> = {},
  ) {
    const center = point();
    const node = makeNode(kind, center, patch);
    node.position = {x:center.x-node.width/2,y:center.y-node.height/2};
    edit((d) => {
      d.nodes.push(node);
    });
    setSelected([node.id]);
    setSelectedEdges([]);
    setMenu("");
    setContext(null);
    return node;
  }
  function changeNode(
    id: string,
    patch: Partial<PlanNode["data"]>,
    record = true,
  ) {
    edit((d) => {
      const node = d.nodes.find((n) => n.id === id);
      if (!node) return;
      node.data = { ...node.data, ...patch };
      d.edges = d.edges.filter((e) => {
        const source = d.nodes.find((n) => n.id === e.source),
          target = d.nodes.find((n) => n.id === e.target),
          out = source?.data.outputs.find((p) => p.id === e.sourceHandle),
          input = target?.data.inputs.find((p) => p.id === e.targetHandle);
        return (
          !!out &&
          !!input &&
          (d.settings.allowMismatch ||
            out.type === input.type ||
            out.type === "Other" ||
            input.type === "Other")
        );
      });
    }, record);
  }
  function changeEdge(
    id: string,
    patch: Partial<PlanEdge["data"]>,
    record = true,
  ) {
    edit((d) => {
      const edge = d.edges.find((e) => e.id === id);
      if (edge) edge.data = { ...edge.data, ...patch };
    }, record);
  }
  function remove() {
    edit((d) => {
      const ids = new Set(selectedRef.current);
      d.nodes = d.nodes.filter((n) => !ids.has(n.id));
      d.edges = d.edges.filter(
        (e) =>
          !edgeSelectionRef.current.includes(e.id) &&
          !ids.has(e.source) &&
          !ids.has(e.target),
      );
    });
    setSelected([]);
    setSelectedEdges([]);
    setContext(null);
  }
  function copy() {
    const ids = new Set(selectedRef.current);
    clipboard.current = {
      nodes: documentRef.current.nodes.filter((n) => ids.has(n.id)),
      edges: documentRef.current.edges.filter(
        (e) => ids.has(e.source) && ids.has(e.target),
      ),
    };
  }
  function paste() {
    const stored = clipboard.current;
    if (!stored?.nodes.length) return;
    const ids = new Map(stored.nodes.map((n) => [n.id, crypto.randomUUID()]));
    const nodes = stored.nodes.map((n) => ({
      ...structuredClone(n),
      id: ids.get(n.id)!,
      position: { x: n.position.x + 40, y: n.position.y + 40 },
    }));
    edit((d) => {
      d.nodes.push(...nodes);
      d.edges.push(
        ...stored.edges.map((e) => ({
          ...structuredClone(e),
          id: crypto.randomUUID(),
          source: ids.get(e.source)!,
          target: ids.get(e.target)!,
        })),
      );
    });
    clipboard.current = {
      nodes,
      edges: stored.edges.map((e) => ({
        ...e,
        source: ids.get(e.source)!,
        target: ids.get(e.target)!,
      })),
    };
    setSelected(nodes.map((n) => n.id));
    setSelectedEdges([]);
  }
  function historyStep(forward = false) {
    if (!planRef.current?.canEdit) return;
    const from = forward ? redo : undo,
      to = forward ? undo : redo;
    const next = from.current.pop();
    if (!next) return;
    try {
      const operations = changes(
        forward ? next.before : next.after,
        forward ? next.after : next.before,
      );
      install(applyOperations(documentRef.current, operations));
      to.current.push(next);
      setStatus("Unsaved changes");
    } catch {
      from.current.push(next);
      setError(
        "That item has changed since your action. Undo was stopped to preserve your collaborator’s changes.",
      );
    }
  }
  function setSetting(key: string, value: unknown) {
    edit((d) => {
      (d.settings as any)[key] = value;
    });
  }
  function fit() {
    const ids = selectedRef.current;
    flow.fitView({
      padding: 0.2,
      duration: 200,
      nodes: (ids.length
        ? ids
        : documentRef.current.nodes.map((n) => n.id)
      ).map((id) => ({ id })),
    });
  }
  function onNodesChange(events: NodeChange[]) {
    const selections = events.filter((e) => e.type === "select") as any[];
    if (selections.length)
      setSelected((old) => {
        const set = new Set(old);
        for (const s of selections)
          s.selected ? set.add(s.id) : set.delete(s.id);
        return [...set];
      });
    const actual = events.filter((e) =>
      ["position", "dimensions", "remove"].includes(e.type),
    );
    if (!actual.length) return;
    edit((d) => {
      for (const event of actual) {
        if (!("id" in event)) continue;
        const n = d.nodes.find((n) => n.id === event.id);
        if (!n) continue;
        if (event.type === "position" && event.position && !n.data.locked)
          n.position = event.position;
        if (event.type === "dimensions" && event.dimensions && !n.data.locked) {
          n.width = Math.max(30, event.dimensions.width);
          n.height = Math.max(20, event.dimensions.height);
        }
        if (event.type === "remove") {
          d.nodes = d.nodes.filter((n) => n.id !== event.id);
          d.edges = d.edges.filter(
            (e) => e.source !== event.id && e.target !== event.id,
          );
        }
      }
    }, false);
  }
  function onEdgesChange(events: EdgeChange[]) {
    const selections = events.filter((e) => e.type === "select") as any[];
    if (selections.length)
      setSelectedEdges((old) => {
        const set = new Set(old);
        for (const s of selections)
          s.selected ? set.add(s.id) : set.delete(s.id);
        return [...set];
      });
    if (events.some((e) => e.type === "remove"))
      edit((d) => {
        d.edges = d.edges.filter(
          (e) =>
            !events.some(
              (change) => change.type === "remove" && change.id === e.id,
            ),
        );
      });
  }
  function portClick(nodeId: string, handleId: string, input: boolean) {
    if (!planRef.current?.canEdit || Date.now()-connectedAt.current<250) return;
    const previous = clickPort.current;
    if (previous && previous.input !== input) {
      const from = input ? previous : {nodeId,handleId};
      const to = input ? {nodeId,handleId} : previous;
      connect({source:from.nodeId,sourceHandle:from.handleId,target:to.nodeId,targetHandle:to.handleId});
    } else {
      clickPort.current = {nodeId,handleId,input};
      setConnectionHint((input ? "Input selected. Click an output" : "Output selected. Click an input") + " on the canvas or side panel. Esc cancels.");
    }
  }
  function connect(connection: Connection) {
    connectedAt.current = Date.now();
    clickPort.current = null;
    setConnectionHint("");
    const current = documentRef.current,
      source = current.nodes.find((n) => n.id === connection.source),
      target = current.nodes.find((n) => n.id === connection.target),
      out = source?.data.outputs.find((p) => p.id === connection.sourceHandle),
      input = target?.data.inputs.find((p) => p.id === connection.targetHandle);
    if (!out || !input) return;
    if (
      current.edges.some(
        (e) =>
          e.source === connection.source &&
          e.target === connection.target &&
          e.sourceHandle === connection.sourceHandle &&
          e.targetHandle === connection.targetHandle,
      )
    )
      return;
    if (
      !current.settings.allowMismatch &&
      out.type !== input.type &&
      out.type !== "Other" &&
      input.type !== "Other"
    ) {
      setError(
        "The input and output types do not match. Use an adapter or enable Override connection warnings.",
      );
      return;
    }
    const wirelessLink = wireless || /wireless|radio|\bRF\b/i.test(out.name+" "+input.name);
    const type = out.type === "Other" ? input.type : out.type;
    const edge: PlanEdge = {
      id: crypto.randomUUID(),
      source: connection.source,
      target: connection.target,
      sourceHandle: connection.sourceHandle!,
      targetHandle: connection.targetHandle!,
      type: "cable",
      data: {
        type,
        wireless: wirelessLink,
        label: "",
        length: "",
        color: wirelessLink ? "#8051bd" : cableColors[type] || "#748492",
        hidden: false,
        showLabel: true,
        pins: [],
      },
    };
    edit((d) => {
      d.edges.push(edge);
    });
    setSelectedEdges([edge.id]);
    setSelected([]);
  }
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (!idRef.current || !planRef.current) return;
      if (
        (e.target as HTMLElement)?.closest(
          "input,textarea,select,[contenteditable=true]",
        ) ||
        modal
      )
        return;
      const key = e.key.toLowerCase(),
        command = e.ctrlKey || e.metaKey;
      if (command && key === "s") {
        e.preventDefault();
        saveRef.current();
        return;
      }
      if (command && key === "z") {
        e.preventDefault();
        historyStep(e.shiftKey);
        return;
      }
      if (command && key === "a") {
        e.preventDefault();
        setSelected(documentRef.current.nodes.map((n) => n.id));
        return;
      }
      if (command && key === "c") {
        e.preventDefault();
        copy();
        return;
      }
      if (command && key === "v") {
        e.preventDefault();
        paste();
        return;
      }
      if (command && key === "d") {
        e.preventDefault();
        copy();
        paste();
        return;
      }
      if (e.ctrlKey && key === "p") {
        e.preventDefault();
        setModal("patches");
        return;
      }
      if (e.ctrlKey && key === "o") {
        e.preventDefault();
        setSetting(
          "orientation",
          documentRef.current.settings.orientation === "TB" ? "LR" : "TB",
        );
        return;
      }
      if (e.ctrlKey && key === "l") {
        e.preventDefault();
        setSetting("legend", !documentRef.current.settings.legend);
        return;
      }
      if (command && key === "0") {
        e.preventDefault();
        flow.zoomTo(1);
        return;
      }
      if (command && (key === "+" || key === "=")) {
        e.preventDefault();
        flow.zoomIn();
        return;
      }
      if (command && key === "-") {
        e.preventDefault();
        flow.zoomOut();
        return;
      }
      if (command) return;
      if (e.shiftKey && key === "d") {
        e.preventDefault();
        setDrawingTools((v) => !v);
        return;
      }
      if (key === "escape") {
        setMenu("");
        clickPort.current = null;
        setConnectionHint("");
        setContext(null);
        setSelected([]);
        setSelectedEdges([]);
      } else if (key === "g") setModal("gear");
      else if (key === "b") setModal("builder");
      else if (key === "s") setModal("draw");
      else if (key === "z") add("zone");
      else if (key === "t") add("text");
      else if (key === "p") setModal("pack");
      else if (key === "m") setMarquee((v) => !v);
      else if (key === "f") fit();
      else if (key === "i") flow.zoomIn();
      else if (key === "o") flow.zoomOut();
      else if (
        key === "delete" ||
        key === "backspace" ||
        (key === "d" && edgeSelectionRef.current.length)
      ) {
        e.preventDefault();
        remove();
      } else if (
        (key === "l" || key === "h") &&
        edgeSelectionRef.current.length
      ) {
        const edge = documentRef.current.edges.find(
          (e) => e.id === edgeSelectionRef.current[0],
        );
        if (edge)
          changeEdge(
            edge.id,
            key === "l"
              ? { showLabel: !edge.data.showLabel }
              : { hidden: !edge.data.hidden },
          );
      } else if (key === "j" && edgeSelectionRef.current.length) {
        const edge = documentRef.current.edges.find(
          (e) => e.id === edgeSelectionRef.current[0],
        );
        if (edge)
          flow.fitView({
            nodes: [{ id: edge.source }, { id: edge.target }],
            padding: 0.2,
            duration: 200,
          });
      } else if (key.startsWith("arrow")) {
        e.preventDefault();
        const v = flow.getViewport(),
          n = e.shiftKey ? 100 : 50;
        flow.setViewport({
          ...v,
          x: v.x + (key === "arrowleft" ? n : key === "arrowright" ? -n : 0),
          y: v.y + (key === "arrowup" ? n : key === "arrowdown" ? -n : 0),
        });
      }
    }
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [modal, plan?.id]);
  async function create(name: string) {
    setBusy(true);
    try {
      const result = await post({ action: "create", title: name });
      await open(result.id);
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  }
  async function manage(action: string, id = planId) {
    setBusy(true);
    try {
      const result = await post({ action, id });
      setModal("");
      if (action === "duplicate") await open(result.id);
      else {
        base.current = documentRef.current;
        blocked.current = false;
        await open("");
      }
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  }
  async function rename() {
    titleFocused.current = false;
    if (!plan || title === plan.title) return;
    try {
      await post({ action: "rename", id: plan.id, title });
      setPlan({ ...plan, title });
    } catch (e) {
      showError(e);
      setTitle(plan.title);
    }
  }
  async function setShare(personId: string, role: string) {
    setBusy(true);
    try {
      await post({ action: "share", id: planId, userId: personId, role });
      const result = await request("/api/plans?id=" + planId);
      setShares(result.collaborators);
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  }
  const focusNode = doc.nodes.find((n) => selected.includes(n.id)),
    focusEdge = doc.edges.find((e) => selectedEdges.includes(e.id)),
    editable = !!plan?.canEdit;
  const rows = packRows(doc);
  const patchRows = doc.edges.map((e) => ({
    edge: e,
    from: doc.nodes.find((n) => n.id === e.source),
    to: doc.nodes.find((n) => n.id === e.target),
  }));
  function patchCsv() {
    download(
      new Blob(
        [
          csv([
            [
              "Source",
              "Output",
              "Destination",
              "Input",
              "Cable",
              "ID",
              "Length",
            ],
            ...patchRows.map(({ edge, from, to }) => [
              from?.data.name,
              from?.data.outputs.find((p) => p.id === edge.sourceHandle)?.name,
              to?.data.name,
              to?.data.inputs.find((p) => p.id === edge.targetHandle)?.name,
              (edge.data.wireless?'Wireless / ':'Wired / ')+edge.data.type,
              edge.data.label,
              edge.data.length,
            ]),
          ]),
        ],
        { type: "text/csv;charset=utf-8" },
      ),
      (plan?.title || "plan") + "-patches.csv",
    );
  }
  function packCsv() {
    download(
      new Blob(
        [
          csv([
            ["Item", "Asset code", "Quantity", "Type", "Length", "Packed"],
            ...rows.map((r) => [
              r.name,
              r.code,
              r.quantity,
              r.kind,
              r.length,
              doc.meta.packed[r.key] ? "Yes" : "No",
            ]),
          ]),
        ],
        { type: "text/csv;charset=utf-8" },
      ),
      (plan?.title || "plan") + "-packlist.csv",
    );
  }
  async function partsPdf() {
    setBusy(true);
    try { const {createPlanPdf}=await import('../lib/planner-pdf');createPlanPdf(doc,plan?.title||'Shoot plan').save((plan?.title||'plan')+'-parts.pdf'); }
    catch(e){showError(e)} finally{setBusy(false)}
  }
  async function exportImage(format: string) {
    setBusy(true);
    setError("");
    try {
      const element = wrapper.current?.querySelector(
        ".react-flow__viewport",
      ) as HTMLElement;
      if (!element || !doc.nodes.length)
        throw Error("Add some gear or drawings before exporting.");
      const { toPng } = await import("html-to-image");
      const { getNodesBounds, getViewportForBounds } =
        await import("@xyflow/react");
      const bounds = getNodesBounds(flow.getNodes()),
        width = Math.min(5000, Math.max(1200, bounds.width + 240)),
        height = Math.min(5000, Math.max(800, bounds.height + 260)),
        viewport = getViewportForBounds(bounds, width, height, 0.1, 1.5, 0.12);
      const png = await toPng(element, {
        width,
        height,
        skipFonts: true,
        pixelRatio: 1,
        backgroundColor: doc.settings.dark ? "#14232f" : "#ffffff",
        style: {
          width: width + "px",
          height: height + "px",
          transform: `translate(${viewport.x}px,${viewport.y}px) scale(${viewport.zoom})`,
        },
        imagePlaceholder:
          "data:image/svg+xml;charset=utf-8," +
          encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="60"><rect width="80" height="60" fill="#e8eef2"/></svg>',
          ),
        filter: (node) =>
          !(node instanceof Element) ||
          (!node.classList.contains("react-flow__resize-control") &&
            !node.classList.contains("planner-rotate") &&
            !node.classList.contains("planner-cable-pin")),
      });
      const image = new Image();
      image.src = png;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height + 80 + (doc.settings.legend ? 60 : 0);
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = doc.settings.dark ? "#14232f" : "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = doc.settings.dark ? "#ffffff" : "#093243";
      ctx.font = "bold 24px Arial";
      ctx.fillText(plan!.title, 30, 37);
      ctx.font = "12px Arial";
      ctx.fillText(
        [doc.meta.location, doc.meta.eventDate, "GWG TV"]
          .filter(Boolean)
          .join(" · "),
        30,
        60,
      );
      ctx.drawImage(image, 0, 80);
      if (doc.settings.legend) {
        ctx.font = "12px Arial";
        let x = 30,
          y = height + 105;
        for (const type of [...new Set(doc.edges.map((e) => e.data.type))]) {
          if (x > width - 150) {
            x = 30;
            y += 20;
          }
          ctx.fillStyle = cableColors[type] || "#748492";
          ctx.fillRect(x, y - 8, 20, 3);
          ctx.fillText(type, x + 27, y);
          x += 120;
        }
      }
      const name =
        plan!.title.replace(/[^a-zA-Z0-9_ -]/g, "").slice(0, 80) ||
        "shoot-plan";
      if (format === "pdf") {
        const {createPlanPdf}=await import('../lib/planner-pdf');
        createPlanPdf(doc,plan!.title,{png,width,height}).save(name+'.pdf');
      } else
        download(
          canvas.toDataURL(format === "jpg" ? "image/jpeg" : "image/png", 0.94),
          name + "." + format,
        );
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  }
  const displayPlans = plans.filter((p) => {
    const event = p.event_date || "",
      today = new Date().toLocaleDateString("en-CA", {
        timeZone: "America/Vancouver",
      });
    return (
      ((admin && allAdmin) || p.owner_id === userId || p.share_role) &&
      (tab === "archived" ? !!p.archived : !p.archived) &&
      (tab !== "upcoming" || event >= today) &&
      (tab !== "past" || (!!event && event < today)) &&
      (tab !== "shared" || p.owner_id !== userId) &&
      (p.title + " " + (p.owner_name || ""))
        .toLowerCase()
        .includes(search.toLowerCase())
    );
  });
  return (
    <div
      className={
        "member-shell planner-shell " +
        (doc.settings.dark && plan ? "planner-dark" : "")
      }
    >
      {!planId ? (
        <>
          <header className="planner-home-header">
            <a href="/members">
              <ArrowLeft size={17} />
              Member Space
            </a>
            <span>GWG TV · SHOOT & SETUP PLANS</span>
            <button className="planner-primary" onClick={() => setModal("new")}>
              <Plus size={16} />
              New plan
            </button>
          </header>
          <main className="planner-home">
            <div className="planner-home-heading">
              <span className="member-eyebrow">FROM IDEA TO SHOOT DAY</span>
              <h1>Plan the shoot. Connect the setup.</h1>
              <p>
                Build diagrams with your inventory, custom gear, cables, zones,
                and drawings. Keep your plans and equipment together on this Mac.
              </p>
            </div>
            <div className="planner-home-toolbar">
              <div className="planner-tabs">
                {["active", "upcoming", "past", "archived"].map(
                  (t) => (
                    <button
                      key={t}
                      className={tab === t ? "active" : ""}
                      onClick={() => setTab(t)}
                    >
                      {t}
                    </button>
                  ),
                )}
              </div>
              <label className="planner-search">
                <Search size={16} />
                <input
                  aria-label="Search plans"
                  placeholder="Search plans"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              {admin && (
                <label className="planner-check">
                  <input
                    type="checkbox"
                    checked={allAdmin}
                    onChange={(e) => setAllAdmin(e.target.checked)}
                  />
                  All members’ plans
                </label>
              )}
            </div>
            {error && (
              <div className="planner-error" role="alert">
                {error}
              </div>
            )}
            {displayPlans.length ? (
              <div className="planner-plan-grid">
                {displayPlans.map((p) => (
                  <article className="planner-plan-card" key={p.id}>
                    <button
                      className="planner-plan-open"
                      onClick={() => open(p.id)}
                    >
                      <div className="planner-plan-preview">
                        <Clapperboard size={36} />
                        <span>{p.elements || 0} elements</span>
                      </div>
                      <div>
                        <h2>{p.title}</h2>
                        <p>
                          {p.owner_name || displayName}
                          {p.share_role ? " · Shared with you" : ""}
                        </p>
                        <small>
                          {p.event_date
                            ? "Shoot " + p.event_date
                            : p.rig_date
                              ? "Rig " + p.rig_date
                              : "Dates not set"}
                        </small>
                      </div>
                    </button>
                    <footer>
                      <span>
                        {p.archived
                          ? "Archived"
                          : p.owner_id === userId
                            ? "Your plan"
                            : p.share_role === "viewer"
                              ? "View only"
                              : "Can edit"}
                      </span>
                      <button
                        onClick={() => {
                          setContext({ x: 0, y: 0, nodeId: p.id });
                          setModal("plan-actions");
                        }}
                        aria-label={"Actions for " + p.title}
                      >
                        <Settings2 size={16} />
                      </button>
                    </footer>
                  </article>
                ))}
              </div>
            ) : (
              <div className="planner-home-empty">
                <Clapperboard size={44} />
                <h2>
                  {search
                    ? "No matching plans."
                    : "Your next production starts here."}
                </h2>
                <p>Create a plan, arrange your gear, and invite your crew.</p>
                <button
                  className="planner-primary"
                  onClick={() => setModal("new")}
                >
                  Create a plan
                </button>
              </div>
            )}
          </main>
        </>
      ) : !plan ? (
        <main className="planner-loading">
          <a
            href="/members/plans"
            onClick={(e) => {
              e.preventDefault();
              open("");
            }}
          >
            ← Plans
          </a>
          <h2>{error || "Opening your plan…"}</h2>
        </main>
      ) : (
        <>
          <header className="planner-editor-header">
            <a
              href="/members/plans"
              onClick={(e) => {
                e.preventDefault();
                open("");
              }}
            >
              <ArrowLeft size={16} />
              Plans
            </a>
            <input
              className="planner-title"
              aria-label="Plan name"
              value={title}
              maxLength={140}
              disabled={!editable}
              onFocus={() => {
                titleFocused.current = true;
              }}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={rename}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
            />
            <label className="planner-toggle"><input type="checkbox" role="switch" checked={doc.settings.showPhotos !== false} disabled={!editable} onChange={e=>setSetting('showPhotos',e.target.checked)} />Photos</label>
            <label className="planner-toggle"><input type="checkbox" role="switch" checked={selectedEdges.length ? doc.edges.filter(e=>selectedEdges.includes(e.id)).every(e=>e.data.wireless) : wireless} disabled={!editable} onChange={e=>{setWireless(e.target.checked);if(selectedEdges.length)edit(d=>{for(const edge of d.edges)if(selectedEdges.includes(edge.id)){edge.data.wireless=e.target.checked;edge.data.color=e.target.checked?'#8051bd':(cableColors[edge.data.type]||'#748492')}})}} />{selectedEdges.length?'Selected link: wireless':'New links: wireless'}</label>
            <button
              className="planner-private"
              onClick={() => setModal("share")}
            >
              <Lock size={12} />
              {shares.length ? "Local crew · " + shares.length : "Private"}
            </button>
            <div
              className="planner-presence"
              title="Members with this plan open"
            >
              {presence.slice(0, 5).map((p) => (
                <span key={p.user_id} title={p.name || "Crew member"}>
                  {(p.name || "?").slice(0, 1)}
                </span>
              ))}
            </div>
            <button
              className={"planner-save " + (status === "Saved" ? "saved" : "")}
              onClick={() => save()}
              disabled={!editable || saving.current}
            >
              {status === "Saved" && <Check size={14} />}{" "}
              {plan.archived ? "Archived" : editable ? status : "View only"}
            </button>
          </header>
          <div className="planner-canvas" ref={wrapper}>
            <PlannerActions.Provider
              value={{
                changeNode,
                changeEdge,
                portClick,
                begin,
                end,
                editable,
              }}
            >
              <ReactFlow
                nodes={
                  doc.nodes.map((n) => ({
                    ...n,
                    data: { ...n.data, _orientation: doc.settings.orientation, _showPhotos: doc.settings.showPhotos !== false, _dark: doc.settings.dark,
                      _visibleInputs: visiblePorts(n,'inputs',doc.edges), _visibleOutputs: visiblePorts(n,'outputs',doc.edges),
                      _pending: clickPort.current },
                    // Retain React Flow's handle measurements across controlled updates.
                    // Omitting measured resets every handle when a node moves or saves.
                    measured: { width: n.width, height: n.height },
                    style: { width: n.width, height: n.height },
                    selected: selected.includes(n.id),
                    draggable: editable && !n.data.locked,
                    connectable: editable,
                  })) as FlowNode[]
                }
                edges={
                  doc.edges.map((e) => ({
                    ...e,
                    data: { ...e.data, _routing: doc.settings.routing },
                    selected: selectedEdges.includes(e.id),
                  })) as FlowEdge[]
                }
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={connect}
                connectOnClick={false}
                connectionRadius={36}
                connectionLineType={ConnectionLineType.SmoothStep}
                connectionLineStyle={{stroke:wireless?'#796ac5':'#16749b',strokeWidth:3,strokeDasharray:wireless?'2 7':undefined}}
                onNodeDragStart={begin}
                onNodeDragStop={end}
                onConnectStart={(_e, info) => {
                  connectStart.current = info;
                }}
                onMove={(_e, viewport) => setZoom(viewport.zoom)}
                onNodeClick={(_e, node) => {
                  if (!_e.shiftKey) {
                    setSelected([node.id]);
                    setSelectedEdges([]);
                  }
                  setContext(null);
                }}
                onNodeDoubleClick={(_e, node) => {
                  setSelected([node.id]);
                  if (editable && node.data.kind === "gear")
                    setModal("editgear");
                }}
                onEdgeClick={(_e, edge) => {
                  setSelected([]);
                  setSelectedEdges([edge.id]);
                  setContext(null);
                }}
                onPaneClick={() => {
                  setSelected([]);
                  setSelectedEdges([]);
                  setMenu("");
                  setContext(null);
                }}
                onNodeContextMenu={(e, node) => {
                  e.preventDefault();
                  setSelected([node.id]);
                  setSelectedEdges([]);
                  setContext({ x: e.clientX, y: e.clientY, nodeId: node.id });
                }}
                onEdgeContextMenu={(e, edge) => {
                  e.preventDefault();
                  setSelectedEdges([edge.id]);
                  setSelected([]);
                  setContext({ x: e.clientX, y: e.clientY, edgeId: edge.id });
                }}
                onPaneContextMenu={(e) => {
                  e.preventDefault();
                  setMenu("add");
                }}
                selectionOnDrag={marquee}
                selectionMode={SelectionMode.Partial}
                panOnDrag={marquee ? [1, 2] : [0, 1, 2]}
                panOnScroll
                zoomOnScroll={false}
                zoomOnPinch
                snapToGrid={doc.settings.snap}
                snapGrid={[doc.settings.gridSize, doc.settings.gridSize]}
                minZoom={0.1}
                maxZoom={3}
                deleteKeyCode={null}
                panActivationKeyCode="Space"
                multiSelectionKeyCode="Shift"
                nodesDraggable={editable}
                nodesConnectable={editable}
                fitView
                fitViewOptions={{ maxZoom: 1, padding: 0.2 }}
              >
                {doc.settings.grid && doc.settings.gridStyle !== "none" && (
                  <Background
                    variant={
                      doc.settings.gridStyle === "squares"
                        ? BackgroundVariant.Lines
                        : BackgroundVariant.Dots
                    }
                    color={doc.settings.dark ? "#3c5363" : "#c5d3de"}
                    gap={
                      doc.settings.gridSize === 1 ? 20 : doc.settings.gridSize
                    }
                    size={1}
                  />
                )}
                <MiniMap
                  pannable
                  zoomable
                  nodeColor={(n) => (n.data.color as string) || "#16749b"}
                  position="bottom-left"
                />
              </ReactFlow>
            </PlannerActions.Provider>
            {connectionHint && (
              <div className="planner-connection-hint" role="status">
                {connectionHint}
              </div>
            )}
            {!doc.nodes.length && (
              <div className="planner-canvas-empty">
                <Clapperboard size={40} />
                <h2>Your setup, from every angle.</h2>
                <p>
                  Add gear from inventory or build a custom item.
                  <br />
                  Drag outputs to inputs to connect your setup.
                </p>
                {editable && (
                  <button
                    className="planner-primary"
                    onClick={() => setModal("gear")}
                  >
                    <Plus size={16} />
                    Add gear
                  </button>
                )}
              </div>
            )}
            <div
              className="planner-floating-controls"
              role="toolbar"
              aria-label="Floating controls"
            >
              <div>
                <button
                  aria-label="Zoom out"
                  title="Zoom out (O)"
                  onClick={() => flow.zoomOut()}
                >
                  <ZoomOut size={17} />
                </button>
                <button
                  className="planner-zoom-value"
                  onClick={() => flow.zoomTo(1)}
                  title="Reset zoom"
                >
                  {Math.round(zoom * 100)}%
                </button>
                <button
                  aria-label="Zoom in"
                  title="Zoom in (I)"
                  onClick={() => flow.zoomIn()}
                >
                  <ZoomIn size={17} />
                </button>
                <button
                  aria-label="Zoom to fit"
                  title="Zoom to fit (F)"
                  onClick={fit}
                >
                  <Maximize size={17} />
                </button>
                <button
                  aria-label="Toggle marquee selection"
                  aria-pressed={marquee}
                  title="Marquee selection (M)"
                  onClick={() => setMarquee(!marquee)}
                >
                  <MousePointer2 size={17} />
                </button>
                <button
                  aria-label="Open options"
                  aria-expanded={menu === "options"}
                  onClick={() => setMenu(menu === "options" ? "" : "options")}
                >
                  <Settings2 size={17} />
                </button>
              </div>
              <div>
                <button
                  aria-label="Undo"
                  title="Undo (⌘/Ctrl Z)"
                  disabled={!editable || !undo.current.length}
                  onClick={() => historyStep()}
                >
                  <Undo2 size={17} />
                </button>
                <button
                  aria-label="Redo"
                  title="Redo (⇧ ⌘/Ctrl Z)"
                  disabled={!editable || !redo.current.length}
                  onClick={() => historyStep(true)}
                >
                  <Redo2 size={17} />
                </button>
                <button
                  className="planner-add-button"
                  disabled={!editable}
                  aria-expanded={menu === "add"}
                  onClick={() => setMenu(menu === "add" ? "" : "add")}
                >
                  <Plus size={16} />
                  Add
                  <ChevronDown size={13} />
                </button>
              </div>
            </div>
            {doc.settings.legend && doc.edges.length > 0 && (
              <div className="planner-cable-key">
                <strong>Cable key</strong>
                {[...new Set(doc.edges.map((e) => e.data.type))].map((type) => (
                  <span key={type}>
                    <i style={{ background: cableColors[type] || "#748492" }} />
                    {type}
                  </span>
                ))}
              </div>
            )}
            {menu === "add" && (
              <div className="planner-popover planner-add-menu">
                <button
                  onClick={() => {
                    add("text");
                    setMenu("");
                  }}
                >
                  Add Text<kbd>T</kbd>
                </button>
                <button
                  onClick={() => {
                    setModal("draw");
                    setMenu("");
                  }}
                >
                  Add Shape<kbd>S</kbd>
                </button>
                <button
                  onClick={() => {
                    add("zone");
                    setMenu("");
                  }}
                >
                  Add Zone<kbd>Z</kbd>
                </button>
                <button
                  onClick={() => {
                    setDrawingTools((v) => !v);
                    setMenu("");
                  }}
                >
                  Drawing tools<kbd>⇧ D</kbd>
                </button>
                <hr />
                <button
                  onClick={() => {
                    setModal("builder");
                    setMenu("");
                  }}
                >
                  Build Gear…<kbd>B</kbd>
                </button>
                <button
                  onClick={() => {
                    setModal("gear");
                    setMenu("");
                  }}
                >
                  Add Gear…<kbd>G</kbd>
                </button>
              </div>
            )}
            {menu === "options" && (
              <div className="planner-popover planner-options">
                <h3>Plan options</h3><button disabled={!editable} className="planner-small-button" onClick={()=>edit(d=>{for(const n of d.nodes)if(n.data.kind==='gear'){n.width=180;n.height=105}})}>Compact gear boxes in this plan</button>
                <label>
                  Orientation
                  <select
                    disabled={!editable}
                    value={doc.settings.orientation}
                    onChange={(e) => setSetting("orientation", e.target.value)}
                  >
                    <option value="TB">Top to Bottom</option>
                    <option value="LR">Left to Right</option>
                  </select>
                </label>
                <label>
                  Grid size
                  <select
                    disabled={!editable}
                    value={doc.settings.gridSize}
                    onChange={(e) =>
                      setSetting("gridSize", Number(e.target.value))
                    }
                  >
                    <option value={1}>1×1</option>
                    <option value={10}>10×10</option>
                    <option value={25}>25×25</option>
                  </select>
                </label>
                <label>
                  Grid style
                  <select
                    disabled={!editable}
                    value={doc.settings.gridStyle}
                    onChange={(e) => setSetting("gridStyle", e.target.value)}
                  >
                    <option value="none">None</option>
                    <option value="dots">Dots</option>
                    <option value="squares">Squares</option>
                  </select>
                </label>
                <label>
                  Cable routing
                  <select
                    disabled={!editable}
                    value={doc.settings.routing}
                    onChange={(e) => setSetting("routing", e.target.value)}
                  >
                    <option value="orthogonal">Orthogonal</option>
                    <option value="curved">Curved</option>
                    <option value="straight">Straight</option>
                  </select>
                </label>
                {[
                  ["snap", "Snap to grid"],
                  ["legend", "Show cable legend"],
                  ["allowMismatch", "Override connection warnings"],
                  ["dark", "Dark canvas"],
                ].map(([key, label]) => (
                  <label className="planner-check" key={key}>
                    <input
                      type="checkbox"
                      disabled={!editable}
                      checked={(doc.settings as any)[key]}
                      onChange={(e) => setSetting(key, e.target.checked)}
                    />
                    {label}
                  </label>
                ))}
                <button
                  className="planner-small-button"
                  onClick={() => setModal("details")}
                >
                  Shoot details & dates
                </button>
              </div>
            )}
            {drawingTools && (
              <div className="planner-drawing-toolbar">
                <button
                  aria-label="Close drawing toolbar"
                  onClick={() => setDrawingTools(false)}
                >
                  <X size={15} />
                </button>
                {drawings.map((shape) => (
                  <button
                    key={shape}
                    disabled={!editable}
                    title={"Add " + shape}
                    onClick={() =>
                      add("drawing", { shape, name: shape, label: "" })
                    }
                  >
                    {shape.replace("-", " ")}
                  </button>
                ))}
              </div>
            )}
            {editable && (focusNode || focusEdge) && (
              <aside className="planner-inspector">
                <header>
                  <strong>
                    {focusNode?.data.kind === "gear"
                      ? "Gear item"
                      : focusNode
                        ? focusNode.data.kind
                        : "Cable"}
                  </strong>
                  <button
                    aria-label="Close inspector"
                    onClick={() => {
                      setSelected([]);
                      setSelectedEdges([]);
                    }}
                  >
                    <X size={16} />
                  </button>
                </header>
                {focusNode ? (
                  <>
                    <label>
                      Name
                      <input
                        value={focusNode.data.name}
                        maxLength={140}
                        onChange={(e) =>
                          changeNode(focusNode.id, { name: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      {focusNode.data.kind === "text" ? "Text" : "Label"}
                      <textarea
                        rows={3}
                        value={focusNode.data.label}
                        maxLength={2000}
                        onChange={(e) =>
                          changeNode(focusNode.id, { label: e.target.value })
                        }
                      />
                    </label>
                    <div className="planner-form-two">
                      <label>
                        Color
                        <input
                          type="color"
                          value={focusNode.data.color}
                          onChange={(e) =>
                            changeNode(focusNode.id, { color: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        Font size
                        <input
                          type="number"
                          min={10}
                          max={80}
                          value={focusNode.data.fontSize}
                          onChange={(e) =>
                            changeNode(focusNode.id, {
                              fontSize: Math.min(
                                80,
                                Math.max(10, Number(e.target.value)),
                              ),
                            })
                          }
                        />
                      </label>
                    </div>
                    {focusNode.data.kind === "gear" ? (
                      <>
                        <p>{focusNode.data.assetCode || "Custom item"}</p>
                        <p className="planner-port-help">Click a port below, then a port on another item to connect. You can also drag between the larger dots.</p>
                        {(['inputs','outputs'] as const).map(side=><fieldset className="planner-side-ports" key={side}><legend>{side === 'inputs' ? 'Inputs' : 'Outputs'}</legend>
                          {focusNode.data[side].map(port=>{
                            const basic = !isCamera(focusNode.data) || (side==='outputs' && videoPort(port.type));
                            const connected = doc.edges.some(e=>side==='inputs'?e.target===focusNode.id&&e.targetHandle===port.id:e.source===focusNode.id&&e.sourceHandle===port.id);
                            const enabled = basic || connected || !!focusNode.data.enabledPorts?.includes(side+':'+port.id);
                            return <div className="planner-side-port" key={port.id}>
                              {!basic && <input aria-label={'Show '+side+' '+port.name} type="checkbox" checked={enabled} disabled={connected} title={connected?'Connected ports stay visible':undefined} onChange={e=>changeNode(focusNode.id,{enabledPorts:e.target.checked?[...(focusNode.data.enabledPorts||[]),side+':'+port.id]:(focusNode.data.enabledPorts||[]).filter(id=>id!==side+':'+port.id)})} />}
                              <button className={clickPort.current?.nodeId===focusNode.id&&clickPort.current?.handleId===port.id&&clickPort.current?.input===(side==='inputs')?'active':''} disabled={!enabled} onClick={()=>portClick(focusNode.id,port.id,side==='inputs')}>{port.name}<small>{port.type}{connected?' · connected':''}</small></button>
                            </div>;
                          })}
                          {!focusNode.data[side].length && <small>No {side}</small>}
                        </fieldset>)}
                        <button
                          className="planner-small-button"
                          onClick={() => setModal("editgear")}
                        >
                          Edit inputs, outputs & details
                        </button>
                        {focusNode.data.gearId && (
                          <a
                            className="planner-inventory-link"
                            href={"/members/gear/" + focusNode.data.assetCode}
                          >
                            Open inventory / reserve item ↗
                          </a>
                        )}
                      </>
                    ) : (
                      <>
                        <label>
                          Fill
                          <select
                            value={focusNode.data.fill}
                            onChange={(e) =>
                              changeNode(focusNode.id, {
                                fill: e.target.value as any,
                              })
                            }
                          >
                            {["none", "tint", "solid"].map((x) => (
                              <option key={x}>{x}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Line width
                          <input
                            type="number"
                            min={1}
                            max={10}
                            value={focusNode.data.lineWidth}
                            onChange={(e) =>
                              changeNode(focusNode.id, {
                                lineWidth: Math.min(
                                  10,
                                  Math.max(1, Number(e.target.value)),
                                ),
                              })
                            }
                          />
                        </label>
                        <label>
                          Rotation
                          <input
                            type="number"
                            min={-3600}
                            max={3600}
                            step={15}
                            value={focusNode.data.rotation}
                            onChange={(e) =>
                              changeNode(focusNode.id, {
                                rotation: Math.min(
                                  3600,
                                  Math.max(-3600, Number(e.target.value)),
                                ),
                              })
                            }
                          />
                        </label>
                        <label className="planner-check">
                          <input
                            type="checkbox"
                            checked={focusNode.data.dashed}
                            onChange={(e) =>
                              changeNode(focusNode.id, {
                                dashed: e.target.checked,
                              })
                            }
                          />
                          Dashed line
                        </label>
                        <label className="planner-check">
                          <input
                            type="checkbox"
                            checked={focusNode.data.bold}
                            onChange={(e) =>
                              changeNode(focusNode.id, {
                                bold: e.target.checked,
                              })
                            }
                          />
                          Bold text
                        </label>
                        <label>
                          Text alignment
                          <select
                            value={focusNode.data.align}
                            onChange={(e) =>
                              changeNode(focusNode.id, {
                                align: e.target.value as any,
                              })
                            }
                          >
                            {["left", "center", "right"].map((v) => (
                              <option key={v}>{v}</option>
                            ))}
                          </select>
                        </label>
                      </>
                    )}
                    <label className="planner-check">
                      <input
                        type="checkbox"
                        checked={focusNode.data.locked}
                        onChange={(e) =>
                          changeNode(focusNode.id, { locked: e.target.checked })
                        }
                      />
                      Lock position
                    </label>
                    <div className="planner-inspector-actions">
                      <button
                        onClick={() => {
                          copy();
                          paste();
                        }}
                      >
                        <Copy size={14} />
                        Duplicate
                      </button>
                      <button onClick={() => remove()}>
                        <Trash2 size={14} />
                        Delete
                      </button>
                    </div>
                  </>
                ) : (
                  focusEdge && (
                    <>
                      <label className="planner-toggle"><input type="checkbox" role="switch" checked={!!focusEdge.data.wireless} onChange={e=>changeEdge(focusEdge.id,{wireless:e.target.checked,color:e.target.checked?'#8051bd':(cableColors[focusEdge.data.type]||'#748492')})} />Wireless connection (dotted)</label>
                      <label>
                        Cable type
                        <select
                          value={focusEdge.data.type}
                          onChange={(e) =>
                            changeEdge(focusEdge.id, {
                              type: e.target.value as any,
                              color: cableColors[e.target.value] || "#748492",
                            })
                          }
                        >
                          {cableTypes.map((t) => (
                            <option key={t}>{t}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Cable ID
                        <input
                          maxLength={100}
                          value={focusEdge.data.label}
                          onChange={(e) =>
                            changeEdge(focusEdge.id, { label: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        Length
                        <input
                          placeholder="e.g. 10 m"
                          maxLength={30}
                          value={focusEdge.data.length}
                          onChange={(e) =>
                            changeEdge(focusEdge.id, { length: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        Color
                        <input
                          type="color"
                          value={focusEdge.data.color}
                          onChange={(e) =>
                            changeEdge(focusEdge.id, { color: e.target.value })
                          }
                        />
                      </label>
                      <label className="planner-check">
                        <input
                          type="checkbox"
                          checked={focusEdge.data.showLabel}
                          onChange={(e) =>
                            changeEdge(focusEdge.id, {
                              showLabel: e.target.checked,
                            })
                          }
                        />
                        Show cable label
                      </label>
                      <label className="planner-check">
                        <input
                          type="checkbox"
                          checked={focusEdge.data.hidden}
                          onChange={(e) =>
                            changeEdge(focusEdge.id, {
                              hidden: e.target.checked,
                            })
                          }
                        />
                        Hide cable route
                      </label>
                      <button
                        className="planner-small-button"
                        onClick={() => {
                          const source = doc.nodes.find(
                              (n) => n.id === focusEdge.source,
                            )!,
                            target = doc.nodes.find(
                              (n) => n.id === focusEdge.target,
                            )!;
                          changeEdge(focusEdge.id, {
                            pins: [
                              ...focusEdge.data.pins,
                              {
                                x:
                                  (source.position.x + target.position.x) / 2 +
                                  100,
                                y:
                                  (source.position.y + target.position.y) / 2 +
                                  100,
                              },
                            ],
                          });
                        }}
                      >
                        Add routing pin
                      </button>
                      <button
                        className="planner-small-button"
                        onClick={() => changeEdge(focusEdge.id, { pins: [] })}
                      >
                        Remove routing pins
                      </button>
                      <button className="planner-small-button" onClick={remove}>
                        Delete cable
                      </button>
                    </>
                  )
                )}
              </aside>
            )}
            {editable && context && (context.nodeId || context.edgeId) && (
              <div
                className="planner-context-menu"
                style={{
                  left: Math.min(context.x, window.innerWidth - 200),
                  top: Math.min(context.y, window.innerHeight - 260),
                }}
              >
                {context.nodeId && (
                  <>
                    <button
                      onClick={() => {
                        copy();
                        paste();
                        setContext(null);
                      }}
                    >
                      Duplicate
                    </button>
                    <button
                      onClick={() => {
                        edit((d) => {
                          const n = d.nodes.find(
                            (n) => n.id === context.nodeId,
                          );
                          if (n) n.zIndex = Math.min(100, n.zIndex + 1);
                        });
                        setContext(null);
                      }}
                    >
                      Bring forward
                    </button>
                    <button
                      onClick={() => {
                        edit((d) => {
                          const n = d.nodes.find(
                            (n) => n.id === context.nodeId,
                          );
                          if (n) n.zIndex = Math.max(-100, n.zIndex - 1);
                        });
                        setContext(null);
                      }}
                    >
                      Send backward
                    </button>
                    <button
                      onClick={() => {
                        const n = doc.nodes.find(
                          (n) => n.id === context.nodeId,
                        );
                        if (n)
                          changeNode(n.id, { rotation: n.data.rotation + 90 });
                        setContext(null);
                      }}
                    >
                      Rotate 90°
                    </button>
                    <button
                      onClick={() => {
                        const n = doc.nodes.find(
                          (n) => n.id === context.nodeId,
                        );
                        if (n) changeNode(n.id, { locked: !n.data.locked });
                        setContext(null);
                      }}
                    >
                      Lock / unlock
                    </button>
                  </>
                )}
                <button onClick={remove}>Delete</button>
                <button onClick={() => setContext(null)}>Close menu</button>
              </div>
            )}
          </div>
          <footer className="planner-bottom-bar">
            <span>
              Drag outputs to inputs · Shift-click to select ·{" "}
              {doc.nodes.filter((n) => n.data.kind === "gear").length} gear /{" "}
              {doc.edges.length} cables
            </span>
            <div>
              <button onClick={() => setModal("shortcuts")}>Shortcuts</button>
              <button onClick={() => setModal("details")}>Shoot details</button>
              <button onClick={() => setModal("export")}>
                <Download size={14} />
                Export
              </button>
              <button onClick={() => setModal("patches")}>Patches</button>
              <button onClick={() => setModal("pack")}>
                <Package size={14} />
                Packlist
              </button>
            </div>
          </footer>
          {error && (
            <div className="planner-live-error" role="alert">
              <span>{error}</span>
              {conflict ? (
                <>
                  <button
                    onClick={async () => {
                      try {
                        const result = await request("/api/plans?id=" + planId);
                        base.current = result.plan.document;
                        install(result.plan.document);
                        blocked.current = false;
                        setConflict(false);
                        setError("");
                        setStatus("Saved");
                      } catch (e) {
                        showError(e);
                      }
                    }}
                  >
                    Reload shared version
                  </button>
                  <button onClick={() => save(true)}>
                    Keep my changed items
                  </button>
                </>
              ) : (
                <button aria-label="Dismiss error" onClick={() => setError("")}>
                  <X size={15} />
                </button>
              )}
            </div>
          )}
        </>
      )}
      {modal && (
        <Dialog
          title={
            (
              {
                new: "Create a shoot plan",
                gear: "Add Gear",
                builder: "Build Gear",
                editgear: "Edit Gear",
                draw: "Drawing tools",
                share: "Share this plan",
                pack: "Packlist",
                patches: "Patches",
                export: "Export plan",
                shortcuts: "Keyboard & mouse shortcuts",
                details: "Shoot details",
                "plan-actions": "Plan actions",
              } as any
            )[modal] || modal
          }
          close={() => setModal("")}
          wide={["gear", "pack", "patches", "draw", "share"].includes(modal)}
        >
          {modal === "new" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                create(String(new FormData(e.currentTarget).get("title")));
              }}
            >
              <label>
                Plan name
                <input
                  name="title"
                  required
                  maxLength={140}
                  placeholder="e.g. Graham Live — November"
                />
              </label>
              <button className="planner-primary" disabled={busy}>
                Create plan
              </button>
            </form>
          )}
          {modal === "plan-actions" &&
            context?.nodeId &&
            (() => {
              const row = plans.find((p) => p.id === context.nodeId),
                canManageRow = admin || row?.owner_id === userId;
              return (
                <div className="planner-dialog-actions">
                  <button onClick={() => open(context.nodeId!)}>
                    Open plan
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => manageAction("duplicate", context.nodeId!)}
                  >
                    Duplicate into my plans
                  </button>
                  {canManageRow && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        manageAction(
                          row?.archived ? "restore" : "archive",
                          context.nodeId!,
                        )
                      }
                    >
                      {row?.archived ? "Restore plan" : "Archive plan"}
                    </button>
                  )}
                </div>
              );
              function manageAction(action: string, id: string) {
                manage(action, id);
              }
            })()}
          {modal === "gear" && (
            <>
              <label className="planner-search">
                <Search size={16} />
                <input
                  aria-label="Search inventory and templates"
                  placeholder="Search inventory and templates"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <h3>Your equipment inventory</h3>
              <p>
                Planning does not reserve gear. Use the inventory to book
                physical equipment.
              </p>
              {admin && <button className="planner-small-button" disabled={busy} onClick={syncInventoryProfiles}>{busy ? "Saving inventory ports…" : "Apply researched inventory ports"}</button>}
              <div className="planner-gear-picker">
                {gear
                  .filter((g) =>
                    (g.name + " " + g.code)
                      .toLowerCase()
                      .includes(search.toLowerCase()),
                  )
                  .map((item) => (
                    <button
                      key={item.id}
                      disabled={!editable}
                      onClick={() => {
                        add("gear", {
                          ...profiles[item.id],
                          name: item.name,
                          picture: item.picture,
                          gearId: item.id,
                          assetCode: item.code,
                        });
                        setModal("");
                        setSearch("");
                      }}
                    >
                      <img src={item.picture} alt="" />
                      <strong>{item.name}</strong>
                      <code>{item.code}</code>
                      {profiles[item.id] && <small>{profiles[item.id].inputs?.length || 0} inputs · {profiles[item.id].outputs?.length || 0} outputs</small>}
                    </button>
                  ))}
              </div>
              {!gear.length && (
                <p>No inventory gear yet. You can use custom gear below.</p>
              )}
              <h3>Custom gear & common items</h3>
              <div className="planner-preset-grid">
                {presets
                  .filter((p) =>
                    p.name.toLowerCase().includes(search.toLowerCase()),
                  )
                  .map((p) => (
                    <button
                      key={p.name}
                      disabled={!editable}
                      onClick={() => {
                        add("gear", presetData(p));
                        setModal("");
                        setSearch("");
                      }}
                    >
                      {p.name}
                      <small>
                        {p.inputs.length} inputs · {p.outputs.length} outputs
                      </small>
                    </button>
                  ))}
              </div>
              <button
                className="planner-primary"
                disabled={!editable}
                onClick={() => setModal("builder")}
              >
                Build your own gear
              </button>
            </>
          )}
          {(modal === "builder" || modal === "editgear") && (
            <>
            {focusNode?.data.gearId && profiles[focusNode.data.gearId]?.model && <aside className="planner-profile-note">
              <strong>{profiles[focusNode.data.gearId].model}</strong>
              <p>{profiles[focusNode.data.gearId].notes}</p>
              {profiles[focusNode.data.gearId].sources?.map((url,i)=><a key={url} href={url} target="_blank" rel="noreferrer">Technical specifications {i+1} </a>)}
            </aside>}
            <GearBuilder
              initial={modal === "editgear" ? focusNode : undefined}
              onSaveDefault={admin?async data=>{try{await post({action:'saveProfile',gearId:data.gearId,inputs:data.inputs,outputs:data.outputs});setProfiles(p=>({...p,[data.gearId!]:{inputs:data.inputs,outputs:data.outputs}}));changeNode(focusNode!.id,data);setModal('')}catch(e){showError(e)}}:undefined}
              onSave={(data) => {
                if (modal === "editgear" && focusNode)
                  changeNode(focusNode.id, data);
                else add("gear", data);
                setModal("");
              }}
            />
            </>
          )}
          {modal === "draw" && (
            <div className="planner-shape-picker">
              {drawings.map((shape) => (
                <button
                  key={shape}
                  disabled={!editable}
                  onClick={() => {
                    add("drawing", { shape, name: shape });
                    setModal("");
                  }}
                >
                  {shape.replace("-", " ")}
                </button>
              ))}
            </div>
          )}
          {modal === "share" && plan && (
            <>
              <p>
                Assign local crew members by name. This workspace stays
                inside the member space. Administrators can manage all plans.
              </p>
              <div className="planner-share-owner">
                <strong>{plan.ownerName || displayName}</strong>
                <span>Owner</span>
              </div>
              <label className="planner-search">
                <Search size={16} />
                <input
                  aria-label="Find members to share with"
                  placeholder="Find a crew member"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <div className="planner-share-list">
                {people
                  .filter(
                    (p) =>
                      p.id !== plan.ownerId &&
                      p.name.toLowerCase().includes(search.toLowerCase()),
                  )
                  .map((person) => {
                    const shared = shares.find((s) => s.user_id === person.id);
                    return (
                      <div key={person.id}>
                        <button
                          disabled={!plan.canManage || busy}
                          className={
                            "planner-share-person " + (shared ? "shared" : "")
                          }
                          onClick={() =>
                            setShare(person.id, shared ? "none" : "editor")
                          }
                        >
                          <span>{person.name.slice(0, 1)}</span>
                          <strong>{person.name}</strong>
                          {shared && <Check size={16} />}
                        </button>
                        <select
                          aria-label={"Access for " + person.name}
                          disabled={!plan.canManage || busy}
                          value={shared?.role || "none"}
                          onChange={(e) => setShare(person.id, e.target.value)}
                        >
                          <option value="none">No access</option>
                          <option value="viewer">Can view</option>
                          <option value="editor">Can edit</option>
                        </select>
                      </div>
                    );
                  })}
              </div>
              {!plan.canManage && (
                <small>The owner or an administrator manages sharing.</small>
              )}
              <button
                className="planner-small-button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(
                      location.origin + "/members/plans/" + planId,
                    );
                    setStatus("Link copied");
                  } catch {
                    setError("Copy the plan address from the browser.");
                  }
                }}
              >
                Copy member-only plan link
              </button>
            </>
          )}
          {modal === "details" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setModal("");
                save();
              }}
            >
              <label>
                Location
                <input
                  disabled={!editable}
                  value={doc.meta.location}
                  maxLength={200}
                  onChange={(e) =>
                    edit((d) => {
                      d.meta.location = e.target.value;
                    })
                  }
                />
              </label>
              <label>
                Job ID
                <input
                  disabled={!editable}
                  value={doc.meta.jobId}
                  maxLength={100}
                  onChange={(e) =>
                    edit((d) => {
                      d.meta.jobId = e.target.value;
                    })
                  }
                />
              </label>
              <div className="planner-form-two">
                <label>
                  Rig date
                  <input
                    disabled={!editable}
                    type="date"
                    value={doc.meta.rigDate}
                    onChange={(e) =>
                      edit((d) => {
                        d.meta.rigDate = e.target.value;
                      })
                    }
                  />
                </label>
                <label>
                  Shoot date
                  <input
                    disabled={!editable}
                    type="date"
                    value={doc.meta.eventDate}
                    onChange={(e) =>
                      edit((d) => {
                        d.meta.eventDate = e.target.value;
                      })
                    }
                  />
                </label>
              </div>
              <label>
                Notes
                <textarea
                  disabled={!editable}
                  rows={5}
                  maxLength={5000}
                  value={doc.meta.notes}
                  onChange={(e) =>
                    edit((d) => {
                      d.meta.notes = e.target.value;
                    })
                  }
                />
              </label>
              <button className="planner-primary">Done</button>
            </form>
          )}
          {modal === "pack" && (
            <>
              <div className="planner-list-toolbar">
                <p>
                  {rows.filter((r) => doc.meta.packed[r.key]).length} /{" "}
                  {rows.length} lines packed
                </p>
                <button className="planner-small-button" disabled={busy} onClick={partsPdf}>Parts list PDF</button>
                <button className="planner-small-button" onClick={packCsv}>
                  Export CSV
                </button>
              </div>
              <div className="planner-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Packed</th>
                      <th>Item</th>
                      <th>Asset / length</th>
                      <th>Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.key}>
                        <td>
                          <input
                            aria-label={"Packed " + row.name}
                            type="checkbox"
                            disabled={!editable}
                            checked={!!doc.meta.packed[row.key]}
                            onChange={(e) =>
                              edit((d) => {
                                d.meta.packed[row.key] = e.target.checked;
                              })
                            }
                          />
                        </td>
                        <td>
                          {row.name}
                          <small>{row.kind}</small>
                        </td>
                        <td>{row.code || row.length || "—"}</td>
                        <td>{row.quantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p>
                Planning and packing do not check out inventory equipment.
                Reserve items through Gear management.
              </p>
            </>
          )}
          {modal === "patches" && (
            <>
              <div className="planner-list-toolbar">
                <p>{patchRows.length} signal connections</p>
                <button className="planner-small-button" onClick={patchCsv}>
                  Export CSV
                </button>
              </div>
              <div className="planner-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Source / output</th>
                      <th>Destination / input</th>
                      <th>Cable</th>
                      <th>ID / length</th>
                    </tr>
                  </thead>
                  <tbody>
                    {patchRows.map(({ edge, from, to }) => (
                      <tr key={edge.id}>
                        <td>
                          {from?.data.name}
                          <small>
                            {
                              from?.data.outputs.find(
                                (p) => p.id === edge.sourceHandle,
                              )?.name
                            }
                          </small>
                        </td>
                        <td>
                          {to?.data.name}
                          <small>
                            {
                              to?.data.inputs.find(
                                (p) => p.id === edge.targetHandle,
                              )?.name
                            }
                          </small>
                        </td>
                        <td>{edge.data.type}</td>
                        <td>
                          {edge.data.label}
                          <small>{edge.data.length}</small>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {modal === "export" && (
            <>
              <p>
                Download a production PDF with the complete diagram, printable parts list and connection schedule, or export a diagram image and spreadsheet lists.
              </p>
              <div className="planner-dialog-actions">
                {["png", "jpg", "pdf"].map((format) => (
                  <button
                    key={format}
                    disabled={busy || !doc.nodes.length}
                    onClick={() => exportImage(format)}
                  >
                    {busy ? "Preparing…" : format==='pdf'?'Production pack PDF':"Diagram " + format.toUpperCase()}
                  </button>
                ))}
                <button disabled={busy} onClick={partsPdf}>Parts list PDF</button>
                <button onClick={packCsv}>Parts list CSV</button>
                <button onClick={patchCsv}>Patches CSV</button>
                <button
                  onClick={() =>
                    download(
                      new Blob(
                        [
                          JSON.stringify(
                            { title: plan?.title, document: doc },
                            null,
                            2,
                          ),
                        ],
                        { type: "application/json" },
                      ),
                      (plan?.title || "plan") + ".json",
                    )
                  }
                >
                  Plan backup JSON
                </button>
              </div>
            </>
          )}
          {modal === "shortcuts" && (
            <div className="planner-shortcuts">
              {[
                ["Add gear", "G"],
                ["Build gear", "B"],
                ["Add shape", "S"],
                ["Add zone", "Z"],
                ["Add text", "T"],
                ["Drawing toolbar", "Shift D"],
                ["Packlist", "P"],
                ["Patches", "Ctrl P"],
                ["Undo / Redo", "⌘/Ctrl Z / Shift Z"],
                ["Copy / Paste", "⌘/Ctrl C / V"],
                ["Select all", "⌘/Ctrl A"],
                ["Duplicate", "⌘/Ctrl D"],
                ["Delete selected", "Delete / Backspace"],
                ["Clear selection", "Esc"],
                ["Marquee selection", "M"],
                ["Multi-select", "Shift + click"],
                ["Zoom in / out", "I / O"],
                ["Reset zoom", "⌘/Ctrl 0"],
                ["Fit all / selection", "F"],
                ["Pan canvas", "Drag / trackpad / arrows"],
                ["Pan while selecting", "Space + drag"],
                ["Orientation", "Ctrl O"],
                ["Cable legend", "Ctrl L"],
                ["Delete cable", "D"],
                ["Cable label", "L"],
                ["Hide cable route", "H"],
                ["Jump to cable", "J"],
                ["Save", "⌘/Ctrl S"],
                ["Rotate drawings", "Drag handle · 15° snap"],
                ["Free rotation", "Shift + drag rotation"],
                ["Remove routing pin", "Double-click pin"],
              ].map(([action, key]) => (
                <div key={action}>
                  <span>{action}</span>
                  <kbd>{key}</kbd>
                </div>
              ))}
            </div>
          )}
          {error && (
            <p className="planner-error" role="alert">
              {error}
            </p>
          )}
        </Dialog>
      )}
    </div>
  );
}
