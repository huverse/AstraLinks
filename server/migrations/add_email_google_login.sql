-- Migration: Add google_id column and email_codes table
-- Run this on your MySQL database

-- Add google_id column to users table
ALTER TABLE users ADD COLUMN google_id VARCHAR(100) NULL UNIQUE AFTER qq_openid;

-- Create email_codes table for verification codes
CREATE TABLE IF NOT EXISTS email_codes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  code VARCHAR(6) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_email (email),
  INDEX idx_expires (expires_at)
);

-- Add environment variables to your .env file:
-- RESEND_API_KEY=re_3YjLH1Mv_mU6Bu9uqxfyuFfGfEoJWBE2g
-- SENDER_EMAIL=codesafe@astralinks.xyz
-- GOOGLE_CLIENT_ID=1072683514568-9hfc68slh76pnjbgrmdoouag1o44vemj.apps.googleusercontent.com
-- GOOGLE_CLIENT_SECRET=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
-- GOOGLE_REDIRECT_URI=https://astralinks.xyz/api/auth/google/callback
