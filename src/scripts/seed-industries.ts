import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const popularIndustries = [
    // Technology & IT
    { title_ar: "تكنولوجيا المعلومات", title_en: "Information Technology" },
    { title_ar: "البرمجيات", title_en: "Software Development" },
    { title_ar: "الأمن السيبراني", title_en: "Cybersecurity" },
    { title_ar: "الذكاء الاصطناعي", title_en: "Artificial Intelligence" },
    { title_ar: "البيانات الضخمة", title_en: "Big Data" },
    { title_ar: "الحوسبة السحابية", title_en: "Cloud Computing" },
    { title_ar: "تطوير التطبيقات", title_en: "Mobile App Development" },
    { title_ar: "تطوير المواقع", title_en: "Web Development" },

    // Finance & Banking
    { title_ar: "الخدمات المصرفية", title_en: "Banking Services" },
    { title_ar: "الاستثمار", title_en: "Investment" },
    { title_ar: "التأمين", title_en: "Insurance" },
    { title_ar: "المحاسبة", title_en: "Accounting" },
    { title_ar: "التمويل", title_en: "Finance" },
    { title_ar: "العقارات", title_en: "Real Estate" },
    { title_ar: "التداول", title_en: "Trading" },
    { title_ar: "الخدمات المالية", title_en: "Financial Services" },

    // Healthcare & Medical
    { title_ar: "الرعاية الصحية", title_en: "Healthcare" },
    { title_ar: "الأدوية", title_en: "Pharmaceuticals" },
    { title_ar: "المعدات الطبية", title_en: "Medical Equipment" },
    { title_ar: "طب الأسنان", title_en: "Dentistry" },
    { title_ar: "الطب البيطري", title_en: "Veterinary Medicine" },
    { title_ar: "الطب النفسي", title_en: "Psychiatry" },
    { title_ar: "الجراحة", title_en: "Surgery" },
    { title_ar: "التمريض", title_en: "Nursing" },

    // Education & Training
    { title_ar: "التعليم", title_en: "Education" },
    { title_ar: "التدريب المهني", title_en: "Vocational Training" },
    { title_ar: "التعليم العالي", title_en: "Higher Education" },
    { title_ar: "التعليم الابتدائي", title_en: "Primary Education" },
    { title_ar: "التعليم الثانوي", title_en: "Secondary Education" },
    { title_ar: "التعليم الخاص", title_en: "Private Education" },
    { title_ar: "التعليم الإلكتروني", title_en: "E-Learning" },
    { title_ar: "التدريب المؤسسي", title_en: "Corporate Training" },

    // Manufacturing & Production
    { title_ar: "التصنيع", title_en: "Manufacturing" },
    { title_ar: "المنسوجات", title_en: "Textiles" },
    { title_ar: "المواد الغذائية", title_en: "Food Production" },
    { title_ar: "السيارات", title_en: "Automotive" },
    { title_ar: "الإلكترونيات", title_en: "Electronics" },
    { title_ar: "المواد الكيميائية", title_en: "Chemicals" },
    { title_ar: "البناء", title_en: "Construction" },
    { title_ar: "الطاقة", title_en: "Energy" },

    // Retail & Commerce
    { title_ar: "التجارة الإلكترونية", title_en: "E-Commerce" },
    { title_ar: "التجزئة", title_en: "Retail" },
    { title_ar: "البيع بالجملة", title_en: "Wholesale" },
    { title_ar: "الموضة", title_en: "Fashion" },
    { title_ar: "المنتجات الفاخرة", title_en: "Luxury Goods" },
    { title_ar: "المنتجات الرياضية", title_en: "Sports Goods" },
    { title_ar: "المنتجات المنزلية", title_en: "Home Goods" },
    { title_ar: "المنتجات التجميلية", title_en: "Cosmetics" },

    // Media & Entertainment
    { title_ar: "الإعلام", title_en: "Media" },
    { title_ar: "الإنتاج التلفزيوني", title_en: "Television Production" },
    { title_ar: "الإنتاج السينمائي", title_en: "Film Production" },
    { title_ar: "الموسيقى", title_en: "Music" },
    { title_ar: "الألعاب الإلكترونية", title_en: "Gaming" },
    { title_ar: "النشر", title_en: "Publishing" },
    { title_ar: "الإعلان", title_en: "Advertising" },
    { title_ar: "التسويق الرقمي", title_en: "Digital Marketing" },

    // Transportation & Logistics
    { title_ar: "النقل", title_en: "Transportation" },
    { title_ar: "اللوجستيات", title_en: "Logistics" },
    { title_ar: "الشحن", title_en: "Shipping" },
    { title_ar: "الطيران", title_en: "Aviation" },
    { title_ar: "النقل البحري", title_en: "Maritime Transport" },
    { title_ar: "النقل البري", title_en: "Road Transport" },
    { title_ar: "النقل بالسكك الحديدية", title_en: "Railway Transport" },
    { title_ar: "خدمات التوصيل", title_en: "Delivery Services" },

    // Hospitality & Tourism
    { title_ar: "الضيافة", title_en: "Hospitality" },
    { title_ar: "السياحة", title_en: "Tourism" },
    { title_ar: "الفنادق", title_en: "Hotels" },
    { title_ar: "المطاعم", title_en: "Restaurants" },
    { title_ar: "المنتجعات", title_en: "Resorts" },
    { title_ar: "الرحلات", title_en: "Travel" },
    { title_ar: "الطيران المدني", title_en: "Civil Aviation" },
    { title_ar: "الخدمات السياحية", title_en: "Tourism Services" },

    // Agriculture & Food
    { title_ar: "الزراعة", title_en: "Agriculture" },
    { title_ar: "تربية الحيوانات", title_en: "Animal Husbandry" },
    { title_ar: "الغابات", title_en: "Forestry" },
    { title_ar: "صيد الأسماك", title_en: "Fishing" },
    { title_ar: "معالجة الأغذية", title_en: "Food Processing" },
    { title_ar: "البيوتكنولوجيا", title_en: "Biotechnology" },
    { title_ar: "البستنة", title_en: "Horticulture" },
    { title_ar: "الزراعة العضوية", title_en: "Organic Farming" },

    // Professional Services
    { title_ar: "الاستشارات", title_en: "Consulting" },
    { title_ar: "المحاماة", title_en: "Legal Services" },
    { title_ar: "الهندسة", title_en: "Engineering" },
    { title_ar: "الهندسة المعمارية", title_en: "Architecture" },
    { title_ar: "التصميم", title_en: "Design" },
    { title_ar: "الموارد البشرية", title_en: "Human Resources" },
    { title_ar: "التسويق", title_en: "Marketing" },
    { title_ar: "العلاقات العامة", title_en: "Public Relations" },

    // Government & Public Sector
    { title_ar: "الخدمات الحكومية", title_en: "Government Services" },
    { title_ar: "الأمن العام", title_en: "Public Security" },
    { title_ar: "الدفاع", title_en: "Defense" },
    { title_ar: "الخدمات البلدية", title_en: "Municipal Services" },
    { title_ar: "الخدمات الاجتماعية", title_en: "Social Services" },
    { title_ar: "الخدمات البيئية", title_en: "Environmental Services" },
    { title_ar: "الخدمات الصحية العامة", title_en: "Public Health" },
    { title_ar: "الخدمات التعليمية العامة", title_en: "Public Education" },

    // Non-Profit & NGO
    { title_ar: "المنظمات غير الربحية", title_en: "Non-Profit Organizations" },
    { title_ar: "الجمعيات الخيرية", title_en: "Charitable Organizations" },
    { title_ar: "المنظمات الإنسانية", title_en: "Humanitarian Organizations" },
    { title_ar: "المنظمات البيئية", title_en: "Environmental Organizations" },
    { title_ar: "المنظمات النسائية", title_en: "Women's Organizations" },
    { title_ar: "المنظمات الشبابية", title_en: "Youth Organizations" },
    { title_ar: "المنظمات الثقافية", title_en: "Cultural Organizations" },
    { title_ar: "المنظمات الرياضية", title_en: "Sports Organizations" },
];

async function seedIndustries() {
    try {
        console.log("🌱 Starting to seed industries...");

        // Check if industries already exist
        const existingCount = await prisma.industry.count();
        if (existingCount > 0) {
            console.log(
                `⚠️  Industries already exist (${existingCount} records). Skipping seed.`
            );
            return;
        }

        // Create industries
        const createdIndustries = await prisma.industry.createMany({
            data: popularIndustries,
        });

        console.log(
            `✅ Successfully seeded ${createdIndustries.count} industries!`
        );
        console.log("📋 Industries include:");
        console.log("   - Technology & IT");
        console.log("   - Finance & Banking");
        console.log("   - Healthcare & Medical");
        console.log("   - Education & Training");
        console.log("   - Manufacturing & Production");
        console.log("   - Retail & Commerce");
        console.log("   - Media & Entertainment");
        console.log("   - Transportation & Logistics");
        console.log("   - Hospitality & Tourism");
        console.log("   - Agriculture & Food");
        console.log("   - Professional Services");
        console.log("   - Government & Public Sector");
        console.log("   - Non-Profit & NGO");
    } catch (error) {
        console.error("❌ Error seeding industries:", error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

// Run the seed function if this file is executed directly
if (require.main === module) {
    seedIndustries()
        .then(() => {
            console.log("🎉 Industry seeding completed successfully!");
            process.exit(0);
        })
        .catch(error => {
            console.error("💥 Industry seeding failed:", error);
            process.exit(1);
        });
}

export default seedIndustries;
