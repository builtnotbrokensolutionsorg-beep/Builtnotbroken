import handler from '../../api/contact.js';
import { adapt } from '../lib/vercel-adapter.mjs';

export default adapt(handler);
export const config = { path: '/api/contact' };
