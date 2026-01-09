import "reflect-metadata";
import { useContainer, useExpressServer } from "routing-controllers";
import * as bodyParser from "body-parser";
import cors from "cors";
import helmet from "helmet";
import { Container } from "typedi";
import logger from "./common/loggers";
import Environment from "./common/config/environment";
import useragent from "express-useragent";
import express from "express";
import { resInterceptor } from "./common/interceptors";
import {
    CustomErrorHandler,
    morganMiddleware,
    AddUserToReqMiddleware,
    LangMiddleware,
    NotFoundMiddleware,
} from "./common/middlewares/";
import { authorizationChecker } from "./authorizationChecker";
import { currentUserChecker } from "./currentUserChecker";
import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";
import getControllers from "./api";

(async () => {
    useContainer(Container);
    const controllers = await getControllers();
    const app = express();
    Sentry.init({
        dsn: Environment.Sentry.dsn,
        environment: "development",
        release: "1.0",
        integrations: [
            Sentry.contextLinesIntegration({ frameContextLines: 5 }),
            Sentry.httpIntegration(),
            Sentry.expressIntegration(),
            Sentry.prismaIntegration(),
            nodeProfilingIntegration(),
        ],
        tracesSampleRate: 1.0,
        profilesSampleRate: 1.0,
    });

    app.use(Sentry.expressErrorHandler());
    // const corsOptions = {
    //     origin: (
    //         origin: string | undefined,
    //         callback: (err: Error | null, allow?: boolean) => void
    //     ) => {
    //         const allowed = ["http://localhost:3001", "http://127.0.0.1:3001"];
    //         if (!origin || allowed.includes(origin)) {
    //             return callback(null, true);
    //         }
    //         return callback(null, false);
    //     },
    //     methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    //     allowedHeaders: [
    //         "Content-Type",
    //         "Authorization",
    //         "X-Requested-With",
    //         "Accept",
    //     ],
    //     exposedHeaders: ["Content-Length", "ETag"],
    //     credentials: true,
    //     optionsSuccessStatus: 204,
    // };
    app.use(cors());
    // app.options("*", cors(corsOptions));
    app.use(helmet());
    app.use(useragent.express());
    app.use(morganMiddleware);

    app.get("/health", (req, res) => {
        res.status(200).json({
            status: "ok",
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
        });
    });
    useExpressServer(app, {
        authorizationChecker,
        classToPlainTransformOptions: {
            enableImplicitConversion: true,
        },
        validation: true,
        currentUserChecker,
        defaultErrorHandler: false,
        interceptors: [resInterceptor],
        middlewares: [
            LangMiddleware,
            AddUserToReqMiddleware,
            NotFoundMiddleware,
            CustomErrorHandler,
        ],
        controllers,
        defaults: {
            paramOptions: {
                required: false,
            },
        },
    });

    app.listen(Environment.Server.port, async () => {
        logger.info(`${Environment.env} Mode`);
        logger.info(
            `server running on http://${Environment.Server.host}:${Environment.Server.port}/`
        );
    });
})();
