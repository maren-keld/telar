// Vercel Web Analytics
// Initialize analytics using dynamic import for ES modules
import { inject } from '@vercel/analytics';

inject({ mode: 'production' });
