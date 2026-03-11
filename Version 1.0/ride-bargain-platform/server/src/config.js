import dotenv from 'dotenv';

dotenv.config();

export const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
export const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
export const DB_PATH = process.env.DB_PATH || './data.sqlite';
export const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

// Flat platform fee (cash to platform, no online payments in this MVP)
export const PLATFORM_FEE = 0.5;
