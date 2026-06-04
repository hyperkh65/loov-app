/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest } from 'next/server';

const DL_PATH = '/volume1/homes/urjent/missav_downloads';

const SSH_CONFIG = {
  host: process.env.NAS_SSH_HOST || 'hy64.synology.me',
  port: parseInt(process.env.NAS_SSH_PORT || '22'),
  username: process.env.NAS_SSH_USER || 'urjent',
  password: process.env.NAS_SSH_PASSWORD || 'Aa050677##7759',
  tryKeyboard: true as const,
  readyTimeout: 15000,
};

export async function GET(req: NextRequest) {
  const filename = req.nextUrl.searchParams.get('file');
  if (!filename || filename.includes('..') || filename.includes('/')) {
    return new Response('Invalid filename', { status: 400 });
  }

  const remotePath = `${DL_PATH}/${filename}`;
  const rangeHeader = req.headers.get('range');

  const ext = filename.split('.').pop()?.toLowerCase() || 'mp4';
  const mimeMap: Record<string, string> = {
    mp4: 'video/mp4', mkv: 'video/x-matroska', webm: 'video/webm',
    avi: 'video/x-msvideo', mov: 'video/quicktime', ts: 'video/mp2t',
    m4v: 'video/mp4', flv: 'video/x-flv',
  };
  const contentType = mimeMap[ext] || 'video/mp4';

  const { Client } = require('ssh2');

  return new Promise<Response>((resolve) => {
    const conn = new Client();

    conn.on('ready', () => {
      conn.sftp((err: any, sftp: any) => {
        if (err) { conn.end(); return resolve(new Response('SFTP error', { status: 500 })); }

        sftp.stat(remotePath, (statErr: any, stats: any) => {
          if (statErr) { conn.end(); return resolve(new Response('File not found', { status: 404 })); }

          const fileSize: number = stats.size;
          let start = 0;
          let end = fileSize - 1;
          let status = 200;

          if (rangeHeader) {
            const [, range] = rangeHeader.split('=');
            const [s, e] = range.split('-');
            start = parseInt(s, 10);
            end = e ? parseInt(e, 10) : Math.min(start + 5 * 1024 * 1024, fileSize - 1);
            status = 206;
          }

          const chunkSize = end - start + 1;
          const sftpStream = sftp.createReadStream(remotePath, { start, end });

          const readable = new ReadableStream({
            start(controller) {
              sftpStream.on('data', (chunk: Buffer) => controller.enqueue(chunk));
              sftpStream.on('end', () => { controller.close(); conn.end(); });
              sftpStream.on('error', (e: Error) => { controller.error(e); conn.end(); });
            },
            cancel() { sftpStream.destroy(); conn.end(); },
          });

          resolve(new Response(readable, {
            status,
            headers: {
              'Content-Type': contentType,
              'Content-Length': String(chunkSize),
              'Content-Range': `bytes ${start}-${end}/${fileSize}`,
              'Accept-Ranges': 'bytes',
              'Cache-Control': 'no-cache',
            },
          }));
        });
      });
    });

    conn.on('error', (e: Error) => resolve(new Response(String(e), { status: 500 })));
    conn.connect(SSH_CONFIG);
  });
}
