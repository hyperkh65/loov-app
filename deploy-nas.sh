#!/bin/bash
# NAS 배포 스크립트
NAS_HOST="hy64.synology.me"
NAS_USER="urjent"
NAS_DIR="/volume1/web/loov-app"

echo "=== LOOV NAS 배포 시작 ==="

# 1. 환경변수 파일 NAS로 전송
echo ">> 환경변수 전송..."
scp .env.vercel ${NAS_USER}@${NAS_HOST}:${NAS_DIR}/.env.production

# 2. NAS에서 git pull + docker build + 실행
ssh ${NAS_USER}@${NAS_HOST} << 'ENDSSH'
  cd /volume1/web/loov-app

  echo ">> git pull..."
  git pull origin main

  echo ">> Docker 이미지 빌드..."
  docker build -t loov-app:latest .

  echo ">> 기존 컨테이너 중지..."
  docker compose down

  echo ">> 새 컨테이너 시작..."
  docker compose up -d

  echo ">> 상태 확인..."
  docker ps | grep loov-app
ENDSSH

echo "=== 배포 완료 ==="
echo ">> http://hy64.synology.me:3100 에서 확인"
