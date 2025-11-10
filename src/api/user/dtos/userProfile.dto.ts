export class UserProfileDto {
    id: number;
    fullname: string;
    username: string;
    email: string;
    phone?: string;
    role: string;
    emailIsVerified: boolean;
    banned: boolean;
    createdAt: Date;
    updatedAt: Date;
    profile?: {
        title: string;
        folder: string;
    };
    tenantPermissions?: {
        tenant: {
            id: string;
            name: string;
        };
        role: string;
        active: boolean;
        createdAt: Date;
    }[];
    companyPermissions?: {
        company: {
            id: string;
            name: string;
            tenant: {
                id: string;
                name: string;
            };
        };
        role: string;
        active: boolean;
        createdAt: Date;
    }[];
}
