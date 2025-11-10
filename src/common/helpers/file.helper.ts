import path from "path";
import API from "../config/api.types";
import { Request } from "express";
import Environment from "../config/environment";

export const MulterToAPIFileObject = (
    folder: string,
    file: Express.Multer.File
): API.File | undefined => {
    return file
        ? {
              size: file.size,
              title: file.filename,
              folder: folder,
              extention: path.extname(file.filename),
          }
        : undefined;
};

export const getSinglefile = (req: Request, field: string) => {
    return req.APIFiles && field in req.APIFiles
        ? req.APIFiles[field][0]
        : undefined;
};

export const getFilesList = (req: Request, field: string) => {
    return req.APIFiles && field in req.APIFiles ? req.APIFiles[field] : [];
};

export function getFileLink(folder?: string, title?: string) {
    if (folder && title) {
        return `${Environment.project.cdnLink}/${folder}/${title}`;
    }
    return null;
}
