export interface IPermission {
    name: string;
}

export interface IScope {
    [permissionName: string]: IPermission;
}

export interface IAppPermissions {
    [scope: string]: IScope;
}

export function getAvailablePermissions(
    appPermissions: IAppPermissions,
): Array<string> {
    return Object.values(appPermissions).reduce(
        (availablePermissions, scope) =>
            availablePermissions.concat(
                Object.values(scope).map((permission) => permission.name),
            ),
        [] as Array<string>,
    ) as Array<string>;
}
