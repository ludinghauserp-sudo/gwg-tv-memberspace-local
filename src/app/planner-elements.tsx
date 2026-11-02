"use client";
import { createContext, useContext, useEffect, useRef } from "react";
import {
  Handle,
  Position,
  NodeResizer,
  useUpdateNodeInternals,
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
  useReactFlow,
  type NodeProps,
  type EdgeProps,
} from "@xyflow/react";
import {canvasTextColor} from "../lib/planner-view";
import type { PlanNode, PlanEdge } from "../lib/planner-core";
export const PlannerActions = createContext<{
  changeNode: (
    id: string,
    patch: Partial<PlanNode["data"]>,
    record?: boolean,
  ) => void;
  changeEdge: (
    id: string,
    patch: Partial<PlanEdge["data"]>,
    record?: boolean,
  ) => void;
  portClick: (nodeId: string, handleId: string, input: boolean) => void;
  begin: () => void;
  end: () => void;
  editable: boolean;
}>({
  changeNode: () => {},
  changeEdge: () => {},
  portClick: () => {},
  begin: () => {},
  end: () => {},
  editable: false,
});
export const drawings = [
  "rectangle",
  "circle",
  "triangle",
  "half-circle",
  "trapezoid",
  "line",
  "arrow",
  "person",
  "chair",
  "microphone",
  "speaker",
  "light",
  "projector",
  "camera",
  "truss",
  "stairs",
  "door",
  "power",
] as const;
export function Drawing({
  shape,
  color,
  fill,
  lineWidth,
  dashed,
}: {
  shape: string;
  color: string;
  fill: string;
  lineWidth: number;
  dashed: boolean;
}) {
  const props = {
    stroke: color,
    strokeWidth: lineWidth,
    fill: fill === "solid" ? color : fill === "tint" ? color + "25" : "none",
    strokeDasharray: dashed ? "6 4" : undefined,
    strokeLinejoin: "round" as const,
  };
  let content;
  switch (shape) {
    case "circle":
      content = <ellipse cx="50" cy="50" rx="46" ry="44" />;
      break;
    case "triangle":
      content = <path d="M50 5L96 94H4Z" />;
      break;
    case "half-circle":
      content = <path d="M4 88A46 70 0 0 1 96 88Z" />;
      break;
    case "trapezoid":
      content = <path d="M23 8H77L96 92H4Z" />;
      break;
    case "line":
      content = <path d="M3 50H97" />;
      break;
    case "arrow":
      content = <path d="M3 50H95M73 28L95 50 73 72" />;
      break;
    case "person":
      content = (
        <>
          <circle cx="50" cy="35" r="18" />
          <path d="M20 80Q20 48 50 48T80 80ZM44 8L50 1 56 8" />
        </>
      );
      break;
    case "chair":
      content = (
        <>
          <path d="M22 15H78V29H22ZM27 35H73V77H27ZM29 77V94M71 77V94M17 40V72M83 40V72" />
        </>
      );
      break;
    case "microphone":
      content = (
        <>
          <rect x="36" y="7" width="28" height="50" rx="14" />
          <path d="M25 37V49Q25 73 50 73T75 49V37M50 73V93M30 94H70" />
        </>
      );
      break;
    case "speaker":
      content = (
        <>
          <path d="M22 9H78V91H22Z" />
          <circle cx="50" cy="35" r="12" />
          <circle cx="50" cy="69" r="17" />
        </>
      );
      break;
    case "light":
      content = (
        <>
          <path d="M28 43L15 9H85L72 43ZM28 48H72V75H28ZM50 75V94M26 95H74" />
          <path d="M31 17L37 36M50 16V36M69 17L63 36" />
        </>
      );
      break;
    case "projector":
      content = (
        <>
          <path d="M25 8H75L64 46H36Z" />
          <rect x="20" y="49" width="60" height="39" rx="7" />
          <circle cx="50" cy="59" r="7" />
          <path d="M29 75H71M30 81H70" />
        </>
      );
      break;
    case "camera":
      content = (
        <>
          <path d="M30 44L7 9H93L70 44Z" />
          <rect x="24" y="48" width="52" height="35" rx="5" />
          <path d="M43 84V97M57 84V97M31 57H68" />
        </>
      );
      break;
    case "truss":
      content = (
        <path d="M3 36H97M3 64H97M3 36L23 64 43 36 63 64 83 36 97 64M3 64L23 36 43 64 63 36 83 64 97 36" />
      );
      break;
    case "stairs":
      content = (
        <>
          <path d="M10 8H90V92H10ZM10 22H90M10 36H90M10 50H90M10 64H90M10 78H90M50 85V16M40 27L50 16 60 27" />
        </>
      );
      break;
    case "door":
      content = (
        <>
          <path d="M8 92V8H20V92M20 92H92M20 20A72 72 0 0 1 92 92" />
        </>
      );
      break;
    case "power":
      content = (
        <>
          <circle cx="50" cy="50" r="43" />
          <path d="M54 13L27 56H48L42 87 75 42H55Z" />
        </>
      );
      break;
    default:
      content = <rect x="4" y="5" width="92" height="90" rx="3" />;
  }
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <g {...props}>{content}</g>
    </svg>
  );
}
export function PlannerNode({
  id,
  data: rawData,
  selected,
  width,
  height,
}: NodeProps) {
  const data = rawData as PlanNode["data"] & { _orientation: string; _dark:boolean; _showPhotos:boolean; _visibleInputs:PlanNode['data']['inputs']; _visibleOutputs:PlanNode['data']['outputs']; _pending:{nodeId:string;handleId:string;input:boolean}|null };
  const textColor=canvasTextColor(data.color,data._dark);
  const shownInputs=data._visibleInputs||data.inputs, shownOutputs=data._visibleOutputs||data.outputs;
  const actions = useContext(PlannerActions),
    flow = useReactFlow(),
    update = useUpdateNodeInternals();
  const lr = data._orientation === "LR";
  useEffect(
    () => update(id),
    [id, JSON.stringify(shownInputs), JSON.stringify(shownOutputs), lr, update],
  );
  const down = useRef(false);
  function rotate(e: React.PointerEvent) {
    if (!down.current) return;
    const point = flow.screenToFlowPosition({ x: e.clientX, y: e.clientY }),
      node = flow.getNode(id);
    if (!node) return;
    const angle =
      (Math.atan2(
        point.y - node.position.y - (height || 100) / 2,
        point.x - node.position.x - (width || 100) / 2,
      ) *
        180) /
        Math.PI +
      90;
    actions.changeNode(
      id,
      {
        rotation: e.shiftKey ? Math.round(angle) : Math.round(angle / 15) * 15,
      },
      false,
    );
  }
  return (
    <div
      className={
        "planner-node " +
        data.kind +
        (data.locked ? " locked" : "") +
        (lr ? " orientation-lr" : "")
      }
      style={
        {
          width: "100%",
          height: "100%",
          "--element-color": data.color,
        } as React.CSSProperties
      }
    >
      <NodeResizer
        isVisible={!!selected && actions.editable && !data.locked}
        minWidth={data.kind === "gear" ? 130 : 40}
        minHeight={data.kind === "gear" ? 80 : 30}
        onResizeStart={actions.begin}
        onResizeEnd={actions.end}
      />
      {selected &&
        actions.editable &&
        data.kind === "drawing" &&
        !data.locked && (
          <button
            className="planner-rotate nodrag nopan"
            title="Drag to rotate; Shift for free rotation"
            aria-label="Rotate drawing"
            onPointerDown={(e) => {
              e.stopPropagation();
              down.current = true;
              actions.begin();
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={rotate}
            onPointerUp={() => {
              down.current = false;
              actions.end();
            }}
          >
            ↻
          </button>
        )}
      {data.kind === "gear" ? (
        <>
          <div className="planner-gear-body">
            <span className="planner-gear-manufacturer">
              {data.manufacturer || "GEAR"}
            </span>
            {data.picture && data._showPhotos !== false && (
              <img src={data.picture} alt="" draggable={false} />
            )}
            <strong>{data.name}</strong>
            {data.label && (
              <span className="planner-gear-label">{data.label}</span>
            )}
            {data.assetCode && <code>{data.assetCode}</code>}
          </div>
          {(["inputs", "outputs"] as const).map((direction) =>
            (direction === "inputs" ? shownInputs : shownOutputs).map((port: any, i: number) => {
              const input = direction === "inputs",
                position = lr
                  ? input
                    ? Position.Left
                    : Position.Right
                  : input
                    ? Position.Top
                    : Position.Bottom;
              const offset =
                ((i + 1) * 100) / ((direction === "inputs" ? shownInputs : shownOutputs).length + 1) + "%";
              return (
                <Handle
                  key={direction + port.id}
                  className={((direction === "inputs" ? shownInputs : shownOutputs).length > 5 ? "dense-port " : "") + (data._pending?.nodeId===id && data._pending?.handleId===port.id && data._pending?.input===input ? "pending-port" : "")}
                  aria-label={(input ? "Input: " : "Output: ") + port.name + " · " + port.type}
                  tabIndex={0}
                  id={port.id}
                  type={input ? "target" : "source"}
                  position={position}
                  isConnectable={actions.editable}
                  onKeyDown={(e)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();actions.portClick(id,port.id,input)}}}
                  onClick={(e) => {
                    e.stopPropagation();
                    actions.portClick(id, port.id, input);
                  }}
                  style={lr ? { top: offset } : { left: offset }}
                  title={port.name + " · " + port.type}
                >
                  <span className={"planner-port-label " + direction}>
                    {port.name}
                    <small>{port.type}</small>
                  </span>
                </Handle>
              );
            }),
          )}
        </>
      ) : data.kind === "zone" ? (
        <>
          <div
            className="planner-zone-fill"
            style={{
              background: data.color + "12",
              borderColor: data.color,
              borderStyle: data.dashed ? "dashed" : "solid",
            }}
          />
          <strong className="planner-zone-label" style={{color:textColor}}>{data.name}</strong>
          {data.label && (
            <span className="planner-zone-description" style={{color:textColor}}>{data.label}</span>
          )}
        </>
      ) : data.kind === "text" ? (
        <div
          className="planner-text"
          style={{
            color: textColor,
            fontSize: data.fontSize,
            fontWeight: data.bold ? 700 : 400,
            textAlign: data.align,
            whiteSpace: "pre-wrap",
          }}
        >
          {data.label || data.name}
        </div>
      ) : (
        <div
          className="planner-drawing"
          style={{ transform: `rotate(${data.rotation}deg)` }}
        >
          <Drawing
            shape={data.shape}
            color={data.color}
            fill={data.fill}
            lineWidth={data.lineWidth}
            dashed={data.dashed}
          />
          {(data.label || data.name !== "Drawing") && (
            <span
              style={{
                color: textColor,
                fontSize: data.fontSize,
                fontWeight: data.bold ? 700 : 400,
              }}
            >
              {data.label || data.name}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
export function CableEdge(props: EdgeProps) {
  const {
      id,
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourcePosition,
      targetPosition,
      selected,
    } = props,
    data = props.data as PlanEdge["data"] & { _routing: string };
  const actions = useContext(PlannerActions),
    flow = useReactFlow();
  const activePin = useRef(-1);
  let path: string, labelX: number, labelY: number;
  if (data.pins.length) {
    const points = [
      { x: sourceX, y: sourceY },
      ...data.pins,
      { x: targetX, y: targetY },
    ];
    path = points.map((p, i) => (i ? "L" : "M") + p.x + "," + p.y).join(" ");
    labelX = data.pins[Math.floor(data.pins.length / 2)].x;
    labelY = data.pins[Math.floor(data.pins.length / 2)].y;
  } else if (data._routing === "straight") {
    path = `M${sourceX},${sourceY}L${targetX},${targetY}`;
    labelX = (sourceX + targetX) / 2;
    labelY = (sourceY + targetY) / 2;
  } else {
    const result =
      data._routing === "curved"
        ? getBezierPath({
            sourceX,
            sourceY,
            targetX,
            targetY,
            sourcePosition,
            targetPosition,
          })
        : getSmoothStepPath({
            sourceX,
            sourceY,
            targetX,
            targetY,
            sourcePosition,
            targetPosition,
            borderRadius: 8,
            offset: 32,
          });
    [path, labelX, labelY] = result;
  }
  return (
    <>
      <BaseEdge
        id={id}
        className={data.wireless?'planner-wireless-route':undefined}
        path={path}
        style={{
          stroke: data.wireless ? "#8051bd" : data.color,
          strokeWidth: data.wireless ? 3.5 : selected ? 3.5 : 2.5,
          strokeDasharray: data.wireless ? "1 10" : undefined,
          strokeLinecap: "round",
          opacity: data.hidden ? 0 : 1,
        }}
        interactionWidth={22}
      />
      {data.showLabel && (
        <EdgeLabelRenderer>
          <div
            className="planner-cable-label nodrag nopan"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              borderColor: data.color,
            }}
          >
            {data.wireless ? "WIRELESS · " + (data.label || data.type) : data.label || data.type}
            {data.length && <small>{data.length}</small>}
          </div>
        </EdgeLabelRenderer>
      )}
      {selected &&
        actions.editable &&
        data.pins.map((pin, i) => (
          <circle
            key={i}
            cx={pin.x}
            cy={pin.y}
            r={7}
            className="nodrag nopan planner-cable-pin"
            fill="white"
            stroke={data.color}
            onDoubleClick={(e) => {
              e.stopPropagation();
              actions.changeEdge(id, {
                pins: data.pins.filter((_, j) => j !== i),
              });
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              activePin.current = i;
              actions.begin();
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (activePin.current !== i) return;
              const point = flow.screenToFlowPosition({
                x: e.clientX,
                y: e.clientY,
              });
              actions.changeEdge(
                id,
                { pins: data.pins.map((p, j) => (j === i ? point : p)) },
                false,
              );
            }}
            onPointerUp={() => {
              activePin.current = -1;
              actions.end();
            }}
          />
        ))}
    </>
  );
}
