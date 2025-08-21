// src/config/docs/swagger.js
// ──────────────────────────────────────────────────────────────────────────────
// Swagger / OpenAPI 3.0 for MiSitioFácil
// - Uses swagger-jsdoc to build the spec from JSDoc blocks in routes/controllers
// - Bearer JWT auth preconfigured
// - Reusable schemas aligned with your models (user, business, service, template, reservation)
// ──────────────────────────────────────────────────────────────────────────────

import swaggerJSDoc from 'swagger-jsdoc';

/**
 * Resolve a server URL from environment.
 * Supports:
 *  - APP_URL (full, e.g. https://api.misitiofacil.com)
 *  - HOST + PORT (e.g. 0.0.0.0 + 3000)
 *  - Defaults to http://localhost:3000
 */
function getServerUrl() {
  const { APP_URL, HOST, PORT } = process.env;
  if (APP_URL && APP_URL.startsWith('http')) return APP_URL;
  const host = HOST || 'localhost';
  const port = PORT || '3000';
  const proto = host.includes('localhost') || host.match(/^(\d{1,3}\.){3}\d{1,3}$/) ? 'http' : 'https';
  return `${proto}://${host}:${port}`;
}

const version = process.env.npm_package_version || '1.0.0';

export const swaggerSpec = swaggerJSDoc({
  failOnErrors: false,
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'MiSitioFácil API',
      version,
      description:
        'REST API for MiSitioFácil (auth, users, business, services, templates, uploads & reservations).',
      contact: { name: 'MiSitioFácil', url: 'https://github.com/' },
    },
    servers: [{ url: getServerUrl(), description: 'Current environment' }],
    tags: [
      { name: 'Auth', description: 'Login, register, password reset' },
      { name: 'Users', description: 'User profile and management' },
      { name: 'Business', description: 'Businesses (owner content)' },
      { name: 'Services', description: 'Services per business' },
      { name: 'Templates', description: 'Public templates catalog' },
      { name: 'Upload', description: 'File uploads (images/assets)' },
      { name: 'Reservations', description: 'Booking & scheduling' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
      parameters: {
        PaginationPage: {
          in: 'query',
          name: 'page',
          schema: { type: 'integer', minimum: 1, default: 1 },
          description: 'Results page number',
        },
        PaginationLimit: {
          in: 'query',
          name: 'limit',
          schema: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
          description: 'Items per page',
        },
        BusinessIdQuery: {
          in: 'query',
          name: 'businessId',
          required: true,
          schema: { type: 'string' },
          description: 'Business ID (ObjectId/UUID) used to filter services/reservations',
        },
      },
      schemas: {
        ApiError: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            details: { type: 'array', items: { type: 'string' } },
          },
        },
        PaginationMeta: {
          type: 'object',
          properties: {
            page: { type: 'integer' },
            limit: { type: 'integer' },
            total: { type: 'integer' },
            totalPages: { type: 'integer' },
          },
        },
        // ── Auth / Users ───────────────────────────────────────────────────────
        LoginRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 6 },
          },
        },
        LoginResponse: {
          type: 'object',
          properties: {
            token: { type: 'string' },
            user: { $ref: '#/components/schemas/User' },
          },
        },
        User: {
          type: 'object',
          properties: {
            _id: { type: 'string', description: 'Mongo ObjectId or UUID' },
            email: { type: 'string', format: 'email' },
            fullName: { type: 'string' },
            role: { type: 'string', enum: ['owner', 'client', 'admin'], default: 'owner' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        // ── Templates ─────────────────────────────────────────────────────────
        Template: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            name: { type: 'string', maxLength: 100 },
            description: { type: 'string', maxLength: 500 },
            previewUrl: { type: 'string' },
            configSchema: { type: 'object', additionalProperties: true },
            owner: { type: 'string', description: 'User ID' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        // ── Business / Services ────────────────────────────────────────────────
        Business: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            owner: { type: 'string', description: 'User ID' },
            template: { type: 'string', description: 'Template ID' },
            name: { type: 'string' },
            description: { type: 'string' },
            logoUrl: { type: 'string' },
            headerImageUrl: { type: 'string' },
            phone: { type: 'string' },
            address: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        Service: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            business: { type: 'string', description: 'Business ID' },
            title: { type: 'string' },
            description: { type: 'string' },
            price: { type: 'number', minimum: 0 },
            durationMin: { type: 'integer', minimum: 1 },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        // ── Reservations ───────────────────────────────────────────────────────
        Reservation: {
          type: 'object',
          properties: {
            _id: { type: 'string', description: 'UUID or ObjectId' },
            business: { type: 'string' },
            service: { type: 'string' },
            schedule: { type: 'string' },
            user: { type: 'string' },
            dateTime: { type: 'string', format: 'date-time' },
            status: { type: 'string', enum: ['pending', 'confirmed', 'cancelled'] },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        // ── Uploads ────────────────────────────────────────────────────────────
        UploadResponse: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'Public URL of the uploaded asset' },
            id: { type: 'string', description: 'Storage provider ID (e.g., Cloudinary public_id)' },
            size: { type: 'integer' },
            mimeType: { type: 'string' },
          },
        },
      },
      responses: {
        UnauthorizedError: {
          description: 'Unauthorized (missing/invalid token)',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
        },
        NotFoundError: {
          description: 'Resource not found',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
        },
        ValidationError: {
          description: 'Request validation error',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
        },
      },
    },
  },
  // Scan route/controller files for @openapi JSDoc blocks:
  apis: [
    './src/routes/*.js',
    './src/controllers/*.js', // optional, if you add endpoint docs here too
  ],
});

// Optional: default export for convenience in CommonJS/ESM interop
export default swaggerSpec;
