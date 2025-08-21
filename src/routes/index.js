// routes/index.js
import express from 'express';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

// Importar todas las rutas
import authRoutes from './auth.routes.js';
import userRoutes from './user.routes.js';
import businessRoutes from './business.routes.js';
import serviceRoutes from './service.routes.js';
import templateRoutes from './template.routes.js';
import uploadRoutes from './upload.routes.js';

const router = express.Router();

// ✅ DEFINIR swaggerOptions AQUÍ
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'MiSitioFácil API',
      version: '1.0.0',
      description: 'API para la plataforma MiSitioFácil - Crea tu sitio web de negocio fácilmente',
      contact: {
        name: 'Soporte MiSitioFácil',
        email: 'soporte@misitiofacil.com'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: process.env.BASE_URL || 'http://localhost:4000',
        description: 'Servidor de desarrollo'
      },
      {
        url: 'https://api.misitiofacil.com',
        description: 'Servidor de producción'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Token JWT para autenticación'
        }
      },
      responses: {
        UnauthorizedError: {
          description: 'Token de acceso faltante o inválido',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: {
                    type: 'boolean',
                    example: false
                  },
                  error: {
                    type: 'string',
                    example: 'Token de acceso requerido'
                  },
                  timestamp: {
                    type: 'string',
                    format: 'date-time'
                  }
                }
              }
            }
          }
        },
        NotFoundError: {
          description: 'Recurso no encontrado',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: {
                    type: 'boolean',
                    example: false
                  },
                  error: {
                    type: 'string',
                    example: 'Recurso no encontrado'
                  },
                  timestamp: {
                    type: 'string',
                    format: 'date-time'
                  }
                }
              }
            }
          }
        },
        ValidationError: {
          description: 'Error de validación de datos',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: {
                    type: 'boolean',
                    example: false
                  },
                  error: {
                    type: 'string',
                    example: 'Datos de entrada inválidos'
                  },
                  details: {
                    type: 'object',
                    description: 'Detalles específicos del error de validación'
                  },
                  timestamp: {
                    type: 'string',
                    format: 'date-time'
                  }
                }
              }
            }
          }
        }
      },
      schemas: {
        Pagination: {
          type: 'object',
          properties: {
            currentPage: {
              type: 'integer',
              example: 1
            },
            totalPages: {
              type: 'integer',
              example: 5
            },
            totalItems: {
              type: 'integer',
              example: 47
            },
            itemsPerPage: {
              type: 'integer',
              example: 10
            },
            hasNextPage: {
              type: 'boolean',
              example: true
            },
            hasPrevPage: {
              type: 'boolean',
              example: false
            }
          }
        }
      }
    },
    tags: [
      {
        name: 'Auth',
        description: 'Operaciones de autenticación y autorización'
      },
      {
        name: 'Users',
        description: 'Gestión de usuarios'
      },
      {
        name: 'Business',
        description: 'Gestión de negocios'
      },
      {
        name: 'Services',
        description: 'Gestión de servicios'
      },
      {
        name: 'Templates',
        description: 'Plantillas de diseño'
      },
      {
        name: 'Upload',
        description: 'Carga de archivos e imágenes'
      }
    ]
  },
  apis: [
    './src/routes/*.js',
    './src/controllers/*.js'
  ]
};

// ✅ AHORA sí generar las specs
const specs = swaggerJsdoc(swaggerOptions);

const swaggerUiOptions = {
  customCss: `
    .swagger-ui .topbar { display: none }
    .swagger-ui .info .title { color: #2c3e50; font-weight: bold; }
    .swagger-ui .info .description { color: #34495e; }
    .swagger-ui .scheme-container { 
      background: #f8f9fa; 
      padding: 15px; 
      border-radius: 8px;
      border: 1px solid #e9ecef;
    }
    .swagger-ui .auth-wrapper { margin-top: 20px; }
    .swagger-ui .btn.authorize { 
      background-color: #007bff;
      border-color: #007bff;
    }
    .swagger-ui .btn.authorize:hover {
      background-color: #0056b3;
      border-color: #0056b3;
    }
  `,
  customSiteTitle: "MiSitioFácil API Documentation",
  customfavIcon: "/favicon.ico",
  explorer: true,
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
    filter: true,
    showExtensions: true,
    showCommonExtensions: true,
    tryItOutEnabled: true
  }
};

// Rutas base
router.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'MiSitioFácil API v1.0.0',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    documentation: '/api-docs',
    endpoints: {
      auth: '/api/auth',
      users: '/api/users',
      businesses: '/api/businesses',
      services: '/api/services',
      templates: '/api/templates',
      uploads: '/api/uploads'
    }
  });
});

// Health check endpoint
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB'
    }
  });
});

// Montar rutas específicas
router.use('/api/auth', authRoutes);
router.use('/api/users', userRoutes);
router.use('/api/businesses', businessRoutes);
router.use('/api/services', serviceRoutes);
router.use('/api/templates', templateRoutes);
router.use('/api/uploads', uploadRoutes);

// Documentación Swagger
router.use('/api-docs', swaggerUi.serve);
router.get('/api-docs', swaggerUi.setup(specs, swaggerUiOptions));

// Ruta para obtener las specs en JSON
router.get('/api-docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(specs);
});

export default router;