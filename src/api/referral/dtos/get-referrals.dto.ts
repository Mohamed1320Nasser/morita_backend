import { IsBoolean, IsOptional, IsIn } from 'class-validator';
import { getListDto } from '../../common/dtos/getList.dto';

export class GetReferralsDto extends getListDto {
  @IsBoolean()
  @IsOptional()
  rewardGiven?: boolean;

  @IsBoolean()
  @IsOptional()
  onboarded?: boolean;

  @IsOptional()
  @IsIn(['all', 'rewarded', 'pending', 'not_onboarded'])
  status?: string;
}
