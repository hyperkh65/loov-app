/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
const { Client } = require('ssh2');

export interface SFTPFile {
  name: string;
  isDir: boolean;
  size: number;
  modTime: number; // unix timestamp
}

function getSFTP(): Promise<any> {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn.on('ready', () => {
      conn.sftp((err: any, sftp: any) => {
        if (err) { conn.end(); return reject(err); }
        // attach cleanup
        sftp._conn = conn;
        sftp.close = () => conn.end();
        resolve(sftp);
      });
    });
    conn.on('error', reject);
    conn.connect({
      host: process.env.NAS_SSH_HOST || 'hy64.synology.me',
      port: parseInt(process.env.NAS_SSH_PORT || '22'),
      username: process.env.NAS_SSH_USER || 'urjent',
      password: process.env.NAS_SSH_PASSWORD || 'Aa050677##7759',
      readyTimeout: 10000,
    });
  });
}

// volume1 루트가 SFTP의 '.'이므로, /volume1/xxx → xxx 로 매핑
function toSFTPPath(path: string): string {
  // path는 항상 /로 시작하는 절대경로 형태로 받음
  // /volume1 prefix 제거, leading slash 제거
  const normalized = path.replace(/^\/volume1/, '').replace(/^\//, '') || '.';
  return normalized;
}

export async function listFiles(path: string): Promise<SFTPFile[]> {
  const sftp = await getSFTP();
  try {
    return await new Promise((resolve, reject) => {
      sftp.readdir(toSFTPPath(path), (err: any, list: any[]) => {
        if (err) return reject(err);
        const files: SFTPFile[] = list
          .filter(f => !f.filename.startsWith('@') && f.filename !== '.eaDir')
          .map(f => ({
            name: f.filename,
            isDir: f.longname.startsWith('d'),
            size: f.attrs.size || 0,
            modTime: f.attrs.mtime || 0,
          }))
          .sort((a, b) => {
            if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
            return a.name.localeCompare(b.name, 'ko');
          });
        resolve(files);
      });
    });
  } finally {
    sftp.close();
  }
}

export async function createFolder(path: string): Promise<void> {
  const sftp = await getSFTP();
  try {
    await new Promise<void>((resolve, reject) => {
      sftp.mkdir(toSFTPPath(path), (err: any) => err ? reject(err) : resolve());
    });
  } finally {
    sftp.close();
  }
}

export async function deleteItem(path: string, isDir: boolean): Promise<void> {
  const sftp = await getSFTP();
  try {
    await new Promise<void>((resolve, reject) => {
      if (isDir) {
        sftp.rmdir(toSFTPPath(path), (err: any) => err ? reject(err) : resolve());
      } else {
        sftp.unlink(toSFTPPath(path), (err: any) => err ? reject(err) : resolve());
      }
    });
  } finally {
    sftp.close();
  }
}

export async function renameItem(oldPath: string, newPath: string): Promise<void> {
  const sftp = await getSFTP();
  try {
    await new Promise<void>((resolve, reject) => {
      sftp.rename(toSFTPPath(oldPath), toSFTPPath(newPath), (err: any) => err ? reject(err) : resolve());
    });
  } finally {
    sftp.close();
  }
}

export async function readFileStream(path: string): Promise<NodeJS.ReadableStream> {
  const sftp = await getSFTP();
  const stream = sftp.createReadStream(toSFTPPath(path));
  stream.on('close', () => sftp.close());
  stream.on('error', () => sftp.close());
  return stream;
}

export async function writeFileStream(path: string, data: Buffer): Promise<void> {
  const sftp = await getSFTP();
  try {
    await new Promise<void>((resolve, reject) => {
      const ws = sftp.createWriteStream(toSFTPPath(path));
      ws.on('close', resolve);
      ws.on('error', reject);
      ws.end(data);
    });
  } finally {
    sftp.close();
  }
}
