import handler from '../../api/gallery-add.js';
import { adapt } from '../lib/vercel-adapter.mjs';

export default adapt(handler);
export const config = { path: '/api/gallery-add' };
