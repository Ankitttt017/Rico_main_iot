import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import { Barcode, Boxes, PackageCheck, Printer, RefreshCw, ScanLine } from "lucide-react";
import { packingApi } from "../api/services";
import GlobalPopup from "../components/GlobalPopup";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:4000";

function toBars(value) {
  const CODE_39 = {
    "0": "nnnwwnwnn",
    "1": "wnnwnnnnw",
    "2": "nnwwnnnnw",
    "3": "wnwwnnnnn",
    "4": "nnnwwnnnw",
    "5": "wnnwwnnnn",
    "6": "nnwwwnnnn",
    "7": "nnnwnnwnw",
    "8": "wnnwnnwnn",
    "9": "nnwwnnwnn",
    A: "wnnnnwnnw",
    B: "nnwnnwnnw",
    C: "wnwnnwnnn",
    D: "nnnnwwnnw",
    E: "wnnnwwnnn",
    F: "nnwnwwnnn",
    G: "nnnnnwwnw",
    H: "wnnnnwwnn",
    I: "nnwnnwwnn",
    J: "nnnnwwwnn",
    K: "wnnnnnnww",
    L: "nnwnnnnww",
    M: "wnwnnnnwn",
    N: "nnnnwnnww",
    O: "wnnnwnnwn",
    P: "nnwnwnnwn",
    Q: "nnnnnnwww",
    R: "wnnnnnwwn",
    S: "nnwnnnwwn",
    T: "nnnnwnwwn",
    U: "wwnnnnnnw",
    V: "nwwnnnnnw",
    W: "wwwnnnnnn",
    X: "nwnnwnnnw",
    Y: "wwnnwnnnn",
    Z: "nwwnwnnnn",
    "-": "nwnnnnwnw",
    ".": "wwnnnnwnn",
    " ": "nwwnnnwnn",
    $: "nwnwnwnnn",
    "/": "nwnwnnnwn",
    "+": "nwnnnwnwn",
    "%": "nnnwnwnwn",
    "*": "nwnnwnwnn",
  };

  const sanitized = String(value || "EMPTY")
    .toUpperCase()
    .replace(/[^0-9A-Z\-\.\$\/\+\% ]/g, "");
  const encoded = `*${sanitized || "EMPTY"}*`;

  const segments = [{ isBar: false, width: 10 }];
  for (let charIndex = 0; charIndex < encoded.length; charIndex += 1) {
    const pattern = CODE_39[encoded[charIndex]];
    if (!pattern) {
      continue;
    }
    for (let bitIndex = 0; bitIndex < pattern.length; bitIndex += 1) {
      segments.push({
        isBar: bitIndex % 2 === 0,
        width: pattern[bitIndex] === "w" ? 3 : 1,
      });
    }
    if (charIndex < encoded.length - 1) {
      segments.push({ isBar: false, width: 1 });
    }
  }
  segments.push({ isBar: false, width: 10 });
  return segments;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toLocaleString();
}

function normalizeOverviewPayload(data = {}) {
  return {
    activeSession: data.activeSession || null,
    activeItems: data.activeItems || [],
    recentSessions: data.recentSessions || [],
    finalPackingStations: data.finalPackingStations || [],
    managementSettings: data.managementSettings || null,
  };
}

function buildPackingFeedMessage(payload = {}) {
  const event = String(payload.event || "").toUpperCase();
  if (event === "BOX_CLOSED") {
    return `Box ${payload.boxNumber || "-"} closed (${payload.packedCount || "-"} / ${payload.capacity || "-"}) label ${
      payload.labelCode || "-"
    }`;
  }
  if (event === "BOX_UPDATED") {
    return `Box updated: ${payload.boxNumber || "-"} (capacity ${payload.capacity || "-"})`;
  }
  if (event === "BOX_READY") {
    return `Box ready: ${payload.boxNumber || "-"} (${payload.capacity || "-"} capacity)`;
  }
  if (event === "NEXT_BOX_READY") {
    return payload.boxNumber
      ? `Next box ready: ${payload.boxNumber} (${payload.capacity || "-"} capacity)`
      : "Current box completed. Generate next box from Packing Management.";
  }
  if (event === "BOX_DELETED") {
    return `Box deleted: ${payload.boxNumber || "-"}`;
  }
  return `Packed ${payload.partId || "-"} in ${payload.boxNumber || "-"} slot ${payload.slotNo || "-"}`;
}

function BarcodeStrip({ value }) {
  const bars = useMemo(() => toBars(value), [value]);
  const width = bars.reduce((sum, segment) => sum + segment.width, 0);
  let cursor = 0;

  return (
    <svg viewBox={`0 0 ${width} 64`} className="w-full h-16 rounded-md bg-white p-1">
      {bars.map((segment, index) => {
        const x = cursor;
        cursor += segment.width;
        return segment.isBar ? (
          <rect key={`${x}-${segment.width}-${index}`} x={x} y={0} width={segment.width} height={64} fill="#000000" />
        ) : null;
      })}
    </svg>
  );
}

const Packing = () => {
  const [overview, setOverview] = useState({
    activeSession: null,
    activeItems: [],
    recentSessions: [],
    finalPackingStations: [],
    managementSettings: null,
  });
  const [selectedBoxNumber, setSelectedBoxNumber] = useState("");
  const [selectedSession, setSelectedSession] = useState(null);
  const [popup, setPopup] = useState(null);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [loadingSession, setLoadingSession] = useState(false);
  const [feed, setFeed] = useState([]);
  const [hoveredSlot, setHoveredSlot] = useState(null);

  const selectedBoxRef = useRef("");

  const activeSession = overview.activeSession;
  const activeItems = useMemo(() => overview.activeItems || [], [overview.activeItems]);
  const selectedItems = useMemo(() => selectedSession?.items || [], [selectedSession?.items]);
  const virtualSession = useMemo(() => {
    const settings = overview.managementSettings || null;
    if (!settings) {
      return null;
    }
    return {
      id: "virtual-next-box",
      boxNumber: settings.preview || "BOX-0001",
      serialNo: settings.nextSerial || 1,
      capacity: Number(settings.defaultCapacity || 65),
      packedCount: 0,
      status: "OPEN",
      generationSource: "AUTO",
      labelCode: null,
      closedAt: null,
      createdAt: null,
      isVirtual: true,
    };
  }, [overview.managementSettings]);
  const displaySession = selectedSession || activeSession || virtualSession;
  const displayItems = useMemo(() => {
    if (!displaySession) {
      return [];
    }
    const usingActive = Number(displaySession?.id || 0) === Number(activeSession?.id || 0);
    if (usingActive) {
      return (activeItems || []).map((item) => ({
        id: item.id,
        slotNo: item.slotNo,
        partId: item.partId,
        qrCode: item.partId,
        packedAt: item.packedAt || item.createdAt || null,
      }));
    }
    return selectedItems;
  }, [displaySession, activeSession?.id, activeItems, selectedItems]);
  const finalPackingStationText = useMemo(() => {
    if ((overview.finalPackingStations || []).length === 0) {
      return "Not Configured";
    }
    return overview.finalPackingStations.join(", ");
  }, [overview.finalPackingStations]);

  const displayCapacity = Math.max(Number(displaySession?.capacity || 0), 1);
  const displayProgress = displaySession
    ? Math.min(100, Math.round((Number(displaySession.packedCount || 0) / displayCapacity) * 100))
    : 0;
  const latestScanned = useMemo(() => {
    if (displayItems.length === 0) {
      return null;
    }
    return [...displayItems].sort((a, b) => Number(b.slotNo || 0) - Number(a.slotNo || 0))[0];
  }, [displayItems]);

  const filledSlots = useMemo(() => {
    const map = new Map();
    for (const item of displayItems) {
      map.set(Number(item.slotNo), {
        partId: item.partId,
        qrCode: item.qrCode || item.partId,
        packedAt: item.packedAt || null,
      });
    }
    return map;
  }, [displayItems]);

  const sessionOptions = useMemo(() => {
    const map = new Map();
    if (overview.activeSession?.boxNumber) {
      map.set(overview.activeSession.boxNumber, overview.activeSession);
    }
    for (const session of overview.recentSessions || []) {
      if (session?.boxNumber && !map.has(session.boxNumber)) {
        map.set(session.boxNumber, session);
      }
    }
    if (virtualSession?.boxNumber && !map.has(virtualSession.boxNumber)) {
      map.set(virtualSession.boxNumber, virtualSession);
    }
    return Array.from(map.values());
  }, [overview.activeSession, overview.recentSessions, virtualSession]);

  const loadSession = useCallback(async (boxNumber, fallbackSession = null) => {
    const normalized = String(boxNumber || "").trim().toUpperCase();
    if (!normalized) {
      setSelectedSession(null);
      return null;
    }
    if (fallbackSession?.isVirtual && String(fallbackSession.boxNumber || "").trim().toUpperCase() === normalized) {
      setSelectedSession(fallbackSession);
      return fallbackSession;
    }
    setLoadingSession(true);
    try {
      const data = await packingApi.boxByNumber(normalized);
      setSelectedSession(data || null);
      return data || null;
    } catch (error) {
      setSelectedSession(null);
      setPopup({
        type: "ERROR",
        title: "Box Not Found",
        message: error.response?.data?.error || "Unable to load box details",
      });
      return null;
    } finally {
      setLoadingSession(false);
    }
  }, []);

  const loadOverview = useCallback(
    async (preferredBoxNumber = "") => {
      try {
        const payload = normalizeOverviewPayload(await packingApi.overview());
        setOverview(payload);

        const preferred = String(preferredBoxNumber || "").trim().toUpperCase();
        const previous = String(selectedBoxRef.current || "").trim().toUpperCase();
        const virtualPreview = payload.managementSettings?.preview || "";
        const fallback = payload.activeSession?.boxNumber || payload.recentSessions?.[0]?.boxNumber || virtualPreview;
        const nextSelected = preferred || previous || fallback;

        if (nextSelected) {
          setSelectedBoxNumber(nextSelected);
          selectedBoxRef.current = nextSelected;
          const virtualCandidate =
            !payload.activeSession && (!payload.recentSessions || payload.recentSessions.length === 0) && virtualPreview
              ? {
                  id: "virtual-next-box",
                  boxNumber: virtualPreview,
                  serialNo: payload.managementSettings?.nextSerial || 1,
                  capacity: Number(payload.managementSettings?.defaultCapacity || 65),
                  packedCount: 0,
                  status: "OPEN",
                  generationSource: "AUTO",
                  labelCode: null,
                  closedAt: null,
                  createdAt: null,
                  isVirtual: true,
                }
              : null;
          await loadSession(nextSelected, virtualCandidate);
        } else {
          setSelectedBoxNumber("");
          selectedBoxRef.current = "";
          setSelectedSession(null);
        }
      } catch (error) {
        const apiMessage = error.response?.data?.error || "";
        const normalized = String(apiMessage).toLowerCase();
        const setupHint =
          normalized.includes("doesn't exist") ||
          normalized.includes("unknown column") ||
          normalized.includes("no such table")
            ? "Packing schema update pending. Restart backend once to apply new database changes."
            : null;
        setPopup({
          type: "ERROR",
          title: "Packing Load Error",
          message: setupHint || apiMessage || "Unable to load packing dashboard",
        });
      } finally {
        setLoadingOverview(false);
      }
    },
    [loadSession]
  );

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    selectedBoxRef.current = selectedBoxNumber;
  }, [selectedBoxNumber]);

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      path: "/socket.io/",
      transports: ["websocket", "polling"],
    });

    socket.on("packing_update", (payload = {}) => {
      const message = buildPackingFeedMessage(payload);
      setFeed((prev) => [{ id: `${Date.now()}-${Math.random()}`, message, timestamp: new Date().toISOString() }, ...prev].slice(0, 40));

      if (String(payload.event || "").toUpperCase() === "BOX_CLOSED") {
        setPopup({
          type: "SUCCESS",
          title: "Box Completed",
          message: `Box ${payload.boxNumber || "-"} filled successfully. Label ${payload.labelCode || "-"} generated.`,
        });
      }

      if (String(payload.event || "").toUpperCase() === "NEXT_BOX_READY") {
        setPopup({
          type: "INFO",
          title: "Continue Packing",
          message: payload.boxNumber
            ? `Now use next box ${payload.boxNumber} for further packing.`
            : "Current box finished. Generate next box from Packing Management.",
        });
      }

      loadOverview(payload.boxNumber || "").catch(() => {});
    });

    socket.on("operator_popup", (payload = {}) => {
      if (payload.stationNo === "PACKING" || String(payload.message || "").toUpperCase().includes("PACK")) {
        setPopup({
          type: payload.type || "INFO",
          title: payload.title || "Packing Update",
          message: payload.message || "Packing event received",
        });
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [loadOverview]);

  const handleSelectBox = async (event) => {
    const value = String(event.target.value || "").trim().toUpperCase();
    setSelectedBoxNumber(value);
    selectedBoxRef.current = value;
    const selectedOption = sessionOptions.find(
      (entry) => String(entry?.boxNumber || "").trim().toUpperCase() === value
    );
    await loadSession(value, selectedOption?.isVirtual ? selectedOption : null);
  };

  const handlePrint = () => {
    if (!selectedSession) {
      return;
    }

    const labelCode = selectedSession.labelCode || `PKG-${selectedSession.boxNumber}`;
    const barcodeBars = toBars(labelCode);
    const barcodeWidth = barcodeBars.reduce((sum, segment) => sum + segment.width, 0);
    let cursor = 0;
    const rects = barcodeBars
      .map((segment) => {
        const x = cursor;
        cursor += segment.width;
        if (!segment.isBar) {
          return "";
        }
        return `<rect x="${x}" y="0" width="${segment.width}" height="64" fill="#000000"></rect>`;
      })
      .join("");

    const rows = (selectedSession.items || [])
      .map(
        (item) =>
          `<tr>
            <td>${escapeHtml(item.slotNo)}</td>
            <td>${escapeHtml(item.partId)}</td>
            <td>${escapeHtml(item.qrCode || item.partId)}</td>
            <td>${escapeHtml(item.operationNo || "-")}</td>
            <td>${escapeHtml(item.operationResult || "-")}</td>
            <td>${escapeHtml(item.partStatus || "-")}</td>
            <td>${escapeHtml(formatDateTime(item.packedAt))}</td>
          </tr>`
      )
      .join("");

    const printWindow = window.open("", "_blank", "width=1080,height=720");
    if (!printWindow) {
      setPopup({
        type: "ERROR",
        title: "Print Blocked",
        message: "Allow popups to print the packing label.",
      });
      return;
    }

    printWindow.document.write(`<!DOCTYPE html>
<html>
  <head>
    <title>Packing Label - ${escapeHtml(selectedSession.boxNumber)}</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 18px; color: #111827; }
      h1, h2 { margin: 0; }
      .card { border: 1px solid #d1d5db; border-radius: 8px; padding: 12px; margin-bottom: 12px; }
      .meta { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; font-size: 12px; }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12px; }
      th, td { border: 1px solid #d1d5db; padding: 6px; text-align: left; }
      th { background: #f3f4f6; }
      .barcode-wrap { background: #fff; border: 1px solid #111827; padding: 8px; border-radius: 6px; margin-top: 8px; }
      .mono { font-family: Consolas, monospace; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Final Packing Label</h1>
      <p style="margin:6px 0 0;">Traceability Box Summary</p>
      <div class="meta">
        <div><strong>Box</strong><br>${escapeHtml(selectedSession.boxNumber)}</div>
        <div><strong>Label</strong><br class="mono">${escapeHtml(labelCode)}</div>
        <div><strong>Packed</strong><br>${escapeHtml(
          `${selectedSession.packedCount}/${selectedSession.capacity}`
        )}</div>
        <div><strong>Status</strong><br>${escapeHtml(selectedSession.status)}</div>
        <div><strong>Created</strong><br>${escapeHtml(formatDateTime(selectedSession.createdAt))}</div>
        <div><strong>Closed</strong><br>${escapeHtml(formatDateTime(selectedSession.closedAt))}</div>
        <div><strong>Final Station</strong><br>${escapeHtml(finalPackingStationText)}</div>
        <div><strong>Print Time</strong><br>${escapeHtml(new Date().toLocaleString())}</div>
      </div>
      <div class="barcode-wrap">
        <svg viewBox="0 0 ${barcodeWidth} 64" style="width:100%; height:64px;">${rects}</svg>
      </div>
      <p class="mono" style="margin-top:8px;">${escapeHtml(labelCode)}</p>
    </div>

    <h2>Packed Part Details</h2>
    <table>
      <thead>
        <tr>
          <th>Slot</th>
          <th>Part</th>
          <th>QR</th>
          <th>Operation</th>
          <th>Result</th>
          <th>Part Status</th>
          <th>Packed At</th>
        </tr>
      </thead>
      <tbody>${rows || "<tr><td colspan='7'>No items</td></tr>"}</tbody>
    </table>
  </body>
</html>`);

    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  return (
    <div className="space-y-6">
      <GlobalPopup popup={popup} onClose={() => setPopup(null)} simple />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-primary/10 border border-primary/20">
            <Boxes className="text-primary" size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-text-main">Final Packing Station</h1>
            <p className="text-text-muted text-sm">Scanner-driven flow only. Active box is auto-generated from Packing Management format.</p>
            <p className="text-xs text-text-muted mt-1">
              Configured Final Packing Station: <span className="text-primary font-semibold">{finalPackingStationText}</span>
            </p>
            <p className="text-xs text-text-muted mt-1">
              Next/First Box ID:{" "}
              <span className="text-emerald-300 font-mono">
                {overview.managementSettings?.preview || displaySession?.boxNumber || "BOX-0001"}
              </span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div>
            <select
              value={selectedBoxNumber}
              onChange={handleSelectBox}
              className="mt-1 w-[280px] rounded-lg border border-border bg-bg-dark px-3 py-2 text-sm text-text-main focus:border-primary focus:outline-none font-mono"
            >
              {sessionOptions.length === 0 && <option value="">No boxes found</option>}
              {sessionOptions.map((session) => (
                <option key={session.id} value={session.boxNumber}>
                  {session.boxNumber} | {session.packedCount}/{session.capacity} | {session.isVirtual ? "NEXT" : session.status}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={() => loadOverview(selectedBoxNumber)}
            className="px-3 py-2 rounded-lg bg-bg-card border border-border text-text-muted hover:border-primary inline-flex items-center gap-2"
            disabled={loadingOverview}
          >
            <RefreshCw size={14} className={loadingOverview ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 industrial-card p-6">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <div>
              <p className="text-xs uppercase text-text-muted">Selected Box Layout</p>
              <p className="text-xl font-bold text-primary font-mono">{displaySession?.boxNumber || "-"}</p>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase text-text-muted">Progress</p>
              <p className="text-xl font-bold text-text-main">
                {displaySession ? `${displaySession.packedCount}/${displaySession.capacity}` : "0/0"}
              </p>
            </div>
          </div>

          <div className="w-full bg-bg-dark rounded-full h-2.5 border border-border">
            <div className="bg-primary h-2.5 rounded-full transition-all duration-300" style={{ width: `${displayProgress}%` }} />
          </div>
          <p className="text-xs text-text-muted mt-2">{displayProgress}% filled</p>

          {displaySession ? (
            <>
              <div className="mt-5 grid grid-cols-5 sm:grid-cols-10 gap-2">
                {Array.from({ length: displayCapacity }, (_, index) => {
                  const slotNo = index + 1;
                  const part = filledSlots.get(slotNo);
                  return (
                    <div
                      key={slotNo}
                      onMouseEnter={() => setHoveredSlot({ slotNo, item: part || null })}
                      onMouseLeave={() => setHoveredSlot(null)}
                      className={`h-9 rounded-md border flex items-center justify-center text-[11px] font-mono ${
                        part ? "bg-emerald-500/20 border-emerald-500/60 text-emerald-300" : "bg-bg-dark border-border text-text-muted"
                      }`}
                      title={part ? `Slot ${slotNo}: ${part.partId} | ${formatDateTime(part.packedAt)}` : `Slot ${slotNo}: empty`}
                    >
                      {slotNo}
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 text-xs text-text-muted min-h-[18px]">
                {hoveredSlot ? (
                  <span>
                    Slot {hoveredSlot.slotNo}:{" "}
                    <span className="font-mono text-text-main">{hoveredSlot.item?.partId || "EMPTY"}</span>
                    {hoveredSlot.item?.packedAt ? ` | ${formatDateTime(hoveredSlot.item.packedAt)}` : ""}
                  </span>
                ) : (
                  <span>Hover on green slot to view QR/packed time.</span>
                )}
              </div>
              <div className="mt-3 rounded-lg border border-border bg-bg-dark/70 p-3">
                <p className="text-[11px] uppercase tracking-wide text-text-muted">Latest QR Scanned</p>
                <p className="mt-1 text-sm font-mono text-primary">{latestScanned?.partId || "-"}</p>
                <p className="text-[11px] text-text-muted mt-1">Time: {formatDateTime(latestScanned?.packedAt)}</p>
              </div>
            </>
          ) : (
            <div className="mt-4 rounded-lg border border-border bg-bg-dark/70 p-4 text-sm text-text-muted">
              No active box available right now. Use Packing Management to generate next box.
            </div>
          )}
        </div>

        <div className="industrial-card p-6 space-y-4">
          <h2 className="font-bold text-text-main flex items-center gap-2">
            <Barcode size={18} className="text-primary" />
            Box Label
          </h2>

          {loadingSession ? (
            <p className="text-sm text-text-muted">Loading selected box details...</p>
          ) : selectedSession ? (
            <>
              <div className="rounded-lg border border-border bg-bg-dark/70 p-3 space-y-1">
                <p className="text-xs uppercase text-text-muted">Selected Box</p>
                <p className="text-lg font-mono text-primary">{selectedSession.boxNumber}</p>
                <p className="text-xs text-text-muted">
                  {selectedSession.packedCount}/{selectedSession.capacity} | {selectedSession.status}
                </p>
                <p className="text-xs text-text-muted">Closed: {formatDateTime(selectedSession.closedAt)}</p>
              </div>

              <div className="rounded-lg border border-border bg-bg-dark/70 p-3">
                <p className="text-xs uppercase text-text-muted">Auto Label Code</p>
                <p className="text-sm font-mono text-text-main mt-1">{selectedSession.labelCode || "Not generated yet"}</p>
                <div className="mt-3">
                  <BarcodeStrip value={selectedSession.labelCode || selectedSession.boxNumber} />
                </div>
              </div>

              <button
                type="button"
                onClick={handlePrint}
                className="w-full py-2.5 rounded-lg bg-primary text-bg-dark font-bold hover:brightness-110 inline-flex items-center justify-center gap-2"
                disabled={!selectedSession.labelCode}
              >
                <Printer size={15} />
                Print Packing Label
              </button>

              {!selectedSession.labelCode && (
                <p className="text-[11px] text-text-muted">
                  Label is auto-generated only when box reaches full capacity and closes.
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-text-muted">Select a generated box from dropdown to see label and details.</p>
          )}

          <div className="rounded-lg border border-border bg-bg-dark/70 p-3">
            <p className="text-xs uppercase text-text-muted mb-1 flex items-center gap-2">
              <ScanLine size={12} className="text-primary" />
              Workflow Standard
            </p>
            <ol className="text-xs text-text-muted list-decimal ml-4 space-y-1">
              <li>Box number is auto-generated serial-wise from Packing Management setup.</li>
              <li>Scan only completed parts from configured final packing station.</li>
              <li>When capacity is full, label is auto-generated, box closes, and next box opens automatically.</li>
            </ol>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="industrial-card p-6">
          <h2 className="font-bold text-text-main mb-3 flex items-center gap-2">
            <PackageCheck size={18} className="text-primary" />
            Live Packing Feed
          </h2>
          <div className="space-y-2 max-h-[280px] overflow-y-auto">
            {feed.map((row) => (
              <div key={row.id} className="p-3 rounded-lg bg-bg-dark border border-border">
                <p className="text-sm text-text-main">{row.message}</p>
                <p className="text-xs text-text-muted mt-1">{formatDateTime(row.timestamp)}</p>
              </div>
            ))}
            {feed.length === 0 && <p className="text-sm text-text-muted">Waiting for packing events from scanner TCP.</p>}
          </div>
        </div>

        <div className="industrial-card p-6">
          <h2 className="font-bold text-text-main mb-3">Box History</h2>
          <div className="space-y-2 max-h-[280px] overflow-y-auto">
            {(overview.recentSessions || []).map((session) => (
              <button
                key={session.id}
                type="button"
                onClick={() => {
                  const boxNo = session.boxNumber;
                  setSelectedBoxNumber(boxNo);
                  selectedBoxRef.current = boxNo;
                  loadSession(boxNo).catch(() => {});
                }}
                className={`w-full text-left p-3 rounded-lg border ${
                  selectedSession?.boxNumber === session.boxNumber
                    ? "border-primary bg-primary/10"
                    : "border-border bg-bg-dark hover:border-primary/60"
                }`}
              >
                <p className="text-sm font-mono text-primary">{session.boxNumber}</p>
                <p className="text-xs text-text-muted mt-1">
                  {session.packedCount}/{session.capacity} | {session.status}
                </p>
                <p className="text-xs text-text-muted">{formatDateTime(session.closedAt || session.createdAt)}</p>
              </button>
            ))}
            {(overview.recentSessions || []).length === 0 && <p className="text-sm text-text-muted">No packing sessions available.</p>}
          </div>
        </div>
      </div>

      <div className="industrial-card p-6">
        <h2 className="font-bold text-text-main mb-3">Packed Part Traceability</h2>
        <div className="overflow-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-bg-dark/70 text-text-muted text-xs uppercase tracking-wide">
              <tr>
                <th className="px-3 py-2 text-left">Slot</th>
                <th className="px-3 py-2 text-left">Part ID / QR Code</th>
                <th className="px-3 py-2 text-left">Operation / Machine</th>
                <th className="px-3 py-2 text-left">Result</th>
                <th className="px-3 py-2 text-left">Part Status</th>
                <th className="px-3 py-2 text-left">Packed At</th>
              </tr>
            </thead>
            <tbody>
              {selectedItems.map((item) => (
                <tr key={item.id} className="border-t border-border/60">
                  <td className="px-3 py-2 font-mono text-text-main">{item.slotNo}</td>
                  <td className="px-3 py-2">
                    <p className="font-mono text-primary">{item.partId}</p>
                    <p className="font-mono text-text-muted text-xs">{item.qrCode || item.partId}</p>
                  </td>
                  <td className="px-3 py-2">
                    <p className="text-text-main">{item.operationNo || "-"}</p>
                    <p className="text-text-muted text-xs">{item.machineName || "-"}</p>
                  </td>
                  <td className="px-3 py-2 text-text-main">{item.operationResult || "-"}</td>
                  <td className="px-3 py-2 text-text-main">{item.partStatus || "-"}</td>
                  <td className="px-3 py-2 text-text-muted">{formatDateTime(item.packedAt)}</td>
                </tr>
              ))}
              {selectedItems.length === 0 && (
                <tr>
                  <td className="px-3 py-6 text-center text-text-muted" colSpan={6}>
                    No packed part details found for selected box.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Packing;
