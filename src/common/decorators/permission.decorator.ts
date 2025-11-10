import { createParamDecorator } from "routing-controllers";
import { BadRequestError, ForbiddenError } from "routing-controllers";
import prisma from "../prisma/client";
import API from "../config/api.types";
import getLanguage from "../language";

export interface PermissionContext {
    user: any;
    tenantId?: string;
    companyId?: string;
    tenantRole?: string;
    companyRole?: string;
}

/**
 * Decorator to validate tenant access and extract tenant context
 */
export function TenantAuth(requiredRole?: string) {
    return createParamDecorator({
        value: async (action: any) => {
            const request = action.request;
            const user = request.user;

            if (!user) {
                throw new ForbiddenError(
                    getLanguage(request.lang).userNotAuthenticated
                );
            }

            // Get tenantId from request (could be from params, body, or session)
            const tenantId =
                request.params?.tenantId ||
                request.body?.tenantId ||
                request.session?.tenantId ||
                request.query?.tenantId;

            if (!tenantId) {
                throw new BadRequestError(
                    getLanguage(request.lang).tenantIdRequired
                );
            }

            // Verify tenant exists and is active
            const tenant = await prisma.tenant.findUnique({
                where: { id: tenantId },
                select: { id: true, name: true, active: true },
            });

            if (!tenant) {
                throw new BadRequestError(
                    getLanguage(request.lang).tenantNotFound
                );
            }

            if (!tenant.active) {
                throw new ForbiddenError(
                    getLanguage(request.lang).tenantInactive
                );
            }

            // Check user's permission in this tenant
            const tenantPermission = await prisma.tenantPermission.findFirst({
                where: {
                    userId: user.id,
                    tenantId: tenantId,
                    active: true,
                },
                select: { role: true },
            });

            if (!tenantPermission) {
                throw new ForbiddenError(
                    "User does not have access to this tenant"
                );
            }

            // Check role requirement if specified
            if (requiredRole && tenantPermission.role !== requiredRole) {
                throw new ForbiddenError(
                    `Required role: ${requiredRole}, but user has: ${tenantPermission.role}`
                );
            }

            return {
                user,
                tenantId,
                tenantRole: tenantPermission.role,
                tenant,
            } as PermissionContext;
        },
    });
}

/**
 * Decorator to validate company access and extract company context
 */
export function CompanyAuth(requiredRole?: string) {
    return createParamDecorator({
        value: async (action: any) => {
            const request = action.request;
            const user = request.user;

            if (!user) {
                throw new ForbiddenError(
                    getLanguage(request.lang).userNotAuthenticated
                );
            }

            // Get companyId from request
            const companyId =
                request.params?.companyId ||
                request.body?.companyId ||
                request.session?.companyId ||
                request.query?.companyId;

            if (!companyId) {
                throw new BadRequestError(
                    getLanguage(request.lang).companyIdRequired
                );
            }

            // Verify company exists and is active
            const company = await prisma.company.findUnique({
                where: { id: companyId },
                select: {
                    id: true,
                    name: true,
                    active: true,
                    tenantId: true,
                },
            });

            if (!company) {
                throw new BadRequestError(
                    getLanguage(request.lang).companyNotFound
                );
            }

            if (!company.active) {
                throw new ForbiddenError(
                    getLanguage(request.lang).companyInactive
                );
            }

            // Check user's permission in this company
            const companyPermission = await prisma.companyPermission.findFirst({
                where: {
                    userId: user.id,
                    companyId: companyId,
                    active: true,
                },
                select: { role: true },
            });

            if (!companyPermission) {
                throw new ForbiddenError(
                    "User does not have access to this company"
                );
            }

            // Check role requirement if specified
            if (requiredRole && companyPermission.role !== requiredRole) {
                throw new ForbiddenError(
                    `Required role: ${requiredRole}, but user has: ${companyPermission.role}`
                );
            }

            return {
                user,
                companyId,
                companyRole: companyPermission.role,
                company,
                tenantId: company.tenantId,
            } as PermissionContext;
        },
    });
}

/**
 * Decorator to validate both tenant and company access
 */
export function TenantCompanyAuth(tenantRole?: string, companyRole?: string) {
    return createParamDecorator({
        value: async (action: any) => {
            const request = action.request;
            const user = request.user;

            if (!user) {
                throw new ForbiddenError(
                    getLanguage(request.lang).userNotAuthenticated
                );
            }

            // Get both tenantId and companyId
            const tenantId =
                request.params?.tenantId ||
                request.body?.tenantId ||
                request.session?.tenantId;

            const companyId =
                request.params?.companyId ||
                request.body?.companyId ||
                request.session?.companyId;

            if (!tenantId || !companyId) {
                throw new BadRequestError(
                    "Both Tenant ID and Company ID are required"
                );
            }

            // Verify tenant access
            const tenantPermission = await prisma.tenantPermission.findFirst({
                where: {
                    userId: user.id,
                    tenantId: tenantId,
                    active: true,
                },
                select: { role: true },
            });

            if (!tenantPermission) {
                throw new ForbiddenError(
                    "User does not have access to this tenant"
                );
            }

            if (tenantRole && tenantPermission.role !== tenantRole) {
                throw new ForbiddenError(
                    `Required tenant role: ${tenantRole}, but user has: ${tenantPermission.role}`
                );
            }

            // Verify company access
            const companyPermission = await prisma.companyPermission.findFirst({
                where: {
                    userId: user.id,
                    companyId: companyId,
                    active: true,
                },
                select: { role: true },
            });

            if (!companyPermission) {
                throw new ForbiddenError(
                    "User does not have access to this company"
                );
            }

            if (companyRole && companyPermission.role !== companyRole) {
                throw new ForbiddenError(
                    `Required company role: ${companyRole}, but user has: ${companyPermission.role}`
                );
            }

            return {
                user,
                tenantId,
                companyId,
                tenantRole: tenantPermission.role,
                companyRole: companyPermission.role,
            } as PermissionContext;
        },
    });
}

/**
 * Simple role-based authorization decorator
 */
export function RequireRole(role: API.Role) {
    return createParamDecorator({
        value: async (action: any) => {
            const request = action.request;
            const user = request.user;

            if (!user) {
                throw new ForbiddenError(
                    getLanguage(request.lang).userNotAuthenticated
                );
            }

            if (user.role !== role) {
                throw new ForbiddenError(
                    `Required role: ${role}, but user has: ${user.role}`
                );
            }

            return user;
        },
    });
}
