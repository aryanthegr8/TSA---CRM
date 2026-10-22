-- Requires 20261019_school_whatsapp_recipient.sql.
-- Sets ALL current partner-school defaults, including archived schools.
-- Does not modify actual recipients previously saved in referrals.
START TRANSACTION;
UPDATE partner_schools
SET whatsapp_recipient = LEFT(CONCAT('TSA - ', TRIM(name)), 255)
WHERE id > 0;
COMMIT;
SELECT id, name, whatsapp_recipient FROM partner_schools ORDER BY name;
