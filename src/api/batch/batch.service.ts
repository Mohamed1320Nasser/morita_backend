import { Service } from 'typedi';
import slugify from 'slugify';
import { BatchCreateServicesDto } from './dtos/batchCreateServices.dto';
import { BatchCreatePricingMethodsDto } from './dtos/batchCreatePricingMethods.dto';
import { BatchCreateServicesWithPricingDto } from './dtos/batchCreateServicesWithPricing.dto';
import prisma from '../../common/prisma/client';

@Service()
export class BatchService {
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

  /**
   * Create multiple services with pricing methods and modifiers in a single transaction
   * Uses all-or-nothing transaction pattern for each service
   * If a service fails, others will still be created
   *
   * @param data - Batch creation payload with services, pricing methods, and modifiers
   * @returns Summary with created services and any errors
   */
  async batchCreateServicesWithPricing(data: BatchCreateServicesWithPricingDto) {
    const results = {
      created: 0,
      failed: 0,
      services: [] as Array<{
        id: string;
        name: string;
        slug: string;
        pricingMethodsCount: number;
        serviceModifiersCount: number;
        modifiersCount: number;
      }>,
      errors: [] as Array<{ index: number; serviceName: string; error: string }>,
    };

    // Validate category exists
    const category = await prisma.serviceCategory.findFirst({
      where: { id: data.categoryId, deletedAt: null },
    });

    if (!category) {
      throw new Error(`Category with ID ${data.categoryId} not found`);
    }

    // Process each service with its pricing methods and modifiers
    for (let i = 0; i < data.services.length; i++) {
      const serviceData = data.services[i];

      try {
        // Use transaction to ensure all-or-nothing for each service
        const result = await prisma.$transaction(async (tx) => {
          // Generate unique slug within category scope
          let slug = slugify(serviceData.name, { lower: true, strict: true });

          // Check for duplicates within category
          const existingService = await tx.service.findFirst({
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
              await tx.service.findFirst({
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
          const service = await tx.service.create({
            data: {
              categoryId: data.categoryId,
              name: serviceData.name,
              slug,
              emoji: serviceData.emoji || null,
              description: serviceData.description || null,
              displayOrder: serviceData.displayOrder ?? i,
              active: serviceData.active ?? true,
            },
          });

          let pricingMethodsCount = 0;
          let serviceModifiersCount = 0;
          let modifiersCount = 0;

          // Create service modifiers if provided
          if (serviceData.serviceModifiers && serviceData.serviceModifiers.length > 0) {
            for (let j = 0; j < serviceData.serviceModifiers.length; j++) {
              const modifierData = serviceData.serviceModifiers[j];

              await tx.serviceModifier.create({
                data: {
                  serviceId: service.id,
                  name: modifierData.name,
                  modifierType: modifierData.modifierType,
                  value: modifierData.value,
                  condition: modifierData.condition || null,
                  displayType: modifierData.displayType || 'NORMAL',
                  priority: modifierData.priority ?? j,
                  active: modifierData.active ?? true,
                },
              });

              serviceModifiersCount++;
            }
          }

          // Create pricing methods if provided
          if (serviceData.pricingMethods && serviceData.pricingMethods.length > 0) {
            for (let j = 0; j < serviceData.pricingMethods.length; j++) {
              const methodData = serviceData.pricingMethods[j];

              // Create pricing method
              const pricingMethod = await tx.pricingMethod.create({
                data: {
                  serviceId: service.id,
                  name: methodData.name,
                  pricingUnit: methodData.pricingUnit,
                  basePrice: methodData.basePrice,
                  startLevel: methodData.startLevel ?? null,
                  endLevel: methodData.endLevel ?? null,
                  description: methodData.description || null,
                  displayOrder: methodData.displayOrder ?? j,
                  active: methodData.active ?? true,
                },
              });

              pricingMethodsCount++;

              // Create modifiers if provided
              if (methodData.modifiers && methodData.modifiers.length > 0) {
                for (let k = 0; k < methodData.modifiers.length; k++) {
                  const modifierData = methodData.modifiers[k];

                  await tx.pricingModifier.create({
                    data: {
                      methodId: pricingMethod.id,
                      name: modifierData.name,
                      modifierType: modifierData.modifierType,
                      value: modifierData.value,
                      condition: modifierData.condition || null,
                      displayType: modifierData.displayType || 'NORMAL',
                      priority: modifierData.priority ?? k,
                      active: modifierData.active ?? true,
                    },
                  });

                  modifiersCount++;
                }
              }
            }
          }

          return {
            service,
            pricingMethodsCount,
            serviceModifiersCount,
            modifiersCount,
          };
        });

        results.created++;
        results.services.push({
          id: result.service.id,
          name: result.service.name,
          slug: result.service.slug,
          pricingMethodsCount: result.pricingMethodsCount,
          serviceModifiersCount: result.serviceModifiersCount,
          modifiersCount: result.modifiersCount,
        });
      } catch (error: any) {
        results.failed++;
        results.errors.push({
          index: i,
          serviceName: serviceData.name,
          error: error.message || 'Unknown error occurred',
        });
      }
    }

    return results;
  }

  /**
   * Validate batch services with pricing data before submission
   * Returns validation errors without creating anything
   *
   * @param data - Batch creation payload to validate
   * @returns Validation result with any errors found
   */
  async validateBatchServicesWithPricing(data: BatchCreateServicesWithPricingDto) {
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

    // Check for duplicate service names in batch
    const serviceNames = data.services.map((s) => s.name.trim().toLowerCase());
    const duplicateServices = serviceNames.filter(
      (name, index) => serviceNames.indexOf(name) !== index
    );

    if (duplicateServices.length > 0) {
      const uniqueDuplicates = Array.from(new Set(duplicateServices));
      errors.push({
        type: 'DUPLICATE_SERVICE_NAMES',
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

    // Validate pricing methods for each service
    for (let i = 0; i < data.services.length; i++) {
      const service = data.services[i];

      if (service.pricingMethods && service.pricingMethods.length > 0) {
        // Check for duplicate pricing method names within service
        const methodNames = service.pricingMethods.map((m) => m.name.trim().toLowerCase());
        const duplicateMethods = methodNames.filter(
          (name, index) => methodNames.indexOf(name) !== index
        );

        if (duplicateMethods.length > 0) {
          const uniqueDuplicates = Array.from(new Set(duplicateMethods));
          errors.push({
            type: 'DUPLICATE_PRICING_METHOD_NAMES',
            message: `Service "${service.name}" has duplicate pricing method names: ${uniqueDuplicates.join(', ')}`,
            details: { serviceName: service.name, duplicates: uniqueDuplicates },
          });
        }

        // Validate level ranges for PER_LEVEL pricing
        service.pricingMethods.forEach((method, j) => {
          if (method.pricingUnit === 'PER_LEVEL') {
            if (!method.startLevel || !method.endLevel) {
              errors.push({
                type: 'MISSING_LEVEL_RANGE',
                message: `Service "${service.name}", pricing method "${method.name}": PER_LEVEL pricing requires startLevel and endLevel`,
                details: { serviceName: service.name, methodName: method.name },
              });
            } else if (method.startLevel >= method.endLevel) {
              errors.push({
                type: 'INVALID_LEVEL_RANGE',
                message: `Service "${service.name}", pricing method "${method.name}": startLevel must be less than endLevel`,
                details: { serviceName: service.name, methodName: method.name },
              });
            }
          }
        });

        // Validate modifiers
        service.pricingMethods.forEach((method, j) => {
          if (method.modifiers && method.modifiers.length > 0) {
            const modifierNames = method.modifiers.map((m) => m.name.trim().toLowerCase());
            const duplicateModifiers = modifierNames.filter(
              (name, index) => modifierNames.indexOf(name) !== index
            );

            if (duplicateModifiers.length > 0) {
              const uniqueDuplicates = Array.from(new Set(duplicateModifiers));
              errors.push({
                type: 'DUPLICATE_MODIFIER_NAMES',
                message: `Service "${service.name}", pricing method "${method.name}" has duplicate modifier names: ${uniqueDuplicates.join(', ')}`,
                details: {
                  serviceName: service.name,
                  methodName: method.name,
                  duplicates: uniqueDuplicates,
                },
              });
            }
          }
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
