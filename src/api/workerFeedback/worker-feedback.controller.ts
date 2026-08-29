import {
    JsonController,
    Get,
    Post,
    Delete,
    Body,
    Param,
    QueryParams,
    Authorized,
    UseBefore,
} from "routing-controllers";
import { Service } from "typedi";
import WorkerFeedbackService, { WorkerFeedbackType } from "./worker-feedback.service";
import { GetWorkerFeedbackListDto } from "./dtos";
import { DiscordAuthMiddleware } from "../../common/middlewares/discordAuth.middleware";
import API from "../../common/config/api.types";

@Service()
@JsonController("/worker-feedback")
export default class WorkerFeedbackController {
    constructor(private workerFeedbackService: WorkerFeedbackService) {}

    @Get("/")
    @Authorized(API.Role.admin)
    async list(@QueryParams() query: GetWorkerFeedbackListDto) {
        const data = await this.workerFeedbackService.list(query);
        return { success: true, data };
    }

    @Post("/")
    @Authorized(API.Role.admin)
    async create(
        @Body()
        data: {
            workerId: number;
            authorId: number;
            type: WorkerFeedbackType;
            rating?: number;
            comment: string;
            orderId?: string;
        }
    ) {
        const feedback = await this.workerFeedbackService.create(data);
        return { success: true, data: feedback };
    }

    @Delete("/:id")
    @Authorized(API.Role.admin)
    async remove(@Param("id") id: string) {
        return this.workerFeedbackService.remove(id);
    }

    /**
     * Written by the bot when support runs /worker-feedback, so it carries
     * Discord ids rather than internal ones.
     */
    @Post("/discord")
    @UseBefore(DiscordAuthMiddleware)
    async createFromDiscord(
        @Body()
        data: {
            workerDiscordId: string;
            authorDiscordId: string;
            type: WorkerFeedbackType;
            rating?: number;
            comment: string;
            orderId?: string;
        }
    ) {
        const feedback = await this.workerFeedbackService.create(data);
        return { success: true, data: feedback };
    }
}
