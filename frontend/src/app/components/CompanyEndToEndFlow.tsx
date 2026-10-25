"use client";

import { useState } from "react";

type FlowNode = {
  id: number;
  code: string;
  name: string;
  node_type: string;
  city: string | null;
  country: string | null;
  capacity: number | null;
  current_inventory: number;
  daily_demand: number;
  safety_stock: number;
  data_source_type?: string | null;
  source_url?: string | null;
  updated_at?: string | null;
  active: boolean;
};

type FlowRoute = {
  id: number;
  source_node_id: number;
  destination_node_id: number;
  transport_mode: string;
  base_cost: number;
  lead_time_days: number;
  capacity: number;
  data_source_type?: string | null;
  source_reference?: string | null;
  updated_at?: string | null;
  active: boolean;
};

type CompanyEndToEndFlowProps = {
  companyName: string;
  businessType?: string | null;
  workflow?: string | null;
  isSynthetic: boolean;
  nodes: FlowNode[];
  routes: FlowRoute[];
};

const STAGES = [
  {
    label: "Supply",
    description: "Supplier",
    matches: (type: string) => type.includes("SUPPLIER"),
    color: "border-violet-400 bg-violet-950/70 text-violet-100",
  },
  {
    label: "Production",
    description: "Plant",
    matches: (type: string) =>
      type.includes("PLANT") || type.includes("FACTORY"),
    color: "border-emerald-400 bg-emerald-950/70 text-emerald-100",
  },
  {
    label: "Gateways",
    description: "Port",
    matches: (type: string) => type.includes("PORT"),
    color: "border-sky-400 bg-sky-950/70 text-sky-100",
  },
  {
    label: "Distribution",
    description: "Warehouse / distribution centre",
    matches: (type: string) =>
      type.includes("WAREHOUSE") || type.includes("DISTRIBUTION"),
    color: "border-amber-400 bg-amber-950/70 text-amber-100",
  },
  {
    label: "Demand",
    description: "Customer",
    matches: (type: string) => type.includes("CUSTOMER"),
    color: "border-rose-400 bg-rose-950/70 text-rose-100",
  },
  {
    label: "Other",
    description: "Other location",
    matches: () => true,
    color: "border-slate-500 bg-slate-900 text-slate-100",
  },
] as const;

const MODE_COLORS: Record<string, string> = {
  road: "#fb923c",
  truck: "#fb923c",
  rail: "#a78bfa",
  sea: "#38bdf8",
  ship: "#38bdf8",
  air: "#f472b6",
};

const NODE_WIDTH = 176;
const COLUMN_GAP = 58;
const COLUMN_STEP = NODE_WIDTH + COLUMN_GAP;
const GRAPH_WIDTH = STAGES.length * NODE_WIDTH + (STAGES.length - 1) * COLUMN_GAP;
const CARD_HEIGHT = 84;
const ROW_STEP = 108;
const TOP_OFFSET = 74;

function stageIndexFor(nodeType: string) {
  const normalized = nodeType.toUpperCase();
  const index = STAGES.findIndex((stage, stageIndex) =>
    stageIndex < STAGES.length - 1 && stage.matches(normalized)
  );
  return index < 0 ? STAGES.length - 1 : index;
}

function formatAmount(value: number | null | undefined) {
  return value == null || !Number.isFinite(value)
    ? "Not recorded"
    : new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value);
}

export default function CompanyEndToEndFlow({
  companyName,
  businessType,
  workflow,
  isSynthetic,
  nodes,
  routes,
}: CompanyEndToEndFlowProps) {
  const [showInactive, setShowInactive] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const activeNodes = nodes.filter((node) => node.active);
  const visibleNodes = nodes.filter((node) => showInactive || node.active);
  const visibleRoutes = routes.filter(
    (route) => showInactive || route.active
  );
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const nodesByStage = STAGES.map((_, index) =>
    visibleNodes.filter((node) => stageIndexFor(node.node_type) === index)
  );
  const maxRows = Math.max(1, ...nodesByStage.map((stageNodes) => stageNodes.length));
  const graphHeight = TOP_OFFSET + maxRows * ROW_STEP + 24;
  const nodePositions = new Map<number, { x: number; y: number }>();

  nodesByStage.forEach((stageNodes, stageIndex) => {
    const stageOffset = ((maxRows - stageNodes.length) * ROW_STEP) / 2;
    stageNodes.forEach((node, rowIndex) => {
      nodePositions.set(node.id, {
        x: stageIndex * COLUMN_STEP,
        y: TOP_OFFSET + stageOffset + rowIndex * ROW_STEP,
      });
    });
  });

  const connectedNodeIds = new Set<number>();
  for (const route of routes.filter((item) => item.active)) {
    const source = nodeById.get(route.source_node_id);
    const destination = nodeById.get(route.destination_node_id);
    if (source?.active && destination?.active) {
      connectedNodeIds.add(source.id);
      connectedNodeIds.add(destination.id);
    }
  }
  const unconnectedCount = activeNodes.filter(
    (node) => !connectedNodeIds.has(node.id)
  ).length;
  const selectedNode =
    visibleNodes.find((node) => node.id === selectedNodeId) ?? null;
  const selectedRoutes = selectedNode
    ? routes.filter(
        (route) =>
          route.source_node_id === selectedNode.id ||
          route.destination_node_id === selectedNode.id
      )
    : [];
  const activeRouteCount = routes.filter((route) => route.active).length;
  const transportModes = [
    ...new Set(
      visibleRoutes.map((route) => route.transport_mode.trim()).filter(Boolean)
    ),
  ];
  const allRecordsSynthetic =
    nodes.length + routes.length > 0 &&
    [...nodes, ...routes].every(
      (record) =>
        (record.data_source_type ?? "").trim().toUpperCase() ===
        "DEMO / SYNTHETIC"
    );

  return (
    <section
      aria-labelledby="company-end-to-end-heading"
      className="mb-8 rounded-2xl border border-slate-800 bg-slate-950 p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-400">
            Company flow
          </p>
          <h2
            id="company-end-to-end-heading"
            className="mt-1 text-xl font-semibold text-white sm:text-2xl"
          >
            End-to-end supply chain
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Follow {companyName}&apos;s recorded network from supply through
            production, transport, distribution, and customer demand. Arrows
            show the saved route direction; stages organize locations for
            readability and do not imply a route where none is recorded.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowInactive((current) => !current)}
          aria-pressed={showInactive}
          className="rounded-lg border border-slate-700 px-3 py-2 text-sm font-medium text-slate-200 transition hover:border-cyan-600 hover:bg-slate-900"
        >
          {showInactive ? "Hide inactive locations" : "Show inactive locations"}
        </button>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {[
          { label: "Active locations", value: activeNodes.length, tint: "text-cyan-200" },
          { label: "Active routes", value: activeRouteCount, tint: "text-emerald-200" },
          { label: "Unconnected locations", value: unconnectedCount, tint: unconnectedCount ? "text-amber-200" : "text-emerald-200" },
        ].map((metric) => (
          <div
            key={metric.label}
            className="rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-3"
          >
            <p className="text-xs uppercase tracking-wide text-slate-500">
              {metric.label}
            </p>
            <p className={`mt-1 text-xl font-semibold ${metric.tint}`}>
              {metric.value}
            </p>
          </div>
        ))}
      </div>

      {(isSynthetic || allRecordsSynthetic) && (
        <p className="mt-4 rounded-xl border border-amber-800/70 bg-amber-950/30 px-4 py-3 text-sm leading-6 text-amber-100">
          Synthetic demonstration records are shown as examples, not verified
          company operations. This visualization reflects saved records and
          does not validate their accuracy.
        </p>
      )}

      {(businessType || workflow) && (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {businessType && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Business
              </p>
              <p className="mt-1 text-sm font-medium text-slate-100">
                {businessType}
              </p>
            </div>
          )}
          {workflow && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Company workflow
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-300">
                {workflow}
              </p>
            </div>
          )}
        </div>
      )}

      {nodes.length === 0 ? (
        <div className="mt-5 rounded-xl border border-dashed border-slate-700 bg-slate-900/40 p-8 text-center">
          <p className="font-medium text-slate-200">
            No company locations are available to visualize yet.
          </p>
          <p className="mt-2 text-sm text-slate-400">
            Add or import locations and routes to build the company flow.
          </p>
          <a
            href="#operational-dataset"
            className="mt-4 inline-flex rounded-lg border border-cyan-800 px-3 py-2 text-sm font-medium text-cyan-200 transition hover:border-cyan-500 hover:bg-cyan-950/40"
          >
            Add company data
          </a>
        </div>
      ) : (
        <>
          <div className="mt-5 overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/40">
            <div
              className="relative"
              style={{ width: GRAPH_WIDTH, height: graphHeight }}
            >
              <div className="absolute inset-x-0 top-0 z-10 grid" style={{ gridTemplateColumns: `repeat(${STAGES.length}, ${NODE_WIDTH}px)`, columnGap: COLUMN_GAP }}>
                {STAGES.map((stage) => (
                  <div key={stage.label} className="px-1 pt-4">
                    <p className="text-sm font-semibold text-slate-100">
                      {stage.label}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {stage.description}
                    </p>
                  </div>
                ))}
              </div>

              <svg
                aria-hidden="true"
                className="pointer-events-none absolute inset-0"
                width={GRAPH_WIDTH}
                height={graphHeight}
                viewBox={`0 0 ${GRAPH_WIDTH} ${graphHeight}`}
              >
                <defs>
                  {visibleRoutes.map((route) => {
                    const mode = route.transport_mode.trim().toLowerCase();
                    const color = MODE_COLORS[mode] ?? "#94a3b8";
                    return (
                      <marker
                        key={`arrow-${route.id}`}
                        id={`company-flow-arrow-${route.id}`}
                        markerWidth="8"
                        markerHeight="8"
                        refX="6"
                        refY="4"
                        orient="auto"
                      >
                        <path d="M0,0 L8,4 L0,8 z" fill={color} />
                      </marker>
                    );
                  })}
                </defs>
                {visibleRoutes.map((route) => {
                  const source = nodePositions.get(route.source_node_id);
                  const destination = nodePositions.get(route.destination_node_id);
                  if (!source || !destination) return null;
                  const sourceOnLeft = destination.x >= source.x;
                  const startX = source.x + (sourceOnLeft ? NODE_WIDTH : 0);
                  const endX = destination.x + (sourceOnLeft ? 0 : NODE_WIDTH);
                  const startY = source.y + CARD_HEIGHT / 2;
                  const endY = destination.y + CARD_HEIGHT / 2;
                  const controlX = (startX + endX) / 2;
                  const mode = route.transport_mode.trim().toLowerCase();
                  const color = MODE_COLORS[mode] ?? "#94a3b8";
                  return (
                    <g key={route.id}>
                    <path
                      d={`M ${startX} ${startY} C ${controlX} ${startY}, ${controlX} ${endY}, ${endX} ${endY}`}
                      fill="none"
                      stroke={color}
                      strokeWidth={route.active ? 2.5 : 1.5}
                      strokeDasharray={route.active ? undefined : "6 5"}
                      opacity={route.active ? 0.8 : 0.35}
                      markerEnd={`url(#company-flow-arrow-${route.id})`}
                    />
                    <text
                      x={controlX}
                      y={(startY + endY) / 2 - 7}
                      textAnchor="middle"
                      fill={color}
                      stroke="#0f172a"
                      strokeWidth="5"
                      strokeLinejoin="round"
                      paintOrder="stroke"
                      fontSize="9"
                      fontWeight="700"
                      letterSpacing="0.4"
                    >
                      {route.transport_mode.toUpperCase()}
                    </text>
                    </g>
                  );
                })}
              </svg>

              {nodesByStage.map((stageNodes, stageIndex) =>
                stageNodes.map((node) => {
                  const position = nodePositions.get(node.id);
                  if (!position) return null;
                  const stage = STAGES[stageIndex];
                  const selected = selectedNodeId === node.id;
                  return (
                    <button
                      key={node.id}
                      type="button"
                      aria-pressed={selected}
                      aria-label={`${node.name}, ${stage.description}, ${node.active ? "active" : "inactive"}`}
                      onClick={() =>
                        setSelectedNodeId((current) =>
                          current === node.id ? null : node.id
                        )
                      }
                      className={`absolute z-10 flex flex-col justify-center rounded-xl border px-3 text-left shadow-lg transition hover:-translate-y-0.5 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${stage.color} ${
                        selected
                          ? "ring-2 ring-cyan-300 ring-offset-2 ring-offset-slate-950"
                          : ""
                      } ${node.active ? "" : "opacity-50 grayscale"}`}
                      style={{
                        left: position.x,
                        top: position.y,
                        width: NODE_WIDTH,
                        height: CARD_HEIGHT,
                      }}
                    >
                      <span className="truncate text-sm font-semibold">
                        {node.name}
                      </span>
                      <span className="mt-1 truncate text-[11px] opacity-75">
                        {node.code} · {node.node_type.replaceAll("_", " ")}
                      </span>
                      <span className="mt-1 truncate text-[10px] opacity-70">
                        {[node.city, node.country].filter(Boolean).join(", ") ||
                          "Location not recorded"}
                        {!node.active ? " · Inactive" : ""}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-400">
            {[
              ["Supplier", "#a78bfa"],
              ["Production", "#34d399"],
              ["Port", "#38bdf8"],
              ["Distribution", "#fbbf24"],
              ["Customer", "#fb7185"],
            ].map(([label, color]) => (
              <span key={label} className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: color }}
                />
                {label}
              </span>
            ))}
            <span className="text-slate-500">
              Select a location to inspect its data and connected routes.
            </span>
          </div>
          {transportModes.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2 text-xs">
              <span className="font-semibold uppercase tracking-wide text-slate-500">
                Route mode
              </span>
              {transportModes.map((mode) => (
                <span key={mode} className="flex items-center gap-2 text-slate-300">
                  <span
                    className="h-0.5 w-6 rounded-full"
                    style={{
                      backgroundColor:
                        MODE_COLORS[mode.toLowerCase()] ?? "#94a3b8",
                    }}
                  />
                  {mode}
                </span>
              ))}
              <span className="text-slate-500">
                Arrowheads follow the saved route direction.
              </span>
            </div>
          )}

          {selectedNode && (
            <div
              aria-live="polite"
              className="mt-4 rounded-xl border border-cyan-900/70 bg-cyan-950/20 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-cyan-300">
                    Location details
                  </p>
                  <h3 className="mt-1 font-semibold text-white">
                    {selectedNode.name}
                  </h3>
                  <p className="mt-1 text-sm text-slate-400">
                    {selectedNode.code} ·{" "}
                    {selectedNode.node_type.replaceAll("_", " ")} ·{" "}
                    {[selectedNode.city, selectedNode.country]
                      .filter(Boolean)
                      .join(", ") || "No location details saved"}
                  </p>
                </div>
                <span className="rounded-full border border-slate-700 px-2.5 py-1 text-xs text-slate-300">
                  {selectedNode.active ? "Active" : "Inactive"}
                </span>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ["Capacity", formatAmount(selectedNode.capacity)],
                  ["Inventory", formatAmount(selectedNode.current_inventory)],
                  ["Daily demand", formatAmount(selectedNode.daily_demand)],
                  ["Safety stock", formatAmount(selectedNode.safety_stock)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg bg-slate-950/70 p-3">
                    <dt className="text-xs text-slate-500">{label}</dt>
                    <dd className="mt-1 text-sm font-semibold text-slate-100">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
              <div className="mt-4 border-t border-cyan-900/50 pt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Connected route records ({selectedRoutes.length})
                </p>
                {selectedRoutes.length > 0 ? (
                  <ul className="mt-2 space-y-2">
                    {selectedRoutes.map((route) => {
                      const source = nodeById.get(route.source_node_id);
                      const destination = nodeById.get(
                        route.destination_node_id
                      );
                      return (
                        <li
                          key={route.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-950/70 px-3 py-2 text-sm"
                        >
                          <span className="text-slate-200">
                            {source?.name ?? "Unknown location"}{" "}
                            <span className="text-cyan-300">→</span>{" "}
                            {destination?.name ?? "Unknown location"}
                          </span>
                          <span className="text-xs text-slate-400">
                            {route.transport_mode} ·{" "}
                            {formatAmount(route.lead_time_days)} days ·{" "}
                            {formatAmount(route.base_cost)} cost ·{" "}
                            {formatAmount(route.capacity)} capacity ·{" "}
                            {route.active ? "Active" : "Inactive"}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-amber-200">
                    No saved routes connect to this location.
                  </p>
                )}
                <p className="mt-3 text-xs text-slate-500">
                  Source: {selectedNode.data_source_type || "Not recorded"}
                  {selectedNode.updated_at
                    ? ` · Updated ${selectedNode.updated_at.replace("T", " ").slice(0, 16)}`
                    : " · Update date unknown"}
                </p>
                {selectedNode.source_url && (
                  <a
                    href={selectedNode.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-block break-all text-xs text-cyan-300 underline decoration-cyan-800 underline-offset-2 hover:text-cyan-100"
                  >
                    Open recorded source reference
                  </a>
                )}
              </div>
            </div>
          )}

          <div className="mt-5 overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full min-w-[900px] text-left text-sm">
              <caption className="sr-only">
                Saved end-to-end company routes
              </caption>
              <thead className="bg-slate-900 text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th scope="col" className="px-4 py-3">From</th>
                  <th scope="col" className="px-4 py-3">To</th>
                  <th scope="col" className="px-4 py-3">Mode</th>
                  <th scope="col" className="px-4 py-3">Lead time</th>
                  <th scope="col" className="px-4 py-3">Cost</th>
                  <th scope="col" className="px-4 py-3">Capacity</th>
                  <th scope="col" className="px-4 py-3">Status / source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {visibleRoutes.map((route) => (
                  <tr key={route.id} className="bg-slate-950/60">
                    <td className="px-4 py-3 font-medium text-slate-200">
                      {nodeById.get(route.source_node_id)?.name ??
                        "Unknown location"}
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {nodeById.get(route.destination_node_id)?.name ??
                        "Unknown location"}
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {route.transport_mode}
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {formatAmount(route.lead_time_days)} days
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {formatAmount(route.base_cost)}
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {formatAmount(route.capacity)}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      <span>{route.active ? "Active" : "Inactive"}</span>
                      <span className="mt-1 block">
                        {route.data_source_type || "Source not recorded"}
                      </span>
                      {route.source_reference && (
                        /^https?:\/\//i.test(route.source_reference) ? (
                          <a
                            href={route.source_reference}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 block max-w-56 truncate text-cyan-300 underline decoration-cyan-800 underline-offset-2 hover:text-cyan-100"
                            title={route.source_reference}
                          >
                            Open route source
                          </a>
                        ) : (
                          <span className="mt-1 block max-w-56 truncate" title={route.source_reference}>
                            {route.source_reference}
                          </span>
                        )
                      )}
                    </td>
                  </tr>
                ))}
                {visibleRoutes.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-6 text-center text-slate-400"
                    >
                      No saved routes connect the currently visible locations.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-500">
            This view summarizes recorded company nodes, routes, profile, and
            provenance. It does not infer missing links or verify operational
            accuracy. Use the readiness checks to review structural data gaps.
          </p>
        </>
      )}
    </section>
  );
}
