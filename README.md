# 🚀 MiSitioFácil Backend

Backend API para la plataforma **MiSitioFácil** - Una solución completa para que pequeños negocios (barberías, salones, spas, etc.) puedan crear y gestionar su presencia digital fácilmente.

## 📋 Tabla de Contenidos

- [Características](#-características)
- [Tecnologías](#️-tecnologías)
- [Instalación](#-instalación)
- [Configuración](#️-configuración)
- [Uso](#-uso)
- [Estructura del Proyecto](#-estructura-del-proyecto)
- [API Documentation](#-api-documentation)
- [Testing](#-testing)
- [Deployment](#-deployment)
- [Contribución](#-contribución)

## ✨ Características

### 🏪 **Gestión de Negocios**
- ✅ Registro y autenticación de dueños de negocio
- ✅ Creación de perfiles de negocio completos
- ✅ Gestión de información (horarios, contacto, ubicación)
- ✅ Subida de imágenes y logos

### 🛠️ **Constructor de Sitios**
- ✅ Sistema de plantillas prediseñadas
- ✅ Personalización visual (colores, logos, contenido)
- ✅ URLs únicas para cada negocio
- ✅ Vista previa en tiempo real

### 💼 **Gestión de Servicios**
- ✅ CRUD completo de servicios
- ✅ Precios y duraciones configurables
- ✅ Categorización y etiquetado
- ✅ Disponibilidad y horarios

### 🔐 **Seguridad y Autenticación**
- ✅ JWT con refresh tokens
- ✅ Rate limiting inteligente
- ✅ Sanitización de datos
- ✅ Protección CSRF y XSS
- ✅ Middleware de seguridad completo

### 📊 **Funcionalidades Adicionales**
- ✅ Sistema de logging avanzado
- ✅ Manejo de errores centralizado
- ✅ Documentación automática con Swagger
- ✅ Health checks y monitoreo
- ✅ Soporte para múltiples países

## 🛠️ Tecnologías

### **Backend**
- **Node.js** (v18+) - Runtime
- **Express.js** - Framework web
- **MongoDB** - Base de datos principal
- **Mongoose** - ODM para MongoDB

### **Seguridad**
- **JWT** - Autenticación
- **bcryptjs** - Hashing de contraseñas
- **Helmet** - Headers de seguridad
- **Express Rate Limit** - Rate limiting

### **Almacenamiento**
- **Cloudinary** - Almacenamiento de imágenes
- **Multer** - Manejo de uploads

### **Documentación y Testing**
- **Swagger/OpenAPI** - Documentación API
- **Jest** - Testing framework
- **ESLint + Prettier** - Code quality

### **Monitoreo y Logs**
- **Winston** - Sistema de logging
- **Morgan** - HTTP request logging

## 🚀 Instalación

### **Prerrequisitos**
```bash
# Node.js 18 o superior
node --version  # v18.0.0+

# npm 8 o superior  
npm --version   # 8.0.0+

# MongoDB (local o Atlas)
mongod --version
```

### **1. Clonar el Repositorio**
```bash
git clone https://github.com/misitiofacil/backend.git
cd misitiofacil-backend
```

### **2. Instalar Dependencias**
```bash
npm install
```

### **3. Configurar Variables de Entorno**
```bash
# Copiar el template de configuración
cp .env.example .env

# Editar las variables necesarias
nano .env  # o tu editor preferido
```

### **4. Configurar Base de Datos**
```bash
# Opción 1: MongoDB Local
# Asegúrate de que MongoDB esté ejecutándose
sudo systemctl start mongod

# Opción 2: MongoDB Atlas (Recomendado)
# Usa la URI de conexión de tu cluster en .env
```

### **5. Iniciar el Servidor**
```bash
# Desarrollo (con hot reload)
npm run dev

# Producción
npm start
```

## ⚙️ Configuración

### **Variables de Entorno Críticas**

```bash
# .env
NODE_ENV=development
PORT=3000

# Base de datos
MONGODB_URI=mongodb://localhost:27017/misitiofacil_dev

# Seguridad
JWT_SECRET=tu_jwt_secret_super_seguro_de_al_menos_32_caracteres
JWT_EXPIRES_IN=7d

# Email (opcional)
EMAIL_USER=tu_email@gmail.com
EMAIL_PASSWORD=tu_app_password

# Cloudinary (opcional)
CLOUDINARY_CLOUD_NAME=tu_cloud_name
CLOUDINARY_API_KEY=tu_api_key
CLOUDINARY_API_SECRET=tu_api_secret
```

### **Configuración de Desarrollo**

```bash
# Instalar nodemon globalmente (opcional)
npm install -g nodemon

# Configurar ESLint en tu editor
# VS Code: instalar extensión ESLint
```

### **Configuración de Producción**

```bash
# Variables adicionales para producción
NODE_ENV=production
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/misitiofacil
JWT_SECRET=jwt_secret_super_seguro_para_produccion

# Configurar CORS para tu dominio
CORS_ORIGINS=https://misitiofacil.com,https://www.misitiofacil.com
```

## 🎯 Uso

### **Iniciar el Servidor**
```bash
# Desarrollo con hot reload
npm run dev

# Producción
npm start

# Con PM2 (recomendado para producción)
pm2 start app.js --name "misitiofacil-backend"
```

### **Verificar que Funciona**
```bash
# Health check
curl http://localhost:3000/health

# API info
curl http://localhost:3000/api

# Documentación
# Abrir http://localhost:3000/api-docs en el navegador
```

### **Comandos Útiles**
```bash
# Testing
npm test                    # Todos los tests
npm run test:watch         # Tests en modo watch
npm run test:coverage      # Coverage report

# Code Quality
npm run lint               # Verificar código
npm run lint:fix          # Arreglar problemas automáticamente
npm run format            # Formatear código

# Database
npm run seed              # Poblar con datos de prueba
npm run migrate           # Ejecutar migraciones

# Production
npm run build             # Preparar para producción
npm run start:prod        # Iniciar en modo producción
```

## 📁 Estructura del Proyecto

```
misitiofacil-backend/
├── 📄 app.js                    # Aplicación principal
├── 📄 server.js                 # Script de inicio
├── 📄 package.json              # Dependencias y scripts
├── 📄 .env.example              # Template de configuración
├── 📄 README.md                 # Este archivo
├── 
├── 📁 config/                   # Configuraciones
│   ├── 📄 index.js             # Exportador principal
│   ├── 📄 database.js          # Configuración BD
│   ├── 📄 security.js          # Configuración seguridad
│   ├── 📄 constants.js         # Constantes de la app
│   ├── 📄 logger.js            # Configuración logging
│   └── 📁 storage/             # Configuración almacenamiento
│       └── 📄 cloudinary.js    # Setup Cloudinary
│
├── 📁 controllers/              # Controladores
│   ├── 📄 auth.controller.js   # Autenticación
│   ├── 📄 business.controller.js # Negocios
│   ├── 📄 service.controller.js  # Servicios ✨ NUEVO
│   ├── 📄 template.controller.js # Plantillas
│   ├── 📄 user.controller.js   # Usuarios
│   └── 📄 upload.controller.js # Uploads
│
├── 📁 middleware/               # Middleware personalizado
│   ├── 📄 auth.js              # Autenticación
│   ├── 📄 businessOwnership.js # Verificación ownership
│   ├── 📄 errorHandler.js      # Manejo de errores
│   ├── 📄 fileUpload.js        # Upload de archivos
│   ├── 📄 logger.js            # Logging de requests
│   ├── 📄 pagination.js        # Paginación
│   ├── 📄 sanitization.js      # Sanitización datos
│   └── 📄 security.js          # Seguridad ✨ NUEVO
│
├── 📁 models/                   # Modelos de datos
│   ├── 📄 business.js          # Modelo negocio
│   ├── 📄 service.js           # Modelo servicio ✨ COMPLETO
│   ├── 📄 template.js          # Modelo plantilla
│   └── 📄 user.js              # Modelo usuario
│
├── 📁 routes/                   # Rutas de la API
│   ├── 📄 auth.routes.js       # Rutas autenticación
│   ├── 📄 business.routes.js   # Rutas negocios
│   ├── 📄 service.routes.js    # Rutas servicios ✨ COMPLETO
│   ├── 📄 template.routes.js   # Rutas plantillas
│   ├── 📄 user.routes.js       # Rutas usuarios
│   └── 📄 upload.routes.js     # Rutas uploads
│
├── 📁 utils/                    # Utilidades
│   ├── 📄 validators.js        # Validadores personalizados
│   ├── 📄 helpers.js           # Funciones auxiliares
│   └── 📄 constants.js         # Constantes auxiliares
│
├── 📁 tests/                    # Tests
│   ├── 📁 unit/                # Tests unitarios
│   ├── 📁 integration/         # Tests de integración
│   └── 📄 setup.js             # Configuración tests
│
├── 📁 scripts/                  # Scripts de utilidad
│   ├── 📄 seed.js              # Poblar BD con datos
│   ├── 📄 migrate.js           # Migraciones
│   └── 📄 cleanup.js           # Limpieza de datos
│
├── 📁 docs/                     # Documentación
│   ├── 📄 API.md               # Documentación API
│   ├── 📄 DEPLOYMENT.md        # Guía de despliegue
│   └── 📄 CONTRIBUTING.md      # Guía de contribución
│
└── 📁 logs/                     # Archivos de log (generado)
    ├── 📄 error.log            # Logs de errores
    ├── 📄 combined.log         # Logs combinados
    └── 📄 access.log           # Logs de acceso
```

## 📚 API Documentation

### **Endpoints Principales**

#### **🔐 Autenticación (`/api/v1/auth`)**
```bash
POST   /register          # Registrar usuario
POST   /login             # Iniciar sesión
POST   /logout            # Cerrar sesión
POST   /refresh           # Renovar token
POST   /forgot-password   # Recuperar contraseña
POST   /reset-password    # Resetear contraseña
GET    /verify-email      # Verificar email
```

#### **🏪 Negocios (`/api/v1/businesses`)**
```bash
GET    /                  # Listar negocios
POST   /                  # Crear negocio
GET    /:id               # Obtener negocio
PUT    /:id               # Actualizar negocio
DELETE /:id               # Eliminar negocio
GET    /:id/public        # Vista pública del negocio
PUT    /:id/status        # Cambiar estado
```

#### **💼 Servicios (`/api/v1/services`)** ✨ **NUEVO**
```bash
GET    /business/:businessId     # Servicios por negocio
POST   /business/:businessId     # Crear servicio
GET    /:serviceId              # Obtener servicio
PUT    /:serviceId              # Actualizar servicio
DELETE /:serviceId              # Eliminar servicio
PUT    /:serviceId/toggle-status # Activar/desactivar
POST   /:serviceId/duplicate    # Duplicar servicio
GET    /search                  # Buscar servicios
GET    /popular                 # Servicios populares
GET    /categories              # Categorías disponibles
```

#### **🎨 Plantillas (`/api/v1/templates`)**
```bash
GET    /                  # Listar plantillas
GET    /:id               # Obtener plantilla
GET    /public            # Plantillas públicas
GET    /categories        # Categorías de plantillas
```

#### **👥 Usuarios (`/api/v1/users`)**
```bash
GET    /profile           # Perfil actual
PUT    /profile           # Actualizar perfil
DELETE /profile          # Eliminar cuenta
PUT    /change-password   # Cambiar contraseña
```

#### **📁 Uploads (`/api/v1/uploads`)**
```bash
POST   /image             # Subir imagen
POST   /logo              # Subir logo
DELETE /:publicId         # Eliminar archivo
```

### **Documentación Interactiva**
Una vez que el servidor esté ejecutándose, visita:
- **Swagger UI**: `http://localhost:3000/api-docs`
- **Health Check**: `http://localhost:3000/health`
- **API Info**: `http://localhost:3000/api`

## 🧪 Testing

### **Ejecutar Tests**
```bash
# Todos los tests
npm test

# Tests con coverage
npm run test:coverage

# Tests en modo watch
npm run test:watch

# Solo tests unitarios
npm run test:unit

# Solo tests de integración
npm run test:integration
```

### **Estructura de Tests**
```bash
tests/
├── unit/
│   ├── controllers/
│   ├── models/
│   ├── middleware/
│   └── utils/
├── integration/
│   ├── auth.test.js
│   ├── business.test.js
│   ├── service.test.js
│   └── upload.test.js
└── setup.js
```

### **Escribir Tests**
```javascript
// tests/unit/controllers/service.test.js
import { createService } from '../../../controllers/service.controller.js';

describe('Service Controller', () => {
  test('should create service successfully', async () => {
    // Test implementation
  });
});
```

## 🚀 Deployment

### **Render (Recomendado)**
```bash
# 1. Conectar repositorio en Render
# 2. Configurar variables de entorno
# 3. Deploy automático
```

### **Docker**
```bash
# Construir imagen
docker build -t misitiofacil-backend .

# Ejecutar contenedor
docker run -p 3000:3000 --env-file .env misitiofacil-backend
```

### **PM2 (Servidor VPS)**
```bash
# Instalar PM2
npm install -g pm2

# Iniciar aplicación
pm2 start app.js --name "misitiofacil-backend"

# Configurar autostart
pm2 startup
pm2 save
```

### **Variables de Entorno de Producción**
```bash
NODE_ENV=production
MONGODB_URI=mongodb+srv://...
JWT_SECRET=secreto_super_seguro_produccion
CLOUDINARY_CLOUD_NAME=tu_cloud_name
EMAIL_USER=noreply@misitiofacil.com
CORS_ORIGINS=https://misitiofacil.com
```

## 🔧 Comandos de Desarrollo

### **Desarrollo Diario**
```bash
# Iniciar desarrollo
npm run dev

# Verificar código
npm run lint
npm run format

# Ejecutar tests
npm test

# Ver logs en tiempo real
tail -f logs/combined.log
```

### **Base de Datos**
```bash
# Conectar a MongoDB
mongo misitiofacil_dev

# Poblar con datos de prueba
npm run seed

# Backup de base de datos
mongodump --db misitiofacil_dev --out ./backup

# Restore de base de datos
mongorestore ./backup
```

### **Debugging**
```bash
# Modo debug
DEBUG=misitiofacil:* npm run dev

# Inspeccionar con Node.js
node --inspect app.js

# Ver estadísticas de memoria
node --prof app.js
```

## 📊 Monitoreo y Logs

### **Logs del Sistema**
```bash
# Ver logs en tiempo real
npm run logs

# Logs de errores únicamente
npm run logs:error

# Analizar logs
grep "ERROR" logs/combined.log
```

### **Health Checks**
```bash
# Check básico
curl http://localhost:3000/health

# Check detallado
curl http://localhost:3000/health?detailed=true

# Automatizado con cron
*/5 * * * * curl -f http://localhost:3000/health || echo "Server down"
```

## 🚨 Resolución de Problemas

### **Problemas Comunes**

#### **Error: Puerto en uso**
```bash
# Encontrar proceso usando el puerto
lsof -ti:3000

# Terminar proceso
kill -9 $(lsof -ti:3000)

# O cambiar puerto en .env
PORT=3001
```

#### **Error: MongoDB no conecta**
```bash
# Verificar que MongoDB esté ejecutándose
sudo systemctl status mongod

# Iniciar MongoDB
sudo systemctl start mongod

# Verificar URI en .env
echo $MONGODB_URI
```

#### **Error: JWT secret no válido**
```bash
# Generar nuevo JWT secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Actualizar en .env
JWT_SECRET=nuevo_secret_generado
```

#### **Error: Dependencias faltantes**
```bash
# Limpiar node_modules y reinstalar
rm -rf node_modules package-lock.json
npm install

# Verificar versiones
npm list --depth=0
```

### **Debug Avanzado**
```bash
# Modo verbose
DEBUG=* npm run dev

# Profile de memoria
node --prof app.js
node --prof-process isolate-*.log > processed.txt

# Inspeccionar con Chrome DevTools
node --inspect-brk app.js
# Abrir chrome://inspect en Chrome
```

## 🤝 Contribución

### **Proceso de Contribución**
1. Fork del repositorio
2. Crear rama para feature: `git checkout -b feature/nueva-funcionalidad`
3. Commit cambios: `git commit -m 'Add: nueva funcionalidad'`
4. Push a la rama: `git push origin feature/nueva-funcionalidad`
5. Crear Pull Request

### **Convenciones de Código**
```bash
# Usar ESLint y Prettier
npm run lint:fix
npm run format

# Convención de commits
feat: nueva funcionalidad
fix: corrección de bug
docs: actualización documentación
style: cambios de formato
refactor: refactorización de código
test: agregar tests
chore: tareas de mantenimiento
```

### **Testing Obligatorio**
```bash
# Tests deben pasar antes de PR
npm test

# Coverage mínimo: 80%
npm run test:coverage
```

## 📞 Soporte

### **Contacto**
- **Email**: dev@misitiofacil.com
- **Issues**: [GitHub Issues](https://github.com/misitiofacil/backend/issues)
- **Docs**: [Wiki del Proyecto](https://github.com/misitiofacil/backend/wiki)

### **Enlaces Útiles**
- [🌐 Frontend Repository](https://github.com/misitiofacil/frontend)
- [📱 Mobile App](https://github.com/misitiofacil/mobile)
- [📋 Backlog](https://github.com/misitiofacil/backend/projects)
- [🚀 Roadmap](https://github.com/misitiofacil/backend/milestones)

---

## 🎉 ¡Todo Listo!

**Tu backend de MiSitioFácil está completo y listo para usar.** 

### **✅ Lo que está implementado:**
- ✅ Service Controller completo
- ✅ Service Model completo  
- ✅ App.js principal
- ✅ Security middleware
- ✅ Package.json con todas las dependencias
- ✅ Variables de entorno template
- ✅ Documentación completa

### **🚀 Próximos pasos:**
1. **Configurar .env** con tus credenciales
2. **Instalar dependencias**: `npm install`
3. **Iniciar servidor**: `npm run dev`
4. **Verificar funcionamiento**: `http://localhost:3000/health`
5. **Explorar API**: `http://localhost:3000/api-docs`

### **🎯 Funcionalidades listas para usar:**
- 🔐 **Autenticación JWT completa**
- 🏪 **CRUD de negocios** 
- 💼 **CRUD de servicios** (nuevo)
- 🎨 **Sistema de plantillas**
- 📁 **Upload de imágenes**
- 🔒 **Seguridad robusta**
- 📊 **Monitoreo y logs**
- 📚 **Documentación automática**

**¡Tu MVP está completo y escalable! 🚀**

---

*Desarrollado con ❤️ para empoderar pequeños negocios en Costa Rica y Centroamérica.*