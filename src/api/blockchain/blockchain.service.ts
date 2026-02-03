import { Service } from "typedi";
import prisma from "../../common/prisma/client";
import { BadRequestError, NotFoundError } from "routing-controllers";
import logger from "../../common/loggers";
import axios from "axios";

// Supported networks and their Blockchair API paths
const NETWORK_CONFIG: Record<string, { apiPath: string; name: string; decimals: number }> = {
    litecoin: { apiPath: "litecoin", name: "Litecoin", decimals: 8 },
    bitcoin: { apiPath: "bitcoin", name: "Bitcoin", decimals: 8 },
    ethereum: { apiPath: "ethereum", name: "Ethereum", decimals: 18 },
    solana: { apiPath: "solana", name: "Solana", decimals: 9 },
    ripple: { apiPath: "ripple", name: "XRP Ledger", decimals: 6 },
};

// Currency to network mapping
const CURRENCY_NETWORK: Record<string, string> = {
    LTC: "litecoin",
    BTC: "bitcoin",
    ETH: "ethereum",
    USDT: "ethereum", // USDT on Ethereum (ERC-20)
    USDC: "ethereum", // USDC on Ethereum (ERC-20)
    SOL: "solana",
    XRP: "ripple",
};

export interface TransactionInput {
    address: string;
    amount: number;
    amountFormatted: string;
}

export interface TransactionOutput {
    address: string;
    amount: number;
    amountFormatted: string;
}

export interface TransactionInfo {
    txid: string;
    status: "confirmed" | "pending" | "not_found" | "error";
    confirmations: number;
    // Main amounts
    totalReceived: number;        // Total amount received by recipient(s)
    totalReceivedFormatted: string;
    totalReceivedUsd: number;
    totalInput: number;
    totalInputFormatted: string;
    totalInputUsd: number;
    totalOutput: number;
    totalOutputFormatted: string;
    totalOutputUsd: number;
    currency: string;
    // Addresses (first/primary)
    fromAddress: string;
    toAddress: string;
    // All inputs/outputs for detailed view
    inputs: TransactionInput[];
    outputs: TransactionOutput[];
    fee: number;
    feeFormatted: string;
    feeUsd: number;
    timestamp: string | null;
    blockHeight: number | null;
    network: string;
    explorerUrl: string;
    inputCount: number;
    outputCount: number;
}

@Service()
export default class BlockchainService {
    constructor() {}

    // ==================== Wallet Management ====================

    async getAllWallets() {
        const wallets = await prisma.cryptoWallet.findMany({
            orderBy: [{ isActive: "desc" }, { currency: "asc" }, { createdAt: "desc" }],
        });
        return wallets;
    }

    async getActiveWallets() {
        const wallets = await prisma.cryptoWallet.findMany({
            where: { isActive: true },
            orderBy: [{ currency: "asc" }, { createdAt: "desc" }],
        });
        return wallets;
    }

    async getWalletById(id: string) {
        const wallet = await prisma.cryptoWallet.findUnique({ where: { id } });
        if (!wallet) {
            throw new NotFoundError("Wallet not found");
        }
        return wallet;
    }

    async createWallet(data: { name: string; currency: string; network: string; address: string; upchargePercent?: number }) {
        // Validate currency and network
        const currency = data.currency.toUpperCase();
        const network = data.network.toLowerCase();

        if (!NETWORK_CONFIG[network]) {
            throw new BadRequestError(`Unsupported network: ${network}. Supported: ${Object.keys(NETWORK_CONFIG).join(", ")}`);
        }

        // Check if address already exists
        const existing = await prisma.cryptoWallet.findFirst({
            where: { address: data.address },
        });
        if (existing) {
            throw new BadRequestError("This wallet address already exists");
        }

        const wallet = await prisma.cryptoWallet.create({
            data: {
                name: data.name,
                currency: currency,
                network: network,
                address: data.address,
                isActive: true,
                upchargePercent: data.upchargePercent || 0,
            },
        });

        logger.info(`[Blockchain] Created wallet: ${wallet.name} (${wallet.currency})`);
        return wallet;
    }

    async updateWallet(id: string, data: { name?: string; currency?: string; network?: string; address?: string; isActive?: boolean; upchargePercent?: number }) {
        await this.getWalletById(id); // Check exists

        const updateData: any = {};
        if (data.name !== undefined) updateData.name = data.name;
        if (data.currency !== undefined) updateData.currency = data.currency.toUpperCase();
        if (data.network !== undefined) {
            if (!NETWORK_CONFIG[data.network.toLowerCase()]) {
                throw new BadRequestError(`Unsupported network: ${data.network}`);
            }
            updateData.network = data.network.toLowerCase();
        }
        if (data.address !== undefined) updateData.address = data.address;
        if (data.isActive !== undefined) updateData.isActive = data.isActive;
        if (data.upchargePercent !== undefined) updateData.upchargePercent = data.upchargePercent;

        const wallet = await prisma.cryptoWallet.update({
            where: { id },
            data: updateData,
        });

        logger.info(`[Blockchain] Updated wallet: ${wallet.name}`);
        return wallet;
    }

    async deleteWallet(id: string) {
        await this.getWalletById(id); // Check exists

        await prisma.cryptoWallet.delete({ where: { id } });
        logger.info(`[Blockchain] Deleted wallet: ${id}`);
        return { success: true };
    }

    // ==================== Transaction Verification ====================

    async verifyTransaction(currency: string, txid: string): Promise<TransactionInfo> {
        const currencyUpper = currency.toUpperCase();
        const network = CURRENCY_NETWORK[currencyUpper];

        if (!network) {
            throw new BadRequestError(
                `Unsupported currency: ${currency}. Supported: ${Object.keys(CURRENCY_NETWORK).join(", ")}`
            );
        }

        const networkConfig = NETWORK_CONFIG[network];

        logger.info(`[Blockchain] Verifying ${currencyUpper} transaction: ${txid}`);

        try {
            const response = await axios.get(
                `https://api.blockchair.com/${networkConfig.apiPath}/dashboards/transaction/${txid}`,
                { timeout: 15000 }
            );

            const data = response.data?.data?.[txid];

            if (!data) {
                return {
                    txid,
                    status: "not_found",
                    confirmations: 0,
                    totalReceived: 0,
                    totalReceivedFormatted: "0",
                    totalReceivedUsd: 0,
                    totalInput: 0,
                    totalInputFormatted: "0",
                    totalInputUsd: 0,
                    totalOutput: 0,
                    totalOutputFormatted: "0",
                    totalOutputUsd: 0,
                    currency: currencyUpper,
                    fromAddress: "",
                    toAddress: "",
                    inputs: [],
                    outputs: [],
                    fee: 0,
                    feeFormatted: "0",
                    feeUsd: 0,
                    timestamp: null,
                    blockHeight: null,
                    network: networkConfig.name,
                    explorerUrl: `https://blockchair.com/${networkConfig.apiPath}/transaction/${txid}`,
                    inputCount: 0,
                    outputCount: 0,
                };
            }

            const txData = data.transaction;
            const rawInputs = data.inputs || [];
            const rawOutputs = data.outputs || [];

            // Get confirmations from context
            const context = response.data?.context;
            const currentBlock = context?.state || 0;
            const txBlock = txData.block_id || 0;
            const confirmations = txBlock > 0 ? currentBlock - txBlock + 1 : 0;

            // Process inputs and outputs
            let totalInput = 0;
            let totalOutput = 0;
            let fromAddress = "";
            let toAddress = "";
            const processedInputs: TransactionInput[] = [];
            const processedOutputs: TransactionOutput[] = [];

            if (network === "ethereum") {
                // For Ethereum, simple single input/output
                const amount = parseFloat(txData.value || 0) / Math.pow(10, networkConfig.decimals);
                totalInput = amount;
                totalOutput = amount;
                fromAddress = txData.sender || "";
                toAddress = txData.recipient || "";

                if (fromAddress) {
                    processedInputs.push({
                        address: fromAddress,
                        amount: amount,
                        amountFormatted: amount.toFixed(8),
                    });
                }
                if (toAddress) {
                    processedOutputs.push({
                        address: toAddress,
                        amount: amount,
                        amountFormatted: amount.toFixed(8),
                    });
                }
            } else {
                // For Bitcoin/Litecoin/etc - UTXO based
                // Group inputs by address and sum amounts
                const inputsByAddress: Record<string, number> = {};
                for (const input of rawInputs) {
                    const addr = input.recipient || "unknown";
                    const value = (input.value || 0) / Math.pow(10, networkConfig.decimals);
                    inputsByAddress[addr] = (inputsByAddress[addr] || 0) + value;
                    totalInput += value;
                }

                // Convert to array and sort by amount (largest first)
                for (const [addr, amount] of Object.entries(inputsByAddress)) {
                    processedInputs.push({
                        address: addr,
                        amount: amount,
                        amountFormatted: amount.toFixed(8),
                    });
                }
                processedInputs.sort((a, b) => b.amount - a.amount);
                fromAddress = processedInputs[0]?.address || "";

                // Process outputs
                for (const output of rawOutputs) {
                    const addr = output.recipient || "unknown";
                    const value = (output.value || 0) / Math.pow(10, networkConfig.decimals);
                    totalOutput += value;
                    processedOutputs.push({
                        address: addr,
                        amount: value,
                        amountFormatted: value.toFixed(8),
                    });
                }
                processedOutputs.sort((a, b) => b.amount - a.amount);
                toAddress = processedOutputs[0]?.address || "";
            }

            const fee = parseFloat(txData.fee || 0) / Math.pow(10, networkConfig.decimals);
            const feeUsd = parseFloat(txData.fee_usd || 0);
            const totalInputUsd = parseFloat(txData.input_total_usd || 0);
            const totalOutputUsd = parseFloat(txData.output_total_usd || 0);
            const status = confirmations >= 1 ? "confirmed" : "pending";

            // Total received = total output (what recipients got)
            const totalReceived = totalOutput;
            const totalReceivedUsd = totalOutputUsd;

            logger.info(`[Blockchain] Transaction ${txid}: ${status}, received=${totalReceived} ${currencyUpper} ($${totalReceivedUsd.toFixed(2)}), inputs=${processedInputs.length}, outputs=${processedOutputs.length}, fee=${fee}, ${confirmations} confirmations`);

            return {
                txid,
                status,
                confirmations,
                totalReceived,
                totalReceivedFormatted: totalReceived.toFixed(8),
                totalReceivedUsd,
                totalInput,
                totalInputFormatted: totalInput.toFixed(8),
                totalInputUsd,
                totalOutput,
                totalOutputFormatted: totalOutput.toFixed(8),
                totalOutputUsd,
                currency: currencyUpper,
                fromAddress,
                toAddress,
                inputs: processedInputs,
                outputs: processedOutputs,
                fee,
                feeFormatted: fee.toFixed(8),
                feeUsd,
                timestamp: txData.time || null,
                blockHeight: txBlock > 0 ? txBlock : null,
                network: networkConfig.name,
                explorerUrl: `https://blockchair.com/${networkConfig.apiPath}/transaction/${txid}`,
                inputCount: rawInputs.length,
                outputCount: rawOutputs.length,
            };
        } catch (error: any) {
            if (error.response?.status === 404) {
                return {
                    txid,
                    status: "not_found",
                    confirmations: 0,
                    totalReceived: 0,
                    totalReceivedFormatted: "0",
                    totalReceivedUsd: 0,
                    totalInput: 0,
                    totalInputFormatted: "0",
                    totalInputUsd: 0,
                    totalOutput: 0,
                    totalOutputFormatted: "0",
                    totalOutputUsd: 0,
                    currency: currencyUpper,
                    fromAddress: "",
                    toAddress: "",
                    inputs: [],
                    outputs: [],
                    fee: 0,
                    feeFormatted: "0",
                    feeUsd: 0,
                    timestamp: null,
                    blockHeight: null,
                    network: networkConfig.name,
                    explorerUrl: `https://blockchair.com/${networkConfig.apiPath}/transaction/${txid}`,
                    inputCount: 0,
                    outputCount: 0,
                };
            }

            logger.error(`[Blockchain] Error verifying transaction ${txid}:`, error.message);

            return {
                txid,
                status: "error",
                confirmations: 0,
                totalReceived: 0,
                totalReceivedFormatted: "0",
                totalReceivedUsd: 0,
                totalInput: 0,
                totalInputFormatted: "0",
                totalInputUsd: 0,
                totalOutput: 0,
                totalOutputFormatted: "0",
                totalOutputUsd: 0,
                currency: currencyUpper,
                fromAddress: "",
                toAddress: "",
                inputs: [],
                outputs: [],
                fee: 0,
                feeFormatted: "0",
                feeUsd: 0,
                timestamp: null,
                blockHeight: null,
                network: networkConfig.name,
                explorerUrl: `https://blockchair.com/${networkConfig.apiPath}/transaction/${txid}`,
                inputCount: 0,
                outputCount: 0,
            };
        }
    }

    // Get supported currencies
    getSupportedCurrencies() {
        return Object.keys(CURRENCY_NETWORK).map(currency => ({
            currency,
            network: CURRENCY_NETWORK[currency],
            networkName: NETWORK_CONFIG[CURRENCY_NETWORK[currency]]?.name || currency,
        }));
    }
}
