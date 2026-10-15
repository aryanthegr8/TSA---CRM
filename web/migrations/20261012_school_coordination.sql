-- Requires the earlier 20261009_parent_workflow.sql migration.
-- Repeatable; adds coordination fields without deleting existing records.
DROP PROCEDURE IF EXISTS tsa_add_coordination_fields;
DELIMITER $$
CREATE PROCEDURE tsa_add_coordination_fields()
BEGIN
 IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='referrals' AND column_name='call_requested_at') THEN
  ALTER TABLE referrals ADD COLUMN call_requested_at DATETIME(3) NULL;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='referrals' AND column_name='preferred_call_time') THEN
  ALTER TABLE referrals ADD COLUMN preferred_call_time VARCHAR(160) NULL;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='referrals' AND column_name='school_contact_outcome') THEN
  ALTER TABLE referrals ADD COLUMN school_contact_outcome VARCHAR(40) NOT NULL DEFAULT 'pending';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='referrals' AND column_name='parent_decision') THEN
  ALTER TABLE referrals ADD COLUMN parent_decision VARCHAR(40) NOT NULL DEFAULT 'awaiting_discussion';
 END IF;
END$$
DELIMITER ;
CALL tsa_add_coordination_fields();
DROP PROCEDURE tsa_add_coordination_fields;
-- Historical school responses are not assumed to mean the parent was contacted.
