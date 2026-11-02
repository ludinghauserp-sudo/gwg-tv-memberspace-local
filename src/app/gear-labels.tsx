"use client";
import { useEffect, useState } from "react";
import type { GearItem } from "../lib/gear-core";
export default function GearLabels({ items }: { items: GearItem[] }) {
  const [labels, setLabels] = useState<
      { id: string; qr: string; barcode: string }[]
    >([]),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const QRCode = (await import("qrcode")).default,
          JsBarcode = (await import("jsbarcode")).default;
        const rendered = await Promise.all(
          items.map(async (item) => {
            const qr = await QRCode.toString(
              location.origin + "/members/gear/" + item.code,
              { type: "svg", margin: 3, errorCorrectionLevel: "M" },
            );
            const svg = document.createElementNS(
              "http://www.w3.org/2000/svg",
              "svg",
            );
            JsBarcode(svg, item.code, {
              format: "CODE128",
              width: 2,
              height: 45,
              displayValue: false,
              margin: 8,
            });
            return { id: item.id, qr, barcode: svg.outerHTML };
          }),
        );
        if (active) setLabels(rendered);
      } catch {
        if (active) setError("Could not generate labels. Please try again.");
      }
    })();
    return () => {
      active = false;
    };
  }, [items]);
  return (
    <>
      <p className="print-help">
        Print at 100% scale. Each label includes the item’s permanent code and a
        protected QR link.
      </p>
      <button
        className="primary print-help"
        disabled={labels.length !== items.length}
        onClick={() => window.print()}
      >
        Print labels
      </button>
      {error && <p role="alert">{error}</p>}
      <div className="gear-label-sheet">
        {items.map((item) => {
          const label = labels.find((l) => l.id === item.id);
          return (
            <article key={item.id} className="gear-label">
              <div>
                <strong>GWG TV</strong>
                <h3>{item.name}</h3>
                <code>{item.code}</code>
              </div>
              {label && (
                <>
                  <div
                    className="label-qr"
                    dangerouslySetInnerHTML={{ __html: label.qr }}
                  />
                  <div
                    className="label-barcode"
                    dangerouslySetInnerHTML={{ __html: label.barcode }}
                  />
                </>
              )}
            </article>
          );
        })}
      </div>
    </>
  );
}
