-- Repeatable. Existing referral recipients remain unchanged.
DROP PROCEDURE IF EXISTS tsa_add_school_whatsapp_recipient;
DELIMITER $$
CREATE PROCEDURE tsa_add_school_whatsapp_recipient()
BEGIN
 IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='partner_schools' AND column_name='whatsapp_recipient') THEN
  ALTER TABLE partner_schools ADD COLUMN whatsapp_recipient VARCHAR(255) NULL;
 END IF;
END$$
DELIMITER ;
CALL tsa_add_school_whatsapp_recipient();
DROP PROCEDURE tsa_add_school_whatsapp_recipient;
