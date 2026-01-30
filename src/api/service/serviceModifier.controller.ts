import {
    JsonController,
    Get,
    Post,
    Put,
    Delete,
    Param,
    Body,
    Authorized,
} from "routing-controllers";
import { Service } from "typedi";
import prisma from "../../common/prisma/client";
import logger from "../../common/loggers";
import API from "../../common/config/api.types";

interface CreateServiceModifierDto {
    name: string;
    modifierType: "PERCENTAGE" | "FIXED";
    value: number;
    displayType?: "NORMAL" | "UPCHARGE" | "NOTE" | "WARNING";
    priority?: number;
    condition?: string;
    active?: boolean;
}

interface UpdateServiceModifierDto {
    name?: string;
    modifierType?: "PERCENTAGE" | "FIXED";
    value?: number;
    displayType?: "NORMAL" | "UPCHARGE" | "NOTE" | "WARNING";
    priority?: number;
    condition?: string;
    active?: boolean;
}

@JsonController("/api/admin/services/:serviceId/modifiers")
@Service()
export default class ServiceModifierController {

    @Get("/")
    @Authorized(API.Role.admin)
    async getServiceModifiers(@Param("serviceId") serviceId: string) {
        logger.info(`[Admin] Fetching modifiers for service ${serviceId}`);

        try {
            const modifiers = await prisma.serviceModifier.findMany({
                where: { serviceId },
                orderBy: { priority: "asc" },
            });

            return {
                success: true,
                data: modifiers,
            };
        } catch (error) {
            logger.error(`[Admin] Get service modifiers error:`, error);
            throw error;
        }
    }

    @Get("/:modifierId")
    @Authorized(API.Role.admin)
    async getServiceModifier(
        @Param("serviceId") serviceId: string,
        @Param("modifierId") modifierId: string
    ) {
        logger.info(`[Admin] Fetching modifier ${modifierId}`);

        try {
            const modifier = await prisma.serviceModifier.findFirst({
                where: {
                    id: modifierId,
                    serviceId: serviceId,
                },
            });

            if (!modifier) {
                throw new Error("Modifier not found");
            }

            return {
                success: true,
                data: modifier,
            };
        } catch (error) {
            logger.error(`[Admin] Get service modifier error:`, error);
            throw error;
        }
    }

    @Post("/")
    @Authorized(API.Role.admin)
    async createServiceModifier(
        @Param("serviceId") serviceId: string,
        @Body() data: CreateServiceModifierDto
    ) {
        logger.info(`[Admin] Creating modifier for service ${serviceId}`);

        try {
            // Verify service exists
            const service = await prisma.service.findUnique({
                where: { id: serviceId },
            });

            if (!service) {
                throw new Error("Service not found");
            }

            const modifier = await prisma.serviceModifier.create({
                data: {
                    serviceId,
                    name: data.name,
                    modifierType: data.modifierType,
                    value: data.value,
                    displayType: data.displayType || "NORMAL",
                    priority: data.priority || 0,
                    condition: data.condition || null,
                    active: data.active !== undefined ? data.active : true,
                },
            });

            return {
                success: true,
                data: modifier,
            };
        } catch (error) {
            logger.error(`[Admin] Create service modifier error:`, error);
            throw error;
        }
    }

    @Put("/:modifierId")
    @Authorized(API.Role.admin)
    async updateServiceModifier(
        @Param("serviceId") serviceId: string,
        @Param("modifierId") modifierId: string,
        @Body() data: UpdateServiceModifierDto
    ) {
        logger.info(`[Admin] Updating modifier ${modifierId}`);

        try {
            // Verify modifier exists and belongs to service
            const existing = await prisma.serviceModifier.findFirst({
                where: {
                    id: modifierId,
                    serviceId: serviceId,
                },
            });

            if (!existing) {
                throw new Error("Modifier not found");
            }

            const modifier = await prisma.serviceModifier.update({
                where: { id: modifierId },
                data: {
                    ...(data.name !== undefined && { name: data.name }),
                    ...(data.modifierType !== undefined && { modifierType: data.modifierType }),
                    ...(data.value !== undefined && { value: data.value }),
                    ...(data.displayType !== undefined && { displayType: data.displayType }),
                    ...(data.priority !== undefined && { priority: data.priority }),
                    ...(data.condition !== undefined && { condition: data.condition }),
                    ...(data.active !== undefined && { active: data.active }),
                },
            });

            return {
                success: true,
                data: modifier,
            };
        } catch (error) {
            logger.error(`[Admin] Update service modifier error:`, error);
            throw error;
        }
    }

    @Delete("/:modifierId")
    @Authorized(API.Role.admin)
    async deleteServiceModifier(
        @Param("serviceId") serviceId: string,
        @Param("modifierId") modifierId: string
    ) {
        logger.info(`[Admin] Deleting modifier ${modifierId}`);

        try {
            // Verify modifier exists and belongs to service
            const existing = await prisma.serviceModifier.findFirst({
                where: {
                    id: modifierId,
                    serviceId: serviceId,
                },
            });

            if (!existing) {
                throw new Error("Modifier not found");
            }

            await prisma.serviceModifier.delete({
                where: { id: modifierId },
            });

            return {
                success: true,
                message: "Modifier deleted successfully",
            };
        } catch (error) {
            logger.error(`[Admin] Delete service modifier error:`, error);
            throw error;
        }
    }

    @Put("/:modifierId/toggle")
    @Authorized(API.Role.admin)
    async toggleServiceModifier(
        @Param("serviceId") serviceId: string,
        @Param("modifierId") modifierId: string
    ) {
        logger.info(`[Admin] Toggling modifier ${modifierId}`);

        try {
            const existing = await prisma.serviceModifier.findFirst({
                where: {
                    id: modifierId,
                    serviceId: serviceId,
                },
            });

            if (!existing) {
                throw new Error("Modifier not found");
            }

            const modifier = await prisma.serviceModifier.update({
                where: { id: modifierId },
                data: { active: !existing.active },
            });

            return {
                success: true,
                data: modifier,
            };
        } catch (error) {
            logger.error(`[Admin] Toggle service modifier error:`, error);
            throw error;
        }
    }
}
