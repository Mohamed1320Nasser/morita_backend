import { Service } from 'typedi';
import { PrismaClient } from '@prisma/client';
import slugify from 'slugify';
import { BatchCreateServicesDto } from './dtos/batchCreateServices.dto';
import { BatchCreatePricingMethodsDto } from './dtos/batchCreatePricingMethods.dto';

const prisma = new PrismaClient();

@Service()
export class BatchService {
  /**
   * Create multiple services in a single operation
   * Uses partial success pattern: continues on errors, returns summary
   *
   * @param data - Batch creation payload with categoryId and services array
   * @returns Summary with created services and any errors
   */
  async batchCreateServices(data: BatchCreateServicesDto) {
    const results = {
      created: 0,
      failed: 0,
      services: [] as Array<{ id: string; name: string; slug: string }>,
      errors: [] as Array<{ index: number; name: string; error: string }>,
    };

    // Validate category exists
    const category = await prisma.serviceCategory.findFirst({
      where: { id: data.categoryId, deletedAt: null },
    });

    if (!category) {
      throw new Error(`Category with ID ${data.categoryId} not found`);
    }

    // Process each service
    for (let i = 0; i < data.services.length; i++) {
      const serviceData = data.services[i];

      try {
        // Generate unique slug within category scope
        let slug = slugify(serviceData.name, { lower: true, strict: true });

        // Check for duplicates within category
        const existingService = await prisma.service.findFirst({
          where: {
            categoryId: data.categoryId,
            slug,
            deletedAt: null,
          },
        });

        if (existingService) {
          // Auto-increment slug to avoid conflicts
          let counter = 1;
          let uniqueSlug = `${slug}-${counter}`;

          while (
            await prisma.service.findFirst({
              where: {
                categoryId: data.categoryId,
                slug: uniqueSlug,
                deletedAt: null,
              },
            })
          ) {
            counter++;
            uniqueSlug = `${slug}-${counter}`;
          }

          slug = uniqueSlug;
        }

        // Create service
        const service = await prisma.service.create({
          data: {
            categoryId: data.categoryId,
            name: serviceData.name,
            slug,
            emoji: serviceData.emoji || null,
            description: serviceData.description || null,
            displayOrder: serviceData.displayOrder ?? i, // Default to index order
            active: serviceData.active ?? true,
          },
        });

        results.created++;
        results.services.push({
          id: service.id,
          name: service.name,
          slug: service.slug,
        });
      } catch (error: any) {
        results.failed++;
        results.errors.push({
          index: i,
          name: serviceData.name,
          error: error.message || 'Unknown error occurred',
        });
      }
    }

    return results;
  }

  /**
   * Validate batch data before submission
   * Returns validation errors without creating anything
   *
   * @param data - Batch creation payload to validate
   * @returns Validation result with any errors found
   */
  async validateBatchServices(data: BatchCreateServicesDto) {
    const errors = [] as Array<{ type: string; message: string; details?: any }>;

    // Check category exists
    const category = await prisma.serviceCategory.findFirst({
      where: { id: data.categoryId, deletedAt: null },
      include: { services: { where: { deletedAt: null } } },
    });

    if (!category) {
      errors.push({
        type: 'CATEGORY_NOT_FOUND',
        message: `Category with ID ${data.categoryId} not found`,
      });
      return { valid: false, errors };
    }

    // Check for duplicate names in batch
    const names = data.services.map((s) => s.name.trim().toLowerCase());
    const duplicates = names.filter((name, index) => names.indexOf(name) !== index);

    if (duplicates.length > 0) {
      const uniqueDuplicates = Array.from(new Set(duplicates));
      errors.push({
        type: 'DUPLICATE_NAMES',
        message: `Duplicate service names in batch: ${uniqueDuplicates.join(', ')}`,
        details: uniqueDuplicates,
      });
    }

    // Check for existing services in category
    const existingNames = category.services.map((s) => s.name.toLowerCase());
    const conflicts = data.services.filter((s) =>
      existingNames.includes(s.name.trim().toLowerCase())
    );

    if (conflicts.length > 0) {
      errors.push({
        type: 'EXISTING_SERVICES',
        message: `Services already exist in this category: ${conflicts.map((c) => c.name).join(', ')}`,
        details: conflicts.map((c) => c.name),
      });
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Create multiple pricing methods in a single operation
   * Uses partial success pattern: continues on errors, returns summary
   *
   * @param data - Batch creation payload with serviceId and pricingMethods array
   * @returns Summary with created pricing methods and any errors
   */
  async batchCreatePricingMethods(data: BatchCreatePricingMethodsDto) {
    const results = {
      created: 0,
      failed: 0,
      pricingMethods: [] as Array<{ id: string; name: string }>,
      errors: [] as Array<{ index: number; name: string; error: string }>,
    };

    // Validate service exists
    const service = await prisma.service.findFirst({
      where: { id: data.serviceId, deletedAt: null },
    });

    if (!service) {
      throw new Error(`Service with ID ${data.serviceId} not found`);
    }

    // Process each pricing method
    for (let i = 0; i < data.pricingMethods.length; i++) {
      const methodData = data.pricingMethods[i];

      try {
        // Create pricing method
        const pricingMethod = await prisma.pricingMethod.create({
          data: {
            serviceId: data.serviceId,
            name: methodData.name,
            pricingUnit: methodData.pricingUnit,
            basePrice: methodData.basePrice,
            startLevel: methodData.startLevel ?? null,
            endLevel: methodData.endLevel ?? null,
            description: methodData.description || null,
            displayOrder: methodData.displayOrder ?? i, // Default to index order
            active: methodData.active ?? true,
          },
        });

        results.created++;
        results.pricingMethods.push({
          id: pricingMethod.id,
          name: pricingMethod.name,
        });
      } catch (error: any) {
        results.failed++;
        results.errors.push({
          index: i,
          name: methodData.name,
          error: error.message || 'Unknown error occurred',
        });
      }
    }

    return results;
  }

  /**
   * Validate batch pricing methods before submission
   * Returns validation errors without creating anything
   *
   * @param data - Batch creation payload to validate
   * @returns Validation result with any errors found
   */
  async validateBatchPricingMethods(data: BatchCreatePricingMethodsDto) {
    const errors = [] as Array<{ type: string; message: string; details?: any }>;

    // Check service exists
    const service = await prisma.service.findFirst({
      where: { id: data.serviceId, deletedAt: null },
      include: { pricingMethods: { where: { deletedAt: null } } },
    });

    if (!service) {
      errors.push({
        type: 'SERVICE_NOT_FOUND',
        message: `Service with ID ${data.serviceId} not found`,
      });
      return { valid: false, errors };
    }

    // Check for duplicate names in batch
    const names = data.pricingMethods.map((m) => m.name.trim().toLowerCase());
    const duplicates = names.filter((name, index) => names.indexOf(name) !== index);

    if (duplicates.length > 0) {
      const uniqueDuplicates = Array.from(new Set(duplicates));
      errors.push({
        type: 'DUPLICATE_NAMES',
        message: `Duplicate pricing method names in batch: ${uniqueDuplicates.join(', ')}`,
        details: uniqueDuplicates,
      });
    }

    // Check for existing pricing methods in service
    const existingNames = service.pricingMethods.map((m) => m.name.toLowerCase());
    const conflicts = data.pricingMethods.filter((m) =>
      existingNames.includes(m.name.trim().toLowerCase())
    );

    if (conflicts.length > 0) {
      errors.push({
        type: 'EXISTING_PRICING_METHODS',
        message: `Pricing methods already exist for this service: ${conflicts.map((c) => c.name).join(', ')}`,
        details: conflicts.map((c) => c.name),
      });
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
