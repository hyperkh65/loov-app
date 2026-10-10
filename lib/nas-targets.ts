/**
 * wp-auto 자동설치가 지원하는 두 NAS(hy64=aboda.kr, hy65=2days.kr) 공통 설정.
 * setup/route.ts와 gsc-sync/route.ts가 같은 매핑을 써야 해서 분리.
 */
import { nasExec, nasExecWithStdin, nas2daysExec, nasExecWithStdinCustom } from '@/lib/nas-ssh';

export const NAS_TARGETS = {
  hy64: {
    exec: nasExec,
    execWithStdin: nasExecWithStdin,
    domainSuffix: 'aboda.kr',
    adminEmail: 'admin@aboda.kr',
    ddnsHost: 'hy64.synology.me',
    mysqlRootPass: process.env.NAS_MYSQL_ROOT_PASS || '',
  },
  hy65: {
    exec: nas2daysExec,
    execWithStdin: (cmd: string, data: Buffer | string) => nasExecWithStdinCustom(cmd, data, {
      host: process.env.NAS2_SSH_HOST || '2days.kr',
      port: parseInt(process.env.NAS2_SSH_PORT || '22'),
      username: process.env.NAS2_SSH_USER || 'urjent',
      password: process.env.NAS2_SSH_PASSWORD || 'Fpahs60577##7759',
    }),
    domainSuffix: '2days.kr',
    adminEmail: 'admin@2days.kr',
    ddnsHost: '2days.kr',
    mysqlRootPass: process.env.NAS2_MYSQL_ROOT_PASS || 'Fpahs60577##',
  },
} as const;

export type NasKey = keyof typeof NAS_TARGETS;
export const WEB_ROOT = '/volume1/web';
