import axios, { AxiosInstance, AxiosResponse } from "axios";

// Default timeout for HTTP requests (30 seconds)
const DEFAULT_TIMEOUT_MS = 30000;

export abstract class HttpClient {
    protected readonly instance: AxiosInstance;

    public constructor(baseURL: string, timeout: number = DEFAULT_TIMEOUT_MS) {
        this.instance = axios.create({
            baseURL,
            timeout,
            headers: {
                'Content-Type': 'application/json',
            },
        });
        this._initializeResponseInterceptor();
    }

    private _initializeResponseInterceptor = () => {
        this.instance.interceptors.response.use(this._handleResponse, this._handleError);
    };

    private _handleResponse = ({ data }: AxiosResponse) => data;

    protected _handleError = (error: any) => {
        // Re-throw axios errors to preserve error.response
        return Promise.reject(error);
    };
}
