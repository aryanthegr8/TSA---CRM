-- TSA-CRM Phase 1: Department separation
-- Apply only to databases where crm_users.department does not exist.
-- Production database was migrated manually on 26 October 2026.
-- Do not rerun on production.

ALTER TABLE crm_users
  ADD COLUMN department ENUM(
    'school_partnerships',
    'parent_admissions'
  ) NULL DEFAULT NULL AFTER role;

-- Assign departments to the existing counsellors.
-- These IDs are specific to the current TSA-CRM installation.

UPDATE crm_users
SET department = 'school_partnerships'
WHERE id = 3
  AND role = 'counsellor';

UPDATE crm_users
SET department = 'parent_admissions'
WHERE id = 5
  AND role = 'counsellor';

-- Verify the results.
SELECT id, name, role, department, is_active
FROM crm_users
ORDER BY id;