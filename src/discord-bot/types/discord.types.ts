import {
    Client,
    CommandInteraction,
    ButtonInteraction,
    SelectMenuInteraction,
    ModalSubmitInteraction,
    Collection,
} from "discord.js";
import { ApiService } from "../services/api.service";
import { ChannelManagerService } from "../services/channelManager.service";
import { ImprovedChannelManager } from "../services/improvedChannelManager.service";

// Extend Discord client with custom properties
declare module "discord.js" {
    interface Client {
        commands: Collection<string, Command>;
        apiService: ApiService;
        channelManager: ChannelManagerService; // Legacy (keep for compatibility)
        improvedChannelManager: ImprovedChannelManager; // New real-time system
    }
}

// Command interface
export interface Command {
    data: {
        name: string;
        description: string;
        options?: any[];
    };
    execute: (interaction: CommandInteraction) => Promise<void>;
}

// Button interaction interface
export interface Button {
    customId: string;
    execute: (interaction: ButtonInteraction) => Promise<void>;
}

// Select menu interaction interface
export interface SelectMenu {
    customId: string;
    execute: (interaction: SelectMenuInteraction) => Promise<void>;
}

// Modal interaction interface
export interface Modal {
    customId: string;
    execute: (interaction: ModalSubmitInteraction) => Promise<void>;
}

// Service category type
export interface ServiceCategory {
    id: string;
    name: string;
    slug: string;
    emoji?: string;
    description?: string;
    icon?: string;
    active: boolean;
    displayOrder: number;
    services?: Service[];
}

// Service type
export interface Service {
    id: string;
    name: string;
    slug: string;
    description?: string;
    emoji?: string;
    active: boolean;
    displayOrder: number;
    category?: ServiceCategory;
    pricingMethods?: PricingMethod[];
}

// Pricing method type
export interface PricingMethod {
    id: string;
    name: string;
    description?: string;
    basePrice: number;
    pricingUnit: "FIXED" | "PER_LEVEL" | "PER_KILL" | "PER_ITEM" | "PER_HOUR";
    startLevel?: number; // Starting level for level-based pricing
    endLevel?: number; // Ending level for level-based pricing
    displayOrder: number;
    active: boolean;
    modifiers?: PricingModifier[];
    methodPrices?: MethodPrice[];
}

// Pricing modifier type
export interface PricingModifier {
    id: string;
    name: string;
    modifierType: "PERCENTAGE" | "FIXED";
    value: number;
    condition?: string;
    displayType?: "NORMAL" | "UPCHARGE" | "NOTE" | "WARNING"; // How to display this modifier
    priority: number;
    active: boolean;
}

// Payment method type
export interface PaymentMethod {
    id: string;
    name: string;
    type: "CRYPTO" | "NON_CRYPTO";
    active: boolean;
}

// Method price type
export interface MethodPrice {
    id: string;
    price: number;
    paymentMethod: PaymentMethod;
}

// Price calculation request
export interface PriceCalculationRequest {
    methodId: string;
    paymentMethodId: string;
    quantity?: number;
    customConditions?: Record<string, any>;
}

// Price calculation result
export interface PriceCalculationResult {
    basePrice: number;
    finalPrice: number;
    modifiers: Array<{
        name: string;
        type: string;
        value: number;
        applied: boolean;
        reason?: string;
    }>;
    paymentMethod: {
        id: string;
        name: string;
        type: string;
    };
    breakdown: {
        subtotal: number;
        totalModifiers: number;
        finalPrice: number;
    };
}

// Order data type
export interface OrderData {
    serviceId: string;
    methodId: string;
    paymentMethodId: string;
    osrsUsername: string;
    discordTag: string;
    specialNotes?: string;
    totalPrice: number;
}

// Ticket data type
export interface TicketData {
    orderId: string;
    customerId: string;
    serviceName: string;
    totalPrice: number;
    status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
    channelId?: string;
    accountData?: {
        username: string;
        password: string;
        email: string;
        bankPin?: string;
    };
}
