import { Session } from "@prisma/client";
import prisma from "../../common/prisma/client";
import { Service } from "typedi";
// import { updateFcmDTO, updateLangDTO, UpdateSessionDto } from "./dtos";
import { langCode } from "../../common/language";

@Service()
export default class SessionService {
    constructor() {}

    public async createSession(
        userId: number,
        token: string,
        identifier: string,
        source: string,
        lang?: langCode
    ) {
        const session = await prisma.session.create({
            data: {
                userId: userId,
                identifier: identifier,
                source: source,
                token: token,
                langCode: lang,
            },
        });

        return session;
    }

    public async findUserOldSession(
        userId: number,
        identifier: string,
        source: string
    ) {
        const oldSession = await prisma.session.findFirst({
            where: {
                AND: {
                    userId: userId,
                    OR: [{ identifier: identifier }, { source: source }],
                    user: {
                        deletedAt: null,
                    },
                },
            },
            take: 1,
        });
        return oldSession;
    }

    public async updateSession(sessionId: number, data: Partial<Session>) {
        const res = await prisma.session.update({
            data,
            where: { id: sessionId },
        });
        return res ? true : false;
    }

    public async getUserBySession(sessionId: number) {
        const res = await prisma.session.findFirst({
            where: {
                id: sessionId,
                user: {
                    deletedAt: null,
                },
            },
            include: {
                user: true,
            },
            take: 1,
        });

        return res;
    }

    public async getPreferredLanguage(
        userId: number
    ): Promise<{ langCode: string } | null> {
        const sessions = await prisma.session.findMany({
            where: {
                userId: userId,
                expired: false,
            },
            select: {
                langCode: true,
            },
        });

        if (sessions.length === 0) {
            return null;
        }

        const languageCount: Record<string, number> = {};
        for (const session of sessions) {
            const lang = session.langCode;
            if (lang) {
                languageCount[lang] = (languageCount[lang] || 0) + 1;
            }
        }

        let favoriteLang = "";
        let maxCount = 0;
        for (const [lang, count] of Object.entries(languageCount)) {
            if (count > maxCount) {
                favoriteLang = lang;
                maxCount = count;
            }
        }

        return {
            langCode: favoriteLang,
        };
    }
}
