import { Interceptor, InterceptorInterface, Action } from "routing-controllers";
import { Service } from "typedi";
import { convertDecimalsToNumbers } from "../helpers/decimal.helper";
@Service()
@Interceptor()
export class DecimalInterceptor implements InterceptorInterface {
    intercept(action: Action, content: any) {
        return convertDecimalsToNumbers(content);
    }
}
