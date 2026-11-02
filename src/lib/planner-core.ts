import { z } from "zod";
export const cableTypes = [
  "HDMI",
  "SDI",
  "XLR",
  "Ethernet",
  "USB",
  "USB-C",
  "Power",
  "Fiber",
  "SMPTE",
  "DMX",
  "3.5mm",
  "RCA",
  "DisplayPort",
  "DVI",
  "VGA",
  "BNC",
  "Speakon",
  "Optical",
  "Other",
] as const;
export const cableColors: Record<string, string> = {
  HDMI: "#16749b",
  SDI: "#e39036",
  XLR: "#bd5f9c",
  Ethernet: "#4a9a6e",
  USB: "#796ac5",
  "USB-C": "#796ac5",
  Power: "#dc5b55",
  Fiber: "#dcbd39",
  DMX: "#42a4aa",
  Other: "#748492",
};
const id = z.string().min(1).max(100),
  text = z.string().max(2000),
  color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const port = z.object({
  id,
  name: z.string().min(1).max(80),
  type: z.enum(cableTypes),
});
const node = z.object({
  id,
  type: z.literal("planner"),
  position: z.object({
    x: z.number().min(-100000).max(100000),
    y: z.number().min(-100000).max(100000),
  }),
  width: z.number().min(30).max(10000),
  height: z.number().min(20).max(10000),
  zIndex: z.number().min(-100).max(100),
  data: z.object({
    kind: z.enum(["gear", "zone", "text", "drawing"]),
    name: z.string().max(140),
    label: text,
    manufacturer: z.string().max(140),
    gearId: z.string().max(100).nullable(),
    assetCode: z.string().max(100),
    picture: z.string().max(2000),
    enabledPorts: z.array(z.string().max(120)).max(64).optional(),
    inputs: z.array(port).max(32),
    outputs: z.array(port).max(32),
    color,
    shape: z.string().max(30),
    rotation: z.number().min(-3600).max(3600),
    fill: z.enum(["none", "tint", "solid"]),
    lineWidth: z.number().min(1).max(10),
    dashed: z.boolean(),
    locked: z.boolean(),
    fontSize: z.number().min(10).max(80),
    bold: z.boolean(),
    align: z.enum(["left", "center", "right"]),
  }),
});
const edge = z.object({
  id,
  source: id,
  target: id,
  sourceHandle: id,
  targetHandle: id,
  type: z.literal("cable"),
  data: z.object({
    type: z.enum(cableTypes),
    label: z.string().max(100),
    length: z.string().max(30),
    color,
    wireless: z.boolean().optional(),
    hidden: z.boolean(),
    showLabel: z.boolean(),
    pins: z
      .array(
        z.object({
          x: z.number().min(-100000).max(100000),
          y: z.number().min(-100000).max(100000),
        }),
      )
      .max(20),
  }),
});
export const documentSchema = z.object({
  nodes: z.array(node).max(400),
  edges: z.array(edge).max(800),
  settings: z.object({
    showPhotos: z.boolean().optional(),
    orientation: z.enum(["TB", "LR"]),
    snap: z.boolean(),
    grid: z.boolean(),
    gridSize: z.union([z.literal(1), z.literal(10), z.literal(25)]),
    gridStyle: z.enum(["none", "dots", "squares"]),
    allowMismatch: z.boolean(),
    routing: z.enum(["orthogonal", "curved", "straight"]),
    legend: z.boolean(),
    dark: z.boolean(),
  }),
  meta: z.object({
    location: z.string().max(200),
    jobId: z.string().max(100),
    rigDate: z.string().max(16),
    eventDate: z.string().max(16),
    notes: z.string().max(5000),
    packed: z.record(z.boolean()),
  }),
});
export type PlanDocument = z.infer<typeof documentSchema>;
export type PlanNode = PlanDocument["nodes"][number];
export type PlanEdge = PlanDocument["edges"][number];
export type PlanOp = {
  collection: "nodes" | "edges" | "settings" | "meta";
  id: string;
  before: unknown;
  after: unknown;
};
export const emptyPlan = (): PlanDocument => ({
  nodes: [],
  edges: [],
  settings: {
    showPhotos: true,
    orientation: "TB",
    snap: true,
    grid: true,
    gridSize: 10,
    gridStyle: "dots",
    allowMismatch: false,
    routing: "orthogonal",
    legend: true,
    dark: false,
  },
  meta: {
    location: "",
    jobId: "",
    rigDate: "",
    eventDate: "",
    notes: "",
    packed: {},
  },
});
export function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v).sort(([a], [b]) => a.localeCompare(b)),
        )
      : v,
  );
}
export function changes(before: PlanDocument, after: PlanDocument): PlanOp[] {
  const ops: PlanOp[] = [];
  for (const collection of ["nodes", "edges"] as const) {
    const a = new Map(before[collection].map((n) => [n.id, n])),
      b = new Map(after[collection].map((n) => [n.id, n]));
    for (const id of new Set([...a.keys(), ...b.keys()]))
      if (canonical(a.get(id) || null) !== canonical(b.get(id) || null))
        ops.push({
          collection,
          id,
          before: a.get(id) || null,
          after: b.get(id) || null,
        });
  }
  for (const collection of ["settings", "meta"] as const)
    for (const key of Object.keys(after[collection]))
      if (
        canonical((before[collection] as any)[key]) !==
        canonical((after[collection] as any)[key])
      )
        ops.push({
          collection,
          id: key,
          before: (before[collection] as any)[key],
          after: (after[collection] as any)[key],
        });
  return ops;
}
export class PlanConflict extends Error {
  conflicts: string[];
  constructor(conflicts: string[]) {
    super(
      "Another collaborator changed the same items. Reload their version or explicitly keep your changes.",
    );
    this.conflicts = conflicts;
  }
}
export function applyOperations(
  current: PlanDocument,
  ops: PlanOp[],
  force = false,
): PlanDocument {
  const result = structuredClone(current);
  const conflicts: string[] = [];
  for (const op of ops) {
    if (
      !["nodes", "edges", "settings", "meta"].includes(op.collection) ||
      typeof op.id !== "string"
    )
      throw Error("Invalid change.");
    if (op.collection === "nodes" || op.collection === "edges") {
      const list = result[op.collection] as any[],
        index = list.findIndex((n) => n.id === op.id),
        value = index < 0 ? null : list[index];
      if (
        !force &&
        canonical(value) !== canonical(op.before) &&
        canonical(value) !== canonical(op.after)
      ) {
        conflicts.push(op.id);
        continue;
      }
      if (op.after === null) {
        if (index >= 0) list.splice(index, 1);
      } else {
        if ((op.after as any)?.id !== op.id)
          throw Error("Invalid element identifier.");
        if (index >= 0) list[index] = op.after;
        else list.push(op.after);
      }
    } else {
      if (!Object.hasOwn(emptyPlan()[op.collection], op.id))
        throw Error("Unknown plan setting.");
      const target = result[op.collection] as any;
      if (
        !force &&
        canonical(target[op.id]) !== canonical(op.before) &&
        canonical(target[op.id]) !== canonical(op.after)
      ) {
        conflicts.push(op.id);
        continue;
      }
      target[op.id] = op.after;
    }
  }
  if (conflicts.length) throw new PlanConflict(conflicts);
  const nodeIds = new Set(result.nodes.map((n) => n.id));
  result.edges = result.edges.filter(
    (e) => nodeIds.has(e.source) && nodeIds.has(e.target),
  );
  return validateDocument(result);
}
export function validateDocument(value: unknown) {
  const result = documentSchema.parse(value);
  if (
    new Set(result.nodes.map((n) => n.id)).size !== result.nodes.length ||
    new Set(result.edges.map((n) => n.id)).size !== result.edges.length
  )
    throw Error("Duplicate element IDs.");
  for (const n of result.nodes) {
    for (const ports of [n.data.inputs, n.data.outputs])
      if (new Set(ports.map((p) => p.id)).size !== ports.length)
        throw Error("Duplicate port IDs.");
    if (n.data.picture && !/^\/(equipment\/|api\/members\/photos\?)/.test(n.data.picture)) {
      const url = new URL(n.data.picture);
      if (url.protocol !== "https:" || url.username || url.password)
        throw Error("Use HTTPS image links.");
    }
  }
  for (const e of result.edges) {
    const source = result.nodes.find((n) => n.id === e.source),
      target = result.nodes.find((n) => n.id === e.target),
      output = source?.data.outputs.find((p) => p.id === e.sourceHandle),
      input = target?.data.inputs.find((p) => p.id === e.targetHandle);
    if (!output || !input)
      throw Error("Each cable must join an output to an input.");
    if (
      !result.settings.allowMismatch &&
      output.type !== input.type &&
      output.type !== "Other" &&
      input.type !== "Other"
    )
      throw Error("Cable ports must match. Use Other for an adapter.");
  }
  return result;
}
export function makeNode(
  kind: PlanNode["data"]["kind"],
  position = { x: 120, y: 120 },
  patch: Partial<PlanNode["data"]> = {},
): PlanNode {
  return {
    id: crypto.randomUUID(),
    type: "planner",
    position,
    width: kind === "zone" ? 560 : kind === "text" ? 260 : 180,
    height:
      kind === "zone"
        ? 360
        : kind === "gear"
          ? 105
          : kind === "text"
            ? 100
            : 120,
    zIndex: kind === "zone" ? -10 : 0,
    data: {
      kind,
      name:
        kind === "gear"
          ? "Custom gear"
          : kind === "zone"
            ? "Zone"
            : kind === "text"
              ? "Text label"
              : "Drawing",
      label: "",
      manufacturer: "",
      gearId: null,
      assetCode: "",
      picture: "",
      inputs:
        kind === "gear" ? [{ id: "in-1", name: "Input", type: "Other" }] : [],
      outputs:
        kind === "gear" ? [{ id: "out-1", name: "Output", type: "Other" }] : [],
      color: "#16749b",
      shape: "rectangle",
      rotation: 0,
      fill: kind === "zone" ? "tint" : "none",
      lineWidth: 2,
      dashed: false,
      locked: false,
      fontSize: kind === "text" ? 22 : 14,
      bold: false,
      align: "left",
      ...patch,
    },
  };
}
export function packRows(doc: PlanDocument) {
  const rows = new Map<
    string,
    {
      key: string;
      name: string;
      code: string;
      quantity: number;
      kind: string;
      length: string;
    }
  >();
  for (const node of doc.nodes.filter((n) => n.data.kind === "gear")) {
    const key = node.data.gearId || "custom:" + node.data.name;
    const row = rows.get(key);
    if (row) row.quantity++;
    else
      rows.set(key, {
        key,
        name: node.data.name,
        code: node.data.assetCode,
        quantity: 1,
        kind: /adapter:|converter/i.test(node.data.name) ? "Adapter / converter" : "Gear",
        length: "",
      });
  }
  for (const edge of doc.edges.filter(e=>!e.data.wireless)) {
    const key = "cable:" + edge.data.type + ":" + edge.data.length,
      row = rows.get(key);
    if (row) row.quantity++;
    else
      rows.set(key, {
        key,
        name: edge.data.type + " cable",
        code: "",
        quantity: 1,
        kind: "Cable",
        length: edge.data.length,
      });
  }
  return [...rows.values()];
}
