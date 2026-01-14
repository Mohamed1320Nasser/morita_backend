import axios, { AxiosInstance, AxiosResponse } from "axios";
import {
    ServiceCategory,
    Service,
    PricingMethod,
    PaymentMethod,
    PriceCalculationRequest,
    PriceCalculationResult,
} from "../types/discord.types";
import logger from "../../common/loggers";
import { getRedisService } from "../../common/services/redis.service";

export class ApiService {
    private client: AxiosInstance;
    private redis = getRedisService();

    private readonly CACHE_TTL = {
        SERVICES: 5 * 60,        
        PAYMENT_METHODS: 60 * 60, 
    };

    constructor(baseURL: string) {
        this.client = axios.create({
            baseURL,
            timeout: 10000,
            headers: {
                "Content-Type": "application/json",
            },
        });

        logger.info('[ApiService] Initialized with Redis caching');

        this.client.interceptors.request.use(
            config => config,
            error => {
                logger.error("API Request Error:", error);
                return Promise.reject(error);
            }
        );

        this.client.interceptors.response.use(
            response => response,
            error => {
                logger.error(
                    "API Response Error:",
                    error.response?.data || error.message
                );
                return Promise.reject(error);
            }
        );
    }

    async getCategories(): Promise<ServiceCategory[]> {
        try {
            const response: AxiosResponse<{
                msg: string;
                status: number;
                data: {
                    success: boolean;
                    data: ServiceCategory[];
                };
                error: boolean;
            }> = await this.client.get("/api/public/service-categories");

            if (response.data.data.success) {
                return response.data.data.data;
            }
            throw new Error("Failed to fetch categories");
        } catch (error) {
            logger.error("Error fetching categories:", error);
            throw error;
        }
    }

    async getCategoryById(id: string): Promise<ServiceCategory> {
        try {
            const response: AxiosResponse<{
                msg: string;
                status: number;
                data: {
                    success: boolean;
                    data: ServiceCategory;
                };
                error: boolean;
            }> = await this.client.get(`/api/public/service-categories/${id}`);

            if (response.data.data.success) {
                return response.data.data.data;
            }
            throw new Error("Failed to fetch category");
        } catch (error) {
            logger.error("Error fetching category:", error);
            throw error;
        }
    }

    async getServices(categoryId?: string): Promise<Service[]> {
        try {
            const params = categoryId ? { categoryId } : {};
            const response: AxiosResponse<{
                msg: string;
                status: number;
                data: {
                    success: boolean;
                    data: Service[];
                };
                error: boolean;
            }> = await this.client.get("/api/public/services", { params });

            if (response.data.data.success) {
                return response.data.data.data;
            }
            throw new Error("Failed to fetch services");
        } catch (error) {
            logger.error("Error fetching services:", error);
            throw error;
        }
    }

    async getServiceById(id: string): Promise<Service> {
        try {
            const response: AxiosResponse<{ success: boolean; data: Service }> =
                await this.client.get(`/api/public/services/${id}/pricing`);

            if (response.data.success) {
                return response.data.data;
            }
            throw new Error("Failed to fetch service");
        } catch (error) {
            logger.error("Error fetching service:", error);
            throw error;
        }
    }

    async getPricingMethods(serviceId: string): Promise<PricingMethod[]> {
        try {
            const response: AxiosResponse<{
                success: boolean;
                data: PricingMethod[];
            }> = await this.client.get(
                `/api/public/pricing/methods/service/${serviceId}`
            );

            if (response.data.success) {
                return response.data.data;
            }
            throw new Error("Failed to fetch pricing methods");
        } catch (error) {
            logger.error("Error fetching pricing methods:", error);
            throw error;
        }
    }

    async getPaymentMethods(): Promise<PaymentMethod[]> {
        const cacheKey = 'api:payment-methods:all';

        try {
            const cached = await this.redis.get<PaymentMethod[]>(cacheKey);
            if (cached) {
                logger.debug('[ApiService] 🎯 Cache HIT: Payment methods');
                return cached;
            }
            logger.debug('[ApiService] 💨 Cache MISS: Payment methods');
        } catch (error) {
            logger.warn('[ApiService] Cache read error, continuing without cache:', error);
        }

        try {
            const response: AxiosResponse<{
                msg: string;
                status: number;
                data: {
                    success: boolean;
                    data: PaymentMethod[];
                };
                error: boolean;
            }> = await this.client.get("/api/public/payment-methods");

            if (response.data.data.success) {
                const paymentMethods = response.data.data.data;

                try {
                    await this.redis.set(cacheKey, paymentMethods, this.CACHE_TTL.PAYMENT_METHODS);
                    logger.debug('[ApiService] 💾 Cached payment methods');
                } catch (error) {
                    logger.warn('[ApiService] Cache write error:', error);
                }

                return paymentMethods;
            }
            throw new Error("Failed to fetch payment methods");
        } catch (error) {
            logger.error("Error fetching payment methods:", error);
            throw error;
        }
    }

    async calculatePrice(
        request: PriceCalculationRequest
    ): Promise<PriceCalculationResult> {
        try {
            const response: AxiosResponse<{
                success: boolean;
                data: PriceCalculationResult;
            }> = await this.client.post(
                "/api/public/pricing/calculate",
                request
            );

            if (response.data.success) {
                return response.data.data;
            }
            throw new Error("Failed to calculate price");
        } catch (error) {
            logger.error("Error calculating price:", error);
            throw error;
        }
    }

    async getCategoriesWithServices(): Promise<ServiceCategory[]> {
        try {
            const response: AxiosResponse<{
                msg: string;
                status: number;
                data: {
                    success: boolean;
                    data: ServiceCategory[];
                };
                error: boolean;
            }> = await this.client.get(
                "/api/public/service-categories/with-services"
            );

            if (response.data.data.success) {
                return response.data.data.data;
            }
            throw new Error("Failed to fetch categories with services");
        } catch (error) {
            logger.error("Error fetching categories with services:", error);
            throw error;
        }
    }

    async getServiceWithPricing(serviceId: string): Promise<any> {
        try {
            const response: AxiosResponse<{
                msg: string;
                status: number;
                data: {
                    success: boolean;
                    data: any;
                };
                error: boolean;
            }> = await this.client.get(
                `/api/public/services/${serviceId}/with-pricing`
            );

            if (response.data.data.success) {
                return response.data.data.data;
            }
            throw new Error("Failed to fetch service with pricing");
        } catch (error) {
            logger.error("Error fetching service with pricing:", error);
            throw error;
        }
    }

    async getAllServicesWithPricing(): Promise<Service[]> {
        const cacheKey = 'api:services:all-with-pricing';

        try {
            const cached = await this.redis.get<Service[]>(cacheKey);
            if (cached) {
                logger.debug('[ApiService] 🎯 Cache HIT: All services with pricing');
                return cached;
            }
            logger.debug('[ApiService] 💨 Cache MISS: All services with pricing');
        } catch (error) {
            logger.warn('[ApiService] Cache read error, continuing without cache:', error);
        }

        try {
            const categories = await this.getCategoriesWithServices();
            const services: Service[] = [];

            for (const category of categories) {
                if (category.services && Array.isArray(category.services)) {
                    
                    const servicesWithCategory = category.services.map(service => ({
                        ...service,
                        category: {
                            id: category.id,
                            name: category.name,
                            slug: category.slug,
                            emoji: category.emoji,
                            description: category.description,
                            displayOrder: category.displayOrder,
                            active: category.active,
                        }
                    }));
                    services.push(...servicesWithCategory);
                }
            }

            try {
                await this.redis.set(cacheKey, services, this.CACHE_TTL.SERVICES);
                logger.debug('[ApiService] 💾 Cached all services with pricing');
            } catch (error) {
                logger.warn('[ApiService] Cache write error:', error);
            }

            return services;
        } catch (error) {
            logger.error("Error fetching all services with pricing:", error);
            throw error;
        }
    }

    async healthCheck(): Promise<boolean> {
        try {
            const response = await this.client.get("/health");
            return response.status === 200;
        } catch (error) {
            logger.error("Health check failed:", error);
            return false;
        }
    }

    setAuthToken(token: string): void {
        this.client.defaults.headers.common["Authorization"] =
            `Bearer ${token}`;
    }

    removeAuthToken(): void {
        delete this.client.defaults.headers.common["Authorization"];
    }
}
