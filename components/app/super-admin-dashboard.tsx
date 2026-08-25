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
import { requireScenarioRows } from "@/lib/scenario-validation";
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

type CompanyTab = "users" | "workers" | "modules" | "masters";

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
  algorithms: number;
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
  const [companyDetailsError, setCompanyDetailsError] = React.useState("");
  const [companyOperationalWarnings, setCompanyOperationalWarnings] =
    React.useState<CompanyOperationalWarning[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadingDetails, setLoadingDetails] = React.useState(false);
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
      companyDetailsRequestSequenceRef.current += 1;
      invalidateUserPermissionRequest({ closeDialog: true });
      setSelectedCompanyId(nextCompanyId);
    },
    [invalidateUserPermissionRequest],
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
  const additiveAdminPromotionMode = Boolean(
    editingUser &&
      !userPermissionBaselineCertified &&
      additiveAdminPromotionContext?.companyId === selectedCompanyId &&
      additiveAdminPromotionContext?.userId === editingUser.id,
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
      setCompanyOperationalWarnings([]);
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
      setUsers([]);
      setCompanyModules([]);
      setWorkers([]);
      setWorkerScopeWarning("");
      setCompanyOperationalWarnings([]);
      setCompanyStats(null);
      setCompanyDetailsError("");
      setLoadingDetails(false);
      return;
    }

    setLoadingDetails(true);
    setCompanyStats(null);
    setCompanyDetailsError("");
    setWorkerScopeWarning("");
    setCompanyOperationalWarnings([]);
    let administrativeDetailsCertified = false;
    let certifiedModuleRows: CompanyModule[] = [];
    try {
      const [userRows, moduleRows] = await Promise.all([
        apiFetch<ManagedUser[]>(`/companies/${companyId}/users`, {
          companyScopeId: companyId,
        }),
        apiFetch<CompanyModule[]>(
          `/companies/${companyId}/modules`,
          { companyScopeId: companyId },
        ),
      ]);
      const companyScopeIds = uniqueScopeIds(companyId);
      const scopedUserRows = userRows.filter((user) => {
        const userCompanyId = getScopedRowCompanyId(user);
        return !userCompanyId || companyScopeIds.includes(userCompanyId);
      });
      if (!canPublishCompanyDetails(requestSequence, companyId)) return;

      // Administrative data is certified independently from the operational
      // resources below. A broken tenant scope in Workers or Scenarios must not
      // erase users and modules that came from company-scoped routes.
      administrativeDetailsCertified = true;
      certifiedModuleRows = moduleRows;
      setUsers(scopedUserRows.filter((user) => !user.is_master));
      setCompanyModules(moduleRows);
      const authenticatedCompanyId = getCurrentUserCompanyId(currentUser);
      const canQueryJwtBoundCatalogs =
        !authenticatedCompanyId || authenticatedCompanyId === companyId;
      const [
        workerResult,
        locationResult,
        cameraResult,
        scenarioResult,
        occupancyScenarioResult,
      ] = await Promise.allSettled([
        canQueryJwtBoundCatalogs
          ? fetchScopedWorkers(companyId)
          : Promise.resolve([]),
        fetchValidatedRows("/locations", requireLocationRows, companyId),
        fetchValidatedRows("/cameras", requireCameraRows, companyId),
        canQueryJwtBoundCatalogs
          ? fetchValidatedRows("/scenarios", requireScenarioRows, companyId)
          : Promise.resolve([]),
        fetchScopedOccupancyScenarios(companyId),
      ]);
      const operationalWarnings: CompanyOperationalWarning[] = [];
      // These two legacy endpoints derive tenant exclusively from the JWT.
      // Calling them while a Master selected another company returns valid
      // rows from the token's home tenant, which must not be presented as an
      // operational failure (or, worse, as data from the selected company).
      const workerRows = canQueryJwtBoundCatalogs
        ? certifiedSettledRows(
            workerResult,
            "workers",
            "Workers",
            operationalWarnings,
          )
        : null;
      const locationRows = certifiedSettledRows(
        locationResult,
        "locations",
        "Locations",
        operationalWarnings,
      );
      const cameraRows = certifiedSettledRows(
        cameraResult,
        "cameras",
        "Câmeras",
        operationalWarnings,
      );
      const scenarioRows = canQueryJwtBoundCatalogs
        ? certifiedSettledRows(
            scenarioResult,
            "countingScenarios",
            "Cenários de Contagem",
            operationalWarnings,
          )
        : null;
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
              "Sublocations",
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
      const collapsedWorkerDuplicateCount = collapsedWorkerRows.reduce(
        (count, worker) =>
          count + Math.max(0, (worker.__duplicate_record_count ?? 1) - 1),
        0,
      );

      if (!canPublishCompanyDetails(requestSequence, companyId)) return;

      setWorkers(
        workerRows ? sortWorkersByActivity(collapsedWorkerRows) : [],
      );
      setCompanyStats({
        algorithms: enabledOperationalModuleCount(moduleRows, modules),
        cameras: scopedCameras?.length ?? null,
        locations: scopedLocations?.length ?? null,
        subLocations: subLocationRows?.length ?? null,
        countingScenarios: scopedScenarios?.length ?? null,
        occupancyScenarios: scopedOccupancyScenarios?.length ?? null,
        workers: workerRows ? collapsedWorkerRows.length : null,
      });
      setCompanyOperationalWarnings(operationalWarnings);
      setWorkerScopeWarning(
        workerRows
          ? buildWorkerScopeWarning(
              workerScopePartition.foreignRows.length,
              workerScopePartition.unscopedRows.length,
              collapsedWorkerDuplicateCount,
              companyId,
              uniqueScopeIds(
                workerScopePartition.foreignRows.map(resolveWorkerCompanyId),
              ),
            )
          : "",
      );
    } catch (error) {
      if (!canPublishCompanyDetails(requestSequence, companyId)) return;
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível carregar dados da empresa.";
      setWorkers([]);
      setWorkerScopeWarning("");
      if (administrativeDetailsCertified) {
        setCompanyStats({
          algorithms: enabledOperationalModuleCount(certifiedModuleRows, modules),
          cameras: null,
          locations: null,
          subLocations: null,
          countingScenarios: null,
          occupancyScenarios: null,
          workers: null,
        });
        setCompanyOperationalWarnings(
          allOperationalResourceWarnings(
            message,
            !getCurrentUserCompanyId(currentUser) ||
              getCurrentUserCompanyId(currentUser) === companyId,
          ),
        );
        toast.warning(
          "Dados operacionais parciais. Usuários e módulos certificados foram preservados.",
        );
      } else {
        setUsers([]);
        setCompanyModules([]);
        setCompanyOperationalWarnings([]);
        setCompanyStats(null);
        setCompanyDetailsError(message);
        toast.error(message);
      }
    } finally {
      if (canPublishCompanyDetails(requestSequence, companyId)) {
        setLoadingDetails(false);
      }
    }
  }, [canPublishCompanyDetails, currentUser, modules]);

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
        throw new Error("A API retornou o cadastro de outra empresa.");
      }
      const detailedCompany = normalizeCompanyRecord(response);
      const timeZone = canonicalCompanyTimeZone(detailedCompany.timezone);
      if (!timeZone) {
        throw new Error(
          "O detalhe da empresa não informou um timezone IANA válido.",
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
    const selectedTimezone =
      canonicalCompanyTimeZone(selectedCompany.timezone) ??
      (!resolution.fallback ? resolution.timeZone : null);
    const requiresDetailHydration =
      !canonicalCompanyTimeZone(selectedCompany.timezone) &&
      resolution.source !== "current-user-company";
    if (
      selectedTimezone &&
      !requiresDetailHydration &&
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

    if (!requiresDetailHydration && selectedTimezone) return;
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
        "A API não confirmou o vínculo do usuário com a empresa selecionada. Nenhum acesso pode ser alterado.",
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
        "Nenhuma permissão operacional publicada está disponível nos módulos habilitados desta empresa.",
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
          "A API não disponibilizou a leitura granular dos acessos. Está disponível apenas a promoção aditiva para Administrador da empresa; nenhum acesso existente poderá ser removido.",
        );
      } else {
        toast.error(
          error instanceof ApiError && error.status === 404
            ? `A API não disponibilizou a leitura de permissões nem confirmou o vínculo deste usuário com a empresa selecionada (${requestedCompanyId}). Os acessos permanecem inalterados.`
            : error instanceof Error
              ? error.message
              : "Não foi possível carregar acessos do usuário.",
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
    const usersCount = selectedCompanyId === company.id ? users.length : 0;
    const workersCount = selectedCompanyId === company.id ? workers.length : 0;
    const message = [
      `Excluir a empresa "${company.name}"?`,
      "Esta ação é permanente e pode remover dados do tenant no backend.",
      usersCount || workersCount
        ? `Resumo carregado: ${formatNumber(usersCount)} usuário(s) e ${formatNumber(workersCount)} worker(s).`
        : "",
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
          "Administrador da empresa promovido de forma aditiva. Todas as respostas de permissão foram certificadas.",
        );
        closeUserDialog();
        await loadCompanyDetails(companyId);
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
        await loadCompanies();
        await loadCompanyDetails(companyId);
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
              "Os acessos foram processados separadamente, mas os dados cadastrais não puderam ser atualizados pela API.";
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
      }

      if (permissionSyncError) {
        toast.error(
          `${editingUser ? "Não foi possível concluir a sincronização dos acessos" : "Usuário criado, mas os acessos não foram sincronizados"}: ${permissionSyncError}${profileUpdateWarning ? ` ${profileUpdateWarning}` : ""}`,
        );
        if (editingUser) return;
        closeUserDialog();
        await loadCompanyDetails(companyId);
        return;
      }

      if (profileUpdateWarning) {
        toast.warning(profileUpdateWarning);
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
      return `Não foi possível excluir "${userName}". O usuário não foi localizado pelas rotas compatíveis da empresa selecionada (${companyId}); nenhuma exclusão foi simulada localmente.`;
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
      return `A API não disponibilizou uma rota de permissões para este usuário na empresa selecionada (${companyId}). Nenhum acesso foi alterado.`;
    }

    return error instanceof Error ? error.message : "Falha ao salvar usuário.";
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
        "Os acessos atuais não foram certificados pela API. Reabra o usuário antes de remover permissões; nenhum acesso foi revogado.",
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
          : "A API não confirmou todos os acessos operacionais solicitados. O usuário não foi anunciado como administrador da empresa.",
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

  const workerOperationalWarning = companyOperationalWarnings.find(
    (warning) => warning.resource === "workers",
  );
  const authenticatedCompanyId = getCurrentUserCompanyId(currentUser);
  const canEnumerateSelectedCompanyWorkers = Boolean(
    selectedCompanyId &&
      (!authenticatedCompanyId || authenticatedCompanyId === selectedCompanyId),
  );

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
          value={formatNumber(users.length)}
          detail={selectedCompany ? selectedCompany.name : "Selecione uma empresa"}
        />
        <MetricCard
          icon={ServerCog}
          label="Workers"
          value={
            companyStats?.workers === null || workerOperationalWarning
              ? "—"
              : formatNumber(companyStats?.workers ?? 0)
          }
          detail={
            workerOperationalWarning
              ? "Dados não certificados"
              : companyStats?.workers === null
                ? "Catálogo vinculado à sessão"
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
            disabled={loading || loadingDetails}
          >
            <RefreshCw
              className={cn(
                "h-4 w-4",
                (loading || loadingDetails) && "animate-spin",
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
            error={companyDetailsError}
            loading={loadingDetails}
            warnings={companyOperationalWarnings}
            stats={
              companyStats
                ? {
                    ...companyStats,
                    users: users.length,
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
                    disabled={!selectedCompanyId}
                  >
                    <UserPlus className="h-4 w-4" />
                    Novo usuário
                  </Button>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Input
                    value={userQuery}
                    onChange={(event) => setUserQuery(event.target.value)}
                    placeholder="Buscar usuário"
                    disabled={!selectedCompanyId || loadingDetails}
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
                <CardContent>
                  {loadingDetails ? (
                    <TableSkeleton />
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
                    disabled={!selectedCompanyId || loadingDetails}
                  >
                    <RefreshCw
                      className={cn("h-4 w-4", loadingDetails && "animate-spin")}
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
                  {loadingDetails ? (
                    <TableSkeleton />
                  ) : !canEnumerateSelectedCompanyWorkers ? (
                    <EmptyState text="A lista detalhada de Workers é disponibilizada somente para a empresa assinada na sessão. Os demais dados certificados da empresa selecionada permanecem acessíveis." />
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
                  ) : workerOperationalWarning ? (
                    <EmptyState text="Workers não certificados para esta empresa." />
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
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 accent-primary"
                checked={userForm.isMaster}
                disabled={additiveAdminPromotionMode}
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
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 accent-primary"
                checked={userForm.isCompanyAdmin}
                disabled={
                  userForm.isMaster ||
                  loadingUserPermissions ||
                  (Boolean(editingUser) &&
                    !userPermissionBaselineCertified &&
                    !additiveAdminPromotionMode)
                }
                onChange={(event) => setCompanyAdminAccess(event.target.checked)}
              />
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <ShieldCheck className="h-4 w-4" />
                  Administrador da empresa
                </span>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                  Concede, de forma aditiva, todas as permissões publicadas dos
                  módulos operacionais habilitados. Não é superadmin.
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
                    Selecione individualmente as ações publicadas pela API.
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
              ) : additiveAdminPromotionMode ? (
                <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-3 text-sm text-foreground">
                  A API confirmou este usuário em
                  {` GET /companies/{companyId}/users`}, mas não disponibilizou
                  a leitura de suas permissões. Neste modo, somente o controle
                  <strong> Administrador da empresa</strong> está disponível.
                  Ao salvar, o vínculo será relido e todos os acessos dos
                  módulos habilitados serão concedidos de forma aditiva. Dados
                  cadastrais, acessos granulares e permissões existentes não
                  serão alterados ou removidos.
                </div>
              ) : editingUser &&
                !loadingUserPermissions &&
                !userPermissionBaselineCertified ? (
                <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-3 text-sm text-foreground">
                  Os acessos deste usuário não foram certificados pela API para
                  a empresa selecionada. A edição de permissões foi bloqueada
                  para evitar uma alteração parcial ou em outro tenant.
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
                              onChange={(event) => {
                                setCompanyAdminPromotionRequested(false);
                                setTouchedUserPermissionSlugs((current) => {
                                  const next = new Set(current);
                                  next.add(permission.slug);
                                  return next;
                                });
                                setUserPermissions((current) => {
                                  const next = {
                                    ...current,
                                    [permission.slug]: event.target.checked,
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
                                <span>{formatPermissionAction(permission)}</span>
                                {permission.unavailable ? (
                                  <Badge variant="outline">Indisponível</Badge>
                                ) : null}
                              </span>
                              <span className="mt-1 block break-words text-xs leading-5 text-muted-foreground">
                                {permission.description}
                              </span>
                              <span className="mt-2 grid min-w-0 gap-1 text-[11px] leading-4 text-muted-foreground">
                                <span className="min-w-0 break-all">
                                  Slug: <code>{permission.slug}</code>
                                </span>
                                <span className="min-w-0 break-all">
                                  Módulo: <code>{permission.module_id}</code>
                                </span>
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
  error,
  loading,
  stats,
  warnings,
  onOpenRoute,
  onOpenTab,
}: {
  company: Company | null;
  error: string;
  loading: boolean;
  warnings: CompanyOperationalWarning[];
  stats:
    | (CompanyOperationalStats & {
        users: number;
        workers: number | null;
      })
    | null;
  onOpenRoute: (path: string) => void;
  onOpenTab: (tab: CompanyTab) => void;
}) {
  const disabled = !company || loading || !stats;
  const scenarioTotal =
    stats?.countingScenarios !== null &&
    stats?.countingScenarios !== undefined &&
    stats.occupancyScenarios !== null
      ? stats.countingScenarios + stats.occupancyScenarios
      : null;
  const steps = stats
    ? [
    {
      index: "01",
      label: "Usuários",
      detail: "Perfis e permissões",
      count: stats.users,
      icon: Users,
      onClick: () => onOpenTab("users"),
    },
    {
      index: "02",
      label: "Workers",
      detail: "Edge e API key",
      count: stats.workers,
      icon: ServerCog,
      onClick: () => onOpenTab("workers"),
    },
    {
      index: "03",
      label: "Algoritmos",
      detail: "Analíticos habilitados",
      count: stats.algorithms,
      icon: CircuitBoard,
      onClick: () => onOpenTab("modules"),
    },
    {
      index: "04",
      label: "Câmeras",
      detail: "Origem de vídeo",
      count: stats.cameras,
      icon: CameraIcon,
      onClick: () => onOpenRoute("/manager/cameras"),
    },
    {
      index: "05",
      label: "Locations",
      detail: "Unidades principais",
      count: stats.locations,
      icon: MapPinned,
      onClick: () => onOpenRoute("/manager/locations"),
    },
    {
      index: "06",
      label: "Sublocations",
      detail: "Grupos de câmeras",
      count: stats.subLocations,
      icon: Network,
      onClick: () => onOpenRoute("/manager/locations#locations"),
    },
    {
      index: "07",
      label: "Cenários",
      detail: `${formatCertifiedOperationalCount(
        stats.countingScenarios,
      )} contagem / ${formatCertifiedOperationalCount(
        stats.occupancyScenarios,
      )} ocupação`,
      count: scenarioTotal,
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
        {error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-3 text-sm font-medium text-destructive">
            Totais operacionais não certificados: {error}
          </div>
        ) : (
          <>
            {warnings.length ? (
              <div className="space-y-2 rounded-md border border-amber-300/50 bg-amber-500/10 px-3 py-3 text-xs leading-5 text-amber-800 dark:text-amber-200">
                <div className="font-semibold">Dados operacionais parciais.</div>
                <div className="space-y-1">
                  {warnings.map((warning) => (
                    <OperationalResourceWarningNotice
                      key={warning.resource}
                      warning={warning}
                      embedded
                    />
                  ))}
                </div>
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
                    disabled={disabled || step.count === null}
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
                      {loading
                        ? "..."
                        : formatCertifiedOperationalCount(step.count)}
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function OperationalResourceWarningNotice({
  warning,
  embedded = false,
}: {
  warning: CompanyOperationalWarning;
  embedded?: boolean;
}) {
  return (
    <div
      className={cn(
        "break-words",
        !embedded &&
          "rounded-md border border-amber-300/50 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-700 dark:text-amber-300",
      )}
    >
      <span className="font-semibold">{warning.label}:</span>{" "}
      {warning.message}
    </div>
  );
}

function formatCertifiedOperationalCount(value: number | null) {
  return value === null ? "—" : formatNumber(value);
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
      ? ` A API retornou company_id ${foreignCompanyIds.join(", ")}`
      : "";
    const requestedScope = selectedCompanyId
      ? ` ao solicitar a empresa ${selectedCompanyId}`
      : "";
    messages.push(
      `${formatNumber(foreignCount)} worker(s) foram ocultados por pertencerem a outra empresa.${returnedScopes}${requestedScope}. O JWT atual não autorizou dados operacionais dessa empresa.`,
    );
  }
  if (unscopedCount) {
    messages.push(
      foreignCount
        ? `${formatNumber(unscopedCount)} worker(s) vieram sem company_id e foram ocultados porque a resposta também contém outra empresa.`
        : `${formatNumber(unscopedCount)} worker(s) vieram sem company_id e foram mantidos no escopo autenticado solicitado.`,
    );
  }
  if (duplicateCount) {
    messages.push(
      `${formatNumber(duplicateCount)} registro(s) duplicado(s) de revalidação foram consolidados pela cadeia de identidade do worker.`,
    );
  }

  return messages.join(" ");
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
  const errorMessage =
    error instanceof Error
      ? error.message.trim()
      : typeof error === "string"
        ? error.trim()
        : "";
  return {
    resource,
    label,
    message:
      errorMessage ||
      "A API não retornou dados certificados para este recurso.",
  };
}

function allOperationalResourceWarnings(
  error: unknown,
  includeJwtBoundCatalogs = true,
) {
  const resources: Array<readonly [CompanyOperationalResource, string]> = [
    ...(includeJwtBoundCatalogs
      ? ([
          ["workers", "Workers"],
          ["countingScenarios", "Cenários de Contagem"],
        ] as const)
      : []),
    ["locations", "Locations"],
    ["subLocations", "Sublocations"],
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
    .then((value) => requireWorkerRows(value, companyScopeId));
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

        throw permissionGrantError(error, accessLabel, slug);
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
        `${detail} A promoção ficou incompleta e a reversão também falhou para: ${rollbackErrors.join(
          ", ",
        )}.`,
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
  slug: string,
) {
  if (error instanceof ApiError && error.status === 404) {
    return error;
  }

  if (error instanceof Error && error.message.includes("module not enabled")) {
    return new Error(
      `Habilite o módulo da permissão "${accessLabel}" para esta empresa antes de salvar o acesso.`,
    );
  }

  if (error instanceof ApiError && error.status === 500) {
    return new Error(
      `Falha ao conceder "${accessLabel}" (${slug}). A API retornou erro interno na rota de acesso previamente certificada para a empresa selecionada.`,
    );
  }

  const detail = error instanceof Error ? error.message : "erro desconhecido";
  return new Error(
    `Falha ao conceder "${accessLabel}" (${slug}). Backend retornou: ${detail}`,
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
    const current = groups.get(permission.module_id);
    if (current) {
      current.permissions.push(permission);
      return;
    }

    groups.set(permission.module_id, {
      key: permission.module_id,
      name: permission.module_name,
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
  const labels = slugs.map(
    (slug) => options.find((option) => option.slug === slug)?.label ?? slug,
  );
  return `Não foi possível certificar o perfil de administrador da empresa. O catálogo ou os módulos habilitados não oferecem acesso explícito para: ${labels.join(
    ", ",
  )}. Nenhuma permissão existente foi removida.`;
}

function formatPermissionAction(permission: PermissionOption) {
  return permission.action
    ? `Ação: ${permission.action}`
    : "Ação não informada pela API";
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

function resolveOperationalPermissionOptions(
  catalog: Permission[],
  modules: IpxModule[],
): PermissionOption[] {
  const modulesById = new Map(modules.map((module) => [module.id, module]));
  const options = catalog.flatMap((permission): PermissionOption[] => {
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
      !permissionModule ||
      !algorithmModuleFamily(permissionModule)
    ) {
      return [];
    }

    const action = permission.action?.trim() ?? "";
    const moduleName = algorithmModuleLabel(permissionModule);
    const grant = {
      id,
      module_id: moduleId,
      slug,
    };

    return [
      {
        id,
        module_id: moduleId,
        module_name: moduleName,
        module_slug: permissionModule.slug,
        slug,
        action,
        label: action || slug,
        description: `Permissão publicada pela API para o módulo ${moduleName}.`,
        slugs: [slug],
        grants: [grant],
        unavailable: permissionModule.active === false,
      },
    ];
  });

  const optionsByPermission = new Map<string, PermissionOption>();
  options.forEach((option) => {
    if (!optionsByPermission.has(option.id)) {
      optionsByPermission.set(option.id, option);
    }
  });

  return Array.from(optionsByPermission.values());
}
