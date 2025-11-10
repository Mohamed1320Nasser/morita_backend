import prisma from "../common/prisma/client";
import { cryptPassword } from "../common/helpers/hashing.helper";
import { Role } from "@prisma/client";

async function addAdminUser() {
    const email = "monasser.eng@gmail.com";
    const passwordPlain = "MoNa.010";
    const fullname = "Admin User";

    try {
        console.log("👤 Seeding admin user...", email);

        const existing = await prisma.user.findUnique({ where: { email } });

        const password = await cryptPassword(passwordPlain);

        if (existing) {
            // Update to admin and ensure password + verification
            await prisma.user.update({
                where: { id: existing.id },
                data: {
                    password,
                    role: Role.admin,
                    emailIsVerified: true,
                    banned: false,
                    deletedAt: null,
                },
            });
            console.log("✅ Admin user updated:", email);
        } else {
            // Create admin user
            const base = fullname.replace(/\s/g, "-").toLowerCase();
            const randomNumber = Math.floor(Math.random() * 900) + 100;
            const username = `${base}${randomNumber}`;

            await prisma.user.create({
                data: {
                    fullname,
                    email,
                    password,
                    username,
                    role: Role.admin,
                    emailIsVerified: true,
                },
            });
            console.log("✅ Admin user created:", email);
        }
    } catch (error) {
        console.error("❌ Failed to seed admin user:", error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

if (require.main === module) {
    addAdminUser()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
}

export default addAdminUser;
