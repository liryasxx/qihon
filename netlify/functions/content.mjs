import { handleContent } from '../../server/content.mjs';
export default async (request) => handleContent(new URL(request.url), request.method);
export const config = { path: '/api/content' };
