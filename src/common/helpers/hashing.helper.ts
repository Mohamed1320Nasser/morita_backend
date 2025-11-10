import * as bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import Environment from "../config/environment";

export const cryptPassword = async (password: string) =>
    bcrypt
        .genSalt(10)
        .then(salt => bcrypt.hash(password, salt))
        .then(hash => hash);

export const comparePassword = async (password: string, hashPassword: string) =>
    bcrypt.compare(password, hashPassword).then(resp => resp);

export const jwtSign = async (data: any) => {
    return new Promise<string>(async (resolve, reject) => {
        jwt.sign(
            data,
            Environment.jwtSecret,
            { expiresIn: 31556926 },
            (err: any, encode: any) => {
                if (err) {
                    reject(err);
                }
                resolve(encode);
            }
        );
    });
};

export const jwtVerify = async (data: any) => {
    return new Promise<any>(async (resolve, reject) => {
        jwt.verify(data, Environment.jwtSecret, (err: any, decoded: any) => {
            if (err) {
                reject(err);
            }
            resolve(decoded);
        });
    });
};
