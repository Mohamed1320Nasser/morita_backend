import API from "../../common/config/api.types";
import { Service } from "typedi";
import prisma from "../../common/prisma/client";
import axios from "axios";
import fs from "fs";
import path from "path";
import { URL } from "url";
import { v4 as uuid } from "uuid";
import Environment from "../../common/config/environment";
import logger from "../../common/loggers";
@Service()
export default class FileService {
    async upload(data: API.File, uploadeder: number) {
        const file = await prisma.file.create({
            data: {
                folder: data.folder,
                format: data.extention,
                size: data.size,
                title: data.title,
                uploadedBy: uploadeder,
            },
        });
        data.id = file.id;
        return data;
    }
    async downloadFileFromUrl(url: string, folder: string, uploadeder: number) {
        const response = await axios.get(url, { responseType: "stream" });

        if (response.status !== 200) {
            throw new Error(`Request failed with status ${response.status}`);
        }

        const urlObject = new URL(url);

        const fileName = path.basename(urlObject.pathname);

        const fileExt = path.extname(fileName);

        const newFileName = `${uuid()}${fileExt}`;

        const dir = path.join(
            path.resolve(Environment.project.cdnDir),
            `/${folder}`
        );

        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        const filePath = path.join(dir, newFileName);

        const writer = fs.createWriteStream(filePath);

        response.data.pipe(writer);

        const res = await new Promise<boolean>((resolve, reject) => {
            writer.on("finish", () => {
                logger.info(`File downloaded and saved as ${fileName}`);
                resolve(true);
            });

            writer.on("error", err => {
                reject(err);
            });
        });

        if (!res) throw Error("Error downloading file");

        const stats = await fs.promises.stat(filePath);

        const file = await this.upload(
            {
                folder: folder,
                title: newFileName,
                extention: fileExt,
                size: stats.size,
            },
            uploadeder
        );

        return file;
    }
}
