-- Select the CRM database and back it up before running this file.
-- Requires the 20261007 enquiry_category migration to have been applied.
-- Existing enum values and referral records are preserved. Safe to run again.
DELIMITER $$
DROP PROCEDURE IF EXISTS tsa_referral_progress_20261008$$
CREATE PROCEDURE tsa_referral_progress_20261008()
BEGIN
  DECLARE status_type TEXT;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'leads' AND column_name = 'enquiry_category') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Apply the 20261007 lead category migration first';
  END IF;
  SELECT column_type INTO status_type FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'referrals' AND column_name = 'status';
  IF status_type IS NULL OR LEFT(status_type, 5) <> 'enum(' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Expected referrals.status to be ENUM; inspect schema before proceeding';
  END IF;
  IF LOCATE('''visit_scheduled''', status_type) = 0 THEN
    SET status_type = CONCAT(LEFT(status_type, CHAR_LENGTH(status_type) - 1), ',''visit_scheduled'')');
  END IF;
  IF LOCATE('''school_visited''', status_type) = 0 THEN
    SET status_type = CONCAT(LEFT(status_type, CHAR_LENGTH(status_type) - 1), ',''school_visited'')');
  END IF;
  SET @tsa_referral_ddl = CONCAT('ALTER TABLE referrals MODIFY COLUMN status ', status_type, ' NOT NULL DEFAULT ''shortlisted''');
  PREPARE tsa_stmt FROM @tsa_referral_ddl;
  EXECUTE tsa_stmt;
  DEALLOCATE PREPARE tsa_stmt;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'referrals' AND column_name = 'sent_by_user_id') THEN
    ALTER TABLE referrals ADD COLUMN sent_by_user_id BIGINT UNSIGNED NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'referrals' AND column_name = 'transfer_channel') THEN
    ALTER TABLE referrals ADD COLUMN transfer_channel VARCHAR(40) NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'referrals' AND column_name = 'transfer_recipient') THEN
    ALTER TABLE referrals ADD COLUMN transfer_recipient VARCHAR(255) NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'referrals' AND column_name = 'visit_scheduled_at') THEN
    ALTER TABLE referrals ADD COLUMN visit_scheduled_at DATETIME(3) NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'referrals' AND column_name = 'visited_at') THEN
    ALTER TABLE referrals ADD COLUMN visited_at DATETIME(3) NULL;
  END IF;
END$$
CALL tsa_referral_progress_20261008()$$
DROP PROCEDURE tsa_referral_progress_20261008$$
DELIMITER ;

-- Inspect the newly available fields; historical transfer details stay unknown.
SELECT id, lead_id, status, sent_at, sent_by_user_id, transfer_channel,
       transfer_recipient, visit_scheduled_at, visited_at
FROM referrals ORDER BY id DESC LIMIT 10;
