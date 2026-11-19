import { handleContent } from '../server/content.mjs';
import { sendNodeResponse } from '../server/node.mjs';
export default async function handler(req, res) {
  await sendNodeResponse(await handleContent(new URL(req.url, 'https://qihon.local'), req.method), res);
}
