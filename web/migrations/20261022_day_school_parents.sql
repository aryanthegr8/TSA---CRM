-- Apply on the CRM database after the earlier enquiry_category migration.
-- Expands the category enum without changing existing lead categories.
ALTER TABLE leads MODIFY COLUMN enquiry_category
 ENUM('general','boarding_parent','school_owner','day_parent') NOT NULL DEFAULT 'general';

DROP PROCEDURE IF EXISTS tsa_add_day_parent_scope;
DELIMITER $$
CREATE PROCEDURE tsa_add_day_parent_scope()
BEGIN
 IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='partner_schools' AND column_name='day_parent_delhi_ncr') THEN
  ALTER TABLE partner_schools ADD COLUMN day_parent_delhi_ncr BOOLEAN NOT NULL DEFAULT FALSE;
 END IF;
END$$
DELIMITER ;
CALL tsa_add_day_parent_scope();
DROP PROCEDURE tsa_add_day_parent_scope;
-- No geographic guesses: manager/admin must verify eligible day/both schools in the UI.
