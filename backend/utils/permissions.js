const ROLE_PERMISSIONS = {
  SUPER_ADMIN: ["*"],
  FLEET_MANAGER: ["fleet:read","fleet:write","trip:read","trip:write","assignment:read","assignment:write","driver:read","driver:write","vehicle:read","vehicle:write"],
  TRIP_MANAGER: ["fleet:read","trip:read","trip:write","assignment:read","assignment:write","driver:read","vehicle:read"],
  DISPATCHER: ["fleet:read","trip:read","trip:write","assignment:read","assignment:write","driver:read","vehicle:read"],
  DRIVER: ["trip:own","vehicle:own","profile:own","issue:own","tracking:publish"],
  CUSTOMER: ["trip:own","request:own","invoice:own","profile:own","tracking:own"],
  MAINTENANCE_MANAGER: ["maintenance:read","maintenance:write","vehicle:maintenance","profile:own"],
  FINANCE_MANAGER: ["finance:read","finance:write","invoice:read","invoice:write","payment:read","payment:write","profile:own"],
  VIEWER: ["fleet:read","trip:read","vehicle:read","driver:read","report:read","profile:own"],
};
function permissionsForRole(role){ return ROLE_PERMISSIONS[role] || []; }
function hasPermission(role, permission){ const list=permissionsForRole(role); return list.includes("*") || list.includes(permission); }
module.exports={ROLE_PERMISSIONS,permissionsForRole,hasPermission};
