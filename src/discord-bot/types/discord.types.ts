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
import { TicketCategoryManager } from "../services/ticketCategoryManager.service";
import { TosManagerService } from "../services/tosManager.service";
import { AccountChannelManager } from "../services/accountChannelManager.service";

declare module "discord.js" {
    interface Client {
        commands: Collection<string, Command>;
        apiService: ApiService;
        channelManager: ChannelManagerService;
        improvedChannelManager: ImprovedChannelManager;
        ticketCategoryManager: TicketCategoryManager;
        tosManager: TosManagerService;
        accountChannelManager: AccountChannelManager;
    }
}

export interface Command {
    data: {
        name: string;
        description: string;
        options?: any[];
    };
    execute: (interaction: CommandInteraction) => Promise<void>;
}

export interface Button {
    customId: string;
    execute: (interaction: ButtonInteraction) => Promise<void>;
}

export interface SelectMenu {
    customId: string;
    execute: (interaction: SelectMenuInteraction) => Promise<void>;
}

export interface Modal {
    customId: string;
    execute: (interaction: ModalSubmitInteraction) => Promise<void>;
}

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

export interface ServiceModifier {
    id: string;
    name: string;
    modifierType: "PERCENTAGE" | "FIXED";
    value: number;
    displayType: "NORMAL" | "UPCHARGE" | "DISCOUNT" | "NOTE" | "WARNING";
    priority: number;
    condition?: string;
    active: boolean;
}

export interface Service {
    id: string;
    name: string;
    slug: string;
    description?: string;
    emoji?: string;
    imageUrl?: string;
    active: boolean;
    displayOrder: number;
    shortcuts?: string[];
    category?: ServiceCategory;
    serviceModifiers?: ServiceModifier[];
    pricingMethods?: PricingMethod[];
}

export interface PricingMethod {
    id: string;
    name: string;
    groupName?: string;
    description?: string;
    basePrice: number;
    pricingUnit: "FIXED" | "PER_LEVEL" | "PER_KILL" | "PER_ITEM" | "PER_HOUR";
    startLevel?: number;
    endLevel?: number;
    displayOrder: number;
    active: boolean;
    shortcuts?: string[];
    modifiers?: PricingModifier[];
    methodPrices?: MethodPrice[];
}

export interface PricingModifier {
    id: string;
    name: string;
    modifierType: "PERCENTAGE" | "FIXED";
    value: number;
    condition?: string;
    displayType?: "NORMAL" | "UPCHARGE" | "DISCOUNT" | "NOTE" | "WARNING"; 
    priority: number;
    active: boolean;
}

export interface PaymentMethod {
    id: string;
    name: string;
    type: "CRYPTO" | "NON_CRYPTO";
    active: boolean;
}

export interface MethodPrice {
    id: string;
    price: number;
    paymentMethod: PaymentMethod;
}

export interface PriceCalculationRequest {
    methodId: string;
    paymentMethodId: string;
    quantity?: number;
    customConditions?: Record<string, any>;
}

export interface PriceCalculationResult {
    basePrice: number;
    finalPrice: number;
    serviceModifiers?: Array<{
        name: string;
        type: string;
        displayType: string;
        value: number;
        applied: boolean;
        appliedAmount?: number;
        reason?: string;
    }>;
    methodModifiers?: Array<{
        name: string;
        type: string;
        displayType: string;
        value: number;
        applied: boolean;
        appliedAmount?: number;
        reason?: string;
    }>;
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
        serviceModifiersTotal?: number;
        methodModifiersTotal?: number;
        totalModifiers: number;
        finalPrice: number;
    };
}

export interface OrderData {
    serviceId: string;
    methodId: string;
    paymentMethodId: string;
    osrsUsername: string;
    discordTag: string;
    specialNotes?: string;
    totalPrice: number;
}

export enum TicketType {
    PURCHASE_SERVICES_OSRS = "PURCHASE_SERVICES_OSRS",
    PURCHASE_SERVICES_RS3 = "PURCHASE_SERVICES_RS3",
    BUY_GOLD_OSRS = "BUY_GOLD_OSRS",
    BUY_GOLD_RS3 = "BUY_GOLD_RS3",
    SELL_GOLD_OSRS = "SELL_GOLD_OSRS",
    SELL_GOLD_RS3 = "SELL_GOLD_RS3",
    SWAP_CRYPTO = "SWAP_CRYPTO",
    PURCHASE_ACCOUNT = "PURCHASE_ACCOUNT",
    GENERAL = "GENERAL",
}

export interface TicketData {
    orderId: string;
    customerId: string;
    serviceName: string;
    totalPrice: number;
    status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
    channelId?: string;
    ticketType?: TicketType; 
    accountData?: {
        username: string;
        password: string;
        email: string;
        bankPin?: string;
    };
}

export interface TicketMetadata {
    goldAmount?: number;
    goldRate?: number;
    deliveryMethod?: string;
    worldLocation?: string;
    osrsUsername?: string;
    cryptoType?: string;
    cryptoAmount?: number;
    walletAddress?: string;
    swapDirection?: string;
    paymentEmail?: string;
    paymentProof?: string;
    payoutAmount?: number;
    specialNotes?: string;
    internalNotes?: string;
}
