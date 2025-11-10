import multer from "multer";
import * as path from "path";
import * as fs from "fs";
// import { fileTypeFromBuffer } from 'file-type'; //FIXME
import { v4 as uuid } from "uuid";
import Environment from "./environment";

export const fileUploadOptions = (folder: string, mimeTypes: string[]) => ({
    storage: multer.diskStorage({
        destination: (req: any, file: any, cb: any) => {
            const dir = path.join(
                path.resolve(Environment.project.cdnDir),
                `/${folder}`
            );
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            cb(null, dir);
        },
        filename: (req: any, file: Express.Multer.File, cb: any) => {
            const extention = path.parse(file.originalname).ext;
            const newName = `${uuid()}${extention}`;
            cb(null, newName);
        },
    }),

    // fileFilter: fileFilter(mimeTypes),

    // limits: {
    //     fieldNameSize: 255,
    //     fileSize: 1024 * 1024 * 2
    // }
});

// FIXME
// export function fileFilter(mimeTypes: string[] | { [field: string]: string[] }) {
//     return async (req: any, file: Express.Multer.File, cb: any) => {
//         const res = await fileTypeFromBuffer(file.buffer);
//         if (!res) {
//             cb(null, false);
//             return;
//         }
//         const checker = Array.isArray(mimeTypes)? mimeTypes : mimeTypes[file.fieldname];
//         if (checker.includes(res.mime)) {
//             cb(null, true);
//             return;
//         }
//         cb(null, false);
//     };
// }
