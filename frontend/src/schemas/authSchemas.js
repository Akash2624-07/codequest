import { z } from 'zod';

export const signupSchema = z.object({
  firstName: z.string().min(3, 'Name must be at least 3 characters'),
  emailId: z.string().email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const loginSchema = z.object({
  emailId: z.string().email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});
