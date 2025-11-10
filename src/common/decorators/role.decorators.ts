import { Authorized } from "routing-controllers";
import API from "../config/api.types";

/**
 * Decorator for system admin access
 */
export function AdminOnly() {
    return Authorized(API.Role.admin);
}

/**
 * Decorator for system access
 */
export function SystemOnly() {
    return Authorized(API.Role.system);
}

/**
 * Decorator for tester access
 */
export function TesterOnly() {
    return Authorized(API.Role.tester);
}

/**
 * Decorator for tenant access
 */
export function TenantOnly() {
    return Authorized(API.Role.tenant);
}

/**
 * Decorator for company access
 */
export function CompanyOnly() {
    return Authorized(API.Role.company);
}

/**
 * Decorator for admin or system access
 */
export function AdminOrSystem() {
    return Authorized([API.Role.admin, API.Role.system]);
}

/**
 * Decorator for tenant or company access
 */
export function TenantOrCompany() {
    return Authorized([API.Role.tenant, API.Role.company]);
}

/**
 * Decorator for any authenticated user
 */
export function Authenticated() {
    return Authorized([
        API.Role.admin,
        API.Role.system,
        API.Role.tester,
        API.Role.tenant,
        API.Role.company,
    ]);
}
