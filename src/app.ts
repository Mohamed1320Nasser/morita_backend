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
import { resInterceptor, DecimalInterceptor } from "./common/interceptors";
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
import CryptoMonitorService from "./services/crypto-monitor.service";

(async () => {
    useContainer(Container);
    const controllers = await getControllers();
    const app = express();
    const isProduction = Environment.env === "production";

    Sentry.init({
        dsn: Environment.Sentry.dsn,
        environment: Environment.Sentry.environment,
        release: "1.0",
        integrations: [
            Sentry.contextLinesIntegration({ frameContextLines: 5 }),
            Sentry.httpIntegration(),
            Sentry.expressIntegration(),
            Sentry.prismaIntegration(),
            nodeProfilingIntegration(),
        ],
        tracesSampleRate: isProduction ? 0.1 : 1.0,
        profilesSampleRate: isProduction ? 0.1 : 1.0,
    });

    const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || "")
        .split(",")
        .map(o => o.trim())
        .filter(o => o.length > 0);

    if (allowedOrigins.length > 0) {
        app.use(
            cors({
                origin: (origin, callback) => {
                    if (!origin || allowedOrigins.includes(origin)) {
                        return callback(null, true);
                    }
                    return callback(null, false);
                },
                methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
                allowedHeaders: [
                    "Content-Type",
                    "Authorization",
                    "X-Requested-With",
                    "Accept",
                    "Accept-Language",
                    "X-API-Key",
                ],
                exposedHeaders: ["Content-Length", "ETag"],
                credentials: true,
                optionsSuccessStatus: 204,
            })
        );
        logger.info(`CORS restricted to: ${allowedOrigins.join(", ")}`);
    } else {
        app.use(cors());
        logger.warn(
            "CORS_ALLOWED_ORIGINS is not set - allowing all origins. " +
                "Set it to your dashboard origin(s) in production."
        );
    }

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

    // Serve static files from CDN directory (for local development)
    app.use("/cdn", express.static(Environment.project.cdnDir));
    useExpressServer(app, {
        authorizationChecker,
        classToPlainTransformOptions: {
            enableImplicitConversion: true,
        },
        validation: true,
        currentUserChecker,
        defaultErrorHandler: false,
        interceptors: [resInterceptor, DecimalInterceptor],
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

    app.use(Sentry.expressErrorHandler());

    app.listen(Environment.Server.port, async () => {
        logger.info(`${Environment.env} Mode`);
        logger.info(
            `server running on http://${Environment.Server.host}:${Environment.Server.port}/`
        );

        // Start crypto transaction monitoring
        if (process.env.CRYPTO_MONITORING_ENABLED === "true") {
            try {
                const cryptoMonitor = Container.get(CryptoMonitorService);
                cryptoMonitor.startMonitoring();
                logger.info("✅ Crypto transaction monitoring started");
            } catch (error: any) {
                logger.error("❌ Failed to start crypto monitoring:", error.message);
            }
        } else {
            logger.info(
                "Crypto transaction monitoring is disabled (set CRYPTO_MONITORING_ENABLED=true to enable)"
            );
        }
    });
})();
