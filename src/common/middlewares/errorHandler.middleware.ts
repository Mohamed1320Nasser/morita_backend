import {
    Middleware,
    ExpressErrorMiddlewareInterface,
    HttpError,
} from "routing-controllers";
import { Service } from "typedi";
import API from "../config/api.types";
import logger from "../loggers";
import { Request, Response } from "express";
import { ValidationError } from "class-validator";
import Environment from "../config/environment";
import { object2string } from "../helpers/objects.helper";
import * as Sentry from "@sentry/node";
import { Prisma } from "@prisma/client";

@Service()
@Middleware({ type: "after" })
export class CustomErrorHandler implements ExpressErrorMiddlewareInterface {
    error(
        error: any,
        req?: Request,
        res?: Response,
        next?: (err?: any) => any
    ) {
        if (error instanceof API.err) {
            res?.status(error.status).json(error);
            return;
        }

        if (error instanceof Prisma.PrismaClientKnownRequestError) {
            const databaseError = new API.err(500, "Database Error", {
                message: "Database Error",
                code: error.code,
                data: object2string(error.meta),
            });
            logger.error({ message: databaseError.data });
            Sentry.withScope(scope => {
                scope.setExtra("Request", req);
                scope.setExtra("Response", res);
                scope.setContext("error_details", {
                    message: "Database Error",
                    code: databaseError.status,
                    meta: object2string(databaseError.data),
                });
                scope.setTag("error_type", "Database Error");
                Sentry.captureException(databaseError.data);
            });
            res?.status(databaseError.status).json(databaseError);
            return;
        }

        let err = new API.err(500, "Internal Server Error");
        if (
            error.errors &&
            Array.isArray(error.errors) &&
            error?.errors?.every(
                (element: any) => element instanceof ValidationError
            )
        ) {
            err = new API.err(400, "Invalid body", {
                message: "Invalid body, check 'errors' property for more info.",
                errors: error.errors,
            });
        } else {
            if (error instanceof HttpError) {
                err.status = error.httpCode ? error.httpCode : 500;
                err.msg = error.message;
            }

            const developmentMode: boolean = Environment.env === "development";
            if (error instanceof Error) {
                let msg = "";
                const data = {} as any;
                if (error.name && (developmentMode || error.message)) {
                    data.name = error.name;
                }
                if (error.message) {
                    msg = error.message;
                    data.message = error.message;
                }
                if (error.stack) {
                    data.stack = error.stack;
                }
                err.msg = msg;
                err.data = data;
            } else if (typeof error === "string") {
                err.data = error;
            }
            logger.error({ message: err.data });
            Sentry.withScope(scope => {
                scope.setExtra("Request", req);
                scope.setExtra("Response", res);
                scope.setContext("error_details", {
                    message: err.msg,
                    code: err.status,
                    meta: object2string(err.data),
                });
                scope.setTag("error_type", "Internal Server Error");
                Sentry.captureException(err);
            });
            !developmentMode && delete (err.data as any).stack;
        }
        res?.status(err.status).json(err);
        // next(error);
    }
}
