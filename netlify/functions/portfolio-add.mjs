// portfolio-add already uses the standard Request -> Response format,
// so it runs on Netlify as-is.
import handler from '../../api/portfolio-add.js';

export default handler;
export const config = { path: '/api/portfolio-add' };
