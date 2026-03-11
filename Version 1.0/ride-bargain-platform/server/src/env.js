import dotenv from 'dotenv';
dotenv.config();

export const env = {
  PORT: process.env.PORT ? Number(process.env.PORT) : 5050,
  JWT_SECRET: process.env.JWT_SECRET || 'CHANGE_ME_IN_PRODUCTION',
  DB_PATH: process.env.DB_PATH || './data.sqlite',
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:5173'
};
