import { IsBoolean, IsOptional } from 'class-validator';
import { getListDto } from '../../common/dtos/getList.dto';

export class GetReferralsDto extends getListDto {
  @IsBoolean()
  @IsOptional()
  rewardGiven?: boolean;

  @IsBoolean()
  @IsOptional()
  onboarded?: boolean;
}
