"use client";





import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import jsPDF from "jspdf";

import CompanyEndToEndFlow from "./components/CompanyEndToEndFlow";
import ControlTower from "./components/ControlTower";
import AuthScreen from "./components/AuthScreen";
import SupplierScorecards from "./components/SupplierScorecards";
import NotificationCenter, {
  type WorkspaceNotification,
} from "./components/NotificationCenter";
import { API_URL, AUTH_TOKEN_KEY, apiFetch } from "./api";

type SignedInAccount = {
  id: number;
  email: string;
  display_name: string;
  created_at: string;
};

function getApiErrorMessage(error: unknown, action: string) {
  if (error instanceof TypeError && error.message.toLowerCase().includes("fetch")) {
    return `Cannot reach the backend at ${API_URL}. Check that the backend is running and retry to ${action}.`;
  }

  return error instanceof Error
    ? error.message
    : `Unable to ${action}.`;
}



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

  company_id?: number;



  user_message: string;

  network_snapshot?: {
    nodes: Array<{
      id: string;
      name: string;
      type: string;
      capacity: number;
      inventory: number;
      daily_demand: number;
      safety_stock: number;
    }>;
    routes: Array<{
      source: string;
      destination: string;
      transport_mode: string;
      cost: number;
      lead_time_days: number;
      capacity: number;
      fuel_dependency: number;
    }>;
  };




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

type SimulationResponse = ApiResult & {
  detail?: string;
  history_id: number;
  history_created_at: string;
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
  data_source_type?: string | null;
  source_url?: string | null;
  updated_at?: string | null;
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
  data_source_type?: string | null;
  source_reference?: string | null;
  updated_at?: string | null;
  active: boolean;
};

type Company = {
  id: number;
  name: string;
  description: string | null;
  city: string | null;
  country: string | null;
  business_type: string | null;
  end_to_end_workflow: string | null;
  requires_manual_network_setup: boolean;
  is_demo: boolean;
  role: "owner" | "editor" | "viewer";
};

type CollaborationMember = {
  user_id: number;
  display_name: string;
  email: string;
  role: "owner" | "editor" | "viewer";
  joined_at: string;
  is_self: boolean;
};

type CollaborationInvite = {
  id: number;
  role: "editor" | "viewer";
  expires_at: string;
};

type CollaborationActivity = {
  id: number;
  event: string;
  description: string;
  user_name: string;
  created_at: string;
};

type CollaborationData = {
  role: "owner" | "editor" | "viewer";
  members: CollaborationMember[];
  invites: CollaborationInvite[];
  activity: CollaborationActivity[];
};

type CompanyDocument = {
  id: number;
  company_id: number;
  original_filename: string;
  content_type: string;
  file_size: number;
  uploaded_at: string;
};

type AssistantNodeDraft = {
  node_type: string | null;
  code: string | null;
  name: string | null;
  city: string | null;
  country: string | null;
  capacity: number | null;
  current_inventory: number | null;
  daily_demand: number | null;
  safety_stock: number | null;
};

type AssistantRouteDraft = {
  source_node_id: number | null;
  destination_node_id: number | null;
  transport_mode: string | null;
  base_cost: number | null;
  lead_time_days: number | null;
  capacity: number | null;
  fuel_dependency: number | null;
};

type AssistantChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  draft_node?: AssistantNodeDraft | null;
  draft_route?: AssistantRouteDraft | null;
};

type ExcelPreview = {
  filename: string;
  valid: boolean;
  nodes_count: number;
  routes_count: number;
  errors: string[];
  nodes_preview: Array<{
    code: string;
    name: string;
    node_type: string;
  }>;
  routes_preview: Array<{
    source_code: string;
    destination_code: string;
    transport_mode: string;
    base_cost: number | null;
    lead_time_days: number | null;
  }>;
};

type ScenarioHistoryItem = {



  id: number;



  message: string;



  createdAt: string;



  result: ApiResult;



};

type SimulationRiskAlert = {
  id: string;
  severity: "HIGH" | "MEDIUM";
  title: string;
  detail: string;
  recommendation: string;
};

type SimulationHistoryResponse = {
  id: number;
  message: string;
  created_at: string;
  result: ApiResult;
};

function routeToText(route?: string[]) {



  if (!route) return "No feasible route";



  return route



    .map((node) => NODE_NAMES[node] ?? node)



    .join(" → ");



}



const SOURCE_BADGE_STYLES: Record<string, string> = {
  "VERIFIED PUBLIC": "border-cyan-500/40 bg-cyan-500/10 text-cyan-200",
  "USER PROVIDED": "border-slate-500/40 bg-slate-500/10 text-slate-200",
  "EXCEL IMPORT": "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  "ERP/API": "border-violet-500/40 bg-violet-500/10 text-violet-200",
  "ESTIMATED": "border-amber-500/40 bg-amber-500/10 text-amber-200",
  "DEMO / SYNTHETIC": "border-orange-500/40 bg-orange-500/10 text-orange-200",
};

function normalizeSourceType(value?: string | null) {
  const normalized = (value ?? "USER PROVIDED").trim();
  const upper = normalized.toUpperCase();

  if (upper.includes("VERIFIED") || upper.includes("PUBLIC")) {
    return "VERIFIED PUBLIC";
  }
  if (upper.includes("EXCEL")) {
    return "EXCEL IMPORT";
  }
  if (upper.includes("ERP") || upper.includes("API")) {
    return "ERP/API";
  }
  if (upper.includes("ESTIMATED")) {
    return "ESTIMATED";
  }
  if (upper.includes("DEMO") || upper.includes("SYNTHETIC")) {
    return "DEMO / SYNTHETIC";
  }

  return "USER PROVIDED";
}



export default function Home() {

  const fetch = apiFetch;

  const [currentUser, setCurrentUser] =
    useState<SignedInAccount | null>(null);

  const [authReady, setAuthReady] = useState(false);
  const [signOutLoading, setSignOutLoading] = useState(false);
  const [signOutError, setSignOutError] = useState("");




  const [scenario, setScenario] = useState(



    "Close PORT_A for 14 days and increase fuel prices by 30%."





  );





  const [result, setResult] =



    useState<ApiResult | null>(null);

  const [freshnessNow, setFreshnessNow] =
    useState<number | null>(null);





  const [loading, setLoading] =





    useState(false);





  const [error, setError] =





    useState("");





  const [history, setHistory] =

    useState<ScenarioHistoryItem[]>([]);

  const [historyLoading, setHistoryLoading] = useState(false);

  const [historyError, setHistoryError] = useState("");

  const [historyClearing, setHistoryClearing] = useState(false);

  const [alertToTrack, setAlertToTrack] = useState<{
    id: number;
    recommendation: string;
  } | null>(null);

  const [companies, setCompanies] =
    useState<Company[]>([]);

  const [selectedCompanyId, setSelectedCompanyId] =
    useState<number>(1);

  const [companiesLoading, setCompaniesLoading] =
    useState(true);

  const [companiesRetry, setCompaniesRetry] = useState(0);

  const [companiesError, setCompaniesError] =
    useState("");

  const [collaboration, setCollaboration] =
    useState<CollaborationData | null>(null);

  const [collaborationOpen, setCollaborationOpen] =
    useState(false);

  const [collaborationLoading, setCollaborationLoading] =
    useState(false);

  const [collaborationError, setCollaborationError] =
    useState("");

  const [inviteRole, setInviteRole] =
    useState<"editor" | "viewer">("editor");

  const [inviteLink, setInviteLink] =
    useState("");

  const [inviteBusy, setInviteBusy] =
    useState(false);

  const [inviteAcceptMessage, setInviteAcceptMessage] =
    useState("");

  const inviteAcceptStarted = useRef(false);

  const [showCreateCompany, setShowCreateCompany] =
    useState(false);

  const [newCompanyName, setNewCompanyName] =
    useState("");

  const [newCompanyDescription, setNewCompanyDescription] =
    useState("");

  const [newCompanyCity, setNewCompanyCity] =
    useState("");

  const [newCompanyCountry, setNewCompanyCountry] =
    useState("");

  const [newCompanyBusinessType, setNewCompanyBusinessType] =
    useState("");

  const [newCompanyWorkflow, setNewCompanyWorkflow] =
    useState("");

  const [newCompanyDocuments, setNewCompanyDocuments] =
    useState<File[]>([]);

  const [companyDocuments, setCompanyDocuments] =
    useState<CompanyDocument[]>([]);

  const [companyDocumentsLoading, setCompanyDocumentsLoading] =
    useState(false);

  const [companyDocumentsError, setCompanyDocumentsError] =
    useState("");

  const [companyDocumentsBusy, setCompanyDocumentsBusy] =
    useState(false);

  const [assistantInput, setAssistantInput] =
    useState("");

  const [assistantOpen, setAssistantOpen] =
    useState(false);

  const [assistantMessages, setAssistantMessages] =
    useState<AssistantChatMessage[]>([]);

  const [assistantLoading, setAssistantLoading] =
    useState(false);

  const [assistantElapsedSeconds, setAssistantElapsedSeconds] =
    useState(0);

  const [assistantError, setAssistantError] =
    useState("");

  const [assistantListening, setAssistantListening] =
    useState(false);

  const [assistantTranscribing, setAssistantTranscribing] =
    useState(false);

  const [assistantVoiceMessage, setAssistantVoiceMessage] =
    useState("");

  const assistantMessageSequence = useRef(0);
  const assistantRequestId = useRef(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);

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

  const autoDemoNetworks = useRef(new Set<number>());

  const manualSetupCompanies = useRef(new Set<number>());

  const profiledDemoNetworks = useRef(new Set<number>());

  const [networkError, setNetworkError] =
    useState("");

  const [networkMessage, setNetworkMessage] =
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

  const [newNodeSourceUrl, setNewNodeSourceUrl] =
    useState("");

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

  const [newRouteSourceReference, setNewRouteSourceReference] =
    useState("");

  const [editingNodeId, setEditingNodeId] =
    useState<number | null>(null);

  const [editingRouteId, setEditingRouteId] =
    useState<number | null>(null);

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

  const [publicSearchHasLoaded, setPublicSearchHasLoaded] =
    useState(false);

  const [publicSearchLoading, setPublicSearchLoading] =
    useState(false);

  const companyDirectoryRequest = useRef<AbortController | null>(null);

  const [publicSearchError, setPublicSearchError] =
    useState("");

  const [publicSearchNote, setPublicSearchNote] =
    useState("");

  const [companyActionLoading, setCompanyActionLoading] =
    useState("");

  const [companyActionMessage, setCompanyActionMessage] =
    useState("");

  const [companyActionError, setCompanyActionError] =
    useState("");

  const [excelPreview, setExcelPreview] =
    useState<ExcelPreview | null>(null);

  const [pendingExcelFile, setPendingExcelFile] =
    useState<File | null>(null);

  const [pendingExcelCompanyId, setPendingExcelCompanyId] =
    useState<number | null>(null);

  useEffect(() => {
    let active = true;
    const token = window.localStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) {
      setAuthReady(true);
      return;
    }

    fetch(`${API_URL}/auth/me`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Sign in again to continue.");
        }
        return (await response.json()) as SignedInAccount;
      })
      .then((account) => {
        if (active) {
          setCurrentUser(account);
        }
      })
      .catch(() => {
        window.localStorage.removeItem(AUTH_TOKEN_KEY);
      })
      .finally(() => {
        if (active) {
          setAuthReady(true);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    function expireSession() {
      setCurrentUser(null);
      setCompanies([]);
      setCompanyNodes([]);
      setCompanyRoutes([]);
      setResult(null);
    }
    window.addEventListener("supplychain:auth-expired", expireSession);
    return () =>
      window.removeEventListener("supplychain:auth-expired", expireSession);
  }, []);

  async function signOut() {
    setSignOutLoading(true);
    setSignOutError("");
    try {
      const response = await fetch(`${API_URL}/auth/logout`, {
        method: "POST",
      });
      if (!response.ok && response.status !== 401) {
        throw new Error("Could not sign out. Please try again.");
      }
      window.localStorage.removeItem(AUTH_TOKEN_KEY);
      setCurrentUser(null);
      setCompanies([]);
      setCompanyNodes([]);
      setCompanyRoutes([]);
      setCompanyDocuments([]);
      setHistory([]);
      setResult(null);
      setAuthReady(true);
    } catch (error) {
      setSignOutError(
        error instanceof Error ? error.message : "Could not sign out. Please try again."
      );
    } finally {
      setSignOutLoading(false);
    }
  }

  useEffect(() => {
    async function loadCompanies() {
      if (!currentUser) {
        return;
      }
      try {
        setCompaniesLoading(true);
        setCompaniesError("");

        const response = await fetch(
          `${API_URL}/companies`
        );

        if (!response.ok) {
          throw new Error(
            "Unable to load companies/workspaces."
          );
        }

        const data: Company[] =
          await response.json();

        manualSetupCompanies.current = new Set(
          data
            .filter((company) => company.requires_manual_network_setup)
            .map((company) => company.id)
        );
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
        setCompaniesError(getApiErrorMessage(err, "load workspaces"));
      } finally {
        setCompaniesLoading(false);
      }
    }

    loadCompanies();
  }, [companiesRetry, currentUser]);


  async function loadCompanyNetwork(companyId: number) {
    try {
      setNetworkLoading(true);
      setNetworkError("");
      setNetworkMessage("");

      const fetchNetwork = async () => {
        const [
          nodesResponse,
          routesResponse,
        ] = await Promise.all([
          fetch(
            `${API_URL}/companies/${companyId}/nodes`
          ),
          fetch(
            `${API_URL}/companies/${companyId}/routes`
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

        return {
          nodes: await nodesResponse.json() as CompanyNode[],
          routes: await routesResponse.json() as CompanyRoute[],
        };
      };

      let { nodes: nodesData, routes: routesData } =
        await fetchNetwork();

      if (
        nodesData.length === 0 &&
        routesData.length === 0 &&
        !manualSetupCompanies.current.has(companyId) &&
        !autoDemoNetworks.current.has(companyId)
      ) {
        autoDemoNetworks.current.add(companyId);
        const demoResponse = await fetch(
          `${API_URL}/public-directory/create-demo-network/${companyId}`,
          { method: "POST" }
        );
        const demoData = await demoResponse.json();

        if (!demoResponse.ok) {
          throw new Error(
            demoData.detail ||
              "Unable to create an automatic demo network for this empty workspace."
          );
        }

        if (
          typeof demoData.nodes_created !== "number" ||
          demoData.nodes_created === 0 ||
          typeof demoData.routes_created !== "number" ||
          demoData.routes_created === 0
        ) {
          throw new Error(
            "The automatic demo network was not created with connected nodes and routes."
          );
        }

        await refreshCompanies();
        ({ nodes: nodesData, routes: routesData } =
          await fetchNetwork());
      }

      const allNetworkNodesAreSynthetic =
        nodesData.length > 0 &&
        nodesData.every(
          (record) =>
            record.data_source_type
              ?.toUpperCase()
              .includes("SYNTHETIC")
        );
      const starterDemoNodeCodes = new Set([
        "SH_SUP",
        "SH_PORT",
        "ROT",
        "ANT",
        "HAM",
        "FRA_WH",
        "BER",
      ]);
      const looksLikeStarterDemoNetwork =
        nodesData.length === starterDemoNodeCodes.size &&
        nodesData.every((node) => starterDemoNodeCodes.has(node.code));
      if (
        (allNetworkNodesAreSynthetic || looksLikeStarterDemoNetwork) &&
        !profiledDemoNetworks.current.has(companyId)
      ) {
        const profileResponse = await fetch(
          `${API_URL}/public-directory/personalize-demo-network/${companyId}`,
          { method: "POST" }
        );
        const profileData = await profileResponse.json();

        if (!profileResponse.ok) {
          throw new Error(
            profileData.detail ||
              "Unable to vary synthetic demo values for this company workspace."
          );
        }

        profiledDemoNetworks.current.add(companyId);
        if (
          profileData.status === "profiled" ||
          profileData.status === "locations_updated" ||
          profileData.status === "starter_demo_profiled"
        ) {
          ({ nodes: nodesData, routes: routesData } =
            await fetchNetwork());
          setNetworkMessage(
            profileData.message ||
              "Synthetic demo values were varied for this workspace. They are examples, not verified company operating data."
          );
        }
      }

      setCompanyNodes(nodesData);
      setCompanyRoutes(routesData);

    } catch (err) {
      setNetworkError(getApiErrorMessage(err, "load the company network"));

      setCompanyNodes([]);
      setCompanyRoutes([]);
    } finally {
      setNetworkLoading(false);
    }
  }

  async function saveNode() {
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
    if (
      !newNodeInventory.trim() ||
      !newNodeDailyDemand.trim() ||
      !newNodeSafetyStock.trim()
    ) {
      setNodeSaveError(
        "Enter inventory, daily demand, and safety stock values. Enter 0 when there is no value to record."
      );
      return;
    }

    try {
      setNodeSaving(true);
      setNodeSaveError("");

      const payload = {
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
        data_source_type:
          editingNodeId !== null
            ? companyNodes.find((node) => node.id === editingNodeId)
                ?.data_source_type ?? "USER PROVIDED"
            : "USER PROVIDED",
        source_url: newNodeSourceUrl.trim() || null,
        active: true,
        ...(editingNodeId !== null
          ? {
              latitude: companyNodes.find(
                (node) => node.id === editingNodeId
              )?.latitude ?? null,
              longitude: companyNodes.find(
                (node) => node.id === editingNodeId
              )?.longitude ?? null,
            }
          : {}),
      };

      const url = editingNodeId !== null
        ? `${API_URL}/companies/${selectedCompanyId}/nodes/${editingNodeId}`
        : `${API_URL}/companies/${selectedCompanyId}/nodes`;

      const response = await fetch(url, {
        method: editingNodeId !== null ? "PUT" : "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail ||
            "Unable to save node."
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
      setNewNodeSourceUrl("");
      setEditingNodeId(null);
      setShowAddNode(false);

      await loadCompanyNetwork(
        selectedCompanyId
      );
    } catch (err) {
      if (err instanceof Error) {
        setNodeSaveError(err.message);
      } else {
        setNodeSaveError(
          "Unable to save node."
        );
      }
    } finally {
      setNodeSaving(false);
    }
  }

  function beginNodeEdit(node: CompanyNode) {
    setEditingNodeId(node.id);
    setNewNodeType(node.node_type);
    setNewNodeCode(node.code);
    setNewNodeName(node.name);
    setNewNodeCity(node.city ?? "");
    setNewNodeCountry(node.country ?? "India");
    setNewNodeCapacity(
      node.capacity == null ? "" : String(node.capacity)
    );
    setNewNodeInventory(String(node.current_inventory ?? 0));
    setNewNodeDailyDemand(String(node.daily_demand ?? 0));
    setNewNodeSafetyStock(String(node.safety_stock ?? 0));
    setNewNodeSourceUrl(node.source_url ?? "");
    setShowAddNode(true);
    setNodeSaveError("");
  }

  function cancelNodeEdit() {
    setEditingNodeId(null);
    setNewNodeCode("");
    setNewNodeName("");
    setNewNodeCity("");
    setNewNodeCountry("India");
    setNewNodeCapacity("");
    setNewNodeInventory("0");
    setNewNodeDailyDemand("0");
    setNewNodeSafetyStock("0");
    setNewNodeSourceUrl("");
    setShowAddNode(false);
    setNodeSaveError("");
  }

  async function deleteNode(nodeId: number) {
    if (!window.confirm("Delete this node from the company network?")) {
      return;
    }

    try {
      setNodeSaving(true);
      setNodeSaveError("");

      const response = await fetch(
        `${API_URL}/companies/${selectedCompanyId}/nodes/${nodeId}`,
        {
          method: "DELETE",
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.detail || "Unable to delete node."
        );
      }

      if (editingNodeId === nodeId) {
        cancelNodeEdit();
      }

      await loadCompanyNetwork(selectedCompanyId);
    } catch (err) {
      if (err instanceof Error) {
        setNodeSaveError(err.message);
      } else {
        setNodeSaveError("Unable to delete node.");
      }
    } finally {
      setNodeSaving(false);
    }
  }

  async function saveRoute() {
    if (
      !newRouteSourceId ||
      !newRouteDestinationId ||
      !newRouteCost ||
      !newRouteLeadTime ||
      !newRouteCapacity ||
      !newRouteMode
    ) {
      setRouteSaveError(
        "Source, destination, transport mode, cost, lead time and capacity are required."
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

      const payload = {
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
        data_source_type:
          editingRouteId !== null
            ? companyRoutes.find((route) => route.id === editingRouteId)
                ?.data_source_type ?? "USER PROVIDED"
            : "USER PROVIDED",
        source_reference:
          newRouteSourceReference.trim() || null,
        active: true,
      };

      const url = editingRouteId !== null
        ? `${API_URL}/companies/${selectedCompanyId}/routes/${editingRouteId}`
        : `${API_URL}/companies/${selectedCompanyId}/routes`;

      const response = await fetch(url, {
        method: editingRouteId !== null ? "PUT" : "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail ||
            "Unable to save route."
        );
      }

      setNewRouteSourceId("");
      setNewRouteDestinationId("");
      setNewRouteMode("road");
      setNewRouteCost("");
      setNewRouteLeadTime("");
      setNewRouteCapacity("");
      setNewRouteFuelDependency("1");
      setNewRouteSourceReference("");
      setEditingRouteId(null);
      setShowAddRoute(false);

      await loadCompanyNetwork(
        selectedCompanyId
      );
    } catch (err) {
      if (err instanceof Error) {
        setRouteSaveError(err.message);
      } else {
        setRouteSaveError(
          "Unable to save route."
        );
      }
    } finally {
      setRouteSaving(false);
    }
  }

  function beginRouteEdit(route: CompanyRoute) {
    setEditingRouteId(route.id);
    setNewRouteSourceId(String(route.source_node_id));
    setNewRouteDestinationId(String(route.destination_node_id));
    setNewRouteMode(route.transport_mode || "road");
    setNewRouteCost(String(route.base_cost ?? ""));
    setNewRouteLeadTime(String(route.lead_time_days ?? ""));
    setNewRouteCapacity(String(route.capacity ?? ""));
    setNewRouteFuelDependency(String(route.fuel_dependency ?? 1));
    setNewRouteSourceReference(route.source_reference ?? "");
    setShowAddRoute(true);
    setRouteSaveError("");
  }

  function cancelRouteEdit() {
    setEditingRouteId(null);
    setNewRouteSourceId("");
    setNewRouteDestinationId("");
    setNewRouteMode("road");
    setNewRouteCost("");
    setNewRouteLeadTime("");
    setNewRouteCapacity("");
    setNewRouteFuelDependency("1");
    setNewRouteSourceReference("");
    setShowAddRoute(false);
    setRouteSaveError("");
  }

  async function deleteRoute(routeId: number) {
    if (!window.confirm("Delete this route from the company network?")) {
      return;
    }

    try {
      setRouteSaving(true);
      setRouteSaveError("");

      const response = await fetch(
        `${API_URL}/companies/${selectedCompanyId}/routes/${routeId}`,
        {
          method: "DELETE",
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.detail || "Unable to delete route."
        );
      }

      if (editingRouteId === routeId) {
        cancelRouteEdit();
      }

      await loadCompanyNetwork(selectedCompanyId);
    } catch (err) {
      if (err instanceof Error) {
        setRouteSaveError(err.message);
      } else {
        setRouteSaveError("Unable to delete route.");
      }
    } finally {
      setRouteSaving(false);
    }
  }


  async function loadCountries() {
    try {
      const response = await fetch(
        `${API_URL}/public-directory/countries`
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

  const searchPublicCompanies = useCallback(async (
    searchText = companySearch,
    country = selectedCountry
  ) => {
    const query = searchText.trim();
    companyDirectoryRequest.current?.abort();
    const controller = new AbortController();
    companyDirectoryRequest.current = controller;

    try {
      setPublicSearchLoading(true);
      setPublicSearchError("");
      setPublicSearchNote("");
      setCompanyActionMessage("");
      setCompanyActionError("");

      const params =
        new URLSearchParams({
          country,
          q: query,
        });

      const response = await fetch(
        `${API_URL}/public-directory/companies?${params.toString()}`,
        { signal: controller.signal }
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
      setPublicSearchNote(
        typeof data.note === "string" ? data.note : ""
      );
      setPublicSearchHasLoaded(true);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }
      setPublicSearchError(getApiErrorMessage(err, "search companies"));
      setPublicSearchHasLoaded(true);
    } finally {
      if (!controller.signal.aborted) {
        setPublicSearchLoading(false);
      }
    }
  }, [companySearch, selectedCountry]);

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
        `${API_URL}/public-directory/import-company`,
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

      selectCompany(
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
      setExcelPreview(null);
      setPendingExcelFile(null);
      setPendingExcelCompanyId(null);

      const params =
        new URLSearchParams({
          filename: file.name,
        });

      const response = await fetch(
        `${API_URL}/public-directory/preview-excel/${selectedCompanyId}?${params.toString()}`,
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
        const detail = data.detail;
        throw new Error(
          (typeof detail === "string"
            ? detail
            : detail?.message) ||
            "Excel import failed."
        );
      }

      setExcelPreview(data as ExcelPreview);
      setPendingExcelFile(file);
      setPendingExcelCompanyId(selectedCompanyId);
      setCompanyActionMessage(
        data.valid
          ? "Workbook preview is ready. Review the rows before importing."
          : ""
      );
    } catch (err) {
      if (err instanceof Error) {
        setCompanyActionError(
          err.message
        );
      } else {
        setCompanyActionError(
          "Excel preview failed."
        );
      }
    } finally {
      setCompanyActionLoading("");
    }
  }

  async function confirmExcelImport() {
    if (
      !pendingExcelFile ||
      pendingExcelCompanyId !== selectedCompanyId ||
      !excelPreview?.valid
    ) {
      return;
    }

    try {
      setCompanyActionLoading("excel");
      setCompanyActionError("");
      setCompanyActionMessage("");
      const params = new URLSearchParams({
        filename: pendingExcelFile.name,
      });
      const response = await fetch(
        `${API_URL}/public-directory/import-excel/${selectedCompanyId}?${params.toString()}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/octet-stream",
          },
          body: pendingExcelFile,
        }
      );
      const data = await response.json();

      if (!response.ok) {
        const detail = data.detail;
        const validationErrors = detail?.errors;
        throw new Error(
          Array.isArray(validationErrors)
            ? validationErrors.join(" ")
            : (typeof detail === "string" ? detail : detail?.message) ||
                "Excel import failed."
        );
      }

      await loadCompanyNetwork(
        selectedCompanyId
      );

      setCompanyActionMessage(
        `Excel imported: ${data.nodes_imported} nodes and ${data.routes_imported} routes.`
      );
      setExcelPreview(null);
      setPendingExcelFile(null);
      setPendingExcelCompanyId(null);
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
        `${API_URL}/public-directory/create-demo-network/${selectedCompanyId}`,
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
        `${API_URL}/public-directory/import-public-data/${selectedCompanyId}`,
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
      `${API_URL}/companies`
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

  async function loadCompanyDocuments(companyId: number) {
    try {
      setCompanyDocumentsLoading(true);
      setCompanyDocumentsError("");
      setCompanyDocuments([]);
      const response = await fetch(
        `${API_URL}/companies/${companyId}/documents`
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Unable to load company documents.");
      }
      setCompanyDocuments(data as CompanyDocument[]);
    } catch (err) {
      setCompanyDocuments([]);
      setCompanyDocumentsError(
        err instanceof Error
          ? err.message
          : "Unable to load company documents."
      );
    } finally {
      setCompanyDocumentsLoading(false);
    }
  }

  async function saveCompanyDocument(companyId: number, file: File) {
    const query = new URLSearchParams({ filename: file.name });
    const response = await fetch(
      `${API_URL}/companies/${companyId}/documents?${query}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: file,
      }
    );
    const data = await response.json();
    if (!response.ok) {
      throw new Error(
        `${file.name}: ${data.detail || "Unable to upload document."}`
      );
    }
  }

  function validateCompanyDocuments(files: File[]) {
    const allowedExtensions = new Set([".pdf", ".docx", ".xlsx"]);
    const errors = files.flatMap((file) => {
      const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
      if (!allowedExtensions.has(extension)) {
        return [`${file.name}: choose a PDF, DOCX, or XLSX file.`];
      }
      if (file.size > 10 * 1024 * 1024) {
        return [`${file.name}: documents must be 10 MB or smaller.`];
      }
      if (file.size === 0) {
        return [`${file.name}: the file is empty.`];
      }
      return [];
    });
    return errors;
  }

  async function uploadSelectedCompanyDocuments() {
    const validationErrors = validateCompanyDocuments(newCompanyDocuments);
    if (validationErrors.length > 0) {
      setCompanyDocumentsError(validationErrors.join(" "));
      return;
    }
    if (newCompanyDocuments.length === 0) {
      setCompanyDocumentsError("Choose at least one company document.");
      return;
    }

    setCompanyDocumentsBusy(true);
    setCompanyDocumentsError("");
    const failures: string[] = [];
    try {
      for (const file of newCompanyDocuments) {
        try {
          await saveCompanyDocument(selectedCompanyId, file);
        } catch (error) {
          failures.push(
            error instanceof Error ? error.message : `${file.name}: upload failed.`
          );
        }
      }
      await loadCompanyDocuments(selectedCompanyId);
      if (failures.length > 0) {
        setCompanyDocumentsError(failures.join(" "));
      } else {
        setNewCompanyDocuments([]);
      }
    } finally {
      setCompanyDocumentsBusy(false);
    }
  }

  async function deleteCompanyDocument(document: CompanyDocument) {
    if (!window.confirm(`Delete ${document.original_filename}?`)) {
      return;
    }
    try {
      setCompanyDocumentsError("");
      const response = await fetch(
        `${API_URL}/companies/${selectedCompanyId}/documents/${document.id}`,
        { method: "DELETE" }
      );
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || "Unable to delete company document.");
      }
      await loadCompanyDocuments(selectedCompanyId);
    } catch (error) {
      setCompanyDocumentsError(
        error instanceof Error
          ? error.message
          : "Unable to delete company document."
      );
    }
  }

  async function downloadCompanyDocument(document: CompanyDocument) {
    try {
      setCompanyDocumentsError("");
      const response = await fetch(
        `${API_URL}/companies/${selectedCompanyId}/documents/${document.id}/download`
      );
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || "Unable to download company document.");
      }
      const downloadUrl = URL.createObjectURL(await response.blob());
      const link = window.document.createElement("a");
      link.href = downloadUrl;
      link.download = document.original_filename;
      link.click();
      URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      setCompanyDocumentsError(
        error instanceof Error
          ? error.message
          : "Unable to download company document."
      );
    }
  }

  async function sendAssistantMessage(messageText = assistantInput) {
    const text = messageText.trim();
    if (!text || assistantLoading) return;

    const requestId = assistantRequestId.current + 1;
    assistantRequestId.current = requestId;
    const companyId = selectedCompanyId;
    setAssistantMessages((current) => [
      ...current,
      {
        id: `assistant-${++assistantMessageSequence.current}`,
        role: "user",
        text,
      },
    ]);
    setAssistantInput("");
    setAssistantError("");
    setAssistantVoiceMessage("");
    setAssistantLoading(true);
    setAssistantElapsedSeconds(0);
    const elapsedTimer = window.setInterval(() => {
      setAssistantElapsedSeconds((seconds) => seconds + 1);
    }, 1000);

    try {
      const response = await fetch(`${API_URL}/assistant/guide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(130_000),
        body: JSON.stringify({
          company_id: companyId,
          message: text,
          available_countries: countryOptions,
          history: assistantMessages.slice(-8).map((message) => ({
            role: message.role,
            content: message.text,
          })),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "The local assistant could not respond.");
      }
      if (requestId !== assistantRequestId.current) return;
      setAssistantMessages((current) => [
        ...current,
        {
          id: `assistant-${++assistantMessageSequence.current}`,
          role: "assistant",
          text: data.reply,
          draft_node: data.draft_node ?? null,
          draft_route: data.draft_route ?? null,
        },
      ]);
    } catch (error) {
      if (requestId === assistantRequestId.current) {
        setAssistantInput((current) => current || text);
        setAssistantError(
          error instanceof Error
            ? error.name === "TimeoutError"
              ? "The local model is taking longer than expected on this computer. Your question is ready to retry; this does not affect your workspace or simulations."
              : error.message
            : "The local assistant could not respond."
        );
      }
    } finally {
      window.clearInterval(elapsedTimer);
      if (requestId === assistantRequestId.current) {
        setAssistantLoading(false);
      }
    }
  }

  async function toggleAssistantRecording() {
    if (assistantListening) {
      mediaRecorderRef.current?.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setAssistantError(
        "This browser does not support local microphone recording. Try a current version of Chrome or Edge."
      );
      return;
    }

    try {
      setAssistantError("");
      setAssistantVoiceMessage("");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      voiceStreamRef.current = stream;
      voiceChunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : undefined;
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) voiceChunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        setAssistantError("The microphone recording failed. Please try again.");
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        voiceStreamRef.current = null;
        mediaRecorderRef.current = null;
        setAssistantListening(false);
        const audio = new Blob(voiceChunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        voiceChunksRef.current = [];
        if (audio.size === 0) {
          setAssistantError("No audio was recorded. Please try again.");
          return;
        }
        setAssistantTranscribing(true);
        void (async () => {
          try {
            const contentType = audio.type.split(";", 1)[0] || "audio/webm";
            const response = await fetch(
              `${API_URL}/assistant/transcribe`,
              {
                method: "POST",
                headers: { "Content-Type": contentType },
                body: audio,
              }
            );
            const data = await response.json();
            if (!response.ok) {
              throw new Error(data.detail || "Unable to transcribe the recording.");
            }
            setAssistantInput((current) =>
              [current.trim(), data.text].filter(Boolean).join(" ")
            );
            setAssistantVoiceMessage(
              "Transcript ready. Review the words, then press Ask the local assistant."
            );
          } catch (error) {
            setAssistantError(
              error instanceof Error
                ? error.message
                : "Unable to transcribe the recording locally."
            );
          } finally {
            setAssistantTranscribing(false);
          }
        })();
      };
      recorder.start();
      setAssistantListening(true);
    } catch (error) {
      voiceStreamRef.current?.getTracks().forEach((track) => track.stop());
      voiceStreamRef.current = null;
      setAssistantListening(false);
      setAssistantError(
        error instanceof Error
          ? `Microphone access failed: ${error.message}`
          : "Microphone access failed."
      );
    }
  }

  async function createCompany() {
    const trimmedName =
      newCompanyName.trim();
    const trimmedCountry = newCompanyCountry.trim();
    const documentsToUpload = newCompanyDocuments;

    if (!trimmedName) {
      setCreateCompanyError(
        "Company name is required."
      );
      return;
    }
    if (!trimmedCountry) {
      setCreateCompanyError(
        "Company country is required."
      );
      return;
    }
    if (!newCompanyBusinessType.trim()) {
      setCreateCompanyError("Business type is required.");
      return;
    }
    if (!newCompanyWorkflow.trim()) {
      setCreateCompanyError("Describe the company’s end-to-end workflow.");
      return;
    }

    const documentValidationErrors =
      validateCompanyDocuments(documentsToUpload);
    if (documentValidationErrors.length > 0) {
      setCreateCompanyError(documentValidationErrors.join(" "));
      return;
    }

    try {
      setCreatingCompany(true);
      setCreateCompanyError("");

      const response = await fetch(
        `${API_URL}/companies`,
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
            city: newCompanyCity.trim() || null,
            country: trimmedCountry,
            business_type: newCompanyBusinessType.trim(),
            end_to_end_workflow: newCompanyWorkflow.trim(),
            requires_manual_network_setup: true,
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

      manualSetupCompanies.current.add(data.id);
      selectCompany(
        data.id
      );

      setNewCompanyName("");
      setNewCompanyDescription("");
      setNewCompanyCity("");
      setNewCompanyCountry("");
      setNewCompanyBusinessType("");
      setNewCompanyWorkflow("");
      setNewCompanyDocuments([]);
      setShowCreateCompany(false);
      setCompanyActionMessage(
        "Workspace created. Build its real supply-chain network using the guided setup below; no demo locations or routes were added."
      );
      setCompanyActionError("");
      const documentFailures: string[] = [];
      for (const file of documentsToUpload) {
        try {
          await saveCompanyDocument(data.id, file);
        } catch (error) {
          documentFailures.push(
            error instanceof Error ? error.message : `${file.name}: upload failed.`
          );
        }
      }
      await loadCompanyDocuments(data.id);
      if (documentsToUpload.length > 0) {
        if (documentFailures.length === 0) {
          setCompanyActionMessage(
            `Workspace created and ${documentsToUpload.length} document(s) saved locally. Add your real supply-chain stages below.`
          );
        } else {
          setCompanyActionError(
            `Workspace was created, but some documents could not be uploaded: ${documentFailures.join(" ")} Use the company documents section to retry.`
          );
        }
      }

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
    const timeoutId = window.setTimeout(
      () => setFreshnessNow(Date.now()),
      0
    );
    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    loadCountries();
  }, []);

  useEffect(() => {
    const delay = companySearch.trim() ? 600 : 0;
    const timeoutId = window.setTimeout(() => {
      void searchPublicCompanies(companySearch, selectedCountry);
    }, delay);

    return () => {
      window.clearTimeout(timeoutId);
      companyDirectoryRequest.current?.abort();
    };
  }, [companySearch, selectedCountry, searchPublicCompanies]);

  useEffect(
    () => () => {
      mediaRecorderRef.current?.stop();
      voiceStreamRef.current?.getTracks().forEach((track) => track.stop());
    },
    []
  );

  useEffect(() => {
    if (currentUser && selectedCompanyId > 0 && !companiesLoading) {
      setResult(null);
      setError("");
      setExcelPreview(null);
      setPendingExcelFile(null);
      setPendingExcelCompanyId(null);
      loadCompanyNetwork(selectedCompanyId);
      void loadCompanyDocuments(selectedCompanyId);
    }
  }, [selectedCompanyId, companiesLoading, currentUser]);

  useEffect(() => {

    if (!currentUser || selectedCompanyId <= 0 || companiesLoading) {
      return;
    }

    let isCurrentRequest = true;
    queueMicrotask(() => {
      if (isCurrentRequest) {
        setHistoryLoading(true);
        setHistoryError("");
      }
    });

    fetch(
      `${API_URL}/companies/${selectedCompanyId}/simulation-history`
    )
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(
            data.detail || "Unable to load simulation history."
          );
        }
        return data as SimulationHistoryResponse[];
      })
      .then((entries) => {
        if (isCurrentRequest) {
          setHistory(
            entries.map((entry) => ({
              id: entry.id,
              message: entry.message,
              createdAt: new Date(entry.created_at).toLocaleString(),
              result: entry.result,
            }))
          );
        }
      })
      .catch((loadError: unknown) => {
        if (isCurrentRequest) {
          setHistory([]);
          setHistoryError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load simulation history."
          );
        }
      })
      .finally(() => {
        if (isCurrentRequest) {
          setHistoryLoading(false);
        }
      });

    return () => {
      isCurrentRequest = false;
    };
  }, [selectedCompanyId, companiesLoading, currentUser]);


  useEffect(() => {
    if (!currentUser || selectedCompanyId <= 0 || companiesLoading) {
      queueMicrotask(() => setCollaboration(null));
      return;
    }
    let active = true;
    queueMicrotask(() => {
      if (active) {
        setCollaborationLoading(true);
      }
    });
    fetch(`${API_URL}/companies/${selectedCompanyId}/collaboration`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.detail || "Unable to load workspace collaborators.");
        }
        return data as CollaborationData;
      })
      .then((data) => {
        if (active) {
          setCollaboration(data);
          setCollaborationError("");
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setCollaboration(null);
          setCollaborationError(
            error instanceof Error
              ? error.message
              : "Unable to load workspace collaborators."
          );
        }
      })
      .finally(() => {
        if (active) {
          setCollaborationLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [selectedCompanyId, companiesLoading, currentUser, companiesRetry]);

  useEffect(() => {
    if (!currentUser || inviteAcceptStarted.current) {
      return;
    }
    const url = new URL(window.location.href);
    const inviteToken = url.searchParams.get("invite");
    if (!inviteToken) {
      return;
    }
    inviteAcceptStarted.current = true;
    fetch(`${API_URL}/invites/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: inviteToken }),
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.detail || "Unable to accept this invite link.");
        }
        return data as { company_id: number; role: string };
      })
      .then((data) => {
        setInviteAcceptMessage(`Workspace invite accepted. Your role is ${data.role}.`);
        setSelectedCompanyId(data.company_id);
        setCompaniesRetry((retry) => retry + 1);
        url.searchParams.delete("invite");
        window.history.replaceState({}, "", url);
      })
      .catch((error: unknown) => {
        setInviteAcceptMessage(
          error instanceof Error ? error.message : "Unable to accept this invite link."
        );
        url.searchParams.delete("invite");
        window.history.replaceState({}, "", url);
      });
  }, [currentUser]);

  async function createWorkspaceInvite() {
    setInviteBusy(true);
    setCollaborationError("");
    setInviteLink("");
    try {
      const response = await fetch(`${API_URL}/companies/${selectedCompanyId}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: inviteRole }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Unable to create an invite link.");
      }
      setInviteLink(`${window.location.origin}/?invite=${encodeURIComponent(data.token)}`);
      const collaborationResponse = await fetch(
        `${API_URL}/companies/${selectedCompanyId}/collaboration`
      );
      if (!collaborationResponse.ok) {
        throw new Error("Invite link created, but collaborator details could not be refreshed.");
      }
      setCollaboration(await collaborationResponse.json());
    } catch (error) {
      setCollaborationError(
        error instanceof Error ? error.message : "Unable to create an invite link."
      );
    } finally {
      setInviteBusy(false);
    }
  }

  async function updateCollaborator(
    path: string,
    method: "PATCH" | "DELETE",
    body?: { role: string }
  ) {
    setCollaborationError("");
    try {
      const response = await fetch(
        `${API_URL}/companies/${selectedCompanyId}/${path}`,
        {
          method,
          ...(body
            ? {
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
              }
            : {}),
        }
      );
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || "Unable to update workspace access.");
      }
      const refreshed = await fetch(
        `${API_URL}/companies/${selectedCompanyId}/collaboration`
      );
      if (!refreshed.ok) {
        throw new Error("Workspace access changed, but collaborator details could not be refreshed.");
      }
      setCollaboration(await refreshed.json());
      setCompaniesRetry((retry) => retry + 1);
    } catch (error) {
      setCollaborationError(
        error instanceof Error ? error.message : "Unable to update workspace access."
      );
    }
  }


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

  function selectCompany(companyId: number) {
    assistantRequestId.current += 1;
    setResult(null);
    setError("");
    setAssistantMessages([]);
    setAssistantInput("");
    setAssistantError("");
    setAssistantLoading(false);
    setSelectedCompanyId(companyId);
  }

  function reviewAssistantDraft(message: AssistantChatMessage) {
    if (message.draft_node) {
      const draft = message.draft_node;
      setEditingNodeId(null);
      setNewNodeType(draft.node_type ?? "SUPPLIER");
      setNewNodeCode(draft.code ?? "");
      setNewNodeName(draft.name ?? "");
      setNewNodeCity(draft.city ?? "");
      setNewNodeCountry(draft.country ?? "");
      setNewNodeCapacity(
        draft.capacity == null ? "" : String(draft.capacity)
      );
      setNewNodeInventory(
        draft.current_inventory == null
          ? ""
          : String(draft.current_inventory)
      );
      setNewNodeDailyDemand(
        draft.daily_demand == null ? "" : String(draft.daily_demand)
      );
      setNewNodeSafetyStock(
        draft.safety_stock == null ? "" : String(draft.safety_stock)
      );
      setNewNodeSourceUrl("");
      setNodeSaveError("");
      setShowAddRoute(false);
      setShowAddNode(true);
      requestAnimationFrame(() =>
        document.getElementById("node-editor")?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        })
      );
      return;
    }

    if (message.draft_route) {
      const draft = message.draft_route;
      setEditingRouteId(null);
      setNewRouteSourceId(
        draft.source_node_id == null ? "" : String(draft.source_node_id)
      );
      setNewRouteDestinationId(
        draft.destination_node_id == null
          ? ""
          : String(draft.destination_node_id)
      );
      setNewRouteMode(draft.transport_mode ?? "");
      setNewRouteCost(
        draft.base_cost == null ? "" : String(draft.base_cost)
      );
      setNewRouteLeadTime(
        draft.lead_time_days == null ? "" : String(draft.lead_time_days)
      );
      setNewRouteCapacity(
        draft.capacity == null ? "" : String(draft.capacity)
      );
      setNewRouteFuelDependency(
        draft.fuel_dependency == null ? "" : String(draft.fuel_dependency)
      );
      setNewRouteSourceReference("");
      setRouteSaveError("");
      setShowAddNode(false);
      setShowAddRoute(true);
      requestAnimationFrame(() =>
        document.getElementById("route-editor")?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        })
      );
    }
  }

  function beginWorkflowNode(nodeType: string) {
    const workspaceCountry =
      companies.find((company) => company.id === selectedCompanyId)?.country;
    setEditingNodeId(null);
    setNewNodeType(nodeType);
    setNewNodeCode("");
    setNewNodeName("");
    setNewNodeCity("");
    setNewNodeCountry(workspaceCountry ?? "");
    setNewNodeCapacity("");
    setNewNodeInventory("0");
    setNewNodeDailyDemand("0");
    setNewNodeSafetyStock("0");
    setNewNodeSourceUrl("");
    setNodeSaveError("");
    setShowAddRoute(false);
    setShowAddNode(true);
    requestAnimationFrame(() =>
      document.getElementById("node-editor")?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      })
    );
  }

  function beginWorkflowRoute() {
    setEditingRouteId(null);
    setNewRouteSourceId("");
    setNewRouteDestinationId("");
    setNewRouteMode("road");
    setNewRouteCost("");
    setNewRouteLeadTime("");
    setNewRouteCapacity("");
    setNewRouteFuelDependency("1");
    setNewRouteSourceReference("");
    setRouteSaveError("");
    setShowAddNode(false);
    setShowAddRoute(true);
    requestAnimationFrame(() =>
      document.getElementById("route-editor")?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      })
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





        `${API_URL}/simulate/natural`,





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





      const data = (await response.json()) as SimulationResponse;





      if (!response.ok) {





        throw new Error(





          data.detail ||





            "Simulation request failed."





        );





      }





      setResult(data);

      const newHistoryItem: ScenarioHistoryItem = {



        id: data.history_id,



        message: data.user_message,



        createdAt:



          new Date(data.history_created_at).toLocaleString(),



        result: data,

      };

      setHistory((currentHistory) =>
        [newHistoryItem, ...currentHistory].slice(0, 10)
      );





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

  const selectedCompany =
    companies.find(
      (company) =>
        company.id ===
        selectedCompanyId
    ) ?? null;
  const controlTowerSimulation = useMemo(() => {
    if (result?.company_id !== selectedCompanyId) {
      return null;
    }

    return {
      scenario: result.user_message,
      recommendedActions: result.ai_explanation.recommended_actions,
      expectedImpact: {
        risk_level: result.simulation.risk_level,
        cost_change_percent: result.simulation.cost_change_percent,
        delay_change_days: result.simulation.delay_change_days,
        stockout_locations: result.simulation.inventory_impact.filter(
          (impact) => impact.stockout_expected || impact.projected_shortage > 0
        ).length,
        emergency_inventory_units: result.simulation.inventory_impact.reduce(
          (total, impact) => total + impact.emergency_inventory_required,
          0
        ),
      },
    };
  }, [result, selectedCompanyId]);

  const selectedCompanySource =
    selectedCompany?.is_demo
      ? "DEMO / SYNTHETIC"
      : selectedCompany?.description?.includes(
            "Public directory ID:"
        ) || selectedCompany?.description?.includes("Imported public")
        ? "VERIFIED PUBLIC"
        : "USER PROVIDED";

  const nodeSourceSummary =
    companyNodes.length > 0
      ? Array.from(
          new Set(
            companyNodes.map((node) =>
              normalizeSourceType(node.data_source_type)
            )
          )
        ).join(" · ")
      : "USER PROVIDED";

  const routeSourceSummary =
    companyRoutes.length > 0
      ? Array.from(
          new Set(
            companyRoutes.map((route) =>
              normalizeSourceType(route.data_source_type)
            )
          )
        ).join(" · ")
      : "USER PROVIDED";

  const hasSyntheticOperationalData =
    companyNodes.some((node) =>
      normalizeSourceType(node.data_source_type)
        .includes("SYNTHETIC")
    ) ||
    companyRoutes.some((route) =>
      normalizeSourceType(route.data_source_type)
        .includes("SYNTHETIC")
    );

  const inventoryImpacts =
    simulation?.inventory_impact ?? [];
  const stockoutImpacts = inventoryImpacts.filter(
    (item) =>
        item.stockout_expected ||
        item.projected_shortage > 0
  );
  const longestShortageWindow =
    inventoryImpacts.reduce(
        (longest, item) =>
          Math.max(longest, item.shortage_days_before_replenishment),
        0
    );
  const totalEmergencyInventory =
    inventoryImpacts.reduce(
        (total, item) =>
          total + item.emergency_inventory_required,
        0
    );
  const mostExposedLocation =
    [...inventoryImpacts].sort(
        (left, right) =>
          right.emergency_inventory_required -
          left.emergency_inventory_required
    )[0] ?? null;
  const impactedNodeNames =
    (simulation?.inventory_impact ?? [])
        .filter(
          (item) =>
            item.stockout_expected ||
            item.projected_shortage > 0 ||
            item.safety_stock_breached
        )
        .map((item) => item.node_name);
  const disruptionTargets = [
    ...(result?.parsed_scenario.closed_nodes ?? []).map(
        (nodeId) =>
          companyNodes.find((node) => node.code === nodeId)?.name ??
          nodeId
    ),
    ...(result?.parsed_scenario.closed_routes ?? []).map(
        (routeKey) => {
          const [sourceCode, destinationCode] =
            routeKey.split("->").map((part) => part.trim());
          const sourceName =
            companyNodes.find((node) => node.code === sourceCode)?.name ??
            sourceCode;
          const destinationName =
            companyNodes.find((node) => node.code === destinationCode)?.name ??
            destinationCode;
          return `${sourceName} → ${destinationName}`;
        }
    ),
  ];
  const disruptionSummary =
    disruptionTargets.length > 0
        ? disruptionTargets.join(", ")
        : result?.parsed_scenario.fuel_cost_increase_percent
          ? `Fuel cost increase of ${result.parsed_scenario.fuel_cost_increase_percent}%`
          : "Scenario conditions from the request";
  const simulationRiskAlerts: SimulationRiskAlert[] = [];
  if (simulation) {
    const stockoutNames = stockoutImpacts.map((item) => item.node_name);
    const safetyStockOnly = inventoryImpacts.filter(
      (item) =>
        item.safety_stock_breached &&
        !item.stockout_expected &&
        item.projected_shortage <= 0
    );

    if (!disrupted) {
      simulationRiskAlerts.push({
        id: "no-alternative-route",
        severity: "HIGH",
        title: "No feasible alternative route",
        detail:
          "The modeled disruption leaves no feasible route between the selected source and destination.",
        recommendation:
          "Identify and validate an alternate route or supplier before relying on this disrupted network.",
      });
    }

    if (stockoutImpacts.length > 0) {
      simulationRiskAlerts.push({
        id: "projected-stockout",
        severity: "HIGH",
        title: "Projected stockout exposure",
        detail: `${stockoutImpacts.length} location(s) show projected shortage or stockout: ${stockoutNames.join(", ")}.`,
        recommendation:
          `Review replenishment and contingency inventory for: ${stockoutNames.join(", ")}.`,
      });
    }

    if (safetyStockOnly.length > 0) {
      const locationNames = safetyStockOnly.map((item) => item.node_name);
      simulationRiskAlerts.push({
        id: "safety-stock-breach",
        severity: "MEDIUM",
        title: "Safety stock breached in the model",
        detail: `${locationNames.length} location(s) fall below safety stock without a projected stockout: ${locationNames.join(", ")}.`,
        recommendation:
          `Review replenishment timing and safety-stock levels for: ${locationNames.join(", ")}.`,
      });
    }

    if (simulation.cost_change_percent !== null) {
      const costChange = simulation.cost_change_percent;
      if (costChange >= 50) {
        simulationRiskAlerts.push({
          id: "high-route-cost",
          severity: "HIGH",
          title: "Large modeled route-cost increase",
          detail: `The selected route cost increases by ${costChange}% in this scenario.`,
          recommendation:
            "Validate alternate carrier rates and review the cost assumptions used in this scenario.",
        });
      } else if (costChange >= 20) {
        simulationRiskAlerts.push({
          id: "elevated-route-cost",
          severity: "MEDIUM",
          title: "Elevated modeled route-cost increase",
          detail: `The selected route cost increases by ${costChange}% in this scenario.`,
          recommendation:
            "Review alternate carrier rates and confirm the cost assumptions for this scenario.",
        });
      }
    }

    if (simulation.delay_change_days !== null) {
      const delayChange = simulation.delay_change_days;
      if (delayChange >= 7) {
        simulationRiskAlerts.push({
          id: "high-route-delay",
          severity: "HIGH",
          title: "Large modeled lead-time increase",
          detail: `The selected route takes ${delayChange} additional days in this scenario.`,
          recommendation:
            "Review shipment timing, customer commitments, and validated alternate routes.",
        });
      } else if (delayChange >= 3) {
        simulationRiskAlerts.push({
          id: "elevated-route-delay",
          severity: "MEDIUM",
          title: "Elevated modeled lead-time increase",
          detail: `The selected route takes ${delayChange} additional days in this scenario.`,
          recommendation:
            "Review shipment timing and confirm whether an alternate route can reduce the delay.",
        });
      }
    }

    if (
      simulationRiskAlerts.length === 0 &&
      simulation.risk_level.toUpperCase() === "HIGH"
    ) {
      simulationRiskAlerts.push({
        id: "high-overall-risk",
        severity: "HIGH",
        title: "High overall modeled risk",
        detail:
          "The simulation classifies this scenario as high risk. Review route and inventory results for contributing factors.",
        recommendation:
          "Review the modeled route and inventory impacts, then document a contingency action in the Control Tower.",
      });
    }
  }
  const dataProvenanceSummary = hasSyntheticOperationalData
    ? "Synthetic demonstration data"
    : `${nodeSourceSummary} nodes · ${routeSourceSummary} routes`;
  const nodesWithLocation = companyNodes.filter(
    (node) => Boolean(node.country?.trim()) && Boolean(node.city?.trim())
  ).length;
  const nodesWithCapacity = companyNodes.filter(
    (node) =>
      ["SUPPLIER", "PLANT", "PORT", "WAREHOUSE", "DISTRIBUTION_CENTER"].includes(
        node.node_type.toUpperCase()
      ) &&
      node.capacity !== null &&
      node.capacity !== undefined
  ).length;
  const capacityRelevantNodes = companyNodes.filter((node) =>
    ["SUPPLIER", "PLANT", "PORT", "WAREHOUSE", "DISTRIBUTION_CENTER"].includes(
      node.node_type.toUpperCase()
    )
  ).length;
  const nodesWithSourceReference = companyNodes.filter(
    (node) => Boolean(node.source_url?.trim())
  ).length;
  const routesWithSourceReference = companyRoutes.filter(
    (route) => Boolean(route.source_reference?.trim())
  ).length;
  const trackedOperationalRecords = [...companyNodes, ...companyRoutes];
  const recordsWithTimestamp = trackedOperationalRecords.filter(
    (record) => Boolean(record.updated_at)
  );
  const recentlyUpdatedRecords =
    freshnessNow === null
      ? null
      : recordsWithTimestamp.filter((record) => {
          const age =
            freshnessNow - new Date(record.updated_at!).getTime();
          return age >= 0 && age <= 30 * 24 * 60 * 60 * 1000;
        }).length;
  const staleRecords =
    recentlyUpdatedRecords === null
      ? null
      : recordsWithTimestamp.length - recentlyUpdatedRecords;
  const recordsWithoutTimestamp =
    trackedOperationalRecords.length - recordsWithTimestamp.length;
  const latestRecordedUpdate = recordsWithTimestamp
    .map((record) => record.updated_at!)
    .sort(
      (left, right) =>
        new Date(right).getTime() - new Date(left).getTime()
    )[0];
  const activeNodes = companyNodes.filter((node) => node.active);
  const activeNodeIds = new Set(activeNodes.map((node) => node.id));
  const activeSuppliers = activeNodes.filter((node) =>
    node.node_type.toUpperCase().includes("SUPPLIER")
  );
  const activeCustomers = activeNodes.filter((node) =>
    node.node_type.toUpperCase().includes("CUSTOMER")
  );
  const validActiveRoutes = companyRoutes.filter(
    (route) =>
      route.active &&
      activeNodeIds.has(route.source_node_id) &&
      activeNodeIds.has(route.destination_node_id)
  );
  const invalidActiveRouteCount = companyRoutes.filter(
    (route) =>
      route.active &&
      (!activeNodeIds.has(route.source_node_id) ||
        !activeNodeIds.has(route.destination_node_id))
  ).length;
  const reachableNodeIds = new Set<number>();
  const routesBySource = new Map<number, number[]>();
  for (const route of validActiveRoutes) {
    const destinations = routesBySource.get(route.source_node_id) ?? [];
    destinations.push(route.destination_node_id);
    routesBySource.set(route.source_node_id, destinations);
  }
  const nodesToVisit = activeSuppliers.map((node) => node.id);
  while (nodesToVisit.length > 0) {
    const currentNodeId = nodesToVisit.pop()!;
    if (reachableNodeIds.has(currentNodeId)) continue;
    reachableNodeIds.add(currentNodeId);
    nodesToVisit.push(...(routesBySource.get(currentNodeId) ?? []));
  }
  const reachableCustomers = activeCustomers.filter((node) =>
    reachableNodeIds.has(node.id)
  );
  const downstreamNodes = activeNodes.filter((node) =>
    ["WAREHOUSE", "DISTRIBUTION_CENTER", "CUSTOMER"].includes(
      node.node_type.toUpperCase()
    )
  );
  const downstreamWithZeroInventory = downstreamNodes.filter(
    (node) => node.current_inventory <= 0
  ).length;
  const downstreamWithoutDemand = downstreamNodes.filter(
    (node) => node.daily_demand <= 0
  ).length;
  const missingRouteCosts = validActiveRoutes.filter(
    (route) => route.base_cost <= 0
  ).length;

  const readinessChecks = [
    {
      label: "Operational locations and routes",
      detail:
        activeNodes.length > 0 && validActiveRoutes.length > 0
          ? `${activeNodes.length} active locations and ${validActiveRoutes.length} active routes`
          : "Add/import active locations and at least one route connecting them.",
      status:
        activeNodes.length > 0 && validActiveRoutes.length > 0
          ? "ready"
          : "blocked",
    },
    {
      label: "Supplier-to-customer connectivity",
      detail:
        activeSuppliers.length === 0
          ? "Add an active supplier location."
          : activeCustomers.length === 0
            ? "Add an active customer location."
            : `${reachableCustomers.length} of ${activeCustomers.length} active customer location(s) reachable from a supplier`,
      status:
        activeSuppliers.length > 0 &&
        activeCustomers.length > 0 &&
        reachableCustomers.length === activeCustomers.length
          ? "ready"
          : reachableCustomers.length > 0
            ? "attention"
            : "blocked",
    },
    {
      label: "Active route endpoints",
      detail:
        validActiveRoutes.length === 0
          ? "Add an active route to check that endpoints are connected."
          : invalidActiveRouteCount === 0
          ? "Every active route connects active locations."
          : `${invalidActiveRouteCount} active route(s) refer to a missing or inactive location.`,
      status:
        validActiveRoutes.length > 0 && invalidActiveRouteCount === 0
          ? "ready"
          : "blocked",
    },
    {
      label: "Inventory and demand inputs",
      detail:
        downstreamNodes.length === 0
          ? "Add warehouse, distribution-centre, or customer inventory and demand."
          : downstreamWithZeroInventory === 0 &&
              downstreamWithoutDemand === 0
            ? `${downstreamNodes.length} downstream location(s) have positive inventory and daily demand values.`
            : `${downstreamWithZeroInventory} downstream location(s) have zero inventory; ${downstreamWithoutDemand} have zero daily demand. Review these inputs.`,
      status:
        downstreamNodes.length > 0 &&
        downstreamWithZeroInventory === 0 &&
        downstreamWithoutDemand === 0
          ? "ready"
          : "attention",
    },
    {
      label: "Capacity and route cost coverage",
      detail:
        capacityRelevantNodes === 0 && validActiveRoutes.length === 0
          ? "Add operational facility and route records to review capacity and cost coverage."
          : `${capacityRelevantNodes - nodesWithCapacity} location(s) missing capacity; ${missingRouteCosts} route(s) have zero cost.`,
      status:
        capacityRelevantNodes > 0 &&
        validActiveRoutes.length > 0 &&
        capacityRelevantNodes === nodesWithCapacity &&
        missingRouteCosts === 0
          ? "ready"
          : "attention",
    },
    {
      label: "Facility location details",
      detail:
        companyNodes.length === 0
          ? "Add operational locations to review city and country coverage."
          : `${companyNodes.length - nodesWithLocation} of ${companyNodes.length} location(s) missing a city or country.`,
      status:
        companyNodes.length > 0 && nodesWithLocation === companyNodes.length
          ? "ready"
          : "attention",
    },
    {
      label: "Source traceability and data provenance",
      detail: hasSyntheticOperationalData
        ? "Synthetic demo values detected; results are illustrative, not verified company operations."
        : nodesWithSourceReference + routesWithSourceReference > 0
          ? `${nodesWithSourceReference} node and ${routesWithSourceReference} route record(s) have source references.`
          : "No source references recorded; verify values against company records.",
      status:
        !hasSyntheticOperationalData &&
        nodesWithSourceReference + routesWithSourceReference > 0
          ? "ready"
          : "attention",
    },
  ] as const;
  const blockedReadinessChecks = readinessChecks.filter(
    (check) => check.status === "blocked"
  );
  const attentionReadinessChecks = readinessChecks.filter(
    (check) => check.status === "attention"
  );
  const simulationReadiness = blockedReadinessChecks.length > 0
    ? "Blocked"
    : attentionReadinessChecks.length > 0
      ? "Review recommended"
      : "Structurally ready";
  const dataQualityActions = [
    ...companyNodes.flatMap((node) => {
      const isSynthetic = normalizeSourceType(node.data_source_type) ===
        "DEMO / SYNTHETIC";
      const issues: string[] = [];
      const nodeType = node.node_type.toUpperCase();
      const downstream = [
        "WAREHOUSE",
        "DISTRIBUTION_CENTER",
        "CUSTOMER",
      ].includes(nodeType);
      const capacityRelevant = [
        "SUPPLIER",
        "PLANT",
        "PORT",
        "WAREHOUSE",
        "DISTRIBUTION_CENTER",
      ].includes(nodeType);

      if (!node.city?.trim() || !node.country?.trim()) {
        issues.push("Add a city and country for this location.");
      } else if (
        isSynthetic &&
        node.city.trim().toLowerCase().startsWith("example:")
      ) {
        issues.push(
          "Replace the illustrative city with the verified facility location before operational use."
        );
      }
      if (capacityRelevant && (node.capacity == null || node.capacity <= 0)) {
        issues.push("Add a positive capacity value.");
      }
      if (downstream && node.current_inventory <= 0) {
        issues.push("Review the zero inventory value.");
      }
      if (downstream && node.daily_demand <= 0) {
        issues.push("Review the zero daily demand value.");
      }
      if (!isSynthetic && !node.source_url?.trim()) {
        issues.push("Add a source reference for this operational record.");
      }
      if (!isSynthetic && !node.updated_at) {
        issues.push(
          "Update date is unknown; verify this record and save it to track freshness."
        );
      } else if (!isSynthetic && freshnessNow !== null && node.updated_at) {
        const ageMs = freshnessNow - new Date(node.updated_at).getTime();
        if (Number.isFinite(ageMs) && ageMs > 30 * 24 * 60 * 60 * 1000) {
          issues.push(
            `Last updated ${Math.floor(ageMs / (24 * 60 * 60 * 1000))} days ago; verify it against the source.`
          );
        }
      }

      return issues.map((detail) => ({
        key: `node-${node.id}-${detail}`,
        recordType: "Location",
        recordName: node.name,
        detail,
        node,
        route: null,
      }));
    }),
    ...companyRoutes.flatMap((route) => {
      const isSynthetic = normalizeSourceType(route.data_source_type) ===
        "DEMO / SYNTHETIC";
      const issues: string[] = [];
      const sourceName =
        companyNodes.find((node) => node.id === route.source_node_id)?.name ??
        "Unknown location";
      const destinationName =
        companyNodes.find(
          (node) => node.id === route.destination_node_id
        )?.name ?? "Unknown location";

      if (route.base_cost <= 0) {
        issues.push("Add a positive route cost.");
      }
      if (route.lead_time_days <= 0) {
        issues.push("Add a positive lead time.");
      }
      if (route.capacity <= 0) {
        issues.push("Add a positive route capacity.");
      }
      if (!isSynthetic && !route.source_reference?.trim()) {
        issues.push("Add a source reference for this route.");
      }
      if (
        route.active &&
        (!activeNodeIds.has(route.source_node_id) ||
          !activeNodeIds.has(route.destination_node_id))
      ) {
        issues.push(
          "Reconnect this active route to locations that are currently active."
        );
      }
      if (!isSynthetic && !route.updated_at) {
        issues.push(
          "Update date is unknown; verify this route and save it to track freshness."
        );
      } else if (!isSynthetic && freshnessNow !== null && route.updated_at) {
        const ageMs = freshnessNow - new Date(route.updated_at).getTime();
        if (Number.isFinite(ageMs) && ageMs > 30 * 24 * 60 * 60 * 1000) {
          issues.push(
            `Last updated ${Math.floor(ageMs / (24 * 60 * 60 * 1000))} days ago; verify it against the source.`
          );
        }
      }

      return issues.map((detail) => ({
        key: `route-${route.id}-${detail}`,
        recordType: "Route",
        recordName: `${sourceName} → ${destinationName}`,
        detail,
        node: null,
        route,
      }));
    }),
  ];
  if (!authReady) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-300">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900 px-5 py-4 text-sm">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
          Securing your workspace...
        </div>
      </main>
    );
  }
  if (!currentUser) {
    return (
      <AuthScreen
        onAuthenticated={(account) => {
          setCurrentUser(account);
          setCompaniesRetry((retry) => retry + 1);
          setAuthReady(true);
        }}
      />
    );
  }
  return (




    <main className="dashboard-shell min-h-screen text-white">





      <div className="dashboard-container mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">





        {/* HEADER */}





        <div className="dashboard-header mb-8 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-400">
              Digital Twin Simulator
            </p>
            <h1 className="mt-2 text-3xl font-bold sm:text-4xl">
              SupplyChain Twin AI
            </h1>
            <p className="mt-3 max-w-3xl text-slate-400">
              Simulate disruptions, identify alternative routes, calculate
              inventory exposure, and generate AI-assisted mitigation
              recommendations.
            </p>
          </div>

          <div className="dashboard-account flex shrink-0 items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-3">
            <NotificationCenter
              onOpen={(notification: WorkspaceNotification) => {
                if (notification.company_id !== null) {
                  setSelectedCompanyId(notification.company_id);
                }
                if (notification.related_action_id !== null) {
                  window.setTimeout(() => {
                    document
                      .getElementById("control-tower")
                      ?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }, 100);
                }
              }}
            />
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-cyan-400/10 text-sm font-semibold text-cyan-200">
              {currentUser.display_name.slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="max-w-40 truncate text-sm font-medium text-slate-200">
                {currentUser.display_name}
              </p>
              <p className="max-w-40 truncate text-xs text-slate-500">
                {currentUser.email}
              </p>
            </div>
            <button
              type="button"
              onClick={signOut}
              disabled={signOutLoading}
              className="rounded-lg border border-slate-700 px-3 py-2 text-sm font-medium text-slate-300 transition hover:border-rose-700 hover:text-rose-200 disabled:cursor-wait disabled:opacity-60"
            >
              {signOutLoading ? "Signing out..." : "Sign out"}
            </button>
          </div>
        </div>
        {signOutError && (
          <p role="alert" className="mb-6 rounded-lg border border-rose-900 bg-rose-950/40 p-3 text-sm text-rose-200">
            {signOutError}
          </p>
        )}

        {/* COUNTRY + COMPANY DISCOVERY */}

        <section className="dashboard-discovery mb-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
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
                  setPublicSearchHasLoaded(false);
                  setPublicSearchError("");
                  setPublicSearchNote("");
                }}
                aria-label="Choose a country to browse companies"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
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
                    void searchPublicCompanies();
                  }
                }}
                placeholder={`Search ${selectedCountry} companies...`}
                aria-label="Search companies in the selected country"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
              />
            </div>

            <div className="flex items-end">
              <button
                onClick={() => void searchPublicCompanies()}
                disabled={publicSearchLoading}
                className="w-full rounded-xl bg-emerald-400 px-5 py-3 font-semibold text-slate-950 transition hover:bg-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 disabled:cursor-wait disabled:opacity-60 lg:w-auto"
              >
                {publicSearchLoading
                  ? "Searching..."
                  : companySearch.trim()
                    ? "Search"
                    : "Refresh list"}
              </button>
            </div>
          </div>

          <div className="mt-5 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/70" aria-busy={publicSearchLoading}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
              <div>
                <h3 className="font-semibold text-white">
                  {companySearch.trim()
                    ? `Search results for “${companySearch.trim()}”`
                    : `Companies in ${selectedCountry}`}
                </h3>
                <p className="mt-1 text-xs text-slate-400">
                  Choose a company to open its supply-chain workspace.
                </p>
              </div>
              {publicCompanies.length > 0 && (
                <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-medium text-slate-300">
                  {publicCompanies.length} {publicCompanies.length === 1 ? "company" : "companies"}
                </span>
              )}
            </div>

            {publicSearchLoading && publicCompanies.length === 0 && (
              <div role="status" className="flex items-center gap-3 px-4 py-8 text-sm text-slate-300">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
                Finding companies in {selectedCountry}...
              </div>
            )}

            {publicSearchError && (
              <div role="alert" className="m-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-900 bg-red-950/40 p-4 text-sm text-red-300">
                <span>{publicSearchError}</span>
                <button
                  type="button"
                  onClick={() => void searchPublicCompanies()}
                  disabled={publicSearchLoading}
                  className="shrink-0 rounded-lg border border-red-700 px-3 py-2 font-semibold text-red-200 transition hover:bg-red-950 disabled:opacity-50"
                >
                  {publicSearchLoading ? "Retrying..." : "Retry search"}
                </button>
              </div>
            )}

            {publicSearchNote && !publicSearchError && (
              <p className="px-4 py-3 text-xs leading-5 text-slate-400">
                {publicSearchNote}
              </p>
            )}

            {!publicSearchLoading && !publicSearchError && publicSearchHasLoaded && publicCompanies.length === 0 && (
              <div className="px-4 py-8 text-center">
                <p className="font-medium text-slate-200">No companies found</p>
                <p className="mt-1 text-sm text-slate-400">
                  Try a shorter name or choose another country.
                </p>
              </div>
            )}

            {publicCompanies.length > 0 && (
              <div className="grid max-h-[26rem] gap-3 overflow-y-auto p-3 sm:grid-cols-2">
                {publicCompanies.map((company) => (
                  <article
                    key={company.external_id}
                    className="group flex min-h-40 flex-col justify-between gap-4 rounded-xl border border-slate-800 bg-slate-900/80 p-4 transition hover:border-emerald-500/60 hover:bg-slate-900"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <h4 className="font-semibold leading-5 text-white">{company.name}</h4>
                        <span className="shrink-0 rounded-full border border-slate-700 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                          {company.country}
                        </span>
                      </div>
                      {company.description && (
                        <p className="mt-2 line-clamp-2 text-sm leading-5 text-slate-400">
                          {company.description}
                        </p>
                      )}
                      {!company.external_id.startsWith("LOCAL-") && (
                        <p className="mt-2 text-xs text-slate-500">
                          Directory ID: {company.external_id}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => void importSelectedPublicCompany(company)}
                      disabled={Boolean(companyActionLoading)}
                      className="flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-700/70 bg-emerald-950/30 px-4 py-2.5 text-sm font-semibold text-emerald-300 transition hover:border-emerald-500 hover:bg-emerald-900/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:cursor-wait disabled:opacity-60"
                    >
                      {companyActionLoading === company.external_id
                        ? "Opening workspace..."
                        : "Select company"}
                      {companyActionLoading !== company.external_id && <span aria-hidden="true">→</span>}
                    </button>
                  </article>
                ))}
              </div>
            )}
          </div>

          <div className="mt-7 border-t border-slate-800 pt-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="w-full max-w-xl">
                <label className="mb-2 block text-sm font-medium text-slate-300">
                  Selected / Saved Workspace
                </label>

                <select
                  value={selectedCompanyId}
                  onChange={(event) =>
                    selectCompany(
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
                        {company.role && company.role !== "owner"
                          ? ` · ${company.role}`
                          : ""}
                      </option>
                    )
                  )}
                </select>

                {selectedCompany?.role === "viewer" && (
                  <p className="mt-2 rounded-lg border border-amber-900/60 bg-amber-950/25 px-3 py-2 text-xs leading-5 text-amber-200">
                    You have Viewer access to this workspace. Network, simulation, and action changes are read-only.
                  </p>
                )}

                {companiesError && (
                  <div role="alert" className="mt-2 space-y-2 text-sm text-red-300">
                    <p>{companiesError}</p>
                    <button
                      type="button"
                      onClick={() => setCompaniesRetry((retry) => retry + 1)}
                      disabled={companiesLoading}
                      className="rounded-lg border border-red-800 px-3 py-1.5 font-semibold text-red-200 transition hover:bg-red-950 disabled:opacity-50"
                    >
                      {companiesLoading ? "Retrying..." : "Retry workspaces"}
                    </button>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setCollaborationOpen((open) => !open);
                    setInviteLink("");
                  }}
                  disabled={!selectedCompany}
                  className="rounded-xl border border-cyan-800 bg-cyan-950/40 px-4 py-3 font-semibold text-cyan-200 transition hover:border-cyan-500 disabled:opacity-50"
                >
                  {collaborationOpen ? "Close team" : "Team & sharing"}
                </button>
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
            </div>

            {inviteAcceptMessage && (
              <p role="status" className="mt-4 rounded-lg border border-cyan-800 bg-cyan-950/40 p-3 text-sm text-cyan-100">
                {inviteAcceptMessage}
              </p>
            )}

            {collaborationOpen && (
              <div className="mt-5 grid gap-5 rounded-2xl border border-cyan-900/60 bg-slate-950/80 p-5 lg:grid-cols-2">
                <section>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-white">Workspace team</h3>
                      <p className="mt-1 text-sm text-slate-400">
                        Your role: <span className="font-medium capitalize text-cyan-200">{collaboration?.role ?? "loading"}</span>
                      </p>
                    </div>
                    {collaboration?.role === "owner" && (
                      <div className="flex items-center gap-2">
                        <label htmlFor="invite-role" className="sr-only">Invite role</label>
                        <select
                          id="invite-role"
                          value={inviteRole}
                          onChange={(event) => setInviteRole(event.target.value as "editor" | "viewer")}
                          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
                        >
                          <option value="editor">Editor</option>
                          <option value="viewer">Viewer</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => void createWorkspaceInvite()}
                          disabled={inviteBusy}
                          className="rounded-lg bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:opacity-50"
                        >
                          {inviteBusy ? "Creating..." : "Create invite"}
                        </button>
                      </div>
                    )}
                  </div>

                  <p className="mt-3 text-xs leading-5 text-slate-500">
                    Editors can change the network, run simulations, and manage actions. Viewers can review workspace data and history. Invite links expire after 7 days and can be used once.
                  </p>

                  {inviteLink && (
                    <div className="mt-4 rounded-xl border border-cyan-800/70 bg-cyan-950/30 p-3">
                      <p className="text-sm font-medium text-cyan-100">Invite link ready</p>
                      <div className="mt-2 flex gap-2">
                        <input
                          readOnly
                          aria-label="Workspace invite link"
                          value={inviteLink}
                          onFocus={(event) => event.currentTarget.select()}
                          className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200"
                        />
                        <button
                          type="button"
                          onClick={() => void navigator.clipboard.writeText(inviteLink)}
                          className="rounded-lg border border-cyan-700 px-3 py-2 text-sm font-medium text-cyan-200 hover:bg-cyan-900/40"
                        >
                          Copy
                        </button>
                      </div>
                      <p className="mt-2 text-xs text-slate-400">
                        Share privately with the teammate. Anyone who has this link can join as an {inviteRole}.
                      </p>
                    </div>
                  )}

                  <h4 className="mt-5 text-sm font-semibold text-slate-200">
                    Members ({collaboration?.members.length ?? 0})
                  </h4>
                  {collaborationLoading && (
                    <p className="mt-3 text-sm text-slate-400">Loading workspace members...</p>
                  )}
                  <ul className="mt-2 divide-y divide-slate-800">
                    {collaboration?.members.map((member) => (
                      <li key={member.user_id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-200">
                            {member.display_name}{member.is_self ? " (you)" : ""}
                          </p>
                          <p className="truncate text-xs text-slate-500">{member.email}</p>
                        </div>
                        {collaboration.role === "owner" && member.role !== "owner" ? (
                          <div className="flex items-center gap-2">
                            <select
                              aria-label={`Role for ${member.display_name}`}
                              value={member.role}
                              onChange={(event) => void updateCollaborator(
                                `members/${member.user_id}`,
                                "PATCH",
                                { role: event.target.value }
                              )}
                              className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs capitalize text-white"
                            >
                              <option value="editor">Editor</option>
                              <option value="viewer">Viewer</option>
                            </select>
                            <button
                              type="button"
                              onClick={() => void updateCollaborator(
                                `members/${member.user_id}`,
                                "DELETE"
                              )}
                              className="rounded-lg border border-rose-900 px-2 py-1.5 text-xs text-rose-200 hover:bg-rose-950/60"
                            >
                              Remove
                            </button>
                          </div>
                        ) : (
                          <span className="rounded-full border border-slate-700 px-2.5 py-1 text-xs capitalize text-slate-300">
                            {member.role}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                  {collaboration?.invites.map((invite) => (
                    <div key={invite.id} className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-slate-800 px-3 py-2 text-xs text-slate-400">
                      <span>Pending {invite.role} invite · expires {new Date(invite.expires_at).toLocaleDateString()}</span>
                      {collaboration.role === "owner" && (
                        <button
                          type="button"
                          onClick={() => void updateCollaborator(`invites/${invite.id}`, "DELETE")}
                          className="text-rose-300 hover:text-rose-200"
                        >
                          Revoke
                        </button>
                      )}
                    </div>
                  ))}
                </section>

                <section className="border-t border-slate-800 pt-5 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-lg font-semibold text-white">Workspace activity</h3>
                    <button
                      type="button"
                      onClick={async () => {
                        setCollaborationLoading(true);
                        setCollaborationError("");
                        try {
                          const response = await fetch(
                            `${API_URL}/companies/${selectedCompanyId}/collaboration`
                          );
                          const data = await response.json();
                          if (!response.ok) {
                            throw new Error(data.detail || "Unable to refresh workspace activity.");
                          }
                          setCollaboration(data as CollaborationData);
                        } catch (error) {
                          setCollaborationError(
                            error instanceof Error
                              ? error.message
                              : "Unable to refresh workspace activity."
                          );
                        } finally {
                          setCollaborationLoading(false);
                        }
                      }}
                      disabled={collaborationLoading}
                      className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-cyan-700 hover:text-cyan-200 disabled:opacity-50"
                    >
                      {collaborationLoading ? "Refreshing..." : "Refresh"}
                    </button>
                  </div>
                  <p className="mt-1 text-sm text-slate-400">
                    Recent team, network, simulation, and action changes.
                  </p>
                  {collaboration?.activity.length ? (
                    <ol className="mt-4 max-h-80 space-y-3 overflow-y-auto">
                      {collaboration.activity.map((entry) => (
                        <li key={entry.id} className="border-l border-cyan-800 pl-3">
                          <p className="text-sm text-slate-200">{entry.description}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {entry.user_name} · {new Date(entry.created_at).toLocaleString()}
                          </p>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="mt-4 rounded-lg border border-slate-800 bg-slate-900/50 p-3 text-sm text-slate-400">
                      Workspace activity will appear here as teammates collaborate.
                    </p>
                  )}
                </section>

                {collaborationError && (
                  <p role="alert" className="lg:col-span-2 rounded-lg border border-rose-900 bg-rose-950/40 p-3 text-sm text-rose-200">
                    {collaborationError}
                  </p>
                )}
              </div>
            )}

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

                <div className="lg:col-span-2">
                  <p className="mb-2 text-sm font-medium text-slate-300">
                    Company base location
                  </p>
                  <div className="grid gap-4 md:grid-cols-2">
                    <input
                      value={newCompanyCity}
                      onChange={(event) =>
                        setNewCompanyCity(event.target.value)
                      }
                      className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none focus:border-cyan-500"
                      placeholder="City (optional)"
                      aria-label="Company base city"
                    />
                    <input
                      value={newCompanyCountry}
                      onChange={(event) =>
                        setNewCompanyCountry(event.target.value)
                      }
                      className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none focus:border-cyan-500"
                      placeholder="Country (required)"
                      aria-label="Company base country"
                      required
                    />
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    This is the company&apos;s base location. Add actual supplier, plant, port, warehouse, and customer locations in the guided network setup after creating the workspace.
                  </p>
                </div>

                <div className="lg:col-span-2">
                  <label
                    htmlFor="custom-company-business-type"
                    className="mb-2 block text-sm text-slate-300"
                  >
                    Business / industry type
                  </label>
                  <input
                    id="custom-company-business-type"
                    value={newCompanyBusinessType}
                    onChange={(event) =>
                      setNewCompanyBusinessType(event.target.value)
                    }
                    className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none focus:border-cyan-500"
                    placeholder="For example: automotive manufacturing, food distribution, electronics"
                    required
                  />
                </div>

                <div className="lg:col-span-2">
                  <label
                    htmlFor="custom-company-workflow"
                    className="mb-2 block text-sm text-slate-300"
                  >
                    Current end-to-end business workflow
                  </label>
                  <textarea
                    id="custom-company-workflow"
                    value={newCompanyWorkflow}
                    onChange={(event) =>
                      setNewCompanyWorkflow(event.target.value)
                    }
                    className="min-h-32 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none focus:border-cyan-500"
                    placeholder="Describe how products move today: raw materials and suppliers → plants or ports → warehouses / distribution → customers. Include important handoffs or transport modes."
                    required
                  />
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    Describe your current process, not an idealized one. You can model its locations and routes in the guided network setup after creating this workspace.
                  </p>
                </div>

                <div className="lg:col-span-2">
                  <label
                    htmlFor="custom-company-documents"
                    className="mb-2 block text-sm text-slate-300"
                  >
                    Company documents (optional)
                  </label>
                  <input
                    id="custom-company-documents"
                    type="file"
                    multiple
                    accept=".pdf,.docx,.xlsx"
                    onChange={(event) =>
                      setNewCompanyDocuments(
                        Array.from(event.currentTarget.files ?? [])
                      )
                    }
                    className="block w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-300 file:mr-4 file:rounded-lg file:border-0 file:bg-slate-700 file:px-3 file:py-2 file:font-medium file:text-white"
                  />
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    PDF, DOCX, or XLSX; up to 10 MB each. Files are stored locally for reference only—not parsed, transmitted to external services, or treated as verified data.
                  </p>
                  {newCompanyDocuments.length > 0 && (
                    <ul className="mt-2 space-y-1 text-xs text-slate-400">
                      {newCompanyDocuments.map((file) => (
                        <li key={`${file.name}-${file.lastModified}`}>
                          {file.name} · {(file.size / (1024 * 1024)).toFixed(2)} MB
                        </li>
                      ))}
                    </ul>
                  )}
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
              Company Profile / Data Source
            </h3>

            <div className="mt-4 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                      Active Workspace
                    </p>
                    <h4 className="mt-2 text-2xl font-semibold text-white">
                      {selectedCompany?.name ?? "No company selected"}
                    </h4>
                  </div>

                  <span
                    className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${SOURCE_BADGE_STYLES[normalizeSourceType(selectedCompanySource)] ?? "border-slate-500/40 bg-slate-500/10 text-slate-200"}`}
                  >
                    {selectedCompanySource}
                  </span>
                </div>

                <p className="mt-4 whitespace-pre-line text-sm leading-6 text-slate-300">
                  {selectedCompany?.description?.trim() ||
                    "This workspace has no public profile attached yet. Use public search, Excel, manual entry, or a demo network to add a supply-chain dataset."}
                </p>
                {(selectedCompany?.city || selectedCompany?.country) && (
                  <p className="mt-3 text-sm text-slate-400">
                    Company base:{" "}
                    {[selectedCompany.city, selectedCompany.country]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                )}
                {selectedCompany?.business_type && (
                  <p className="mt-3 text-sm text-slate-300">
                      <span className="text-slate-500">Business type:</span>{" "}
                      {selectedCompany.business_type}
                  </p>
                )}
                {selectedCompany?.end_to_end_workflow && (
                  <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900/50 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Current end-to-end workflow
                      </p>
                      <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-300">
                        {selectedCompany.end_to_end_workflow}
                      </p>
                  </div>
                )}

                {!hasSyntheticOperationalData && (
                  <div className="mt-5 border-t border-slate-800 pt-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-200">
                          Company documents
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Local reference only. Files are not parsed or sent to external services.
                        </p>
                      </div>
                      <span className="text-xs text-slate-400">
                        {companyDocumentsLoading
                          ? "Loading..."
                          : `${companyDocuments.length} saved`}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <input
                        type="file"
                        multiple
                        accept=".pdf,.docx,.xlsx"
                        aria-label="Choose company documents"
                        onChange={(event) =>
                          setNewCompanyDocuments(
                            Array.from(event.currentTarget.files ?? [])
                          )
                        }
                        className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-300 file:mr-3 file:rounded-md file:border-0 file:bg-slate-700 file:px-2 file:py-1 file:text-slate-100"
                      />
                      <button
                        type="button"
                        onClick={() => void uploadSelectedCompanyDocuments()}
                        disabled={
                          companyDocumentsBusy ||
                          newCompanyDocuments.length === 0
                        }
                        className="rounded-lg bg-cyan-500 px-3 py-2 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {companyDocumentsBusy ? "Uploading..." : "Upload"}
                      </button>
                    </div>
                    {companyDocumentsError && (
                      <p className="mt-2 text-xs leading-5 text-red-300">
                        {companyDocumentsError}
                      </p>
                    )}
                    {companyDocuments.length > 0 && (
                      <ul className="mt-3 space-y-2">
                        {companyDocuments.map((document) => (
                          <li
                            key={document.id}
                            className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2"
                          >
                            <div className="min-w-0">
                              <button
                                type="button"
                                onClick={() => void downloadCompanyDocument(document)}
                                className="block max-w-full truncate text-left text-sm font-medium text-cyan-200 hover:text-cyan-100"
                              >
                                {document.original_filename}
                              </button>
                              <p className="mt-1 text-xs text-slate-500">
                                {(document.file_size / (1024 * 1024)).toFixed(2)} MB · Saved locally for reference
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => void deleteCompanyDocument(document)}
                              className="shrink-0 rounded-md border border-red-900 px-2 py-1 text-xs text-red-300 hover:bg-red-950/40"
                            >
                              Delete
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950 p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                  Data Quality & Freshness
                </p>

                <div className="mt-4 space-y-3 text-sm">
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2">
                    <span className="text-slate-400">Company profile</span>
                    <span className="font-medium text-cyan-300">
                      {selectedCompanySource}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2">
                    <span className="text-slate-400">Nodes</span>
                    <span className="font-medium text-emerald-300">{companyNodes.length}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2">
                    <span className="text-slate-400">Routes</span>
                    <span className="font-medium text-violet-300">{companyRoutes.length}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2">
                    <span className="text-slate-400">Node source mix</span>
                    <span className="font-medium text-amber-300">{nodeSourceSummary}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2">
                    <span className="text-slate-400">Route source mix</span>
                    <span className="font-medium text-orange-300">{routeSourceSummary}</span>
                  </div>
                </div>

                <div className="mt-5 border-t border-slate-800 pt-4">
                  <p className="text-sm font-semibold text-slate-200">
                    Completeness checks
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div className="rounded-lg bg-slate-900/70 p-3">
                      <p className="text-xs text-slate-500">Locations labeled</p>
                      <p className="mt-1 font-semibold text-slate-200">
                        {nodesWithLocation} / {companyNodes.length}
                      </p>
                    </div>
                    <div className="rounded-lg bg-slate-900/70 p-3">
                      <p className="text-xs text-slate-500">Capacity recorded</p>
                      <p className="mt-1 font-semibold text-slate-200">
                        {nodesWithCapacity} / {capacityRelevantNodes}
                      </p>
                    </div>
                    <div className="rounded-lg bg-slate-900/70 p-3">
                      <p className="text-xs text-slate-500">Source references</p>
                      <p className="mt-1 font-semibold text-slate-200">
                        {nodesWithSourceReference} / {companyNodes.length} nodes
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {routesWithSourceReference} / {companyRoutes.length} routes
                      </p>
                    </div>
                    <div className="rounded-lg bg-slate-900/70 p-3">
                      <p className="text-xs text-slate-500">
                        Updated in last 30 days
                      </p>
                      <p className="mt-1 font-semibold text-slate-200">
                        {recentlyUpdatedRecords === null
                          ? "Checking..."
                          : `${recentlyUpdatedRecords} / ${trackedOperationalRecords.length}`}
                      </p>
                      {staleRecords !== null && staleRecords > 0 && (
                        <p className="mt-1 text-xs text-amber-300">
                          {staleRecords} tracked record(s) older than 30 days
                        </p>
                      )}
                    </div>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-slate-500">
                    {latestRecordedUpdate
                      ? `Latest tracked change: ${latestRecordedUpdate.replace("T", " ").slice(0, 16)}.`
                      : trackedOperationalRecords.length > 0
                        ? "Existing records have no historical update timestamp."
                        : "Add or import operational records to see completeness and freshness."}
                    {recordsWithoutTimestamp > 0 &&
                      ` ${recordsWithoutTimestamp} record(s) have unknown freshness until edited or re-imported.`}
                    {" "}These checks measure record completeness and update recency, not whether values are verified or accurate.
                  </p>
                </div>
              </div>
            </div>

            <section
              aria-labelledby="simulation-readiness-heading"
              className="mt-5 rounded-2xl border border-slate-700 bg-slate-950 p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-400">
                    Before you simulate
                  </p>
                  <h4
                    id="simulation-readiness-heading"
                    className="mt-1 text-lg font-semibold text-white"
                  >
                    Operational Data Readiness
                  </h4>
                  <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-400">
                    Check that your network is connected and review important assumptions before using results for planning.
                  </p>
                </div>
                <span
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                    simulationReadiness === "Blocked"
                      ? "border-red-800 bg-red-950/50 text-red-300"
                      : simulationReadiness === "Review recommended"
                        ? "border-amber-800 bg-amber-950/50 text-amber-200"
                        : "border-emerald-800 bg-emerald-950/50 text-emerald-300"
                  }`}
                >
                  {simulationReadiness}
                </span>
              </div>

              <ul className="mt-4 grid gap-3 md:grid-cols-2">
                {readinessChecks.map((check) => {
                  const statusLabel =
                    check.status === "blocked"
                      ? "Action required"
                      : check.status === "attention"
                        ? "Review"
                        : "Passed";
                  const statusStyle =
                    check.status === "blocked"
                      ? "text-red-300"
                      : check.status === "attention"
                        ? "text-amber-200"
                        : "text-emerald-300";

                  return (
                    <li
                      key={check.label}
                      className="rounded-xl border border-slate-800 bg-slate-900/70 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-medium text-slate-200">
                          {check.label}
                        </p>
                        <span className={`shrink-0 text-xs font-semibold ${statusStyle}`}>
                          {statusLabel}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-5 text-slate-400">
                        {check.detail}
                      </p>
                    </li>
                  );
                })}
              </ul>

              <section
                aria-labelledby="data-quality-actions-heading"
                className="mt-5 rounded-xl border border-amber-900/70 bg-amber-950/10 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h5
                      id="data-quality-actions-heading"
                      className="font-semibold text-amber-100"
                    >
                      Data Quality Action Center
                    </h5>
                    <p className="mt-1 text-sm text-slate-400">
                      Review missing, stale, or structurally invalid records. Saving an edit refreshes these checks.
                    </p>
                  </div>
                  <span className="rounded-full border border-amber-800 bg-amber-950/50 px-3 py-1 text-xs font-semibold text-amber-200">
                    {dataQualityActions.length} action
                    {dataQualityActions.length === 1 ? "" : "s"}
                  </span>
                </div>

                {hasSyntheticOperationalData && (
                  <p className="mt-3 rounded-lg border border-orange-900/70 bg-orange-950/30 p-3 text-xs leading-5 text-orange-200">
                    This is a synthetic demo network. Its records and values are examples, not verified company data. Editing them does not make them operational records; use actual company data for planning.
                  </p>
                )}

                {dataQualityActions.length > 0 ? (
                  <ul className="mt-3 space-y-2">
                    {dataQualityActions.map((action) => (
                      <li
                        key={action.key}
                        className="flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-950/80 p-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                            {action.recordType}
                          </p>
                          <p className="mt-0.5 truncate text-sm font-medium text-slate-200">
                            {action.recordName}
                          </p>
                          <p className="mt-1 text-sm text-amber-100/90">
                            {action.detail}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            if (action.node) {
                              beginNodeEdit(action.node);
                              requestAnimationFrame(() =>
                                document
                                  .getElementById("node-editor")
                                  ?.scrollIntoView({
                                    behavior: "smooth",
                                    block: "center",
                                  })
                              );
                            } else if (action.route) {
                              beginRouteEdit(action.route);
                              requestAnimationFrame(() =>
                                document
                                  .getElementById("route-editor")
                                  ?.scrollIntoView({
                                    behavior: "smooth",
                                    block: "center",
                                  })
                              );
                            }
                          }}
                          className="shrink-0 rounded-lg border border-cyan-800 px-3 py-2 text-sm font-medium text-cyan-200 transition hover:border-cyan-500 hover:bg-cyan-950/40"
                        >
                          Review record
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={`mt-3 rounded-lg border p-3 text-sm leading-6 ${
                    hasSyntheticOperationalData
                      ? "border-amber-900/70 bg-amber-950/20 text-amber-200"
                      : "border-emerald-900/70 bg-emerald-950/20 text-emerald-200"
                  }`}>
                    {hasSyntheticOperationalData
                      ? "No missing required fields were detected in these demo records. This is a completeness check only; the synthetic values are still examples and are not verified company data."
                      : "No missing required fields were detected. This checks completeness only; verify data accuracy and provenance with the record owners."}
                  </p>
                )}
              </section>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-4">
                <p className="max-w-3xl text-xs leading-5 text-slate-500">
                  A passed check confirms basic network structure and populated fields only. It does not verify that the data is accurate, current, or approved for operational decisions.
                </p>
                <a
                  href="#operational-dataset"
                  className="whitespace-nowrap rounded-lg border border-cyan-800 px-3 py-2 text-sm font-medium text-cyan-200 transition hover:border-cyan-500 hover:bg-cyan-950/40"
                >
                  Review or update data
                </a>
              </div>
            </section>

            <CompanyEndToEndFlow
              key={selectedCompanyId}
              companyName={selectedCompany?.name ?? `Company ${selectedCompanyId}`}
              businessType={selectedCompany?.business_type}
              workflow={selectedCompany?.end_to_end_workflow}
              isSynthetic={hasSyntheticOperationalData}
              nodes={companyNodes}
              routes={companyRoutes}
            />

            <SupplierScorecards
              key={`supplier-scorecards-${selectedCompanyId}`}
              companyId={selectedCompanyId}
              nodes={companyNodes}
              canEdit={
                selectedCompany?.role === "owner" ||
                selectedCompany?.role === "editor"
              }
              onCreateAction={(recommendation) =>
                setAlertToTrack({ id: Date.now(), recommendation })
              }
            />

            <div id="control-tower">
              <ControlTower
                key={`control-tower-${selectedCompanyId}`}
                companyId={selectedCompanyId}
                alertToTrack={alertToTrack}
                onAlertHandled={() => setAlertToTrack(null)}
                simulation={controlTowerSimulation}
              />
            </div>

            <p className="mt-4 text-sm text-slate-400">
              If the selected company has no supply-chain dataset, choose one of these options.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <a
                href={`${API_URL}/public-directory/excel-template`}
                className="rounded-xl border border-slate-700 bg-slate-950 p-4 transition hover:border-cyan-500"
              >
                <p className="font-semibold text-cyan-300">
                  Download Excel Template
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Get the required Nodes and Routes columns with field instructions.
                </p>
              </a>

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
                  Choose Excel Workbook
                </p>

                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Preview and validate Nodes and Routes before importing.
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

            {excelPreview && (
              <div className="mt-5 rounded-xl border border-slate-700 bg-slate-950 p-5">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                  <div>
                    <h4 className="font-semibold text-white">
                      Workbook preview: {excelPreview.filename}
                    </h4>
                    <p className="mt-1 text-sm text-slate-400">
                      {excelPreview.nodes_count} nodes · {excelPreview.routes_count} routes
                    </p>
                  </div>
                  <span className={`w-fit rounded-full border px-3 py-1 text-xs font-semibold ${excelPreview.valid ? "border-emerald-700 bg-emerald-950/40 text-emerald-300" : "border-red-800 bg-red-950/40 text-red-300"}`}>
                    {excelPreview.valid ? "READY TO IMPORT" : "FIX ERRORS FIRST"}
                  </span>
                </div>

                {excelPreview.errors.length > 0 && (
                  <div className="mt-4 rounded-xl border border-red-900 bg-red-950/30 p-4">
                    <p className="font-semibold text-red-300">
                      Validation issues
                    </p>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-red-200">
                      {excelPreview.errors.map((issue, index) => (
                        <li key={`${index}-${issue}`}>{issue}</li>
                      ))}
                    </ul>
                    <p className="mt-3 text-xs text-red-200/80">
                      Nothing has been imported. Correct the workbook and choose it again.
                    </p>
                  </div>
                )}

                {excelPreview.valid && (
                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <div className="overflow-x-auto rounded-xl border border-slate-800">
                      <p className="border-b border-slate-800 px-3 py-2 text-xs font-semibold uppercase text-slate-400">
                        Nodes preview
                      </p>
                      <table className="w-full text-left text-xs">
                        <thead className="text-slate-500">
                          <tr>
                            <th className="px-3 py-2">Code</th>
                            <th className="px-3 py-2">Name</th>
                            <th className="px-3 py-2">Type</th>
                          </tr>
                        </thead>
                        <tbody>
                          {excelPreview.nodes_preview.map((node) => (
                            <tr key={node.code} className="border-t border-slate-800">
                              <td className="px-3 py-2">{node.code}</td>
                              <td className="px-3 py-2">{node.name}</td>
                              <td className="px-3 py-2">{node.node_type}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-slate-800">
                      <p className="border-b border-slate-800 px-3 py-2 text-xs font-semibold uppercase text-slate-400">
                        Routes preview
                      </p>
                      <table className="w-full text-left text-xs">
                        <thead className="text-slate-500">
                          <tr>
                            <th className="px-3 py-2">From</th>
                            <th className="px-3 py-2">To</th>
                            <th className="px-3 py-2">Mode</th>
                            <th className="px-3 py-2">Days</th>
                          </tr>
                        </thead>
                        <tbody>
                          {excelPreview.routes_preview.map((route, index) => (
                            <tr key={`${route.source_code}-${route.destination_code}-${index}`} className="border-t border-slate-800">
                              <td className="px-3 py-2">{route.source_code}</td>
                              <td className="px-3 py-2">{route.destination_code}</td>
                              <td className="px-3 py-2">{route.transport_mode}</td>
                              <td className="px-3 py-2">{route.lead_time_days}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    onClick={() => void confirmExcelImport()}
                    disabled={!excelPreview.valid || pendingExcelCompanyId !== selectedCompanyId || companyActionLoading === "excel"}
                    className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {companyActionLoading === "excel" ? "Importing..." : "Confirm and Import"}
                  </button>
                  <button
                    onClick={() => {
                      setExcelPreview(null);
                      setPendingExcelFile(null);
                      setPendingExcelCompanyId(null);
                      setCompanyActionMessage("");
                      setCompanyActionError("");
                    }}
                    disabled={companyActionLoading === "excel"}
                    className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="mt-7 border-t border-slate-800 pt-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 id="operational-dataset" className="text-lg font-semibold">
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

            {hasSyntheticOperationalData && (
              <div className="mt-4 rounded-xl border border-amber-800 bg-amber-950/30 p-4 text-sm text-amber-200">
                {networkMessage ||
                  `This workspace contains synthetic demo values. Simulation results are examples, not verified operational data for ${selectedCompany?.name ?? "this company"}.`}
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
              (companyNodes.length === 0 ||
                companyRoutes.length === 0) && (
                <div className="mt-5 rounded-xl border border-amber-900 bg-amber-950/20 p-5">
                  <p className="font-semibold text-amber-300">
                    {companyNodes.length === 0
                      ? "This workspace has no operational supply-chain data yet."
                      : "This workspace has nodes but no supply-chain routes yet."}
                  </p>

                  <p className="mt-2 text-sm text-slate-400">
                    Company directory results and public imports provide company profile details, not verified suppliers, facilities, routes, inventory, or demand. This workspace is missing operational data. Add the company&apos;s real data manually or upload a workbook with Nodes and Routes sheets; any demo values are labeled synthetic and are for testing only.
                  </p>
                </div>
              )}

            {selectedCompany?.requires_manual_network_setup && (
              <section
                aria-labelledby="network-workflow-heading"
                className="mt-5 rounded-2xl border border-cyan-900/70 bg-cyan-950/10 p-5"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-400">
                      Workspace setup
                    </p>
                    <h4
                      id="network-workflow-heading"
                      className="mt-1 text-lg font-semibold text-white"
                    >
                      Build the end-to-end supply-chain workflow
                    </h4>
                    <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-400">
                      Add your real facilities in the order that fits your business, including ports where relevant, then connect each step with routes from suppliers to customers. No demo locations or route values are created for this workspace.
                    </p>
                  </div>
                  <span className="whitespace-nowrap rounded-full border border-cyan-800 bg-cyan-950/40 px-3 py-1 text-xs font-semibold text-cyan-200">
                    Base:{" "}
                    {[selectedCompany.city, selectedCompany.country]
                      .filter(Boolean)
                      .join(", ") || "Location not set"}
                  </span>
                </div>

                <ol className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    {
                      label: "Company base",
                      detail:
                        selectedCompany.country || selectedCompany.city
                          ? [selectedCompany.city, selectedCompany.country]
                              .filter(Boolean)
                              .join(", ")
                          : "Add workspace country and city",
                      complete: Boolean(selectedCompany.country),
                    },
                    {
                      label: "Suppliers",
                      detail: `${companyNodes.filter((node) => node.node_type.toUpperCase() === "SUPPLIER").length} added`,
                      complete: companyNodes.some(
                        (node) => node.node_type.toUpperCase() === "SUPPLIER"
                      ),
                    },
                    {
                      label: "Plants",
                      detail: `${companyNodes.filter((node) => node.node_type.toUpperCase() === "PLANT").length} added · if applicable`,
                      complete: companyNodes.some(
                        (node) => node.node_type.toUpperCase() === "PLANT"
                      ),
                      optional: true,
                    },
                    {
                      label: "Ports",
                      detail: `${companyNodes.filter((node) => node.node_type.toUpperCase() === "PORT").length} added · if applicable`,
                      complete: companyNodes.some(
                        (node) => node.node_type.toUpperCase() === "PORT"
                      ),
                      optional: true,
                    },
                    {
                      label: "Warehouses / distribution",
                      detail: `${companyNodes.filter((node) => ["WAREHOUSE", "DISTRIBUTION_CENTER"].includes(node.node_type.toUpperCase())).length} added`,
                      complete: companyNodes.some((node) =>
                        ["WAREHOUSE", "DISTRIBUTION_CENTER"].includes(
                          node.node_type.toUpperCase()
                        )
                      ),
                    },
                    {
                      label: "Customers",
                      detail: `${companyNodes.filter((node) => node.node_type.toUpperCase() === "CUSTOMER").length} added`,
                      complete: companyNodes.some(
                        (node) => node.node_type.toUpperCase() === "CUSTOMER"
                      ),
                    },
                    {
                      label: "Connected routes",
                      detail:
                        activeCustomers.length > 0 &&
                        reachableCustomers.length === activeCustomers.length
                          ? `${validActiveRoutes.length} route(s) · all active customers reachable`
                          : `${validActiveRoutes.length} route(s) · connect suppliers through to customers`,
                      complete:
                        activeCustomers.length > 0 &&
                        reachableCustomers.length === activeCustomers.length,
                    },
                  ].map((step, index) => (
                    <li
                      key={step.label}
                      className="rounded-lg border border-slate-800 bg-slate-950/70 p-3"
                    >
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Step {index + 1}
                      </p>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-200">
                          {step.label}
                        </p>
                        <span
                          className={`text-xs font-medium ${
                            step.complete
                              ? "text-emerald-300"
                                : step.optional
                                  ? "text-slate-400"
                                  : "text-amber-200"
                          }`}
                        >
                          {step.complete
                            ? "Added"
                            : step.optional
                              ? "Optional"
                              : "To do"}
                        </span>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-slate-400">
                        {step.detail}
                      </p>
                    </li>
                  ))}
                </ol>

                <div className="mt-4 flex flex-wrap gap-2">
                  {[
                    ["SUPPLIER", "Add supplier"],
                    ["PLANT", "Add plant"],
                    ["PORT", "Add port"],
                    ["WAREHOUSE", "Add warehouse"],
                    ["DISTRIBUTION_CENTER", "Add distribution centre"],
                    ["CUSTOMER", "Add customer"],
                  ].map(([nodeType, label]) => (
                    <button
                      key={nodeType}
                      type="button"
                      onClick={() => beginWorkflowNode(nodeType)}
                      className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-medium text-slate-200 transition hover:border-emerald-600 hover:text-emerald-200"
                    >
                      {label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={beginWorkflowRoute}
                    disabled={companyNodes.length < 2}
                    className="rounded-lg bg-cyan-500 px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Add route
                  </button>
                </div>
                <p className="mt-3 text-xs leading-5 text-slate-500">
                  Add only stages that exist in your real network. A route must connect locations in this workspace; check Operational Data Readiness to confirm the supplier-to-customer path before simulating.
                </p>
              </section>
            )}

            {showAddNode && (
              <div
                id="node-editor"
                className="mt-6 rounded-xl border border-emerald-900 bg-emerald-950/10 p-5"
              >
                <h4 className="font-semibold text-emerald-300">
                  {editingNodeId !== null ? "Edit Location" : "Add Node"}
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

                  <input
                    value={newNodeSourceUrl}
                    onChange={(event) =>
                      setNewNodeSourceUrl(event.target.value)
                    }
                    placeholder="Source reference (URL or document ID)"
                    aria-label="Node source reference"
                    className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
                  />
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  Add a source link for traceability. A link does not independently verify the data. Existing provenance labels are preserved when editing.
                </p>

                {nodeSaveError && (
                  <p className="mt-3 text-sm text-red-300">
                    {nodeSaveError}
                  </p>
                )}

                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    onClick={saveNode}
                    disabled={nodeSaving}
                    className="rounded-xl bg-emerald-500 px-5 py-3 font-semibold text-slate-950 disabled:opacity-50"
                  >
                    {nodeSaving
                      ? "Saving..."
                      : editingNodeId !== null ? "Update Node" : "Save Node"}
                  </button>

                  {editingNodeId !== null && (
                    <button
                      type="button"
                      onClick={cancelNodeEdit}
                      className="rounded-xl border border-slate-700 bg-slate-900 px-5 py-3 font-semibold text-slate-200"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            )}

            {showAddRoute && (
              <div
                id="route-editor"
                className="mt-6 rounded-xl border border-cyan-900 bg-cyan-950/10 p-5"
              >
                <h4 className="font-semibold text-cyan-300">
                  {editingRouteId !== null ? "Edit Route" : "Add Route"}
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

                  <input
                    value={newRouteSourceReference}
                    onChange={(event) =>
                      setNewRouteSourceReference(event.target.value)
                    }
                    placeholder="Source reference (URL or document ID)"
                    aria-label="Route source reference"
                    className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
                  />
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  Add a source link or document identifier for traceability. A reference does not independently verify the data. Existing provenance labels are preserved when editing.
                </p>

                {routeSaveError && (
                  <p className="mt-3 text-sm text-red-300">
                    {routeSaveError}
                  </p>
                )}

                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    onClick={saveRoute}
                    disabled={routeSaving}
                    className="rounded-xl bg-cyan-500 px-5 py-3 font-semibold text-slate-950 disabled:opacity-50"
                  >
                    {routeSaving
                      ? "Saving..."
                      : editingRouteId !== null ? "Update Route" : "Save Route"}
                  </button>

                  {editingRouteId !== null && (
                    <button
                      type="button"
                      onClick={cancelRouteEdit}
                      className="rounded-xl border border-slate-700 bg-slate-900 px-5 py-3 font-semibold text-slate-200"
                    >
                      Cancel
                    </button>
                  )}
                </div>
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
                      <th className="px-3 py-2">
                        Source
                      </th>
                      <th className="px-3 py-2">
                        Actions
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
                          <td className="px-3 py-3">
                            <span
                              className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${SOURCE_BADGE_STYLES[normalizeSourceType(node.data_source_type)] ?? "border-slate-500/40 bg-slate-500/10 text-slate-200"}`}
                            >
                              {normalizeSourceType(node.data_source_type)}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => beginNodeEdit(node)}
                                className="rounded-lg border border-slate-600 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-200"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteNode(node.id)}
                                className="rounded-lg border border-red-700 bg-red-950/30 px-2.5 py-1.5 text-xs font-medium text-red-200"
                              >
                                Delete
                              </button>
                            </div>
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
                      <th className="px-3 py-2">
                        Source
                      </th>
                      <th className="px-3 py-2">
                        Actions
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
                            <td className="px-3 py-3">
                              <span
                                className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${SOURCE_BADGE_STYLES[normalizeSourceType(route.data_source_type)] ?? "border-slate-500/40 bg-slate-500/10 text-slate-200"}`}
                              >
                                {normalizeSourceType(route.data_source_type)}
                              </span>
                            </td>
                            <td className="px-3 py-3">
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => beginRouteEdit(route)}
                                  className="rounded-lg border border-slate-600 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-200"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => deleteRoute(route.id)}
                                  className="rounded-lg border border-red-700 bg-red-950/30 px-2.5 py-1.5 text-xs font-medium text-red-200"
                                >
                                  Delete
                                </button>
                              </div>
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
              scenario.trim().length === 0 ||
              networkLoading ||
              blockedReadinessChecks.length > 0
            }





            className="mt-4 rounded-xl bg-cyan-500 px-6 py-3 font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"





          >





            {loading





              ? "Running AI Simulation..."





              : "Run Simulation"}





          </button>

          {blockedReadinessChecks.length > 0 && (
            <p className="mt-3 text-sm text-amber-300">
              Resolve the blocked data-readiness checks above before running a simulation:{" "}
              {blockedReadinessChecks.map((check) => check.label).join("; ")}.
            </p>
          )}





          {error && (





            <div className="mt-4 rounded-xl border border-red-900 bg-red-950/40 p-4 text-red-300">





              {error}





            </div>





          )}



        </section>

        {/* RECENT SCENARIOS */}



        {(history.length > 0 || historyLoading || historyError) && (
          <section className="mb-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">

              <div>

                <h2 className="text-xl font-semibold">

                  Recent Scenarios

                </h2>



                <p className="mt-1 text-sm text-slate-400">
                  Reopen this company&apos;s latest saved simulations.
                </p>

                <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/70 px-3 py-1.5 text-xs text-slate-300">
                  <span className="h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.7)]" />
                  Decision support · review modeled results before acting
                </div>
              </div>



              {history.length > 0 && (
                <button
                  disabled={historyClearing}
                  onClick={async () => {
                    setHistoryClearing(true);
                    setHistoryError("");
                    try {
                      const response = await fetch(
                        `${API_URL}/companies/${selectedCompanyId}/simulation-history`,
                        { method: "DELETE" }
                      );
                      const data = await response.json().catch(() => null);
                      if (!response.ok) {
                        throw new Error(
                          data?.detail || "Unable to clear simulation history."
                        );
                      }
                      setHistory([]);
                    } catch (clearError) {
                      setHistoryError(
                        clearError instanceof Error
                          ? clearError.message
                          : "Unable to clear simulation history."
                      );
                    } finally {
                      setHistoryClearing(false);
                    }
                  }}
                  className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:border-red-700 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {historyClearing ? "Clearing..." : "Clear History"}
                </button>
              )}

            </div>

            {historyLoading && (
              <p className="mt-4 text-sm text-slate-400">
                Loading saved simulation history...
              </p>
            )}

            {historyError && (
              <p className="mt-4 rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">
                {historyError}
              </p>
            )}


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

            <section             className="mb-8 overflow-hidden rounded-2xl border border-cyan-900/80 bg-gradient-to-br from-slate-900 via-slate-900 to-cyan-950/40 shadow-[0_24px_80px_rgba(8,145,178,0.06)]">
              <div className="border-b border-slate-800 px-6 py-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-400">
                      Executive Overview
                    </p>
                    <h2 className="mt-1 text-2xl font-semibold">
                      Simulation at a glance
                    </h2>
                  </div>
                  <span
                    className={`rounded-full border px-3 py-1 text-sm font-semibold ${
                      simulation.risk_level.toUpperCase() === "HIGH"
                        ? "border-red-700 bg-red-950/70 text-red-300"
                        : simulation.risk_level.toUpperCase() === "MEDIUM"
                          ? "border-amber-700 bg-amber-950/70 text-amber-300"
                          : "border-emerald-700 bg-emerald-950/70 text-emerald-300"
                    }`}
                  >
                    {simulation.risk_level} risk
                  </span>
                </div>
                <p className="mt-3 max-w-4xl leading-7 text-slate-300">
                  {result.ai_explanation.executive_summary}
                </p>
              </div>

              <div className="grid gap-px bg-slate-800 sm:grid-cols-2 xl:grid-cols-4">
                <div className="bg-slate-900/90 p-5">
                  <p className="text-sm text-slate-400">Route cost change</p>
                  <p className={`mt-2 text-2xl font-bold ${
                    simulation.cost_change_percent === null
                      ? "text-slate-200"
                      : simulation.cost_change_percent > 0
                        ? "text-rose-300"
                        : simulation.cost_change_percent < 0
                          ? "text-emerald-300"
                          : "text-slate-100"
                  }`}>
                    {simulation.cost_change_percent === null
                      ? "Unavailable"
                      : `${simulation.cost_change_percent > 0 ? "+" : ""}${simulation.cost_change_percent}%`}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {disrupted
                      ? `Baseline ${baseline?.total_cost.toLocaleString()} → disrupted ${disrupted.total_cost.toLocaleString()}`
                      : "No feasible disrupted route"}
                  </p>
                </div>
                <div className="bg-slate-900/90 p-5">
                  <p className="text-sm text-slate-400">Lead-time change</p>
                  <p className={`mt-2 text-2xl font-bold ${
                    simulation.delay_change_days === null
                      ? "text-slate-200"
                      : simulation.delay_change_days > 0
                        ? "text-amber-300"
                        : simulation.delay_change_days < 0
                          ? "text-emerald-300"
                          : "text-slate-100"
                  }`}>
                    {simulation.delay_change_days === null
                      ? "Unavailable"
                      : `${simulation.delay_change_days > 0 ? "+" : ""}${simulation.delay_change_days} days`}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {disrupted
                      ? `Disrupted route: ${disrupted.lead_time_days} days`
                      : "Alternative route unavailable"}
                  </p>
                </div>
                <div className="bg-slate-900/90 p-5">
                  <p className="text-sm text-slate-400">Locations at risk</p>
                  <p className={`mt-2 text-2xl font-bold ${
                    impactedNodeNames.length > 0
                      ? "text-rose-300"
                      : "text-emerald-300"
                  }`}>
                    {impactedNodeNames.length}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {impactedNodeNames.length > 0
                      ? `${stockoutImpacts.length} projected stockout(s) · up to ${longestShortageWindow.toFixed(1)} shortage days · ${impactedNodeNames.join(", ")}`
                      : "No projected stockout or safety-stock breach"}
                  </p>
                </div>
                <div className="bg-slate-900/90 p-5">
                  <p className="text-sm text-slate-400">
                    Emergency inventory
                  </p>
                  <p className={`mt-2 text-2xl font-bold ${
                    totalEmergencyInventory > 0
                      ? "text-amber-300"
                      : "text-emerald-300"
                  }`}>
                    {totalEmergencyInventory.toLocaleString()} units
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {mostExposedLocation
                      ? `Largest requirement: ${mostExposedLocation.node_name} (${mostExposedLocation.emergency_inventory_required.toLocaleString()} units)`
                      : "No emergency stock requirement"}
                  </p>
                </div>
              </div>

              <div className="grid gap-4 p-5 lg:grid-cols-3">
                <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Scenario disruption
                  </p>
                  <p className="mt-2 font-medium text-slate-200">
                    {disruptionSummary}
                  </p>
                  <p className="mt-1 text-sm text-slate-400">
                    Duration: {result.parsed_scenario.closure_duration_days} days
                  </p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Operational data confidence
                  </p>
                  <p
                    className={`mt-2 font-semibold ${
                      hasSyntheticOperationalData
                        ? "text-amber-300"
                        : "text-emerald-300"
                    }`}
                  >
                    {dataProvenanceSummary}
                  </p>
                  <p className="mt-1 text-sm text-slate-400">
                    {hasSyntheticOperationalData
                      ? "Illustrative results only; verify against company records."
                      : "Results reflect the data sources shown above; verify inputs before acting."}
                  </p>
                </div>
                <div className="rounded-xl border border-cyan-900/70 bg-cyan-950/20 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">
                    Recommended next action
                  </p>
                  <p className="mt-2 leading-6 text-slate-200">
                    {result.ai_explanation.recommended_actions[0] ??
                      "Review the detailed route and inventory results before acting."}
                  </p>
                </div>
              </div>
            </section>

            <section
              aria-labelledby="simulation-risk-alerts-heading"
              className="mb-8 rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">
                    Scenario-based · not live monitoring
                  </p>
                  <h2
                    id="simulation-risk-alerts-heading"
                    className="mt-2 text-xl font-semibold text-white"
                  >
                    Simulation Risk Alerts
                  </h2>
                  <p className="mt-1 text-sm text-slate-400">
                    Alerts are derived from this run&apos;s modeled results, not
                    real-time operational data.
                  </p>
                </div>
                <span className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-xs text-slate-300">
                  {simulationRiskAlerts.length}{" "}
                  {simulationRiskAlerts.length === 1 ? "alert" : "alerts"}
                </span>
              </div>

              {simulationRiskAlerts.length === 0 ? (
                <p className="mt-4 rounded-xl border border-emerald-900/70 bg-emerald-950/30 p-4 text-sm leading-6 text-emerald-200">
                  No alert thresholds were triggered by this simulation. This
                  does not confirm that the actual supply chain is risk-free.
                </p>
              ) : (
                <ul className="mt-4 grid gap-3">
                  {simulationRiskAlerts.map((alert) => (
                    <li
                      key={alert.id}
                      className={`flex flex-col gap-4 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between ${
                        alert.severity === "HIGH"
                          ? "border-red-900/80 bg-red-950/25"
                          : "border-amber-900/80 bg-amber-950/20"
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full border px-2.5 py-1 text-[10px] font-bold tracking-wider ${
                              alert.severity === "HIGH"
                                ? "border-red-700 text-red-300"
                                : "border-amber-700 text-amber-300"
                            }`}
                          >
                            {alert.severity}
                          </span>
                          <h3 className="font-semibold text-slate-100">
                            {alert.title}
                          </h3>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-slate-300">
                          {alert.detail}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setAlertToTrack({
                            id: Date.now(),
                            recommendation: `${alert.title}: ${alert.recommendation}`,
                          });
                          document
                            .getElementById("control-tower-heading")
                            ?.scrollIntoView({
                              behavior: "smooth",
                              block: "center",
                            });
                        }}
                        className="shrink-0 rounded-lg border border-cyan-700 bg-cyan-950/40 px-3 py-2 text-sm font-medium text-cyan-200 transition hover:border-cyan-500 hover:bg-cyan-900/40"
                      >
                        Track mitigation
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <p className="mt-3 text-xs leading-5 text-slate-500">
                Cost alerts use a 20% increase threshold, and delay alerts use
                3 additional days. These are review prompts, not operational
                limits or forecasts.
              </p>
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

      <div className="fixed bottom-4 right-4 z-[100] flex flex-col items-end gap-3">
        {assistantOpen && (
          <section
            role="dialog"
            aria-labelledby="supply-chain-agent-title"
            aria-modal="false"
            onKeyDown={(event) => {
              if (event.key === "Escape" && !event.nativeEvent.isComposing) {
                if (mediaRecorderRef.current?.state === "recording") {
                  mediaRecorderRef.current.stop();
                }
                setAssistantOpen(false);
              }
            }}
            className="flex max-h-[min(82dvh,44rem)] w-[calc(100vw-2rem)] max-w-[30rem] flex-col overflow-hidden rounded-2xl border border-cyan-800 bg-slate-950 shadow-2xl shadow-black/60"
          >
            <header className="flex items-start justify-between gap-3 border-b border-slate-800 bg-gradient-to-r from-slate-900 to-cyan-950/40 px-4 py-3">
              <div>
                <h2 id="supply-chain-agent-title" className="font-semibold text-white">
                  Supply Chain Agent
                </h2>
                <p className="mt-1 text-xs text-cyan-200">
                  Local-only · advisory · CPU replies may take a little longer
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (mediaRecorderRef.current?.state === "recording") {
                    mediaRecorderRef.current.stop();
                  }
                  setAssistantOpen(false);
                }}
                aria-label="Close Supply Chain Agent"
                className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                Close
              </button>
            </header>

            <div
              aria-live="polite"
              aria-relevant="additions text"
              aria-label="Agent conversation"
              role="log"
              className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4"
            >
              {assistantMessages.length === 0 && (
                <div className="space-y-3">
                  <p className="text-sm leading-6 text-slate-300">
                    Ask about this app, the selected network, or a supply-chain
                    question. The agent can suggest a location or route draft,
                    but it will never save changes without your review.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      "What does this demo do?",
                      "How do I test a disruption?",
                      "How do I add a real port?",
                    ].map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => void sendAssistantMessage(suggestion)}
                        disabled={assistantLoading}
                        className="rounded-full border border-slate-700 px-3 py-1.5 text-left text-xs text-slate-300 hover:border-cyan-600 hover:text-cyan-100 disabled:opacity-50"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {assistantMessages.map((message) => (
                <div
                  key={message.id}
                  className={`rounded-xl p-3 ${
                    message.role === "user"
                      ? "ml-6 bg-cyan-950/50 text-cyan-50"
                      : "mr-3 border border-slate-800 bg-slate-900 text-slate-200"
                  }`}
                >
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    {message.role === "user" ? "You" : "Agent · advisory"}
                  </p>
                  <p className="whitespace-pre-wrap text-sm leading-6">
                    {message.text}
                  </p>
                  {message.draft_node && (
                    <button
                      type="button"
                      onClick={() => reviewAssistantDraft(message)}
                      className="mt-3 rounded-lg border border-emerald-700 px-3 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-950/50"
                    >
                      Review location draft
                    </button>
                  )}
                  {message.draft_route && (
                    <button
                      type="button"
                      onClick={() => reviewAssistantDraft(message)}
                      className="mt-3 rounded-lg border border-cyan-700 px-3 py-2 text-xs font-semibold text-cyan-200 hover:bg-cyan-950/50"
                    >
                      Review route draft
                    </button>
                  )}
                </div>
              ))}
              {assistantLoading && (
                <div
                  className="mr-8 rounded-xl border border-cyan-900/70 bg-slate-900 p-3"
                  role="status"
                  aria-live="polite"
                >
                  <div className="flex items-center gap-2 text-xs font-semibold text-cyan-200">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-cyan-950">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-300" />
                    </span>
                    Thinking locally
                    <span className="ml-auto tabular-nums text-slate-400">
                      {assistantElapsedSeconds}s
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-300">
                    {assistantElapsedSeconds < 10
                      ? "Preparing your answer with the local model."
                      : assistantElapsedSeconds < 30
                        ? "The local model is generating your answer. This can take a little longer on CPU."
                        : assistantElapsedSeconds < 60
                          ? "Still working locally. Your question is being processed; you can keep this panel open."
                          : "This is taking longer than usual for local CPU inference. If it times out, your question will be restored so you can retry."}
                  </p>
                  <div
                    className="mt-3 h-1 overflow-hidden rounded-full bg-slate-800"
                    aria-hidden="true"
                  >
                    <div className="h-full w-2/5 animate-[assistant-progress_1.8s_ease-in-out_infinite] rounded-full bg-cyan-400" />
                  </div>
                </div>
              )}
              {assistantError && (
                <div
                  role="alert"
                  className="rounded-lg border border-red-900 bg-red-950/40 p-3 text-xs leading-5 text-red-200"
                >
                  <p>{assistantError}</p>
                  {assistantError.includes("taking longer than expected") && (
                    <button
                      type="button"
                      onClick={() => void sendAssistantMessage()}
                      disabled={assistantLoading || !assistantInput.trim()}
                      className="mt-2 rounded-lg border border-red-700 px-3 py-1.5 font-semibold text-red-100 transition hover:bg-red-950 disabled:opacity-50"
                    >
                      Retry answer
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="border-t border-slate-800 p-3">
              <p className="mb-2 text-[11px] leading-4 text-slate-500">
                Microphone audio is sent only to this computer&apos;s local
                Whisper service. Chat stays on local Ollama. Check all advice
                and data drafts before acting.
              </p>
              {assistantVoiceMessage && (
                <p className="mb-2 text-xs text-emerald-300" role="status">
                  {assistantVoiceMessage}
                </p>
              )}
              {assistantTranscribing && (
                <p className="mb-2 text-xs text-cyan-200" role="status">
                  Transcribing locally...
                </p>
              )}
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void sendAssistantMessage();
                }}
                className="space-y-2"
              >
                <textarea
                  value={assistantInput}
                  onChange={(event) => setAssistantInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter" &&
                      !event.shiftKey &&
                      !event.nativeEvent.isComposing
                    ) {
                      event.preventDefault();
                      void sendAssistantMessage();
                    }
                  }}
                  maxLength={2000}
                  rows={2}
                  placeholder="Ask anything about the app or supply chain..."
                  aria-label="Message the Supply Chain Agent"
                  aria-describedby="assistant-input-count"
                  className="w-full resize-y rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                />
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => void toggleAssistantRecording()}
                    disabled={assistantTranscribing}
                    aria-pressed={assistantListening}
                    className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
                      assistantListening
                        ? "border-red-700 bg-red-950/50 text-red-200"
                        : "border-slate-700 text-slate-200 hover:border-cyan-700"
                    } disabled:opacity-50`}
                  >
                    {assistantListening
                      ? "Stop recording"
                      : "Record voice locally"}
                  </button>
                  <span
                    id="assistant-input-count"
                    className="text-[10px] tabular-nums text-slate-500"
                  >
                    {assistantInput.length}/2000
                  </span>
                  <button
                    type="submit"
                    disabled={
                      assistantLoading ||
                      assistantTranscribing ||
                      !assistantInput.trim()
                    }
                    className="rounded-lg bg-cyan-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Ask Agent
                  </button>
                </div>
              </form>
            </div>
          </section>
        )}
        <button
          type="button"
          onClick={() => {
            if (assistantOpen && mediaRecorderRef.current?.state === "recording") {
              mediaRecorderRef.current.stop();
            }
            setAssistantOpen((open) => !open);
          }}
          aria-expanded={assistantOpen}
          aria-label={assistantOpen ? "Close Supply Chain Agent" : "Open Supply Chain Agent"}
          className="flex items-center gap-2 rounded-full border border-cyan-300/60 bg-cyan-400 px-5 py-3 font-semibold text-slate-950 shadow-xl shadow-cyan-950/50 transition hover:-translate-y-0.5 hover:bg-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
        >
          <span aria-hidden="true">✦</span>
          {assistantOpen ? "Hide Agent" : "Ask Supply Chain Agent"}
        </button>
      </div>

    </main>





  );





}