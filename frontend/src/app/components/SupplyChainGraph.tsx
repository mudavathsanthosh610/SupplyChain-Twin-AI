"use client";

import {
  Background,
  Controls,
  Edge,
  MarkerType,
  Node,
  ReactFlow,
} from "@xyflow/react";

import "@xyflow/react/dist/style.css";


type SupplyChainGraphProps = {
  baselineRoute?: string[];
  disruptedRoute?: string[] | null;
};


const NODE_NAMES: Record<string, string> = {
  SH_SUP: "Shanghai Supplier",
  SH_PORT: "Shanghai Port",
  ROT: "Rotterdam Port",
  ANT: "Antwerp Port",
  HAM: "Hamburg Port",
  FRA_WH: "Frankfurt Warehouse",
  BER: "Berlin Customer",
};


const positions: Record<
  string,
  { x: number; y: number }
> = {
  SH_SUP: { x: 0, y: 170 },
  SH_PORT: { x: 240, y: 170 },

  ROT: { x: 500, y: 20 },
  ANT: { x: 500, y: 170 },
  HAM: { x: 500, y: 320 },

  FRA_WH: { x: 790, y: 170 },
  BER: { x: 1050, y: 170 },
};


const ALL_EDGES = [
  ["SH_SUP", "SH_PORT"],
  ["SH_PORT", "ROT"],
  ["ROT", "FRA_WH"],

  ["SH_PORT", "ANT"],
  ["ANT", "FRA_WH"],

  ["SH_PORT", "HAM"],
  ["HAM", "FRA_WH"],

  ["FRA_WH", "BER"],
];


function routeEdgeSet(
  route?: string[] | null
) {
  const result = new Set<string>();

  if (!route) {
    return result;
  }

  for (
    let index = 0;
    index < route.length - 1;
    index++
  ) {
    result.add(
      `${route[index]}->${route[index + 1]}`
    );
  }

  return result;
}


export default function SupplyChainGraph({
  baselineRoute,
  disruptedRoute,
}: SupplyChainGraphProps) {

  const baselineEdges =
    routeEdgeSet(baselineRoute);

  const disruptedEdges =
    routeEdgeSet(disruptedRoute);


  const nodes: Node[] = Object.keys(
    NODE_NAMES
  ).map((id) => {

    const wasInBaseline =
      baselineRoute?.includes(id);

    const stillInDisrupted =
      disruptedRoute?.includes(id);

    const isClosed =
      Boolean(
        wasInBaseline &&
        disruptedRoute &&
        !stillInDisrupted
      );

    const isDisruptedNode =
      Boolean(
        disruptedRoute?.includes(id)
      );

    return {
      id,

      position: positions[id],

      data: {
        label: (
          <div className="text-center">
            <div className="text-sm font-bold">
              {NODE_NAMES[id]}
            </div>

            <div className="mt-1 text-[11px] text-slate-300">
              {id}
            </div>

            {isClosed && (
              <div className="mt-2 rounded-full bg-red-500/20 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-red-300">
                Closed
              </div>
            )}
          </div>
        ),
      },

      style: {
        width: 180,
        minHeight: 78,
        padding: 14,

        border: isClosed
          ? "2px solid #ef4444"
          : isDisruptedNode
          ? "2px solid #f59e0b"
          : "1px solid #475569",

        borderRadius: 16,

        background: isClosed
          ? "#3f0a0a"
          : isDisruptedNode
          ? "#2a1d05"
          : "#0f172a",

        color: "#ffffff",

        boxShadow: isClosed
          ? "0 0 24px rgba(239, 68, 68, 0.25)"
          : isDisruptedNode
          ? "0 0 22px rgba(245, 158, 11, 0.18)"
          : "0 8px 24px rgba(0,0,0,0.22)",
      },
    };
  });


  const edges: Edge[] =
    ALL_EDGES.map(
      ([source, target], index) => {

        const key =
          `${source}->${target}`;

        const isBaseline =
          baselineEdges.has(key);

        const isDisrupted =
          disruptedEdges.has(key);

        let stroke = "#334155";
        let strokeWidth = 1.5;
        let animated = false;

        if (isBaseline) {
          stroke = "#22c55e";
          strokeWidth = 3;
        }

        if (isDisrupted) {
          stroke = "#f59e0b";
          strokeWidth = 4;
          animated = true;
        }

        return {
          id: `edge-${index}`,

          source,
          target,

          animated,

          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: stroke,
            width: 20,
            height: 20,
          },

          style: {
            stroke,
            strokeWidth,
          },
        };
      }
    );


  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">

      {/* LEGEND */}

      <div className="mb-4 flex flex-wrap gap-5 rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-sm">

        <div className="flex items-center gap-2">
          <span className="h-1 w-8 rounded bg-green-500" />
          <span className="text-slate-300">
            Baseline Route
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="h-1 w-8 rounded bg-amber-500" />
          <span className="text-slate-300">
            Disrupted Route
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full border-2 border-red-500 bg-red-950" />
          <span className="text-slate-300">
            Closed Node
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="h-1 w-8 rounded bg-slate-700" />
          <span className="text-slate-300">
            Available Alternate Route
          </span>
        </div>

      </div>

      {/* GRAPH */}

      <div className="h-[560px] w-full overflow-hidden rounded-xl border border-slate-800">

        <ReactFlow
          nodes={nodes}
          edges={edges}
          fitView
          fitViewOptions={{
            padding: 0.18,
          }}
          minZoom={0.35}
          maxZoom={2}
        >

          <Background
            gap={22}
            size={1}
          />

          <Controls />

        </ReactFlow>

      </div>

    </div>
  );
}