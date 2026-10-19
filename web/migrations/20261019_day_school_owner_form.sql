-- Optional backfill: reclassifies leads from this form already present in the CRM.
-- Does not retrieve historical leads from Meta. Requires school_partnerships table.
START TRANSACTION;
UPDATE leads SET enquiry_category='school_owner',school_type='day',
 source_detail='SCHOOL ADMISSION CITY UPDATE-copy'
WHERE source='meta_form' AND JSON_UNQUOTE(JSON_EXTRACT(campaign_data,'$.formId'))='998020903326884';
INSERT IGNORE INTO school_partnerships
 (lead_id,school_type,contact_name,contact_phone,contact_email,stage)
SELECT l.id,'day',f.parent_name,f.primary_phone,f.email,
 CASE WHEN l.status='lost' THEN 'closed' ELSE 'new' END
FROM leads l JOIN families f ON f.id=l.family_id
WHERE l.source='meta_form' AND JSON_UNQUOTE(JSON_EXTRACT(l.campaign_data,'$.formId'))='998020903326884';
-- Preserve school types explicitly edited or verified by staff.
UPDATE school_partnerships sp JOIN leads l ON l.id=sp.lead_id
SET sp.school_type='day'
WHERE l.source='meta_form' AND JSON_UNQUOTE(JSON_EXTRACT(l.campaign_data,'$.formId'))='998020903326884'
 AND sp.revision=0 AND sp.verified_at IS NULL;
COMMIT;
