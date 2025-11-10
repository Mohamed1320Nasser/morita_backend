import { Interceptor, InterceptorInterface, Action } from "routing-controllers";
import API from "../config/api.types";
import { Service } from "typedi";

@Service()
@Interceptor()
export class resInterceptor implements InterceptorInterface {
    intercept(action: Action, content: any) {
        return new API.res(content);
        // return content;
    }
}
