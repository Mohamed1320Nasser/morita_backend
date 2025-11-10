import { createParamDecorator } from "routing-controllers";
import { BadRequestError, ForbiddenError } from "routing-controllers";
import prisma from "../prisma/client";
import API from "../config/api.types";
import getLanguage from "../language";

export interface AuthContext {
    user: any;
    tenantId?: string;
    companyId?: string;
    tenantRole?: string;
    companyRole?: string;
    tenant?: any;
    company?: any;
}
export function Auth(
    options: {
        userRole?: API.Role;
        tenantRole?: string;
        companyRole?: string;
        requireTenant?: boolean;
        requireCompany?: boolean;
    } = {}
) {
    return createParamDecorator({
        value: async (action: any) => {
            const request = action.request;
            const user = request.user;

            if (!user) {
                throw new ForbiddenError(
                    getLanguage(request.lang).userNotAuthenticated
                );
            }

            const context: AuthContext = { user };

            if (options.userRole && user.role !== options.userRole) {
                throw new ForbiddenError(
                    `Required user role: ${options.userRole}, but user has: ${user.role}`
                );
            }

            if (options.requireTenant || options.tenantRole) {
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
                const tenantPermission =
                    await prisma.tenantPermission.findFirst({
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

                // Check tenant role requirement if specified
                if (
                    options.tenantRole &&
                    tenantPermission.role !== options.tenantRole
                ) {
                    throw new ForbiddenError(
                        `Required tenant role: ${options.tenantRole}, but user has: ${tenantPermission.role}`
                    );
                }

                context.tenantId = tenantId;
                context.tenantRole = tenantPermission.role;
                context.tenant = tenant;
            }

            // Handle company validation
            if (options.requireCompany || options.companyRole) {
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
                const companyPermission =
                    await prisma.companyPermission.findFirst({
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

                // Check company role requirement if specified
                if (
                    options.companyRole &&
                    companyPermission.role !== options.companyRole
                ) {
                    throw new ForbiddenError(
                        `Required company role: ${options.companyRole}, but user has: ${companyPermission.role}`
                    );
                }

                context.companyId = companyId;
                context.companyRole = companyPermission.role;
                context.company = company;
            }

            return context;
        },
    });
}

/**
 * Simple decorator to get current user
 */
export function CurrentUser() {
    return createParamDecorator({
        value: (action: any) => {
            return action.request.user;
        },
    });
}

/**
 * Decorator to get tenant context
 */
export function TenantContext() {
    return createParamDecorator({
        value: (action: any) => {
            const request = action.request;
            return {
                tenantId: request.tenantId,
                tenantRole: request.tenantRole,
            };
        },
    });
}

/**
 * Decorator to get company context
 */
export function CompanyContext() {
    return createParamDecorator({
        value: (action: any) => {
            const request = action.request;
            return {
                companyId: request.companyId,
                companyRole: request.companyRole,
            };
        },
    });
}
