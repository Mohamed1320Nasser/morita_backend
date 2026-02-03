export * from "./updateConfig.dto";
export * from "./claimReward.dto";
export * from "./getClaimHistory.dto";
export * from "./getLeaderboard.dto";
export * from "./getAllClaims.dto";

// Response interfaces
export interface ClaimStatus {
    canClaim: boolean;
    nextClaimAt: Date | null;
    remainingSeconds: number | null;
    lastClaimAmount: number | null;
    totalClaimed: number;
    claimCount: number;
}

export interface ClaimResult {
    success: boolean;
    amount?: number;
    newBalance?: number;
    error?: string;
    nextClaimAt?: Date;
}
