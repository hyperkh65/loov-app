-- 이메일 계정 테이블
CREATE TABLE IF NOT EXISTS bossai_email_accounts (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name          text NOT NULL,
  email         text NOT NULL,
  -- IMAP
  imap_host     text NOT NULL,
  imap_port     int  NOT NULL DEFAULT 993,
  imap_secure   boolean NOT NULL DEFAULT true,
  imap_user     text NOT NULL,
  imap_password text NOT NULL,
  -- SMTP
  smtp_host     text NOT NULL,
  smtp_port     int  NOT NULL DEFAULT 587,
  smtp_secure   boolean NOT NULL DEFAULT false,
  smtp_user     text NOT NULL,
  smtp_password text NOT NULL,
  -- 상태
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE bossai_email_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users own their email accounts"
  ON bossai_email_accounts
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
