// src/config/docs/swagger.js
import swaggerJSDoc from 'swagger-jsdoc';

/**
 * Devuelve la URL base del servidor SIN el prefijo /api.
 * Prioriza APP_URL; si no existe, usa VERCEL_URL (previews);
 * si tampoco, cae a localhost con PORT.
 */
function getServerUrl() {
  const { APP_URL, VERCEL_URL, PORT } = process.env;

  if (APP_URL && APP_URL.startsWith('http')) {
    return APP_URL.replace(/\/+$/, '');
  }
  if (VERCEL_URL) {
    return `https://${VERCEL_URL}`.replace(/\/+$/, '');
  }
  const port = PORT || '3001';
  return `http://localhost:${port}`;
}

const version = process.env.APP_VERSION || '1.0.0';
const SERVER_BASE = getServerUrl();

// ✅ Prefijo para paths: garantiza exactamente "/api"
const API_PREFIX = `/${(process.env.API_PREFIX || 'api').replace(/^\/+|\/+$/g, '')}`;

const swaggerDefinition = {
  openapi: '3.0.3',
  info: {
    title: 'MiSitioFácil API',
    version,
    description:
      'REST API for MiSitioFácil (auth, users, business, services, templates, uploads & reservations).',
    contact: { name: 'MiSitioFácil', url: 'https://github.com/' }
  },

  // Importante: SIN /api aquí si tus paths ya empiezan con /api
  servers: [
    { url: SERVER_BASE, description: 'Current environment' },
    { url: 'http://localhost:3001', description: 'Local development' }
  ],

  // Seguridad global (Bearer JWT)
  security: [{ bearerAuth: [] }],

  // Tags visibles en Swagger UI
  tags: [
    { name: 'Auth', description: 'Login, register, password/refresh' },
    { name: 'Users', description: 'User profile and management' },
    { name: 'Business', description: 'Businesses (owner content)' },
    { name: 'Services', description: 'Services per business' },
    { name: 'Templates', description: 'Public templates catalog' },
    { name: 'Upload', description: 'File uploads (images/assets)' },
    { name: 'Reservations', description: 'Booking & scheduling' }
  ],

  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
    },

    parameters: {
      PaginationPage: {
        in: 'query',
        name: 'page',
        schema: { type: 'integer', minimum: 1, default: 1 },
        description: 'Results page number'
      },
      PaginationLimit: {
        in: 'query',
        name: 'limit',
        schema: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
        description: 'Items per page'
      },
      BusinessIdQuery: {
        in: 'query',
        name: 'businessId',
        required: true,
        schema: { type: 'string' },
        description: 'Business ID (ObjectId/UUID) used to filter services/reservations'
      },
      ServiceIdParam: {
        in: 'path',
        name: 'id',
        required: true,
        schema: { type: 'string' },
        description: 'Service ID'
      },
      ReservationIdParam: {
        in: 'path',
        name: 'id',
        required: true,
        schema: { type: 'string' },
        description: 'Reservation ID'
      },
      BusinessIdParam: {
        in: 'path',
        name: 'id',
        required: true,
        schema: { type: 'string' },
        description: 'Business ID'
      },
      TemplateIdParam: {
        in: 'path',
        name: 'id',
        required: true,
        schema: { type: 'string' },
        description: 'Template ID'
      },
      UserIdParam: {
        in: 'path',
        name: 'id',
        required: true,
        schema: { type: 'string' },
        description: 'User ID'
      }
    },

    schemas: {
      ApiError: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: { type: 'string' },
          message: { type: 'string' },
          details: { type: 'array', items: { type: 'string' } },
          timestamp: { type: 'string', format: 'date-time' }
        }
      },
      SuccessResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string' },
          data: { type: 'object' }
        }
      },
      PaginationMeta: {
        type: 'object',
        properties: {
          currentPage: { type: 'integer' },
          totalPages: { type: 'integer' },
          totalItems: { type: 'integer' },
          itemsPerPage: { type: 'integer' },
          hasNextPage: { type: 'boolean' },
          hasPrevPage: { type: 'boolean' }
        }
      },
      Pagination: {
        type: 'object',
        properties: {
          page: { type: 'integer' },
          limit: { type: 'integer' },
          total: { type: 'integer' },
          totalPages: { type: 'integer' }
        }
      },

      // ═════════ AUTH & USERS ═════════
      LoginRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email', example: 'user@example.com' },
          password: { type: 'string', minLength: 6, example: 'password123' }
        }
      },
      RegisterRequest: {
        type: 'object',
        required: ['email', 'password', 'fullName'],
        properties: {
          email: { type: 'string', format: 'email', example: 'user@example.com' },
          password: { type: 'string', minLength: 6, example: 'password123' },
          fullName: { type: 'string', minLength: 2, maxLength: 100, example: 'Juan Pérez' },
          role: { type: 'string', enum: ['owner', 'client'], default: 'owner' }
        }
      },
      AuthResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: 'Login exitoso' },
        data: {
            type: 'object',
            properties: {
              user: { $ref: '#/components/schemas/User' },
              token: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
              refreshToken: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' }
            }
          }
        }
      },
      User: {
        type: 'object',
        properties: {
          _id: { type: 'string', description: 'Mongo ObjectId', example: '64a7d33a21ddad13814d4d02' },
          id: { type: 'string', description: 'User ID alias', example: '64a7d33a21ddad13814d4d02' },
          email: { type: 'string', format: 'email', example: 'user@example.com' },
          fullName: { type: 'string', example: 'Juan Pérez' },
          username: { type: 'string', example: 'juan_perez' },
          phone: { type: 'string', example: '88889999' },
          address: { type: 'string', example: 'San José, Costa Rica' },
          dateOfBirth: { type: 'string', format: 'date', example: '1990-01-15' },
          avatar: { type: 'string', example: 'https://example.com/avatar.jpg' },
          role: { type: 'string', enum: ['owner', 'client', 'admin'], example: 'owner' },
          roleName: { type: 'string', example: 'Dueño de Negocio' },
          isActive: { type: 'boolean', example: true },
          isEmailVerified: { type: 'boolean', example: false },
          isPhoneVerified: { type: 'boolean', example: false },
          isLocked: { type: 'boolean', example: false },
          business: { type: 'string', nullable: true, description: 'Business ID if owner' },
          preferences: {
            type: 'object',
            properties: {
              theme: { type: 'string', example: 'dark' },
              language: { type: 'string', example: 'es' },
              timezone: { type: 'string', example: 'America/Costa_Rica' },
              notifications: {
                type: 'object',
                properties: {
                  email: { type: 'boolean', example: true },
                  sms: { type: 'boolean', example: false },
                  push: { type: 'boolean', example: true }
                }
              }
            }
          },
          socialMedia: {
            type: 'object',
            properties: {
              instagram: { type: 'string', example: 'https://instagram.com/user' },
              facebook: { type: 'string', example: 'https://facebook.com/user' },
              whatsapp: { type: 'string', example: '+50688889999' }
            }
          },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
          lastLogin: { type: 'string', format: 'date-time' }
        }
      },
      UpdateProfileRequest: {
        type: 'object',
        properties: {
          fullName: { type: 'string', minLength: 2, maxLength: 100, example: 'Juan Pérez Actualizado' },
          username: { type: 'string', example: 'juan_perez_new' },
          phone: { type: 'string', example: '88889999' },
          address: { type: 'string', example: 'Cartago, Costa Rica' },
          dateOfBirth: { type: 'string', format: 'date', example: '1990-01-15' },
          avatar: { type: 'string', example: 'https://example.com/new-avatar.jpg' },
          preferences: {
            type: 'object',
            properties: {
              theme: { type: 'string', example: 'light' },
              language: { type: 'string', example: 'en' },
              notifications: {
                type: 'object',
                properties: {
                  email: { type: 'boolean' },
                  sms: { type: 'boolean' },
                  push: { type: 'boolean' }
                }
              }
            }
          },
          socialMedia: {
            type: 'object',
            properties: {
              instagram: { type: 'string' },
              facebook: { type: 'string' },
              whatsapp: { type: 'string' }
            }
          }
        }
      },

      // ═════════ BUSINESS ═════════
      CreateBusinessRequest: {
        type: 'object',
        required: ['name', 'category'],
        properties: {
          name: { type: 'string', minLength: 2, maxLength: 100, example: 'Barbería El Clásico' },
          description: { type: 'string', maxLength: 1000, example: 'Barbería tradicional con servicios de calidad premium' },
          category: { type: 'string', enum: ['barberia', 'salon_belleza', 'spa'], example: 'barberia' },
          templateId: { type: 'string', example: '68a8e836b3ed4bdc2abe9443', description: 'ID de template (opcional)' },
          phone: { type: 'string', example: '88889999' },
          email: { type: 'string', format: 'email', example: 'info@barberia-clasico.com' },
          location: {
            type: 'object',
            properties: {
              address: { type: 'string', example: 'Avenida Central, San José' },
              city: { type: 'string', example: 'San José' },
              province: { type: 'string', example: 'San José' },
              country: { type: 'string', example: 'CR' },
              coordinates: {
                type: 'object',
                properties: {
                  lat: { type: 'number', example: 9.9281 },
                  lng: { type: 'number', example: -84.0907 }
                }
              }
            }
          },
          socialMedia: {
            type: 'object',
            properties: {
              facebook: { type: 'string', example: 'barberia-clasico' },
              instagram: { type: 'string', example: '' },
              whatsapp: { type: 'string', example: '88889999' },
              website: { type: 'string', example: '' },
              tiktok: { type: 'string', example: '' },
              twitter: { type: 'string', example: '' }
            }
          },
          settings: {
            type: 'object',
            properties: {
              allowOnlineBooking: { type: 'boolean', example: true },
              requireBookingApproval: { type: 'boolean', example: false },
              showPrices: { type: 'boolean', example: true },
              currency: { type: 'string', example: 'CRC' }
            }
          }
        }
      },
      UpdateBusinessRequest: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 3, maxLength: 100 },
          description: { type: 'string', maxLength: 1000 },
          phone: { type: 'string' },
          email: { type: 'string', format: 'email' },
          location: {
            type: 'object',
            properties: {
              address: { type: 'string' },
              city: { type: 'string' },
              province: { type: 'string' },
              country: { type: 'string' }
            }
          },
          socialMedia: {
            type: 'object',
            properties: {
              facebook: { type: 'string' },
              instagram: { type: 'string' },
              whatsapp: { type: 'string' },
              website: { type: 'string' }
            }
          },
          operatingHours: { type: 'object' },
          visualConfig: { type: 'object' },
          settings: { type: 'object' }
        }
      },
      Business: {
        type: 'object',
        properties: {
          _id: { type: 'string', example: '64a7d33a21ddad13814d4d02' },
          owner: { type: 'string', description: 'User ID del propietario', example: '64a7d33a21ddad13814d4d02' },
          name: { type: 'string', example: 'Barbería El Clásico' },
          description: { type: 'string', example: 'Barbería tradicional con servicios de calidad' },
          slug: { type: 'string', example: 'barberia-el-clasico' },
          category: { type: 'string', enum: ['barberia', 'salon_belleza', 'spa'] },
          status: { type: 'string', enum: ['draft', 'active', 'inactive', 'suspended'], example: 'active' },
          isActive: { type: 'boolean', example: true },
          phone: { type: 'string', example: '88889999' },
          email: { type: 'string', example: 'info@barberia-clasico.com' },
          location: {
            type: 'object',
            properties: {
              address: { type: 'string' },
              city: { type: 'string' },
              province: { type: 'string' },
              country: { type: 'string' },
              coordinates: {
                type: 'object',
                properties: {
                  lat: { type: 'number' },
                  lng: { type: 'number' }
                }
              }
            }
          },
          logo: {
            type: 'object',
            properties: {
              url: { type: 'string' },
              filename: { type: 'string' },
              uploadedAt: { type: 'string', format: 'date-time' }
            }
          },
          coverImage: {
            type: 'object',
            properties: {
              url: { type: 'string' },
              filename: { type: 'string' },
              uploadedAt: { type: 'string', format: 'date-time' }
            }
          },
          gallery: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                url: { type: 'string' },
                filename: { type: 'string' },
                caption: { type: 'string' },
                uploadedAt: { type: 'string', format: 'date-time' }
              }
            }
          },
          socialMedia: { type: 'object' },
          operatingHours: { type: 'object' },
          visualConfig: { type: 'object' },
          settings: { type: 'object' },
          templateId: { type: 'string' },
          services: { type: 'array', items: { $ref: '#/components/schemas/Service' } },
          stats: {
            type: 'object',
            properties: {
              totalServices: { type: 'integer' },
              totalReservations: { type: 'integer' },
              totalViews: { type: 'integer' }
            }
          },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' }
        }
      },
      BusinessList: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: {
            type: 'object',
            properties: {
              businesses: { type: 'array', items: { $ref: '#/components/schemas/Business' } },
              pagination: { $ref: '#/components/schemas/PaginationMeta' }
            }
          }
        }
      },
      DaySchedule: {
        type: 'object',
        properties: {
          isOpen: { type: 'boolean', example: true },
          openTime: { type: 'string', example: '09:00' },
          closeTime: { type: 'string', example: '18:00' }
        }
      },

      // ═════════ SERVICES ═════════
      CreateServiceRequest: {
        type: 'object',
        required: ['title', 'price', 'durationMin'],
        properties: {
          title: { type: 'string', minLength: 3, maxLength: 80, example: 'Corte de Cabello Clásico' },
          description: { type: 'string', maxLength: 500, example: 'Corte tradicional con tijera y navaja, incluye lavado y peinado' },
          price: { type: 'number', minimum: 0, example: 5000, description: 'Precio en la moneda del negocio' },
          durationMin: { type: 'integer', minimum: 15, maximum: 480, example: 45, description: 'Duración en minutos' },
          category: { type: 'string', example: 'cortes' },
          isActive: { type: 'boolean', default: true, example: true },
          requirements: { type: 'array', items: { type: 'string' }, example: ['Cabello limpio', 'Llegar 5 minutos antes'] },
          images: { type: 'array', items: { type: 'string' }, example: ['https://example.com/service1.jpg'] }
        }
      },
      UpdateServiceRequest: {
        type: 'object',
        properties: {
          title: { type: 'string', minLength: 3, maxLength: 80 },
          description: { type: 'string', maxLength: 500 },
          price: { type: 'number', minimum: 0 },
          durationMin: { type: 'integer', minimum: 15, maximum: 480 },
          category: { type: 'string' },
          isActive: { type: 'boolean' },
          requirements: { type: 'array', items: { type: 'string' } },
          images: { type: 'array', items: { type: 'string' } }
        }
      },
      Service: {
        type: 'object',
        properties: {
          _id: { type: 'string', example: '64a7d33a21ddad13814d4d02' },
          business: { type: 'string', description: 'Business ID', example: '64a7d33a21ddad13814d4d02' },
          title: { type: 'string', example: 'Corte de Cabello Clásico' },
          description: { type: 'string', example: 'Corte tradicional con tijera y navaja' },
          price: { type: 'number', example: 5000 },
          durationMin: { type: 'integer', example: 45 },
          category: { type: 'string', example: 'cortes' },
          isActive: { type: 'boolean', example: true },
          requirements: { type: 'array', items: { type: 'string' } },
          images: { type: 'array', items: { type: 'string' } },
          stats: {
            type: 'object',
            properties: {
              totalReservations: { type: 'integer' },
              averageRating: { type: 'number' },
              totalRevenue: { type: 'number' }
            }
          },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' }
        }
      },
      ServiceList: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: {
            type: 'object',
            properties: {
              services: { type: 'array', items: { $ref: '#/components/schemas/Service' } },
              pagination: { $ref: '#/components/schemas/PaginationMeta' }
            }
          }
        }
      },

      // ═════════ TEMPLATES ═════════
      CreateTemplateRequest: {
        type: 'object',
        required: ['name', 'category'],
        properties: {
          name: { type: 'string', minLength: 3, maxLength: 100, example: 'Template Universal' },
          description: { type: 'string', maxLength: 500, example: 'Template básico para cualquier negocio' },
          category: { type: 'string', enum: ['modern', 'classic', 'minimal', 'creative', 'professional'], example: 'modern' },
          businessType: { type: 'string', enum: ['barberia', 'salon_belleza', 'spa'], example: 'barberia' },
          isPublic: { type: 'boolean', example: true },
          isDefault: { type: 'boolean', example: true },
          colors: {
            type: 'object',
            properties: {
              primary: { type: 'string', example: '#3B82F6' },
              secondary: { type: 'string', example: '#64748B' },
              accent: { type: 'string', example: '#10B981' },
              background: { type: 'string', example: '#FFFFFF' },
              text: { type: 'string', example: '#1F2937' }
            }
          },
          typography: {
            type: 'object',
            properties: {
              primaryFont: { type: 'string', example: 'Inter, sans-serif' },
              headingFont: { type: 'string', example: 'Montserrat, sans-serif' },
              fontSize: {
                type: 'object',
                properties: {
                  base: { type: 'number', example: 16 },
                  heading: { type: 'number', example: 32 }
                }
              }
            }
          },
          sections: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', example: 'header' },
                name: { type: 'string', example: 'Encabezado' },
                type: { type: 'string', enum: ['header', 'services', 'gallery', 'about', 'contact', 'custom'], example: 'header' },
                isVisible: { type: 'boolean', example: true },
                order: { type: 'number', example: 1 },
                config: { type: 'object', example: {} }
              }
            }
          },
          tags: { type: 'array', items: { type: 'string' }, example: ['universal', 'modern', 'default'] }
        }
      },
      UpdateTemplateRequest: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 3, maxLength: 100 },
          description: { type: 'string', maxLength: 500 },
          category: { type: 'string', enum: ['barberia', 'salon_belleza', 'spa'] },
          previewUrl: { type: 'string' },
          configSchema: { type: 'object' },
          defaultConfig: { type: 'object' },
          isPublic: { type: 'boolean' },
          isPremium: { type: 'boolean' },
          tags: { type: 'array', items: { type: 'string' } }
        }
      },
      Template: {
        type: 'object',
        properties: {
          _id: { type: 'string', example: '64a7d33a21ddad13814d4d02' },
          name: { type: 'string', example: 'Plantilla Barbería Moderna' },
          description: { type: 'string', example: 'Plantilla moderna y elegante' },
          category: { type: 'string', enum: ['barberia', 'salon_belleza', 'spa'] },
          previewUrl: { type: 'string', example: 'https://example.com/preview.jpg' },
          configSchema: { type: 'object' },
          defaultConfig: { type: 'object' },
          owner: { type: 'string', description: 'User ID del creador', example: '64a7d33a21ddad13814d4d02' },
          isPublic: { type: 'boolean', example: true },
          isPremium: { type: 'boolean', example: false },
          tags: { type: 'array', items: { type: 'string' } },
          stats: { type: 'object', properties: { timesUsed: { type: 'integer' }, rating: { type: 'number' } } },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' }
        }
      },
      TemplateList: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: {
            type: 'object',
            properties: {
              templates: { type: 'array', items: { $ref: '#/components/schemas/Template' } },
              pagination: { $ref: '#/components/schemas/PaginationMeta' }
            }
          }
        }
      },

      // ═════════ RESERVATIONS ═════════
      CreateReservationRequest: {
        type: 'object',
        required: ['business', 'service', 'dateTime', 'customerName', 'customerEmail', 'customerPhone'],
        properties: {
          business: {
            type: 'string',
            description: 'ID del negocio (MongoDB ObjectId)',
            example: '64a7d33a21ddad13814d4d02'
          },
          service: {
            type: 'string',
            description: 'ID del servicio (MongoDB ObjectId)',
            example: '64a7d33a21ddad13814d4d03'
          },
          dateTime: {
            type: 'string',
            format: 'date-time',
            example: '2025-09-03T10:00:00.000Z',
            description: 'Fecha y hora de la reserva en formato ISO'
          },
          customerName: {
            type: 'string',
            minLength: 2,
            maxLength: 100,
            example: 'Juan Pérez',
            description: 'Nombre completo del cliente'
          },
          customerEmail: {
            type: 'string',
            format: 'email',
            example: 'juan@example.com',
            description: 'Email del cliente para confirmaciones'
          },
          customerPhone: {
            type: 'string',
            pattern: '^[0-9+\\-\\s()]{7,20}$',
            example: '88889999',
            description: 'Teléfono del cliente para contacto'
          },
          notes: {
            type: 'string',
            maxLength: 500,
            example: 'Cliente prefiere corte clásico',
            description: 'Notas adicionales sobre la reserva (opcional)'
          }
        },
        example: {
          business: '64a7d33a21ddad13814d4d02',
          service: '64a7d33a21ddad13814d4d03',
          dateTime: '2025-09-03T14:30:00.000Z',
          customerName: 'Juan Pérez',
          customerEmail: 'juan.perez@example.com',
          customerPhone: '88889999',
          notes: 'Primera vez en el salon, prefiere corte conservador'
        }
      },
      UpdateReservationRequest: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['pending', 'confirmed', 'cancelled', 'completed', 'no_show'] },
          notes: { type: 'string', maxLength: 500 }
        }
      },
      Reservation: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          business: { type: 'string' },
          service: { type: 'string' },
          dateTime: { type: 'string', format: 'date-time' },
          status: { type: 'string' },
          customerName: { type: 'string' },
          customerEmail: { type: 'string' },
          customerPhone: { type: 'string' },
          notes: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' }
        }
      },
      ReservationList: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: {
            type: 'object',
            properties: {
              reservations: { type: 'array', items: { $ref: '#/components/schemas/Reservation' } },
              pagination: { $ref: '#/components/schemas/PaginationMeta' }
            }
          }
        }
      },

      // ═════════ UPLOAD ═════════
      FileUploadResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: 'Archivo subido exitosamente' },
          data: {
            type: 'object',
            properties: {
              file: {
                type: 'object',
                properties: {
                  url: { type: 'string', example: 'https://example.com/uploads/file.jpg', description: 'URL pública del archivo' },
                  filename: { type: 'string', example: 'file_123456.jpg' },
                  originalName: { type: 'string', example: 'mi-imagen.jpg' },
                  size: { type: 'integer', example: 1024000, description: 'Tamaño en bytes' },
                  mimeType: { type: 'string', example: 'image/jpeg' },
                  id: { type: 'string', example: 'cloudinary_public_id', description: 'ID del proveedor de almacenamiento' }
                }
              }
            }
          }
        }
      },
      BusinessUploadResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: 'Logo actualizado exitosamente' },
          data: {
            type: 'object',
            properties: {
              business: { $ref: '#/components/schemas/Business' },
              uploadedFile: {
                type: 'object',
                properties: {
                  url: { type: 'string' },
                  filename: { type: 'string' },
                  size: { type: 'integer' },
                  mimeType: { type: 'string' }
                }
              }
            }
          }
        }
      },
      GalleryUploadResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: 'Imágenes agregadas a la galería' },
          data: {
            type: 'object',
            properties: {
              business: { $ref: '#/components/schemas/Business' },
              uploadedFiles: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    url: { type: 'string' },
                    filename: { type: 'string' },
                    caption: { type: 'string' },
                    uploadedAt: { type: 'string', format: 'date-time' }
                  }
                }
              }
            }
          }
        }
      },

      // ═════════ SHARED ═════════
      Schedule: {
        type: 'object',
        properties: {
          _id: { type: 'string', example: '64a7d33a21ddad13814d4d02' },
          service: { type: 'string', description: 'Service ID', example: '64a7d33a21ddad13814d4d02' },
          dayOfWeek: { type: 'integer', minimum: 0, maximum: 6, example: 1, description: '0=Dom, 1=Lun, ..., 6=Sáb' },
          startTime: { type: 'string', example: '09:00', description: 'Hora de inicio (HH:MM)' },
          endTime: { type: 'string', example: '18:00', description: 'Hora de fin (HH:MM)' },
          isAvailable: { type: 'boolean', default: true, example: true },
          maxReservations: { type: 'integer', default: 1, example: 1 },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' }
        }
      },
      Location: {
        type: 'object',
        properties: {
          address: { type: 'string', example: 'Avenida Central 123' },
          city: { type: 'string', example: 'San José' },
          province: { type: 'string', example: 'San José' },
          country: { type: 'string', example: 'CR' },
          postalCode: { type: 'string', example: '10101' },
          coordinates: {
            type: 'object',
            properties: {
              lat: { type: 'number', example: 9.9281 },
              lng: { type: 'number', example: -84.0907 }
            }
          }
        }
      },
      ContactInfo: {
        type: 'object',
        properties: {
          phone: { type: 'string', example: '88889999' },
          email: { type: 'string', format: 'email', example: 'contact@business.com' },
          whatsapp: { type: 'string', example: '+50688889999' },
          website: { type: 'string', example: 'https://business.com' }
        }
      },
      SocialMedia: {
        type: 'object',
        properties: {
          facebook: { type: 'string', example: 'https://facebook.com/business' },
          instagram: { type: 'string', example: 'https://instagram.com/business' },
          twitter: { type: 'string', example: 'https://twitter.com/business' },
          whatsapp: { type: 'string', example: '+50688889999' },
          tiktok: { type: 'string', example: 'https://tiktok.com/@business' },
          youtube: { type: 'string', example: 'https://youtube.com/business' }
        }
      },
      Statistics: {
        type: 'object',
        properties: {
          totalViews: { type: 'integer', example: 1250 },
          totalReservations: { type: 'integer', example: 89 },
          totalRevenue: { type: 'number', example: 445000 },
          averageRating: { type: 'number', example: 4.7 },
          conversionRate: { type: 'number', example: 0.072 }
        }
      }
    },

    // ♻️ Reusables (DEBEN estar dentro de components)
    responses: {
      UnauthorizedError: {
        description: 'Unauthorized (missing/invalid token)',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } }
      },
      NotFoundError: {
        description: 'Resource not found',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } }
      },
      ValidationError: {
        description: 'Request validation error',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } }
      },
      ForbiddenError: {
        description: 'Forbidden - Insufficient permissions',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } }
      },
      ConflictError: {
        description: 'Conflict - Resource already exists',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } }
      },
      TooManyRequestsError: {
        description: 'Too Many Requests - Rate limit exceeded',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } }
      },
      InternalServerError: {
        description: 'Internal Server Error',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } }
      }
    },

    // ──────────────────────────────────────────────────────────────
    // PATHS
    // ──────────────────────────────────────────────────────────────
    paths: {
      // ---------- AUTH ----------
      [`${API_PREFIX}/auth/register`]: {
        post: {
          tags: ['Auth'],
          summary: 'Register',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/RegisterRequest' } } }
          },
          responses: {
            201: { description: 'Registered', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } } },
            400: { $ref: '#/components/responses/ValidationError' },
            409: { $ref: '#/components/responses/ConflictError' },
            500: { $ref: '#/components/responses/InternalServerError' }
          }
        }
      },
      [`${API_PREFIX}/auth/login`]: {
        post: {
          tags: ['Auth'],
          summary: 'Login',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } } }
          },
          responses: {
            200: { description: 'Logged in', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } } },
            401: { $ref: '#/components/responses/UnauthorizedError' },
            400: { $ref: '#/components/responses/ValidationError' }
          }
        }
      },
      [`${API_PREFIX}/auth/refresh`]: {
        post: {
          tags: ['Auth'],
          summary: 'Refresh token',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { type: 'object', properties: { refreshToken: { type: 'string' } }, required: ['refreshToken'] }
              }
            }
          },
          responses: {
            200: { description: 'Token refreshed', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } } },
            401: { $ref: '#/components/responses/UnauthorizedError' }
          }
        }
      },
      [`${API_PREFIX}/auth/logout`]: {
        post: {
          tags: ['Auth'],
          summary: 'Logout',
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: 'Logged out', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
            401: { $ref: '#/components/responses/UnauthorizedError' }
          }
        }
      },

      // ---------- USERS ----------
      [`${API_PREFIX}/users/me`]: {
        get: {
          tags: ['Users'],
          summary: 'Get my profile',
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } },
            401: { $ref: '#/components/responses/UnauthorizedError' }
          }
        },
        put: {
          tags: ['Users'],
          summary: 'Update my profile',
          security: [{ bearerAuth: [] }],
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdateProfileRequest' } } } },
          responses: {
            200: { description: 'Updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } },
            400: { $ref: '#/components/responses/ValidationError' },
            401: { $ref: '#/components/responses/UnauthorizedError' }
          }
        }
      },
      [`${API_PREFIX}/users/{id}`]: {
        get: {
          tags: ['Users'],
          summary: 'Get user by ID (admin)',
          parameters: [{ $ref: '#/components/parameters/UserIdParam' }],
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } },
            404: { $ref: '#/components/responses/NotFoundError' }
          }
        }
      },

      // ---------- BUSINESS ----------
      [`${API_PREFIX}/business`]: {
        get: {
          tags: ['Business'],
          summary: 'List businesses (admin/owner scope)',
          security: [{ bearerAuth: [] }],
          parameters: [{ $ref: '#/components/parameters/PaginationPage' }, { $ref: '#/components/parameters/PaginationLimit' }],
          responses: {
            200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/BusinessList' } } } }
          }
        },
        post: {
          tags: ['Business'],
          summary: 'Create business',
          security: [{ bearerAuth: [] }],
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateBusinessRequest' } } } },
          responses: {
            201: { description: 'Created', content: { 'application/json': { schema: { $ref: '#/components/schemas/Business' } } } },
            400: { $ref: '#/components/responses/ValidationError' },
            401: { $ref: '#/components/responses/UnauthorizedError' },
            409: { $ref: '#/components/responses/ConflictError' }
          }
        }
      },
      [`${API_PREFIX}/business/my`]: {
        get: {
          tags: ['Business'],
          summary: 'Get my business (owner)',
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/Business' } } } },
            404: { $ref: '#/components/responses/NotFoundError' }
          }
        }
      },
      [`${API_PREFIX}/business/{id}`]: {
        get: {
          tags: ['Business'],
          summary: 'Get business by ID',
          parameters: [{ $ref: '#/components/parameters/BusinessIdParam' }],
          responses: {
            200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/Business' } } } },
            404: { $ref: '#/components/responses/NotFoundError' }
          }
        },
        put: {
          tags: ['Business'],
          summary: 'Update business',
          security: [{ bearerAuth: [] }],
          parameters: [{ $ref: '#/components/parameters/BusinessIdParam' }],
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdateBusinessRequest' } } } },
          responses: {
            200: { description: 'Updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/Business' } } } },
            400: { $ref: '#/components/responses/ValidationError' },
            404: { $ref: '#/components/responses/NotFoundError' }
          }
        },
        delete: {
          tags: ['Business'],
          summary: 'Delete business',
          security: [{ bearerAuth: [] }],
          parameters: [{ $ref: '#/components/parameters/BusinessIdParam' }],
          responses: {
            204: { description: 'Deleted' },
            404: { $ref: '#/components/responses/NotFoundError' }
          }
        }
      },

      // ---------- SERVICES ----------
      [`${API_PREFIX}/services`]: {
        get: {
          tags: ['Services'],
          summary: 'List services (by businessId)',
          parameters: [
            { $ref: '#/components/parameters/BusinessIdQuery' },
            { $ref: '#/components/parameters/PaginationPage' },
            { $ref: '#/components/parameters/PaginationLimit' }
          ],
          responses: {
            200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/ServiceList' } } } },
            400: { $ref: '#/components/responses/ValidationError' }
          }
        }
      },
      [`${API_PREFIX}/services/business/{businessId}`]: {
        post: {
          tags: ['Services'],
          summary: 'Create service for a business',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: 'path',
              name: 'businessId',
              required: true,
              schema: { type: 'string' },
              description: 'ID del negocio (Mongo ObjectId) al que pertenece el servicio'
            }
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/CreateServiceRequest' } }
            }
          },
          responses: {
            201: { description: 'Created', content: { 'application/json': { schema: { $ref: '#/components/schemas/Service' } } } },
            400: { $ref: '#/components/responses/ValidationError' },
            401: { $ref: '#/components/responses/UnauthorizedError' },
            403: { $ref: '#/components/responses/ForbiddenError' }
          }
        }
      },
      [`${API_PREFIX}/services/{id}`]: {
        get: {
          tags: ['Services'],
          summary: 'Get service by ID',
          parameters: [{ $ref: '#/components/parameters/ServiceIdParam' }],
          responses: {
            200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/Service' } } } },
            404: { $ref: '#/components/responses/NotFoundError' }
          }
        },
        put: {
          tags: ['Services'],
          summary: 'Update service',
          security: [{ bearerAuth: [] }],
          parameters: [{ $ref: '#/components/parameters/ServiceIdParam' }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdateServiceRequest' } } }
          },
          responses: {
            200: { description: 'Updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/Service' } } } },
            404: { $ref: '#/components/responses/NotFoundError' }
          }
        },
        delete: {
          tags: ['Services'],
          summary: 'Delete service',
          security: [{ bearerAuth: [] }],
          parameters: [{ $ref: '#/components/parameters/ServiceIdParam' }],
          responses: {
            204: { description: 'Deleted' },
            404: { $ref: '#/components/responses/NotFoundError' }
          }
        }
      },

      // ---------- TEMPLATES ----------
      [`${API_PREFIX}/templates`]: {
        get: {
          tags: ['Templates'],
          summary: 'List public templates',
          parameters: [{ $ref: '#/components/parameters/PaginationPage' }, { $ref: '#/components/parameters/PaginationLimit' }],
          responses: {
            200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/TemplateList' } } } }
          }
        },
        post: {
          tags: ['Templates'],
          summary: 'Create template (admin)',
          security: [{ bearerAuth: [] }],
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateTemplateRequest' } } } },
          responses: {
            201: { description: 'Created', content: { 'application/json': { schema: { $ref: '#/components/schemas/Template' } } } },
            401: { $ref: '#/components/responses/UnauthorizedError' }
          }
        }
      },
      [`${API_PREFIX}/templates/{id}`]: {
        get: {
          tags: ['Templates'],
          summary: 'Get template by ID',
          parameters: [{ $ref: '#/components/parameters/TemplateIdParam' }],
          responses: {
            200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/Template' } } } },
            404: { $ref: '#/components/responses/NotFoundError' }
          }
        },
        put: {
          tags: ['Templates'],
          summary: 'Update template (admin)',
          security: [{ bearerAuth: [] }],
          parameters: [{ $ref: '#/components/parameters/TemplateIdParam' }],
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdateTemplateRequest' } } } },
          responses: {
            200: { description: 'Updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/Template' } } } },
            404: { $ref: '#/components/responses/NotFoundError' }
          }
        },
        delete: {
          tags: ['Templates'],
          summary: 'Delete template (admin)',
          security: [{ bearerAuth: [] }],
          parameters: [{ $ref: '#/components/parameters/TemplateIdParam' }],
          responses: {
            204: { description: 'Deleted' },
            404: { $ref: '#/components/responses/NotFoundError' }
          }
        }
      },

      // ---------- RESERVATIONS ----------
      [`${API_PREFIX}/reservations`]: {
        get: {
          tags: ['Reservations'],
          summary: 'List reservations',
          security: [{ bearerAuth: [] }],
          parameters: [
            { $ref: '#/components/parameters/BusinessIdQuery' },
            { in: 'query', name: 'serviceId', schema: { type: 'string' } },
            { in: 'query', name: 'status', schema: { type: 'string', enum: ['pending', 'confirmed', 'cancelled', 'completed', 'no_show'] } },
            { $ref: '#/components/parameters/PaginationPage' },
            { $ref: '#/components/parameters/PaginationLimit' }
          ],
          responses: {
            200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/ReservationList' } } } }
          }
        },
        post: {
          tags: ['Reservations'],
          summary: 'Create reservation',
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateReservationRequest' } } } },
          responses: {
            201: { description: 'Created', content: { 'application/json': { schema: { $ref: '#/components/schemas/Reservation' } } } },
            400: { $ref: '#/components/responses/ValidationError' }
          }
        }
      },
      [`${API_PREFIX}/reservations/{id}`]: {
        get: {
          tags: ['Reservations'],
          summary: 'Get reservation by ID',
          security: [{ bearerAuth: [] }],
          parameters: [{ $ref: '#/components/parameters/ReservationIdParam' }],
          responses: {
            200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/Reservation' } } } },
            404: { $ref: '#/components/responses/NotFoundError' }
          }
        },
        put: {
          tags: ['Reservations'],
          summary: 'Update reservation',
          security: [{ bearerAuth: [] }],
          parameters: [{ $ref: '#/components/parameters/ReservationIdParam' }],
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdateReservationRequest' } } } },
          responses: {
            200: { description: 'Updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/Reservation' } } } },
            404: { $ref: '#/components/responses/NotFoundError' }
          }
        },
        delete: {
          tags: ['Reservations'],
          summary: 'Delete reservation',
          security: [{ bearerAuth: [] }],
          parameters: [{ $ref: '#/components/parameters/ReservationIdParam' }],
          responses: {
            204: { description: 'Deleted' },
            404: { $ref: '#/components/responses/NotFoundError' }
          }
        }
      },

      // ---------- UPLOAD ----------
      [`${API_PREFIX}/upload`]: {
        post: {
          tags: ['Upload'],
          summary: 'Generic file upload',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  properties: { file: { type: 'string', format: 'binary' } },
                  required: ['file']
                }
              }
            }
          },
          responses: {
            201: { description: 'Uploaded', content: { 'application/json': { schema: { $ref: '#/components/schemas/FileUploadResponse' } } } },
            401: { $ref: '#/components/responses/UnauthorizedError' }
          }
        }
      },
      [`${API_PREFIX}/business/{id}/logo`]: {
        post: {
          tags: ['Upload', 'Business'],
          summary: 'Upload/replace business logo',
          security: [{ bearerAuth: [] }],
          parameters: [{ $ref: '#/components/parameters/BusinessIdParam' }],
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  properties: { file: { type: 'string', format: 'binary' } },
                  required: ['file']
                }
              }
            }
          },
          responses: {
            200: { description: 'Logo updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/BusinessUploadResponse' } } } },
            401: { $ref: '#/components/responses/UnauthorizedError' },
            404: { $ref: '#/components/responses/NotFoundError' }
          }
        }
      },
      [`${API_PREFIX}/business/{id}/gallery`]: {
        post: {
          tags: ['Upload', 'Business'],
          summary: 'Upload images to gallery',
          security: [{ bearerAuth: [] }],
          parameters: [{ $ref: '#/components/parameters/BusinessIdParam' }],
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  properties: {
                    files: { type: 'array', items: { type: 'string', format: 'binary' } }
                  },
                  required: ['files']
                }
              }
            }
          },
          responses: {
            200: { description: 'Gallery updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/GalleryUploadResponse' } } } },
            401: { $ref: '#/components/responses/UnauthorizedError' },
            404: { $ref: '#/components/responses/NotFoundError' }
          }
        }
      }
    }
  }
};

// Construye el spec y expórtalo
const swaggerSpec = swaggerJSDoc({
  failOnErrors: false,
  definition: swaggerDefinition,
  // Opcional: como ya defines "paths" arriba, no necesitas escanear todo el repo.
  apis: ['./src/routes/*.js', './src/controllers/*.js'],
});

export default swaggerSpec;
