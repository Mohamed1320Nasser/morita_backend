import API from "./api.types";
import Multer from "multer";
import * as path from "path";

export namespace APIConst {
    export const msgOK = new API.res("ok");
    export const msg400 = new API.err(400, "Bad Request");
    export const msg401 = new API.err(401, "Unauthorized");
    export const msg403 = new API.err(403, "Forbidden");
    export const msg404 = new API.err(404, "Not Found");
    export const msg415 = new API.err(415, "Unsupported Media Type");
    export const msg500 = new API.err(500, "Internal Server Error");
    export const msg511 = new API.err(511, "Authentication Required");

    export const multerOps: Multer.Options = {
        dest: path.join(__dirname, "../../temp"),
    };
}

export default APIConst;
