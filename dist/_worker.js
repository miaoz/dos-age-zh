// Online-only features of the original game have no backend in this edition.
export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === '/scores' || pathname.startsWith('/scores/') || pathname === '/chat') {
      return Response.json({ error: '此汉化版未连接原站的排行榜、聊天和回放服务。' }, {
        status: 503,
        headers: { 'Cache-Control': 'no-store' }
      });
    }
    return env.ASSETS.fetch(request);
  }
};
