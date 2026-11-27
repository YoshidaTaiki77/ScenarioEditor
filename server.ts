import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '2mb' }));

async function startServer() {
  const httpServer = http.createServer(app);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const hmrDisabled = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ws: hmrDisabled ? false : { server: httpServer },
      },
      appType: 'spa',
      plugins: hmrDisabled
        ? [
            {
              name: 'disable-vite-client-ws',
              enforce: 'post',
              transform(code, id) {
                if (id.replace(/\\/g, '/').endsWith('/vite/dist/client/client.mjs')) {
                  return code
                    .replace(
                      'transport.connect(createHMRHandler(handleMessage));',
                      '/* HMR disabled: skip WebSocket connection */'
                    )
                    .replace(
                      'else throw new SendBeforeConnectError("send was called before connect");',
                      'else return; /* HMR disabled */'
                    )
                    .replace(
                      'else throw new SendBeforeConnectError("invoke was called before connect");',
                      'else return; /* HMR disabled */'
                    )
                    .replace(
                      'ws.send(JSON.stringify(data));',
                      'ws?.send(JSON.stringify(data));'
                    );
                }
              },
            },
          ]
        : [],
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Kotonoha Script server listening on http://localhost:${PORT}`);
  });
}

startServer();
