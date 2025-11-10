import API from "../../common/config/api.types";
import { cryptPassword } from "../../common/helpers/hashing.helper";
import { Service } from "typedi";
import prisma from "../../common/prisma/client";
import { createUserDto, editProfileDto, getUsersListDto } from "./dtos";
import { PrismaClient, Role, User } from "@prisma/client";
import { countStart } from "../../common/helpers/pagination.helper";
import { normalizeImage } from "../../common/helpers/normalize.helper";
import { BadRequestError } from "routing-controllers";
import getLanguage, { langCode } from "../../common/language/index";
import { lang } from "../../common/helpers/lang.helper";
@Service()
export default class UserService {
    constructor() {}

    async createUser(
        lang: langCode,
        admin: boolean,
        data: createUserDto,
        role: Role,
        profileFile?: API.File,
        client?: Pick<PrismaClient, "user">
    ) {
        const userOld = await (client ?? prisma).user.findFirst({
            select: {
                email: true,
                phone: true,
            },
            where: {
                OR: [
                    {
                        phone: data.phone,
                    },
                    {
                        email: data.email,
                    },
                ],
                deletedAt: null,
            },
        });

        if (userOld) {
            if (data.email && userOld.email == data.email.toLowerCase()) {
                throw new BadRequestError(getLanguage(lang).emailAlreadyExits);
            }

            if (userOld.phone && userOld.phone == data.phone) {
                throw new BadRequestError(
                    getLanguage(lang).phoneNumberAlreadyExits
                );
            }
        }

        let password = await cryptPassword(data.password);

        const fullname = data.fullname.replace(/\s/g, "-").toLowerCase();
        const randomNumber = Math.floor(Math.random() * 900) + 100;
        const username = `${fullname}${randomNumber}`;

        let user = await (client ?? prisma).user.create({
            data: {
                fullname: data.fullname,
                email: data.email,
                phone: data.phone,
                password: password,
                username: username,
                role: role,
                ...(admin
                    ? {
                          emailIsVerified: true,
                          profileId: profileFile?.id,
                      }
                    : {}),
            },
        });
        if (profileFile) {
            this.updateProfile(user.id, profileFile);
        }
        return user;
    }

    async updateProfile(userId: number, profileFile: API.File) {
        const profile = await prisma.file.create({
            data: {
                folder: profileFile.folder,
                format: profileFile.extention,
                title: profileFile.title,
                size: profileFile.size,
                uploadedBy: userId,
            },
        });
        const res = await prisma.user.update({
            data: { profileId: profile.id },
            where: {
                id: userId,
            },
        });
        return profile;
    }

    async getUserByEmailorPhone(emailorPhone: string) {
        const user = await prisma.user.findFirst({
            include: {
                profile: true,
            },
            where: {
                OR: [{ email: emailorPhone }, { phone: emailorPhone }],
                deletedAt: null,
            },
        });
        return user;
    }

    async updateUser(
        userId: number,
        data: Partial<User>,
        client?: Pick<PrismaClient, "user">
    ) {
        const res = await (client ?? prisma).user.update({
            data,
            where: { id: userId },
        });
        return res ? true : false;
    }

    public async getList(lang: langCode, data: getUsersListDto) {
        const where = {
            OR:
                data.search != ""
                    ? [
                          {
                              email: {
                                  contains: data.search,
                              },
                          },
                          {
                              phone: {
                                  contains: data.search,
                              },
                          },
                          {
                              fullname: {
                                  contains: data.search,
                              },
                          },
                      ]
                    : undefined,
            deletedAt: null,
            userRole: data.roleId
                ? {
                      some: {
                          id: data.roleId,
                      },
                  }
                : undefined,
            banned: data.banned ?? undefined,
        };

        const [usersList, bannedCount, activeCount, filterCount] =
            await prisma.$transaction([
                prisma.user.findMany({
                    select: {
                        id: true,
                        fullname: true,
                        username: true,
                        banned: true,
                        email: true,
                        phone: true,
                        createdAt: true,
                        profile: {
                            select: {
                                title: true,
                                folder: true,
                            },
                        },
                    },
                    take: data.limit,
                    skip: countStart(data.page, data.limit),
                    where: {
                        ...where,
                    },
                    orderBy: {
                        createdAt: "desc",
                    },
                }),
                prisma.user.count({
                    where: {
                        banned: true,
                        deletedAt: null,
                    },
                }),
                prisma.user.count({
                    where: {
                        banned: false,
                        deletedAt: null,
                    },
                }),
                prisma.user.count({ where }),
            ]);

        const list = usersList.map(user => {
            const { ...restUser } = user;

            const newUser = {
                ...normalizeImage(restUser, "profile"),
            };
            return newUser;
        });

        return {
            list,
            bannedCount,
            activeCount,
            filterCount,
            total: bannedCount + activeCount,
        };
    }

    public async flipUserBan(id: number) {
        const res = await prisma.$transaction(async tx => {
            const user = await tx.user.findFirst({
                select: {
                    banned: true,
                },
                where: {
                    id: id,
                },
            });
            if (!user) {
                return null;
            }

            return await tx.user.update({
                data: {
                    banned: !user.banned,
                },
                where: {
                    id: id,
                },
            });
        });

        return res;
    }

    public async getProfile(lang: langCode, userId: number) {
        const user = await prisma.user.findFirst({
            select: {
                fullname: true,
                username: true,
                phone: true,
                email: true,
                password: true,
                profile: {
                    select: {
                        title: true,
                        folder: true,
                    },
                },
            },
            where: {
                id: userId,
            },
        });

        if (!user) return null;

        const { ...restUser } = user;

        return normalizeImage(user, "profile");
    }

    public async editProfile(
        lang: langCode,
        id: number,
        data: editProfileDto,
        profileFile?: API.File
    ) {
        if (data.phone) {
            const userOld = await prisma.user.findFirst({
                select: {
                    phone: true,
                },
                where: {
                    phone: data.phone,
                },
            });

            if (userOld && userOld.phone == data.phone) {
                throw new BadRequestError(
                    getLanguage(lang).phoneNumberAlreadyExits
                );
            }
        }

        let user = await prisma.user.update({
            data: {
                fullname: data.fullname,
                phone: data.phone,
                profile: profileFile?.id
                    ? { connect: { id: profileFile?.id } }
                    : data.removeProfileImage
                      ? { disconnect: true }
                      : undefined,
            },
            where: {
                id: id,
            },
        });
        if (profileFile) {
            this.updateProfile(user.id, profileFile);
        }

        return user;
    }

    public async getUser(lang: langCode, userId: number) {
        const user = await prisma.user.findFirst({
            select: {
                fullname: true,
                username: true,
                phone: true,
                email: true,
                profile: {
                    select: {
                        title: true,
                        folder: true,
                    },
                },
            },
            where: {
                id: userId,
            },
        });

        if (!user) return null;

        const { ...restUser } = user;

        const newUser = {
            ...normalizeImage(restUser, "profile"),
        };
        return newUser;
    }

    async getProfileWithPermissions(lang: langCode, userId: number) {
        const user = await prisma.user.findFirst({
            where: {
                id: userId,
                deletedAt: null,
            },
            select: {
                id: true,
                fullname: true,
                username: true,
                email: true,
                phone: true,
                role: true,
                emailIsVerified: true,
                banned: true,
                createdAt: true,
                updatedAt: true,
                profile: {
                    select: {
                        title: true,
                        folder: true,
                    },
                },
            },
        });

        if (!user) {
            return null;
        }

        const normalizedUser = normalizeImage(user, "profile");

        return normalizedUser;
    }
}
