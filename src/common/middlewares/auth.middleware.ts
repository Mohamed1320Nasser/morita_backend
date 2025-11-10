import { Middleware, ExpressMiddlewareInterface } from "routing-controllers";
import { Service } from "typedi";
import { AddUserToReq } from "../../api/auth/auth.middleware";

@Service()
@Middleware({ type: "before" })
export class AddUserToReqMiddleware implements ExpressMiddlewareInterface {
    use = AddUserToReq;
}
