import { PartialType } from "../../../common/helpers/dto.helper";
import { createUserDto } from "./createUser.dto";

export class editUserDto extends PartialType(createUserDto) {}
