import multer from "multer";
import mime from "mime-types";
import * as path from "path";
import * as fs from "fs";
import { v4 as uuid } from "uuid";
import Environment from "../config/environment";
import { NextFunction, Response, Request } from "express";
import { MulterToAPIFileObject } from "../helpers/file.helper";
import API from "../config/api.types";
import logger from "../loggers";
import * as Sentry from "@sentry/node";

export const upload = (
    data: (multer.Field & {
        folder: string;
        acceptedMimetypes?: string[];
        required?: boolean;
    })[]
) => {
    const ops = {
        storage: multer.diskStorage({
            destination: (req: any, file: Express.Multer.File, cb: any) => {
                const dir = path.join(
                    path.resolve(Environment.project.cdnDir),
                    `/${data.find(x => x.name == file.fieldname)?.folder || "images"}`
                );
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
                cb(null, dir);
            },

            filename: (req: any, file: Express.Multer.File, cb: any) => {
                const extention = path.parse(file.originalname).ext;
                const newName = `${uuid()}${extention}`;
                logger.info(`filename: ${newName}`);
                cb(null, newName);
            },
        }),
        limits: {
            fileSize: 1024 * 1024 * 2, // 2 MB
        },
        fileFilter: function (req: any, file: Express.Multer.File, cb: any) {
            const acceptedMimetypes = data.find(
                x => x.name == file.fieldname
            )?.acceptedMimetypes;
            if (acceptedMimetypes) {
                const fileType = mime.lookup(file.originalname);
                if (fileType && acceptedMimetypes.includes(fileType)) {
                    cb(null, true);
                } else {
                    const errorMessage = `Invalid MIME type for file ${file.originalname}: expected one of [${acceptedMimetypes.join(", ")}], but received ${fileType || file.mimetype}`;
                    logger.error(errorMessage);
                    Sentry.captureException(new Error(errorMessage));
                    cb(new API.err(400, errorMessage), false);
                }
            }
        },
    };

    const upload = multer(ops);
    const fields = data.map(x => x as multer.Field);
    const uploadImage = upload.fields(fields);
    return async (req: Request, res: Response, next: NextFunction) => {
        uploadImage(req, res, async function (err) {
            try {
                if (err instanceof multer.MulterError) {
                    // A Multer error occurred when uploading.
                    throw err;
                } else if (err) {
                    // An unknown error occurred when uploading.
                    throw err;
                }
                // uploading went fine.

                // check for required fields
                for (const x of data) {
                    if (
                        req.files &&
                        x.name in req.files &&
                        (req.files as any)[x.name].length > 0
                    ) {
                        continue;
                    }

                    if (x.required === true) {
                        throw new API.err(
                            400,
                            `files required in field ${x.name}`
                        );
                    }
                }

                //check mimetype and delete unaccepted mimetype's files
                //check file size and delete passed limit files
                //convert multer file object to API.File object
                if (req.files) {
                    if (!req.APIFiles) req.APIFiles = {};
                    for (const field in req.files || []) {
                        for (
                            let i = 0;
                            i < (req.files as any)[field].length;
                            i++
                        ) {
                            const file = (req.files as any)[field][
                                i
                            ] as Express.Multer.File;
                            // const acceptedMimetypes = data.find(x => x.name == file.fieldname)?.acceptedMimetypes;
                            // if (acceptedMimetypes) {
                            //     const fileType = mime.lookup(file.originalname);
                            //     if (typeof fileType === 'string' &&!acceptedMimetypes.includes(fileType)) {
                            //         await unlink(file.path);
                            //         const expectedExtensions = acceptedMimetypes.join(', ');
                            //         const actualExtension = fileType || 'unknown';
                            //         const errorMessage = `Invalid file extension for file in field ${field}. Expected extensions: ${expectedExtensions}. Actual extension: ${actualExtension}`;
                            //         throw new API.err(400, errorMessage);
                            //     }
                            // }
                            // if (file.size > 1024 * 1024 * 2) { // 8 MB limit
                            //     await unlink(file.path);
                            //     throw new API.err(400, `File size exceeds the limit in field ${field}`);
                            // }

                            if (!(field in req.APIFiles)) {
                                req.APIFiles[field] = [];
                            }
                            (req.APIFiles as any)[field].push(
                                MulterToAPIFileObject(
                                    data.filter(x => x.name == field)[0].folder,
                                    (req.files as any)[field][i]
                                )
                            );
                        }
                    }
                }
                next();
            } catch (error) {
                next(error);
            }
        });
    };
};
