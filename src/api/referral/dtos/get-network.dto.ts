import { IsOptional, IsIn } from "class-validator";

export class GetNetworkDto {
    @IsOptional()
    @IsIn(['all', 'active', 'left', 'rewarded', 'pending', 'not_onboarded'])
    filter?: string;
}
