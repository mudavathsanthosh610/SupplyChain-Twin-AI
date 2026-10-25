"use client";

import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { API_URL, apiFetch } from "../api";

type SupplierNode = {
  id: number;
  code: string;
  name: string;
  node_type: string;
};

type RiskMetric =
  | "on_time_delivery_rate"
  | "average_lead_time_days"
  | "defect_rate"
  | "capacity_utilization";

type RiskThresholds = {
  min_on_time_delivery_rate: number | null;
  max_average_lead_time_days: number | null;
  max_defect_rate: number | null;
  max_capacity_utilization: number | null;
  updated_at?: string | null;
};

type RiskAlert = {
  id: string;
  supplier_node_id: number;
  supplier_name: string;
  supplier_code: string;
  performance_record_id: number;
  reporting_date: string;
  metric: RiskMetric;
  metric_label: string;
  value: number;
  threshold: number;
  unit: "%" | "days";
  message: string;
};

type MonitorResponse = {
  thresholds: RiskThresholds;
  alerts: RiskAlert[];
};

type SupplierRiskMonitorProps = {
  companyId: number;
  nodes: SupplierNode[];
  canEdit: boolean;
  onCreateAction: (recommendation: string) => void;
  onAlertsChange: (alerts: RiskAlert[]) => void;
};

const EMPTY_THRESHOLDS: RiskThresholds = {
  min_on_time_delivery_rate: null,
  max_average_lead_time_days: null,
  max_defect_rate: null,
  max_capacity_utilization: null,
};

const THRESHOLD_FIELDS: Array<{
  key: keyof RiskThresholds;
  label: string;
  help: string;
  min: number;
  max?: number;
  unit: string;
}> = [
  {
    key: "min_on_time_delivery_rate",
    label: "Minimum on-time delivery",
    help: "Alert when delivery performance falls below this value.",
    min: 0,
    max: 100,
    unit: "%",
  },
  {
    key: "max_average_lead_time_days",
    label: "Maximum average lead time",
    help: "Alert when reported lead time exceeds this value.",
    min: 0,
    unit: "days",
  },
  {
    key: "max_defect_rate",
    label: "Maximum defect rate",
    help: "Alert when the reported defect rate exceeds this value.",
    min: 0,
    max: 100,
    unit: "%",
  },
  {
    key: "max_capacity_utilization",
    label: "Maximum capacity utilization",
    help: "Alert when reported capacity utilization exceeds this value.",
    min: 0,
    unit: "%",
  },
];

async function parseResponse<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(
      typeof data?.detail === "string"
        ? data.detail
        : "The supplier risk request could not be completed.",
    );
  }
  return data as T;
}

export default function SupplierRiskMonitor({
  companyId,
  nodes,
  canEdit,
  onCreateAction,
  onAlertsChange,
}: SupplierRiskMonitorProps) {
  const suppliers = useMemo(
    () => nodes.filter((node) => node.node_type.toUpperCase() === "SUPPLIER"),
    [nodes],
  );
  const [thresholds, setThresholds] =
    useState<RiskThresholds>(EMPTY_THRESHOLDS);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [alerts, setAlerts] = useState<RiskAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    apiFetch(`${API_URL}/companies/${companyId}/supplier-risk-monitor`)
      .then((response) => parseResponse<MonitorResponse>(response))
      .then((data) => {
        if (cancelled) return;
        setThresholds(data.thresholds);
        setDraft(
          Object.fromEntries(
            THRESHOLD_FIELDS.map(({ key }) => [
              key,
              data.thresholds[key] == null ? "" : String(data.thresholds[key]),
            ]),
          ),
        );
        setAlerts(data.alerts);
        onAlertsChange(data.alerts);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load supplier risk settings.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, onAlertsChange]);

  async function saveThresholds(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    const payload: Record<string, number | null> = {};
    for (const { key } of THRESHOLD_FIELDS) {
      const value = draft[key]?.trim() ?? "";
      payload[key] = value ? Number(value) : null;
    }
    try {
      const response = await apiFetch(
        `${API_URL}/companies/${companyId}/supplier-risk-monitor`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = await parseResponse<MonitorResponse>(response);
      setThresholds(data.thresholds);
      setAlerts(data.alerts);
      onAlertsChange(data.alerts);
      setDraft(
        Object.fromEntries(
          THRESHOLD_FIELDS.map(({ key }) => [
            key,
            data.thresholds[key] == null ? "" : String(data.thresholds[key]),
          ]),
        ),
      );
      setNotice("Risk thresholds saved and existing supplier reports checked.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save supplier risk thresholds.",
      );
    } finally {
      setSaving(false);
    }
  }

  function openMitigationDraft(alert: RiskAlert) {
    const recommendation =
      `Review ${alert.metric_label.toLowerCase()} for ${alert.supplier_name}. ` +
      `${alert.message} Verify the source data, assess supply impact, and decide whether a mitigation is needed.`;
    onCreateAction(recommendation);
    setNotice(
      `Review draft opened in the Control Tower for ${alert.supplier_name}. Save it there to track the action.`,
    );
  }

  if (suppliers.length === 0) {
    return null;
  }

  const activeThresholdCount = THRESHOLD_FIELDS.filter(
    ({ key }) => thresholds[key] !== null && thresholds[key] !== undefined,
  ).length;

  return (
    <section
      aria-labelledby="supplier-risk-heading"
      className="rounded-2xl border border-amber-900/45 bg-gradient-to-br from-amber-950/20 via-slate-900/80 to-slate-900/80 p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">
            Supplier risk monitoring
          </p>
          <h2
            id="supplier-risk-heading"
            className="mt-1 text-xl font-semibold text-white sm:text-2xl"
          >
            Configurable performance alerts
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            Set your own limits. Only the latest recorded supplier reports are
            checked; no industry benchmarks or unreported values are assumed.
          </p>
        </div>
        <span
          className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold ${
            alerts.length
              ? "border-amber-700/70 bg-amber-950/40 text-amber-200"
              : "border-slate-700 bg-slate-950/50 text-slate-300"
          }`}
        >
          {loading ? "Checking…" : `${alerts.length} active alerts`}
        </span>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-rose-900/70 bg-rose-950/30 px-4 py-3 text-sm text-rose-200"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="mt-4 rounded-xl border border-emerald-900/70 bg-emerald-950/25 px-4 py-3 text-sm text-emerald-200"
        >
          {notice}
        </p>
      )}

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(19rem,0.72fr)]">
        <div>
          {loading ? (
            <p role="status" className="text-sm text-cyan-200">
              Evaluating latest supplier reports…
            </p>
          ) : alerts.length === 0 ? (
            <div className="flex min-h-36 flex-col justify-center rounded-xl border border-dashed border-slate-700 bg-slate-950/40 p-5">
              <p className="font-medium text-slate-200">
                {activeThresholdCount === 0
                  ? "No thresholds configured yet."
                  : "No configured thresholds are currently breached."}
              </p>
              <p className="mt-1 text-sm leading-6 text-slate-400">
                {activeThresholdCount === 0
                  ? "Add limits on the right to start monitoring the latest supplier performance reports."
                  : "Alerts update as new supplier performance reports are recorded."}
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {alerts.map((alert) => (
                <li
                  key={alert.id}
                  className="rounded-xl border border-amber-800/60 bg-slate-950/65 p-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-slate-100">
                          {alert.supplier_name}
                        </h3>
                        <span className="rounded-full border border-amber-800/70 bg-amber-950/35 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200">
                          Threshold breached
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {alert.supplier_code} · Reported{" "}
                        {new Date(
                          `${alert.reporting_date}T00:00:00`,
                        ).toLocaleDateString()}
                      </p>
                      <p className="mt-3 text-sm leading-6 text-amber-100">
                        {alert.message}
                      </p>
                    </div>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => openMitigationDraft(alert)}
                        className="shrink-0 rounded-lg border border-amber-700/70 bg-amber-950/30 px-3 py-2 text-xs font-semibold text-amber-100 hover:border-amber-500 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Review in Control Tower
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs leading-5 text-slate-500">
            Alerts are decision-support signals from your recorded values.
            Verify reports and operational context before acting.
          </p>
        </div>

        <form
          onSubmit={saveThresholds}
          className="rounded-xl border border-slate-800 bg-slate-950/75 p-4 sm:p-5"
        >
          <div className="mb-4">
            <h3 className="font-semibold text-white">Risk thresholds</h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Blank means disabled. Owners and editors can change workspace
              thresholds.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            {THRESHOLD_FIELDS.map((field) => (
              <label
                key={field.key}
                className="text-xs font-medium text-slate-300"
              >
                {field.label}
                <span className="ml-1 font-normal text-slate-500">
                  ({field.unit})
                </span>
                <input
                  type="number"
                  min={field.min}
                  max={field.max}
                  step="any"
                  disabled={!canEdit}
                  value={draft[field.key] ?? ""}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      [field.key]: event.target.value,
                    }))
                  }
                  placeholder="Disabled"
                  aria-describedby={`${field.key}-help`}
                  className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
                />
                <span
                  id={`${field.key}-help`}
                  className="mt-1 block font-normal leading-5 text-slate-500"
                >
                  {field.help}
                </span>
              </label>
            ))}
          </div>
          {!canEdit ? (
            <p className="mt-4 rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-xs leading-5 text-slate-400">
              You have read-only access. Ask a workspace owner or editor to
              update risk thresholds.
            </p>
          ) : (
            <button
              type="submit"
              disabled={saving}
              className="mt-4 w-full rounded-lg bg-amber-300 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-lg shadow-amber-950/20 hover:bg-amber-200 disabled:cursor-wait disabled:opacity-60"
            >
              {saving ? "Saving thresholds…" : "Save risk thresholds"}
            </button>
          )}
          {thresholds.updated_at && (
            <p className="mt-3 text-[11px] text-slate-500">
              Last updated{" "}
              {new Date(thresholds.updated_at).toLocaleString()}
            </p>
          )}
        </form>
      </div>
    </section>
  );
}
