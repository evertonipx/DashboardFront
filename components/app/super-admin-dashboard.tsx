"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  Building2,
  Camera as CameraIcon,
  CheckCircle2,
  CircuitBoard,
  Edit,
  ListChecks,
  MapPinned,
  Network,
  Settings2,
  Plus,
  RefreshCw,
  Save,
  ServerCog,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/components/app/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError, apiFetch } from "@/lib/api";
import { buildCompanyUserProfileUpdate } from "@/lib/company-user-profile-update";
import {
  normalizeCompanyRecord,
  resolveCompanyRecordTimeZone,
  writeCompanyCache,
} from "@/lib/company-cache";
import { canonicalCompanyTimeZone } from "@/lib/company-time-zone";
import {
  clearStoredMasterCompanyScope,
  getCompanyTimeZoneResolutionForScope,
  getCurrentUserCompanyId,
  getScopedRowCompanyId,
  getStoredMasterCompanyScope,
  setStoredMasterCompanyScope,
} from "@/lib/master-company-scope";
import {
  requireCameraRows,
  requireInfrastructureRelations,
  requireLocationRows,
  requireSubLocationRows,
  requireWorkerRows,
} from "@/lib/metadata-validation";
import { requireOccupancyScenarioRows } from "@/lib/occupancy-validation";
import {
  OPERATIONAL_PERMISSIONS,
  type OperationalPermissionDefinition,
} from "@/lib/permissions";
import { requireScenarioRows } from "@/lib/scenario-validation";
import type {
  Camera,
  Location,
  Permission,
  SubLocation,
  UserPermission,
  Worker,
} from "@/lib/types";
import { cn, formatDateTime, formatNumber } from "@/lib/utils";
import { getWorkerDisplayInfo } from "@/lib/worker-display";
import {
  collapseWorkerIdentityChains,
  partitionWorkersByCompanyScope,
  resolveWorkerCompanyId,
  sortWorkersByActivity,
  workersFromExplicitCompanyScope,
  workerScopeDisplay,
  type WorkerScopeRow,
} from "@/lib/worker-scope";

type Company = {
  id: string;
  name: string;
  trade_name?: string | null;
  cnpj?: string | null;
  plan?: string | null;
  timezone?: string | null;
  user_limit?: number | null;
  active: boolean;
  created_at?: string;
  updated_at?: string;
};

type ManagedUser = {
  id: string;
  company_id?: string;
  name: string;
  email: string;
  is_master: boolean;
  active: boolean;
  created_at?: string;
  updated_at?: string;
};

type IpxModule = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  icon?: string | null;
  active: boolean;
};

type CompanyModule = {
  id: string;
  company_id: string;
  module_id: string;
  enabled: boolean;
  module?: IpxModule | null;
};

type CompanyFormState = {
  name: string;
  trade_name: string;
  cnpj: string;
  plan: string;
  timezone: string;
  user_limit: string;
  active: string;
};

type UserFormState = {
  name: string;
  email: string;
  password: string;
  active: string;
  isMaster: boolean;
  isCompanyAdmin: boolean;
};

type PermissionGroup = {
  key: string;
  name: string;
  permissions: PermissionOption[];
};

type PermissionOption = {
  id: string;
  module_id?: string;
  slug: string;
  label: string;
  description: string;
  slugs: string[];
  grants: PermissionGrantOption[];
  unavailable?: boolean;
};

type PermissionGrantOption = {
  id: string;
  module_id?: string;
  slug: string;
};

type WorkerRow = WorkerScopeRow;

type CompanyTab = "users" | "workers" | "modules" | "masters";

type CompanyAdministrativeResource = "users" | "modules";

type CompanyAdministrativeIssue = {
  resource: CompanyAdministrativeResource;
  label: string;
  message: string;
};

type CompanyOperationalResource =
  | "workers"
  | "locations"
  | "subLocations"
  | "cameras"
  | "countingScenarios"
  | "occupancyScenarios"
  | "infrastructure";

type CompanyOperationalIssue = {
  resource: CompanyOperationalResource;
  label: string;
  message: string;
};

type CompanyOperationalStats = {
  algorithms: number | null;
  workers: number | null;
  cameras: number | null;
  locations: number | null;
  subLocations: number | null;
  countingScenarios: number | null;
  occupancyScenarios: number | null;
};

const emptyCompanyForm: CompanyFormState = {
  name: "",
  trade_name: "",
  cnpj: "",
  plan: "pro",
  timezone: "America/Sao_Paulo",
  user_limit: "10",
  active: "true",
};

const emptyUserForm: UserFormState = {
  name: "",
  email: "",
  password: "",
  active: "true",
  isMaster: false,
  isCompanyAdmin: false,
};

const planLabels: Record<string, string> = {
  basic: "Basic",
  pro: "Pro",
  enterprise: "Enterprise",
};

type AlgorithmModuleFamily = "counting" | "occupancy";

const algorithmModuleDefinitions: Array<{
  aliases: readonly string[];
  family: AlgorithmModuleFamily;
  label: string;
}> = [
  {
    aliases: [
      "counting",
      "count",
      "people counting",
      "people count",
      "person counting",
      "person count",
      "contagem",
      "contagem pessoas",
      "contagem de pessoas",
    ],
    family: "counting",
    label: "Contagem",
  },
  {
    aliases: [
      "occupancy",
      "people occupancy",
      "area occupancy",
      "ocupacao",
      "ocupacao pessoas",
      "ocupacao de pessoas",
      "ocupacao por area",
    ],
    family: "occupancy",
    label: "Ocupação",
  },
];

export function SuperAdminDashboard() {
  const router = useRouter();
  const { user: currentUser } = useAuth();
  const [companies, setCompanies] = React.useState<Company[]>([]);
  const [users, setUsers] = React.useState<ManagedUser[]>([]);
  const [masterUsers, setMasterUsers] = React.useState<ManagedUser[]>([]);
  const [workers, setWorkers] = React.useState<Worker[]>([]);
  const [modules, setModules] = React.useState<IpxModule[]>([]);
  const [companyModules, setCompanyModules] = React.useState<CompanyModule[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = React.useState("");
  const [activeCompanyTab, setActiveCompanyTab] =
    React.useState<CompanyTab>("users");
  const [companyQuery, setCompanyQuery] = React.useState("");
  const [userQuery, setUserQuery] = React.useState("");
  const [masterUserQuery, setMasterUserQuery] = React.useState("");
  const [companyStats, setCompanyStats] =
    React.useState<CompanyOperationalStats | null>(null);
  const [companyUsersCount, setCompanyUsersCount] = React.useState<number | null>(
    null,
  );
  const [companyAdministrativeIssues, setCompanyAdministrativeIssues] =
    React.useState<CompanyAdministrativeIssue[]>([]);
  const [companyOperationalIssues, setCompanyOperationalIssues] = React.useState<
    CompanyOperationalIssue[]
  >([]);
  const [loading, setLoading] = React.useState(true);
  const [loadingDetails, setLoadingDetails] = React.useState(false);
  const [loadingOperationalDetails, setLoadingOperationalDetails] =
    React.useState(false);
  const [companyDialog, setCompanyDialog] = React.useState(false);
  const [userDialog, setUserDialog] = React.useState(false);
  const [masterUserDialog, setMasterUserDialog] = React.useState(false);
  const [editingCompany, setEditingCompany] = React.useState<Company | null>(null);
  const [editingUser, setEditingUser] = React.useState<ManagedUser | null>(null);
  const [editingMasterUser, setEditingMasterUser] =
    React.useState<ManagedUser | null>(null);
  const [companyForm, setCompanyForm] =
    React.useState<CompanyFormState>(emptyCompanyForm);
  const [userForm, setUserForm] = React.useState<UserFormState>(emptyUserForm);
  const [masterUserForm, setMasterUserForm] =
    React.useState<UserFormState>(emptyUserForm);
  const [permissionCatalog, setPermissionCatalog] = React.useState<Permission[]>([]);
  const [userPermissions, setUserPermissions] = React.useState<Record<string, boolean>>(
    {},
  );
  const [loadingUserPermissions, setLoadingUserPermissions] =
    React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [deletingCompanyId, setDeletingCompanyId] = React.useState("");
  const [deletingUserId, setDeletingUserId] = React.useState("");
  const [updatingModuleId, setUpdatingModuleId] = React.useState("");
  const [workerScopeWarning, setWorkerScopeWarning] = React.useState("");
  const [loadedCompanyId, setLoadedCompanyId] = React.useState("");
  const companyDetailsRequestSequenceRef = React.useRef(0);
  const selectedCompanyIdRef = React.useRef(selectedCompanyId);
  const userPermissionRequestSequenceRef = React.useRef(0);
  const userPermissionRequestContextRef = React.useRef<{
    companyId: string;
    userId: string;
  } | null>(null);

  const invalidateUserPermissionRequest = React.useCallback(
    ({ closeDialog = false }: { closeDialog?: boolean } = {}) => {
      userPermissionRequestSequenceRef.current += 1;
      userPermissionRequestContextRef.current = null;
      setLoadingUserPermissions(false);
      setUserPermissions({});

      if (closeDialog) {
        setUserDialog(false);
        setEditingUser(null);
      }
    },
    [],
  );

  const closeUserDialog = React.useCallback(() => {
    invalidateUserPermissionRequest({ closeDialog: true });
  }, [invalidateUserPermissionRequest]);

  const clearCompanyDetailsState = React.useCallback(
    (loadingCompanyDetails = false) => {
      setLoadedCompanyId("");
      setUsers([]);
      setCompanyUsersCount(null);
      setCompanyModules([]);
      setWorkers([]);
      setCompanyStats(null);
      setCompanyAdministrativeIssues([]);
      setCompanyOperationalIssues([]);
      setWorkerScopeWarning("");
      setLoadingDetails(loadingCompanyDetails);
      setLoadingOperationalDetails(loadingCompanyDetails);
    },
    [],
  );

  const handleUserDialogOpenChange = React.useCallback(
    (open: boolean) => {
      if (open) {
        setUserDialog(true);
        return;
      }

      closeUserDialog();
    },
    [closeUserDialog],
  );

  const selectCompanyId = React.useCallback(
    (companyId: string) => {
      const nextCompanyId = companyId.trim();
      if (selectedCompanyIdRef.current === nextCompanyId) return;

      selectedCompanyIdRef.current = nextCompanyId;
      companyDetailsRequestSequenceRef.current += 1;
      invalidateUserPermissionRequest({ closeDialog: true });
      clearCompanyDetailsState(Boolean(nextCompanyId));
      setSelectedCompanyId(nextCompanyId);
    },
    [clearCompanyDetailsState, invalidateUserPermissionRequest],
  );

  const canPublishCompanyDetails = React.useCallback(
    (requestSequence: number, companyId: string) =>
      requestSequence === companyDetailsRequestSequenceRef.current &&
      selectedCompanyIdRef.current === companyId,
    [],
  );

  const selectedCompany = React.useMemo(
    () => companies.find((company) => company.id === selectedCompanyId) ?? null,
    [companies, selectedCompanyId],
  );

  const filteredCompanies = React.useMemo(() => {
    const query = companyQuery.trim().toLowerCase();
    if (!query) return companies;

    return companies.filter((company) =>
      [company.name, company.trade_name, company.cnpj, company.plan]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [companies, companyQuery]);

  const filteredUsers = React.useMemo(() => {
    const query = userQuery.trim().toLowerCase();
    if (!query) return users;

    return users.filter((user) =>
      [user.name, user.email]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [userQuery, users]);

  const filteredMasterUsers = React.useMemo(() => {
    const query = masterUserQuery.trim().toLowerCase();
    if (!query) return masterUsers;

    return masterUsers.filter((user) =>
      [user.name, user.email]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [masterUserQuery, masterUsers]);

  const visibleModules = React.useMemo(
    () => selectVisibleAlgorithmModules(modules),
    [modules],
  );

  const operationalPermissionOptions = React.useMemo(
    () => resolveOperationalPermissionOptions(permissionCatalog),
    [permissionCatalog],
  );
  const enabledCompanyModuleIds = React.useMemo(
    () =>
      new Set(
        companyModules
          .filter((module) => module.enabled)
          .map((module) => module.module_id),
      ),
    [companyModules],
  );
  const visiblePermissionOptions = React.useMemo(
    () =>
      operationalPermissionOptions.map((option) => {
        const hasEnabledGrant = option.grants.some(
          (grant) => grant.module_id && enabledCompanyModuleIds.has(grant.module_id),
        );

        return {
          ...option,
          unavailable: option.unavailable || !hasEnabledGrant,
          description:
            option.grants.length && !hasEnabledGrant
              ? `${option.description} Habilite o algoritmo para esta empresa antes de conceder este acesso.`
              : option.description,
        };
      }),
    [enabledCompanyModuleIds, operationalPermissionOptions],
  );

  const permissionGroups = React.useMemo(
    () => groupPermissionCatalog(visiblePermissionOptions),
    [visiblePermissionOptions],
  );

  const loadCompanies = React.useCallback(async () => {
    setLoading(true);
    try {
      const [companyPayload, moduleRows, permissionRows] = await Promise.all([
        apiFetch<Company[]>("/companies"),
        apiFetch<IpxModule[]>("/modules").catch(() => []),
        apiFetch<Permission[]>("/permissions").catch(() => []),
      ]);
      const companyRows = companyPayload.map(normalizeCompanyRecord);
      const companyUserRows = await Promise.all(
        companyRows.map((company) =>
          apiFetch<ManagedUser[]>(`/companies/${company.id}/users`, {
            companyScopeId: company.id,
          }).catch(() => []),
        ),
      );

      setCompanies(companyRows);
      writeCompanyCache(companyRows);
      setModules(moduleRows);
      setPermissionCatalog(permissionRows);
      setMasterUsers(
        uniqueRowsById(companyUserRows.flat()).filter((user) => user.is_master),
      );
      const storedScope = getStoredMasterCompanyScope();
      const declaredCompanyId = getCurrentUserCompanyId(currentUser);
      const currentCompanyId = selectedCompanyIdRef.current;
      const nextCompanyId =
        currentCompanyId &&
        companyRows.some((company) => company.id === currentCompanyId)
          ? currentCompanyId
          : storedScope &&
              companyRows.some((company) => company.id === storedScope.id)
            ? storedScope.id
            : declaredCompanyId &&
                companyRows.some((company) => company.id === declaredCompanyId)
              ? declaredCompanyId
              : companyRows[0]?.id ?? "";
      selectCompanyId(nextCompanyId);
    } catch (error) {
      setWorkers([]);
      setWorkerScopeWarning("");
      setCompanyOperationalIssues([]);
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar empresas.",
      );
    } finally {
      setLoading(false);
    }
  }, [currentUser, selectCompanyId]);

  const loadCompanyDetails = React.useCallback(async (expectedCompanyId: string) => {
    const companyId = expectedCompanyId.trim();
    if (selectedCompanyIdRef.current !== companyId) return;

    const requestSequence = ++companyDetailsRequestSequenceRef.current;
    if (!companyId) {
      clearCompanyDetailsState();
      return;
    }

    clearCompanyDetailsState(true);

    const [userResult, moduleResult] = await Promise.allSettled([
      apiFetch<ManagedUser[]>(`/companies/${companyId}/users`, {
        companyScopeId: companyId,
      }),
      apiFetch<CompanyModule[]>(
        `/companies/${companyId}/modules`,
        { companyScopeId: companyId },
      ),
    ]);

    if (!canPublishCompanyDetails(requestSequence, companyId)) return;

    const companyScopeIds = uniqueScopeIds(companyId);
    const administrativeIssues: CompanyAdministrativeIssue[] = [];
    let moduleRows: CompanyModule[] = [];
    let nextUsers: ManagedUser[] = [];
    let nextUsersCount: number | null = null;
    let nextAlgorithmsCount: number | null = null;

    if (userResult.status === "fulfilled") {
      try {
        if (!Array.isArray(userResult.value)) {
          throw new Error("A API não retornou uma lista de usuários.");
        }
        const companyUserRows = userResult.value.filter((user) => !user.is_master);
        const foreignUserRows = companyUserRows.filter((user) => {
          const userCompanyId = getScopedRowCompanyId(user);
          return Boolean(userCompanyId && !companyScopeIds.includes(userCompanyId));
        });
        nextUsers = companyUserRows.filter((user) => {
          const userCompanyId = getScopedRowCompanyId(user);
          return !userCompanyId || companyScopeIds.includes(userCompanyId);
        });

        if (foreignUserRows.length) {
          administrativeIssues.push({
            resource: "users",
            label: "Usuários",
            message: "resposta fora do escopo da empresa selecionada",
          });
        } else {
          nextUsersCount = nextUsers.length;
        }
      } catch (error) {
        administrativeIssues.push(
          buildCompanyAdministrativeIssue("users", error),
        );
      }
    } else {
      administrativeIssues.push(
        buildCompanyAdministrativeIssue("users", userResult.reason),
      );
    }

    if (moduleResult.status === "fulfilled") {
      try {
        if (!Array.isArray(moduleResult.value)) {
          throw new Error("A API não retornou uma lista de algoritmos.");
        }
        const foreignModuleRows = moduleResult.value.filter(
          (row) => row.company_id !== companyId,
        );
        moduleRows = moduleResult.value.filter(
          (row) => row.company_id === companyId,
        );

        if (foreignModuleRows.length) {
          administrativeIssues.push({
            resource: "modules",
            label: "Algoritmos",
            message: "resposta fora do escopo da empresa selecionada",
          });
        } else {
          nextAlgorithmsCount = enabledOperationalModuleCount(
            moduleRows,
            modules,
          );
        }
      } catch (error) {
        moduleRows = [];
        administrativeIssues.push(
          buildCompanyAdministrativeIssue("modules", error),
        );
      }
    } else {
      administrativeIssues.push(
        buildCompanyAdministrativeIssue("modules", moduleResult.reason),
      );
    }

    if (!canPublishCompanyDetails(requestSequence, companyId)) return;

    setUsers(nextUsers);
    setCompanyUsersCount(nextUsersCount);
    setCompanyModules(moduleRows);
    setCompanyStats({
      algorithms: nextAlgorithmsCount,
      workers: null,
      cameras: null,
      locations: null,
      subLocations: null,
      countingScenarios: null,
      occupancyScenarios: null,
    });
    setCompanyAdministrativeIssues(administrativeIssues);
    setLoadedCompanyId(companyId);
    setLoadingDetails(false);

    try {
      const [
        workerResult,
        locationResult,
        cameraResult,
        scenarioResult,
        occupancyScenarioResult,
      ] = await Promise.allSettled([
        fetchScopedWorkers(companyId),
        fetchValidatedRows("/locations", requireLocationRows, companyId),
        fetchValidatedRows("/cameras", requireCameraRows, companyId),
        fetchValidatedRows("/scenarios", requireScenarioRows, companyId),
        fetchScopedOccupancyScenarios(companyId),
      ]);

      if (!canPublishCompanyDetails(requestSequence, companyId)) return;

      const operationalIssues: CompanyOperationalIssue[] = [];
      const nextStats: CompanyOperationalStats = {
        algorithms: nextAlgorithmsCount,
        workers: null,
        cameras: null,
        locations: null,
        subLocations: null,
        countingScenarios: null,
        occupancyScenarios: null,
      };
      let nextWorkers: Worker[] = [];
      let nextWorkerScopeWarning = "";

      if (workerResult.status === "fulfilled") {
        const workerScopePartition = partitionWorkersByCompanyScope(
          workerResult.value,
          companyScopeIds,
        );
        const collapsedWorkerRows = collapseWorkerIdentityChains(
          workersFromExplicitCompanyScope(workerScopePartition),
        );
        const collapsedWorkerDuplicateCount = collapsedWorkerRows.reduce(
          (count, worker) =>
            count + Math.max(0, (worker.__duplicate_record_count ?? 1) - 1),
          0,
        );

        nextWorkers = sortWorkersByActivity(collapsedWorkerRows);
        nextStats.workers = workerScopePartition.foreignRows.length
          ? null
          : nextWorkers.length;
        nextWorkerScopeWarning = buildWorkerScopeWarning(
          workerScopePartition.foreignRows.length,
          workerScopePartition.unscopedRows.length,
          collapsedWorkerDuplicateCount,
          companyId,
          uniqueScopeIds(
            workerScopePartition.foreignRows.map(resolveWorkerCompanyId),
          ),
        );
        if (workerScopePartition.foreignRows.length) {
          operationalIssues.push({
            resource: "workers",
            label: "Workers",
            message: "resposta fora do escopo da empresa selecionada",
          });
        }
      } else {
        operationalIssues.push(
          buildCompanyOperationalIssue("workers", workerResult.reason),
        );
      }

      let scopedLocations: Location[] | null = null;
      if (locationResult.status === "fulfilled") {
        scopedLocations = filterRowsByCompanyScopes(
          locationResult.value,
          companyScopeIds,
        );
        nextStats.locations = scopedLocations.length;
      } else {
        operationalIssues.push(
          buildCompanyOperationalIssue("locations", locationResult.reason),
        );
      }

      let scopedCameras: Camera[] | null = null;
      if (cameraResult.status === "fulfilled") {
        scopedCameras = filterRowsByCompanyScopes(
          cameraResult.value,
          companyScopeIds,
        );
        nextStats.cameras = scopedCameras.length;
      } else {
        operationalIssues.push(
          buildCompanyOperationalIssue("cameras", cameraResult.reason),
        );
      }

      if (scenarioResult.status === "fulfilled") {
        nextStats.countingScenarios = filterRowsByCompanyScopes(
          scenarioResult.value,
          companyScopeIds,
        ).length;
      } else {
        operationalIssues.push(
          buildCompanyOperationalIssue(
            "countingScenarios",
            scenarioResult.reason,
          ),
        );
      }

      if (occupancyScenarioResult.status === "fulfilled") {
        nextStats.occupancyScenarios = filterRowsByCompanyScopes(
          occupancyScenarioResult.value,
          companyScopeIds,
        ).length;
      } else {
        operationalIssues.push(
          buildCompanyOperationalIssue(
            "occupancyScenarios",
            occupancyScenarioResult.reason,
          ),
        );
      }

      const [subLocationResult] = await Promise.allSettled([
        scopedLocations
          ? fetchCompanySubLocations(
              scopedLocations,
              companyScopeIds,
              companyId,
            )
          : Promise.reject(
              new Error("Locations não certificados para esta consulta."),
            ),
      ]);

      if (!canPublishCompanyDetails(requestSequence, companyId)) return;

      let scopedSubLocations: SubLocation[] | null = null;
      if (subLocationResult.status === "fulfilled") {
        scopedSubLocations = subLocationResult.value;
        nextStats.subLocations = scopedSubLocations.length;
      } else {
        operationalIssues.push(
          buildCompanyOperationalIssue(
            "subLocations",
            subLocationResult.reason,
          ),
        );
      }

      if (scopedCameras && scopedLocations && scopedSubLocations) {
        try {
          requireInfrastructureRelations({
            cameras: scopedCameras,
            locations: scopedLocations,
            subLocations: scopedSubLocations,
          });
        } catch (error) {
          nextStats.cameras = null;
          nextStats.locations = null;
          nextStats.subLocations = null;
          operationalIssues.push(
            buildCompanyOperationalIssue("infrastructure", error),
          );
        }
      }

      if (!canPublishCompanyDetails(requestSequence, companyId)) return;

      setWorkers(nextWorkers);
      setCompanyStats(nextStats);
      setCompanyOperationalIssues(operationalIssues);
      setWorkerScopeWarning(nextWorkerScopeWarning);
    } catch (error) {
      if (!canPublishCompanyDetails(requestSequence, companyId)) return;
      setWorkers([]);
      setCompanyStats((current) =>
        current
          ? {
              ...current,
              workers: null,
              cameras: null,
              locations: null,
              subLocations: null,
              countingScenarios: null,
              occupancyScenarios: null,
            }
          : current,
      );
      setCompanyOperationalIssues([
        buildCompanyOperationalIssue("infrastructure", error),
      ]);
      setWorkerScopeWarning("");
    } finally {
      if (canPublishCompanyDetails(requestSequence, companyId)) {
        setLoadingOperationalDetails(false);
      }
    }
  }, [canPublishCompanyDetails, clearCompanyDetailsState, modules]);

  React.useEffect(() => {
    loadCompanies();
  }, [loadCompanies]);

  const ensureCompanyTimeZone = React.useCallback(async (
    company: Company,
    notifyFailure = false,
  ) => {
    const normalizedCompany = normalizeCompanyRecord(company);
    const companyTimeZoneRecord = resolveCompanyRecordTimeZone(company);
    const currentResolution = getCompanyTimeZoneResolutionForScope(
      currentUser,
      company.id,
    );
    const declaredTimeZone = companyTimeZoneRecord.timeZone;
    const currentTimeZone =
      declaredTimeZone ??
      (!companyTimeZoneRecord.declared && !currentResolution.fallback
        ? currentResolution.timeZone
        : null);
    if (currentTimeZone) {
      return { ...normalizedCompany, timezone: currentTimeZone };
    }

    if (companyTimeZoneRecord.declared) {
      if (notifyFailure) {
        toast.error(
          "Não foi possível certificar o fuso da empresa: o cadastro não informou um timezone IANA válido.",
        );
      }
      return null;
    }

    try {
      // The global company directory is the authorized cross-tenant source for
      // a superadmin. `/companies/{id}` is scoped to the company carried by the
      // JWT in the current backend and returns 403 for another selected tenant.
      const response = await apiFetch<Company[]>("/companies");
      if (!Array.isArray(response)) {
        throw new Error("A API não retornou o catálogo de empresas.");
      }
      const companyRows = response.map(normalizeCompanyRecord);
      const directoryCompany = companyRows.find(
        (row) => row.id?.trim() === company.id,
      );
      if (!directoryCompany) {
        throw new Error("A empresa selecionada não consta no catálogo autorizado.");
      }
      const timeZone = resolveCompanyRecordTimeZone(directoryCompany).timeZone;
      if (!timeZone) {
        throw new Error(
          "O catálogo de empresas não informou um timezone IANA válido.",
        );
      }
      const certifiedCompany = {
        ...normalizedCompany,
        ...directoryCompany,
        id: company.id,
        timezone: timeZone,
      };
      setCompanies(companyRows);
      writeCompanyCache(companyRows);
      return certifiedCompany;
    } catch (error) {
      if (notifyFailure) {
        toast.error(
          error instanceof Error
            ? `Não foi possível certificar o fuso da empresa: ${error.message}`
            : "Não foi possível certificar o fuso da empresa.",
        );
      }
      return null;
    }
  }, [currentUser]);

  React.useEffect(() => {
    if (!selectedCompany) return;

    const storedScope = getStoredMasterCompanyScope();
    const resolution = getCompanyTimeZoneResolutionForScope(
      currentUser,
      selectedCompany.id,
    );
    const selectedTimeZoneRecord = resolveCompanyRecordTimeZone(selectedCompany);
    const selectedTimezone = selectedTimeZoneRecord.declared
      ? selectedTimeZoneRecord.timeZone
      : !resolution.fallback
        ? resolution.timeZone
        : null;
    const requiresDirectoryHydration =
      !selectedTimeZoneRecord.declared && resolution.fallback;
    if (
      selectedTimezone &&
      !requiresDirectoryHydration &&
      storedScope?.id === selectedCompany.id &&
      storedScope.name === selectedCompany.name &&
      (storedScope.trade_name ?? null) ===
        (selectedCompany.trade_name ?? null) &&
      (storedScope.timezone ?? null) === selectedTimezone
    ) {
      return;
    }

    setStoredMasterCompanyScope({
      id: selectedCompany.id,
      name: selectedCompany.name,
      timezone: selectedTimezone,
      trade_name: selectedCompany.trade_name ?? null,
    });

    if (!requiresDirectoryHydration && selectedTimezone) return;
    let active = true;
    void ensureCompanyTimeZone(selectedCompany).then((certifiedCompany) => {
      if (
        !active ||
        !certifiedCompany ||
        selectedCompanyIdRef.current !== certifiedCompany.id
      ) {
        return;
      }
      setStoredMasterCompanyScope({
        id: certifiedCompany.id,
        name: certifiedCompany.name,
        timezone: certifiedCompany.timezone,
        trade_name: certifiedCompany.trade_name ?? null,
      });
    });
    return () => {
      active = false;
    };
  }, [currentUser, ensureCompanyTimeZone, selectedCompany]);

  React.useEffect(() => {
    void loadCompanyDetails(selectedCompanyId);
  }, [loadCompanyDetails, selectedCompanyId]);

  function openCompany(company?: Company) {
    setEditingCompany(company ?? null);
    setCompanyForm(
      company
        ? {
            name: company.name,
            trade_name: company.trade_name ?? "",
            cnpj: company.cnpj ?? "",
            plan: company.plan ?? "pro",
            timezone: canonicalCompanyTimeZone(company.timezone) ?? "",
            user_limit: String(company.user_limit ?? 10),
            active: String(company.active),
          }
        : emptyCompanyForm,
    );
    setCompanyDialog(true);
  }

  function openUser(user?: ManagedUser) {
    const companyId = selectedCompanyIdRef.current;
    if (!companyId) {
      toast.error("Selecione uma empresa antes de criar usuário.");
      return;
    }
    if (loadedCompanyId !== companyId) {
      toast.error("Aguarde o carregamento da empresa selecionada.");
      return;
    }

    invalidateUserPermissionRequest();
    setEditingUser(user ?? null);
    setUserForm(
      user
        ? {
            name: user.name,
            email: user.email,
            password: "",
            active: String(user.active),
            isMaster: false,
            isCompanyAdmin: false,
          }
        : emptyUserForm,
    );
    setUserDialog(true);

    if (user) {
      void loadUserPermissions(user.id, companyId);
    }
  }

  function openMasterUser(user?: ManagedUser) {
    setEditingMasterUser(user ?? null);
    setMasterUserForm(
      user
        ? {
            name: user.name,
            email: user.email,
            password: "",
            active: String(user.active),
            isMaster: true,
            isCompanyAdmin: false,
          }
        : { ...emptyUserForm, isMaster: true, isCompanyAdmin: false },
    );
    setMasterUserDialog(true);
  }

  function setCompanyAdminAccess(enabled: boolean) {
    if (userForm.isMaster) return;

    setUserForm((form) => ({ ...form, isCompanyAdmin: enabled }));
    setUserPermissions((current) => ({
      ...current,
      ...Object.fromEntries(
        visiblePermissionOptions
          .filter((option) => !option.unavailable)
        .map((option) => [option.slug, enabled]),
      ),
    }));
  }

  function setSuperAdminAccess(enabled: boolean) {
    setUserForm((form) => ({
      ...form,
      isMaster: enabled,
      isCompanyAdmin: enabled ? false : form.isCompanyAdmin,
    }));
  }

  function selectCompanyScope(company: Company) {
    selectCompanyId(company.id);
    const resolution = getCompanyTimeZoneResolutionForScope(
      currentUser,
      company.id,
    );
    setStoredMasterCompanyScope({
      id: company.id,
      name: company.name,
      timezone:
        canonicalCompanyTimeZone(company.timezone) ??
        (!resolution.fallback ? resolution.timeZone : null),
      trade_name: company.trade_name ?? null,
    });
  }

  async function openCompanyDashboard(company: Company) {
    const certifiedCompany = await ensureCompanyTimeZone(company, true);
    if (!certifiedCompany) return;
    selectCompanyScope(certifiedCompany);
    router.push("/dashboard/live");
  }

  async function openCompanySection(tab: CompanyTab) {
    if (!selectedCompany) {
      toast.error("Selecione uma empresa para gerenciar.");
      return;
    }

    const certifiedCompany = await ensureCompanyTimeZone(selectedCompany, true);
    if (!certifiedCompany) return;
    selectCompanyScope(certifiedCompany);
    setActiveCompanyTab(tab);
  }

  async function openCompanyRoute(path: string) {
    if (!selectedCompany) {
      toast.error("Selecione uma empresa para gerenciar.");
      return;
    }

    const certifiedCompany = await ensureCompanyTimeZone(selectedCompany, true);
    if (!certifiedCompany) return;
    selectCompanyScope(certifiedCompany);
    router.push(path);
  }

  async function loadUserPermissions(userId: string, companyId: string) {
    const requestedUserId = userId.trim();
    const requestedCompanyId = companyId.trim();
    if (
      !requestedUserId ||
      !requestedCompanyId ||
      selectedCompanyIdRef.current !== requestedCompanyId
    ) {
      return;
    }

    const requestSequence = ++userPermissionRequestSequenceRef.current;
    userPermissionRequestContextRef.current = {
      companyId: requestedCompanyId,
      userId: requestedUserId,
    };
    setLoadingUserPermissions(true);
    try {
      const permissions = await apiFetch<UserPermission[]>(
        `/users/${requestedUserId}/permissions`,
        { companyScopeId: requestedCompanyId },
      );
      if (
        !isCurrentUserPermissionRequest(
          requestSequence,
          requestedUserId,
          requestedCompanyId,
        )
      ) {
        return;
      }
      const permissionState = createPermissionState(
        permissions,
        visiblePermissionOptions,
      );
      setUserPermissions(permissionState);
      setUserForm((form) => ({
        ...form,
        isCompanyAdmin: hasAllAvailablePermissions(
          permissionState,
          visiblePermissionOptions,
        ),
      }));
    } catch (error) {
      if (
        !isCurrentUserPermissionRequest(
          requestSequence,
          requestedUserId,
          requestedCompanyId,
        )
      ) {
        return;
      }
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar acessos do usuário.",
      );
      setUserPermissions({});
    } finally {
      if (
        isCurrentUserPermissionRequest(
          requestSequence,
          requestedUserId,
          requestedCompanyId,
        )
      ) {
        setLoadingUserPermissions(false);
      }
    }
  }

  function isCurrentUserPermissionRequest(
    requestSequence: number,
    userId: string,
    companyId: string,
  ) {
    const context = userPermissionRequestContextRef.current;
    return (
      requestSequence === userPermissionRequestSequenceRef.current &&
      selectedCompanyIdRef.current === companyId &&
      context?.companyId === companyId &&
      context.userId === userId
    );
  }

  async function saveCompany() {
    const name = companyForm.name.trim();
    if (!name) {
      toast.error("Nome da empresa obrigatório.");
      return;
    }

    const userLimit = Number(companyForm.user_limit);
    if (!Number.isFinite(userLimit) || userLimit < 1) {
      toast.error("Limite de usuários deve ser maior que zero.");
      return;
    }

    const timeZone = canonicalCompanyTimeZone(companyForm.timezone);
    if (!timeZone) {
      toast.error("Informe um timezone IANA válido para a empresa.");
      return;
    }

    setSaving(true);
    try {
      const body = {
        name,
        trade_name: companyForm.trade_name.trim() || undefined,
        cnpj: companyForm.cnpj.trim() || undefined,
        plan: companyForm.plan,
        timezone: timeZone,
        user_limit: Math.trunc(userLimit),
        ...(editingCompany
          ? { active: companyForm.active === "true" }
          : undefined),
      };

      if (editingCompany) {
        await apiFetch(`/companies/${editingCompany.id}`, {
          companyScopeId: editingCompany.id,
          method: "PUT",
          body,
        });
        toast.success("Empresa atualizada.");
      } else {
        const company = await apiFetch<Company>("/companies", {
          method: "POST",
          body,
        });
        selectCompanyId(company.id);
        toast.success("Empresa criada.");
      }

      setCompanyDialog(false);
      await loadCompanies();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao salvar empresa.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteCompany(company: Company) {
    const hasLoadedCompany =
      selectedCompanyId === company.id && loadedCompanyId === company.id;
    const usersCount = hasLoadedCompany ? companyUsersCount : null;
    const workersCount = hasLoadedCompany ? companyStats?.workers ?? null : null;
    const loadedSummary = hasLoadedCompany
      ? `Resumo carregado: ${formatCertifiedCount(usersCount)} usuário(s) e ${formatCertifiedCount(workersCount)} worker(s).`
      : "";
    const message = [
      `Excluir a empresa "${company.name}"?`,
      "Esta ação é permanente e pode remover dados do tenant no backend.",
      loadedSummary,
    ]
      .filter(Boolean)
      .join("\n\n");

    if (!window.confirm(message)) return;

    setDeletingCompanyId(company.id);
    try {
      await apiFetch(`/companies/${company.id}`, {
        companyScopeId: company.id,
        method: "DELETE",
      });
      toast.success("Empresa excluída.");

      const storedScope = getStoredMasterCompanyScope();
      if (storedScope?.id === company.id) {
        clearStoredMasterCompanyScope();
      }
      if (selectedCompanyIdRef.current === company.id) {
        selectCompanyId("");
      }

      await loadCompanies();
    } catch (error) {
      toast.error(companyDeleteErrorMessage(error, company.name));
    } finally {
      setDeletingCompanyId("");
    }
  }

  async function saveUser() {
    const name = userForm.name.trim();
    const email = userForm.email.trim();
    const password = userForm.password;
    const companyId = selectedCompanyIdRef.current.trim();

    if (!name || !email) {
      toast.error("Nome e e-mail são obrigatórios.");
      return;
    }

    if (!editingUser && password.length < 8) {
      toast.error("Senha obrigatória com pelo menos 8 caracteres.");
      return;
    }

    if (editingUser && password && password.length < 8) {
      toast.error("Nova senha deve ter pelo menos 8 caracteres.");
      return;
    }

    if (!companyId) {
      toast.error("Selecione uma empresa antes de salvar o usuário.");
      return;
    }

    if (
      editingUser?.company_id &&
      editingUser.company_id !== companyId
    ) {
      toast.error(
        "O usuário aberto não pertence mais à empresa selecionada. Reabra o cadastro pela empresa correta.",
      );
      return;
    }

    setSaving(true);
    try {
      if (userForm.isMaster) {
        const body = {
          name,
          email,
          is_master: true,
          ...(editingUser ? { active: userForm.active === "true" } : undefined),
          ...(password ? { password } : undefined),
        };

        if (editingUser) {
          await apiFetch(`/users/${editingUser.id}`, {
            method: "PUT",
            body,
            companyScopeId: companyId,
          });
          toast.success("Usuário promovido a super-admin.");
        } else {
          await apiFetch(`/companies/${companyId}/users`, {
            method: "POST",
            body,
            companyScopeId: companyId,
          });
          toast.success("Super-admin criado.");
        }

        closeUserDialog();
        await loadCompanies();
        await loadCompanyDetails(companyId);
        return;
      }

      let savedUser: ManagedUser | undefined;

      if (editingUser) {
        savedUser = editingUser;
        const profileUpdate = buildCompanyUserProfileUpdate(editingUser, {
          name,
          email,
          password,
          active: userForm.active === "true",
        });
        if (profileUpdate) {
          savedUser = await apiFetch<ManagedUser>(
            `/users/${editingUser.id}`,
            {
              method: "PUT",
              body: profileUpdate,
              companyScopeId: companyId,
            },
          );
        }
      } else {
        savedUser = await apiFetch<ManagedUser | undefined>(
          `/companies/${companyId}/users`,
          {
            method: "POST",
            companyScopeId: companyId,
            body: {
              name,
              email,
              password,
              is_master: false,
            },
          },
        );
      }

      let permissionSyncError = "";
      const savedUserId = await resolveSavedCompanyUserId(
        savedUser,
        email,
        companyId,
        editingUser?.id,
      );
      if (savedUserId) {
        try {
          await syncUserPermissions(savedUserId, companyId);
        } catch (error) {
          permissionSyncError =
            error instanceof ApiError
              ? `API respondeu ${error.status}: ${error.message}`
              : error instanceof Error
              ? error.message
              : "Não foi possível sincronizar os acessos do usuário.";
        }
      } else {
        permissionSyncError =
          "A API salvou o usuário, mas não retornou nem permitiu localizar o ID para aplicar os acessos.";
      }

      if (permissionSyncError) {
        toast.error(
          `${editingUser ? "Não foi possível concluir a sincronização dos acessos" : "Usuário criado, mas os acessos não foram sincronizados"}: ${permissionSyncError}`,
        );
        if (editingUser) return;
        closeUserDialog();
        await loadCompanyDetails(companyId);
        return;
      }

      toast.success(
        userForm.isCompanyAdmin
          ? editingUser
            ? "Admin da empresa atualizado."
            : "Admin da empresa criado."
          : editingUser
            ? "Usuário atualizado."
            : "Usuário criado.",
      );
      closeUserDialog();
      await loadCompanyDetails(companyId);
    } catch (error) {
      toast.error(
        userForm.isMaster
          ? masterSaveErrorMessage(error, companyId)
          : companyUserSaveErrorMessage(error, companyId),
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteCompanyUser(user: ManagedUser) {
    if (!window.confirm(`Excluir o usuário "${user.name}"?`)) return;

    const companyId = selectedCompanyIdRef.current;
    if (!companyId) return;
    setDeletingUserId(user.id);
    try {
      await apiFetch(`/users/${user.id}`, {
        method: "DELETE",
        companyScopeId: companyId,
      });
      if (selectedCompanyIdRef.current !== companyId) return;
      toast.success("Usuário excluído.");
      if (editingUser?.id === user.id) {
        closeUserDialog();
      }
      await loadCompanyDetails(companyId);
    } catch (error) {
      if (selectedCompanyIdRef.current !== companyId) return;
      toast.error(
        userDeleteErrorMessage(error, user.name, companyId),
      );
    } finally {
      setDeletingUserId("");
    }
  }

  async function saveMasterUser() {
    const name = masterUserForm.name.trim();
    const email = masterUserForm.email.trim();
    const password = masterUserForm.password;

    if (!name || !email) {
      toast.error("Nome e e-mail são obrigatórios.");
      return;
    }

    if (!editingMasterUser && password.length < 8) {
      toast.error("Senha obrigatória com pelo menos 8 caracteres.");
      return;
    }

    if (editingMasterUser && password && password.length < 8) {
      toast.error("Nova senha deve ter pelo menos 8 caracteres.");
      return;
    }

    setSaving(true);
    try {
      const companyId = selectedCompanyId.trim();
      if (!companyId) {
        toast.error("Selecione uma empresa para vincular o super-admin.");
        return;
      }

      const body = {
        name,
        email,
        is_master: true,
        ...(editingMasterUser
          ? { active: masterUserForm.active === "true" }
          : undefined),
        ...(password ? { password } : undefined),
      };
      if (editingMasterUser) {
        await apiFetch(`/users/${editingMasterUser.id}`, {
          companyScopeId: companyId,
          method: "PUT",
          body,
        });
        toast.success("Super-admin atualizado.");
      } else {
        await apiFetch(`/companies/${companyId}/users`, {
          companyScopeId: companyId,
          method: "POST",
          body,
        });
        toast.success("Super-admin criado.");
      }

      setMasterUserDialog(false);
      await loadCompanies();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Falha ao salvar super-admin.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteMasterUser(user: ManagedUser) {
    if (currentUser?.id === user.id) {
      toast.error("Você não pode excluir o próprio usuário master logado.");
      return;
    }

    if (!window.confirm(`Excluir o super-admin "${user.name}"?`)) return;

    setDeletingUserId(user.id);
    try {
      await apiFetch(`/users/${user.id}`, {
        companyScopeId: selectedCompanyId,
        method: "DELETE",
      });
      toast.success("Super-admin excluído.");
      if (editingMasterUser?.id === user.id) {
        setMasterUserDialog(false);
        setEditingMasterUser(null);
      }
      await loadCompanies();
    } catch (error) {
      toast.error(masterUserDeleteErrorMessage(error, user.name));
    } finally {
      setDeletingUserId("");
    }
  }

  function companyDeleteErrorMessage(error: unknown, companyName: string) {
    if (error instanceof ApiError && error.status === 500) {
      return `Não foi possível excluir "${companyName}". A API retornou erro interno ao remover a empresa; normalmente isso indica vínculo pendente ou ausência de cascade no backend.`;
    }

    const detail =
      error instanceof Error ? error.message : "Falha ao excluir empresa.";
    return `Não foi possível excluir "${companyName}". ${detail}`;
  }

  function userDeleteErrorMessage(
    error: unknown,
    userName: string,
    companyId: string,
  ) {
    if (error instanceof ApiError && error.status === 404) {
      return `Não foi possível excluir "${userName}". A API não encontrou o usuário dentro da empresa selecionada (${companyId}); isso costuma acontecer quando o backend ignora o escopo master.`;
    }

    return error instanceof Error ? error.message : "Falha ao excluir usuário.";
  }

  function masterUserDeleteErrorMessage(error: unknown, userName: string) {
    if (error instanceof ApiError && error.status === 404) {
      return `Não foi possível excluir o super-admin "${userName}". A API não encontrou esse usuário no escopo do token atual.`;
    }

    return error instanceof Error
      ? error.message
      : "Falha ao excluir super-admin.";
  }

  function masterSaveErrorMessage(error: unknown, companyId: string) {
    if (error instanceof ApiError && error.status === 404) {
      return `Não foi possível salvar como super-admin. A API não encontrou o usuário no escopo da empresa selecionada (${companyId}).`;
    }

    return error instanceof Error
      ? error.message
      : "Falha ao salvar super-admin.";
  }

  function companyUserSaveErrorMessage(error: unknown, companyId: string) {
    if (error instanceof ApiError && error.status === 404) {
      return `A API não encontrou o usuário no escopo da empresa selecionada (${companyId}). Nenhum acesso foi alterado; o backend precisa aceitar o escopo cross-company do super-admin para editar o perfil desse usuário.`;
    }

    return error instanceof Error ? error.message : "Falha ao salvar usuário.";
  }

  async function resolveSavedCompanyUserId(
    savedUser: ManagedUser | undefined,
    email: string,
    companyId: string,
    editingUserId?: string,
  ) {
    if (savedUser?.id) return savedUser.id;
    if (editingUserId) return editingUserId;

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !companyId) return "";

    const rows = await apiFetch<ManagedUser[]>(
      `/companies/${companyId}/users`,
      { companyScopeId: companyId },
    );
    const found = rows.find(
      (user) => user.email.trim().toLowerCase() === normalizedEmail,
    );

    return found?.id ?? "";
  }

  async function syncUserPermissions(userId: string, companyId: string) {
    const availableOptions = visiblePermissionOptions.filter(
      (option) => !option.unavailable,
    );
    if (!availableOptions.length) return;

    const currentPermissions = await apiFetch<UserPermission[]>(
      `/users/${userId}/permissions`,
      { companyScopeId: companyId },
    );
    const grantedSlugs = new Set(
      currentPermissions
        .filter((permission) => permission.slug && permissionIsEnabled(permission))
        .map((permission) => permission.slug),
    );
    const selectedOptions = availableOptions.filter(
      (option) =>
        isBackendGrantablePermissionOption(option) &&
        Boolean(userPermissions[option.slug]),
    );

    for (const option of availableOptions) {
      if (!isBackendGrantablePermissionOption(option)) continue;

      const shouldGrant = Boolean(userPermissions[option.slug]);
      const matchingPermissions = currentPermissions.filter((permission) =>
        userPermissionMatchesOption(permission, option),
      );

      if (shouldGrant) {
        await grantUserPermission(
          userId,
          option,
          grantedSlugs,
          enabledCompanyModuleIds,
          companyId,
        );
      }

      if (!shouldGrant) {
        for (const permission of matchingPermissions) {
          const isNeededBySelectedOption = selectedOptions.some(
            (selectedOption) =>
              selectedOption.slug !== option.slug &&
              userPermissionMatchesOption(permission, selectedOption),
          );
          if (isNeededBySelectedOption) continue;

          const permissionId = getPermissionRecordId(permission);
          if (!permissionId) continue;
          await revokeUserPermission(userId, permissionId, companyId);
          if (permission.slug) {
            grantedSlugs.delete(permission.slug);
          }
        }
      }
    }
  }

  async function toggleCompanyModule(module: IpxModule) {
    const companyId = selectedCompanyIdRef.current;
    if (!companyId || loadedCompanyId !== companyId) return;

    const assignment = companyModules.find((row) => row.module_id === module.id);
    setUpdatingModuleId(module.id);

    try {
      if (!assignment) {
        await apiFetch(`/companies/${companyId}/modules`, {
          companyScopeId: companyId,
          method: "POST",
          body: { module_id: module.id, enabled: true },
        });
        toast.success("Módulo habilitado.");
      } else {
        await apiFetch(`/companies/${companyId}/modules/${module.id}`, {
          companyScopeId: companyId,
          method: "PUT",
          body: { enabled: !assignment.enabled },
        });
        toast.success(assignment.enabled ? "Módulo desabilitado." : "Módulo habilitado.");
      }

      await loadCompanyDetails(companyId);
    } catch (error) {
      if (selectedCompanyIdRef.current !== companyId) return;
      toast.error(error instanceof Error ? error.message : "Falha ao alterar módulo.");
    } finally {
      setUpdatingModuleId("");
    }
  }

  const hasCurrentCompanyDetails = Boolean(
    selectedCompanyId && loadedCompanyId === selectedCompanyId,
  );
  const userAdministrativeIssue = companyAdministrativeIssues.find(
    (issue) => issue.resource === "users",
  );
  const moduleAdministrativeIssue = companyAdministrativeIssues.find(
    (issue) => issue.resource === "modules",
  );
  const workerOperationalIssue = companyOperationalIssues.find(
    (issue) => issue.resource === "workers",
  );
  const loadingAnyCompanyDetails =
    loadingDetails || loadingOperationalDetails;

  return (
    <section className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={Building2}
          label="Empresas"
          value={formatNumber(companies.length)}
          detail={`${formatNumber(
            companies.filter((company) => company.active).length,
          )} ativas`}
        />
        <MetricCard
          icon={ShieldCheck}
          label="Super-admins"
          value={formatNumber(masterUsers.length)}
          detail="Acesso global"
        />
        <MetricCard
          icon={Users}
          label="Usuários da empresa"
          value={
            loadingDetails
              ? "..."
              : formatCertifiedCount(
                  hasCurrentCompanyDetails ? companyUsersCount : null,
                )
          }
          detail={
            userAdministrativeIssue
              ? "Dados indisponíveis"
              : selectedCompany
                ? selectedCompany.name
                : "Selecione uma empresa"
          }
        />
        <MetricCard
          icon={ServerCog}
          label="Workers"
          value={
            loadingOperationalDetails
              ? "..."
              : formatCertifiedCount(
                  hasCurrentCompanyDetails ? companyStats?.workers : null,
                )
          }
          detail={
            workerOperationalIssue
              ? "Dados indisponíveis"
              : "Vinculados à empresa"
          }
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            value={companyQuery}
            onChange={(event) => setCompanyQuery(event.target.value)}
            placeholder="Buscar empresa"
            className="w-full sm:w-72"
          />
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => {
              loadCompanies();
              loadCompanyDetails(selectedCompanyId);
            }}
            disabled={loading || loadingAnyCompanyDetails}
          >
            <RefreshCw
              className={cn(
                "h-4 w-4",
                (loading || loadingAnyCompanyDetails) && "animate-spin",
              )}
            />
            Atualizar
          </Button>
        </div>
        <Button type="button" className="w-full sm:w-auto" onClick={() => openCompany()}>
          <Plus className="h-4 w-4" />
          Nova empresa
        </Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(420px,0.95fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Empresas</CardTitle>
            <CardDescription>
              Selecione a empresa para gerenciar ou use Dashboard para abrir os dados.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <TableSkeleton />
            ) : filteredCompanies.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Plano</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCompanies.map((company) => (
                    <TableRow
                      key={company.id}
                      className={cn(
                        "cursor-pointer",
                        selectedCompanyId === company.id && "bg-primary/10",
                      )}
                      onClick={() => selectCompanyScope(company)}
                    >
                      <TableCell>
                        <div className="font-medium text-foreground">
                          {company.name}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {company.trade_name || company.cnpj || company.id}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {planLabels[company.plan ?? ""] ?? company.plan ?? "-"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <StatusBadge active={company.active} />
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={(event) => {
                              event.stopPropagation();
                              selectCompanyScope(company);
                            }}
                          >
                            <Settings2 className="h-3.5 w-3.5" />
                            Gerenciar
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={(event) => {
                              event.stopPropagation();
                              openCompanyDashboard(company);
                            }}
                          >
                            <BarChart3 className="h-3.5 w-3.5" />
                            Dashboard
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={(event) => {
                              event.stopPropagation();
                              openCompany(company);
                            }}
                          >
                            <Edit className="h-3.5 w-3.5" />
                            Editar
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            onClick={(event) => {
                              event.stopPropagation();
                              deleteCompany(company);
                            }}
                            disabled={deletingCompanyId === company.id}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Excluir
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <EmptyState text="Nenhuma empresa encontrada." />
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <CompanySummary company={selectedCompany} loading={loading} />

          <CompanyManagementFlow
            company={selectedCompany}
            administrativeIssues={companyAdministrativeIssues}
            operationalIssues={companyOperationalIssues}
            loadingAdministrative={loadingDetails}
            loadingOperational={loadingOperationalDetails}
            stats={
              hasCurrentCompanyDetails && companyStats
                ? {
                    ...companyStats,
                    users: companyUsersCount,
                  }
                : null
            }
            onOpenRoute={openCompanyRoute}
            onOpenTab={openCompanySection}
          />

          <Tabs
            value={activeCompanyTab}
            onValueChange={(value) => setActiveCompanyTab(value as CompanyTab)}
            className="space-y-4"
          >
            <TabsList className="flex h-auto flex-wrap justify-start">
              <TabsTrigger value="users">Usuários</TabsTrigger>
              <TabsTrigger value="workers">Workers</TabsTrigger>
              <TabsTrigger value="modules">Algoritmos</TabsTrigger>
              <TabsTrigger value="masters">Super-admins</TabsTrigger>
            </TabsList>

            <TabsContent value="users">
              <Card>
                <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle>Admins e operadores</CardTitle>
                    <CardDescription>
                      Usuários pertencentes à empresa selecionada.
                    </CardDescription>
                  </div>
                  <Button
                    type="button"
                    className="w-full sm:w-auto"
                    onClick={() => openUser()}
                    disabled={
                      !selectedCompanyId ||
                      !hasCurrentCompanyDetails ||
                      loadingDetails
                    }
                  >
                    <UserPlus className="h-4 w-4" />
                    Novo usuário
                  </Button>
                </CardHeader>
                <CardContent className="space-y-3">
                  {userAdministrativeIssue ? (
                    <div className="rounded-md border border-amber-300/50 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-700 dark:text-amber-300">
                      Usuários indisponíveis: {userAdministrativeIssue.message}.
                    </div>
                  ) : null}
                  <Input
                    value={userQuery}
                    onChange={(event) => setUserQuery(event.target.value)}
                    placeholder="Buscar usuário"
                    disabled={
                      !selectedCompanyId ||
                      !hasCurrentCompanyDetails ||
                      loadingDetails
                    }
                  />

                  {loadingDetails ? (
                    <TableSkeleton />
                  ) : filteredUsers.length ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Usuário</TableHead>
                          <TableHead>Acesso</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredUsers.map((user) => (
                          <TableRow key={user.id}>
                            <TableCell>
                              <div className="font-medium text-foreground">
                                {user.name}
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {user.email}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary">Empresa</Badge>
                            </TableCell>
                            <TableCell>
                              <StatusBadge active={user.active} />
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap justify-end gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openUser(user)}
                                >
                                  <Edit className="h-3.5 w-3.5" />
                                  Editar
                                </Button>
                                <Button
                                  type="button"
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => deleteCompanyUser(user)}
                                  disabled={deletingUserId === user.id}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  Excluir
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : userAdministrativeIssue ? (
                    <EmptyState text="Não foi possível certificar os usuários desta empresa." />
                  ) : (
                    <EmptyState text="Nenhum usuário para a empresa selecionada." />
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="masters">
              <Card>
                <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle>Super-admins</CardTitle>
                    <CardDescription>
                      Usuários com acesso global ao Master.
                    </CardDescription>
                  </div>
                  <Button
                    type="button"
                    className="w-full sm:w-auto"
                    onClick={() => openMasterUser()}
                  >
                    <UserPlus className="h-4 w-4" />
                    Novo super-admin
                  </Button>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Input
                    value={masterUserQuery}
                    onChange={(event) => setMasterUserQuery(event.target.value)}
                    placeholder="Buscar super-admin"
                    disabled={loading}
                  />

                  {loading ? (
                    <TableSkeleton />
                  ) : filteredMasterUsers.length ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Usuário</TableHead>
                          <TableHead>Acesso</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredMasterUsers.map((user) => (
                          <TableRow key={user.id}>
                            <TableCell>
                              <div className="font-medium text-foreground">
                                {user.name}
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {user.email}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="default">Master</Badge>
                            </TableCell>
                            <TableCell>
                              <StatusBadge active={user.active} />
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap justify-end gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openMasterUser(user)}
                                >
                                  <Edit className="h-3.5 w-3.5" />
                                  Editar
                                </Button>
                                <Button
                                  type="button"
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => deleteMasterUser(user)}
                                  disabled={
                                    deletingUserId === user.id ||
                                    currentUser?.id === user.id
                                  }
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  Excluir
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <EmptyState text="Nenhum super-admin retornado pela API." />
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="modules">
              <Card>
                <CardHeader>
                  <CardTitle>Algoritmos</CardTitle>
                  <CardDescription>
                    Catálogo de algoritmos da plataforma para a empresa selecionada.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {moduleAdministrativeIssue ? (
                    <div className="rounded-md border border-amber-300/50 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-700 dark:text-amber-300">
                      Algoritmos indisponíveis: {moduleAdministrativeIssue.message}.
                    </div>
                  ) : null}
                  {loadingDetails ? (
                    <TableSkeleton />
                  ) : moduleAdministrativeIssue ? (
                    <EmptyState text="Não foi possível certificar os algoritmos desta empresa." />
                  ) : visibleModules.length ? (
                    <div className="divide-y rounded-md border">
                      {visibleModules.map((module) => {
                        const assignment = companyModules.find(
                          (row) => row.module_id === module.id,
                        );
                        const enabled = Boolean(assignment?.enabled);
                        const moduleLabel = algorithmModuleLabel(module);

                        return (
                          <div
                            key={module.id}
                            className={cn(
                              "flex flex-col gap-3 p-3 transition sm:flex-row sm:items-center sm:justify-between",
                              enabled
                                ? "bg-card"
                                : "bg-muted/20 text-muted-foreground",
                            )}
                          >
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <div
                                  className={cn(
                                    "font-medium",
                                    enabled ? "text-foreground" : "text-muted-foreground",
                                  )}
                                >
                                  {moduleLabel}
                                </div>
                                <Badge
                                  variant={enabled ? "success" : "outline"}
                                  className={!enabled ? "bg-background/60" : undefined}
                                >
                                  {enabled ? "Habilitado" : "Desabilitado"}
                                </Badge>
                                {!module.active ? (
                                  <Badge variant="outline">Inativo global</Badge>
                                ) : null}
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {module.description || module.slug}
                              </div>
                            </div>
                            <Button
                              type="button"
                              variant={enabled ? "outline" : "default"}
                              size="sm"
                              className="w-full sm:w-auto"
                              onClick={() => toggleCompanyModule(module)}
                              disabled={
                                !selectedCompanyId ||
                                !hasCurrentCompanyDetails ||
                                !module.active ||
                                updatingModuleId === module.id
                              }
                            >
                              {enabled ? (
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              ) : (
                                <Plus className="h-3.5 w-3.5" />
                              )}
                              {enabled ? "Alterar" : "Habilitar"}
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <EmptyState text="Nenhum algoritmo retornado pela API." />
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="workers">
              <Card>
                <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle>Workers</CardTitle>
                    <CardDescription>
                      Workers retornados para a empresa selecionada.
                    </CardDescription>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full sm:w-auto"
                    onClick={() => loadCompanyDetails(selectedCompanyId)}
                    disabled={!selectedCompanyId || loadingAnyCompanyDetails}
                  >
                    <RefreshCw
                      className={cn(
                        "h-4 w-4",
                        loadingAnyCompanyDetails && "animate-spin",
                      )}
                    />
                    Atualizar
                  </Button>
                </CardHeader>
                <CardContent className="space-y-3">
                  {workerScopeWarning ? (
                    <div className="rounded-md border border-amber-300/50 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-700 dark:text-amber-300">
                      {workerScopeWarning}
                    </div>
                  ) : null}
                  {workerOperationalIssue && !workerScopeWarning ? (
                    <div className="rounded-md border border-amber-300/50 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-700 dark:text-amber-300">
                      Workers indisponíveis: {workerOperationalIssue.message}.
                    </div>
                  ) : null}
                  {loadingOperationalDetails ? (
                    <TableSkeleton />
                  ) : workers.length ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Worker</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Último heartbeat</TableHead>
                          <TableHead>Ambiente</TableHead>
                          <TableHead>Vínculo</TableHead>
                          <TableHead>Chave</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {workers.map((worker) => {
                          const display = getWorkerDisplayInfo(worker);

                          return (
                            <TableRow key={worker.id}>
                              <TableCell>
                                <div className="font-medium text-foreground">
                                  {worker.name}
                                </div>
                                {(worker as WorkerRow).__duplicate_record_count &&
                                (worker as WorkerRow).__duplicate_record_count! > 1 ? (
                                  <Badge variant="outline" className="mt-1 text-[10px]">
                                    {(worker as WorkerRow).__duplicate_record_count}{" "}
                                    registros consolidados
                                  </Badge>
                                ) : null}
                                <div className="mt-1 text-xs text-muted-foreground">
                                  {worker.description ||
                                    display.identifier ||
                                    worker.id}
                                </div>
                              </TableCell>
                              <TableCell>
                                <WorkerStatusBadge worker={worker} />
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {formatDateTime(display.lastSeenAt)}
                              </TableCell>
                              <TableCell>
                                <div className="text-sm text-foreground">
                                  {display.environment || "-"}
                                </div>
                                {display.version ? (
                                  <div className="mt-1 text-xs text-muted-foreground">
                                    {display.version}
                                  </div>
                                ) : null}
                              </TableCell>
                              <TableCell>
                                <WorkerScopeBadge
                                  companyId={selectedCompanyId}
                                  worker={worker as WorkerRow}
                                />
                              </TableCell>
                              <TableCell className="font-mono text-xs text-muted-foreground">
                                {display.apiKeyPrefix || "-"}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  ) : workerOperationalIssue ? (
                    <EmptyState text="Nenhum worker certificado para a empresa selecionada." />
                  ) : (
                    <EmptyState text="Nenhum worker retornado para esta empresa." />
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <Dialog open={companyDialog} onOpenChange={setCompanyDialog}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingCompany ? "Editar empresa" : "Nova empresa"}
            </DialogTitle>
            <DialogDescription>
              Dados da empresa e limites operacionais.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-2">
            <FormField label="Nome">
              <Input
                value={companyForm.name}
                onChange={(event) =>
                  setCompanyForm((form) => ({ ...form, name: event.target.value }))
                }
              />
            </FormField>
            <FormField label="Nome fantasia">
              <Input
                value={companyForm.trade_name}
                onChange={(event) =>
                  setCompanyForm((form) => ({
                    ...form,
                    trade_name: event.target.value,
                  }))
                }
              />
            </FormField>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <FormField label="CNPJ">
              <Input
                value={companyForm.cnpj}
                onChange={(event) =>
                  setCompanyForm((form) => ({ ...form, cnpj: event.target.value }))
                }
              />
            </FormField>
            <FormField label="Plano">
              <Select
                value={companyForm.plan}
                onValueChange={(plan) =>
                  setCompanyForm((form) => ({ ...form, plan }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="basic">Basic</SelectItem>
                  <SelectItem value="pro">Pro</SelectItem>
                  <SelectItem value="enterprise">Enterprise</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <FormField label="Timezone">
              <Input
                value={companyForm.timezone}
                onChange={(event) =>
                  setCompanyForm((form) => ({
                    ...form,
                    timezone: event.target.value,
                  }))
                }
              />
            </FormField>
            <FormField label="Limite de usuários">
              <Input
                type="number"
                min={1}
                value={companyForm.user_limit}
                onChange={(event) =>
                  setCompanyForm((form) => ({
                    ...form,
                    user_limit: event.target.value,
                  }))
                }
              />
            </FormField>
          </div>

          {editingCompany ? (
            <StatusSelect
              value={companyForm.active}
              onValueChange={(active) =>
                setCompanyForm((form) => ({ ...form, active }))
              }
            />
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCompanyDialog(false)}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={saveCompany} disabled={saving}>
              <Save className="h-4 w-4" />
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={userDialog} onOpenChange={handleUserDialogOpenChange}>
        <DialogContent className="max-h-[92vh] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingUser ? "Editar usuário" : "Novo usuário"}
            </DialogTitle>
            <DialogDescription>
              {selectedCompany ? selectedCompany.name : "Empresa selecionada"}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
            <div className="grid gap-4 md:grid-cols-2">
              <FormField label="Nome">
                <Input
                  value={userForm.name}
                  onChange={(event) => {
                    setUserForm((form) => ({ ...form, name: event.target.value }));
                  }}
                />
              </FormField>
              <FormField label="E-mail">
                <Input
                  type="email"
                  value={userForm.email}
                  onChange={(event) => {
                    setUserForm((form) => ({ ...form, email: event.target.value }));
                  }}
                />
              </FormField>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <FormField label={editingUser ? "Nova senha" : "Senha"}>
                <Input
                  type="password"
                  value={userForm.password}
                  placeholder={editingUser ? "Deixe em branco para manter" : ""}
                  onChange={(event) => {
                    setUserForm((form) => ({
                      ...form,
                      password: event.target.value,
                    }));
                  }}
                />
              </FormField>
              {editingUser ? (
                <StatusSelect
                  value={userForm.active}
                  onValueChange={(active) => {
                    setUserForm((form) => ({ ...form, active }));
                  }}
                />
              ) : (
                <div className="hidden md:block" />
              )}
            </div>

            <label
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-md border px-3 py-3 transition",
                userForm.isMaster
                  ? "border-primary/30 bg-primary/10"
                  : "border-border bg-card",
              )}
            >
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 accent-primary"
                checked={userForm.isMaster}
                onChange={(event) => setSuperAdminAccess(event.target.checked)}
              />
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <ShieldCheck className="h-4 w-4" />
                  Super-admin
                </span>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                  Acesso global ao Master. Salva o usuário com is_master=true e
                  não depende dos acessos operacionais.
                </span>
              </span>
            </label>

            <label
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-md border px-3 py-3 transition",
                userForm.isMaster && "cursor-default opacity-60",
                userForm.isCompanyAdmin
                  ? "border-primary/30 bg-primary/10"
                  : "border-border bg-card",
              )}
            >
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 accent-primary"
                checked={userForm.isCompanyAdmin}
                disabled={userForm.isMaster}
                onChange={(event) => setCompanyAdminAccess(event.target.checked)}
              />
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <ShieldCheck className="h-4 w-4" />
                  Administrador da empresa
                </span>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                  Usuário da empresa com todos os acessos operacionais
                  disponíveis. Não é superadmin.
                </span>
              </span>
            </label>

            <div className="rounded-md border border-border bg-card p-3">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-medium text-foreground">
                    Acessos operacionais
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Selecione o que este usuário pode configurar.
                  </div>
                </div>
                {loadingUserPermissions ? (
                  <Badge variant="outline">Carregando</Badge>
                ) : null}
              </div>

              {userForm.isMaster ? (
                <div className="mt-3 rounded-md border border-border bg-muted/20 px-3 py-3 text-sm text-muted-foreground">
                  Super-admin usa is_master=true. O frontend não chama
                  {` /users/{id}/permissions `}para este tipo de usuário.
                </div>
              ) : permissionGroups.length ? (
                <div className="mt-3 space-y-3">
                  {permissionGroups.map((group) => (
                    <div
                      key={group.key}
                      className="rounded-md border border-border bg-muted/20 p-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-medium text-foreground">
                          {group.name}
                        </div>
                        <Badge variant="outline">
                          {formatNumber(group.permissions.length)}
                        </Badge>
                      </div>

                      <div className="mt-3 grid gap-2 md:grid-cols-2">
                        {group.permissions.map((permission) => (
                          <label
                            key={permission.id}
                            className={cn(
                              "flex cursor-pointer items-start gap-3 rounded-md border px-3 py-3 transition",
                              userPermissions[permission.slug]
                                ? "border-primary/30 bg-primary/10"
                                : "border-border bg-card",
                              (loadingUserPermissions || permission.unavailable) &&
                                "cursor-default opacity-80",
                            )}
                          >
                            <input
                              type="checkbox"
                              className="mt-1 h-4 w-4 accent-primary"
                              checked={Boolean(userPermissions[permission.slug])}
                              disabled={loadingUserPermissions || permission.unavailable}
                              onChange={(event) =>
                                setUserPermissions((current) => {
                                  const next = {
                                    ...current,
                                    [permission.slug]: event.target.checked,
                                  };
                                  setUserForm((form) => ({
                                    ...form,
                                    isCompanyAdmin: hasAllAvailablePermissions(
                                      next,
                                      visiblePermissionOptions,
                                    ),
                                  }));
                                  return next;
                                })
                              }
                            />
                            <span className="min-w-0">
                              <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                                <span>{formatPermissionAction(permission)}</span>
                                {permission.unavailable ? (
                                  <Badge variant="outline">Indisponível</Badge>
                                ) : null}
                              </span>
                              <span className="mt-1 block break-words text-xs leading-5 text-muted-foreground">
                                {permission.description}
                              </span>
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-3">
                  <EmptyState text="Catálogo de permissões não retornado pela API." />
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={closeUserDialog}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={saveUser}
              disabled={saving || (!userForm.isMaster && loadingUserPermissions)}
            >
              <Save className="h-4 w-4" />
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={masterUserDialog} onOpenChange={setMasterUserDialog}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingMasterUser ? "Editar super-admin" : "Novo super-admin"}
            </DialogTitle>
            <DialogDescription>
              Acesso global para gestão de empresas e dashboards.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-2">
            <FormField label="Nome">
              <Input
                value={masterUserForm.name}
                onChange={(event) =>
                  setMasterUserForm((form) => ({
                    ...form,
                    name: event.target.value,
                  }))
                }
              />
            </FormField>
            <FormField label="E-mail">
              <Input
                type="email"
                value={masterUserForm.email}
                onChange={(event) =>
                  setMasterUserForm((form) => ({
                    ...form,
                    email: event.target.value,
                  }))
                }
              />
            </FormField>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <FormField label={editingMasterUser ? "Nova senha" : "Senha"}>
              <Input
                type="password"
                value={masterUserForm.password}
                placeholder={editingMasterUser ? "Deixe em branco para manter" : ""}
                onChange={(event) =>
                  setMasterUserForm((form) => ({
                    ...form,
                    password: event.target.value,
                  }))
                }
              />
            </FormField>
            {editingMasterUser ? (
              <StatusSelect
                value={masterUserForm.active}
                onValueChange={(active) =>
                  setMasterUserForm((form) => ({ ...form, active }))
                }
              />
            ) : (
              <div className="hidden md:block" />
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setMasterUserDialog(false)}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={saveMasterUser} disabled={saving}>
              <Save className="h-4 w-4" />
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase text-muted-foreground">
            {label}
          </div>
          <div className="mt-1 text-2xl font-semibold tracking-normal text-foreground">
            {value}
          </div>
          <div className="truncate text-xs text-muted-foreground">{detail}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function CompanySummary({
  company,
  loading,
}: {
  company: Company | null;
  loading: boolean;
}) {
  if (loading) {
    return <Skeleton className="h-32 w-full" />;
  }

  if (!company) {
    return (
      <Card>
        <CardContent className="p-4">
          <EmptyState text="Selecione uma empresa para ver detalhes." />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle>{company.name}</CardTitle>
          <CardDescription>
            {company.trade_name || company.cnpj || company.id}
          </CardDescription>
        </div>
        <StatusBadge active={company.active} />
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 text-sm sm:grid-cols-3">
          <Detail label="Plano" value={planLabels[company.plan ?? ""] ?? company.plan ?? "-"} />
          <Detail label="Timezone" value={company.timezone ?? "-"} />
          <Detail
            label="Atualizado"
            value={formatDateTime(company.updated_at ?? company.created_at)}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function CompanyManagementFlow({
  company,
  administrativeIssues,
  operationalIssues,
  loadingAdministrative,
  loadingOperational,
  stats,
  onOpenRoute,
  onOpenTab,
}: {
  company: Company | null;
  administrativeIssues: CompanyAdministrativeIssue[];
  operationalIssues: CompanyOperationalIssue[];
  loadingAdministrative: boolean;
  loadingOperational: boolean;
  stats:
    | (CompanyOperationalStats & {
        users: number | null;
      })
    | null;
  onOpenRoute: (path: string) => void;
  onOpenTab: (tab: CompanyTab) => void;
}) {
  const disabled = !company;
  const scenarioTotal =
    stats?.countingScenarios != null && stats.occupancyScenarios != null
      ? stats.countingScenarios + stats.occupancyScenarios
      : null;
  const steps = company
    ? [
        {
          index: "01",
          label: "Usuários",
          detail: certifiedCountDetail(
            stats?.users,
            loadingAdministrative,
            "Perfis e permissões",
          ),
          count: stats?.users ?? null,
          loading: loadingAdministrative,
          icon: Users,
          onClick: () => onOpenTab("users"),
        },
        {
          index: "02",
          label: "Workers",
          detail: certifiedCountDetail(
            stats?.workers,
            loadingOperational,
            "Edge e API key",
          ),
          count: stats?.workers ?? null,
          loading: loadingOperational,
          icon: ServerCog,
          onClick: () => onOpenTab("workers"),
        },
        {
          index: "03",
          label: "Algoritmos",
          detail: certifiedCountDetail(
            stats?.algorithms,
            loadingAdministrative,
            "Analíticos habilitados",
          ),
          count: stats?.algorithms ?? null,
          loading: loadingAdministrative,
          icon: CircuitBoard,
          onClick: () => onOpenTab("modules"),
        },
        {
          index: "04",
          label: "Câmeras",
          detail: certifiedCountDetail(
            stats?.cameras,
            loadingOperational,
            "Origem de vídeo",
          ),
          count: stats?.cameras ?? null,
          loading: loadingOperational,
          icon: CameraIcon,
          onClick: () => onOpenRoute("/manager/cameras"),
        },
        {
          index: "05",
          label: "Locations",
          detail: certifiedCountDetail(
            stats?.locations,
            loadingOperational,
            "Unidades principais",
          ),
          count: stats?.locations ?? null,
          loading: loadingOperational,
          icon: MapPinned,
          onClick: () => onOpenRoute("/manager/locations"),
        },
        {
          index: "06",
          label: "Sublocations",
          detail: certifiedCountDetail(
            stats?.subLocations,
            loadingOperational,
            "Grupos de câmeras",
          ),
          count: stats?.subLocations ?? null,
          loading: loadingOperational,
          icon: Network,
          onClick: () => onOpenRoute("/manager/locations#locations"),
        },
        {
          index: "07",
          label: "Cenários",
          detail:
            loadingOperational && scenarioTotal == null
              ? "Carregando..."
              : `${formatCertifiedCount(
                  stats?.countingScenarios,
                )} contagem / ${formatCertifiedCount(
                  stats?.occupancyScenarios,
                )} ocupação`,
          count: scenarioTotal,
          loading: loadingOperational,
          icon: ListChecks,
          onClick: () => onOpenRoute("/manager/scenarios"),
        },
      ]
    : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gestão da empresa</CardTitle>
        <CardDescription>
          {company ? company.name : "Selecione uma empresa para ver a hierarquia."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {administrativeIssues.length ? (
          <div className="rounded-md border border-amber-300/50 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-800 dark:text-amber-200">
            <span className="font-semibold">Dados administrativos parciais.</span>{" "}
            {administrativeIssues
              .map((issue) => `${issue.label}: ${issue.message}`)
              .join(" • ")}
          </div>
        ) : null}
        {operationalIssues.length ? (
          <div className="rounded-md border border-amber-300/50 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-800 dark:text-amber-200">
            <span className="font-semibold">Dados operacionais parciais.</span>{" "}
            {operationalIssues
              .map((issue) => `${issue.label}: ${issue.message}`)
              .join(" • ")}
          </div>
        ) : null}
        <div className="grid gap-2 md:grid-cols-2">
          {steps.map((step) => {
            const Icon = step.icon;

            return (
              <button
                key={step.index}
                type="button"
                className={cn(
                  "group flex min-h-20 items-center gap-3 rounded-md border border-border bg-background px-3 py-3 text-left transition",
                  "hover:border-primary/30 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
                )}
                onClick={step.onClick}
                disabled={disabled}
                data-premium-hover
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-muted-foreground">
                      {step.index}
                    </span>
                    <span className="truncate text-sm font-medium text-foreground">
                      {step.label}
                    </span>
                  </div>
                  <div className="mt-1 truncate text-xs text-muted-foreground">
                    {step.detail}
                  </div>
                </div>
                <div className="rounded-md border border-border bg-card px-2 py-1 text-xs font-semibold text-foreground">
                  {step.loading && step.count == null
                    ? "..."
                    : formatCertifiedCount(step.count)}
                </div>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/40 px-3 py-2">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 truncate font-medium text-foreground">{value}</div>
    </div>
  );
}

function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function StatusSelect({
  value,
  onValueChange,
}: {
  value: string;
  onValueChange: (value: string) => void;
}) {
  return (
    <FormField label="Status">
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="true">Ativo</SelectItem>
          <SelectItem value="false">Inativo</SelectItem>
        </SelectContent>
      </Select>
    </FormField>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <Badge variant={active ? "success" : "secondary"}>
      {active ? "Ativo" : "Inativo"}
    </Badge>
  );
}

function WorkerStatusBadge({ worker }: { worker: Worker }) {
  if (!worker.active) {
    return <Badge variant="secondary">Inativo</Badge>;
  }

  if (workerIsOnline(worker)) {
    return <Badge variant="success">Online</Badge>;
  }

  return <Badge variant="warning">Sem heartbeat</Badge>;
}

function WorkerScopeBadge({
  worker,
  companyId,
}: {
  worker: WorkerRow;
  companyId?: string | null;
}) {
  const scope = workerScopeDisplay(worker, companyId);

  return (
    <div className="space-y-1">
      <Badge variant={scope.variant}>{scope.label}</Badge>
      {scope.detail ? (
        <div className="max-w-[180px] truncate font-mono text-[11px] text-muted-foreground">
          {scope.detail}
        </div>
      ) : null}
    </div>
  );
}

const companyAdministrativeResourceLabels: Record<
  CompanyAdministrativeResource,
  string
> = {
  users: "Usuários",
  modules: "Algoritmos",
};

function buildCompanyAdministrativeIssue(
  resource: CompanyAdministrativeResource,
  reason: unknown,
): CompanyAdministrativeIssue {
  const rawMessage =
    reason instanceof Error && reason.message.trim()
      ? reason.message.trim()
      : "A API não certificou esta consulta.";
  const message = /fora da empresa autenticada|fora do escopo/i.test(rawMessage)
    ? "resposta fora do escopo da empresa selecionada"
    : rawMessage.replace(/[.!]+$/, "");

  return {
    resource,
    label: companyAdministrativeResourceLabels[resource],
    message,
  };
}

const companyOperationalResourceLabels: Record<
  CompanyOperationalResource,
  string
> = {
  workers: "Workers",
  locations: "Locations",
  subLocations: "Sublocations",
  cameras: "Câmeras",
  countingScenarios: "Cenários de contagem",
  occupancyScenarios: "Cenários de ocupação",
  infrastructure: "Infraestrutura",
};

function buildCompanyOperationalIssue(
  resource: CompanyOperationalResource,
  reason: unknown,
): CompanyOperationalIssue {
  const rawMessage =
    reason instanceof Error && reason.message.trim()
      ? reason.message.trim()
      : "A API não certificou esta consulta.";
  const message = /fora da empresa autenticada|fora do escopo/i.test(rawMessage)
    ? "resposta fora do escopo da empresa selecionada"
    : /company_id.*inválido ou ausente/i.test(rawMessage)
      ? "company_id ausente ou inválido na resposta"
      : /Locations não certificados/i.test(rawMessage)
        ? "dependência de Locations indisponível"
        : rawMessage.replace(/[.!]+$/, "");

  return {
    resource,
    label: companyOperationalResourceLabels[resource],
    message,
  };
}

function formatCertifiedCount(value?: number | null) {
  return typeof value === "number" ? formatNumber(value) : "—";
}

function certifiedCountDetail(
  value: number | null | undefined,
  loading: boolean,
  availableDetail: string,
) {
  if (loading && value == null) return "Carregando...";
  return value == null ? "Dados indisponíveis" : availableDetail;
}

function buildWorkerScopeWarning(
  foreignCount: number,
  unscopedCount: number,
  duplicateCount: number,
  selectedCompanyId?: string,
  foreignCompanyIds: string[] = [],
) {
  const messages = [];
  if (foreignCount) {
    const returnedScopes = foreignCompanyIds.length
      ? ` Recebido: ${foreignCompanyIds.join(", ")}.`
      : "";
    const requestedScope = selectedCompanyId
      ? ` Solicitado: ${selectedCompanyId}.`
      : "";
    messages.push(
      `${formatNumber(foreignCount)} worker(s) de outra empresa foram ocultados.${returnedScopes}${requestedScope}`,
    );
  }
  if (unscopedCount) {
    messages.push(
      foreignCount
        ? `${formatNumber(unscopedCount)} worker(s) sem company_id também foram ocultados.`
        : `${formatNumber(unscopedCount)} worker(s) sem company_id foram mantidos no escopo autenticado.`,
    );
  }
  if (duplicateCount) {
    messages.push(
      `${formatNumber(duplicateCount)} registro(s) duplicado(s) de revalidação foram consolidados pela cadeia de identidade do worker.`,
    );
  }

  return messages.join(" ");
}

async function fetchCompanySubLocations(
  locations: Location[],
  companyScopeIds: string[],
  companyScopeId: string,
) {
  const rows = await Promise.all(
    locations.map((location) => {
      return apiFetch<unknown>(
        `/locations/${location.id}/sub-locations`,
        { companyScopeId },
      ).then((value) => requireSubLocationRows(value, companyScopeId));
    }),
  );

  return filterRowsByCompanyScopes(
    requireSubLocationRows(rows.flat(), companyScopeId),
    companyScopeIds,
  );
}

async function fetchValidatedRows<T>(
  path: string,
  validate: (value: unknown, expectedCompanyId?: string | null) => T[],
  companyScopeId: string,
) {
  return apiFetch<unknown>(path, { companyScopeId }).then((value) =>
    validate(value, companyScopeId),
  );
}

async function fetchScopedWorkers(companyScopeId: string) {
  return apiFetch<unknown>("/workers", { companyScopeId })
    .then((value) => requireWorkerRows(value));
}

async function fetchScopedOccupancyScenarios(companyScopeId: string) {
  return apiFetch<unknown>("/occupancy/scenarios", { companyScopeId }).then(
    (value) => requireOccupancyScenarioRows(value, companyScopeId),
  );
}

function filterRowsByCompanyScopes<T>(
  rows: T[],
  companyScopeIds: string[],
  options: {
    allowUnscoped?: boolean;
    resolveCompanyId?: (row: T) => string | null | undefined;
  } = {},
) {
  const scopeIds = uniqueScopeIds(companyScopeIds);
  if (!scopeIds.length) return rows;

  const hasForeignCompanyRows = rows.some((row) => {
    const entityCompanyId = getScopedRowCompanyId(row, options.resolveCompanyId);
    return entityCompanyId && !scopeIds.includes(entityCompanyId);
  });

  return rows.filter((row) => {
    const entityCompanyId = getScopedRowCompanyId(row, options.resolveCompanyId);
    if (!entityCompanyId) return options.allowUnscoped ?? !hasForeignCompanyRows;
    return scopeIds.includes(entityCompanyId);
  });
}

function uniqueScopeIds(...groups: Array<string | null | undefined | Array<string | null | undefined>>) {
  const ids = new Set<string>();

  groups.flat().forEach((value) => {
    const id = value?.trim();
    if (id) ids.add(id);
  });

  return [...ids];
}

function uniqueRowsById<T extends { id?: string | null }>(rows: T[]) {
  const seen = new Set<string>();

  return rows.filter((row, index) => {
    const id = row.id?.trim();
    const key = id || `row-${index}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function enabledOperationalModuleCount(
  assignments: CompanyModule[],
  modules: IpxModule[],
) {
  const modulesById = new Map(modules.map((module) => [module.id, module]));
  const enabledFamilies = new Set<AlgorithmModuleFamily>();

  assignments.forEach((assignment) => {
    if (!assignment.enabled) return false;
    const family = algorithmModuleFamily(
      assignment.module ?? modulesById.get(assignment.module_id) ?? assignment.module_id,
    );
    if (family) enabledFamilies.add(family);
  });

  return enabledFamilies.size;
}

function workerIsOnline(worker: Worker) {
  const lastSeenAt = getWorkerDisplayInfo(worker).lastSeenAt;
  if (!worker.active || !lastSeenAt) return false;

  const lastSeen = new Date(lastSeenAt).getTime();
  if (Number.isNaN(lastSeen)) return false;

  return Date.now() - lastSeen <= 5 * 60_000;
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-dashed bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 4 }).map((_, index) => (
        <Skeleton key={index} className="h-12 w-full" />
      ))}
    </div>
  );
}

function createPermissionState(
  permissions: UserPermission[] = [],
  options: PermissionOption[] = [],
) {
  const grantedPermissionIds = new Set(
    permissions
      .filter(permissionIsEnabled)
      .map(getPermissionRecordId)
      .filter(Boolean),
  );
  const grantedSlugs = new Set(
    permissions
      .filter((permission) => permission.slug && permissionIsEnabled(permission))
      .map((permission) => permission.slug),
  );
  const grantedModuleIds = new Set(
    permissions
      .filter(permissionIsEnabled)
      .map(getPermissionModuleId)
      .filter(Boolean),
  );
  const hasGranularPermissionMatches = options.some(
    (option) =>
      option.grants.some((grant) => grantedPermissionIds.has(grant.id)) ||
      option.slugs.some((slug) => grantedSlugs.has(slug)),
  );

  return Object.fromEntries(
    options.map((option) => {
      const hasExactGrant =
        option.grants.some((grant) => grantedPermissionIds.has(grant.id)) ||
        option.slugs.some((slug) => grantedSlugs.has(slug));
      const hasModuleGrant =
        !hasGranularPermissionMatches &&
        option.module_id &&
        grantedModuleIds.has(option.module_id);

      return [option.slug, Boolean(hasExactGrant || hasModuleGrant)];
    }),
  );
}

function hasAllAvailablePermissions(
  state: Record<string, boolean>,
  options: PermissionOption[],
) {
  const availableOptions = options.filter((option) => !option.unavailable);
  return (
    availableOptions.length > 0 &&
    availableOptions.every((option) => Boolean(state[option.slug]))
  );
}

function getPermissionRecordId(permission: UserPermission) {
  return permission.permission_id ?? permission.id;
}

function getPermissionModuleId(
  permission: Pick<UserPermission, "module_id" | "module">,
) {
  return permission.module_id ?? permission.module?.id ?? "";
}

function permissionIsEnabled(permission: UserPermission) {
  const flags = [
    permission.can_view,
    permission.can_create,
    permission.can_edit,
    permission.can_delete,
    permission.can_export,
  ].filter((value): value is boolean => typeof value === "boolean");

  return flags.length ? flags.some(Boolean) : true;
}

function isBackendGrantablePermissionOption(option: PermissionOption) {
  return (
    option.grants.length > 0 &&
    option.slug !== "dashboard_widgets_manage" &&
    option.slug !== "locations_manage"
  );
}

function userPermissionMatchesOption(
  permission: UserPermission,
  option: PermissionOption,
) {
  const permissionId = getPermissionRecordId(permission);
  const permissionSlug = permission.slug?.trim();

  return Boolean(
    (permissionId && option.grants.some((grant) => grant.id === permissionId)) ||
      (permissionSlug && option.slugs.includes(permissionSlug)),
  );
}

async function grantUserPermission(
  userId: string,
  option: PermissionOption,
  existingSlugs: Set<string>,
  enabledModuleIds: Set<string>,
  companyScopeId: string,
) {
  const grantSlugs = uniqueStrings(
    option.grants
      .filter((grant) => grant.module_id && enabledModuleIds.has(grant.module_id))
      .map((grant) => grant.slug),
  );

  for (const slug of grantSlugs) {
    if (existingSlugs.has(slug)) continue;

    try {
      await apiFetch(`/users/${userId}/permissions`, {
        method: "POST",
        body: { slug },
        companyScopeId,
      });
      existingSlugs.add(slug);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        existingSlugs.add(slug);
        continue;
      }

      if (error instanceof ApiError && error.status === 404) {
        throw error;
      }

      if (error instanceof Error && error.message.includes("module not enabled")) {
        throw new Error(
          `Habilite o módulo da permissão "${option.label}" para esta empresa antes de salvar o acesso.`,
        );
      }

      if (error instanceof ApiError && error.status === 500) {
        throw new Error(
          `Falha ao conceder "${option.label}" (${slug}). Esta rota usa a empresa assinada no JWT e não possui operação cross-company documentada para o superadmin.`,
        );
      }

      const detail = error instanceof Error ? error.message : "erro desconhecido";
      throw new Error(
        `Falha ao conceder "${option.label}" (${slug}). Backend retornou: ${detail}`,
      );
    }
  }
}

async function revokeUserPermission(
  userId: string,
  permissionId: string,
  companyScopeId: string,
) {
  return apiFetch(`/users/${userId}/permissions/${permissionId}`, {
    method: "DELETE",
    companyScopeId,
  });
}

function groupPermissionCatalog(permissions: PermissionOption[]): PermissionGroup[] {
  return [
    {
      key: "operational",
      name: "Acessos operacionais",
      permissions,
    },
  ];
}

function formatPermissionAction(permission: PermissionOption) {
  return permission.label;
}

function normalizeSlug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function selectVisibleAlgorithmModules(modules: IpxModule[]) {
  const byFamily = new Map<AlgorithmModuleFamily, IpxModule>();

  modules.forEach((module) => {
    const family = algorithmModuleFamily(module);
    if (!family) return;

    const current = byFamily.get(family);
    if (!current || isBetterAlgorithmModule(module, current, family)) {
      byFamily.set(family, module);
    }
  });

  return Array.from(byFamily.entries())
    .sort(([left], [right]) => algorithmFamilyOrder(left) - algorithmFamilyOrder(right))
    .map(([, module]) => module);
}

function algorithmModuleFamily(
  module: IpxModule | string | null | undefined,
): AlgorithmModuleFamily | "" {
  if (!module) return "";

  const rawSlug = typeof module === "string" ? module : module.slug;
  const rawName = typeof module === "string" ? "" : module.name;
  const slug = normalizeSlug(rawSlug ?? "");
  const name = normalizeSlug(rawName ?? "");

  for (const definition of algorithmModuleDefinitions) {
    const aliases = definition.aliases.map(normalizeSlug);
    if (aliases.includes(slug) || aliases.includes(name)) {
      return definition.family;
    }
  }

  return "";
}

function algorithmModuleLabel(module: IpxModule) {
  const family = algorithmModuleFamily(module);
  return (
    algorithmModuleDefinitions.find((definition) => definition.family === family)
      ?.label ?? module.name
  );
}

function algorithmFamilyOrder(family: AlgorithmModuleFamily) {
  return family === "counting" ? 0 : 1;
}

function isBetterAlgorithmModule(
  candidate: IpxModule,
  current: IpxModule,
  family: AlgorithmModuleFamily,
) {
  const definition = algorithmModuleDefinitions.find(
    (item) => item.family === family,
  );
  const aliases = definition?.aliases.map(normalizeSlug) ?? [];
  const candidateSlug = normalizeSlug(candidate.slug);
  const currentSlug = normalizeSlug(current.slug);
  const candidateExactSlug = aliases.includes(candidateSlug);
  const currentExactSlug = aliases.includes(currentSlug);

  if (candidateExactSlug !== currentExactSlug) return candidateExactSlug;
  if (candidate.active !== current.active) return candidate.active;
  return candidate.name.localeCompare(current.name, "pt-BR") < 0;
}

function isSupportedModule(module: IpxModule | string | null | undefined) {
  return Boolean(algorithmModuleFamily(module));
}

function resolveOperationalPermissionOptions(
  catalog: Permission[],
): PermissionOption[] {
  return OPERATIONAL_PERMISSIONS.map((definition) => {
    const matches = catalog.filter((permission) =>
      permissionMatchesOperationalDefinition(permission, definition),
    );
    const supportedMatches = matches.filter((permission) =>
      isSupportedModule(permission.module?.slug ?? permission.module_id),
    );
    const selectedMatches = supportedMatches.length ? supportedMatches : matches;
    const slugs = Array.from(
      new Set(selectedMatches.map((permission) => permission.slug).filter(Boolean)),
    );
    const grants = uniquePermissionGrants(
      selectedMatches.map((permission) => ({
        id: permission.id,
        module_id: getPermissionModuleId(permission) || undefined,
        slug: permission.slug,
      })),
    );
    const primary = selectedMatches[0];
    const moduleId = primary ? getPermissionModuleId(primary) : "";

    return {
      id: definition.slug,
      module_id: moduleId || undefined,
      slug: definition.slug,
      label: definition.label,
      description: moduleId
        ? definition.description
        : `${definition.description} Módulo não encontrado no catálogo da API.`,
      slugs: slugs.length ? slugs : [definition.slug],
      grants,
      unavailable: !moduleId,
    };
  });
}

function uniquePermissionGrants(grants: PermissionGrantOption[]) {
  const bySlug = new Map<string, PermissionGrantOption>();
  grants.forEach((grant) => {
    if (!grant.slug || bySlug.has(grant.slug)) return;
    bySlug.set(grant.slug, grant);
  });
  return Array.from(bySlug.values());
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function permissionMatchesOperationalDefinition(
  permission: Permission,
  definition: OperationalPermissionDefinition,
) {
  if (permission.slug === definition.slug) return true;
  if (
    definition.aliases?.some(
      (alias) => normalizeSlug(alias) === normalizeSlug(permission.slug),
    )
  ) {
    return true;
  }

  const permissionText = normalizeSlug(
    [
      permission.slug,
      permission.action,
      permission.module?.slug,
      permission.module?.name,
    ]
      .filter(Boolean)
      .join(" "),
  );

  return (
    definition.terms.some((term) => permissionText.includes(normalizeSlug(term))) &&
    (isMutatingPermission(permission) || Boolean(getPermissionModuleId(permission)))
  );
}

function isMutatingPermission(permission: Permission) {
  const text = normalizeSlug([permission.slug, permission.action].join(" "));

  return [
    "manage",
    "admin",
    "create",
    "edit",
    "update",
    "delete",
    "write",
    "configure",
    "config",
    "rotate",
  ].some((term) => text.includes(term));
}
