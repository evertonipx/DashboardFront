"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  BrainCog,
  Building2,
  CircuitBoard,
  Edit,
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

import { DeferredAiInsightsDashboard as AiInsightsDashboard } from "@/components/app/deferred-route-panels";
import { useAuth } from "@/components/app/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  discoverCompanyUserResource,
  mutateCompanyUserResource,
  readCompanyUserResourceAtRoute,
  type CompanyUserResourceRoute,
} from "@/lib/company-user-resource";
import {
  buildCompanyUserProfileUpdate,
  certifyCompanyUserMutationIdentity,
} from "@/lib/company-user-profile-update";
import {
  normalizeCompanyRecord,
  writeCompanyCache,
} from "@/lib/company-cache";
import { canonicalCompanyTimeZone } from "@/lib/company-time-zone";
import {
  enabledCompanyAdminGrantSlugs,
  enabledCompanyAdminOperationalSlugs,
  enabledPermissionGrantSlugs,
  isCertifiedCompanyAdminState,
  missingCompanyAdminPermissionSlugs,
  resolvePermissionMutation,
} from "@/lib/company-admin-permission-policy";
import {
  promoteCompanyUserToAdminAdditively,
  readCertifiedCompanyUserMembership,
  type AdditiveCompanyAdminGrant,
} from "@/lib/company-user-additive-admin";
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
  operationalPermissionDefinitionForGrant,
  type OperationalModuleFamily,
} from "@/lib/permissions";
import { requireScenarioRows } from "@/lib/scenario-validation";
import { selectExplicitCompanyScopedRows } from "@/lib/tenant-scope-validation";
import type {
  Location,
  Permission,
  UserPermission,
  Worker,
} from "@/lib/types";
import { cn, formatDateTime, formatNumber } from "@/lib/utils";
import { getWorkerDisplayInfo } from "@/lib/worker-display";
import {
  collapseWorkerIdentityChains,
  partitionWorkersByCompanyScope,
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
  category: "product" | "administrative";
  key: string;
  name: string;
  permissions: PermissionOption[];
};

type PermissionOption = {
  category: "product" | "administrative";
  group_key: string;
  group_name: string;
  id: string;
  module_id: string;
  module_name: string;
  module_slug: string;
  slug: string;
  action: string;
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

type CompanyTab =
  | "companies"
  | "users"
  | "modules"
  | "workers"
  | "insights"
  | "masters";

type CompanyOperationalResource =
  | "workers"
  | "locations"
  | "subLocations"
  | "cameras"
  | "countingScenarios"
  | "occupancyScenarios";

type CompanyOperationalWarning = {
  resource: CompanyOperationalResource;
  label: string;
  message: string;
};

type CompanyOperationalStats = {
  modules: number;
  cameras: number | null;
  locations: number | null;
  subLocations: number | null;
  countingScenarios: number | null;
  occupancyScenarios: number | null;
  workers: number | null;
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

const MASTER_USER_DISCOVERY_CONCURRENCY = 4;

const masterSections = new Set<CompanyTab>([
  "companies",
  "users",
  "modules",
  "workers",
  "insights",
  "masters",
]);

function readInitialMasterSection(): CompanyTab {
  if (typeof window === "undefined") return "companies";

  const section = new URLSearchParams(window.location.search).get("section");
  if (section === "overview") return "companies";
  return section && masterSections.has(section as CompanyTab)
    ? (section as CompanyTab)
    : "companies";
}

type AlgorithmModuleFamily = "counting" | "occupancy" | "demographics";

const algorithmModuleDefinitions: Array<{
  aliases: readonly string[];
  description: string;
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
    description: "Fluxo de pessoas, comparativos e desempenho operacional.",
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
    description: "Uso dos ambientes, permanência e capacidade por área.",
    family: "occupancy",
    label: "Ocupação",
  },
  {
    aliases: [
      "demographics",
      "demographic",
      "people demographics",
      "demografia",
      "demografico",
      "demográfico",
    ],
    description: "Distribuição por gênero, faixa etária e emoções.",
    family: "demographics",
    label: "Demographics",
  },
];

export function SuperAdminDashboard() {
  const router = useRouter();
  const { user: currentUser } = useAuth();
  const [companies, setCompanies] = React.useState<Company[]>([]);
  const [users, setUsers] = React.useState<ManagedUser[]>([]);
  const [masterUsers, setMasterUsers] = React.useState<ManagedUser[]>([]);
  const [masterUsersLoaded, setMasterUsersLoaded] = React.useState(false);
  const [loadingMasterUsers, setLoadingMasterUsers] = React.useState(false);
  const [workers, setWorkers] = React.useState<Worker[]>([]);
  const [modules, setModules] = React.useState<IpxModule[]>([]);
  const [companyModules, setCompanyModules] = React.useState<CompanyModule[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = React.useState("");
  const [activeCompanyTab, setActiveCompanyTab] =
    React.useState<CompanyTab>(readInitialMasterSection);
  const [checkedCompanyIds, setCheckedCompanyIds] = React.useState<Set<string>>(
    () => new Set(),
  );
  const [checkedCompanyUserIds, setCheckedCompanyUserIds] = React.useState<
    Set<string>
  >(() => new Set());
  const [checkedMasterUserIds, setCheckedMasterUserIds] = React.useState<
    Set<string>
  >(() => new Set());
  const [updatingCompanies, setUpdatingCompanies] = React.useState(false);
  const [updatingCompanyUsers, setUpdatingCompanyUsers] = React.useState(false);
  const [updatingMasterUsers, setUpdatingMasterUsers] = React.useState(false);
  const [companyQuery, setCompanyQuery] = React.useState("");
  const [userQuery, setUserQuery] = React.useState("");
  const [masterUserQuery, setMasterUserQuery] = React.useState("");
  const [companyStats, setCompanyStats] =
    React.useState<CompanyOperationalStats | null>(null);
  const [companyDetailsError, setCompanyDetailsError] = React.useState("");
  const [companyModulesError, setCompanyModulesError] = React.useState("");
  const [moduleCatalogError, setModuleCatalogError] = React.useState("");
  const [permissionCatalogError, setPermissionCatalogError] =
    React.useState("");
  const [companyOperationalWarnings, setCompanyOperationalWarnings] =
    React.useState<CompanyOperationalWarning[]>([]);
  const [loadedCompanyId, setLoadedCompanyId] = React.useState("");
  const [loadedCompanyModulesId, setLoadedCompanyModulesId] =
    React.useState("");
  const [loadedWorkersCompanyId, setLoadedWorkersCompanyId] =
    React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [loadingDetails, setLoadingDetails] = React.useState(false);
  const [loadingCompanyModules, setLoadingCompanyModules] =
    React.useState(false);
  const [loadingModuleCatalog, setLoadingModuleCatalog] =
    React.useState(false);
  const [moduleCatalogLoaded, setModuleCatalogLoaded] = React.useState(false);
  const [loadingPermissionCatalog, setLoadingPermissionCatalog] =
    React.useState(false);
  const [permissionCatalogLoaded, setPermissionCatalogLoaded] =
    React.useState(false);
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
  const [userProfileDirty, setUserProfileDirty] = React.useState(false);
  const [masterUserForm, setMasterUserForm] =
    React.useState<UserFormState>(emptyUserForm);
  const [permissionCatalog, setPermissionCatalog] = React.useState<Permission[]>([]);
  const [userPermissions, setUserPermissions] = React.useState<Record<string, boolean>>(
    {},
  );
  const [userPermissionBaseline, setUserPermissionBaseline] = React.useState<
    Record<string, boolean>
  >({});
  const [userPermissionBaselineCertified, setUserPermissionBaselineCertified] =
    React.useState(false);
  const [touchedUserPermissionSlugs, setTouchedUserPermissionSlugs] =
    React.useState<Set<string>>(() => new Set());
  const [companyAdminPromotionRequested, setCompanyAdminPromotionRequested] =
    React.useState(false);
  const [additiveAdminPromotionContext, setAdditiveAdminPromotionContext] =
    React.useState<{ companyId: string; userId: string } | null>(null);
  const [loadingUserPermissions, setLoadingUserPermissions] =
    React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [deletingCompanyId, setDeletingCompanyId] = React.useState("");
  const [deletingUserId, setDeletingUserId] = React.useState("");
  const [updatingModuleId, setUpdatingModuleId] = React.useState("");
  const [workerScopeWarning, setWorkerScopeWarning] = React.useState("");
  const companyDetailsRequestSequenceRef = React.useRef(0);
  const companyDetailsRequestControllerRef =
    React.useRef<AbortController | null>(null);
  const workerRequestSequenceRef = React.useRef(0);
  const workerRequestControllerRef = React.useRef<AbortController | null>(null);
  const companyModulesRequestSequenceRef = React.useRef(0);
  const companyModulesRequestControllerRef =
    React.useRef<AbortController | null>(null);
  const moduleCatalogPromiseRef = React.useRef<Promise<IpxModule[]> | null>(null);
  const permissionCatalogPromiseRef =
    React.useRef<Promise<Permission[]> | null>(null);
  const masterUsersRequestSequenceRef = React.useRef(0);
  const companyUsersCacheRef = React.useRef(
    new Map<string, ManagedUser[]>(),
  );
  const companyModulesCacheRef = React.useRef(
    new Map<string, CompanyModule[]>(),
  );
  const companyWorkersCacheRef = React.useRef(new Map<string, Worker[]>());
  const modulesRef = React.useRef<IpxModule[]>([]);
  const dashboardMountedRef = React.useRef(true);
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
      setUserPermissionBaseline({});
      setUserPermissionBaselineCertified(false);
      setTouchedUserPermissionSlugs(new Set());
      setCompanyAdminPromotionRequested(false);
      setAdditiveAdminPromotionContext(null);

      if (closeDialog) {
        setUserDialog(false);
        setEditingUser(null);
        setUserProfileDirty(false);
      }
    },
    [],
  );

  const closeUserDialog = React.useCallback(() => {
    invalidateUserPermissionRequest({ closeDialog: true });
  }, [invalidateUserPermissionRequest]);

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
      companyDetailsRequestControllerRef.current?.abort(
        new DOMException("Outra empresa foi selecionada.", "AbortError"),
      );
      companyDetailsRequestControllerRef.current = null;
      companyDetailsRequestSequenceRef.current += 1;
      workerRequestControllerRef.current?.abort(
        new DOMException("Outra empresa foi selecionada.", "AbortError"),
      );
      workerRequestControllerRef.current = null;
      workerRequestSequenceRef.current += 1;
      companyModulesRequestControllerRef.current?.abort(
        new DOMException("Outra empresa foi selecionada.", "AbortError"),
      );
      companyModulesRequestControllerRef.current = null;
      companyModulesRequestSequenceRef.current += 1;
      invalidateUserPermissionRequest({ closeDialog: true });
      const cachedUsers = companyUsersCacheRef.current.get(nextCompanyId);
      const cachedModules = companyModulesCacheRef.current.get(nextCompanyId);
      const cachedWorkers = companyWorkersCacheRef.current.get(nextCompanyId);
      setUsers(
        cachedUsers
          ? companyNonMasterUsersForScope(cachedUsers, nextCompanyId)
          : [],
      );
      setCompanyModules(cachedModules ?? []);
      setWorkers(cachedWorkers ?? []);
      setLoadedCompanyId(cachedUsers ? nextCompanyId : "");
      setLoadedCompanyModulesId(cachedModules ? nextCompanyId : "");
      setLoadedWorkersCompanyId(cachedWorkers ? nextCompanyId : "");
      setCompanyDetailsError("");
      setCompanyModulesError("");
      setCompanyOperationalWarnings([]);
      setWorkerScopeWarning("");
      setCheckedCompanyUserIds(new Set());
      setCompanyStats(
        cachedModules || cachedWorkers
          ? {
              modules: cachedModules
                ? enabledCompanyModuleCount(cachedModules, modulesRef.current)
                : 0,
              cameras: null,
              locations: null,
              subLocations: null,
              countingScenarios: null,
              occupancyScenarios: null,
              workers: cachedWorkers?.length ?? null,
            }
          : null,
      );
      setSelectedCompanyId(nextCompanyId);
    },
    [invalidateUserPermissionRequest],
  );

  const canPublishCompanyDetails = React.useCallback(
    (requestSequence: number, companyId: string) =>
      dashboardMountedRef.current &&
      requestSequence === companyDetailsRequestSequenceRef.current &&
      selectedCompanyIdRef.current === companyId,
    [],
  );

  React.useEffect(() => {
    dashboardMountedRef.current = true;
    return () => {
      dashboardMountedRef.current = false;
      companyDetailsRequestControllerRef.current?.abort(
        new DOMException("A gestão da empresa foi fechada.", "AbortError"),
      );
      companyDetailsRequestControllerRef.current = null;
      workerRequestControllerRef.current?.abort(
        new DOMException("A gestão da empresa foi fechada.", "AbortError"),
      );
      workerRequestControllerRef.current = null;
      companyModulesRequestControllerRef.current?.abort(
        new DOMException("A gestão da empresa foi fechada.", "AbortError"),
      );
      companyModulesRequestControllerRef.current = null;
      companyDetailsRequestSequenceRef.current += 1;
      workerRequestSequenceRef.current += 1;
      companyModulesRequestSequenceRef.current += 1;
      masterUsersRequestSequenceRef.current += 1;
      userPermissionRequestSequenceRef.current += 1;
    };
  }, []);

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

  const checkedVisibleCompanyCount = React.useMemo(
    () =>
      filteredCompanies.reduce(
        (total, company) => total + Number(checkedCompanyIds.has(company.id)),
        0,
      ),
    [checkedCompanyIds, filteredCompanies],
  );
  const allVisibleCompaniesChecked = Boolean(
    filteredCompanies.length &&
      checkedVisibleCompanyCount === filteredCompanies.length,
  );

  React.useEffect(() => {
    const companyIds = new Set(companies.map((company) => company.id));
    setCheckedCompanyIds((current) => {
      const next = new Set(
        Array.from(current).filter((companyId) => companyIds.has(companyId)),
      );
      return next.size === current.size ? current : next;
    });
  }, [companies]);

  const companyUsersForSelectedScope = React.useMemo(
    () => companyNonMasterUsersForScope(users, selectedCompanyId),
    [selectedCompanyId, users],
  );

  const filteredUsers = React.useMemo(() => {
    const query = userQuery.trim().toLowerCase();
    if (!query) return companyUsersForSelectedScope;

    return companyUsersForSelectedScope.filter((user) =>
      [user.name, user.email]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [companyUsersForSelectedScope, userQuery]);

  const checkedVisibleCompanyUserCount = React.useMemo(
    () =>
      filteredUsers.reduce(
        (total, managedUser) =>
          total + Number(checkedCompanyUserIds.has(managedUser.id)),
        0,
      ),
    [checkedCompanyUserIds, filteredUsers],
  );
  const allVisibleCompanyUsersChecked = Boolean(
    filteredUsers.length &&
      checkedVisibleCompanyUserCount === filteredUsers.length,
  );

  const filteredMasterUsers = React.useMemo(() => {
    const query = masterUserQuery.trim().toLowerCase();
    if (!query) return masterUsers;

    return masterUsers.filter((user) =>
      [user.name, user.email]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [masterUserQuery, masterUsers]);

  const selectableFilteredMasterUsers = React.useMemo(
    () =>
      filteredMasterUsers.filter(
        (managedUser) => managedUser.id !== currentUser?.id,
      ),
    [currentUser?.id, filteredMasterUsers],
  );
  const checkedVisibleMasterUserCount = React.useMemo(
    () =>
      selectableFilteredMasterUsers.reduce(
        (total, managedUser) =>
          total + Number(checkedMasterUserIds.has(managedUser.id)),
        0,
      ),
    [checkedMasterUserIds, selectableFilteredMasterUsers],
  );
  const allVisibleMasterUsersChecked = Boolean(
    selectableFilteredMasterUsers.length &&
      checkedVisibleMasterUserCount === selectableFilteredMasterUsers.length,
  );

  React.useEffect(() => {
    const userIds = new Set(
      companyUsersForSelectedScope.map((managedUser) => managedUser.id),
    );
    setCheckedCompanyUserIds((current) => {
      const next = new Set(
        Array.from(current).filter((userId) => userIds.has(userId)),
      );
      return next.size === current.size ? current : next;
    });
  }, [companyUsersForSelectedScope]);

  React.useEffect(() => {
    const userIds = new Set(
      masterUsers
        .filter((managedUser) => managedUser.id !== currentUser?.id)
        .map((managedUser) => managedUser.id),
    );
    setCheckedMasterUserIds((current) => {
      const next = new Set(
        Array.from(current).filter((userId) => userIds.has(userId)),
      );
      return next.size === current.size ? current : next;
    });
  }, [currentUser?.id, masterUsers]);

  const visibleModules = React.useMemo(
    () => selectVisibleProductModules(modules),
    [modules],
  );

  const operationalPermissionOptions = React.useMemo(
    () => resolveOperationalPermissionOptions(permissionCatalog, modules),
    [modules, permissionCatalog],
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
              ? `${option.description} Habilite o módulo ou recurso correspondente antes de conceder este acesso.`
              : option.description,
        };
      }),
    [enabledCompanyModuleIds, operationalPermissionOptions],
  );

  const permissionGroups = React.useMemo(
    () => groupPermissionCatalog(visiblePermissionOptions),
    [visiblePermissionOptions],
  );
  const additiveAdminPromotionMode = Boolean(
    editingUser &&
      !userPermissionBaselineCertified &&
      additiveAdminPromotionContext?.companyId === selectedCompanyId &&
      additiveAdminPromotionContext?.userId === editingUser.id,
  );

  const loadCompanies = React.useCallback(async () => {
    setLoading(true);
    try {
      const companyPayload = await apiFetch<Company[]>("/companies");
      if (!dashboardMountedRef.current) return;
      const companyRows = companyPayload.map(normalizeCompanyRecord);

      setCompanies(companyRows);
      writeCompanyCache(companyRows);
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
      if (!dashboardMountedRef.current) return;
      setWorkers([]);
      setWorkerScopeWarning("");
      setCompanyOperationalWarnings([]);
      toast.error(
        managementErrorMessage(error, "Não foi possível carregar as empresas."),
      );
    } finally {
      if (dashboardMountedRef.current) setLoading(false);
    }
  }, [currentUser, selectCompanyId]);

  const loadModuleCatalog = React.useCallback(async (
    { force = false }: { force?: boolean } = {},
  ) => {
    if (!force && moduleCatalogLoaded) return modulesRef.current;
    if (moduleCatalogPromiseRef.current) {
      return moduleCatalogPromiseRef.current;
    }

    setLoadingModuleCatalog(true);
    setModuleCatalogError("");
    const request = apiFetch<IpxModule[]>("/modules")
      .then((rows) => {
        if (!dashboardMountedRef.current) return rows;
        modulesRef.current = rows;
        setModules(rows);
        setModuleCatalogLoaded(true);
        return rows;
      })
      .catch((error) => {
        if (dashboardMountedRef.current) {
          setModuleCatalogError(
            managementErrorMessage(
              error,
              "Não foi possível carregar o catálogo de módulos.",
            ),
          );
        }
        throw error;
      })
      .finally(() => {
        if (moduleCatalogPromiseRef.current === request) {
          moduleCatalogPromiseRef.current = null;
        }
        if (dashboardMountedRef.current) setLoadingModuleCatalog(false);
      });
    moduleCatalogPromiseRef.current = request;
    return request;
  }, [moduleCatalogLoaded]);

  const loadPermissionCatalog = React.useCallback(async (
    { force = false }: { force?: boolean } = {},
  ) => {
    if (!force && permissionCatalogLoaded) return permissionCatalog;
    if (permissionCatalogPromiseRef.current) {
      return permissionCatalogPromiseRef.current;
    }

    setLoadingPermissionCatalog(true);
    setPermissionCatalogError("");
    const request = apiFetch<Permission[]>("/permissions")
      .then((rows) => {
        if (!dashboardMountedRef.current) return rows;
        setPermissionCatalog(rows);
        setPermissionCatalogLoaded(true);
        return rows;
      })
      .catch((error) => {
        if (dashboardMountedRef.current) {
          setPermissionCatalogError(
            managementErrorMessage(
              error,
              "Não foi possível carregar as opções de acesso.",
            ),
          );
        }
        throw error;
      })
      .finally(() => {
        if (permissionCatalogPromiseRef.current === request) {
          permissionCatalogPromiseRef.current = null;
        }
        if (dashboardMountedRef.current) setLoadingPermissionCatalog(false);
      });
    permissionCatalogPromiseRef.current = request;
    return request;
  }, [permissionCatalog, permissionCatalogLoaded]);

  const loadMasterUsers = React.useCallback(async (
    { force = false }: { force?: boolean } = {},
  ) => {
    if (loading || (!force && masterUsersLoaded)) return;

    const requestSequence = ++masterUsersRequestSequenceRef.current;
    const companyRows = companies;
    setLoadingMasterUsers(true);
    try {
      const companyUserRows = await mapWithConcurrency(
        companyRows,
        MASTER_USER_DISCOVERY_CONCURRENCY,
        async (company) => {
          if (requestSequence !== masterUsersRequestSequenceRef.current) {
            return [];
          }
          const cached = companyUsersCacheRef.current.get(company.id);
          if (!force && cached) return cached;

          const rows = await apiFetch<ManagedUser[]>(
            `/companies/${company.id}/users`,
            { companyScopeId: company.id },
          ).catch(() => []);
          const scopedRows = rows.flatMap((user) => {
            const returnedCompanyId = getScopedRowCompanyId(user);
            if (returnedCompanyId && returnedCompanyId !== company.id) {
              return [];
            }
            return [{ ...user, company_id: company.id }];
          });
          companyUsersCacheRef.current.set(company.id, scopedRows);
          return scopedRows;
        },
      );
      if (requestSequence !== masterUsersRequestSequenceRef.current) return;

      setMasterUsers(
        uniqueRowsById(companyUserRows.flat()).filter((user) => user.is_master),
      );
      setMasterUsersLoaded(true);
    } finally {
      if (requestSequence === masterUsersRequestSequenceRef.current) {
        setLoadingMasterUsers(false);
      }
    }
  }, [companies, loading, masterUsersLoaded]);

  const loadCompanyDetails = React.useCallback(async (
    expectedCompanyId: string,
    {
      force = false,
      includeOperational = false,
    }: { force?: boolean; includeOperational?: boolean } = {},
  ) => {
    const companyId = expectedCompanyId.trim();
    if (selectedCompanyIdRef.current !== companyId) return;

    const cachedUsers = companyUsersCacheRef.current.get(companyId);
    const cachedModules = companyModulesCacheRef.current.get(companyId);
    if (!force && !includeOperational && cachedUsers && cachedModules) {
      setUsers(companyNonMasterUsersForScope(cachedUsers, companyId));
      setCompanyModules(cachedModules);
      setLoadedCompanyId(companyId);
      setLoadedCompanyModulesId(companyId);
      setCompanyDetailsError("");
      return;
    }

    companyDetailsRequestControllerRef.current?.abort(
      new DOMException("Outra empresa foi selecionada.", "AbortError"),
    );
    const controller = new AbortController();
    companyDetailsRequestControllerRef.current = controller;
    const requestSequence = ++companyDetailsRequestSequenceRef.current;
    if (!companyId) {
      companyDetailsRequestControllerRef.current = null;
      setUsers([]);
      setCompanyModules([]);
      setWorkers([]);
      setWorkerScopeWarning("");
      setCompanyOperationalWarnings([]);
      setCompanyStats(null);
      setCompanyDetailsError("");
      setLoadedCompanyId("");
      setLoadedCompanyModulesId("");
      setLoadedWorkersCompanyId("");
      setLoadingDetails(false);
      setLoadingOperationalDetails(false);
      return;
    }

    setLoadingDetails(true);
    if (includeOperational) setLoadingOperationalDetails(true);
    if (includeOperational) setCompanyStats(null);
    setCompanyDetailsError("");
    setLoadedCompanyId("");
    if (includeOperational) {
      setWorkerScopeWarning("");
      setCompanyOperationalWarnings([]);
    }
    let administrativeDetailsCertified = false;
    let certifiedModuleRows: CompanyModule[] = [];
    try {
      const [userRows, moduleRows] = await Promise.all([
        apiFetch<ManagedUser[]>(`/companies/${companyId}/users`, {
          companyScopeId: companyId,
          signal: controller.signal,
        }),
        apiFetch<CompanyModule[]>(
          `/companies/${companyId}/modules`,
          { companyScopeId: companyId, signal: controller.signal },
        ),
      ]);
      const companyScopeIds = uniqueScopeIds(companyId);
      const scopedModuleRows = selectExplicitCompanyScopedRows(
        moduleRows,
        companyId,
        { label: "módulos da empresa" },
      ).rows as CompanyModule[];
      const scopedUserRows = userRows.filter((user) => {
        const userCompanyId = getScopedRowCompanyId(user);
        return !userCompanyId || companyScopeIds.includes(userCompanyId);
      });
      const certifiedScopedUserRows = scopedUserRows.map((user) => ({
        ...user,
        company_id: companyId,
      }));
      if (!canPublishCompanyDetails(requestSequence, companyId)) return;
      companyUsersCacheRef.current.set(
        companyId,
        certifiedScopedUserRows,
      );

      // Administrative data is certified independently from the operational
      // resources below. A broken tenant scope in Workers or Scenarios must not
      // erase users and modules that came from company-scoped routes.
      administrativeDetailsCertified = true;
      certifiedModuleRows = scopedModuleRows;
      setUsers(companyNonMasterUsersForScope(certifiedScopedUserRows, companyId));
      setCompanyModules(scopedModuleRows);
      setLoadedCompanyModulesId(companyId);
      companyModulesCacheRef.current.set(companyId, scopedModuleRows);
      setLoadedCompanyId(companyId);
      setLoadingDetails(false);
      setCompanyStats((current) => ({
        modules: enabledCompanyModuleCount(
          scopedModuleRows,
          modulesRef.current,
        ),
        cameras: current?.cameras ?? null,
        locations: current?.locations ?? null,
        subLocations: current?.subLocations ?? null,
        countingScenarios: current?.countingScenarios ?? null,
        occupancyScenarios: current?.occupancyScenarios ?? null,
        workers: current?.workers ?? null,
      }));
      if (!includeOperational) return;
      // Let React publish the user/module controls before starting the wider
      // operational catalog fan-out used only by the summary and collectors.
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      if (!canPublishCompanyDetails(requestSequence, companyId)) return;
      const [
        workerResult,
        locationResult,
        cameraResult,
        scenarioResult,
        occupancyScenarioResult,
      ] = await Promise.allSettled([
        fetchScopedWorkers(companyId, controller.signal),
        fetchValidatedRows(
          "/locations",
          requireLocationRows,
          companyId,
          controller.signal,
        ),
        fetchValidatedRows(
          "/cameras",
          requireCameraRows,
          companyId,
          controller.signal,
        ),
        fetchValidatedRows(
          "/scenarios",
          requireScenarioRows,
          companyId,
          controller.signal,
        ),
        fetchScopedOccupancyScenarios(companyId, controller.signal),
      ]);
      const operationalWarnings: CompanyOperationalWarning[] = [];
      const workerRows = certifiedSettledRows(
        workerResult,
        "workers",
        "Workers",
        operationalWarnings,
      );
      const locationRows = certifiedSettledRows(
        locationResult,
        "locations",
        "Locais",
        operationalWarnings,
      );
      const cameraRows = certifiedSettledRows(
        cameraResult,
        "cameras",
        "Câmeras",
        operationalWarnings,
      );
      const scenarioRows = certifiedSettledRows(
        scenarioResult,
        "countingScenarios",
        "Cenários de Contagem",
        operationalWarnings,
      );
      const occupancyScenarioRows = certifiedSettledRows(
        occupancyScenarioResult,
        "occupancyScenarios",
        "Cenários de Ocupação",
        operationalWarnings,
      );
      const workerScopePartition = partitionWorkersByCompanyScope(
        workerRows ?? [],
        companyScopeIds,
      );
      const scopedLocations = locationRows
        ? filterRowsByCompanyScopes(locationRows, companyScopeIds)
        : null;
      const scopedScenarios = scenarioRows
        ? filterRowsByCompanyScopes(scenarioRows, companyScopeIds)
        : null;
      const scopedOccupancyScenarios = occupancyScenarioRows
        ? filterRowsByCompanyScopes(occupancyScenarioRows, companyScopeIds)
        : null;
      let subLocationRows: Awaited<
        ReturnType<typeof fetchCompanySubLocations>
      > | null = null;
      if (scopedLocations) {
        try {
          subLocationRows = await fetchCompanySubLocations(
            scopedLocations,
            companyScopeIds,
            companyId,
            controller.signal,
          );
          requireInfrastructureRelations({
            cameras: [],
            locations: scopedLocations,
            subLocations: subLocationRows,
          });
        } catch (error) {
          subLocationRows = null;
          operationalWarnings.push(
            operationalResourceWarning(
              "subLocations",
              "Sublocais",
              error,
            ),
          );
        }
      }
      let scopedCameras = cameraRows
        ? filterRowsByCompanyScopes(cameraRows, companyScopeIds)
        : null;
      if (scopedCameras && scopedLocations) {
        try {
          requireInfrastructureRelations({
            cameras: scopedCameras,
            locations: scopedLocations,
            subLocations: subLocationRows ?? undefined,
          });
        } catch (error) {
          scopedCameras = null;
          operationalWarnings.push(
            operationalResourceWarning("cameras", "Câmeras", error),
          );
        }
      }
      const collapsedWorkerRows = collapseWorkerIdentityChains(
        workersFromExplicitCompanyScope(workerScopePartition),
      );

      if (!canPublishCompanyDetails(requestSequence, companyId)) return;

      setWorkers(
        workerRows ? sortWorkersByActivity(collapsedWorkerRows) : [],
      );
      setCompanyStats({
        modules: enabledCompanyModuleCount(
          scopedModuleRows,
          modulesRef.current,
        ),
        cameras: scopedCameras?.length ?? null,
        locations: scopedLocations?.length ?? null,
        subLocations: subLocationRows?.length ?? null,
        countingScenarios: scopedScenarios?.length ?? null,
        occupancyScenarios: scopedOccupancyScenarios?.length ?? null,
        workers: workerRows ? collapsedWorkerRows.length : null,
      });
      setCompanyOperationalWarnings(operationalWarnings);
      setWorkerScopeWarning("");
    } catch (error) {
      if (!canPublishCompanyDetails(requestSequence, companyId)) return;
      const message = managementErrorMessage(
        error,
        "Não foi possível carregar os dados da empresa.",
      );
      if (includeOperational) {
        setWorkers([]);
        setWorkerScopeWarning("");
      }
      if (administrativeDetailsCertified) {
        setCompanyStats({
          modules: enabledCompanyModuleCount(
            certifiedModuleRows,
            modulesRef.current,
          ),
          cameras: null,
          locations: null,
          subLocations: null,
          countingScenarios: null,
          occupancyScenarios: null,
          workers: null,
        });
        if (includeOperational) {
          setCompanyOperationalWarnings(
            allOperationalResourceWarnings(message),
          );
        }
        toast.warning(
          "Parte dos dados operacionais está indisponível. Usuários e módulos foram preservados.",
        );
      } else {
        setUsers([]);
        setCompanyModules([]);
        if (includeOperational) {
          setCompanyOperationalWarnings([]);
          setCompanyStats(null);
        }
        setCompanyDetailsError(message);
        setLoadedCompanyId("");
        toast.error(message);
      }
    } finally {
      if (canPublishCompanyDetails(requestSequence, companyId)) {
        setLoadingDetails(false);
        if (includeOperational) setLoadingOperationalDetails(false);
      }
      if (companyDetailsRequestControllerRef.current === controller) {
        companyDetailsRequestControllerRef.current = null;
      }
    }
  }, [canPublishCompanyDetails]);

  const loadCompanyModules = React.useCallback(async (
    expectedCompanyId: string,
    { force = false }: { force?: boolean } = {},
  ) => {
    const companyId = expectedCompanyId.trim();
    if (!companyId || selectedCompanyIdRef.current !== companyId) return;

    const cached = companyModulesCacheRef.current.get(companyId);
    if (!force && cached) {
      setCompanyModules(cached);
      setLoadedCompanyModulesId(companyId);
      setCompanyModulesError("");
      return;
    }

    companyModulesRequestControllerRef.current?.abort(
      new DOMException("A consulta de módulos foi substituída.", "AbortError"),
    );
    const controller = new AbortController();
    companyModulesRequestControllerRef.current = controller;
    const requestSequence = ++companyModulesRequestSequenceRef.current;
    setLoadingCompanyModules(true);
    setCompanyModulesError("");

    try {
      const moduleRows = await apiFetch<CompanyModule[]>(
        `/companies/${companyId}/modules`,
        { companyScopeId: companyId, signal: controller.signal },
      );
      const scopedRows = selectExplicitCompanyScopedRows(
        moduleRows,
        companyId,
        { label: "módulos da empresa" },
      ).rows as CompanyModule[];
      if (
        controller.signal.aborted ||
        requestSequence !== companyModulesRequestSequenceRef.current ||
        selectedCompanyIdRef.current !== companyId
      ) {
        return;
      }
      companyModulesCacheRef.current.set(companyId, scopedRows);
      setCompanyModules(scopedRows);
      setLoadedCompanyModulesId(companyId);
      setCompanyStats((current) => ({
        modules: enabledCompanyModuleCount(scopedRows, modulesRef.current),
        cameras: current?.cameras ?? null,
        locations: current?.locations ?? null,
        subLocations: current?.subLocations ?? null,
        countingScenarios: current?.countingScenarios ?? null,
        occupancyScenarios: current?.occupancyScenarios ?? null,
        workers: current?.workers ?? null,
      }));
    } catch (error) {
      if (
        controller.signal.aborted ||
        requestSequence !== companyModulesRequestSequenceRef.current ||
        selectedCompanyIdRef.current !== companyId
      ) {
        return;
      }
      setCompanyModules([]);
      setLoadedCompanyModulesId(companyId);
      setCompanyModulesError(
        managementErrorMessage(
          error,
          "Não foi possível carregar os módulos desta empresa.",
        ),
      );
    } finally {
      if (
        requestSequence === companyModulesRequestSequenceRef.current &&
        selectedCompanyIdRef.current === companyId
      ) {
        setLoadingCompanyModules(false);
      }
      if (companyModulesRequestControllerRef.current === controller) {
        companyModulesRequestControllerRef.current = null;
      }
    }
  }, []);

  const loadCompanyWorkers = React.useCallback(async (
    expectedCompanyId: string,
    { force = false }: { force?: boolean } = {},
  ) => {
    const companyId = expectedCompanyId.trim();
    if (!companyId || selectedCompanyIdRef.current !== companyId) return;

    const cached = companyWorkersCacheRef.current.get(companyId);
    if (!force && cached) {
      setWorkers(cached);
      setLoadedWorkersCompanyId(companyId);
      setCompanyOperationalWarnings([]);
      setCompanyStats((current) => ({
        modules: current?.modules ?? 0,
        cameras: current?.cameras ?? null,
        locations: current?.locations ?? null,
        subLocations: current?.subLocations ?? null,
        countingScenarios: current?.countingScenarios ?? null,
        occupancyScenarios: current?.occupancyScenarios ?? null,
        workers: cached.length,
      }));
      return;
    }

    workerRequestControllerRef.current?.abort(
      new DOMException("A consulta de Workers foi substituída.", "AbortError"),
    );
    const controller = new AbortController();
    workerRequestControllerRef.current = controller;
    const requestSequence = ++workerRequestSequenceRef.current;
    setLoadingOperationalDetails(true);
    setCompanyOperationalWarnings([]);
    setWorkerScopeWarning("");

    try {
      const workerRows = await fetchScopedWorkers(companyId, controller.signal);
      const scopedRows = collapseWorkerIdentityChains(
        workersFromExplicitCompanyScope(
          partitionWorkersByCompanyScope(workerRows, uniqueScopeIds(companyId)),
        ),
      );
      const sortedRows = sortWorkersByActivity(scopedRows);
      if (
        controller.signal.aborted ||
        requestSequence !== workerRequestSequenceRef.current ||
        selectedCompanyIdRef.current !== companyId
      ) {
        return;
      }
      companyWorkersCacheRef.current.set(companyId, sortedRows);
      setWorkers(sortedRows);
      setLoadedWorkersCompanyId(companyId);
      setCompanyStats((current) => ({
        modules: current?.modules ?? 0,
        cameras: current?.cameras ?? null,
        locations: current?.locations ?? null,
        subLocations: current?.subLocations ?? null,
        countingScenarios: current?.countingScenarios ?? null,
        occupancyScenarios: current?.occupancyScenarios ?? null,
        workers: sortedRows.length,
      }));
    } catch (error) {
      if (
        controller.signal.aborted ||
        requestSequence !== workerRequestSequenceRef.current ||
        selectedCompanyIdRef.current !== companyId
      ) {
        return;
      }
      setWorkers([]);
      setLoadedWorkersCompanyId(companyId);
      setCompanyOperationalWarnings([
        operationalResourceWarning("workers", "Workers", error),
      ]);
    } finally {
      if (
        requestSequence === workerRequestSequenceRef.current &&
        selectedCompanyIdRef.current === companyId
      ) {
        setLoadingOperationalDetails(false);
      }
      if (workerRequestControllerRef.current === controller) {
        workerRequestControllerRef.current = null;
      }
    }
  }, []);

  React.useEffect(() => {
    loadCompanies();
  }, [loadCompanies]);

  const ensureCompanyTimeZone = React.useCallback(async (
    company: Company,
    notifyFailure = false,
  ) => {
    const normalizedCompany = normalizeCompanyRecord(company);
    const currentResolution = getCompanyTimeZoneResolutionForScope(
      currentUser,
      company.id,
    );
    const declaredTimeZone = canonicalCompanyTimeZone(
      normalizedCompany.timezone,
    );
    const currentTimeZone =
      declaredTimeZone ??
      (!currentResolution.fallback &&
      currentResolution.source === "current-user-company"
        ? currentResolution.timeZone
        : null);
    if (currentTimeZone) {
      return { ...normalizedCompany, timezone: currentTimeZone };
    }

    try {
      const response = await apiFetch<Company>(`/companies/${company.id}`, {
        companyScopeId: company.id,
      });
      if (response.id?.trim() !== company.id) {
        throw new Error("Os dados recebidos não correspondem à empresa selecionada.");
      }
      const detailedCompany = normalizeCompanyRecord(response);
      const timeZone = canonicalCompanyTimeZone(detailedCompany.timezone);
      if (!timeZone) {
        throw new Error(
          "A empresa ainda não possui um fuso horário válido.",
        );
      }
      const certifiedCompany = {
        ...normalizedCompany,
        ...detailedCompany,
        id: company.id,
        timezone: timeZone,
      };
      setCompanies((current) =>
        current.map((row) =>
          row.id === certifiedCompany.id ? certifiedCompany : row,
        ),
      );
      writeCompanyCache([certifiedCompany]);
      return certifiedCompany;
    } catch (error) {
      if (notifyFailure) {
        toast.error(
          managementErrorMessage(
            error,
            "Não foi possível confirmar o fuso horário da empresa.",
          ),
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
    const selectedTimezone =
      canonicalCompanyTimeZone(selectedCompany.timezone) ??
      (!resolution.fallback ? resolution.timeZone : null);
    if (
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
  }, [currentUser, selectedCompany]);

  React.useEffect(() => {
    if (loading || !selectedCompanyId) return;

    if (activeCompanyTab === "users") {
      void Promise.allSettled([
        loadModuleCatalog(),
        loadPermissionCatalog(),
        loadCompanyDetails(selectedCompanyId),
      ]);
      return;
    }

    if (activeCompanyTab === "modules") {
      void Promise.allSettled([
        loadModuleCatalog(),
        loadCompanyModules(selectedCompanyId),
      ]);
      return;
    }

    if (activeCompanyTab === "workers") {
      void loadCompanyWorkers(selectedCompanyId);
    }
  }, [
    activeCompanyTab,
    loadCompanyDetails,
    loadCompanyModules,
    loadCompanyWorkers,
    loadModuleCatalog,
    loadPermissionCatalog,
    loading,
    selectedCompanyId,
  ]);

  React.useEffect(() => {
    if (loading || loadingMasterUsers || masterUsersLoaded) return;
    if (activeCompanyTab !== "masters") return;
    void loadMasterUsers();
  }, [
    activeCompanyTab,
    loadMasterUsers,
    loading,
    loadingMasterUsers,
    masterUsersLoaded,
  ]);

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
    if (
      loadingModuleCatalog ||
      loadingPermissionCatalog ||
      !moduleCatalogLoaded ||
      !permissionCatalogLoaded
    ) {
      toast.error("Aguarde o carregamento das opções de acesso.");
      return;
    }

    invalidateUserPermissionRequest();
    setEditingUser(user ?? null);
    setUserProfileDirty(false);
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
    } else {
      setUserPermissionBaseline({});
      setUserPermissionBaselineCertified(true);
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

    if (
      editingUser &&
      !userPermissionBaselineCertified &&
      !additiveAdminPromotionMode
    ) {
      toast.error(
        "Não foi possível confirmar o vínculo deste usuário com a empresa selecionada. Nenhum acesso foi alterado.",
      );
      return;
    }

    if (!enabled) {
      if (companyAdminPromotionRequested) {
        setCompanyAdminPromotionRequested(false);
        setTouchedUserPermissionSlugs(new Set());
        setUserPermissions(userPermissionBaseline);
        setUserForm((form) => ({
          ...form,
          isCompanyAdmin: isCertifiedCompanyAdminState(
            userPermissionBaseline,
            visiblePermissionOptions,
            enabledCompanyModuleIds,
          ),
        }));
        return;
      }

      toast.info(
        "Para retirar acesso administrativo com segurança, desmarque apenas os acessos operacionais desejados.",
      );
      return;
    }

    const uncertifiablePermissionSlugs = missingCompanyAdminPermissionSlugs(
      visiblePermissionOptions,
      enabledCompanyModuleIds,
    );
    if (uncertifiablePermissionSlugs.length) {
      toast.error(
        companyAdminCertificationErrorMessage(
          uncertifiablePermissionSlugs,
          visiblePermissionOptions,
        ),
      );
      return;
    }

    const companyAdminOptions = visiblePermissionOptions.filter(
      (option) =>
        enabledCompanyAdminGrantSlugs(option, enabledCompanyModuleIds).length > 0,
    );
    if (!companyAdminOptions.length) {
      toast.error(
        "Nenhum acesso de gestão está disponível nos módulos habilitados desta empresa.",
      );
      return;
    }
    setCompanyAdminPromotionRequested(true);
    setTouchedUserPermissionSlugs(
      additiveAdminPromotionMode
        ? new Set()
        : new Set(
            companyAdminOptions
              .filter(
                (option) =>
                  enabledPermissionGrantSlugs(option, enabledCompanyModuleIds)
                    .length > 0,
              )
              .map((option) => option.slug),
          ),
    );
    setUserForm((form) => ({ ...form, isCompanyAdmin: true }));
    setUserPermissions((current) => ({
      ...current,
      ...Object.fromEntries(
        companyAdminOptions.map((option) => [option.slug, true]),
      ),
    }));
  }

  function setPermissionGroupAccess(group: PermissionGroup, enabled: boolean) {
    const editablePermissions = group.permissions.filter(
      (permission) => !permission.unavailable,
    );
    if (!editablePermissions.length || loadingUserPermissions) return;

    setCompanyAdminPromotionRequested(false);
    setTouchedUserPermissionSlugs((current) => {
      const next = new Set(current);
      editablePermissions.forEach((permission) => next.add(permission.slug));
      return next;
    });
    setUserPermissions((current) => {
      const next = { ...current };
      editablePermissions.forEach((permission) => {
        next[permission.slug] = enabled;
      });
      setUserForm((form) => ({
        ...form,
        isCompanyAdmin: isCertifiedCompanyAdminState(
          next,
          visiblePermissionOptions,
          enabledCompanyModuleIds,
        ),
      }));
      return next;
    });
  }

  function setUserProfileField(
    field: "name" | "email" | "password" | "active",
    value: string,
  ) {
    setUserProfileDirty(true);
    setUserForm((form) => ({ ...form, [field]: value }));
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

  function changeMasterSection(tab: CompanyTab) {
    setActiveCompanyTab(tab);
    const url = new URL(window.location.href);
    if (tab === "companies") {
      url.searchParams.delete("section");
    } else {
      url.searchParams.set("section", tab);
    }
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }

  function toggleCompanyChecked(companyId: string, checked: boolean) {
    setCheckedCompanyIds((current) => {
      const next = new Set(current);
      if (checked) next.add(companyId);
      else next.delete(companyId);
      return next;
    });
  }

  function toggleVisibleCompanies(checked: boolean) {
    setCheckedCompanyIds((current) => {
      const next = new Set(current);
      filteredCompanies.forEach((company) => {
        if (checked) next.add(company.id);
        else next.delete(company.id);
      });
      return next;
    });
  }

  function toggleCompanyUserChecked(userId: string, checked: boolean) {
    setCheckedCompanyUserIds((current) => {
      const next = new Set(current);
      if (checked) next.add(userId);
      else next.delete(userId);
      return next;
    });
  }

  function toggleVisibleCompanyUsers(checked: boolean) {
    setCheckedCompanyUserIds((current) => {
      const next = new Set(current);
      filteredUsers.forEach((managedUser) => {
        if (checked) next.add(managedUser.id);
        else next.delete(managedUser.id);
      });
      return next;
    });
  }

  function toggleMasterUserChecked(userId: string, checked: boolean) {
    if (userId === currentUser?.id) return;
    setCheckedMasterUserIds((current) => {
      const next = new Set(current);
      if (checked) next.add(userId);
      else next.delete(userId);
      return next;
    });
  }

  function toggleVisibleMasterUsers(checked: boolean) {
    setCheckedMasterUserIds((current) => {
      const next = new Set(current);
      selectableFilteredMasterUsers.forEach((managedUser) => {
        if (checked) next.add(managedUser.id);
        else next.delete(managedUser.id);
      });
      return next;
    });
  }

  async function updateCheckedCompanyStatus(active: boolean) {
    const selectedRows = companies.filter((company) =>
      checkedCompanyIds.has(company.id),
    );
    if (!selectedRows.length) return;

    const action = active ? "ativar" : "desativar";
    if (
      !window.confirm(
        `${active ? "Ativar" : "Desativar"} ${selectedRows.length} empresa(s) selecionada(s)?`,
      )
    ) {
      return;
    }

    setUpdatingCompanies(true);
    const results = await mapWithConcurrency(
      selectedRows,
      MASTER_USER_DISCOVERY_CONCURRENCY,
      async (company) => {
        try {
          await apiFetch(`/companies/${company.id}`, {
            companyScopeId: company.id,
            method: "PUT",
            body: { name: company.name, active },
          });
          return { company, ok: true } as const;
        } catch {
          return { company, ok: false } as const;
        }
      },
    );
    const updatedIds = new Set(
      results.filter((result) => result.ok).map((result) => result.company.id),
    );
    const failedCount = results.length - updatedIds.size;
    const updatedCompanies = selectedRows
      .filter((company) => updatedIds.has(company.id))
      .map((company) => ({ ...company, active }));

    if (updatedIds.size) {
      setCompanies((current) =>
        current.map((company) =>
          updatedIds.has(company.id) ? { ...company, active } : company,
        ),
      );
      writeCompanyCache(updatedCompanies);
      setCheckedCompanyIds((current) => {
        const next = new Set(current);
        updatedIds.forEach((companyId) => next.delete(companyId));
        return next;
      });
    }

    if (failedCount) {
      toast.error(
        `${failedCount} empresa(s) não puderam ser ${action === "ativar" ? "ativadas" : "desativadas"}. As demais foram atualizadas.`,
      );
    } else {
      toast.success(
        `${updatedIds.size} empresa(s) ${active ? "ativadas" : "desativadas"}.`,
      );
    }
    setUpdatingCompanies(false);
  }

  async function deleteCheckedCompanies() {
    const selectedRows = companies.filter((company) =>
      checkedCompanyIds.has(company.id),
    );
    if (!selectedRows.length) return;

    if (
      !window.confirm(
        [
          `Excluir permanentemente ${selectedRows.length} empresa(s) selecionada(s)?`,
          "Esta ação removerá também os dados vinculados às empresas excluídas e não poderá ser desfeita.",
        ].join("\n\n"),
      )
    ) {
      return;
    }

    setUpdatingCompanies(true);
    try {
      const results = await mapWithConcurrency(
        selectedRows,
        MASTER_USER_DISCOVERY_CONCURRENCY,
        async (company) => {
          try {
            await apiFetch(`/companies/${company.id}`, {
              companyScopeId: company.id,
              method: "DELETE",
            });
            return { company, ok: true } as const;
          } catch (error) {
            return { company, error, ok: false } as const;
          }
        },
      );
      const deletedIds = new Set(
        results.filter((result) => result.ok).map((result) => result.company.id),
      );
      const failedCount = results.length - deletedIds.size;

      if (deletedIds.size) {
        deletedIds.forEach((companyId) => {
          companyUsersCacheRef.current.delete(companyId);
          companyModulesCacheRef.current.delete(companyId);
          companyWorkersCacheRef.current.delete(companyId);
        });
        const storedScope = getStoredMasterCompanyScope();
        if (storedScope && deletedIds.has(storedScope.id)) {
          clearStoredMasterCompanyScope();
        }
        if (deletedIds.has(selectedCompanyIdRef.current)) {
          selectCompanyId("");
        }
        setCompanies((current) =>
          current.filter((company) => !deletedIds.has(company.id)),
        );
        setCheckedCompanyIds((current) => {
          const next = new Set(current);
          deletedIds.forEach((companyId) => next.delete(companyId));
          return next;
        });
        await loadCompanies();
      }

      if (failedCount) {
        toast.error(
          `${deletedIds.size} empresa(s) excluída(s); ${failedCount} não puderam ser excluída(s).`,
        );
      } else {
        toast.success(`${deletedIds.size} empresa(s) excluída(s).`);
      }
    } finally {
      setUpdatingCompanies(false);
    }
  }

  async function loadUserPermissions(userId: string, companyId: string) {
    const requestedUserId = userId.trim();
    const requestedCompanyId = companyId.trim();
    const expectedEmail =
      users.find((user) => user.id === requestedUserId)?.email ?? "";
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
      const { value: permissions } = await discoverCompanyUserResource<
        UserPermission[]
      >(
        requestedCompanyId,
        requestedUserId,
        "/permissions",
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
      setUserPermissionBaseline(permissionState);
      setUserPermissionBaselineCertified(true);
      setTouchedUserPermissionSlugs(new Set());
      setCompanyAdminPromotionRequested(false);
      setAdditiveAdminPromotionContext(null);
      setUserForm((form) => ({
        ...form,
        isCompanyAdmin: isCertifiedCompanyAdminState(
          permissionState,
          visiblePermissionOptions,
          enabledCompanyModuleIds,
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
      let additiveMembershipCertified = false;
      if (error instanceof ApiError && error.status === 404) {
        try {
          await readCertifiedCompanyUserMembership({
            companyId: requestedCompanyId,
            expectedEmail,
            userId: requestedUserId,
          });
          additiveMembershipCertified = true;
        } catch {
          additiveMembershipCertified = false;
        }
      }
      if (
        !isCurrentUserPermissionRequest(
          requestSequence,
          requestedUserId,
          requestedCompanyId,
        )
      ) {
        return;
      }

      if (additiveMembershipCertified) {
        toast.warning(
          "Os acessos atuais não puderam ser consultados. É possível apenas promover o usuário a Administrador da empresa, sem remover acessos existentes.",
        );
      } else {
        toast.error(
          error instanceof ApiError && error.status === 404
            ? "Não foi possível confirmar este usuário na empresa selecionada. Os acessos permanecem inalterados."
            : managementErrorMessage(
                error,
                "Não foi possível carregar os acessos do usuário.",
              ),
        );
      }
      setUserPermissions({});
      setUserPermissionBaseline({});
      setUserPermissionBaselineCertified(false);
      setTouchedUserPermissionSlugs(new Set());
      setCompanyAdminPromotionRequested(false);
      setAdditiveAdminPromotionContext(
        additiveMembershipCertified
          ? { companyId: requestedCompanyId, userId: requestedUserId }
          : null,
      );
      const membershipUser = users.find((user) => user.id === requestedUserId);
      if (additiveMembershipCertified && membershipUser) {
        setUserProfileDirty(false);
        setUserForm({
          name: membershipUser.name,
          email: membershipUser.email,
          password: "",
          active: String(membershipUser.active),
          isMaster: false,
          isCompanyAdmin: false,
        });
      }
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
      toast.error("Informe um fuso horário válido para a empresa.");
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
      toast.error(
        managementErrorMessage(error, "Não foi possível salvar a empresa."),
      );
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
      ? `Resumo carregado: ${formatCertifiedCount(usersCount)} usuário(s) e ${formatCertifiedCount(workersCount)} Worker(s).`
      : "";
    const message = [
      `Excluir a empresa "${company.name}"?`,
      "Esta ação é permanente e removerá os dados vinculados a esta empresa.",
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
        setUsers([]);
        setCompanyModules([]);
        setWorkers([]);
        setWorkerScopeWarning("");
        setCompanyOperationalWarnings([]);
        setCompanyStats(null);
        setCompanyDetailsError("");
        setLoadedCompanyId("");
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

    const editingUserCompanyId = editingUser
      ? getScopedRowCompanyId(editingUser)
      : "";
    if (editingUserCompanyId && editingUserCompanyId !== companyId) {
      toast.error(
        "O usuário aberto não pertence mais à empresa selecionada. Reabra o cadastro pela empresa correta.",
      );
      return;
    }

    if (userForm.isCompanyAdmin) {
      const uncertifiablePermissionSlugs = missingCompanyAdminPermissionSlugs(
        visiblePermissionOptions,
        enabledCompanyModuleIds,
      );
      if (uncertifiablePermissionSlugs.length) {
        toast.error(
          companyAdminCertificationErrorMessage(
            uncertifiablePermissionSlugs,
            visiblePermissionOptions,
          ),
        );
        return;
      }
    }

    setSaving(true);
    try {
      if (additiveAdminPromotionMode) {
        if (
          !editingUser ||
          userForm.isMaster ||
          userProfileDirty ||
          touchedUserPermissionSlugs.size > 0 ||
          !companyAdminPromotionRequested ||
          !userForm.isCompanyAdmin
        ) {
          throw new Error(
            "Neste modo restrito somente a promoção aditiva para Administrador da empresa pode ser salva. Nenhum acesso foi alterado.",
          );
        }

        await promoteCompanyUserToAdminAdditively({
          companyId,
          expectedEmail: editingUser.email,
          grants: additiveCompanyAdminGrants(
            visiblePermissionOptions,
            enabledCompanyModuleIds,
          ),
          userId: editingUser.id,
        });
        toast.success(
          "Perfil de Administrador da empresa aplicado com sucesso.",
        );
        closeUserDialog();
        await loadCompanyDetails(companyId, { force: true });
        return;
      }

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
        setMasterUsersLoaded(false);
        setMasterUsers([]);
        await loadCompanies();
        await loadCompanyDetails(companyId, { force: true });
        return;
      }

      let savedUser: ManagedUser | undefined;
      let profileUpdateWarning = "";
      const hasAccessMutation =
        companyAdminPromotionRequested || touchedUserPermissionSlugs.size > 0;

      if (editingUser) {
        savedUser = editingUser;
        const profileUpdate = buildCompanyUserProfileUpdate(
          editingUser,
          {
            name,
            email,
            password,
            active: userForm.active === "true",
          },
          { profileTouched: userProfileDirty },
        );
        if (profileUpdate) {
          try {
            const { route } = await discoverCompanyUserResource<ManagedUser>(
              companyId,
              editingUser.id,
              "",
            );
            savedUser = await mutateCompanyUserResource<
              ManagedUser | undefined
            >(
              route,
              "",
              { method: "PUT", body: profileUpdate },
            );
          } catch (error) {
            if (
              !(error instanceof ApiError) ||
              error.status !== 404 ||
              !hasAccessMutation
            ) {
              throw error;
            }

            // A falha da rota de perfil não pode impedir uma alteração de
            // acesso que usa a identidade já certificada pela listagem da
            // empresa. A sincronização abaixo continua de forma independente.
            profileUpdateWarning =
              "Os acessos foram processados, mas os dados cadastrais não puderam ser atualizados.";
            savedUser = editingUser;
          }
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
      if (hasAccessMutation) {
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
            permissionSyncError = managementErrorMessage(
              error,
              "Não foi possível sincronizar os acessos do usuário.",
            );
          }
        } else {
          permissionSyncError =
            "O usuário foi salvo, mas não foi possível concluir a configuração dos acessos.";
        }
      }

      if (permissionSyncError) {
        toast.error(
          `${editingUser ? "Não foi possível concluir a sincronização dos acessos" : "Usuário criado, mas os acessos não foram sincronizados"}: ${permissionSyncError}${profileUpdateWarning ? ` ${profileUpdateWarning}` : ""}`,
        );
        if (editingUser) return;
        closeUserDialog();
        await loadCompanyDetails(companyId, { force: true });
        return;
      }

      if (profileUpdateWarning) {
        toast.warning(profileUpdateWarning);
        closeUserDialog();
        await loadCompanyDetails(companyId, { force: true });
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
      await loadCompanyDetails(companyId, { force: true });
    } catch (error) {
      toast.error(
        userForm.isMaster
          ? masterSaveErrorMessage(error)
          : companyUserSaveErrorMessage(error),
      );
    } finally {
      setSaving(false);
    }
  }

  async function updateCheckedCompanyUserStatus(active: boolean) {
    const companyId = selectedCompanyIdRef.current.trim();
    const selectedRows = companyNonMasterUsersForScope(users, companyId).filter(
      (managedUser) => checkedCompanyUserIds.has(managedUser.id),
    );
    if (!companyId || !selectedRows.length) return;

    const targetRows = selectedRows.filter(
      (managedUser) => managedUser.active !== active,
    );
    if (!targetRows.length) {
      toast.info(
        `Os ${selectedRows.length} usuário(s) selecionado(s) já estão ${active ? "ativos" : "inativos"}.`,
      );
      return;
    }
    if (
      !window.confirm(
        `${active ? "Ativar" : "Desativar"} ${targetRows.length} usuário(s) selecionado(s) de ${selectedCompany?.name ?? "esta empresa"}?`,
      )
    ) {
      return;
    }

    setUpdatingCompanyUsers(true);
    try {
      const results = await mapWithConcurrency(
        targetRows,
        MASTER_USER_DISCOVERY_CONCURRENCY,
        async (managedUser) => {
          try {
            const { route } = await discoverCompanyUserResource(
              companyId,
              managedUser.id,
            );
            const body = buildCompanyUserProfileUpdate(managedUser, {
              name: managedUser.name,
              email: managedUser.email,
              password: "",
              active,
            });
            if (!body) return { managedUser, ok: true } as const;
            await mutateCompanyUserResource(route, "", {
              method: "PUT",
              body,
            });
            return { managedUser, ok: true } as const;
          } catch (error) {
            return { managedUser, error, ok: false } as const;
          }
        },
      );
      const updatedIds = new Set(
        results
          .filter((result) => result.ok)
          .map((result) => result.managedUser.id),
      );
      const failedCount = results.length - updatedIds.size;

      if (updatedIds.size) {
        const cachedRows = companyUsersCacheRef.current.get(companyId);
        if (cachedRows) {
          companyUsersCacheRef.current.set(
            companyId,
            cachedRows.map((managedUser) =>
              updatedIds.has(managedUser.id)
                ? { ...managedUser, active }
                : managedUser,
            ),
          );
        }
        if (selectedCompanyIdRef.current === companyId) {
          setUsers((current) =>
            current.map((managedUser) =>
              updatedIds.has(managedUser.id)
                ? { ...managedUser, active }
                : managedUser,
            ),
          );
          setCheckedCompanyUserIds((current) => {
            const next = new Set(current);
            updatedIds.forEach((userId) => next.delete(userId));
            return next;
          });
          await loadCompanyDetails(companyId, { force: true });
        }
      }

      if (failedCount) {
        toast.error(
          `${updatedIds.size} usuário(s) ${active ? "ativado(s)" : "desativado(s)"}; ${failedCount} não puderam ser atualizados.`,
        );
      } else {
        toast.success(
          `${updatedIds.size} usuário(s) ${active ? "ativado(s)" : "desativado(s)"}.`,
        );
      }
    } finally {
      setUpdatingCompanyUsers(false);
    }
  }

  async function deleteCheckedCompanyUsers() {
    const companyId = selectedCompanyIdRef.current.trim();
    const selectedRows = companyNonMasterUsersForScope(users, companyId).filter(
      (managedUser) => checkedCompanyUserIds.has(managedUser.id),
    );
    if (!companyId || !selectedRows.length) return;

    if (
      !window.confirm(
        `Excluir permanentemente ${selectedRows.length} usuário(s) selecionado(s) de ${selectedCompany?.name ?? "esta empresa"}?`,
      )
    ) {
      return;
    }

    setUpdatingCompanyUsers(true);
    try {
      const results = await mapWithConcurrency(
        selectedRows,
        MASTER_USER_DISCOVERY_CONCURRENCY,
        async (managedUser) => {
          try {
            const { route } = await discoverCompanyUserResource(
              companyId,
              managedUser.id,
            );
            await mutateCompanyUserResource(route, "", { method: "DELETE" });
            return { managedUser, ok: true } as const;
          } catch (error) {
            return { managedUser, error, ok: false } as const;
          }
        },
      );
      const deletedIds = new Set(
        results
          .filter((result) => result.ok)
          .map((result) => result.managedUser.id),
      );
      const failedCount = results.length - deletedIds.size;

      if (deletedIds.size) {
        const cachedRows = companyUsersCacheRef.current.get(companyId);
        if (cachedRows) {
          companyUsersCacheRef.current.set(
            companyId,
            cachedRows.filter((managedUser) => !deletedIds.has(managedUser.id)),
          );
        }
        if (editingUser && deletedIds.has(editingUser.id)) {
          closeUserDialog();
        }
        if (selectedCompanyIdRef.current === companyId) {
          setUsers((current) =>
            current.filter((managedUser) => !deletedIds.has(managedUser.id)),
          );
          setCheckedCompanyUserIds((current) => {
            const next = new Set(current);
            deletedIds.forEach((userId) => next.delete(userId));
            return next;
          });
          await loadCompanyDetails(companyId, { force: true });
        }
      }

      if (failedCount) {
        toast.error(
          `${deletedIds.size} usuário(s) excluído(s); ${failedCount} não puderam ser excluídos.`,
        );
      } else {
        toast.success(`${deletedIds.size} usuário(s) excluído(s).`);
      }
    } finally {
      setUpdatingCompanyUsers(false);
    }
  }

  async function deleteCompanyUser(user: ManagedUser) {
    if (!window.confirm(`Excluir o usuário "${user.name}"?`)) return;

    const companyId = selectedCompanyIdRef.current;
    if (!companyId) return;
    setDeletingUserId(user.id);
    try {
      const { route } = await discoverCompanyUserResource(
        companyId,
        user.id,
      );
      await mutateCompanyUserResource(route, "", { method: "DELETE" });
      if (selectedCompanyIdRef.current !== companyId) return;
      toast.success("Usuário excluído.");
      if (editingUser?.id === user.id) {
        closeUserDialog();
      }
      await loadCompanyDetails(companyId, { force: true });
    } catch (error) {
      if (selectedCompanyIdRef.current !== companyId) return;
      toast.error(
        userDeleteErrorMessage(error, user.name),
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
      const companyId = editingMasterUser
        ? getScopedRowCompanyId(editingMasterUser)
        : selectedCompanyId.trim();
      if (!companyId) {
        toast.error(
          editingMasterUser
            ? "Não foi possível identificar a empresa de origem deste super-admin."
            : "Selecione uma empresa para vincular o super-admin.",
        );
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
      setMasterUsersLoaded(false);
      await loadMasterUsers({ force: true });
    } catch (error) {
      toast.error(
        managementErrorMessage(
          error,
          "Não foi possível salvar o super-admin.",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  async function updateCheckedMasterUserStatus(active: boolean) {
    const selectedRows = masterUsers.filter(
      (managedUser) =>
        checkedMasterUserIds.has(managedUser.id) &&
        managedUser.id !== currentUser?.id,
    );
    if (!selectedRows.length) return;

    const targetRows = selectedRows.filter(
      (managedUser) => managedUser.active !== active,
    );
    if (!targetRows.length) {
      toast.info(
        `Os ${selectedRows.length} super-admin(s) selecionado(s) já estão ${active ? "ativos" : "inativos"}.`,
      );
      return;
    }
    if (
      !window.confirm(
        `${active ? "Ativar" : "Desativar"} ${targetRows.length} super-admin(s) selecionado(s)?`,
      )
    ) {
      return;
    }

    setUpdatingMasterUsers(true);
    try {
      const results = await mapWithConcurrency(
        targetRows,
        MASTER_USER_DISCOVERY_CONCURRENCY,
        async (managedUser) => {
          const companyId = getScopedRowCompanyId(managedUser);
          if (!companyId) return { managedUser, ok: false } as const;
          try {
            await apiFetch(`/users/${managedUser.id}`, {
              companyScopeId: companyId,
              method: "PUT",
              body: {
                name: managedUser.name,
                email: managedUser.email,
                is_master: true,
                active,
              },
            });
            return { managedUser, ok: true } as const;
          } catch (error) {
            return { managedUser, error, ok: false } as const;
          }
        },
      );
      const updatedIds = new Set(
        results
          .filter((result) => result.ok)
          .map((result) => result.managedUser.id),
      );
      const failedCount = results.length - updatedIds.size;

      if (updatedIds.size) {
        companyUsersCacheRef.current.forEach((rows, companyId) => {
          companyUsersCacheRef.current.set(
            companyId,
            rows.map((managedUser) =>
              updatedIds.has(managedUser.id)
                ? { ...managedUser, active }
                : managedUser,
            ),
          );
        });
        setMasterUsers((current) =>
          current.map((managedUser) =>
            updatedIds.has(managedUser.id)
              ? { ...managedUser, active }
              : managedUser,
          ),
        );
        setCheckedMasterUserIds((current) => {
          const next = new Set(current);
          updatedIds.forEach((userId) => next.delete(userId));
          return next;
        });
        setMasterUsersLoaded(false);
        await loadMasterUsers({ force: true });
      }

      if (failedCount) {
        toast.error(
          `${updatedIds.size} super-admin(s) ${active ? "ativado(s)" : "desativado(s)"}; ${failedCount} não puderam ser atualizados.`,
        );
      } else {
        toast.success(
          `${updatedIds.size} super-admin(s) ${active ? "ativado(s)" : "desativado(s)"}.`,
        );
      }
    } finally {
      setUpdatingMasterUsers(false);
    }
  }

  async function deleteCheckedMasterUsers() {
    const selectedRows = masterUsers.filter(
      (managedUser) =>
        checkedMasterUserIds.has(managedUser.id) &&
        managedUser.id !== currentUser?.id,
    );
    if (!selectedRows.length) return;

    if (
      !window.confirm(
        `Excluir permanentemente ${selectedRows.length} super-admin(s) selecionado(s)?`,
      )
    ) {
      return;
    }

    setUpdatingMasterUsers(true);
    try {
      const results = await mapWithConcurrency(
        selectedRows,
        MASTER_USER_DISCOVERY_CONCURRENCY,
        async (managedUser) => {
          const companyId = getScopedRowCompanyId(managedUser);
          if (!companyId) return { managedUser, ok: false } as const;
          try {
            await apiFetch(`/users/${managedUser.id}`, {
              companyScopeId: companyId,
              method: "DELETE",
            });
            return { managedUser, ok: true } as const;
          } catch (error) {
            return { managedUser, error, ok: false } as const;
          }
        },
      );
      const deletedIds = new Set(
        results
          .filter((result) => result.ok)
          .map((result) => result.managedUser.id),
      );
      const failedCount = results.length - deletedIds.size;

      if (deletedIds.size) {
        companyUsersCacheRef.current.forEach((rows, companyId) => {
          companyUsersCacheRef.current.set(
            companyId,
            rows.filter((managedUser) => !deletedIds.has(managedUser.id)),
          );
        });
        if (editingMasterUser && deletedIds.has(editingMasterUser.id)) {
          setMasterUserDialog(false);
          setEditingMasterUser(null);
        }
        setMasterUsers((current) =>
          current.filter((managedUser) => !deletedIds.has(managedUser.id)),
        );
        setCheckedMasterUserIds((current) => {
          const next = new Set(current);
          deletedIds.forEach((userId) => next.delete(userId));
          return next;
        });
        setMasterUsersLoaded(false);
        await loadMasterUsers({ force: true });
      }

      if (failedCount) {
        toast.error(
          `${deletedIds.size} super-admin(s) excluído(s); ${failedCount} não puderam ser excluídos.`,
        );
      } else {
        toast.success(`${deletedIds.size} super-admin(s) excluído(s).`);
      }
    } finally {
      setUpdatingMasterUsers(false);
    }
  }

  async function deleteMasterUser(user: ManagedUser) {
    if (currentUser?.id === user.id) {
      toast.error("Você não pode excluir o próprio super-admin conectado.");
      return;
    }

    if (!window.confirm(`Excluir o super-admin "${user.name}"?`)) return;

    const companyId = getScopedRowCompanyId(user);
    if (!companyId) {
      toast.error("Não foi possível identificar a empresa de origem deste super-admin.");
      return;
    }

    setDeletingUserId(user.id);
    try {
      await apiFetch(`/users/${user.id}`, {
        companyScopeId: companyId,
        method: "DELETE",
      });
      toast.success("Super-admin excluído.");
      if (editingMasterUser?.id === user.id) {
        setMasterUserDialog(false);
        setEditingMasterUser(null);
      }
      setMasterUsersLoaded(false);
      await loadMasterUsers({ force: true });
    } catch (error) {
      toast.error(masterUserDeleteErrorMessage(error, user.name));
    } finally {
      setDeletingUserId("");
    }
  }

  function companyDeleteErrorMessage(error: unknown, companyName: string) {
    if (error instanceof ApiError && error.status === 500) {
      return `Não foi possível excluir "${companyName}". Verifique se ainda existem cadastros vinculados e tente novamente.`;
    }

    return managementErrorMessage(
      error,
      `Não foi possível excluir "${companyName}".`,
    );
  }

  function userDeleteErrorMessage(
    error: unknown,
    userName: string,
  ) {
    if (error instanceof ApiError && error.status === 404) {
      return `Não foi possível excluir "${userName}" porque o cadastro não foi localizado na empresa selecionada.`;
    }

    return managementErrorMessage(
      error,
      `Não foi possível excluir "${userName}".`,
    );
  }

  function masterUserDeleteErrorMessage(error: unknown, userName: string) {
    if (error instanceof ApiError && error.status === 404) {
      return `Não foi possível excluir o super-admin "${userName}" porque o cadastro não foi localizado.`;
    }

    return managementErrorMessage(
      error,
      `Não foi possível excluir o super-admin "${userName}".`,
    );
  }

  function masterSaveErrorMessage(error: unknown) {
    if (error instanceof ApiError && error.status === 404) {
      return "Não foi possível salvar como super-admin porque o usuário não foi localizado na empresa selecionada.";
    }

    return managementErrorMessage(
      error,
      "Não foi possível salvar o super-admin.",
    );
  }

  function companyUserSaveErrorMessage(error: unknown) {
    if (error instanceof ApiError && error.status === 404) {
      return "Os acessos deste usuário não estão disponíveis para edição na empresa selecionada. Nenhuma alteração foi feita.";
    }

    return managementErrorMessage(
      error,
      "Não foi possível salvar o usuário.",
    );
  }

  async function resolveSavedCompanyUserId(
    savedUser: ManagedUser | undefined,
    email: string,
    companyId: string,
    editingUserId?: string,
  ) {
    if (savedUser?.id) {
      return certifyCompanyUserMutationIdentity(savedUser, {
        companyId,
        userId: editingUserId,
      });
    }
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

    return certifyCompanyUserMutationIdentity(found, { companyId });
  }

  async function syncUserPermissions(userId: string, companyId: string) {
    const availableOptions = visiblePermissionOptions.filter(
      (option) =>
        enabledPermissionGrantSlugs(option, enabledCompanyModuleIds).length > 0,
    );
    if (!availableOptions.length && !companyAdminPromotionRequested) return;

    const permissionResource = await discoverCompanyUserResource<
      UserPermission[]
    >(companyId, userId, "/permissions");
    const currentPermissions = permissionResource.value;
    const permissionRoute = permissionResource.route;
    const grantedSlugs = new Set(
      currentPermissions
        .filter((permission) => permission.slug && permissionIsEnabled(permission))
        .map((permission) => permission.slug),
    );
    if (companyAdminPromotionRequested) {
      await grantCompanyAdminOperationalPermissions(
        permissionRoute,
        visiblePermissionOptions,
        grantedSlugs,
        enabledCompanyModuleIds,
      );
    }
    const selectedOptions = availableOptions.filter(
      (option) => Boolean(userPermissions[option.slug]),
    );
    const syncPlan = availableOptions.map((option) => ({
      action: resolvePermissionMutation({
        baselineCertified: userPermissionBaselineCertified,
        companyAdminPromotion: companyAdminPromotionRequested,
        desired: Boolean(userPermissions[option.slug]),
        enabledModuleIds: enabledCompanyModuleIds,
        option,
        permissionTouched: touchedUserPermissionSlugs.has(option.slug),
      }),
      option,
    }));
    if (syncPlan.some((item) => item.action === "blocked-revoke")) {
      throw new Error(
        "Os acessos atuais não puderam ser confirmados. Reabra o usuário antes de remover acessos; nenhuma alteração foi feita.",
      );
    }

    for (const { action, option } of syncPlan) {
      const shouldGrant = action === "grant";
      const matchingPermissions = currentPermissions.filter((permission) =>
        userPermissionMatchesOption(permission, option),
      );

      if (shouldGrant) {
        await grantUserPermission(
          permissionRoute,
          option,
          grantedSlugs,
          enabledCompanyModuleIds,
        );
      }

      if (action === "revoke") {
        for (const permission of matchingPermissions) {
          const isNeededBySelectedOption = selectedOptions.some(
            (selectedOption) =>
              selectedOption.slug !== option.slug &&
              userPermissionMatchesOption(permission, selectedOption),
          );
          if (isNeededBySelectedOption) continue;

          const permissionId = getPermissionRecordId(permission);
          if (!permissionId) continue;
          await revokeUserPermission(permissionRoute, permissionId);
          if (permission.slug) {
            grantedSlugs.delete(permission.slug);
          }
        }
      }
    }

    const verifiedPermissions = await readCompanyUserResourceAtRoute<
      UserPermission[]
    >(
      permissionRoute,
      "/permissions",
    );
    const verifiedState = createPermissionState(
      verifiedPermissions,
      visiblePermissionOptions,
    );
    const certifiedAsCompanyAdmin = isCertifiedCompanyAdminState(
      verifiedState,
      visiblePermissionOptions,
      enabledCompanyModuleIds,
    );
    setUserPermissions(verifiedState);
    setUserPermissionBaseline(verifiedState);
    setUserPermissionBaselineCertified(true);
    setUserForm((form) => ({
      ...form,
      isCompanyAdmin: certifiedAsCompanyAdmin,
    }));

    if (
      (companyAdminPromotionRequested || userForm.isCompanyAdmin) &&
      !certifiedAsCompanyAdmin
    ) {
      const uncertifiablePermissionSlugs = missingCompanyAdminPermissionSlugs(
        visiblePermissionOptions,
        enabledCompanyModuleIds,
      );
      throw new Error(
        uncertifiablePermissionSlugs.length
          ? companyAdminCertificationErrorMessage(
              uncertifiablePermissionSlugs,
              visiblePermissionOptions,
            )
          : "Nem todos os acessos solicitados puderam ser confirmados. O perfil de Administrador da empresa não foi aplicado.",
      );
    }
  }

  async function toggleCompanyModule(module: IpxModule) {
    const companyId = selectedCompanyIdRef.current;
    if (!companyId) return;

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
        toast.success(
          assignment.enabled ? "Módulo desabilitado." : "Módulo habilitado.",
        );
      }

      await loadCompanyModules(companyId, { force: true });
    } catch (error) {
      if (selectedCompanyIdRef.current !== companyId) return;
      toast.error(
        managementErrorMessage(error, "Não foi possível alterar o módulo."),
      );
    } finally {
      setUpdatingModuleId("");
    }
  }

  const workerOperationalWarning = companyOperationalWarnings.find(
    (warning) => warning.resource === "workers",
  );
  const hasCurrentCompanyDetails = Boolean(
    selectedCompanyId && loadedCompanyId === selectedCompanyId,
  );
  const hasCurrentCompanyWorkers = Boolean(
    selectedCompanyId && loadedWorkersCompanyId === selectedCompanyId,
  );
  const companyUsersCount = hasCurrentCompanyDetails ? users.length : null;

  return (
    <section className="space-y-4">
      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-col gap-4 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Administração de empresas
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Portfólio, acessos e estrutura operacional em uma única área de gestão.
            </p>
          </div>
          <Button type="button" size="sm" onClick={() => openCompany()}>
            <Plus className="h-4 w-4" />
            Nova empresa
          </Button>
        </div>

        <dl className="grid divide-y divide-border border-y border-border bg-muted/20 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <ExecutiveStat
            label="Empresas cadastradas"
            value={formatNumber(companies.length)}
          />
          <ExecutiveStat
            label="Operações ativas"
            value={formatNumber(
              companies.filter((company) => company.active).length,
            )}
          />
          <ExecutiveStat
            label="Operações inativas"
            value={formatNumber(
              companies.filter((company) => !company.active).length,
            )}
          />
        </dl>

      </section>

      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="min-w-0 bg-background">
          <Tabs
            value={activeCompanyTab}
            onValueChange={(value) => changeMasterSection(value as CompanyTab)}
            className="space-y-0"
          >
            <TabsList className="flex h-auto w-full max-w-full justify-start gap-1 overflow-x-auto rounded-none border-y border-border bg-muted/20 px-4 py-2">
              <TabsTrigger value="companies" className="gap-2">
                <Building2 className="h-3.5 w-3.5" />
                Empresas
              </TabsTrigger>
              <TabsTrigger value="users" className="gap-2">
                <Users className="h-3.5 w-3.5" />
                Usuários
              </TabsTrigger>
              <TabsTrigger value="modules" className="gap-2">
                <CircuitBoard className="h-3.5 w-3.5" />
                Módulos
              </TabsTrigger>
              <TabsTrigger value="workers" className="gap-2">
                <ServerCog className="h-3.5 w-3.5" />
                Workers
              </TabsTrigger>
              <TabsTrigger value="insights" className="gap-2">
                <BrainCog className="h-3.5 w-3.5" />
                IA Advisor
              </TabsTrigger>
              <TabsTrigger value="masters" className="gap-2">
                <ShieldCheck className="h-3.5 w-3.5" />
                Super-admins
              </TabsTrigger>
            </TabsList>

            {activeCompanyTab !== "companies" ? (
              <CompanySummary
                company={selectedCompany}
                loading={loading}
                onEdit={() => selectedCompany && openCompany(selectedCompany)}
                onOpenDashboard={() =>
                  selectedCompany && void openCompanyDashboard(selectedCompany)
                }
              />
            ) : null}

            <TabsContent value="companies" className="m-0 p-4">
              <section className="space-y-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
                    <Input
                      value={companyQuery}
                      onChange={(event) => setCompanyQuery(event.target.value)}
                      placeholder="Buscar empresa, nome fantasia ou CNPJ"
                      className="w-full sm:max-w-md"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full sm:w-auto"
                      onClick={() => void loadCompanies()}
                      disabled={loading}
                    >
                      <RefreshCw
                        className={cn("h-4 w-4", loading && "animate-spin")}
                      />
                      Atualizar
                    </Button>
                  </div>

                  {checkedCompanyIds.size ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary" className="h-8 px-3">
                        {formatNumber(checkedCompanyIds.size)} selecionada(s)
                        {checkedCompanyIds.size > checkedVisibleCompanyCount
                          ? ` · ${formatNumber(
                              checkedCompanyIds.size - checkedVisibleCompanyCount,
                            )} fora do filtro`
                          : ""}
                      </Badge>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void updateCheckedCompanyStatus(true)}
                        disabled={updatingCompanies || Boolean(deletingCompanyId)}
                      >
                        Ativar
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void updateCheckedCompanyStatus(false)}
                        disabled={updatingCompanies || Boolean(deletingCompanyId)}
                      >
                        Desativar
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        onClick={() => void deleteCheckedCompanies()}
                        disabled={updatingCompanies || Boolean(deletingCompanyId)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Excluir
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setCheckedCompanyIds(new Set())}
                        disabled={updatingCompanies || Boolean(deletingCompanyId)}
                      >
                        Limpar
                      </Button>
                    </div>
                  ) : (
                    <Badge variant="outline" className="h-8 px-3">
                      {formatNumber(filteredCompanies.length)} exibida(s)
                    </Badge>
                  )}
                </div>

                {loading ? (
                  <TableSkeleton />
                ) : filteredCompanies.length ? (
                  <Table scrollRegionLabel="Empresas cadastradas">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">
                          <Checkbox
                            checked={
                              allVisibleCompaniesChecked
                                ? true
                                : checkedVisibleCompanyCount
                                  ? "indeterminate"
                                  : false
                            }
                            onCheckedChange={(checked) =>
                              toggleVisibleCompanies(checked === true)
                            }
                            disabled={updatingCompanies || Boolean(deletingCompanyId)}
                            aria-label="Selecionar empresas exibidas"
                          />
                        </TableHead>
                        <TableHead>Empresa</TableHead>
                        <TableHead>CNPJ</TableHead>
                        <TableHead>Plano</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Atualizado</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredCompanies.map((company) => (
                        <TableRow
                          key={company.id}
                          className={cn(
                            "cursor-pointer",
                            selectedCompanyId === company.id && "bg-primary/5",
                          )}
                          data-state={
                            selectedCompanyId === company.id ? "selected" : undefined
                          }
                          onClick={() => selectCompanyScope(company)}
                        >
                          <TableCell
                            onClick={(event) => event.stopPropagation()}
                          >
                            <Checkbox
                              checked={checkedCompanyIds.has(company.id)}
                              onCheckedChange={(checked) =>
                                toggleCompanyChecked(company.id, checked === true)
                              }
                              disabled={
                                updatingCompanies || Boolean(deletingCompanyId)
                              }
                              aria-label={`Selecionar ${company.name}`}
                            />
                          </TableCell>
                          <TableCell className="min-w-56">
                            <div className="font-medium text-foreground">
                              {company.name}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {company.trade_name || "Nome fantasia não informado"}
                            </div>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-muted-foreground">
                            {company.cnpj || "—"}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {planLabels[company.plan ?? ""] ?? "Personalizado"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <StatusBadge active={company.active} />
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-muted-foreground">
                            {formatDateTime(company.updated_at ?? company.created_at)}
                          </TableCell>
                          <TableCell
                            className="whitespace-nowrap"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  selectCompanyScope(company);
                                  changeMasterSection("users");
                                }}
                              >
                                Gerenciar
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                title="Abrir painel"
                                aria-label={`Abrir painel de ${company.name}`}
                                onClick={() => void openCompanyDashboard(company)}
                              >
                                <BarChart3 className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                title="Editar empresa"
                                aria-label={`Editar ${company.name}`}
                                onClick={() => openCompany(company)}
                              >
                                <Edit className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                title="Excluir empresa"
                                aria-label={`Excluir ${company.name}`}
                                onClick={() => void deleteCompany(company)}
                                disabled={
                                  updatingCompanies ||
                                  deletingCompanyId === company.id
                                }
                              >
                                <Trash2 className="h-3.5 w-3.5" />
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
              </section>
            </TabsContent>

            <TabsContent value="users" className="m-0 p-4">
              <section className="overflow-hidden rounded-lg border border-border bg-card">
                <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle>Admins e operadores</CardTitle>
                    <CardDescription>
                      Usuários pertencentes à empresa selecionada.
                    </CardDescription>
                  </div>
                  <div className="flex w-full items-center gap-2 sm:w-auto">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 w-8 p-0"
                      title="Atualizar usuários e acessos"
                      aria-label="Atualizar usuários e acessos"
                      onClick={() =>
                        void Promise.allSettled([
                          loadModuleCatalog({ force: true }),
                          loadPermissionCatalog({ force: true }),
                          loadCompanyDetails(selectedCompanyId, { force: true }),
                        ])
                      }
                      disabled={
                        !selectedCompanyId ||
                        updatingCompanyUsers ||
                        Boolean(deletingUserId) ||
                        loadingDetails ||
                        loadingModuleCatalog ||
                        loadingPermissionCatalog
                      }
                    >
                      <RefreshCw
                        className={cn(
                          "h-4 w-4",
                          (loadingDetails ||
                            loadingModuleCatalog ||
                            loadingPermissionCatalog) &&
                            "animate-spin",
                        )}
                      />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="min-w-0 flex-1 sm:flex-none"
                      onClick={() => openUser()}
                      disabled={
                        !selectedCompanyId ||
                        !hasCurrentCompanyDetails ||
                        updatingCompanyUsers ||
                        Boolean(deletingUserId) ||
                        loadingDetails ||
                        loadingModuleCatalog ||
                        loadingPermissionCatalog ||
                        Boolean(moduleCatalogError || permissionCatalogError)
                      }
                    >
                      <UserPlus className="h-4 w-4" />
                      Novo usuário
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {companyDetailsError ? (
                    <div className="rounded-md border border-amber-300/50 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-700 dark:text-amber-300">
                      Usuários indisponíveis: {companyDetailsError}
                    </div>
                  ) : null}
                  {moduleCatalogError || permissionCatalogError ? (
                    <div className="rounded-md border border-amber-300/50 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-700 dark:text-amber-300">
                      Acessos indisponíveis: {permissionCatalogError || moduleCatalogError}
                    </div>
                  ) : null}
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <Input
                      value={userQuery}
                      onChange={(event) => setUserQuery(event.target.value)}
                      placeholder="Buscar usuário"
                      className="w-full lg:max-w-sm"
                      disabled={
                        !selectedCompanyId ||
                        !hasCurrentCompanyDetails ||
                        updatingCompanyUsers ||
                        Boolean(deletingUserId) ||
                        loadingDetails
                      }
                    />
                    {checkedCompanyUserIds.size ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary" className="h-8 px-3">
                          {formatNumber(checkedCompanyUserIds.size)} selecionado(s)
                          {checkedCompanyUserIds.size > checkedVisibleCompanyUserCount
                            ? ` · ${formatNumber(
                                checkedCompanyUserIds.size -
                                  checkedVisibleCompanyUserCount,
                              )} fora do filtro`
                            : ""}
                        </Badge>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            void updateCheckedCompanyUserStatus(true)
                          }
                          disabled={
                            updatingCompanyUsers || Boolean(deletingUserId)
                          }
                        >
                          Ativar
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            void updateCheckedCompanyUserStatus(false)
                          }
                          disabled={
                            updatingCompanyUsers || Boolean(deletingUserId)
                          }
                        >
                          Desativar
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          onClick={() => void deleteCheckedCompanyUsers()}
                          disabled={
                            updatingCompanyUsers || Boolean(deletingUserId)
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Excluir
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setCheckedCompanyUserIds(new Set())}
                          disabled={
                            updatingCompanyUsers || Boolean(deletingUserId)
                          }
                        >
                          Limpar
                        </Button>
                      </div>
                    ) : (
                      <Badge variant="outline" className="h-8 px-3">
                        {formatNumber(filteredUsers.length)} exibido(s)
                      </Badge>
                    )}
                  </div>

                  {loadingDetails ? (
                    <TableSkeleton />
                  ) : filteredUsers.length ? (
                    <Table scrollRegionLabel="Usuários da empresa">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">
                            <Checkbox
                              checked={
                                allVisibleCompanyUsersChecked
                                  ? true
                                  : checkedVisibleCompanyUserCount
                                    ? "indeterminate"
                                    : false
                              }
                              onCheckedChange={(checked) =>
                                toggleVisibleCompanyUsers(checked === true)
                              }
                              disabled={
                                updatingCompanyUsers || Boolean(deletingUserId)
                              }
                              aria-label="Selecionar usuários exibidos"
                            />
                          </TableHead>
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
                              <Checkbox
                                checked={checkedCompanyUserIds.has(user.id)}
                                onCheckedChange={(checked) =>
                                  toggleCompanyUserChecked(
                                    user.id,
                                    checked === true,
                                  )
                                }
                                disabled={
                                  updatingCompanyUsers || Boolean(deletingUserId)
                                }
                                aria-label={`Selecionar ${user.name}`}
                              />
                            </TableCell>
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
                                  disabled={
                                    updatingCompanyUsers || Boolean(deletingUserId)
                                  }
                                >
                                  <Edit className="h-3.5 w-3.5" />
                                  Editar
                                </Button>
                                <Button
                                  type="button"
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => deleteCompanyUser(user)}
                                  disabled={
                                    updatingCompanyUsers ||
                                    Boolean(deletingUserId)
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
                  ) : companyDetailsError ? (
                    <EmptyState text="Não foi possível carregar os usuários desta empresa." />
                  ) : (
                    <EmptyState text="Nenhum usuário para a empresa selecionada." />
                  )}
                </CardContent>
              </section>
            </TabsContent>

            <TabsContent value="masters" className="m-0 p-4">
              <section className="overflow-hidden rounded-lg border border-border bg-card">
                <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle>Super-admins</CardTitle>
                    <CardDescription>
                      Gestão global. Novos perfis usam a empresa selecionada
                      apenas como vínculo de origem.
                    </CardDescription>
                  </div>
                  <div className="flex w-full items-center gap-2 sm:w-auto">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 w-8 p-0"
                      title="Atualizar super-admins"
                      aria-label="Atualizar super-admins"
                      onClick={() => void loadMasterUsers({ force: true })}
                      disabled={
                        loading ||
                        loadingMasterUsers ||
                        updatingMasterUsers ||
                        Boolean(deletingUserId)
                      }
                    >
                      <RefreshCw
                        className={cn(
                          "h-4 w-4",
                          loadingMasterUsers && "animate-spin",
                        )}
                      />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="min-w-0 flex-1 sm:flex-none"
                      onClick={() => openMasterUser()}
                      disabled={
                        !selectedCompanyId ||
                        updatingMasterUsers ||
                        Boolean(deletingUserId)
                      }
                    >
                      <UserPlus className="h-4 w-4" />
                      Novo super-admin
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <Input
                      value={masterUserQuery}
                      onChange={(event) => setMasterUserQuery(event.target.value)}
                      placeholder="Buscar super-admin"
                      className="w-full lg:max-w-sm"
                      disabled={
                        loading ||
                        loadingMasterUsers ||
                        updatingMasterUsers ||
                        Boolean(deletingUserId)
                      }
                    />
                    {checkedMasterUserIds.size ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary" className="h-8 px-3">
                          {formatNumber(checkedMasterUserIds.size)} selecionado(s)
                          {checkedMasterUserIds.size > checkedVisibleMasterUserCount
                            ? ` · ${formatNumber(
                                checkedMasterUserIds.size -
                                  checkedVisibleMasterUserCount,
                              )} fora do filtro`
                            : ""}
                        </Badge>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => void updateCheckedMasterUserStatus(true)}
                          disabled={
                            updatingMasterUsers || Boolean(deletingUserId)
                          }
                        >
                          Ativar
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => void updateCheckedMasterUserStatus(false)}
                          disabled={
                            updatingMasterUsers || Boolean(deletingUserId)
                          }
                        >
                          Desativar
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          onClick={() => void deleteCheckedMasterUsers()}
                          disabled={
                            updatingMasterUsers || Boolean(deletingUserId)
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Excluir
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setCheckedMasterUserIds(new Set())}
                          disabled={
                            updatingMasterUsers || Boolean(deletingUserId)
                          }
                        >
                          Limpar
                        </Button>
                      </div>
                    ) : (
                      <Badge variant="outline" className="h-8 px-3">
                        {formatNumber(filteredMasterUsers.length)} exibido(s)
                      </Badge>
                    )}
                  </div>

                  {loading || loadingMasterUsers || !masterUsersLoaded ? (
                    <TableSkeleton />
                  ) : filteredMasterUsers.length ? (
                    <Table scrollRegionLabel="Super-admins cadastrados">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">
                            <Checkbox
                              checked={
                                allVisibleMasterUsersChecked
                                  ? true
                                  : checkedVisibleMasterUserCount
                                    ? "indeterminate"
                                    : false
                              }
                              onCheckedChange={(checked) =>
                                toggleVisibleMasterUsers(checked === true)
                              }
                              disabled={
                                updatingMasterUsers ||
                                Boolean(deletingUserId) ||
                                !selectableFilteredMasterUsers.length
                              }
                              aria-label="Selecionar super-admins exibidos"
                            />
                          </TableHead>
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
                              <Checkbox
                                checked={checkedMasterUserIds.has(user.id)}
                                onCheckedChange={(checked) =>
                                  toggleMasterUserChecked(user.id, checked === true)
                                }
                                disabled={
                                  updatingMasterUsers ||
                                  Boolean(deletingUserId) ||
                                  currentUser?.id === user.id
                                }
                                aria-label={
                                  currentUser?.id === user.id
                                    ? `${user.name} é o super-admin conectado`
                                    : `Selecionar ${user.name}`
                                }
                              />
                            </TableCell>
                            <TableCell>
                              <div className="font-medium text-foreground">
                                {user.name}
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {user.email}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="default">Superadmin</Badge>
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
                                  disabled={
                                    updatingMasterUsers || Boolean(deletingUserId)
                                  }
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
                                    Boolean(deletingUserId) ||
                                    updatingMasterUsers ||
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
                    <EmptyState text="Nenhum super-admin disponível." />
                  )}
                </CardContent>
              </section>
            </TabsContent>

            <TabsContent value="insights" className="m-0 p-4">
              {activeCompanyTab === "insights" ? (
                <AiInsightsDashboard
                  companyScopeId={selectedCompanyId}
                  companyName={selectedCompany?.name}
                  embedded
                />
              ) : null}
            </TabsContent>

            <TabsContent value="modules" className="m-0 p-4">
              <section className="overflow-hidden rounded-lg border border-border bg-card">
                <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle>Módulos</CardTitle>
                    <CardDescription>
                      Escolha os módulos disponíveis para a empresa selecionada.
                    </CardDescription>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      void Promise.allSettled([
                        loadModuleCatalog({ force: true }),
                        loadCompanyModules(selectedCompanyId, { force: true }),
                      ])
                    }
                    disabled={
                      !selectedCompanyId ||
                      loadingModuleCatalog ||
                      loadingCompanyModules
                    }
                  >
                    <RefreshCw
                      className={cn(
                        "h-4 w-4",
                        (loadingModuleCatalog || loadingCompanyModules) &&
                          "animate-spin",
                      )}
                    />
                    Atualizar
                  </Button>
                </CardHeader>
                <CardContent className="space-y-3">
                  {companyModulesError || moduleCatalogError ? (
                    <div className="rounded-md border border-amber-300/50 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-700 dark:text-amber-300">
                      Módulos indisponíveis: {companyModulesError || moduleCatalogError}
                    </div>
                  ) : null}
                  {loadingCompanyModules || loadingModuleCatalog ? (
                    <TableSkeleton />
                  ) : companyModulesError || moduleCatalogError ? (
                    <EmptyState text="Não foi possível carregar os módulos desta empresa." />
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
                                  <Badge variant="outline">Indisponível</Badge>
                                ) : null}
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {algorithmModuleDescription(module)}
                              </div>
                            </div>
                            <label
                              className={cn(
                                "flex shrink-0 cursor-pointer items-center gap-2 rounded-md border bg-background px-3 py-2 text-xs font-medium text-foreground",
                                (!selectedCompanyId ||
                                  loadedCompanyModulesId !== selectedCompanyId ||
                                  !module.active ||
                                  updatingModuleId === module.id) &&
                                  "cursor-default opacity-60",
                              )}
                            >
                              <Checkbox
                                checked={enabled}
                                onCheckedChange={() => void toggleCompanyModule(module)}
                                disabled={
                                  !selectedCompanyId ||
                                  loadedCompanyModulesId !== selectedCompanyId ||
                                  !module.active ||
                                  updatingModuleId === module.id
                                }
                                aria-label={`${enabled ? "Desabilitar" : "Habilitar"} ${moduleLabel}`}
                              />
                              {updatingModuleId === module.id
                                ? "Salvando..."
                                : enabled
                                  ? "Disponível"
                                  : "Indisponível"}
                            </label>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <EmptyState text="Nenhum módulo disponível." />
                  )}
                </CardContent>
              </section>
            </TabsContent>

            <TabsContent value="workers" className="m-0 p-4">
              <section className="overflow-hidden rounded-lg border border-border bg-card">
                <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle>Workers</CardTitle>
                    <CardDescription>
                      Processos responsáveis por receber os dados da empresa.
                    </CardDescription>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full sm:w-auto"
                    onClick={() =>
                      void loadCompanyWorkers(selectedCompanyId, { force: true })
                    }
                    disabled={!selectedCompanyId || loadingOperationalDetails}
                  >
                    <RefreshCw
                      className={cn(
                        "h-4 w-4",
                        loadingOperationalDetails && "animate-spin",
                      )}
                    />
                    Atualizar
                  </Button>
                </CardHeader>
                <CardContent className="space-y-3">
                  {workerOperationalWarning ? (
                    <OperationalResourceWarningNotice
                      warning={workerOperationalWarning}
                    />
                  ) : null}
                  {workerScopeWarning ? (
                    <div className="rounded-md border border-amber-300/50 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-700 dark:text-amber-300">
                      {workerScopeWarning}
                    </div>
                  ) : null}
                  {loadingOperationalDetails || !hasCurrentCompanyWorkers ? (
                    <TableSkeleton />
                  ) : workers.length ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Worker</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Última comunicação</TableHead>
                          <TableHead>Vínculo</TableHead>
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
                                  {worker.description || "Sem descrição"}
                                </div>
                              </TableCell>
                              <TableCell>
                                <WorkerStatusBadge worker={worker} />
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {formatDateTime(display.lastSeenAt)}
                              </TableCell>
                              <TableCell>
                                <WorkerScopeBadge
                                  companyId={selectedCompanyId}
                                  worker={worker as WorkerRow}
                                />
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  ) : workerOperationalWarning ? (
                    <EmptyState text="Não foi possível confirmar os Workers desta empresa." />
                  ) : (
                    <EmptyState text="Nenhum Worker disponível para esta empresa." />
                  )}
                </CardContent>
              </section>
            </TabsContent>
          </Tabs>
        </div>
      </section>

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
            <FormField label="Fuso horário">
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
                  disabled={additiveAdminPromotionMode}
                  value={userForm.name}
                  onChange={(event) =>
                    setUserProfileField("name", event.target.value)
                  }
                />
              </FormField>
              <FormField label="E-mail">
                <Input
                  disabled={additiveAdminPromotionMode}
                  type="email"
                  value={userForm.email}
                  onChange={(event) =>
                    setUserProfileField("email", event.target.value)
                  }
                />
              </FormField>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <FormField label={editingUser ? "Nova senha" : "Senha"}>
                <Input
                  disabled={additiveAdminPromotionMode}
                  type="password"
                  autoComplete="new-password"
                  value={userForm.password}
                  placeholder={editingUser ? "Deixe em branco para manter" : ""}
                  onChange={(event) =>
                    setUserProfileField("password", event.target.value)
                  }
                />
              </FormField>
              {editingUser ? (
                <StatusSelect
                  disabled={additiveAdminPromotionMode}
                  value={userForm.active}
                  onValueChange={(active) =>
                    setUserProfileField("active", active)
                  }
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
                additiveAdminPromotionMode && "cursor-default opacity-60",
              )}
            >
              <Checkbox
                className="mt-1"
                checked={userForm.isMaster}
                disabled={additiveAdminPromotionMode}
                onCheckedChange={(checked) =>
                  setSuperAdminAccess(checked === true)
                }
              />
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <ShieldCheck className="h-4 w-4" />
                  Super-admin
                </span>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                  Acesso completo à gestão de todas as empresas e módulos.
                </span>
              </span>
            </label>

            <label
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-md border px-3 py-3 transition",
                (userForm.isMaster ||
                  loadingUserPermissions ||
                  (Boolean(editingUser) &&
                    !userPermissionBaselineCertified &&
                    !additiveAdminPromotionMode)) &&
                  "cursor-default opacity-60",
                userForm.isCompanyAdmin
                  ? "border-primary/30 bg-primary/10"
                  : "border-border bg-card",
              )}
            >
              <Checkbox
                className="mt-1"
                checked={userForm.isCompanyAdmin}
                disabled={
                  userForm.isMaster ||
                  loadingUserPermissions ||
                  (Boolean(editingUser) &&
                    !userPermissionBaselineCertified &&
                    !additiveAdminPromotionMode)
                }
                onCheckedChange={(checked) =>
                  setCompanyAdminAccess(checked === true)
                }
              />
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <ShieldCheck className="h-4 w-4" />
                  Administrador da empresa
                </span>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                  Concede os acessos de gestão disponíveis nos módulos
                  habilitados para esta empresa.
                </span>
              </span>
            </label>

            <div className="rounded-md border border-border bg-card p-3">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-medium text-foreground">
                    Menus e acessos
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Escolha individualmente o que este usuário pode acessar e
                    administrar.
                  </div>
                </div>
                {loadingUserPermissions ? (
                  <Badge variant="outline">Carregando</Badge>
                ) : null}
              </div>

              {userForm.isMaster ? (
                <div className="mt-3 rounded-md border border-border bg-muted/20 px-3 py-3 text-sm text-muted-foreground">
                  Este perfil já possui acesso global e não precisa de acessos
                  adicionais.
                </div>
              ) : additiveAdminPromotionMode ? (
                <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-3 text-sm text-foreground">
                  Os acessos atuais deste usuário não puderam ser consultados.
                  Neste modo, somente o controle
                  <strong> Administrador da empresa</strong> está disponível.
                  Ao salvar, todos os acessos dos
                  módulos e capacidades disponíveis serão concedidos de forma
                  aditiva. Dados
                  cadastrais e acessos existentes não serão removidos.
                </div>
              ) : editingUser &&
                !loadingUserPermissions &&
                !userPermissionBaselineCertified ? (
                <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-3 text-sm text-foreground">
                  Os acessos deste usuário não puderam ser confirmados para a
                  empresa selecionada. A edição foi bloqueada para evitar uma
                  alteração parcial.
                </div>
              ) : permissionGroups.length ? (
                <div className="mt-3 space-y-3">
                  {permissionGroups.map((group, index) => {
                    const editablePermissions = group.permissions.filter(
                      (permission) => !permission.unavailable,
                    );
                    const selectedPermissionCount = editablePermissions.filter(
                      (permission) => userPermissions[permission.slug],
                    ).length;
                    const groupChecked = Boolean(
                      editablePermissions.length &&
                        selectedPermissionCount === editablePermissions.length,
                    );

                    return (
                    <React.Fragment key={group.key}>
                      {index === 0 ||
                      permissionGroups[index - 1]?.category !== group.category ? (
                        <div className="pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {group.category === "product"
                            ? "Módulos"
                            : "Capacidades de gestão"}
                        </div>
                      ) : null}
                      <div className="rounded-md border border-border bg-muted/20 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-medium text-foreground">
                            {group.name}
                          </div>
                          <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground">
                            <Checkbox
                              checked={
                                groupChecked
                                  ? true
                                  : selectedPermissionCount
                                    ? "indeterminate"
                                    : false
                              }
                              disabled={
                                loadingUserPermissions ||
                                !editablePermissions.length
                              }
                              onCheckedChange={(checked) =>
                                setPermissionGroupAccess(group, checked === true)
                              }
                              aria-label={`Selecionar todos os acessos de ${group.name}`}
                            />
                            Selecionar grupo
                          </label>
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
                              <Checkbox
                                className="mt-1"
                                checked={Boolean(userPermissions[permission.slug])}
                                disabled={loadingUserPermissions || permission.unavailable}
                                onCheckedChange={(checked) => {
                                  setCompanyAdminPromotionRequested(false);
                                  setTouchedUserPermissionSlugs((current) => {
                                    const next = new Set(current);
                                    next.add(permission.slug);
                                    return next;
                                  });
                                  setUserPermissions((current) => {
                                    const next = {
                                      ...current,
                                      [permission.slug]: checked === true,
                                    };
                                    setUserForm((form) => ({
                                      ...form,
                                      isCompanyAdmin: isCertifiedCompanyAdminState(
                                        next,
                                        visiblePermissionOptions,
                                        enabledCompanyModuleIds,
                                      ),
                                    }));
                                    return next;
                                  });
                                }}
                              />
                              <span className="min-w-0">
                                <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                                  <span>{permission.label}</span>
                                  <Badge variant="outline">
                                    {formatPermissionAction(permission)}
                                  </Badge>
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
                    </React.Fragment>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-3">
                  <EmptyState text="Os acessos disponíveis não puderam ser carregados." />
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
              disabled={
                saving ||
                (!userForm.isMaster && loadingUserPermissions) ||
                (additiveAdminPromotionMode &&
                  !companyAdminPromotionRequested)
              }
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
              Acesso global para gestão de empresas e painéis.
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
                autoComplete="new-password"
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

function managementErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof ApiError)) return fallback;
  if (error.status === 400 || error.status === 422) {
    return "Revise os dados informados e tente novamente.";
  }
  if (error.status === 401) {
    return "Sua sessão expirou. Entre novamente para continuar.";
  }
  if (error.status === 403) {
    return "Seu perfil não permite concluir esta ação.";
  }
  if (error.status === 404) {
    return "A informação solicitada não foi encontrada. Atualize a página e tente novamente.";
  }
  if (error.status === 409) {
    return "Os dados foram atualizados recentemente. Recarregue as informações e tente novamente.";
  }
  if (error.status >= 500) {
    return "O serviço está temporariamente indisponível. Tente novamente em instantes.";
  }
  return fallback;
}

function ExecutiveStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="px-4 py-3">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-xl font-semibold tabular-nums text-foreground">
        {value}
      </dd>
    </div>
  );
}

function CompanySummary({
  company,
  loading,
  onEdit,
  onOpenDashboard,
}: {
  company: Company | null;
  loading: boolean;
  onEdit: () => void;
  onOpenDashboard: () => void;
}) {
  if (loading) {
    return <Skeleton className="m-4 h-24 w-auto" />;
  }

  if (!company) {
    return (
      <div className="p-4">
        <EmptyState text="Selecione uma empresa para ver detalhes." />
      </div>
    );
  }

  return (
    <header className="px-4 py-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-lg font-semibold text-foreground">
              {company.name}
            </h2>
            <StatusBadge active={company.active} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {company.trade_name || company.cnpj || "Empresa cadastrada"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onEdit}>
            <Edit className="h-3.5 w-3.5" />
            Editar
          </Button>
          <Button type="button" size="sm" onClick={onOpenDashboard}>
            <BarChart3 className="h-3.5 w-3.5" />
            Abrir painel
          </Button>
        </div>
      </div>
      <dl className="mt-4 grid gap-x-6 gap-y-3 border-t border-border pt-3 text-sm sm:grid-cols-3">
          <Detail
            label="Plano"
            value={planLabels[company.plan ?? ""] ?? "Personalizado"}
          />
          <Detail
            label="Fuso horário"
            value={company.timezone ? "Configurado" : "Não informado"}
          />
          <Detail
            label="Atualizado"
            value={formatDateTime(company.updated_at ?? company.created_at)}
          />
      </dl>
    </header>
  );
}

function OperationalResourceWarningNotice({
  warning,
}: {
  warning: CompanyOperationalWarning;
}) {
  return (
    <div className="break-words rounded-md border border-amber-300/50 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-700 dark:text-amber-300">
      <span className="font-semibold">{warning.label}:</span>{" "}
      {warning.message}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 truncate font-medium text-foreground">{value}</dd>
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
  disabled = false,
  value,
  onValueChange,
}: {
  disabled?: boolean;
  value: string;
  onValueChange: (value: string) => void;
}) {
  return (
    <FormField label="Status">
      <Select disabled={disabled} value={value} onValueChange={onValueChange}>
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

  return <Badge variant="warning">Sem comunicação recente</Badge>;
}

function WorkerScopeBadge({
  worker,
  companyId,
}: {
  worker: WorkerRow;
  companyId?: string | null;
}) {
  const scope = workerScopeDisplay(worker, companyId);

  return <Badge variant={scope.variant}>{scope.label}</Badge>;
}

function formatCertifiedCount(value?: number | null) {
  return typeof value === "number" ? formatNumber(value) : "—";
}

function certifiedSettledRows<T>(
  result: PromiseSettledResult<T[]>,
  resource: CompanyOperationalResource,
  label: string,
  warnings: CompanyOperationalWarning[],
) {
  if (result.status === "fulfilled") return result.value;

  warnings.push(operationalResourceWarning(resource, label, result.reason));
  return null;
}

function operationalResourceWarning(
  resource: CompanyOperationalResource,
  label: string,
  error: unknown,
): CompanyOperationalWarning {
  return {
    resource,
    label,
    message: managementErrorMessage(
      error,
      "As informações deste recurso estão temporariamente indisponíveis.",
    ),
  };
}

function allOperationalResourceWarnings(error: unknown) {
  const resources: Array<readonly [CompanyOperationalResource, string]> = [
    ["workers", "Workers"],
    ["countingScenarios", "Cenários de Contagem"],
    ["locations", "Locais"],
    ["subLocations", "Subáreas"],
    ["cameras", "Câmeras"],
    ["occupancyScenarios", "Cenários de Ocupação"],
  ];

  return resources.map(([resource, label]) =>
    operationalResourceWarning(resource, label, error),
  );
}

async function fetchCompanySubLocations(
  locations: Location[],
  companyScopeIds: string[],
  companyScopeId: string,
  signal?: AbortSignal,
) {
  const rows = await Promise.all(
    locations.map((location) => {
      return apiFetch<unknown>(
        `/locations/${location.id}/sub-locations`,
        { companyScopeId, signal },
      ).then((value) =>
        requireSubLocationRows(
          selectExplicitCompanyScopedRows(value, companyScopeId, {
            label: "sublocais",
          }).rows,
          companyScopeId,
        ),
      );
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
  signal?: AbortSignal,
) {
  return apiFetch<unknown>(path, { companyScopeId, signal }).then((value) =>
    validate(
      selectExplicitCompanyScopedRows(value, companyScopeId, {
        label: "recursos operacionais",
      }).rows,
      companyScopeId,
    ),
  );
}

async function fetchScopedWorkers(
  companyScopeId: string,
  signal?: AbortSignal,
) {
  return apiFetch<unknown>("/workers", { companyScopeId, signal })
    .then((value) =>
      requireWorkerRows(
        selectExplicitCompanyScopedRows(value, companyScopeId, {
          collectionKeys: ["data", "workers", "items", "results"],
          label: "workers",
        }).rows,
        companyScopeId,
      ),
    );
}

async function fetchScopedOccupancyScenarios(
  companyScopeId: string,
  signal?: AbortSignal,
) {
  return apiFetch<unknown>("/occupancy/scenarios", {
    companyScopeId,
    signal,
  }).then(
    (value) =>
      requireOccupancyScenarioRows(
        selectExplicitCompanyScopedRows(value, companyScopeId, {
          collectionKeys: ["data"],
          label: "cenários de ocupação",
        }).rows,
        companyScopeId,
      ),
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

function companyNonMasterUsersForScope(
  rows: ManagedUser[],
  companyId: string,
) {
  const expectedCompanyId = companyId.trim();
  if (!expectedCompanyId) return [];

  return rows.filter(
    (managedUser) =>
      managedUser.is_master === false &&
      getScopedRowCompanyId(managedUser) === expectedCompanyId,
  );
}

async function mapWithConcurrency<T, R>(
  rows: readonly T[],
  concurrency: number,
  mapper: (row: T) => Promise<R>,
) {
  const results = new Array<R>(rows.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, concurrency), rows.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < rows.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await mapper(rows[index]);
      }
    }),
  );

  return results;
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

function enabledCompanyModuleCount(
  assignments: CompanyModule[],
  modules: IpxModule[],
) {
  const modulesById = new Map(modules.map((module) => [module.id, module]));
  const enabledModuleIds = new Set<string>();

  assignments.forEach((assignment) => {
    if (!assignment.enabled) return;
    const catalogModule =
      assignment.module ?? modulesById.get(assignment.module_id);
    if (
      !catalogModule ||
      catalogModule.active === false ||
      !algorithmModuleFamily(catalogModule)
    ) {
      return;
    }
    if (assignment.module_id) enabledModuleIds.add(assignment.module_id);
  });

  return enabledModuleIds.size;
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
  return Object.fromEntries(
    options.map((option) => {
      const hasExactGrant =
        option.grants.some((grant) => grantedPermissionIds.has(grant.id)) ||
        option.slugs.some((slug) => grantedSlugs.has(slug));

      return [option.slug, Boolean(hasExactGrant)];
    }),
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

function userPermissionMatchesOption(
  permission: UserPermission,
  option: PermissionOption,
) {
  const permissionId = getPermissionRecordId(permission);
  const permissionSlug = permission.slug?.trim();

  return Boolean(
    (permissionId && option.grants.some((grant) => grant.id === permissionId)) ||
      (permissionSlug &&
        option.grants.some((grant) => grant.slug === permissionSlug)),
  );
}

function additiveCompanyAdminGrants(
  options: readonly PermissionOption[],
  enabledModuleIds: ReadonlySet<string>,
) {
  return options.flatMap((option): AdditiveCompanyAdminGrant[] => {
    if (option.unavailable) return [];
    return option.grants
      .filter(
        (grant) =>
          Boolean(grant.module_id) &&
          enabledModuleIds.has(grant.module_id!) &&
          (!option.module_id || grant.module_id === option.module_id),
      )
      .map((grant) => ({ permissionId: grant.id, slug: grant.slug }));
  });
}

async function grantUserPermission(
  route: CompanyUserResourceRoute,
  option: PermissionOption,
  existingSlugs: Set<string>,
  enabledModuleIds: Set<string>,
) {
  const grantSlugs = enabledPermissionGrantSlugs(option, enabledModuleIds);

  return grantPermissionSlugs(
    route,
    grantSlugs,
    existingSlugs,
    option.label,
  );
}

async function grantCompanyAdminOperationalPermissions(
  route: CompanyUserResourceRoute,
  options: PermissionOption[],
  existingSlugs: Set<string>,
  enabledModuleIds: Set<string>,
) {
  const grantSlugs = enabledCompanyAdminOperationalSlugs(
    options,
    enabledModuleIds,
  );

  return grantPermissionSlugs(
    route,
    grantSlugs,
    existingSlugs,
    "Administrador da empresa",
  );
}

async function grantPermissionSlugs(
  route: CompanyUserResourceRoute,
  grantSlugs: string[],
  existingSlugs: Set<string>,
  accessLabel: string,
) {
  const createdSlugs: string[] = [];

  try {
    for (const slug of grantSlugs) {
      if (existingSlugs.has(slug)) continue;

      try {
        await mutateCompanyUserResource(
          route,
          "/permissions",
          {
            method: "POST",
            body: { slug },
          },
        );
        existingSlugs.add(slug);
        createdSlugs.push(slug);
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          existingSlugs.add(slug);
          continue;
        }

        throw permissionGrantError(error, accessLabel);
      }
    }
  } catch (error) {
    const rollbackErrors = await rollbackGrantedPermissionSlugs(
      route,
      createdSlugs,
    );
    createdSlugs.forEach((slug) => existingSlugs.delete(slug));
    const detail = error instanceof Error ? error.message : "erro desconhecido";
    if (rollbackErrors.length) {
      throw new Error(
        `${detail} A promoção ficou incompleta e alguns acessos não puderam ser restaurados automaticamente.`,
      );
    }
    throw new Error(
      createdSlugs.length
        ? `${detail} As permissões concedidas nesta tentativa foram revertidas.`
        : detail,
    );
  }
}

function permissionGrantError(
  error: unknown,
  accessLabel: string,
) {
  if (error instanceof ApiError && error.status === 404) {
    return error;
  }

  if (error instanceof Error && error.message.includes("module not enabled")) {
    return new Error(
      `Habilite o módulo relacionado a "${accessLabel}" antes de salvar este acesso.`,
    );
  }

  return new Error(
    managementErrorMessage(
      error,
      `Não foi possível conceder o acesso "${accessLabel}".`,
    ),
  );
}

async function rollbackGrantedPermissionSlugs(
  route: CompanyUserResourceRoute,
  slugs: string[],
) {
  if (!slugs.length) return [];

  const rollbackErrors: string[] = [];
  try {
    const permissions = await readCompanyUserResourceAtRoute<UserPermission[]>(
      route,
      "/permissions",
    );
    const createdSlugSet = new Set(slugs);
    for (const permission of permissions) {
      if (!createdSlugSet.has(permission.slug)) continue;
      const permissionId = getPermissionRecordId(permission);
      if (!permissionId) {
        rollbackErrors.push(permission.slug);
        continue;
      }

      try {
        await revokeUserPermission(route, permissionId);
      } catch {
        rollbackErrors.push(permission.slug);
      }
    }
  } catch {
    return [...slugs];
  }

  return Array.from(new Set(rollbackErrors));
}

async function revokeUserPermission(
  route: CompanyUserResourceRoute,
  permissionId: string,
) {
  return mutateCompanyUserResource(
    route,
    `/permissions/${encodeURIComponent(permissionId)}`,
    { method: "DELETE" },
  );
}

function groupPermissionCatalog(permissions: PermissionOption[]): PermissionGroup[] {
  const groups = new Map<string, PermissionGroup>();

  permissions.forEach((permission) => {
    const current = groups.get(permission.group_key);
    if (current) {
      current.permissions.push(permission);
      return;
    }

    groups.set(permission.group_key, {
      category: permission.category,
      key: permission.group_key,
      name: permission.group_name,
      permissions: [permission],
    });
  });

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      permissions: [...group.permissions].sort((left, right) =>
        `${left.action}\u0000${left.slug}`.localeCompare(
          `${right.action}\u0000${right.slug}`,
          "pt-BR",
        ),
      ),
    }))
    .sort((left, right) => {
      if (left.category !== right.category) {
        return left.category === "product" ? -1 : 1;
      }
      const leftFamily = algorithmModuleFamily(left.name);
      const rightFamily = algorithmModuleFamily(right.name);
      if (leftFamily && rightFamily) {
        return algorithmFamilyOrder(leftFamily) - algorithmFamilyOrder(rightFamily);
      }
      return left.name.localeCompare(right.name, "pt-BR");
    });
}

function companyAdminCertificationErrorMessage(
  slugs: readonly string[],
  options: readonly PermissionOption[],
) {
  const labels = slugs
    .map((slug) => options.find((option) => option.slug === slug)?.label)
    .filter((label): label is string => Boolean(label));
  const detail = labels.length
    ? ` Verifique os seguintes acessos: ${labels.join(", ")}.`
    : "";
  return `Não foi possível aplicar o perfil de Administrador da empresa.${detail} Nenhum acesso existente foi removido.`;
}

function formatPermissionAction(permission: PermissionOption) {
  return permissionActionLabel(permission.action);
}

function permissionActionLabel(rawAction: string) {
  const action = normalizeSlug(rawAction);
  const terms = new Set(action.split(" ").filter(Boolean));
  if (["view", "read", "list"].some((term) => terms.has(term))) {
    return "Visualização";
  }
  if (["create", "add"].some((term) => terms.has(term))) return "Criação";
  if (["edit", "update"].some((term) => terms.has(term))) return "Edição";
  if (["delete", "remove"].some((term) => terms.has(term))) return "Exclusão";
  if (["export", "download"].some((term) => terms.has(term))) {
    return "Exportação";
  }
  if (["manage", "write", "admin"].some((term) => terms.has(term))) {
    return "Gestão";
  }
  return "Acesso específico";
}

function normalizeSlug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function selectVisibleProductModules(modules: IpxModule[]) {
  const modulesByFamily = new Map<AlgorithmModuleFamily, IpxModule>();

  modules.forEach((module) => {
    const id = module.id?.trim();
    if (!id || !module.name?.trim() || !module.slug?.trim()) return;
    const family = algorithmModuleFamily(module);
    if (!family) return;
    const current = modulesByFamily.get(family);
    if (!current || (!current.active && module.active)) {
      modulesByFamily.set(family, module);
    }
  });

  return Array.from(modulesByFamily.values()).sort(
    (left, right) =>
      algorithmFamilyOrder(algorithmModuleFamily(left) as AlgorithmModuleFamily) -
      algorithmFamilyOrder(algorithmModuleFamily(right) as AlgorithmModuleFamily),
  );
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
  if (family === "counting") return 0;
  if (family === "occupancy") return 1;
  return 2;
}

function algorithmModuleDescription(module: IpxModule) {
  const family = algorithmModuleFamily(module);
  return (
    algorithmModuleDefinitions.find((definition) => definition.family === family)
      ?.description ?? "Módulo de análise operacional."
  );
}

function resolveOperationalPermissionOptions(
  catalog: Permission[],
  modules: IpxModule[],
): PermissionOption[] {
  const modulesById = new Map(modules.map((module) => [module.id, module]));
  const optionsByCapability = new Map<string, PermissionOption>();

  catalog.forEach((permission) => {
    const id = permission.id?.trim();
    const moduleId = getPermissionModuleId(permission).trim();
    const slug = permission.slug?.trim();
    const catalogModule = permission.module;
    const permissionModule = modulesById.get(moduleId) ??
      (catalogModule
        ? {
            id: catalogModule.id,
            name: catalogModule.name,
            slug: catalogModule.slug,
            description: catalogModule.description,
            active: catalogModule.active !== false,
          }
        : undefined);

    if (
      !id ||
      !moduleId ||
      !slug ||
      !permissionModule
    ) {
      return;
    }

    const presentation = resolvePermissionPresentation(
      permission,
      permissionModule,
    );
    if (!presentation) return;

    const grant = {
      id,
      module_id: moduleId,
      slug,
    };
    const optionKey = `${moduleId}\u0000${presentation.slug}`;
    const current = optionsByCapability.get(optionKey);
    if (current) {
      current.grants.push(grant);
      if (!current.slugs.includes(slug)) current.slugs.push(slug);
      current.unavailable =
        Boolean(current.unavailable) && permissionModule.active === false;
      return;
    }

    optionsByCapability.set(optionKey, {
      action: presentation.action,
      category: presentation.category,
      description: presentation.description,
      grants: [grant],
      group_key: presentation.groupKey,
      group_name: presentation.groupName,
      id,
      label: presentation.label,
      module_id: moduleId,
      module_name: presentation.groupName,
      module_slug: presentation.groupKey,
      slug: presentation.slug,
      slugs: [slug],
      unavailable: permissionModule.active === false,
    });
  });

  return Array.from(optionsByCapability.values());
}

type PermissionPresentation = {
  action: "manage" | "view";
  category: PermissionGroup["category"];
  description: string;
  groupKey: string;
  groupName: string;
  label: string;
  slug: string;
};

function resolvePermissionPresentation(
  permission: Permission,
  module: IpxModule,
): PermissionPresentation | null {
  const knownPermission = operationalPermissionDefinitionForGrant(permission);
  if (knownPermission) {
    const workspaceCapability =
      knownPermission.slug === "dashboard_widgets_manage" ||
      knownPermission.slug === "views_manage";
    return {
      action: "manage",
      category: "administrative",
      description: knownPermission.description,
      groupKey: workspaceCapability
        ? "capability:workspace"
        : "capability:operation",
      groupName: workspaceCapability
        ? "Painéis e visões"
        : "Configuração operacional",
      label: knownPermission.label,
      slug: knownPermission.slug,
    };
  }

  const family = algorithmModuleFamily(module);
  if (!family) return null;
  const mode = productPermissionMode(permission, family);
  if (!mode) return null;
  const productName = algorithmModuleDefinitions.find(
    (definition) => definition.family === family,
  )?.label;
  if (!productName) return null;

  return {
    action: mode,
    category: "product",
    description:
      mode === "view"
        ? `Consultar os painéis de ${productName}.`
        : `Configurar o módulo ${productName} e seus recursos.`,
    groupKey: `product:${family}`,
    groupName: productName,
    label: mode === "view" ? "Visualização" : "Gestão",
    slug: `${family}_${mode}`,
  };
}

function productPermissionMode(
  permission: Permission,
  family: OperationalModuleFamily,
): "manage" | "view" | null {
  const definition = algorithmModuleDefinitions.find(
    (candidate) => candidate.family === family,
  );
  if (!definition) return null;

  const normalizedSlug = normalizeSlug(permission.slug);
  const matchingAlias = definition.aliases
    .map(normalizeSlug)
    .sort((left, right) => right.length - left.length)
    .find(
      (alias) =>
        normalizedSlug === alias || normalizedSlug.startsWith(`${alias} `),
    );
  if (!matchingAlias) return null;

  const suffix = normalizedSlug.slice(matchingAlias.length).trim();
  const suffixMode = productPermissionActionMode(suffix);
  const declaredMode = productPermissionActionMode(
    normalizeSlug(permission.action ?? ""),
  );
  if (suffix && !suffixMode) return null;
  if (suffixMode && declaredMode && suffixMode !== declaredMode) return null;
  return declaredMode ?? suffixMode;
}

function productPermissionActionMode(value: string): "manage" | "view" | null {
  if (["manage", "admin"].includes(value)) return "manage";
  if (["view", "read", "list", "export"].includes(value)) return "view";
  return null;
}
