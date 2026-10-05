"use client";





import { useEffect, useState } from "react";

import jsPDF from "jspdf";

import SupplyChainGraph from "./components/SupplyChainGraph";



const NODE_NAMES: Record<string, string> = {





  SH_SUP: "Shanghai Supplier",





  SH_PORT: "Shanghai Port",





  ROT: "Rotterdam Port",





  ANT: "Antwerp Port",





  HAM: "Hamburg Port",





  FRA_WH: "Frankfurt Warehouse",





  BER: "Berlin Customer",





};






type PublicCompanyResult = {
  external_id: string;
  name: string;
  description: string | null;
  source_url: string | null;
  country: string;
};

type InventoryImpact = {





  node_id: string;





  node_name: string;





  starting_inventory: number;





  daily_demand: number;





  safety_stock: number;





  disruption_days: number;





  demand_during_disruption: number;





  days_of_inventory: number;





  days_until_safety_stock: number;





  projected_inventory: number;





  projected_shortage: number;





  replenishment_arrival_days: number | null;





  shortage_days_before_replenishment: number;





  emergency_inventory_required: number;





  safety_stock_breached: boolean;





  stockout_expected: boolean;





  inventory_risk: string;





};





type RouteResult = {





  route: string[];





  total_cost: number;





  lead_time_days: number;





  bottleneck_capacity: number;





};





type ApiResult = {





  user_message: string;





  parsed_scenario: {





    closed_nodes: string[];





    closed_routes: string[];





    closure_duration_days: number;





    fuel_cost_increase_percent: number;





    source: string;





    destination: string;





  };





  simulation: {





    baseline: RouteResult;





    disrupted: RouteResult | null;





    cost_change_percent: number | null;





    delay_change_days: number | null;





    risk_level: string;





    inventory_impact: InventoryImpact[];





    notes: string[];





  };





  ai_explanation: {





    executive_summary: string;





    route_impact: string;





    inventory_impact: string;





    risk_explanation: string;





    recommended_actions: string[];





  };





};







type CompanyNode = {
  id: number;
  company_id: number;
  code: string;
  name: string;
  node_type: string;
  country: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  capacity: number | null;
  current_inventory: number;
  daily_demand: number;
  safety_stock: number;
  active: boolean;
};

type CompanyRoute = {
  id: number;
  company_id: number;
  source_node_id: number;
  destination_node_id: number;
  transport_mode: string;
  base_cost: number;
  lead_time_days: number;
  capacity: number;
  fuel_dependency: number;
  active: boolean;
};

type Company = {
  id: number;
  name: string;
  description: string | null;
  is_demo: boolean;
};

type ScenarioHistoryItem = {



  id: number;



  message: string;



  createdAt: string;



  result: ApiResult;



};





function routeToText(route?: string[]) {





  if (!route) return "No feasible route";





  return route





    .map((node) => NODE_NAMES[node] ?? node)





    .join(" → ");





}





export default function Home() {





  const [scenario, setScenario] = useState(





    "Close Rotterdam port for 14 days and increase fuel prices by 30%."





  );





  const [result, setResult] =





    useState<ApiResult | null>(null);





  const [loading, setLoading] =





    useState(false);





  const [error, setError] =





    useState("");





  const [history, setHistory] =

    useState<ScenarioHistoryItem[]>([]);

  const [companies, setCompanies] =
    useState<Company[]>([]);

  const [selectedCompanyId, setSelectedCompanyId] =
    useState<number>(1);

  const [companiesLoading, setCompaniesLoading] =
    useState(true);

  const [companiesError, setCompaniesError] =
    useState("");

  const [showCreateCompany, setShowCreateCompany] =
    useState(false);

  const [newCompanyName, setNewCompanyName] =
    useState("");

  const [newCompanyDescription, setNewCompanyDescription] =
    useState("");

  const [creatingCompany, setCreatingCompany] =
    useState(false);

  const [createCompanyError, setCreateCompanyError] =
    useState("");

  const [companyNodes, setCompanyNodes] =
    useState<CompanyNode[]>([]);

  const [companyRoutes, setCompanyRoutes] =
    useState<CompanyRoute[]>([]);

  const [networkLoading, setNetworkLoading] =
    useState(false);

  const [networkError, setNetworkError] =
    useState("");

  const [showAddNode, setShowAddNode] =
    useState(false);

  const [showAddRoute, setShowAddRoute] =
    useState(false);

  const [newNodeType, setNewNodeType] =
    useState("SUPPLIER");

  const [newNodeCode, setNewNodeCode] =
    useState("");

  const [newNodeName, setNewNodeName] =
    useState("");

  const [newNodeCity, setNewNodeCity] =
    useState("");

  const [newNodeCountry, setNewNodeCountry] =
    useState("India");

  const [newNodeCapacity, setNewNodeCapacity] =
    useState("");

  const [newNodeInventory, setNewNodeInventory] =
    useState("0");

  const [newNodeDailyDemand, setNewNodeDailyDemand] =
    useState("0");

  const [newNodeSafetyStock, setNewNodeSafetyStock] =
    useState("0");

  const [nodeSaving, setNodeSaving] =
    useState(false);

  const [nodeSaveError, setNodeSaveError] =
    useState("");

  const [newRouteSourceId, setNewRouteSourceId] =
    useState("");

  const [newRouteDestinationId, setNewRouteDestinationId] =
    useState("");

  const [newRouteMode, setNewRouteMode] =
    useState("road");

  const [newRouteCost, setNewRouteCost] =
    useState("");

  const [newRouteLeadTime, setNewRouteLeadTime] =
    useState("");

  const [newRouteCapacity, setNewRouteCapacity] =
    useState("");

  const [newRouteFuelDependency, setNewRouteFuelDependency] =
    useState("1");

  const [routeSaving, setRouteSaving] =
    useState(false);

  const [routeSaveError, setRouteSaveError] =
    useState("");


  const [countryOptions, setCountryOptions] =
    useState<string[]>([
      "India",
      "United States",
      "United Kingdom",
      "Germany",
      "China",
      "Japan",
      "Singapore",
      "Australia",
      "United Arab Emirates",
    ]);

  const [selectedCountry, setSelectedCountry] =
    useState("India");

  const [companySearch, setCompanySearch] =
    useState("");

  const [publicCompanies, setPublicCompanies] =
    useState<PublicCompanyResult[]>([]);

  const [publicSearchLoading, setPublicSearchLoading] =
    useState(false);

  const [publicSearchError, setPublicSearchError] =
    useState("");

  const [companyActionLoading, setCompanyActionLoading] =
    useState("");

  const [companyActionMessage, setCompanyActionMessage] =
    useState("");

  const [companyActionError, setCompanyActionError] =
    useState("");




  useEffect(() => {
    async function loadCompanies() {
      try {
        setCompaniesLoading(true);
        setCompaniesError("");

        const response = await fetch(
          "http://127.0.0.1:8001/companies"
        );

        if (!response.ok) {
          throw new Error(
            "Unable to load companies/workspaces."
          );
        }

        const data: Company[] =
          await response.json();

        setCompanies(data);

        if (data.length > 0) {
          setSelectedCompanyId((currentId) => {
            const exists = data.some(
              (company) =>
                company.id === currentId
            );

            return exists
              ? currentId
              : data[0].id;
          });
        }
      } catch (err) {
        if (err instanceof Error) {
          setCompaniesError(err.message);
        } else {
          setCompaniesError(
            "Unable to load companies/workspaces."
          );
        }
      } finally {
        setCompaniesLoading(false);
      }
    }

    loadCompanies();
  }, []);


  async function loadCompanyNetwork(
    companyId: number
  ) {
    try {
      setNetworkLoading(true);
      setNetworkError("");

      const [
        nodesResponse,
        routesResponse,
      ] = await Promise.all([
        fetch(
          `http://127.0.0.1:8001/companies/${companyId}/nodes`
        ),
        fetch(
          `http://127.0.0.1:8001/companies/${companyId}/routes`
        ),
      ]);

      if (!nodesResponse.ok) {
        throw new Error(
          "Unable to load company nodes."
        );
      }

      if (!routesResponse.ok) {
        throw new Error(
          "Unable to load company routes."
        );
      }

      const nodesData: CompanyNode[] =
        await nodesResponse.json();

      const routesData: CompanyRoute[] =
        await routesResponse.json();

      setCompanyNodes(nodesData);
      setCompanyRoutes(routesData);
    } catch (err) {
      if (err instanceof Error) {
        setNetworkError(err.message);
      } else {
        setNetworkError(
          "Unable to load company network."
        );
      }

      setCompanyNodes([]);
      setCompanyRoutes([]);
    } finally {
      setNetworkLoading(false);
    }
  }

  async function createNode() {
    const code =
      newNodeCode.trim().toUpperCase();

    const name =
      newNodeName.trim();

    if (!code || !name) {
      setNodeSaveError(
        "Node code and name are required."
      );
      return;
    }

    try {
      setNodeSaving(true);
      setNodeSaveError("");

      const response = await fetch(
        `http://127.0.0.1:8001/companies/${selectedCompanyId}/nodes`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            code,
            name,
            node_type: newNodeType,
            country:
              newNodeCountry.trim() ||
              null,
            city:
              newNodeCity.trim() ||
              null,
            latitude: null,
            longitude: null,
            capacity:
              newNodeCapacity.trim()
                ? Number(newNodeCapacity)
                : null,
            current_inventory:
              Number(
                newNodeInventory || 0
              ),
            daily_demand:
              Number(
                newNodeDailyDemand || 0
              ),
            safety_stock:
              Number(
                newNodeSafetyStock || 0
              ),
            active: true,
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail ||
            "Unable to create node."
        );
      }

      setNewNodeCode("");
      setNewNodeName("");
      setNewNodeCity("");
      setNewNodeCountry("India");
      setNewNodeCapacity("");
      setNewNodeInventory("0");
      setNewNodeDailyDemand("0");
      setNewNodeSafetyStock("0");
      setShowAddNode(false);

      await loadCompanyNetwork(
        selectedCompanyId
      );
    } catch (err) {
      if (err instanceof Error) {
        setNodeSaveError(err.message);
      } else {
        setNodeSaveError(
          "Unable to create node."
        );
      }
    } finally {
      setNodeSaving(false);
    }
  }

  async function createRoute() {
    if (
      !newRouteSourceId ||
      !newRouteDestinationId ||
      !newRouteCost ||
      !newRouteLeadTime ||
      !newRouteCapacity
    ) {
      setRouteSaveError(
        "Source, destination, cost, lead time and capacity are required."
      );
      return;
    }

    if (
      newRouteSourceId ===
      newRouteDestinationId
    ) {
      setRouteSaveError(
        "Source and destination must be different."
      );
      return;
    }

    try {
      setRouteSaving(true);
      setRouteSaveError("");

      const response = await fetch(
        `http://127.0.0.1:8001/companies/${selectedCompanyId}/routes`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            source_node_id:
              Number(
                newRouteSourceId
              ),
            destination_node_id:
              Number(
                newRouteDestinationId
              ),
            transport_mode:
              newRouteMode,
            base_cost:
              Number(
                newRouteCost
              ),
            lead_time_days:
              Number(
                newRouteLeadTime
              ),
            capacity:
              Number(
                newRouteCapacity
              ),
            fuel_dependency:
              Number(
                newRouteFuelDependency
              ),
            active: true,
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail ||
            "Unable to create route."
        );
      }

      setNewRouteSourceId("");
      setNewRouteDestinationId("");
      setNewRouteMode("road");
      setNewRouteCost("");
      setNewRouteLeadTime("");
      setNewRouteCapacity("");
      setNewRouteFuelDependency("1");
      setShowAddRoute(false);

      await loadCompanyNetwork(
        selectedCompanyId
      );
    } catch (err) {
      if (err instanceof Error) {
        setRouteSaveError(err.message);
      } else {
        setRouteSaveError(
          "Unable to create route."
        );
      }
    } finally {
      setRouteSaving(false);
    }
  }


  async function loadCountries() {
    try {
      const response = await fetch(
        "http://127.0.0.1:8001/public-directory/countries"
      );

      if (!response.ok) {
        return;
      }

      const data = await response.json();

      if (
        Array.isArray(data.countries) &&
        data.countries.length > 0
      ) {
        setCountryOptions(
          data.countries
        );
      }
    } catch {
      // Keep frontend fallback countries.
    }
  }

  async function searchPublicCompanies() {
    const query =
      companySearch.trim();

    if (!query) {
      setPublicSearchError(
        "Enter a company name or part of a company name."
      );
      return;
    }

    try {
      setPublicSearchLoading(true);
      setPublicSearchError("");
      setPublicCompanies([]);
      setCompanyActionMessage("");
      setCompanyActionError("");

      const params =
        new URLSearchParams({
          country: selectedCountry,
          q: query,
        });

      const response = await fetch(
        `http://127.0.0.1:8001/public-directory/companies?${params.toString()}`
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail ||
            "Unable to search the public company directory."
        );
      }

      setPublicCompanies(
        Array.isArray(data.results)
          ? data.results
          : []
      );
    } catch (err) {
      if (err instanceof Error) {
        setPublicSearchError(
          err.message
        );
      } else {
        setPublicSearchError(
          "Unable to search companies."
        );
      }
    } finally {
      setPublicSearchLoading(false);
    }
  }

  async function importSelectedPublicCompany(
    company: PublicCompanyResult
  ) {
    try {
      setCompanyActionLoading(
        company.external_id
      );
      setCompanyActionError("");
      setCompanyActionMessage("");

      const response = await fetch(
        "http://127.0.0.1:8001/public-directory/import-company",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify(
            company
          ),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail ||
            "Unable to open this company workspace."
        );
      }

      await refreshCompanies();

      setSelectedCompanyId(
        data.company.id
      );

      setCompanyActionMessage(
        `${data.company.name} is now selected. ${
          data.created
            ? "A new local workspace was created."
            : "The existing local workspace was opened."
        }`
      );
    } catch (err) {
      if (err instanceof Error) {
        setCompanyActionError(
          err.message
        );
      } else {
        setCompanyActionError(
          "Unable to select company."
        );
      }
    } finally {
      setCompanyActionLoading("");
    }
  }

  async function uploadExcelFile(
    file: File
  ) {
    try {
      setCompanyActionLoading(
        "excel"
      );
      setCompanyActionError("");
      setCompanyActionMessage("");

      const params =
        new URLSearchParams({
          filename: file.name,
        });

      const response = await fetch(
        `http://127.0.0.1:8001/public-directory/import-excel/${selectedCompanyId}?${params.toString()}`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/octet-stream",
          },
          body: file,
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail ||
            "Excel import failed."
        );
      }

      await loadCompanyNetwork(
        selectedCompanyId
      );

      setCompanyActionMessage(
        `Excel imported: ${data.nodes_imported} nodes and ${data.routes_imported} routes.`
      );
    } catch (err) {
      if (err instanceof Error) {
        setCompanyActionError(
          err.message
        );
      } else {
        setCompanyActionError(
          "Excel import failed."
        );
      }
    } finally {
      setCompanyActionLoading("");
    }
  }

  async function createDemoNetwork() {
    try {
      setCompanyActionLoading(
        "demo"
      );
      setCompanyActionError("");
      setCompanyActionMessage("");

      const response = await fetch(
        `http://127.0.0.1:8001/public-directory/create-demo-network/${selectedCompanyId}`,
        {
          method: "POST",
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail ||
            "Unable to create demo network."
        );
      }

      await loadCompanyNetwork(
        selectedCompanyId
      );

      setCompanyActionMessage(
        data.message ||
          "Synthetic demo network created. It is clearly marked as demo/estimated data."
      );
    } catch (err) {
      if (err instanceof Error) {
        setCompanyActionError(
          err.message
        );
      } else {
        setCompanyActionError(
          "Unable to create demo network."
        );
      }
    } finally {
      setCompanyActionLoading("");
    }
  }

  async function importPublicData() {
    try {
      setCompanyActionLoading(
        "public"
      );
      setCompanyActionError("");
      setCompanyActionMessage("");

      const response = await fetch(
        `http://127.0.0.1:8001/public-directory/import-public-data/${selectedCompanyId}`,
        {
          method: "POST",
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail ||
            "Unable to import public company data."
        );
      }

      await refreshCompanies();

      setCompanyActionMessage(
        data.message ||
          "Public company information imported. Private operational values were not invented."
      );
    } catch (err) {
      if (err instanceof Error) {
        setCompanyActionError(
          err.message
        );
      } else {
        setCompanyActionError(
          "Unable to import public company data."
        );
      }
    } finally {
      setCompanyActionLoading("");
    }
  }

  async function refreshCompanies() {
    const response = await fetch(
      "http://127.0.0.1:8001/companies"
    );

    if (!response.ok) {
      throw new Error(
        "Unable to load companies/workspaces."
      );
    }

    const data: Company[] =
      await response.json();

    setCompanies(data);

    return data;
  }

  async function createCompany() {
    const trimmedName =
      newCompanyName.trim();

    if (!trimmedName) {
      setCreateCompanyError(
        "Company name is required."
      );
      return;
    }

    try {
      setCreatingCompany(true);
      setCreateCompanyError("");

      const response = await fetch(
        "http://127.0.0.1:8001/companies",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            name: trimmedName,
            description:
              newCompanyDescription.trim() ||
              null,
            is_demo: false,
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail ||
            "Unable to create company/workspace."
        );
      }

      const updatedCompanies =
        await refreshCompanies();

      setSelectedCompanyId(
        data.id
      );

      setNewCompanyName("");
      setNewCompanyDescription("");
      setShowCreateCompany(false);

      if (
        !updatedCompanies.some(
          (company) =>
            company.id === data.id
        )
      ) {
        setCompanies((current) => [
          ...current,
          data,
        ]);
      }
    } catch (err) {
      if (err instanceof Error) {
        setCreateCompanyError(
          err.message
        );
      } else {
        setCreateCompanyError(
          "Unable to create company/workspace."
        );
      }
    } finally {
      setCreatingCompany(false);
    }
  }

  useEffect(() => {
    loadCountries();
  }, []);

  useEffect(() => {
    if (selectedCompanyId > 0) {
      loadCompanyNetwork(
        selectedCompanyId
      );
    }
  }, [selectedCompanyId]);

  useEffect(() => {

    const savedHistory = localStorage.getItem(

      "supplychain-scenario-history"

    );



    if (savedHistory) {

      try {

        setHistory(JSON.parse(savedHistory));

      } catch {

        setHistory([]);

      }

    }

  }, []);







  function downloadJsonReport() {
    if (!result) {
      return;
    }

    const selectedCompany =
      companies.find(
        (company) =>
          company.id === selectedCompanyId
      );

    const exportPayload = {
      exported_at: new Date().toISOString(),
      application: "SupplyChain Twin AI",
      company: selectedCompany
        ? {
            id: selectedCompany.id,
            name: selectedCompany.name,
            is_demo: selectedCompany.is_demo,
          }
        : {
            id: selectedCompanyId,
          },
      scenario: result.user_message,
      data: result,
    };

    const jsonBlob = new Blob(
      [
        JSON.stringify(
          exportPayload,
          null,
          2
        ),
      ],
      {
        type: "application/json",
      }
    );

    const downloadUrl =
      URL.createObjectURL(
        jsonBlob
      );

    const link =
      document.createElement("a");

    const safeDate =
      new Date()
        .toISOString()
        .slice(0, 10);

    link.href = downloadUrl;
    link.download =
      `SupplyChain-Twin-AI-Report-${safeDate}.json`;

    document.body.appendChild(
      link
    );

    link.click();

    document.body.removeChild(
      link
    );

    URL.revokeObjectURL(
      downloadUrl
    );
  }


  function downloadPdfReport() {
    if (!result) {
      return;
    }

    const doc = new jsPDF();

    const simulation = result.simulation;
    const baseline = simulation.baseline;
    const disrupted = simulation.disrupted;

    const routeToPdfText = (
      route?: string[]
    ) => {
      if (!route) {
        return "No feasible route";
      }

      return route
        .map(
          (node) =>
            NODE_NAMES[node] ?? node
        )
        .join(" -> ");
    };

    let y = 18;

    const pageWidth =
      doc.internal.pageSize.getWidth();

    const ensureSpace = (
      needed = 12
    ) => {
      if (y + needed > 278) {
        doc.addPage();
        y = 18;
      }
    };

    const addWrappedText = (
      textValue: string,
      size = 10.5,
      spacing = 6
    ) => {
      doc.setFontSize(size);

      const lines =
        doc.splitTextToSize(
          textValue,
          180
        );

      ensureSpace(
        lines.length * spacing + 2
      );

      doc.text(
        lines,
        15,
        y
      );

      y +=
        lines.length * spacing;
    };

    const addSectionTitle = (
      title: string
    ) => {
      y += 4;
      ensureSpace(14);

      doc.setFont(
        "helvetica",
        "bold"
      );

      doc.setFontSize(13);
      doc.text(
        title,
        15,
        y
      );

      y += 3;

      doc.setDrawColor(
        180,
        180,
        180
      );

      doc.line(
        15,
        y,
        pageWidth - 15,
        y
      );

      y += 7;

      doc.setFont(
        "helvetica",
        "normal"
      );
    };

    const addMetric = (
      label: string,
      value: string,
      x: number,
      top: number,
      width: number
    ) => {
      doc.setDrawColor(
        205,
        205,
        205
      );

      doc.roundedRect(
        x,
        top,
        width,
        20,
        2,
        2
      );

      doc.setFont(
        "helvetica",
        "normal"
      );

      doc.setFontSize(8.5);
      doc.text(
        label,
        x + 4,
        top + 7
      );

      doc.setFont(
        "helvetica",
        "bold"
      );

      doc.setFontSize(12);
      doc.text(
        value,
        x + 4,
        top + 15
      );
    };

    // Title block
    doc.setFont(
      "helvetica",
      "bold"
    );

    doc.setFontSize(19);
    doc.text(
      "SupplyChain Twin AI",
      15,
      y
    );

    y += 8;

    doc.setFontSize(12);
    doc.setFont(
      "helvetica",
      "normal"
    );

    doc.text(
      "Digital Twin Stress-Test Simulation Report",
      15,
      y
    );

    y += 7;

    doc.setFontSize(9);
    doc.text(
      `Generated: ${new Date().toLocaleString()}`,
      15,
      y
    );

    y += 5;

    doc.setDrawColor(
      120,
      120,
      120
    );

    doc.line(
      15,
      y,
      pageWidth - 15,
      y
    );

    y += 9;

    doc.setFont(
      "helvetica",
      "bold"
    );

    addWrappedText(
      "Scenario",
      11
    );

    doc.setFont(
      "helvetica",
      "normal"
    );

    addWrappedText(
      result.user_message,
      10.5
    );

    const selectedCompany =
      companies.find(
        (company) =>
          company.id === selectedCompanyId
      );

    if (selectedCompany) {
      addWrappedText(
        `Workspace: ${selectedCompany.name} (ID ${selectedCompany.id})`,
        9.5
      );
    }

    y += 3;

    // KPI summary
    ensureSpace(28);

    const metricWidth = 42;
    const metricGap = 4;
    const metricTop = y;

    addMetric(
      "Risk Level",
      simulation.risk_level,
      15,
      metricTop,
      metricWidth
    );

    addMetric(
      "Baseline Cost",
      baseline.total_cost.toLocaleString(),
      15 +
        metricWidth +
        metricGap,
      metricTop,
      metricWidth
    );

    addMetric(
      "Disrupted Cost",
      disrupted
        ? disrupted.total_cost.toLocaleString()
        : "No Route",
      15 +
        (metricWidth + metricGap) *
          2,
      metricTop,
      metricWidth
    );

    addMetric(
      "Cost Change",
      simulation.cost_change_percent !==
        null
        ? `${simulation.cost_change_percent}%`
        : "N/A",
      15 +
        (metricWidth + metricGap) *
          3,
      metricTop,
      metricWidth
    );

    y += 27;

    addWrappedText(
      `Lead-Time Change: ${
        simulation.delay_change_days !==
        null
          ? `${
              simulation.delay_change_days >=
              0
                ? "+"
                : ""
            }${simulation.delay_change_days} days`
          : "N/A"
      }`,
      10.5
    );

    addSectionTitle(
      "Route Comparison"
    );

    doc.setFont(
      "helvetica",
      "bold"
    );

    addWrappedText(
      "Baseline Route",
      10.5
    );

    doc.setFont(
      "helvetica",
      "normal"
    );

    addWrappedText(
      routeToPdfText(
        baseline.route
      )
    );

    y += 2;

    doc.setFont(
      "helvetica",
      "bold"
    );

    addWrappedText(
      "Disrupted Route",
      10.5
    );

    doc.setFont(
      "helvetica",
      "normal"
    );

    addWrappedText(
      disrupted
        ? routeToPdfText(
            disrupted.route
          )
        : "No feasible route remains."
    );

    addSectionTitle(
      "Inventory Exposure"
    );

    simulation.inventory_impact.forEach(
      (item) => {
        ensureSpace(43);

        doc.setFont(
          "helvetica",
          "bold"
        );

        addWrappedText(
          `${item.node_name} - ${item.inventory_risk} Risk`,
          10.5
        );

        doc.setFont(
          "helvetica",
          "normal"
        );

        addWrappedText(
          `Starting inventory: ${item.starting_inventory.toLocaleString()} units | Daily demand: ${item.daily_demand.toLocaleString()} units | Safety stock: ${item.safety_stock.toLocaleString()} units`
        );

        addWrappedText(
          `Inventory coverage: ${item.days_of_inventory} days | Replenishment arrival: ${
            item.replenishment_arrival_days !==
            null
              ? `Day ${item.replenishment_arrival_days}`
              : "Unknown"
          }`
        );

        addWrappedText(
          `Shortage window: ${item.shortage_days_before_replenishment} days | Emergency inventory required: ${item.emergency_inventory_required.toLocaleString()} units`
        );

        y += 3;
      }
    );

    addSectionTitle(
      "AI Executive Summary"
    );

    addWrappedText(
      result.ai_explanation
        .executive_summary
    );

    addSectionTitle(
      "Route Impact"
    );

    addWrappedText(
      result.ai_explanation
        .route_impact
    );

    addSectionTitle(
      "Inventory Impact"
    );

    addWrappedText(
      result.ai_explanation
        .inventory_impact
    );

    addSectionTitle(
      "Risk Explanation"
    );

    addWrappedText(
      result.ai_explanation
        .risk_explanation
    );

    addSectionTitle(
      "Recommended Actions"
    );

    result.ai_explanation
      .recommended_actions
      .forEach(
        (action, index) => {
          addWrappedText(
            `${index + 1}. ${action}`
          );
        }
      );

    addSectionTitle(
      "Simulation Notes"
    );

    simulation.notes.forEach(
      (note) => {
        addWrappedText(
          `- ${note}`
        );
      }
    );

    // Page footer
    const pageCount =
      doc.getNumberOfPages();

    for (
      let pageNumber = 1;
      pageNumber <= pageCount;
      pageNumber += 1
    ) {
      doc.setPage(pageNumber);

      doc.setFont(
        "helvetica",
        "normal"
      );

      doc.setFontSize(8);
      doc.setTextColor(
        100,
        100,
        100
      );

      doc.text(
        `SupplyChain Twin AI | Page ${pageNumber} of ${pageCount}`,
        pageWidth / 2,
        290,
        {
          align: "center",
        }
      );
    }

    doc.setTextColor(
      0,
      0,
      0
    );

    const safeDate =
      new Date()
        .toISOString()
        .slice(0, 10);

    doc.save(
      `SupplyChain-Twin-AI-Report-${safeDate}.pdf`
    );
  }

  async function runSimulation() {





    setLoading(true);





    setError("");





    try {





      const response = await fetch(





        "http://127.0.0.1:8001/simulate/natural",





        {





          method: "POST",





          headers: {





            "Content-Type": "application/json",





          },





          body: JSON.stringify({





            message: scenario,





            company_id: selectedCompanyId,





          }),





        }





      );





      const data = await response.json();





      if (!response.ok) {





        throw new Error(





          data.detail ||





            "Simulation request failed."





        );





      }





      setResult(data);





      const newHistoryItem: ScenarioHistoryItem = {



        id: Date.now(),



        message: scenario,



        createdAt:



          new Date().toLocaleString(),



        result: data,



      };





      setHistory((currentHistory) => {



        const updatedHistory = [



          newHistoryItem,



          ...currentHistory,



        ].slice(0, 10);





        localStorage.setItem(



          "supplychain-scenario-history",



          JSON.stringify(



            updatedHistory



          )



        );





        return updatedHistory;



      });





    } catch (err) {





      if (err instanceof Error) {





        setError(err.message);





      } else {





        setError(





          "Unable to run simulation."





        );





      }





    } finally {





      setLoading(false);





    }





  }





  const simulation =





    result?.simulation;





  const baseline =





    simulation?.baseline;





  const disrupted =





    simulation?.disrupted;





  return (





    <main className="min-h-screen bg-slate-950 text-white">





      <div className="mx-auto max-w-7xl px-6 py-8">





        {/* HEADER */}





        <div className="mb-8">





          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-400">





            Digital Twin Simulator





          </p>





          <h1 className="mt-2 text-4xl font-bold">





            SupplyChain Twin AI





          </h1>





          <p className="mt-3 max-w-3xl text-slate-400">





            Simulate disruptions, identify





            alternative routes, calculate





            inventory exposure, and generate





            AI-assisted mitigation recommendations.





          </p>





        </div>






        {/* COUNTRY + COMPANY DISCOVERY */}

        <section className="mb-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-400">
              Company Discovery
            </p>

            <h2 className="text-2xl font-semibold">
              Country → Search Company → Load Supply Chain
            </h2>

            <p className="max-w-4xl text-sm leading-6 text-slate-400">
              Select a country, search a public company directory, open the company as a local workspace, and then use public data, Excel, manual entry, or a clearly labelled synthetic demo network.
            </p>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-[240px_1fr_auto]">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">
                Country
              </label>

              <select
                value={selectedCountry}
                onChange={(event) => {
                  setSelectedCountry(
                    event.target.value
                  );
                  setPublicCompanies([]);
                  setPublicSearchError("");
                }}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-emerald-500"
              >
                {countryOptions.map(
                  (country) => (
                    <option
                      key={country}
                      value={country}
                    >
                      {country}
                    </option>
                  )
                )}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">
                Search Company
              </label>

              <input
                value={companySearch}
                onChange={(event) =>
                  setCompanySearch(
                    event.target.value
                  )
                }
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter"
                  ) {
                    searchPublicCompanies();
                  }
                }}
                placeholder="Example: Tata, Reliance, Mahindra, Siemens..."
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex items-end">
              <button
                onClick={
                  searchPublicCompanies
                }
                disabled={
                  publicSearchLoading ||
                  !companySearch.trim()
                }
                className="w-full rounded-xl bg-emerald-500 px-5 py-3 font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50 lg:w-auto"
              >
                {publicSearchLoading
                  ? "Searching..."
                  : "Search"}
              </button>
            </div>
          </div>

          {publicSearchError && (
            <div className="mt-4 rounded-xl border border-red-900 bg-red-950/40 p-4 text-sm text-red-300">
              {publicSearchError}
            </div>
          )}

          {publicCompanies.length > 0 && (
            <div className="mt-5">
              <p className="mb-3 text-sm font-medium text-slate-300">
                Public directory results
              </p>

              <div className="grid gap-3 lg:grid-cols-2">
                {publicCompanies.map(
                  (company) => (
                    <div
                      key={
                        company.external_id
                      }
                      className="rounded-xl border border-slate-800 bg-slate-950 p-4"
                    >
                      <div className="flex h-full flex-col justify-between gap-4">
                        <div>
                          <p className="font-semibold text-white">
                            {company.name}
                          </p>

                          <p className="mt-1 text-xs text-emerald-400">
                            {company.country} · {company.external_id}
                          </p>

                          {company.description && (
                            <p className="mt-2 text-sm leading-5 text-slate-400">
                              {company.description}
                            </p>
                          )}
                        </div>

                        <button
                          onClick={() =>
                            importSelectedPublicCompany(
                              company
                            )
                          }
                          disabled={
                            companyActionLoading ===
                            company.external_id
                          }
                          className="rounded-xl border border-emerald-700 px-4 py-2 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-950/40 disabled:opacity-50"
                        >
                          {companyActionLoading ===
                          company.external_id
                            ? "Opening..."
                            : "Use This Company"}
                        </button>
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>
          )}

          <div className="mt-7 border-t border-slate-800 pt-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="w-full max-w-xl">
                <label className="mb-2 block text-sm font-medium text-slate-300">
                  Selected / Saved Workspace
                </label>

                <select
                  value={selectedCompanyId}
                  onChange={(event) =>
                    setSelectedCompanyId(
                      Number(
                        event.target.value
                      )
                    )
                  }
                  disabled={
                    companiesLoading ||
                    companies.length === 0
                  }
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-cyan-500"
                >
                  {companies.map(
                    (company) => (
                      <option
                        key={company.id}
                        value={company.id}
                      >
                        {company.name}
                        {company.is_demo
                          ? " (Demo)"
                          : ""}
                      </option>
                    )
                  )}
                </select>

                {companiesError && (
                  <p className="mt-2 text-sm text-red-300">
                    {companiesError}
                  </p>
                )}
              </div>

              <button
                onClick={() =>
                  setShowCreateCompany(
                    (current) => !current
                  )
                }
                className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 font-semibold text-slate-200 transition hover:border-slate-500"
              >
                {showCreateCompany
                  ? "Cancel Custom Company"
                  : "Create Custom Company"}
              </button>
            </div>

            {showCreateCompany && (
              <div className="mt-5 grid gap-4 rounded-xl border border-slate-800 bg-slate-950 p-5 lg:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm text-slate-300">
                    Company / Workspace Name
                  </label>

                  <input
                    value={newCompanyName}
                    onChange={(event) =>
                      setNewCompanyName(
                        event.target.value
                      )
                    }
                    className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none focus:border-cyan-500"
                    placeholder="Company name"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-slate-300">
                    Description
                  </label>

                  <input
                    value={
                      newCompanyDescription
                    }
                    onChange={(event) =>
                      setNewCompanyDescription(
                        event.target.value
                      )
                    }
                    className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none focus:border-cyan-500"
                    placeholder="Optional description"
                  />
                </div>

                {createCompanyError && (
                  <div className="lg:col-span-2 rounded-xl border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">
                    {createCompanyError}
                  </div>
                )}

                <div className="lg:col-span-2">
                  <button
                    onClick={
                      createCompany
                    }
                    disabled={
                      creatingCompany
                    }
                    className="rounded-xl bg-cyan-500 px-5 py-3 font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:opacity-50"
                  >
                    {creatingCompany
                      ? "Creating..."
                      : "Create Workspace"}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="mt-7 border-t border-slate-800 pt-6">
            <h3 className="text-lg font-semibold">
              Company Data Source
            </h3>

            <p className="mt-1 text-sm text-slate-400">
              If the selected company has no supply-chain dataset, choose one of these options.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <label className="cursor-pointer rounded-xl border border-slate-700 bg-slate-950 p-4 transition hover:border-cyan-500">
                <input
                  type="file"
                  accept=".xlsx,.xlsm"
                  className="hidden"
                  onChange={(event) => {
                    const file =
                      event.target
                        .files?.[0];

                    if (file) {
                      uploadExcelFile(
                        file
                      );
                    }

                    event.currentTarget.value =
                      "";
                  }}
                />

                <p className="font-semibold text-cyan-300">
                  Upload Excel
                </p>

                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Import Nodes and Routes sheets from your own workbook.
                </p>
              </label>

              <button
                onClick={() => {
                  setShowAddNode(true);
                  setShowAddRoute(false);
                  setNodeSaveError("");
                }}
                className="rounded-xl border border-slate-700 bg-slate-950 p-4 text-left transition hover:border-emerald-500"
              >
                <p className="font-semibold text-emerald-300">
                  Add Manually
                </p>

                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Enter suppliers, plants, ports, warehouses, customers and routes yourself.
                </p>
              </button>

              <button
                onClick={
                  createDemoNetwork
                }
                disabled={
                  companyActionLoading ===
                  "demo"
                }
                className="rounded-xl border border-slate-700 bg-slate-950 p-4 text-left transition hover:border-amber-500 disabled:opacity-50"
              >
                <p className="font-semibold text-amber-300">
                  Create Demo Network
                </p>

                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Generate a synthetic multi-route network for stress-testing.
                </p>
              </button>

              <button
                onClick={
                  importPublicData
                }
                disabled={
                  companyActionLoading ===
                  "public"
                }
                className="rounded-xl border border-slate-700 bg-slate-950 p-4 text-left transition hover:border-violet-500 disabled:opacity-50"
              >
                <p className="font-semibold text-violet-300">
                  Import Public Data
                </p>

                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Download public company profile information. Private operational values are never invented.
                </p>
              </button>
            </div>

            {companyActionMessage && (
              <div className="mt-4 rounded-xl border border-emerald-900 bg-emerald-950/30 p-4 text-sm text-emerald-300">
                {companyActionMessage}
              </div>
            )}

            {companyActionError && (
              <div className="mt-4 rounded-xl border border-red-900 bg-red-950/40 p-4 text-sm text-red-300">
                {companyActionError}
              </div>
            )}
          </div>

          <div className="mt-7 border-t border-slate-800 pt-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="text-lg font-semibold">
                  Supply Chain Dataset
                </h3>

                <p className="mt-1 text-sm text-slate-400">
                  Everything below belongs only to the currently selected company.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => {
                    setShowAddNode(
                      (current) =>
                        !current
                    );
                    setShowAddRoute(false);
                  }}
                  className="rounded-xl bg-emerald-500 px-4 py-2 font-semibold text-slate-950"
                >
                  Add Node
                </button>

                <button
                  onClick={() => {
                    setShowAddRoute(
                      (current) =>
                        !current
                    );
                    setShowAddNode(false);
                  }}
                  disabled={
                    companyNodes.length < 2
                  }
                  className="rounded-xl bg-cyan-500 px-4 py-2 font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Add Route
                </button>
              </div>
            </div>

            {networkLoading && (
              <p className="mt-4 text-sm text-cyan-300">
                Loading company network...
              </p>
            )}

            {networkError && (
              <div className="mt-4 rounded-xl border border-red-900 bg-red-950/40 p-4 text-sm text-red-300">
                {networkError}
              </div>
            )}

            {!networkLoading && (
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                {[
                  [
                    "Suppliers",
                    companyNodes.filter(
                      (n) =>
                        n.node_type ===
                        "SUPPLIER"
                    ).length,
                  ],
                  [
                    "Plants",
                    companyNodes.filter(
                      (n) =>
                        n.node_type ===
                        "PLANT"
                    ).length,
                  ],
                  [
                    "Ports",
                    companyNodes.filter(
                      (n) =>
                        n.node_type ===
                        "PORT"
                    ).length,
                  ],
                  [
                    "Warehouses / DC",
                    companyNodes.filter(
                      (n) =>
                        n.node_type ===
                          "WAREHOUSE" ||
                        n.node_type ===
                          "DISTRIBUTION_CENTER"
                    ).length,
                  ],
                  [
                    "Customers",
                    companyNodes.filter(
                      (n) =>
                        n.node_type ===
                        "CUSTOMER"
                    ).length,
                  ],
                  [
                    "Routes",
                    companyRoutes.length,
                  ],
                ].map(
                  ([label, value]) => (
                    <div
                      key={String(label)}
                      className="rounded-xl border border-slate-800 bg-slate-950 p-4"
                    >
                      <p className="text-xs text-slate-500">
                        {label}
                      </p>

                      <p className="mt-1 text-2xl font-bold">
                        {value}
                      </p>
                    </div>
                  )
                )}
              </div>
            )}

            {!networkLoading &&
              companyNodes.length === 0 && (
                <div className="mt-5 rounded-xl border border-amber-900 bg-amber-950/20 p-5">
                  <p className="font-semibold text-amber-300">
                    No supply-chain network configured yet.
                  </p>

                  <p className="mt-2 text-sm text-slate-400">
                    Use Upload Excel, Add Manually, Create Demo Network, or Import Public Data above.
                  </p>
                </div>
              )}

            {showAddNode && (
              <div className="mt-6 rounded-xl border border-emerald-900 bg-emerald-950/10 p-5">
                <h4 className="font-semibold text-emerald-300">
                  Add Node
                </h4>

                <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  <select
                    value={newNodeType}
                    onChange={(event) =>
                      setNewNodeType(
                        event.target.value
                      )
                    }
                    className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
                  >
                    <option value="SUPPLIER">
                      Supplier
                    </option>
                    <option value="PLANT">
                      Plant
                    </option>
                    <option value="PORT">
                      Port
                    </option>
                    <option value="WAREHOUSE">
                      Warehouse
                    </option>
                    <option value="DISTRIBUTION_CENTER">
                      Distribution Centre
                    </option>
                    <option value="CUSTOMER">
                      Customer
                    </option>
                  </select>

                  <input
                    value={newNodeCode}
                    onChange={(event) =>
                      setNewNodeCode(
                        event.target.value
                      )
                    }
                    placeholder="Node Code"
                    className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
                  />

                  <input
                    value={newNodeName}
                    onChange={(event) =>
                      setNewNodeName(
                        event.target.value
                      )
                    }
                    placeholder="Node Name"
                    className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
                  />

                  <input
                    value={newNodeCity}
                    onChange={(event) =>
                      setNewNodeCity(
                        event.target.value
                      )
                    }
                    placeholder="City"
                    className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
                  />

                  <input
                    value={newNodeCountry}
                    onChange={(event) =>
                      setNewNodeCountry(
                        event.target.value
                      )
                    }
                    placeholder="Country"
                    className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
                  />

                  <input
                    type="number"
                    value={newNodeCapacity}
                    onChange={(event) =>
                      setNewNodeCapacity(
                        event.target.value
                      )
                    }
                    placeholder="Capacity"
                    className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
                  />

                  <input
                    type="number"
                    value={newNodeInventory}
                    onChange={(event) =>
                      setNewNodeInventory(
                        event.target.value
                      )
                    }
                    placeholder="Inventory"
                    className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
                  />

                  <input
                    type="number"
                    value={newNodeDailyDemand}
                    onChange={(event) =>
                      setNewNodeDailyDemand(
                        event.target.value
                      )
                    }
                    placeholder="Daily Demand"
                    className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
                  />

                  <input
                    type="number"
                    value={newNodeSafetyStock}
                    onChange={(event) =>
                      setNewNodeSafetyStock(
                        event.target.value
                      )
                    }
                    placeholder="Safety Stock"
                    className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
                  />
                </div>

                {nodeSaveError && (
                  <p className="mt-3 text-sm text-red-300">
                    {nodeSaveError}
                  </p>
                )}

                <button
                  onClick={createNode}
                  disabled={nodeSaving}
                  className="mt-4 rounded-xl bg-emerald-500 px-5 py-3 font-semibold text-slate-950 disabled:opacity-50"
                >
                  {nodeSaving
                    ? "Saving..."
                    : "Save Node"}
                </button>
              </div>
            )}

            {showAddRoute && (
              <div className="mt-6 rounded-xl border border-cyan-900 bg-cyan-950/10 p-5">
                <h4 className="font-semibold text-cyan-300">
                  Add Route
                </h4>

                <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  <select
                    value={newRouteSourceId}
                    onChange={(event) =>
                      setNewRouteSourceId(
                        event.target.value
                      )
                    }
                    className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
                  >
                    <option value="">
                      Source
                    </option>

                    {companyNodes.map(
                      (node) => (
                        <option
                          key={node.id}
                          value={node.id}
                        >
                          {node.name}
                        </option>
                      )
                    )}
                  </select>

                  <select
                    value={newRouteDestinationId}
                    onChange={(event) =>
                      setNewRouteDestinationId(
                        event.target.value
                      )
                    }
                    className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
                  >
                    <option value="">
                      Destination
                    </option>

                    {companyNodes.map(
                      (node) => (
                        <option
                          key={node.id}
                          value={node.id}
                        >
                          {node.name}
                        </option>
                      )
                    )}
                  </select>

                  <select
                    value={newRouteMode}
                    onChange={(event) =>
                      setNewRouteMode(
                        event.target.value
                      )
                    }
                    className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
                  >
                    <option value="road">
                      Road
                    </option>
                    <option value="rail">
                      Rail
                    </option>
                    <option value="sea">
                      Sea
                    </option>
                    <option value="air">
                      Air
                    </option>
                    <option value="truck">
                      Truck
                    </option>
                  </select>

                  <input
                    type="number"
                    value={newRouteCost}
                    onChange={(event) =>
                      setNewRouteCost(
                        event.target.value
                      )
                    }
                    placeholder="Cost"
                    className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
                  />

                  <input
                    type="number"
                    step="0.1"
                    value={newRouteLeadTime}
                    onChange={(event) =>
                      setNewRouteLeadTime(
                        event.target.value
                      )
                    }
                    placeholder="Lead Time (days)"
                    className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
                  />

                  <input
                    type="number"
                    value={newRouteCapacity}
                    onChange={(event) =>
                      setNewRouteCapacity(
                        event.target.value
                      )
                    }
                    placeholder="Route Capacity"
                    className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
                  />

                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.1"
                    value={newRouteFuelDependency}
                    onChange={(event) =>
                      setNewRouteFuelDependency(
                        event.target.value
                      )
                    }
                    placeholder="Fuel Dependency 0-1"
                    className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
                  />
                </div>

                {routeSaveError && (
                  <p className="mt-3 text-sm text-red-300">
                    {routeSaveError}
                  </p>
                )}

                <button
                  onClick={createRoute}
                  disabled={routeSaving}
                  className="mt-4 rounded-xl bg-cyan-500 px-5 py-3 font-semibold text-slate-950 disabled:opacity-50"
                >
                  {routeSaving
                    ? "Saving..."
                    : "Save Route"}
                </button>
              </div>
            )}

            {companyNodes.length > 0 && (
              <div className="mt-6 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">
                        Type
                      </th>
                      <th className="px-3 py-2">
                        Code / Name
                      </th>
                      <th className="px-3 py-2">
                        Location
                      </th>
                      <th className="px-3 py-2">
                        Capacity
                      </th>
                      <th className="px-3 py-2">
                        Inventory
                      </th>
                      <th className="px-3 py-2">
                        Daily Demand
                      </th>
                      <th className="px-3 py-2">
                        Safety Stock
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {companyNodes.map(
                      (node) => (
                        <tr
                          key={node.id}
                          className="border-t border-slate-800"
                        >
                          <td className="px-3 py-3">
                            {node.node_type}
                          </td>
                          <td className="px-3 py-3">
                            <p className="font-semibold">
                              {node.name}
                            </p>
                            <p className="text-xs text-slate-500">
                              {node.code}
                            </p>
                          </td>
                          <td className="px-3 py-3">
                            {[node.city, node.country]
                              .filter(Boolean)
                              .join(", ") || "-"}
                          </td>
                          <td className="px-3 py-3">
                            {node.capacity ?? "-"}
                          </td>
                          <td className="px-3 py-3">
                            {node.current_inventory}
                          </td>
                          <td className="px-3 py-3">
                            {node.daily_demand}
                          </td>
                          <td className="px-3 py-3">
                            {node.safety_stock}
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {companyRoutes.length > 0 && (
              <div className="mt-6 overflow-x-auto">
                <h4 className="mb-3 font-semibold">
                  Routes
                </h4>

                <table className="min-w-full text-left text-sm">
                  <thead className="text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">
                        Route
                      </th>
                      <th className="px-3 py-2">
                        Mode
                      </th>
                      <th className="px-3 py-2">
                        Cost
                      </th>
                      <th className="px-3 py-2">
                        Lead Time
                      </th>
                      <th className="px-3 py-2">
                        Capacity
                      </th>
                      <th className="px-3 py-2">
                        Fuel Dependency
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {companyRoutes.map(
                      (route) => {
                        const source =
                          companyNodes.find(
                            (n) =>
                              n.id ===
                              route.source_node_id
                          );

                        const destination =
                          companyNodes.find(
                            (n) =>
                              n.id ===
                              route.destination_node_id
                          );

                        return (
                          <tr
                            key={route.id}
                            className="border-t border-slate-800"
                          >
                            <td className="px-3 py-3 font-medium">
                              {source?.name ??
                                "Unknown"}{" "}
                              →{" "}
                              {destination?.name ??
                                "Unknown"}
                            </td>
                            <td className="px-3 py-3">
                              {route.transport_mode}
                            </td>
                            <td className="px-3 py-3">
                              {route.base_cost.toLocaleString()}
                            </td>
                            <td className="px-3 py-3">
                              {route.lead_time_days} days
                            </td>
                            <td className="px-3 py-3">
                              {route.capacity}
                            </td>
                            <td className="px-3 py-3">
                              {route.fuel_dependency}
                            </td>
                          </tr>
                        );
                      }
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        {/* SCENARIO */}





        <section className="mb-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">





          <h2 className="text-xl font-semibold">





            Stress-Test Scenario





          </h2>





          <p className="mt-1 text-sm text-slate-400">





            Describe a supply-chain disruption





            in normal language.





          </p>





          <textarea





            value={scenario}





            onChange={(event) =>





              setScenario(event.target.value)





            }





            className="mt-5 min-h-32 w-full rounded-xl border border-slate-700 bg-slate-950 p-4 text-white outline-none focus:border-cyan-500"





          />





          <button





            onClick={runSimulation}





            disabled={





              loading ||





              scenario.trim().length === 0





            }





            className="mt-4 rounded-xl bg-cyan-500 px-6 py-3 font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"





          >





            {loading





              ? "Running AI Simulation..."





              : "Run Simulation"}





          </button>





          {error && (





            <div className="mt-4 rounded-xl border border-red-900 bg-red-950/40 p-4 text-red-300">





              {error}





            </div>





          )}





        </section>





        {/* RECENT SCENARIOS */}



        {history.length > 0 && (

          <section className="mb-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">

              <div>

                <h2 className="text-xl font-semibold">

                  Recent Scenarios

                </h2>



                <p className="mt-1 text-sm text-slate-400">

                  Reopen one of your latest successful simulations.

                </p>

              </div>



              <button

                onClick={() => {

                  localStorage.removeItem(

                    "supplychain-scenario-history"

                  );

                  setHistory([]);

                }}

                className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:border-red-700 hover:text-red-300"

              >

                Clear History

              </button>

            </div>



            <div className="mt-5 grid gap-3">

              {history.map((item) => (

                <button

                  key={item.id}

                  onClick={() => {

                    setScenario(item.message);

                    setResult(item.result);

                    setError("");

                  }}

                  className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-left transition hover:border-cyan-700 hover:bg-slate-900"

                >

                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">

                    <div className="min-w-0">

                      <p className="font-medium text-slate-100">

                        {item.message}

                      </p>



                      <p className="mt-2 text-xs text-slate-500">

                        {item.createdAt}

                      </p>

                    </div>



                    <div className="flex shrink-0 items-center gap-3 text-xs">

                      <span className="rounded-full bg-slate-800 px-3 py-1 text-slate-300">

                        {item.result.simulation.risk_level}

                      </span>



                      {item.result.simulation.cost_change_percent !== null && (

                        <span className="text-amber-400">

                          +{item.result.simulation.cost_change_percent}%

                        </span>

                      )}

                    </div>

                  </div>

                </button>

              ))}

            </div>

          </section>

        )}





        {!result && !loading && (





          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-10 text-center">





            <p className="text-xl font-semibold">





              Ready for simulation





            </p>





            <p className="mt-2 text-slate-400">





              Enter a disruption scenario above





              and press Run Simulation.





            </p>





          </section>





        )}





        {loading && (





          <section className="rounded-2xl border border-cyan-900 bg-cyan-950/20 p-10 text-center">





            <p className="text-xl font-semibold text-cyan-300">





              SupplyChain Twin AI is analysing





              the scenario...





            </p>





            <p className="mt-2 text-slate-400">





              Parsing disruption, rerouting the





              network, calculating inventory





              exposure and generating the AI





              explanation.





            </p>





          </section>





        )}





        {result && simulation && (





          <>






            {/* REPORT ACTIONS */}

            <section className="mb-8 flex flex-wrap gap-3">
              <button
                onClick={downloadPdfReport}
                className="rounded-xl bg-emerald-500 px-5 py-3 font-semibold text-slate-950 transition hover:bg-emerald-400"
              >
                Download PDF Report
              </button>

              <button
                onClick={downloadJsonReport}
                className="rounded-xl border border-cyan-700 bg-slate-900 px-5 py-3 font-semibold text-cyan-300 transition hover:border-cyan-500 hover:bg-slate-800"
              >
                Download JSON
              </button>
            </section>

            {/* KPI CARDS */}





            <section className="mb-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">





              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">





                <p className="text-sm text-slate-400">





                  Baseline Cost





                </p>





                <p className="mt-2 text-3xl font-bold">





                  {baseline?.total_cost.toLocaleString()}





                </p>





              </div>





              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">





                <p className="text-sm text-slate-400">





                  Disrupted Cost





                </p>





                <p className="mt-2 text-3xl font-bold">





                  {disrupted





                    ? disrupted.total_cost.toLocaleString()





                    : "No Route"}





                </p>





                {simulation.cost_change_percent !==





                  null && (





                  <p className="mt-1 text-sm text-amber-400">





                    +





                    {





                      simulation.cost_change_percent





                    }





                    %





                  </p>





                )}





              </div>





              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">





                <p className="text-sm text-slate-400">





                  Lead-Time Impact





                </p>





                <p className="mt-2 text-3xl font-bold">





                  {simulation.delay_change_days !==





                  null





                    ? `${





                        simulation.delay_change_days >=





                        0





                          ? "+"





                          : ""





                      }${





                        simulation.delay_change_days





                      } Days`





                    : "N/A"}





                </p>





              </div>





              <div className="rounded-2xl border border-red-900 bg-red-950/40 p-5">





                <p className="text-sm text-red-300">





                  Overall Risk





                </p>





                <p className="mt-2 text-3xl font-bold text-red-400">





                  {simulation.risk_level}





                </p>





              </div>





            </section>





            {/* SUPPLY CHAIN NETWORK */}





            <section className="mb-8">





              <div className="mb-4">





                <h2 className="text-2xl font-semibold">





                  Supply Chain Network





                </h2>





                <p className="mt-1 text-sm text-slate-400">





                  Green shows the baseline route. Amber shows the





                  disrupted alternative route.





                </p>





              </div>





              <SupplyChainGraph





                baselineRoute={baseline?.route}





                disruptedRoute={disrupted?.route}





              />





            </section>





            {/* ROUTES */}





            <section className="mb-8 grid gap-6 lg:grid-cols-2">





              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">





                <p className="text-sm font-semibold text-emerald-400">





                  BASELINE ROUTE





                </p>





                <h3 className="mt-3 text-xl font-semibold leading-8">





                  {routeToText(





                    baseline?.route





                  )}





                </h3>





                <p className="mt-4 text-sm text-slate-500">





                  {baseline?.route.join(





                    " → "





                  )}





                </p>





                <div className="mt-5 flex gap-10">





                  <div>





                    <p className="text-xs text-slate-500">





                      Lead Time





                    </p>





                    <p className="font-semibold">





                      {





                        baseline?.lead_time_days





                      }{" "}





                      days





                    </p>





                  </div>





                  <div>





                    <p className="text-xs text-slate-500">





                      Capacity





                    </p>





                    <p className="font-semibold">





                      {





                        baseline?.bottleneck_capacity





                      }{" "}





                      units





                    </p>





                  </div>





                </div>





              </div>





              <div className="rounded-2xl border border-amber-900 bg-amber-950/20 p-6">





                <p className="text-sm font-semibold text-amber-400">





                  DISRUPTED ROUTE





                </p>





                <h3 className="mt-3 text-xl font-semibold leading-8">





                  {routeToText(





                    disrupted?.route





                  )}





                </h3>





                <p className="mt-4 text-sm text-slate-500">





                  {disrupted





                    ? disrupted.route.join(





                        " → "





                      )





                    : "No feasible route remains"}





                </p>





                {disrupted && (





                  <div className="mt-5 flex gap-10">





                    <div>





                      <p className="text-xs text-slate-500">





                        Lead Time





                      </p>





                      <p className="font-semibold">





                        {





                          disrupted.lead_time_days





                        }{" "}





                        days





                      </p>





                    </div>





                    <div>





                      <p className="text-xs text-slate-500">





                        Capacity





                      </p>





                      <p className="font-semibold">





                        {





                          disrupted.bottleneck_capacity





                        }{" "}





                        units





                      </p>





                    </div>





                  </div>





                )}





              </div>





            </section>





            {/* INVENTORY */}





            <section className="mb-8">





              <h2 className="mb-4 text-2xl font-semibold">





                Inventory Exposure





              </h2>





              <div className="grid gap-6 lg:grid-cols-2">





                {simulation.inventory_impact.map(





                  (item) => (





                    <div





                      key={item.node_id}





                      className="rounded-2xl border border-slate-800 bg-slate-900 p-6"





                    >





                      <div className="flex items-center justify-between gap-4">





                        <h3 className="text-xl font-semibold">





                          {item.node_name}





                        </h3>





                        <span className="rounded-full bg-red-950 px-3 py-1 text-xs font-semibold text-red-300">





                          {





                            item.inventory_risk





                          }





                        </span>





                      </div>





                      <div className="mt-5 grid grid-cols-2 gap-5">





                        <div>





                          <p className="text-xs text-slate-500">





                            Inventory Coverage





                          </p>





                          <p className="font-semibold">





                            {





                              item.days_of_inventory





                            }{" "}





                            days





                          </p>





                        </div>





                        <div>





                          <p className="text-xs text-slate-500">





                            Replenishment Arrival





                          </p>





                          <p className="font-semibold">





                            {item.replenishment_arrival_days !==





                            null





                              ? `Day ${item.replenishment_arrival_days}`





                              : "Unknown"}





                          </p>





                        </div>





                        <div>





                          <p className="text-xs text-slate-500">





                            Shortage Window





                          </p>





                          <p className="font-semibold text-red-400">





                            {





                              item.shortage_days_before_replenishment





                            }{" "}





                            days





                          </p>





                        </div>





                        <div>





                          <p className="text-xs text-slate-500">





                            Emergency Inventory





                          </p>





                          <p className="font-semibold">





                            {item.emergency_inventory_required.toLocaleString()}{" "}





                            units





                          </p>





                        </div>





                        <div>





                          <p className="text-xs text-slate-500">





                            Starting Inventory





                          </p>





                          <p className="font-semibold">





                            {item.starting_inventory.toLocaleString()}





                          </p>





                        </div>





                        <div>





                          <p className="text-xs text-slate-500">





                            Daily Demand





                          </p>





                          <p className="font-semibold">





                            {item.daily_demand.toLocaleString()}





                          </p>





                        </div>





                      </div>





                    </div>





                  )





                )}





              </div>





            </section>





            {/* AI ANALYST */}





            <section className="mb-8 rounded-2xl border border-cyan-900 bg-cyan-950/20 p-6">





              <p className="text-sm font-semibold uppercase tracking-wider text-cyan-400">





                AI Risk Analyst





              </p>





              <h2 className="mt-2 text-2xl font-semibold">





                Executive Summary





              </h2>





              <p className="mt-4 leading-7 text-slate-300">





                {





                  result.ai_explanation





                    .executive_summary





                }





              </p>





              <div className="mt-6 grid gap-5 lg:grid-cols-2">





                <div className="rounded-xl bg-slate-950 p-5">





                  <h3 className="font-semibold text-cyan-300">





                    Route Impact





                  </h3>





                  <p className="mt-3 leading-7 text-slate-400">





                    {





                      result.ai_explanation





                        .route_impact





                    }





                  </p>





                </div>





                <div className="rounded-xl bg-slate-950 p-5">





                  <h3 className="font-semibold text-cyan-300">





                    Inventory Impact





                  </h3>





                  <p className="mt-3 leading-7 text-slate-400">





                    {





                      result.ai_explanation





                        .inventory_impact





                    }





                  </p>





                </div>





              </div>





              <div className="mt-5 rounded-xl bg-slate-950 p-5">





                <h3 className="font-semibold text-amber-300">





                  Risk Explanation





                </h3>





                <p className="mt-3 leading-7 text-slate-400">





                  {





                    result.ai_explanation





                      .risk_explanation





                  }





                </p>





              </div>





              <div className="mt-5 rounded-xl bg-slate-950 p-5">





                <h3 className="font-semibold">





                  Recommended Actions





                </h3>





                <ul className="mt-4 space-y-3 text-slate-400">





                  {result.ai_explanation.recommended_actions.map(





                    (action, index) => (





                      <li





                        key={index}





                        className="flex gap-3"





                      >





                        <span className="text-cyan-400">





                          •





                        </span>





                        <span>





                          {action}





                        </span>





                      </li>





                    )





                  )}





                </ul>





              </div>





            </section>





            {/* NOTES */}





            <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">





              <h2 className="text-lg font-semibold">





                Simulation Notes





              </h2>





              <ul className="mt-4 space-y-2 text-sm text-slate-400">





                {simulation.notes.map(





                  (note, index) => (





                    <li key={index}>





                      • {note}





                    </li>





                  )





                )}





              </ul>





            </section>





          </>





        )}





      </div>





    </main>





  );





}