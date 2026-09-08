import type { UserAccessGridGroup, UserAccessGridOption } from "@/components/app/user-access-grid";
import type { UserAccessCatalogOption } from "@/lib/user-access-catalog";

export type UserAccessEditorOption = UserAccessGridOption & {
  /** UI keys only. Mutations must still resolve the original catalogue grants. */
  permissionKeys: string[];
};

export type UserAccessEditorGroup = Omit<UserAccessGridGroup, "options"> & {
  options: UserAccessEditorOption[];
};

const products = [
  { family: "counting", label: "Contagem" },
  { family: "occupancy", label: "Ocupação" },
  { family: "demographics", label: "Demográfico" },
] as const;

const surfaces = [
  { key: "live", label: "Ao vivo" },
  { key: "analytics", label: "Análises" },
  { key: "reports", label: "Relatórios" },
] as const;

const menus = [
  { capability: "views_manage", label: "Visões" },
  { capability: "workers_manage", label: "Workers" },
  { capability: "cameras_manage", label: "Câmeras" },
  { capability: "locations_manage", label: "Locais" },
  { capability: "scenarios_manage", label: "Cenários de Contagem" },
  { capability: "occupancy_manage", label: "Cenários de Ocupação" },
  { capability: "dashboard_widgets_manage", label: "Configurar widgets" },
] as const;

export function buildUserAccessEditorGroups(
  options: readonly UserAccessCatalogOption[],
  state: Readonly<Record<string, boolean>>,
): UserAccessEditorGroup[] {
  const selected = (option: UserAccessCatalogOption) => Boolean(state[option.slug]);
  const grantable = (option: UserAccessCatalogOption) => !option.unavailable && option.grants.length > 0;
  const keys = (items: readonly UserAccessCatalogOption[]) => items.filter(grantable).map((item) => item.slug);

  const groups: UserAccessEditorGroup[] = products.map(({ family, label }) => {
    const moduleOptions = options.filter((option) => option.category === "product" && option.group_key === `product:${family}`);
    const shared = moduleOptions.filter((option) => option.capability === `${family}_view`);
    const management = moduleOptions.filter((option) => option.capability === `${family}_manage`);
    // Existing module-owned management grants also expose its dashboards in the
    // authorization contract. Do not display those screens as independently off.
    const resourceAccessSelected = options.some((option) =>
      option.category === "administrative" && option.family === family &&
      grantable(option) && selected(option),
    );
    const hasSeparateScreens = moduleOptions.some((option) => Boolean(option.surface));
    const broadSelected = [...shared, ...management].some((option) => grantable(option) && selected(option));
    const managementSelected = management.some((option) => grantable(option) && selected(option));
    const anyAvailable = moduleOptions.some(grantable) || resourceAccessSelected;

    const rows: UserAccessEditorOption[] = surfaces.map(({ key, label: surfaceLabel }) => {
      const specific = moduleOptions.filter((option) => option.surface === key);
      const targets = specific.length ? specific : shared;
      const covered = resourceAccessSelected || (specific.length ? broadSelected : managementSelected);
      const availableKeys = keys(targets);
      return {
        id: key,
        key,
        label: surfaceLabel,
        checked: covered || targets.some(selected),
        disabled: covered || availableKeys.length === 0,
        linked: !specific.length && shared.some(grantable),
        description: resourceAccessSelected
          ? "Incluído nos recursos de gestão selecionados abaixo."
          : covered ? "Incluído no acesso conjunto ou na gestão do módulo."
          : availableKeys.length ? undefined : "Não disponível nos módulos habilitados.",
        permissionKeys: availableKeys,
      };
    });

    // When both legacy and granular grants exist, keep the broad grant explicit.
    // A checked broad grant cannot masquerade as three independently revocable ones.
    if (hasSeparateScreens && shared.length) {
      rows.push({
        id: "all-screens",
        key: "all-screens",
        label: "Acesso conjunto às telas",
        description: "Desmarque para selecionar as telas individualmente.",
        checked: shared.some(selected),
        disabled: keys(shared).length === 0,
        permissionKeys: keys(shared),
      });
    }
    for (const option of management) {
      rows.push({
        id: option.slug,
        key: option.slug,
        label: "Gestão do módulo",
        description: "Inclui a visualização das três telas e a gestão disponível no módulo.",
        checked: selected(option),
        disabled: !grantable(option),
        permissionKeys: keys([option]),
      });
    }
    return {
      id: `product:${family}`,
      label,
      kind: "module",
      description: anyAvailable ? "Telas e configurações do módulo." : "Módulo não habilitado ou sem acessos disponíveis.",
      options: rows,
    };
  });

  const menuRows: UserAccessEditorOption[] = [{
    id: "audit",
    key: "audit",
    label: "Auditoria",
    description: "Exclusiva do Superadmin.",
    checked: false,
    disabled: true,
    permissionKeys: [],
  }];
  for (const { capability, label } of menus) {
    const matches = options.filter((option) => option.category === "administrative" && option.capability === capability);
    if (!matches.length) {
      menuRows.push({
        id: capability,
        key: capability,
        label,
        description: "Não disponível nos módulos habilitados.",
        checked: false,
        disabled: true,
        permissionKeys: [],
      });
      continue;
    }
    for (const option of matches) {
      menuRows.push({
        id: option.slug,
        key: option.slug,
        label,
        description: matches.length > 1
          ? `${option.module_name} · ${option.description}`
          : option.description,
        checked: selected(option),
        disabled: !grantable(option),
        permissionKeys: keys([option]),
      });
    }
  }
  groups.push({
    id: "menus",
    label: "Menus e recursos de gestão",
    description: "Disponíveis para administradores, conforme os módulos habilitados.",
    kind: "menus",
    options: menuRows,
  });
  return groups;
}

export function userAccessEditorPermissionKeys(
  group: UserAccessEditorGroup,
  optionId?: string,
) {
  return [...new Set(group.options
    .filter((option) => optionId === undefined || (option.id === optionId && !option.disabled))
    .flatMap((option) => option.permissionKeys))];
}
