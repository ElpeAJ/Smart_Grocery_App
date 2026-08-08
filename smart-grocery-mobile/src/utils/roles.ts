export type AppRole = 'customer' | 'staff' | 'manager' | 'driver' | 'admin';

export const isCustomerRole = (role?: string | null): role is AppRole => role === 'customer';

export const canAccessAdminWorkspace = (role?: string | null) => role === 'admin' || role === 'manager';

export const canManageCatalog = (role?: string | null) => role === 'manager' || role === 'admin';

export const canManageStores = (role?: string | null) => role === 'admin';

export const canManageUsersAndRoles = (role?: string | null) => role === 'admin';

export const canHandleOperations = (role?: string | null) =>
  role === 'manager' || role === 'staff';

export const canHandleDeliveries = (role?: string | null) =>
  role === 'manager' || role === 'driver';

export const canViewReports = (role?: string | null) =>
  role === 'admin' || role === 'manager' || role === 'staff' || role === 'driver';

export const getHomeRouteForRole = (role?: string | null) => {
  if (role === 'driver') {
    return '/(tabs)/deliveries';
  }

  if (role === 'staff') {
    return '/(tabs)/operations';
  }

  if (role === 'manager' || role === 'admin') {
    return '/(tabs)/admin';
  }

  return '/(tabs)';
};
