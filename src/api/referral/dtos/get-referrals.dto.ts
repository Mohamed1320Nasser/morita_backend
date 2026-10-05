import { IsBoolean, IsOptional, IsIn } from 'class-validator';
import { Transform } from 'class-transformer';
import { getListDto } from '../../common/dtos/getList.dto';

// Query strings arrive as "true"/"false", which @IsBoolean rejects as-is.
const toBoolean = ({ value }: { value: any }) =>
  value === true || value === 'true' ? true : value === false || value === 'false' ? false : value;

export class GetReferralsDto extends getListDto {
  @Transform(toBoolean)
  @IsBoolean()
  @IsOptional()
  rewardGiven?: boolean;

  @Transform(toBoolean)
  @IsBoolean()
  @IsOptional()
  onboarded?: boolean;

  @IsOptional()
  @IsIn(['all', 'rewarded', 'pending', 'not_onboarded', 'left', 'ineligible'])
  status?: string;
}
