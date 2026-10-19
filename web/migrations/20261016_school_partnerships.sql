-- School acquisition records stay separate from parent admissions.
CREATE TABLE IF NOT EXISTS school_partnerships (
 lead_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
 school_name VARCHAR(255) NULL,
 school_type ENUM('day','boarding','both') NOT NULL DEFAULT 'boarding',
 city VARCHAR(120) NULL, state VARCHAR(120) NULL, website VARCHAR(1024) NULL,
 contact_name VARCHAR(160) NULL, designation VARCHAR(120) NULL, contact_phone VARCHAR(20) NULL, contact_email VARCHAR(255) NULL,
 stage ENUM('new','discussion','commission','mou','verification','confirmed','closed') NOT NULL DEFAULT 'new',
 last_outcome VARCHAR(160) NULL, close_reason VARCHAR(255) NULL,
 proposed_type ENUM('fixed','percentage') NULL, proposed_rate DECIMAL(12,2) NULL, proposed_basis VARCHAR(255) NULL,
 agreed_type ENUM('fixed','percentage') NULL, agreed_rate DECIMAL(12,2) NULL, agreed_basis VARCHAR(255) NULL,
 terms_note TEXT NULL, effective_date DATE NULL,
 active_mou_id BIGINT UNSIGNED NULL, signed_date DATE NULL,
 partner_school_id BIGINT UNSIGNED NULL, verified_by BIGINT UNSIGNED NULL, verified_at DATETIME(3) NULL,
 revision INT UNSIGNED NOT NULL DEFAULT 0,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 FOREIGN KEY (lead_id) REFERENCES leads(id),
 FOREIGN KEY (partner_school_id) REFERENCES partner_schools(id),
 FOREIGN KEY (verified_by) REFERENCES crm_users(id),
 UNIQUE KEY uq_partnership_school(partner_school_id),
 KEY idx_partnership_stage(stage)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS school_mou_documents (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 lead_id BIGINT UNSIGNED NOT NULL, storage_key VARCHAR(80) NOT NULL,
 original_name VARCHAR(255) NOT NULL, byte_size INT UNSIGNED NOT NULL,
 uploaded_by BIGINT UNSIGNED NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY uq_mou_storage(storage_key),
 FOREIGN KEY (lead_id) REFERENCES leads(id), FOREIGN KEY (uploaded_by) REFERENCES crm_users(id),
 KEY idx_mou_lead(lead_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- Existing intake data stays untouched; unknown school details require confirmation.
INSERT IGNORE INTO school_partnerships (lead_id, contact_name, contact_phone, contact_email, stage)
SELECT l.id, f.parent_name, f.primary_phone, f.email,
 CASE WHEN l.status='lost' THEN 'closed' WHEN l.status IN ('connected','qualified','exploring_options','application_in_progress','on_hold') THEN 'discussion' ELSE 'new' END
FROM leads l JOIN families f ON f.id=l.family_id WHERE l.enquiry_category='school_owner';
