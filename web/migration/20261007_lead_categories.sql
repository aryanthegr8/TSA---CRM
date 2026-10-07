-- Run once on the CRM database BEFORE deploying the updated application.
ALTER TABLE leads
  ADD COLUMN enquiry_category ENUM('general', 'boarding_parent', 'school_owner')
    NOT NULL DEFAULT 'general' AFTER source_detail,
  ADD INDEX idx_leads_category_received (enquiry_category, received_at);

-- Classify existing Meta leads using IDs already stored by the intake route.
-- Do not infer a category from a person's name or phone number.
UPDATE leads
SET enquiry_category = CASE
    WHEN JSON_UNQUOTE(JSON_EXTRACT(campaign_data, '$.formId')) = '1512768827576448'
      OR source_detail = 'Form 1512768827576448' THEN 'boarding_parent'
    WHEN JSON_UNQUOTE(JSON_EXTRACT(campaign_data, '$.formId')) = '1413460333859333'
      OR source_detail = 'Form 1413460333859333' THEN 'school_owner'
    ELSE enquiry_category
  END
WHERE source = 'meta_form' AND enquiry_category = 'general'
  AND (JSON_UNQUOTE(JSON_EXTRACT(campaign_data, '$.formId')) IN ('1512768827576448', '1413460333859333')
    OR source_detail IN ('Form 1512768827576448', 'Form 1413460333859333'));

SELECT enquiry_category, COUNT(*) AS lead_count
FROM leads GROUP BY enquiry_category;
