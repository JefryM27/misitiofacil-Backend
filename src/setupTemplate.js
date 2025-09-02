// setupTemplates.js - Script para crear templates por defecto
import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config();

// Conectar a MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 15000,
    });
    console.log('✅ Conectado a MongoDB');
    return true;
  } catch (error) {
    console.error('❌ Error conectando a MongoDB:', error.message);
    return false;
  }
};

// Definir schema básico para Template
const templateSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, default: '' },
  category: { type: String, required: true },
  businessType: { type: String },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isActive: { type: Boolean, default: true },
  isPublic: { type: Boolean, default: false },
  isPremium: { type: Boolean, default: false },
  isDefault: { type: Boolean, default: false },
  colors: {
    primary: { type: String, default: '#3B82F6' },
    secondary: { type: String, default: '#64748B' },
    accent: { type: String, default: '#10B981' },
    background: { type: String, default: '#FFFFFF' },
    text: { type: String, default: '#1F2937' }
  },
  typography: {
    primaryFont: { type: String, default: 'Inter, sans-serif' },
    headingFont: { type: String, default: 'Montserrat, sans-serif' }
  },
  sections: [{ 
    id: String, 
    name: String, 
    type: String, 
    isVisible: Boolean, 
    order: Number, 
    config: Object 
  }],
  tags: [String],
  usage: {
    timesUsed: { type: Number, default: 0 },
    rating: { type: Number, default: 0 },
    reviewCount: { type: Number, default: 0 }
  }
}, { timestamps: true });

const Template = mongoose.model('Template', templateSchema);

const createDefaultTemplates = async () => {
  const connected = await connectDB();
  if (!connected) {
    process.exit(1);
  }

  try {
    // Verificar si ya existen templates por defecto
    const existingTemplates = await Template.countDocuments({ isDefault: true });
    
    if (existingTemplates > 0) {
      console.log(`✅ Ya existen ${existingTemplates} templates por defecto`);
      process.exit(0);
    }

    // Templates por defecto
    const defaultTemplates = [
      {
        name: 'Template Universal',
        description: 'Template básico universal para cualquier tipo de negocio',
        category: 'modern',
        businessType: null,
        isDefault: true,
        isPublic: true,
        isActive: true,
        owner: null,
        colors: {
          primary: '#3B82F6',
          secondary: '#64748B',
          accent: '#10B981',
          background: '#FFFFFF',
          text: '#1F2937'
        },
        typography: {
          primaryFont: 'Inter, sans-serif',
          headingFont: 'Montserrat, sans-serif'
        },
        sections: [
          { id: 'header', name: 'Encabezado', type: 'header', isVisible: true, order: 1, config: {} },
          { id: 'hero', name: 'Sección Principal', type: 'hero', isVisible: true, order: 2, config: {} },
          { id: 'services', name: 'Servicios', type: 'services', isVisible: true, order: 3, config: {} },
          { id: 'contact', name: 'Contacto', type: 'contact', isVisible: true, order: 4, config: {} }
        ],
        tags: ['universal', 'modern', 'default', 'sistema'],
        usage: { timesUsed: 0, rating: 0, reviewCount: 0 }
      }
    ];

    const createdTemplates = await Template.insertMany(defaultTemplates);
    
    console.log(`✅ ${createdTemplates.length} templates por defecto creados exitosamente:`);
    createdTemplates.forEach(template => {
      console.log(`  - ${template.name} (ID: ${template._id})`);
    });

  } catch (error) {
    console.error('❌ Error creando templates por defecto:', error);
  } finally {
    await mongoose.disconnect();
    console.log('📤 Desconectado de MongoDB');
    process.exit(0);
  }
};

// Ejecutar el script
console.log('🚀 Iniciando creación de templates por defecto...');
createDefaultTemplates();