import API from "../../common/config/api.types";
import * as express from "express";
import { langCode } from "../../src/common/language";

declare global {
    declare namespace Express {
        interface Request {
            user?: API.User,
            lang: langCode,
            rateLimit: RateLimit;
            APIFiles: { [field: string]: API.File[] }
        }
    }
}