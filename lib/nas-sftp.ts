/**
 * NAS 파일 작업 - SSH exec 방식 (n8n과 동일, Vercel에서 검증됨)
 * SFTP는 Synology 방화벽이 외부 chroot 제한하는 경우 있어서 SSH exec로 대체
 */
import { nasExec } from './nas-ssh';

export interface SFTPFile {
  name: string;
  isDir: boolean;
  size: number;
  modTime: number;
}

// ls -la --time-style=+%s 출력 파싱
function parseLsOutput(raw: string): SFTPFile[] {
  const lines = raw.split('\n').filter(Boolean);
  const files: SFTPFile[] = [];

  for (const line of lines) {
    if (line.startsWith('total') || line.includes(' . ') || line.includes(' .. ')) continue;
    // 형식: drwxrwxrwx+ 1 owner group size timestamp name
    const m = line.match(/^([d\-l])[rwxst+\-]{9}[\+@\.]?\s+\d+\s+\S+\s+\S+\s+(\d+)\s+(\d+)\s+(.+)$/);
    if (!m) continue;
    const name = m[4].trim();
    if (name.startsWith('@') || name === '.eaDir') continue;
    files.push({
      name,
      isDir: m[1] === 'd',
      size: parseInt(m[2]) || 0,
      modTime: parseInt(m[3]) || 0,
    });
  }

  return files.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name, 'ko');
  });
}

export async function listFiles(path: string): Promise<SFTPFile[]> {
  const result = await nasExec(`ls -la --time-style=+%s "${path}" 2>&1`);
  if (result.code !== 0) throw new Error(result.stdout || result.stderr || 'ls 실패');
  return parseLsOutput(result.stdout);
}

export async function createFolder(path: string): Promise<void> {
  const result = await nasExec(`mkdir -p "${path}"`);
  if (result.code !== 0) throw new Error(result.stderr || '폴더 생성 실패');
}

export async function deleteItem(path: string, isDir: boolean): Promise<void> {
  const cmd = isDir ? `rm -rf "${path}"` : `rm -f "${path}"`;
  const result = await nasExec(cmd);
  if (result.code !== 0) throw new Error(result.stderr || '삭제 실패');
}

export async function renameItem(oldPath: string, newPath: string): Promise<void> {
  const result = await nasExec(`mv "${oldPath}" "${newPath}"`);
  if (result.code !== 0) throw new Error(result.stderr || '이름 변경 실패');
}

// 다운로드: base64로 인코딩해서 가져옴 (바이너리 안전)
export async function readFileAsBase64(path: string): Promise<string> {
  const result = await nasExec(`base64 "${path}"`);
  if (result.code !== 0) throw new Error(result.stderr || '파일 읽기 실패');
  return result.stdout;
}

// 업로드: base64 인코딩 후 SSH로 전송
export async function writeFileFromBase64(path: string, base64Data: string): Promise<void> {
  // 큰따옴표 안에 base64 데이터 넣기 (개행 제거)
  const data = base64Data.replace(/\s+/g, '');
  const result = await nasExec(`echo "${data}" | base64 -d > "${path}"`);
  if (result.code !== 0) throw new Error(result.stderr || '파일 쓰기 실패');
}

// base64 → Buffer 변환 헬퍼
export async function readFileAsBuffer(path: string): Promise<Buffer> {
  const b64 = await readFileAsBase64(path);
  return Buffer.from(b64.replace(/\s+/g, ''), 'base64');
}

// 파일 크기 (bytes) 조회
export async function getFileSize(path: string): Promise<number> {
  const r = await nasExec(`stat -c%s "${path}" 2>/dev/null || echo 0`);
  return parseInt(r.stdout.trim()) || 0;
}
