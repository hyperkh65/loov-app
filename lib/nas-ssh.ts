/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
const { Client } = require('ssh2');

export interface SSHResult {
  stdout: string;
  stderr: string;
  code: number;
}

export function nasExec(command: string): Promise<SSHResult> {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let stdout = '';
    let stderr = '';

    conn.on('ready', () => {
      conn.exec(command, (err: any, stream: any) => {
        if (err) { conn.end(); return reject(err); }

        stream.on('data', (d: Buffer) => { stdout += d.toString(); });
        stream.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

        stream.on('close', (code: number) => {
          conn.end();
          resolve({ stdout: stdout.trim(), stderr: stderr.trim(), code });
        });
      });
    });

    conn.on('error', reject);

    conn.connect({
      host: process.env.NAS_SSH_HOST || 'hy64.synology.me',
      port: parseInt(process.env.NAS_SSH_PORT || '22'),
      username: process.env.NAS_SSH_USER || 'urjent',
      password: process.env.NAS_SSH_PASSWORD || 'Aa050677##7759',
      tryKeyboard: true, // Synology NAS keyboard-interactive 인증 지원
      readyTimeout: 10000,
    });
  });
}

/**
 * stdin으로 데이터를 pipe하며 명령 실행
 * 대용량 파일 저장 시 사용 (shell 인수 길이 제한 우회)
 */
export function nasExecWithStdin(command: string, stdinData: Buffer | string): Promise<SSHResult> {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let stdout = '';
    let stderr = '';

    conn.on('ready', () => {
      conn.exec(command, (err: any, stream: any) => {
        if (err) { conn.end(); return reject(err); }

        stream.on('data', (d: Buffer) => { stdout += d.toString(); });
        stream.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

        stream.on('close', (code: number) => {
          conn.end();
          resolve({ stdout: stdout.trim(), stderr: stderr.trim(), code });
        });

        // stdin에 데이터 write 후 종료
        stream.write(stdinData);
        stream.end();
      });
    });

    conn.on('error', reject);

    conn.connect({
      host: process.env.NAS_SSH_HOST || 'hy64.synology.me',
      port: parseInt(process.env.NAS_SSH_PORT || '22'),
      username: process.env.NAS_SSH_USER || 'urjent',
      password: process.env.NAS_SSH_PASSWORD || 'Aa050677##7759',
      tryKeyboard: true,
      readyTimeout: 15000,
    });
  });
}

/** docker exec n8n-DB psql -U n8n -c '...' 쿼리 실행 (싱글쿼트 사용) */
export async function n8nQuery(sql: string): Promise<SSHResult> {
  // psql -c 인수를 싱글쿼트로 감싸되, SQL 내 싱글쿼트는 '' 이스케이프
  const escaped = sql.replace(/'/g, "''");
  return nasExec(`/usr/local/bin/docker exec n8n-DB psql -U n8n -t -A -F '|' -c '${escaped}'`);
}

/** n8n CLI 명령 실행 */
export async function n8nCli(args: string): Promise<SSHResult> {
  return nasExec(`/usr/local/bin/docker exec n8n-1-redeploy n8n ${args}`);
}

/** 커스텀 SSH 옵션으로 NAS 명령 실행 (일반 유저용) */
export function nasExecCustom(command: string, options: {
  host: string; port?: number; username: string; password: string;
}): Promise<SSHResult> {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let stdout = '';
    let stderr = '';

    conn.on('ready', () => {
      conn.exec(command, (err: any, stream: any) => {
        if (err) { conn.end(); return reject(err); }
        stream.on('data', (d: Buffer) => { stdout += d.toString(); });
        stream.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
        stream.on('close', (code: number) => {
          conn.end();
          resolve({ stdout: stdout.trim(), stderr: stderr.trim(), code });
        });
      });
    });

    conn.on('error', reject);
    conn.connect({
      host: options.host,
      port: options.port ?? 22,
      username: options.username,
      password: options.password,
      tryKeyboard: true,
      readyTimeout: 10000,
    });
  });
}

/** 커스텀 SSH 옵션으로 stdin pipe 명령 실행 (일반 유저용) */
export function nasExecWithStdinCustom(command: string, stdinData: Buffer | string, options: {
  host: string; port?: number; username: string; password: string;
}): Promise<SSHResult> {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let stdout = '';
    let stderr = '';

    conn.on('ready', () => {
      conn.exec(command, (err: any, stream: any) => {
        if (err) { conn.end(); return reject(err); }
        stream.on('data', (d: Buffer) => { stdout += d.toString(); });
        stream.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
        stream.on('close', (code: number) => {
          conn.end();
          resolve({ stdout: stdout.trim(), stderr: stderr.trim(), code });
        });
        stream.write(stdinData);
        stream.end();
      });
    });

    conn.on('error', reject);
    conn.connect({
      host: options.host,
      port: options.port ?? 22,
      username: options.username,
      password: options.password,
      tryKeyboard: true,
      readyTimeout: 15000,
    });
  });
}

/** 2days.kr NAS SSH 명령 실행 */
export function nas2daysExec(command: string): Promise<SSHResult> {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let stdout = '';
    let stderr = '';

    conn.on('ready', () => {
      conn.exec(command, (err: any, stream: any) => {
        if (err) { conn.end(); return reject(err); }
        stream.on('data', (d: Buffer) => { stdout += d.toString(); });
        stream.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
        stream.on('close', (code: number) => {
          conn.end();
          resolve({ stdout: stdout.trim(), stderr: stderr.trim(), code });
        });
      });
    });

    conn.on('error', reject);
    conn.connect({
      host: process.env.NAS2_SSH_HOST || '2days.kr',
      port: parseInt(process.env.NAS2_SSH_PORT || '22'),
      username: process.env.NAS2_SSH_USER || 'urjent',
      password: process.env.NAS2_SSH_PASSWORD || 'Fpahs60577##7759',
      tryKeyboard: true,
      readyTimeout: 15000,
    });
  });
}
