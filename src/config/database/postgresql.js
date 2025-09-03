// src/config/database/postgresql.js
// Carga perezosa y no-op cuando Postgres no está configurado.
// Evita crasheos en serverless si no hay PG.

let sequelize = null;

const isPgEnabled = Boolean(
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_HOST
);

export async function connectPostgreSQL() {
  if (!isPgEnabled) return null; // no configurado → no-op

  // Carga perezosa de deps
  const { Sequelize } = await import('sequelize');
  const pg = await import('pg');

  if (sequelize) return sequelize;

  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;

  if (url) {
    sequelize = new Sequelize(url, {
      dialect: 'postgres',
      dialectModule: pg,
      logging: false,
    });
  } else {
    sequelize = new Sequelize(
      process.env.POSTGRES_DB,
      process.env.POSTGRES_USER,
      process.env.POSTGRES_PASSWORD,
      {
        host: process.env.POSTGRES_HOST,
        port: Number(process.env.POSTGRES_PORT || 5432),
        dialect: 'postgres',
        dialectModule: pg,
        logging: false,
      }
    );
  }

  return sequelize;
}

export async function closePostgreSQL() {
  if (!sequelize) return;
  try {
    await sequelize.close();
  } finally {
    sequelize = null;
  }
}

/* Aliases opcionales por si en algún lugar usaste los otros nombres */
export { connectPostgreSQL as connectPostgres, closePostgreSQL as closePostgres };
