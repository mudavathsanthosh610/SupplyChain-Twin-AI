"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { API_URL, apiFetch } from "../api";

type ExpectedImpact = {
  risk_level: string;
  cost_change_percent: number | null;
  delay_change_days: number | null;
  stockout_locations: number;
  emergency_inventory_units: number;
};

type ActionStatus = "OPEN" | "IN_PROGRESS" | "DONE";

type ControlTowerAction = {
  id: number;
  company_id: number;
  scenario_message: string;
  recommendation: string;
  owner: string | null;
  due_date: string | null;
  status: ActionStatus;
  expected_impact: ExpectedImpact | null;
  actual_cost_change_percent: number | null;
  actual_delay_change_days: number | null;
  actual_stockout_locations: number | null;
  actual_emergency_inventory_units: number | null;
  actual_outcome: string | null;
  is_sample: boolean;
  created_at: string;
  updated_at: string;
};

type ActionDraft = {
  owner: string;
  due_date: string;
  actual_outcome: string;
  actual_cost_change_percent: string;
  actual_delay_change_days: string;
  actual_stockout_locations: string;
  actual_emergency_inventory_units: string;
};

type CurrentSimulation = {
  scenario: string;
  recommendedActions: string[];
  expectedImpact: ExpectedImpact;
};

type ControlTowerProps = {
  companyId: number;
  simulation: CurrentSimulation | null;
  onAlertHandled: () => void;
  alertToTrack?: {
    id: number;
    recommendation: string;
  } | null;
};

const STATUS_LABELS: Record<ActionStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  DONE: "Done",
};

function isActionStatus(value: string): value is ActionStatus {
  return value === "OPEN" || value === "IN_PROGRESS" || value === "DONE";
}

function metricDraft(value: number | null): string {
  return value === null ? "" : String(value);
}

function metricDelta(actual: number, modeled: number, unit: string): string {
  const delta = actual - modeled;
  const formatted = Number.isInteger(delta)
    ? String(delta)
    : delta.toFixed(1).replace(/\.0$/, "");
  return `${delta > 0 ? "+" : ""}${formatted} ${unit}`;
}

function numericDraft(value: string): number | null {
  if (!value.trim()) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function readResponse<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(
      typeof data?.detail === "string" ? data.detail : "The control tower request failed.",
    );
  }
  return data as T;
}

export default function ControlTower({
  companyId,
  simulation,
  onAlertHandled,
  alertToTrack = null,
}: ControlTowerProps) {
  const [actions, setActions] = useState<ControlTowerAction[]>([]);
  const [drafts, setDrafts] = useState<Record<number, ActionDraft>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [updatingActionId, setUpdatingActionId] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [scenarioMessage, setScenarioMessage] = useState("");
  const [recommendation, setRecommendation] = useState("");
  const [owner, setOwner] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [expectedImpact, setExpectedImpact] = useState<ExpectedImpact | null>(
    null,
  );
  const [isSample, setIsSample] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiFetch(`${API_URL}/companies/${companyId}/actions`)
      .then((response) => readResponse<ControlTowerAction[]>(response))
      .then((data) => {
        if (!cancelled) {
          setActions(data);
          setDrafts(
            Object.fromEntries(
              data.map((action) => [
                action.id,
                {
                  owner: action.owner ?? "",
                  due_date: action.due_date ?? "",
                  actual_outcome: action.actual_outcome ?? "",
                  actual_cost_change_percent: metricDraft(
                    action.actual_cost_change_percent,
                  ),
                  actual_delay_change_days: metricDraft(
                    action.actual_delay_change_days,
                  ),
                  actual_stockout_locations: metricDraft(
                    action.actual_stockout_locations,
                  ),
                  actual_emergency_inventory_units: metricDraft(
                    action.actual_emergency_inventory_units,
                  ),
                },
              ]),
            ),
          );
          setError("");
        }
      })
      .catch((requestError: unknown) => {
        if (!cancelled) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Unable to load control tower actions.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const openActionForm = useCallback((selectedRecommendation = "") => {
    setScenarioMessage(simulation?.scenario ?? "");
    setRecommendation(selectedRecommendation);
    setOwner("");
    setDueDate("");
    setExpectedImpact(simulation?.expectedImpact ?? null);
    setIsSample(false);
    setFormOpen(true);
    setError("");
  }, [simulation]);

  useEffect(() => {
    if (alertToTrack) {
      const timeout = window.setTimeout(() => {
        openActionForm(alertToTrack.recommendation);
        onAlertHandled();
        requestAnimationFrame(() => {
          document
            .getElementById("control-tower-scenario")
            ?.scrollIntoView({ behavior: "smooth", block: "center" });
        });
      }, 0);
      return () => window.clearTimeout(timeout);
    }
  }, [alertToTrack, onAlertHandled, openActionForm]);

  function changeActionDraft(
    action: ControlTowerAction,
    update: Partial<ActionDraft>,
  ) {
    const defaults: ActionDraft = {
      owner: action.owner ?? "",
      due_date: action.due_date ?? "",
      actual_outcome: action.actual_outcome ?? "",
      actual_cost_change_percent: metricDraft(
        action.actual_cost_change_percent,
      ),
      actual_delay_change_days: metricDraft(action.actual_delay_change_days),
      actual_stockout_locations: metricDraft(action.actual_stockout_locations),
      actual_emergency_inventory_units: metricDraft(
        action.actual_emergency_inventory_units,
      ),
    };
    setDrafts((current) => ({
      ...current,
      [action.id]: {
        ...defaults,
        ...current[action.id],
        ...update,
      },
    }));
  }

  function fillSampleAction() {
    const due = new Date();
    due.setDate(due.getDate() + 3);
    const dueDateValue = [
      due.getFullYear(),
      String(due.getMonth() + 1).padStart(2, "0"),
      String(due.getDate()).padStart(2, "0"),
    ].join("-");

    setScenarioMessage(
      "Example only: A key port is unavailable for 3 days during a planned shipment.",
    );
    setRecommendation(
      "Confirm alternate carrier capacity and written rates before rerouting affected shipments.",
    );
    setOwner("Logistics coordinator (example)");
    setDueDate(dueDateValue);
    setExpectedImpact({
      risk_level: "MEDIUM (example)",
      cost_change_percent: 12,
      delay_change_days: 2,
      stockout_locations: 1,
      emergency_inventory_units: 250,
    });
    setIsSample(true);
    setError("");
  }

  async function createAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      const response = await apiFetch(`${API_URL}/companies/${companyId}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenario_message: scenarioMessage,
          recommendation,
          owner: owner.trim() || null,
          due_date: dueDate || null,
          expected_impact: expectedImpact,
          is_sample: isSample,
        }),
      });
      const created = await readResponse<ControlTowerAction>(response);
      setActions((current) => [created, ...current]);
      setDrafts((current) => ({
        ...current,
        [created.id]: {
          owner: created.owner ?? "",
          due_date: created.due_date ?? "",
          actual_outcome: created.actual_outcome ?? "",
          actual_cost_change_percent: metricDraft(
            created.actual_cost_change_percent,
          ),
          actual_delay_change_days: metricDraft(
            created.actual_delay_change_days,
          ),
          actual_stockout_locations: metricDraft(
            created.actual_stockout_locations,
          ),
          actual_emergency_inventory_units: metricDraft(
            created.actual_emergency_inventory_units,
          ),
        },
      }));
      setFormOpen(false);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to create the action.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(actionId: number, status: ActionStatus) {
    await updateAction(actionId, { status });
  }

  async function updateAction(
    actionId: number,
    update: {
      status?: ActionStatus;
      owner?: string | null;
      due_date?: string | null;
      actual_outcome?: string | null;
      actual_cost_change_percent?: number | null;
      actual_delay_change_days?: number | null;
      actual_stockout_locations?: number | null;
      actual_emergency_inventory_units?: number | null;
    },
  ) {
    setError("");
    setUpdatingActionId(actionId);
    try {
      const response = await apiFetch(
        `${API_URL}/companies/${companyId}/actions/${actionId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(update),
        },
      );
      const updated = await readResponse<ControlTowerAction>(response);
      setActions((current) =>
        current.map((action) => (action.id === updated.id ? updated : action)),
      );
      setDrafts((current) => ({
        ...current,
        [updated.id]: {
          owner: updated.owner ?? "",
          due_date: updated.due_date ?? "",
          actual_outcome: updated.actual_outcome ?? "",
          actual_cost_change_percent: metricDraft(
            updated.actual_cost_change_percent,
          ),
          actual_delay_change_days: metricDraft(
            updated.actual_delay_change_days,
          ),
          actual_stockout_locations: metricDraft(
            updated.actual_stockout_locations,
          ),
          actual_emergency_inventory_units: metricDraft(
            updated.actual_emergency_inventory_units,
          ),
        },
      }));
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to update the action.",
      );
    } finally {
      setUpdatingActionId(null);
    }
  }

  const openCount = actions.filter((action) => action.status === "OPEN").length;
  const inProgressCount = actions.filter(
    (action) => action.status === "IN_PROGRESS",
  ).length;
  const doneCount = actions.filter((action) => action.status === "DONE").length;

  return (
    <section
      aria-labelledby="control-tower-heading"
      className="my-8 rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
            Control tower
          </p>
          <h2
            id="control-tower-heading"
            className="mt-2 text-2xl font-semibold text-white"
          >
            Mitigation actions
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Turn modeled recommendations into owned follow-up work. Impact values
            are simulation estimates, not confirmed outcomes.
          </p>
        </div>
        <button
          type="button"
          onClick={() => openActionForm()}
          className="shrink-0 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-4 py-2.5 text-sm font-medium text-cyan-200 transition hover:bg-cyan-500/20"
        >
          + Create action
        </button>
      </div>

      {simulation && simulation.recommendedActions.length > 0 && (
        <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
          <p className="text-sm font-medium text-slate-200">
            From the latest simulation
          </p>
          <div className="mt-3 grid gap-2">
            {simulation.recommendedActions.map((item, index) => (
              <button
                key={`${index}-${item}`}
                type="button"
                onClick={() => openActionForm(item)}
                className="flex items-start justify-between gap-3 rounded-lg border border-slate-800 px-3 py-3 text-left text-sm text-slate-300 transition hover:border-cyan-700 hover:bg-slate-900"
              >
                <span className="leading-6">{item}</span>
                <span className="shrink-0 pt-0.5 text-xs font-medium text-cyan-300">
                  Track action
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5 grid grid-cols-3 gap-2 sm:max-w-md">
        {[
          { label: "Open", value: openCount, color: "text-amber-300" },
          { label: "In progress", value: inProgressCount, color: "text-cyan-300" },
          { label: "Completed", value: doneCount, color: "text-emerald-300" },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-3"
          >
            <p className={`text-xl font-semibold ${item.color}`}>{item.value}</p>
            <p className="mt-1 text-xs text-slate-500">{item.label}</p>
          </div>
        ))}
      </div>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-red-900/70 bg-red-950/40 px-4 py-3 text-sm text-red-200"
        >
          {error}
        </p>
      )}

      {formOpen && (
        <form
          onSubmit={createAction}
          className="mt-5 grid gap-4 rounded-xl border border-cyan-900/60 bg-slate-950 p-4 sm:grid-cols-2"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-2">
            <div>
              <h3 className="font-medium text-slate-100">
                {isSample ? "Illustrative sample action" : "New mitigation action"}
              </h3>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                {isSample
                  ? "Example values only—not real company data. Saving adds this clearly labeled example to the board."
                  : "Complete the fields below, or load an example to see how action tracking works."}
              </p>
            </div>
            <button
              type="button"
              onClick={fillSampleAction}
              className="rounded-lg border border-amber-700/70 bg-amber-950/30 px-3 py-2 text-xs font-medium text-amber-200 transition hover:border-amber-500"
            >
              Fill sample values
            </button>
          </div>
          <div className="sm:col-span-2">
            <label
              htmlFor="control-tower-scenario"
              className="mb-1.5 block text-sm font-medium text-slate-200"
            >
              Scenario or incident
            </label>
            <input
              id="control-tower-scenario"
              value={scenarioMessage}
              onChange={(event) => setScenarioMessage(event.target.value)}
              required
              maxLength={10000}
              placeholder="Describe the disruption or planning scenario"
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-500"
            />
          </div>
          <div className="sm:col-span-2">
            <label
              htmlFor="control-tower-recommendation"
              className="mb-1.5 block text-sm font-medium text-slate-200"
            >
              Action to track
            </label>
            <textarea
              id="control-tower-recommendation"
              value={recommendation}
              onChange={(event) => setRecommendation(event.target.value)}
              required
              minLength={1}
              maxLength={10000}
              rows={3}
              placeholder="Add a mitigation step or operational follow-up"
              className="w-full resize-y rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm leading-6 text-white outline-none focus:border-cyan-500"
            />
          </div>
          <div>
            <label
              htmlFor="control-tower-owner"
              className="mb-1.5 block text-sm font-medium text-slate-200"
            >
              Owner <span className="font-normal text-slate-500">optional</span>
            </label>
            <input
              id="control-tower-owner"
              value={owner}
              onChange={(event) => setOwner(event.target.value)}
              maxLength={200}
              placeholder="Person responsible"
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-500"
            />
          </div>
          <div>
            <label
              htmlFor="control-tower-due-date"
              className="mb-1.5 block text-sm font-medium text-slate-200"
            >
              Due date <span className="font-normal text-slate-500">optional</span>
            </label>
            <input
              id="control-tower-due-date"
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-500"
            />
          </div>
          {expectedImpact && (
            <p className="sm:col-span-2 text-xs leading-5 text-slate-500">
              {isSample
                ? "The sample impact figures are invented for demonstration and do not come from your network or a simulation."
                : "This action will keep the latest simulation's risk, cost-change, lead-time, stockout, and emergency-inventory estimates as its baseline."}
            </p>
          )}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="rounded-lg px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-wait disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save action"}
            </button>
          </div>
        </form>
      )}

      <div className="mt-5 space-y-3">
        {loading ? (
          <p className="rounded-xl border border-slate-800 bg-slate-950/50 p-5 text-sm text-slate-400">
            Loading saved actions…
          </p>
        ) : actions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/40 p-5">
            <p className="font-medium text-slate-200">No actions tracked yet</p>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Run a simulation and track one of its recommendations, or create an
              action for this company.
            </p>
          </div>
        ) : (
          actions.map((action) => (
            <article
              key={action.id}
              className="rounded-xl border border-slate-800 bg-slate-950/70 p-4"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="leading-6 text-slate-100">
                      {action.recommendation}
                    </p>
                    {action.is_sample && (
                      <span className="rounded-full border border-amber-700/70 bg-amber-950/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200">
                        Example data
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    Scenario: {action.scenario_message}
                  </p>
                </div>
                <label className="shrink-0">
                  <span className="sr-only">Status for this action</span>
                  <select
                    value={action.status}
                    disabled={updatingActionId === action.id}
                    onChange={(event) => {
                      if (isActionStatus(event.target.value)) {
                        updateStatus(action.id, event.target.value);
                      }
                    }}
                    className={`rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-cyan-500 ${
                      action.status === "DONE"
                        ? "text-emerald-300"
                        : action.status === "IN_PROGRESS"
                          ? "text-cyan-300"
                          : "text-amber-300"
                    }`}
                  >
                    {(Object.keys(STATUS_LABELS) as ActionStatus[]).map((status) => (
                      <option key={status} value={status}>
                        {STATUS_LABELS[status]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <label>
                  <span className="mb-1 block text-xs text-slate-500">Owner</span>
                  <input
                    value={drafts[action.id]?.owner ?? action.owner ?? ""}
                    onChange={(event) =>
                      changeActionDraft(action, { owner: event.target.value })
                    }
                    maxLength={200}
                    placeholder="Unassigned"
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 outline-none focus:border-cyan-500"
                  />
                </label>
                <label>
                  <span className="mb-1 block text-xs text-slate-500">Due date</span>
                  <input
                    type="date"
                    value={drafts[action.id]?.due_date ?? action.due_date ?? ""}
                    onChange={(event) =>
                      changeActionDraft(action, { due_date: event.target.value })
                    }
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 outline-none focus:border-cyan-500"
                  />
                </label>
                <button
                  type="button"
                  disabled={updatingActionId === action.id}
                  onClick={() => {
                    const draft = drafts[action.id];
                    void updateAction(action.id, {
                      owner: draft?.owner.trim() || null,
                      due_date: draft?.due_date || null,
                    });
                  }}
                  className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 hover:border-cyan-700 hover:text-cyan-200 disabled:opacity-50"
                >
                  Save assignment
                </button>
              </div>
              {action.status === "DONE" && (
                <div className="mt-4 border-t border-slate-800 pt-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-100">
                        Actual results
                      </h3>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        Enter observed values after completion. Leave a field
                        blank if it is not known.
                      </p>
                    </div>
                    {action.is_sample && (
                      <button
                        type="button"
                        onClick={() =>
                          changeActionDraft(action, {
                            actual_cost_change_percent: "18",
                            actual_delay_change_days: "3",
                            actual_stockout_locations: "2",
                            actual_emergency_inventory_units: "300",
                            actual_outcome:
                              "Example only: The alternate carrier was confirmed; sample results are illustrative.",
                          })
                        }
                        className="self-start rounded-lg border border-amber-700/70 px-3 py-2 text-xs font-medium text-amber-200 transition hover:border-amber-500"
                      >
                        Fill example results
                      </button>
                    )}
                  </div>
                  {action.is_sample && (
                    <p className="mt-2 rounded-lg border border-amber-800/60 bg-amber-950/20 px-3 py-2 text-xs leading-5 text-amber-200">
                      This is a sample action. Any results entered here are
                      examples, not real operational outcomes.
                    </p>
                  )}
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <label>
                      <span className="mb-1 block text-xs text-slate-400">
                        Actual cost change (%)
                      </span>
                      <input
                        type="number"
                        step="any"
                        value={
                          drafts[action.id]?.actual_cost_change_percent ?? ""
                        }
                        onChange={(event) =>
                          changeActionDraft(action, {
                            actual_cost_change_percent: event.target.value,
                          })
                        }
                        placeholder="Not recorded"
                        className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 outline-none focus:border-cyan-500"
                      />
                    </label>
                    <label>
                      <span className="mb-1 block text-xs text-slate-400">
                        Actual delivery delay (days)
                      </span>
                      <input
                        type="number"
                        step="any"
                        value={
                          drafts[action.id]?.actual_delay_change_days ?? ""
                        }
                        onChange={(event) =>
                          changeActionDraft(action, {
                            actual_delay_change_days: event.target.value,
                          })
                        }
                        placeholder="Not recorded"
                        className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 outline-none focus:border-cyan-500"
                      />
                    </label>
                    <label>
                      <span className="mb-1 block text-xs text-slate-400">
                        Actual stockout locations
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={
                          drafts[action.id]?.actual_stockout_locations ?? ""
                        }
                        onChange={(event) =>
                          changeActionDraft(action, {
                            actual_stockout_locations: event.target.value,
                          })
                        }
                        placeholder="Not recorded"
                        className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 outline-none focus:border-cyan-500"
                      />
                    </label>
                    <label>
                      <span className="mb-1 block text-xs text-slate-400">
                        Actual emergency inventory (units)
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={
                          drafts[action.id]?.actual_emergency_inventory_units ??
                          ""
                        }
                        onChange={(event) =>
                          changeActionDraft(action, {
                            actual_emergency_inventory_units: event.target.value,
                          })
                        }
                        placeholder="Not recorded"
                        className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 outline-none focus:border-cyan-500"
                      />
                    </label>
                  </div>
                  {action.expected_impact && (
                    <div className="mt-4 overflow-x-auto rounded-xl border border-slate-800">
                      <table className="min-w-[620px] w-full text-left text-sm">
                        <thead className="bg-slate-900 text-xs uppercase tracking-wide text-slate-500">
                          <tr>
                            <th className="px-3 py-2.5">Measure</th>
                            <th className="px-3 py-2.5">Modeled</th>
                            <th className="px-3 py-2.5">Actual</th>
                            <th className="px-3 py-2.5">Variance</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[
                            {
                              label: "Cost change",
                              modeled:
                                action.expected_impact.cost_change_percent,
                              actual: action.actual_cost_change_percent,
                              draft: drafts[action.id]
                                ?.actual_cost_change_percent,
                              unit: "%",
                            },
                            {
                              label: "Delivery delay",
                              modeled: action.expected_impact.delay_change_days,
                              actual: action.actual_delay_change_days,
                              draft: drafts[action.id]?.actual_delay_change_days,
                              unit: "days",
                            },
                            {
                              label: "Stockout locations",
                              modeled:
                                action.expected_impact.stockout_locations,
                              actual: action.actual_stockout_locations,
                              draft: drafts[action.id]?.actual_stockout_locations,
                              unit: "locations",
                            },
                            {
                              label: "Emergency inventory",
                              modeled:
                                action.expected_impact.emergency_inventory_units,
                              actual:
                                action.actual_emergency_inventory_units,
                              draft:
                                drafts[action.id]
                                  ?.actual_emergency_inventory_units,
                              unit: "units",
                            },
                          ].map((metric) => {
                            const actual =
                              metric.draft === undefined
                                ? metric.actual
                                : numericDraft(metric.draft);
                            return (
                              <tr
                                key={metric.label}
                                className="border-t border-slate-800"
                              >
                                <th className="px-3 py-2.5 font-medium text-slate-300">
                                  {metric.label}
                                </th>
                                <td className="px-3 py-2.5 text-slate-400">
                                  {metric.modeled === null
                                    ? "Not available"
                                    : `${metric.modeled} ${metric.unit}`}
                                </td>
                                <td className="px-3 py-2.5 text-slate-200">
                                  {actual === null
                                    ? "Not recorded"
                                    : `${actual} ${metric.unit}`}
                                </td>
                                <td className="px-3 py-2.5 text-slate-400">
                                  {actual === null || metric.modeled === null
                                    ? "—"
                                    : metricDelta(
                                        actual,
                                        metric.modeled,
                                        metric.unit,
                                      )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      <p className="border-t border-slate-800 px-3 py-2 text-xs text-slate-500">
                        Variance = actual minus modeled. A positive value means
                        the recorded result was higher; it does not by itself
                        indicate whether the outcome was better or worse.
                      </p>
                    </div>
                  )}
                  <label
                    htmlFor={`actual-outcome-${action.id}`}
                    className="mb-1.5 mt-4 block text-sm font-medium text-slate-200"
                  >
                    Outcome notes
                  </label>
                  <textarea
                    id={`actual-outcome-${action.id}`}
                    value={
                      drafts[action.id]?.actual_outcome ??
                      action.actual_outcome ??
                      ""
                    }
                    onChange={(event) =>
                      changeActionDraft(action, {
                        actual_outcome: event.target.value,
                      })
                    }
                    maxLength={10000}
                    rows={2}
                    placeholder="Record what happened, including observed cost, delay, or service impact."
                    className="w-full resize-y rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm leading-6 text-slate-200 outline-none focus:border-cyan-500"
                  />
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-slate-500">
                      Compare your notes with the modeled estimates above.
                    </p>
                    <button
                      type="button"
                      disabled={updatingActionId === action.id}
                      onClick={() => {
                        const draft = drafts[action.id];
                        void updateAction(action.id, {
                          actual_outcome:
                            draft?.actual_outcome.trim() || null,
                          actual_cost_change_percent: numericDraft(
                            draft?.actual_cost_change_percent ?? "",
                          ),
                          actual_delay_change_days: numericDraft(
                            draft?.actual_delay_change_days ?? "",
                          ),
                          actual_stockout_locations: numericDraft(
                            draft?.actual_stockout_locations ?? "",
                          ),
                          actual_emergency_inventory_units: numericDraft(
                            draft?.actual_emergency_inventory_units ?? "",
                          ),
                        });
                      }}
                      className="self-start rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 hover:border-cyan-700 hover:text-cyan-200 disabled:opacity-50 sm:self-auto"
                    >
                      Save actual results
                    </button>
                  </div>
                </div>
              )}
              {action.expected_impact && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-slate-300">
                    Modeled risk: {action.expected_impact.risk_level}
                  </span>
                  {action.expected_impact.cost_change_percent !== null && (
                    <span className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-slate-300">
                      Cost change:{" "}
                      {action.expected_impact.cost_change_percent > 0 ? "+" : ""}
                      {action.expected_impact.cost_change_percent}%
                    </span>
                  )}
                  {action.expected_impact.delay_change_days !== null && (
                    <span className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-slate-300">
                      Lead-time change:{" "}
                      {action.expected_impact.delay_change_days > 0 ? "+" : ""}
                      {action.expected_impact.delay_change_days} days
                    </span>
                  )}
                  <span className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-slate-300">
                    Exposed locations: {action.expected_impact.stockout_locations}
                  </span>
                  <span className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-slate-300">
                    Emergency inventory:{" "}
                    {action.expected_impact.emergency_inventory_units.toLocaleString()} units
                  </span>
                </div>
              )}
            </article>
          ))
        )}
      </div>
    </section>
  );
}
