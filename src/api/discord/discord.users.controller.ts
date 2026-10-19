import { Get, JsonController, Param, UseBefore } from 'routing-controllers';
import {
    DiscordAuthMiddleware,
    DiscordRateLimitMiddleware,
} from "../../common/middlewares/discordAuth.middleware";
import { Service } from 'typedi';
import prisma from '../../common/prisma/client';
import { NotFoundError } from 'routing-controllers';
import { customerTierFor } from '../../common/utils/customerTier.util';

@Service()
@JsonController('/discord/users')
@UseBefore(DiscordAuthMiddleware)
@UseBefore(DiscordRateLimitMiddleware)
export default class DiscordUsersController {
  @Get('/discord/:discordId')
  async getUserByDiscordId(@Param('discordId') discordId: string) {
    const user = await prisma.user.findFirst({
      where: { discordId },
      select: {
        id: true,
        discordId: true,
        email: true,
        fullname: true,
        role: true,
        discordRole: true,
      },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    return user;
  }

  /** Repeat-customer tier for the ticket welcome message (KPI plan, Feature 4) */
  @Get('/discord/:discordId/customer-tier')
  async getCustomerTier(@Param('discordId') discordId: string) {
    const completedOrders = await prisma.order.count({
      where: { status: 'COMPLETED', customer: { discordId } },
    });
    return customerTierFor(completedOrders);
  }

  @Get('/:userId')
  async getUserById(@Param('userId') userId: number) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        discordId: true,
        email: true,
        fullname: true,
        role: true,
        discordRole: true,
      },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    return user;
  }
}
