import { Sequelize } from 'sequelize';

// Configuración de PostgreSQL
const sequelize = new Sequelize(
  process.env.POSTGRES_DB,
  process.env.POSTGRES_USER,
  process.env.POSTGRES_PASSWORD,
  {
    host: process.env.POSTGRES_HOST,
    port: process.env.POSTGRES_PORT || 5432,
    dialect: 'postgres',
    
    // Pool de conexiones
    pool: {
      max: parseInt(process.env.POSTGRES_MAX_POOL_SIZE) || 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    },
    
    // Configuraciones adicionales
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    dialectOptions: {
      // Para conexiones SSL (si usas servicios como AWS RDS, Heroku, etc.)
      ssl: process.env.NODE_ENV === 'production' ? {
        require: true,
        rejectUnauthorized: false
      } : false
    },
    
    // Configuraciones de timezone
    timezone: process.env.TIMEZONE || '-06:00', // Ajusta según tu zona horaria
    
    // Configuraciones de performance
    define: {
      timestamps: true,
      underscored: true,
      freezeTableName: true
    }
  }
);

export const connectPostgreSQL = async () => {
  try {
    console.log('🔗 Intentando conectar a PostgreSQL...');
    
    // Probar conexión
    await sequelize.authenticate();
    console.log(`✅ PostgreSQL conectado: ${process.env.POSTGRES_HOST}:${process.env.POSTGRES_PORT || 5432}`);
    
    // Sincronizar modelos (solo en desarrollo)
    if (process.env.NODE_ENV === 'development' && process.env.POSTGRES_SYNC === 'true') {
      await sequelize.sync({ alter: true });
      console.log('🔄 Modelos PostgreSQL sincronizados');
    }
    
    return sequelize;
    
  } catch (err) {
    console.error('❌ Error conectando a PostgreSQL:', err.message);
    throw err;
  }
};

// Función para cerrar conexión
export const closePostgreSQL = async () => {
  try {
    await sequelize.close();
    console.log('🔒 Conexión PostgreSQL cerrada');
  } catch (err) {
    console.error('❌ Error cerrando conexión PostgreSQL:', err);
  }
};

// Función para probar la conexión
export const testPostgreSQLConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Test de conexión PostgreSQL exitoso');
    return true;
  } catch (error) {
    console.error('❌ Test de conexión PostgreSQL falló:', error.message);
    return false;
  }
};

// Graceful shutdown
process.on('SIGINT', async () => {
  await closePostgreSQL();
});

process.on('SIGTERM', async () => {
  await closePostgreSQL();
});

// Exportar instancia de Sequelize para usar en modelos
export { sequelize };
export default sequelize;