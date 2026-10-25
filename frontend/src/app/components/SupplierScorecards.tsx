"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { API_URL, apiFetch } from "../api";
import SupplierRiskMonitor from "./SupplierRiskMonitor";

type SupplierNode = {
  id: number;
  code: string;
  name: string;
  node_type: string;
};

type PerformanceRecord = {
  id: number;
  supplier_node_id: number;
  reporting_date: string;
  on_time_delivery_rate: number | null;
  average_lead_time_days: number | null;
  defect_rate: number | null;
  capacity_utilization: number | null;
  source_reference: string | null;
  notes: string | null;
  created_at: string;
};

type ImportPreviewRow = {
  row_number: number;
  valid: boolean;
  errors: string[];
  data: Record<string, unknown>;
};

type RiskAlert = {
  id: string;
  supplier_node_id: number;
  supplier_name: string;
  supplier_code: string;
  performance_record_id: number;
  reporting_date: string;
  metric:
    | "on_time_delivery_rate"
    | "average_lead_time_days"
    | "defect_rate"
    | "capacity_utilization";
  metric_label: string;
  value: number;
  threshold: number;
  unit: "%" | "days";
  message: string;
};

type PortfolioSortKey =
  | "name"
  | "reporting_date"
  | MetricKey;

type SupplierScorecardsProps = {
  companyId: number;
  nodes: SupplierNode[];
  canEdit: boolean;
  onCreateAction: (recommendation: string) => void;
};

type MetricKey =
  | "on_time_delivery_rate"
  | "average_lead_time_days"
  | "defect_rate"
  | "capacity_utilization";

const METRICS: Array<{
  key: MetricKey;
  label: string;
  shortLabel: string;
  unit: "%" | " days";
  min: number;
  max?: number;
}> = [
  {
    key: "on_time_delivery_rate",
    label: "On-time delivery",
    shortLabel: "On-time",
    unit: "%",
    min: 0,
    max: 100,
  },
  {
    key: "average_lead_time_days",
    label: "Average lead time",
    shortLabel: "Lead time",
    unit: " days",
    min: 0,
  },
  {
    key: "defect_rate",
    label: "Defect rate",
    shortLabel: "Defects",
    unit: "%",
    min: 0,
    max: 100,
  },
  {
    key: "capacity_utilization",
    label: "Capacity utilization",
    shortLabel: "Capacity",
    unit: "%",
    min: 0,
  },
];

function localDateValue() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function localDateValueForDate(value: Date) {
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${value.getFullYear()}-${month}-${day}`;
}

function displayMetric(value: number | null, unit: "%" | " days") {
  if (value === null) {
    return "—";
  }
  const formatted = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 1,
  }).format(value);
  return unit === "%" ? `${formatted}%` : `${formatted} days`;
}

function metricChange(
  current: number | null,
  previous: number | null | undefined,
  unit: "%" | " days",
) {
  if (current === null || previous === null || previous === undefined) {
    return null;
  }
  const difference = current - previous;
  const formatted = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 1,
    signDisplay: "always",
  }).format(difference);
  return `${formatted}${unit === "%" ? " pp" : " days"} since previous report`;
}

function compactMetricChange(
  current: number | null | undefined,
  previous: number | null | undefined,
  unit: "%" | " days",
) {
  if (current == null || previous == null) {
    return "—";
  }
  const difference = current - previous;
  const formatted = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 1,
    signDisplay: "always",
  }).format(difference);
  return `${formatted}${unit === "%" ? " pp" : " d"}`;
}

function metricTrend(
  records: PerformanceRecord[],
  metric: (typeof METRICS)[number],
) {
  const measured = records
    .map((record) => ({
      record,
      value: record[metric.key],
    }))
    .filter(
      (point): point is { record: PerformanceRecord; value: number } =>
        point.value !== null,
    );
  if (measured.length < 2) {
    return { label: "Need 2 reports", tone: "text-slate-500" };
  }

  const recent = measured.slice(-3);
  const isWorsening = (older: number, newer: number) =>
    metric.key === "on_time_delivery_rate" ? newer < older : newer > older;
  if (
    recent.length === 3 &&
    isWorsening(recent[0].value, recent[1].value) &&
    isWorsening(recent[1].value, recent[2].value)
  ) {
    return { label: "Worsened 2 reports in a row", tone: "text-rose-300" };
  }
  const previous = measured[measured.length - 2].value;
  const latest = measured[measured.length - 1].value;
  if (isWorsening(previous, latest)) {
    return { label: "Worsened since previous", tone: "text-amber-300" };
  }
  if (isWorsening(latest, previous)) {
    return { label: "Improved since previous", tone: "text-emerald-300" };
  }
  return { label: "Unchanged since previous", tone: "text-slate-400" };
}

function SupplierMetricTrendChart({
  metric,
  records,
}: {
  metric: (typeof METRICS)[number];
  records: PerformanceRecord[];
}) {
  const measured = records
    .map((record) => ({
      record,
      value: record[metric.key],
    }))
    .filter(
      (point): point is { record: PerformanceRecord; value: number } =>
        point.value !== null,
    );
  if (measured.length === 0) {
    return (
      <div className="flex h-36 items-center justify-center rounded-lg border border-dashed border-slate-800 text-xs text-slate-500">
        No reports for this metric in the selected period.
      </div>
    );
  }

  const chartValues =
    measured.length > 120
      ? Array.from({ length: 120 }, (_, index) => {
          const position = Math.round(
            (index * (measured.length - 1)) / 119,
          );
          return measured[position];
        })
      : measured;
  const width = 600;
  const height = 170;
  const left = 12;
  const right = width - 12;
  const top = 16;
  const bottom = height - 30;
  const values = chartValues.map((point) => point.value);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = maximum - minimum || Math.max(Math.abs(maximum) * 0.1, 1);
  const points = chartValues.map((point, index) => ({
    ...point,
    x:
      chartValues.length === 1
        ? width / 2
        : left + (index / (chartValues.length - 1)) * (right - left),
    y:
      maximum === minimum
        ? (top + bottom) / 2
        : bottom - ((point.value - minimum) / range) * (bottom - top),
  }));
  const path = points
    .map((point, index) =>
      `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`,
    )
    .join(" ");

  return (
    <svg
      role="img"
      aria-label={`${metric.label} over ${measured.length} recorded reports`}
      viewBox={`0 0 ${width} ${height}`}
      className="mt-3 h-36 w-full overflow-visible"
      preserveAspectRatio="none"
    >
      {[0, 1, 2, 3].map((line) => {
        const y = top + (line / 3) * (bottom - top);
        return (
          <line
            key={line}
            x1={left}
            x2={right}
            y1={y}
            y2={y}
            stroke="rgb(51 65 85 / 0.65)"
            strokeDasharray="3 5"
          />
        );
      })}
      {points.length > 1 && (
        <path
          d={path}
          fill="none"
          stroke="rgb(34 211 238)"
          strokeWidth="2.5"
          vectorEffect="non-scaling-stroke"
        />
      )}
      {points.map((point) => (
        <circle
          key={point.record.id}
          cx={point.x}
          cy={point.y}
          r="3.5"
          fill="rgb(103 232 249)"
          stroke="rgb(15 23 42)"
          strokeWidth="2"
        >
          <title>
            {new Date(`${point.record.reporting_date}T00:00:00`).toLocaleDateString()}
            : {displayMetric(point.value, metric.unit)}
          </title>
        </circle>
      ))}
      <text x={left} y={height - 5} fill="rgb(148 163 184)" fontSize="11">
        {new Date(`${measured[0].record.reporting_date}T00:00:00`).toLocaleDateString()}
      </text>
      {measured.length > 1 && (
        <text
          x={right}
          y={height - 5}
          textAnchor="end"
          fill="rgb(148 163 184)"
          fontSize="11"
        >
          {new Date(
            `${measured[measured.length - 1].record.reporting_date}T00:00:00`,
          ).toLocaleDateString()}
        </text>
      )}
    </svg>
  );
}

async function parseResponse<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(
      typeof data?.detail === "string"
        ? data.detail
        : "The supplier performance request could not be completed.",
    );
  }
  return data as T;
}

function buildImportPayload(rows: ImportPreviewRow[]) {
  return rows
    .filter((row) => row.valid)
    .map((row) => row.data)
    .filter((row) => row && typeof row === "object");
}

function escapeCsvValue(value: string | number | null) {
  const text = value == null ? "" : String(value);
  const safeText = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
}

export default function SupplierScorecards({
  companyId,
  nodes,
  canEdit,
  onCreateAction,
}: SupplierScorecardsProps) {
  const suppliers = useMemo(
    () =>
      nodes
        .filter((node) => node.node_type.toUpperCase() === "SUPPLIER")
        .slice()
        .sort((left, right) => left.name.localeCompare(right.name)),
    [nodes],
  );
  const [records, setRecords] = useState<PerformanceRecord[]>([]);
  const [riskAlerts, setRiskAlerts] = useState<RiskAlert[]>([]);
  const [riskLoadError, setRiskLoadError] = useState("");
  const [portfolioSearch, setPortfolioSearch] = useState("");
  const [portfolioPeriod, setPortfolioPeriod] = useState("all");
  const [portfolioStatus, setPortfolioStatus] = useState("all");
  const [portfolioSort, setPortfolioSort] = useState<{
    key: PortfolioSortKey;
    descending: boolean;
  }>({ key: "name", descending: false });
  const [trendResult, setTrendResult] = useState<{
    queryKey: string;
    records: PerformanceRecord[];
    error: string;
  }>({ queryKey: "", records: [], error: "" });
  const [trendSupplierId, setTrendSupplierId] = useState("");
  const [trendStartDate, setTrendStartDate] = useState("");
  const [trendEndDate, setTrendEndDate] = useState("");
  const [trendRefreshKey, setTrendRefreshKey] = useState(0);
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [reportingDate, setReportingDate] = useState(localDateValue);
  const [metricValues, setMetricValues] = useState<Record<MetricKey, string>>({
    on_time_delivery_rate: "",
    average_lead_time_days: "",
    defect_rate: "",
    capacity_utilization: "",
  });
  const [sourceReference, setSourceReference] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importSaving, setImportSaving] = useState(false);
  const [importPreview, setImportPreview] = useState<{
    filename: string;
    valid_rows: number;
    invalid_rows: number;
    total_rows: number;
  } | null>(null);
  const [importRows, setImportRows] = useState<ImportPreviewRow[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const activeTrendSupplierId = suppliers.some(
    (supplier) => String(supplier.id) === trendSupplierId,
  )
    ? trendSupplierId
    : String(suppliers[0]?.id ?? "");
  const trendDateRangeError =
    trendStartDate && trendEndDate && trendStartDate > trendEndDate
      ? "Start date must be on or before end date."
      : "";
  const trendQueryKey = JSON.stringify([
    companyId,
    activeTrendSupplierId,
    trendStartDate,
    trendEndDate,
    trendRefreshKey,
  ]);
  const isTrendQueryCurrent = trendResult.queryKey === trendQueryKey;
  const trendRecords = isTrendQueryCurrent ? trendResult.records : [];
  const trendLoading =
    Boolean(activeTrendSupplierId) &&
    !trendDateRangeError &&
    !isTrendQueryCurrent;
  const trendError = isTrendQueryCurrent ? trendResult.error : "";
  const displayedTrendError = trendDateRangeError || trendError;

  const refresh = useCallback(async () => {
    const response = await apiFetch(
      `${API_URL}/companies/${companyId}/supplier-performance?limit=5000`,
    );
    const data = await parseResponse<PerformanceRecord[]>(response);
    setRecords(data);
  }, [companyId]);

  useEffect(() => {
    let cancelled = false;
    apiFetch(`${API_URL}/companies/${companyId}/supplier-performance?limit=5000`)
      .then((response) => parseResponse<PerformanceRecord[]>(response))
      .then((data) => {
        if (!cancelled) {
          setRecords(data);
        }
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load supplier performance records.",
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

  useEffect(() => {
    let cancelled = false;
    apiFetch(`${API_URL}/companies/${companyId}/supplier-risk-monitor`)
      .then((response) =>
        parseResponse<{ alerts: RiskAlert[] }>(response),
      )
      .then((data) => {
        if (!cancelled) {
          setRiskAlerts(data.alerts);
          setRiskLoadError("");
        }
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setRiskLoadError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load supplier risk alerts.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, trendRefreshKey]);

  useEffect(() => {
    if (!activeTrendSupplierId || trendDateRangeError) {
      return;
    }

    let cancelled = false;
    const params = new URLSearchParams({
      supplier_node_id: activeTrendSupplierId,
      limit: "5000",
    });
    if (trendStartDate) params.set("start_date", trendStartDate);
    if (trendEndDate) params.set("end_date", trendEndDate);
    apiFetch(
      `${API_URL}/companies/${companyId}/supplier-performance?${params.toString()}`,
    )
      .then((response) => parseResponse<PerformanceRecord[]>(response))
      .then((data) => {
        if (!cancelled) {
          setTrendResult({
            queryKey: trendQueryKey,
            records: data.slice().sort(
              (left, right) =>
                left.reporting_date.localeCompare(right.reporting_date) ||
                left.id - right.id,
            ),
            error: "",
          });
        }
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setTrendResult({
            queryKey: trendQueryKey,
            records: [],
            error:
              loadError instanceof Error
                ? loadError.message
                : "Unable to load supplier trend reports.",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    activeTrendSupplierId,
    companyId,
    trendDateRangeError,
    trendEndDate,
    trendQueryKey,
    trendStartDate,
  ]);

  const recordsBySupplier = useMemo(() => {
    const grouped = new Map<number, PerformanceRecord[]>();
    for (const record of records) {
      const group = grouped.get(record.supplier_node_id) ?? [];
      group.push(record);
      grouped.set(record.supplier_node_id, group);
    }
    for (const group of grouped.values()) {
      group.sort(
        (left, right) =>
          right.reporting_date.localeCompare(left.reporting_date) ||
          right.id - left.id,
      );
    }
    return grouped;
  }, [records]);

  const portfolioRows = useMemo(() => {
    const today = new Date(`${localDateValue()}T00:00:00`);
    const cutoff = new Date(today);
    if (portfolioPeriod !== "all") {
      cutoff.setDate(cutoff.getDate() - Number(portfolioPeriod));
    }
    const cutoffDate = localDateValueForDate(cutoff);
    const alertsBySupplier = new Map<number, RiskAlert[]>();
    for (const alert of riskAlerts) {
      const supplierAlerts = alertsBySupplier.get(alert.supplier_node_id) ?? [];
      supplierAlerts.push(alert);
      alertsBySupplier.set(alert.supplier_node_id, supplierAlerts);
    }

    return suppliers
      .map((supplier) => {
        const supplierRecords = recordsBySupplier.get(supplier.id) ?? [];
        const latest = supplierRecords[0] ?? null;
        const previous = supplierRecords[1] ?? null;
        const alerts = latest
          ? (alertsBySupplier.get(supplier.id) ?? []).filter(
              (alert) => alert.performance_record_id === latest.id,
            )
          : [];
        const ageDays = latest
          ? Math.floor(
              (today.getTime() -
                new Date(`${latest.reporting_date}T00:00:00`).getTime()) /
                86_400_000,
            )
          : null;
        return {
          supplier,
          latest,
          previous,
          alerts,
          ageDays,
          reportStatus:
            !latest ? "missing" : (ageDays ?? 0) > 90 ? "outdated" : "current",
        };
      })
      .filter(({ supplier, latest, alerts, reportStatus }) => {
        const matchesSearch =
          !portfolioSearch.trim() ||
          `${supplier.name} ${supplier.code}`
            .toLocaleLowerCase()
            .includes(portfolioSearch.trim().toLocaleLowerCase());
        const matchesPeriod =
          portfolioPeriod === "all" ||
          !latest ||
          latest.reporting_date >= cutoffDate;
        const matchesStatus =
          portfolioStatus === "all" ||
          (portfolioStatus === "breaches" && alerts.length > 0) ||
          portfolioStatus === reportStatus;
        return matchesSearch && matchesPeriod && matchesStatus;
      })
      .sort((left, right) => {
        const leftValue =
          portfolioSort.key === "name"
            ? left.supplier.name
            : portfolioSort.key === "reporting_date"
              ? left.latest?.reporting_date ?? null
              : left.latest?.[portfolioSort.key] ?? null;
        const rightValue =
          portfolioSort.key === "name"
            ? right.supplier.name
            : portfolioSort.key === "reporting_date"
              ? right.latest?.reporting_date ?? null
              : right.latest?.[portfolioSort.key] ?? null;
        if (leftValue === null && rightValue === null) {
          return left.supplier.name.localeCompare(right.supplier.name);
        }
        if (leftValue === null) return 1;
        if (rightValue === null) return -1;
        const comparison =
          typeof leftValue === "string" && typeof rightValue === "string"
            ? leftValue.localeCompare(rightValue)
            : Number(leftValue) - Number(rightValue);
        if (comparison === 0) {
          return left.supplier.name.localeCompare(right.supplier.name);
        }
        return portfolioSort.descending ? -comparison : comparison;
      });
  }, [
    portfolioPeriod,
    portfolioSearch,
    portfolioSort,
    portfolioStatus,
    recordsBySupplier,
    riskAlerts,
    suppliers,
  ]);

  function togglePortfolioSort(key: PortfolioSortKey) {
    setPortfolioSort((current) => ({
      key,
      descending: current.key === key ? !current.descending : false,
    }));
  }

  function exportPortfolioCsv() {
    const headers = [
      "Supplier",
      "Supplier code",
      "Latest report date",
      "Report status",
      "On-time delivery (%)",
      "Change vs previous (pp)",
      "Average lead time (days)",
      "Change vs previous (days)",
      "Defect rate (%)",
      "Change vs previous (pp)",
      "Capacity utilization (%)",
      "Change vs previous (pp)",
      "Threshold alerts",
    ];
    const rows = portfolioRows.map(({ supplier, latest, previous, alerts, reportStatus }) => [
      supplier.name,
      supplier.code,
      latest?.reporting_date ?? null,
      reportStatus,
      latest?.on_time_delivery_rate ?? null,
      latest && previous?.on_time_delivery_rate != null && latest.on_time_delivery_rate != null
        ? latest.on_time_delivery_rate - previous.on_time_delivery_rate
        : null,
      latest?.average_lead_time_days ?? null,
      latest && previous?.average_lead_time_days != null && latest.average_lead_time_days != null
        ? latest.average_lead_time_days - previous.average_lead_time_days
        : null,
      latest?.defect_rate ?? null,
      latest && previous?.defect_rate != null && latest.defect_rate != null
        ? latest.defect_rate - previous.defect_rate
        : null,
      latest?.capacity_utilization ?? null,
      latest && previous?.capacity_utilization != null && latest.capacity_utilization != null
        ? latest.capacity_utilization - previous.capacity_utilization
        : null,
      alerts.map((alert) => `${alert.metric_label}: ${alert.value}${alert.unit} > ${alert.threshold}${alert.unit}`).join("; "),
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map(escapeCsvValue).join(","))
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "supplier-portfolio.csv";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function handleImportUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const formData = new FormData();
    formData.append("file", file);
    setImportLoading(true);
    setImportRows([]);
    setImportPreview(null);
    setError("");
    setNotice("");
    try {
      const response = await apiFetch(
        `${API_URL}/companies/${companyId}/supplier-performance/import-preview`,
        {
          method: "POST",
          body: formData,
        },
      );
      const data = await parseResponse<{
        filename: string;
        total_rows: number;
        valid_rows: number;
        invalid_rows: number;
        rows: ImportPreviewRow[];
      }>(response);
      setImportPreview({
        filename: data.filename,
        total_rows: data.total_rows,
        valid_rows: data.valid_rows,
        invalid_rows: data.invalid_rows,
      });
      setImportRows(data.rows);
      if (data.valid_rows === 0) {
        setError("No valid rows were found in the uploaded file. Fix the highlighted issues and retry.");
      }
    } catch (importError) {
      setError(
        importError instanceof Error
          ? importError.message
          : "Unable to preview the supplier performance import.",
      );
    } finally {
      setImportLoading(false);
      event.target.value = "";
    }
  }

  async function finalizeImport() {
    const validRows = buildImportPayload(importRows);
    if (validRows.length === 0) {
      setError("Choose a file with at least one valid supplier performance row.");
      return;
    }
    setImportSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await apiFetch(
        `${API_URL}/companies/${companyId}/supplier-performance/import`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: validRows }),
        },
      );
      const data = await parseResponse<{
        imported_count: number;
        errors: Array<{ row_number: number; errors: string[] }>;
      }>(response);
      setImportRows([]);
      setImportPreview(null);
      setTrendRefreshKey((current) => current + 1);
      setNotice(
        data.imported_count > 0
          ? `Imported ${data.imported_count} supplier performance rows.`
          : "No supplier performance rows were saved.",
      );
      if (data.errors.length > 0) {
        setError(data.errors.map((entry) => `Row ${entry.row_number}: ${entry.errors.join("; ")}`).join(" | "));
      }
      await refresh();
    } catch (importError) {
      setError(
        importError instanceof Error
          ? importError.message
          : "Unable to import the supplier performance file.",
      );
    } finally {
      setImportSaving(false);
    }
  }

  async function submitReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!selectedSupplierId) {
      setError("Choose a supplier before recording performance.");
      return;
    }
    if (!reportingDate) {
      setError("Choose the reporting date.");
      return;
    }
    if (Object.values(metricValues).every((value) => !value.trim())) {
      setError("Enter at least one measured performance metric.");
      return;
    }

    const payload: Record<string, number | string | null> = {
      supplier_node_id: Number(selectedSupplierId),
      reporting_date: reportingDate,
      source_reference: sourceReference.trim() || null,
      notes: notes.trim() || null,
    };
    for (const metric of METRICS) {
      const value = metricValues[metric.key].trim();
      payload[metric.key] = value ? Number(value) : null;
    }

    setSaving(true);
    try {
      const response = await apiFetch(
        `${API_URL}/companies/${companyId}/supplier-performance`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      await parseResponse<PerformanceRecord>(response);
      setMetricValues({
        on_time_delivery_rate: "",
        average_lead_time_days: "",
        defect_rate: "",
        capacity_utilization: "",
      });
      setSourceReference("");
      setNotes("");
      setNotice("Supplier performance report saved.");
      setTrendRefreshKey((current) => current + 1);
      try {
        await refresh();
      } catch (refreshError) {
        setError(
          refreshError instanceof Error
            ? `The report was saved, but the scorecards could not refresh: ${refreshError.message}`
            : "The report was saved, but the scorecards could not refresh.",
        );
      }
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save supplier performance report.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      aria-labelledby="supplier-scorecards-heading"
      className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 sm:p-6"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
            Supplier operations
          </p>
          <h2
            id="supplier-scorecards-heading"
            className="mt-1 text-xl font-semibold text-white sm:text-2xl"
          >
            Supplier performance
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            Record measured delivery, lead-time, defect, and capacity metrics.
            Scorecards show the latest report and change from the previous
            report—no automatic grades or sample values.
          </p>
        </div>
        <span className="inline-flex w-fit items-center rounded-full border border-emerald-800/70 bg-emerald-950/35 px-3 py-1.5 text-xs font-medium text-emerald-200">
          {suppliers.length} {suppliers.length === 1 ? "supplier" : "suppliers"}
        </span>
      </div>

      {suppliers.length === 0 ? (
        <div className="mt-5 rounded-xl border border-dashed border-slate-700 bg-slate-950/50 p-6">
          <p className="font-medium text-slate-200">
            Add a supplier location to start tracking performance.
          </p>
          <p className="mt-1 text-sm text-slate-400">
            Supplier scorecards are tied to supplier locations in this
            workspace. No performance values are assumed.
          </p>
          <a
            href="#operational-dataset"
            className="mt-4 inline-flex rounded-lg border border-emerald-800 px-3 py-2 text-sm font-medium text-emerald-200 transition hover:border-emerald-500 hover:bg-emerald-950/30"
          >
            Add a supplier
          </a>
        </div>
      ) : (
        <>
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

          <section
            aria-labelledby="supplier-portfolio-heading"
            className="mt-5 rounded-xl border border-slate-800 bg-slate-950/65 p-4 sm:p-5"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3
                  id="supplier-portfolio-heading"
                  className="font-semibold text-white"
                >
                  Supplier portfolio
                </h3>
                <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">
                  Compare each supplier’s latest recorded report with its
                  previous report. Reports older than 90 days are marked
                  outdated; missing metrics remain blank and no grades are
                  inferred.
                </p>
              </div>
              <button
                type="button"
                onClick={exportPortfolioCsv}
                disabled={portfolioRows.length === 0}
                className="w-fit rounded-lg border border-cyan-800 bg-cyan-950/40 px-3 py-2 text-xs font-medium text-cyan-200 hover:border-cyan-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Download CSV
              </button>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <label className="text-xs font-medium text-slate-300">
                Search suppliers
                <input
                  type="search"
                  value={portfolioSearch}
                  onChange={(event) => setPortfolioSearch(event.target.value)}
                  placeholder="Name or supplier code"
                  className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600"
                />
              </label>
              <label className="text-xs font-medium text-slate-300">
                Latest report within
                <select
                  value={portfolioPeriod}
                  onChange={(event) => setPortfolioPeriod(event.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-100"
                >
                  <option value="all">Any time</option>
                  <option value="30">Last 30 days</option>
                  <option value="90">Last 90 days</option>
                  <option value="365">Last 12 months</option>
                </select>
              </label>
              <label className="text-xs font-medium text-slate-300">
                Show
                <select
                  value={portfolioStatus}
                  onChange={(event) => setPortfolioStatus(event.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-100"
                >
                  <option value="all">All suppliers</option>
                  <option value="breaches">Threshold breaches</option>
                  <option value="missing">No reports</option>
                  <option value="outdated">Outdated reports</option>
                  <option value="current">Current reports</option>
                </select>
              </label>
            </div>

            {riskLoadError && (
              <p
                role="alert"
                className="mt-3 rounded-lg border border-rose-900/70 bg-rose-950/30 px-3 py-2 text-xs text-rose-200"
              >
                Risk alerts could not be loaded, so the breach filter may be
                incomplete: {riskLoadError}
              </p>
            )}

            <div className="mt-4 overflow-x-auto rounded-lg border border-slate-800">
              <table className="min-w-[1050px] w-full divide-y divide-slate-800 text-left text-xs text-slate-300">
                <thead className="bg-slate-900/80">
                  <tr>
                    {[
                      { key: "name" as const, label: "Supplier" },
                      { key: "reporting_date" as const, label: "Latest report" },
                      { key: "on_time_delivery_rate" as const, label: "On-time" },
                      { key: "average_lead_time_days" as const, label: "Lead time" },
                      { key: "defect_rate" as const, label: "Defects" },
                      { key: "capacity_utilization" as const, label: "Capacity" },
                    ].map(({ key, label }) => (
                      <th
                        key={key}
                        scope="col"
                        aria-sort={
                          portfolioSort.key === key
                            ? portfolioSort.descending
                              ? "descending"
                              : "ascending"
                            : "none"
                        }
                        className="px-3 py-2.5 font-medium text-slate-400"
                      >
                        <button
                          type="button"
                          onClick={() => togglePortfolioSort(key)}
                          className="inline-flex items-center gap-1 hover:text-white"
                        >
                          {label}
                          <span aria-hidden="true">
                            {portfolioSort.key === key
                              ? portfolioSort.descending
                                ? "↓"
                                : "↑"
                              : "↕"}
                          </span>
                        </button>
                      </th>
                    ))}
                    <th scope="col" className="px-3 py-2.5 font-medium text-slate-400">
                      Status / alerts
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {portfolioRows.map(
                    ({ supplier, latest, previous, alerts, ageDays, reportStatus }) => (
                      <tr key={supplier.id} className="hover:bg-slate-900/50">
                        <td className="px-3 py-3">
                          <div className="font-medium text-slate-100">
                            {supplier.name}
                          </div>
                          <div className="mt-0.5 text-[10px] text-slate-500">
                            {supplier.code}
                          </div>
                        </td>
                        <td className="px-3 py-3 tabular-nums">
                          {latest
                            ? new Date(
                                `${latest.reporting_date}T00:00:00`,
                              ).toLocaleDateString()
                            : "No report"}
                        </td>
                        {METRICS.map((metric) => (
                          <td key={metric.key} className="px-3 py-3 tabular-nums">
                            <div className="font-medium text-slate-200">
                              {displayMetric(
                                latest?.[metric.key] ?? null,
                                metric.unit,
                              )}
                            </div>
                            <div className="mt-0.5 text-[10px] text-slate-500">
                              {compactMetricChange(
                                latest?.[metric.key],
                                previous?.[metric.key],
                                metric.unit,
                              )}
                            </div>
                          </td>
                        ))}
                        <td className="max-w-64 px-3 py-3">
                          <span
                            className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                              reportStatus === "missing"
                                ? "border-slate-700 bg-slate-900 text-slate-400"
                                : reportStatus === "outdated"
                                  ? "border-amber-800 bg-amber-950/35 text-amber-200"
                                  : "border-emerald-800 bg-emerald-950/35 text-emerald-200"
                            }`}
                          >
                            {reportStatus === "missing"
                              ? "No reports"
                              : reportStatus === "outdated"
                                ? `Outdated · ${ageDays}d`
                                : `Current · ${ageDays}d ago`}
                          </span>
                          {alerts.length > 0 && (
                            <ul className="mt-2 space-y-1 text-[10px] leading-4 text-rose-200">
                              {alerts.map((alert) => (
                                <li
                                  key={`${alert.performance_record_id}-${alert.metric_label}`}
                                >
                                  {alert.metric_label}: {alert.value}
                                  {alert.unit} (limit {alert.threshold}
                                  {alert.unit})
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    ),
                  )}
                  {portfolioRows.length === 0 && (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-3 py-8 text-center text-sm text-slate-500"
                      >
                        No suppliers match these filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[10px] leading-4 text-slate-500">
              Changes are absolute differences from the previous report (pp =
              percentage points). Status freshness is based on report date; the
              threshold breach filter uses configured workspace limits.
            </p>
          </section>

          <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(19rem,0.82fr)]">
            <div className="grid gap-3 md:grid-cols-2">
              {suppliers.map((supplier) => {
                const supplierRecords =
                  recordsBySupplier.get(supplier.id) ?? [];
                const latest = supplierRecords[0];
                const previous = supplierRecords[1];
                return (
                  <article
                    key={supplier.id}
                    className="rounded-xl border border-slate-800 bg-slate-950/65 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate font-semibold text-slate-100">
                          {supplier.name}
                        </h3>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {supplier.code}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        {latest
                          ? new Date(
                              `${latest.reporting_date}T00:00:00`,
                            ).toLocaleDateString()
                          : "No reports"}
                      </span>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2">
                      {METRICS.map((metric) => {
                        const value = latest?.[metric.key] ?? null;
                        const change = metricChange(
                          value,
                          previous?.[metric.key],
                          metric.unit,
                        );
                        return (
                          <div
                            key={metric.key}
                            className="min-w-0 rounded-lg border border-slate-800/80 bg-slate-900/70 p-3"
                          >
                            <p className="truncate text-[11px] font-medium text-slate-500">
                              {metric.shortLabel}
                            </p>
                            <p className="mt-1 text-lg font-semibold tabular-nums text-slate-100">
                              {displayMetric(value, metric.unit)}
                            </p>
                            <p
                              className="mt-1 truncate text-[10px] text-slate-500"
                              title={change ?? undefined}
                            >
                              {change ?? (latest ? "No previous report" : "Not recorded")}
                            </p>
                          </div>
                        );
                      })}
                    </div>

                    {latest?.source_reference && (
                      <p className="mt-3 truncate text-xs text-slate-400">
                        Source:{" "}
                        <span className="text-slate-300">
                          {latest.source_reference}
                        </span>
                      </p>
                    )}
                    {latest?.notes && (
                      <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-400">
                        {latest.notes}
                      </p>
                    )}
                    {supplierRecords.length > 1 && (
                      <details className="mt-3 border-t border-slate-800 pt-3">
                        <summary className="cursor-pointer text-xs font-medium text-cyan-200 hover:text-cyan-100">
                          View {Math.min(supplierRecords.length - 1, 5)} earlier{" "}
                          {supplierRecords.length - 1 === 1
                            ? "report"
                            : "reports"}
                        </summary>
                        <ul className="mt-2 space-y-2">
                          {supplierRecords.slice(1, 6).map((record) => (
                            <li
                              key={record.id}
                              className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400"
                            >
                              <time dateTime={record.reporting_date}>
                                {new Date(
                                  `${record.reporting_date}T00:00:00`,
                                ).toLocaleDateString()}
                              </time>
                              <span>
                                On-time{" "}
                                {displayMetric(
                                  record.on_time_delivery_rate,
                                  "%",
                                )}
                                {" · "}
                                Lead{" "}
                                {displayMetric(
                                  record.average_lead_time_days,
                                  " days",
                                )}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </article>
                );
              })}
              {!loading && records.length === 0 && (
                <p className="rounded-xl border border-dashed border-slate-700 bg-slate-950/40 p-4 text-sm text-slate-400 md:col-span-2">
                  No performance reports yet. Submit measured data to populate
                  the scorecards.
                </p>
              )}
              {loading && (
                <p role="status" className="text-sm text-cyan-200 md:col-span-2">
                  Loading supplier reports…
                </p>
              )}
            </div>

            {canEdit ? (
              <form
                onSubmit={submitReport}
                className="rounded-xl border border-slate-800 bg-slate-950/75 p-4 sm:p-5"
              >
              <div className="mb-4">
                <h3 className="font-semibold text-white">Record a report</h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  One report per supplier and reporting date. Leave unavailable
                  metrics blank.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-medium text-slate-300 sm:col-span-2">
                  Supplier
                  <select
                    required
                    value={selectedSupplierId}
                    onChange={(event) =>
                      setSelectedSupplierId(event.target.value)
                    }
                    className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-100"
                  >
                    <option value="">Choose a supplier</option>
                    {suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name} ({supplier.code})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-medium text-slate-300 sm:col-span-2">
                  Reporting date
                  <input
                    type="date"
                    required
                    value={reportingDate}
                    onChange={(event) => setReportingDate(event.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-100"
                  />
                </label>
                {METRICS.map((metric) => (
                  <label
                    key={metric.key}
                    className="text-xs font-medium text-slate-300"
                  >
                    {metric.label}
                    <span className="ml-1 font-normal text-slate-500">
                      ({metric.unit.trim()})
                    </span>
                    <input
                      type="number"
                      min={metric.min}
                      max={metric.max}
                      step="any"
                      value={metricValues[metric.key]}
                      onChange={(event) =>
                        setMetricValues((current) => ({
                          ...current,
                          [metric.key]: event.target.value,
                        }))
                      }
                      placeholder="Not recorded"
                      className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600"
                    />
                  </label>
                ))}
                <label className="text-xs font-medium text-slate-300 sm:col-span-2">
                  Source reference <span className="font-normal text-slate-500">(optional)</span>
                  <input
                    value={sourceReference}
                    onChange={(event) => setSourceReference(event.target.value)}
                    maxLength={500}
                    placeholder="Report, ERP extract, or document ID"
                    className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600"
                  />
                </label>
                <label className="text-xs font-medium text-slate-300 sm:col-span-2">
                  Notes <span className="font-normal text-slate-500">(optional)</span>
                  <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    maxLength={1000}
                    rows={2}
                    placeholder="Add context about the reporting period"
                    className="mt-1.5 w-full resize-y rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600"
                  />
                </label>
              </div>

              <p className="mt-3 text-[11px] leading-5 text-slate-500">
                Delivery and defect rates are percentages from 0–100. Lead
                time is measured in days; capacity utilization may exceed
                100%. Values are user-provided and are not independently
                verified.
              </p>
              <button
                type="submit"
                disabled={saving}
                className="mt-4 w-full rounded-lg bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-950/25 hover:bg-emerald-300 disabled:cursor-wait disabled:opacity-60"
              >
                {saving ? "Saving report…" : "Save performance report"}
              </button>
              </form>
            ) : (
              <p className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-sm leading-6 text-slate-400">
                You have read-only access to this workspace. An owner or editor
                can record supplier performance reports.
              </p>
            )}
          </div>

          <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/65 p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-semibold text-white">Import supplier reports</h3>
                <p className="mt-1 text-xs leading-5 text-slate-400">
                  Upload a CSV or Excel file with supplier, reporting date, and measured metrics.
                  The app validates rows before saving them.
                </p>
              </div>
              <label className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-cyan-700 bg-cyan-950/50 px-3 py-2 text-sm font-medium text-cyan-200 hover:border-cyan-500 hover:bg-cyan-950/70">
                {importLoading ? "Checking file…" : "Select file"}
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls,.xlsm"
                  className="hidden"
                  onChange={handleImportUpload}
                />
              </label>
            </div>

            {importPreview && (
              <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                <div className="flex flex-col gap-2 text-sm text-slate-300 sm:flex-row sm:items-center sm:justify-between">
                  <span className="font-medium text-slate-200">
                    {importPreview.filename}
                  </span>
                  <span className="text-xs text-slate-400">
                    {importPreview.valid_rows} valid / {importPreview.invalid_rows} invalid / {importPreview.total_rows} total
                  </span>
                </div>

                {importRows.length > 0 && (
                  <div className="mt-4 overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-800 text-left text-xs text-slate-300">
                      <thead>
                        <tr>
                          <th className="pb-2 pr-3 font-medium text-slate-400">Row</th>
                          <th className="pb-2 pr-3 font-medium text-slate-400">Supplier</th>
                          <th className="pb-2 pr-3 font-medium text-slate-400">Date</th>
                          <th className="pb-2 pr-3 font-medium text-slate-400">Metrics</th>
                          <th className="pb-2 font-medium text-slate-400">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {importRows.map((row) => {
                          const record = row.data as Record<string, unknown>;
                          const supplier =
                            typeof record.supplier_node_id !== "undefined"
                              ? `Supplier #${record.supplier_node_id}`
                              : typeof record.supplier_code === "string"
                                ? record.supplier_code
                                : typeof record.supplier_name === "string"
                                  ? record.supplier_name
                                  : "—";
                          const dateValue =
                            typeof record.reporting_date === "string"
                              ? record.reporting_date
                              : typeof record.date === "string"
                                ? record.date
                                : "—";
                          const metrics = [
                            record.on_time_delivery_rate,
                            record.average_lead_time_days,
                            record.defect_rate,
                            record.capacity_utilization,
                          ]
                            .filter((value) => value !== undefined && value !== null && value !== "")
                            .slice(0, 3)
                            .map((value) => String(value))
                            .join(" • ");
                          return (
                            <tr key={row.row_number}>
                              <td className="py-2 pr-3 align-top text-slate-400">{row.row_number}</td>
                              <td className="py-2 pr-3 align-top">{supplier}</td>
                              <td className="py-2 pr-3 align-top">{dateValue}</td>
                              <td className="py-2 pr-3 align-top">{metrics || "—"}</td>
                              <td className="py-2 align-top">
                                {row.valid ? (
                                  <span className="rounded-full border border-emerald-800 bg-emerald-950/40 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-200">
                                    Valid
                                  </span>
                                ) : (
                                  <div className="space-y-1">
                                    <span className="rounded-full border border-rose-800 bg-rose-950/40 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-rose-200">
                                      Needs review
                                    </span>
                                    <div className="text-[10px] leading-4 text-rose-200">
                                      {row.errors.join("; ")}
                                    </div>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-slate-400">
                    Valid rows are saved only after you confirm the import.
                  </p>
                  <button
                    type="button"
                    onClick={finalizeImport}
                    disabled={importSaving || buildImportPayload(importRows).length === 0}
                    className="rounded-lg bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950 shadow-lg shadow-cyan-950/25 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {importSaving ? "Importing…" : "Import valid rows"}
                  </button>
                </div>
              </div>
            )}
          </div>

          <section
            aria-labelledby="supplier-trends-heading"
            className="mt-5 rounded-xl border border-slate-800 bg-slate-950/65 p-4 sm:p-5"
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h3
                  id="supplier-trends-heading"
                  className="font-semibold text-white"
                >
                  Supplier performance trends
                </h3>
                <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-400">
                  Compare recorded metrics over time. A trend watch appears
                  when the last three available reports move adversely in a
                  row; it is a prompt to review, not a prediction.
                </p>
              </div>
              <span className="w-fit rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-slate-400">
                {trendRecords.length} {trendRecords.length === 1 ? "report" : "reports"}
              </span>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <label className="text-xs font-medium text-slate-300">
                Supplier
                <select
                  value={activeTrendSupplierId}
                  onChange={(event) => setTrendSupplierId(event.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-100"
                >
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name} ({supplier.code})
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-medium text-slate-300">
                From date
                <input
                  type="date"
                  value={trendStartDate}
                  onChange={(event) => setTrendStartDate(event.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-100"
                />
              </label>
              <label className="text-xs font-medium text-slate-300">
                To date
                <input
                  type="date"
                  value={trendEndDate}
                  onChange={(event) => setTrendEndDate(event.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-100"
                />
              </label>
            </div>

            {displayedTrendError && (
              <p
                role="alert"
                className="mt-3 rounded-lg border border-rose-900/70 bg-rose-950/30 px-3 py-2 text-sm text-rose-200"
              >
                {displayedTrendError}
              </p>
            )}
            {trendLoading && activeTrendSupplierId && !trendDateRangeError && (
              <p role="status" className="mt-3 text-sm text-cyan-200">
                Loading supplier trends…
              </p>
            )}
            {!activeTrendSupplierId ? (
              <p className="mt-4 rounded-lg border border-dashed border-slate-800 p-4 text-sm text-slate-500">
                Choose a supplier to view its report history.
              </p>
            ) : trendLoading || displayedTrendError ? null : trendRecords.length === 0 ? (
              <p className="mt-4 rounded-lg border border-dashed border-slate-800 p-4 text-sm text-slate-500">
                No reports match this supplier and date range.
              </p>
            ) : (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {METRICS.map((metric) => {
                  const trend = metricTrend(trendRecords, metric);
                  const supplier = suppliers.find(
                    (item) => String(item.id) === activeTrendSupplierId,
                  );
                  const measured = trendRecords
                    .map((record) => ({
                      record,
                      value: record[metric.key],
                    }))
                    .filter(
                      (point): point is {
                        record: PerformanceRecord;
                        value: number;
                      } => point.value !== null,
                    );
                  const repeatedWorsening =
                    trend.label === "Worsened 2 reports in a row";
                  return (
                    <article
                      key={metric.key}
                      className="min-w-0 rounded-lg border border-slate-800 bg-slate-900/60 p-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <h4 className="text-sm font-medium text-slate-200">
                            {metric.label}
                          </h4>
                          <p className={`mt-1 text-xs ${trend.tone}`}>
                            {trend.label}
                          </p>
                        </div>
                        {measured.length > 0 && (
                          <p className="text-right text-xs tabular-nums text-slate-400">
                            Latest:{" "}
                            <span className="font-semibold text-slate-200">
                              {displayMetric(
                                measured[measured.length - 1].value,
                                metric.unit,
                              )}
                            </span>
                          </p>
                        )}
                      </div>
                      <SupplierMetricTrendChart
                        metric={metric}
                        records={trendRecords}
                      />
                      {repeatedWorsening && canEdit && supplier && (
                        <button
                          type="button"
                          onClick={() => {
                            const recent = measured.slice(-3);
                            const summary = recent
                              .map(
                                ({ record, value }) =>
                                  `${record.reporting_date}: ${displayMetric(value, metric.unit)}`,
                              )
                              .join(" → ");
                            onCreateAction(
                              `Review the repeated worsening ${metric.label.toLowerCase()} trend for ${supplier.name}. Recorded reports: ${summary}. Verify the source data and operational context.`,
                            );
                          }}
                          className="mt-2 rounded-lg border border-amber-800/70 px-3 py-2 text-xs font-medium text-amber-200 transition hover:border-amber-500 hover:bg-amber-950/30"
                        >
                          Create Control Tower review action
                        </button>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
          <div className="mt-5">
            <SupplierRiskMonitor
              key={`supplier-risk-${companyId}-${records.length}`}
              companyId={companyId}
              nodes={nodes}
              canEdit={canEdit}
              onCreateAction={onCreateAction}
              onAlertsChange={setRiskAlerts}
            />
          </div>
        </>
      )}
    </section>
  );
}
