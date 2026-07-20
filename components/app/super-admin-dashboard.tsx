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
import { writeCompanyCache } from "@/lib/company-cache";
import {
  clearStoredMasterCompanyScope,
  getCurrentUserCompanyId,
  getScopedRowCompanyId,
  getStoredMasterCompanyScope,
  setStoredMasterCompanyScope,
} from "@/lib/master-company-scope";
import {
  OPERATIONAL_PERMISSIONS,
  type OperationalPermissionDefinition,
} from "@/lib/permissions";
import type {
  Camera,
  Location,
  OccupancyScenario,
  OccupancyScenarioListResponse,
  Permission,
  Scenario,
  SubLocation,
  UserPermission,
  Worker,
} from "@/lib/types";
import { cn, formatDateTime, formatNumber } from "@/lib/utils";
import { getWorkerDisplayInfo } from "@/lib/worker-display";
import {
  collapseWorkerIdentityChains,
  normalizeWorkerRows,
  partitionWorkersByCompanyScope,
  resolveWorkerCompanyId,
  sortWorkersByActivity,
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

type CompanyOperationalStats = {
  algorithms: number;
  cameras: number;
  locations: number;
  subLocations: number;
  countingScenarios: number;
  occupancyScenarios: number;
};

const emptyCompanyOperationalStats: CompanyOperationalStats = {
  algorithms: 0,
  cameras: 0,
  locations: 0,
  subLocations: 0,
  countingScenarios: 0,
  occupancyScenarios: 0,
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
  const [companyStats, setCompanyStats] = React.useState<CompanyOperationalStats>(
    emptyCompanyOperationalStats,
  );
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
  const [masterUserForm, setMasterUserForm] =
    React.useState<UserFormState>(emptyUserForm);
  const [userProfileDirty, setUserProfileDirty] = React.useState(false);
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
      const [companyRows, moduleRows, permissionRows] = await Promise.all([
        apiFetch<Company[]>("/companies"),
        apiFetch<IpxModule[]>("/modules").catch(() => []),
        apiFetch<Permission[]>("/permissions").catch(() => []),
      ]);
      const companyUserRows = await Promise.all(
        companyRows.map((company) =>
          apiFetch<ManagedUser[]>(`/companies/${company.id}/users`).catch(
            () => [],
          ),
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
      setSelectedCompanyId((current) =>
        current && companyRows.some((company) => company.id === current)
          ? current
          : storedScope &&
              companyRows.some((company) => company.id === storedScope.id)
            ? storedScope.id
            : declaredCompanyId &&
                companyRows.some((company) => company.id === declaredCompanyId)
              ? declaredCompanyId
              : companyRows[0]?.id ?? "",
      );
    } catch (error) {
      setWorkers([]);
      setWorkerScopeWarning("");
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar empresas.",
      );
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  const loadCompanyDetails = React.useCallback(async () => {
    if (!selectedCompanyId) {
      setUsers([]);
      setCompanyModules([]);
      setWorkers([]);
      setWorkerScopeWarning("");
      setCompanyStats(emptyCompanyOperationalStats);
      return;
    }

    setLoadingDetails(true);
    setWorkerScopeWarning("");
    try {
      const [userRows, moduleRows] = await Promise.all([
        apiFetch<ManagedUser[]>(`/companies/${selectedCompanyId}/users`),
        apiFetch<CompanyModule[]>(
          `/companies/${selectedCompanyId}/modules`,
        ).catch(() => []),
      ]);
      const companyScopeIds = uniqueScopeIds(selectedCompanyId);
      const scopedUserRows = userRows.filter((user) => {
        const userCompanyId = getScopedRowCompanyId(user);
        return !userCompanyId || companyScopeIds.includes(userCompanyId);
      });
      const [
        workerRows,
        locationRows,
        cameraRows,
        scenarioRows,
        occupancyScenarioRows,
      ] = await Promise.all([
        fetchScopedWorkers(),
        fetchScopedRows<Location>("/locations"),
        fetchScopedRows<Camera>("/cameras"),
        fetchScopedRows<Scenario>("/scenarios"),
        fetchScopedOccupancyScenarios(),
      ]);
      const workerScopePartition = partitionWorkersByCompanyScope(
        workerRows,
        companyScopeIds,
      );
      const scopedLocations = filterRowsByCompanyScopes(
        locationRows,
        companyScopeIds,
      );
      const scopedScenarios = filterRowsByCompanyScopes(
        scenarioRows,
        companyScopeIds,
      );
      const scopedOccupancyScenarios = filterRowsByCompanyScopes(
        occupancyScenarioRows,
        companyScopeIds,
      );
      const subLocationRows = await fetchCompanySubLocations(
        scopedLocations,
        companyScopeIds,
      );
      const scopedCameras = filterRowsByCompanyScopes(cameraRows, companyScopeIds);
      const collapsedWorkerRows = collapseWorkerIdentityChains(
        workerScopePartition.scopedRows,
      );
      const collapsedWorkerDuplicateCount = collapsedWorkerRows.reduce(
        (count, worker) =>
          count + Math.max(0, (worker.__duplicate_record_count ?? 1) - 1),
        0,
      );

      setUsers(scopedUserRows.filter((user) => !user.is_master));
      setCompanyModules(moduleRows);
      setWorkers(
        sortWorkersByActivity(collapsedWorkerRows),
      );
      setCompanyStats({
        algorithms: enabledOperationalModuleCount(moduleRows, modules),
        cameras: scopedCameras.length,
        locations: scopedLocations.length,
        subLocations: subLocationRows.length,
        countingScenarios: scopedScenarios.length,
        occupancyScenarios: scopedOccupancyScenarios.length,
      });
      setWorkerScopeWarning(
        buildWorkerScopeWarning(
          workerScopePartition.foreignRows.length,
          workerScopePartition.unscopedRows.length,
          collapsedWorkerDuplicateCount,
          selectedCompanyId,
          uniqueScopeIds(
            workerScopePartition.foreignRows.map(resolveWorkerCompanyId),
          ),
        ),
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar dados da empresa.",
      );
    } finally {
      setLoadingDetails(false);
    }
  }, [modules, selectedCompanyId]);

  React.useEffect(() => {
    loadCompanies();
  }, [loadCompanies]);

  React.useEffect(() => {
    loadCompanyDetails();
  }, [loadCompanyDetails]);

  React.useEffect(() => {
    if (!selectedCompany) return;

    const storedScope = getStoredMasterCompanyScope();
    if (storedScope?.id === selectedCompany.id) return;

    setStoredMasterCompanyScope({
      id: selectedCompany.id,
      name: selectedCompany.name,
      trade_name: selectedCompany.trade_name ?? null,
    });
  }, [selectedCompany]);

  function openCompany(company?: Company) {
    setEditingCompany(company ?? null);
    setCompanyForm(
      company
        ? {
            name: company.name,
            trade_name: company.trade_name ?? "",
            cnpj: company.cnpj ?? "",
            plan: company.plan ?? "pro",
            timezone: company.timezone ?? "America/Sao_Paulo",
            user_limit: String(company.user_limit ?? 10),
            active: String(company.active),
          }
        : emptyCompanyForm,
    );
    setCompanyDialog(true);
  }

  function openUser(user?: ManagedUser) {
    if (!selectedCompanyId) {
      toast.error("Selecione uma empresa antes de criar usuário.");
      return;
    }

    setEditingUser(user ?? null);
    setUserPermissions({});
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
      void loadUserPermissions(user.id);
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
    setSelectedCompanyId(company.id);
    setStoredMasterCompanyScope({
      id: company.id,
      name: company.name,
      trade_name: company.trade_name ?? null,
    });
  }

  function openCompanyDashboard(company: Company) {
    selectCompanyScope(company);
    router.push("/dashboard/live");
  }

  function openCompanySection(tab: CompanyTab) {
    if (!selectedCompany) {
      toast.error("Selecione uma empresa para gerenciar.");
      return;
    }

    selectCompanyScope(selectedCompany);
    setActiveCompanyTab(tab);
  }

  function openCompanyRoute(path: string) {
    if (!selectedCompany) {
      toast.error("Selecione uma empresa para gerenciar.");
      return;
    }

    selectCompanyScope(selectedCompany);
    router.push(path);
  }

  async function loadUserPermissions(userId: string) {
    setLoadingUserPermissions(true);
    try {
      const permissions = await apiFetch<UserPermission[]>(
        `/users/${userId}/permissions`,
      );
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
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar acessos do usuário.",
      );
      setUserPermissions({});
    } finally {
      setLoadingUserPermissions(false);
    }
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

    setSaving(true);
    try {
      const body = {
        name,
        trade_name: companyForm.trade_name.trim() || undefined,
        cnpj: companyForm.cnpj.trim() || undefined,
        plan: companyForm.plan,
        timezone: companyForm.timezone.trim() || "America/Sao_Paulo",
        user_limit: Math.trunc(userLimit),
        ...(editingCompany
          ? { active: companyForm.active === "true" }
          : undefined),
      };

      if (editingCompany) {
        await apiFetch(`/companies/${editingCompany.id}`, {
          method: "PUT",
          body,
        });
        toast.success("Empresa atualizada.");
      } else {
        const company = await apiFetch<Company>("/companies", {
          method: "POST",
          body,
        });
        setSelectedCompanyId(company.id);
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
        method: "DELETE",
      });
      toast.success("Empresa excluída.");

      const storedScope = getStoredMasterCompanyScope();
      if (storedScope?.id === company.id) {
        clearStoredMasterCompanyScope();
      }
      if (selectedCompanyId === company.id) {
        setSelectedCompanyId("");
        setUsers([]);
        setCompanyModules([]);
        setWorkers([]);
        setWorkerScopeWarning("");
        setCompanyStats(emptyCompanyOperationalStats);
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

    if (!selectedCompanyId) {
      toast.error("Selecione uma empresa antes de salvar o usuário.");
      return;
    }

    setSaving(true);
    try {
      if (userForm.isMaster) {
        const companyId = selectedCompanyId.trim();
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
          });
          toast.success("Usuário promovido a super-admin.");
        } else {
          await apiFetch(`/companies/${companyId}/users`, {
            method: "POST",
            body,
          });
          toast.success("Super-admin criado.");
        }

        setUserDialog(false);
        await loadCompanies();
        await loadCompanyDetails();
        return;
      }

      let savedUser: ManagedUser | undefined;
      const profileChanged = editingUser ? userProfileDirty : true;

      if (editingUser) {
        savedUser = editingUser;
        if (profileChanged) {
          savedUser = await apiFetch<ManagedUser>(
            `/users/${editingUser.id}`,
            {
              method: "PUT",
              body: {
                name,
                email,
                is_master: false,
                active: userForm.active === "true",
                ...(password ? { password } : undefined),
              },
            },
          );
        }
      } else {
        savedUser = await apiFetch<ManagedUser | undefined>(
          `/companies/${selectedCompanyId}/users`,
          {
            method: "POST",
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
      const savedUserId = await resolveSavedCompanyUserId(savedUser, email);
      if (savedUserId) {
        try {
          await syncUserPermissions(savedUserId);
        } catch (error) {
          permissionSyncError =
            error instanceof Error
              ? error.message
              : "Não foi possível sincronizar os acessos do usuário.";
        }
      } else {
        permissionSyncError =
          "A API salvou o usuário, mas não retornou nem permitiu localizar o ID para aplicar os acessos.";
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
      if (permissionSyncError) {
        toast(
          `Usuário salvo, mas os acessos não foram sincronizados: ${permissionSyncError}`,
        );
      }
      setUserDialog(false);
      await loadCompanyDetails();
    } catch (error) {
      toast.error(
        userForm.isMaster
          ? masterSaveErrorMessage(error, selectedCompanyId)
          : error instanceof Error
            ? error.message
            : "Falha ao salvar usuário.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteCompanyUser(user: ManagedUser) {
    if (!window.confirm(`Excluir o usuário "${user.name}"?`)) return;

    setDeletingUserId(user.id);
    try {
      await apiFetch(`/users/${user.id}`, {
        method: "DELETE",
      });
      toast.success("Usuário excluído.");
      if (editingUser?.id === user.id) {
        setUserDialog(false);
        setEditingUser(null);
      }
      await loadCompanyDetails();
    } catch (error) {
      toast.error(
        userDeleteErrorMessage(error, user.name, selectedCompanyId),
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
          method: "PUT",
          body,
        });
        toast.success("Super-admin atualizado.");
      } else {
        await apiFetch(`/companies/${companyId}/users`, {
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

  async function resolveSavedCompanyUserId(
    savedUser: ManagedUser | undefined,
    email: string,
  ) {
    if (savedUser?.id) return savedUser.id;
    if (editingUser?.id) return editingUser.id;

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !selectedCompanyId) return "";

    const rows = await apiFetch<ManagedUser[]>(
      `/companies/${selectedCompanyId}/users`,
    ).catch(() => []);
    const found = rows.find(
      (user) => user.email.trim().toLowerCase() === normalizedEmail,
    );

    return found?.id ?? "";
  }

  async function syncUserPermissions(userId: string) {
    const availableOptions = visiblePermissionOptions.filter(
      (option) => !option.unavailable,
    );
    if (!availableOptions.length) return;

    const currentPermissions = await apiFetch<UserPermission[]>(
      `/users/${userId}/permissions`,
    ).catch(() => []);
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
          await revokeUserPermission(userId, permissionId);
          if (permission.slug) {
            grantedSlugs.delete(permission.slug);
          }
        }
      }
    }
  }

  async function toggleCompanyModule(module: IpxModule) {
    if (!selectedCompanyId) return;

    const assignment = companyModules.find((row) => row.module_id === module.id);
    setUpdatingModuleId(module.id);

    try {
      if (!assignment) {
        await apiFetch(`/companies/${selectedCompanyId}/modules`, {
          method: "POST",
          body: { module_id: module.id, enabled: true },
        });
        toast.success("Módulo habilitado.");
      } else {
        await apiFetch(`/companies/${selectedCompanyId}/modules/${module.id}`, {
          method: "PUT",
          body: { enabled: !assignment.enabled },
        });
        toast.success(assignment.enabled ? "Módulo desabilitado." : "Módulo habilitado.");
      }

      await loadCompanyDetails();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao alterar módulo.");
    } finally {
      setUpdatingModuleId("");
    }
  }

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
          value={formatNumber(workers.length)}
          detail="Vinculados à empresa"
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
              loadCompanyDetails();
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
            loading={loadingDetails}
            stats={{
              ...companyStats,
              users: users.length,
              workers: workers.length,
            }}
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
                    onClick={() => loadCompanyDetails()}
                    disabled={!selectedCompanyId || loadingDetails}
                  >
                    <RefreshCw
                      className={cn("h-4 w-4", loadingDetails && "animate-spin")}
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
                  {loadingDetails ? (
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

      <Dialog open={userDialog} onOpenChange={setUserDialog}>
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
                    setUserProfileDirty(true);
                    setUserForm((form) => ({ ...form, name: event.target.value }));
                  }}
                />
              </FormField>
              <FormField label="E-mail">
                <Input
                  type="email"
                  value={userForm.email}
                  onChange={(event) => {
                    setUserProfileDirty(true);
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
                    setUserProfileDirty(true);
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
                    setUserProfileDirty(true);
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
              onClick={() => setUserDialog(false)}
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
  loading,
  stats,
  onOpenRoute,
  onOpenTab,
}: {
  company: Company | null;
  loading: boolean;
  stats: CompanyOperationalStats & {
    users: number;
    workers: number;
  };
  onOpenRoute: (path: string) => void;
  onOpenTab: (tab: CompanyTab) => void;
}) {
  const disabled = !company || loading;
  const scenarioTotal = stats.countingScenarios + stats.occupancyScenarios;
  const steps = [
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
      detail: `${formatNumber(stats.countingScenarios)} contagem / ${formatNumber(
        stats.occupancyScenarios,
      )} ocupação`,
      count: scenarioTotal,
      icon: ListChecks,
      onClick: () => onOpenRoute("/manager/scenarios"),
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gestão da empresa</CardTitle>
        <CardDescription>
          {company ? company.name : "Selecione uma empresa para ver a hierarquia."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2 md:grid-cols-2">
          {steps.map((step) => {
            const Icon = step.icon;

            return (
              <button
                key={step.index}
                type="button"
                className={cn(
                  "group flex min-h-20 items-center gap-3 rounded-md border border-border bg-background px-3 py-3 text-left transition",
                  "hover:border-primary/30 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-60",
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
                  {loading ? "..." : formatNumber(step.count)}
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
      `${formatNumber(unscopedCount)} worker(s) vieram sem company_id e foram ocultados porque o vínculo não pode ser comprovado.`,
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
) {
  const rows = await Promise.all(
    locations.map((location) => {
      return apiFetch<SubLocation[]>(
        `/locations/${location.id}/sub-locations`,
      ).catch(() => []);
    }),
  );

  return filterRowsByCompanyScopes(rows.flat(), companyScopeIds);
}

async function fetchScopedRows<T extends { id?: string | null }>(
  path: string,
) {
  return apiFetch<T[]>(path).then(uniqueRowsById).catch(() => []);
}

async function fetchScopedWorkers() {
  return apiFetch<unknown>("/workers")
    .then(normalizeWorkerRows)
    .then(uniqueRowsById);
}

async function fetchScopedOccupancyScenarios() {
  return apiFetch<OccupancyScenarioListResponse>("/occupancy/scenarios")
    .then(normalizeOccupancyScenarioList)
    .then(uniqueRowsById)
    .catch(() => []);
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

function normalizeOccupancyScenarioList(
  response: OccupancyScenarioListResponse,
): OccupancyScenario[] {
  return Array.isArray(response) ? response : response.data ?? [];
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
      });
      existingSlugs.add(slug);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        existingSlugs.add(slug);
        continue;
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
) {
  try {
    return await apiFetch(`/users/${userId}/permissions/${permissionId}`, {
      method: "DELETE",
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return;
    throw error;
  }
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
