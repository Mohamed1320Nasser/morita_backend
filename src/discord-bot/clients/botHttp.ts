import axios from "axios";
import { discordConfig } from "../config/discord.config";
import { botApiHeaders } from "../config/apiAuth";

export const botHttp = axios.create({
    baseURL: discordConfig.apiBaseUrl,
    timeout: 30000,
});

botHttp.interceptors.request.use(config => {
    config.headers = Object.assign({}, botApiHeaders(), config.headers) as any;
    return config;
});
