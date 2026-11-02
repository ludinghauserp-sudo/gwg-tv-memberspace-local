"use client";
import { useEffect, useRef, useState } from "react";
import { scanAsset } from "../lib/gear-core";
export default function GearScanner({
  onScan,
}: {
  onScan: (code: string) => void;
}) {
  const video = useRef<HTMLVideoElement>(null),
    controls = useRef<{ stop: () => void } | null>(null),
    input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState(""),
    [camera, setCamera] = useState(false),
    [starting, setStarting] = useState(false);
  const generation = useRef(0),
    timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  function stop() {
    if (timeout.current) clearTimeout(timeout.current);
    generation.current++;
    controls.current?.stop();
    controls.current = null;
    const stream = video.current?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((t) => t.stop());
    if (video.current) video.current.srcObject = null;
    setCamera(false);
    setStarting(false);
  }
  useEffect(() => {
    input.current?.focus();
    return () => {
      if (timeout.current) clearTimeout(timeout.current);
      generation.current++;
      controls.current?.stop();
      const stream = video.current?.srcObject as MediaStream | null;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  function accept(value: string) {
    const code = scanAsset(value, location.origin);
    if (!code) {
      setError(
        "This is not a GWG TV gear label. Scan a label or enter its asset code.",
      );
      return;
    }
    stop();
    setError("");
    onScan(code);
  }
  async function start() {
    stop();
    setError("");
    setStarting(true);
    setCamera(true);
    const run = ++generation.current;
    timeout.current = setTimeout(() => {
      if (run === generation.current) {
        stop();
        setError(
          "Camera access timed out. Check camera permission, or use a USB scanner or asset code below.",
        );
      }
    }, 20000);
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const { BarcodeFormat, DecodeHintType } = await import("@zxing/library");
      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.QR_CODE,
        BarcodeFormat.CODE_128,
      ]);
      const reader = new BrowserMultiFormatReader(hints);
      if (run !== generation.current) return;
      const active = await reader.decodeFromConstraints(
        { video: { facingMode: { ideal: "environment" } }, audio: false },
        video.current!,
        (result) => {
          if (result && run === generation.current) accept(result.getText());
        },
      );
      if (run !== generation.current) active.stop();
      else {
        controls.current = active;
        if (timeout.current) clearTimeout(timeout.current);
        setStarting(false);
      }
    } catch {
      if (run === generation.current) {
        stop();
        setError(
          "Camera unavailable or permission denied. You can still use a USB scanner or enter the asset code below.",
        );
      }
    }
  }
  return (
    <section className="member-panel scanner-panel">
      <span className="member-eyebrow">FIND THE RIGHT ITEM</span>
      <h2>Scan a gear label.</h2>
      <p>
        A scan opens the item. Review its details before reserving, collecting,
        or returning it.
      </p>
      <div className={"scanner-video " + (camera ? "active" : "")}>
        <video
          ref={video}
          playsInline
          muted
          aria-label="Gear scanner camera preview"
        />
        {!camera && <span>QR / BARCODE</span>}
      </div>
      <div className="member-actions">
        <button className="primary" onClick={start} disabled={starting}>
          {starting
            ? "Starting camera…"
            : camera
              ? "Restart camera"
              : "Start camera"}
        </button>
        {camera && (
          <button className="secondary" onClick={stop}>
            Stop camera
          </button>
        )}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          accept(String(new FormData(e.currentTarget).get("asset")));
        }}
      >
        <label>
          USB scanner or asset code
          <input
            ref={input}
            name="asset"
            placeholder="GWG-…"
            autoComplete="off"
            required
            maxLength={2000}
          />
        </label>
        <button className="secondary">Open item</button>
      </form>
      {error && (
        <p role="alert" className="member-error">
          {error}
        </p>
      )}
    </section>
  );
}
