import handler from '../../api/quote.js';
import { adapt } from '../lib/vercel-adapter.mjs';

export default adapt(handler);
export const config = { path: '/api/quote' };
