import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  displayName: z.string().min(2).max(40)
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export const offerCreateSchema = z.object({
  fromText: z.string().min(2).max(120),
  toText: z.string().min(2).max(120),
  availableTime: z.string().min(3).max(40),
  seats: z.number().int().min(1).max(8).default(1),
  startingPriceCents: z.number().int().min(0).max(1000000),
  minutesAway: z.number().int().min(1).max(240)
});

export const requestCreateSchema = z.object({
  fromText: z.string().min(2).max(120),
  toText: z.string().min(2).max(120),
  desiredTime: z.string().min(3).max(40),
  maxPriceCents: z.number().int().min(0).max(1000000),
  notes: z.string().max(500).optional().nullable()
});

export const negotiationCreateSchema = z.object({
  offerId: z.number().int().positive(),
  requestId: z.number().int().positive(),
  initialPriceCents: z.number().int().min(0).max(1000000)
});

export const proposePriceSchema = z.object({
  priceCents: z.number().int().min(0).max(1000000)
});

export const messageCreateSchema = z.object({
  body: z.string().min(1).max(500)
});
